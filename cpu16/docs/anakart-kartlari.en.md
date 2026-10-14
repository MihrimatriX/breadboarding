# Motherboard: clock, memory and cache boards (phase 6, gate level)

> The memory side of [anakart.en.md](anakart.en.md) now also exists as boards built from real chips:
> schematic = code ([kartlar.en.md](kartlar.en.md)). The emulator's `Machine` (`emu/machine.ts`, `emu/devices/cache.ts`)
> is the reference; the boards are compared with it access for access and instruction for instruction.
> `Machine` was not changed for this.

| File | Contents |
|---|---|
| `board/clock-card.ts` | Clock and reset board (`clk`): wait states, TCLK, OSC |
| `board/mem-card.ts` | Memory board (`bellek`): I/O decoding, bank registers, EEPROM + RAM, byte sequencer |
| `board/cache-card.ts` | Cache board (`onbellek`): tag/data memory, wait generator, counters, CACHE_CTRL |
| `board/machine-board.ts` | `buildMachineBoard({ cards })`: CPU + clock + memory + cache (+ extra boards); `GateMachine` |
| `board/bus-master.ts` | `BusMaster`: a fixture that drives the backplane in place of the CPU board (to replay bus traces) |
| `chips/parts/bellek-ek.ts` | New part: 74HC273 |
| `kicad/bellek/`, `kicad/onbellek/` | KiCad schematics and board BOMs (`npm run cpu16 -- board kicad`) |
| `tests/anakart-bellek.test.ts`, `tests/anakart-sistem.test.ts` | Verification (below) |

## Boards and chip counts

| Board | Chips | Details |
|---|---:|---|
| Clock and reset (`clk`) | 10 (previously 9) | 74HC14, 74HC157, 74HC175 (Johnson counter), 74HC74 × 2 (ADIM synchronization; GO + **W**), 74HC541 (clock distribution), 74HC04, 74HC08 × 2, 74HC32 |
| Memory (`bellek`) | 34 (previously 31) | below |
| Cache (`onbellek`) | 46 (previously 37) | below |

Each board also has 100 nF per chip, 100 µF at the board input and a 2 × 32 backplane connector.
The memory board has 3 × 10 kΩ SIPs (MD, DE, DO pull-ups), and the clock board has a 10 kΩ for ~WAIT.

## Backplane (phase 6 pins)

| Pin | Signal | Driver | Users |
|---|---|---|---|
| 46 | ~WAIT | cache board (pull-up on the clock board) | clock board, memory board |
| 47 | ~IO | memory board (74HC688: A15..A8 = 0xFF) | cache board, I/O boards |
| 48 | TCLK | clock board (Johnson Q1) | memory and cache boards |
| 49 | OSC | clock board (buffered oscillator) | cache board (reset clear) |
| 50..55 | PA14..PA19 | memory board (bank register mux) | cache board (tag) |
| 56 | VSYNC_REQ | video board | I/O board |

The DE/DO pull-ups are on the memory board: an address that nobody drives (empty region, I/O board not fitted) reads 0xFF.

## Clock board: wait states

The Johnson counter steps through s0..s7 in every CPU cycle (see the table at the top of `clock-card.ts`).
The W flip-flop (the spare half of a 74HC74) samples ~WAIT **in the middle of s7** (on the oscillator's
falling edge). While W = 1, an AND gate holds CLK and WR_WIN low and the counter makes one more round (8
oscillator periods = one full CPU clock). W changes only in the middle of s7, when CLK and WR_WIN are both
already low, so the gating produces no glitch. As a result, each wait cycle stretches the CPU cycle by
exactly 8 OSC, and the write window opens once per cycle.

- TCLK = Johnson Q1: OSC/8, never stretched. It falls 2 OSC after the falling edge of CLK and rises
  6 OSC after it, and it keeps counting during wait cycles. It stops together with the counter (ADIM mode,
  reset): TCLK is CPU time, not real time.
- OSC: the buffered oscillator, always running (the cache board uses it to clear its tag memory during
  reset).
- ADIM (single-step) mode: GO falls when the counter reaches s0. During a wait cycle the counter passes
  s0, but W = 1, so GO is held. One press = one full CPU cycle, wait cycles included.

## An access with wait states

Every access that goes to main memory (a read miss, a read with the cache disabled, every memory write)
takes exactly **2 wait cycles** (`MEM_WAIT`). Hits and I/O have no wait. The diagram shows a word access;
t = oscillator periods from the falling edge of CLK (F); R = CLK↑ (registers load).

