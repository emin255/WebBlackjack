const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rootDir = path.join(__dirname, '..');
console.log('Static klasör:', rootDir); // Debug için
app.use(express.static(rootDir));

// Ana sayfa için explicit route
app.get('/', (req, res) => {
    res.sendFile(path.join(rootDir, 'index.html'));
});


// Her bağlanan oyuncu bir socket — C'deki oyuncular[5] gibi
const odalar = new Map(); // oda_id → oda objesi

function odaKoduUret() {
    const karakterler = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let kod = '';
    for (let i = 0; i < 6; i++) {
        kod += karakterler[Math.floor(Math.random() * karakterler.length)];
    }
    return kod;
}

function yeniOda(odaId) {
    return {
        id: odaId,
        oyuncular: [],      // Bağlanan socketler
        oyunDurumu: null,   // Oyun state'i
        basladimi: false
    };
}

function yeniOyunDurumu() {
    return {
        mevcutDurum: 'oyuncu_ekle',
        siradakiOyuncu: 0,
        hesaplandiMi: false,
        oyuncular: [],
        krupiyer: { el: [], value: 0 },
        deste: [],
        desteIndex: 0
    };
}

// ============================================================
// DESTE FONKSİYONLARI (game.js'den taşındı)
// ============================================================

function desteOlusturVeKaristir() {
    const simgeler = ['kupa', 'karo', 'sinek', 'maça'];
    const degerler = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    let deste = [];

    for (let d = 0; d < 6; d++) {
        for (let s of simgeler) {
            for (let v of degerler) {
                deste.push({ deger: v, simge: s, kapali: false });
            }
        }
    }

    // Fisher-Yates
    for (let i = deste.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deste[i], deste[j]] = [deste[j], deste[i]];
    }
    return deste;
}

function kartCek(oyunDurumu) {
    if (oyunDurumu.desteIndex > oyunDurumu.deste.length - 20) {
        oyunDurumu.deste = desteOlusturVeKaristir();
        oyunDurumu.desteIndex = 0;
        oyunDurumu.desteKaristirildi = true; // Bayrak ekle
    }
    return { ...oyunDurumu.deste[oyunDurumu.desteIndex++] };
}


// ============================================================
// PUANLAMA (game.js'den taşındı)
// ============================================================

function elDegeriHesapla(el) {
    let toplam = 0;
    let asCount = 0;

    for (let kart of el) {
        if (kart.kapali) continue;
        if (kart.deger === 'A') { asCount++; toplam += 11; }
        else if (['J','Q','K'].includes(kart.deger)) toplam += 10;
        else if (kart.deger === '10') toplam += 10;
        else toplam += parseInt(kart.deger);
    }

    while (toplam > 21 && asCount > 0) { toplam -= 10; asCount--; }
    return toplam;
}

function kazananHesapla(oyuncu, kasaPuan, kasaEl) {
    function blackjackMi(el) {
        if (el.length !== 2) return false;
        const degerler = el.map(k => k.deger);
        return degerler.includes('A') && 
               degerler.some(d => ['10','J','Q','K'].includes(d));
    }

    function elSonucu(elPuan, el, bahis) {
        const oyuncuBlackjack = blackjackMi(el);
        const kasaBlackjack = blackjackMi(kasaEl);

        if (oyuncuBlackjack && kasaBlackjack) 
            return { sonuc: 'BERABERE', kazanc: bahis };
        if (oyuncuBlackjack) 
            return { sonuc: 'BLACKJACK! 🎉', kazanc: Math.floor(bahis * 2.5) };
        if (elPuan > 21)        
            return { sonuc: 'BATTINIZ', kazanc: 0 };
        if (kasaBlackjack)      
            return { sonuc: 'KAYBETTİNİZ', kazanc: 0 };
        if (kasaPuan > 21)      
            return { sonuc: 'KAZANDINIZ!', kazanc: bahis * 2 };
        if (elPuan > kasaPuan)  
            return { sonuc: 'KAZANDINIZ!', kazanc: bahis * 2 };
        if (elPuan === kasaPuan)
            return { sonuc: 'BERABERE', kazanc: bahis };
        return { sonuc: 'KAYBETTİNİZ', kazanc: 0 };
    }

    const ana = elSonucu(oyuncu.value, oyuncu.el, oyuncu.bahis);
    oyuncu.sonuc = ana.sonuc;
    oyuncu.bakiye += ana.kazanc;

    if (oyuncu.isSplitted) {
        const split = elSonucu(oyuncu.splitValue, oyuncu.splitEl, oyuncu.bahis);
        oyuncu.splitsonuc = split.sonuc;
        oyuncu.bakiye += split.kazanc;
    }
}

