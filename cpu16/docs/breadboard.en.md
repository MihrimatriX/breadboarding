# CPU16: the whole computer on breadboards

CPU16 has two physical build paths: **PCB** (boards from the KiCad schematics, chips in sockets;
[kurulum.en.md](kurulum.en.md)) and **breadboard**. This document covers the breadboard path: the seven
boards of the motherboard on seven panels, each panel a group of full-size breadboards (BB830) stuck to a
base plate, and every connection between boards through one 64-conductor ribbon cable. The circuit is the
same: the same chips, the same nets, the same backplane; only the physical layout and the wires change.

```sh
npm run cpu16 -- breadboard                       # dimensions, power, ribbon cable; checks connectivity against the netlist
npm run cpu16 -- breadboard --uret [kart,…]       # regenerate placement and wires (cpu16/breadboard/veri/)
npm run cpu16 -- breadboard-belge hepsi           # build guides (HTML + PDF) → cpu16/breadboard/cikti/
npm run cpu16 -- breadboard-belge cpu -o dizin    # a single board, into another directory (--html: HTML only)
```

In the app: Silikon3D → **CPU16 board 3D** → **View: PCB | Breadboard** in the toolbar (PCB by default;
the browser remembers the choice). In the breadboard view the **Build** button opens the wire-by-wire
build mode (below).

## At a glance

| | |
|---|---|
| Panels | 7 (one per board), in two rows facing the aisle in the middle; table ≈ 1,720 × 1,560 mm |
| Breadboards | 149 full-size BB830s (63 columns, a–e / f–j, two rails each at the top and bottom, continuous rails); the breadboards of a module touch, with ≈ 20 mm gaps between modules (each module is an island) |
| Parts | 460 chips, 678 passive components and modules (the PCB's 641 passives + 37 breadboard-only power inputs and 100 µF capacitors); 39 debug LEDs and 26 bar graphs on the CPU board |
| Wires | 7,868 jumper wires (602 of them rail jumpers), 852 m hole to hole, 983 m cut length, 108 mm on average |
| Long wires | 94.6% are shorter than 300 mm; the longest is 1,534 mm (CPU board, because it is laid out module by module: see below) |
| Backplane | 64-conductor flat ribbon cable, 7 IDC sockets (2 × 32), ≈ 3,300 mm cut |
| Power | a single 5 V supply, ≈ 1.7 A worst case (datasheet values, all LEDs lit); 22 power inputs, star wiring |
| Verification | connectivity is built only from the physical model with union-find: every panel, the end of every stage and the whole machine match the netlist exactly |

## Why one panel per board

On the PCB every board is a separate board that plugs into the backplane; on breadboards every board gets
its own panel too. That way:

- the board's circuit, experiment order and tests stay the same as on the PCB: a panel is built through its
  own stages and tested before the ribbon cable goes on (in Experiment 1 the clock board works on its own);
- taking a panel apart or moving it to another table means unplugging one socket;
- wires stay short inside a board: only that board's nets decide where its blocks go.

Inside a panel the breadboards are arranged in data flow order: next to the adapter (the backplane
connection) go the blocks that talk to the backplane the most (address decoding, bus buffers), farther away
the internal blocks. Each breadboard gets at most 4–5 logic chips, to leave room for the wires between them.

```
back row (adapters on the front edge):       cache 2×6     CPU 5×15     memory 2×6
──────────────────── aisle (140 mm): 64-conductor ribbon cable ────────────────────
front row (adapters on the back edge):    DIY 1×6  clock 1×5  video 3×7  I/O 3×6
                                          (buttons, VGA, PS/2, USB-serial on the front edge: close to you)
```

| Panel | Breadboards | Base | Chips | Wires | Cut | Longest | > 300 mm | Current | Inputs | Stages (experiment) |
|---|---|---|---|---|---|---|---|---|---|---|
| Clock and reset (`clk`) | 1 × 5 | 191 × 363 mm | 10 | 146 | 9 m | 284 mm | 0 | 44 mA | 1 | base; oscillator, reset, buttons (1); clock generation (1) |
| CPU (`cpu`) | 5 × 15 | 871 × 942 mm | 210 | 3,914 | 559 m | 1,534 mm | 343 | 969 mA | 10 | base; register file (4); ALU (5); PC, MAR, IR (6); control unit (7) |
| Memory (`bellek`) | 2 × 6 | 376 × 439 mm | 34 | 670 | 89 m | 617 mm | 19 | 179 mA | 2 | base; address decoding (8); EEPROM and RAM (8) |
| Cache (`onbellek`) | 2 × 6 | 356 × 398 mm | 46 | 718 | 68 m | 579 mm | 13 | 162 mA | 2 | base; I/O decoding, wait states (8); tag and data memory (9) |
| I/O (`gc`) | 3 × 6 | 541 × 439 mm | 65 | 928 | 98 m | 737 mm | 24 | 165 mA | 3 | base; address decoding (10); UART (10); timer and interrupts (10); PS/2 (10) |
| Video (`video`) | 3 × 7 | 521 × 475 mm | 73 | 1,080 | 121 m | 660 mm | 16 | 191 mA | 3 | base; CPU interface and VRAM (11); pixel clock (11); pixel path, DAC (11) |
| DIY memory (`kyb`) | 1 × 6 | 191 × 398 mm | 22 | 412 | 39 m | 396 mm | 8 | 22 mA | 1 | base; address decoding (14); memory cells (14) |

The base plate sizes include the ≈ 20 mm gaps between modules (the breadboards of a module touch and
separate modules are separate islands, so even from a distance you can see which breadboards work together
on one job).

### CPU panel: module by module, island by island

The CPU panel reads like the breadboard computers of James Sharman and Ben Eater: each breadboard has one
job, the breadboards of a module touch, and there are ≈ 20 mm gaps between modules (each module is a
separate island on the base plate). In the 3D view every island sits on a base in its own color and, seen
from afar, carries a large title: **REGISTER FILE, BUS CONTROL, IMMEDIATE UNIT, ALU, FLAGS, CONTROL UNIT,
PROGRAM COUNTER, MEMORY INTERFACE**. In the overview the wires are drawn faded so the modules stand out. Up
close each breadboard's own label appears ("R0", "ADDER", "R0 INDICATORS" …; on a breadboard with
indicators the label is written next to the LEDs and bar graphs, so it does not cover them). Which
breadboard is which is written in the `duzen` table in `cpu16/breadboard/panolar.ts`; the build guides
(map, breadboard drawings) use the same names. On a single-job breadboard the chips are placed in reference
order (low bits on the left); arrays made of the same chip (logic unit, result selector, immediate unit)
are dealt out to their breadboards in order.

