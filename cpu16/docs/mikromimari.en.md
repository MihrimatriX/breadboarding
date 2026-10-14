# CPU16 microarchitecture and microcode (phase 2)

> How instructions run at the clock-cycle level. Sources: `micro/control.ts` (control word), `micro/cpu16.ucode` (microcode), `micro/microasm.ts` (microcode assembler), `micro/datapath.ts` (clock-cycle model), `board/kontrol.ts` (gate-level control unit generated from the microcode).

## Block diagram

There is a single 16-bit **internal bus**. In every clock cycle exactly one source drives the bus, and any number of destinations load it on the clock edge (a 16-bit version of the Ben Eater architecture, with a register file).

```
                       ┌──────────── 16-bit INTERNAL BUS ────────────────────────────┐
                       │                                                             │
 ┌───────────┐    rd/wr│  ┌────┐  ┌────┐                 ┌──────────┐   ┌────────┐   │
 │ Register  │◀───────▶│  │ TA │  │ TB │──┐              │ PC       │◀─▶│ +2     │   │
 │ file      │         │  └─┬──┘  └─┬──┘  │              │ 74HC161×4│   └────────┘   │
 │ 8 × 16    │         │    ▼       ▼     │              └──────────┘                │
 │ 74HC574×16│         │  ┌──────────────┐│  NZCV        ┌──────────┐   ┌────────┐   │
 └─────▲─────┘         │  │     ALU      │├─────────────▶│ FLAGS    │◀─▶│  I     │   │
       │ RSEL          │  │ 283×4 + logic│               └──────────┘   └────────┘   │
       │ (RD/RS1/RS2/  │  │ + shifter    │──▶ bus                                    │
       │  SP/LR)       │  └──────────────┘                                           │
 ┌─────┴─────┐         │  ┌──────────┐     ┌──────────┐   ┌───────────────────────┐  │
 │    IR     │◀────────┤  │ Immediate│──▶  │   MAR    │──▶│ Memory (ROM+RAM+I/O)  │◀─┘
 │ 74HC574×2 │         │  │   unit   │     │ 74HC574×2│   │ address = MAR, data ↔ │
 └─────┬─────┘         │  └──────────┘     └──────────┘   │ bus (BYTE mode)       │
       │ op, f3, cond  │                                  └───────────────────────┘
       ▼               │
 ┌──────────────────────────────────────────────┐
 │ CONTROL UNIT                                 │
 │ step counter (74HC161) + condition unit (151)│
 │ input = INT·op·f3·COND·step (13 bits)        │──▶ 32 control signals
 │ no ROM: 74HC138/151 + gates (kontrol.ts)     │
 └──────────────────────────────────────────────┘
```

## Control word (32 bits)

| Bits | Field | Values |
|---|---|---|
| 2..0 | `BUS` bus source | 0 none · 1 REG · 2 ALU · 3 PC · 4 MEM · 5 IMM · 6 FLAGS |
| 5..3 | `RSEL` register select | 0 RD · 1 RS1 · 2 RS2 · 3 SP (r6) · 4 LR (r7) |
| 10..6 | `ALU_OP` | 0–7: ADD ADC SUB SBC AND OR XOR CMP · 8–15: MOV NOT NEG SHL SHR SAR ROL ROR · 17 SXB · 18 MERGE |
| 11 | `ALU_IR` | if 1, operation = {IR.op[0], IR.f3}: ALU instructions are selected without a decoder |
| 15..12 | `IMM` immediate unit | IMM6 · IMM6×2 · IMM8 (imm8 is copied into both bytes; MERGE takes one of them according to h) · IMM9 · OFF8×2 · OFF12×2 · constant 2 · constant 4 |
| 16 | `REG_W` | write the bus into the register file |
| 17, 18 | `TA_L`, `TB_L` | ALU input latches |
| 19, 20 | `PC_L`, `PC_INC` | load PC (bit 0 always 0) / PC += 2 |
| 21, 22 | `MAR_L`, `MEM_W` | address latch / write to memory |
| 23 | `IR_L` | instruction register |
| 24 | `FLAGS_L` | write the ALU flags (only those the operation affects) |
| 25 | `FLAGS_BUS_L` | load the flags from the bus (RETI) |
| 26, 27 | `I_SET`, `I_CLR` | interrupt enable |
| 28 | `BYTE` | memory byte mode (LBU/SB) |
| 29, 30 | `HALT`, `ILLEGAL` | stop the clock |
| 31 | `END` | reset the step counter: instruction done |

