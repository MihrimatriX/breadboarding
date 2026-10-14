# Deney 3: EEPROM programlayıcı

> **Video:** "Kendi ROM programlayıcımızı yapıyoruz" · **Önce:** Deney 1 (besleme) · **Kart:** programlayıcı (`prog`, 3 entegre + Arduino Nano)

Bilgisayarın kalıcı belleği 28C256'dır: 32 KB'lık, 5 V ile yazılan paralel bir EEPROM. Bellek
kartında BIOS'u (Deney 8'den önce deneme programlarını), video kartında karakter ROM'unu tutar. Bu
deneyde onu bilgisayardan programlayan aleti kurarız: bir Arduino Nano, iki kaydırmalı register ve
bir ZIF soket.

## Ne öğreneceksin

- Paralel bir belleğe az pinle erişmeyi: iki 74HC595 kaydırmalı register ile 15 adres biti.
- EEPROM'un nasıl yazıldığını: bayt ya da en çok 64 baytlık bir sayfa çipin tamponuna yüklenir, çip
  onu kendi içinde ≈ 5–10 ms'de yazar. Silme gerekmez: her bayt doğrudan yeni değerini alır.
- Yazma sürerken çipin durum bildirmesini: okunan baytın D7'si son yazılanın tersidir (**DATA
  yoklaması**), D6 her okumada değişir (**toggle biti**).
- **Yazılım veri koruması (SDP)**: `AA → 5555`, `55 → 2AAA`, `A0 → 5555` dizisinden sonra gelen baytlar
  yazılır, bu dizi olmadan gelen yazmalar yok sayılır. Bilgisayardaki BIOS çipi korumalıdır: çalışan bir
  programın yanlışlıkla yaptığı yazma BIOS'u bozamaz.
- Zamanlamanın önemini: bir sayfanın baytları arasında en çok 150 µs (tBLC) olabilir. Arduino'nun
  `digitalWrite`'ı ≈ 3,5 µs sürer; bir bayt 60 pin işlemidir (≈ 210 µs) ve sınırı aşar. Yazılım bu
  yüzden pinleri port register'larıyla sürer (≈ 0,3 µs; bayt başına ≈ 20 µs).
- Intel HEX biçimini ve doğrulamayı (sağlama toplamı, okuyup karşılaştırma).

## Nasıl çalışır

Arduino adresi D2/D3/D4 üzerinden 595'lere kaydırır (U1 = A0..A7, U2 = A8..A14). Veri D5..D12
üzerinden iki yönlüdür. `~OE`, `~WE`, `~CE` Arduino'nun A1..A3 pinleridir. Bilgisayardaki `yaz.py`
HEX dosyasını satır satır gönderir. Arduino her satırı 64 baytlık sayfa sınırlarında parçalar,
çipte zaten aynı olan parçayı atlar, kalanı korumalı sayfa yazmasıyla (`AA 55 A0` + baytlar) yükler,
DATA yoklamasıyla yazmanın bitmesini bekler ve geri okuyup karşılaştırır.

| Komut | Yanıt | İş |
|---|---|---|
| `SDP` | `OK SDP 1` / `OK SDP 0` | yazma koruması açık mı |
| `SDP 1` / `SDP 0` | `OK` | korumayı aç / kapat |
| `:10000000…` | `OK` / `ERR …` | Intel HEX satırı (`0000–7FFF`) |
| `READ a n` / `SUM a n` | döküm / `OK SUM xxxx` | okuma, doğrulama |

Protokolün tamamı `cpu16/programlayici/cpu16-programlayici/cpu16-programlayici.ino`'nun başında.

## Kurulum adımları

