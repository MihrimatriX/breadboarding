# Deney 2: Kapılar ve CMOS transistörler

> **Video:** "NAND'ın içine giriyoruz: dört transistörden bilgisayara" · **Önce:** Deney 1 (besleme) · **Kart:** yok (ayrı breadboard)

## Ne öğreneceksin

- Bir 74HC entegresinin içinde ne olduğunu: her kapı P ve N kanallı MOSFET çiftlerinden oluşur.
- NAND'ın evrenselliği: NOT, AND, OR ve XOR'u yalnızca NAND'dan kurmayı.
- CMOS girişinin neden asla boşta bırakılmadığını (yüzen giriş, çift iletim, ısınma).

## Nasıl çalışır

CMOS NAND: çıkışla VCC arasında **paralel** iki P-MOSFET, çıkışla GND arasında **seri** iki N-MOSFET.
Girişlerden biri 0 ise P'lerden biri iletir, çıkış 1 olur; ikisi de 1 ise yalnızca seri N'ler iletir,
çıkış 0 olur. Bir an bile hem yukarı hem aşağı yol açık olmadığı için CMOS durağan halde neredeyse
akım çekmez. 74HC00 dört NAND = 16 transistördür (aşağıdaki tablo kütüphanedeki modelden üretilmiştir).

## Kurulum adımları

1. 74HC00'ü tak, VCC (14) ve GND (7), 100 nF.
2. 1A ve 1B'yi iki anahtara (10 kΩ çekme direnciyle), 1Y'yi gösterge modülünün bir LED'ine bağla.
   Doğruluk tablosunu doldur.
3. Kalan üç kapıyla NOT (iki girişi birleştir), AND (NAND + NOT) ve OR (girişleri ters çevrilmiş NAND)
   kur. Kullanmadığın girişleri GND'ye bağla.
4. İsteğe bağlı, transistörle NAND: 2 × BS250 (P-MOSFET) paralel VCC'den çıkışa, 2 × 2N7000
   (N-MOSFET) seri çıkıştan GND'ye; kapılar girişlere, çıkışa 100 kΩ yük ve LED sürmek için 74HC04.
5. Yüzen giriş deneyi: 1A'yı boşta bırak, parmağını yaklaştır; çıkışın rastgele değiştiğini ve
   entegrenin akımının arttığını multimetreyle gör. Sonra girişi bağla.

## Test: beklenen sonuç

- NAND tablosu aşağıdaki tabloyla aynı; NOT/AND/OR kendi tablolarını verir.
- MOSFET'li NAND da aynı tabloyu verir.

## Simülatörde

- 3D: Silikon3D → "CPU16 kartı 3D" → herhangi bir 74HC00'e tıkla (ör. `kart.cipler()` listesinden),
  bir kapıya tıkla: CMOS şemasında 4 transistör ve her düğümün canlı seviyesi görünür. Program
  çalışırken transistörlerin iletim/kesim durumu değişir.
- `npm run cpu16 -- chips`: kütüphanedeki her entegrenin kapı ve transistör sayısı.
- Silikon3D'nin 6502 görünümü aynı fikrin 3510 transistörlük bir işlemcide nasıl göründüğünü gösterir.

## Sorun giderme

| Belirti | Bak |
|---|---|
| Çıkış hep 1 | VCC/GND ters; giriş anahtarlarının çekme direnci |
| Entegre ısınıyor | çıkışı doğrudan VCC'ye ya da GND'ye bağladın |
| MOSFET'li NAND'ın çıkışı ara seviyede | P ve N MOSFET'ler yer değiştirmiş; BS250'nin kaynağı VCC'de olmalı |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
#### 74HC00: 4 × 2 girişli NAND

Kılıf DIP-14, kapı seviyesinde 4 kapı, CMOS açılımında 16 transistör.

| Pin | Ad | Yön |
|---|---|---|
| 1 | 1A | giriş |
| 2 | 1B | giriş |
| 3 | 1Y | çıkış |
| 4 | 2A | giriş |
| 5 | 2B | giriş |
| 6 | 2Y | çıkış |
| 7 | GND | besleme |
| 8 | 3Y | çıkış |
| 9 | 3A | giriş |
| 10 | 3B | giriş |
| 11 | 4Y | çıkış |
| 12 | 4A | giriş |
| 13 | 4B | giriş |
| 14 | VCC | besleme |

Birim 1'in doğruluk tablosu (kapı modeli çalıştırılarak üretildi):

| 1A | 1B | 1Y |
|---|---|---|
| 0 | 0 | 1 |
| 0 | 1 | 1 |
| 1 | 0 | 1 |
| 1 | 1 | 0 |
<!-- otomatik: bitti -->
