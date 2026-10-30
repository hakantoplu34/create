# Faz 6 — Sunum ortamı ve özel gün takvimi

Önce `00-GENEL.md`'yi oku. Faz 1 yeterli; Faz 5 varsa fikir ve storyboard slaytları da eklenir.

## 1. Sunum ortamı

Sunumlar uygulamanın içinde hazırlanır. Canva ya da PowerPoint'e bağlı değil. Arşivden, panolardan, fikirlerden ve storyboard'lardan eklenen her şey doğrudan slayt olur.

### Veri
`store` içinde `presentations: [{ id, name, boardId?, slides: [...], createdAt, updatedAt }]`.

Slayt türleri:
- `kapak`: başlık, alt başlık, tarih
- `bolum`: bölüm başlığı
- `is`: tek arşiv işi (büyük görsel/video karesi + başlık + not + isteğe bağlı analiz özeti)
- `izgara`: 2-6 iş yan yana (moodboard)
- `metin`: başlık + paragraf ya da madde listesi
- `fikir`: Faz 5 fikir kartı (başlık, içgörü, fikir, uygulama)
- `storyboard`: 6 kare
- `kapanis`: teşekkür / iletişim

Her slaytta `{ id, type, data, notes }`. `notes` sunum notu, sadece sunucu görünümünde görünür.

### Ekran
Sol menüde "Sunumlar". Liste + "Yeni sunum" (primary).

Düzenleme ekranı:
- Solda slayt küçük resimleri; sürükle bırakla sıralama, sağ tık: çoğalt, sil.
- Ortada seçili slayt, 16:9, metinler yerinde düzenlenebilir (`contenteditable`, yapıştırmada biçim temizlenir).
- Sağda slayt türüne göre ayarlar.
- Üstte: "Arşivden ekle" (arşiv ızgarasını seçim modunda açar, çoklu seçim, seçilenler `is` ya da tek `izgara` slaytı olur), "Panodan oluştur" (bir panonun tüm işlerinden kapak + işler + kapanış), "Sun" (primary).
- Her yerden ekleme: arşiv kartının sağ tık menüsünde ve detay penceresinde "Sunuma ekle > [sunum seç / yeni sunum]". Fikir ve storyboard kartlarında da aynı.

### Tasarım
- Tek şablon, Kısayol dili: füme zemin kapak/bölüm/kapanış slaytları, açık zemin içerik slaytları, turuncu tek vurgu. Logo dosyası `src/renderer/marka/` altına konacak (Hakan verecek; yoksa yazı olarak "kısayol").
- Font Ayarlar'dan seçilebilir değil; tasarımdaki font gelince `styles` içine eklenir.
- Görseller kırpılmadan sığdırılır (`object-fit: contain`), ızgarada `cover`.

### Sunma
- "Sun": tam ekran pencere, ok tuşları / boşluk ile ilerleme, Esc ile çıkış. Videolar slaytta oynar (`ilham://medya`).
- İkinci ekran varsa: sunum ikinci ekranda, ana ekranda sunucu görünümü (mevcut slayt, sonraki slayt, notlar, süre).

### Dışa aktarma
- "PDF olarak kaydet": gizli pencerede her slaytı 1920x1080 sayfa olarak `webContents.printToPDF` ile. Videolarda kapak karesi kullanılır.
- Paylaşım bağlantısı üretilmez (genel kural 8).

## 2. Özel gün takvimi

### Veri
`src/takvim.js` içinde Türkiye için özel günler listesi. Sabit tarihliler (Sevgililer Günü 14 Şubat, Kadınlar Günü 8 Mart, 23 Nisan, 1 Mayıs, 19 Mayıs, Anneler Günü: mayısın 2. pazarı, Babalar Günü: haziranın 3. pazarı, 15 Temmuz, 30 Ağustos, Öğretmenler Günü 24 Kasım, 29 Ekim, Yılbaşı, Black Friday: kasımın son cuması, 11.11, okula dönüş: eylül başı) ve hareketli dini günler (Ramazan başlangıcı, Ramazan Bayramı, Kurban Bayramı). Dini günlerin tarihleri hesaplanmaz; 2026–2030 için Diyanet takviminden alınan tarihler dosyaya elle yazılır (kaynak satırını yorum olarak ekle). Kullanıcı Ayarlar'dan kendi özel günlerini ekleyebilir (marka yıldönümü gibi).

Her güne bir anahtar kelime seti: ör. Ramazan → ["ramazan", "iftar", "sahur", "bayram", "ramadan", "eid"].

### Ekran
- Arşiv ekranının üstünde, yaklaşan 45 gün içindeki ilk özel gün için ince bir şerit: "Anneler Günü'ne 24 gün var. Arşivde 18 iş, geçmiş yılların kampanyalarını gör." Tıklayınca arşiv o günün kelimeleriyle (Faz 3 varsa anlamsal) filtrelenir. Şerit kapatılabilir; kapatılan gün bir daha gösterilmez.
- Sol menüde "Takvim": ay görünümü, özel günler işaretli; bir güne tıklayınca o günle ilgili arşiv işleri ve (Faz 4 varsa) "Keşfet'te ara" butonu.
- Özel günden 45 gün önce, Faz 4 takip sistemi o günün kelimeleriyle bir kerelik otomatik toplama yapar (Faz 4 yoksa atla).

## Kabul ölçütleri

1. Bir panodan tek tıkla sunum oluşuyor: kapak, panodaki işler, kapanış.
2. Arşiv kartından, detaydan, fikir kartından "Sunuma ekle" çalışıyor.
3. Slaytlar sürükle bırakla sıralanıyor, metinler yerinde düzenleniyor, değişiklikler kaydediliyor.
4. "Sun" tam ekran açılıyor; ok tuşları, Esc, videolar çalışıyor; ikinci ekranda sunucu görünümü.
5. PDF dışa aktarma 16:9 sayfalar üretiyor, Türkçe karakterler doğru.
6. Arşiv ekranında yaklaşan özel gün şeridi doğru günü ve sayıyı gösteriyor; tıklayınca filtre çalışıyor.
7. Takvim ekranında 2027 Ramazan Bayramı doğru tarihte işaretli.
