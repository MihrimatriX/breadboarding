# Motherboard I/O and video boards (gate level)

> The I/O side of the phase 6 motherboard, built only from the common 7400-series chips in the library
> (with only the 62256 and 28C256 as memories): the **I/O board** (`gc`: UART, PS/2 keyboard, timer,
> interrupt controller; `board/io-card.ts`), the **video board** (`video`: 80 × 30 text, VGA 640 × 480;
> `board/video-card.ts`) and, for teaching, the **DIY memory board** (`kyb`: 16 bytes, one 74HC574 per
> byte; `board/kyb-card.ts`). The behavioral model is `emu/machine.ts` and `emu/devices/*.ts`; the register
> map and the software interface are in [anakart.en.md](anakart.en.md). Tests: `tests/anakart-gc.test.ts`.

The boards plug into the backplane and use only the shared signals on it: CLK, WR_WIN (as the write strobe
inside ~MWE_E / ~MWE_O), ~RESET, A0..A7, DE0..7 (even byte lane), DO0..7 (odd byte lane), ~MRD, ~MWE_E,
~MWE_O, ~IO (memory board: A15..A8 = FF), TCLK (I/O board), IRQ (driven by the I/O board) and VSYNC_REQ
(driven by the video board, read by the I/O board). Each board decodes its own group from ~IO and A7..A4
with a 74HC138; the DE/DO pull-ups and FF10–13 / FF30–34 are on the memory board. The boards never request
wait states.

## Bus cycle (as the boards see it)

| Event | Time (k = access cycle, which starts at the k-th rising edge of TCLK) |
|---|---|
| address, ~IO, ~MRD valid | right after edge k, for the whole cycle |
| write strobe ~MWE_E / ~MWE_O | k + 5/8 … k + 7/8 (WR_WIN); registers load at the end of the strobe |
| read data to the CPU | edge k + 1 |
| read side effect (UART_DATA, KBD_DATA, VDATA; only A0 = 0) | captured in a flip-flop at edge k + 1, applied in cycle k + 1 |

A word access takes one cycle (A0 = 0, both lanes together). This matches Machine's timing rule: in Machine
an event at time E is visible to an access in cycle C ≥ E; on the board, a state that changes at the E-th
edge of TCLK is visible to a read in cycle k ≥ E (data taken at k + 1) and on IRQ.

## I/O board (`gc`)

### Block → chip

| Block | Chips |
|---|---|
| Address decoding | 74HC138 ×4 (group FF0x; read, even write, odd write pairs) |
| Read side effects | 74HC74 (UART_DATA / KBD_DATA read: a one-cycle pulse) |
| Signal conditioning | 74HC14 (Schmitt triggers for PS/2 clock and data, UART RX) |
| UART transmitter | 74HC165 (shift), 74HC161 ×2 (bit divider 0..34), 74HC161 (bit counter 0..9) |
| UART receiver | 74HC74 ×2 (two-stage synchronizer, BUSY flags), 74HC161 ×2 (sample divider), 74HC161 (sample counter), 74HC595 (shift + UART_DATA) |
| PS/2 keyboard | 74HC161 (edge counter), 74HC595 (shift + KBD_DATA), 74HC05 (open drain that pulls the clock line low) |
| Timer | 74HC161 ×3 (TCLK / 4000 prescaler), 74HC574 ×2 (RELOAD), 74HC175 (CTRL), 74HC74 (EXPIRED, first TCLK edge after reset), 74HC161 ×4 (16-bit counter, inverse of the remaining tick count), 74HC688 ×2 (counter = 1), 74HC541 ×4 (readback); the 16 inverters that invert RELOAD are in the glue logic |
| Interrupt controller | 74HC175 (IRQ_MASK, reset 0), priority encoder from gates (in the glue: 4 AND for the mask, 3 OR for IRQ, 2 OR + 1 AND + 1 NOT for IRQ_SRC), 74HC541 ×3 (IRQ_SRC, IRQ_PEND, IRQ_MASK read) |
| Status registers | 74HC541 ×2 (UART_STAT, KBD_STAT), 74HC74 (RX_READY, keyboard READY) |
| Glue logic | 74HC08 ×8, 74HC32 ×5, 74HC00 ×2, 74HC02 ×2, 74HC04 ×5 |
| **Total** | **65 chips** + CH340 module (6-pin header), PS/2 socket, 10 kΩ ×2, backplane connector, 100 µF, 100 nF ×65 |

