# Faz 2 — Türkçe yapay zekâ analizi ve otomatik etiketleme

Önce `00-GENEL.md`'yi oku.

## Amaç

Arşive kaydedilen her iş, kaydedildikten sonra arka planda yapay zekâyla incelenir ve Türkçe olarak etiketlenir. Kullanıcı bir işi açtığında içgörüyü, kullanılan kreatif tekniği, sektörü ve tonu görür; arama bu alanlarda da çalışır.

## 1. Ortak altyapı

### `src/secrets.js`
`drive.js` içindeki şifreli saklama yöntemlerini buraya taşı: `setSecret(store, key, value)`, `getSecret(store, key)`, `hasSecret(store, key)`. `drive.js` bunu kullansın. Davranış değişmesin (mevcut kullanıcının Drive bağlantısı kopmamalı: aynı ayar anahtarları, aynı `enc:`/`raw:` biçimi).

### `src/ai.js`
Tek giriş noktası. Sağlayıcıdan bağımsız arayüz:

```js
ai.chat({ system, messages, images, maxTokens, json })  // -> { text, usage }
```

- `images`: `{ mime, base64 }` dizisi.
- `json: true` ise yanıtın geçerli JSON olması beklenir; değilse bir kez "Sadece geçerli JSON döndür" ekiyle tekrar dene, yine olmazsa hata.
- Sağlayıcılar:
  - **Claude (varsayılan):** Anthropic Messages API, `https://api.anthropic.com/v1/messages`, başlıklar `x-api-key`, `anthropic-version: 2023-06-01`. Varsayılan model `claude-sonnet-5-5`, hızlı işler için `claude-haiku-5-5`. Görsel `{"type":"image","source":{"type":"base64","media_type":...,"data":...}}`.
  - **MiniMax:** OpenAI uyumlu chat completions uç noktası. Taban adres ve model adı Ayarlar'dan girilir (koda sabit model adı yazma).
- Model adları ve taban adresler Ayarlar'da değiştirilebilir; koddaki değerler yalnızca varsayılan.
- Kuyruk: aynı anda en fazla 2 istek. 429 ve 5xx'te üstel bekleme ile en fazla 3 deneme.
- Kullanım sayacı: her çağrının giriş/çıkış token sayısı `store` ayarlarında aylık toplam olarak tutulur (`aiUsage: { '2026-11': { input, output, calls } }`). Ayarlar'da gösterilir.
- Hata metinleri Türkçe ve çözümü söyler: "Claude API anahtarı geçersiz. Ayarlar > Yapay zekâ bölümünden kontrol et."

### Ayarlar ekranı: "Yapay zekâ" bölümü
- Sağlayıcı seçimi (Claude / MiniMax).
- API anahtarı (şifre alanı, kaydedilince temizlenir, "Kayıtlı" durumu görünür).
- Model adı (analiz), model adı (hızlı işler), MiniMax için taban adres.
- "Bağlantıyı dene" butonu: kısa bir istek atar, sonucu yazar.
- Otomatik analiz anahtarı: Açık / Kapalı (varsayılan açık).
- Bu ay: çağrı sayısı ve token toplamı.

## 2. Analiz hattı

`src/analyze.js`. `media.js` bir kaydı `tamam` durumuna getirdiğinde, otomatik analiz açıksa kuyruğa ekler. Uygulama açılışında `analysis` alanı olmayan ve `tamam` durumdaki kayıtlar da kuyruğa girer (ama sessizce, saatte en fazla 60).

### Girdi hazırlama
- **Görsel:** Önbellekteki ya da Drive'dan çekilen tam dosya, en uzun kenarı 1568 px olacak şekilde `nativeImage` ile küçültülür, JPEG.
- **Video:** ffmpeg ile videonun süresine yayılmış 6 kare (`-vf fps=...` ya da süreyi ölçüp `-ss` ile tek tek), her biri en uzun kenar 768 px. Videonun dosyası önbellekte yoksa Drive'dan geçici indir, iş bitince sil.
- Kaydın başlığı, notu, platformu ve sayfa adresi metin olarak eklenir.

