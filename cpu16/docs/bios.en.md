# CPU16 BIOS v1 (Phase 7)

> The software in EEPROM bank 0: vectors, startup, a **jump table** for programs, the interrupt
> handler (timer + keyboard), a VGA text driver, UART, a **monitor** and an **Intel HEX bootloader**
> over the UART (to RAM, or to the EEPROM with protected page writes).
> Source: `bios/bios.s` (as16). Image: `bios/build.ts`. Upload client: `bios/uploader.ts`.
> Tests: `tests/bios.test.ts`. Hardware: [anakart.en.md](anakart.en.md).

## Building the ROM image

```sh
npm run cpu16 -- bios -o bios.bin       # 32 KB 28C256 image (BIOS in bank 0, bank 1 0xFF)
npm run cpu16 -- bios -o bios.hex       # only the BIOS bytes, Intel HEX (offset 0)
npm run cpu16 -- charrom -o charrom.bin # the video board's 4 KB character ROM
```

`bios.bin` or `bios.hex` is written with an EEPROM programmer (TL866/T48, or the experiment kit's
Arduino + 74HC595 programmer from Experiment 3) to the 28C256 on the motherboard (memory board U420). The
kit's programmer leaves the chip with software data protection (SDP) enabled. BIOS v1 is 4248 bytes (26%
of bank 0). For both formats the command line prints the jump table.

To try it in the simulator:

```sh
npm run cpu16 -- machine                          # the BIOS boots; UART connected to the terminal (exit: Ctrl-])
npm run cpu16 -- machine program.s                # the bootloader loads the program into RAM and runs it with G
npm run cpu16 -- machine program.s --flash        # writes it to the EEPROM (bank 1) with F (does not run it)
echo "D 4000" | npm run cpu16 -- machine program.s --cycles 3000000 --screen
                                                  # batch mode: stdin to the UART, run N cycles, print the VGA screen
```

In interactive mode the machine runs in real time (4 MHz), stdin goes to the UART and UART output is
written to stdout (bytes above 0x80 are decoded as CP857).

## Startup

1. Reset: bank registers 0/32/33/34, cache clean and enabled, `PC = 0x0000` → `B reset`.
2. `init`: stack at `0xFF00`, interrupts masked, bank registers rewritten, cache enabled, variables
   cleared, EEPROM write routines copied to RAM (`0xFA40`), screen cleared, cursor on, timer set to
   10 ms (100 Hz), mask = timer + keyboard.
3. Banner: white `CPU16 BIOS v1` on a blue background on the first line, followed by a hardware summary.
4. Monitor: `EI`, prompt `> `.

Startup takes ≈ 128,000 cycles (32 ms at 4 MHz), most of it clearing the screen.

## Memory layout

| CPU address | Use |
|---|---|
| `0x0000–0x0005` | vectors: `B reset`, `B irq`, `B swi` |
| `0x0006` | BIOS version (`0x0100` = 1.0) |
| `0x0008–0x000F` | signature `"CPU16 B1"` |
| `0x0010–0x0097` | jump table (below) |
| `0x0098–0x1097` | BIOS code and strings (window 0 = EEPROM bank 0) |
| `0x4000–0xF7FF` | **user RAM** (windows 1–3 = RAM banks 32–34); `L` loads only here |
| `0xC000–0xC7FF` | read when the cache is flushed (contents unchanged) |
| `0xF800–0xF83F` | BIOS variables (`0xF820`: 32-bit tick counter, low word first) |
| `0xF810–0xF81F` | keyboard ring buffer (16 bytes) |
| `0xF840–0xF89F` | command line buffer |
| `0xF8A0–0xF93F` | scroll line buffer |
| `0xF940–0xFA3F` | HEX record buffer |
| `0xFA40–…` | RAM copy of the EEPROM write routines |
| `…–0xFEFF` | stack (down from `0xFF00`) |
| `0xFF00–0xFFFF` | I/O |

## Jump table (BIOS calls for programs)

Each entry, at address `0x0010 + 8·n`, is an 8-byte far jump (`LI r3, rutin` +
`JALR r3, r3, 0`). The BIOS's internal addresses may change from version to version; **the table
addresses do not**. To call one:

```asm
BIOS_PUTS = 0x0030
        LI   r0, mesaj
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0          ; lr is lost across the call, so the caller must PUSH lr / POP lr
```

Tail call (when the last thing a subroutine does is call a BIOS routine): `LI r3, BIOS_X` +
`JALR r3, r3, 0` (lr does not change, so the routine returns straight to the caller).