### Timing (all from TCLK; TCLK = Machine's `cycles` counter)

- UART TX (115,200 8N1): the bit time comes from the divider, 35 cycles for bits 0–6 and 34 for bits 7–9:
  7 × 35 + 3 × 34 = **347 = `UART_BYTE_CYCLES`**, an average of 115,274 baud (+0.06%). The largest
  deviation of an edge from its ideal 115,200 baud position is 1.3 cycles (3.8% of a bit; the test measures
  it against a 6% limit). The start bit begins with the write strobe (k + 5/8); `TX_EMPTY` becomes 1
  exactly at edge k + 347 (Machine: `txBusyUntil = C + 347`). Writing while busy restarts the frame.
- UART RX: the line is synchronized with two flip-flops. When the start bit is seen the divider counts
  from 19, then a sample is taken every 35 cycles (start, 8 data, stop). The sample points deviate from the
  ideal bit centers by −1.4 … +2.2 cycles; in the test, bytes with a ±2% baud error are received correctly.
  If the start bit falls in cycle t, the byte moves to UART_DATA at the stop bit sample (edge t + 334) and
  `RX_READY` is set. `RX_READY` = RTS# → the CH340's CTS#: the bridge does not send the next byte until this
  one is read (no overflow). In Machine a byte becomes ready only ≥ 347 cycles after the read; on this
  board CTS# falls in the cycle after the read and the frame lasts 334 cycles, so the board can reach every
  ready time that Machine produces.
- PS/2: the keyboard clock is 10–16.7 kHz (Machine: 12.5 kHz, 3520 cycles per byte). Falling clock
  edges are counted: the board shifts on edges 1–9 (the start bit drops out), moves the byte to KBD_DATA on
  edge 10, and sets `READY` on edge 11 (the stop bit). While `READY` is set the 74HC05 pulls the clock line
  low (inhibit) and the keyboard holds the next byte. Reading KBD_DATA clears the counter and `READY` only
  while `READY` is set (a read in the middle of a frame does not corrupt it). Parity is not checked
  (Machine does not check it either).