```
t (OSC)       -4      0       4       8       12      16      20      24      28
              R       F                                       R'      F'
CLK           ‾‾‾‾‾‾‾‾\_______________________________________/‾‾‾‾‾‾‾\_______
WR_WIN        __________/‾‾‾\___________________________________________/‾‾‾\_
TCLK          ____/‾‾‾‾‾‾‾\_______/‾‾‾‾‾‾‾\_______/‾‾‾‾‾‾‾\_______/‾‾‾‾‾‾‾\___
~MRD (read)   ‾‾‾‾‾‾‾‾\_______________________________________________/‾‾‾‾‾‾‾
~WAIT         ‾‾‾‾‾‾‾‾\___________________________/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾   (falls at t = 1 on a write)
W samples                    ^               ^               ^
W (WST)       _______________/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\________________
CA            ____________________/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\___________   cache board
CB            ____________________________________/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\___________
CBF           ____________________________________________/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\___
TAGPH         ____________________________________/‾‾‾‾‾‾‾\___________________   tag/data write
SA            ____________________/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\___________   memory board
BSEL = A0     ____________________________/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\___
574 latch                         ↑                                               even byte (read)
DE/DO drive   ____________________________/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\___________   read
~MWR even     ‾‾‾‾‾‾‾‾‾‾‾‾\_______/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾   write
~MWR odd      ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\_______/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾   write
```

1. Request (cache board): `NEED = ~IO ∧ ¬CLK ∧ (WRL ∨ (read ∧ ¬(EN ∧ HIT)))`. WRL are flags that the
   CPU's ~MWE_E/~MWE_O strobe sets and CLK↑ clears (74HC74 preset inputs).
   `~WAIT = ¬((NEED ∨ CA) ∧ ¬CB)`; CA ← ~WAIT low (TCLK↑, t = 6), CB ← CA ∧ ~WAIT low (t = 14).
   The clock board sees ~WAIT low at t = 3.5 and 11.5 and high at 19.5: **exactly two rounds**, R' = 20.
2. Byte order (memory board, driven by ~WAIT and TCLK on its own): SA ← wait (t = 6),
   BSEL ← SA (TCLK↓, t = 10). The even byte is captured in the 74HC574 at t = 6 (BSEL = 0); while
   BSEL = 1 the odd byte goes straight to DO through the 74HC245. The board drives DE/DO during [10, 22);
   the CPU samples at R' = 20.
3. Write: the CPU's write strobe does not reach the memory chips; it only sets the WEL_E/WEL_O flags.
   The even byte is written in the window [2, 6) (BSEL = 0), the odd byte in [14, 18) (BSEL = 1). There are
   at least 4 OSC between an edge that changes A0 (BSEL) and an edge that ends a write strobe, and the data
   is stable for at least 4 OSC before and after the strobe.
4. Cache update in the TAGPH = [14, 18) phase: on a read miss (EN = 1) the line is filled from the DE/DO
   that the memory board drives; on a write hit to RAM (PA19 = 1) the written byte(s) are updated in the
   line; on a write hit to the EEPROM or an empty region (PA19 = 0) the line is invalidated.
5. Hit: while CA = 0 the data SRAM drives DE/DO together with ~MRD; no wait.

There is no word/byte distinction: a byte read also reads both bytes (the CPU uses one), and a byte write
also takes 2 waits (the same as `Machine`).

## Memory board (34 chips): block → chip

| Block | Chips |
|---|---|
| Address decoding | 74HC688 (A15..A8 = FF → ~IO), 74HC688 (FF10..FF13), 74HC139 (bank register select FF10/11 · FF12/13), 74HC138 (chip select: A0 = PA15, A1 = PA16, A2 = PA19, ~E1 = PA17, ~E2 = PA18, E3 = ~IO; ~Y0 → EEPROM, ~Y4..~Y7 → RAM 0..3) |
| Bank registers | 74HC273 × 4 (~MR = ~RESET; bits whose reset value is 1 are stored inverted, with an inverter at the input and the output: 0/32/33/34), 74HC153 × 3 (PA14..PA19 selected by A15..A14), 74HC541 × 4 (readback, upper two bits 0) |
| Byte sequencer | 74HC74 × 2 (SA/BSEL; WEL_E/WEL_O), 74HC574 (even byte latch → DE), 74HC245 × 2 (DE → MD write; MD ↔ DO) |
| EEPROM and RAM | 28C256 (DIP-28 socket, moved to and from the programmer; A0 = BSEL, A1..A13, PA14), 62256 × 4 (same wiring; each 32 KB = two banks), ~OE = ~MRD, shared ~WE |
| Glue | 74HC04 × 3, 74HC08 × 2, 74HC32 × 2, 74HC00, 74HC02 |
| Pull-ups | MD0..7 (empty region 0xFF), DE0..7, DO0..7 |

Physical map: EEPROM `0x00000–0x07FFF` (banks 0–1), RAM `0x80000–0x9FFFF` (banks 32–39). The remaining
regions (banks 2–31 and 40–63) are empty: no chip is selected, the pull-ups on MD make reads return `0xFF`,
and writes are ignored. The 74HC138 gives each chip its own ~CE; in the empty region ~Y1..~Y3 are not connected.

