# Deney 3: Flash programlayıcı

> **Video:** "Kendi ROM programlayıcımızı yapıyoruz" · **Önce:** Deney 1 (besleme) · **Kart:** programlayıcı (`prog`, 3 entegre + Arduino Nano)

## Ne öğreneceksin

- Paralel bir Flash belleğe az pinle erişmek: iki 74HC595 kaydırmalı register ile 16 adres biti.
- Flash'ın neden "komutla" yazıldığını: SST39SF010A'nın kilit açma dizileri (AA → 5555, 55 → 2AAA, …),
  silme (bitler yalnızca 1 → 0 yazılabilir), DQ7 veri yoklaması.
- Intel HEX biçimi ve doğrulama (sağlama toplamı, okuyup karşılaştırma).

## Nasıl çalışır

Arduino adresi D2/D3/D4 üzerinden 595'lere kaydırır (U1 = A0..A7, U2 = A8..A15), A16'yı A0 pininden
doğrudan verir. Veri D5..D12 üzerinden iki yönlüdür. `~CE`, `~OE`, `~WE` Arduino'nun A1..A3
pinleridir. Bilgisayardaki `yaz.py` HEX dosyasını satır satır gönderir; Arduino her satırı yazar,
her baytı DQ7 yoklamasıyla bekler ve geri okuyup karşılaştırır.

| Komut | Yanıt | İş |
|---|---|---|
| `ID` | `OK ID BF B5` | üretici (SST) ve aygıt (39SF010A) kodu |
| `ERASE` / `SECTOR a` | `OK` | bütün çip / 4 KB sektör silme |
| `:10000000…` | `OK` / `ERR …` | Intel HEX satırı (04 kaydıyla 64 KB üstü) |
| `READ a n` / `SUM a n` | döküm / `OK SUM xxxx` | okuma, doğrulama |

Protokolün tamamı: `cpu16/programlayici/cpu16-programlayici/cpu16-programlayici.ino` başı.

## Kurulum adımları

1. Arduino Nano'yu breadboard'a, ZIF-32 soketi yanına tak. U1 ve U2 (74HC595) zincir: U1'in `Q7S`'i
   U2'nin `DS`'ine.
