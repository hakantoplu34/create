# İlham — Faz 1

Reklam ilham arşivi, masaüstü uygulaması (Electron). Bu sürümde:

- **Hesaplar:** Instagram, Pinterest, TikTok, YouTube, Behance, LinkedIn'e uygulama içinden bir kez giriş yapılır. Her platformun oturumu ayrı ve kalıcıdır, şifre uygulamaya kaydedilmez.
- **Gömülü tarayıcı:** Sekmeli tarayıcı. Görselin ya da videonun üstüne gelince köşede **Arşive kaydet** butonu çıkar. Üst çubuktaki **Sayfayı kaydet**, ekrandaki en büyük videoyu ya da görseli kaydeder. Adres çubuğuna kelime yazınca açık platformun kendi aramasında arar (Pinterest, TikTok, YouTube, Behance, Instagram etiketi).
- **Kaydetme hattı:** Görsel tam çözünürlükte, video yt-dlp ile oturum çerezleri kullanılarak indirilir. Aynı dosya ikinci kez gelirse tek kopya tutulur. Kapak resmi üretilir.
- **Google Drive:** Dosyalar Drive'daki "İlham Arşivi" klasörüne yüklenir; bilgisayarda kalıcı kopya tutulmaz. Videolar Drive'dan akışla, ileri sarılabilir şekilde oynar. Son açılanlar için ayarlanabilir önbellek var. Drive bağlı değilse dosyalar bilgisayardaki veri klasöründe durur.
- **Arşiv:** Pinterest tipi masonry ızgara, arama, tür ve platform filtresi. Videolar üzerine gelince sessiz oynar.
- **Panolar:** Sürükle bırak. İşi arşivden sol menüdeki panoya sürükle (eklenir). Pano içinden başka panoya sürükle (taşınır; Alt/Option basılıysa kopyalanır). Pano içinde sıralama, panoların kendi sırasını değiştirme, bilgisayardan dosya sürükleme.
- **Detay:** Başlık, not, etiket, pano üyelikleri, kaynağa gitme, silme.

## Kurulum (Mac, hazır dmg)

Her `main` güncellemesinde GitHub, Mac sunucusunda dmg'yi derleyip deponun **Releases** sayfasına koyar.

1. Deponun Releases sayfasından en son sürümü aç.
2. Apple Silicon (M1–M4) için `Ilham-…-arm64.dmg`, Intel Mac için `Ilham-…-x64.dmg` indir.
3. dmg'yi aç, İlham'ı Applications klasörüne sürükle.
4. İlk açılışta macOS "Açılmadı" uyarısı verir (Apple onaylı imza yok). **Bitti** de, **Sistem Ayarları > Gizlilik ve Güvenlik** sayfasının altında **Yine de Aç**'a bas, şifreni gir. Ya da Terminal'de: `xattr -cr /Applications/Ilham.app`. Sonraki açılışlarda normal çift tık yeter.

yt-dlp ve ffmpeg uygulamanın içinde gelir, ayrıca kurman gerekmez.

## Geliştirme için kaynak koddan çalıştırma

1. Node.js 20 veya üstü: https://nodejs.org
2. Video araçları (Terminal):
   ```
   brew install yt-dlp ffmpeg
   ```
3. Klasörde:
   ```
   npm install
   npm start
   ```
4. Kurulabilir uygulama (.dmg) için: `npm run dist:mac`. İmzasız olduğu için ilk açılışta sağ tık > Aç demen gerekir.

Windows'ta aynı adımlar; yt-dlp ve ffmpeg için `winget install yt-dlp.yt-dlp Gyan.FFmpeg`, paket için `npm run dist:win`.

## Google Drive bağlantısı (bir kez)

