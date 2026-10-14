# Deney 14: Kendin yap bellek: 16 bayt, her bayt bir 74HC574

> **Video:** "Belleğin içi: 16 baytlık RAM'i flip-flop'larla kendimiz yapıyoruz" · **Önce:** Deney 10 (G/Ç kartı, terminal); BIOS'la denemek için Deney 12 · **Kart:** kendin yap bellek kartı (`kyb`, 22 entegre)
>
> **Breadboard panosu** (bilgisayarın kalıcı breadboard yolu, [docs/breadboard.md](../docs/breadboard.md)): `kyb-breadboard.pdf` (Kendin yap bellek kartı), 2–3. aşamalar (önce 1. aşama: taban, besleme, uyarlayıcı).

Bilgisayarın RAM'i dört 62256'dır: her biri tek bir entegrede 32 768 bayt. Bu deneyde aynı işi
yapan bir belleği açıkta kurarız: 16 bayt, her bayt bir 74HC574. Kart G/Ç alanında `FF40–FF4F`'te
durur; CPU onu sıradan bellek gibi okur ve yazar. Bir 62256'nın içindeki üç şey burada ayrı ayrı
görünür: bitleri tutan hücreler, hangi baytın seçileceğine karar veren adres çözücü ve bütün
hücrelerin paylaştığı veri hattı. Kart bilgisayarın çalışması için gerekmez; ilk 13 deneyde
kurulan bilgisayara sonradan takılır.

## Ne öğreneceksin

- **Bellek hücresi**: bir bit bir D flip-flop'tur; 74HC574 sekiz flip-flop ve üç durumlu çıkışla bir
  bayttır. Kapı modelinde bir 574, 355 transistör eder (bit başına ≈ 44); 62256'nın hücresi 6
  transistördür. 16 bayt için 22 entegre, 32 KB için bir entegre: belleğin neden çip içinde
  yapıldığı buradan görünür.
- **Adres çözme**: 74HC138 üç adres bitini sekiz seçim hattına açar. Bir çözücü kartı seçer
  (`~IO` ve A7..A4 = 4: `FF4x`), üç çözücü kelimeyi (A3..A1) seçer: biri çift bayt yazma, biri tek
  bayt yazma, biri okuma için.
- **Ortak veri hattı**: sekiz 574'ün çıkışları aynı sekiz hatta bağlıdır. Üç durumlu çıkış sayesinde
  aynı anda yalnız seçilen çip sürer, ötekiler hattan "kopar". İki çip birden açılırsa çakışma olur.
- **Yazma kenarı**: 574 veriyi saat girişinin yükselen kenarında alır. Kart bu kenarı CPU'nun yazma
  darbesinin **sonuna** denk getirir; veri o anda veriyolunda kararlıdır.
- **16 bitlik veriyolu, 8 bitlik hücreler**: çift baytlar `DE`, tek baytlar `DO` şeridindedir. Kelime
  yazmasında iki darbe birlikte gelir; bayt yazmasında yalnız kendi şeridininki.
- **Veriyolu tamponu**: 16 çipi doğrudan `DE`/`DO`'ya bağlamak her veri hattına 16 bacak (sekiz
  574'ün D'si ve Q'su, ≈ 80 pF) ekler ve CPU'nun okuma yolunu yavaşlatır. İki 74HC245 kartın iç
  şeritlerini (`KE`, `KO`) veriyolundan ayırır; veriyolunu yalnız onlar yükler.
