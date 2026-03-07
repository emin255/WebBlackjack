// ============================================================
// WEBSOCKET BAĞLANTISI
// ============================================================

const socket = new WebSocket(
    window.location.hostname === 'localhost'
        ? 'ws://localhost:3000'
        : 'wss://webblackjack.onrender.com'
);

// Lobi butonları
document.getElementById('oda-olustur-btn').addEventListener('click', () => {
    sunucuyaGonder({ tip: 'oda_olustur' });
});

document.getElementById('oda-gir-btn').addEventListener('click', () => {
    const kod = document.getElementById('oda-kod-input').value.toUpperCase().trim();
    if (kod.length !== 6) {
        document.getElementById('lobi-bilgi').textContent = 'Geçersiz kod!';
        return;
    }
    sunucuyaGonder({ tip: 'odaya_katil', odaId: kod });
});

// Enter ile de girilebilsin
document.getElementById('oda-kod-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('oda-gir-btn').click();
});

// ============================================================
// SES SİSTEMİ (C'deki InitAudioDevice() karşılığı)
// ============================================================

const sesler = {
    kartCek: new Audio('ses.ogg'),
    karistir: new Audio('karistirma.ogg'),
    arkaplan: new Audio('arkaplan.ogg')
};

// Arka plan müziği döngüye al
sesler.arkaplan.loop = true;
sesler.arkaplan.volume = 0.4;

// Tarayıcı otomatik ses çalmayı engelliyor
// İlk tıklamada başlat
document.addEventListener('click', () => {
    if (sesler.arkaplan.paused) {
        sesler.arkaplan.play().catch(() => {});
    }
}, { once: true });

function sesOyna(tip) {
    try {
        const ses = sesler[tip];
        ses.currentTime = 0; // Başa sar
        ses.play().catch(() => {});
    } catch(e) {}
}

let benimIndex = null;   // Bu tarayıcının oyuncu indexi
let odaId = 'oda1';      // Şimdilik sabit, sonra dinamik yapabiliriz

socket.onopen = () => {
    console.log('Sunucuya bağlandı!');
    // Odaya katıl
    sunucuyaGonder({ tip: 'odaya_katil', odaId: odaId });
};

socket.onmessage = (event) => {
    const veri = JSON.parse(event.data);

    switch (veri.tip) {
        case 'oda_olusturuldu':
            benimIndex = veri.oyuncuIndex;
            odaId = veri.odaId;
            document.getElementById('lobi-bilgi').textContent = veri.odaId;
            document.getElementById('lobi-bilgi').style.color = '#ffd700';
            // 3 saniye bekle, kopyalayabilsin
            setTimeout(() => {
                document.getElementById('lobi').style.display = 'none';
                // Oda kodunu sol üstte göster
                const kodDiv = document.createElement('div');
                kodDiv.id = 'oda-kodu-gosterge';
                kodDiv.textContent = `Oda: ${veri.odaId}`;
                document.body.appendChild(kodDiv);
                kodDiv.addEventListener('click', () => {
                navigator.clipboard.writeText(veri.odaId);
                kodDiv.textContent = `Kopyalandı! ✓`;
                setTimeout(() => {
                    kodDiv.textContent = `Oda: ${veri.odaId}`;
                }, 1500);
            });
            }, 3000);
            break;


        case 'baglan':
            benimIndex = veri.oyuncuIndex;
            odaId = veri.odaId;
            document.getElementById('lobi').style.display = 'none';
            break;

        case 'hata':
            document.getElementById('lobi-bilgi').textContent = veri.mesaj;
            document.getElementById('lobi-bilgi').style.color = '#ff4444';
            break;
        case 'baglan':
            benimIndex = veri.oyuncuIndex;
            console.log('Oyuncu indexim:', benimIndex);
            break;

        case 'oyun_durumu':
            const eskiDurum = mevcutDurum;
            const eskiKartSayisi = oyuncular.reduce((t, o) => t + (o.el?.length || 0), 0);
            const eskiKrupiyerKarti = krupiyer.el?.length || 0;

            mevcutDurum = veri.durum.mevcutDurum;
            oyuncular = veri.durum.oyuncular;
            krupiyer = veri.durum.krupiyer;
            siradakiOyuncu = veri.durum.siradakiOyuncu;

            // Kart sesi (oyuncu veya krupiyer)
            const yeniKartSayisi = oyuncular.reduce((t, o) => t + (o.el?.length || 0), 0);
            const yeniKrupiyerKarti = krupiyer.el?.length || 0;
            if (yeniKartSayisi > eskiKartSayisi || yeniKrupiyerKarti > eskiKrupiyerKarti) {
                sesOyna('kartCek');
            }
            ekraniGuncelle();
            break;
        case 'deste_karistirildi':
            sesOyna('karistir');
            break;
        case 'hata':
            alert(veri.mesaj);
            break;
    }
};

