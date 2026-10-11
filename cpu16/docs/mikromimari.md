# CPU16 — Mikromimari ve Mikrokod (Faz 2)

> Komutların saat döngüsü düzeyinde nasıl çalıştığı. Kaynaklar: `micro/control.ts` (kontrol kelimesi), `micro/cpu16.ucode` (mikrokod), `micro/microasm.ts` (mikrokod derleyicisi), `micro/datapath.ts` (saat döngüsü modeli), `board/kontrol.ts` (mikrokoddan kapı seviyesinde kontrol birimi).

## Blok şeması

Tek bir 16 bitlik **iç veriyolu** var. Her saat döngüsünde veriyoluna tek bir kaynak yazar, istenen sayıda hedef saat kenarında onu yükler (Ben Eater mimarisinin 16 bitlik, register dosyalı hali).

```
                       ┌──────────── 16 bit İÇ VERİYOLU ────────────────────────────┐
                       │                                                             │
 ┌───────────┐  oku/yaz│  ┌────┐  ┌────┐                 ┌──────────┐   ┌────────┐   │
 │ Register  │◀───────▶│  │ TA │  │ TB │──┐              │ PC       │◀─▶│ +2     │   │
 │ dosyası   │         │  └─┬──┘  └─┬──┘  │              │ 74HC161×4│   └────────┘   │
 │ 8 × 16    │         │    ▼       ▼     │              └──────────┘                │
 │ 74HC574×16│         │  ┌──────────────┐│  NZCV        ┌──────────┐   ┌────────┐   │
 └─────▲─────┘         │  │     ALU      │├────────────▶│ BAYRAKLAR│◀─▶│  I     │   │
       │ RSEL          │  │ 283×4 + mantık│              └──────────┘   └────────┘   │
       │ (RD/RS1/RS2/  │  │ + kaydırıcı  │──▶ veriyolu                                │
       │  SP/LR)       │  └──────────────┘                                            │
 ┌─────┴─────┐         │  ┌──────────┐     ┌──────────┐   ┌───────────────────────┐  │
 │    IR     │◀────────┤  │  Sabit   │──▶  │   MAR    │──▶│ Bellek (ROM+RAM+G/Ç)  │◀─┘
 │ 74HC574×2 │         │  │  birimi  │     │ 74HC574×2│   │ adres = MAR, veri ↔   │
 └─────┬─────┘         │  └──────────┘     └──────────┘   │ veriyolu (BYTE modu)  │
       │ op, f3, cond  │                                   └───────────────────────┘
       ▼               │
 ┌──────────────────────────────────────────────┐
 │ KONTROL BİRİMİ                               │
 │ adım sayacı (74HC161) + koşul birimi (151)   │
 │ giriş = INT·op·f3·COND·adım (13 bit)         │──▶ 32 kontrol sinyali
 │ ROM yok: 74HC138/151 + kapılar (kontrol.ts)  │
 └──────────────────────────────────────────────┘
```

## Kontrol kelimesi (32 bit)

