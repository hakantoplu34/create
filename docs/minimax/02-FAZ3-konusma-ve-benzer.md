# Faz 3 — Konuşma metni, anlamsal arama ve benzerini bul

Önce `00-GENEL.md`'yi oku. Faz 2 bitmiş olmalı.

## Amaç

1. Videolardaki konuşma ve dış ses yazıya dökülür, Türkçe değilse Türkçe çevirisi de tutulur.
2. Arama kelime eşleşmesine bağlı kalmaz: "aile sofrası" yazınca "pazar kahvaltısı" analizi olan iş de gelir.
3. Bir işin detayında "Benzerlerini bul" ile görsel olarak benzeyen işler listelenir.

## 1. Konuşma metni

`src/transcribe.js`.

- ffmpeg ile videodan ses: `-vn -ac 1 -ar 16000 -b:a 32k` mp3, en fazla 10 dakika.
- Sağlayıcı: OpenAI uyumlu ses yazıya dökme uç noktası (`POST {taban}/audio/transcriptions`, `multipart/form-data`, alanlar `file`, `model`, `response_format=verbose_json`). Taban adres, model ve anahtar Ayarlar'dan. Ücretsiz kotası olan Groq (`https://api.groq.com/openai/v1`, model `whisper-large-v3`) varsayılan öneri olarak Ayarlar'da açıklamada yazsın; OpenAI (`whisper-1`) da aynı arayüzle çalışır.
- Yanıttaki `language` Türkçe değilse metin Faz 2'deki `ai.chat` ile Türkçeye çevrilir (hızlı model).
- Kayıt: `item.transcript = { text, language, translation, segments: [{start, end, text}] }`.
- Ses yazıya dökme anahtarı girilmemişse bu adım atlanır, hata sayılmaz.
- Analiz sırası: önce konuşma metni, sonra Faz 2 analizi (konuşma metni analiz isteğine metin olarak eklenir; içgörü kalitesini çok artırır).

Detayda "Konuşma" sekmesi: segmentler zaman damgasıyla; tıklayınca video o saniyeye gider. Çeviri varsa "Orijinal / Türkçe" geçişi.

## 2. Yerel vektörler (ücretsiz, çevrimdışı)

Native modül kullanma (bkz. genel kurallar). `@huggingface/transformers` paketini **WASM arka ucuyla** gizli bir pencerede ya da Web Worker'da çalıştır.

- Metin modeli: `Xenova/multilingual-e5-small` (Türkçe destekli). Girdi biçimi: belgeler için `"passage: " + metin`, aramalar için `"query: " + metin`.
- Görsel modeli: `Xenova/clip-vit-base-patch32`, sadece görsel vektörü (kapak resmi ya da videonun ortadaki karesi).
- Modeller ilk kullanımda indirilir ve `userData/modeller` altında saklanır; indirme sırasında Ayarlar'da ve ilk aramada ilerleme gösterilir. İnternet yoksa anlamsal arama sessizce kelime aramasına düşer.
- Vektörler `store` JSON'una değil, ayrı bir ikili dosyaya yazılır: `arsiv/vektorler.bin` + `vektorler.json` (id → satır). Float32, normalize edilmiş. Birkaç bin kayıt için bellekte tam tarama (kosinüs) yeterli; veritabanı ekleme.
- Belge metni: başlık + not + etiketler + analiz (içgörü, fikir, neden işliyor, etiketler, teknik, ton, sektör, marka) + konuşma metninin Türkçesi (ilk 1000 karakter).
- Vektörler analiz ya da kullanıcı düzenlemesi sonrası güncellenir.

## 3. Arama

- Arama kutusu: önce kelime eşleşmesi (Faz 2), sonra anlamsal sonuçlar. Sonuç listesi tek ızgarada; kelime eşleşmeleri üstte. 0,80 altı benzerlikteki anlamsal sonuçlar gösterilmez (eşiği deneyerek ayarla, ayar olarak tut).
- Arama kutusunun altında küçük not: "Anlamca yakın işler de gösteriliyor" (sadece anlamsal sonuç varsa).

## 4. Benzerlerini bul

- Detayda "Benzerlerini bul" (ghost) butonu: CLIP görsel vektörüyle en yakın 30 işi arşivde "Benzerleri: <başlık>" başlıklı ızgarada açar. Üstte "Arşive dön".
- Kartın sağ tık menüsünde de aynı seçenek.

## Kabul ölçütleri

1. İngilizce bir reklam filmi kaydedilince detayda İngilizce konuşma metni ve Türkçe çevirisi, zaman damgalarıyla görünüyor; satıra tıklayınca video o ana atlıyor.
2. Ses anahtarı yokken videolar yine kaydediliyor ve analiz ediliyor.
3. "aile sofrası" araması, analizinde bu kelimeler geçmeyen ama anlamca yakın işleri de getiriyor.
4. "Benzerlerini bul" kırmızı tonlu bir ambalaj için çoğunlukla benzer kompozisyon/renkteki işleri getiriyor.
5. Model indirme bir kez oluyor; uygulama yeniden açılınca tekrar indirmiyor.
6. 500 kayıtlık test arşivinde arama 300 ms altında sonuç veriyor (zamanı ölç, rapora yaz).
7. dmg derlemesi iki mimaride de geçiyor (native modül eklenmedi).