socket.onclose = () => {
    console.log('Sunucu bağlantısı kesildi!');
};

socket.onerror = (err) => {
    console.error('WebSocket hatası:', err);
};

// Sunucuya mesaj gönder
function sunucuyaGonder(veri) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(veri));
    }
}

// ============================================================
// VERİ YAPILARI (C'deki struct'ların karşılığı)
// ============================================================

// C'de: struct kart { int konumx; int konumy; char isim[]; }
function yeniKart(deger, simge) {
    return {
        deger: deger,     // "A", "2"..."10", "J", "Q", "K"
        simge: simge,     // "kupa", "karo", "sinek", "maça"
        kapali: false     // Krupiyerin 2. kartı için
    };
}

// C'de: struct oyuncu { int bahis; int bakiye; int value; ... }
function yeniOyuncu(index) {
    return {
        index: index,
        isActive: false,
        bakiye: 1000,
        bahis: 0,
        el: [],           // C'deki el[MAX_EL]
        splitEl: [],      // C'deki splitEl[]
        value: 0,
        splitValue: 0,
        isSplitted: false,
        sirasplittemi: 0, // 0=1.el, 1=2.el
        sonuc: "",
        splitsonuc: ""
    };
}

// ============================================================
// OYUN DEĞİŞKENLERİ (C'deki global değişkenler)
// ============================================================

// C'de: GAME_STATE mevcutDurum = STATE_OYUNCU_Ekle;
const STATE = {
    OYUNCU_EKLE: "oyuncu_ekle",
    BAHIS:       "bahis",
    KART_DAGIT:  "kart_dagit",
    OYUNCU_TURU: "oyuncu_turu",
    KASA_TURU:   "kasa_turu",
    SONUC:       "sonuc"
};

let mevcutDurum = STATE.OYUNCU_EKLE;
let siradakiOyuncu = 0;
let hesaplandiMi = false;

// C'de: struct oyuncu oyuncular[5];
let oyuncular = [
    yeniOyuncu(0),
    yeniOyuncu(1),
    yeniOyuncu(2),
    yeniOyuncu(3),
    yeniOyuncu(4)
];

// C'de: struct oyuncu krupiyer;
let krupiyer = {
    el: [],
    value: 0,
    sonuc: ""
};

// ============================================================
// DESTE (C'deki uzundeste[364])
// ============================================================

let deste = [];

// C'de: void deste_olustur() + desteyi_karistir()
function desteOlusturVeKaristir() {
    const simgeler = ["kupa", "karo", "sinek", "maça"];
    const degerler = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
    deste = [];

    // 6 deste (C'de 7 deste vardı, 6 standart kural)
    for (let d = 0; d < 6; d++) {
        for (let s of simgeler) {
            for (let v of degerler) {
                deste.push(yeniKart(v, s));
            }
        }
    }
    // Fisher-Yates Karıştırma (C'deki desteyi_karistir())
    for (let i = deste.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deste[i], deste[j]] = [deste[j], deste[i]];
    }
}

let desteIndex = 0; // C'deki kart_sayisi

// C'de: void kartlarbittimi()
function kartlarBittiMi() {
    if (desteIndex > deste.length - 20) {
        desteOlusturVeKaristir();
        desteIndex = 0;
        console.log("Deste yenilendi!");
    }
}

// C'de: deste[kart_sayisi++]
function kartCek() {
    kartlarBittiMi();
    return { ...deste[desteIndex++] }; // Kopyasını al
}

