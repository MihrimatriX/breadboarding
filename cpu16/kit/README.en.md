# CPU16 experiment kit

A 16-bit computer built step by step, entirely from 74HC chips, on breadboards. Each experiment is a
video, a scene in the simulator and a module on the real board. At the end you play a snake game,
written with our own C compiler, on a VGA screen.

The **Malzeme ve bağlantılar** (parts and connections) section at the end of each experiment file is
generated automatically from the board definitions (`cpu16/board/*.ts`): which chip goes in, which pin
goes to which net, and which signals you drive by hand in that experiment because they will come from
blocks that aren't built yet. If the schematic changes, the guide changes too
(`npm run cpu16 -- kit`); the tests check that the guides in the repository are up to date. The same
nets carry the same names in the KiCad schematics (`cpu16/kicad/<board>/`) and in the 3D view
(Silikon3D → "CPU16 board 3D").

For the physical build, each board also has a **build guide** (`npm run cpu16 -- kurulum hepsi`,
[docs/kurulum.md](../docs/kurulum.en.md)): a layout map, each chip's power pins and decoupling, a
numbered wire list block by block (color code, from → to; a beep test list on a PCB), pin cards chip by
chip, and the edge connector; alongside it come a PDF of the KiCad schematic and a build handbook
(breadboard, PCB assembly, wire-wrap).

## Two routes: PCB or breadboards

Once the experiments are done, the computer's boards become permanent in one of two ways:

- PCB: the boards are made from the KiCad schematics and the chips go into sockets; the wire list in
  the build guides is a beep test list ([docs/kurulum.md](../docs/kurulum.en.md)).
