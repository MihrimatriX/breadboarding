# CPU16 computer in 3D

The third section of Silikon3D: **CPU16 board 3D** (`#kart`). The whole computer in one scene: the CPU
board, the clock and reset board, the memory board, the cache board, the I/O board, the video board and
the DIY memory board, together with their backplanes. Today's motherboard has 460 chips, 641 passive
components and ~5,000 gates. All of it runs at gate level in a Web Worker, clock by clock. On screen you
go down from computer → board → chip → gate → transistor, and the signals are live at every level. The
boards do not come from a hand-written list: the view places whatever is in `board.chips` and
`board.passives`. When a new board is plugged in (for example a DIY RAM board built from 74HC574s), it
shows up by itself.

The screen is split like VS Code: on the far left an activity bar (at the top the sections and settings
button, below it the **Program**, **Inspect**, **Tour**, **CPU and UART** and **Build** icons; at the
bottom the bottom panel and focus mode), next to it the chosen panel, and on the right the 3D scene at full
height. When the section opens, the program editor is open on the left. Press the open panel's icon again
to close it and give the scene the whole area. The scene's controls (the "toolbar" below: view, run, clock,
wires, labels) float above the scene; the inside of the selected chip opens in the panel below the scene.

## What you see

| Level | Where | What it shows |
|---|---|---|
| Computer | 3D scene (opening view) | The boards stand in rows. Under each row is a backplane strip: 64 silver bus lines on a dark gray board (live colors in **all** mode and on the signals of the selected net and the selected chip). The boards plug into the backplane like expansion cards on a real motherboard (lying flat): a tongue extends from the board's edge, 64 traces run down it from the connector (J1, J201, …), and the gold fingers at its tip go into a black slot on the backplane. A pin map (which pin carries which signal) is printed on the slot; below the slot each pin drops on a short trace to its own bus line (a gold dot), and the signal travels along that line to the other boards. The rows are joined by a U of the backplane turning on the left (the U flips the strip: in the lower row the lines are in reverse order, and every line runs without a break). At the back is a VGA monitor showing the program's picture. |
| Board | 3D scene | Chips are placed by function block (ALU, Register file, VRAM, Pixel path…). Blocks with many chips become near-square grids. Decoupling capacitors sit next to their chips, and the edge connector is on the bottom edge of the board. The other passives are lined up under their blocks. |
| Passives | 3D scene | Resistors, capacitors, electrolytics, LEDs, resistor networks, connectors, oscillators, buttons, switches, pots, modules and the CPU board's 10-segment bar graphs. Their shapes come from the KiCad footprint. An LED lights when the net driving it is 1; active-low LEDs (VCC → resistor → LED → signal, e.g. `~ROE0`) light when the net is 0. Each segment of a bar graph lights while the signal at the other end of the network is 1: a byte reads bit 0 … 7 from left to right. Passive pins take part in the wiring too. |
| Wires | Toolbar: **Wires** | Pin-to-pin jumper wires. Their colors are live: blue 0, red 1, purple Z, yellow X. Modes below. |
| Wire | Click a wire in the breadboard view | The wire is drawn thick and bright from end to end, with a pulsing ring at each end; the other wires fade. The Inspect panel shows the wire's number, color, length, net and **from → to** (breadboard, hole, the legs on that strip). In build mode the clicked wire becomes the focus. Esc or a click on empty space releases it. |
| Conductor | Click a conductor of the ribbon cable or the backplane | That conductor's signal is selected: the conductor is drawn from end to end as a glowing trace above everything else (on the breadboard inside the cable from socket to socket; on the PCB from the board's tongue into the slot, from the slot to its bus line and along it), the other conductors fade, and on every board the wires of that net take the live color. On the breadboard, the sockets of the panels where the signal has ends are framed, and their labels show the number of ends on that board. The Inspect panel shows which backplane conductor it is, how many ends the signal has on each board, and every end. GND and VCC conductors are not selectable. |
| Chip | Click a chip | The camera flies to a spot where it sees the chip and the far ends of its wires together. The chip's **die** shows on top of its body, as if the lid were open: the gates in the live color of their outputs. Side panel **Connections**: pin no. + name → net → far ends (chip.pin). Bottom panel **Inside the chip**: gate-level schematic or memory array. |
| Gate | Click a gate on the die or in the schematic | The CMOS transistor schematic of that gate. Conducting transistors are green. |
| Net | Click a pin, an endpoint or a net name | All endpoints of the net are joined by a thick wire drawn above everything else. The Inspect panel lists the endpoints of the net. |
| Section | Toolbar: **Labels**; click a label | The board's regions, blocks and chip groups are marked and named. The clicked section's function, how it works and its chips appear in the Inspect panel. See below. |

