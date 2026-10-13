# CPU16: build guides

When you build the boards for real, these answer the question "which pin goes where": a printable build
guide per board (A4, HTML + PDF), the PDF of the board's KiCad schematic next to it, and a general build
handbook. All of them are generated from the board definitions (`cpu16/board/*.ts`); when the schematic
changes, the guides change too.

The computer has two build paths. The wire lists in this document are **pin to pin**: the continuity
(beep) test on the PCB, and the wires to place on the breadboard in the experiments. For building the whole
computer **on breadboards** there are separate **hole-to-hole** guides: every board on its own panel (a
group of BB830s), breadboard-by-breadboard layout drawings, a numbered wire list stage by stage, a cut list,
and a 64-conductor ribbon cable between the boards (`npm run cpu16 -- breadboard-belge hepsi`,
[breadboard.en.md](breadboard.en.md)).

```sh
npm run cpu16 -- kurulum hepsi            # every board of the computer + the handbook → cpu16/kurulum/cikti/
npm run cpu16 -- kurulum cpu              # a single board
npm run cpu16 -- kurulum hepsi -o dizin   # into another directory
npm run cpu16 -- kurulum hepsi --html     # HTML only (no PDF and no schematic PDF)
npm run cpu16 -- kurulum hesap            # the 8-bit calculator (a standalone device, not part of "hepsi"; its guide is in hesap8/docs/)
```

Output (not committed, see `.gitignore`):

```
cikti/README.md                     index: boards, page and wire counts
cikti/kurulum-el-kitabi.pdf|html    general handbook
cikti/<kart>/<kart>-kurulum.pdf|html  board guide
cikti/<kart>/<kart>-sema.pdf        KiCad schematic (kicad-cli sch export pdf)
```

PDFs are printed with Chromium (the `playwright` package must be installed in the repository or
globally); if it cannot be found, only HTML is written, and you can open the HTML in a browser and use
"Print → PDF". The schematic PDF needs `kicad-cli` (KiCad 7).

## Boards and paths

The experiments (1–8) are built on breadboards; the full computer on PCB (boards from the KiCad
schematics, chips in sockets) or on breadboard panels ([breadboard.en.md](breadboard.en.md): seven panels,
149 breadboards, ribbon cable). The wire list in these guides is pin to pin: the wires to place on the
experiments' breadboards, and the continuity test list on the PCB. The hole-to-hole wire list for the
breadboard panels is in the breadboard guides.

| Board | Experiment | Source definition | Path |
|---|---|---|---|
| `clk` clock and reset | 1 | test computer | breadboard → PCB or breadboard panel |
| `prog` EEPROM programmer | 3 | programmer | breadboard |
| `cpu` CPU | 4–7 | test computer | breadboard → PCB or breadboard panel |
| `mem` test memory board (FF00 latch only) | 8 | test computer | breadboard |
| `bellek` | 8 | motherboard | breadboard → PCB or breadboard panel |
| `onbellek` | 8, 9 | motherboard | breadboard → PCB or breadboard panel |
| `gc`, `video`, `kyb` | 10, 11, 14 | motherboard | PCB or breadboard panel |

The source definition is the same one the KiCad schematic uses (`board/kicad-files.ts`), so unnamed nets
(N123) have the same names in the guide and in the schematic. The CPU and clock boards have the same chips
and the same wires in the test computer and in the motherboard (a test checks this). The RAM block of the
test memory board exists only in simulation (`kit/deneyler.ts`, `SADECE_SIM`) and is left out of the guide.

## Sections of a board guide