- **Statik bellek**: içerik besleme durana kadar kalır. Reset onu silmez (574'ün reset ucu yoktur);
  beslemeyi kesip açınca içerik rastgeledir. EEPROM'dan (Deney 3) farkı da budur.

## Nasıl çalışır

- **Seçim**: bellek kartı (U401) `A15..A8 = FF` iken `~IO`'yu düşürür. U801 `~IO` düşük ve
  A7..A4 = 4 iken `~K_G`'yi düşürür: `FF40–FF4F`'e her erişimde.
- **Yazma**: CPU'nun `~MWE_E` (çift bayt) ve `~MWE_O` (tek bayt) darbeleri U802 ve U803'ün izin
  girişlerine gelir. Seçilen kelimenin `~K_WEk` / `~K_WOk` hattı darbe süresince düşük olur; darbe
  bitince yükselir ve o baytın 574'ü (CP) veriyi alır. Kelime yazmasında (`SW`) iki darbe birlikte,
  bayt yazmasında (`SB`) yalnız adresin şeridindeki gelir.
- **Okuma**: `~MRD` düşükken U804 seçilen kelimenin iki 574'ünün `~OE`'sini düşürür. Çift bayt
  `KE` → U805 → `DE`, tek bayt `KO` → U806 → `DO`. Bayt okumasında CPU A0'a göre baytı seçer;
  okumanın yan etkisi yoktur.
- **Tampon yönü**: U805/U806'nın `DIR`'ı `~MRD`'dir. Yüksekken (yazma ya da boşta) veri veriyolundan
  karta (`DE` → `KE`), düşükken karttan veriyoluna akar. İzinleri (`~OE`) `~K_G`'dir: kart seçili değilken
  veriyolundan tamamen ayrıdır. 574'lerin D ve Q bacakları aynı şeride bağlıdır; Q'lar yalnız okumada
  açılır, yazmada şeridi tampon sürer.
- **Zamanlama**: okuma yolu U804 (`~MRD` → `~K_RDk`), 574'ün `~OE` → Q gecikmesi ve 245'tir.
  `npm run cpu16 -- zamanlama --anakart` kartı da hesaba katar. Tamponsuz kart CPU saatinin en kötü
  durum yolunu ≈ 21 ns uzatıyordu (951 → 972 ns), tamponla ≈ 5 ns (956 ns): 1 MHz'de (1000 ns) pay
  kalır (`cpu16/docs/uretim.md`).
- Kartın kodu ve tasarım notları: `cpu16/board/kyb-card.ts`; davranış modeli `Machine.kyb`
  (`cpu16/emu/machine.ts`); KiCad şeması `cpu16/kicad/kyb/`.

## Kurulum adımları

1. Kartı aşağıdaki malzeme ve bağlantı tablosuna göre kur: önce besleme ve arka panel konnektörü
   (J801), sonra adres çözme (U801–U804), tampon (U805, U806), en son hücreler (U807–U822).
2. Hücreler bayt bayt: çift baytlar (U807 = FF40, U809 = FF42 … U821 = FF4E) `KE` şeridinde, tek
   baytlar (U808 = FF41 … U822 = FF4F) `KO` şeridinde. Her 574'ün D0..D7 (bacak 2–9) ve Q0..Q7
   (bacak 19–12) bacakları aynı şeridin aynı bitine bağlanır.
3. Deneme programını bir 28C256'ya yaz (Deney 3'teki programlayıcıyla). BIOS'un çipini silmemek
   için ikinci bir 28C256 kullan; U420'ye bu çipi tak:
   ```
   npm run cpu16 -- asm cpu16/kit/programlar/kyb-deneme.s -o kyb.hex
   python3 cpu16/programlayici/yaz.py PORT kyb.hex --dogrula
   ```
4. Terminali aç (Deney 10: 1 MHz CPU için 28 800 baud, 8N1) ve RESET'e bas.
5. Bitince BIOS'un çipini U420'ye geri tak.

## Test: beklenen sonuç

| Adım | Terminalde |
|---|---|
| RESET | `KENDIN YAP BELLEK: FF40-FF4F, 16 x 74HC574` |
| hemen ardından | `FF40: 3C 00 …`: açılıştaki içerik, rastgele |
| dört desen geçince | `TAMAM`, sonra `FF40: 00 11 22 33 44 55 66 77 88 99 AA BB CC DD EE FF` |
| terminalde `Selam` yaz | her harfte bir satır; sonuncusu `FF40: 53 65 6C 61 6D 55 66 …` (ASCII kodları) |
| RESET'e yeniden bas | ilk döküm artık `00 11 22 … FF`: reset içeriği silmez |
| hata | ör. `HATA FF46: okunan 8889, beklenen 8899`: program durur |

Program dört desen dener; her desende önce 16 baytın hepsini yazar, sonra hepsini okur (bir bayt
başka bir baytın üstüne yazıyorsa okumada yakalanır):

