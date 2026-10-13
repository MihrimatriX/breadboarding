# Docs: reading path

The repository has close to forty documents. This page puts them in order for a newcomer. You don't
need to read them all: do the "Try it first" section, then pick the path that fits your goal.

| Your goal | Path |
|---|---|
| Open the app and look around | [Try it first](#try-it-first) |
| Understand how CPU16 works | [Path A: understanding CPU16](#path-a-understanding-cpu16) |
| Build it on breadboards | [Path B: building with the experiment kit](#path-b-building-with-the-experiment-kit) |
| A smaller hardware project | [Path C: the calculator](#path-c-the-calculator) |
| Contribute code | [Path D: contributing code](#path-d-contributing-code) |
| The answer to a specific question | [Which document answers which question](#which-document-answers-which-question) |

## Try it first

1. [README](../README.en.md#quick-start): `npm run dev` or `docker compose up -d`, then open the six
   sections in the browser in order: 6502 die, CPU16 workbench, CPU16 board 3D, 8-bit calculator 3D,
   Architecture, Docs. If you get lost in the boards, go back to the block diagrams in the Architecture
   section: which box does what, and which path connects it.
2. Your first CPU16 program on the command line: `npm run cpu16 -- run cpu16/programs/hello.s`. Open
   the source ([hello.s](../cpu16/programs/hello.s)): a twenty-line program with comments.
3. In the CPU16 workbench, in "Motherboard + BIOS" mode, pick `yilan.c` from the example list, compile
   and run it, then click on the screen and play with W A S D. Everything else in the repository leads
   up to this game.

## Path A: understanding CPU16

It starts from the design and works down to the gates, then on to the boards and the software. Each
document builds on the one before it.

| # | Document | What you learn |
|---|---|---|
| 1 | [cpu16/README.md](../cpu16/README.en.md) | CPU16 overview, commands, table of documents |
| 1b | [mimari.md](../cpu16/docs/mimari.en.md) | block diagrams: the CPU board and the whole computer box by box, the paths and their jobs (in the app: the Architecture section) |
| 2 | [roadmap.md](../cpu16/docs/roadmap.en.md) | phases, the current stage and the project's five rules (golden model, "done" = test, spec change = PR). If you get lost, come back here first. |
| 3 | [spec.md](../cpu16/docs/spec.en.md) | vision, hardware blocks, memory map, instruction formats, opcode map, ABI. A frozen document; its initial experiment list is the plan, and the current order is in [kit/README.md](../cpu16/kit/README.en.md). |
| 4 | [isa-ayrintilari.md](../cpu16/docs/isa-ayrintilari.en.md) | the bit-by-bit behavior of every instruction; the reference emulator (`cpu16/emu/cpu.ts`) implements it |
| 5 | [as16.md](../cpu16/docs/as16.en.md) | assembler syntax; write your first program here and run it with `npm run cpu16 -- run` |
| 6 | [mikromimari.md](../cpu16/docs/mikromimari.en.md) | internal data bus, the 32-bit control word, microcode, cycles per instruction; how the microcode becomes 74HC gates |
| 7 | [parcalar.md](../cpu16/docs/parcalar.en.md) | 74HC parts library: every chip with its datasheet table, gate circuit and CMOS transistor expansion |
| 8 | [kartlar.md](../cpu16/docs/kartlar.en.md) | schematic = code: the boards are written in TypeScript, and the KiCad schematics and BOM are generated from them; the CPU board chip by chip |
| 9 | [anakart.md](../cpu16/docs/anakart.en.md) | the motherboard's behavior model: banked memory, cache, I/O map, interrupts, video, UART, PS/2 |
| 10 | [anakart-kartlari.md](../cpu16/docs/anakart-kartlari.en.md), [anakart-gc-video.md](../cpu16/docs/anakart-gc-video.en.md) | the same motherboard at gate level: clock, memory, cache, I/O and video boards |
| 11 | [3d-gorunum.md](../cpu16/docs/3d-gorunum.en.md) | seeing all of this in Silikon3D: board → chip → gate → transistor, the VGA screen, the console |
| 12 | [bios.md](../cpu16/docs/bios.en.md) | BIOS: boot, jump table, monitor commands, Intel HEX bootloader |
| 13 | [cc16.md](../cpu16/docs/cc16.en.md) | C compiler: supported C, memory layout, calling convention, BIOS target |
| 14 | [c-ornekleri.md](../cpu16/docs/c-ornekleri.en.md) | annotated C examples (`cpu16/programs/c/`, `cpu16/bios/ornekler/`) |
| 15 | [uretim.md](../cpu16/docs/uretim.en.md) | from simulation to a real board: timing analysis, speed target, build order, board test |

## Path B: building with the experiment kit

For building the computer on breadboards, block by block. Each experiment is a video, a scene in the
simulator and a module on the real board; the parts and connection tables at the end of each
experiment file are generated from the board definitions.

1. [kit/README.md](../cpu16/kit/README.en.md): the tools you need, general rules, troubleshooting.
2. [LEDs, resistors and capacitors](../cpu16/kit/led-ve-direnc.en.md): color code, LED polarity,
   pull-up and pull-down resistors, decoupling. Read it once before the first experiment.
3. Experiments:

   | # | Experiment | At the end |
   |---|---|---|
   | 1 | [Clock and reset board](../cpu16/kit/deney-01-saat.md) | a clock on an LED, single cycles with the ADIM (step) button |
   | 2 | [Gates and CMOS transistors](../cpu16/kit/deney-02-kapilar.md) | NAND truth table, the inside of a NAND |
   | 3 | [EEPROM programmer](../cpu16/kit/deney-03-programlayici.md) | a 28C256 gets programmed and verified |
   | 4 | [Register file and data bus](../cpu16/kit/deney-04-register.md) | the value on the switches is written to a register and read back |
   | 5 | [ALU and flags](../cpu16/kit/deney-05-alu.md) | addition, subtraction, logic, shifts; NZCV |
   | 6 | [Program counter and instruction fetch](../cpu16/kit/deney-06-komut-cekme.md) | the PC steps forward, instructions are fetched into IR |
   | 7 | [Microcode and control unit](../cpu16/kit/deney-07-mikrokod.md) | the CPU runs: NOP loop, HALT |
   | 8 | [Memory board and first program](../cpu16/kit/deney-08-bellek.md) | the first program, running from EEPROM, tests the RAM |
   | 9 | [Wait states and cache](../cpu16/kit/deney-09-onbellek.md) | the running light speeds up with the cache on |
   | 10 | [I/O board](../cpu16/kit/deney-10-gc.md) | serial communication with a computer, keyboard |
   | 11 | [Video board](../cpu16/kit/deney-11-video.md) | "Merhaba" on a VGA screen, 16 colors |
   | 12 | [BIOS, bootloader and Web Serial](../cpu16/kit/deney-12-bios.md) | loading programs onto the board from the browser |
   | 13 | [C compiler: snake game](../cpu16/kit/deney-13-c.md) | a game written in C on the screen |
   | 14 | [Build your own memory](../cpu16/kit/deney-14-kendin-yap-bellek.md) | optional: 16 bytes of RAM, each byte one 74HC574 |

4. [kurulum.md](../cpu16/docs/kurulum.en.md): how to generate and read the printable build guide for
   each board (layout map, numbered wire list, chip cards). To build the whole computer on breadboards
   instead of PCBs: [breadboard.md](../cpu16/docs/breadboard.en.md) (one breadboard assembly per board,
   ribbon cable between boards, hole-to-hole wire lists).
5. [uretim.md](../cpu16/docs/uretim.en.md): the reasoning behind the build order, power supply, fault
   finding, board test.

## Path C: the calculator

A 216-chip circuit with no clock and no program: smaller than CPU16, and the result appears as soon as
you flip a switch. On breadboards its first four stages take ≈ 22 chips and 6–7 breadboards.

1. [hesap8/README.md](../hesap8/README.en.md): files and commands.
2. [tasarim.md](../hesap8/docs/tasarim.en.md): usage, blocks (addition, multiplication, division,
   binary to decimal, displays), speed, power supply, parts. The block diagram comes first; the
   interactive version is in the app's Architecture section.
3. [kurulum-rehberi.md](../hesap8/docs/kurulum-rehberi.en.md): the physical build stage by stage, with tests.

## Path D: contributing code

1. [CONTRIBUTING.md](../CONTRIBUTING.en.md): setup, branch and PR workflow, rules, adding a new chip /
   board / example program, generated files.
2. [CLAUDE.md](../CLAUDE.md): a one-page index (folder map, checks before pushing, generated files,
   rules that never change, known pitfalls); there is one more each under `cpu16/`, `hesap8/` and `src/`.
3. [README: project structure](../README.en.md#project-structure) and [Silikon3D architecture](../README.en.md#silikon3d-architecture).
4. The document for the area you will touch: [cc16.md](../cpu16/docs/cc16.en.md) for the compiler (file
   table), [parcalar.md](../cpu16/docs/parcalar.en.md) for a new chip ("Adding a new chip" at the end),
   [3d-gorunum.md](../cpu16/docs/3d-gorunum.en.md) for the 3D view ("Files" at the end), and
   [kartlar.md](../cpu16/docs/kartlar.en.md) for the boards.

## Which document answers which question

| Question | Document |
|---|---|
| How does an instruction change the flags? | [isa-ayrintilari.md](../cpu16/docs/isa-ayrintilari.en.md) |
| How many clock cycles does an instruction take? | [mikromimari.md](../cpu16/docs/mikromimari.en.md) |
| I/O addresses, bank registers? | [anakart.md](../cpu16/docs/anakart.en.md) |
| BIOS calls, monitor commands? | [bios.md](../cpu16/docs/bios.en.md) |
| What's missing from C, how many bits is an `int`, which registers hold the arguments? | [cc16.md](../cpu16/docs/cc16.en.md) |
| How many gates and transistors does each chip have? | [parcalar.md](../cpu16/docs/parcalar.en.md), `npm run cpu16 -- chips` |
| How many chips are on each board? | [kartlar.md](../cpu16/docs/kartlar.en.md), `npm run cpu16 -- board` |
| What does each block do, and which path connects it? | [mimari.md](../cpu16/docs/mimari.en.md), the Architecture section in the app, `npm run cpu16 -- mimari` |
| Which pin goes where, and what color is the wire? | [kurulum.md](../cpu16/docs/kurulum.en.md), `npm run cpu16 -- kurulum <board>` |
| Which hole to which hole on the breadboard? | [breadboard.md](../cpu16/docs/breadboard.en.md), `npm run cpu16 -- breadboard-belge <board>` |
| How many MHz does the real board run at? | [uretim.md](../cpu16/docs/uretim.en.md), `npm run cpu16 -- zamanlama` |
| Resistor color code, LED direction? | [led-ve-direnc.md](../cpu16/kit/led-ve-direnc.en.md) |
| How do I drive the 3D view from the console? | [3d-gorunum.md](../cpu16/docs/3d-gorunum.en.md#console) |
| How do I run it with Docker? | [README: With Docker](../README.en.md#with-docker) |