1. **Cover**: the board's job, counts of chips / passives / wires / power pins, experiments, build path.
2. **Materials**: chips (74AC parts listed separately), passives, sockets for the PCB, power budget.
3. **How to use it** and **wire color code**.
4. **Placement map**: the suggested placement (the same as in the 3D view, `board/layout.ts`), blocks in
   color, a 20 mm grid (a chip's "location", e.g. C4). Notch on the left, pin 1 at the bottom left.
5. **Build order** and **block maps**: blocks in experiment order; each block's chips, the glue chips whose
   gates it uses, passives and wire range.
6. **Power**: each chip's VCC / GND pin, decoupling, inputs tied to 0 / 1; the power leads of passives.
7. **Wire list**: checkbox, wire number, color (swatch + name), from → to, net, ≈ mm.
8. **Chip cards**: DIP pinout (notch up), each pin's net, color, backplane pin and wires.
9. **Passive components**, **edge connector** (2 × 32 backplane; the pins this board drives / reads), **schematic**.

## How the wire list is generated

`kurulum/plan.ts`, `kurulumPlani(board, kart)`:

- The endpoints of every signal net (VCC / GND excluded) on the board (chip pins, passive leads, edge
  connector) are joined by a tree: number of wires = number of endpoints − 1, and no wire ever joins two
  different nets.
- The tree grows **block by block**. Blocks are taken in build order: first power and the edge connector,
  then experiment order (`kit/deneyler.ts`), and within one experiment the order of definition; a glue
  chip's pin belongs to the block of its gate. A block's endpoints are linked among themselves in a
  nearest-neighbor chain (shortened with 2-opt) and attached to the tree of the earlier blocks at the
  closest point (preferably at an end of the chain). So when a block is finished, every connection of the
  blocks built so far is complete and can be tested.
- Distance is the right-angle path between pins in the suggested placement; at most three wires go to one
  endpoint (a breadboard column has four free holes; a wire-wrap pin holds three wraps).
- Wires are numbered by block, class (color) and net name: `T0001` … The numbers are per board and can
  shift when the schematic changes; the guide's date is printed on the cover.

## Wire color code

The class is derived from the net name (`sinyalSinifi`; the board prefixes `GC_`, `V_`, `C_`, `M_`, `K_` and `~` are ignored).

| Color | Class | Lines |
|---|---|---|
| red | power +5 V | VCC, inputs tied to 1 |
| black | ground | GND, inputs tied to 0 |
| yellow | address | A0..A15, PA14..PA19, memory and VRAM addresses, bank registers |
| blue | data | DE / DO, BUS, register, ALU and memory data lines |
| orange | select and enable | ~CE, ~CS, ~OE, ~WE, ~MRD, ~MWE_E/O, selector outputs, driver enables |
| green | control | microcode word, flags, other logic |
| white | clock | CLK, OSC, TCLK, pixel / character clock, shift and latch clocks |
| purple | reset and interrupt | ~RESET, ~RST, IRQ, ~INT, VSYNC_REQ |
| brown | external connection | LED, button, RC, VGA, PS/2, UART connector lines |

The guides print the name of the color next to every swatch, so they still read in black-and-white print.

## Handbook

`kurulum/el-kitabi.ts`: the guides and the two paths (breadboard, PCB), tools and materials, the wire color
standard, how to read the lists (with a real chip card as the example), power distribution and decoupling,
chip orientation, building and testing block by block (experiment guides, `kart-testi`), breadboard and PCB
assembly (sockets, soldering order, bare board and continuity test), common mistakes, and wire-wrap as an
appendix.

## Tests

`tests/kurulum.test.ts` computes the expected endpoints from the board definition, independently of the plan:

- every board's wire list fully connects the endpoints of every signal net (a spanning tree: connected,
  with Σ(endpoints − 1) wires), no wire joins different nets, no wire appears twice;
- the numbers are unique and in order, and the plan is the same every time; the CPU and clock boards have
  the same wires in both computer definitions; at most three wires per endpoint;
- block by block, at every intermediate state, all connections of the blocks built so far are complete;
- every chip's power pins, tied inputs and decoupling are listed; in the pin tables every wire appears with
  both of its ends; the edge connector follows the backplane layout; net names match the labels in the
  KiCad schematic;
- the wire and power pin totals across all boards of the motherboard.
