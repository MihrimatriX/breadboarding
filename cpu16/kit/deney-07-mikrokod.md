# Deney 7: Mikrokod ve kontrol birimi

> **Video:** "Mikrokod: CPU'nun içindeki küçük program" · **Önce:** Deney 3 (mikrokod ROM'ları), 4–6 · **Kart:** CPU kartının kalanı: "Kontrol", "Sabit birimi" ve yapıştırıcı lojik

Bu deneyin sonunda CPU kartı tamamdır: elle sürdüğün bütün `CW` anahtarlarını çıkarırsın, artık
onları mikrokod sürer.

## Ne öğreneceksin

- Bir komutun mikro adımlara bölünmesi ve her adımın 32 bitlik bir **kontrol kelimesi** olması.
- Mikrokod ROM'unun adresi: mikro adım sayacı + komutun op ve f3 alanları + koşul + kesme biti (13 bit).
- Kontrol kelimesini düşen kenarda bir register'a (CR) almak: sinyaller yükselen kenara kadar sabit, parazitsiz.
- HALT, yasadışı komut (FAULT) ve kesmeyle (IRQ) uyanma.

## Nasıl çalışır

- **Mikro adım sayacı** (74HC161): her saatte +1, kontrol kelimesinde `END` (CW31) varsa 0'a döner.
- **Mikrokod ROM'ları** (4 × SST39SF010A, `mikrokod-0..3.hex`): adres
  `[STEP0..3, COND, IR0..2 (f3), IR12..15 (op), INT]`, çıkış 4 × 8 = 32 kontrol biti.
- **Kontrol register'ı** (4 × 74HC574) ROM çıkışını CLK'nin düşen kenarında alır: `CW0..CW31`.
- `CW0..2` bir 74HC138 ile veriyolu sürücüsünü seçer (`~SRC_REG/ALU/PC/MEM/IMM/FLAGS`): aynı anda tek sürücü
  donanımla garanti edilir.
- **Sabit birimi** (16 × 74HC151): komut kelimesinden 8 biçimden birini çıkarır (IMM6, IMM6×2, IMM8, IMM9,
  OFF8×2, OFF12×2, 2, 4), `~SRC_IMM` ile veriyoluna.
- **Çalışma izni:** HALT ya da FAULT'ta `RUN_R` düşer, kapılı saat (`CLKR`) durur. `IRQ` ∧ I bayrağı CPU'yu uyandırır;
  adım 0'da kesme varsa ROM adresinin `INT` biti 1 olur ve mikrokod kesme girişini çalıştırır.

Mikrokodun okunur kaynağı `cpu16/micro/cpu16.ucode`; `npm run cpu16 -- ucode` ROM imajlarını üretir.

## Kurulum adımları

1. Geçici saat sürücüsünü ve bütün `CW`/`~SRC` anahtarlarını çıkar.
2. Mikro adım sayacı, adım çözücü, 4 mikrokod ROM'u (etiketlerine dikkat) ve 4 kontrol register'ı.
3. Veriyolu kaynağı çözücü, INT/HALT ve FAULT/çalışma izni flip-flopları, HALTED ve FAULT LED'leri.
4. Sabit birimi ve sabit → veriyolu tamponları.
5. Kalan yapıştırıcı kapılar (aşağıdaki listede "bu deneyde takılır" olanlar ve önceki çiplerin boş kapıları).
6. `IRQ` girişini 10 kΩ ile GND'ye çek (G/Ç kartı Deney 10'da sürer). Sahte bellek (Deney 6) hâlâ takılı.

## Test: beklenen sonuç

| Sahte bellek | Beklenen |
|---|---|
| `0xE000` (NOP) | RESET'ten sonra adres LED'leri 0x0000, 0x0002, 0x0004 … her 3 saatte bir ilerler (NOP = 3 döngü) |
| `0xE001` (HALT) | ilk komutta HALTED LED'i yanar, saat çalışsa da PC durur |
| `0xF000` (yasadışı op) | FAULT LED'i yanar |
| `0xE000` + YAVAŞ | mikro adım sayacının çıkışları 0, 1, 2, 0, 1, 2 … |

Adres LED'lerindeki sayaç 0xFFFE'den 0x0000'a sarar: CPU tüm adres alanında NOP "çalıştırıyor".

## Simülatörde

- `npx vitest run cpu16/tests/board.test.ts`: kapı seviyesi CPU (bu kartın kendisi) hello, fib, add32, bubble
  ve irq programlarını her saat döngüsünde mikrokod modeliyle aynı çalıştırır.
- 3D: `kart.program("hello")`, `kart.calistir()`: UART çıkışında "Merhaba, CPU16!". `kart.secCip("U2")`
  kontrol register'ı 0, `kart.secCip("U1")` mikrokod ROM'u 0.
- Mikrokod tablosu ve döngü sayıları: `cpu16/docs/mikromimari.md`.

## Sorun giderme

| Belirti | Bak |
|---|---|
| Hiçbir şey olmuyor | `RUN_R` = 1 mi; `~RESET` bırakıldı mı; IR'ye ilk komut geldi mi (adım 1) |
| NOP 3 değil 16 döngü sürüyor | `END` (CW31) sayacın `~PE`'sine NAND ile gidiyor mu; ROM 3 doğru sokette mi |
| Rastgele FAULT | ROM'lar yanlış soketlerde (etiketler) ya da `IR12..15` adres sırası |
| HALT'tan çıkmıyor | `IRQ` GND'de olduğu için normal; RESET ile çık |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
<!-- otomatik: bitti -->
