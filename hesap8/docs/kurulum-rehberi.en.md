# 8-bit calculator: physical build guide

This guide covers the order for building the calculator with real chips and the test for each stage.
Which pin goes where is in one of two documents; both build the same circuit (same netlist, same net
names), and only the physical route differs:

| Route | Document | How to generate it |
|---|---|---|
| **Breadboard** (full circuit, 60 breadboards) | `hesap8-breadboard-kurulum.pdf`: breadboard map (region frames) and sections (the job of each region and chip group), layout drawings for each breadboard (with the chip groups marked on them), hole-to-hole wire list T0001–T2784, cut list, parts | `npm run hesap8 -- breadboard-belge -o <dir>` |
| **PCB** (socketed board) | `hesap-kurulum.pdf`: layout map, pin-to-pin wire list (beep test list), a pin card for each chip; schematic `hesap-sema.pdf` | `npm run cpu16 -- kurulum hesap -o <dir>` |

The design is explained in [tasarim.md](tasarim.en.md). In the app (Silikon3D → 8-bit calculator 3D) the
default view is the breadboard; use **View** in the toolbar to switch to the PCB. **Build** mode shows
the wire in 3D on both routes, and on the breadboard the numbers match the breadboard document.

## Breadboard route: 60 breadboards, 2,784 wires

`hesap8/breadboard/` places the circuit on full-size breadboards (BB830: 63 columns, a–e / f–j strips,
two rails each at the top and bottom) and routes all the wires. The result:

- **60 breadboards, 5 columns × 12 rows**, base plate ≈ 900 × 800 mm (the breadboards of a module sit
  side by side, with ≈ 20 mm between modules: each module is an island of its own). The displays run
  along the back edge (A, B, result, remainder from left to right), the switches and power along the
  front edge, and the data flows from front to back in between: switches → addition / multiplication /
  division → result selector → binary to decimal → 74HC4511 → displays. At most 5 chips per breadboard.
  57 breadboards carry parts; BB52, BB53 and BB60 carry only the rails and the intermediate strips for
  wires passing alongside them (so the base stays rectangular and the wires lie on top of breadboards).
- **Every chip straddles the channel**, with 4 free holes in each pin's strip; the 100 nF sits between
  the top pair of rails, in the rail column right next to the VCC pin (top left). The displays and the 470 Ω networks straddle the channel too.
