# CPU16 anakartı (Faz 6)

> CPU16 çekirdeğinin etrafındaki kartlar: bellek ve bank register'ları (basit MMU), önbellek,
> EEPROM, VGA metin kartı, PS/2 klavye, UART, zamanlayıcı ve kesme denetleyicisi; eğitim için
> kendin yap bellek kartı. Bütün kartlar yaygın 7400 serisi lojikle ve yalnız iki bellek çipiyle
> (62256 SRAM, 28C256 EEPROM) kurulur.
> Simülasyon: `emu/machine.ts` (+ `emu/devices/*.ts`, `video/font.ts`). Testler: `tests/machine.test.ts`.
> BIOS ve önyükleyici: [bios.md](bios.md). Komut seti ve döngü sayıları: [spec.md](spec.md), [mikromimari.md](mikromimari.md).

Model komut seviyesinde çalışır ama **zamanı CPU döngüsüyle sayar**: her komut mikromimari
tablosundaki döngü sayısı + bellek bekleme durumları kadar sürer; zamanlayıcı, dikey tarama,
UART ve klavye bu sayaçla ilerler. Böylece "önbellek açıkken program ne kadar hızlı?" sorusu
simülasyonda ölçülebilir (deney 10).

## Blok şeması

```
              4 MHz                                          25,175 MHz
          ┌──────────┐                                     ┌────────────────────────────┐
          │ CPU16    │ A15..A0                              │ VİDEO KARTI                │
          │ çekirdeği├──────┬──────────────┐                │ VRAM 8 KB (karakter+renk)  │
          │ (Faz 2)  │      │A15:A14       │A15..A8 = FF?  │ karakter ROM'u 4 KB        │
          └────┬─────┘      ▼              ▼                │ 640×480@60, 80×30, 16 renk │
               │ D15..D0 ┌────────┐   ┌──────────┐ G/Ç     └──────────────┬─────────────┘
               │         │ BANK   │   │ adres    ├─────────┬──────┬──────┬┴──────┬───────┐
               │         │ 4×6 bit│   │ çözücü   │         │      │      │       │       │
               │         └───┬────┘   └──────────┘      UART   PS/2  zaman-  kesme   önbellek
               │             │ PA19..PA14                CH340  klavye layıcı (kapılar) sayaçları
               │             ▼                            │      │      │       │
          ┌────┴──────────────────────────┐               └──────┴──────┴───────┘
          │ ÖNBELLEK KARTI (L1, 2 KB)     │                    IRQ ─▶ CPU
          │ 16 bit veri SRAM + etiket SRAM│
          │ 74HC688 karşılaştırıcı        │
          │ isabet: 0 bekleme             │
          │ ıskalama / yazma: 2 bekleme   │
          └────┬──────────────────────────┘
               │ ANA BELLEK VERİYOLU (20 bit adres, 8 bit veri, bekleme durumlu)
       ┌───────┴───────────┬─────────────────────────┐
  ┌────┴─────────┐   ┌─────┴──────────┐        boş alan: dirençlerle 0xFF
  │ EEPROM 32 KB │   │ RAM 128 KB     │
  │ 28C256       │   │ 62256 ×4       │
  │ 0x00000–     │   │ 0x80000–       │
  │   0x07FFF    │   │   0x9FFFF      │
  └──────────────┘   └────────────────┘
```

G/Ç alanında `FF40–FF4F`'te isteğe bağlı bir eğitim kartı durur: **kendin yap bellek** (16 bayt,
her bayt bir 74HC574; [Deney 14](../kit/deney-14-kendin-yap-bellek.md)). Bilgisayarın çalışması
için gerekmez.

CPU tarafındaki sistem veriyolu 16 bittir (mikromimarideki gibi kelime erişimi tek döngü).
Ana bellek kartında EEPROM ve RAM çipleri 8 bitliktir: bir kelime iki bayt döngüsüyle okunur ve
bir 74HC574'te birleştirilir. Ana belleğin yavaş (bekleme durumlu) olmasının ve önbelleğin
gerçekten işe yaramasının sebebi budur; önbellek 16 bit genişliğindedir ve isabette CPU'yu hiç
bekletmez.

## Bellek ve bank register'ları (basit MMU)