```
        1                  2                  3                  4                  5
back    R0                 R1                 R2                 R3                 reg. decoders, clocks
        R0 indicators      R1 indicators      R2 indicators      R3 indicators      bus indicators
        R4                 R5                 R6 (SP)            R7 (LR)            register select
        R4 indicators      R5 indicators      R6 indicators      R7 indicators      bus decoder, pull-ups
        ─────────────────────────────── immediate unit ───────────────────────────────────────────────
        imm. bit 0–7       imm. bit 0–7       imm. driver        imm. bit 8–15      imm. bit 8–15
        ───────────────────────────── ALU ───────────────────────────────────────── flags ────────────
        ALU ctrl gates     adder input        adder              overflow, C/V, drv flags, condition ●
        ALU ctrl gates     adder input        adder input        TA, TB ●           flag driver
        logic bit 0–7      logic bit 0–7      logic bit 8–15     logic bit 8–15     flag input, gates
        ALU op, decoder    result selector    result selector    result indicators  zero detect
        ─────────────────────────────── control unit ─────────────────────────────────────────────────
        microcode gates    microcode gates    microcode gates    microcode gates    HALT/fault, status ●
        microcode gates    microcode gates    microcode gates    control register   control gates
        instr. decoder     microcode gates    microcode gates    microcode gates    step decoder, counter ●
        step selectors     step selectors     step selectors     IR, clock gates    IR indicators
        ─────── program counter ────────────── memory interface and MAR ──────────────────────────────
        PC indicators      PC driver          MAR ind., memory ● MAR                byte lanes
front   PC                 PC                 memory gates ▲     memory gates       byte read
                                              (▲ ribbon cable adapter; ● LEDs next to the chips)
```