- Timer: the prescaler counts 96..4095 (4000 states). It loads 96 during reset, and if the first count edge
  after reset is counted as edge 1, the ticks fall on edges 4000k (Machine: multiples of
  `TICK_CYCLES`). The counter is four synchronous 74HC161s holding the bitwise inverse of the remaining
  tick count c (u = ¬c): the 74HC161 only counts up, and counting down (c − 1) is counting the inverse up
  (u + 1). RELOAD reaches the counters through 16 inverters. Everything happens on TCLK edges:
  while EN = 0, u ← ¬RELOAD is loaded on every edge (the counter is always ready with RELOAD, so writing
  EN 0 → 1 needs no extra load). On a tick edge with EN set the counter decrements by one; when c = 1
  (u = 0xFFFE, two 74HC688s) RELOAD is loaded on the same edge instead, and EXPIRED is set (Machine:
  1 → 0 → RELOAD; through the 74HC161's ~PE the load takes priority over counting). The counter cannot be
  read from outside, so a RELOAD write in the same cycle affects the next period, as in Machine. EXPIRED:
  writing bit0 = 1 to TIMER_STAT clears it for the duration of the strobe.
- Interrupt: IRQ_PEND = {EXPIRED ∧ IRQ_EN, keyboard READY, RX_READY, VSYNC_REQ}; each is ANDed with
  the mask (P0..P3). IRQ = P0 ∨ P1 ∨ P2 ∨ P3 (combinational, no delay). IRQ_SRC is the highest-numbered
  request: SRC1 = P3 ∨ P2, SRC0 = P3 ∨ (P1 ∧ ¬P2). A four-input priority encoder needs no 74HC148; five
  gates are enough. With no request the IRQ_SRC buffer is not driven and the DE pull-ups make it read
  `0xFF`.

## Video board (`video`)

### Block → chip

| Block | Chips |
|---|---|
| Address decoding | 74HC138 ×4 (group FF2x; read, even write, odd write pairs) |
| Pixel clock and counters | 25.175 MHz oscillator (VID_OSC), **74AC161** (pixel phase p0..p7), **74AC74** (H2 = character clock, LD7 = p7), 74HC161 ×2 character counter (0..99), 74HC161 ×3 vertical (0..524) |
| Decoding | 74HC688 (VSYNC: lines 490–491); write strobe p5–p6 = H2 ∧ Q1 (glue, glitch-free) |
| Vertical scan state | 74HC74 (synchronized vblank, vsync flag = VSYNC_REQ), 74HC393 (frame counter, bit 4 blinks the cursor), 74HC541 (VSTAT read) |
| Scan address | 74HC161 ×3 (MA), 74HC574 ×2 (row start) |
| VRAM | 62256 ×2 (character / color lane; 4 KB used, A12–A14 = 0), 74HC157 ×3 (address: scan / CPU) |
| Pixel path | 74HC574 ×5 (character code, color byte; font byte and the second stage of the color byte; displayed color byte), 28C256 (4 KB font, 150 ns), 74HC166 (pixel shifter, synchronous load), 74HC175 ×3 (blanking, syncs, cursor: front register at p4, second stage at the next p4, output at p7 → p0), 74HC688 ×2 (cursor column / row) |
| Color and DAC | 74HC157 (foreground / background color, black during blanking), brown correction (glue), 680 Ω ×3 + 1.3 kΩ ×3, VGA DE-15 |
| CPU interface | 74HC161 ×4 (VADDR, 13 bits used), 74HC74 (VADDR load flags), 74HC74 ×4 (requests, synchronizers, VDATA read side effect, VCTRL), 74HC574 ×2 (write data → lane), 74HC574 ×2 (prefetch latch), 74HC541 (VCTRL read) |
| Cursor | 74HC574 ×2 (CURSOR_X / Y), 74HC541 ×2 (readback) |
| Glue logic | 74HC08 ×8, 74HC32 ×3, 74HC00, 74HC02, 74HC04 ×2, 74HC10 ×2 |
| **Total** | **73 chips** (2 of them 74AC) + oscillator, 6 resistors, VGA connector, backplane connector, 100 µF, 100 nF ×73 |

### Timing

- Scan: a line is 800 pixel clocks and a frame 525 lines; HSYNC and VSYNC are negative polarity. A
  character is 8 pixel clocks (p0..p7).
- Two clock domains: only the phase counter (74AC161), the H2 / LD7 register (74AC74) and the pixel shifter
  (74HC166) run on the pixel clock (VID_OSC, 39.7 ns). The phase counter counts 9..15, 0 (9..15 = p0..p6,
  0 = p7); at 0, Q3 = 0, so it loads 9 again through its own ~PE and needs no decoding gate. Q3 (~LD7) is
  low at p7: it is the shifter's load enable and the clock of the output registers (it rises on the
  p7 → p0 edge). H2 = Q2 delayed by one pixel (p4..p7), LD7 = TC delayed by one pixel (p7). Everything else
  runs on the **character clock** (H2 = pixel / 8, 318 ns): the character counter (bits 9..3 of hc), the
  vertical counter, MA, row start and the CPU requests on the rising edge of H2 (p4); VBQ and the request
  synchronizers on its falling edge (p0).
- VRAM slots: p0..p3 scan (address = MA); at the start of p4 the character code and color byte are
  captured and MA increments; p4..p7 CPU (address = VADDR[12:1]), with a pending write in p5–p6 or a
  prefetch in p7. Scan and CPU are never in the same slot, so a CPU write leaves no trace on screen.
- Pipeline (two stages): in horizontal character j the character at MA is read and captured into the
  character code register (CHR) at p4; it goes into the character ROM (28C256). The ROM output is captured
  into the font register (74HC574) one character later, at p4 of j + 1, so the ROM gets a full character
  time (317.8 ns). The font byte is loaded into the 74HC166 at the end of j + 1 (p7 → p0) and shifts out
  during j + 2. The character counter counts at p4; everything that samples at p4 (MA, row start, front
  register) sees the value before the edge, that is, character j. The color byte (AT → AT2 → ATD), blanking,
  HSYNC, VSYNC and the cursor (front 74HC175 → second stage → output 74HC175) pass through the same two p4
  stages and are captured into the output registers at the end of j + 1 (the same edge as the shifter).
  Visible pixel x is at hc = x + 16 on the line (hc = 8 × character + p); the syncs take the same path, so
  they shift by 16 pixels too. Relative to the visible area: 640 visible + 16 front porch + 96 HSYNC
  (hc 672..767) + 48 back porch; vertically 480 + 10 + 2 (lines 490–491, from hc 16 on) + 33. The image
  matches Machine's pixel for pixel (the test compares a full frame). The row start (ROWSTART) is taken from MA at character 98 on the last scan line of a character row,
  and MA loads it at character 99; during vertical blanking MA is 0.
