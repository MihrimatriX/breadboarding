# CPU16 kartları (Faz 4): şema = kod

Faz 4'te mikromimari ([mikromimari.md](mikromimari.md)) gerçek 74HC çiplerine bağlandı. Şema elle
çizilmez; `cpu16/board/` altındaki TypeScript kodu çipleri yerleştirir ve pinlerini netlere bağlar.
Aynı tanımdan dört şey üretilir:

| Çıktı | Nereden | Ne işe yarar |
|---|---|---|
| Kapı seviyesi simülasyon | `board/computer.ts`, `board/machine-board.ts` → `LogicSim` | Testler, 3D görünümdeki canlı sinyaller |
| KiCad 7 şemaları | `board/kicad-sch.ts` → `kicad/cpu/`, `kicad/mem/`, `kicad/clk/`, `kicad/prog/`, `kicad/bellek/`, `kicad/onbellek/`, `kicad/gc/`, `kicad/video/`, `kicad/kyb/` | KiCad'de açılır, PCB'ye aktarılır |
| Malzeme listesi | `board/kicad-sch.ts` → `kicad/bom.csv` (CPU, test bellek, saat), `kicad/<kart>/bom.csv` (anakart kartları) | Sipariş |
| Elektriksel kural denetimi | `board/board.ts` → `erc()` | Çakışan çıkış, sürülmeyen giriş |