// ============================================================
// KART DEĞERİ HESAPLAMA (C'deki oyuncu_el_degeri())
// ============================================================

function elDegeriHesapla(el) {
    let toplam = 0;
    let asCount = 0;

    for (let kart of el) {
        if (kart.kapali) continue;

        if (kart.deger === 'A') {
            asCount++;
            toplam += 11;
        } else if (['J','Q','K'].includes(kart.deger)) {
            toplam += 10;
        } else if (kart.deger === '10') {
            toplam += 10;
        } else {
            toplam += parseInt(kart.deger);
        }
    }

    while (toplam > 21 && asCount > 0) {
        toplam -= 10;
        asCount--;
    }

    return toplam;
}

// ============================================================
// KAZANAN HESAPLAMA (C'deki kazanan())
// ============================================================

function kazananHesapla(oyuncu, kasaPuan) {
    // Bir elin sonucunu hesaplar, bakiyeyi günceller
    function elSonucu(elPuan, bahis) {
        if (elPuan > 21) return { sonuc: "BATTINIZ", kazanc: 0 };
        if (kasaPuan > 21) return { sonuc: "KAZANDINIZ!", kazanc: bahis * 2 };
        if (elPuan > kasaPuan) return { sonuc: "KAZANDINIZ!", kazanc: bahis * 2 };
        if (elPuan === kasaPuan) return { sonuc: "BERABERE", kazanc: bahis };
        return { sonuc: "KAYBETTİNİZ", kazanc: 0 };
    }

    const ana = elSonucu(oyuncu.value, oyuncu.bahis);
    oyuncu.sonuc = ana.sonuc;
    oyuncu.bakiye += ana.kazanc;

    if (oyuncu.isSplitted) {
        const split = elSonucu(oyuncu.splitValue, oyuncu.bahis);
        oyuncu.splitsonuc = split.sonuc;
        oyuncu.bakiye += split.kazanc;
    }
}

// ============================================================
// STATE GEÇİŞLERİ
// ============================================================

// Sonraki aktif oyuncuya geç (C'deki do-while döngüsü)
function sonrakiOyuncuyaGec() {
    do { siradakiOyuncu++; }
    while (siradakiOyuncu < 5 && !oyuncular[siradakiOyuncu].isActive);

    while (oyunDurumu.siradakiOyuncu < 5 &&
           oyunDurumu.oyuncular[oyunDurumu.siradakiOyuncu]?.isActive &&
           oyunDurumu.oyuncular[oyunDurumu.siradakiOyuncu]?.value >= 21) {
        oyunDurumu.siradakiOyuncu++;
    }
    
    if (siradakiOyuncu >= 5) {
        durumDegistir(STATE.KASA_TURU);
    }
}

function durumDegistir(yeniDurum) {
    mevcutDurum = yeniDurum;
    console.log("Durum:", yeniDurum); // Debug için

    if (yeniDurum === STATE.KART_DAGIT) {
        kartDagit();
    }

    if (yeniDurum === STATE.KASA_TURU) {
        // Krupiyerin kapalı kartını aç
        krupiyer.el.forEach(k => k.kapali = false);
        kasaTuru();
    }

    if (yeniDurum === STATE.SONUC) {
        sonuclariHesapla();
    }

    ekraniGuncelle(); // Her state değişiminde ekranı güncelle
}

// ============================================================
// OYUN FONKSİYONLARI
// ============================================================

