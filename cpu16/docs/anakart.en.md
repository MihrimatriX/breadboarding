# The CPU16 motherboard (phase 6)

> The boards around the CPU16 core: memory and bank registers (a simple MMU), cache,
> EEPROM, VGA text board, PS/2 keyboard, UART, timer and interrupt controller, plus a DIY memory
> board for teaching. All boards are built from common 7400-series logic and only two memory chips
> (62256 SRAM, 28C256 EEPROM).
> Simulation: `emu/machine.ts` (+ `emu/devices/*.ts`, `video/font.ts`). Tests: `tests/machine.test.ts`.
> BIOS and bootloader: [bios.en.md](bios.en.md). Instruction set and cycle counts: [spec.en.md](spec.en.md), [mikromimari.en.md](mikromimari.en.md).

The model runs at instruction level but **counts time in CPU cycles**: each instruction lasts its cycle
count from the microarchitecture table plus any memory wait states, and the timer, vertical scan, UART
and keyboard advance with this counter. That makes "how fast does the program run with the cache on?"
something you can measure in the simulation (experiment 10).

## Block diagram

```
              4 MHz                                          25.175 MHz
          ┌──────────┐                                     ┌────────────────────────────┐
          │ CPU16    │ A15..A0                             │ VIDEO BOARD                │
          │ core     ├──────┬──────────────┐               │ VRAM 8 KB (char + color)   │
          │ (phase 2)│      │A15:A14       │A15..A8 = FF?  │ character ROM 4 KB         │
          └────┬─────┘      ▼              ▼               │ 640×480@60 80×30 16 colors │
               │ D15..D0 ┌────────┐   ┌──────────┐ I/O     └──────────────┬─────────────┘
               │         │ BANK   │   │ address  ├─────────┬──────┬──────┬┴──────┬───────┐
               │         │ 4×6 bit│   │ decoder  │         │      │      │       │       │
               │         └───┬────┘   └──────────┘         UART   PS/2   timer   IRQ     cache
               │             │ PA19..PA14                  CH340  kbd            (gates) counters
               │             ▼                             │      │      │       │
          ┌────┴──────────────────────────┐                └──────┴──────┴───────┘
          │ CACHE BOARD (L1, 2 KB)        │                      IRQ ─▶ CPU
          │ 16-bit data SRAM + tag SRAM   │
          │ 74HC688 comparator            │
          │ hit: 0 wait states            │
          │ miss / write: 2 wait states   │
          └────┬──────────────────────────┘
               │ MAIN MEMORY BUS (20-bit address, 8-bit data, with wait states)
       ┌───────┴───────────┬─────────────────────────┐
  ┌────┴─────────┐   ┌─────┴──────────┐        empty space: 0xFF via resistors
  │ EEPROM 32 KB │   │ RAM 128 KB     │
  │ 28C256       │   │ 62256 ×4       │
  │ 0x00000–     │   │ 0x80000–       │
  │   0x07FFF    │   │   0x9FFFF      │
  └──────────────┘   └────────────────┘
```

An optional teaching board sits at `FF40–FF4F` in the I/O space: the **DIY memory** (16 bytes,
one 74HC574 per byte; [Experiment 14](../kit/deney-14-kendin-yap-bellek.md)). The computer does not
need it to run.

The system bus on the CPU side is 16 bits wide (a word access takes one cycle, as in the
microarchitecture). On the main memory board the EEPROM and RAM chips are 8 bits wide: a word is read in
two byte cycles and assembled in a 74HC574. This is why main memory is slow (has wait states) and why the
cache actually helps: the cache is 16 bits wide and never makes the CPU wait on a hit.

## Memory and bank registers (a simple MMU)

The CPU sees 64 KB as four 16 KB windows. Each window's 6-bit bank register maps the window to one
16 KB bank in the 1 MB physical space:

```
physical address (20 bits) = BANKn (6 bits) · 0x4000 + (CPU address & 0x3FFF)      n = CPU address >> 14
```