| Bitler | Alan | Değerler |
|---|---|---|
| 2..0 | `BUS` veriyolu kaynağı | 0 yok · 1 REG · 2 ALU · 3 PC · 4 MEM · 5 IMM · 6 FLAGS |
| 5..3 | `RSEL` register seçimi | 0 RD · 1 RS1 · 2 RS2 · 3 SP (r6) · 4 LR (r7) |
| 10..6 | `ALU_OP` | 0–7: ADD ADC SUB SBC AND OR XOR CMP · 8–15: MOV NOT NEG SHL SHR SAR ROL ROR · 17 SXB · 18 MERGE |
| 11 | `ALU_IR` | 1 ise işlem = {IR.op[0], IR.f3}: ALU komutları decoder'sız seçilir |
| 15..12 | `IMM` sabit birimi | IMM6 · IMM6×2 · IMM8 (imm8 iki bayta da kopyalanır; MERGE h'ye göre birini alır) · IMM9 · OFF8×2 · OFF12×2 · sabit 2 · sabit 4 |
| 16 | `REG_W` | register dosyasına veriyolunu yaz |
| 17, 18 | `TA_L`, `TB_L` | ALU giriş latch'leri |
| 19, 20 | `PC_L`, `PC_INC` | PC'yi yükle (bit 0 hep 0) / PC += 2 |
| 21, 22 | `MAR_L`, `MEM_W` | adres latch'i / belleğe yaz |
| 23 | `IR_L` | komut register'ı |
| 24 | `FLAGS_L` | ALU'nun bayraklarını yaz (işlemin etkilediği kadarını) |
| 25 | `FLAGS_BUS_L` | bayrakları veriyolundan yükle (RETI) |
| 26, 27 | `I_SET`, `I_CLR` | kesme izni |
| 28 | `BYTE` | bellek bayt modu (LBU/SB) |
| 29, 30 | `HALT`, `ILLEGAL` | saati durdur |
| 31 | `END` | adım sayacını sıfırla: komut bitti |

**Tablo adresi** (13 bit, 8192 kelime): `[12] INT · [11:8] op · [7:5] f3 · [4] COND · [3:0] adım`. Kartta bu tablo bir ROM değil, kapılarla kurulu bir devredir (aşağıda "Kapı seviyesinde kontrol birimi").
- `INT`: adım 0'da `IRQ ∧ I` örneklenir; 1 ise getirme yerine kesme girişi çalışır.
- `COND`: koşul birimi. `cond[3:1]` bir 74HC151'i sürer, `cond[0]` sonucu tersler. Bu yüzden 14 = AL, 15 = NV (asla); `isa-ayrintilari.md` buna göre güncellendi.
- B/I/L/C/J formatlarında `f3` alanı başka bilgi taşır; derleyici o bölümleri 8 `f3` değerinin hepsine kopyalar.

## Mikrokod örneği

```
fetch:                      ; her komutun 0. ve 1. adımı
  PC -> MAR
  MEM -> IR ; PC+2

op 5:                       ; LW rd, [rs1 + imm6*2]
  REG(RS1) -> TA
  IMM(IMM6X2) -> TB
  ALU(ADD) -> MAR
  MEM -> REG(RD) ; END
```

Derleme: `npm run cpu16 -- ucode cpu16/micro/cpu16.ucode` tabloyu kurar ve denetler (yordamlar, döngü sayıları); `npm run cpu16 -- kontrol` CPU kartının kontrol birimini bu tablodan yeniden üretir. Tanımlanmayan her kombinasyon `ILLEGAL` adımına gider.

## Komut başına saat döngüsü

| Komut | Döngü | | Komut | Döngü |
|---|---|---|---|---|
| ADD … XOR, CMP | 5 | | Bcc (dallanırsa) | 5 |
| MOV NOT NEG SHL … ROR | 4 | | Bcc (dallanmazsa) | 3 |
| ADDI, CMPI, LI/LUI | 5 | | JAL / CALL | 5 |
| LW SW LBU SB | 6 | | JALR / RET | 6 |
| PUSH, POP | 6 | | NOP HALT EI DI | 3 |
| SXB | 4 | | RETI | 8 |
| SWI | 10 | | IRQ girişi | 8 |

Ortalama ≈ 5 döngü/komut: 4 MHz saatte ≈ 0,8 milyon komut/saniye (MIPS).

## Doğrulama (Faz 2 bitti ölçütü)

`tests/micro.test.ts`: saat döngüsü modeli **mikrokod tablosunun bitlerini** çalıştırır, emülatörün mantığını hiç kullanmaz. Her komut sonunda register'lar, PC, bayraklar ve HALT durumu emülatörle aynı olmalı; program sonunda 64 KB bellek ve UART çıktısı da.
- 5 örnek program (irq.s dahil: HALT'tan uyanma, işleyici, RETI)
- 300 × 200 komutluk **rastgele** komut akışı: rastgele bellek, rastgele register ve bayraklar (yasadışı komutlar dahil)

## Donanıma geçerken (Faz 3–4'e notlar)

- Veriyolu sürücüleri: her kaynak bir 74HC245/541 çifti; `BUS` alanı bir 74HC138 ile çözülür (aynı anda tek sürücü garanti).
- Register dosyası: `RSEL` + IR alanları 74HC153 ile 3 bitlik indekse, 74HC138 ile 8 çıkış/yazma sinyaline.
- `TA`/`TB` olmadan ALU'yu veriyoluna bağlamak mümkün değil (tek veriyolu); bu yüzden üç operandlı komutlar 5 döngü.
- Daha hızlı sürüm (ileride, ayrı bir video): ikinci veriyolu ile TA/TB adımlarını birleştirmek ALU komutlarını 3 döngüye indirir.

## Kapı seviyesinde kontrol birimi

CPU kartında ROM yok. 13 bitten 32 kontrol bitine giden mikrokod tablosu (8192 satır) ve ALU'nun 7 bitten
24 bite kod çözme tablosu (128 satır) 74HC kod çözücüleri, seçicileri ve kapılarıyla kurulu. Devre elle
çizilmez: `board/kontrol.ts` onu `micro/cpu16.ucode`'dan (tek kaynak) ve `board/alu-kod.ts`'deki ALU
tablosundan üretir, Board API ile karta gerçek çipler olarak yerleştirir. Şema, KiCad, BOM, 3D görünüm,
deney rehberleri ve zamanlama analizi devreyi kartın geri kalanı gibi görür.

Mikrokodu değiştirince: `npm run cpu16 -- kontrol` (tarayıcı için gömülü kopyayı `micro/cpu16-ucode.ts`
yeniler, devreyi tabloyla karşılaştırır), sonra `npm run cpu16 -- board kicad` ve `npm run cpu16 -- kit`.

### Tablonun yapısı

- 8192 satırın çoğu tekrardır: tabloda yalnızca 45 farklı kelime var. Getirme (adım 0, 1) her komutta aynı;
  bir komutun mikro programı çoğu zaman yalnızca op'a bağlı.
- 16 op × 16 (f3, COND) birleşimi 27 **atom**a ayrılır: aynı mikro programı çalıştıran (op, f3, COND)
  kümeleri. Op 0 (CMP ayrı), op 9 (koşul doğru / yanlış), op 13 (3 atom) ve op 14 (8 atom: NOP, HALT,
  EI, DI, RETI, SWI …) dallanır; diğer op'lar tek atomdur. Kesme girişi (INT = 1) 28. atomdur.
- Her an tam bir atom etkindir (tek sıcak). Bir kontrol biti bu yüzden "bu adımda biti 1 olan atomlardan
  biri etkin" demektir: atom hatlarının VEYA'sı.

### Katmanlar

| Katman | Çipler | Ne yapar |
|---|---|---|
| Kod çözücüler | 6 × 74HC138 | adım 0..7 → `~ADIM0..7` (STEP3 = 1 iken pasif); op 0..7 ve 8..15 → `~KOP0..15` (INT = 1 iken pasif); op 13 ve op 14'ün f3 alt çözücüleri → `~KOP13_F0..7`, `~KOP14_F0..7`; adım 8..15'e yalnızca SWI ulaştığı için son çözücü SWI'ın hattıyla açılır, çıkışları doğrudan "SWI ∧ adım" |
| Atom hatları | kapılar | çok atomlu op'larda her atomun aktif düşük hattı: op 9 `~KOP9 ∨ ¬COND` (OR), op 0 f3 = 7 kapılarla, op 13/14 alt çözücü çıkışları (gerekirse AND/NAND). Bütün adımlarda aynı kelimeyi üreten atomlar **sınıf hattı**nda birleşir (hatlarının AND'ı): yasadışı komutların dört atomu; dallanmayan Bcc ile NOP |
| VEYA ağı | kapılar | her (bit, adım) için atom kümesi: kümedeki hatların NAND'ı (= VEYA) ya da kümede olmayanların AND'ı ("hiçbiri", küme büyükse); hangisi az çip payı tutuyorsa. Kümelerde ortak hat çiftleri ("ortak alt küme") bir kez kurulur |
| Adım boyutu | 10 × 74HC151 | adım 0..7'nin en az dördünde 1 olabilen bitler (CW0..4, CW7, CW16, CW17, CW21, CW31): S = STEP0..2, veri = her adımın kümesi, ~E = STEP3. Seyrek bitler "adım ∧ küme" terimlerinin VEYA'sı (NAND/NOR) |
| ALU kod çözme | 3 × 74HC138 + kapılar | işlem kodu → `~AIS0..23` (24..31 yasadışı işlemler varsayılan davranışta: çözülmez); işlem bitleri (AOPi = 0 kümesi = AOPi hattı) ve tersleri; aynı VEYA ağı; ADC/SBC/ROL/ROR … için C bayrağı ve h biti (IR8) terimleri |

Çıkışlar eski adlarıyla: mikrokod `MK0..MK31` → kontrol register'ı → `CW0..CW31` (CW8, CW9, CW15 hiç 1
olmaz: GND), ALU `AD0..AD23` (AD14, AD15 sabit 0).