// C'de: void yeni_el()
function kartDagit() {
    krupiyer.el = [];

    for (let oyuncu of oyuncular) {
        if (!oyuncu.isActive) continue;
        oyuncu.el = [kartCek(), kartCek()];
        oyuncu.splitEl = [];
        oyuncu.isSplitted = false;
        oyuncu.sirasplittemi = 0;
        oyuncu.value = elDegeriHesapla(oyuncu.el);
        oyuncu.sonuc = "";
        oyuncu.splitsonuc = "";
    }

    // Krupiyere 2 kart (2. kart kapalı)
    krupiyer.el = [kartCek(), kartCek()];
    krupiyer.el[1].kapali = true; // C'deki gizle==0 durumu
    krupiyer.value = elDegeriHesapla(krupiyer.el);

    siradakiOyuncu = 0;
    while (siradakiOyuncu < 5 && !oyuncular[siradakiOyuncu].isActive) {
        siradakiOyuncu++;
    }

    durumDegistir(STATE.OYUNCU_TURU);

    // 21 ile başlayan oyuncuları atla
    while (oyunDurumu.siradakiOyuncu < 5 &&
        oyunDurumu.oyuncular[oyunDurumu.siradakiOyuncu]?.isActive &&
        oyunDurumu.oyuncular[oyunDurumu.siradakiOyuncu]?.value >= 21) {
        oyunDurumu.siradakiOyuncu++;
    }

    // Hepsi 21 ise direkt kasa turuna geç
    if (oyunDurumu.siradakiOyuncu >= 5) {
        kasaTuruyuBaslat(oyunDurumu, oda);
        return;
}
}

// C'de: case STATE_KASA_TURU
function kasaTuru() {
    krupiyer.el.forEach(k => k.kapali = false);
    krupiyer.value = elDegeriHesapla(krupiyer.el);
    ekraniGuncelle();

    // C'deki zamanlı kart çekme (setTimeout = kasaBeklemeSuresi)
    function kasaKartCek() {
        krupiyer.value = elDegeriHesapla(krupiyer.el);
        ekraniGuncelle();

        if (krupiyer.value < 17) {
            setTimeout(() => {
                krupiyer.el.push(kartCek());
                kasaKartCek(); // Tekrar kontrol et
            }, 1000); // C'deki 1 saniyelik bekleme
        } else {
            durumDegistir(STATE.SONUC);
        }
    }
    kasaKartCek();
}

// C'de: case STATE_SONUC - kazanan hesaplama
function sonuclariHesapla() {
    if (hesaplandiMi) return;
    const kasaPuan = krupiyer.value;
    for (let oyuncu of oyuncular) {
        if (oyuncu.isActive) kazananHesapla(oyuncu, kasaPuan);
    }
    hesaplandiMi = true;
    ekraniGuncelle();
}

// ============================================================
// OYUNCU HAREKETLERİ (Hit/Stand/Double/Split)
// ============================================================

function hit()        { sunucuyaGonder({ tip: 'hit' }); }
function stand()      { sunucuyaGonder({ tip: 'stand' }); }
function doubleDown() { sunucuyaGonder({ tip: 'double' }); }
function split()      { sunucuyaGonder({ tip: 'split' }); }

// ============================================================
// BAŞLANGIÇ
// ============================================================

desteOlusturVeKaristir();
// ============================================================
// EKRAN GÜNCELLEME (C'deki BeginDrawing() bloğu)
// ============================================================

function ekraniGuncelle() {
    koltukEkle();
    krupiyerGuncelle();
    butonlariGuncelle();
    bilgiYazisiGuncelle();
}

// ============================================================
// KOLTUK / OYUNCU ALANI
// ============================================================