### View: PCB and breadboard

**View: PCB | Breadboard** in the toolbar shows two physical builds of the same computer (PCB by
default; the browser remembers the choice). The circuit, the simulation, chip selection, the VGA screen
and the program editor are the same in both; only the physical layout changes.

- **PCB**: the boards above, the backplane strips, the wire modes.
- **Breadboard**: seven panels on the table (one base plate per board, 149 BB830s; each module is a
  separate island), with a 64-conductor ribbon cable and IDC sockets in the aisle between them. Every part
  sits in its holes on its own legs; the 7,868 jumper wires are drawn along their build routes (flat,
  right-angled, one continuous tube with rounded bends at the corners) in the color of their insulation
  (color code); the wires of the selected chip or net, all wires in **all** mode, and the conductors of the
  ribbon cable take the color of the live level. The ribbon cable is one piece that runs from socket to socket
  as a chain (as in the build plan): it leaves from under each socket's cover, drops to the table at the
  panel's edge, turns smoothly in its own plane in the aisle and rises to the next socket; it never branches. The breadboard data is a separate
  chunk: it loads only the first time this view is opened.
- **Build** (in the breadboard view): pick a panel and a stage, then step through the wires in numbered
  order; the next wire is highlighted in 3D and its description is shown
  (`CPU · BB07 c14 → BB08 h3, 42 mm, sarı`). Checked-off wires are remembered per panel, and so is the
  selected panel (the board, on the PCB); the selection list shows each panel's progress. The **stage map**
  at the top shows the whole build as one strip (a slice per stage or block, as wide as its wire count,
  filled with the placed wires; click a slice to go to its first open wire). The wire card has a **hole
  map** for each end: the end's hole in the wire's color and the holes on the same strip (or rail)
  highlighted; on the PCB, a drawing of the chip with the pin number. Details:
  [breadboard.en.md](breadboard.en.md).

### Section labels