1. https://console.cloud.google.com adresinde yeni bir proje aç, adı "İlham" olabilir.
2. **APIs & Services > Library** bölümünde **Google Drive API**'yi etkinleştir.
3. **OAuth consent screen** (Google Auth Platform): uygulama türü **External**, durum **Testing**. **Test users** kısmına kendi Google hesabını (ve kullanacak çalışanların hesaplarını) ekle.
4. **Credentials > Create credentials > OAuth client ID**, tür olarak **Desktop app** seç.
5. Çıkan **Client ID** ve **Client secret** değerlerini uygulamada **Ayarlar > Google Drive** alanına yapıştır, **Anahtarları kaydet**, sonra **Google Drive'ı bağla**.
6. Tarayıcında Google izni açılır, onaylayınca uygulamaya dön.

Uygulama yalnızca `drive.file` iznini ister: sadece kendi oluşturduğu "İlham Arşivi" klasörünü ve içindeki dosyaları görür, Drive'ının geri kalanına erişmez. Anahtarlar ve oturum bilgisi işletim sisteminin şifreli deposuyla saklanır.

Not: "Testing" durumundaki Google uygulamalarında oturum 7 günde bir yenilenmek isteyebilir. Bunu önlemek için consent screen'i "In production" durumuna alabilirsin (kendi kullanımın için doğrulama gerekmez, sadece uyarı ekranı görünür).

## Hesap güvenliği

- Kaydetme işleri sırayla, aralarında rastgele bekleme ile yürür.
- Instagram ve Pinterest'te kişisel hesap yerine ajansın çalışma hesabını kullan.
- Bir platform doğrulama ya da uyarı ekranı gösterirse o hesapla bir süre ara ver.

## Bilinen sınırlar

- YouTube'a Google hesabıyla giriş, Google'ın gömülü tarayıcı kısıtı nedeniyle engellenebilir. YouTube aramaları ve video kaydetme girişsiz de çalışır.
- Behance için oturum durumu otomatik okunmuyor; sayfanın kendisinde görünür.
- Bazı platformlarda videolar sayfada parça parça yüklendiği için doğrudan alınamaz; bu durumda yt-dlp devreye girer. yt-dlp kurulu değilse video kaydı "Kaydedilemedi" olarak işaretlenir, kurduktan sonra detayda **Tekrar dene** ile kaydedilir.
- Bu sürümde yapay zekâ analizi, Türkçe etiketleme, trendler, jüri ve sunum ortamı yok; bunlar sonraki fazlarda.

## Dosya yapısı

```
src/
  main.js             Pencere, ilham:// akış protokolü, IPC
  store.js            Yerel veri (kayıtlar, panolar, ayarlar) — tek JSON dosyası
  drive.js            Google OAuth, klasör, yükleme, akış
  media.js            Kaydetme hattı: indir, tekrar kontrolü, kapak, yükleme
  platforms.js        Hesaplar ve arşiv kaynakları
  preload.js          Arayüze açılan API
  webview-preload.js  Gömülü sayfalardaki "Arşive kaydet" butonu
  renderer/           Arayüz (HTML, CSS, JS — çerçevesiz)
```

Veri klasörü: Mac'te `~/Library/Application Support/Ilham/arsiv`. Ayarlar > Veri klasörünü aç ile açılır.

## Geliştirme süreci

Sonraki fazlar `docs/minimax/` altındaki görev dosyalarıyla geliştiriliyor. Başlangıç: `docs/minimax/BASLANGIC-PROMPTU.md`. Her derlemede açılış testinin ekran görüntüleri `test-goruntuleri` dalına konur.

## Sonraki faz

1. Python işleme katmanı: sahne kareleri, konuşma metni (Whisper), CLIP ile benzer görsel arama.
2. Türkçe yapay zekâ analizi ve otomatik etiketleme; anlamsal arama.
3. Keyword ile toplu toplama (platform başına hız sınırlı) ve Trendler sekmesi.
4. Detay ekranı butonları, jüri modu, fikir yazarı, sunum ortamı, özel gün takvimi.
