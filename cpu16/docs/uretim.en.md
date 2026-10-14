# CPU16: production and bring-up (Phase 9)

> For building CPU16, already verified in simulation, on real boards: what speed should we expect, in
> what order do we build it, how do we test each step, and how do we prove at the end that the board
> behaves exactly like the simulator. The step-by-step build is in the experiment guides (`cpu16/kit/`);
> this document gives the reasons behind that order and the engineering notes.

## At a glance

- **First target: 1 MHz CPU clock** (8 MHz crystal oscillator). Timing analysis from the schematic gives
  1.21 MHz worst case and 2.7 MHz with typical values (1.05 / 2.23 MHz on the motherboard); the planned
  4 MHz cannot be guaranteed with this design in the 74HC family. The reason, and the path to 4 MHz, are below.
- **UART speed depends on the CPU clock**: at 1 MHz the board talks at 28,800 baud (115,200 at 4 MHz).
- **Build order** is the experiment order: clock → programmer → CPU blocks → memory → cache →
  I/O → video → BIOS → C. You move on only after the block you just built passes its own test.
- **Done criterion**: `npm run cpu16 -- kart-testi --port …` passes 4/4, which means the real board gives
  byte-for-byte the same output as the simulator on four test programs.

## 1. Clock speed: timing analysis from the schematic

```
npm run cpu16 -- zamanlama            # worst case (datasheet max, 4.5 V, 25 °C)
npm run cpu16 -- zamanlama --tip      # typical values
npm run cpu16 -- zamanlama --yol 10   # the 10 longest paths
```

The tool (`board/zamanlama.ts`) reads the schematic itself: it takes each chip's pin-to-pin delay from the
datasheet, builds the clock tree (which flip-flop is triggered on which clock edge, and with how much
delay) and finds the longest paths from flip-flop to flip-flop. When the schematic changes, the result
changes with it; `tests/zamanlama.test.ts` checks that 1 MHz still fits.

### Result (CPU + clock board)

| | Worst case (max) | Typical |
|---|---|---|
| CPU clock (CLK) | minimum period 824 ns → **1.21 MHz** | 369 ns → **2.71 MHz** |
| Oscillator (clock board, ADIM = step mode) | 248 ns → 4.0 MHz | 102 ns → 9.8 MHz |

