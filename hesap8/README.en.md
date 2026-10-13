# 8-bit calculator (hesap8)

A circuit with no program and no clock that adds, subtracts, multiplies and divides two 8-bit numbers
(0–255) entered on DIP switches, and shows the result on decimal seven-segment displays. It uses only
common 74HC chips: 216 chips, 15 display digits (A 3, B 3, result sign + 5, remainder 3). When you flip
a switch, the result reaches the display after nothing more than the gate delays (worst case ≈ 2 µs).

It shares CPU16's infrastructure (schematic = code, `cpu16/board/`): the circuit is defined once in
`kart.ts`, and the gate-level simulation, the 3D view in Silikon3D (the **8-bit calculator 3D**
section, `#hesap`), the KiCad schematic (`cpu16/kicad/hesap/`, 11 sheets), the BOM and the build guide
are generated from that same definition. All 4 × 256 × 256 = 262,144 cases have been tested at gate
level and match the golden model (`model.ts`).

## Usage

| Switch | Function |
|---|---|
| SW1, SW2 (8-way) | the A and B numbers; bit 7 … bit 0 from left to right, on = 1 |
| SW3 (2-way) | operation (OP1 OP0): 00 add, 01 subtract, 10 multiply, 11 divide |
| SW4 (button) | lamp test: all segments light up |

Result: addition 0 … 510, subtraction −255 … 255, multiplication 0 … 65,025, and quotient plus
remainder for division; when B = 0 the HATA (error) LED lights. Details: [docs/tasarim.md](docs/tasarim.en.md#usage).

## Commands

```sh
npm run hesap8 -- ozet [--yol]          # chips block by block, passives, longest path (--yol: chip by chip), ERC
npm run hesap8 -- hesapla 255 x 7       # A [255]  B [  7]  sonuç [  1785]  kalan [   ]
npm run hesap8 -- hesapla 255 / 7       # A [255]  B [  7]  sonuç [    36]  kalan [  3]
npm run hesap8 -- hesapla 12 - 200      # A [ 12]  B [200]  sonuç [-  188]  kalan [   ]
npm run hesap8 -- dogrula               # 3,024 cases (edge values + 2,000 samples), a second or two
npm run hesap8 -- dogrula --hepsi       # all 262,144 cases (split across threads, ≈ 12 s on 4 cores / 8 threads)
npm run cpu16 -- board kicad            # regenerate the KiCad files (cpu16/kicad/hesap/)
npm run cpu16 -- kurulum hesap -o out   # PCB build guide (HTML + PDF) and schematic PDF
npm run hesap8 -- breadboard            # 60 breadboards, 2,784 wires; do the connections match the netlist one to one?
npm run hesap8 -- breadboard --uret     # regenerate the layout and the wires (breadboard/veri.ts)
npm run hesap8 -- breadboard-belge -o out   # breadboard build guide (HTML + PDF)
npm run cpu16 -- mimari hesap           # block diagram SVG (docs/img/mimari-hesap.svg)
npx vitest run hesap8                   # tests
```

`hesapla` operations: `+ - x /` (`x` for multiplication, because the shell expands `*` into file
names). Every result is also compared with the golden model ("altın modelle aynı", matches the golden
model). In Docker: `docker compose run --rm cli hesap8 -- …`.

## Files

There are two routes for the physical build: **breadboard** (60 full-size breadboards, 5 × 12; every
wire hole to hole, flat, at right angles, color-coded and with its cut length; 2,784 jumper wires) or
**PCB**. The breadboard layout and wires are in `breadboard/`; their connectivity is built with
union-find from the physical model alone (strips, rails, wires) and compared with the netlist.
Silikon3D → 8-bit calculator 3D shows the breadboard by default (you can switch to the PCB); Build mode
highlights each wire in 3D and spells it out hole to hole. Regions and chip groups have labels in 3D
(**Labels**, shortcut `E`; click a label to see its job and how it works in the side panel); their texts
are in `bolum-metin.ts`, and the "Bölümler" (sections) part of the build guide comes from them too.

| File | Contents |
|---|---|
| `kart.ts` | Circuit definition (blocks, chips, nets), KiCad sheets |
| `bcd.ts` | Binary-to-decimal network ("add 3 and shift") |
| `havuz.ts` | Packs a block's gates into chips of its own |
| `model.ts` | Golden model: what the displays should show |
| `sim.ts` | Gate-level simulation: set the switches, read the displays |
| `arac.ts` | command line: `ozet`, `hesapla`, `dogrula [--hepsi]`, `breadboard [--uret]`, `breadboard-belge` |
| `breadboard/renk.ts` | Wire color code: the signal group of each color in the calculator |
| `breadboard/yerlesim.ts` | Breadboard layout: breadboard grid, which block sits on which breadboard, passives, rails |
| `breadboard/plan.ts`, `veri.ts` | Build plan (stages, wire order, color, cut length); generated layout and wires |
| `breadboard/gorunum.ts` | 3D layout from the breadboard plan (Silikon3D, `src/board3d/Breadboard3D.tsx`) |
| `breadboard/belge.ts` | Printable breadboard build guide (breadboard map and sections, drawings, wire and cut lists, parts) |
| `bolum-metin.ts` | The label, job and "how it works" text of each region and chip group (3D labels, side panel, build guide; `cpu16/board/bolum-bilgi.ts`) |
| `cpu16/board/breadboard/` | Shared breadboard engine (shared with CPU16's breadboard assemblies): BB830 geometry, annealing that spreads the chips across breadboards, wire routing (right-angle, flat paths that never cross a chip body; A*, rip-up and reroute), union-find verification from the physical model, breadboard drawings. `breadboard/geometri.ts`, `yonlendirme.ts` and `dogrulama.ts` re-export for older imports |
| `mimari.ts` | Layout of the architecture (block) diagram: boxes, paths (content from the circuit; `cpu16/mimari/`). Silikon3D → Architecture |
| `docs/tasarim.md` | Blocks (block diagram `docs/img/mimari-hesap.svg`), speed, power supply, parts |
| `docs/kurulum-rehberi.md` | Physical build: stages, tests, troubleshooting |
| `tests/` | 74HC4511, structure, edge cases, lamp test, KiCad netlist, breadboard connectivity and 3D view |

The chips come from CPU16's parts library (`cpu16/chips/`; the 74HC4511 was added for this project),
and the seven-segment display and the other passives are in `cpu16/board/passives.ts`. When the circuit changes, refresh the KiCad files
with `npm run cpu16 -- board kicad`; the tests check that the files in the repository are up to date.