| Physical | Bank | Contents |
|---|---|---|
| `0x00000–0x07FFF` | 0–1 | EEPROM 28C256 (32 KB). Bank 0 = BIOS, bank 1 = programs (`F` command) |
| `0x08000–0x7FFFF` | 2–31 | empty: reads return `0xFF` (resistors pull the bus to 1), writes have no effect |
| `0x80000–0x9FFFF` | 32–39 | RAM, 4 × 62256 (128 KB; each chip holds two banks: 32–33, 34–35, 36–37, 38–39) |
| `0xA0000–0xFFFFF` | 40–63 | empty |

Chip select is a single 74HC138: its inputs are `PA19`, `PA16`, `PA15`, and it is enabled when
`PA17 = PA18 = 0` and `~IO = 1`. `~Y0` selects the EEPROM (`PA19..PA15 = 00000`) and `~Y4..~Y7` select
RAM 0..3 (`100xx`); the other outputs are unused.

| CPU address | Window | Reset value | BIOS use |
|---|---|---|---|
| `0x0000–0x3FFF` | 0 | bank 0 (EEPROM, BIOS) | BIOS; never changed |
| `0x4000–0x7FFF` | 1 | bank 32 (RAM) | user program (can be changed with `B 1 n`) |
| `0x8000–0xBFFF` | 2 | bank 33 (RAM) | user program (can be changed with `B 2 n`) |
| `0xC000–0xFEFF` | 3 | bank 34 (RAM) | user + BIOS variables and stack (`0xF800–0xFEFF`) |
| `0xFF00–0xFFFF` | - | - | **always I/O**, independent of the bank registers |

Reset sets the bank registers to 0, 32, 33, 34, so the vectors (`0x0000` reset, `0x0002` IRQ,
`0x0004` SWI) are always read from the BIOS. The bank registers can be read back (`FF10–FF13`, upper
2 bits 0). The last 256 bytes of window 3 are I/O, so the CPU cannot see offset `0x3F00–0x3FFF` of
bank 34 through that window (it is visible through another window).

## I/O map (`0xFF00–0xFFFF`)

All registers are 8 bits. 16-bit registers are little-endian pairs, and a word instruction
(`LW`/`SW`) accesses them in one go. The I/O boards add no wait states. Addresses not in the list
and **write-only** registers read as `0xFF`. R = readable, W = writable,
W1C = cleared by writing 1.

| Address | Name | Access | Bits / meaning |
|---|---|---|---|
| `FF00` | UART_DATA | R / W | read: received byte (clears RX_READY) · write: send |
| `FF01` | UART_STAT | R | bit0 RX_READY, bit1 TX_EMPTY |
| `FF02` | KBD_DATA | R | PS/2 scan code byte (reading clears READY) |
| `FF03` | KBD_STAT | R | bit0 READY |
| `FF04–FF05` | TIMER_RELOAD | R / W | 16-bit reload value (number of 1 kHz ticks) |
| `FF06` | TIMER_CTRL | R / W | bit0 EN, bit1 IRQ_EN. When EN goes 0→1 the counter loads RELOAD |
| `FF07` | TIMER_STAT | R / W1C | bit0 EXPIRED |
| `FF08` | IRQ_PEND | R | pending sources: bit0 timer, bit1 keyboard, bit2 UART RX, bit3 vsync |
| `FF09` | IRQ_MASK | R / W | same bits; 1 = interrupt enabled. Reset: 0 |
| `FF0A` | IRQ_SRC | R | number (3..0) of the highest-priority pending source whose mask is open, or `0xFF` if none |
| `FF10–FF13` | BANK0–BANK3 | R / W | bank of window 0–3 (6 bits) |
| `FF20–FF21` | VADDR | W | VRAM address (13 bits) |
| `FF22` | VDATA | R / W | VRAM data; VADDR increments by one on every access |
| `FF23` | VCTRL | R / W | bit0 cursor visible |
| `FF24` | CURSOR_X | R / W | cursor column (0–79) |
| `FF25` | CURSOR_Y | R / W | cursor row (0–29) |
| `FF26` | VSTAT | R / W1C | bit0 in vertical blank (vblank), bit1 VSYNC flag (set once per frame; cleared by writing 1) |
| `FF30–FF31` | CACHE_HITS | R / W | cache hit counter (16 bits, wraps). Any write to `FF30` clears both counters |
| `FF32–FF33` | CACHE_MISSES | R | miss counter (16 bits, wraps) |
| `FF34` | CACHE_CTRL | R / W | bit0 cache enabled. Reset: 1 |
| `FF40–FF4F` | KYB | R / W | DIY memory board: 16 bytes of RAM (reads `0xFF` if the board is not fitted). Reset does not clear it |

