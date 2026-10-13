# CPU16 roadmap

> **Now:** The simulation side of every phase is done (2026-10-11): the six-board motherboard boots the BIOS at gate level and matches the emulator instruction for instruction; the KiCad schematics, timing analysis, C compiler and the guides for all 14 experiments are ready. **Next:** the real boards, starting with Experiment 1 (phase 9's done criterion is the board test). Open question: the processor's permanent name.
> This line is updated whenever a phase finishes. If you get lost, look here first.

## 5 rules for not getting lost

1. **One main phase at a time.** At most one parallel track (marked ⇄ below) runs beside it.
2. **The "done" criterion of every phase is a test.** No phase starts until the test of the previous one passes.
3. **Golden model.** The phase 1 emulator defines what is correct. Every later layer (microcode model, gate-level board, real board) must run the same test programs and give **the same result as the emulator in lockstep**. That way a bug is always looked for "in the layer added last".
4. **Spec change = PR.** `spec.md` is frozen; if a change is needed, first comes a PR that changes the spec, then the code.
5. **Every phase is a video.** The video to shoot when a phase finishes is decided in advance, so content production does not fall behind the code.

## Overall flow

```
Phase 0 Spec ─▶ Phase 1 Emulator+as16 ─▶ Phase 2 Microarchitecture ─▶ Phase 3 74HC library ─▶ Phase 4 KiCad schematics
                        │                                                                               │
                        └──⇄ Phase 8 C compiler (starts in parallel once the emulator is ready)         ▼
                                                               Phase 5 3D view ◀── Phase 4 netlist ─▶ Phase 6 Peripherals
                                                                                                        │
                                                      Phase 7 BIOS + bootloader + Web IDE ◀─────────────┘
                                                                           │
                                                                 Phase 9 Real boards ─▶ Phase 10 Experiment kit package
```

## Phases

### Phase 0: spec (done)
- Output: `docs/spec.md` v1.0 (ISA, formats, opcode map, memory map, ABI, hardware blocks).
- Done criterion: AFU's approval. Done 2026-10-11.

### Phase 1: reference emulator + assembler (golden model), done 2026-10-11
- Output: `cpu16/emu` (TypeScript, instruction-level emulator), `cpu16/asm` (as16: labels, directives, .bin/.hex output), ISA test programs.
- Done criterion: at least one test per opcode; flag (NZCV) edge cases; the Fibonacci, bubble sort and 32-bit addition (ADC) programs give correct results on the emulator; runs in CI.
- Video: "We designed our own instruction set: running the first program".
- Result: `emu/cpu.ts`, `emu/disasm.ts`, `asm/assembler.ts`, `asm/hex.ts`, `tools/cli.ts`, `programs/*.s` (hello, fib, add32 + software multiply, bubble, irq), `tests/` (52 tests; the disassembler round-trips all 65,536 words). Bit-level behavior: `docs/isa-ayrintilari.md`; assembler guide: `docs/as16.md`.

### Phase 2: microarchitecture and microcode, done 2026-10-11
- Output: bus block diagram, control signal list (24–32 signals), microcode source file + microcode assembler (generates the control table), a block model at the **clock-cycle level** (registers, ALU, bus, control).
- Done criterion: all phase 1 test programs run on the block model and match the emulator's state in lockstep after every instruction; a table of cycles per instruction comes out of it.
- Video: "What is microcode? The little program inside the CPU".
- Result: `micro/control.ts` (32-bit control word), `micro/cpu16.ucode` + `micro/microasm.ts` (8192-word control table: `npm run cpu16 -- ucode`), `micro/datapath.ts` (clock-cycle model that runs the table's bits). Lockstep: 5 programs + 60,000 random instructions. Average ≈5 cycles per instruction. Details: `docs/mikromimari.md`. Spec change: `cond = 15` is now NV (never) and no longer illegal.

### Phase 3: 74HC parts library, done 2026-10-11
- Output: for every chip used (≈25 types: 74HC00/04/08/32/86/74/138/148/157/161/175/245/283/574/595/688, SRAM, Flash…) a gate-level model + truth table tests; a CMOS transistor expansion for every gate; KiCad symbol/footprint mapping.
- Done criterion: every chip model passes its datasheet truth table; the transistor expansion gives the same result as the gates in the Silikon3D engine.
- Video: "Inside the 74HC283: from adder to transistor".
- Result: `chips/` (35 chips: gate model + datasheet table + CMOS transistor expansion + KiCad symbol), the `chips/logic.ts` gate-level simulator (0/1/Z/X, with delays), `kicad/cpu16.kicad_sym`. Every chip passes its table at gate and transistor level. Details: `docs/parcalar.md`.

### Phase 4: KiCad schematics (board by board), done 2026-10-11
- Order: clock/reset → CPU (registers, ALU, PC, IR, flags, microcode) → memory + bank → backplane.
- Output: a `.kicad_sch` per board, netlist → simulator importer.
- Done criterion: the **gate-level** computer generated from the schematic runs the phase 1 test programs in lockstep with the emulator. (If the schematic changes, the simulation changes with it.)
- Video: one episode per board.
- Result: schematic = code (`board/*.ts`): CPU board, clock board, test memory board; from the same definition come the gate-level simulation, KiCad 7 schematics (`kicad/<kart>/`), BOM and ERC. The gate-level computer runs the 5 programs identically to the microcode model on every clock cycle. The CPU board has no ROM: the microcode and the ALU decode table are a 74HC gate circuit generated by `board/kontrol.ts` (194 chips, 210 with the register contents displays; identical to the table at all 8192 + 128 addresses under LogicSim). Details: `docs/kartlar.md`, `docs/mikromimari.md`.

### Phase 5: 3D view (together with Silikon3D), done 2026-10-11
- Output: board → chip → gate → transistor zoom; the clicked chip opens up; live signals.
- Note: the Silikon3D code belongs to the "3D 16-bit CPU simulation" conversation; this phase runs in coordination with it.
- Done criterion: in a running program you can click a chip and follow live signals down to transistor level.
- Result: the **CPU16 board 3D** section in Silikon3D (`#kart`): the gate-level computer runs in a Web Worker; board → chip (die and gate schematic) → transistor zoom, live signals at every level, and a `kart.*` API in the console. Details: `docs/3d-gorunum.md`.

### Phase 6: peripherals and motherboard, done 2026-10-11
- Output: VGA text board, PS/2 keyboard, UART, timer, interrupt controller (priority encoder from gates), cache board (+ hit/miss counters), bank registers. All of them as schematic + simulation.
- Done criterion: in the simulation a key pressed on the keyboard shows up on screen; the cache hit rate is measured; the 1 MB memory test passes.
- Result: the behavioral model `emu/machine.ts` (banked 1 MB memory, cache, UART, PS/2, timer, interrupts, VGA text) and the gate-level boards of the same motherboard: clock (with wait states), memory, cache, I/O, video, DIY memory (16 × 74HC574, a teaching board). The motherboard is built only from common 7400-series logic and two memory chips (62256, 28C256): 32 KB EEPROM + 128 KB RAM. The CPU and five boards together boot the BIOS from reset to the monitor prompt and match `Machine` instruction for instruction, timer interrupt included. The whole motherboard is in KiCad. Details: `docs/anakart.md`, `docs/anakart-kartlari.md`, `docs/anakart-gc-video.md`.

### Phase 7: software base and Web IDE, done 2026-10-11
- Output: BIOS/monitor (show/edit memory, run a program), UART bootloader, Web IDE (editor + compile + run in the simulator + send to the board with Web Serial).
- Done criterion: a program written in the browser runs with one key press in the simulator and (after phase 9) on the real board.
- Result: `bios/bios.s` (jump table, interrupt handler, VGA and UART drivers, monitor, Intel HEX bootloader into RAM and EEPROM), the CPU16 Web IDE in Silikon3D (editor, C and assembly, run in the simulator, load to the board with Web Serial). Details: `docs/bios.md`.

### Phase 8: cc16 C compiler ⇄ (parallel after phase 1), done 2026-10-11
- Stages: (1) int/char/pointer/array/control flow/function → (2) struct/union/enum/string/switch → (3) typedef + preprocessor + linker (ld16) → (4) long, register allocation, optimization → (5) soft-float, a self-host attempt.
- Output: `cpu16/cc`, `cpu16/libc` (crt0, printf, malloc, soft MUL/DIV, string).
- Done criterion (for each stage): that stage's C test suite passes on the emulator. Final: a snake game written in C is played on screen.
- Result: `cc/` (preprocessor, typed parser, code generator, linker; struct, union, enum, switch, long, pointers), `lib/` (crt0, rt, libc16: printf, malloc, string, software multiply/divide). `cc --hedef bios` builds programs that run on top of the BIOS; `yilan.c` is played on the VGA screen with the keyboard. No soft-float and no self-host. Details: `docs/cc16.md`.

### Phase 9: real boards (tools ready, boards still to be built)
- Same order as phase 4; each board first on a breadboard, then as a PCB. Our own EEPROM programmer (Arduino + 74HC595) comes first.
- Done criterion: the real board passes the same test programs the simulation passes (results compared over UART).
- Result: EEPROM programmer (Arduino Nano + 2 × 74HC595, 28C256: protected page write, `programlayici/`, `yaz.py`; for the BIOS EEPROM and the character ROM), static timing analysis from the schematic (`npm run cpu16 -- zamanlama [--anakart]`: first target a **1 MHz CPU**, 8 MHz oscillator, UART at 28,800 baud; a few 74AC chips in the video board's pixel path), board test (`npm run cpu16 -- kart-testi`: the real board is compared with the simulator over UART), build guides (`npm run cpu16 -- kurulum`: per-board layout, power, a numbered wire list block by block and chip cards, PDF; handbook: breadboard, PCB assembly and the continuity (beep) test; `docs/kurulum.md`). The done criterion is met once the boards are built and pass the board test. Details: `docs/uretim.md`.

### Phase 10: experiment kit package, done 2026-10-11 (guides)
- Output: a guide per experiment (parts list, schematic, steps, expected result, simulator scene), BOM, troubleshooting.
- Done criterion: someone can follow the guides from scratch and get from experiment 1 to the snake game.
- Result: `kit/` with 14 experiment guides (13 on the road to snake, the 14th an optional DIY memory board); the parts lists and pin-by-pin connection tables are generated from the board definitions (`npm run cpu16 -- kit`, and tests check that they are current). The test programs for the experiments before the BIOS (`kit/programlar/`) run from EEPROM and can be tried in the simulator with `machine --rom [--led]`. The second half of the done criterion (someone builds it from scratch and reaches snake) will be tested with a real build.

## Repository layout

```
cpu16/
  docs/          spec, roadmap, microarchitecture, parts, boards, motherboard, BIOS, cc16, production
  emu/           reference emulator (phase 1) and the motherboard model Machine (phase 6)
  asm/           as16 assembler (phase 1)
  micro/         microcode source, microcode assembler, clock-cycle model (phase 2)
  chips/         74HC parts library: gate model, transistor expansion, KiCad symbol (phase 3)
  board/         boards as code: CPU, clock, memory, cache, I/O, video, DIY memory, programmer;
                 ERC, timing analysis, KiCad output (phases 4, 6, 9)
  kicad/         generated KiCad schematics and BOMs, one folder per board
  bios/          BIOS, bootloader, board test, sample programs (phase 7)
  video/         character ROM (8 × 16 font)
  cc/ lib/       cc16 C compiler; crt0, rt, libc16 (phase 8)
  programlayici/ Arduino EEPROM (28C256) programmer and yaz.py (phase 9)
  kit/           experiment guides and test programs (phase 10)
  kurulum/       build guides: wire list, chip cards, handbook (HTML + PDF, phase 9)
  programs/      sample assembly programs
  tools/         npm run cpu16 commands
  tests/         vitest tests
src/cpu16/       CPU16 sections inside Silikon3D: workbench, Web IDE (motherboard + BIOS), Web Serial
```

Silikon3D's 3D board view lives under `src/board3d/`; it uses the CPU16 code (`cpu16/`) directly.