Şema değişirse hepsi birlikte değişir; testler KiCad dosyalarının koddan yeniden üretilmiş hâlleriyle
birebir aynı olmasını şart koşar (elle düzeltilmiş ama koda işlenmemiş bir şema CI'da kırmızı yanar).

## Komutlar

```bash
npm run cpu16 -- board          # kart özeti (çip sayıları) + ERC: test bilgisayarı ve anakart
npm run cpu16 -- board kicad    # cpu16/kicad/ altındaki şemaları, sembolleri ve BOM'u yeniden üret
npm run cpu16 -- kicad-sym      # yalnızca sembol kütüphanesi
```

KiCad'de açmak için `cpu16/kicad/cpu/cpu.kicad_pro` (ya da `mem/mem.kicad_pro`). Proje
`sym-lib-table` dosyasıyla `cpu16.kicad_sym` kütüphanesini tanır. Bağlantılar tel yerine pin
uçlarındaki **net etiketleriyle** yapılır: aynı adlı iki etiket aynı nettir. Çizim düzeni otomatik
ızgaradır; görsel düzenleme serbesttir ama bağlantı değişiklikleri koda işlenmelidir.

## Kartlar ve çip sayıları

**CPU kartı: 210 entegre** (ROM'lu ilk sürüm 146: 7 × SST39SF010A ile)

| Parça | Adet | Nerede |
|---|---:|---|
| 74HC151 (8:1 seçici) | 46 | register indeksi (3), sabit birimi (16), mantık birimi (16), koşul birimi (1), kontrol biriminin adım seçicileri (10) |
| 74HC574 (8 bit register) | 28 | r0..r7 (16), TA/TB/MAR/IR (8), kontrol register'ı (4) |
| 74HC138 (3→8 çözücü) | 12 | veriyolu kaynağı, register okuma, register yazma; kontrol birimi: adım (2), komut (2), op 13/14 alt çözücü (2); ALU işlem çözücü (3) |
| 74HC541 (tampon) | 25 | r0..r7 → veriyolu (16), PC, sabit, ALU, bayraklar → veriyolu; bayt okumada yüksek bayt = 0 |
| 74HC153 (4:1 seçici) | 9 | ALU sonuç seçici (8), C/V seçici (1) |
| 74HC08 / 32 / 00 / 02 / 86 / 04 / 10 | 17 / 9 / 8 / 5 / 9 / 4 / 7 | yapıştırıcı lojik ve kontrol biriminin kapıları (kart bitince birimler çiplere paketlenir) |
| 74HC11 / 20 / 21 | 1 / 4 / 4 | kontrol biriminin 3 ve 4 girişli kapıları |
| 74HC161 (sayaç) | 5 | PC (4), mikro adım sayacı (1) |
| 74HC74 (çift D FF) | 5 | N Z, C V, I, INT mandalı + HALT, FAULT + çalışma izni |
| 74HC283 (4 bit toplayıcı) | 4 | 16 bit toplayıcı |
| 74HC245 (çift yönlü) | 3 | veriyolu ↔ çift/tek bayt hatları |
| 74HC157 (2:1 seçici) | 3 | ALU işlem seçimi (bit 0..3), bayrak girişi, C/V tutma |
| 74HC688 (karşılaştırıcı) | 2 | sıfır (Z) algılama |

Kartta ROM yok: kontrol birimi (mikrokod ve ALU kod çözme) 19 MSI çip ve ≈ 38 kapı çipi tutar
([mikromimari.md](mikromimari.md), "Kapı seviyesinde kontrol birimi"). Kartın referans aralığı
U1..U199 (`CARD_REF_BASE`); sonradan eklenen register tamponlarının son 11'i ve kondansatörleri taşma
diliminde: U901–U911, C901–C912 (`CARD_REF_TASMA`); öbür çiplerin numaraları değişmedi.

Ayrıca: veriyolu çekme dirençleri (2 × 10 kΩ SIP-9), her entegreye 100 nF, kart girişine 100 µF,
HALTED ve FAULT LED'leri, 2 × 32 arka panel konnektörü.

**Hata ayıklama LED'leri ve çubuk göstergeler** (James Sharman'ın ve Ben Eater'ın breadboard
bilgisayarlarındaki gibi; register içeriği dışında entegre yok):

| Gösterge | Adet | Sinyal | Renk |
|---|---:|---|---|
| Register okuma / yazma (D3–D18) | 16 | `~ROE0`–`~ROE7`, `~WSEL0`–`~WSEL7` (aktif düşük) | okuma yeşil, yazma turuncu |
| Veriyolu sürücüsü (D19–D24) | 6 | `~SRC_REG`, `~SRC_ALU`, `~SRC_PC`, `~SRC_MEM`, `~SRC_IMM`, `~SRC_FLAGS` (aktif düşük) | beyaz |
| Bellek okuma / yazma (D25, D26) | 2 | `MEMRD`, `MEMW` | yeşil, turuncu |
| Yüklemeler (D27–D32) | 6 | TA (`CW17`), TB (`CW18`), MAR (`CW21`), IR (`CW23`), PC yükleme (`~PC_LOAD`), PC artırma | turuncu |
| Bayraklar (D33–D37) | 5 | `NFLAG`, `ZFLAG`, `CFLAG`, `VFLAG`, `IFLAG` | mavi |
| Mikro adım (D38–D41) | 4 | `STEP0`–`STEP3` | sarı |
| Çubuk göstergeler (DS1–DS10) | 10 | `BUS0`–`15`, `PC1`–`15`, `A0`–`15` (MAR), `IR0`–`15`, `RES0`–`15` (ALU sonucu) | sarı |
| Register içeriği (DS11–DS26) | 16 | `R0Q0`–`15` … `R7Q0`–`15` (her register'ın 574 çıkışları) | sarı |

Her LED'in yanında 1 kΩ (R3–R41), her çubuk göstergenin önünde 8 × 1 kΩ yalıtılmış direnç dizisi
(DIP-16, RN3–RN28): LED ve segment başına ≈ 3 mA. Aktif düşük sinyallerde LED VCC'den sinyale
bağlıdır (VCC → 1 kΩ → LED → sinyal): çıkış 0 olunca yanar. Çubuk göstergede 1. segment bit 0'dır.
Ayrıntı ve renk kuralları: [kit/led-ve-direnc.md](../kit/led-ve-direnc.md).

Register içeriğini görmek için register'ların 574'leri artık veriyolunu doğrudan sürmez:
çıkışları hep açıktır (`~OE` = GND) ve `R{r}Q0..15` hatlarındadır; çubuk göstergeler bu hatlara
bağlıdır. Veriyolunu register başına iki 74HC541 sürer (U195–U199, U901–U911; `~OE1` = `~ROEr`).
Bedeli 16 çip ve okuma yolunda bir tampon gecikmesi; zamanlama analizinin sonuçları değişmedi (en
uzun yollar register okumasından geçmez). Bu parça istenirse çıkarılabilir: 541'ler, DS11–DS26 ve
RN13–RN28 kalkar, 574'lerin `~OE`'si yine `~ROEr`'ye, çıkışları veriyoluna bağlanır.

**Test bellek kartı: 7 entegre.** 64 KB düz RAM (2 × 62256: çift ve tek baytlar) ve 0xFF00'da UART
çıkış mandalı (74HC574 + 2 × 74HC688 adres karşılaştırıcı). Emülatördeki `SimpleBus` ile birebir aynı
davranır; asıl anakart (bank'lı 1 MB bellek, ROM, G/Ç, video) Faz 6'da bunun yerini alır.

**Anakart kartları (Faz 6):** bellek kartı 34 entegre (bank register'ları, 32 KB EEPROM (28C256) +
128 KB RAM (4 × 62256), bayt sıralayıcı), önbellek kartı 46 entegre (2 KB, bekleme üreteci, sayaçlar),
G/Ç kartı 65 entegre (UART, PS/2, zamanlayıcı, kesme denetleyicisi), video kartı 73 entegre (VGA 80 × 30
metin), kendin yap bellek kartı 22 entegre (FF40–FF4F, 16 bayt, her bayt bir 74HC574; Deney 14); saat
kartı bekleme durumuyla 10 entegre. Anakart yalnız yaygın 7400 serisi lojikle ve iki bellek çipiyle
(62256, 28C256) kurulur ([spec.md](spec.md), "Parçalar"). `buildFullMachineBoard()` bunları CPU
kartıyla birleştirir (bütün anakart: 460 entegre), `GateMachine` kapı seviyesinde çalıştırır; test bilgisayarı
(`buildComputerBoard`, `GateComputer`) olduğu gibi kalır ve deney setinde CPU'nun kurulduğu ilk
sahnedir (test kartının FF00 mandalı Deney 8'de LED çıkışı olur). Ayrıntı:
[anakart-kartlari.md](anakart-kartlari.md), [anakart-gc-video.md](anakart-gc-video.md).

## Blok → çip eşlemesi (CPU kartı)

- **Kontrol birimi (mikrokod):** girişler `[12]INT [11:8]op [7:5]f3 [4]COND [3:0]adım` → kod çözücüler
  (6 × 74HC138), komut sınıfları ve VEYA ağı (kapılar), adım seçicileri (10 × 74HC151) → `MK0..31` →
  4 × 74HC574 kontrol register'ı (CR). Devreyi `board/kontrol.ts` mikrokoddan üretir
  (`npm run cpu16 -- kontrol`); ayrıntı [mikromimari.md](mikromimari.md).
- **Register dosyası:** her register iki 74HC574 (düşük/yüksek bayt), çıkışları hep açık ve çubuk
  göstergelerde; veriyoluna iki 74HC541 tamponla çıkar (üç durumlu). İndeks 3 × 74HC151
  (RD/RS1/RS2/SP/LR seçimi), okuma ve yazma için iki 74HC138.
- **ALU:** 4 × 74HC283 toplayıcı; girişler XOR/AND ile koşullanır (SUB'da B ters, NEG'de A ters,
  PASSB). Mantık birimi her bitte bir 74HC151 *doğruluk tablosu*: seçici girişleri (a, b) bitleri,
  veri girişleri ALU kod çözücüden gelen 4 bitlik işlem tablosu (AND/OR/XOR/…). Yüksek baytta
  üçüncü seçici girişi a7'dir; bu sayede SXB (bayt işaret genişletme) ek çip istemez. Sonuç
  8 × 74HC153 ile seçilir: toplam / mantık / sola kaydır / sağa kaydır.
- **ALU kod çözücü:** 3 × 74HC138 ve kapılar, girişler = {ALU işlemi (5), IR8, C bayrağı}. Toplayıcı
  kontrolü, mantık tabloları, sonuç seçimi, kaydırmada giren bit ve "C/V güncellensin mi" bitini üretir
  (`AD0..23`). Tablo `board/alu-kod.ts`'de, devre ondan üretilir (`board/kontrol.ts`): yeni bir ALU
  işlemi tabloya bir satırdır, devre `npm run cpu16 -- kontrol` ile yeniden üretilir.
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
| 46 | ~WAIT (bekleme isteği, saat kartında 10 kΩ ile 1) | 47 | ~IO (A15..A8 = 0xFF) |
| 48 | TCLK (uzatılmayan OSC/8) | 49 | OSC (tamponlu osilatör) |
| 50..55 | PA14..PA19 (fiziksel adresin üst bitleri) | 56 | VSYNC_REQ |
| 57..61 | boş | | |

Faz 6 pinlerini kim sürer, kim kullanır: [anakart-kartlari.md](anakart-kartlari.md).

## Doğrulama zinciri

Her katman bir öncekine karşı test edilir (`cpu16/tests/board.test.ts`):

1. **Emülatör** (referans) ↔ **saat döngüsü modeli** (`micro/datapath.ts`): Faz 2.
2. **Saat döngüsü modeli** ↔ **kapı seviyesi kart**: her saat döngüsünde PC, 8 register, bayraklar,
   IR, TA, TB, MAR ve mikro adım karşılaştırılır. hello, fib, add32, bubble ve irq programları ile
   150 rastgele komut akışı (10 000'den fazla komut, yasadışı komutlar dahil).
3. **Kapı seviyesi kart** ↔ **emülatör**: program sonunda register'lar, bellek ve UART çıktısı.
4. **KiCad şeması** ↔ **kart**: gerçek `kicad-cli` (7.x) şemadan netlist çıkarır; her netin pin
   kümesi kartın netleriyle aynı olmalıdır. `kicad-cli` kurulu değilse bu test atlanır.
5. **Anakart kartları** ↔ **`Machine`**: veriyolu izi bellek ve önbellek kartlarında, tam sistem
   (CPU dahil) komut komut (`tests/anakart-bellek.test.ts`, `tests/anakart-sistem.test.ts`; bkz.
   [anakart-kartlari.md](anakart-kartlari.md)).

Kapı seviyesi kart tarayıcı dışında saniyede yaklaşık 30 000 saat döngüsü çalışır (her döngüde
~1 800 kapı, 4 fazlı değerlendirme).

## Faz 4'te mikromimaride değişenler

- **IMM8 iki bayta kopyalanır** (`imm & 0xFF` yerine `imm * 0x101`). Donanımda 16 ayrı seçici yerine
  aynı 8 IR bitini iki bayta bağlamak yeter. `MERGE` (LUI/ORI ailesi) hangi baytı alacağını `h`
  bitine göre seçtiği için komut seti davranışı değişmedi; saat döngüsü modeli aynı şekilde
  güncellendi.
- Yazma darbeleri WR_WIN penceresine taşındı (yukarıda).

## Sınırlar ve sonraki adımlar

- Şema çizimi otomatik ızgaradır; okunurluk için KiCad'de bloklar hâlinde yeniden düzenlenebilir.
- PCB yerleşimi ve üretim dosyaları (Gerber, montaj kılavuzu, saat kartı, ROM programlayıcı) Faz 9'da.
- 3D görünümde kart → çip → kapı → transistör inişi Faz 5'te bu kart tanımını kullanır.