**Calling convention**: arguments in `r0`, `r1`, `r2`; return value in `r0` (`TICKS`: `r0:r1`). `r3` is
clobbered by every call. `r1`, `r2`, `r4`, `r5` are preserved (except the ones that carry a return value),
`sp` is balanced, and `lr` passes through the table slot unchanged. This convention is compatible with the
cc16 ABI (r0–r3 caller-saved, r4–r5 callee-saved); calls from C use at most three arguments.

| Address | Name | Input | Output / note |
|---|---|---|---|
| `0x0010` | MONITOR | none | goes to the monitor (stack reset to `0xFF00`); never returns to the caller |
| `0x0018` | PUTC | r0 = character | to VGA and UART; `'\n'` goes to the UART as CR LF |
| `0x0020` | GETC | none | r0 = character (keyboard buffer or UART); waits until one arrives |
| `0x0028` | TRYGETC | none | r0 = character, or `0xFFFF` if there is none (does not wait) |
| `0x0030` | PUTS | r0 = zero-terminated string | prints it with PUTC |
| `0x0038` | PUTHEX4 | r0 | 4 hex digits |
| `0x0040` | PUTHEX2 | r0 (low byte) | 2 hex digits |
| `0x0048` | GETLINE | r0 = buffer, r1 = max characters | r0 = length; the buffer is zero-terminated. Echoes; Backspace / DEL delete; CR, LF or CR LF finish |
| `0x0050` | NEWLINE | none | prints `'\n'` |
| `0x0058` | CLS | none | clears the screen with the current color, cursor at (0,0) |
| `0x0060` | SETCURSOR | r0 = column, r1 = row | VGA write position and hardware cursor |
| `0x0068` | SETATTR | r0 = color byte | color of the following VGA characters (low 4 bits foreground, high 4 bits background) |
| `0x0070` | TICKS | none | r0:r1 = number of 10 ms ticks since startup (r1 is the high word) |
| `0x0078` | UART_PUTC | r0 | UART only (waits for TX_EMPTY, no translation) |
| `0x0080` | UART_GETC | none | r0 = UART byte (waits; does not look at the keyboard) |
| `0x0088` | VGA_PUTC | r0 | VGA only: CR carriage return, LF new line, BS back; wraps at the end of a line |
| `0x0090` | SETIRQHOOK | r0 = handler address (0: remove) | user interrupt hook, see below |

The VGA driver interprets the control characters (CR, LF, BS); every other byte (including `0x01–0x1F`
and `0x80–0xFF`) is drawn as a glyph from the character ROM, so CP857 Turkish letters and box-drawing
characters can be used directly (for example `╔` = `0xC9`). At the end of the screen the text scrolls up.