The constants live in the code: the `IO` object (`emu/machine.ts`), and in the BIOS, offsets from the
base `IOB = 0xFF20` (the `LBU`/`SB` offset range is −32..+31, so one base register covers the whole map).

## Interrupt controller

Four sources, level-triggered; a request stays pending as long as its source holds it:

| No | Source | Request | How to acknowledge |
|---|---|---|---|
| 3 (highest) | vsync | VSTAT bit1 | write 2 to `VSTAT` (W1C) |
| 2 | UART RX | RX_READY | read `UART_DATA` |
| 1 | keyboard | KBD READY | read `KBD_DATA` |
| 0 (lowest) | timer | EXPIRED and IRQ_EN | write 1 to `TIMER_STAT` |

If `IRQ_PEND & IRQ_MASK` is nonzero, the CPU's IRQ line goes high. A four-input priority encoder built
from gates (`SRC1 = P3 ∨ P2`, `SRC0 = P3 ∨ (P1 ∧ ¬P2)`, `IRQ = P0 ∨ P1 ∨ P2 ∨ P3`) puts the
highest-numbered request into `IRQ_SRC`; with no request the read buffer stays off and the resistors make
it read `0xFF`. The handler loops until `IRQ_SRC` is `0xFF`. The CPU takes an interrupt only while I = 1;
entry takes 8 cycles (PC and flags to the stack, I = 0, vector `0x0002`), and `RETI` undoes it.

## Timer

A **1 kHz tick** (1 ms), made by dividing 4 MHz by 4000 with 74HC161 ×3, decrements a 16-bit counter. The
counter is four synchronous 74HC161s holding the inverse of the remaining tick count: counting down is
counting the inverse up (`c − 1 = ¬(¬c + 1)`), and RELOAD is loaded into the counters through inverters. When the counter reaches 0 it reloads from RELOAD and sets EXPIRED; if IRQ_EN
is set, it requests an interrupt. Period = RELOAD ms (RELOAD = 0 → 65,536 ms). The BIOS loads 10: 100 Hz
(the `TICKS` counter, see bios.md).
The tick is TCLK / 4000 (TCLK = the CPU clock, which keeps counting during wait cycles): 1 kHz at 4 MHz,
250 Hz on the first 1 MHz board. The BIOS's 100 Hz slows down by the same ratio; programs that need real
time must pick RELOAD for the CPU speed.

## Cache board

| Property | Value |
|---|---|
| Size | 2 KB of data, line = 1 word (2 bytes) → 1024 lines |
| Mapping | direct-mapped |
| Address fields | physical `[19:11]` tag (9 bits) · `[10:1]` line index · `[0]` byte select |
| Writes | write-through, no-write-allocate |
| Hit | 0 wait states |
| Miss | a word is read from main memory and fills the line: **2 wait states** |
| Cache disabled | every read goes to main memory: 2 wait states |
| Every write | goes to main memory (write-through): 2 wait states |

- Write snooping: the tag comparator always runs during a write (even with the cache disabled). On a
  write to RAM a hitting line is updated. On a write to the EEPROM or to an empty region (physical
  A19 = 0) the line is **invalidated**, because a write to the EEPROM does not change its contents right
  away (it may be a command byte, or a page write that completes in the write cycle).
- Reset: during reset the board writes "invalid" to every line of the tag SRAM using a 1024-step counter
  (74HC161 ×3); the cache starts enabled and the counters start at zero.
- Flushing in software: there is no separate "flush" command. With the cache on, reading a contiguous
  2 KB region of RAM replaces every line with a fresh line from RAM (stale copies of the EEPROM disappear).
  The BIOS does this with `0xC000–0xC7FF` after writing to the EEPROM.
