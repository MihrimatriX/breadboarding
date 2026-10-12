# 8 bit hesap makinesi: fiziksel kurulum rehberi

Bu rehber hesap makinesini gerçek çiplerle kurmanın sırasını ve her aşamanın testini anlatır.
Hangi bacağın nereye gittiği iki belgeden birindedir; ikisi de aynı devreyi (aynı netlist, aynı net
adları) kurar, yalnız fiziksel yol farklıdır:

| Yol | Belge | Üretimi |
|---|---|---|
| **Breadboard** (tam devre, 60 board) | `hesap8-breadboard-kurulum.pdf`: board haritası, board board yerleşim çizimleri, delikten deliğe tel listesi T0001–T2784, kesim listesi, malzeme | `npm run hesap8 -- breadboard-belge -o <dizin>` |
| **PCB** (soketli kart) | `hesap-kurulum.pdf`: yerleşim haritası, pinden pine tel listesi (bip testi listesi), her çipin pin kartı; şema `hesap-sema.pdf` | `npm run cpu16 -- kurulum hesap -o <dizin>` |

Tasarımın açıklaması: [tasarim.md](tasarim.md). Uygulamada (Silikon3D → 8 bit hesap 3D) varsayılan
görünüm breadboard'dur; araç çubuğundaki **Görünüm** ile PCB'ye geçilir. **Kurulum** modu iki yolda
da teli 3D'de gösterir; breadboard'da numaralar breadboard belgesiyle aynıdır.

## Breadboard yolu: 60 board, 2.784 tel

`hesap8/breadboard/` devreyi tam boy breadboard'lara (BB830: 63 sütun, a–e / f–j şeritleri, üstte ve
altta ikişer ray) yerleştirir ve bütün telleri yönlendirir. Sonuç:

- **60 board, 5 sütun × 12 sıra**, taban plakası ≈ 860 × 710 mm. Arka kenarda göstergeler (soldan
  sağa A, B, sonuç, kalan), ön kenarda anahtarlar ve besleme; aradaki veri akışı önden arkaya:
  anahtarlar → toplama / çarpma / bölme → sonuç seçici → onluğa çevirme → 74HC4511 → göstergeler.
  Board başına en çok 5 çip. 57 board'da parça var; BB52, BB53 ve BB60 yalnız rayları ve yanlarından
  geçen tellerin ara şeritlerini taşır (taban dikdörtgen kalsın, teller board'ların üstünde yatsın diye).
- **Her çip kanalın üstünde**, her bacağın şeridinde 4 boş delik; 100 nF'ı üst ray çiftinin
  arasında, VCC bacağının (sol üst) hemen yanındaki ray sütununda. Göstergeler ve 470 Ω dizileri de kanalın üstünde.
- **2.784 atlama teli**: 246 ray köprüsü (120 board içi, 126 board'lar arası), 880 kısa besleme teli
  (çiplerin VCC / GND bacakları ve GND'ye bağlı kullanılmayan girişler, ortalama 7 mm), 1.658 sinyal
  teli. Teller düz yatar, yalnız yatay ve dikey gider; hiçbir çipin, parçanın ya da başka bir telin
  ucunun üstünden geçmez; bir delikte asla iki tel ucu ya da tel ucu ile bacak olmaz. Bu yüzden teller
  herhangi bir sırayla takılabilir; listedeki sıra yalnız aşamalara bölmek ve elleri boş yerde tutmak
  içindir.
- **Uzunluk**: delikten deliğe 180 m, kesim boyu (iki uçta 8'er mm) 226 m; ortalama 65 mm, en uzun
  1,1 m. Kesim boyları: 55 tel 10–20 mm, 1.109 tel 20–40 mm, 845 tel 40–80 mm, 485 tel 80–160 mm, 189
  tel 160–320 mm, 101 tel 320 mm'den uzun.
- **Doğrulama**: `npm run hesap8 -- breadboard` bağlantıyı yalnız fiziksel modelden (şeritler, raylar,
  ray köprüleri, teller) birleşim-bul ile kurar ve netlistle karşılaştırır: 1.116 net, 4.177 bacak;
  açık devre yok, kısa devre yok. Aynı denetim her aşamanın sonu için de yapılır (testler).

PCB'deki pinden pine listeyle karşılaştırma: orada 1.682 sinyal teli (besleme kartın raylarında),
bacaktan bacağa düz çizgiyle 137 m, ortalama 82 mm, teller çiplerin üstünden geçer. Breadboard'da
sinyal teli 1.658'dir (aynı şeride oturan bacaklar tel istemez), ama her tel dik açılı yolunda
gittiğinden toplam sinyal yolu 166 m (ortalama 100 mm); üstüne her bacağın beslemesi raya bir kısa
telle bağlanır.

**Ray varsayımı:** raylar boydan boya kesintisizdir (BB830 türü). Rayları ortadan (≈ 30. sütun)
bölük breadboard'larda her rayın iki yarısını kısa bir telle köprüle (board başına 4, toplam 240 ek
tel) ya da her board'da rayın iki ucunda 5 V'u ölç.

**Renk kodu** (sinyal grubu başına; belgede ve uygulamada aynı):

| Renk | Grup | Tel |
|---|---|---|
| kırmızı | +5 V (raylar, ray köprüleri, VCC bacakları, 1'e bağlı girişler) | 367 |
| siyah | GND (raylar, GND bacakları, 0'a bağlı girişler, gösterge ortak katotları) | 759 |
| sarı | A sayısı (A0–A7) | 103 |
| turuncu | B sayısı (B0–B7, tersleri, çıkarmada çevrilmiş hali) | 175 |
| mor | kontrol (işlem anahtarları, kod çözme, lamba testi, söndürme, NEG, HATA) | 130 |
| yeşil | ara işlem (toplayıcıların, çarpıcının, bölücünün iç sinyalleri) | 331 |
| mavi | sonuç (M, P, Q, K, T8 ve seçilen sonuç) | 96 |
| beyaz | onluk (BCD: onluğa çevirme ve 4511 girişleri) | 627 |
| gri | segmentler (4511 → 470 Ω → gösterge) | 196 |

Aşamalar (her birinin sonunda aşağıdaki test; her aşamanın sonunda o ana kadar takılan bütün
netler tamdır):

| Aşama | Board'lar | Çip | Teller |
|---|---|---|---|
| 1. Taban, besleme ve anahtarlar | 60 board'un rayları, BB57, BB58 | 3 | T0001–T0302 (246'sı ray köprüsü) |
| 2. A sayısının göstergesi | BB01 BB06 BB11 BB16 BB21 | 19 | T0303–T0542 |
| 3. B sayısının göstergesi | BB02 BB07 BB12 BB17 BB22 | 19 | T0543–T0782 |
| 4. Toplama ve çıkarma | BB46 BB51 BB56 | 10 | T0783–T0884 |
| 5. Çarpma | BB26 BB27 BB31 BB32 BB36 BB37 BB41 BB42 | 30 | T0885–T1198 |
| 6. Bölme | BB30 BB35 BB40 BB45 BB49 BB50 BB54 BB55 BB59 BB60 | 39 | T1199–T1632 |
| 7. Sonuç seçici, sonuç ve kalan göstergeleri | kalan 27 board | 96 | T1633–T2784 |

Yerleşimi ya da tellerin yolunu değiştirmek için: `npm run hesap8 -- breadboard --uret` (≈ 15 s)
`hesap8/breadboard/veri.ts`'i yeniden üretir; netlist değişince eski veri kullanılmaz (parmak izi).

## PCB yolu

Bütün devre KiCad şemasından (`cpu16/kicad/hesap/`) PCB'ye. Çipler soketlere (90 × DIP-14,
126 × DIP-16), teller yerine PCB izleri; pinden pine tel listesi bu kez **bip testi listesi** olur
(multimetrenin süreklilik kipiyle her teli uçtan uca dene). Aşamalar ve testler aşağıdakilerle
aynıdır; "PCB belgesi" satırları o belgenin bloklarını ve tel numaralarını verir.

## Genel kurallar

- **Besleme:** 5 V, en az 1 A (önerilen 5 V 2 A adaptör). J1: 1. pin +5 V, 2. pin GND. Breadboard'da
  ray köprüleri tel listesinin başındadır (1. aşama); bölük raylı breadboard'larda yukarıdaki ray
  varsayımına bak.
- **Her çipe 100 nF**, VCC ile GND arasına, çipe en yakın yere. Girişte bir 100 µF (+ ucu VCC).
- **74HC girişleri asla boşta kalmaz.** Kullanılmayan kapı girişleri şemada GND'ye bağlıdır; tel
  listesinde bunlar da vardır, atlama. Boşta kalan giriş rastgele 0 / 1 olur, çip ısınabilir.
- **Çip yönü:** çentik solda, 1. pin sol altta (kurulum belgesindeki yerleşimle aynı).
- **Tel renkleri:** kurulum belgesinin renk koduna uy (sayı bitleri, işlem sinyalleri, segmentler
  ayrı renklerde); hata ararken çok işe yarar.
- **Breadboard telleri:** belgedeki "kes" boyunda kes, uçları 6 mm soy, 90° bük, deliğe tam bas; tel
  board'a yatsın. Önce bir rengin bütün tellerini kesim listesine göre kesip boylarına ayır.
- **Her aşamadan sonra test et**, sonra bir sonrakine geç. Test tabloları aşağıda.

## Aşama 1: besleme, anahtarlar, işlem LED'leri

Breadboard: 60 board'u tabana yapıştır (BB01 sol arka köşe), sonra BB57 ve BB58'in parçaları;
teller **T0001–T0302** (önce 246 ray köprüsü). Testten önce her board'un iki + rayında 5 V.
PCB belgesi: blok 0 (Besleme) ve blok 1 (Anahtarlar), teller **T0001–T0037**.
Parçalar: J1, C1; SW1, SW2 (8'li DIP), SW3 (2'li DIP), SW4 (buton); RN1–RN3 (10 kΩ SIP-9, nokta
= ortak uç = GND); U1–U3 (74HC04, 74HC02, 74HC08: işlem kod çözme); D1–D4 yeşil LED, R2–R5 330 Ω.

DIP anahtarın bir yanı VCC'ye, öbür yanı sayının bitine gider; 10 kΩ'lar anahtar kapalıyken biti
0'a çeker. SW1'in 1. anahtarı A7 (en anlamlı bit): soldan sağa okununca ikilik sayı.

| Test | Beklenen |
|---|---|
| SW1'de yalnız 8. anahtar açık | A0 = 5 V, A1–A7 = 0 V (multimetre ya da LED + 1 kΩ ile) |
| SW3: kapalı, kapalı | yalnız D1 (TOPLA) yanar |
| SW3: kapalı, açık | yalnız D2 (ÇIKAR) |
| SW3: açık, kapalı | yalnız D3 (ÇARP) |
| SW3: açık, açık | yalnız D4 (BÖL) |
| SW4'e bas | LT_N = 0 V, bırak = 5 V (R1 10 kΩ yukarı çeker) |

## Aşama 2: A sayısını onluk göster

Breadboard: BB01 (göstergeler ve 470 Ω diziler), BB06 (4511 sürücüler), BB11, BB16, BB21 (onluğa
çevirme); teller **T0303–T0542**.
PCB belgesi: blok 6 (Onluğa çevirme: A, **T0710–T0787**, 12 entegre) ve blok 10 (Gösterge: A,
**T1331–T1399**, 7 entegre + DS1–DS3).

### Önce tek hane (deneme bağlantısı, isteğe bağlı)

Asıl devreden önce bir haneyi tek başına dene: bir 74HC4511, bir 470 Ω dizi (DIP-16) ve bir
gösterge. Bu aşamanın telleri geçicidir; sonra sök ve asıl devreye geç. Breadboard yolunda denemeyi
ayrı, küçük bir breadboard'da yap: asıl board'lara yalnız listedeki teller takılır (hiçbir delikte
iki şey olmaz kuralı bozulmasın).

- 74HC4511 pinleri: 1 B, 2 C, 3 ~LT, 4 ~BI, 5 LE, 6 D, 7 A, 8 GND, 9 e, 10 d, 11 c, 12 b, 13 a,
  14 g, 15 f, 16 VCC.
- Gösterge (5161AS, ortak katot): 1 e, 2 d, 3 ortak, 4 c, 5 nokta, 6 b, 7 a, 8 ortak, 9 f, 10 g.
  3 ve 8 GND'ye; nokta (5) boş.
- Dizinin k. direnci k. ve (17 − k). pinler arasındadır: 4511'in a..g çıkışları 1–7. pinlere,
  göstergenin a..g'si 16–10. pinlere.
- Geçici bağlantı: SW1'in A0–A3 bitlerini 4511'in A–D'sine, LE → GND, ~BI → VCC, ~LT → LT_N.

| Test | Beklenen |
|---|---|
| A3..A0 = 0000 … 1001 | 0 … 9; 6 ve 9 "kuyruksuz" (6'da üst, 9'da alt çizgi yok, 4511 böyle) |
| A3..A0 = 1010 … 1111 | gösterge söner |
| SW4'e bas | "8" (bütün segmentler) |
| ~BI'yı GND'ye al | söner (lamba testi buna da üstündür) |

Bir segment hiç yanmıyorsa: göstergenin pin düzenini 3 V düğme pil + 470 Ω ile tek tek dene;
"2" yerine "5" gibi aynalı rakamlar görüyorsan a–f ya da b–f gibi iki segment yer değiştirmiştir.

### A'nın onluk göstergesi

İkilikten onluğa çevirme "3 ekle ve kaydır" modüllerinden oluşur: her modül bir 74HC283 ve onun
"≥ 5" algılama kapıları. A için 7 modül. Modüller kurulum belgesinde "1. kaydırmadan önce birler
hanesi ≥ 5 ise + 3" gibi görevleriyle yazılıdır; zincirin sırasıyla kur.

| SW1 (A) | Gösterge A |
|---|---|
| 00000000 | "  0" (baştaki sıfırlar söner, birler hiç sönmez) |
| 00000101 | "  5" |
| 00001010 | " 10" |
| 01100100 | "100" |
| 11111111 | "255" |
| 10000000 | "128" |

Bir değer yanlışsa: o değeri adım adım izlemek için simülatörde aynı A'yı ver (Silikon3D → 8 bit
hesap makinesi) ve modüllerin çıkış netlerini (A_3_0_0 … A_7_1_3: adım, hane, bit) kartta multimetreyle karşılaştır.

## Aşama 3: B sayısını onluk göster

Breadboard: BB02, BB07, BB12, BB17, BB22 (A'nın board'larının sağındaki sütun); teller
**T0543–T0782**. PCB belgesi: blok 7 ve blok 11. Test: aşama 2'nin tablosu, SW2 ile, B göstergesinde.

## Aşama 4: toplama ve çıkarma

Breadboard: BB46, BB51, BB56; teller **T0783–T0884**. Geçici LED'i netin şeridindeki boş bir deliğe
tak (şeridi breadboard belgesindeki çizimden bul). PCB belgesi: blok 2, **T0038–T0102**, 10 entegre (4 × 74HC86, 4 × 74HC283, 74HC08, 74HC04).
Sonucu göstermek için henüz onluk sonuç devresi yok: M0–M7, NEG ve T8 netlerine geçici LED'ler
(her biri 1 kΩ ile GND'ye) bağla.

| A | B | İşlem | M7..M0 | NEG | T8 | Anlamı |
|---|---|---|---|---|---|---|
| 12 | 200 | + | 11010100 | 0 | 0 | 212 |
| 255 | 255 | + | 11111110 | 0 | 1 | 510 (T8 = 256'lar biti) |
| 200 | 12 | − | 10111100 | 0 | 0 | 188 |
| 12 | 200 | − | 10111100 | 1 | 0 | −188 |
| 7 | 7 | − | 00000000 | 0 | 0 | 0 |

## Aşama 5: çarpma

Breadboard: BB26, BB27, BB31, BB32, BB36, BB37, BB41, BB42; teller **T0885–T1198**.
PCB belgesi: blok 3, **T0103–T0348**, 30 entegre (16 × 74HC08 kısmi çarpımlar, 14 × 74HC283
satır toplayıcıları). Önce 64 AND'i kur, sonra toplayıcı satırlarını sırayla (satır 1 … 7).

| A | B | Çarpım P15..P0 |
|---|---|---|
| 15 | 15 | 0000 0000 1110 0001 (225) |
| 255 | 1 | 0000 0000 1111 1111 (255) |
| 16 | 16 | 0000 0001 0000 0000 (256) |
| 255 | 255 | 1111 1110 0000 0001 (65 025) |

## Aşama 6: bölme

Breadboard: BB30, BB35, BB40, BB45, BB49, BB50, BB54, BB55, BB59 (BB60 yalnız tel geçişi); teller
**T1199–T1632**. PCB belgesi: blok 4, **T0349–T0652**, 39 entegre. 8 aynı basamak; her basamak 2 × 74HC283
(kalan − B) ve 2 × 74HC157 (yeni kalan). Basamak 7'den (A7) başla, 0'da bitir; her basamak bir
öncekinin kalanını alır. Asıl HATA LED'i (D5) 7. aşamada göstergelerin yanına takılır; şimdilik HATA
netini geçici bir LED + 1 kΩ ile izle.

| A | B | Bölüm Q7..Q0 | Kalan K7..K0 | HATA neti (BÖL seçiliyken) |
|---|---|---|---|---|
| 255 | 7 | 00100100 (36) | 00000011 (3) | 0 |
| 100 | 10 | 00001010 (10) | 00000000 | 0 |
| 5 | 9 | 00000000 | 00000101 (5) | 0 |
| 100 | 0 | — | — | 1 |

## Aşama 7: sonuç seçici, sonuç ve kalan göstergeleri

Breadboard: kalan 27 board: BB03–BB05 göstergeler (sonuç ve HATA LED'i, kalan), BB08–BB10
sürücüler, orta ve sağ sütunda onluğa çevirme (BB13–BB44), BB47–BB48 sonuç seçici (BB52, BB53 yalnız
tel geçişi); teller **T1633–T2784**, en kalabalık aşama.
PCB belgesi: blok 5 (Sonuç seçici, T0653–T0709), 8 (Onluğa çevirme: sonuç, T0866–T1252,
58 entegre), 9 (kalan, T1253–T1330), 12 (Gösterge: Sonuç, T1469–T1606) ve 13 (Gösterge: Kalan,
T1607–T1679). Geçici LED'leri sök. Sonuç göstergesinin en solundaki hane (DS7) yalnız eksi
işaretidir: g segmenti R6 (330 Ω) üzerinden ISARET_g'ye (NEG ya da lamba testi, bir OR kapısı), öbür
segmentler boş. HATA LED'i (D5, kırmızı, R7 330 Ω) da bu blokta, sonucun yanında.

| A | İşlem | B | Sonuç | Kalan |
|---|---|---|---|---|
| 255 | + | 255 | "   510" | sönük |
| 12 | − | 200 | "-  188" | sönük |
| 255 | × | 255 | " 65025" | sönük |
| 255 | ÷ | 7 | "    36" | "  3" |
| 100 | ÷ | 0 | sönük, HATA yanar | sönük |
| 0 | ÷ | 5 | "     0" | "  0" |

Lamba testi (SW4): 14 hanenin hepsi "8", işaret hanesinde "−" olmalı (sönük gruplar dahil). İşlem
LED'leri ve HATA LED'i lamba testine bağlı değildir.

## Sorun giderme

| Belirti | Bak |
|---|---|
| Çip ısınıyor | Ters takılmış çip (çentik), VCC / GND kısa, boşta giriş |
| Bir hane hep sönük | ~BI zinciri (söndürme kapıları), 4511'in LE'si GND'de mi |
| Bir hane hep "8" | ~LT boşta ya da GND'de; LT_N'yi ölç |
| Rakam garip | Gösterge pin düzeni ya da dizide yer değiştiren iki direnç |
| Bazı sayılarda yanlış | Onluğa çevirme modülü: simülatörde aynı girişle o modülün netlerini karşılaştır |
| Gösterge titriyor, çipler rastgele | Dekuplaj eksik, besleme ince telle uzaktan geliyor |
| Bir board'un çipleri ölü | Ray köprüleri (aşama 1) ya da bölük ray: o board'un dört rayında 5 V / 0 V ölç |
| Breadboard'da tek bit yanlış | Telin ucu yanlış şeritte ya da tam basmamış: tel listesindeki iki deliği ve renk kodunu kontrol et |
| Akım beklenenden çok | Lamba testinde ≈ 0,6 A normal; anahtarlar dururken > 0,4 A ise kısa devre ara |

Tasarımın her net adı simülatörde, şemada ve iki kurulum belgesinde aynıdır: bir net adını PDF'te
(Ctrl+F) aramak, o netin bütün uçlarını ve tellerini gösterir.
