# CPU16 kartları (Faz 4): şema = kod

Faz 4'te mikromimari ([mikromimari.md](mikromimari.md)) gerçek 74HC çiplerine bağlandı. Şema elle
çizilmez; `cpu16/board/` altındaki TypeScript kodu çipleri yerleştirir ve pinlerini netlere bağlar.
Aynı tanımdan dört şey üretilir:

| Çıktı | Nereden | Ne işe yarar |
|---|---|---|
| Kapı seviyesi simülasyon | `board/computer.ts` → `LogicSim` | Testler, 3D görünümdeki canlı sinyaller |
| KiCad 7 şemaları | `board/kicad-sch.ts` → `kicad/cpu/`, `kicad/mem/` | KiCad'de açılır, PCB'ye aktarılır |
| Malzeme listesi | `board/kicad-sch.ts` → `kicad/bom.csv` | Sipariş |
| Elektriksel kural denetimi | `board/board.ts` → `erc()` | Çakışan çıkış, sürülmeyen giriş |

Şema değişirse hepsi birlikte değişir; testler KiCad dosyalarının koddan yeniden üretilmiş halleriyle
birebir aynı olmasını şart koşar (elle düzeltilmiş ama koda işlenmemiş bir şema CI'da kırmızı yanar).

## Komutlar

```bash
npm run cpu16 -- board          # kart özeti (çip sayıları) + ERC
npm run cpu16 -- board kicad    # cpu16/kicad/ altındaki şemaları, sembolleri ve BOM'u yeniden üret
npm run cpu16 -- kicad-sym      # yalnızca sembol kütüphanesi
```

KiCad'de açmak için `cpu16/kicad/cpu/cpu.kicad_pro` (ya da `mem/mem.kicad_pro`). Proje
`sym-lib-table` dosyasıyla `cpu16.kicad_sym` kütüphanesini tanır. Bağlantılar tel yerine pin
uçlarındaki **net etiketleriyle** yapılır: aynı adlı iki etiket aynı nettir. Çizim düzeni otomatik
ızgaradır; görsel düzenleme serbesttir ama bağlantı değişiklikleri koda işlenmelidir.

## Kartlar ve çip sayıları

**CPU kartı: 146 entegre**

| Parça | Adet | Nerede |
|---|---:|---|
| 74HC151 (8:1 seçici) | 36 | register indeksi (3), sabit birimi (16), mantık birimi (16), koşul birimi (1) |
| 74HC574 (8 bit register) | 28 | r0..r7 (16), TA/TB/MAR/IR (8), kontrol register'ı (4) |
| 74HC541 (tampon) | 9 | PC, sabit, ALU, bayraklar → veriyolu; bayt okumada yüksek bayt = 0 |
| 74HC153 (4:1 seçici) | 9 | ALU sonuç seçici (8), C/V seçici (1) |
| 74HC86 / 08 / 32 / 00 / 02 / 04 | 9 / 11 / 3 / 3 / 3 / 2 | yapıştırıcı lojik (kart bitince birimler çiplere paketlenir) |
| SST39SF010A (Flash) | 7 | mikrokod (4), ALU kod çözme (3) |
| 74HC161 (sayaç) | 5 | PC (4), mikro adım sayacı (1) |
| 74HC74 (çift D FF) | 5 | N Z, C V, I, INT mandalı + HALT, FAULT + çalışma izni |
| 74HC138 (3→8 çözücü) | 4 | veriyolu kaynağı, register okuma, register yazma, adım 0 |
| 74HC283 (4 bit toplayıcı) | 4 | 16 bit toplayıcı |
| 74HC245 (çift yönlü) | 3 | veriyolu ↔ çift/tek bayt hatları |
| 74HC157 (2:1 seçici) | 3 | ALU işlem seçimi (2), bayrak girişi (1) |
| 74HC688 (karşılaştırıcı) | 2 | sıfır (Z) algılama |

Ayrıca: veriyolu çekme dirençleri (2 × 10 kΩ SIP-9), her entegreye 100 nF, kart girişine 100 µF,
HALTED ve FAULT LED'leri, 2 × 32 arka panel konnektörü.

**Test bellek kartı: 7 entegre.** 64 KB düz RAM (2 × 62256: çift ve tek baytlar) ve 0xFF00'da UART
çıkış mandalı (74HC574 + 2 × 74HC688 adres karşılaştırıcı). Emülatördeki `SimpleBus` ile birebir aynı
davranır; asıl anakart (bank'lı 1 MB bellek, ROM, G/Ç, video) Faz 6'da bunun yerini alır.

## Blok → çip eşlemesi (CPU kartı)

- **Mikrokod:** adres = `[12]INT [11:8]op [7:5]f3 [4]COND [3:0]adım` → 4 × Flash (32 kontrol biti) →
  4 × 74HC574 kontrol register'ı (CR). Mikrokod görüntüsü `npm run cpu16 -- ucode` ile üretilir.
- **Register dosyası:** her register iki 74HC574 (düşük/yüksek bayt), çıkışları doğrudan veriyolunda
  (üç durumlu). İndeks 3 × 74HC151 (RD/RS1/RS2/SP/LR seçimi), okuma ve yazma için iki 74HC138.
- **ALU:** 4 × 74HC283 toplayıcı; girişler XOR/AND ile koşullanır (SUB'da B ters, NEG'de A ters,
  PASSB). Mantık birimi her bitte bir 74HC151 *doğruluk tablosu*: seçici girişleri (a, b) bitleri,
  veri girişleri ALU kod çözme ROM'undan gelen 4 bitlik işlem tablosu (AND/OR/XOR/…). Yüksek baytta
  üçüncü seçici girişi a7'dir; bu sayede SXB (bayt işaret genişletme) ek çip istemez. Sonuç
  8 × 74HC153 ile seçilir: toplam / mantık / sola kaydır / sağa kaydır.
- **ALU kod çözme ROM'u:** 3 × Flash, adres = {ALU işlemi (5), IR8, C bayrağı}. Toplayıcı kontrolü,
  mantık tabloları, sonuç seçimi, kaydırmada giren bit ve "C/V güncellensin mi" bitini üretir
  (`board/alu-rom.ts`). Mikrokodda yeni bir ALU işlemi eklemek için çip değil, ROM içeriği değişir.
- **PC:** 4 × 74HC161 (PC[15:1]; PC[0] her zaman 0), +2 sayma ya da veriyolundan yükleme.
- **Sabit birimi:** her bit için bir 74HC151, 8 biçimden birini seçer (IMM6, IMM6×2, IMM8, IMM9,
  OFF8×2, OFF12×2, 2, 4).
- **Koşul birimi:** bir 74HC151 cond[3:1]'e göre bayrak seçer, bir XOR cond[0] ile tersler.
- **Bellek arayüzü:** 16 bit iç veriyolu ile arka paneldeki çift bayt (DE0..7) ve tek bayt (DO0..7)
  hatları arasında 3 × 74HC245. Bayt yüklemelerinde yüksek bayt bir 74HC541 ile 0 yapılır.

## Zamanlama

```
CLK      ‾‾‾‾\______________/‾‾‾‾‾‾‾‾‾‾‾\______
WR_WIN   ________/‾‾‾‾‾\_______________________
             ↑       ↑     ↑     ↑
             │       │     │     └ yükselen kenar: register'lar, PC, bayraklar, adım yüklenir
             │       │     └ yazma darbesi biter (veri hâlâ geçerli)
             │       └ ~MWE_E / ~MWE_O düşer (yalnızca bu pencerede)
             └ düşen kenar: CR mikrokodu örnekler, çalışma izni (RUN_R) güncellenir
```

- Kontrol sinyalleri düşen kenarda CR'den çıkar ve yükselen kenara kadar sabittir. Bu yüzden durum
  register'larının saati *kapılı saat* (`CLKR ∧ yükle`) olabilir: kapı girişleri saat yüksekken hiç
  değişmez, parazit (glitch) oluşmaz.
- Bellek yazma darbesi saat kartının ürettiği **WR_WIN** penceresiyle sınırlanır: düşen kenardan sonra
  başlar, yükselen kenardan önce biter. Böylece adres ve veri oturmuştur ve aynı yükselen kenarda
  değişen bir register (ör. kesmede bayrakları yığına iterken I'nın temizlenmesi) yazılan veriyi
  bozmaz. Saat kartı (Faz 9) bu pencereyi osilatörün 2 katı frekansından üretir.
- HALT'ta ve hata durumunda RUN_R düşer: kapılı saat durur, mikro adım ve PC donar. IRQ ∧ I gelirse
  CPU uyanır.

## Arka panel (her kartta aynı, 2 × 32)

| Pin | Sinyal | Pin | Sinyal |
|---|---|---|---|
| 1, 2, 62, 64 | GND | 3, 4, 63 | VCC |
| 5 | CLK | 6 | WR_WIN |
| 7 | ~RESET | 8 | IRQ |
| 9..24 | A0..A15 | 25..32 | DE0..DE7 (çift bayt) |
| 33..40 | DO0..DO7 (tek bayt) | 41 | ~MRD |
| 42 | ~MWE_E | 43 | ~MWE_O |
| 44 | HALTED | 45 | FAULT |
| 46..61 | Faz 6 kartları için boş (bank, G/Ç seçimleri, video) | | |

## Doğrulama zinciri

Her katman bir öncekine karşı test edilir (`cpu16/tests/board.test.ts`):

1. **Emülatör** (referans) ↔ **saat döngüsü modeli** (`micro/datapath.ts`): Faz 2.
2. **Saat döngüsü modeli** ↔ **kapı seviyesi kart**: her saat döngüsünde PC, 8 register, bayraklar,
   IR, TA, TB, MAR ve mikro adım karşılaştırılır. hello, fib, add32, bubble ve irq programları ile
   150 rastgele komut akışı (10 000'den fazla komut, yasadışı komutlar dahil).
3. **Kapı seviyesi kart** ↔ **emülatör**: program sonunda register'lar, bellek ve UART çıktısı.
4. **KiCad şeması** ↔ **kart**: gerçek `kicad-cli` (7.x) şemadan netlist çıkarır; her netin pin
   kümesi kartın netleriyle aynı olmalıdır. `kicad-cli` kurulu değilse bu test atlanır.

Kapı seviyesi kart tarayıcı dışında saniyede yaklaşık 7 000 saat döngüsü çalışır (her döngüde
~1 800 kapı, 4 fazlı değerlendirme).

## Faz 4'te mikromimaride değişenler

- **IMM8 iki bayta kopyalanır** (`imm & 0xFF` yerine `imm * 0x101`). Donanımda 16 ayrı seçici yerine
  aynı 8 IR bitini iki bayta bağlamak yeter. `MERGE` (LUI/ORI ailesi) hangi baytı alacağını `h`
  bitine göre seçtiği için komut seti davranışı değişmedi; saat döngüsü modeli aynı şekilde
  güncellendi.
- Yazma darbeleri WR_WIN penceresine taşındı (yukarıda).

## Sınırlar ve sonraki adımlar

- Şema çizimi otomatik ızgaradır; okunurluk için KiCad'de bloklar halinde yeniden düzenlenebilir.
- PCB yerleşimi ve üretim dosyaları (Gerber, montaj kılavuzu, saat kartı, ROM programlayıcı) Faz 9'da.
- 3D görünümde kart → çip → kapı → transistör inişi Faz 5'te bu kart tanımını kullanır.
