# CPU16 parts library (phase 3)

> The pinout, gate-level internals, CMOS transistor expansion and KiCad symbol of every chip in the computer come from **a single source**: `cpu16/chips/`.

## What is there

| File | Contents |
|---|---|
| `chips/logic.ts` | Gate-level simulator: 0/1/Z/X logic, multi-driver nets (bus), wave-based timing, DFF / latch / three-state buffer / behavioral block. When the netlist is built it is converted to flat typed arrays (CSR); a wave is computed without allocating any objects |
| `chips/parts/*.ts` | Definitions of 38 chips: pins (with the datasheet numbers), gate circuit, datasheet function table (reference model) |
| `chips/cmos.ts` | Gate → CMOS transistor expansion; the output is in the format read by Silikon3D's switch-level engine |
| `chips/bench.ts`, `chips/transistor-bench.ts` | Benches that run a single chip at gate or transistor level |
| `chips/kicad.ts` → `kicad/cpu16.kicad_sym` | KiCad 7+ symbol library (pin numbers, footprint, description) |

```sh
npm run cpu16 -- chips        # table: gate and transistor counts
npm run cpu16 -- kicad-sym    # regenerate cpu16/kicad/cpu16.kicad_sym
npx vitest run cpu16/tests/chips.test.ts
```

## How it is verified (phase 3 "done" criterion)

1. Gate model = datasheet. Each chip's function table was written in code independently of the gate circuit (`ref`). Combinational chips with up to 12 inputs are compared over **every combination** in Gray code order; other chips and sequential chips get 2 × 3000 random steps (one pin changes per step).
2. Transistor model = gate model. The same steps run on the CMOS netlist expanded from the gates, in Silikon3D's `SwitchLevelEngine` (the engine that runs the 6502); every output must match at every step.
3. Pinout: in every package the pins are 1..N, GND at N/2 and VCC at N (74HC and JEDEC memory layout); the pin numbers in the KiCad symbol match the library exactly.
4. Datasheet rows: table rows were also written separately for the 74HC138, 283, 161 (load/count/TC), 74 (preset and clear both active), 595 (shift/latch/Z) and 273.
5. The memories are behavioral (no gates inside): 62256 read/write/Z; 28C256 page write, DATA polling during a write (D7 inverted) and toggle bit (D6), software data protection (SDP) on/off; SST39SF010A programming with command sequences, ID read, sector and chip erase. The 28C256's behavior is the emulator's own model (`emu/devices/eeprom.ts`).

Which parts (AFU's decision): the motherboard is built only from common 7400-series logic and two memory chips (62256, 28C256). That is why the 74HC148, 74HC193, 74HC590 and AS6C4008 were removed from the library: the interrupt priority encoder was built from gates, the video address counter and the timer from 74HC161s, the cache counters from 74HC161 + 74HC541, and 4 × 62256 replaced the 512 KB RAM. The 74HC166 is common and stays on the video board (the asynchronous load of the 74HC165 does not fit the pixel clock, [anakart-gc-video.en.md](anakart-gc-video.en.md)). The SST39SF010A is no longer on any board (the CPU board's microcode and ALU ROMs were turned into 74HC gates); it stays in the library for comparison.

At power-up a flip-flop's value is taken as **unknown (X)**, as the datasheet says. The tests do not compare in that state; they compare after the first clock/reset.

## Chips

| Part | Package | Gates | Transistors | Description |
|---|---|---|---|---|
| 74HC00 | DIP-14 | 4 | 16 | 4 × 2-input NAND |
| 74HC02 | DIP-14 | 4 | 16 | 4 × 2-input NOR |
| 74HC04 | DIP-14 | 6 | 12 | 6 × NOT (inverter) |
| 74HC05 | DIP-14 | 6 | 48 | 6 × NOT, open-drain output |
| 74HC08 | DIP-14 | 4 | 24 | 4 × 2-input AND |
| 74HC10 | DIP-14 | 3 | 18 | 3 × 3-input NAND |
| 74HC11 | DIP-14 | 3 | 24 | 3 × 3-input AND |
| 74HC20 | DIP-14 | 2 | 16 | 2 × 4-input NAND |
| 74HC21 | DIP-14 | 2 | 20 | 2 × 4-input AND |
| 74HC27 | DIP-14 | 3 | 18 | 3 × 3-input NOR |
| 74HC30 | DIP-14 | 1 | 16 | 8-input NAND |
| 74HC14 | DIP-14 | 6 | 12 | 6 × Schmitt-trigger NOT |
| 74HC32 | DIP-14 | 4 | 24 | 4 × 2-input OR |
| 74HC86 | DIP-14 | 4 | 48 | 4 × 2-input XOR |
| 74HC125 | DIP-14 | 8 | 40 | 4 × three-state buffer (active-low OE) |
| 74HC138 | DIP-16 | 14 | 82 | 3-to-8 decoder (active-low outputs) |
| 74HC139 | DIP-16 | 14 | 60 | 2 × (2-to-4 decoder) |
| 74HC151 | DIP-16 | 14 | 124 | 8-to-1 multiplexer |
| 74HC153 | DIP-16 | 14 | 108 | 2 × (4-to-1 multiplexer) |
| 74HC157 | DIP-16 | 14 | 92 | 4 × (2-to-1 multiplexer) |
| 74HC283 | DIP-16 | 30 | 260 | 4-bit binary full adder (carry lookahead) |
| 74HC688 | DIP-20 | 10 | 116 | 8-bit equality comparator |
| 74HC74 | DIP-14 | 2 | 72 | 2 × D flip-flop (asynchronous preset and clear) |
| 74HC161 | DIP-16 | 26 | 309 | 4-bit synchronous binary counter (asynchronous reset) |
| 74HC393 | DIP-14 | 12 | 297 | 2 × 4-bit ripple binary counter (falling edge, asynchronous clear) |
| 74HC165 | DIP-16 | 34 | 376 | 8-bit parallel-in / serial-out shift register |
| 74HC166 | DIP-16 | 34 | 441 | 8-bit parallel-in / serial-out shift register (synchronous load) |
| 74HC175 | DIP-16 | 4 | 145 | 4 × D flip-flop (common clock, asynchronous reset) |
| 74HC573 | DIP-20 | 17 | 210 | 8-bit transparent latch (three-state outputs) |
| 74HC574 | DIP-20 | 17 | 355 | 8-bit D flip-flop register (three-state outputs) |
| 74HC273 | DIP-20 | 8 | 289 | 8-bit D flip-flop register (common asynchronous reset); used for the bank registers |
| 74HC595 | DIP-16 | 25 | 643 | 8-bit serial-in / parallel-out shift register (latched outputs) |
| 74HC245 | DIP-20 | 20 | 144 | 8-bit bidirectional bus transceiver |
| 74HC541 | DIP-20 | 9 | 68 | 8-bit three-state buffer (two active-low OEs) |
| 74HC4511 | DIP-16 | 37 | 368 | BCD to 7-segment decoder / driver (latched, common cathode); used in the 8-bit calculator (`hesap8/`) |
| 62256 | DIP-28 | - | - | 32 KB static RAM (32K × 8) |
| 28C256 | DIP-28 | - | - | 32 KB parallel EEPROM (32K × 8, 5 V, byte/page write; same pinout as the 62256) |
| SST39SF010A | DIP-32 | - | - | 128 KB Flash (128K × 8, 5 V, programmed with commands) |

