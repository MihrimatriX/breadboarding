# CPU16 design specification v1.0

> Status: **frozen (v1.0, 2026-10-11)**. AFU approved every decision.
> Changing this document falls under the roadmap's "spec change" rule (see `roadmap.md`).
> Working name: **CPU16** (a permanent name will be chosen later).

## 0. Vision (AFU, 2026-10-11)

- A 16-bit computer of our own, built entirely from chips (74HC series).
- In the simulation, clicking a chip shows what is inside it: board → chip → gate → transistor (with Silikon3D's 3D viewer).
- Keyboard and display included.
- A schematic gets drawn (circuit schematic first, then a PCB if wanted).
- Reprogrammable (the program memory can be changed).

The project belongs to the same family as Ben Eater's 8-bit computer, the Gigatron and Magic-1. It differs in being 16-bit and in letting you open every layer in 3D.

## 1. How this decision affects the ISA

In discrete logic every feature costs chips. So these changed from v0.1:

| Topic | v0.1 | v0.2 | Why |
|---|---|---|---|
| Barrel shifter | yes | **no**, 1-bit shifts (SHL/SHR/SAR/ROL/ROR ×1) | a 16-bit barrel shifter ≈ 8–12 74HC153s |
| MUL/DIV | hardware (optional) | **software** (library routine in ROM) | a multiplier is dozens of chips |
| Control unit | fixed FSM | **microcode, built from 74HC gates** (first planned in Flash) | Ben Eater's method; the microcode table lives in `micro/cpu16.ucode` and the gate circuit is generated from it (`npm run cpu16 -- kontrol`). No ROM on the CPU (AFU's decision) |
| Clock | - | ~1–4 MHz, single-step clock button | safe with 74HC; you can follow it step by step on video. The first real board runs at 1 MHz (8 MHz oscillator / 8): timing analysis from the schematic, [uretim.en.md](uretim.en.md) |

The rest stays the same: load/store, fixed 16-bit instructions, 8 registers, NZCV, 64 KB byte-addressed, memory-mapped I/O.

## 2. Hardware blocks

| Block | Chips (estimate) | Note |
|---|---|---|
| Register file 8×16 | 74HC574 ×16 + 74HC138 + 3-state buffers (or 74HC670 ×8) | the 670 needs fewer chips but is rare |
| 16-bit ALU | 74HC283 ×4 (adder) + 74HC86/08/32 (XOR/AND/OR) + 74HC157 mux | the 74181 is no longer made; building the ALU from gates teaches more and uses parts you can still buy |
| Flags | 74HC74 / 74HC175 | |
| PC, MAR, IR | 74HC161 ×4 (PC), 74HC574 ×2+2 | |
| Microcode | 74HC138 decoders + 74HC151 + OR network (`board/kontrol.ts`, generated from the table) + 74HC161 micro-step counter | 32 control signals; the first plan used 3–4 Flash chips |
| Memory | 32 KB ROM (28C256 EEPROM) + 32 KB RAM (62256) | |
| Address decoding | 74HC138 / 74HC688 | `0xFF00+` I/O |
| Display | VGA text mode 80×30, 640×480@60 Hz; the video board has its own VRAM (character + color), font ROM, and timing from 74HC161 counters | the CPU writes VRAM through an I/O window |
| Keyboard | PS/2: 74HC595/164 shift register | |
| Programming | bootloader in ROM + load into RAM over USB-UART (CH340) | reprogram without pulling chips |

Rough total: **60–90 chips** (excluding cache and MMU).

## 2b. Motherboard architecture (AFU, 09:25: "a motherboard with its own cache, memory and I/O")

The system is laid out like a **motherboard**: CPU, cache, main memory and I/O controllers are separate blocks on a shared system bus.

```
 CPU core ── cache (L1) ── SYSTEM BUS (16 data / 16-24 address / control)
                              ├── main memory: ROM (BIOS/bootloader) + RAM
                              ├── MMU / bank register (for more than 64 KB)
                              ├── I/O: keyboard (PS/2), display, UART (programming), timer
                              └── expansion slots
```

Cache: 1–2 KB, direct-mapped, write-through. Fast SRAM (IS61C256, 15 ns) + tag SRAM + 74HC688 comparator + hit/miss logic (~10–15 chips).
- At 74HC speeds the RAM is already as fast as the CPU, so a cache makes no difference on its own. For the cache to matter, main memory sits on a slow bus with **wait states** (e.g. 2 wait states). A hit then takes 1 cycle and a miss 3 cycles; a counter measures the hit rate, which the video shows.