Regions from back to front: the register file with bus control to its right, the immediate unit, the ALU
with the flags to its right, the control unit (IR included), the program counter and the memory interface /
MAR. Each region is a rectangle; a module's place inside its region is the one that gives the shortest
estimated wire length.

The price is wire: in a module-by-module layout the 16-line bus goes to every register breadboard, and the
A, B and result lines run from breadboard to breadboard between the ALU's bit slices; the indicators
(26 bar graphs, each with 8 wires and a resistor network) and the gaps between modules need wire too. The
CPU panel has 75 breadboards, 3,914 wires, 494 m hole to hole; 343 of its wires are longer than 300 mm (the
longest is `BUS5`, 1,534 mm: from the register file to the front edge). At the 1 MHz target the long wires
are not a timing problem ("Limits and risks").

### Debug LEDs and bar graphs

The indicators are there for debugging: which register is being read or written, who drives the bus, when
memory is read or written; and what value sits on the bus, in the registers, in the PC, on the address, in
the IR and at the ALU result. All of them are driven straight from 74HC outputs (≈ 3 mA through 1 kΩ); no
complex chips. There are 39 single LEDs (for active-low signals the LED is connected from VCC to the signal
and lights when the output is 0), 26 ten-segment bar graphs (each one a byte, bit 0 on the right) and an
8 × 1 kΩ resistor network next to each bar graph. Each indicator's breadboard sits right next to the module
it shows (`grup+` in `duzen`):

| Indicator | Breadboard | Color |
|---|---|---|
| The value of R0–R7 (16 bar graphs), read `~ROE` and write `~WSEL` LEDs | the breadboard in front of each register | bar graph yellow, read green, write amber |
| The value of the internal bus (2 bar graphs), the source driving the bus (`~SRC_REG/ALU/PC/MEM/IMM/FLAGS`) | bus indicators | yellow; source white |
| ALU result (2 bar graphs) | result indicators | yellow |
| TA and TB load | the TA, TB breadboard | amber |
| N, Z, C, V, I flags | flags breadboard | blue |
| Micro-step `STEP0–3`; HALTED, FAULT | at the end of the step counter and HALT / fault breadboards | yellow; HALTED amber, FAULT red |
| The value of IR (2 bar graphs), IR load | IR indicators | yellow, amber |
| The value of PC (2 bar graphs; bit 0 is always 0), PC load and increment | PC indicators | yellow, amber |
| MAR address (2 bar graphs), MAR load; memory read `MEMRD` and write `MEMW` | MAR indicators and memory LEDs | yellow, amber; read green, write amber |

To keep the register values visible at all times, the outputs of each register's two 74HC574s are always
enabled and drive its bar graphs; two 74HC541s put the register on the bus (CPU board 194 → 210 chips,
timing unchanged: [uretim.en.md](uretim.en.md)). In the 3D view the LEDs and bar graph segments light up
from the simulation. The worst-case current (all segments lit) on the CPU panel is ≈ 969 mA, about half of
that in practice; that is why the back row of the CPU panel has power inputs too (below). In Experiment 4,
when you drive the bus with the 2.2 kΩ switch module, remove the resistor networks of the bus bar graphs
(RN3, RN4): with them in place the line only reaches ≈ 2.7 V
([kit/led-ve-direnc.en.md](../kit/led-ve-direnc.en.md)).

## Backplane: ribbon cable

On the PCB every signal between boards goes through the backplane (`BACKPLANE`, 2 × 32 edge connector). On
breadboards the backplane is a **64-conductor flat ribbon cable with 1.27 mm pitch** running along the
aisle, with one **2 × 32 female IDC socket** crimped onto it for each panel. On the panel side, in place of
the board's edge connector (J1, J201, J401 …), sits a **ribbon cable adapter**: similar to a T-cobbler, with
a 2 × 32 male IDC header on top and 64 legs underneath that straddle the channel (odd-numbered pins in row f,
even-numbered pins in row e, across 32 consecutive columns). On a flat ribbon cable conductor n is pin n of
the socket, so every panel sees the same 64 lines in the PCB's pin order.