| Desen | Yazma | Okuma | Değer | Yakaladığı |
|---|---|---|---|---|
| d1 | bayt (`SB`) | bayt (`LBU`) | `i · 0x11`: 00 11 22 … FF | her bayt farklı: adres çözme |
| d2 | bayt | kelime (`LW`) | d1'in tersi | her bit iki değeri de alır; iki 574 birlikte okunur |
| d3 | kelime (`SW`) | bayt | yürüyen bit: çift bayt `1 << k`, tek bayt `0x80 >> k` | kısa devre veri hatları |
| d4 | kelime | kelime | d3'ün tersi | |

Hata satırındaki adres hangi 574 olduğunu (tabloda `bayt FF46`), okunan ile beklenenin XOR'u hangi
bitin bozuk olduğunu söyler: `8889 XOR 8899 = 0010`, FF46'nın D4'ü.

**BIOS'la (Deney 12'den sonra):** kart BIOS'la da denenir. Monitörde `W FF40 41 42 43` üç bayt
yazar, `D FF40 10` 16 baytı döker. Baytlar besleme kesilene kadar kalır; RESET'ten sonra `D FF40 10`
aynı içeriği gösterir.

## Simülatörde

- `npm run cpu16 -- machine cpu16/kit/programlar/kyb-deneme.s --rom`: program EEPROM'a yazılmış gibi
  BIOS'suz çalışır; terminale yazdıkların sırayla baytlara yazılır (çıkış: Ctrl-]).
- Kapı seviyesi: `cpu16/tests/anakart-gc.test.ts` ("kendin yap bellek kartı") kartı kapı seviyesinde
  kurar, elektriksel kural denetiminden geçirir ve kelime / bayt, okuma / yazma erişimlerini
  `Machine` modeliyle karşılaştırır.
- Deneme programının kendisi ve bozuk bir bitin hata satırı: `cpu16/tests/kit.test.ts`.

## Sorun giderme

| Belirti | Bak |
|---|---|
| İlk baytta `HATA FF40: okunan FF, beklenen 00` | Kart hiç seçilmiyor: U801'in `~Y4`'ü (`~K_G`) `FF4x` erişiminde düşüyor mu; `~IO`, A7 (U801 `~E2`), A4..A6 |
| Okunan hep `FF` / `FFFF` ama yazma darbeleri var | Okuma yolu: U804'ün `~E2`'si `~MRD`'de mi; 574'lerin `~OE`'si (bacak 1); U805/U806'nın `~OE`'si (19) ve `DIR`'ı (1) |
| İki bayt hep aynı (ör. FF42 = FF40) | Yazma çözücülerinin adres girişleri (U802/U803 A0..A2 = A1..A3) ya da iki 574'ün CP'si aynı hatta |
| Okunan XOR beklenen tek bit | O bitin şerit hattı (`KEn`/`KOn`): 574'ün Dn ve Qn bacakları aynı hatta mı; 245'in An/Bn bacakları |
| d1 geçiyor, d2'de tek baytlarda hata | Tek bayt yolu: U806, U803 (`~MWE_O`) |
| d1, d2 geçiyor, d3'te hata | Kelime yazması iki şeridi birlikte yazmalı: U802 ve U803 aynı kelimeyi seçiyor mu |
| Kart takılınca BIOS açılmıyor | Tampon kart seçili değilken veriyolunu sürüyor: U805/U806'nın `~OE`'si `~K_G`'ye bağlı olmalı, GND'ye değil. Ya da iki 574'ün `~OE`'si aynı anda açık |
| Bazen doğru, bazen yanlış | Yazma kenarı: 574'ün CP'si darbenin sonunda yükselmeli; dekuplaj kondansatörleri (C802–C823), kısa kablolar |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
#### Malzeme (22 entegre, 23 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 74HC138 | 4 | U801 U802 U803 U804 | 3'ten 8'e kod çözücü (aktif düşük çıkış) | GND 8, VCC 16 |
| 74HC245 | 2 | U805 U806 | 8 bit çift yönlü veriyolu alıcı-vericisi | GND 10, VCC 20 |
| 74HC574 | 16 | U807 U808 U809 U810 U811 U812 U813 U814 U815 U816 U817 U818 U819 U820 U821 U822 | 8 bit D flip-flop register (üç durumlu çıkış) | GND 10, VCC 20 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| C_100N | 22 | C802 C803 C804 C805 C806 C807 C808 C809 C810 C811 C812 C813 C814 C815 C816 C817 C818 C819 C820 C821 C822 C823 | 100 nF seramik kondansatör (dekuplaj) |
| C_100U | 1 | C801 | 100 µF elektrolitik kondansatör (kart girişi) |