Kapılar kartın yapıştırıcı lojiğine paketlenir: 74HC00, 02, 04, 08, 10, 32 ve geniş kapılar için 74HC11
(3 girişli AND), 74HC20 (4 girişli NAND), 74HC21 (4 girişli AND), 74HC27 (3 girişli NOR), 74HC30 (8
girişli NAND). Üreteç kapı sayısını değil çip payını küçültür (74HC08'in bir kapısı 1/4, 74HC21'in 1/2
çip). Kontrol biriminin kapıları kartın diğer kapılarından sonra paketlenir, önce mevcut çiplerin boş
birimlerine; bir türün son çipi az doluysa kapılar girişleri sabite bağlanarak başka türlerin boş
birimlerine taşınır (NOT a = NAND(a, 1), AND(a, b) = AND3(a, b, 1) …): her taşıma bir çip kazandırır
(`Board.flexibleGlue`).

### Sayılar

| | Mikrokod | ALU kod çözme | Toplam |
|---|---|---|---|
| 74HC138 | 6 | 3 | 9 |
| 74HC151 | 10 | — | 10 |
| Kapı (paketlenmeden önce) | 109 | 32 | 141 |

CPU kartı: ROM'lu sürüm 146 entegre (7 × SST39SF010A, adım 0 için bir 74HC138 ve AOP4 için bir 74HC157
dahil); kapı seviyesinde **194**. Kontrol birimi 19 MSI çip ve ≈ 38 yapıştırıcı lojik çipi tutar (kapıları
kartın eski kapı çiplerinin boş birimlerini de doldurur). Kartın referans aralığı U1..U199
(`CARD_REF_BASE`): kalan pay 4 çip.