- Color: the 74HC157 picks the low (foreground) or high (background) nibble of the color byte; select =
  pixel ∨ cursor. The DAC drives a 75 Ω monitor input: a color bit through 680 Ω (0.47 V), intensity
  through 1.3 kΩ (0.25 V), both together 0.72 V. For brown (I = 0, R = G = 1, B = 0) green is driven only
  through 1.3 kΩ: 0xAA5500. The test compares the three components of every color with the CGA palette
  (`src/cpu16/vga.ts`).
- Cursor: VCTRL ∧ ¬(frame counter bit 4) ∧ column = CURSOR_X ∧ line = CURSOR_Y ∧ scan line
  14–15. The frame counter counts at the start of vblank (Machine `frames`): 0–15 on, 16–31 off.
- VSTAT: bit0 = vblank (line ≥ 480; the vertical counter becomes 480 at p4 of character 99, and vblank is
  set at the next p0, that is, at the 384,000th pixel edge of the frame; it falls at the 420,000th edge),
  bit1 = vsync flag (set on the rising edge of vblank, cleared by writing bit1 = 1 to FF26) = VSYNC_REQ.
- CPU port: VADDR is four synchronous 74HC161s with a single clock V_PFCLK = ~V_WE0 ∧ ~V_WO0 ∧ V_INC.
  A write strobe to FF20 / FF21 sets that half's load flag (74HC74) asynchronously (~PRE); when the strobe
  ends the clock rises, the counters load the byte, and the same edge clears the flag with D = 0. On a byte
  write the other half does not count on that edge (CEP = the other half's flag is not set). The increment
  clock V_INC (end of the cycle after a VDATA read, or end of a VRAM write) feeds the same clock; with no
  flag set the two halves count together (TC → CET chain). V_INC cannot be low during a write strobe: I/O
  accesses come at least 6 cycles apart, and an increment ends within ≈ 3.5 cycles at the latest. A VDATA
  write puts the byte into the two write latches and sets a request; the request is synchronized to the
  character clock with two flip-flops and written into the lane selected by VADDR0 in the next CPU slot,
  after which VADDR increments. A VDATA read reads the prefetch latch (character or color byte depending on
  VADDR0, in the same bus cycle); in the next cycle VADDR increments, and every time VADDR changes (write,
  read, VADDR write) a new prefetch is requested. In the worst case a write ends after ≈ 3.4 CPU cycles, a
  prefetch after a read after ≈ 4.4, and a prefetch after a write after ≈ 5.8. The CPU's I/O instructions
  (`LBU`/`SB`/`LW`/`SW`) take 6 cycles, so two consecutive accesses always leave enough time and the CPU
  never waits. The test makes accesses at exactly this shortest interval (6 cycles).

### Static timing (25.175 MHz pixel clock)

`npm run cpu16 -- zamanlama --anakart` (worst case) and `... --anakart --tip`; the roots are VID_OSC (target
period 39.7 ns) and the character clock V_H2 (below). In the earlier design the horizontal and vertical counters, decoding and the character boundary clock
ran on the pixel clock; the longest path went from the horizontal counter through end-of-line decoding to
the vertical counter's ~PE (74HC161 → 74HC08 → 74HC10 → 74HC04 → 74HC10 → setup).

| VID_OSC | before | after |
|---|---|---|
| sequential elements | 18 | 5 (74AC161: Q and TC, 74AC74 ×2, 74HC166) |
| worst (max) | 127 ns → 7.87 MHz | **30.5 ns → 32.79 MHz** (74AC161 CP → Q3 18.5 + 74HC166 ~PE setup 12) |
| typical | 89 ns → 11.24 MHz | **16.8 ns → 59.52 MHz** (74AC161 CP → TC 13.3 + 74AC74 setup 3.5) |
| gated clock (enable changing while high, hold margin) | character boundary clock gated with ~LD7 | none |

The paths on the pixel clock contain no gates at all: the phase counter's Q3 goes straight to its own ~PE
and to the shifter's ~PE, and Q2 and TC go straight to the 74AC74. The analysis takes 74AC delays as half of
the 74HC delay in the worst case and 70% of it in the typical case (`zamanlama.ts` `AC_ORANI`; pessimistic
compared with the datasheet).

**74AC chips** (both have the same pinout as their 74HC versions; 74ACxxx in the schematic / BOM):

| Chip | Why |
|---|---|
| 74AC161 (pixel phase) | It counts on every pixel edge, and its Q3 is the shifter's load enable. With a 74HC161, CP → Q3 37 + 74HC166 setup 12 = 49 ns > 39.7 ns. |
| 74AC74 (H2, LD7) | H2 is both the character clock and the VRAM address select, so its CP → Q delay enters every cross-domain transfer. With a 74HC74 (35 ns) the prefetch latch's margin goes negative (7 ns → −6 ns in the table below). |

**Why the 74HC166 stays.** The shifter is a 74HC166 (its ~PE path of 30.5 ns fits); its output goes only
to the combinational color selector (it enters no register). The 74HC166 is a common 7400-series part. The
only other shifter you might consider is the 74HC165, and it does not work: the 165's parallel load is
asynchronous (~PL level). Loading it would need a ~PL pulse of at least ≈ 20 ns (datasheet tW), generated
from the pixel clock with gates and fitting inside one pixel period (39.7 ns). That is a gated signal on the
pixel clock (exactly what this board avoids), and during the pulse Q7 shows the first bit of the font byte
early, so the first pixel shifts and the image no longer matches Machine's. The 74HC166 loads on the same
clock edge as it shifts (~PE = LD7 enable): there is no gate in between, and the first pixel stays visible
for a full pixel time. Between the pixel output (Q7, at most 35 ns) and the outputs of the color / blanking
registers (~LD7 + 74HC175 / 74HC574, at most 52 ns), at most 17 ns of skew remains at the character
boundary, the same as in the old design.

**Character clock** (root V_H2; checked by `tests/anakart-gc.test.ts` and `tests/zamanlama.test.ts`; target 317.8 ns =
3.15 MHz): worst 262 ns → 3.82 MHz, typical 170 ns → 5.88 MHz. The longest path is the gating of the row
start clock (vertical counter → VBL → ~ENRS, within half an H2 period: 131 ns ≤ 159 ns); the hold margin
(typical) is 36 ns. The character ROM (28C256, 150 ns access) now sits inside a full H2 period:
CHR (or scan line V0–V3) → ROM → font register worst case 37 + 150 + 12 = **199 ns ≤ 317.8 ns**
(119 ns margin); in the typical case this is also the longest V_H2 path (16 + 150 + 4 = 170 ns). Without the
pipeline, the character ROM → shifter path would need H2 17.5 + 574 33 + ROM 150 + setup 12 = 212.5 ns
within half a character (4 pixels, 158.9 ns): a 150 ns EEPROM would not fit. The only enable that changes while the clock is high is OPW: it gates the VRAM ~OE (H2 ∧ OPW) and ~WE,
neither of which is a clock, and at p4, where OPW changes, the write strobe WRP = H2 ∧ Q1 is already 0.

**Cross-domain transfers** (worked out by hand; t(pk) = the pixel edge at the start of pk, P = 39.7 ns; the
slow side uses worst-case delays, the fast side typical delays):

| Transfer | Calculation | Margin |
|---|---|---|
| Font register → 74HC166 (loaded at p7 → p0) | font byte at p4: H2 17.5 + 74HC574 33 + setup 12 = 62.5 ≤ 4P = 158.9 | 96 ns |
| Scan read → CHR / color byte (H2 ↑) | select and clock are the same net (H2): 74HC157 S → Y 30 + 62256 70 + setup 12 ≤ 4P | 47 ns |
| Prefetch → latch (OPR ∧ LD7, rises at p7) | data t(p4) + 17.5 + 30 + 70 + 12 = 129.5; clock at the earliest t(p7) + 10.5 + 7 = t(p4) + 136.7 | 7 ns |
| Write: address → ~WE | address t(p4) + 17.5 + 30 = 47.5; ~WE at the earliest t(p5) + 10.5 + 7 + 8 = t(p4) + 65.2 | 18 ns |
| Write: OPW → ~WE (NAND3) | OPW at the latest t(p4) + 17.5 + 35 = 52.5; WRP at the earliest t(p4) + 57.2 | 5 ns |
| Write: ~WE → address change | ~WE at the latest t(p7) + 18.5 + 18 + 20 = 56.5; address at the earliest t(p0) + 10.5 + 15 = t(p7) + 65.2 | 9 ns |
| Second stage (color byte, blanking, syncs, cursor) → output registers (~LD7 ↑, p0) | source t(p4) + 17.5 + 33 = 50.5 + 12 ≤ 4P + 10.5 | 107 ns |
| VBQ (p0) → MA ~MR | MA's next clock is at p4 | 4P |

## Verification chain

1. New chips (`chips/parts/gc-ek.ts`: 74HC05, 74HC166, 74HC393):
   `tests/chips.test.ts` compares each with its datasheet function table (`ref`) and its CMOS transistor
   expansion (all inputs for the 74HC05, random steps for the others).
2. Cycle by cycle against Machine (`tests/anakart-gc.test.ts`; the boards run alone on a test bench, and
   the bench drives the backplane like a CPU):
   - *BIOS trace*: the BIOS boots in Machine and takes commands from the keyboard and the UART (the E0/F0
     prefixes of an arrow key, back-to-back UART bytes), with the timer running at 100 Hz. Every I/O access
     (`onAccess`) is applied to the gate-level board in the same TCLK cycle; the UART and PS/2 serial
     waveforms are generated from Machine's "byte ready" times (and are checked to follow the CTS# and
     inhibit rules). The IRQ line is compared on every I/O read and at the start of every instruction.
   - *Random accesses*: random byte / word reads and writes to FF00–FF0F, small RELOAD
     values, long waits; on every read and on **every cycle** the IRQ line matches Machine.
   - *Timer*: the scenario from machine.test.ts, plus enabling at −2 … +1 cycles around a tick edge.
   - *Video port*: a test screen (all character codes and color bytes) is written with VDATA, and the
     VRAM lanes match Machine's VRAM; VDATA reads (prefetch), writes to only the low / only the high half of
     VADDR, wraparound at 13 bits, VSTAT (every cycle around the start of vblank and the end of the frame,
     W1C), and on **every cycle** VSYNC_REQ = Machine's `vsyncFlag`.
