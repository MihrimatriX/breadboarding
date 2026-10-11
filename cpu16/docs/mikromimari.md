# CPU16 — Mikromimari ve Mikrokod (Faz 2)

> Komutların saat döngüsü düzeyinde nasıl çalıştığı. Kaynaklar: `micro/control.ts` (kontrol kelimesi), `micro/cpu16.ucode` (mikrokod), `micro/microasm.ts` (mikrokod derleyicisi), `micro/datapath.ts` (saat döngüsü modeli).

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
 │ adres = INT·op·f3·COND·adım (13 bit)         │──▶ 32 kontrol sinyali
 │ mikrokod ROM: 4 × SST39SF010 (8 bit çıkış)   │
 └──────────────────────────────────────────────┘
```

## Kontrol kelimesi (32 bit = 4 Flash çipi)

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

**ROM adresi** (13 bit, 8192 kelime): `[12] INT · [11:8] op · [7:5] f3 · [4] COND · [3:0] adım`.
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

Derleme: `npm run cpu16 -- ucode cpu16/micro/cpu16.ucode -o çıktı/` → `rom0.bin … rom3.bin` (her biri 8 KB, Flash programlayıcıya doğrudan yazılır). Tanımlanmayan her kombinasyon `ILLEGAL` adımına gider.

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

`tests/micro.test.ts`: saat döngüsü modeli **ROM bitlerini** çalıştırır, emülatörün mantığını hiç kullanmaz. Her komut sonunda register'lar, PC, bayraklar ve HALT durumu emülatörle aynı olmalı; program sonunda 64 KB bellek ve UART çıktısı da.
- 5 örnek program (irq.s dahil: HALT'tan uyanma, işleyici, RETI)
- 300 × 200 komutluk **rastgele** komut akışı: rastgele bellek, rastgele register ve bayraklar (yasadışı komutlar dahil)

## Donanıma geçerken (Faz 3–4'e notlar)

- Veriyolu sürücüleri: her kaynak bir 74HC245/541 çifti; `BUS` alanı bir 74HC138 ile çözülür (aynı anda tek sürücü garanti).
- Register dosyası: `RSEL` + IR alanları 74HC153 ile 3 bitlik indekse, 74HC138 ile 8 çıkış/yazma sinyaline.
- `TA`/`TB` olmadan ALU'yu veriyoluna bağlamak mümkün değil (tek veriyolu); bu yüzden üç operandlı komutlar 5 döngü.
- Daha hızlı sürüm (ileride, ayrı bir video): ikinci veriyolu ile TA/TB adımlarını birleştirmek ALU komutlarını 3 döngüye indirir.