- Counters: hits and misses are 16 bits each (each a 74HC161 ×4 synchronous counter, read through 74HC541
  ×2 buffers), and every *word* access, instruction fetches included, counts once (the CPU's two bytes are
  the same bus cycle). Nothing is counted while the cache is disabled. The simulator UI also shows totals
  that do not wrap.
- I/O (`FF00–FFFF`) is never cached.
- Gate-level implementation (wait generator, byte sequencer, timing diagram):
  [anakart-kartlari.en.md](anakart-kartlari.en.md).

### Wait states and cycle counting

An instruction's duration = its cycles from the microarchitecture table + the wait states of its main
memory accesses:

| Instruction | Cycles | | Instruction | Cycles |
|---|---|---|---|---|
| ADD … XOR, CMP | 5 | | Bcc (taken / not taken) | 5 / 3 |
| MOV NOT NEG SHL … ROR | 4 | | JAL / CALL | 5 |
| ADDI, CMPI, LI/LUI | 5 | | JALR / RET | 6 |
| LW SW LBU SB | 6 | | PUSH, POP | 6 |
| SXB | 4 | | NOP HALT EI DI, illegal | 3 |
| RETI | 8 | | SWI | 10 |
| IRQ entry | +8 | | | |

Accesses: the instruction fetch (1 word read), the read(s) of `LW`/`LBU`/`POP`/`RETI`, the write(s) of
`SW`/`SB`/`PUSH`/IRQ entry. Example (the inner loop of `bios/ornekler/onbellek.s`):

```
inner:  LW   r3, [r0]       6   + fetch + read
        ADDI r3, r3, 1      5   + fetch
        SW   r3, [r0]       6   + fetch + write (always +2)
        ADDI r1, r1, -1     5   + fetch
        BNE  inner          5   + fetch
```

With the cache on (all hits) that is 27 + 2 = **29 cycles per iteration**; with it off, 27 + 7·2 =
**41 cycles per iteration** (41% slower). In the simulation, 10,000 iterations take 8 ticks (of 10 ms)
with the cache on and 11 with it off, with ≈ 60,400 hits.

## Video board