3. Waveforms: UART TX is decoded and its bit edges measured; RX at ±2% baud; PS/2 at three clock
   rates, READY and inhibit; the IRGB of every pixel of a full frame matches the font / color reference
   (the rule of the `src/cpu16/vga.ts` renderer, cursor included), and everything outside the visible area
   is black; every pixel position and the polarity of HSYNC and VSYNC; DAC voltages; cursor (on, off, lit
   and dark half).
4. Static timing: the whole motherboard (7 boards) is analyzed with the VID_OSC and H2 roots. The pixel
   clock fits 25.175 MHz with worst-case and typical values, the character clock fits 3.15 MHz with
   worst-case values, there is no gated clock on the pixel clock, and the only 74AC parts are the phase
   counter and the H2 / LD7 register.
5. Schematic: ERC (no conflicting outputs and no undriven inputs, also with the three boards together) and
   a KiCad schematic per board; if kicad-cli is installed, the schematic is written to a temporary
   directory and its netlist is compared with the board's nets (skipped if it is not installed).

On the video bench the pixel clock is driven so that a frame = 420,000 pixels = 66,667 CPU cycles, and its
phase is aligned with Machine's vblank times rounded to whole numbers (`VBLANK_START` = 60,953, frame
start 66,667k). On a real board the two oscillators are independent (25.175 MHz / 800 / 525 =
59.94 Hz; Machine 60.00 Hz). At power-up the phase counter is at p7 (0), so the board's hc is one less
than the position the bench counts: on the bench, visible pixel x is at hc = x + 17.

