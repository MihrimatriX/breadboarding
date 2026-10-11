# Anakart kartları: saat, bellek ve önbellek (Faz 6, kapı seviyesi)

> [anakart.md](anakart.md)'deki bellek tarafı artık gerçek çiplerden kurulmuş kartlar olarak da var:
> şema = kod ([kartlar.md](kartlar.md)). Emülatördeki `Machine` (`emu/machine.ts`, `emu/devices/cache.ts`)
> referanstır; kartlar onunla erişim erişim ve komut komut karşılaştırılır. `Machine` bu iş için
> değiştirilmedi.

| Dosya | İçerik |
|---|---|
| `board/clock-card.ts` | Saat ve reset kartı (`clk`): bekleme durumu, TCLK, OSC |
| `board/mem-card.ts` | Bellek kartı (`bellek`): G/Ç çözümü, bank register'ları, Flash + RAM, bayt sıralayıcı |
| `board/cache-card.ts` | Önbellek kartı (`onbellek`): etiket/veri belleği, bekleme üreteci, sayaçlar, CACHE_CTRL |
| `board/machine-board.ts` | `buildMachineBoard({ cards })`: CPU + saat + bellek + önbellek (+ ek kartlar); `GateMachine` |
| `board/bus-master.ts` | `BusMaster`: CPU kartı yerine arka paneli süren düzenek (veri yolu izini oynatmak için) |
| `chips/parts/bellek-ek.ts` | Yeni parçalar: 74HC273, 74HC590 |
| `kicad/bellek/`, `kicad/onbellek/` | KiCad şemaları ve kart BOM'ları (`npm run cpu16 -- board kicad`) |
| `tests/anakart-bellek.test.ts`, `tests/anakart-sistem.test.ts` | Doğrulama (aşağıda) |

## Kartlar ve çip sayıları

| Kart | Entegre | Ayrıntı |
|---|---:|---|
| Saat ve reset (`clk`) | 10 (önce 9) | 74HC14, 74HC157, 74HC175 (Johnson sayacı), 74HC74 × 2 (ADIM eşzamanlama; GO + **W**), 74HC541 (saat dağıtımı), 74HC04, 74HC08 × 2, 74HC32 |
| Bellek (`bellek`) | 31 | aşağıda |
| Önbellek (`onbellek`) | 37 | aşağıda |

Ayrıca her kartta entegre başına 100 nF, kart girişine 100 µF, 2 × 32 arka panel konnektörü.
Bellek kartında 3 × 10 kΩ SIP (MD, DE, DO çekme dirençleri), saat kartında ~WAIT için 10 kΩ.

## Arka panel (Faz 6 pinleri)

| Pin | Sinyal | Süren | Kullanan |
|---|---|---|---|
| 46 | ~WAIT | önbellek kartı (çekme direnci saat kartında) | saat kartı, bellek kartı |
| 47 | ~IO | bellek kartı (74HC688: A15..A8 = 0xFF) | önbellek kartı, G/Ç kartları |
| 48 | TCLK | saat kartı (Johnson Q1) | bellek ve önbellek kartları |
| 49 | OSC | saat kartı (tamponlu osilatör) | önbellek kartı (reset temizlemesi) |
| 50..55 | PA14..PA19 | bellek kartı (bank register'ı seçici) | önbellek kartı (etiket) |
| 56 | VSYNC_REQ | video kartı | G/Ç kartı |

DE/DO çekme dirençleri bellek kartındadır: sürülmeyen adres (boş bölge, takılı olmayan G/Ç) 0xFF okunur.

## Saat kartı: bekleme durumu

Johnson sayacı her CPU döngüsünde s0..s7'yi dolaşır (bkz. `clock-card.ts` başındaki tablo).
W flip-flop'u (74HC74'ün boş yarısı) ~WAIT'i **s7'nin ortasında** (osilatörün düşen kenarı)
örnekler. W = 1 iken CLK ve WR_WIN bir AND ile kapalı tutulur; sayaç bir tur daha (8 osilatör
periyodu = tam bir CPU saati) döner. W yalnızca s7'nin ortasında değişir; o anda CLK de WR_WIN de
zaten düşüktür, kapılama parazit üretmez. Sonuç: her bekleme turu CPU döngüsünü tam 8 OSC uzatır,
yazma penceresi döngü başına bir kez açılır.

