# 8 bit hesap makinesi: fiziksel kurulum rehberi

Bu rehber hesap makinesini gerçek çiplerle kurmanın sırasını ve her aşamanın testini anlatır.
Hangi bacağın nereye gittiği **kurulum belgesindedir** (`hesap-kurulum.pdf`: yerleşim haritası,
numaralı tel listesi T0001–T1679, her çipin pin kartı). Şema: `hesap-sema.pdf` (11 sayfa). İkisi
de `npm run cpu16 -- kurulum hesap -o <dizin>` ile üretilir; tasarımın açıklaması:
[tasarim.md](tasarim.md).

## Yol: önce breadboard'da küçük aşamalar, sonra PCB

Devre 216 entegre ve 1.679 sinyal teli. Hepsini breadboard'da kurmak mümkün ama ağır: tam boy bir
breadboard'a (830 delik) tellerle birlikte rahatça 4 çip sığar, yani ≈ 55 breadboard. Önerim:

1. **Breadboard (öğrenme ve video):** aşağıdaki 1–4. aşamalar, ≈ 22 entegre, 6–7 breadboard.
   Anahtarlar, 7 segment sürücüsü, ikilikten onluğa çevirme ve toplama / çıkarma. Her biri tek
   başına çalışır ve test edilir.
2. **PCB (tam alet):** bütün devre KiCad şemasından (`cpu16/kicad/hesap/`) PCB'ye. Çipler soketlere
   (90 × DIP-14, 126 × DIP-16), teller yerine PCB izleri; tel listesi bu kez **bip testi listesi**
   olur (multimetrenin süreklilik kipiyle her teli uçtan uca dene).

5–7. aşamalar (çarpma, bölme, sonuç) breadboard'da da kurulabilir; sabır ve yer isterse.

## Genel kurallar

- **Besleme:** 5 V, en az 1 A (önerilen 5 V 2 A adaptör). J1: 1. pin +5 V, 2. pin GND. Uzun
  breadboard'larda üst ve alt besleme raylarını her iki uçtan köprüle; bazı breadboard'larda raylar
  ortadan bölüktür.
- **Her çipe 100 nF**, VCC ile GND arasına, çipe en yakın yere. Girişte bir 100 µF (+ ucu VCC).
- **74HC girişleri asla boşta kalmaz.** Kullanılmayan kapı girişleri şemada GND'ye bağlıdır; tel
  listesinde bunlar da vardır, atlama. Boşta kalan giriş rastgele 0 / 1 olur, çip ısınabilir.
- **Çip yönü:** çentik solda, 1. pin sol altta (kurulum belgesindeki yerleşimle aynı).
- **Tel renkleri:** kurulum belgesinin renk koduna uy (sayı bitleri, işlem sinyalleri, segmentler
  ayrı renklerde); hata ararken çok işe yarar.
- **Her aşamadan sonra test et**, sonra bir sonrakine geç. Test tabloları aşağıda.

## Aşama 1: besleme, anahtarlar, işlem LED'leri

Kurulum belgesi: blok 0 (Besleme) ve blok 1 (Anahtarlar), teller **T0001–T0037**.
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

## Aşama 2: tek hane gösterge (deneme bağlantısı)

Asıl devreden önce bir haneyi tek başına dene: bir 74HC4511, bir 470 Ω dizi (DIP-16) ve bir
gösterge. Bu aşamanın telleri geçicidir; 3. aşamada hanenin girişi onluğa çevirme devresine taşınır.

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

## Aşama 3: A sayısını onluk göster

Kurulum belgesi: blok 6 (Onluğa çevirme: A, **T0710–T0787**, 12 entegre) ve blok 10 (Gösterge: A,
**T1331–T1399**, 7 entegre + DS1–DS3). Aşama 2'nin geçici tellerini sök.

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
Aynı devreyi B için kurarsan (blok 7 ve 11) B de onluk görünür.

## Aşama 4: toplama ve çıkarma

Kurulum belgesi: blok 2, **T0038–T0102**, 10 entegre (4 × 74HC86, 4 × 74HC283, 74HC08, 74HC04).
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

Kurulum belgesi: blok 3, **T0103–T0348**, 30 entegre (16 × 74HC08 kısmi çarpımlar, 14 × 74HC283
satır toplayıcıları). Önce 64 AND'i kur, sonra toplayıcı satırlarını sırayla (satır 1 … 7).

| A | B | Çarpım P15..P0 |
|---|---|---|
| 15 | 15 | 0000 0000 1110 0001 (225) |
| 255 | 1 | 0000 0000 1111 1111 (255) |
| 16 | 16 | 0000 0001 0000 0000 (256) |
| 255 | 255 | 1111 1110 0000 0001 (65 025) |

## Aşama 6: bölme

Kurulum belgesi: blok 4, **T0349–T0652**, 39 entegre. 8 aynı basamak; her basamak 2 × 74HC283
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

Kurulum belgesi: blok 5 (Sonuç seçici, T0653–T0709), 8 (Onluğa çevirme: sonuç, T0866–T1252,
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
| Akım beklenenden çok | Lamba testinde ≈ 0,6 A normal; anahtarlar dururken > 0,4 A ise kısa devre ara |

Tasarımın her net adı simülatörde, şemada ve kurulum belgesinde aynıdır: bir net adını PDF'te
(Ctrl+F) aramak, o netin bütün uçlarını ve tellerini gösterir.