| Option | Pros | Cons |
|---|---|---|
| **Ribbon cable + adapter (chosen)** | not a single wire between panels; the same structure as the PCB; a panel comes off with one socket; every connection between boards is one short path | a 64-leg adapter on every panel (if there is no ready-made one, it is built on perfboard with two headers), dense wiring around the adapter, an IDC crimping tool |
| Individual jumper wires between panels | no extra parts | hundreds of long wires (the backplane's 52 signals and power, panel to panel), cannot be taken apart, impossible to trace when debugging |
| A separate cable per board + a shared backplane board | short cables | a new PCB, which defeats the purpose of the breadboard build |

The cable is ≈ 3.28 m long (from socket to socket along the aisle, including the detour up to the panel
and back at each socket; with a 10% margin). The sockets are crimped at these distances from the start of
the cable (also listed in the index document):

| Order | Panel | Adapter | From the start of the cable |
|---|---|---|---|
| 1 | DIY memory | J801 | 120 mm |
| 2 | Cache | J501 | 500 mm |
| 3 | Clock and reset | J201 | 880 mm |
| 4 | Video | J702 | 1,570 mm |
| 5 | CPU | J1 | 1,860 mm |
| 6 | I/O | J603 | 2,510 mm |
| 7 | Memory | J401 | 3,160 mm |

The price is paid in timing: the cable adds ≈ 15–20 ns of delay and crosstalk between conductors to the
backplane lines (CLK is on conductor 5, with VCC and WR_WIN on either side; no GND conductor sits in
between). At the first target, a 1 MHz CPU clock ([uretim.en.md](uretim.en.md): worst case from the
schematic 1.21 MHz), this delay does not matter. Lay the cable without folds and without tension; at every
socket the red-striped conductor 1 must go to pin 1 of the adapter (▲). Conductors 1, 2, 62 and 64 are GND,
3, 4 and 63 are VCC: after crimping, beep it out end to end.

## Inside a panel: rules

Placement and wires are generated by the shared breadboard engine (`cpu16/board/breadboard/`; the same
engine and the same rules as the 8-bit calculator):

- **Placement.** Logic chips are distributed to breadboards region by region (the blocks of a stage) with
  simulated annealing (seeded: the same result on every run) and spaced evenly across the columns of a
  breadboard; no breadboard is left empty. On the CPU panel annealing may put each chip only on the
  breadboards of its own module (`duzen`, above). Wide DIPs (62256, 28C256; 15.24 mm) sit in rows d and h.
  Each chip's 100 nF sits right above the chip, between the top pair of rails. Hand-placed parts (resistor
  networks, LEDs, buttons, switches, oscillators, modules) go at one end of the breadboard in their own
  columns.
- **Wires.** They lie flat and run only horizontally and vertically (90° bends), never over chip or part
  bodies; one end per hole. Each net is built from the 5-hole strips of its pins and the wires that join
  them (A*, rip-up and reroute passes, no overlaps). Power legs and tied inputs go to the nearest rail.
- **Rails.** On every breadboard the top and bottom + rails, and the top and bottom − rails, are joined by
  rail jumpers at the right end of the breadboard; jumpers between breadboards run from row to row (back to
  front, at the left end) and side by side along the backmost and frontmost rows; between breadboards whose
  columns are offset, the jumper goes around through the gap between modules. 602 rail jumpers. The rails
  are assumed to run unbroken end to end (BB830); on breadboards whose rails are split in the middle, the
  two halves of each rail are jumpered separately (the guides warn about this).
- **Longest wire 300 mm.** Longer connections are split in two at an empty strip along their route (a
  **transfer strip** that only wires visit). Across the whole machine 94.6% of the wires stay short; the
  remaining 423 (343 of them on the CPU board, between breadboards of the 5 × 15 panel laid out module by
  module) are long because no empty strip is left along their route: 212 data, 130 control, 29 select,
  28 address, 13 clock, 10 reset and interrupt lines, 1 external connection (clock wires below, under
  "Limits and risks").