In the first schematic, which had ROMs, the CPU clock was 860 ns (1.16 MHz) and 470 ns (2.13 MHz): the gate
circuit that replaced the microcode and ALU decode Flash chips (mikromimari.en.md, "Gate-level control
unit") cut the 70 ns Flash access on the ALU path down to three or four gate delays.

The critical path is the ALU path, which has to fit in half a period:

```
U4    74HC574      control register, FALLING clock edge      CP → Q    +33 ns
U178  74HC04       ~ALU_IR                                   A → Y     +17
U163  74HC08       ALU operation select, bit 4 (AOP4)        B → Y     +18
U69   74HC138      ALU operation decoder (~AIS3)             ~E2 → ~Y  +36
U162, U169, U192   OR tree of the ALU decoder → AD3 (CIN)    08/32/20  +58
U72–U75 74HC283 ×4 carry chain (ripple)                                +148
U144, U124         overflow (V): 74HC86, 74HC08                        +42
U100  74HC153      C and V selector                                    +34
U116, U105 74HC157 C/V hold, flag input (→ U107)                       +48
                   + setup, − capturing clock delay          ≈ 412 ns ≤ T/2
```

### Result: the whole motherboard

```
npm run cpu16 -- zamanlama --anakart [--tip]   # CPU + clock + memory + cache + I/O + video + DIY memory, 6 clock roots
```

| Clock domain | Worst case (max) | Typical | Required |
|---|---|---|---|
| CPU clock (CLK) | 956 ns → **1.05 MHz** | 448 ns → 2.23 MHz | 1 MHz |
| TCLK (wait states, cache and I/O boards) | 758 ns → 1.32 MHz | 338 ns → 2.96 MHz | 1 MHz |
| Oscillator (OSC, cache clear counter) | 87 ns → 11.5 MHz | 37 ns → 27 MHz | 8 MHz |
| PS/2 clock (keyboard) | 150 ns → 6.7 MHz | 60 ns → 16.7 MHz | 16.7 kHz |
| Pixel clock (VID_OSC: 74AC161, 74AC74, 74HC166) | 31 ns → **32.8 MHz** | 17 ns → 59.5 MHz | 25.175 MHz |
| Character clock (pixel / 8, the rest of the video board) | 262 ns → 3.82 MHz | 170 ns → 5.88 MHz | 3.15 MHz |

On the motherboard the CPU's critical path moves from the ALU to the cache hit: control register →
`~MRD` → tag compare (74HC688) → `C_HIT` → the data SRAM drives `DE`/`DO` → CPU bus, again within half a
period (478 ns). At 1 MHz the margin is 4%: the worst-case values are for 25 °C, and this path is not
logically exercised in every cycle (the tool counts the longest connection, not the conditions on the
gates), but on the first build, run the board test before going above 1 MHz.

With 28C256 (EEPROM, 150 ns) and 62256 (70 ns) as the memory chips the worst case barely moved (CLK
950 → 951 ns, TCLK and the character clock unchanged); with typical values TCLK is now set by the EEPROM
read (byte select `BSEL` → 28C256 A0 → `MD`, 150 ns), and the character clock by the character ROM
(28C256) → font register path. Both are far above the required speed. On the video board the slowness of
the 28C256 is absorbed by a pipeline stage (the font register, one character time); without it the font
path would not fit in half a character time (158.9 ns) ([anakart-gc-video.en.md](anakart-gc-video.en.md)).
If the 574s of the DIY memory board (Experiment 14) were connected straight to the data bus, every line
would get 16 extra pins and the CPU path would be 972 ns; with two 74HC245 buffers each line sees one pin:
956 ns.

On the video board only three chips run on the pixel clock: the phase counter (74AC161), the 74AC74 that
generates the character clock, and the shift register (74HC166); the rest of the board runs on the
pixel / 8 character clock. Both AC chips are required: with an HC161 the path is 49 ns (pixel period
39.7 ns), and with an HC74 the margin of the prefetch transfer between the two clocks goes negative. The
hand calculation of the transfers between the two clock domains is in
[anakart-gc-video.en.md](anakart-gc-video.en.md) ("Static timing").

The tool leaves out of the analysis, through named exceptions, the false paths across the bus (from one
board's read driver to another board's write input: a read and a write never happen in the same cycle) and
one arc in the I/O board's timer load pulse; the report lists every exception with its count. Among the
enables of the gated clocks, the ones that can change while the clock is high are tested and listed:
`~WSEL` and `C_MEMACC` (CLK), `C_CB`, `C_INVL`, `C_RAMHIT` (TCLK), `V_OPW` (character clock: it only
gates VRAM's `~OE`/`~WE`). These are logically safe: `~WSEL` through the microcode rule below; the wait
request that `C_MEMACC` gates is not a clock and is sampled only in the middle of s7; the TCLK ones are
stable throughout the write phase or change on an edge where the gate is already closed (the reasoning is
in `tests/zamanlama.test.ts`). The test pins the list; it breaks if a new entry appears.

**Why half a period?** The control register (CR) takes the microcode on the falling clock edge, and the
state registers load on the rising edge (mikromimari.en.md). A micro-step's control word arrives on the
falling edge and its result is written half a period later, on the rising edge: the whole ALU path must
fit in T/2. In return you get simplicity: the microcode address (step counter + IR) and the result are
resolved in the same cycle, and no separate pipeline is needed.

**Why 1 MHz?** The worst-case values are for 25 °C; for -40..85 °C multiply by roughly 1.25, and for
heavily loaded nets (the internal bus, 25+ pins) the tool adds a load correction. At 1 MHz the path takes
412 ns of a 500 ns window: an 18% margin (on the motherboard the cache path takes 475 ns: 5%). On the first
build we want to rule timing out completely as a source of errors; once the board passes the tests at
1 MHz, you can try 2 MHz by swapping the crystal (it fits with typical values; the board test tells you
directly).

### The problem the analysis found and fixed

In the first schematic the gated clock of the C and V flags came from the `SETSCV` output of the ALU decode
ROM. The ROM's address included `CFLAG`, and CFLAG changes exactly on the edge where the flags are loaded;
a glitch on the ROM output at that moment would have sent a second pulse to the flag clock and loaded the
C flag wrongly. The simulation cannot see this (the gate model produces no glitches); on a real board it would
have shown up as an ADC/SBC that goes wrong now and then, a very hard bug to find. The fix: all four flags
load with the same gated clock, and while `SETSCV = 0` a 74HC157 writes the old C and V back. Today's
gate-level decoder can produce the same glitch on its C-dependent bits: the rule still holds, and no output
of the decoder goes to a clock gate.

### Known margins and rules

- **The hold margin of the gated clocks is 8 ns typical.** The enable of a gated clock comes from CR and
  changes on the falling edge; the clock input closes on that edge after two gate delays, while the CR
  output changes after an inverter + 574 delay. So the gated clock gates (74HC08/02) and CR (74HC574) must
  be **from the same family**: do not mix in 74HCT or 74AC here, and keep the CLK and ~CLK lines short.
- **Register write select**: `~WSEL` is decoded from the register fields in IR, and IR changes on the
  rising edge. The microcode never writes a register in the step that loads IR; `tests/zamanlama.test.ts`
  checks this on every word of the microcode table. If the microcode changes, this rule must be kept.
- **ADIM mode**: the GO flip-flop that handles single-cycle stepping runs on the falling edge of the
  oscillator, so its path must fit in half an oscillator period. With an 8 MHz crystal it fits with typical
  values (43 ns ≤ 62.5 ns) and does not in the worst case (104 ns). In OTOMATİK (auto) mode this path has
  no effect. If stepping now and then takes one cycle too many or too few, select the YAVAŞ (slow)
  oscillator in ADIM mode.

### The path to 4 MHz

1. **Faster parts** with the same pinout: the 74AC/74AHC families on the ALU path and in the ALU decoder
   (delays roughly a third). Changing the analysis (the `GECIKME` table) and running it again shows the
   effect in advance.
2. **Clock board**: a 4 MHz CPU needs a 32 MHz oscillator; the 74HC175 Johnson counter is guaranteed only
   up to ≈24 MHz in the worst case (a 42 ns path in the analysis). This needs a 74AC175 too.
3. **Full-period ALU**: move CR to the rising edge and compute the microcode address one step ahead
   (produce the next step's word in advance). The ALU path then fits in T instead of T/2; with 74HC,
   typically ≈4 MHz. It needs microcode and board changes; a later phase.

## 2. The UART and timer run from the CPU clock

The I/O board's time base is TCLK (clock board: oscillator / 8, the same speed as the CPU clock). The UART
bit time and the timer's 1 kHz prescaler count TCLK cycles. Therefore:

| CPU clock | Crystal | UART | Timer base | BIOS tick (`TICKS`) |
|---|---|---|---|---|
| 4 MHz (simulator) | 32 MHz | 115,200 baud | 1 kHz | 10 ms |
| 2 MHz | 16 MHz | 57,600 baud | 500 Hz | 20 ms |
| **1 MHz (first build)** | **8 MHz** | **28,800 baud** | 250 Hz | 40 ms |

- In the Web IDE use the **Board UART speed** setting; on the command line use the `--baud 28800` option.
- Programs that count ticks (the snake game, the clock example) run 4 times slower in real time; their
  behavior does not change. The board test programs print no times and give the same output at any speed.
- The EEPROM programmer (Arduino) is independent of this and runs at its own speed.

## 3. Chips to program

| Chip | File | How to generate |
|---|---|---|
| BIOS EEPROM (memory board, U420) | `bios.hex` | `npm run cpu16 -- bios -o bios.hex` |
| Character ROM (video board) | `charrom.hex` | `npm run cpu16 -- charrom -o charrom.hex` |

Both are 28C256s and are written with the experiment kit's programmer (Experiment 3). The programmer uses
software data protection (SDP): every page is written with protection, and the chip stays protected.

```
python3 cpu16/programlayici/yaz.py PORT --koruma                    # write protection: on / off
python3 cpu16/programlayici/yaz.py PORT bios.hex --dogrula          # no erase command needed
python3 cpu16/programlayici/yaz.py PORT --koruma-kapat              # if needed (for another programmer)
```

There is no chip to program on the CPU board: the microcode and the ALU decode table are built from 74HC
gates (mikromimari.en.md). If the microcode changes, the board changes (`npm run cpu16 -- kontrol`, then
`npm run cpu16 -- board kicad`); rewriting an EEPROM is not enough.

Label the two programmed chips (BIOS, character ROM): they come in the same package, and if they are
swapped the computer prints garbage on the screen at startup or does not start at all.

## 4. Power supply

A rough estimate (5 V):

| Consumer | Count | Current |
|---|---|---|
| 74HC chips (dynamic current at 1 MHz) | ≈446 | ≈1 mA each → 0.45 A |
| Memory, cache and video SRAM / EEPROM (only the selected one draws current) | ≈12 | ≤30 mA → 0.2 A |
| Status LEDs (330 Ω: HALTED, FAULT, CLK) | 3 | ≈9 mA → 0.03 A |
| CPU board debug LEDs (1 kΩ) | 39 | ≈3 mA → 0.12 A |
| CPU board bar graphs (8 segments × 1 kΩ, all bits 1) | 26 | ≤24 mA → 0.62 A |
| **Total** | | **≈1.4 A** |

The LEDs are counted at their worst case: they never all light at once (one each of the read and write
LEDs, at most one of the bus driver LEDs; half the bits of the values are 0). The budget in the CPU
board's build guide (`npm run cpu16 -- kurulum cpu`) is ≈ 0.97 A with the LEDs (≈ 0.23 A without the
indicators and debug LEDs); ≈ 0.4 A of that is the 16 bar graphs that show the register contents.

A regulated 5 V 3 A adapter leaves enough margin. The schematic has 100 µF at the input of every board and
100 nF next to every chip; do not skip them on breadboards either: 74HC boards without decoupling make
random errors on the oscillator edges. On long rows of breadboards, feed power from both ends.

## 5. Build order and the test for each step

Which pin goes where is in the per-board build guides (`npm run cpu16 -- kurulum hepsi`,
[kurulum.en.md](kurulum.en.md)): a numbered wire list block by block, a power table, chip cards; on the
PCB the same list is the continuity test list.

| Step | Built | Test | Counts as passed |
|---|---|---|---|
| Experiment 1 | Clock and reset board | LED, oscilloscope / logic analyzer | in YAVAŞ the LED blinks; in ADIM each press gives one CPU cycle; CLK has a 50% duty cycle and is oscillator / 8 |
| Experiment 2 | (gates, a single chip) | truth table | the four gates of the 74HC00 match the table |
| Experiment 3 | EEPROM programmer | `yaz.py --koruma`, `--dogrula` | protection off on a new chip, on after writing; the written image reads back the same |
| Experiment 4–7 | CPU board, block by block | the manual steps in the guide (DIP switch + LED) | every block gives the table in the guide; at the end of Experiment 7 the CPU fetches instructions from fake memory |
| Experiment 8 | Memory board | `kit/programlar/bellek-deneme.s` in the EEPROM, 8 LEDs on the FF00 latch | the LEDs count banks 32–39 four times, empty regions read `0xFF`, after ≈ 11.5 s `0x5A` and a running light |
| Experiment 9 | Cache board | `kit/programlar/onbellek-deneme.s` | with bit 7 lit (cache on) the running light steps every ≈ 0.16 s, with it off every ≈ 0.23 s |
| Experiment 10 | I/O board | `kit/programlar/gc-deneme.s` in the EEPROM, USB-UART (CH340, 28,800 baud), PS/2 keyboard | in the terminal: a banner, a dot every second, an echo of what you type, the scan codes of the keys |
| Experiment 11 | Video board | `kit/programlar/video-deneme.s`, VGA monitor | "Merhaba, CPU16!" on a blue background, 16 color bars, a frame counter that goes up by 60 every second |
| Experiment 12 | BIOS + bootloader | **`kart-testi`** | **4/4 passed** |
| Experiment 13 | C | `yilan.c` | the game on the screen |
| Experiment 14 | DIY memory board (optional) | `kit/programlar/kyb-deneme.s` in the EEPROM, terminal | the four patterns pass, `TAMAM` and the `FF40:` dump; typed characters show up on the board |

### Board test

```
npm run cpu16 -- kart-testi --port /dev/ttyUSB0 --baud 28800     # Linux
npm run cpu16 -- kart-testi --port /dev/cu.usbserial-110 --baud 28800   # macOS
npm run cpu16 -- kart-testi                                        # the other end is the simulator
```

On Windows the **Board test (Web Serial)** button in the Web IDE does the same job (Chrome / Edge).

Four programs (`cpu16/bios/testler/`) first run in the simulator to get the expected output, then are
loaded onto the board the same way (monitor, Intel HEX, `G`) and the outputs are compared:

| Test | What it checks | If it fails, look first at |
|---|---|---|
| `1-cpu.c` | every ALU operation thousands of times (checksum), branches, stack, C runtime | the CPU board: the path of the operation on the line that differs (e.g. if only `SHL` differs, the shift inputs of the result selector) |
| `2-bellek.s` | 29 banks × 16 KB RAM, bank registers, even / odd byte lines | the memory board: the number of the failing bank tells you which bank bit is at fault, the address which address line |
| `3-onbellek.s` | tag compare, write snooping, hit counter | the cache board: the tag SRAM and the 74HC688 comparators |
| `4-gc-video.c` | timer interrupt, interrupt controller, VRAM write / read | if it hangs (timeout), the timer or the IRQ line; if a VRAM line differs, the video board's data lines |

The test shows the first line that differs. The tool also tests itself: `tests/kart-testi.test.ts` checks
that on a simulated board with one broken VRAM data line only the video test fails.

## 6. Troubleshooting

- **Side by side with the simulator.** The net names in the KiCad schematic are the same as in the
  simulator. While you walk the real board through ADIM mode, run the same program step by step in the
  Web IDE; registers, instruction trace and memory can be compared at every step. The first step that
  differs tells you which block the fault is in.
- **Power and clock first**: every chip's VCC / GND pin, that CLK looks the same on every board
  (reflections, ringing), that ~RESET stays low long enough at power-on.
- **Floating inputs**: a CMOS input is never left floating; the schematic checks this (ERC), while on a
  breadboard a forgotten wire causes random behavior.
- **Bus contention**: if two drivers write to the bus at the same time, the chips heat up and the values
  get mixed. In the schematic every driver's ~OE comes from a single decoder output; on breadboards, watch
  these lines with LEDs on the first build.
- **Timing suspicion**: if a fault depends on speed (gone in YAVAŞ, present with the crystal), halve the
  crystal first. The analysis lists the paths that are at the limit with `--yol 10`.

## 7. PCB notes

The schematics are ready in KiCad (`cpu16/kicad/<kart>/`), and a netlist and a BOM are generated for every
board; placement and routing have not been done yet. The plan:

- **Breadboards** first: building block by block is what the experiment kit is for anyway. The PCB will be
  a copy of the design that passed 4/4 on breadboards.
- The boards sit on the backplane with 2 × 32 connectors (pin list in `board/passives.ts`, `BACKPLANE`).
- **The CPU board is large** (≈150 chips): instead of one PCB, splitting it by function block into two or
  three boards joined by a short ribbon is cheaper and easier to repair. The split points are where few
  signals cross besides the internal bus (BUS0..15) and the control word (CW0..31).
- 4 layers (inner layers as GND and VCC planes) noticeably reduce the noise on clock edges; on 2 layers
  there should be a wide GND pour and every chip's decoupling right at its pin.