Examples: `bios/ornekler/merhaba.s` (colored text, a sum), `saat.s` (SETCURSOR, a frame,
TICKS, exit on a key), `renkler.s` (16×16 color table), `onbellek.s` (timing and counters with the
cache on and off). All of them are assembled for `0x4000` and return to the monitor with RET. Examples
written in C: `selam.c` (printf, colors, `fib`), `hesap.c` (a calculator that reads lines with `GETLINE`),
`kesme.c` (a C function hooked to the vsync interrupt with `SETIRQHOOK`), `yilan.c` (a snake game on the
VGA screen, played with the keyboard) and others; compile them with `npm run cpu16 -- cc --hedef bios dosya.c`.
Guided tour: [c-ornekleri.en.md](c-ornekleri.en.md); the compiler side:
[cc16.en.md](cc16.en.md#bios-target-c-on-the-motherboard---hedef-bios).

## Interrupts

The BIOS IRQ handler saves all registers and loops until `IRQ_SRC` is `0xFF`:

- **0 timer**: clears `EXPIRED` and increments the 32-bit tick counter (`TICKS`, 100 Hz).
- **1 keyboard**: reads and translates the scan code (below) and puts the character into the 16-byte ring
  buffer (if the buffer is full, the character is dropped).
- **2 UART RX, 3 vsync**: the BIOS does not use these itself (it reads the UART by polling). If the user
  installs a hook with `SETIRQHOOK` and enables the matching bit in `IRQ_MASK` (`0xFF09`), the hook is
  called with `r0 = source number`. The hook must acknowledge the source (read `UART_DATA` for the UART,
  write 2 to `VSTAT` for vsync) and return with `RET`; r0–r5 are free and interrupts are disabled
  (I = 0). Without a hook, the BIOS masks that source (so there is no interrupt storm).

**SWI**: breakpoint. When `SWI` executes, the BIOS prints `SWI @ adres` and returns to the monitor (the
stack is reset). To debug a program you can insert an `SWI` and look at memory with `D`.

## Keyboard

Set 2 scan codes are translated to the US layout: letters, digits, punctuation, Space, Enter (13),
Backspace (8), Tab (9), Esc (27), the numeric keypad (as if NumLock were on), keypad Enter and `/`,
Delete (127), the ISO `<`/`>` key. Shift (left/right), Caps Lock (letters) and Ctrl (Ctrl + letter → 1–26)
are tracked. Arrows, F keys and other extended keys are ignored. On a Turkish Q keyboard, keys arrive
according to their physical position (for example the `ı` key gives `i`).

`GETC`/`TRYGETC` check the keyboard buffer first, then the UART: the monitor and programs work with a
keyboard + screen as well as with a UART terminal alone. Output (PUTC) always goes to both.

## Monitor commands

Numbers are hex; lowercase works too; arguments are separated by spaces.

| Command | Meaning |
|---|---|
| `D [adres] [uzunluk]` | memory dump (hex + ASCII), default length `80`; `D` with no arguments continues where it left off. `4000` at startup |
| `W adres bayt ...` | writes the bytes to memory in order (`W 4000 A6 46 01`) |
| `G [adres]` | calls the address as a subroutine (`JALR lr`); the program returns to the monitor with `RET`. Without an address, the entry point of the last loaded program |
| `B` / `B pencere bank` | shows the bank registers / maps window 1 or 2 to a bank (`B 1 01` → window 1 = EEPROM bank 1). Windows 0 (BIOS) and 3 (stack) cannot be changed |
| `L` | load Intel HEX: UART → RAM (`0x4000–0xF7FF`) |
| `F` | load Intel HEX: UART → EEPROM (bank 1 only: `0x4000–0x7FFF`) |
| `I` | EEPROM info: `EEPROM 28C256, yazma korumasi: acik` (or `kapali`), that is, write protection on (or off). The 28C256 has no ID that software can read; protection is tested by rewriting the last byte without the command sequence (the contents do not change) |
| `C [0\|1]` | prints the cache hit / miss counters and the control register, then resets the counters; `C 0` disables the cache, `C 1` enables it |
| `T` | RAM test: banks 32–39 (4 × 62256; 34 excluded: BIOS variables and stack) through window 2; first writes a bank-specific pattern to all of them, then verifies all of them (this also catches mixed-up address lines and chip selects). ≈ 0.9 s at 4 MHz. At the end window 2 goes back to its old bank |
| `?` / `H` | help |

`D` reads the I/O area (`FF00–FFFF`) too; reading some registers has side effects (UART and keyboard
data).

## Bootloader protocol (UART, 115200 8N1)

Programs are loaded over the UART without pulling any chips. The same client code (`bios/uploader.ts`,
`uploadHex`) is used in the Web IDE for the simulator, with Web Serial for the real board, and in the CLI.

```
host                               BIOS
────                               ────
"\r"                         ──▶   (empty line)           ◀── "\r\n> "      is the monitor at the prompt?
"L\r"  (or "F\r")            ──▶                          ◀── "L\r\nHEX bekleniyor (RAM), iptal: ESC\r\n"
":10400000…\r\n"             ──▶   processes the record   ◀── "."           OK
":10401000…\r\n"             ──▶                          ◀── "."
   …
":0400000500004000B7\r\n"    ──▶   start address          ◀── "."
":00000001FF\r\n"            ──▶   end of file            ◀── ".\r\nYuklendi: 007F bayt, giris 4000\r\n> "
"G\r"                        ──▶   runs the program (optional)
```

Rules:

- After each command the host waits for the expected text before it continues: first `"> "`, after
  `L`/`F` the `HEX…` line ending in `\n`, after each record a one-character reply.
- Replies: **`.`** record accepted · **`!`** checksum or hex error: the record can be sent again unchanged
  (the client retries 3 times) · **`X`** rejected: the upload ends, and the BIOS prints a one-line error
  message and `"> "` (`Hata: adres izinli degil`, address not allowed; `Hata: EEPROM yazilamadi`, EEPROM
  write failed).
- Records start with `:`; other characters in between (CR, LF, space) are ignored. No extra character is
  expected at the end of a record; the client still appends `\r\n`.
- `ESC` (27) or `Ctrl-C` (3) between records cancels the upload (`Iptal`).
- Record types: `00` data · `01` end of file · `04` extended linear address (ignored for RAM; for the
  EEPROM only `0000`, since the 28C256 is 32 KB) · `05` / `03` start address (the low 16 bits, the
  default for `G`). Without a start record the entry point is the address of the first data record.
- Record data is at most 255 bytes; the client sends 16 bytes per record.
- The BIOS does not echo during a record and spends ≈ 120 cycles per character (one byte takes 347
  cycles on the line), so the host can send the characters of a record back to back. The reply goes to
  the screen first and to the UART last; by the time the reply arrives, the BIOS is ready for the next record.

**RAM (`L`)**: addresses are CPU addresses, and anything outside `0x4000–0xF7FF` is rejected (`X`), which
protects the BIOS variable and stack area and the ROM. The numbers in the summary line are hex.

**EEPROM (`F`)**: addresses are **EEPROM offsets**, and only bank 1 (`0x4000–0x7FFF`) is writable;
bank 0 (`0x0000–0x3FFF`, BIOS) and anything above `0x8000` are rejected (`X`). There is no erase: the
28C256 rewrites each byte directly, and bytes that are not written keep their contents. A record is split
at 64-byte page boundaries; each part is one protected page write (≈ 10 ms, see "Writing to EEPROM"), and
the written bytes are then read back and verified. An unprotected chip becomes protected on the first
write. The cache is off during the upload; at the end it is flushed and restored to its previous state.
`F` does not run the program.

To run a program from the EEPROM: a program assembled for `0x4000` is written with `F` to EEPROM offset
`0x4000` (bank 1); then, in the monitor, `B 1 1` (window 1 = EEPROM bank 1) and `G 4000`. The program then
cannot write to its own region (EEPROM), so it must keep its variables in the RAM of window 2/3. Reset maps
the banks back to RAM; the EEPROM contents stay.

### Clients

- **Web IDE** (`#cpu16`, "Motherboard + BIOS" mode): "Compile and load to RAM" follows the flow of the
  real board: reset → the BIOS boots → `L` → records → `G`. "Write to EEPROM" writes with `F`, and the
  "Run from EEPROM" button sends `B 1 1` + `G 4000`.
- **Web Serial** ("Send to board (Web Serial)", Chrome / Edge on the desktop, https or localhost): the
  browser opens the board's CH340 serial port at 115200 8N1 and sends exactly the sequence above:
  `"\r"`, `"L\r"`, each record + `"\r\n"`, and finally `"G\r"`; then it closes the port. The board's
  output appears in the IDE under "Board (Web Serial)". If the browser has no `navigator.serial`, the
  button is disabled and says why.
- **CLI**: `npm run cpu16 -- machine program.s` connects the same client to the simulator's UART.
- By hand: typing `L` in any serial terminal and pasting the `.hex` file as text also works (flow control
  must be on, or the terminal must add a delay after each line).

## Writing to EEPROM (inside the BIOS)

While a write cycle is in progress (≈ 10 ms) the 28C256 cannot be read: every read returns a status byte
(D7 is the inverse of the written byte's D7, D6 toggles on every read). The BIOS itself lives in the
EEPROM, so it cannot fetch instructions from there during that time. That is why the `flashrt` routines
are copied to RAM (`0xFA40`) at startup and called from there with interrupts disabled (they use only
relative branches; the IRQ vector is in the EEPROM).

The chip is used with **software data protection** (SDP): writes that arrive without the command sequence
are ignored, so a running program cannot corrupt the BIOS by accident. Every page is written with
protection (`fr_page`):

1. `AA → 5555h`, `55 → 2AAAh`, `A0 → 5555h`; then 1–64 bytes to the same 64-byte page, at most 150 µs
   apart (tBLC). 150 µs after the last byte the chip enters its write cycle.
2. The last written address is polled on D7 until the write finishes (timeout ≈ 0.8 s).
3. The bytes are read back and compared with the source; on a mismatch, `Hata: EEPROM yazilamadi`.

The command addresses are produced through the windows: for `5555h`, window 1 is temporarily mapped to
EEPROM bank 1 (CPU `0x5555`); `2AAAh` is in window 0 (bank 0, CPU `0x2AAA`); the target is in window 1 as
well (offset = CPU address). Polling and verification reads must come from the EEPROM, not from the cache,
so the cache is off during this time. Afterwards the windows and the cache go back to their previous state.

The `I` command tests the protection with `fr_sdp`: the last byte of the EEPROM (`0x7FFF`) is rewritten
with its own value, without the command sequence. If the chip is protected, the write is ignored and D7
reads correctly; otherwise a write cycle starts (D7 inverted) and the routine waits for it to end; the
contents do not change.

## Known limits (v1)

- Monitor messages are ASCII (no Turkish letters), so UART terminals have no code page trouble.
- A program called with `G` uses the BIOS stack; `MONITOR` (`0x0010`) resets the stack.
- The keyboard layout is US; arrows and F keys have no mapping in the BIOS.
- `T` destroys the contents of all RAM except bank 34 (including a program loaded at `0x4000–0xBFFF`).