**Table address** (13 bits, 8192 words): `[12] INT · [11:8] op · [7:5] f3 · [4] COND · [3:0] step`. On the board this table is a circuit built from gates, with no ROM (see "Gate-level control unit" below).
- `INT`: `IRQ ∧ I` is sampled at step 0; if it is 1, interrupt entry runs instead of fetch.
- `COND`: the condition unit. `cond[3:1]` drives a 74HC151 and `cond[0]` inverts the result. That makes 14 = AL and 15 = NV (never); `isa-ayrintilari.md` was updated to match.
- In the B/I/L/C/J formats the `f3` field carries other information; the microcode assembler copies those sections into all 8 `f3` values.

## Microcode example

```
fetch:                      ; steps 0 and 1 of every instruction
  PC -> MAR
  MEM -> IR ; PC+2

op 5:                       ; LW rd, [rs1 + imm6*2]
  REG(RS1) -> TA
  IMM(IMM6X2) -> TB
  ALU(ADD) -> MAR
  MEM -> REG(RD) ; END
```

Assembling: `npm run cpu16 -- ucode cpu16/micro/cpu16.ucode` builds and checks the table (routines, cycle counts); `npm run cpu16 -- kontrol` regenerates the CPU board's control unit from this table. Every undefined combination goes to the `ILLEGAL` step.

## Clock cycles per instruction

| Instruction | Cycles | | Instruction | Cycles |
|---|---|---|---|---|
| ADD … XOR, CMP | 5 | | Bcc (taken) | 5 |
| MOV NOT NEG SHL … ROR | 4 | | Bcc (not taken) | 3 |
| ADDI, CMPI, LI/LUI | 5 | | JAL / CALL | 5 |
| LW SW LBU SB | 6 | | JALR / RET | 6 |
| PUSH, POP | 6 | | NOP HALT EI DI | 3 |
| SXB | 4 | | RETI | 8 |
| SWI | 10 | | IRQ entry | 8 |

Average ≈ 5 cycles per instruction: at a 4 MHz clock that is ≈ 0.8 million instructions per second (MIPS).

## Verification (phase 2 done criterion)

`tests/micro.test.ts`: the clock-cycle model runs **the bits of the microcode table** and never uses the emulator's logic. After every instruction the registers, PC, flags and HALT state must match the emulator; at the end of the program the 64 KB of memory and the UART output must match too.
- 5 sample programs (including irq.s: waking from HALT, handler, RETI)
- 300 × 200-instruction **random** instruction streams: random memory, random registers and flags (illegal instructions included)

## Moving to hardware (notes for phases 3–4)

- Bus drivers: each source is a 74HC245/541 pair; a 74HC138 decodes the `BUS` field (which guarantees a single driver at a time).
- Register file: a 74HC153 turns `RSEL` + IR fields into a 3-bit index, and a 74HC138 turns that into 8 output/write signals.
- With a single bus, the ALU cannot be connected to the bus without `TA`/`TB`; that is why three-operand instructions take 5 cycles.
- A faster version (later, in a separate video): a second bus would merge the TA/TB steps and bring ALU instructions down to 3 cycles.

## Gate-level control unit

The CPU board has no ROM. The microcode table that maps 13 bits to 32 control bits (8192 rows) and the ALU
decode table that maps 7 bits to 24 bits (128 rows) are built from 74HC decoders, multiplexers and gates.
Nobody draws the circuit by hand: `board/kontrol.ts` generates it from `micro/cpu16.ucode` (the single
source) and the ALU table in `board/alu-kod.ts`, and places it on the board as real chips through the Board
API. The schematic, KiCad, BOM, 3D view, experiment guides and timing analysis treat the circuit like the
rest of the board.

After changing the microcode: `npm run cpu16 -- kontrol` (refreshes the embedded copy for the browser,
`micro/cpu16-ucode.ts`, and compares the circuit with the table), then `npm run cpu16 -- board kicad` and
`npm run cpu16 -- kit`.

### Table structure

- Most of the 8192 rows repeat: the table holds only 45 distinct words. Fetch (steps 0, 1) is the same for
  every instruction, and an instruction's micro-program usually depends only on op.
- The 16 op × 16 (f3, COND) combinations split into 27 **atoms**: sets of (op, f3, COND) that run the same
  micro-program. Op 0 (CMP separate), op 9 (condition true / false), op 13 (3 atoms) and op 14 (8 atoms:
  NOP, HALT, EI, DI, RETI, SWI …) branch; every other op is a single atom. Interrupt entry (INT = 1) is the
  28th atom.
- Exactly one atom is active at any time (one-hot). A control bit therefore means "one of the atoms whose
  bit is 1 in this step is active": the OR of the atom lines.

### Layers

