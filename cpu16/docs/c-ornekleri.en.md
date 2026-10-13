# C examples: programming CPU16 in C

A guided tour of C programs written for CPU16. The examples go from simple to more involved; each one
teaches a C topic and a CPU16 feature (16-bit int, software multiply / divide, memory-mapped I/O, VGA,
interrupts). The comment at the top of each file says what it shows, how to run it and what output to
expect; inline comments explain what happens on CPU16.

The compiler itself (supported C, ABI, linker): [cc16.en.md](cc16.en.md). BIOS calls and the monitor:
[bios.en.md](bios.en.md). I/O registers: [anakart.en.md](anakart.en.md#io-map-0xff000xffff).

## Two kinds of examples

| | BIOS examples | Flat memory examples |
|---|---|---|
| Location | `cpu16/bios/ornekler/*.c` | `cpu16/programs/c/*.c`, `cpu16/programs/merhaba.c` |
| Machine | motherboard + BIOS: VGA screen, PS/2 keyboard, UART, timer | reference emulator with 64 KB of flat RAM |
| Build target | `--hedef bios`: loaded into RAM at `0x4000`, `G 4000` from the monitor | default `rom`: from `0x0000`, with its own vectors |
| Where `printf` goes | to the VGA screen and the UART (BIOS `PUTC`) | to the UART (`0xFF00`) |
| In the app | CPU16 workbench → **Motherboard + BIOS** → the "C" group of the example list | only `merhaba.c`: CPU16 workbench → **Flat memory** |
| On the real board | loaded with Web Serial or the monitor's `L` command | written to the EEPROM |

## How to run them

**In the app:** CPU16 workbench → Motherboard + BIOS → pick a C program from the example list →
**Compile and load to RAM** (Ctrl+Enter). The app follows the flow of the real board: it resets the
machine, the BIOS boots, the program is loaded as Intel HEX through the UART bootloader and started with
`G 4000`. The source is editable; your changes are stored in the browser, and "Back to example" restores
the original. For programs that need the keyboard (hesap, hayat, yılan), click the screen first: the keys
then go out through the PS/2 keyboard. You can also click the UART terminal and type there: the BIOS reads both.

**On the command line** (at the repository root; all commands run from there):

```sh
npm run cpu16 -- cc cpu16/bios/ornekler/kalbur.c --hedef bios --run      # run on the motherboard model, then print the screen
printf '2+3*4\n\n' | npm run cpu16 -- cc cpu16/bios/ornekler/hesap.c --hedef bios --run   # input from a pipe
npm run cpu16 -- machine cpu16/bios/ornekler/hesap.c                     # interactive, real time (exit: Ctrl-])
npm run cpu16 -- cc cpu16/bios/ornekler/hayat.c --hedef bios -o hayat.hex   # Intel HEX for the real board
npm run cpu16 -- cc cpu16/bios/ornekler/sayilar.c --hedef bios -o sayilar.s # inspect the generated assembly
npm run cpu16 -- cc cpu16/programs/c/fib.c --run                         # flat memory example
```

- A BIOS example with `--run`: the BIOS boots, the program is placed in RAM and `G 4000` is sent; UART
  output streams to the terminal, and when the program returns to the monitor (at most `--max` cycles,
  default 50 million = 12.5 s) the final VGA screen is printed. If stdin is a pipe or a file, its
  contents go to the program over the UART like keyboard input; when you run it from a terminal you can
  pass `< /dev/null` so it does not wait.
- `machine dosya.c` compiles the program, loads it with the bootloader and runs it; the machine runs in
  real time at 4 MHz with the terminal connected to the UART. Batch mode: `--cycles N --screen`.
- Real board: send the `.hex` file with the Web IDE's "Send to board (Web Serial)" button, or from a serial
  terminal to the monitor's `L` command ([bios.en.md](bios.en.md#bootloader-protocol-uart-115200-8n1)).

## Suggested order

| # | Program | C topic | CPU16 side | Time (4 MHz) |
|---|---|---|---|---|
| 1 | [`yeni.c`](#yenic-and-selamc) | empty template: `printf`, loop, function | a single cell with `ekran_yaz` | instant |
| 2 | [`selam.c`](#yenic-and-selamc) | `printf`, recursion | colors, timing with the BIOS tick | 0.3 s |
| 3 | [`sayilar.c`](#sayilarc-numbers-and-bases) | printing decimal / hex / binary, overflow, `char` | 16-bit int, two's complement, no divide instruction | 0.25 s |
| 4 | [`uzun.c`](#uzunc-32-bits-and-the-cost-of-operations) | `long`, catching overflow, function pointer table | ADD + ADC, `__mul32` / `__div32`, cycle counting | 2 s |
| 5 | [`kalbur.c`](#kalburc-eratosthenes-with-a-bit-array) | bit array, bit operations, the 16-bit loop trap | `.bss`, LBU / SB, masks from a table | 2.6 s |
| 6 | [`siralama.c`](#siralamac-a-sorting-race) | algorithmic complexity, `qsort`, pointers | cost of array indexing, stack depth | 3.7 s |
| 7 | [`liste.c`](#listec-linked-list-and-malloc) | `struct`, `malloc` / `free`, pointer to pointer | 16-bit addresses, the malloc header, `offsetof` | 0.4 s |
| 8 | [`hesap.c`](#hesapc-calculator) | reading a line, recursive descent parser | keyboard interrupt → BIOS ring buffer | interactive |
| 9 | [`sabit.c`](#sabitc-fixed-point-numbers) | fractions without `float`: Q4.12 | 32-bit intermediate results, drawing to VRAM | 0.5 s |
| 10 | [`ekran.c`](#ekranc-writing-to-vga-directly) | `volatile`, UTF-8 decoding, `sprintf` | VADDR / VDATA ports, CP857, vsync | 5 s |
| 11 | [`kesme.c`](#kesmec-interrupts) | interrupt handler, critical section (`di` / `ei`) | IRQ path, BIOS hook, `HALT` | 1.8 s |
| 12 | [`hayat.c`](#hayatc-game-of-life) | choice of algorithm, power-of-two sizes | draw only what changed, wait with `halt()` | 10 s |
| 13 | [`yilan.c`](#yilanc) | game loop, ring buffer | keyboard, timer, VRAM | interactive |

Every program is 1.5–4 KB of code and loads over the UART (115,200 baud) in a second or two. The times
are for the simulator's 4 MHz; on the real board, which runs at 1 MHz, they are 4 times longer
([Experiment 13](../kit/deney-13-c.md#sonra-diğer-c-örnekleri)).

### yeni.c and selam.c

`yeni.c` is the starting template for your own program: a multiplication table with `printf` and a star in
the top-right corner of the screen with `ekran_yaz`. `selam.c` shows colors
(`bios_setattr(RENK(SARI, MAVI))`), the recursive `fib(18) = 2584` and the elapsed time from the BIOS's
10 ms tick counter (`bios_ticks`).

### sayilar.c: numbers and bases

Printing numbers without `printf`: decimal (`% 10` and `/ 10`), hexadecimal (shift by 4 bits and mask) and
binary (test the top bit, shift left by 1). The two readings of the same 16 bits as `int` and `unsigned`
side by side, then overflows:

```
 32767      32767  7FFF  0111 1111 1111 1111
-32768      32768  8000  1000 0000 0000 0000
  32767 + 1        = -32768
  1000 * 100       = -31072
  char 200 + 100   = 300        (işlemden önce int'e terfi)
  char'a yazinca   = 44
```

What you learn: CPU16 has no divide instruction, so `v / 10` is a call to `__udiv16` (a 16-iteration loop);
that is why printing hex is much cheaper than printing decimal. `-(-32768)` is still `-32768`: signed
printing takes the absolute value with unsigned arithmetic. The program does not link `printf`, so it is
1.5 KB (`printf` alone is ≈ 1.6 KB); it reads its code size from the linker's `__data_load` symbol.

Try: add your own numbers to the `ORNEKLER` array; call `yaz_hex` with 2 digits to print a byte.

### uzun.c: 32 bits and the cost of operations

Factorials in 16 and 32 bits side by side (`9!` overflows 16 bits, `13!` overflows 32 bits), the largest
Fibonacci term for each width (`fib(24) = 46368`, `fib(47) = 2971215073`) and two ways to catch overflow
in C (`a + b < a`, `f * n / n != f`). Then each operation is timed:

```
  a + b    16 bit              55 dongu    13 us
  a + b    32 bit              80 dongu    20 us
  a * 10   16 bit, sabit       55 dongu    13 us
  a * b    16 bit, b=10       185 dongu    46 us
  a * b    16 bit, b=30000    445 dongu   111 us
  a * b    32 bit, b=891      565 dongu   141 us
  a / b    16 bit             685 dongu   171 us
  a / b    32 bit            1885 dongu   471 us
```

(The values include reading and writing the `volatile` variables in memory.) The multiplication time
depends on the number of bits in the multiplier: `__mul16` stops when the multiplier reaches zero. The
compiler turns multiplication by a constant into shifts and adds (`a * 10` = `(a << 1) + (a << 3)`), even
with the constant on the left (`10 * a`). The measurement reads the BIOS tick counter at `0xF820`
directly: a variable that an interrupt changes, hence `volatile`.

Try: set `b16` to 1 or 0x7FFF; how does the multiplication time change? Make `a32` smaller than 65535:
32-bit division then takes the fast 16-bit path.

### kalbur.c: Eratosthenes with a bit array

All primes up to 65535 in a 4096-byte bit array (odd numbers only, one bit per number). One byte per
number would need 64 KB, the whole CPU16 address space. Result: `pi(65536) = 6542`, the largest 16-bit
prime `65521`, `860` twin prime pairs.

What you learn: bit number `k` → byte `k >> 3`, bit `k & 7`; the mask comes from the `BIT[]` table because
`1 << n` is an n-iteration loop on CPU16. Bits are counted with a 16-entry table, and twin primes are found
with `asal & (asal >> 1)` (8 numbers at once). And the 16-bit trap: for `unsigned m`, `m <= 65535` is
always true, so `for (m = p * p; m <= 65535; m += 2 * p)` never ends; the code checks the limit before adding.

Try: change `ISARETLE` to `bilesik[(k) >> 3] |= 1 << ((k) & 7)` and compare the time.

### siralama.c: a sorting race

The same 200 random numbers are sorted by bubble, selection, insertion and quick sort and by the library's
`qsort`; the comparison and move counts and the time go into a table:

```
algoritma  karsilastirma  tasima  sure (tik)  sirali
kabarcik          19900   21028         153  evet
secmeli           19900     388          80  evet
eklemeli          10708   10713          65  evet
hizli              1946     804          11  evet
qsort              1503       -          28  evet
```

The algorithms are called through a function pointer table. The recursion depth of the quicksort is
measured (the stack grows down from `0xF800` and overflow is not checked). The comparator uses
`x < y ? -1 : x > y` instead of `x - y`: in 16 bits `30000 - (-30000)` overflows. The program itself has
a 16-bit lesson too: `N * N` (40000) does not fit in an `int`, so it writes `(unsigned)N * (N - 1) / 2`.

Try: set `N` to 400 (bubble sort gets 4 times slower, quicksort ≈ 2 times), or feed it sorted data with
`asil[i] = i`: insertion sort drops to its best case (n − 1 comparisons).

### liste.c: linked list and malloc

The words of a text are inserted into an alphabetically sorted linked list (`51 kelime, 38 farkli`), then
the words that occur once are removed (`free`) and 7 words remain. The node is `struct kelime { struct kelime *sonraki;
unsigned adet; char yazi[]; }`: the flexible array member keeps the text in the same `malloc` block as the node.

What you learn: inserting and removing at the head, in the middle and at the tail in a single loop with a
pointer to pointer (`struct kelime **p`); `sizeof` and `offsetof` (`sonraki 0, adet 2, yazi 4`); the real
addresses of the nodes (`0xA0..`; on the BIOS target data and the heap start at `0xA000`). `malloc` hands
out the first block that fits: the lowest-addressed of the removed nodes is reused by the next `malloc`.

Try: change `METIN`; rewrite `yaz()` so it starts with the most frequent word.

### hesap.c: calculator

A calculator that reads lines from the keyboard (or the UART terminal): `+ - * / %`, parentheses, unary
minus, `0x1F` and `0b101` notation, a 32-bit result in decimal, hex and binary. It puts a `^` under the
position of an error.

```
ifade: 2+3*4
  = 14  (0x0000000E, ikilik 1110)
ifade: 1/0
        ^ hata: sifira bolme
```

What you learn: a recursive descent parser; each precedence level is a function (`ifade` → `terim`
→ `carpan`), and parentheses call `ifade` again. The path of a key: PS/2 keyboard → IRQ 1 → the BIOS
translates the scan code to ASCII → the 16-byte ring buffer at `0xF810` → `bios_getline`. An empty line or `q` quits.

Try: add a new precedence level (a new function) for `&`, `|` and `<<`.

### sabit.c: fixed-point numbers

cc16 has no `float`. Fractions use the Q4.12 format: 1.0 = 4096, pi = 12868. Multiplication is
`((long)a * b) >> 12` (32-bit intermediate result), division `((long)a << 12) / b`. Square root with
Newton's method (`kok(2) = 1.4141`), sine with a Taylor series (`sin 30: 0.5000`), and at the bottom of the
screen sine (`*`) and cosine (`o`) curves over `0..2pi`. The output line `pi * (1/3) = 1.0469 ama pi / 3 = 1.0471`
shows that multiplying by a rounded constant magnifies the error.

Try: change `GENLIK` and `ORTA`; remove the last term (`x2 / 72`) from `sin_cekirdek` and watch how the
curve breaks down at the edges.

### ekran.c: writing to VGA directly

The screen without the BIOS: the video board's VADDR (`0xFF20`) and VDATA (`0xFF22`) ports. A blue
patterned background, shadowed double-line windows, 16 colors, Turkish letters (the source is UTF-8, the
screen CP857: a small UTF-8 decoder) and a bouncing "CPU16" text synchronized with the vertical retrace
(VSTAT, `0xFF26`). It ends after 5 seconds or on a key press; the picture stays on the screen.

What you learn: the VRAM layout (cell `(y·80 + x)·2`, character at the even address, color at the odd
address), VDATA incrementing the address by itself on every access (reads included: the shadow changes
only the color byte), why `volatile` is required, and how waiting for vsync makes the animation
independent of CPU speed.

Try: remove the `vsync_bekle()` call: how much faster does the text move? Change the `0xB0` in `ZEMIN` to
`0xB1` or `0xB2`.

### kesme.c: interrupts

While the main program computes 100 digits of e (`e = 2.71828182845904523536...`), a C function hooked to
the vertical retrace interrupt cuts in 60 times a second and draws a spinning bar and a filling progress
line at the top right. At the end the hook has run ≈ 97 times and the BIOS timer ≈ 160 times: a ratio of
0.60 (60 Hz / 100 Hz).

What you learn: the path of an interrupt from the hardware to C (VSTAT → IRQ_PEND / IRQ_MASK → CPU, vector
`0x0002` → BIOS → the hook installed with `bios_setirqhook`); the hook acknowledging its source (a
level-triggered line); shared `volatile` variables; reading a 32-bit variable between `di()` / `ei()`; not
using a piece of shared hardware such as VADDR from two places at once; removing the hook before the program
ends; sleeping until the next interrupt with `halt()`.

Try: remove the `VSTAT = 2;` line from the hook. The interrupt is never acknowledged, so the handler calls
the hook over and over and the main program never runs again (recover with "Reset" in the app).

### hayat.c: Game of Life

Conway's Game of Life over the whole screen (80 × 27): Gosper's glider gun, the R-pentomino and three
oscillators; the color is the cell's age. 10 generations per second; it ends after 100 generations. R
builds a random world, Q quits.

What you learn: choosing an algorithm at 4 MHz. Counting the 8 neighbors of every cell in every generation
takes 0.3 s per generation on this machine; here each cell byte carries its own neighbor count, and the
counts are updated only when a cell is born or dies (an empty cell is skipped with a single comparison).
The row length is 128: the index `y * 128 + x` is a shift, while with 82 it would be a `__mul16` every
time. Only the cells that changed are written to the screen; the status line uses `sprintf` + VRAM instead
of `printf` (so it does not go to the UART). `halt()` between generations.

Try: switch the rule to HighLife (a dead cell is born with 3 or 6 neighbors: `v == 3 || v == 6`).

### yilan.c

The completion program of Phase 8: snake on the VGA screen, played with W A S D; time comes from the BIOS
ticks, keys from the keyboard buffer, and the screen is drawn with `ekran_yaz` / `ekran_oku`. Build and
play: [Experiment 13](../kit/deney-13-c.md).

## Flat memory examples (`cpu16/programs/c/`)

They run without the BIOS on the reference emulator with 64 KB of flat RAM (ROM target: code from `0x0000`,
`printf` straight to the UART, `HALT` when `main` returns). UART output goes to the terminal unchanged, so
Turkish letters (UTF-8) display correctly.

| Program | What it shows | How to run |
|---|---|---|
| `hello.c` | first program | `npm run cpu16 -- cc cpu16/programs/c/hello.c --run` |
| `fib.c` | recursive and iterative Fibonacci, the limit of 16 bits | `... cc cpu16/programs/c/fib.c --run` |
| `primes.c` | Eratosthenes with a byte array (up to 2000) | `... cc cpu16/programs/c/primes.c --run` |
| `sort.c` | `qsort`, function pointers, sorting strings | `... cc cpu16/programs/c/sort.c --run` |
| `structs.c` | `struct`, `union`, `enum`, a linked list with `malloc` | `... cc cpu16/programs/c/structs.c --run` |
| `long.c` | 32-bit factorial, Fibonacci, division, shifts | `... cc cpu16/programs/c/long.c --run` |
| `strings.c` | `string.h`, `ctype.h`, `sprintf`, `snprintf` | `... cc cpu16/programs/c/strings.c --run` |
| `switch.c` | jump table, fall-through, `goto`, Roman numerals | `... cc cpu16/programs/c/switch.c --run` |
| `multi/` | two translation units, `static`, `extern` | `... cc cpu16/programs/c/multi/main.c cpu16/programs/c/multi/util.c --run` |
| `../merhaba.c` | the C example of the flat memory workbench | in the app: CPU16 workbench → Flat memory; or `... cc cpu16/programs/merhaba.c --run` |

At the end, `--run` prints the exit code (`main`'s return value, `r0`) and the number of instructions executed.

## What to know when writing C for CPU16

### Memory map (BIOS target)

```
0x0000 ┌───────────────────────────┐ BIOS (EEPROM bank 0): vectors, jump table 0x0010–0x0097
0x4000 ├───────────────────────────┤ program code and constants (const, strings)  ← G 4000
0xA000 ├───────────────────────────┤ .data, .bss (cleared by crt0), malloc heap ↑
       │            ...            │
       │         stack ↓           │ SP starts at 0xF800
0xF800 ├───────────────────────────┤ BIOS variables (0xF820: 32-bit tick counter), BIOS stack
0xFF00 ├───────────────────────────┤ I/O registers
0xFFFF └───────────────────────────┘
```

Code and constants get at most 24 KB, data + stack 22 KB. These addresses are the 64 KB the CPU sees;
behind them the bank registers map 16 KB windows into a 1 MB physical space (at startup the BIOS maps RAM
banks 32–34). The ROM target has a different layout: code at `0x0000–0x3FFF`, data from `0x4000`, stack
from `0xFF00` ([cc16.en.md](cc16.en.md#memory-layout)).

### I/O addresses

C accesses them through a `volatile` pointer: `#define VSTAT (*(volatile unsigned char *)0xFF26)`.

| Address | Register | Example |
|---|---|---|
| `FF00` | UART data (read: received byte, write: transmit) | `cpu16.h`: `UART_DATA` |
| `FF01` | UART status: bit 0 byte received, bit 1 transmitter empty | |
| `FF02` / `FF03` | PS/2 scan code / status (read by the BIOS interrupt) | |
| `FF04–FF07` | timer: reload, control, status (the BIOS sets it to 100 Hz) | |
| `FF08` / `FF09` / `FF0A` | IRQ pending / mask / highest-priority source (0 timer, 1 keyboard, 2 UART, 3 vsync) | `kesme.c` |
| `FF10–FF13` | bank registers (windows 0–3) | |
| `FF20–FF21` | VADDR: VRAM address | `bios.h`: `VADDR`, `ekran.c` |
| `FF22` | VDATA: VRAM data, VADDR + 1 on every access | `bios.h`: `VDATA` |
| `FF23–FF25` | cursor on/off, cursor column / row | |
| `FF26` | VSTAT: bit 0 vertical blank, bit 1 vsync flag (cleared by writing 2) | `ekran.c`, `kesme.c` |
| `FF30–FF34` | cache hit / miss counters, cache on/off | `onbellek.s` |

Full table: [anakart.en.md](anakart.en.md#io-map-0xff000xffff).

### Types and overflow

- `int` and `short` are **16 bits** (−32768..32767), `unsigned` is 0..65535; `long` is 32 bits; pointers are 16 bits.
- `char` is 8 bits and **unsigned** (0..255); use `signed char` for a signed byte.
- Overflow raises no error; the result is truncated to 16 bits: `32767 + 1 == -32768`, `1000 * 100 == -31072`.
  For large intermediate results, cast one operand to `long`: `(long)a * b`.
- Constants: `32768` does not fit in `int`, so it is `long`, while `0xFFFF` is `unsigned`. `INT_MIN` is `(-32767 - 1)`.
- `char` and `short` are promoted to `int` before operations (`char c = 200; c + 100 == 300`).
- No `float` / `double`: use fixed point for fractions ([sabit.c](#sabitc-fixed-point-numbers)).

### Cost of operations

CPU16 has no multiply or divide instruction, and the shifter moves 1 bit at a time; addition, logic
operations and comparisons are single instructions. At 4 MHz an instruction takes 4–6 cycles (+ memory wait):

| Operation | How it is done | Approx. cycles |
|---|---|---|
| `a + b`, `a & b`, `a < b` (16-bit) | one instruction | 5 |
| `a + b` (32-bit) | ADD + ADC | 10 |
| `x << 3`, `x >> 3` (constant) | 3 × SHL / SHR | 15 |
| `x << n` (variable) | n-iteration loop | 15 · n |
| `a * 10` (constant) | shift and add (compiler) | 30 |
| `a * b` (16-bit) | `__mul16`: one iteration per multiplier bit | 130–400 |
| `a / b`, `a % b` (16-bit) | `__udiv16`: 16 iterations | ≈ 650 |
| `a * b` (32-bit) | `__mul32` | 500–1500 |
| `a / b`, `a % b` (32-bit) | `__udiv32`: 32 iterations (16-bit path if the high words are 0) | ≈ 1850 |

(`uzun.c` measures these for real.) In practice: choose power-of-two array sizes and row lengths
(`y * 128` is a shift); avoid `/` and `%` inside loops; dividing the same number with both `/` and `%` is
two divisions, so get the remainder with `x - q * b`; use a table instead of `1 << n`; constant
multipliers are cheap.

### Stack and recursion

The stack grows down (from `0xF800` on the BIOS target) and **overflow is not checked**: deep recursion or
large local arrays overwrite first the `malloc` heap, then the global data. Each call takes at least the
return address (2 bytes) + the saved registers + the local variables. Make large arrays `static` or global
(they go to `.bss`).

### Interrupts and volatile

- I/O registers and variables shared with an interrupt must be `volatile`.
- The BIOS leaves interrupts enabled (timer and keyboard). For UART RX and vsync you hook a C function with
  `bios_setirqhook`; the hook must be short, acknowledge its source and not call non-reentrant functions
  such as `printf`. Do a read-modify-write of `IRQ_MASK` between `di()` / `ei()`.
- `halt()` puts the CPU to sleep until the next interrupt (for wait loops).

### libc16 and BIOS calls

| Header | Contents |
|---|---|
| `<stdio.h>` | `putchar`, `puts`, `printf`, `sprintf`, `snprintf`, `vprintf` ... (no `%f`) |
| `<stdlib.h>` | `malloc`, `calloc`, `realloc`, `free`, `atoi`, `strtol`, `rand`, `srand`, `qsort`, `abs`, `exit` |
| `<string.h>` | `strlen`, `strcpy`, `strcmp`, `strchr`, `strstr`, `memcpy`, `memset`, `memcmp` ... |
| `<ctype.h>` | `isdigit`, `isalpha`, `isspace`, `toupper`, `tolower` ... |
| `<stdint.h>`, `<limits.h>`, `<stddef.h>`, `<stdbool.h>`, `<stdarg.h>`, `<assert.h>` | standard definitions |
| `<cpu16.h>` | `UART_DATA`, `ei()`, `di()`, `halt()` |
| `<bios.h>` (only with `--hedef bios`) | below |

`<bios.h>`: `bios_getc()` (waits for a key), `bios_trygetc()` (−1 if there is no key), `bios_getline(tampon, en_cok)`
(line input with echo), `bios_puts`, `bios_puthex4`, `bios_cls`, `bios_setcursor(x, y)`,
`bios_setattr(renk)`, `bios_ticks()` (10 ms ticks, 32 bits), `bios_setirqhook(kanca)`; colors
(`SIYAH` … `BEYAZ`, `RENK(yazi, zemin)`), `EKRAN_GEN` / `EKRAN_YUK` (80 / 30), `ekran_yaz(x, y, karakter,
renk)`, `ekran_oku(x, y)`, `VADDR`, `VDATA`.

Details: [cc16.en.md](cc16.en.md#runtime-library), [bios.en.md](bios.en.md#jump-table-bios-calls-for-programs).

### Screen and text

- `printf` writes to both VGA and UART through the BIOS `PUTC`; VGA wraps lines at 80 columns and, at the
  end of the screen, scrolls the whole screen up one line.
- The screen's code page is CP857: above ASCII it has box-drawing characters (`0xC9` ╔, `0xCD` ═, `0xDB` █)
  and Turkish letters (`0x87` ç, `0xA7` ğ, `0x8D` ı, `0x94` ö, `0x9F` ş, `0x81` ü, uppercase `0x80`
  `0xA6` `0x98` `0x99` `0x9E` `0x9A`). The source file is UTF-8, so Turkish letters typed into strings come
  out garbled on the screen; write ASCII, use escapes like `"\x87"`, or use the converter in `ekran.c`.
- A program that draws on the screen should put the cursor at the start of the bottom line before it ends
  (`bios_setcursor(0, 29)`): the monitor prints its `> ` prompt there and the screen does not scroll.

### Limits of cc16

No `float` / `double`, bit fields, variable-length arrays (VLA) or 64-bit `long long` (`long long` is
32 bits). The size of a `struct` is rounded up to an even number. The app's editor compiles a single file;
multiple `.c` files are linked on the command line. Full list:
[cc16.en.md](cc16.en.md#known-limitations).

### Debugging

- Look at the assembly generated with `-o program.s`: which line turned into which instructions, where
  `__mul16` / `__udiv16` are called. `--map` prints the symbol addresses.
- The app's side panel has the registers, an instruction trace and a memory view; once the program has
  returned to the monitor you can look at its data with `D A000`.
- You cannot put `__asm` in the code, but you can link an `SWI` function written in assembly: the BIOS
  prints `SWI @ adres` and returns to the monitor ([bios.en.md](bios.en.md#interrupts)).

## Tests

`cpu16/tests/c-ornekleri.test.ts` runs every BIOS example on the model the Web IDE uses (`Machine` + BIOS v1)
and checks its output: the UART text and the characters and colors in VRAM. Where possible the result is
computed independently in JavaScript: every number from the sieve, the comparison and move counts of the
sorting algorithms (with the same `rand`), the word count, every column of the sine curve, every cell of
the Game of Life. `hesap.c` is loaded with the real UART bootloader and gets typed input both over the UART
and from the PS/2 keyboard. The flat memory examples are tested in `cc.test.ts`, `selam.c` and `yilan.c` in `cc-bios.test.ts`.

```sh
npx vitest run cpu16/tests/c-ornekleri.test.ts
```
