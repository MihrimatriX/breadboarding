# CPU16 boards (phase 4): schematic = code

In phase 4 the microarchitecture ([mikromimari.en.md](mikromimari.en.md)) was wired up with real 74HC
chips. Nobody draws the schematic by hand: TypeScript code under `cpu16/board/` places the chips and
connects their pins to nets. Four things are generated from the same definition:

| Output | From | Used for |
|---|---|---|
| Gate-level simulation | `board/computer.ts`, `board/machine-board.ts` → `LogicSim` | Tests, live signals in the 3D view |
| KiCad 7 schematics | `board/kicad-sch.ts` → `kicad/cpu/`, `kicad/mem/`, `kicad/clk/`, `kicad/prog/`, `kicad/bellek/`, `kicad/onbellek/`, `kicad/gc/`, `kicad/video/`, `kicad/kyb/` | Open in KiCad, export to a PCB |
| Bill of materials | `board/kicad-sch.ts` → `kicad/bom.csv` (CPU, test memory, clock), `kicad/<kart>/bom.csv` (the motherboard's boards) | Ordering |
| Electrical rule check | `board/board.ts` → `erc()` | Conflicting outputs, undriven inputs |

When the schematic changes, all of them change together. The tests require the KiCad files to be identical
to versions regenerated from the code (a schematic fixed by hand but never carried into the code turns CI
red).

## Commands

```bash
npm run cpu16 -- board          # board summary (chip counts) + ERC: test computer and motherboard
npm run cpu16 -- board kicad    # regenerate the schematics, symbols and BOM under cpu16/kicad/
npm run cpu16 -- kicad-sym      # symbol library only
```

To open in KiCad, use `cpu16/kicad/cpu/cpu.kicad_pro` (or `mem/mem.kicad_pro`). The project finds the
`cpu16.kicad_sym` library through its `sym-lib-table` file. Connections use **net labels** at the pin ends
in place of wires: two labels with the same name are the same net. The drawing layout is an automatic
grid; you are free to rearrange it visually, but connection changes must go into the code.

## Boards and chip counts

**CPU board: 210 chips** (the first ROM version had 146, with 7 × SST39SF010A)

| Part | Qty | Where |
|---|---:|---|
| 74HC151 (8:1 mux) | 46 | register index (3), immediate unit (16), logic unit (16), condition unit (1), the control unit's step multiplexers (10) |
| 74HC574 (8-bit register) | 28 | r0..r7 (16), TA/TB/MAR/IR (8), control register (4) |
| 74HC138 (3→8 decoder) | 12 | bus source, register read, register write; control unit: step (2), instruction (2), op 13/14 sub-decoders (2); ALU operation decoder (3) |
| 74HC541 (buffer) | 25 | r0..r7 → bus (16), PC, immediate, ALU, flags → bus; high byte = 0 on byte reads |
| 74HC153 (4:1 mux) | 9 | ALU result mux (8), C/V mux (1) |
| 74HC08 / 32 / 00 / 02 / 86 / 04 / 10 | 17 / 9 / 8 / 5 / 9 / 4 / 7 | glue logic and control unit gates (units are packed into chips once the board is complete) |
| 74HC11 / 20 / 21 | 1 / 4 / 4 | the control unit's 3- and 4-input gates |
| 74HC161 (counter) | 5 | PC (4), micro-step counter (1) |
| 74HC74 (dual D FF) | 5 | N Z, C V, I, INT latch + HALT, FAULT + run enable |
| 74HC283 (4-bit adder) | 4 | 16-bit adder |
| 74HC245 (bidirectional) | 3 | bus ↔ even/odd byte lanes |
| 74HC157 (2:1 mux) | 3 | ALU operation select (bits 0..3), flag input, C/V hold |
| 74HC688 (comparator) | 2 | zero (Z) detection |

The board has no ROM: the control unit (microcode and ALU decode) is 19 MSI chips and ≈ 38 gate chips
([mikromimari.en.md](mikromimari.en.md), "Gate-level control unit"). The board's reference range is
U1..U199 (`CARD_REF_BASE`). The last 11 of the register buffers added later, and their capacitors, are in
the overflow range: U901–U911, C901–C912 (`CARD_REF_TASMA`); the other chips kept their numbers.

Also on the board: bus pull-up resistors (2 × 10 kΩ SIP-9), 100 nF per chip, 100 µF at the board input,
HALTED and FAULT LEDs, and a 2 × 32 backplane connector.

**Debug LEDs and bar graphs** (as on James Sharman's and Ben Eater's breadboard computers; no chips except
for the register contents):

| Indicator | Qty | Signal | Color |
|---|---:|---|---|
| Register read / write (D3–D18) | 16 | `~ROE0`–`~ROE7`, `~WSEL0`–`~WSEL7` (active low) | read green, write orange |
| Bus driver (D19–D24) | 6 | `~SRC_REG`, `~SRC_ALU`, `~SRC_PC`, `~SRC_MEM`, `~SRC_IMM`, `~SRC_FLAGS` (active low) | white |
| Memory read / write (D25, D26) | 2 | `MEMRD`, `MEMW` | green, orange |
| Loads (D27–D32) | 6 | TA (`CW17`), TB (`CW18`), MAR (`CW21`), IR (`CW23`), PC load (`~PC_LOAD`), PC increment | orange |
| Flags (D33–D37) | 5 | `NFLAG`, `ZFLAG`, `CFLAG`, `VFLAG`, `IFLAG` | blue |
| Micro-step (D38–D41) | 4 | `STEP0`–`STEP3` | yellow |
| Bar graphs (DS1–DS10) | 10 | `BUS0`–`15`, `PC1`–`15`, `A0`–`15` (MAR), `IR0`–`15`, `RES0`–`15` (ALU result) | yellow |
| Register contents (DS11–DS26) | 16 | `R0Q0`–`15` … `R7Q0`–`15` (the 574 outputs of each register) | yellow |

Each LED has a 1 kΩ resistor next to it (R3–R41), and each bar graph has an 8 × 1 kΩ isolated resistor
network in front of it (DIP-16, RN3–RN28): ≈ 3 mA per LED and per segment. For active-low signals the LED
goes from VCC to the signal (VCC → 1 kΩ → LED → signal), so it lights when the output is 0. On a bar graph,
segment 1 is bit 0. Details and color rules: [kit/led-ve-direnc.en.md](../kit/led-ve-direnc.en.md).

To show the register contents, the register 574s no longer drive the bus directly. Their outputs are always
enabled (`~OE` = GND) and sit on the `R{r}Q0..15` lines, where the bar graphs connect. Two 74HC541s per
register drive the bus (U195–U199, U901–U911; `~OE1` = `~ROEr`). The cost is 16 chips and one buffer delay
on the read path; the timing analysis results did not change (the longest paths do not go through register
reads). You can remove this part if you want: take out the 541s, DS11–DS26 and RN13–RN28, connect the 574s'
`~OE` back to `~ROEr` and their outputs to the bus.

**Test memory board: 7 chips.** 64 KB of flat RAM (2 × 62256: even and odd bytes) and a UART output latch
at 0xFF00 (74HC574 + 2 × 74HC688 address comparators). It behaves exactly like `SimpleBus` in the
emulator; the real motherboard (banked 1 MB memory, ROM, I/O, video) replaces it in phase 6.

**Motherboard boards (phase 6):** memory board 34 chips (bank registers, 32 KB EEPROM (28C256) + 128 KB
RAM (4 × 62256), byte sequencer), cache board 46 chips (2 KB, wait generator, counters), I/O board 65 chips
(UART, PS/2, timer, interrupt controller), video board 73 chips (VGA 80 × 30 text), DIY memory board 22
chips (FF40–FF4F, 16 bytes, one 74HC574 per byte; Experiment 14); the clock board with wait states has 10
chips. The motherboard is built only from common 7400-series logic and two memory chips (62256, 28C256)
([spec.en.md](spec.en.md), "Parts"). `buildFullMachineBoard()` combines them with the CPU board (the whole
motherboard: 460 chips) and `GateMachine` runs it at gate level. The test computer (`buildComputerBoard`,
`GateComputer`) stays as it is and is the first scene in the experiment kit where the CPU gets built (the
test board's FF00 latch becomes the LED output in Experiment 8). Details:
[anakart-kartlari.en.md](anakart-kartlari.en.md), [anakart-gc-video.en.md](anakart-gc-video.en.md).

## Block → chip mapping (CPU board)

- Control unit (microcode): inputs `[12]INT [11:8]op [7:5]f3 [4]COND [3:0]step` → decoders (6 × 74HC138),
  instruction classes and the OR network (gates), step multiplexers (10 × 74HC151) → `MK0..31` → 4 ×
  74HC574 control register (CR). `board/kontrol.ts` generates the circuit from the microcode
  (`npm run cpu16 -- kontrol`); details in [mikromimari.en.md](mikromimari.en.md).
- Register file: each register is two 74HC574s (low/high byte) whose outputs are always enabled and shown
  on the bar graphs; it reaches the bus through two 74HC541 buffers (three-state). Index: 3 × 74HC151
  (RD/RS1/RS2/SP/LR select), plus two 74HC138s for read and write.
- ALU: 4 × 74HC283 adders; the inputs are conditioned with XOR/AND (B inverted for SUB, A inverted for NEG,
  PASSB). The logic unit is a 74HC151 *truth table* per bit: the select inputs are the (a, b) bits, and the
  data inputs are the 4-bit operation table from the ALU decoder (AND/OR/XOR/…). In the high byte the third
  select input is a7, so SXB (sign-extend byte) needs no extra chip. The result is selected by 8 × 74HC153:
  sum / logic / shift left / shift right.
- ALU decoder: 3 × 74HC138 and gates, inputs = {ALU operation (5), IR8, C flag}. It produces adder control,
  the logic tables, result select, the bit shifted in, and the "update C/V?" bit (`AD0..23`). The table is
  in `board/alu-kod.ts` and the circuit is generated from it (`board/kontrol.ts`): a new ALU operation is
  one row in the table, and `npm run cpu16 -- kontrol` regenerates the circuit.
- PC: 4 × 74HC161 (PC[15:1]; PC[0] is always 0), counting by 2 or loading from the bus.
- Immediate unit: one 74HC151 per bit picks one of 8 formats (IMM6, IMM6×2, IMM8, IMM9, OFF8×2, OFF12×2,
  2, 4).
- Condition unit: a 74HC151 selects a flag by cond[3:1], and an XOR inverts it with cond[0].
- Memory interface: 3 × 74HC245 between the 16-bit internal bus and the backplane's even byte (DE0..7) and
  odd byte (DO0..7) lanes. On byte loads a 74HC541 forces the high byte to 0.

## Timing

```
CLK      ‾‾‾‾\______________/‾‾‾‾‾‾‾‾‾‾‾\______
WR_WIN   ________/‾‾‾‾‾\_______________________
             ↑       ↑     ↑     ↑
             │       │     │     └ rising edge: registers, PC, flags and step load
             │       │     └ write strobe ends (data still valid)
             │       └ ~MWE_E / ~MWE_O fall (only in this window)
             └ falling edge: CR samples the microcode, run enable (RUN_R) updates
```

- The control signals come out of CR on the falling edge and stay stable until the rising edge. The state
  registers' clocks can therefore be *gated clocks* (`CLKR ∧ load`): the gate inputs never change while
  the clock is high, so no glitches occur.
- The memory write strobe is confined to the **WR_WIN** window that the clock board generates: it starts
  after the falling edge and ends before the rising edge. Address and data have settled by then, and a
  register that changes on the same rising edge (e.g. I being cleared while the flags are pushed during an
  interrupt) cannot corrupt the data being written. The clock board (phase 9) generates this window from an
  oscillator running at twice the frequency.
- On HALT and on a fault, RUN_R falls: the gated clock stops, and the micro-step and PC freeze. When
  IRQ ∧ I arrives, the CPU wakes up.

## Backplane (the same on every board, 2 × 32)

| Pin | Signal | Pin | Signal |
|---|---|---|---|
| 1, 2, 62, 64 | GND | 3, 4, 63 | VCC |
| 5 | CLK | 6 | WR_WIN |
| 7 | ~RESET | 8 | IRQ |
| 9..24 | A0..A15 | 25..32 | DE0..DE7 (even byte) |
| 33..40 | DO0..DO7 (odd byte) | 41 | ~MRD |
| 42 | ~MWE_E | 43 | ~MWE_O |
| 44 | HALTED | 45 | FAULT |
| 46 | ~WAIT (wait request, pulled to 1 by 10 kΩ on the clock board) | 47 | ~IO (A15..A8 = 0xFF) |
| 48 | TCLK (OSC/8, not stretched) | 49 | OSC (buffered oscillator) |
| 50..55 | PA14..PA19 (upper bits of the physical address) | 56 | VSYNC_REQ |
| 57..61 | unused | | |

Which boards drive and use the phase 6 pins: [anakart-kartlari.en.md](anakart-kartlari.en.md).

## Verification chain

Each layer is tested against the one before it (`cpu16/tests/board.test.ts`):

1. Emulator (reference) ↔ clock-cycle model (`micro/datapath.ts`): phase 2.
2. Clock-cycle model ↔ gate-level board: on every clock cycle PC, the 8 registers, the flags, IR, TA, TB,
   MAR and the micro-step are compared. The hello, fib, add32, bubble and irq programs plus 150 random
   instruction streams (more than 10,000 instructions, illegal instructions included).
3. Gate-level board ↔ emulator: registers, memory and UART output at the end of the program.
4. KiCad schematic ↔ board: the real `kicad-cli` (7.x) extracts a netlist from the schematic; each net's
   pin set must match the board's nets. If `kicad-cli` is not installed, this test is skipped.
5. Motherboard boards ↔ `Machine`: bus traces on the memory and cache boards, and the full system (CPU
   included) instruction by instruction (`tests/anakart-bellek.test.ts`, `tests/anakart-sistem.test.ts`;
   see [anakart-kartlari.en.md](anakart-kartlari.en.md)).

Outside the browser the gate-level board runs about 30,000 clock cycles per second (~1,800 gates per
cycle, 4-phase evaluation).

## Microarchitecture changes in phase 4

- **IMM8 is copied into both bytes** (`imm * 0x101` in place of `imm & 0xFF`). In hardware it is enough to
  wire the same 8 IR bits to both bytes, which saves 16 separate multiplexers. `MERGE` (the LUI/ORI
  family) picks which byte to take by the `h` bit, so the instruction set behavior did not change; the
  clock-cycle model was updated the same way.
- The write strobes moved into the WR_WIN window (above).

## Limits and next steps

- The schematic drawing is an automatic grid; for readability you can rearrange it into blocks in KiCad.
- PCB layout and production files (Gerber, assembly guide, clock board, ROM programmer) are in phase 9.
- In the 3D view, the board → chip → gate → transistor descent of phase 5 uses this board definition.