CPU 64 KB görür: dört adet 16 KB'lık pencere. Her pencerenin 6 bitlik bank register'ı,
pencereyi 1 MB'lık fiziksel alanda bir 16 KB'lık banka eşler:

```
fiziksel adres (20 bit) = BANKn (6 bit) · 0x4000 + (CPU adresi & 0x3FFF)      n = CPU adresi >> 14
```

| Fiziksel | Bank | İçerik |
|---|---|---|
| `0x00000–0x07FFF` | 0–1 | EEPROM 28C256 (32 KB). Bank 0 = BIOS, bank 1 = programlar (`F` komutu) |
| `0x08000–0x7FFFF` | 2–31 | boş: okuma `0xFF` (veriyolu dirençlerle 1'e çekili), yazma etkisiz |
| `0x80000–0x9FFFF` | 32–39 | RAM, 4 × 62256 (128 KB; her çip iki bank: 32–33, 34–35, 36–37, 38–39) |
| `0xA0000–0xFFFFF` | 40–63 | boş |

Çip seçimi tek bir 74HC138'dir: girişleri `PA19`, `PA16`, `PA15`; `PA17 = PA18 = 0` ve `~IO = 1`
iken çalışır. `~Y0` EEPROM'u (`PA19..PA15 = 00000`), `~Y4..~Y7` RAM 0..3'ü (`100xx`) seçer; diğer
çıkışlar boştur.

| CPU adresi | Pencere | Reset değeri | BIOS kullanımı |
|---|---|---|---|
| `0x0000–0x3FFF` | 0 | bank 0 (EEPROM, BIOS) | BIOS; değiştirilmez |
| `0x4000–0x7FFF` | 1 | bank 32 (RAM) | kullanıcı programı (`B 1 n` ile değişebilir) |
| `0x8000–0xBFFF` | 2 | bank 33 (RAM) | kullanıcı programı (`B 2 n` ile değişebilir) |
| `0xC000–0xFEFF` | 3 | bank 34 (RAM) | kullanıcı + BIOS değişkenleri ve yığın (`0xF800–0xFEFF`) |
| `0xFF00–0xFFFF` | – | – | **her zaman G/Ç**, bank register'larından bağımsız |

Reset bank register'larını 0, 32, 33, 34'e getirir: vektörler (`0x0000` reset, `0x0002` IRQ,
`0x0004` SWI) her zaman BIOS'tan okunur. Bank register'ları geri okunabilir (`FF10–FF13`, üst
2 bit 0). Pencere 3'ün son 256 baytı G/Ç olduğundan bank 34'ün `0x3F00–0x3FFF` ofseti CPU'dan
görünmez (başka bir pencereden görünür).

## G/Ç haritası (`0xFF00–0xFFFF`)

Tüm register'lar 8 bittir; 16 bit register'lar küçük uçlu çifttir ve kelime komutuyla
(`LW`/`SW`) tek seferde erişilebilir. G/Ç kartları bekleme durumu eklemez. Listede olmayan
adresler ve **sadece yazılan** register'lar `0xFF` okunur. R = okunur, W = yazılır,
W1C = 1 yazınca silinir.

| Adres | Ad | Erişim | Bitler / anlam |
|---|---|---|---|
| `FF00` | UART_DATA | R / W | okuma: alınan bayt (RX_READY'yi siler) · yazma: gönder |
| `FF01` | UART_STAT | R | bit0 RX_READY, bit1 TX_EMPTY |
| `FF02` | KBD_DATA | R | PS/2 tarama kodu baytı (okuma READY'yi siler) |
| `FF03` | KBD_STAT | R | bit0 READY |
| `FF04–FF05` | TIMER_RELOAD | R / W | 16 bit yeniden yükleme değeri (1 kHz tık sayısı) |
| `FF06` | TIMER_CTRL | R / W | bit0 EN, bit1 IRQ_EN. EN 0→1 olurken sayaç RELOAD ile yüklenir |
| `FF07` | TIMER_STAT | R / W1C | bit0 EXPIRED |
| `FF08` | IRQ_PEND | R | bekleyen kaynaklar: bit0 zamanlayıcı, bit1 klavye, bit2 UART RX, bit3 vsync |
| `FF09` | IRQ_MASK | R / W | aynı bitler; 1 = kesme açık. Reset: 0 |
| `FF0A` | IRQ_SRC | R | maskesi açık bekleyen en yüksek öncelikli kaynak no (3..0), yoksa `0xFF` |
| `FF10–FF13` | BANK0–BANK3 | R / W | pencere 0–3'ün bankı (6 bit) |
| `FF20–FF21` | VADDR | W | VRAM adresi (13 bit) |
| `FF22` | VDATA | R / W | VRAM verisi; her erişimde VADDR bir artar |
| `FF23` | VCTRL | R / W | bit0 imleç görünür |
| `FF24` | CURSOR_X | R / W | imleç sütunu (0–79) |
| `FF25` | CURSOR_Y | R / W | imleç satırı (0–29) |
| `FF26` | VSTAT | R / W1C | bit0 dikey boşlukta (vblank), bit1 VSYNC bayrağı (kare başına bir kez kurulur; 1 yazınca silinir) |
| `FF30–FF31` | CACHE_HITS | R / W | önbellek isabet sayacı (16 bit, sarar). `FF30`'a herhangi bir yazma iki sayacı da sıfırlar |
| `FF32–FF33` | CACHE_MISSES | R | ıskalama sayacı (16 bit, sarar) |
| `FF34` | CACHE_CTRL | R / W | bit0 önbellek açık. Reset: 1 |
| `FF40–FF4F` | KYB | R / W | kendin yap bellek kartı: 16 bayt RAM (kart takılı değilse `0xFF` okunur). Reset silmez |

Sabitler kodda: `IO` nesnesi (`emu/machine.ts`); BIOS'ta `IOB = 0xFF20` tabanlı ofsetler
(`LBU`/`SB` ofseti −32..+31 olduğu için tek taban register'ı tüm haritaya yeter).

## Kesme denetleyicisi

Dört kaynak, seviye tetiklemeli; kaynak isteği sürdükçe bekler:

| No | Kaynak | İstek | Nasıl onaylanır |
|---|---|---|---|
| 3 (en yüksek) | vsync | VSTAT bit1 | `VSTAT`'a 2 yaz (W1C) |
| 2 | UART RX | RX_READY | `UART_DATA`'yı oku |
| 1 | klavye | KBD READY | `KBD_DATA`'yı oku |
| 0 (en düşük) | zamanlayıcı | EXPIRED ve IRQ_EN | `TIMER_STAT`'a 1 yaz |

`IRQ_PEND & IRQ_MASK` sıfırdan farklıysa CPU'nun IRQ hattı kalkar. Kapılarla kurulmuş dört
girişli öncelik kodlayıcı (`SRC1 = P3 ∨ P2`, `SRC0 = P3 ∨ (P1 ∧ ¬P2)`, `IRQ = P0 ∨ P1 ∨ P2 ∨ P3`)
en yüksek numaralı isteği `IRQ_SRC`'ye verir; istek yokken okuma tamponu kapalı kalır ve dirençler
`0xFF` okutur. İşleyici `IRQ_SRC` `0xFF` olana kadar döner. CPU kesmeyi sadece I = 1 iken alır;
giriş 8 döngü sürer (PC ve bayraklar yığına, I = 0, `0x0002` vektörü), `RETI` bunları geri alır.

## Zamanlayıcı

4 MHz'ten 74HC161 ×3 ile 4000'e bölünmüş **1 kHz tık** (1 ms) 16 bitlik sayacı azaltır. Sayaç
dört eşzamanlı 74HC161'dir ve kalan tık sayısının tersini tutar: aşağı saymak tersini yukarı
saymaktır (`c − 1 = ¬(¬c + 1)`); RELOAD sayıcılara eviricilerden geçerek yüklenir. Sayaç 0 olunca RELOAD'dan yeniden yüklenir ve EXPIRED kurulur; IRQ_EN
açıksa kesme ister. Periyot = RELOAD ms (RELOAD = 0 → 65 536 ms). BIOS 10 yükler: 100 Hz
(`TICKS` sayacı, bkz. bios.md).
Tık TCLK / 4000'dir (TCLK = CPU saati, bekleme turlarında da sayar): 4 MHz'te 1 kHz, 1 MHz'lik
ilk kartta 250 Hz. BIOS'un 100 Hz'i de aynı oranda yavaşlar; gerçek zaman gereken programlar
RELOAD'ı CPU hızına göre seçmelidir.

## Önbellek kartı

| Özellik | Değer |
|---|---|
| Boyut | 2 KB veri, satır = 1 kelime (2 bayt) → 1024 satır |
| Eşleme | doğrudan (direct-mapped) |
| Adres bölümleri | fiziksel `[19:11]` etiket (9 bit) · `[10:1]` satır indeksi · `[0]` bayt seçimi |
| Yazma | write-through, yazma-ayırmasız (no-write-allocate) |
| Isabet | 0 bekleme durumu |
| Iskalama | ana bellekten kelime okunur, satır dolar: **2 bekleme durumu** |
| Önbellek kapalı | her okuma ana belleğe gider: 2 bekleme durumu |
| Her yazma | ana belleğe gider (write-through): 2 bekleme durumu |

- **Yazma gözetleme**: yazma anında etiket karşılaştırıcısı her zaman çalışır (önbellek kapalı
  olsa bile). RAM'e yazmada isabet eden satır güncellenir; EEPROM ya da boş bölgeye (fiziksel
  A19 = 0) yazmada satır **geçersiz kılınır**, çünkü EEPROM'a yapılan yazma içeriği hemen
  değiştirmez (komut baytı ya da yazma döngüsünde biten bir sayfa yazması olabilir).
- **Reset**: kart, reset süresince 1024 adımlık bir sayaçla (74HC161 ×3) etiket SRAM'inin tüm
  satırlarına "geçersiz" yazar; önbellek açık, sayaçlar sıfır başlar.
- **Yazılımla boşaltma**: ayrı bir "boşalt" komutu yok. Önbellek açıkken 2 KB'lık bitişik bir
  RAM bölgesini okumak her satırı RAM'den taze bir satırla değiştirir (EEPROM'un eski kopyaları
  gider). BIOS bunu EEPROM'a yazdıktan sonra `0xC000–0xC7FF` ile yapar.
- **Sayaçlar**: isabet ve ıskalama 16 bit (her biri 74HC161 ×4 eşzamanlı sayıcı, okuma 74HC541
  ×2 tamponla), komut
  çekme dahil her *kelime* erişimi bir kez sayılır (CPU'nun iki baytı aynı veriyolu döngüsüdür).
  Önbellek kapalıyken sayılmaz. Simülatör arayüzü taşmayan toplamları da gösterir.
- **G/Ç** (`FF00–FFFF`) önbelleğe girmez.
- Kapı seviyesi gerçekleme (bekleme üreteci, bayt sıralayıcı, zamanlama çizimi):
  [anakart-kartlari.md](anakart-kartlari.md).

### Bekleme durumları ve döngü sayımı

Bir komutun süresi = mikromimari tablosundaki döngü + o komutun ana bellek erişimlerinin
bekleme durumları:

| Komut | Döngü | | Komut | Döngü |
|---|---|---|---|---|
| ADD … XOR, CMP | 5 | | Bcc (dallanırsa / dallanmazsa) | 5 / 3 |
| MOV NOT NEG SHL … ROR | 4 | | JAL / CALL | 5 |
| ADDI, CMPI, LI/LUI | 5 | | JALR / RET | 6 |
| LW SW LBU SB | 6 | | PUSH, POP | 6 |
| SXB | 4 | | NOP HALT EI DI, yasadışı | 3 |
| RETI | 8 | | SWI | 10 |
| IRQ girişi | +8 | | | |

Erişimler: komut çekme (1 kelime okuma), `LW`/`LBU`/`POP`/`RETI` okuma(ları), `SW`/`SB`/`PUSH`/
IRQ girişi yazma(ları). Örnek (`bios/ornekler/onbellek.s`'in iç döngüsü):

```
inner:  LW   r3, [r0]       6   + çekme + okuma
        ADDI r3, r3, 1      5   + çekme
        SW   r3, [r0]       6   + çekme + yazma (her zaman +2)
        ADDI r1, r1, -1     5   + çekme
        BNE  inner          5   + çekme
```

Önbellek açıkken (hepsi isabet) 27 + 2 = **29 döngü/tur**; kapalıyken 27 + 7·2 = **41 döngü/tur**
(%41 daha yavaş). Simülasyonda 10 000 tur: açık 8, kapalı 11 tık (10 ms'lik), ≈ 60 400 isabet.

## Video kartı

| Özellik | Değer |
|---|---|
| Çözünürlük | 640×480 @ 60 Hz (25,175 MHz piksel saati, kartın kendi osilatörü) |
| Metin | 80 sütun × 30 satır, hücre 8×16 piksel |
| VRAM | 8 KB; hücre (satır·80 + sütun)·2: çift adres karakter kodu, tek adres renk |
| Renk baytı | düşük 4 bit yazı rengi, yüksek 4 bit zemin rengi (yanıp sönme yok) |
| Palet | 16 renk CGA (IRGB; 6 numara kahverengi) |
| İmleç | `CURSOR_X/Y` hücresinin 14–15. tarama satırı yazı renginde; 16 karede bir yanar/söner |
| Karakter ROM'u | 4 KB: adres = kod·16 + tarama satırı, bit 7 = en soldaki piksel |
| VSYNC | dikey boşluğun başında `VSTAT` bit1 kurulur → IRQ 3 |

**Zamanlama.** Yatayda satır 800 piksel (640 görünür + 16 ön sundurma + 96 senkron + 48 arka
sundurma) = 31,78 µs; dikeyde 525 satır (480 + 10 + 2 + 33) = 16,68 ms. Karakter saati
25,175 / 8 = 3,15 MHz (74HC161 ×3 yatay karakter sayacı 0–99; 74HC161 ×3 satır sayacı 0–524).
Tarama satırı = satır sayacının alt 4 biti, metin satırı = üst bitleri.

Modelde kare 4 MHz CPU saatiyle sayılır: kare = 66 667 döngü (60,00 Hz; gerçek kart 59,94 Hz,
%0,1 fark), görünür bölge ilk 60 952 döngü, dikey boşluk 5 715 döngü (45 satır ≈ 1,43 ms).
Gerçek kartta video saati CPU'dan bağımsızdır; yazılım fazı varsaymamalı, `VSTAT`'ı ya da
vsync kesmesini kullanmalı.

**VRAM erişimi (port tabanlı).** CPU VRAM'i doğrudan görmez: `VADDR`'a adres yazar,
`VDATA`'dan okur/yazar, adres her erişimde kendiliğinden artar (VADDR bir 74HC161 ×4 sayıcısı;
`FF20`/`FF21` yazması o yarının yükleme bayrağını kurar, sayıcılar baytı yazma darbesinin sonunda
yükler).
VRAM iki 8 bitlik SRAM'dir (karakter / renk şeridi, adres bit 0 seçer): tarama tarafı bir
karakter süresinde (318 ns) ikisini birlikte okur. Her karakter süresinin bir dilimi CPU'ya
ayrılmıştır: yazma bir latch'te (74HC574) bekler ve o dilimde VRAM'e yazılır; okumada kart
`VADDR` değişince baytı önceden okuma latch'ine getirir. CPU'nun iki erişimi arası en az bir
komut (≥ 1 µs) olduğundan CPU hiç beklemez ve ekranda "kar" oluşmaz. Modelde VRAM erişimi
anlıktır.

**Piksel hattı.** VRAM karakter + renk → latch → karakter ROM'u (28C256, adres = kod·16 + tarama
satırı) → font latch'i (74HC574, ROM'a tam bir karakter süresi kalsın diye) → 74HC166 kaydırma
register'ı (8 piksel) → 74HC157 (bit 1 ise yazı, 0 ise zemin
rengi nibble'ı) → IRGB → dirençli DAC → VGA R/G/B. Kahverengi için CGA'daki gibi küçük bir
düzeltme (I = 0, R = G = 1, B = 0 iken yeşil yarıya). İmleç: iki 74HC688 sütun/satır
sayaçlarını `CURSOR_X/Y` ile karşılaştırır; eşleşmede 14–15. tarama satırları zorla yazı
rengindedir; yanıp sönme bir 74HC393 kare sayacının 4. bitinden.

### Karakter ROM'u ve font

- Kaynak: **X11 Misc-Fixed 8x13** (`8x13.bdf`, ISO10646-1), Markus Kuhn'un *ucs-fonts* paketi.
  Lisansı: *"Public domain font. Share and enjoy."* (kamu malı). İndirme:
  <https://www.cl.cam.ac.uk/~mgk25/ucs-fonts.html> ya da xorg `font-misc-misc` paketi.
- Üretici: `video/bdf2font.ts` (`node --experimental-strip-types cpu16/video/bdf2font.ts 8x13.bdf > cpu16/video/font.ts`).
  13 satırlık glifler 16 satırlık hücrenin 1. satırından başlar. Çerçeve (─ │ ╔ ═ …) ve blok
  (█ ▀ ▄ ░ ▒ ▓ ■) karakterleri hücreyi tam dolduracak şekilde üreticide çizilir (bitişik
  çerçeveler kesintisiz birleşsin diye).
- Kod sayfası: `0x20–0x7E` ASCII, `0x80–0xFF` **CP857** (Türkçe DOS: Ç ü ğ ı İ ö ş …, çerçeve
  ve blok karakterleri), `0x01–0x1F` ve `0x7F` CP437 simgeleri (☺ ♥ ♪ ► ↑ … ⌂).
- ROM imajı: `npm run cpu16 -- charrom -o charrom.hex` (4096 bayt). Bir 28C256'nın ilk 4 KB'ına
  yazılır (A12..A14 GND'de).

## PS/2 klavye

PS/2 seri çerçevesi 11 bittir (başlangıç, 8 veri LSB önce, tek eşlik, bitiş); klavye saati
10–16,7 kHz. Kart veriyi saatin düşen kenarında bir 74HC595'e kaydırır, bir 74HC161 bitleri
sayar; 11. bitte `READY` (74HC74) kurulur. `READY` 1 iken kart saat hattını açık-kollektörle
(74HC05) aşağı çeker (PS/2 "inhibit"): klavye sonraki baytı kendi tamponunda bekletir, bayt
kaybolmaz. `KBD_DATA` okununca `READY` ve sayaç sıfırlanır, saat hattı bırakılır.

Kodlar **set 2**: basma kodu (ör. A = `1C`), bırakmada `F0` öneki (`F0 1C`), genişletilmiş
tuşlarda `E0` öneki (sağ Ctrl `E0 14`, oklar `E0 75` …). Modelde bir bayt 3520 döngü
(≈ 0,88 ms, 12,5 kHz) sürer. Tarama kodu → ASCII çevirisi BIOS'ta (ABD düzeni, bkz. bios.md);
Web IDE ve CLI tarayıcının `KeyboardEvent.code` adlarından set 2 kodu üretir
(`emu/devices/keyboard.ts`).

## UART

115200 baud 8N1 (bayt 10 bit = 86,8 µs = **347 CPU döngüsü**). Hız CPU saatine bağlıdır: kapı
seviyesi G/Ç kartı bit süresini TCLK'den böler, bu yüzden 1 MHz'lik ilk kartta **28 800 baud** olur
(bkz. [uretim.md](uretim.md)). Aşağıdaki osilatörlü tasarım ilk tahmindir. Bilgisayar tarafında CH340
USB-UART köprüsü. 1,8432 MHz osilatör + 74HC4040 baud saati (16×), gönderici 74HC165 +
74HC161 bit sayacı, alıcı 74HC595 + 74HC161 ×2 (16× örnekleme ve bit sayacı) + 74HC74.
(İstenirse yerine tek bir TL16C550 takılabilir; register haritası aynı kalacak şekilde
seçici mantıkla.)

- **TX**: `UART_DATA`'ya yazılan bayt gönderilir; `TX_EMPTY` bir bayt süresi 0 olur. Yazılım
  `TX_EMPTY`'yi bekleyip yazar (BIOS `uart_putc`).
- **RX**: alınan bayt `UART_DATA`'da durur, `RX_READY` = 1. Tek baytlık alıcı: bir sonraki bayt
  bir bayt süresi içinde okunmalı.
- **Akış denetimi (RTS/CTS)**: `RX_READY` 1 iken kartın RTS# çıkışı pasiftir ve CH340'ın CTS#
  girişine bağlıdır: köprü sonraki baytı bekletir, taşma olmaz. Model bunu böyle uygular: bayt
  ancak RX boşken ve önceki okumadan en az bir bayt süresi sonra düşer. Önyükleyici protokolü
  her kayıttan sonra yanıt beklediği için akış denetimi kapalı bir bağlantıda da çalışır (BIOS
  bir kayıt içinde karakter başına ≈ 120 döngü harcar, bayt süresi 347 döngü).

## EEPROM (28C256)

32 KB, 8 bit, 150 ns; bacak düzeni 62256 ile aynıdır. Okuma normal bellek gibi. Yazma silme
istemez, her bayt doğrudan yeni değerini alır:

| İşlem | Nasıl |
|---|---|
| Bayt / sayfa yazma | `~WE` darbesiyle bayt çipin sayfa tamponuna yüklenir. Aynı 64 baytlık sayfaya (A14..A6 aynı) sonraki bayt **150 µs** (tBLC) içinde gelirse eklenir; gelmezse çip iç yazma döngüsünü başlatır (tWC ≤ 10 ms). Yüklenmeyen baytlar eski değerini korur |
| Durum | Yazma sürerken okunan bayt durumdur: D7 son yazılan baytın D7'sinin tersi (DATA yoklaması), D6 her okumada değişir (toggle biti) |
| Koruma açma / korumalı yazma (SDP) | `AA→5555`, `55→2AAA`, `A0→5555`, ardından sayfanın baytları. Koruma açık kalır |
| Koruma kapatma | `AA→5555`, `55→2AAA`, `80→5555`, `AA→5555`, `55→2AAA`, `20→5555` |

Koruma açıkken diziden gelmeyen yazmalar yok sayılır: çalışan bir programın yanlışlıkla yaptığı
yazma BIOS'u bozamaz. Programlayıcı (Deney 3) ve BIOS'un `F` komutu her sayfayı korumalı yazar;
çip fabrikadan korumasız gelir, ilk yazmada korumalı olur. Yazma döngüsü sürerken EEPROM'dan komut
okunamaz: BIOS yazma rutinlerini RAM'e kopyalayıp oradan çalıştırır (bkz. bios.md, "EEPROM'a
yazma"). Kimlik okuma yazılımla yapılamaz (A9'a 12 V ister).

Model (`emu/devices/eeprom.ts`) zamanı CPU döngüsüyle sayar (komutun başladığı döngü × 250 ns):
bayt yükleme penceresi, yazma döngüsü, DATA yoklaması, toggle biti ve SDP veri sayfasındaki gibidir.
Kapı seviyesi bellek kartındaki 28C256 aynı modeli aynı saatle kullanır.

## Çip listesi (blok başına, tahmini)

Aşağıdaki tablo tasarımın başındaki tahmindir. Bütün kartlar artık kapı seviyesinde kurulu ve
KiCad'de; kesin sayılar: CPU 194, saat 10, bellek 34, önbellek 46, G/Ç 65, video 73, kendin yap
bellek 22 entegre
(blok → çip eşlemesi ve tahminden farkları: [anakart-kartlari.md](anakart-kartlari.md),
[anakart-gc-video.md](anakart-gc-video.md); güncel liste `npm run cpu16 -- board`). En büyük fark
G/Ç tarafındadır: UART ayrı osilatör kullanmaz, bit süresini TCLK'den böler; zamanlayıcının ön
bölücüsü de TCLK'yi sayar.

| Blok | Çipler | ≈ adet |
|---|---|---|
| Saat / reset | 4 MHz kristal osilatör, 74HC14 (reset Schmitt), 74HC161 ×3 (÷4000 → 1 kHz) | 5 |
| Adres çözümleme | 74HC688 (`A15..A8 = FF` → G/Ç), 74HC138 ×2 (G/Ç grupları `FF0x/FF1x/FF2x/FF3x`), 74HC00/08/32 | 5 |
| Bank register'ları | 74HC273 ×4 (temizlemeli, pencere başına; reset değeri bir 74HC86 XOR'uyla 0/32/33/34), 74HC153 ×3 (pencere seçici, 6 bit), 74HC244 (geri okuma) | 9 |
| Önbellek | 62256 ×2 (16 bit veri), 62256 ×2 (9 bit etiket + geçerli biti), 74HC688 ×2 (karşılaştırıcı), 74HC157 ×3 (etiket adresi: CPU / temizleme sayacı), 74HC161 ×3 (temizleme sayacı), 74HC161 (bekleme durumu üreteci), 74HC161 ×8 + 74HC541 ×4 (sayaçlar ve okuma), 74HC74 ×2, 74HC08/32 | 28 |
| Ana bellek | 28C256, 62256 ×4, 74HC574 (çift bayt latch'i), 74HC245 ×2 (bayt şeridi), 74HC74 + 74HC161 (bayt alt döngüsü sıralayıcı), 74HC138, 10 kΩ dizi (boş alan `0xFF`) | 12 |
| Video | 25,175 MHz osilatör, 74HC161 ×6 (yatay/dikey sayaçlar), 74HC688 ×2 + 74HC74 ×2 (senkron ve boşluk), 62256 ×2 (VRAM şeritleri), 74HC161 ×4 (VADDR) + 74HC161 ×3 (tarama adresi) + 74HC574 ×2 (satır başı), 74HC157 ×4 (VRAM adres seçici), 74HC574 ×4 (CPU yazma/okuma latch'i, karakter/renk hattı), karakter ROM'u (28C256), 74HC166, 74HC157, 74HC574 ×2 + 74HC688 ×2 (imleç), 74HC393, dirençli DAC | 40 |
| Klavye | 74HC595, 74HC161, 74HC74, 74HC05, 74HC14 | 5 |
| UART | 1,8432 MHz osilatör, 74HC4040, 74HC165, 74HC595, 74HC161 ×3, 74HC74, CH340 modülü | 9 |
| Zamanlayıcı | 74HC161 ×4 (sayacın tersi), 74HC04 ×3 (RELOAD tersi), 74HC574 ×2 (RELOAD), 74HC688 ×2, 74HC74 | 12 |
| Kesme | 74HC175 (IRQ_MASK, reset 0), 74HC08 / 74HC32 / 74HC04 kapıları (öncelik kodlayıcı), 74HC244 (IRQ_PEND / IRQ_SRC okuma) | 4 |
| Kendin yap bellek | 74HC138 ×4, 74HC245 ×2, 74HC574 ×16 | 22 |

## Model ile gerçek kart arasındaki farklar

- EEPROM'un yazma döngüsü modelde tam 10 ms'dir (veri sayfasındaki en kötü değer; gerçek çip
  çoğunlukla daha kısa sürer). Yazılım süreye değil DATA yoklamasına güvenir.
- UART TX bayt kaybetmez: yazılan bayt hemen ana makineye gider (`TX_EMPTY` yine bir bayt
  süresi 0 olur). RX'te RTS/CTS akış denetimi modellenmiştir.
- VRAM erişimi anlıktır (gerçek kartta CPU dilimi yüzünden en çok bir karakter süresi gecikir;
  CPU'yu bekletmez).
- Video karesi 4 MHz CPU saatinden türetilir (60,00 Hz, faz sabit); gerçek kartta ayrı osilatör.
- Bayt yazmaları da (`SB`) 2 bekleme durumu sayılır (gerçek kartta tek bayt döngüsü daha kısa
  olabilir); G/Ç erişimleri bekleme durumsuzdur.
- `VSTAT` bit1 (vsync bayrağı, W1C) ve sadece-yazılır register'ların `0xFF` okunması bu
  tasarımda tanımlanmıştır.
- Kapı seviyesi saat, bellek ve önbellek kartları bu modelle erişim erişim ve komut komut aynıdır
  (değer, bekleme, bank, sayaç, etiket, EEPROM'un iç durumu); kalan küçük farklar (gerçek kart
  zamanlama payı) [anakart-kartlari.md](anakart-kartlari.md)'de.

## Simülasyon API'si (özet)

```ts
import { Machine } from "./emu/machine.ts";
const m = new Machine();
m.loadFlash(biosImage);       // EEPROM'a imaj (programlayıcıyla yazılmış gibi, korumalı)
m.reset();
m.run(4_000_000);             // 1 saniye (döngü)
m.uartSend("D 4000\r");       // USB-UART'tan bayt gönder
m.keyDown("KeyA"); m.keyUp("KeyA"); m.typeText("G 4000\n");
m.renderText();               // VGA ekranı metin olarak
m.cache.totalHits; m.waitCycles; m.cycles;
```

Testler (`tests/machine.test.ts`): bank eşlemesi ve 1 MB fiziksel harita, 128 KB RAM'i CPU
programıyla test, 28C256 (bayt ve sayfa yazma, tBLC, yazma döngüsü, DATA yoklaması, toggle biti,
SDP, CPU'dan korumalı yazma), kendin yap bellek, UART, PS/2 kodları, zamanlayıcı, IRQ öncelik ve maske, vsync, VRAM portu,
imleç, font, önbellek sayaçları ve **döngü sayısının birebir hesabı** (önbellek açık/kapalı).
