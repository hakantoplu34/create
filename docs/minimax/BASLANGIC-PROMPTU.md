# MiniMax'a verilecek başlangıç mesajı

Aşağıdaki metni MiniMax'a olduğu gibi yapıştır. Her yeni faz için sadece son satırdaki dosya adını değiştir.

---

GitHub'daki `hakantoplu34/create` deposunda "İlham" adlı bir Electron masaüstü uygulaması var. Kısayol ajansının reklam ilham arşivi. Faz 1 bitti ve çalışıyor; şimdi sıradaki fazı geliştireceksin.

Çalışma şekli:

1. Depoyu klonla. Önce `README.md`, sonra `docs/minimax/00-GENEL.md` dosyasını baştan sona oku. Oradaki kurallar her fazda geçerli, özellikle "Değişmez kurallar" bölümü.
2. Sonra bu fazın dosyasını oku. Kodlamaya başlamadan önce bana kısa bir plan yaz: hangi dosyaları değiştireceksin, hangi yeni dosyaları açacaksın, varsa sorularını sor. Ben onaylayınca başla.
3. `faz-N` adında bir dal aç. Küçük, anlamlı, Türkçe commit'lerle ilerle.
4. Her önemli adımdan sonra `npm start` ile dene. Ekran değiştiyse `ILHAM_SHOT` ile ekran görüntüsü al ve kendin bak.
5. Faz dosyasındaki "Kabul ölçütleri"ni tek tek kontrol et. Tamamlanınca pull request aç; GitHub Actions dmg derlemesi ve açılış testi PR'da da çalışıyor, geçmesini bekle.
6. PR açıklamasına raporu yaz: tamamlanan ölçütler, sapmalar ve nedenleri, yeni ayarlar/dosyalar/bağımlılıklar, benim karar vermem gereken noktalar.

Önemli:
- Faz 1'deki özellikleri bozma: hesap girişleri, arşive kaydetme, Google Drive, panolar, sürükle bırak.
- Kullanıcının mevcut arşiv dosyası (`ilham.json`) yeni sürümde sorunsuz açılmalı.
- API anahtarlarını koda, commit'e, loglara yazma.
- React, Vue, Tailwind gibi çerçeve ve native (derleme gerektiren) npm paketi ekleme.
- Anlamadığın ya da faz dosyasıyla çelişen bir şey olursa tahmin etme, bana sor.

Bu fazın dosyası: `docs/minimax/01-FAZ2-analiz.md`
