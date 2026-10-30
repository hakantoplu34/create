# İlham — Geliştirici için genel kurallar

Bu dosyayı her fazdan önce oku. Faz dosyaları (01, 02, …) sadece o fazın işini anlatır; buradaki kurallar hepsi için geçerli.

## Ürün

İlham, Kısayol ajansının çalışanları için reklam ilham arşivi. Masaüstü uygulaması (Electron), Mac için dmg olarak dağıtılıyor. Müşterilere açık değil.

Faz 1'de olanlar (çalışıyor, bozma):
- Platform hesaplarına uygulama içi tarayıcıdan giriş (Instagram, Pinterest, TikTok, YouTube, Behance, LinkedIn). Her platform ayrı kalıcı oturum: `persist:<platform>`. Arşiv siteleri `persist:genel`.
- Gömülü sayfalarda "Arşive kaydet" butonu, "Sayfayı kaydet".
- Kaydetme hattı: indir (görsel doğrudan, video yt-dlp + oturum çerezleri), SHA-256 ile tekrar kontrolü, kapak (nativeImage, ffmpeg), Google Drive'a yükleme.
- Google Drive ana depo; `ilham://medya/<id>` protokolü Drive'dan Range isteğiyle akış yapar.
- Masonry arşiv, arama, filtre, panolar (sürükle bırak), detay penceresi.

## Kod yapısı

```
src/main.js             Pencere, ilham:// protokolü, IPC kayıtları
src/store.js            Tek JSON dosyası (items, boards, settings). Tüm veri erişimi buradan.
src/drive.js            Google OAuth (loopback + PKCE), yükleme, akış
src/media.js            Kaydetme kuyruğu, araç bulma (findBin), kapak
src/platforms.js        Hesaplar ve kaynaklar
src/preload.js          window.ilham API'si (contextBridge)
src/webview-preload.js  Gömülü sayfalara enjekte edilen buton
src/renderer/           index.html, styles.css, app.js (çerçevesiz)
.github/workflows/      Mac dmg derleme + açılış testi
```

## Değişmez kurallar

