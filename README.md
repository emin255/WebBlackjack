# Blackjack

Multiplayer bir blackjack oyunu. Node.js ve WebSocket kullanılarak gerçek zamanlı, farklı cihazlardan oynanabilir şekilde geliştirilmiştir.

## Genel Bakış

Oyun, klasik blackjack kurallarına dayanmaktadır. Birden fazla oyuncu aynı masada, farklı cihazlardan oda kodu ile bağlanarak oynayabilir. Sunucu taraflı oyun mantığı sayesinde tüm oyuncular senkronize bir şekilde oyunu takip eder.

## Teknolojiler

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express
- **Gerçek Zamanlı İletişim:** WebSocket (ws)
- **Deploy:** Render

## Proje Yapısı

```
blackjack/
├── index.html          # Oyun arayüzü
├── style.css           # Görsel tasarım
├── game.js             # Frontend mantığı ve WebSocket istemcisi
├── cards.png           # Kart sprite sheet (84x120px, 14x4 grid)
├── ses.ogg             # Kart çekme sesi
├── karistirma.ogg      # Deste karıştırma sesi
├── arkaplan.ogg        # Arkaplan muzigi
├── server/
│   └── server.js       # WebSocket sunucusu ve oyun mantığı
├── package.json
└── README.md
```

## Kurulum

Projeyi klonla:

```bash
git clone https://github.com/KULLANICI_ADIN/blackjack.git
cd blackjack
```

Bağımlılıkları yükle:

```bash
npm install
```

Sunucuyu başlat:

```bash
node server/server.js
```

Tarayıcıda aç:

```
http://localhost:3000
```

## Oyun Akışı

1. Oyuncu lobi ekranında "Oda Oluştur" butonuna basar, 6 haneli rastgele bir oda kodu üretilir.
2. Oda kodu diğer oyuncularla paylaşılır. Diger oyuncular kodu girerek aynı masaya katılır.
3. Masaya en fazla 5 oyuncu oturabilir. Her bağlanan oyuncu sıradaki koltuğa otomatik atanır.
4. Oda sahibi "Baslat" butonuna basar, bahis turu başlar.
5. Her oyuncu sırasıyla bahisini koyar.
6. Kartlar dağıtılır, oyuncular sırayla hamle yapar.
7. Tüm oyuncular tamamladıktan sonra krupiyer oynар.
8. Sonuçlar hesaplanır, bakiyeler güncellenir.

## Oyun Kurallari

- Krupiyer 17 ve üzerinde durmak zorundadır.
- Blackjack (ilk 2 kart As + 10/J/Q/K) bahsin 1.5 katı odenır.
- Double Down yalnızca ilk 2 kartta yapılabilir, bahis iki katına çıkar ve tek kart çekilir.
- Split yalnızca aynı değerde 2 kart olduğunda yapılabilir, her el için ayrı bahis kesılır.
- Deste 6 standart desteden oluşur (312 kart). Deste tükenmeye yakın otomatik olarak yeniden karıştırılır.

## Mimari

Oyun mantığı tamamen sunucu tarafında çalışır. Frontend yalnızca sunucudan gelen state'i ekrana yansıtır ve kullanıcı hareketlerini sunucuya iletir.

```
Oyuncu 1 (Browser) --+
Oyuncu 2 (Browser) --+--> Node.js WebSocket Server --> Oyun Mantigi
Oyuncu 3 (Browser) --+
```

Sunucu, state machine mimarisiyle yonetilir:

```
oyuncu_ekle --> bahis --> kart_dagit --> oyuncu_turu --> kasa_turu --> sonuc
```

Her state değişiminde sunucu güncel oyun durumunu tüm bağlı oyunculara yayınlar.

## Canlı Demo

https://webblackjack.onrender.com