- **Build order.** Stage by stage (a stage is a block in the experiment guide); within a stage first the
  rail jumpers, then power (red / black), then signals, breadboard by breadboard from left to right. At the
  end of each stage every net of the parts placed so far is complete, so the stage's test can be run.
- **Order-sensitive wires (↥).** In very crowded spots (next to wide chips) the router may run a wire over
  the end of a wire placed earlier: 26 wires on the memory board, 6 on the video board. The list puts these
  after the wire beneath them; the guide marks them with ↥.
- **Color code** is the same as in the PCB build guides and for wire-wrap wire
  ([kurulum.en.md](kurulum.en.md#wire-color-code)): red +5 V, black GND, yellow address, blue data, orange
  select and enable, green control, white clock, purple reset and interrupt, brown external connection.
- **Cut length** = the hole-to-hole route + 8 mm at each end (≈ 6 mm stripped end + 2 mm down into the
  board). The cut list goes color by color, with lengths rounded to 5 mm; 22 AWG (0.64 mm) solid wire.

## Power

A single regulated 5 V supply (at least 2 A, preferably 3 A) feeds a distribution block; from there a
separate pair of leads goes to every power input of every panel (star wiring). The inputs sit along the
adapter's row of breadboards, one per breadboard column (a 2-pin header or a screw terminal, to the + and −
rails), each with a 100 µF capacitor next to it: the board's own 100 µF (C1, C204 …) at the first input; the
ones at the other inputs are breadboard-only extra parts (CB…). The CPU panel is long (15 rows) and its LEDs
draw a lot of current, so its back row has five more inputs (JB6–JB10, `ekBesleme` in the panel
definition), and each breadboard is fed from the nearest input. The VCC and GND conductors of the ribbon
cable also tie the panels together, but the main current comes through each panel's own leads.

The current is computed from the parts' datasheet values (the same table as the budget in the PCB build
guides, `kurulum/plan.ts` `akim`): the current of every breadboard farther from the input flows through the
rails and jumpers in between (≈ 50 mΩ per jumper: rail strip, two contacts and a 22 AWG jumper; separately
on the + and − rails) and causes a drop. The worst panel is the cache board: its more heavily loaded input
carries ≈ 139 mA, with ≈ 59 mV of drop at the farthest breadboard (comfortably inside the 4.5–5.5 V range
of 74HC). The CPU panel's current is the LEDs' worst case (all segments lit).

| Panel | Inputs | Current | Most loaded input | Drop at the farthest breadboard |
|---|---|---|---|---|
| Clock and reset | 1 | 44 mA | 44 mA | ≈ 13 mV |
| CPU | 10 | 969 mA | 135 mA | ≈ 35 mV |
| Memory | 2 | 179 mA | 134 mA | ≈ 56 mV |
| Cache | 2 | 162 mA | 139 mA | ≈ 59 mV |
| I/O | 3 | 165 mA | 117 mA | ≈ 54 mV |
| Video | 3 | 191 mA | 116 mA | ≈ 35 mV |
| DIY memory | 1 | 22 mA | 22 mA | ≈ 6 mV |
| **Total** | **22** | **≈ 1,732 mA** | | |

## Verification

`cpu16/board/breadboard/dogrulama.ts` never looks at the router's internal state: it builds connectivity
only from the physical model (the breadboards' 5-hole strips and rails, rail jumpers, jumper wires, the legs
in the holes, and the ribbon cable conductors between panels) and compares the conducting groups it finds
with union-find against the netlist. It checks that every part appears once with each of its legs in a
hole; that the hole really exists; that no hole holds two things; that wires are only horizontal / vertical;
that no wire crosses a body, a leg or (except for the order-sensitive wires) a wire end; and that there are
no open circuits and no shorts.

- **Board by board**: each panel on its own (nets that go to other boards end at the adapter), and also at
  the end of every stage with whatever has been placed so far.