| Property | Value |
|---|---|
| Resolution | 640×480 @ 60 Hz (25.175 MHz pixel clock from the board's own oscillator) |
| Text | 80 columns × 30 rows, 8×16-pixel cells |
| VRAM | 8 KB; the cell is at (row·80 + column)·2: even address character code, odd address color |
| Color byte | low 4 bits foreground color, high 4 bits background color (no blinking) |
| Palette | 16 CGA colors (IRGB; color 6 is brown) |
| Cursor | scan lines 14–15 of the `CURSOR_X/Y` cell in the foreground color; toggles every 16 frames |
| Character ROM | 4 KB: address = code·16 + scan line, bit 7 = leftmost pixel |
| VSYNC | `VSTAT` bit1 is set at the start of vertical blank → IRQ 3 |

**Timing.** Horizontally a line is 800 pixels (640 visible + 16 front porch + 96 sync + 48 back
porch) = 31.78 µs; vertically 525 lines (480 + 10 + 2 + 33) = 16.68 ms. The character clock is
25.175 / 8 = 3.15 MHz (74HC161 ×3 horizontal character counter 0–99; 74HC161 ×3 line counter 0–524).
Scan line = the low 4 bits of the line counter, text row = the upper bits.

In the model the frame is counted with the 4 MHz CPU clock: frame = 66,667 cycles (60.00 Hz; the real
board runs at 59.94 Hz, a 0.1% difference), the visible region is the first 60,952 cycles, and vertical
blank is 5,715 cycles (45 lines ≈ 1.43 ms). On the real board the video clock is independent of the CPU;
software must not assume a phase and should use `VSTAT` or the vsync interrupt.

**VRAM access (port based).** The CPU does not see VRAM directly: it writes an address to `VADDR` and
reads/writes `VDATA`, and the address increments by itself on every access (VADDR is a 74HC161 ×4
counter; a write to `FF20`/`FF21` sets the load flag for that half, and the counters load the byte at the
end of the write strobe).
VRAM is two 8-bit SRAMs (character / color lane, selected by address bit 0): the scan side reads both
together in one character time (318 ns). A slice of every character time is reserved for the CPU: a write
waits in a latch (74HC574) and goes into VRAM during that slice; for reads, the board fetches the byte into
the read latch in advance whenever `VADDR` changes. There is at least one instruction (≥ 1 µs) between two
CPU accesses, so the CPU never waits and no "snow" appears on screen. In the model, VRAM access is
instantaneous.

**Pixel path.** VRAM character + color → latch → character ROM (28C256, address = code·16 + scan
line) → font latch (74HC574, so the ROM gets a full character time) → 74HC166 shift
register (8 pixels) → 74HC157 (foreground color nibble if the bit is 1, background
nibble if it is 0) → IRGB → resistor DAC → VGA R/G/B. Brown gets a small correction as on CGA (green at
half level when I = 0, R = G = 1, B = 0). Cursor: two 74HC688s compare the column/line
counters with `CURSOR_X/Y`; on a match, scan lines 14–15 are forced to the foreground
color; the blinking comes from bit 4 of a 74HC393 frame counter.

### Character ROM and font

- Source: **X11 Misc-Fixed 8x13** (`8x13.bdf`, ISO10646-1), from Markus Kuhn's *ucs-fonts* package.
  License: *"Public domain font. Share and enjoy."* (public domain). Download:
  <https://www.cl.cam.ac.uk/~mgk25/ucs-fonts.html> or the xorg `font-misc-misc` package.
- Generator: `video/bdf2font.ts` (`node --experimental-strip-types cpu16/video/bdf2font.ts 8x13.bdf > cpu16/video/font.ts`).
  The 13-line glyphs start at line 1 of the 16-line cell. The generator draws the box-drawing (─ │ ╔ ═ …)
  and block (█ ▀ ▄ ░ ▒ ▓ ■) characters so that they fill the cell completely (so adjacent frames join
  without gaps).
- Code page: `0x20–0x7E` ASCII, `0x80–0xFF` **CP857** (Turkish DOS: Ç ü ğ ı İ ö ş …, box-drawing
  and block characters), `0x01–0x1F` and `0x7F` CP437 symbols (☺ ♥ ♪ ► ↑ … ⌂).
- ROM image: `npm run cpu16 -- charrom -o charrom.hex` (4096 bytes). It goes into the first 4 KB of a
  28C256 (A12..A14 tied to GND).

## PS/2 keyboard

A PS/2 serial frame is 11 bits (start, 8 data bits LSB first, odd parity, stop); the keyboard clock is
10–16.7 kHz. The board shifts the data into a 74HC595 on the falling edge of the clock while a 74HC161
counts the bits; on the 11th bit `READY` (74HC74) is set. While `READY` is 1 the board pulls the clock
line low with an open-collector output (74HC05) (PS/2 "inhibit"): the keyboard holds the next byte in its
own buffer, so no byte is lost. Reading `KBD_DATA` clears `READY` and the counter and releases the clock
line.

The codes are **set 2**: a make code (e.g. A = `1C`), an `F0` prefix on release (`F0 1C`), and an `E0`
prefix for extended keys (right Ctrl `E0 14`, arrows `E0 75` …). In the model a byte takes 3520 cycles
(≈ 0.88 ms, 12.5 kHz). The scan code → ASCII translation is in the BIOS (US layout, see bios.md); the
Web IDE and the CLI generate set 2 codes from the browser's `KeyboardEvent.code` names
(`emu/devices/keyboard.ts`).

## UART

115200 baud 8N1 (a byte is 10 bits = 86.8 µs = **347 CPU cycles**). The rate depends on the CPU clock:
the gate-level I/O board divides the bit time from TCLK, so on the first 1 MHz board it becomes
**28,800 baud** (see [uretim.en.md](uretim.en.md)). The oscillator-based design below is the initial
estimate. On the PC side there is a CH340 USB-UART bridge. A 1.8432 MHz oscillator + 74HC4040 baud clock
(16×), a 74HC165 transmitter with a 74HC161 bit counter, and a 74HC595 receiver with 74HC161 ×2 (16×
sampling and bit counter) + 74HC74. (A single TL16C550 could replace it if wanted, with select logic that
keeps the register map the same.)

- TX: a byte written to `UART_DATA` is sent; `TX_EMPTY` is 0 for one byte time. Software waits for
  `TX_EMPTY` and then writes (BIOS `uart_putc`).
- RX: the received byte sits in `UART_DATA` and `RX_READY` = 1. The receiver holds a single byte: it must
  be read within one byte time, before the next byte arrives.
- Flow control (RTS/CTS): while `RX_READY` is 1 the board's RTS# output is inactive. It connects to the
  CH340's CTS# input, so the bridge holds the next byte and nothing overflows. The model implements it
  this way: a byte arrives only when RX is empty and at least one byte time after the previous read. The
  bootloader protocol waits for a reply after every record, so it also works over a link without flow
  control (inside a record the BIOS spends ≈ 120 cycles per character, and a byte time is 347 cycles).

## EEPROM (28C256)

32 KB, 8 bits, 150 ns; the same pinout as the 62256. Reads work like normal memory. Writes need no
erase, and each byte takes its new value directly:

| Operation | How |
|---|---|
| Byte / page write | a `~WE` strobe loads the byte into the chip's page buffer. If the next byte for the same 64-byte page (same A14..A6) arrives within **150 µs** (tBLC), it is added; otherwise the chip starts its internal write cycle (tWC ≤ 10 ms). Bytes that were not loaded keep their old values |
| Status | while a write is in progress, a read returns status: D7 is the inverse of D7 of the last byte written (DATA polling), and D6 toggles on every read (toggle bit) |
| Enable protection / protected write (SDP) | `AA→5555`, `55→2AAA`, `A0→5555`, then the page's bytes. Protection stays on |
| Disable protection | `AA→5555`, `55→2AAA`, `80→5555`, `AA→5555`, `55→2AAA`, `20→5555` |

With protection on, writes that do not come with the sequence are ignored, so a stray write from a
running program cannot corrupt the BIOS. The programmer (experiment 3) and the BIOS `F` command write
every page protected; the chip ships unprotected from the factory and becomes protected on its first
write. While a write cycle is in progress, instructions cannot be fetched from the EEPROM: the BIOS copies
its write routines to RAM and runs them from there (see bios.md, "Writing to the EEPROM"). The ID cannot be
read in software (it needs 12 V on A9).

The model (`emu/devices/eeprom.ts`) counts time in CPU cycles (the cycle the instruction started in ×
250 ns): the byte load window, write cycle, DATA polling, toggle bit and SDP behave as in the datasheet.
The 28C256 on the gate-level memory board uses the same model with the same clock.

## Chip list (per block, estimated)

The table below is the estimate from the start of the design. All boards are now built at gate level
and are in KiCad; the exact counts are CPU 210, clock 10, memory 34, cache 46, I/O 65, video 73, DIY
memory 22 chips
(block → chip mapping and differences from the estimate: [anakart-kartlari.en.md](anakart-kartlari.en.md),
[anakart-gc-video.en.md](anakart-gc-video.en.md); current list: `npm run cpu16 -- board`). The biggest
difference is on the I/O side: the UART uses no separate oscillator and divides the bit time from TCLK,
and the timer's prescaler counts TCLK as well.

| Block | Chips | ≈ qty |
|---|---|---|
| Clock / reset | 4 MHz crystal oscillator, 74HC14 (reset Schmitt), 74HC161 ×3 (÷4000 → 1 kHz) | 5 |
| Address decoding | 74HC688 (`A15..A8 = FF` → I/O), 74HC138 ×2 (I/O groups `FF0x/FF1x/FF2x/FF3x`), 74HC00/08/32 | 5 |
| Bank registers | 74HC273 ×4 (with clear, one per window; reset value 0/32/33/34 via a 74HC86 XOR), 74HC153 ×3 (window mux, 6 bits), 74HC244 (readback) | 9 |
| Cache | 62256 ×2 (16-bit data), 62256 ×2 (9-bit tag + valid bit), 74HC688 ×2 (comparator), 74HC157 ×3 (tag address: CPU / clear counter), 74HC161 ×3 (clear counter), 74HC161 (wait state generator), 74HC161 ×8 + 74HC541 ×4 (counters and readback), 74HC74 ×2, 74HC08/32 | 28 |
| Main memory | 28C256, 62256 ×4, 74HC574 (even byte latch), 74HC245 ×2 (byte lane), 74HC74 + 74HC161 (byte sub-cycle sequencer), 74HC138, 10 kΩ network (empty space `0xFF`) | 12 |
| Video | 25.175 MHz oscillator, 74HC161 ×6 (horizontal/vertical counters), 74HC688 ×2 + 74HC74 ×2 (sync and blanking), 62256 ×2 (VRAM lanes), 74HC161 ×4 (VADDR) + 74HC161 ×3 (scan address) + 74HC574 ×2 (row start), 74HC157 ×4 (VRAM address mux), 74HC574 ×4 (CPU write/read latch, character/color path), character ROM (28C256), 74HC166, 74HC157, 74HC574 ×2 + 74HC688 ×2 (cursor), 74HC393, resistor DAC | 40 |
| Keyboard | 74HC595, 74HC161, 74HC74, 74HC05, 74HC14 | 5 |
| UART | 1.8432 MHz oscillator, 74HC4040, 74HC165, 74HC595, 74HC161 ×3, 74HC74, CH340 module | 9 |
| Timer | 74HC161 ×4 (inverse of the counter), 74HC04 ×3 (inverse of RELOAD), 74HC574 ×2 (RELOAD), 74HC688 ×2, 74HC74 | 12 |
| Interrupt | 74HC175 (IRQ_MASK, reset 0), 74HC08 / 74HC32 / 74HC04 gates (priority encoder), 74HC244 (IRQ_PEND / IRQ_SRC read) | 4 |
| DIY memory | 74HC138 ×4, 74HC245 ×2, 74HC574 ×16 | 22 |

## Differences between the model and the real board

- The EEPROM write cycle is exactly 10 ms in the model (the datasheet's worst case; the real chip is
  usually faster). Software polls DATA instead of waiting a fixed time.
- UART TX loses no bytes: a written byte goes straight to the host (`TX_EMPTY` still reads 0 for one
  byte time). On RX, RTS/CTS flow control is modeled.
- VRAM access is instantaneous (on the real board it is delayed by at most one character time because of
  the CPU slice; it does not make the CPU wait).
- The video frame is derived from the 4 MHz CPU clock (60.00 Hz, fixed phase); the real board has a
  separate oscillator.
- Byte writes (`SB`) also count 2 wait states (on the real board a single byte cycle could be shorter);
  I/O accesses have no wait states.
- `VSTAT` bit1 (the vsync flag, W1C) and write-only registers reading as `0xFF` are defined by this
  design.
- The gate-level clock, memory and cache boards match this model access for access and instruction for
  instruction (value, wait, bank, counter, tag, the EEPROM's internal state); the small remaining
  differences (real board timing margin) are in [anakart-kartlari.en.md](anakart-kartlari.en.md).

## Simulation API (summary)

```ts
import { Machine } from "./emu/machine.ts";
const m = new Machine();
m.loadFlash(biosImage);       // image into the EEPROM (as if written by the programmer, protected)
m.reset();
m.run(4_000_000);             // 1 second (cycles)
m.uartSend("D 4000\r");       // send bytes over USB-UART
m.keyDown("KeyA"); m.keyUp("KeyA"); m.typeText("G 4000\n");
m.renderText();               // the VGA screen as text
m.cache.totalHits; m.waitCycles; m.cycles;
```

Tests (`tests/machine.test.ts`): bank mapping and the 1 MB physical map, testing the 128 KB RAM with a CPU
program, 28C256 (byte and page write, tBLC, write cycle, DATA polling, toggle bit,
SDP, protected writes from the CPU), DIY memory, UART, PS/2 codes, timer, IRQ priority and mask, vsync, VRAM port,
cursor, font, cache counters and an **exact cycle count** (cache on/off).