Differences from the estimate in anakart.md: the bank reset value uses inverter pairs instead of an XOR (the
74HC273 only has a clear); readback uses the 74HC541 already in the library instead of a 74HC244; the byte
sequencer uses two 74HC74s instead of 74HC161 + 138 (the cache board counts the wait cycles and this board
follows ~WAIT). The memory used to be a single 512 KB AS6C4008 and an SST39SF010A Flash (31 chips); neither
is common, so 4 × 62256 and a 28C256 replaced them (AFU's decision, [spec.en.md](spec.en.md)).

## Cache board (46 chips): block → chip

| Block | Chips |
|---|---|
| I/O decoding | 74HC688 (FF30..FF37), 74HC139 (FF30 hits, FF32 misses, FF34 CACHE_CTRL) |
| Wait and sequencing | 74HC74 × 3: CA/CB (TCLK↑), WRL_E/WRL_O (write flags), CBF (TCLK↓) / INVL (invalidate decision, t = 6) |
| Tag memory | 62256 × 2 (16 bits: A11..A13, PA14..PA19, valid, 6 × 0), 74HC541 × 2 (new tag driver, only while writing), 74HC688 × 2 (compare → HIT; valid = 1 fixed in the upper half), 74HC161 × 3 (reset clear counter), 74HC157 × 3 (tag address: A10..A1 or the counter), 74HC74 (CLRS; EN = CACHE_CTRL bit0, 1 at reset) |
| Data memory | 62256 × 2 (DE and DO lanes, address A10..A1) |
| Counters | 74HC161 × 8 (hits and misses, 16 bits; count on CLK↑), 74HC541 × 4 (counter readback, during the read step), 74HC541 (CACHE_CTRL readback) |
| Glue | 74HC08 × 6, 74HC32 × 2, 74HC02 × 2, 74HC00, 74HC04 × 2 |

- Counting: once on CLK↑ (R): hit = read ∧ EN ∧ HIT ∧ ¬CA, miss = read ∧ EN ∧ CA.
  One bus cycle = one word access = one count; nothing is counted while the cache is disabled. Four 74HC161s
  are chained on a common clock: each one's CEP is the count enable and its CET is the previous one's TC (a
  synchronous chain; no ripple counter). Readback goes through 74HC541s straight from the counters: the
  counters change only at the end of memory reads and are stable during an FF30–FF33 read (I/O), so the
  output register of the 74HC590 is not needed. An even byte write to FF30 and ~RESET clear both counters (~MR).
- Why 74HC161 + 74HC541: the earlier 74HC590 combined the counter and the output register in one chip,
  but it is not common. The 74HC161 is available everywhere; it has no three-state output, so it reaches
  the bus through a 74HC541 (the board went from 37 to 46 chips).
- Reset: while ~RESET is low, CLRS = 1: the 74HC157s switch the tag address to the clear counter, and
  "invalid" is written to one line in every low half of OSC; the comparator is off. When ~RESET rises, CLRS
  falls on OSC↑ (the last write strobe closes before the address changes). **~RESET must stay low for at
  least 1025 OSC periods**; on a real board the reset RC lasts milliseconds, and `GateMachine` holds it for
  1100 periods.
- Signal names carry board prefixes: the memory board's internal nets start with `M_`, the cache board's
  with `C_`.

## Verification chain

1. Parts: the 74HC273's gate model = datasheet table = transistor expansion (`chips.test.ts`,
   the same test as the other chips). The 28C256 and 62256 are behavioral; the 28C256 model is the same as
   the emulator's (page write, DATA polling, toggle bit, software protection).
2. The clock board alone (`anakart-sistem.test.ts`): 60 cycles with 0..5 waits, using a fixture that
   drives ~WAIT like a memory board. Every edge of CLK, WR_WIN and TCLK falls in the expected OSC period,
   only on the oscillator's rising edge; the time between consecutive CLK↑ is 8·(1 + wait). The edges are
   also counted with 74HC161 counters (a glitch inside a wave would make a counter overcount). In ADIM
   mode, 12 presses: each press is exactly one cycle, wait cycles included, and the clock stops between presses.