#### Bağlantılar (68 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **VCC** | U801-6 E3, U802-6 E3, U803-6 E3, U804-6 E3 | sabit seviye |
| `~IO` | U801-4 ~E1 | arka panel 47 · önceki: Deney 8, 10, 11 |
| `~K_G` | U801-11 ~Y4, U802-4 ~E1, U803-4 ~E1, U804-4 ~E1, U805-19 ~OE, U806-19 ~OE |  |
| `~K_RD0` | U804-15 ~Y0, U807-1 ~OE, U808-1 ~OE |  |
| `~K_RD1` | U804-14 ~Y1, U809-1 ~OE, U810-1 ~OE |  |
| `~K_RD2` | U804-13 ~Y2, U811-1 ~OE, U812-1 ~OE |  |
| `~K_RD3` | U804-12 ~Y3, U813-1 ~OE, U814-1 ~OE |  |
| `~K_RD4` | U804-11 ~Y4, U815-1 ~OE, U816-1 ~OE |  |
| `~K_RD5` | U804-10 ~Y5, U817-1 ~OE, U818-1 ~OE |  |
| `~K_RD6` | U804-9 ~Y6, U819-1 ~OE, U820-1 ~OE |  |
| `~K_RD7` | U804-7 ~Y7, U821-1 ~OE, U822-1 ~OE |  |
| `~K_WE0` | U802-15 ~Y0, U807-11 CP |  |
| `~K_WE1` | U802-14 ~Y1, U809-11 CP |  |
| `~K_WE2` | U802-13 ~Y2, U811-11 CP |  |
| `~K_WE3` | U802-12 ~Y3, U813-11 CP |  |
| `~K_WE4` | U802-11 ~Y4, U815-11 CP |  |
| `~K_WE5` | U802-10 ~Y5, U817-11 CP |  |
| `~K_WE6` | U802-9 ~Y6, U819-11 CP |  |
| `~K_WE7` | U802-7 ~Y7, U821-11 CP |  |
| `~K_WO0` | U803-15 ~Y0, U808-11 CP |  |
| `~K_WO1` | U803-14 ~Y1, U810-11 CP |  |
| `~K_WO2` | U803-13 ~Y2, U812-11 CP |  |
| `~K_WO3` | U803-12 ~Y3, U814-11 CP |  |
| `~K_WO4` | U803-11 ~Y4, U816-11 CP |  |
| `~K_WO5` | U803-10 ~Y5, U818-11 CP |  |
| `~K_WO6` | U803-9 ~Y6, U820-11 CP |  |
| `~K_WO7` | U803-7 ~Y7, U822-11 CP |  |
| `~MRD` | U804-5 ~E2, U805-1 DIR, U806-1 DIR | arka panel 41 · önceki: Deney 6, 8, 9, 10, 11 |
| `~MWE_E` | U802-5 ~E2 | arka panel 42 · önceki: Deney 6, 8, 9, 10, 11 |
| `~MWE_O` | U803-5 ~E2 | arka panel 43 · önceki: Deney 6, 8, 10, 11 |
| `A1` | U802-1 A0, U803-1 A0, U804-1 A0 | arka panel 10 · önceki: Deney 6, 8, 9, 10, 11 |
| `A2` | U802-2 A1, U803-2 A1, U804-2 A1 | arka panel 11 · önceki: Deney 6, 8, 9, 10, 11 |
| `A3` | U802-3 A2, U803-3 A2, U804-3 A2 | arka panel 12 · önceki: Deney 6, 8, 9, 10, 11 |
| `A4` | U801-1 A0 | arka panel 13 · önceki: Deney 6, 8, 9, 10, 11 |
| `A5` | U801-2 A1 | arka panel 14 · önceki: Deney 6, 8, 9, 10, 11 |
| `A6` | U801-3 A2 | arka panel 15 · önceki: Deney 6, 8, 9, 10, 11 |
| `A7` | U801-5 ~E2 | arka panel 16 · önceki: Deney 6, 8, 9, 10, 11 |
| `DE0` | U805-2 A0 | arka panel 25 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10, 11 |
| `DE1` | U805-3 A1 | arka panel 26 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10, 11 |
| `DE2` | U805-4 A2 | arka panel 27 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10, 11 |
| `DE3` | U805-5 A3 | arka panel 28 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10, 11 |
| `DE4` | U805-6 A4 | arka panel 29 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10, 11 |
| `DE5` | U805-7 A5 | arka panel 30 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10, 11 |
| `DE6` | U805-8 A6 | arka panel 31 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10, 11 |
| `DE7` | U805-9 A7 | arka panel 32 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10, 11 |
| `DO0` | U806-2 A0 | arka panel 33 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10, 11 |
| `DO1` | U806-3 A1 | arka panel 34 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10, 11 |
| `DO2` | U806-4 A2 | arka panel 35 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10, 11 |
| `DO3` | U806-5 A3 | arka panel 36 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10, 11 |
| `DO4` | U806-6 A4 | arka panel 37 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10, 11 |
| `DO5` | U806-7 A5 | arka panel 38 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10, 11 |
| `DO6` | U806-8 A6 | arka panel 39 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10, 11 |
| `DO7` | U806-9 A7 | arka panel 40 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10, 11 |
| `KE0` | U805-18 B0, U807-2 D0, U807-19 Q0, U809-2 D0, U809-19 Q0, U811-2 D0, U811-19 Q0, U813-2 D0, U813-19 Q0, U815-2 D0, U815-19 Q0, U817-2 D0, U817-19 Q0, U819-2 D0, U819-19 Q0, U821-2 D0, U821-19 Q0 |  |
| `KE1` | U805-17 B1, U807-3 D1, U807-18 Q1, U809-3 D1, U809-18 Q1, U811-3 D1, U811-18 Q1, U813-3 D1, U813-18 Q1, U815-3 D1, U815-18 Q1, U817-3 D1, U817-18 Q1, U819-3 D1, U819-18 Q1, U821-3 D1, U821-18 Q1 |  |
| `KE2` | U805-16 B2, U807-4 D2, U807-17 Q2, U809-4 D2, U809-17 Q2, U811-4 D2, U811-17 Q2, U813-4 D2, U813-17 Q2, U815-4 D2, U815-17 Q2, U817-4 D2, U817-17 Q2, U819-4 D2, U819-17 Q2, U821-4 D2, U821-17 Q2 |  |
| `KE3` | U805-15 B3, U807-5 D3, U807-16 Q3, U809-5 D3, U809-16 Q3, U811-5 D3, U811-16 Q3, U813-5 D3, U813-16 Q3, U815-5 D3, U815-16 Q3, U817-5 D3, U817-16 Q3, U819-5 D3, U819-16 Q3, U821-5 D3, U821-16 Q3 |  |
| `KE4` | U805-14 B4, U807-6 D4, U807-15 Q4, U809-6 D4, U809-15 Q4, U811-6 D4, U811-15 Q4, U813-6 D4, U813-15 Q4, U815-6 D4, U815-15 Q4, U817-6 D4, U817-15 Q4, U819-6 D4, U819-15 Q4, U821-6 D4, U821-15 Q4 |  |
| `KE5` | U805-13 B5, U807-7 D5, U807-14 Q5, U809-7 D5, U809-14 Q5, U811-7 D5, U811-14 Q5, U813-7 D5, U813-14 Q5, U815-7 D5, U815-14 Q5, U817-7 D5, U817-14 Q5, U819-7 D5, U819-14 Q5, U821-7 D5, U821-14 Q5 |  |
| `KE6` | U805-12 B6, U807-8 D6, U807-13 Q6, U809-8 D6, U809-13 Q6, U811-8 D6, U811-13 Q6, U813-8 D6, U813-13 Q6, U815-8 D6, U815-13 Q6, U817-8 D6, U817-13 Q6, U819-8 D6, U819-13 Q6, U821-8 D6, U821-13 Q6 |  |
| `KE7` | U805-11 B7, U807-9 D7, U807-12 Q7, U809-9 D7, U809-12 Q7, U811-9 D7, U811-12 Q7, U813-9 D7, U813-12 Q7, U815-9 D7, U815-12 Q7, U817-9 D7, U817-12 Q7, U819-9 D7, U819-12 Q7, U821-9 D7, U821-12 Q7 |  |
| `KO0` | U806-18 B0, U808-2 D0, U808-19 Q0, U810-2 D0, U810-19 Q0, U812-2 D0, U812-19 Q0, U814-2 D0, U814-19 Q0, U816-2 D0, U816-19 Q0, U818-2 D0, U818-19 Q0, U820-2 D0, U820-19 Q0, U822-2 D0, U822-19 Q0 |  |
| `KO1` | U806-17 B1, U808-3 D1, U808-18 Q1, U810-3 D1, U810-18 Q1, U812-3 D1, U812-18 Q1, U814-3 D1, U814-18 Q1, U816-3 D1, U816-18 Q1, U818-3 D1, U818-18 Q1, U820-3 D1, U820-18 Q1, U822-3 D1, U822-18 Q1 |  |
| `KO2` | U806-16 B2, U808-4 D2, U808-17 Q2, U810-4 D2, U810-17 Q2, U812-4 D2, U812-17 Q2, U814-4 D2, U814-17 Q2, U816-4 D2, U816-17 Q2, U818-4 D2, U818-17 Q2, U820-4 D2, U820-17 Q2, U822-4 D2, U822-17 Q2 |  |
| `KO3` | U806-15 B3, U808-5 D3, U808-16 Q3, U810-5 D3, U810-16 Q3, U812-5 D3, U812-16 Q3, U814-5 D3, U814-16 Q3, U816-5 D3, U816-16 Q3, U818-5 D3, U818-16 Q3, U820-5 D3, U820-16 Q3, U822-5 D3, U822-16 Q3 |  |
| `KO4` | U806-14 B4, U808-6 D4, U808-15 Q4, U810-6 D4, U810-15 Q4, U812-6 D4, U812-15 Q4, U814-6 D4, U814-15 Q4, U816-6 D4, U816-15 Q4, U818-6 D4, U818-15 Q4, U820-6 D4, U820-15 Q4, U822-6 D4, U822-15 Q4 |  |
| `KO5` | U806-13 B5, U808-7 D5, U808-14 Q5, U810-7 D5, U810-14 Q5, U812-7 D5, U812-14 Q5, U814-7 D5, U814-14 Q5, U816-7 D5, U816-14 Q5, U818-7 D5, U818-14 Q5, U820-7 D5, U820-14 Q5, U822-7 D5, U822-14 Q5 |  |
| `KO6` | U806-12 B6, U808-8 D6, U808-13 Q6, U810-8 D6, U810-13 Q6, U812-8 D6, U812-13 Q6, U814-8 D6, U814-13 Q6, U816-8 D6, U816-13 Q6, U818-8 D6, U818-13 Q6, U820-8 D6, U820-13 Q6, U822-8 D6, U822-13 Q6 |  |
| `KO7` | U806-11 B7, U808-9 D7, U808-12 Q7, U810-9 D7, U810-12 Q7, U812-9 D7, U812-12 Q7, U814-9 D7, U814-12 Q7, U816-9 D7, U816-12 Q7, U818-9 D7, U818-12 Q7, U820-9 D7, U820-12 Q7, U822-9 D7, U822-12 Q7 |  |

**Boşta kalan çıkışlar (bağlanmaz):** U801-7 ~Y7, U801-9 ~Y6, U801-10 ~Y5, U801-12 ~Y3, U801-13 ~Y2, U801-14 ~Y1, U801-15 ~Y0
<!-- otomatik: bitti -->