- **2,784 jumper wires**: 246 rail bridges (120 within a breadboard, 126 between breadboards), 880 short
  power wires (chips' VCC / GND pins and unused inputs tied to GND, 7 mm on average), 1,658 signal
  wires. The wires lie flat and run only horizontally and vertically; none of them passes over a chip, a
  part or the end of another wire, and a hole never holds two wire ends, or a wire end and a pin. So you
  can insert the wires in any order; the order in the list only splits them into stages and keeps your
  hands in free space.
- Length: 187 m hole to hole, 233 m as cut (8 mm extra at each end); 67 mm on average, the longest
  1.4 m. Cut lengths: 65 wires 10–20 mm, 1,058 wires 20–40 mm, 809 wires 40–80 mm, 571 wires 80–160 mm,
  178 wires 160–320 mm, 103 wires longer than 320 mm.
- Verification: `npm run hesap8 -- breadboard` builds the connectivity from the physical model alone
  (strips, rails, rail bridges, wires) with union-find and compares it with the netlist: 1,116 nets,
  4,177 pins; no open circuits, no shorts. The same check also runs for the end of every stage (tests).

Compared with the pin-to-pin list for the PCB: there it is 1,682 signal wires (power runs on the board's
rails), 137 m as straight lines from pin to pin, 82 mm on average, and the wires pass over the chips. On
the breadboard there are 1,658 signal wires (pins sitting in the same strip need no wire), but since
every wire follows its right-angle path, the total signal path is 166 m (100 mm on average); on top of
that, each pin's power connects to a rail with a short wire.

**Rail assumption:** the rails run unbroken end to end (BB830 type). On breadboards whose rails are split
in the middle (≈ column 30), bridge the two halves of each rail with a short wire (4 per breadboard,
240 extra wires in total), or measure 5 V at both ends of the rail on every breadboard.

**Color code** (per signal group; the same in the document and in the app):

| Color | Group | Wires |
|---|---|---|
| red | +5 V (rails, rail bridges, VCC pins, inputs tied to 1) | 367 |
| black | GND (rails, GND pins, inputs tied to 0, display common cathodes) | 759 |
| yellow | A number (A0–A7) | 103 |
| orange | B number (B0–B7, their inverses, the inverted value for subtraction) | 175 |
| purple | control (operation switches, decoding, lamp test, blanking, NEG, HATA) | 130 |
| green | intermediate (internal signals of the adders, the multiplier, the divider) | 331 |
| blue | result (M, P, Q, K, T8 and the selected result) | 96 |
| white | decimal (BCD: binary-to-decimal conversion and the 4511 inputs) | 627 |
| gray | segments (4511 → 470 Ω → display) | 196 |

Stages (each one ends with the test below; at the end of each stage, every net inserted up to that
point is complete):

| Stage | Breadboards | Chips | Wires |
|---|---|---|---|
| 1. Base, power and switches | rails of all 60 breadboards, BB57, BB58 | 3 | T0001–T0302 (246 of them rail bridges) |
| 2. Display for A | BB01 BB06 BB11 BB16 BB21 | 19 | T0303–T0542 |
| 3. Display for B | BB02 BB07 BB12 BB17 BB22 | 19 | T0543–T0782 |
| 4. Addition and subtraction | BB46 BB51 BB56 | 10 | T0783–T0884 |
| 5. Multiplication | BB26 BB27 BB31 BB32 BB36 BB37 BB41 BB42 | 30 | T0885–T1198 |
| 6. Division | BB30 BB35 BB40 BB45 BB49 BB50 BB54 BB55 BB59 BB60 | 39 | T1199–T1632 |
| 7. Result selector, result and remainder displays | the remaining 27 breadboards | 96 | T1633–T2784 |

To change the layout or the wire routes: `npm run hesap8 -- breadboard --uret` (≈ 15 s)
regenerates `hesap8/breadboard/veri.ts`; when the netlist changes, stale data is not used (fingerprint).

## PCB route

The whole circuit goes from the KiCad schematic (`cpu16/kicad/hesap/`) to a PCB. The chips go into
sockets (90 × DIP-14, 126 × DIP-16), PCB traces take the place of the wires, and this time the
pin-to-pin wire list becomes a **beep test list** (check each wire end to end with the multimeter's
continuity mode). The stages and tests are the same as below; the "PCB document" lines give that
document's blocks and wire numbers.

## General rules

- Power: 5 V, at least 1 A (a 5 V 2 A adapter is recommended). J1: pin 1 +5 V, pin 2 GND. On the
  breadboard, the rail bridges are at the start of the wire list (stage 1); for breadboards with split
  rails, see the rail assumption above.
- **100 nF at every chip**, between VCC and GND, as close to the chip as possible. One 100 µF at the input (+ lead to VCC).
- **74HC inputs are never left floating.** Unused gate inputs are tied to GND in the schematic; they are
  in the wire list too, so don't skip them. A floating input settles at a random 0 / 1, and the chip can heat up.
- Chip orientation: notch on the left, pin 1 at the bottom left (the same as the layout in the build guide).
- Wire colors: follow the build guide's color code (number bits, operation signals and segments in
  different colors); it helps a lot when you hunt for faults.
- Breadboard wires: cut them to the "cut" length in the document, strip 6 mm at the ends, bend them
  90°, and press them fully into the hole; the wire should lie flat on the breadboard. First cut all the
  wires of one color following the cut list, and sort them by length.
- **Test after each stage**, then move on to the next one. The test tables are below.

## Stage 1: power, switches, operation LEDs

Breadboard: glue the 60 breadboards to the base (BB01 in the back left corner), then the parts on BB57
and BB58; wires **T0001–T0302** (the 246 rail bridges first). Before testing, check for 5 V on both + rails of every breadboard.
PCB document: block 0 (Power) and block 1 (Switches), wires **T0001–T0037**.
Parts: J1, C1; SW1, SW2 (8-way DIP), SW3 (2-way DIP), SW4 (button); RN1–RN3 (10 kΩ SIP-9, dot
= common lead = GND); U1–U3 (74HC04, 74HC02, 74HC08: operation decoding); D1–D4 green LEDs, R2–R5 330 Ω.

One side of each DIP switch goes to VCC and the other side to a bit of the number; the 10 kΩ resistors
pull the bit to 0 while the switch is off. Switch 1 of SW1 is A7 (the most significant bit): read from
left to right, the switches give the binary number.