3. Memory + cache boards ↔ Machine, bus trace (`anakart-bellek.test.ts`): `Machine`'s
   `onAccess` trace is grouped into word/byte bus cycles and replayed with `BusMaster` on the real clock,
   memory and cache boards. On every access the value read, the number of wait cycles, the bank registers,
   the counters and CACHE_CTRL are compared; at the end, the EEPROM (internal state included), the 128 KB of
   RAM, the 1024 tags and the data of the valid lines. Scenarios: BIOS boot (up to the "> " prompt,
   ≈ 59,000 accesses), monitor commands (C, C 0 / C 1, W, D, B, and I, which checks EEPROM write
   protection), Intel HEX → EEPROM with the F command (protected page write, DATA polling), 64 banks + bank
   registers + RAM/EEPROM/empty region snooping + cache off/on + counter overflow + EEPROM write, and the
   1 MB physical map: EEPROM, empty space 0xFF, RAM (cache on and off). The EEPROM's time is the clock of the
   fixture driving the board; the write cycle (≈ 10 ms) ends at the same moment in both models.
4. Full system ↔ Machine, instruction by instruction (`anakart-sistem.test.ts`): `GateMachine` (CPU +
   clock + memory + cache boards, real microcode) is compared after every instruction for PC, the 8
   registers, the N Z C V I flags, total cycles and wait count; at the end, memory, tags and counters. fib,
   bubble, add32 and hello from RAM (window 2); a test program (64 banks, reading banks as words, cache
   off/on, protected writes to the EEPROM and DATA polling / toggle bit during the write, an EEPROM write
   invalidating a cache line, counters); the BIOS boot from reset to the first read from another board's
   I/O address (≈ 58,200 cycles: bank registers, enabling the cache, clearing variables, copying the EEPROM
   write routines to RAM, clearing the screen).
5. KiCad: `kicad-cli` extracts netlists from the memory and cache schematics; each net's pin set
   matches the board's nets (`board.test.ts`; skipped if `kicad-cli` is not installed). ERC: no
   conflicting outputs and no floating inputs in `buildMachineBoard()`.

Speed (outside the browser): `BusMaster` runs ≈ 18,000 and `GateMachine` ≈ 9,000 CPU cycles per second
(≈ 7,000 with the I/O, video and DIY memory boards fitted too).

## Known differences and constraints

- No back-to-back bus steps assumed: the memory board's sequencer runs until t = 26 after an access (the
  first 2 OSC of the next step). In the microcode two memory steps never come back to back (every `MEM` step
  has a step without bus use before and after it, fetch step 0 `PC -> MAR` included); this must be kept if
  the microcode changes.
- The wait generator is on the cache board: only the cache board knows hit/miss. The memory board on its
  own (without the cache board) never requests waits and does not work.
- The EEPROM chip model (`chips/parts/memory.ts`) uses the emulator's `At28c256` itself: contents, page
  buffer, write protection and write cycle are shared, with no difference. Only time comes from outside
  (`probe.eeprom.now`): `GateMachine` and `BusMaster` tie it to their own clocks. Neither a board reset nor
  `Machine.reset()` interrupts a write cycle in progress (as with the real chip).
- TCLK is CPU time: like `Machine.cycles` it also counts wait cycles, but it stops with the counter in ADIM
  mode and during reset. The clock that always runs is OSC.
- Timing margin on a real board (the simulation has zero delay; the figures below are rough estimates using
  typical 5 V 74HC delays): with a 32 MHz oscillator (4 MHz CPU) the wait decision must reach W within
  3.5 OSC ≈ 109 ns after F. Path: CPU control register + 74HC138 + two inverters → ~MRD (≈ 50 ns) →
  NEED/~WAIT on the cache board (≈ 6 gates, 60 ns) → inverter + 74HC74 setup on the clock board (≈ 25 ns)
  ≈ 135 ns: **it does not fit** (with a 16 MHz oscillator the margin is 219 ns).
  On a read hit the data SRAM's ~OE also opens after ~MRD, and the data must reach the CPU by R
  (F + 125 ns) (a 70 ns 62256 does not make it, a 15 ns IS61C256AL is borderline). The boards behave the
  same at every clock speed (everything is counted in CPU cycles). For a first build, a 16 MHz oscillator
  (2 MHz CPU) and 15–25 ns SRAM are recommended; for a 4 MHz CPU the glue gates on these paths must be
  74AHC/74AC.

## Usage

```ts
import { GateMachine, buildMachineBoard } from "./board/machine-board.ts";
const g = new GateMachine(microcodeRom);   // or new GateMachine(rom, { cards: [buildIoCard, buildVideoCard] })
g.loadFlash(biosImage);
g.reset();                                  // ~RESET low for 1100 OSC periods (the cache is cleared)
g.step();                                   // one instruction (wait cycles included); g.cycles, g.waitCycles
g.probe.hits; g.probe.tag(line); g.probe.banks;   // inside the boards
const { board } = buildMachineBoard();      // schematic, BOM, KiCad, ERC
```

If no I/O board is fitted, `GateMachine` holds IRQ at 0 and appends even byte writes to 0xFF00 to
`output` (a UART monitor for tests only; programs that read UART_STAT do not behave like `Machine` in this
setup and need the I/O board).