Main memory: 128 KB RAM (4 × 62256) + 32 KB EEPROM (28C256). The CPU sees 64 KB, and **bank registers** map four 16 KB windows into a 1 MB physical space (a simple MMU). The rest of the space is empty (reads return `0xFF`).

I/O: memory-mapped at `0xFF00–0xFFFF`; the keyboard and UART use interrupts (IRQ), with a priority encoder built from gates.

Parts (AFU): the computer is built only from common 7400-series logic and two memory chips, the 62256 (32 KB SRAM) and the 28C256 (32 KB EEPROM). No rare or single-source parts. That is why the 512 KB RAM (AS6C4008), the Flash (SST39SF010A), the 74HC590, 74HC193 and 74HC148 were removed (74HC161 + 74HC541 and gates replace them). The 74HC166 may look like an exception, but it is a common part and stays: the asynchronous load of the 74HC165 does not fit the video board's pixel clock ([anakart-gc-video.en.md](anakart-gc-video.en.md)).

DIY memory board: a 16-byte teaching board at `FF40–FF4F` in the I/O space. Each byte is one 74HC574, and address decoding uses 74HC138s. It lays out the cell / decoder / shared data line structure that is hidden inside a 62256 (Experiment 14).

Board layout: a backplane with plug-in boards (RC2014 style): CPU board, cache board, memory board, video board, I/O board (keyboard + UART + timer), clock/reset board. Each board is a separate experiment and a separate KiCad schematic.

## 2e. Memory map (the 64 KB the CPU sees)

| Address | Size | Contents |
|---|---|---|
| `0x0000–0x3FFF` | 16 KB | Window 0: ROM bank 0 after reset (vectors + BIOS/bootloader) |
| `0x4000–0x7FFF` | 16 KB | Window 1: RAM bank |
| `0x8000–0xBFFF` | 16 KB | Window 2: RAM bank |
| `0xC000–0xFEFF` | ~16 KB | Window 3: RAM bank (the stack lives here) |
| `0xFF00–0xFFFF` | 256 B | I/O: bank registers, keyboard, UART, timer, video, cache counters |

Vector table (ARM style, each entry one `JAL`): `0x0000` reset, `0x0002` IRQ, `0x0004` SWI. Physical address = 6-bit bank number + 14-bit offset = 20 bits (1 MB): EEPROM at `0x00000–0x07FFF`, RAM at `0x80000–0x9FFFF`, the rest empty.

## 2c. Programming and loading (AFU, 09:36)

A program can be loaded **two ways**:
- Web: write it in the browser IDE → compile → load it into the simulator. If a real board is connected, send it over USB-UART to the board's bootloader with the **Web Serial API** (no chip pulling).
- Physical: write the same .bin / Intel HEX file to the 28C256 with an EEPROM programmer. The experiment kit includes our own programmer (Arduino Nano + 2×74HC595, Ben Eater style); an off-the-shelf TL866/T48 works too.

**It will be programmed in C, with a compiler we write ourselves.**

```
 source.c ──cc16──▶ source.s ──as16──▶ source.o ──ld16──▶ program.bin / .hex
                                                     │
                     crt0.s + libc16 (printf, malloc,│ soft MUL/DIV, string)
                                                     ▼
                       web: simulator / Web Serial    physical: EEPROM programmer
```