function koltukEkle() {
    for (let i = 0; i < 5; i++) {
        const oyuncu = oyuncular[i];
        const koltukDiv = document.getElementById(`koltuk-${i}`);

        // Sıra göstergesi
        if (mevcutDurum === 'oyuncu_turu' && i === siradakiOyuncu) {
            koltukDiv.classList.add('sirada');
        } else {
            koltukDiv.classList.remove('sirada');
        }

        // Daire
        const daireDiv = koltukDiv.querySelector('.koltuk-daire');
        if (daireDiv) {
            daireDiv.textContent = oyuncu.isActive ? `P${i+1}` : '';
        }

        // Oyuncu bilgileri
        koltukDiv.querySelector('.oyuncu-isim').textContent   = `Oyuncu ${i+1}`;
        koltukDiv.querySelector('.oyuncu-skor').textContent   = oyuncu.isActive ? `Skor: ${oyuncu.value}` : '';
        koltukDiv.querySelector('.oyuncu-bahis').textContent  = oyuncu.isActive ? `Bahis: ${oyuncu.bahis}` : '';
        koltukDiv.querySelector('.oyuncu-bakiye').textContent = oyuncu.isActive ? `Bakiye: ${oyuncu.bakiye}` : '';

        // Kartları çiz
        const elDiv = koltukDiv.querySelector('.oyuncu-el');
        elDiv.innerHTML = '';
        elDiv.style.cssText = `
            position: relative;
            height: 110px;
            width: ${oyuncu.el.length * 22 + 84}px;
            margin-bottom: 4px;
        `;

        if (oyuncu.isActive && oyuncu.el.length > 0) {
            if (oyuncu.isSplitted) {
                // Split: iki ayrı el
                const el1Div = document.createElement('div');
                el1Div.style.cssText = `
                    position: relative;
                    height: 110px;
                    width: ${oyuncu.el.length * 22 + 84}px;
                    display: inline-block;
                `;
                oyuncu.el.forEach((k, i) => el1Div.appendChild(kartEleman(k, i)));

                const el2Div = document.createElement('div');
                el2Div.style.cssText = `
                    position: relative;
                    height: 110px;
                    width: ${oyuncu.splitEl.length * 22 + 84}px;
                    display: inline-block;
                    margin-left: 20px;
                    border-left: 2px solid gold;
                    padding-left: 10px;
                `;
                oyuncu.splitEl.forEach((k, i) => el2Div.appendChild(kartEleman(k, i)));

                elDiv.style.width = 'auto';
                elDiv.appendChild(el1Div);
                elDiv.appendChild(el2Div);
            } else {
                oyuncu.el.forEach((k, i) => elDiv.appendChild(kartEleman(k, i)));
            }
        }

        // Sonuç yazısı
        let mevcutSonuc = koltukDiv.querySelector('.sonuc-yazisi');
        if (mevcutSonuc) mevcutSonuc.remove();

        if (mevcutDurum === STATE.SONUC && oyuncu.isActive) {
            const sonucDiv = document.createElement('div');
            sonucDiv.className = 'sonuc-yazisi';

            if (oyuncu.isSplitted) {
                sonucDiv.textContent = `El1: ${oyuncu.sonuc} | El2: ${oyuncu.splitsonuc}`;
            } else {
                sonucDiv.textContent = oyuncu.sonuc;
            }

            // Renge göre class
            if (oyuncu.sonuc.includes('KAZANDINIZ')) sonucDiv.classList.add('sonuc-kazandi');
            else if (oyuncu.sonuc.includes('BERABERE')) sonucDiv.classList.add('sonuc-berabere');
            else sonucDiv.classList.add('sonuc-kaybetti');

            koltukDiv.querySelector('.oyuncu-bilgi').appendChild(sonucDiv);
        }
    }
}

// ============================================================
// KART HTML ELEMANI OLUŞTUR
// ============================================================

function kartEleman(kart, index = 0) {
    const div = document.createElement('div');
    div.className = `kart ${kart.simge}`;

    const KART_GENISLIK = 84;
    const KART_YUKSEKLIK = 120;

    const sutunMap = {
        'A':0, '2':1, '3':2, '4':3, '5':4, '6':5, '7':6,
        '8':7, '9':8, '10':9, 'J':10, 'Q':11, 'K':12
    };
    const satirMap = {
        'kupa': 0, 'karo': 1, 'sinek': 2, 'maça': 3
    };

    let sutun, satir;
    if (kart.kapali) {
        sutun = 13;
        satir = 3;
    } else {
        sutun = sutunMap[kart.deger];
        satir = satirMap[kart.simge];
    }

    const x = sutun * KART_GENISLIK;
    const y = satir * KART_YUKSEKLIK;

    div.style.cssText = `
        width: ${KART_GENISLIK}px;
        height: ${KART_YUKSEKLIK}px;
        background-image: url('cards.png');
        background-position: -${x}px -${y}px;
        background-repeat: no-repeat;
        border-radius: 6px;
        box-shadow: 2px 2px 5px rgba(0,0,0,0.5);
        position: absolute;
        left: ${index * 25}px;
        top: ${index * -8}px;
        z-index: ${index};
        transition: all 0.2s ease;
    `;

    return div;
}
function kartElemanDuz(kart, index = 0) {
    const div = document.createElement('div');
    div.className = `kart ${kart.simge}`;

    const KART_GENISLIK = 84;
    const KART_YUKSEKLIK = 120;

    const sutunMap = {
        'A':0, '2':1, '3':2, '4':3, '5':4, '6':5, '7':6,
        '8':7, '9':8, '10':9, 'J':10, 'Q':11, 'K':12
    };
    const satirMap = {
        'kupa': 0, 'karo': 1, 'sinek': 2, 'maça': 3
    };

    let sutun, satir;
    if (kart.kapali) {
        sutun = 13;
        satir = 3;
    } else {
        sutun = sutunMap[kart.deger];
        satir = satirMap[kart.simge];
    }

    const x = sutun * KART_GENISLIK;
    const y = satir * KART_YUKSEKLIK;

    div.style.cssText = `
        width: ${KART_GENISLIK}px;
        height: ${KART_YUKSEKLIK}px;
        background-image: url('cards.png');
        background-position: -${x}px -${y}px;
        background-repeat: no-repeat;
        border-radius: 6px;
        box-shadow: 2px 2px 5px rgba(0,0,0,0.5);
        position: absolute;
        left: ${index * 30}px;
        top: 0px;
        transform: rotate(0deg);
        z-index: ${index};
    `;

    return div;
}