### Çıktı (JSON)
```json
{
  "baslik_onerisi": "kısa Türkçe başlık",
  "tur": "film | basili_ilan | ambalaj | outdoor | dijital_banner | sosyal_video | logo_kimlik | diger",
  "marka": "görünüyorsa marka adı, yoksa boş",
  "sektor": "gıda | içecek | otomotiv | finans | teknoloji | moda | kozmetik | perakende | turizm | sağlık | kamu | spor | eğitim | diğer",
  "icgoru": "Bu işin dayandığı tüketici gerçeği, 1-2 cümle",
  "fikir": "Fikrin kendisi, 1-2 cümle",
  "teknik": ["mizah", "abartı", "ters köşe", "duygusal hikâye", "gerçek insan", "ürün kahraman", "karşılaştırma", "metafor", "tipografi", "minimal", "kullanıcı içeriği", "ünlü", "müzik", "seri"],
  "ton": ["sıcak", "esprili", "cesur", "sakin", "nostaljik", "lüks", "samimi", "ciddi"],
  "renkler": ["#RRGGBB", "#RRGGBB", "#RRGGBB"],
  "neden_isliyor": "Neden etkili olduğunu bir kreatif direktörün gözüyle 2-3 cümle",
  "etiketler": ["serbest", "Türkçe", "etiketler", "en fazla 8"],
  "metin": "Görselde/karelerde okunan yazılar, olduğu dilde"
}
```
`teknik` ve `ton` sadece listedeki değerlerden seçilir (en fazla 3'er). Liste `analyze.js` içinde sabit; arayüz filtreleri de aynı listeyi kullanır.

### Sistem promptu (olduğu gibi kullan, sonra iyileştir)

```
Sen ödüllü işlere jürilik yapmış kıdemli bir reklam kreatif direktörüsün. Sana bir reklam işinin görselini ya da videodan kareleri veriyorum. Görevin bu işi bir ajansın ilham arşivi için çözümlemek.

Kurallar:
- Tüm metinler Türkçe. Marka adları ve görseldeki yazılar olduğu gibi kalır.
- Görmediğin şeyi uydurma. Emin değilsen alanı boş bırak.
- İçgörü, ürün özelliği değildir; tüketicinin hayatından bir gerçektir.
- Kısa ve somut yaz. Pazarlama sıfatı kullanma ("eşsiz", "muhteşem", "nefes kesen"). Uzun tire kullanma.
- Sadece istenen JSON'u döndür.
```

### Kayıt
`item.analysis = { ...json, model, createdAt }`, `item.analysisStatus = 'bekliyor' | 'calisiyor' | 'tamam' | 'hata'`, `item.analysisError`. Kullanıcı başlık girmemişse `title = baslik_onerisi`. `etiketler` kullanıcının kendi `tags` alanına karışmaz; ayrı tutulur ve arayüzde farklı görünür.

## 3. Arayüz

### Kart
- Analiz sürerken kartın altında küçük "Analiz ediliyor" durumu (mevcut durum kutusu stili).

### Detay penceresi
Sağ panelde, başlığın altına "Analiz" bölümü:
- İçgörü, fikir, neden işliyor: düz metin paragrafları.
- Teknik ve ton: küçük etiketler (chip). Tıklayınca arşiv o teknik/tonla filtrelenir.
- Sektör ve tür: meta listesine.
- Renkler: 3 küçük renk kutusu, üstüne gelince HEX.
- "Yeniden analiz et" butonu (ghost).
- Analiz yoksa: "Bu iş henüz analiz edilmedi." + "Analiz et" butonu.

### Arşiv filtreleri
Mevcut tür/platform filtresine ek olarak "Sektör", "Teknik", "Ton" seçimleri. Arama kutusu `analysis` alanlarının hepsinde (içgörü, fikir, etiketler, metin, marka) de arar, Türkçe küçük harf karşılaştırmasıyla.

## Kabul ölçütleri

1. Ayarlar'dan Claude anahtarı girilip "Bağlantıyı dene" başarılı oluyor; anahtar diske düz yazılmıyor (ilham.json'da `enc:` ile başlıyor).
2. Yeni kaydedilen bir görsel, birkaç saniye içinde analiz ediliyor; detayda içgörü, teknik, ton, renkler Türkçe görünüyor.
3. Bir video kaydı 6 kareyle analiz ediliyor; geçici dosyalar sonra siliniyor.
4. Arama kutusuna analizdeki bir kelime (ör. "nostalji") yazınca ilgili işler geliyor; "Teknik: mizah" filtresi çalışıyor.
5. API anahtarı yanlışsa kayıt "Analiz edilemedi" durumuna geçiyor, detayda çözümü söyleyen mesaj ve "Tekrar dene" var; uygulama çökmüyor, kuyruk sonraki işe geçiyor.
6. Otomatik analiz kapatılınca yeni kayıtlar analiz edilmiyor, detayda "Analiz et" butonu çalışıyor.
7. Ayarlar'da bu ayın çağrı ve token sayısı görünüyor.
8. Faz 1 özellikleri (kaydetme, Drive, panolar, sürükle bırak) aynen çalışıyor; eski arşiv dosyası sorunsuz açılıyor.