The toolchain is written in **TypeScript**, so the same code runs in the browser (web IDE) and in the Node CLI.
Compiler: chibicc style, a hand-written recursive-descent parser + AST → simple IR → CPU16 assembly. Versions:
  1. C subset: int/char/pointer/array/if/while/for/function (the first C program prints "Merhaba" on screen)
  2. struct/union/enum, global variables, strings, switch
  3. typedef, preprocessor (#include/#define), multiple files + linker
  4. long (32-bit, with ADC/SBC), register allocation (linear scan), optimizations
  5. (later) float = soft-float; running the compiler on CPU16 itself (self-host)
ABI: arguments in r0–r3, return value in r0 (32-bit: r0:r1), r4–r5 callee-saved, r6 = SP, r7 = LR; `int` = 16 bits, `long` = 32 bits.

## 2d. Teaching material and experiment kit (AFU, 09:36)

The project is also a **tutorial and experiment kit**. Each experiment = a video + a scene in the simulator + a module on the real board:

| # | Experiment | Result |
|---|---|---|
| 1 | Clock (555, step button) | blinking LED |
| 2 | Gates and transistors (CMOS) | the inside of a NAND in 3D |
| 3 | Registers and the bus | a value on 16 LEDs |
| 4 | ALU | addition/subtraction, flags |
| 5 | PC + memory + instruction fetch | the program counter runs |
| 6 | Microcode and the control unit | the first instruction runs |
| 7 | Assembler (as16) | first program |
| 8 | Interrupts + I/O | a key press |
| 9 | Display | "Merhaba" on screen |
| 10 | Cache + wait states | hit rate measurement |
| 11 | Bank/MMU | 1 MB of memory |
| 12 | Bootloader + Web Serial | loading the board from the browser |
| 13+ | C compiler (5 stages) | a snake game in C |

## 3. Layered model (simulation ↔ 3D)

1. Board: KiCad schematic → netlist → 3D board (chips, wires, LEDs).
2. Chip: every 74HC part has its own gate-level model (e.g. 74HC283 = 4 full adders).
3. Gate → transistor: every gate expands into CMOS transistors (the Silikon3D engine already supports CMOS switch level).

Single source: the **KiCad schematic**. The simulator and the 3D view are generated from the schematic; when the schematic changes, everything updates.

## 4. Instruction formats

Bits `[15:0]`. `op` = `[15:12]`.

```
R  : op(4) | rd(3) | rs1(3) | rs2(3) | f3(3)
I  : op(4) | rd(3) | rs1(3) | imm6(6, signed)
S  : op(4) | rs2(3)| rs1(3) | imm6(6, signed)
L  : op(4) | rd(3) | h(1)   | imm8(8)              ; LI / LUI
C  : op(4) | rs1(3)| imm9(9, signed)               ; CMPI
B  : op(4) | cond(4)| off8(8, signed, ×2)
J  : op(4) | off12(12, signed, ×2)
```

## 5. Opcode map

Bit-level behavior (flags, branch target computation, interrupt entry): [isa-ayrintilari.en.md](isa-ayrintilari.en.md).

| op | Mnemonic | Format | Meaning |
|---|---|---|---|
| 0 | ALU | R | f3: ADD, ADC, SUB, SBC, AND, OR, XOR, CMP (CMP: the rd field is unused) |
| 1 | ALU2 | R | f3: MOV, NOT, NEG, SHL, SHR, SAR, ROL, ROR (1 bit) |
| 2 | - | | Reserved (formerly MULDIV) |
| 3 | ADDI | I | rd = rs1 + imm6 |
| 4 | LI / LUI | L | h=0: rd = zext(imm8); h=1: rd[15:8] = imm8 |
| 5 | LW | I | rd = mem16[rs1 + imm6×2] |
| 6 | SW | S | mem16[rs1 + imm6×2] = rs2 |
| 7 | LBU | I | rd = zext(mem8[rs1 + imm6]) |
| 8 | SB | S | mem8[rs1 + imm6] = rs2[7:0] |
| 9 | Bcc | B | EQ NE CS CC MI PL VS VC HI LS GE LT GT LE AL |
| 10 | JAL | J | r7 = PC+2; PC += off12×2 |
| 11 | JALR | I | rd = PC+2; PC = rs1 + imm6×2 (RET = JALR r7, r7, 0) |
| 12 | CMPI | C | flags = rs1 − sext(imm9) |
| 13 | STACK | R | PUSH rs1, POP rd (SP = r6) |
| 14 | SYS | R | NOP, HALT, EI, DI, RETI, SWI, SXB |
| 15 | - | | Reserved |

## 6. Settled decisions (2026-10-11)

| Topic | Decision |
|---|---|
| Implementation | 74HC chips; simulation first, then a real board from the same schematic |
| Display | VGA text mode 80×30 |
| Board layout | Backplane + boards |
| Memory | 1 MB physical address space, 4×16 KB bank windows; 32 KB EEPROM + 128 KB RAM fitted |
| Parts | only common 7400-series logic + 62256 and 28C256 memories |
| Programming | Web (IDE + Web Serial) and physical (EEPROM programmer) |
| Compiler | Our own C compiler (cc16), toolchain in TypeScript |
| Schematic tool | KiCad (single source) |
| Register file | based on the 74HC574 |
| Cache | 1–2 KB direct-mapped, write-through |

Still open: the processor's permanent name.