// ============================================================
// OYUN FONKSİYONLARI
// ============================================================

function kartDagit(oyunDurumu) {
    oyunDurumu.krupiyer.el = [];

    for (let oyuncu of oyunDurumu.oyuncular) {
        if (!oyuncu.isActive) continue;
        oyuncu.el = [kartCek(oyunDurumu), kartCek(oyunDurumu)];
        oyuncu.splitEl = [];
        oyuncu.isSplitted = false;
        oyuncu.sirasplittemi = 0;
        oyuncu.value = elDegeriHesapla(oyuncu.el);
        oyuncu.sonuc = '';
        oyuncu.splitsonuc = '';
    }

    oyunDurumu.krupiyer.el = [kartCek(oyunDurumu), kartCek(oyunDurumu)];
    oyunDurumu.krupiyer.el[1].kapali = true;
    oyunDurumu.krupiyer.value = elDegeriHesapla(oyunDurumu.krupiyer.el);

    // İlk aktif oyuncuyu bul
    oyunDurumu.siradakiOyuncu = 0;
    while (oyunDurumu.siradakiOyuncu < 5 &&
           !oyunDurumu.oyuncular[oyunDurumu.siradakiOyuncu]?.isActive) {
        oyunDurumu.siradakiOyuncu++;
    }

    oyunDurumu.mevcutDurum = 'oyuncu_turu';
}

function sonrakiOyuncuyaGec(oyunDurumu, oda) {
    do { oyunDurumu.siradakiOyuncu++; }
    while (oyunDurumu.siradakiOyuncu < 5 &&
           !oyunDurumu.oyuncular[oyunDurumu.siradakiOyuncu]?.isActive);

    if (oyunDurumu.siradakiOyuncu >= 5) {
        kasaTuruyuBaslat(oyunDurumu, oda);
    }
}

function kasaTuruyuBaslat(oyunDurumu, oda) {
    oyunDurumu.mevcutDurum = 'kasa_turu';
    oyunDurumu.krupiyer.el.forEach(k => k.kapali = false);
    oyunDurumu.krupiyer.value = elDegeriHesapla(oyunDurumu.krupiyer.el);
    if (oyunDurumu.desteKaristirildi) {
        odayaYayinla(oda, { tip: 'deste_karistirildi' });
        oyunDurumu.desteKaristirildi = false;
    }
    odayaYayinla(oda, { tip: 'oyun_durumu', durum: oyunDurumu });

    // Kasa 17'nin altındaysa kart çekmeye devam et
    function kasaKartCek() {
        oyunDurumu.krupiyer.value = elDegeriHesapla(oyunDurumu.krupiyer.el);

        if (oyunDurumu.krupiyer.value < 17) {
            setTimeout(() => {
                oyunDurumu.krupiyer.el.push(kartCek(oyunDurumu));
                oyunDurumu.krupiyer.value = elDegeriHesapla(oyunDurumu.krupiyer.el);
                odayaYayinla(oda, { tip: 'oyun_durumu', durum: oyunDurumu });
                kasaKartCek();
            }, 1000);
        } else {
            // Sonuçları hesapla
            oyunDurumu.mevcutDurum = 'sonuc';
            for (let oyuncu of oyunDurumu.oyuncular) {
                if (oyuncu.isActive) {
                    kazananHesapla(oyuncu, oyunDurumu.krupiyer.value, oyunDurumu.krupiyer.el);
                }
            }
            odayaYayinla(oda, { tip: 'oyun_durumu', durum: oyunDurumu });
        }
    }
    kasaKartCek();
}

// ============================================================
// WEBSOCKET BAĞLANTISI
// ============================================================