| Layer | Chips | What it does |
|---|---|---|
| Decoders | 6 × 74HC138 | step 0..7 → `~ADIM0..7` (inactive while STEP3 = 1); op 0..7 and 8..15 → `~KOP0..15` (inactive while INT = 1); f3 sub-decoders for op 13 and op 14 → `~KOP13_F0..7`, `~KOP14_F0..7`; only SWI reaches steps 8..15, so the last decoder is enabled by SWI's line and its outputs are "SWI ∧ step" directly |
| Atom lines | gates | the active-low line of each atom in multi-atom ops: op 9 `~KOP9 ∨ ¬COND` (OR), op 0 f3 = 7 with gates, op 13/14 sub-decoder outputs (AND/NAND where needed). Atoms that produce the same word in every step merge into a **class line** (the AND of their lines): the four atoms of the illegal instructions; not-taken Bcc with NOP |
| OR network | gates | for each (bit, step), a set of atoms: either the NAND (= OR) of the lines in the set, or the AND of the lines outside it ("none of them", when the set is large), whichever takes less chip share. Line pairs shared by several sets ("common subset") are built once |
| Step axis | 10 × 74HC151 | bits that can be 1 in at least four of steps 0..7 (CW0..4, CW7, CW16, CW17, CW21, CW31): S = STEP0..2, data = the set for each step, ~E = STEP3. Sparse bits are the OR (NAND/NOR) of "step ∧ set" terms |
| ALU decode | 3 × 74HC138 + gates | operation code → `~AIS0..23` (24..31 are illegal operations with default behavior and are not decoded); the operation bits (the AOPi = 0 set = the AOPi line) and their inverses; the same OR network; C flag and h bit (IR8) terms for ADC/SBC/ROL/ROR … |

The outputs keep their old names: microcode `MK0..MK31` → control register → `CW0..CW31` (CW8, CW9 and CW15
are never 1: tied to GND), ALU `AD0..AD23` (AD14, AD15 constant 0).

The gates are packed into the board's glue logic: 74HC00, 02, 04, 08, 10, 32, and for wide gates 74HC11
(3-input AND), 74HC20 (4-input NAND), 74HC21 (4-input AND), 74HC27 (3-input NOR), 74HC30 (8-input NAND).
The generator minimizes chip share rather than gate count (one gate of a 74HC08 is 1/4 of a chip, one gate
of a 74HC21 is 1/2). The control unit's gates are packed after the board's other gates, first into free
units of existing chips. If the last chip of a type is lightly used, its gates move to free units of other
types by tying inputs to constants (NOT a = NAND(a, 1), AND(a, b) = AND3(a, b, 1) …): each move saves a chip
(`Board.flexibleGlue`).

### Counts

| | Microcode | ALU decode | Total |
|---|---|---|---|
| 74HC138 | 6 | 3 | 9 |
| 74HC151 | 10 | - | 10 |
| Gates (before packing) | 109 | 32 | 141 |

CPU board: 146 chips in the ROM version (including 7 × SST39SF010A, a 74HC138 for step 0 and a 74HC157
for AOP4); **194** at gate level, and **210** with the 16 buffers (74HC541) for the register contents
displays. The control unit takes 19 MSI chips and ≈ 38 glue logic chips (its gates also fill free units in
the board's older gate chips). The board's reference range U1..U199 (`CARD_REF_BASE`) is full; chips past
it are numbered from the overflow range (U901…, `CARD_REF_TASMA`).

References: the decoders sit in freed slots (U1, U3: instruction; U5, U7: op 13 and op 14 sub-decoders;
U10: steps 0..7; U68: steps 8..15; U69–U71: ALU operation decoders); the step multiplexers (U147–U156) and
the gate chips are at the end of the board. Every other chip on the board keeps its reference from the ROM
version.

### Timing

The control register takes the control unit's outputs on the falling edge of CLK. The step counter and IR
change on the rising edge, which leaves half a period for 138 → gates → 151 → CR. The critical path is
still on the ALU side: CR (falling edge) → `CW11` → AOP4 → ALU operation decoder → `AD3` (CIN) → 4 ×
74HC283 → V → flag (half a period). Three or four gate delays replace the Flash's 70 ns access:

| Corner | ROM version | Gate level |
|---|---|---|
| worst (CPU board) | 860 ns · 1.16 MHz | 824 ns · 1.21 MHz |
| typical (CPU board) | 470 ns · 2.13 MHz | 369 ns · 2.71 MHz |

On the motherboard the worst case is set by the cache board's path (956 ns). Details: `uretim.md`.

### Proof of equivalence

`tests/kontrol.test.ts`: the control unit is built alone on a board, and every input is tried with the real
chip models (LogicSim; 74HC138, 74HC151 and gates at gate level). Each of the 8192 microcode addresses gives
the word in `assembleMicrocode`'s table, and each of the 128 ALU addresses gives the word in the ALU code
table. The same test also checks that the embedded microcode matches `cpu16.ucode`. The gate-level CPU
tests (`tests/board.test.ts`, the motherboard tests) keep comparing programs with the microcode model on
every clock cycle.