// ============================================================
// KRUPİYER ALANI
// ============================================================

function krupiyerGuncelle() {
    const elDiv = document.getElementById('krupiyer-el');
    const skorDiv = document.getElementById('krupiyer-skor');

    elDiv.innerHTML = '';
    elDiv.style.cssText = `
        position: relative;
        height: 120px;
        width: ${krupiyer.el.length * 22 + 84}px;
        display: flex;
        justify-content: center;
    `;

    krupiyer.el.forEach((k, i) => elDiv.appendChild(kartElemanDuz(k, i)));

    const kapaliKartVar = krupiyer.el.some(k => k.kapali);
    skorDiv.textContent = kapaliKartVar ? 'Skor: ?' : `Skor: ${elDegeriHesapla(krupiyer.el)}`;
}

// ============================================================
// BUTONLAR (State'e göre değişir)
// ============================================================

// C'deki switch(mevcutDurum) içindeki buton çizimlerinin karşılığı
function butonlariGuncelle() {
    // Önce tüm butonları temizle
    document.querySelectorAll('.butonlar').forEach(b => b.innerHTML = '');
    document.getElementById('baslat-btn').style.display = 'none';

    if (mevcutDurum === STATE.OYUNCU_EKLE) {
        // Başlat butonu görünsün
        document.getElementById('baslat-btn').style.display = 'block';
        document.getElementById('bilgi-yazisi').textContent = 'Bahis koymak için başlat\'a basın.';

    } else if (mevcutDurum === STATE.BAHIS) {
        // Sadece sıradaki oyuncunun koltuguna bahis butonları ekle
        const butonDiv = document.querySelector(`#koltuk-${siradakiOyuncu} .butonlar`);
        const oyuncu = oyuncular[siradakiOyuncu];

        if (oyuncu.bakiye > 0) {
            butonDiv.appendChild(butonOlustur('+10',   'btn-bahis',   () => bahisEkle(10)));
            butonDiv.appendChild(butonOlustur('+50',   'btn-bahis',   () => bahisEkle(50)));
            butonDiv.appendChild(butonOlustur('+100',  'btn-bahis',   () => bahisEkle(100)));
            butonDiv.appendChild(butonOlustur('Koy',   'btn-koy',     () => bahisKoy()));
            butonDiv.appendChild(butonOlustur('Sıfırla','btn-sifirla',() => bahisSifirla()));
        } else {
            // Bakiye bitti — C'deki iflas durumu
            butonDiv.appendChild(butonOlustur('Borç Al', 'btn-double', () => borcAl()));
            butonDiv.appendChild(butonOlustur('Masadan Kalk', 'btn-stand', () => masadanKalk()));
        }

    } else if (mevcutDurum === STATE.OYUNCU_TURU) {
        if (siradakiOyuncu >= 5) return;
        const oyuncu = oyuncular[siradakiOyuncu];
        const butonDiv = document.querySelector(`#koltuk-${siradakiOyuncu} .butonlar`);

        // Hangi el oynanıyor?
        const aktifElSayisi = oyuncu.isSplitted && oyuncu.sirasplittemi === 1
            ? oyuncu.splitEl.length : oyuncu.el.length;

        butonDiv.appendChild(butonOlustur('HIT',   'btn-hit',   () => hit()));
        butonDiv.appendChild(butonOlustur('STAND', 'btn-stand', () => stand()));

        // Double — sadece 2 kart varken
        if (aktifElSayisi === 2 && oyuncu.bakiye >= oyuncu.bahis) {
            butonDiv.appendChild(butonOlustur('DOUBLE', 'btn-double', () => doubleDown()));
        }

        // Split — kartlar eşit değerdeyse ve henüz split yapılmadıysa
        if (!oyuncu.isSplitted && oyuncu.el.length === 2 &&
            oyuncu.el[0].deger === oyuncu.el[1].deger &&
            oyuncu.bakiye >= oyuncu.bahis) {
            butonDiv.appendChild(butonOlustur('SPLIT', 'btn-split', () => split()));
        }

    } else if (mevcutDurum === STATE.SONUC) {
        // Tekrar oyna butonu — ortada göster
        document.getElementById('baslat-btn').style.display = 'block';
        document.getElementById('baslat-btn').textContent = 'TEKRAR OYNA';
    }
}

