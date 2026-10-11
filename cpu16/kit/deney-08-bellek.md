# Deney 8: Bellek kartı ve ilk program

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
#### Malzeme (5 entegre, 6 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 74HC04 | 1 | U307 | 6 × NOT (evirici) | GND 7, VCC 14 |
| 74HC32 | 1 | U306 | 4 × 2 girişli OR | GND 7, VCC 14 |
| 74HC574 | 1 | U305 | 8 bit D flip-flop register (üç durumlu çıkış) | GND 10, VCC 20 |
| 74HC688 | 2 | U301 U302 | 8 bit eşitlik karşılaştırıcı | GND 10, VCC 20 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| C_100N | 5 | C302 C303 C306 C307 C308 | 100 nF seramik kondansatör (dekuplaj) |
| C_100U | 1 | C301 | 100 µF elektrolitik kondansatör (kart girişi) |

Yapıştırıcı lojik çiplerinin kapıları bloklara dağılmıştır; bu deneyde kullanılan kapılar:

- **U306** (74HC32, bu deneyde takılır): 1. kapı (UART seçimi); 2. kapı (UART adresine RAM yazılmaz); 3. kapı (UART yazma kenarı)
- **U307** (74HC04, bu deneyde takılır): 1. kapı (UART seçimi)

#### Bağlantılar (29 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **GND** | U301-1 ~E, U301-3 Q0, U301-5 Q1, U301-7 Q2, U301-9 Q3, U301-12 Q4, U301-14 Q5, U301-16 Q6, U302-1 ~E, U302-17 P7, U302-18 Q7, U305-1 ~OE, U306-12 4A, U306-13 4B, U307-3 2A, U307-5 3A, U307-9 4A, U307-11 5A, U307-13 6A | sabit seviye |
| **VCC** | U301-18 Q7, U302-3 Q0, U302-5 Q1, U302-7 Q2, U302-9 Q3, U302-12 Q4, U302-14 Q5, U302-16 Q6 | sabit seviye |
| `~MWE_E` | U306-4 2A, U306-9 3A | arka panel 42 · önceki: Deney 6 |
| `~UA_HI` | U302-19 ~EQ, U306-2 1B |  |
| `~UA_LO` | U301-19 ~EQ, U306-1 1A |  |
| `~UART_SEL` | U306-3 1Y, U306-10 3B, U307-1 1A |  |
| `A1` | U301-2 P0 | arka panel 10 · önceki: Deney 6 |
| `A2` | U301-4 P1 | arka panel 11 · önceki: Deney 6 |
| `A3` | U301-6 P2 | arka panel 12 · önceki: Deney 6 |
| `A4` | U301-8 P3 | arka panel 13 · önceki: Deney 6 |
| `A5` | U301-11 P4 | arka panel 14 · önceki: Deney 6 |
| `A6` | U301-13 P5 | arka panel 15 · önceki: Deney 6 |
| `A7` | U301-15 P6 | arka panel 16 · önceki: Deney 6 |
| `A8` | U301-17 P7 | arka panel 17 · önceki: Deney 6 |
| `A9` | U302-2 P0 | arka panel 18 · önceki: Deney 6 |
| `A10` | U302-4 P1 | arka panel 19 · önceki: Deney 6 |
| `A11` | U302-6 P2 | arka panel 20 · önceki: Deney 6 |
| `A12` | U302-8 P3 | arka panel 21 · önceki: Deney 6 |
| `A13` | U302-11 P4 | arka panel 22 · önceki: Deney 6 |
| `A14` | U302-13 P5 | arka panel 23 · önceki: Deney 6 |
| `A15` | U302-15 P6 | arka panel 24 · önceki: Deney 6 |
| `DE0` | U305-2 D0 | arka panel 25 · önceki: Deney 6 |
| `DE1` | U305-3 D1 | arka panel 26 · önceki: Deney 6 |
| `DE2` | U305-4 D2 | arka panel 27 · önceki: Deney 6 |
| `DE3` | U305-5 D3 | arka panel 28 · önceki: Deney 6 |
| `DE4` | U305-6 D4 | arka panel 29 · önceki: Deney 6 |
| `DE5` | U305-7 D5 | arka panel 30 · önceki: Deney 6 |
| `DE6` | U305-8 D6 | arka panel 31 · önceki: Deney 6 |
| `DE7` | U305-9 D7 | arka panel 32 · önceki: Deney 6 |
| `UART_CP` | U305-11 CP, U306-8 3Y |  |
| `UART_SEL` | U306-5 2B, U307-2 1Y |  |

**Boşta kalan çıkışlar (bağlanmaz):** U305-12 Q7, U305-13 Q6, U305-14 Q5, U305-15 Q4, U305-16 Q3, U305-17 Q2, U305-18 Q1, U305-19 Q0, U306-6 2Y, U306-11 4Y, U307-4 2Y, U307-6 3Y, U307-8 4Y, U307-10 5Y, U307-12 6Y
<!-- otomatik: bitti -->