- **TCLK** = Johnson Q1: uzatılmayan OSC/8. CLK'nin düşen kenarından 2 OSC sonra düşer, 6 OSC sonra
  yükselir; bekleme turlarında da sayar. Sayaçla birlikte durur (ADIM kipi, reset): TCLK CPU
  zamanıdır, gerçek zaman değil.
- **OSC**: tamponlu osilatör, her zaman çalışır (önbellek kartı etiket belleğini reset sırasında
  bununla temizler).
- **ADIM kipi**: GO, sayaç s0'a gelince düşer; bekleme turunda sayaç s0'dan geçer ama W = 1'dir ve GO
  tutulur. Bir basış = bekleme turları dahil tam bir CPU döngüsü.

## Bekleme durumlu bir erişim

Ana belleğe giden her erişim (okuma ıskalaması, önbellek kapalıyken okuma, her bellek yazması) tam
**2 bekleme turu** alır (`MEM_WAIT`). İsabet ve G/Ç beklemesizdir. Çizim: kelime erişimi, t = CLK'nin
düşen kenarından (F) itibaren osilatör periyodu; R = CLK↑ (register'lar yüklenir).

```
t (OSC)       -4      0       4       8       12      16      20      24      28
              R       F                                       R'      F'
CLK           ‾‾‾‾‾‾‾‾\_______________________________________/‾‾‾‾‾‾‾\_______
WR_WIN        __________/‾‾‾\___________________________________________/‾‾‾\_
TCLK          ____/‾‾‾‾‾‾‾\_______/‾‾‾‾‾‾‾\_______/‾‾‾‾‾‾‾\_______/‾‾‾‾‾‾‾\___
~MRD (okuma)  ‾‾‾‾‾‾‾‾\_______________________________________________/‾‾‾‾‾‾‾
~WAIT         ‾‾‾‾‾‾‾‾\___________________________/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾   (yazmada t = 1'de düşer)
W örnekler                   ^               ^               ^
W (WST)       _______________/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\________________
CA            ____________________/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\___________   önbellek kartı
CB            ____________________________________/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\___________
CBF           ____________________________________________/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\___
TAGPH         ____________________________________/‾‾‾‾‾‾‾\___________________   etiket/veri yazma
SA            ____________________/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\___________   bellek kartı
BSEL = A0     ____________________________/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\___
574 mandalı                       ↑                                               çift bayt (okuma)
DE/DO sür     ____________________________/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\___________   okuma
~MWR çift     ‾‾‾‾‾‾‾‾‾‾‾‾\_______/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾   yazma
~MWR tek      ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\_______/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾   yazma
```

1. **İstek** (önbellek kartı): `NEED = ~IO ∧ ¬CLK ∧ (WRL ∨ (okuma ∧ ¬(EN ∧ HIT)))`. WRL, CPU'nun
   ~MWE_E/~MWE_O darbesiyle kurulan, CLK↑ ile silinen bayraklardır (74HC74 ön kurma girişi).
   `~WAIT = ¬((NEED ∨ CA) ∧ ¬CB)`; CA ← ~WAIT düşük (TCLK↑, t = 6), CB ← CA ∧ ~WAIT düşük (t = 14).
   Saat kartı ~WAIT'i t = 3,5 ve 11,5'te düşük, 19,5'te yüksek görür: **tam iki tur**, R' = 20.
2. **Bayt sırası** (bellek kartı, ~WAIT ve TCLK'den kendi kendine): SA ← bekleme (t = 6),
   BSEL ← SA (TCLK↓, t = 10). Çift bayt t = 6'da 74HC574'e alınır (BSEL = 0); BSEL = 1 iken tek
   bayt 74HC245 ile doğrudan DO'ya gider. Kart DE/DO'yu [10, 22) sürer; CPU R' = 20'de örnekler.
3. **Yazma**: CPU'nun yazma darbesi bellek çiplerine gitmez, yalnızca WEL_E/WEL_O bayraklarını kurar.
   Çift bayt [2, 6) (BSEL = 0), tek bayt [14, 18) (BSEL = 1) penceresinde yazılır. A0'ı (BSEL)
   değiştiren kenar ile bir yazma darbesini bitiren kenar arasında en az 4 OSC vardır; veri darbeden
   önce ve sonra en az 4 OSC sabittir.
4. **Önbellek güncellemesi** TAGPH = [14, 18) evresinde: okuma ıskalamasında (EN = 1) satır,
   bellek kartının sürdüğü DE/DO'dan dolar; RAM'e (PA19 = 1) yazma isabetinde yazılan bayt(lar)
   satırda güncellenir; Flash/boş bölgeye (PA19 = 0) yazma isabetinde satır geçersiz kılınır.
5. **İsabet**: CA = 0 iken veri SRAM'i ~MRD ile birlikte DE/DO'yu sürer; bekleme yok.

Kelime/bayt ayrımı yoktur: bayt okuması da iki baytı okur (CPU birini kullanır), bayt yazması da
2 bekleme alır (`Machine` ile aynı).

## Bellek kartı (31 entegre): blok → çip

| Blok | Çipler |
|---|---|
| Adres çözme | 74HC688 (A15..A8 = FF → ~IO), 74HC688 (FF10..FF13), 74HC139 (bank register seçimi FF10/11 · FF12/13; Flash seçimi PA19..17 = 000), NAND (RAM seçimi PA19 = 1) |
| Bank register'ları | 74HC273 × 4 (~MR = ~RESET; reset değeri 1 olan bitler girişte ve çıkışta evirici ile ters saklanır: 0/32/33/34), 74HC153 × 3 (A15..A14 ile PA14..PA19), 74HC541 × 4 (geri okuma, üst iki bit 0) |
| Bayt sıralayıcı | 74HC74 × 2 (SA/BSEL; WEL_E/WEL_O), 74HC574 (çift bayt mandalı → DE), 74HC245 × 2 (DE → MD yazma; MD ↔ DO) |
| Flash ve RAM | SST39SF010A (DIP-32 soket; A0 = BSEL, A1..A13, PA14..PA16), AS6C4008 (PA14..PA18), ~OE = ~MRD, ortak ~WE = ~MWR |
| Yapıştırıcı | 74HC04 × 3, 74HC08 × 2, 74HC32 × 2, 74HC00 × 2, 74HC02 |
| Çekme dirençleri | MD0..7 (boş bölge 0xFF), DE0..7, DO0..7 |

anakart.md'deki tahminden farklar: bank reset değeri XOR yerine evirici çiftleriyle (74HC273'te
yalnız sıfırlama var); geri okuma 74HC244 yerine kütüphanede zaten olan 74HC541 ile; bayt sıralayıcı
74HC161 + 138 yerine iki 74HC74 ile (bekleme turlarını önbellek kartı sayar, bu kart ~WAIT'i izler).

## Önbellek kartı (37 entegre): blok → çip

| Blok | Çipler |
|---|---|
| G/Ç çözme | 74HC688 (FF30..FF37), 74HC139 (FF30 isabet, FF32 ıskalama, FF34 CACHE_CTRL) |
| Bekleme ve sıralama | 74HC74 × 3: CA/CB (TCLK↑), WRL_E/WRL_O (yazma bayrakları), CBF (TCLK↓) / INVL (geçersiz kılma kararı, t = 6) |
| Etiket belleği | 62256 × 2 (16 bit: A11..A13, PA14..PA19, geçerli, 6 × 0), 74HC541 × 2 (yeni etiket sürücüsü, yalnız yazarken), 74HC688 × 2 (karşılaştırma → HIT; yüksek yarıda geçerli = 1 sabit), 74HC161 × 3 (reset temizleme sayacı), 74HC157 × 3 (etiket adresi: A10..A1 ya da sayaç), 74HC74 (CLRS; EN = CACHE_CTRL bit0, reset'te 1) |
| Veri belleği | 62256 × 2 (DE ve DO şeritleri, adres A10..A1) |
| Sayaçlar | 74HC590 × 4 (isabet ve ıskalama, 16 bit; sayıcı CLK↑'de, çıkış register'ı okuma adımının başında), 74HC541 (CACHE_CTRL geri okuma) |
| Yapıştırıcı | 74HC08 × 5, 74HC32 × 3, 74HC02 × 2, 74HC00, 74HC04 |

- **Sayım**: CLK↑'de (R) bir kez: isabet = okuma ∧ EN ∧ HIT ∧ ¬CA, ıskalama = okuma ∧ EN ∧ CA.
  Bir veri yolu döngüsü = bir kelime erişimi = bir sayım; önbellek kapalıyken sayılmaz. Üst sayıcının
  ~CEC'si = ~CEC_alt ∨ ~RCO_alt (74HC590'ın ~RCO'sunun izinle kapılanıp kapılanmaması sonucu
  değiştirmez). FF30'a çift bayt yazması ve ~RESET iki sayacı da sıfırlar.
- **Reset**: ~RESET düşükken CLRS = 1: etiket adresi 74HC157'lerle temizleme sayacına geçer ve OSC'nin
  her düşük yarısında bir satıra "geçersiz" yazılır; karşılaştırıcı kapalıdır. ~RESET kalkınca CLRS
  OSC↑ ile düşer (son yazma darbesi adres değişmeden kapanır). **~RESET en az 1025 OSC periyodu**
  düşük kalmalıdır; gerçek kartta reset RC'si milisaniyeler sürer, `GateMachine` 1100 periyot tutar.
- **Sinyal adlarında** kart önekleri: bellek kartının iç netleri `M_`, önbellek kartınınkiler `C_`.

## Doğrulama zinciri

1. **Parçalar**: 74HC273 ve 74HC590'ın kapı modeli = veri sayfası tablosu = transistör açılımı
   (`chips.test.ts`, diğer çiplerle aynı test).
2. **Saat kartı tek başına** (`anakart-sistem.test.ts`): ~WAIT'i bir bellek kartı gibi süren
   düzenekle 0..5 beklemeli 60 döngü. CLK, WR_WIN ve TCLK'nin her kenarı beklenen OSC periyodunda,
   yalnızca osilatörün yükselen kenarında; ardışık CLK↑ arası 8·(1 + bekleme). Kenarlar ayrıca
   74HC590 sayaçlarıyla sayılır (dalga içinde bir parazit olsaydı sayaç fazla sayardı). ADIM kipinde
   12 basış: her basış tam bir döngü, bekleme turları dahil; basışlar arasında saat durur.
3. **Bellek + önbellek kartları ↔ Machine, veri yolu izi** (`anakart-bellek.test.ts`): `Machine`'in
   `onAccess` izi kelime/bayt veri yolu döngülerine gruplanır ve `BusMaster` ile gerçek saat, bellek ve
   önbellek kartlarında oynatılır. Her erişimde okunan değer, bekleme turu sayısı, bank register'ları,
   sayaçlar ve CACHE_CTRL; sonda Flash, 512 KB RAM, 1024 etiket ve geçerli satırların verisi
   karşılaştırılır. Senaryolar: BIOS açılışı ("> " istemine kadar, ≈ 52 000 bayt erişimi), monitör komutları
   (C, C 0 / C 1, W, D, B, I — Flash kimliği), F komutuyla Intel HEX → Flash (sektör silme, bayt
   programlama, DQ7 yoklaması), 64 bank + bank register'ları + RAM/Flash/boş bölge gözetleme + önbellek
   kapalı/açık + sayaç taşması + Flash komut dizileri, 1 MB fiziksel harita (önbellek açık ve kapalı).
4. **Tam sistem ↔ Machine, komut komut** (`anakart-sistem.test.ts`): `GateMachine` (CPU + saat +
   bellek + önbellek kartları, gerçek mikrokod) her komuttan sonra PC, 8 register, N Z C V I
   bayrakları, toplam döngü ve bekleme sayısıyla karşılaştırılır; sonda bellek, etiketler ve
   sayaçlar. fib, bubble, add32, hello RAM'den (pencere 2); bir sınama programı (64 bank, kelime
   olarak bank okuma, önbellek kapalı/açık, Flash kimliği SST komut dizisiyle, Flash yazmasının
   önbellek satırını geçersiz kılması, sayaçlar); BIOS açılışı reset'ten başka bir kartın G/Ç
   adresinden ilk okumaya kadar (~57 700 döngü: bank register'ları, önbellek açma, değişkenleri
   sıfırlama, Flash rutinlerini RAM'e kopyalama, ekran temizleme).
5. **KiCad**: `kicad-cli` bellek ve önbellek şemalarından netlist çıkarır; her netin pin kümesi
   kartın netleriyle aynı (`board.test.ts`, kurulu değilse atlanır). ERC: `buildMachineBoard()`'da
   çakışan çıkış ve boşta giriş yok.

Hız (tarayıcı dışında): `BusMaster` saniyede ≈ 10 000, `GateMachine` ≈ 5 000–7 000 CPU döngüsü.

## Bilinen farklar ve kısıtlar

- **Ardışık veri yolu adımı yok varsayımı**: bellek kartının sıralayıcısı bir erişimden sonra t = 26'ya
  kadar (bir sonraki adımın ilk 2 OSC'si) sürer. Mikrokodda iki bellek adımı hiç art arda gelmez
  (her `MEM` adımının önünde ve arkasında veri yolu kullanmayan bir adım vardır; getirmenin 0. adımı
  `PC -> MAR` dahil); mikrokod değişirse bu korunmalıdır.
- **Bekleme üreteci önbellek kartındadır**: isabet/ıskalamayı yalnızca o bilir. Bellek kartı tek
  başına (önbellek kartı olmadan) bekleme istemez ve çalışmaz.
- **Flash çip modeli** (`chips/parts/memory.ts`) ile emülatördeki Flash arasında, BIOS'un hiç
  kullanmadığı köşelerde fark var: kimlik kipinde çip yalnız adres 0 (BF) ve 1 (B5) için kimlik verir
  (emülatör adresin teklik/çiftliğine bakar); tek döngülü `F0` çipte program/silme son adımı dışında
  her durumda okuma kipine döndürür (emülatör yalnız boşta ve iki kilit açma döngüsünden sonra).
  Kart reset'i Flash'ı sıfırlamaz (gerçek çip gibi); `Machine.reset()` sıfırlar (anakart.md, "Flash").
- **TCLK CPU zamanıdır**: `Machine.cycles` gibi bekleme turlarını da sayar, ama ADIM kipinde ve reset
  sırasında sayaçla birlikte durur. Her zaman çalışan saat OSC'dir.
- **Gerçek kartta zamanlama payı** (simülasyon sıfır gecikmelidir; aşağıdakiler 5 V 74HC tipik
  gecikmeleriyle kaba tahmindir): 32 MHz osilatörde (4 MHz CPU) bekleme kararı F'den sonra 3,5 OSC
  ≈ 109 ns içinde W'ye ulaşmalıdır. Yol: CPU kontrol register'ı + 74HC138 + iki evirici → ~MRD
  (≈ 50 ns) → önbellek kartında NEED/~WAIT (≈ 6 kapı, 60 ns) → saat kartında evirici + 74HC74
  kurulma (≈ 25 ns) ≈ 135 ns: **sığmaz** (16 MHz osilatörde pay 219 ns).
  İsabetli okumada veri SRAM'inin ~OE'si de ~MRD'den sonra açılır ve veri R'ye (F + 125 ns) kadar
  CPU'ya ulaşmalıdır (70 ns'lik 62256 ile sığmaz, 15 ns'lik IS61C256AL ile sınırda). Kartlar
  davranış olarak her saat hızında aynıdır (her şey CPU döngüsüyle sayılır); ilk kurulum için
  osilatör 16 MHz (CPU 2 MHz) ve 15–25 ns'lik SRAM önerilir; 4 MHz CPU için bu yollardaki
  yapıştırıcı kapılar 74AHC/74AC olmalıdır.

## Kullanım

```ts
import { GateMachine, buildMachineBoard } from "./board/machine-board.ts";
const g = new GateMachine(microcodeRom);   // ya da new GateMachine(rom, { cards: [buildIoCard, buildVideoCard] })
g.loadFlash(biosImage);
g.reset();                                  // ~RESET 1100 OSC periyodu düşük (önbellek temizlenir)
g.step();                                   // bir komut (bekleme turları dahil); g.cycles, g.waitCycles
g.probe.hits; g.probe.tag(line); g.probe.banks;   // kartların içi
const { board } = buildMachineBoard();      // şema, BOM, KiCad, ERC
```

G/Ç kartı takılı değilse `GateMachine` IRQ'yu 0'da tutar ve 0xFF00'a yapılan çift bayt yazmalarını
`output`'a ekler (yalnız test için UART izleyicisi; UART_STAT okuyan programlar bu düzenekte
`Machine` ile aynı gitmez, onlar için G/Ç kartı gerekir).
