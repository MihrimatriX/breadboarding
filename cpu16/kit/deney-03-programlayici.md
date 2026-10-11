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
5. ROM'ları yaz ve etiketle (sonraki deneylerde lazım):

   ```
   python3 cpu16/programlayici/yaz.py PORT cpu16/roms/alu-0.hex --sil --dogrula        # Deney 5
   … alu-1, alu-2
   python3 cpu16/programlayici/yaz.py PORT cpu16/roms/mikrokod-0.hex --sil --dogrula   # Deney 7
   … mikrokod-1, -2, -3
   ```

   Hangi çipin hangi sokete gideceği ilgili deneyin malzeme bölümünde yazar.

## Test: beklenen sonuç

- `--id` doğru kodu verir; `--dogrula` her parça için `OK SUM` değerini bilgisayarın hesabıyla eşler ve
  `tamam, doğrulandı` yazar.
- Silinmemiş bir çipe yazmaya çalışınca `ERR … (once silin)` döner (bit 0 → 1 yazılamaz).

## Simülatörde

Bu deneyin yazılımı gerçekten test edilir: `npx vitest run cpu16/tests/programmer.test.ts`
Arduino kodunun kendisini bilgisayarda derler (sahte Arduino çekirdeği ile), pinlerini programlayıcı
kartının **kapı seviyesi** modeline (2 × 74HC595 + SST39SF010A) bağlar ve `yaz.py`'nin ürettiği
komutlarla bir ALU ROM'unu siler, yazar ve doğrular. Gerçek kartta takılırsan aynı komutları
simülasyonda dene. Kuru çalıştırma: `python3 cpu16/programlayici/yaz.py --kuru cpu16/roms/alu-0.hex --sil`.

## Sorun giderme

| Belirti | Bak |
|---|---|
| `ID` yanlış ya da `FF FF` | `~CE`/`~OE`/`~WE` bağlantıları, çipin yönü (1. bacak çentik tarafı), 5 V |
| Yazılan veri kayık | 595 sırası (U1 düşük bayt), SRCLK/RCLK yer değiştirmiş |
| 64 KB üstü yanlış | A16 = Arduino A0 pini |
| Port açılınca Arduino yeniden başlıyor | normal: `yaz.py` 2 s bekler |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
<!-- otomatik: bitti -->