1. **Çerçeve ekleme.** React, Vue, Tailwind, jQuery yok. Arayüz düz HTML + CSS + JS, `app.js` içindeki `h()` yardımcısıyla. Yeni ekran büyükse `src/renderer/` altında ayrı bir `.js` dosyası aç ve `index.html`'e ekle.
2. **Electron güvenliği.** Ana pencerede `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` kalır. Arayüz Node'a sadece `preload.js` üzerinden erişir. Yeni bir yetenek gerekiyorsa `ipcMain.handle` + `preload.js`'e bir satır ekle. Gömülü sayfa ayarlarına (`will-attach-webview`) dokunma.
3. **Anahtarlar koda yazılmaz.** Her API anahtarı Ayarlar ekranından girilir, `safeStorage` ile şifrelenip `store` ayarlarına yazılır (`drive.js` içindeki `_setSecret/_getSecret` yöntemini ortak bir `secrets.js` dosyasına taşıyıp kullan). Anahtar loglara, hata mesajlarına, arayüze düz yazıyla düşmez.
4. **Native modül ekleme.** Mimari başına derleme gerektiren paket (better-sqlite3, sharp, onnxruntime-node vb.) kullanma; dmg iki mimari için tek makinede derleniyor. WASM veya saf JS seçeneklerini kullan. Gerçekten şartsa önce sor.
5. **Veri modeli geriye uyumlu.** `store.js` JSON'una alan eklerken eski kayıtlarda o alan yok say; `version` alanını artır ve `_load` içinde basit bir taşıma (migration) yaz. Kullanıcının mevcut arşivi asla bozulmamalı.
6. **Yapay zekâ çağrıları kuyrukta.** Hepsi `src/ai.js` (Faz 2'de açılacak) üzerinden, sırayla, iptal edilebilir, maliyet sayacıyla. Arayüzde her uzun iş için durum gösterilir.
7. **Platformlara saygı.** Gömülü tarayıcıda otomatik gezinme yapılan her yerde insan hızı: istekler arası 2–6 sn rastgele bekleme, platform başına saatlik üst sınır (ayar), doğrulama/uyarı sayfası görülürse o platformda durup kullanıcıya bildir.
8. **Telif.** Arşiv ajans içi ilham içindir. Uygulama hiçbir içeriği dışarı yayınlamaz, paylaşım linki üretmez.

## Arayüz kuralları (Kısayol tasarım dili)

- Renkler `styles.css` başındaki değişkenlerden: turuncu `#EE3525`, füme `#2B2E33`, gri `#6A727A`, zemin `#F5F5F3`. Yeni renk gerekiyorsa değişken olarak ekle.
- Bir ekranda en fazla bir turuncu (primary) buton. Diğerleri `ghost`.
- Boş durum "Veri yok" demez; ne yapılacağını söyler ve butonunu koyar.
- Geri alınabilen işlemde onay penceresi yerine bildirimde "Geri al". Silme gibi geri dönmeyenlerde `confirm()`.
- Hareket sadece kullanıcının yaptığı şeyin sonucu için; `prefers-reduced-motion` korunur.
- Klavye ile gezilebilir, odak halkası görünür, form alanlarının etiketi var.

## Türkçe metin kuralları

- "Sen" dili, sade ve somut. Buton ne yapıyorsa onu söyler: "Analiz et", "Panoya ekle", "Fikri yaz".
- Hata mesajı ne olduğunu ve nasıl düzeleceğini söyler, özür dilemez.
- Yasak: uzun tire (—), "eşsiz", "nefes kesen", "mükemmel deneyim" gibi pazarlama sıfatları, "sadece X değil aynı zamanda Y", üçlü sıfat dizileri, butonda "→".
- Tarih `22 Ekim 2026`, para `15.000 TL`.
- Türkçe karakterler her yerde doğru. Küçük/büyük harf dönüşümü `toLocaleLowerCase('tr-TR')` / `toLocaleUpperCase('tr-TR')` ile; arama karşılaştırmaları da böyle.
- Yapay zekânın ürettiği metinler (analiz, fikir, jüri) de bu kurallara uyar; ilgili sistem promptlarında bu kurallar açıkça yazar.

## Çalıştırma ve test

```
npm install
npm start
```

- Ayrı veri klasörüyle dene: `ILHAM_DATA=/tmp/ilham-test npm start`
- Otomatik ekran görüntüsü: `ILHAM_SHOT=/tmp/a.png,/tmp/b.png ILHAM_SHOT_JS="0||document.querySelector('[data-view=ayarlar]').click()" npm start` (her görüntüden önce ilgili JS çalışır, sonra uygulama kapanır).
- `main` dalına her push'ta GitHub Actions (macos-14) iki dmg derler, arm64 dmg'yi kurup açar, üç ekran görüntüsü alır (Actions > çalıştırma > Artifacts > `acilis-testi`). Test geçmezse sürüm yayınlanmaz.

Her fazın sonunda:
1. `npm start` ile elle dene, faz dosyasındaki "Kabul ölçütleri"ni tek tek kontrol et.
2. Yeni ekranlar için `ILHAM_SHOT` ile ekran görüntüsü al ve kendin bak (1440 ve 1024 genişlik).
3. README'deki özellik listesini güncelle.
4. Faz için ayrı dal aç (`faz-2` gibi), commit'leri anlamlı ve Türkçe yaz. Pull request aç; derleme ve açılış testi PR'da da çalışır. Geçince `main`'e birleştir.

## Rapor

Her faz sonunda kısa bir rapor yaz (PR açıklaması olabilir):
- Hangi kabul ölçütleri tamam, hangileri değil ve neden
- Faz dosyasından nerede, neden saptın
- Eklediğin yeni ayar, dosya, bağımlılık
- Hakan'ın karar vermesi gereken noktalar