| Test | Expected |
|---|---|
| SW1: only switch 8 on | A0 = 5 V, A1–A7 = 0 V (with a multimeter or an LED + 1 kΩ) |
| SW3: off, off | only D1 (TOPLA) lights |
| SW3: off, on | only D2 (ÇIKAR) |
| SW3: on, off | only D3 (ÇARP) |
| SW3: on, on | only D4 (BÖL) |
| Press SW4 | LT_N = 0 V, released = 5 V (R1 10 kΩ pulls it up) |

## Stage 2: show A in decimal

Breadboard: BB01 (displays and 470 Ω networks), BB06 (4511 drivers), BB11, BB16, BB21 (binary to
decimal); wires **T0303–T0542**.
PCB document: block 6 (Binary to decimal: A, **T0710–T0787**, 12 chips) and block 10 (Display: A,
**T1331–T1399**, 7 chips + DS1–DS3).

### One digit first (trial wiring, optional)

Before the real circuit, try one digit on its own: one 74HC4511, one 470 Ω network (DIP-16) and one
display. The wires in this step are temporary; remove them afterwards and move on to the real circuit.
On the breadboard route, do this trial on a separate small breadboard: only the wires in the list go
onto the real breadboards (so the rule that no hole ever holds two things stays intact).

- 74HC4511 pins: 1 B, 2 C, 3 ~LT, 4 ~BI, 5 LE, 6 D, 7 A, 8 GND, 9 e, 10 d, 11 c, 12 b, 13 a,
  14 g, 15 f, 16 VCC.
- Display (5161AS, common cathode): 1 e, 2 d, 3 common, 4 c, 5 dot, 6 b, 7 a, 8 common, 9 f, 10 g.
  3 and 8 to GND; the dot (5) stays unconnected.
- Resistor k of the network sits between pins k and (17 − k): the 4511's a..g outputs go to pins 1–7,
  and the display's a..g to pins 16–10.
- Temporary wiring: SW1's A0–A3 bits to the 4511's A–D, LE → GND, ~BI → VCC, ~LT → LT_N.