- **Whole machine**: 7 panels + ribbon cable = the motherboard netlist: 2,054 nets, 10,401 pins, 7,868 wires.
- **Broken copies**: the tests also check that the verifier catches errors: a missing wire, an end moved to
  another strip, a wire crossing a body, two ends in one hole, an unplugged socket.
- The stored data (`breadboard/veri/*.ts`) carries a fingerprint of the netlist: if the circuit changes,
  the plan is not built and the test tells you to run `npm run cpu16 -- breadboard --uret`.

Tests: `cpu16/tests/breadboard.test.ts` (connectivity, rules, colors, lengths, power, placement, guides),
`cpu16/tests/breadboard-3d.test.ts` (3D view and build mode).

## Build guides

`npm run cpu16 -- breadboard-belge hepsi` produces one guide per board and an index (A4, HTML + PDF):

```
cikti/README.md                       index: board, breadboard, wire and page counts
cikti/breadboard-dizin.pdf|html       whole machine: panel positions, ribbon cable (socket positions,
                                      conductor → signal), power, cut list of all wires
cikti/<kart>-breadboard.pdf|html      the board's panel
```

The sections of a board guide: cover (dimensions, contents); how to read it (hole names, rails, color code,
parts, adapter); the panel map (breadboards, the chip groups on them, stages; each region framed and
labeled in the same color as in the 3D view) and **Sections** (each region's function and how it works,
under it the function of its chip groups, their parts and breadboards; texts from
`cpu16/board/bolum-bilgi.ts`) and its place in the machine; power (inputs, the 100 µF capacitors, budget,
first power-on measurement); stages and tests (each stage's breadboards, chips, wire range, experiment
guide); breadboard-by-breadboard layout drawings (chips, passives and wires in their own colors, wires that
leave the breadboard cut off at the edge; chip group labels above, a parts table below); the numbered wire
list (checkbox, T0001 …, from → to hole by hole, mm, cut, color, net; a test line at the end of each stage);
the cut list (color and length); the bill of materials (breadboards, base plate, adapter, IDC socket, power
inputs, wire length per color, chips, passives, tools).

Page counts (all guides, 2026-10): clock 14, CPU 130, memory 27, cache 28, I/O 38, video 41,
DIY memory 19, index 10.

Hole names: `BB07 c14` = row c, column 14 of BB07; rails are `BB07 üst+16`, `üst−`, `alt−`,
`alt+` (üst = top, alt = bottom). BB01 is the back left corner of the panel, numbered row by row from left
to right.

## 3D: view and build mode

- **View: PCB | Breadboard** (toolbar, `kart.gorunum("breadboard")`): in breadboard view all panels are on
  the table with the ribbon cable in the aisle (its conductors in the color of the live level). Wires are
  drawn in the color of their insulation (color code); when a chip or net is selected, the wires of those
  nets, and in **Wires: all** mode every wire, take the color of the live level (0 blue, 1 red). Clicking a
  chip, the VGA screen, the program editor, the clock and the console work as in the PCB view. The
  breadboard data is a separate chunk and loads only when this view is opened. The choice is remembered in
  `localStorage` (`cpu16.kart.gorunum`); without it, PCB.
- **Modules**: every module (region) of every panel is a separate island on a base in its own color; from
  afar you see its large title, up close the breadboard labels. In the overview the wires are faded and the
  modules and indicators stand out. The CPU board's LEDs and bar graphs light up from the simulation: while
  a program runs you can follow which register is being read or written, when memory is accessed, and the
  values.
- **Build** (in the breadboard view; from the console `kart.bbKurulum("cpu", 3)`): pick a panel and a stage;
  step through wire by wire, and the next wire is highlighted in 3D with its description:
  `CPU · BB07 c14 → BB08 h3, 42 mm, sarı`. Checked-off wires are remembered in the browser per panel; when
  a stage is opened, its test is shown.