**Labels: off | sections | detailed** in the toolbar (shortcut `E`; detailed by default, the browser
remembers the choice) writes over the scene what each part of the board does. The texts come from a
single source: `cpu16/board/bolum-bilgi.ts` (hierarchy board → region → block → chip group; the texts
themselves are in `cpu16/board/bolum-metin.ts`, the calculator's in `hesap8/bolum-metin.ts`).

- **In the overview**: on the breadboard each region (the breadboards that do the same job, e.g. "Register
  file") is wrapped in a colored frame with a title plate in the middle that can be read from afar; the
  board's name sits outside the panel. On the PCB each function block gets a frame and a plate. Neighboring
  frames have different colors, and none is red (in the interface red means only an error or logic 1).
  Plates stop growing beyond a certain size on screen and hide when they get very small.
- **Up close** (in detailed mode): the plates fade; along both sides of the screen the labels of the chip
  groups (R0, ALU RESULT SELECTOR, PROGRAM COUNTER…) line up, sorted by the height of their targets and
  without overlapping; a line runs from each label to the nearest chip of its group, and the group's other
  parts on screen are marked with a thin frame. In **sections** mode there are only frames and plates.
- **On hover**: the tooltip shows the section's function. A chip's tooltip and its inspection panel also
  show the label of its group (click it to select the group).
- **On click**: the section is selected and the camera moves to it; its chips are highlighted and the rest
  fade. The **Inspect** tab shows the title, the location (board › region › block), the function, the
  stage and experiment, **How it works**, the build stages, the connections to the outside (signals), the
  subsections and the parts (click one to select the chip). Esc clears the selection (first the gate, net
  or chip, then the section).
- The **Tour** tab walks through the board block by block (7 boards and 61 blocks on the computer, 14
  blocks on the calculator). Previous / Next (or ← →) selects the next section, the camera flies there and
  the section panel opens; click another section in the scene and the tour carries on from its block.
- When a chip is selected, **Inspect** first shows its group's description (**Its job in the circuit**),
  then the **pinout** in datasheet layout (each pin in the color of its live level; click one to select its
  net), then the connections; the VCC and GND pins do not list their other ends.

All plates are drawn in one mesh and the frames as thick lines: one extra draw call in the overview. The
panel map in the breadboard build guides draws the same regions in the same colors
([breadboard.en.md](breadboard.en.md)).

### Wires

- **none**: no wires are drawn.
- **selected chip** (default): the copper traces of the selected chip's (or passive's) nets light up thick
  and in the color of the live level; the part between boards is a line from connector to connector along
  the backplane. **Connections** in the Inspect panel lists the same endpoints. Clicking an endpoint selects
  that component; clicking a net name selects the net.
- **all**: the wiring of the whole computer. Inside a board each net is joined with a minimum spanning
  tree (like a real chain of jumper wires). Boards connect to each other only through their edge
  connectors: wires between boards run along the backplane strip, and between rows through the cable on
  the left. That is about 3,500 wires and 40,000 segments. All of it is a single draw call and is
  recolored only when net values change. While a chip is selected, "all" fades and the selected chip's
  wires stand out.
- **GND/VCC**: power wires are not drawn by default (each board has hundreds of power endpoints). Checking
  the box draws them.

On the PCB every connection inside a board is permanently **etched copper**: like a two-layer board,
the top layer prefers horizontal and the bottom layer vertical, traces also turn within a layer (with 45° chamfered corners) and change layers through a via when needed. The
etched copper sits under the board's green mask; in **all** mode the traces take the color of the live
level, and the wires between boards are thin lines (short wires arc low, long wires arc high). GND and
VCC are not etched as traces (on a real board they are planes). The routing is in
`src/board3d/pcbYol.ts`: A* on the board's 1.27 mm grid, another net's pad or copper is very expensive,
copper of the same net is shared. The whole computer's ~4,700 traces are etched with each board in its own
worker (`pcbYol.worker.ts`) at the same time and appear as they are etched. The boards are very dense: some
traces share a line (a real board would need more layers). The drawing geometry is a set of pure
functions in `src/board3d/wires.ts` and `src/board3d/pcbYol.ts` (with tests).

### VGA screen

At the bottom right of the scene is the **VGA** panel, and in the scene a 3D monitor shows the same picture.

- **Text mode** (default): 80 × 30 characters, 16 colors, cursor. The picture is read from the gate-level
  video board's own memory chips: the character and color lanes of VRAM (two 62256s) and the character
  ROM. The screen refreshes 10 times a second, and only if it changed. The source lives in a single adapter
  (`src/board3d/screen-source.ts`, `findScreenSource`). If the video board changes (for example a
  different VRAM layout or a pixel buffer), only this file changes; the drawing code (`screen.ts`) stays
  the same.
- **Beam mode**: the picture as the monitor sees it. On every pixel clock the lines of the VGA connector
  are read: HSYNC, VSYNC and the color pins. The voltage on the color pins is computed from the DAC
  resistors (R_680, R_1K3) into the 75 Ω monitor input. One frame takes 800 × 525 pixel clocks, which is
  ~20 seconds at gate level. A small cross marks the position of the beam.
- **big / small**: enlarges the panel. **hide**: closes the panel (the monitor in the scene stays).
- **Keyboard**: click the screen and type. The keys go as PS/2 scan codes to the I/O board's PS/2
  connector (clock and data lines, 11-bit frame). `gc-deneme.s` prints the codes as `[1C]`.
- **UART**: the box in the CPU and UART panel shows the bytes going to the UART. Whatever you type in the field
  below it goes from the TX line of the CH340 bridge to the board's RX as 8N1. The bridge waits while the
  board's ~CTS line is 1.

### Inside a memory chip

Clicking a memory chip (62256 SRAM, 28C256 EEPROM) opens its array in the bottom panel:

- row address pins → **row decoder** (e.g. 9 → 512) → word lines;
- a window of 16 rows × 4 bytes from the cell array around the address, with the real contents (1 in red);
- **column selector** (64 : 1, per bit), **sense amplifiers / write drivers** and the I/O buffer;
- data pins and control pins (~CE, ~OE, ~WE), and the current mode: READ, WRITE, not selected…

The active row and column are highlighted live. Clicking a cell opens its transistor schematic. For SRAM a
6-transistor cell is drawn: two cross-coupled inverters, the M5/M6 access transistors, BL/BL̅. For EEPROM
and Flash a floating-gate transistor is drawn: 0 if programmed, 1 if erased. The layout comes from the pin
names and the size (`src/board3d/memview.ts`): address pins are `A0…`, data pins are the bidirectional
ones, the rest are control. If the chip name or title says Flash/EEPROM/ROM, the cell is floating-gate.

### Program editor

The **Program** panel on the left (the top icon of the activity bar):

- **Examples**: kit programs (video-deneme, gc-deneme, bellek-deneme, onbellek-deneme), `hello.s` and
  `merhaba-vga.c`. That C example writes to the UART with printf and also writes to VGA directly.
- **Language**: Auto (C or assembly, judged from clues in the source), Assembly or C.
- **Compile**: compiles only. Errors are listed with line numbers and marked in the margin. Clicking an
  error jumps to its line.
- **Load and run** (Ctrl+Enter): compiles, writes the image to the memory board's EEPROM (28C256, bank 0,
  CPU address 0x0000–0x3FFF) as if a programmer had written it, asserts RESET and runs. The board is not
  rebuilt: as on the real board, the contents of VRAM and RAM survive RESET.

