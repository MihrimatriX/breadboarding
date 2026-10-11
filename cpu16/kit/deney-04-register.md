# Deney 4: Register dosyası ve veriyolu

> **Video:** "Sekiz register, tek veriyolu: üç durumlu çıkışlar" · **Önce:** Deney 1 · **Kart:** CPU kartı, "Register dosyası" bloğu (23 entegre)

## Ne öğreneceksin

- Ortak bir veriyolunu birçok kaynağın paylaşması: üç durumlu (tri-state) çıkışlar ve "aynı anda tek sürücü" kuralı.
- 74HC574 ile register: saatin yükselen kenarında veriyolunu yakalar, `~OE` ile veriyoluna geri verir.
- 74HC138 kod çözücüyle 8 register'dan birini seçmek; komut kelimesinin alanlarından (rd, rs1, rs2) register numarası üretmek.
- Kapılı saat: yalnızca seçili register'ın saati çalışır (74HC02 NOR).

## Nasıl çalışır

CPU16'nın 8 adet 16 bit register'ı (r0–r7; r6 = SP, r7 = LR) var. Her register iki 74HC574'tür (düşük ve
yüksek bayt); girişleri de çıkışları da 16 bitlik iç veriyoluna (`BUS0..BUS15`) bağlıdır.

- **Hangi register?** Üç 74HC151 (U14–U16) register indeksini (`RIDX0..2`) kontrol kelimesinin `RSEL`
  alanına (`CW3..CW5`) göre seçer: 0 = rd (`IR11..IR9`), 1 = rs1 (`IR8..IR6`), 2 = rs2 (`IR5..IR3`),
  3 = SP (6), 4 = LR (7).
- **Yazma:** U17 (74HC138) `RIDX`'i çözer, `CW16` (REG_W) 1 iken seçili register'ın `~WSEL` hattı 0 olur.
  Register saati = NOR(`~WSEL`, `~CLKR`): `~CLKR` düşünce (ana saat yükselince) yalnızca o register yüklenir.
- **Okuma:** U18 (74HC138) aynı indeksi çözer; `~SRC_REG` 0 iken seçili register'ın `~OE`'si açılır ve
  değerini veriyoluna verir.
- **Veriyolu çekme direnci** (RN1, RN2): hiçbir şey sürmezken veriyolu 0 okunur.

## Kurulum adımları

1. Yardımcı modüller: 16 bit anahtar girişi `BUS0..15`'e (2,2 kΩ ile), 16 LED gösterge `BUS0..15`'e.
2. U14–U16 (74HC151), U17–U18 (74HC138), U133–U134 (74HC02; kapı numaraları aşağıda), RN1–RN2.
3. 16 × 74HC574 (U19–U34): her register'ın iki çipi yan yana, aynı saat ve `~OE`.
4. Elle sürülecek girişler (tablonun sonunda): `CW3..CW5` ve `CW16`, `IR3..IR11` anahtarlara; `~SRC_REG`
   bir anahtara (10 kΩ ile 1'e çekili); `~CLKR` için Deney 1'in saat kartı ADIM kipinde, CLK'yi bir
   74HC04 ile ters çevirip `~CLKR`'ye ver (geçici saat sürücüsü; Deney 7'de kontrol bloğu üretir).

## Test: beklenen sonuç

1. **Yazma:** anahtarlarda `0x1234`, `RSEL` = 000, `IR11..9` = 011 (r3), `CW16` = 1, `~SRC_REG` = 1 → ADIM.
2. Anahtarları başka değerlerle tekrarla: r0'a `0xAAAA`, r7'ye `0x5555`.
3. **Okuma:** anahtarları 0'a al, `CW16` = 0, `~SRC_REG` = 0, `IR11..9` = 011 → LED'ler `0x1234`.
   r0 ve r7'yi de oku. `RSEL` = 011 (SP) seçince `IR`'den bağımsız r6, 100 (LR) seçince r7 okunur.
4. `~SRC_REG` = 0 iken anahtarları değiştir: LED'ler değişmez, çünkü register 2,2 kΩ'luk anahtarları ezer.

## Simülatörde

- 3D: "CPU16 kartı 3D" → Register dosyası bloğu; `kart.program("fib")`, `kart.hiz(5)`, `kart.calistir()`,
  bir register çipine tıkla: pinlerin canlı seviyeleri ve içindeki flip-floplar. `kart.secNet("BUS0")` veriyolunu
  sürenleri gösterir.
- Komut seviyesinde: `npm run cpu16 -- run cpu16/programs/fib.s --trace` her komuttan sonra r0–r7'yi yazar.

## Sorun giderme

| Belirti | Bak |
|---|---|
| Okumada LED'ler anahtarı gösteriyor | `~OE` hattı (`~ROEn`) ya da U18'in `~E1` = `~SRC_REG` |
| Birden çok register aynı anda yükleniyor | U17'nin `E3` = `CW16`; NOR girişleri `~WSELn` ve `~CLKR` |
| Okunan değer kayık (bitler karışık) | düşük/yüksek bayt çiplerinin D/Q sırası: D0 ↔ BUS0 … D7 ↔ BUS7 (yüksek baytta BUS8..15) |
| Değer kendi kendine değişiyor | `~CLKR` sıçrıyor; saat kartını ADIM kipinde kullan |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
<!-- otomatik: bitti -->