- **Speed** (Chromium, software GL, virtual machine without a GPU): the PCB view takes ≈ 106 draw calls and
  233k triangles; the breadboard overview ≈ 173 draw calls and 525k triangles (in software GL a frame takes
  ≈ 1.5 times as long as on the PCB); a close-up ≈ 72 draw calls. The wires are merged into one chunk per
  breadboard row of a panel; the tubes are built lazily near the point the camera looks at, with a time
  budget per frame. In a browser with a GPU it is smooth.

## Limits and risks

- **Speed.** Breadboard strips and long wires add picofarads to every line; the first target is a 1 MHz CPU
  clock (as on the PCB). The riskiest spot is the video board's pixel clock (25.175 MHz, 74AC161 /
  74AC74): the wires of `VID_OSC` are 53–198 mm, `V_PIX`'s is 241 mm. If the picture flickers, check the
  decoupling of the oscillator and the 74AC chips first, then the pixel clock edges with a logic analyzer.
- **Long clock wires.** The router does not treat clock nets differently from other nets: 13 clock wires are
  longer than 300 mm. On the CPU board the register clocks (`CLK_R0`, `CLK_R1`, `CLK_R2`, `CLK_R4`, `CLK_R5`,
  `CLK_R6`: from the clock gate breadboard to the R0–R7 breadboards) are 424–1,128 mm, `CLKR` 381–610 mm,
  `CLK_TA` 528 mm, `CLK_TB` 724 mm, `CLK` 566 mm; on the memory board `TCLK` is 475 mm, on the video board
  `V_H2` 310 mm. A meter of wire adds ≈ 5 ns of delay (0.5% of the period at 1 MHz), but long wires are
  prone to ringing and crosstalk: lay these wires flat and apart from the others, and at first power-on
  measure the clock edges with a logic analyzer.
- **Long wires.** 423 wires are longer than 300 mm (the longest is 1,534 mm, between breadboards on the CPU
  board). Lay them over the others, without tension.
- **The adapter** is not an off-the-shelf product: it is built on perfboard with a 2 × 32 header and two
  rows of 1 × 32 long-leg pin headers (7.62 mm between the rows).
- **Current** figures are typical datasheet values, with the LEDs at their worst case (all segments lit);
  at first power-on set the supply's current limit to ≈ 300 mA and raise it panel by panel.
- Placement and wires are generated (`breadboard/veri/`, never edited by hand); when the circuit changes,
  `npm run cpu16 -- breadboard --uret` regenerates all of them (from a few seconds to a minute per board)
  and the wire numbers may change: print the guides again.

## Files

| File | Contents |
|---|---|
| `cpu16/board/breadboard/` | shared engine (shared with the calculator): BB830 geometry, part footprints and annealing (`yerlesim.ts`), wire routing (`yonlendirme.ts`), plan and build order (`plan.ts`), verification (`dogrulama.ts`), 3D layout (`gorunum.ts`), breadboard drawings (`cizim.ts`), section markings in the guides (`bolum-belge.ts`: map frames, Sections, group labels on the drawings), wire colors (`renk.ts`) |
| `cpu16/breadboard/panolar.ts` | panel definitions: breadboard grid, regions, stages and their tests, order in the machine |
| `cpu16/breadboard/yerlesim.ts` | placement of the CPU16 boards: adapter, power inputs, hand-placed parts, annealing |
| `cpu16/breadboard/plan.ts` | the plan of a board and of the whole machine, panel positions on the table, ribbon cable, verification, 3D layout |
| `cpu16/breadboard/besleme.ts`, `renk.ts` | power budget; color code (same as the PCB guides) |
| `cpu16/breadboard/veri/` | generated placement and wires (one file per board), with the netlist fingerprint |
| `cpu16/breadboard/cli.ts`, `belge.ts`, `belge-cli.ts` | the `breadboard` and `breadboard-belge` commands, the guide generator |
| `src/board3d/aktif.ts`, `Breadboard3D.tsx`, `bbKurulum.ts`, `BbKurulumPanel.tsx` | 3D view choice, panels and ribbon cable, build mode |
| `cpu16/board/bolum-bilgi.ts`, `bolum-metin.ts`, `bolum-cizim.ts` | sections (board → region → block → chip group) and their texts; geometry and colors of the region frames (shared by 3D and the guides) |