C is compiled with cc16's **rom** target. The program starts at 0x0000 and there is no BIOS. Variables
are in RAM from 0x4000 up, and the stack is below 0xFF00. `printf`, `puts` and `putchar` write characters
to UART_DATA (0xFF00). VRAM is written through ports: VADDR (0xFF20) takes the cell address, VDATA
(0xFF22) first the character code, then the color byte.

### Console

In the browser console, `kart`:

| Command | What it does |
|---|---|
| `kart.durum()`, `kart.uart()`, `kart.ekran()`, `kart.olc()` | CPU state, UART output, the text on the screen, measured speed (Hz) and cycle |
| `kart.calistir()`, `kart.duraklat()`, `kart.sifirla()`, `kart.adim("cycle" \| "instr")`, `kart.hiz(hz)` | clock |
| `kart.ornekler()`, `kart.ornek("merhaba-vga.c")` | load and run an example |
| `kart.yukle(kaynak?, "asm" \| "c")` | compile the source (the editor's if none is given), write it to the EEPROM, run it. Returns the errors |
| `kart.teller("yok" \| "secili" \| "hepsi")`, `kart.besleme(true)` | wire mode, GND/VCC wires |
| `kart.isin(true)` | beam mode |
| `kart.gorunum("breadboard" \| "pcb")` | view (the current one if no argument is given) |
| `kart.bbKurulum("cpu", 3)` | breadboard build mode: selects the panel and the stage; returns the next wire and the counts |
| `kart.tus("dir\n")`, `kart.uartGonder("merhaba")` | PS/2 keyboard and UART input |
| `kart.secCip("U72")`, `kart.secKapi(112)`, `kart.secNet("BUS0")` | selection |
| `kart.cipler()`, `kart.pasifler()`, `kart.kartlar()`, `kart.baglantilar("U72")`, `kart.kapilar("U11")` | lists |
| `kart.etiketler("kapali" \| "bolumler" \| "ayrintili")` | section label mode (the current one if no argument is given) |
| `kart.bolumler("bolge" \| "blok" \| "grup" \| "kart")`, `kart.bolum("grup:cpu:komut-cozucu")` | section ids and labels; select a section (`null` clears it), return the selected one |
| `kart.plakaEkranda(id)`, `kart.kenarEtiketleri()` | a plate's position on screen, the edge labels on screen (for tests) |
| `kart.cizim()` | the last frame's draw calls, triangle count and the canvas resolution (`dpr`) |

Keyboard shortcuts: Space run/pause, `.` one clock cycle, `N` one instruction, `E` label mode, Esc clears
the selection. Shortcuts are off while you type in the editor or on the VGA screen.

## Speed

The whole computer at gate level, in the browser (Chromium, software GL), was measured at ~3,000–4,000
clock cycles per second. That is ~1/1,000 of the 4 MHz real board. A few examples:

- `video-deneme.s`: the first frame counter appears after ~20 s;
- `gc-deneme.s`: the startup text after ~1 s, the UART echo and keyboard codes within a few seconds;
- `merhaba-vga.c`: ~180,000 cycles (including clearing the screen), ~50 s.

The clock selector also offers fixed speeds from 1 Hz to 1 kHz.

### Drawing

The scene is drawn on demand (`frameloop="demand"`): a new frame is drawn only when something changes. The
camera, the selection, the modes, the live net values and the screen request frames; a paused scene with a
still camera is not drawn at all, and typing in the editor does not redraw the scene either (the board
store fields the scene does not read are `KART_SAHNE_DISI` in `store.ts`). Running animations (camera
flights, the pulsing rings in build mode, an LED fading on or off, wires being built step by step) request
frames until they finish. If frames are slow while the camera is dragged (median below ≈ 40 frames/s), the
canvas resolution steps down by half (2 → 1.5 → 1); if they stay fast it steps back up at most twice.
Shaders are compiled in the background before the scene first appears (`compileAsync`; in a browser with
parallel shader compilation the interface does not freeze while a section opens). The engraved PCB traces
are merged into a single mesh once engraving finishes. The rules are in `src/render/cizimDongusu.ts`, the
canvas wiring in `src/render/TuvalCizimi.tsx`; tests in `cpu16/tests/cizim-dongusu.test.ts`.

## Files

- `cpu16/board/layout.ts`: the physical layout of boards, blocks, chips and passives (mm). The board rows
  and backplane strips are defined here. Board titles are in `CARD_TITLES`; a board missing from the table
  is titled "<Ad> kartı" ("<Name> board").
- `cpu16/board/machine-board.ts`: `FULL_MACHINE_CARDS`, the additional boards of the whole computer. The
  view and `buildFullMachineBoard` use the same list.
- `cpu16/board/inside.ts`: the gate schematic layout of a chip, the CMOS schematic of a gate, `GateProbe`.
- `src/board3d/`:
  - `board.worker.ts`: `GateMachine`, pixel clock, PS/2 and UART lines, screen and beam;
  - `store.ts`: state, examples and compilation;
  - `BoardScene.tsx`: scene, wires, passives and monitor;
  - `BoardView.tsx`: the section, panels, editor and console;
  - `MemoryInside.tsx`: memory array;
  - section labels: `bolum.ts` (state: mode, selected section), `bolumSahne.ts` (frame, plate and edge
    label geometry; pure), `Bolumler3D.tsx` (frames, plates, highlight and camera in the scene),
    `BolumKatmani.tsx` (edge labels and their lines, tooltip), `BolumPanel.tsx` (toolbar choice, side
    panel); tests `cpu16/tests/bolum-bilgi.test.ts`, `bolum-3d.test.ts`, `bolum-belge.test.ts`;
  - pure helpers: `wires.ts`, `screen.ts`, `screen-source.ts`, `beam.ts`, `serial-in.ts`,
    `program.ts`, `memview.ts`.
- `src/board3d/ornekler/`: the editor's own examples (`merhaba-vga.c`).
- Breadboard view: `src/board3d/aktif.ts` (view choice, panels), `Breadboard3D.tsx` (breadboards, wires,
  ribbon cable), `telYolu.ts` (the wire tube's axis, the clicked wire), `Serit3D.tsx` and `serit.ts` (ribbon
  cable, backplane traces, IDC sockets, the clicked conductor), `bbKurulum.ts` and `BbKurulumPanel.tsx` (build mode); the plan is in `cpu16/breadboard/`
  ([breadboard.en.md](breadboard.en.md)). Tests: `cpu16/tests/breadboard-3d.test.ts`.
- Tests: `cpu16/tests/view.test.ts`. It covers:
  - the layout of the whole computer and the pin-to-net mapping;
  - wire geometry, trees and backplane routes;
  - VRAM → screen and the screen source;
  - the VGA connector and the DAC;
  - PS/2 and UART frames;
  - language detection and the EEPROM image (byte for byte equal to `romImage()`);
  - compiling and running the C example;
  - 62256, 28C256 and SST39SF010A memory layout.

## Limits

- Memory chips (SRAM, EEPROM, Flash) are behavioral models. Their insides are drawn through a sample
  window, not as gates.
- The pixel clock is processed in batches between CPU cycles (~6.3 pixel clocks per CPU cycle). In beam
  mode one frame takes ~20 s.
- On cc16's rom target `putchar` does not wait for TX_EMPTY. The UART box shows every byte the CPU writes
  to UART_DATA; at that rate not every frame may make it out on the I/O board's real TX line.
- With software GL (virtual machine, no GPU) the scene draws a few frames per second; in a browser with a
  GPU it is smooth. In the overview the breadboard takes ≈ 387 draw calls and 713k triangles, the PCB
  (after the traces are engraved) ≈ 335 and 564k (`kart.cizim()`).
- The transistor schematic is a logical layout, not the real chip mask.
- The earlier 153-chip CPU + test memory view gave way to the whole computer (the CPU16 workbench
  section remains).
