# Faz 5 — Detay butonları, fikir yazarı ve jüri

Önce `00-GENEL.md`'yi oku. Faz 2 şart, Faz 3 ve 4 varsa daha iyi sonuç verir.

## Amaç

Detay penceresinde, işin altında tek tıkla çalışan butonlar:

1. **Neden işe yaradı**
2. **Rakipler**
3. **Markama uyarla**
4. **Storyboard**
5. **Jüri**

Bir de bağımsız **Fikir yazarı** ekranı: marka ve brief girilir, arşivden beslenerek fikir senaryoları yazılır.

Bu fazın asıl değeri metin kalitesi. Hakan'ın isteği: fikirler "yapay zekâ fikri" gibi değil, ödüllü bir reklam yazarının elinden çıkmış gibi olmalı. Aşağıdaki promptları olduğu gibi başlangıç olarak kullan, sonra gerçek çıktılara bakıp iyileştir.

## 1. Sonuçların saklanması

Her buton sonucu kayda yazılır: `item.insights = { nedenIsledi, rakipler, uyarlamalar: [], storyboardlar: [], juri: [] }`, her birinde `{ createdAt, model, girdi, cikti }`. Tekrar açınca yeniden üretmez, son sonucu gösterir; "Yeniden üret" ile yenisi eklenir, eskiler "Önceki sonuçlar" altında kalır.

## 2. Ortak yazım kuralları (her prompta eklenir)

```
Yazım kuralları:
- Türkçe yaz. Doğal, somut, konuşur gibi.
- Pazarlama sıfatı yok: "eşsiz", "muhteşem", "benzersiz", "nefes kesen", "unutulmaz" yasak.
- Uzun tire (—) kullanma. "Sadece X değil, aynı zamanda Y" kalıbını kullanma. Üç sıfatı arka arkaya dizme.
- Emoji kullanma.
- Klişe açılış yok ("Günümüzün hızlı dünyasında", "Hepimiz biliyoruz ki").
- Genel laf etme; her cümle bu işe, bu markaya özel olsun.
```

## 3. Butonlar

### Neden işe yaradı
Girdi: Faz 2 analizi, konuşma metni (varsa), kareler. Çıktı: 4 kısa bölüm: İçgörü, Fikir, Uygulama (görsel/yazı/kurgu kararları), Dersler (bu işten ajansın başka işlerine taşınabilecek 2-3 somut ders).

Sistem promptu:
```
Sen Cannes Lions ve D&AD jürilerinde bulunmuş bir kreatif direktörsün. Genç bir ekibe bu işin neden çalıştığını anlatıyorsun. Teori anlatma; bu işteki somut kararları göster: hangi içgörüden yola çıkılmış, fikir nasıl tek cümleye sığıyor, görsel/metin/kurgu hangi tercihlerle fikri güçlendiriyor. Sonunda ekibin başka markalarda kullanabileceği 2-3 somut ders yaz.
```

### Rakipler
- Aynı sektördeki ve aynı tekniği kullanan arşiv işlerini listeler (Faz 3 varsa anlamsal, yoksa sektör + teknik eşleşmesi).
- Faz 4 varsa "Bu sektörde şimdi ara" butonu Keşfet'i sektör + marka kelimeleriyle açar.
- Yapay zekâ özeti: "Bu sektörde herkes şunu yapıyor, boşluk şurada" (en fazla 6 cümle). Girdi: listelenen en fazla 15 işin analiz özetleri.

### Markama uyarla
Küçük form: marka adı, sektör, kısa brief (isteğe bağlı), kanal (film, basılı, sosyal video, outdoor, ambalaj). Çıktı: bu işin **tekniğini ve içgörü yapısını** alıp markaya uyarlayan 3 farklı yönde fikir. Her fikir: başlık, içgörü (1 cümle), fikir (1-2 cümle), uygulama (kanala göre 3-5 cümle; film ise sahne sahne kısa akış), neden bu marka için doğru.

Sistem promptu:
```
Sen ödüllü bir reklam yazarısın. Sana başka bir markanın iyi bir işini ve kendi markamızı veriyorum. Görevin işi kopyalamak değil; o işin dayandığı düşünme biçimini (içgörü yapısı, teknik, ton) alıp bizim markamızın kendi gerçeğinden yeni fikirler çıkarmak.

Üç fikir yaz, üçü birbirinden gerçekten farklı yönde olsun: biri güvenli ve hemen yapılabilir, biri cesur, biri beklenmedik.
Her fikir şu sınavı geçsin: marka adını çıkarınca başka bir markaya da uyuyorsa fikri at, yenisini yaz.
Kaynak işin sahnelerini, sloganını, karakterlerini tekrar etme. Okuyan "bunu daha önce gördüm" dememeli.
```
Ek kontrol: Üretilen her fikrin metni Faz 3 vektörleriyle arşive karşı kontrol edilir; 0,90 üstü benzerlik varsa fikrin altında "Arşivdeki şu işe çok yakın" uyarısı ve o işin bağlantısı.

### Storyboard
- Seçili bir uyarlama fikrinden (ya da işin kendisinden) 6 kareli storyboard metni: her kare için çekim tipi, görüntü, ses/dış ses, süre.
- Görsel üretim isteğe bağlı: Ayarlar'da görsel üretim sağlayıcısı (Magnific API) anahtarı varsa her kare için "Kareyi çiz" butonu. Stil: kaba kalem eskiz, siyah beyaz, 16:9. Anahtar yoksa sadece metin storyboard.
- Storyboard görselleri arşivde değil, kaydın `insights` alanında ve uygulama veri klasöründe tutulur.