## Differences from Machine and from anakart.md

No Machine constants had to change: the UART byte time (347), the tick (4000) and the frame (66,667) come
out exactly the same on the board side.

- The UART baud clock comes from TCLK (35/34-cycle bits) instead of a separate 1.8432 MHz oscillator +
  74HC4040, and the receiver takes one sample per bit instead of 16×. The 6-pin header of the CH340 module
  has only CTS#, so there is no flow control for TX (Machine has none either).
- The prescaler is on the I/O board rather than the clock board, and reset zeroes its phase. In Machine the
  ticks have fallen on 4000k since power-up and do not shift on reset (the two agree only after the
  power-on reset).
- Not cleared on reset: TIMER_RELOAD, CURSOR_X/Y (74HC574), UART_DATA and KBD_DATA
  (the 74HC595 output registers), VRAM. Machine zeroes them; the BIOS writes all of them before using them.
  In the tests the flip-flops are zeroed at power-up (as in GateComputer).
- FF00/FF02 word read: the board reads both bytes in one cycle, so UART_STAT / KBD_STAT is the value from
  before the read's side effect; Machine does two `read8` calls and returns the value from after it.
  The BIOS reads these pairs byte by byte.
- KBD_DATA changes on the 10th clock edge, one bit time before READY; a read while READY is not set may
  see the new byte early (Machine returns the old one). A read that waits for READY gives the same result.