// Buton oluşturan yardımcı fonksiyon
// C'deki DrawRectanglePro() + tıklama kontrolünün karşılığı
function butonOlustur(yazi, cssClass, tiklamaFonksiyonu) {
    const btn = document.createElement('button');
    btn.textContent = yazi;
    btn.className = cssClass;
    btn.addEventListener('click', (e) => {
        e.stopPropagation(); // Koltuk tıklamasını engelle
        tiklamaFonksiyonu();
    });
    return btn;
}

// ============================================================
// BİLGİ YAZISI
// ============================================================

function bilgiYazisiGuncelle() {
    const yazı = document.getElementById('bilgi-yazisi');
    const yazılar = {
        [STATE.OYUNCU_EKLE]: 'Masaya oturmak için koltuklara tıklayın.',
        [STATE.BAHIS]:       `Oyuncu ${siradakiOyuncu + 1} bahsini koyuyor...`,
        [STATE.KART_DAGIT]:  'Kartlar dağıtılıyor...',
        [STATE.OYUNCU_TURU]: `Oyuncu ${siradakiOyuncu + 1} oynuyor`,
        [STATE.KASA_TURU]:   'Kasa oynuyor...',
        [STATE.SONUC]:       'El bitti!'
    };
    yazı.textContent = yazılar[mevcutDurum] || '';
}

// ============================================================
// BAHİS FONKSİYONLARI
// ============================================================

// Bahis fonksiyonları
function bahisEkle(miktar) {
    sunucuyaGonder({ tip: 'bahis_ekle', miktar: miktar });
}
function bahisSifirla() {
    sunucuyaGonder({ tip: 'bahis_sifirla' });
}
function bahisKoy() {
    sunucuyaGonder({ tip: 'bahis_koy' });
}
function borcAl() {
    sunucuyaGonder({ tip: 'borc_al' });
}
function masadanKalk() {
    sunucuyaGonder({ tip: 'masadan_kalk' });
}

// ============================================================
// KOLTUK TIKLAMA & BAŞLAT
// ============================================================

document.getElementById('baslat-btn').addEventListener('click', () => {
    if (mevcutDurum === 'oyuncu_ekle') {
        sunucuyaGonder({ tip: 'baslat' });
    } else if (mevcutDurum === 'sonuc') {
        sunucuyaGonder({ tip: 'tekrar_oyna' });
    }
});

// ============================================================
// BAŞLANGIÇ
// ============================================================


// HTML'deki her koltuk div'ine daire ekle (querySelector ile bulamıyorduk)
document.querySelectorAll('.koltuk').forEach(koltukDiv => {
    if (!koltukDiv.querySelector('.koltuk-daire')) {
        const daire = document.createElement('div');
        daire.className = 'koltuk-daire';
        daire.textContent = '+';
        koltukDiv.insertBefore(daire, koltukDiv.firstChild);
    }
});