| Test | Expected |
|---|---|
| A3..A0 = 0000 … 1001 | 0 … 9; 6 and 9 "without tails" (no top bar on the 6, no bottom bar on the 9; that's how the 4511 draws them) |
| A3..A0 = 1010 … 1111 | the display goes blank |
| Press SW4 | "8" (all segments) |
| Take ~BI to GND | blank (the lamp test overrides this too) |

If a segment never lights: check the display's pinout one segment at a time with a 3 V coin cell +
470 Ω. If you see mirrored digits, such as "5" instead of "2", two segments such as a–f or b–f are swapped.

### A's decimal display

The binary-to-decimal conversion is made of "add 3 and shift" modules: each module is one 74HC283 and
its "≥ 5" detection gates. A needs 7 modules. The build guide lists the modules with their jobs, such
as "before shift 1, + 3 if the ones digit is ≥ 5"; build them in the order of the chain.

| SW1 (A) | Display A |
|---|---|
| 00000000 | "  0" (leading zeros blank, the ones digit never does) |
| 00000101 | "  5" |
| 00001010 | " 10" |
| 01100100 | "100" |
| 11111111 | "255" |
| 10000000 | "128" |

If a value is wrong: to follow that value step by step, give the same A to the simulator (Silikon3D →
8-bit calculator 3D) and compare the modules' output nets (A_3_0_0 … A_7_1_3: step, digit, bit) on the board with a multimeter.

## Stage 3: show B in decimal

Breadboard: BB02, BB07, BB12, BB17, BB22 (the column to the right of A's breadboards); wires
**T0543–T0782**. PCB document: block 7 and block 11. Test: the table from stage 2, with SW2, on the B display.

## Stage 4: addition and subtraction

Breadboard: BB46, BB51, BB56; wires **T0783–T0884**. Plug each temporary LED into a free hole in its net's
strip (find the strip in the drawing in the breadboard document). PCB document: block 2, **T0038–T0102**, 10 chips (4 × 74HC86, 4 × 74HC283, 74HC08, 74HC04).
There is no decimal result circuit yet to show the result: connect temporary LEDs to the M0–M7, NEG
and T8 nets (each one through 1 kΩ to GND).

| A | B | Op | M7..M0 | NEG | T8 | Meaning |
|---|---|---|---|---|---|---|
| 12 | 200 | + | 11010100 | 0 | 0 | 212 |
| 255 | 255 | + | 11111110 | 0 | 1 | 510 (T8 = the 256s bit) |
| 200 | 12 | − | 10111100 | 0 | 0 | 188 |
| 12 | 200 | − | 10111100 | 1 | 0 | −188 |
| 7 | 7 | − | 00000000 | 0 | 0 | 0 |

## Stage 5: multiplication

Breadboard: BB26, BB27, BB31, BB32, BB36, BB37, BB41, BB42; wires **T0885–T1198**.
PCB document: block 3, **T0103–T0348**, 30 chips (16 × 74HC08 for the partial products, 14 × 74HC283
row adders). Build the 64 ANDs first, then the adder rows in order (row 1 … 7).

| A | B | Product P15..P0 |
|---|---|---|
| 15 | 15 | 0000 0000 1110 0001 (225) |
| 255 | 1 | 0000 0000 1111 1111 (255) |
| 16 | 16 | 0000 0001 0000 0000 (256) |
| 255 | 255 | 1111 1110 0000 0001 (65,025) |

## Stage 6: division

Breadboard: BB30, BB35, BB40, BB45, BB49, BB50, BB54, BB55, BB59 (BB60 only passes wires through); wires
**T1199–T1632**. PCB document: block 4, **T0349–T0652**, 39 chips. 8 identical stages; each stage has 2 × 74HC283
(remainder − B) and 2 × 74HC157 (new remainder). Start at stage 7 (A7) and finish at 0; each stage
takes the remainder of the one before it. The real HATA (error) LED (D5) goes next to the displays in
stage 7; for now, watch the HATA net with a temporary LED + 1 kΩ.

| A | B | Quotient Q7..Q0 | Remainder K7..K0 | HATA net (with BÖL selected) |
|---|---|---|---|---|
| 255 | 7 | 00100100 (36) | 00000011 (3) | 0 |
| 100 | 10 | 00001010 (10) | 00000000 | 0 |
| 5 | 9 | 00000000 | 00000101 (5) | 0 |
| 100 | 0 | n/a | n/a | 1 |

## Stage 7: result selector, result and remainder displays

Breadboard: the remaining 27 breadboards: BB03–BB05 displays (result and HATA LED, remainder), BB08–BB10
drivers, binary to decimal in the middle and right columns (BB13–BB44), BB47–BB48 result selector (BB52
and BB53 only pass wires through); wires **T1633–T2784**, the busiest stage.
PCB document: block 5 (Result selector, T0653–T0709), 8 (Binary to decimal: result, T0866–T1252,
58 chips), 9 (remainder, T1253–T1330), 12 (Display: Result, T1469–T1606) and 13 (Display: Remainder,
T1607–T1679). Remove the temporary LEDs. The leftmost digit of the result display (DS7) is only the
minus sign: its g segment goes through R6 (330 Ω) to ISARET_g (NEG or lamp test, one OR gate), and the
other segments stay unconnected. The HATA LED (D5, red, R7 330 Ω) is in this block too, next to the result.

| A | Op | B | Result | Remainder |
|---|---|---|---|---|
| 255 | + | 255 | "   510" | off |
| 12 | − | 200 | "-  188" | off |
| 255 | × | 255 | " 65025" | off |
| 255 | ÷ | 7 | "    36" | "  3" |
| 100 | ÷ | 0 | off, HATA lights | off |
| 0 | ÷ | 5 | "     0" | "  0" |

Lamp test (SW4): all 14 digits should show "8" and the sign digit "−" (blanked groups included). The
operation LEDs and the HATA LED are not connected to the lamp test.

## Troubleshooting

| Symptom | Check |
|---|---|
| A chip gets hot | Chip inserted backwards (notch), VCC / GND short, floating input |
| One digit always blank | The ~BI chain (blanking gates); is the 4511's LE at GND? |
| One digit always "8" | ~LT floating or at GND; measure LT_N |
| Odd-looking digit | Display pinout, or two swapped resistors in the network |
| Wrong for some numbers | A binary-to-decimal module: compare that module's nets with the simulator, using the same input |
| Display flickers, chips act randomly | Missing decoupling, or the power comes from far away over thin wire |
| A breadboard's chips are dead | Rail bridges (stage 1) or a split rail: measure 5 V / 0 V on that breadboard's four rails |
| A single bit wrong on the breadboard | Wire end in the wrong strip or not pressed fully in: check the two holes in the wire list and the color code |
| Current higher than expected | ≈ 0.6 A during the lamp test is normal; if it is > 0.4 A with the switches idle, look for a short |

Every net name in the design is the same in the simulator, in the schematic and in both build
documents: searching for a net name in the PDF (Ctrl+F) shows all the ends and wires of that net.