Referanslar: çözücüler boşalan yuvalarda (U1, U3: komut; U5, U7: op 13 ve op 14 alt çözücüleri; U10:
adım 0..7; U68: adım 8..15; U69–U71: ALU işlem çözücüleri); adım seçicileri (U147–U156) ve kapı çipleri
kartın sonunda. Kartın diğer bütün çiplerinin referansları ROM'lu sürümdekiyle aynı.

### Zamanlama

Kontrol register'ı kontrol biriminin çıkışlarını CLK'nin düşen kenarında alır: adım sayacı ve IR yükselen
kenarda değişir, yarım periyotta 138 → kapılar → 151 → CR. Kritik yol yine ALU tarafında: CR (düşen kenar)
→ `CW11` → AOP4 → ALU işlem çözücü → `AD3` (CIN) → 4 × 74HC283 → V → bayrak (yarım periyot). Flash'ın 70 ns
erişimi yerine üç-dört kapı gecikmesi:

| Köşe | ROM'lu | Kapı seviyesinde |
|---|---|---|
| en kötü (CPU kartı) | 860 ns · 1,16 MHz | 824 ns · 1,21 MHz |
| tipik (CPU kartı) | 470 ns · 2,13 MHz | 369 ns · 2,71 MHz |

Anakartta en kötü durumu önbellek kartının yolu belirler (956 ns). Ayrıntı: `uretim.md`.

### Denklik kanıtı

`tests/kontrol.test.ts`: kontrol birimi tek başına bir karta kurulur, gerçek çip modelleriyle (LogicSim;
74HC138, 74HC151 ve kapılar kapı seviyesinde) bütün girişler denenir. 8192 mikrokod adresinin her biri
`assembleMicrocode`'un tablosundaki kelimeyi, 128 ALU adresinin her biri ALU kod tablosundaki kelimeyi
verir. Aynı test gömülü mikrokodun `cpu16.ucode` ile aynı olduğunu da denetler. Kapı seviyesi CPU testleri
(`tests/board.test.ts`, anakart testleri) programları her saat döngüsünde mikrokod modeliyle
karşılaştırmaya devam eder.