wss.on('connection', (socket) => {
    console.log('Yeni oyuncu bağlandı');
    let oyuncuOdaId = null;
    let oyuncuIndex = null;

    socket.on('message', (mesaj) => {
        const veri = JSON.parse(mesaj);
        console.log('Mesaj:', veri.tip);

        switch (veri.tip) { 
            case 'oda_olustur': {   
                // Benzersiz kod üret
                let yeniKod;
                do { yeniKod = odaKoduUret(); }
                while (odalar.has(yeniKod));

                // Yeni oda oluştur
                const yeniOda2 = yeniOda(yeniKod);
                yeniOda2.oyunDurumu = yeniOyunDurumu();
                yeniOda2.oyunDurumu.deste = desteOlusturVeKaristir();

                for (let i = 0; i < 5; i++) {
                    yeniOda2.oyunDurumu.oyuncular.push({
                        index: i,
                        isActive: false,
                        bakiye: 1000,
                        bahis: 0,
                        el: [],
                        splitEl: [],
                        value: 0,
                        splitValue: 0,
                        isSplitted: false,
                        sirasplittemi: 0,
                        sonuc: '',
                        splitsonuc: ''
                    });
                }

                odalar.set(yeniKod, yeniOda2);
                oyuncuOdaId = yeniKod;

                // İlk oyuncu olarak ekle
                oyuncuIndex = 0;
                yeniOda2.oyuncular.push(socket);
                yeniOda2.oyunDurumu.oyuncular[0].isActive = true;

                socket.send(JSON.stringify({
                    tip: 'oda_olusturuldu',
                    odaId: yeniKod,
                    oyuncuIndex: 0
                }));
                break;
            }

            // Odaya katıl veya oluştur
            case 'odaya_katil': {
                const odaId = veri.odaId;
    
                // Oda var mı kontrol et
                if (!odalar.has(odaId)) {
                    socket.send(JSON.stringify({ tip: 'hata', mesaj: 'Oda bulunamadı!' }));
                    return;
                }

                const oda = odalar.get(odaId);
                oyuncuOdaId = odaId;

                if (oda.oyuncular.length >= 5) {
                    socket.send(JSON.stringify({ tip: 'hata', mesaj: 'Oda dolu!' }));
                    return;
                }

                oyuncuIndex = oda.oyuncular.length;
                oda.oyuncular.push(socket);
                oda.oyunDurumu.oyuncular[oyuncuIndex].isActive = true;

                socket.send(JSON.stringify({
                    tip: 'baglan',
                    oyuncuIndex: oyuncuIndex,
                    odaId: odaId
                }));

                odayaYayinla(oda, { tip: 'oyun_durumu', durum: oda.oyunDurumu });
                break;
            }

            // Koltuğa otur
            case 'koltuğa_otur': {
                const oda = odalar.get(oyuncuOdaId);
                if (!oda) return;
                const koltukIndex = veri.koltukIndex;
                const oyuncu = oda.oyunDurumu.oyuncular[koltukIndex];

                if (oda.oyunDurumu.mevcutDurum !== 'oyuncu_ekle') return;
                oyuncu.isActive = !oyuncu.isActive;
                odayaYayinla(oda, { tip: 'oyun_durumu', durum: oda.oyunDurumu });
                break;
            }

            // Oyunu başlat
            case 'baslat': {
                const oda = odalar.get(oyuncuOdaId);
                if (!oda) return;
                const durum = oda.oyunDurumu;

                const aktifVar = durum.oyuncular.some(o => o.isActive);
                if (!aktifVar) return;

                durum.siradakiOyuncu = 0;
                while (!durum.oyuncular[durum.siradakiOyuncu]?.isActive) {
                    durum.siradakiOyuncu++;
                }
                durum.mevcutDurum = 'bahis';
                odayaYayinla(oda, { tip: 'oyun_durumu', durum });
                break;
            }

            // Bahis işlemleri
            case 'bahis_ekle': {
                const oda = odalar.get(oyuncuOdaId);
                if (!oda) return;
                const durum = oda.oyunDurumu;

                if (oyuncuIndex !== oda.oyunDurumu.siradakiOyuncu) return;

                const oyuncu = durum.oyuncular[durum.siradakiOyuncu];

                if (oyuncu.bahis + veri.miktar <= oyuncu.bakiye) {
                    oyuncu.bahis += veri.miktar;
                }
                odayaYayinla(oda, { tip: 'oyun_durumu', durum });
                break;
            }

            case 'bahis_sifirla': {
                const oda = odalar.get(oyuncuOdaId);
                if (!oda) return;
                oda.oyunDurumu.oyuncular[oda.oyunDurumu.siradakiOyuncu].bahis = 0;

                //Sıra kontrolü
                if (oyuncuIndex !== oda.oyunDurumu.siradakiOyuncu) return;

                odayaYayinla(oda, { tip: 'oyun_durumu', durum: oda.oyunDurumu });
                break;
            }

            case 'bahis_koy': {
                const oda = odalar.get(oyuncuOdaId);
                if (!oda) return;
                const durum = oda.oyunDurumu;

                //Sıra kontrolü
                if (oyuncuIndex !== oda.oyunDurumu.siradakiOyuncu) return;

                const oyuncu = durum.oyuncular[durum.siradakiOyuncu];

                if (oyuncu.bahis === 0) return;
                oyuncu.bakiye -= oyuncu.bahis;

                do { durum.siradakiOyuncu++; }
                while (durum.siradakiOyuncu < 5 &&
                       !durum.oyuncular[durum.siradakiOyuncu]?.isActive);

                if (durum.siradakiOyuncu >= 5) {
                    kartDagit(durum);
                } else {
                    durum.mevcutDurum = 'bahis';
                }

                if (durum.desteKaristirildi) {
                    odayaYayinla(oda, { tip: 'deste_karistirildi' });
                    durum.desteKaristirildi = false;
                }
                odayaYayinla(oda, { tip: 'oyun_durumu', durum });
                break;
            }

            // Oyuncu hareketleri
            case 'hit': {
                const oda = odalar.get(oyuncuOdaId);
                if (!oda) return;
                const durum = oda.oyunDurumu;
                //Sıra kontrolü
                if (oyuncuIndex !== oda.oyunDurumu.siradakiOyuncu) return;

                const oyuncu = durum.oyuncular[durum.siradakiOyuncu];
                
                const aktifEl = oyuncu.isSplitted && oyuncu.sirasplittemi === 1
                    ? oyuncu.splitEl : oyuncu.el;

                aktifEl.push(kartCek(durum));

                if (oyuncu.isSplitted && oyuncu.sirasplittemi === 1) {
                    oyuncu.splitValue = elDegeriHesapla(oyuncu.splitEl);
                } else {
                    oyuncu.value = elDegeriHesapla(oyuncu.el);
                }

                const puan = oyuncu.isSplitted && oyuncu.sirasplittemi === 1
                    ? oyuncu.splitValue : oyuncu.value;

                if (puan >= 21) {
                    if (oyuncu.isSplitted && oyuncu.sirasplittemi === 0) {
                        oyuncu.sirasplittemi = 1;
                    } else {
                        sonrakiOyuncuyaGec(durum, oda);
                    }
                }

                odayaYayinla(oda, { tip: 'oyun_durumu', durum });
                break;
            }

            case 'stand': {
                const oda = odalar.get(oyuncuOdaId);
                if (!oda) return;
                const durum = oda.oyunDurumu;

                //Sıra kontrolü
                if (oyuncuIndex !== oda.oyunDurumu.siradakiOyuncu) return;

                const oyuncu = durum.oyuncular[durum.siradakiOyuncu];

                if (oyuncu.isSplitted && oyuncu.sirasplittemi === 0) {
                    oyuncu.sirasplittemi = 1;
                    odayaYayinla(oda, { tip: 'oyun_durumu', durum });
                } else {
                    sonrakiOyuncuyaGec(durum, oda);
                    odayaYayinla(oda, { tip: 'oyun_durumu', durum });
                }
                break;
            }

            case 'double': {
                const oda = odalar.get(oyuncuOdaId);
                if (!oda) return;
                const durum = oda.oyunDurumu;

                //Sıra kontrolü
                if (oyuncuIndex !== oda.oyunDurumu.siradakiOyuncu) return;

                const oyuncu = durum.oyuncular[durum.siradakiOyuncu];

                if (oyuncu.bakiye < oyuncu.bahis) return;
                oyuncu.bakiye -= oyuncu.bahis;
                oyuncu.bahis *= 2;

                const aktifEl = oyuncu.isSplitted && oyuncu.sirasplittemi === 1
                    ? oyuncu.splitEl : oyuncu.el;
                aktifEl.push(kartCek(durum));
                oyuncu.value = elDegeriHesapla(oyuncu.el);

                if (oyuncu.isSplitted && oyuncu.sirasplittemi === 0) {
                    oyuncu.sirasplittemi = 1;
                } else {
                    sonrakiOyuncuyaGec(durum, oda);
                }
                odayaYayinla(oda, { tip: 'oyun_durumu', durum });
                break;
            }

            case 'split': {
                const oda = odalar.get(oyuncuOdaId);
                if (!oda) return;
                const durum = oda.oyunDurumu;

                //Sıra kontrolü
                if (oyuncuIndex !== oda.oyunDurumu.siradakiOyuncu) return;

                const oyuncu = durum.oyuncular[durum.siradakiOyuncu];

                if (oyuncu.bakiye < oyuncu.bahis) return;
                oyuncu.bakiye -= oyuncu.bahis;
                oyuncu.isSplitted = true;
                oyuncu.sirasplittemi = 0;

                oyuncu.splitEl = [oyuncu.el.pop()];
                oyuncu.el.push(kartCek(durum));
                oyuncu.splitEl.push(kartCek(durum));

                oyuncu.value = elDegeriHesapla(oyuncu.el);
                oyuncu.splitValue = elDegeriHesapla(oyuncu.splitEl);

                odayaYayinla(oda, { tip: 'oyun_durumu', durum });
                break;
            }

            // Tekrar oyna
            case 'tekrar_oyna': {
                const oda = odalar.get(oyuncuOdaId);
                if (!oda) return;
                const durum = oda.oyunDurumu;

                for (let oyuncu of durum.oyuncular) {
                    oyuncu.bahis = 0;
                    oyuncu.el = [];
                    oyuncu.splitEl = [];
                    oyuncu.value = 0;
                    oyuncu.splitValue = 0;
                    oyuncu.isSplitted = false;
                    oyuncu.sonuc = '';
                    oyuncu.splitsonuc = '';
                }
                durum.krupiyer = { el: [], value: 0 };
                durum.hesaplandiMi = false;
                durum.siradakiOyuncu = 0;
                while (!durum.oyuncular[durum.siradakiOyuncu]?.isActive) {
                    durum.siradakiOyuncu++;
                }
                durum.mevcutDurum = 'bahis';
                odayaYayinla(oda, { tip: 'oyun_durumu', durum });
                break;
            }
        }
    });

    // Oyuncu bağlantısı kesilince
    socket.on('close', () => {
    console.log('Oyuncu ayrıldı');
    if (!oyuncuOdaId) return;
    const oda = odalar.get(oyuncuOdaId);
    if (!oda) return;

    // Koltugu bosalt
    if (oyuncuIndex !== null && oda.oyunDurumu) {
        const ayrilanOyuncu = oda.oyunDurumu.oyuncular[oyuncuIndex];
        if (ayrilanOyuncu) {
            ayrilanOyuncu.isActive = false;
            ayrilanOyuncu.el = [];
            ayrilanOyuncu.bahis = 0;
            ayrilanOyuncu.value = 0;
        }

        // Sırası gelen oyuncu ayrıldıysa sonraki oyuncuya geç
        if (oda.oyunDurumu.mevcutDurum === 'oyuncu_turu' && 
            oda.oyunDurumu.siradakiOyuncu === oyuncuIndex) {
            sonrakiOyuncuyaGec(oda.oyunDurumu, oda);
        }

        odayaYayinla(oda, { tip: 'oyun_durumu', durum: oda.oyunDurumu });
    }

    // Socketi odadan cikar
    oda.oyuncular = oda.oyuncular.filter(s => s !== socket);
    if (oda.oyuncular.length === 0) {
        odalar.delete(oyuncuOdaId);
        console.log('Oda silindi:', oyuncuOdaId);
    }
});
});

// Odadaki herkese mesaj gönder
function odayaYayinla(oda, veri) {
    const mesaj = JSON.stringify(veri);
    oda.oyuncular.forEach(socket => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(mesaj);
        }
    });
}

const PORT = process.env.PORT || 3000;

// Render uyku modunu engelle
setInterval(() => {
    fetch('https://webblackjack.onrender.com')
        .catch(() => {});
}, 10 * 60 * 1000);

server.listen(PORT, () => {
    console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});