### Jüri
Dört jüri üyesi, her biri ayrı çağrı (paralel değil, sırayla, kuyrukta). Değerlendirilen: işin kendisi ya da seçili bir uyarlama fikri.

Her üye: 1-10 puan, 3-4 cümle yorum, en güçlü yan (1 cümle), en zayıf yan (1 cümle), "şunu değiştirirsem puanım artar" (1 cümle). JSON döner.

En sonda ortak özet çağrısı: dört değerlendirmeyi alır, ortalama puan, ortaklaştıkları nokta, ayrıştıkları nokta, bir sonraki adım önerisi.

Ayrıca: arşivde 0,90 üstü benzer iş varsa jüri çağrısına "Bu işe benzeyen şunlar daha önce yapılmış: …" bilgisi eklenir ve kreatif direktör bunu yorumunda dikkate alır.

Kişilik promptları:

**Sert kreatif direktör**
```
Sen 25 yıllık, ödül törenlerinden bıkmış, sert ama adil bir kreatif direktörsün. Bir fikri ancak gerçekten yeni ve cesursa beğenirsin. Klişe gördüğünde bunu açıkça söylersin. Özgünlük, cesaret ve fikrin tek cümleye sığıp sığmadığına bakarsın. Kibar olmak için puanı şişirme.
```

**Marka müdürü**
```
Sen büyük bir Türk markasında pazarlama müdürüsün. Bütçeyi sen savunuyorsun. Fikrin brief'e uyup uymadığına, markayı doğru gösterip göstermediğine, satışa ve hedefe katkısına, risklerine (yanlış anlaşılma, kriz ihtimali, uygulama maliyeti) bakarsın. Yaratıcılığa saygın var ama işin sonunda rakama bakıyorsun.
```

**Sıradan tüketici**
```
Sen İstanbul'da yaşayan, reklamcılıkla ilgisi olmayan 30'lu yaşlarda birisin. Telefonda gezinirken bu işi gördün. Uzman dili kullanma. İlk üç saniyede ne anladığını, durup bakıp bakmadığını, aklında ne kaldığını, birine gönderip göndermeyeceğini söyle. Sıkıldıysan sıkıldığını söyle.
```

**Tasarımcı**
```
Sen ambalaj, afiş ve dijital ekranlar için çalışan kıdemli bir grafik tasarımcısın. Kompozisyon, hiyerarşi, tipografi, renk ve fikrin görsel olarak nasıl taşınacağına bakarsın. Fikir bir ambalaja, bir billboard'a ve bir telefon ekranına dönüştüğünde nasıl duracağını değerlendir. Görsel akılda kalıcılığı puanla.
```

## 4. Fikir yazarı ekranı

Sol menüde "Fikir yazarı".

- Form: marka, sektör, brief (çok satır), kanal(lar), ton tercihi (Faz 2 ton listesi), "kaçınılacaklar" (serbest metin, ör. "ünlü kullanma").
- "İlham işlerini seç": Faz 3 varsa brief'e anlamca en yakın 12 iş otomatik önerilir; kullanıcı ekler/çıkarır. Yoksa pano seçimi.
- "Fikirleri yaz" (primary): 5 fikir. Sistem promptu "Markama uyarla" promptunun genişletilmiş hali: önce brief'ten 3 farklı içgörü çıkar (göster), sonra her içgörüden fikir üret, 5 tanesini seç.
- Her fikir kartında: "Jüriye sor", "Storyboard", "Panoya ekle" (fikir kartı panoya metin kartı olarak eklenir: arşivde `type: 'fikir'` kayıtları, masonry'de metin kartı olarak görünür, Drive'a yüklenmez).
- Fikirleri beğen / beğenme işaretleri tutulur. Bir sonraki üretimde son 20 beğenilen ve beğenilmeyen fikrin başlığı "Bu ajansın zevki" olarak prompta eklenir.

## Kabul ölçütleri

1. Detayda beş buton çalışıyor; sonuçlar kayıtta saklanıyor, tekrar açınca beklemeden görünüyor.
2. "Markama uyarla" çıktısında üç fikir birbirinden belirgin farklı; hiçbiri kaynak işin sloganını veya sahnelerini tekrar etmiyor.
3. Jüri dört ayrı kişilikle, birbirinden farklı tonda yorum yapıyor; ortak özet ve ortalama puan var.
4. Arşivde çok benzer iş varsa uyarı çıkıyor.
5. Görsel üretim anahtarı yokken storyboard metin olarak çalışıyor; varsa kareler çiziliyor.
6. Fikir yazarı brief'ten içgörüleri gösterip 5 fikir yazıyor; fikir panoya eklenince arşivde metin kartı olarak görünüyor.
7. Üretilen metinlerde uzun tire, "eşsiz/muhteşem" gibi yasak kelimeler yok (bir son kontrol fonksiyonu yasak listeyi tarar, bulursa o fikri bir kez yeniden yazdırır).
8. Her yapay zekâ çağrısı Ayarlar'daki kullanım sayacına yansıyor.