2. Bağlantıları aşağıdaki tablodan yap (Arduino pinleri `A1.n` = Nano'nun n. bacağı, adları tabloda).
3. Arduino IDE ile `cpu16/programlayici/cpu16-programlayici/cpu16-programlayici.ino`'yu yükle.
   Seri monitörde (115200) `CPU16 programlayici v1 hazir` görmelisin.
4. Boş bir SST39SF010A tak: `python3 cpu16/programlayici/yaz.py PORT --id` → `OK ID BF B5`.
   (PORT: Linux `/dev/ttyUSB0`, macOS `/dev/cu.usbserial-…`, Windows `COM5`; `pip install pyserial`.)
5. Bir deneme imajı yaz ve doğrula (karakter ROM'u; Deney 11'de video kartına takılır):

   ```
   npm run cpu16 -- charrom -o charrom.hex
   python3 cpu16/programlayici/yaz.py PORT charrom.hex --sil --dogrula
   ```

   CPU kartında ROM yok (mikrokod ve ALU kod çözme 74HC kapılarıyla kurulu, Deney 5 ve 7). Programlayıcı
   bellek kartının Flash'ı (Deney 8'de deneme programı, Deney 12'de BIOS) ve video kartının karakter ROM'u
   (Deney 11) için lazım. Programlanmış çipleri etiketle.

## Test: beklenen sonuç

- `--id` doğru kodu verir; `--dogrula` her parça için `OK SUM` değerini bilgisayarın hesabıyla eşler ve
  `tamam, doğrulandı` yazar.
- Silinmemiş bir çipe yazmaya çalışınca `ERR … (once silin)` döner (bit 0 → 1 yazılamaz).

## Simülatörde

Bu deneyin yazılımı gerçekten test edilir: `npx vitest run cpu16/tests/programmer.test.ts`
Arduino kodunun kendisini bilgisayarda derler (sahte Arduino çekirdeği ile), pinlerini programlayıcı
kartının **kapı seviyesi** modeline (2 × 74HC595 + SST39SF010A) bağlar ve `yaz.py`'nin ürettiği
komutlarla bir imajı siler, yazar ve doğrular. Gerçek kartta takılırsan aynı komutları simülasyonda
dene. Kuru çalıştırma: `python3 cpu16/programlayici/yaz.py --kuru charrom.hex --sil`.

## Sorun giderme

| Belirti | Bak |
|---|---|
| `ID` yanlış ya da `FF FF` | `~CE`/`~OE`/`~WE` bağlantıları, çipin yönü (1. bacak çentik tarafı), 5 V |
| Yazılan veri kayık | 595 sırası (U1 düşük bayt), SRCLK/RCLK yer değiştirmiş |
| 64 KB üstü yanlış | A16 = Arduino A0 pini |
| Port açılınca Arduino yeniden başlıyor | normal: `yaz.py` 2 s bekler |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
#### Malzeme (3 entegre, 5 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 74HC595 | 2 | U1 U2 | 8 bit seri giriş / paralel çıkış kaydırmalı register (çıkış mandallı) | GND 8, VCC 16 |
| SST39SF010A | 1 | U3 | 128 KB Flash (128K × 8, 5 V, komutla programlanır) | VSS 16, VDD 32 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| ARDUINO_NANO | 1 | A1 | Arduino Nano (ATmega328P, USB seri) |
| C_100N | 3 | C2 C3 C4 | 100 nF seramik kondansatör (dekuplaj) |
| C_100U | 1 | C1 | 100 µF elektrolitik kondansatör (kart girişi) |

#### Bağlantılar (32 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **GND** | U1-13 ~OE, U2-13 ~OE | sabit seviye |
| **VCC** | U1-10 ~MR, U2-10 ~MR | sabit seviye |
| `~FCE` | A1.22, U3-22 ~CE |  |
| `~FOE` | A1.20, U3-24 ~OE |  |
| `~FWE` | A1.21, U3-31 ~WE |  |
| `FA0` | U1-15 Q0, U3-12 A0 |  |
| `FA1` | U1-1 Q1, U3-11 A1 |  |
| `FA2` | U1-2 Q2, U3-10 A2 |  |
| `FA3` | U1-3 Q3, U3-9 A3 |  |
| `FA4` | U1-4 Q4, U3-8 A4 |  |
| `FA5` | U1-5 Q5, U3-7 A5 |  |
| `FA6` | U1-6 Q6, U3-6 A6 |  |
| `FA7` | U1-7 Q7, U3-5 A7 |  |
| `FA8` | U2-15 Q0, U3-27 A8 |  |
| `FA9` | U2-1 Q1, U3-26 A9 |  |
| `FA10` | U2-2 Q2, U3-23 A10 |  |
| `FA11` | U2-3 Q3, U3-25 A11 |  |
| `FA12` | U2-4 Q4, U3-4 A12 |  |
| `FA13` | U2-5 Q5, U3-28 A13 |  |
| `FA14` | U2-6 Q6, U3-29 A14 |  |
| `FA15` | U2-7 Q7, U3-3 A15 |  |
| `FA16` | A1.19, U3-2 A16 |  |
| `FD0` | A1.8, U3-13 DQ0 |  |
| `FD1` | A1.9, U3-14 DQ1 |  |
| `FD2` | A1.10, U3-15 DQ2 |  |
| `FD3` | A1.11, U3-17 DQ3 |  |
| `FD4` | A1.12, U3-18 DQ4 |  |
| `FD5` | A1.13, U3-19 DQ5 |  |
| `FD6` | A1.14, U3-20 DQ6 |  |
| `FD7` | A1.15, U3-21 DQ7 |  |
| `RCLK` | A1.7, U1-12 STCP, U2-12 STCP |  |
| `SER` | A1.5, U1-14 DS |  |
| `SER2` | U1-9 Q7S, U2-14 DS |  |
| `SRCLK` | A1.6, U1-11 SHCP, U2-11 SHCP |  |

**Boşta kalan çıkışlar (bağlanmaz):** U2-9 Q7S
<!-- otomatik: bitti -->
