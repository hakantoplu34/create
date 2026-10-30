# Faz 4 — Keşfet (keyword ile toplama), takip listeleri ve Trendler

Önce `00-GENEL.md`'yi oku. Faz 2 bitmiş olmalı (Faz 3 şart değil).

## Amaç

Kullanıcı bir keyword yazar ("zeytin", "burger reels"), uygulama giriş yapılmış hesaplarla ve resmi API'lerle platformlarda arar, sonuçları tek bir masonry ızgarada gösterir. Kullanıcı beğendiklerini arşive kaydeder. Dijital işler izlenme ve yükselme hızına göre sıralanır.

**Önemli:** Toplanan sonuçlar otomatik olarak arşive girmez. Arşiv seçilmiş işlerden oluşur. Sonuçlar ayrı bir "Keşfet" ekranında durur; kaydetmek bir tık.

## 1. Keşfet ekranı

Sol menüde Arşiv'in altına "Keşfet".

- Üstte keyword kutusu ve platform seçimi (çoklu): Pinterest, Instagram, TikTok, YouTube, Behance, Meta Reklam Kütüphanesi, TikTok Creative Center. Varsayılan: giriş yapılmış hesaplar + girişsiz kaynaklar.
- "Ara" (primary). Arama sürerken platform başına durum satırı: "Pinterest: 24 sonuç", "Instagram: aranıyor", "TikTok: giriş gerekli".
- Sonuçlar masonry ızgarada. Kartta: kapak, platform, izlenme/beğeni (varsa), yayın tarihi (varsa). Üstüne gelince "Arşive kaydet" ve "Panoya kaydet" (pano seçimi).
- Sıralama: "En alakalı" | "En çok izlenen" | "Yükselen" (trend puanı).
- "Bu aramayı takip et": keyword takip listesine eklenir (bkz. 3).
- Son 20 arama ve sonuçları yerelde saklanır (`arsiv/kesfet/<id>.json`); "Son aramalar" listesinden tekrar açılır, yeniden aranmadan.

## 2. Toplayıcılar

Her platform ayrı dosya: `src/collectors/<platform>.js`. Ortak arayüz:

```js
module.exports = {
  id: 'pinterest',
  needsLogin: true,
  searchUrl: (q) => 'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(q),
  // Sayfada çalışır (executeJavaScript), sonuç dizisi döndürür:
  extract: `(() => [...document.querySelectorAll('...')].map(el => ({ ... })))()`,
  maxScrolls: 4,
};
```

Sonuç biçimi: `{ platform, kind: 'gorsel'|'video', src, poster, pageUrl, title, views, likes, comments, publishedAt, width, height, author }`. Bilinmeyen alan `null`.

### Çalıştırma
- `src/collect.js`, görünmez bir `BrowserWindow` (show: false) içinde ilgili `persist:<platform>` oturumuyla sayfayı açar. Görünmez pencere de `webview-preload.js` gibi güvenlik ayarlarıyla açılır (nodeIntegration yok, sandbox açık).
- Sayfa yüklenince 2–4 sn bekle, `extract` çalıştır, `maxScrolls` kadar insan hızında kaydır (her kaydırma arası 2–5 sn rastgele), her kaydırmada yeniden topla, `pageUrl`'e göre tekilleştir.
- Platformlar sırayla çalışır, paralel değil.
- Giriş sayfasına yönlenirse ya da sayfada doğrulama (captcha, "unusual activity", "challenge") belirtisi varsa: o platformu durdur, durum satırına "Giriş gerekli" ya da "Platform doğrulama istedi, bir süre bekle" yaz. Asla doğrulamayı geçmeye çalışma.
- Platform başına saatlik toplama sınırı ayar olarak (varsayılan 10 arama). Sınır dolunca durum satırı söyler.

### Resmi API'ler (tercih edilir, varsa)
- **YouTube:** YouTube Data API v3 anahtarı Ayarlar'dan (ücretsiz kota). `search.list` (type=video, q, regionCode=TR, relevanceLanguage=tr, maxResults=25) + `videos.list` (statistics, contentDetails). Anahtar yoksa gömülü sayfa toplayıcısına düşer.
- **Meta Reklam Kütüphanesi:** Resmi API kimlik doğrulaması istediği için bu fazda girişsiz sayfa toplayıcısı (`https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=TR&q=...`).
- **TikTok Creative Center:** Girişsiz sayfa toplayıcısı (Top Ads, keyword filtresi).

### Seçiciler kırılgandır
Platformlar HTML'lerini sık değiştirir. Bu yüzden:
- Seçicileri `data-testid`, `aria-label`, bağlantı kalıpları (`/pin/`, `/reel/`, `/video/`) gibi kararlı işaretlere dayandır; sınıf adlarına dayandırma.
- `npm run collector-test -- pinterest zeytin` komutu: toplayıcıyı görünür pencerede çalıştırıp ilk 5 sonucu konsola yazar. README'ye ekle.
- Bir toplayıcı 0 sonuç dönerse kullanıcıya "Pinterest sonuçları okunamadı, platform sayfası değişmiş olabilir" de; diğerleri devam etsin.

## 3. Takip listeleri ve Trendler

- Ayarlar'da değil, Keşfet ekranında "Takip" sekmesi: takip edilen keyword'ler ve hesaplar (ör. bir markanın Instagram hesabı, bir ajansın Behance profili).
- Uygulama açıkken günde bir kez (son çalışmadan 24 saat geçtiyse, açılıştan 10 dk sonra) her takip için toplama çalışır; yeni sonuçlar "Yeni" işaretiyle saklanır. Sol menüde Keşfet'in yanında yeni sonuç sayısı.
- **Trendler** sekmesi: son 30 günde toplanan tüm dijital sonuçlar (video) tek ızgarada, trend puanına göre. Trend puanı = `izlenme / max(1, yayından bu yana gün)`; izlenme yoksa `beğeni * 20`. Sektör/keyword filtresi.

## 4. Arşive kaydetme
"Arşive kaydet" mevcut kaydetme hattını (`media.save`) kullanır, `partition` olarak platformun oturumunu verir. Sonucun izlenme/beğeni/yayın tarihi kayda `metrics` alanı olarak taşınır ve detayda görünür.

## Kabul ölçütleri

1. "zeytin" araması Pinterest, Behance ve YouTube'dan sonuçları tek ızgarada, platform etiketleriyle getiriyor.
2. Giriş yapılmamış platform "Giriş gerekli" diyor ve Hesaplar ekranına götüren bir bağlantı veriyor; arama diğer platformlarla devam ediyor.
3. Bir sonucu "Arşive kaydet" deyince arşivde görünüyor, Drive'a yükleniyor, Faz 2 analizi çalışıyor; izlenme sayısı detayda görünüyor.
4. "En çok izlenen" ve "Yükselen" sıralamaları doğru çalışıyor.
5. Takip edilen bir keyword ertesi gün otomatik toplanıyor, yeni sonuç sayısı menüde görünüyor.
6. Saatlik sınır dolunca toplama duruyor ve bunu söylüyor.
7. `npm run collector-test` her toplayıcı için çalışıyor.
8. Gömülü pencereler ekranda görünmüyor, işlemciyi sürekli meşgul etmiyor; toplama bitince kapanıyor.