- Breadboards: each board sits on its own breadboard assembly (a group of BB830s on a base plate: 5 for
  the clock board, 55 for the CPU, 12 each for memory and cache, 18 for I/O, 21 for video, 6 for build
  your own memory), and all the connections between boards run on a 64-conductor ribbon cable (the
  backplane). Each assembly's document is written hole to hole: layout drawings for each breadboard, a
  numbered wire list stage by stage (each stage is one experiment's block, with its test at the end),
  a cut list, parts (`npm run cpu16 -- breadboard-belge hepsi`, [docs/breadboard.md](../docs/breadboard.en.md)).
  The same wires in the app: Silikon3D → CPU16 board 3D → View: Breadboard → Build.

The "Malzeme ve bağlantılar" tables in the experiments are the same for both routes (which pin goes to
which net); for the breadboard assemblies, which hole each of these connections goes into is in that
assembly's document.

## Experiments

**Before you start:** [LEDs, resistors and capacitors](led-ve-direnc.en.md): reading the color code,
LED polarity and the series resistor, pull-up and pull-down resistors, SIP resistor networks, 100 nF
decoupling and breadboard layout, with drawings. Read it once before Experiment 1; the same parts come
up again in every experiment.

| # | Experiment | What you build | Result |
|---|---|---|---|
| 1 | [Clock and reset board](deney-01-saat.md) | clock board (9 chips) | a clock on an LED, single cycles with the ADIM (step) button |
| 2 | [Gates and CMOS transistors](deney-02-kapilar.md) | 74HC00, optionally 4 MOSFETs | NAND truth table, the inside of a NAND |
| 3 | [EEPROM programmer](deney-03-programlayici.md) | Arduino Nano + 2 × 74HC595 + ZIF | a 28C256 gets programmed and verified |
| 4 | [Register file and data bus](deney-04-register.md) | 8 × 16-bit registers | the value on the switches is written to a register and read back |
| 5 | [ALU and flags](deney-05-alu.md) | TA, TB, ALU, ALU decoder, flags | addition, subtraction, logic, shifts; NZCV |
| 6 | [Program counter and instruction fetch](deney-06-komut-cekme.md) | PC, MAR, IR, memory interface | the PC steps forward, instructions are fetched into IR |
| 7 | [Microcode and control unit](deney-07-mikrokod.md) | control unit built from gates, constant unit | the CPU runs: NOP loop, HALT |
| 8 | [Memory board and first program](deney-08-bellek.md) | banked memory: 32 KB EEPROM + 128 KB RAM, FF00 LED latch | the first program, running from EEPROM, tests the 128 KB RAM; `0x5A` on the LEDs |
| 9 | [Wait states and cache](deney-09-onbellek.md) | cache board | with the cache on, the running light is ≈ 1.4 times faster |
| 10 | [I/O board](deney-10-gc.md) | UART, timer, interrupts, PS/2 | serial communication with a computer, keyboard |
| 11 | [Video board](deney-11-video.md) | VGA 80 × 30 text | "Merhaba" on the screen, 16 colors, frame counter |
| 12 | [BIOS, bootloader and Web Serial](deney-12-bios.md) | software | loading programs onto the board from the browser |
| 13 | [C compiler: snake game](deney-13-c.md) | software | a game written in C on the screen |
| 14 | [Build your own memory](deney-14-kendin-yap-bellek.md) | 16 bytes of RAM: 16 × 74HC574 | the inside of a 62256 laid open; bytes in the terminal |

The order follows the hardware dependencies: the clock and the programmer come before everything else
(the programs and the character ROM are written to the 28C256), the CPU is built block by block, and
then the motherboard boards are added. The CPU board has no ROM: the microcode and the ALU decoding are
built from 74HC gates (Experiments 5 and 7). Experiment 14 is a teaching board: the computer doesn't
need it to run, and it plugs into the computer from the first 13 experiments afterwards.

## Tools you need

| Tool | Why |
|---|---|
| 5 V adjustable / current-limited power supply, at least 2 A | The full computer is ≈ 400 chips; at the first power-up the current limit catches shorts |
| Breadboards (830 holes) × 25–35, 0.5 mm solid-core wire | The CPU board alone is ≈ 195 chips. The whole computer on breadboard assemblies: 134 breadboards, ≈ 820 m of 22 AWG wire ([docs/breadboard.md](../docs/breadboard.en.md)) |
| Multimeter | measuring the supply and logic levels |
| Logic probe or an 8-channel USB logic analyzer (sigrok / PulseView) | clock, UART, PS/2 and VGA timing |
| Arduino Nano (a clone works) + ZIF-28 socket | EEPROM programmer (Experiment 3) |
| Helper module: 16-LED display | 2 × 74HC541 + 16 LEDs + 16 × 1 kΩ: watches a bus without loading it |
| Helper module: 16-bit switch input | 2 × 8-way DIP switches + 16 × 2.2 kΩ: drives the bus "weakly", so outputs override it |

Don't connect LEDs straight to the data bus: they load the line, and the level may not count as 1. The
display module's 74HC541 drives the LEDs without loading the line. The switch input drives through
2.2 kΩ, so it doesn't override a register that drives the bus (together with the 10 kΩ pull-down
on the bus, the 1 level is ≈ 4 V). With the CPU board's own data bus bar graphs installed (DS1, DS2,
1 kΩ segments), the switch input can't pull the line up to 1 (≈ 2.7 V): take RN3 and RN4 out of their
sockets while you drive with the switches ([LEDs and resistors](led-ve-direnc.en.md#debug-leds-on-the-cpu-board)).

## General rules

- Each chip's VCC/GND pins go to the power rails, with 100 nF next to the chip. 100 µF on the power
  rail of every breadboard ([why](led-ve-direnc.en.md#decoupling-100-nf-next-to-every-chip)).
- A CMOS input is never left floating: in the table, the **GND** and **VCC** rows show inputs tied to a
  fixed level, and the "▶ elle sür" (drive by hand) note marks inputs that will come from a block that
  isn't built yet. Drive those inputs with a switch and a 10 kΩ pull resistor; remove the switch once
  the block is built.
- Try it in the simulator first: the "Simülatörde" (in the simulator) section of each experiment runs
  the same circuit at gate level. If the real board behaves differently, select the same net name in the
  simulator and compare the levels.
- Boards connect to each other through the backplane signals (see the backplane section of
  `cpu16/docs/kartlar.md`). On the breadboard assemblies this is the 64-conductor ribbon cable that runs
  along the aisle: on each assembly a ribbon cable adapter takes the place of the board's edge
  connector, and the cable has an IDC socket for each assembly
  ([docs/breadboard.md](../docs/breadboard.en.md#backplane-ribbon-cable)). In the experiments, while a
  board doesn't exist yet, the signals that will come from it are driven by hand ("▶ elle sür" in the tables).

## Troubleshooting (general)

| Symptom | Likely cause |
|---|---|
| A chip gets hot | two outputs on the same net (wrong ~OE on a tri-state output), a chip inserted backwards |
| Behavior changes when you touch it | a floating input; check the GND/VCC rows in the table ([pull-up and pull-down resistors](led-ve-direnc.en.md#pull-up-and-pull-down-resistors)) |
| LED doesn't light or is dim, or the chip gets hot | LED polarity, value of the series resistor ([LED and series resistor](led-ve-direnc.en.md#series-resistor-always-drive-an-led-through-a-resistor)) |
| Breaks when the clock speeds up | missing decoupling, long clock wires; if it works correctly in ADIM (step) mode, it's a timing problem |
| Wrong data from the EEPROM | is the chip in the right socket (label)? SUM check on the programmer |
| Differs from the simulator | step through the same program in ADIM mode in the simulator and find the driver of the first net that differs |