1. Arduino Nano'yu breadboard'a, ZIF-28 soketi yanına tak. U1 ve U2 (74HC595) zincirlenir: U1'in `Q7S`'i
   U2'nin `DS`'ine. U2'nin Q7'si boştur (28C256'da A15 yok).
2. Bağlantıları aşağıdaki tablodan yap (Arduino pinleri `A1.n` = Nano'nun n. bacağı, adları tabloda).
3. Arduino IDE ile `cpu16/programlayici/cpu16-programlayici/cpu16-programlayici.ino`'yu yükle.
   Seri monitörde (115200) `CPU16 programlayici v2 (28C256) hazir` görmelisin.
4. Bir 28C256 tak (çentik ZIF kolunun tarafında) ve korumayı sor:
   `python3 cpu16/programlayici/yaz.py PORT --koruma` → yeni çipte `yazma koruması: kapalı`.
   (PORT: Linux `/dev/ttyUSB0`, macOS `/dev/cu.usbserial-…`, Windows `COM5`; `pip install pyserial`.)
5. İlk çip olarak karakter ROM'unu yaz (Deney 11'de video kartına takılır), üzerine etiket yapıştır:

   ```
   npm run cpu16 -- charrom -o charrom.hex
   python3 cpu16/programlayici/yaz.py PORT charrom.hex --dogrula
   python3 cpu16/programlayici/yaz.py PORT --koruma          # artık: açık
   ```

   CPU kartında ROM yok (mikrokod ve ALU kod çözme 74HC kapılarıyla kurulu, Deney 5 ve 7). Bellek
   kartının EEPROM'u Deney 8'de (deneme programı) ve Deney 12'de (BIOS) yazılır.

## Test: beklenen sonuç

- `--dogrula` her parça için `OK SUM` değerini bilgisayarın hesabıyla karşılaştırır ve `tamam, doğrulandı` yazar.
- Yazmadan sonra `--koruma` `açık` der: programlayıcı her sayfayı korumalı yazar. Korumayı kapatmak
  gerekirse (çipi başka bir programlayıcıda yazmak için) `--koruma-kapat`.
- Aynı dosyayı ikinci kez yazmak çok hızlıdır: çipte zaten aynı olan satırlar yazılmaz.

## Simülatörde

Bu deneyin yazılımı gerçekten test edilir: `npx vitest run cpu16/tests/programmer.test.ts`
Arduino kodunun kendisini bilgisayarda derler (sahte Arduino çekirdeği ile), pinlerini programlayıcı
kartının **kapı seviyesi** modeline (2 × 74HC595 + 28C256) bağlar. 28C256 modeli veri sayfasının
zamanlamasını uygular (tBLC, yazma döngüsü, DATA yoklaması, toggle biti, SDP); her pin işlemi 1 µs
sayılır, gerçek karttan yavaştır. Test `yaz.py`'nin ürettiği komutlarla Deney 8'in programını eski
içerikli, korumalı bir çipe yazar ve doğrular; koruma komutlarını, sayfa sınırını aşan bir satırı ve
hatalı satırları dener. Kuru çalıştırma: `python3 cpu16/programlayici/yaz.py --kuru charrom.hex --dogrula`.

## Sorun giderme

| Belirti | Bak |
|---|---|
| `ERR aaaa yazma zaman asimi` | DATA yoklaması bitmiyor: `~OE` (A1) ile okuma çalışıyor mu (`READ 0 10`); çip doğru yönde, 5 V'ta mı |
| `ERR aaaa istenen xx okunan yy (yazilamadi)` | Bayt yazılmıyor: `~WE` (A2) ve `~CE` (A3) bağlantıları; okunan hep `FF` ise çip yanıt vermiyor |
| Yeni çipte `--koruma` `açık` diyor, yazma da olmuyor | Koruma sorgusu bir yazmanın sonucuna bakar: `~WE` bağlı değilse çip korumalı görünür |
| Yazılan veri kayık | 595 sırası (U1 düşük bayt), SRCLK/RCLK yer değiştirmiş |
| `4000–7FFF` yanlış, altı doğru | A14 = U2'nin Q6'sı, 28C256'nın 1. bacağı |
| Sayfanın yalnız ilk baytları yazılıyor | Baytlar arası 150 µs'yi aşıyor: yazılım Nano'da (AVR) port register yoluyla derlenmeli; başka bir kartta `digitalWrite` yolu yavaştır |
| Port açılınca Arduino yeniden başlıyor | normal: `yaz.py` 2 s bekler |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
#### Malzeme (3 entegre, 5 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 28C256 | 1 | U3 | 32 KB paralel EEPROM (32K × 8, 5 V, bayt/sayfa yazma; 62256 ile aynı bacak düzeni) | GND 14, VCC 28 |
| 74HC595 | 2 | U1 U2 | 8 bit seri giriş / paralel çıkış kaydırmalı register (çıkış mandallı) | GND 8, VCC 16 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| ARDUINO_NANO | 1 | A1 | Arduino Nano (ATmega328P, USB seri) |
| C_100N | 3 | C2 C3 C4 | 100 nF seramik kondansatör (dekuplaj) |
| C_100U | 1 | C1 | 100 µF elektrolitik kondansatör (kart girişi) |

#### Bağlantılar (30 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **GND** | U1-13 ~OE, U2-13 ~OE | sabit seviye |
| **VCC** | U1-10 ~MR, U2-10 ~MR | sabit seviye |
| `~FCE` | A1.22, U3-20 ~CE |  |
| `~FOE` | A1.20, U3-22 ~OE |  |
| `~FWE` | A1.21, U3-27 ~WE |  |
| `FA0` | U1-15 Q0, U3-10 A0 |  |
| `FA1` | U1-1 Q1, U3-9 A1 |  |
| `FA2` | U1-2 Q2, U3-8 A2 |  |
| `FA3` | U1-3 Q3, U3-7 A3 |  |
| `FA4` | U1-4 Q4, U3-6 A4 |  |
| `FA5` | U1-5 Q5, U3-5 A5 |  |
| `FA6` | U1-6 Q6, U3-4 A6 |  |
| `FA7` | U1-7 Q7, U3-3 A7 |  |
| `FA8` | U2-15 Q0, U3-25 A8 |  |
| `FA9` | U2-1 Q1, U3-24 A9 |  |
| `FA10` | U2-2 Q2, U3-21 A10 |  |
| `FA11` | U2-3 Q3, U3-23 A11 |  |
| `FA12` | U2-4 Q4, U3-2 A12 |  |
| `FA13` | U2-5 Q5, U3-26 A13 |  |
| `FA14` | U2-6 Q6, U3-1 A14 |  |
| `FD0` | A1.8, U3-11 IO0 |  |
| `FD1` | A1.9, U3-12 IO1 |  |
| `FD2` | A1.10, U3-13 IO2 |  |
| `FD3` | A1.11, U3-15 IO3 |  |
| `FD4` | A1.12, U3-16 IO4 |  |
| `FD5` | A1.13, U3-17 IO5 |  |
| `FD6` | A1.14, U3-18 IO6 |  |
| `FD7` | A1.15, U3-19 IO7 |  |
| `RCLK` | A1.7, U1-12 STCP, U2-12 STCP |  |
| `SER` | A1.5, U1-14 DS |  |
| `SER2` | U1-9 Q7S, U2-14 DS |  |
| `SRCLK` | A1.6, U1-11 SHCP, U2-11 SHCP |  |

**Boşta kalan çıkışlar (bağlanmaz):** U2-7 Q7, U2-9 Q7S
<!-- otomatik: bitti -->
