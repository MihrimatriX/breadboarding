# CPU16 — Tasarım Spesifikasyonu v1.0

> Durum: **dondurulmuş (v1.0, 2026-10-11)**. Tüm kararları AFU onayladı.
> Bu belgeyi değiştirmek = yol haritasında "Spec değişikliği" kuralı (bkz. `roadmap.md`).
> Çalışma adı: **CPU16** (kalıcı isim sonra seçilecek).

## 0. Vizyon (AFU, 2026-10-11)

✅ Tamamen entegrelerden (74HC serisi) kurulan, kendimize ait bir 16 bit bilgisayar.
✅ Simülasyonda bir entegreye tıklayınca içi görünür: kart → çip → kapı → transistör (Silikon3D'nin 3D görüntüleyicisiyle).
✅ Klavye ve ekran dahil.
✅ Şeması çizilecek (devre şeması, sonra istenirse PCB).
✅ Yeniden programlanabilir (program belleği değiştirilebilir).

Bu, Ben Eater 8-bit / Gigatron / Magic-1 ailesinden bir proje; fark 16 bit olması ve her katmanın 3D'de açılabilmesi.

## 1. Bu kararın ISA'ya etkisi

Ayrık mantıkta her özellik = çip sayısı. Bu yüzden v0.1'den değişenler:

| Konu | v0.1 | v0.2 | Neden |
|---|---|---|---|
| Barrel shifter | var | **yok**, 1 bit kaydırma (SHL/SHR/SAR/ROL/ROR ×1) | 16 bit barrel shifter ≈ 8–12 adet 74HC153 |
| MUL/DIV | donanım (ops.) | **yazılım** (ROM'da kütüphane rutini) | donanım çarpıcısı onlarca çip |
| Kontrol birimi | sabit FSM | **mikrokod, 74HC kapılarıyla** (ilk planda Flash'taydı) | Ben Eater yöntemi; mikrokod tablosu `micro/cpu16.ucode`'da, kapı devresi ondan üretilir (`npm run cpu16 -- kontrol`). CPU'da ROM yok (AFU kararı) |
| Saat | — | ~1–4 MHz, adım adım tek saat butonu | 74HC ile güvenli; videoda adım adım izlenir. İlk gerçek kart 1 MHz (8 MHz osilatör / 8): şemadan zamanlama analizi, [uretim.md](uretim.md) |

Kalanlar aynı: load/store, sabit 16 bit komut, 8 register, NZCV, byte adresli 64 KB, bellek eşlemeli G/Ç.

## 2. Donanım blokları

| Blok | Çipler (tahmini) | Not |
|---|---|---|
| Register dosyası 8×16 | 74HC574 ×16 + 74HC138 + 3-state buffer'lar (veya 74HC670 ×8) | 670 daha az çip ama nadir |
| ALU 16 bit | 74HC283 ×4 (toplayıcı) + 74HC86/08/32 (XOR/AND/OR) + 74HC157 mux | 74181 artık bulunmuyor; kapılardan kurmak öğretici, parçaları da bulunabilir |
| Bayraklar | 74HC74 / 74HC175 | |
| PC, MAR, IR | 74HC161 ×4 (PC), 74HC574 ×2+2 | |
| Mikrokod | 74HC138 kod çözücüler + 74HC151 + VEYA ağı (`board/kontrol.ts`, tablodan üretilir) + mikro-adım sayacı 74HC161 | 32 kontrol sinyali; ilk planda 3–4 adet Flash'tı |
| Bellek | 32 KB ROM (28C256 EEPROM) + 32 KB RAM (62256) | |
| Adres çözümleme | 74HC138 / 74HC688 | `0xFF00+` G/Ç |
| Ekran | VGA metin modu 80×30, 640×480@60 Hz; video kartında kendi VRAM'i (karakter + renk), font ROM, 74HC161 sayaçlarla zamanlama | CPU, VRAM'e G/Ç penceresinden yazar |
| Klavye | PS/2: 74HC595/164 kaydırma register'ı | |
| Programlama | ROM'da bootloader + USB-UART (CH340) ile RAM'e yükle | çip sökmeden yeniden programlama |

Kaba toplam: **60–90 entegre** (cache ve MMU hariç).

## 2b. Anakart mimarisi (AFU, 09:25: "kendi cache'i, belleği, G/Ç'si olan bir anakart")

✅ Sistem bir **anakart** gibi kurgulanır: CPU, cache, ana bellek, G/Ç denetleyicileri ayrı bloklar, ortak bir sistem veriyolu üzerinde.

```
 CPU çekirdeği ── cache (L1) ── SİSTEM VERİYOLU (16 veri / 16-24 adres / kontrol)
                                   ├── ana bellek: ROM (BIOS/bootloader) + RAM
                                   ├── MMU / bank register (64 KB'tan fazlası için)
                                   ├── G/Ç: klavye (PS/2), ekran, UART (programlama), zamanlayıcı
                                   └── genişleme slotları
```

**Cache**: 1–2 KB, direct-mapped, write-through. Hızlı SRAM (IS61C256, 15 ns) + tag SRAM + 74HC688 karşılaştırıcı + hit/miss mantığı (~10–15 çip).
- Not: 74HC hızlarında RAM zaten CPU kadar hızlı, cache kendiliğinden fark yaratmaz. Cache'in anlamlı olması için ana bellek **bekleme durumlu (wait state)** yavaş bir veriyolunda olur (ör. 2 bekleme durumu). Böylece hit = 1 döngü, miss = 3 döngü; sayaçla hit oranı ölçülüp videoda gösterilir.

**Ana bellek**: 128 KB RAM (4 × 62256) + 32 KB EEPROM (28C256); CPU 64 KB görür, 16 KB'lık 4 pencere **bank register'larıyla** fiziksel 1 MB alana eşlenir (basit MMU). Alanın geri kalanı boştur (`0xFF` okunur).

**G/Ç**: bellek eşlemeli `0xFF00–0xFFFF`; klavye ve UART kesme (IRQ) ile, öncelik kodlayıcı kapılarla.

✅ **Parçalar (AFU)**: bilgisayar yalnızca yaygın 7400 serisi lojikle ve iki bellek çipiyle kurulur: 62256 (32 KB SRAM) ve 28C256 (32 KB EEPROM). Nadir ya da tek kaynaklı parça yok: 512 KB'lık RAM (AS6C4008), Flash (SST39SF010A), 74HC590, 74HC193 ve 74HC148 bu yüzden çıkarıldı (yerlerine 74HC161 + 74HC541 ve kapılar). Tek istisna gibi görünen 74HC166 yaygın bir parçadır ve kalır: 74HC165'in eşzamansız yüklemesi video kartının piksel saatine sığmaz ([anakart-gc-video.md](anakart-gc-video.md)).

**Kendin yap bellek kartı**: G/Ç alanında `FF40–FF4F`'te 16 baytlık bir eğitim kartı; her bayt bir 74HC574, adres çözme 74HC138'lerle. Bir 62256'nın içindeki hücre / çözücü / ortak veri hattı düzeni açıkta görünür (Deney 14).

**Kart düzeni**: backplane + takılabilir kartlar (RC2014 tarzı): CPU kartı, cache kartı, bellek kartı, video kartı, G/Ç kartı (klavye + UART + zamanlayıcı), saat/reset kartı. Her kart ayrı bir deney ve ayrı bir KiCad şeması.

## 2e. Bellek haritası (CPU'nun gördüğü 64 KB)

| Adres | Boyut | İçerik |
|---|---|---|
| `0x0000–0x3FFF` | 16 KB | Pencere 0: resetten sonra ROM bank 0 (vektörler + BIOS/bootloader) |
| `0x4000–0x7FFF` | 16 KB | Pencere 1: RAM bankı |
| `0x8000–0xBFFF` | 16 KB | Pencere 2: RAM bankı |
| `0xC000–0xFEFF` | ~16 KB | Pencere 3: RAM bankı (yığın burada) |
| `0xFF00–0xFFFF` | 256 B | G/Ç: bank register'ları, klavye, UART, zamanlayıcı, video, cache sayaçları |

Vektör tablosu (ARM tarzı, her biri bir `JAL`): `0x0000` reset, `0x0002` IRQ, `0x0004` SWI. Fiziksel adres = 6 bit bank numarası + 14 bit ofset = 20 bit (1 MB): EEPROM `0x00000–0x07FFF`, RAM `0x80000–0x9FFFF`, gerisi boş.

## 2c. Programlama ve yükleme (AFU, 09:36)

✅ Program iki yoldan yüklenir:
- **Web**: tarayıcıdaki IDE'de yaz → derle → simülatöre yükle. Gerçek kart bağlıysa Web Serial API ile USB-UART üzerinden karttaki bootloader'a gönder (çip sökmeden).
- **Fiziksel**: aynı .bin / Intel HEX dosyası EEPROM programlayıcıyla 28C256'ya yazılır. Deney setine kendi programlayıcımız dahil (Arduino Nano + 2×74HC595 ile, Ben Eater tarzı); hazır TL866/T48 de çalışır.

✅ **C ile programlanacak, derleyiciyi kendimiz yazacağız.**

```
 kaynak.c ──cc16──▶ kaynak.s ──as16──▶ kaynak.o ──ld16──▶ program.bin / .hex
                                                     │
                     crt0.s + libc16 (printf, malloc,│ soft MUL/DIV, string)
                                                     ▼
                       web: simülatör / Web Serial    fiziksel: EEPROM programlayıcı
```

Araç zinciri TypeScript ile yazılır: hem tarayıcıda (web IDE) hem Node CLI'da aynı kod çalışır.
Derleyici: chibicc tarzı, elle yazılmış recursive-descent parser + AST → basit IR → CPU16 assembly. Sürümler:
  1. C alt kümesi: int/char/pointer/dizi/if/while/for/fonksiyon (ilk C programı ekranda "Merhaba")
  2. struct/union/enum, global değişken, string, switch
  3. typedef, önişlemci (#include/#define), çoklu dosya + linker
  4. long (32 bit, ADC/SBC ile), register ayırma (lineer tarama), optimizasyonlar
  5. (ileride) float = soft-float; derleyiciyi CPU16'nın üzerinde çalıştırma (self-host)
ABI: argümanlar r0–r3, dönüş r0 (32 bit: r0:r1), r4–r5 callee-saved, r6 = SP, r7 = LR; `int` = 16 bit, `long` = 32 bit.

## 2d. Eğitim ve deney seti (AFU, 09:36)

✅ Proje aynı zamanda bir tutorial + deney seti. Her deney = bir video + simülatörde bir sahne + gerçek kartta bir modül:

| # | Deney | Çıktı |
|---|---|---|
| 1 | Saat (555, adım butonu) | yanıp sönen LED |
| 2 | Kapılar ve transistör (CMOS) | 3D'de NAND'ın içi |
| 3 | Register ve veriyolu | 16 LED'de değer |
| 4 | ALU | toplama/çıkarma, bayraklar |
| 5 | PC + bellek + komut çekme | program sayacı yürür |
| 6 | Mikrokod ve kontrol birimi | ilk komut çalışır |
| 7 | Assembler (as16) | ilk program |
| 8 | Kesmeler + G/Ç | klavye tuşu |
| 9 | Ekran | "Merhaba" ekranda |
| 10 | Cache + bekleme durumu | hit oranı ölçümü |
| 11 | Bank/MMU | 1 MB bellek |
| 12 | Bootloader + Web Serial | tarayıcıdan karta yükleme |
| 13+ | C derleyicisi (5 aşama) | C ile yılan oyunu |

## 3. Katmanlı model (simülasyon ↔ 3D)

1. **Kart**: KiCad şeması → netlist → 3D kart (çipler, kablolar, LED'ler).
2. **Çip**: her 74HC parçasının kendi kapı seviyesi modeli var (ör. 74HC283 = 4 tam toplayıcı).
3. **Kapı → transistör**: her kapı CMOS transistörlerine açılır (Silikon3D motoru zaten CMOS anahtar seviyesini destekliyor).

Tek kaynak: KiCad şeması. Simülatör ve 3D görünüm şemadan üretilir; şema değişirse hepsi güncellenir.

## 4. Komut formatları

Bitler `[15:0]`. `op` = `[15:12]`.

```
R  : op(4) | rd(3) | rs1(3) | rs2(3) | f3(3)
I  : op(4) | rd(3) | rs1(3) | imm6(6, işaretli)
S  : op(4) | rs2(3)| rs1(3) | imm6(6, işaretli)
L  : op(4) | rd(3) | h(1)   | imm8(8)              ; LI / LUI
C  : op(4) | rs1(3)| imm9(9, işaretli)             ; CMPI
B  : op(4) | cond(4)| off8(8, işaretli, ×2)
J  : op(4) | off12(12, işaretli, ×2)
```

## 5. Opcode haritası

Bit bit davranış (bayraklar, dallanma hesabı, kesme girişi): [isa-ayrintilari.md](isa-ayrintilari.md).

| op | Mnemonik | Format | Anlam |
|---|---|---|---|
| 0 | ALU | R | f3: ADD, ADC, SUB, SBC, AND, OR, XOR, CMP (CMP: rd alanı kullanılmaz) |
| 1 | ALU2 | R | f3: MOV, NOT, NEG, SHL, SHR, SAR, ROL, ROR (1 bit) |
| 2 | — | | Rezerve (eski MULDIV) |
| 3 | ADDI | I | rd = rs1 + imm6 |
| 4 | LI / LUI | L | h=0: rd = zext(imm8); h=1: rd[15:8] = imm8 |
| 5 | LW | I | rd = mem16[rs1 + imm6×2] |
| 6 | SW | S | mem16[rs1 + imm6×2] = rs2 |
| 7 | LBU | I | rd = zext(mem8[rs1 + imm6]) |
| 8 | SB | S | mem8[rs1 + imm6] = rs2[7:0] |
| 9 | Bcc | B | EQ NE CS CC MI PL VS VC HI LS GE LT GT LE AL |
| 10 | JAL | J | r7 = PC+2; PC += off12×2 |
| 11 | JALR | I | rd = PC+2; PC = rs1 + imm6×2 (RET = JALR r7, r7, 0) |
| 12 | CMPI | C | bayrak = rs1 − sext(imm9) |
| 13 | STACK | R | PUSH rs1, POP rd (SP = r6) |
| 14 | SYS | R | NOP, HALT, EI, DI, RETI, SWI, SXB |
| 15 | — | | Rezerve |

## 6. Kesinleşen kararlar (2026-10-11)

| Konu | Karar |
|---|---|
| Gerçekleme | 74HC entegreleri; önce simülasyon, sonra aynı şemadan gerçek kart |
| Ekran | VGA metin modu 80×30 |
| Kart düzeni | Backplane + kartlar |
| Bellek | 1 MB fiziksel adres alanı, 4×16 KB bank penceresi; 32 KB EEPROM + 128 KB RAM takılı |
| Parçalar | yalnız yaygın 7400 serisi lojik + 62256 ve 28C256 bellekler |
| Programlama | Web (IDE + Web Serial) ve fiziksel (EEPROM programlayıcı) |
| Derleyici | Kendi C derleyicimiz (cc16), araç zinciri TypeScript |
| Şema aracı | KiCad (tek kaynak) |
| Register dosyası | 74HC574 tabanlı |
| Cache | 1–2 KB direct-mapped, write-through |

Hâlâ açık: işlemcinin kalıcı adı.