- Video: VRAM is 62256 ×2 instead of a 6264 (as the task definition requires; 4 KB of it is used), the
  character ROM is a 28C256, and the pixel shifter is a 74HC166 instead of a 74HC165 (synchronous load with
  the pixel clock, see above). The image is shifted 16 pixels relative to the counter (two-stage pipeline);
  VGA timing is standard relative to the visible area. VSTAT bit0 is vblank synchronized to the character
  clock (at p0). VRAM writes and prefetches take a few cycles instead of being instantaneous as in Machine;
  port accesses more often than every 6 cycles (which the CPU cannot do) could outrun the prefetch.
- Address decoding: instead of the central 74HC688 + 74HC138 in anakart.md, the memory board generates
  ~IO and each board decodes its own group (I/O FF0x, video FF2x) with its own 74HC138.
- The chip counts are higher than the estimates in anakart.md (I/O 65, video 73): the estimate did not
  count the glue logic and readback buffers.

## DIY memory board (`kyb`)

A teaching board ([Experiment 14](../kit/deney-14-kendin-yap-bellek.md)): 16 bytes of RAM at `FF40–FF4F`,
one 74HC574 per byte. It lays out in the open what is inside a 62256: the cells, the address decoder, and
the data line shared through three-state outputs. Behavioral model: `Machine.kyb` (`emu/machine.ts`).

| Block | Chips |
|---|---|
| Address decoding | 74HC138 ×4: group FF4x (~IO, A7..A4 = 4 → ~K_G); for word k = A3..A1, decoders for even byte write (~MWE_E), odd byte write (~MWE_O) and read (~MRD) |
| Bus buffer | 74HC245 ×2: DE ↔ KE, DO ↔ KO; ~OE = ~K_G, DIR = ~MRD (board → bus on reads) |
| Memory cells | 74HC574 ×16: even bytes on the KE lane, odd bytes on the KO lane; CP = the write decoder's output (loads at the end of the strobe), ~OE = the read decoder's output; D and Q on the same lane |
| **Total** | **22 chips** + backplane connector, 100 µF, 100 nF ×22 |

- Write: the selected word's ~K_WEk / ~K_WOk line is low for the duration of the CPU's write strobe; when
  the strobe ends it rises and the 574 takes the data (the data is stable on the bus at that moment). A word
  write writes both lanes together, a byte write only the lane of its address.
- Read: while ~MRD is low the selected word's two 574s drive the internal lanes and the 245s pass them to
  the bus. Reads have no side effect; on a byte read the CPU picks the byte by A0.
- Why a buffer: if the 574s' D and Q pins were wired straight to DE/DO, each data line would get 16 more
  pins (≈ 80 pF). Static timing (5 pF per pin) sees this on the CPU's read path: the CLK worst case goes
  from 951 to 972 ns without buffers, and is 956 ns with two 74HC245s.
- Reset does not clear the contents (the 74HC574 has no reset pin); at power-up the contents are random.
  Machine also keeps `kyb` on reset.
- Verification (`tests/anakart-gc.test.ts`, "kendin yap bellek kartı"): ERC, part count, and a check that it
  never drives the bus outside FF4x; together with the I/O board, byte / word, read / write and 300 random
  accesses, with every read matching Machine.