In the "Gates" count a flip-flop or a latch counts as one element; the transistor count includes their expansion. Real 74HC chips also have input protection diodes and buffered output stages. They are not modeled because they do not change the logic, so the real transistor count is somewhat higher.

Where each chip is used in CPU16 is written in the `usage` field and in the `CPU16_Kullanim` property of the KiCad symbol.

The 74HC11, 20, 21, 27 and 30 are the wide gates of the CPU board's gate-level control unit
(`board/kontrol.ts`; mikromimari.md, "Gate-level control unit"). They are placed on the boards as glue
logic (`Board.and3`, `nor3`, `and4`, `nand4`, `nand8`): the units are packed into chips once the board is
complete. Pins 3 and 11 of the 74HC20 and 74HC21, and pins 9, 10 and 13 of the 74HC30, are not connected (NC).

## Transistor expansion rules

| Gate | Circuit | Transistors |
|---|---|---|
| NOT | 1 PMOS (VCC→Y) + 1 NMOS (Y→GND) | 2 |
| NAND (k inputs) | k parallel PMOS + k series NMOS | 2k |
| NOR (k inputs) | k series PMOS + k parallel NMOS | 2k |
| AND / OR | NAND / NOR + NOT | 2k + 2 |
| XOR | 2 inverters + AOI22: Y = ¬(a·b + ā·b̄) | 12 |
| Three-state buffer | inverter + three-state inverter (P-P and N-N series stacks) | 8 |
| D flip-flop | 7474 structure: 6 three-input NANDs (edge-triggered) | 36 |
| D latch | 4 NAND + 1 NOT | 18 |

Inputs tied to VCC are fed from a "tie-high" cell (a PMOS with its gate at GND): the switch-level engine does not recompute the power rails, and real chips tie constant inputs the same way.

## Parts not in the library (in the BOM, ideal in the simulation)

Clock oscillator (4 MHz crystal oscillator can), 555 (step clock), reset button RC, decoupling capacitors, LEDs and resistors, VGA connector and its resistor color DAC, PS/2 connector, USB-UART module (CH340). The simulation models these as ideal signal sources; the phase 9 BOM lists them.

The CPU board's debug indicators belong here too: 39 LEDs (3 mm, each with 1 kΩ), 26 LED bar graphs with
10 segments each (`DISP_BAR_10`, DIP-20; e.g. Kingbright DC-10YWA, Broadcom HDSP-4840; pins 1–10 are the
segment anodes, pins 20–11 the cathodes; 16 of them show the register contents) and, in front of them, 26
isolated resistor networks of 8 × 1 kΩ (`RN_1K_ISO_8`, DIP-16, e.g. Bourns 4116R-1-102; resistor k sits
between pin k and pin 17 − k). The simulation does not know the resistor values: whether an LED or a segment is lit is
read from the signal at the other end of the resistor ([kartlar.en.md](kartlar.en.md)).

## Adding a new chip

1. Write a `ChipDef` under `chips/parts/`: `pinsOf("…pin names in datasheet order…", { out, tri, bidir })`, the gates with `build(c, p)`, and the function table with `ref`.
2. Add it to the list in `chips/library.ts`.
3. Refresh the symbol library with `npm run cpu16 -- kicad-sym` and run `npx vitest run cpu16/tests/chips.test.ts`: the gate = table and transistor = gate tests are added automatically.
