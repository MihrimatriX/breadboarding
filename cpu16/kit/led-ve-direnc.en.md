# LEDs, resistors and capacitors: the kit's passive components

> **When:** read it once before Experiment 1, and keep it next to you while you build. · **Board:** all ·
> **3D:** Silikon3D → "CPU16 board 3D", click a passive: the side panel opens this page's section for that component, with live values.

The computer is made of ≈ 400 chips, but every board also has small parts next to the chips: resistors,
resistor networks, capacitors, LEDs, buttons, oscillators. They are all cheap, and every one of them can
go in the wrong way. This page explains how to read the markings on each one, how to insert it the
right way round, and what it does in this computer.

The images are in the `cpu16/kit/gorseller/` folder and are generated from the schematic
(`npm run cpu16 -- kit`): if an LED's resistor or driver changes in the schematic, the drawing changes too.

## Passives in the kit

| Component | Value | Where | When inserting |
|---|---|---|---|
| Resistor, carbon film (beige) | 330 Ω | series resistor for the LEDs (R1, R2, R205) | no orientation |
| Resistor, carbon film | 10 kΩ | pull-up resistors, reset and button RC (R201, R202, R204, R601–R603) | no orientation |
| Resistor, carbon film | 1 kΩ | smallest resistor of the slow oscillator (R203); series resistor for the CPU board's debug LEDs (R3–R41) | no orientation |
| Resistor, metal film (blue), 1% | 680 Ω, 1.3 kΩ | VGA color DAC (R701–R706) | no orientation |
| Resistor network, SIP-9 | 8 × 10 kΩ, "A103J" | bus pull-up and pull-down resistors (RN1, RN2, RN401–RN403) | **dotted end on the common line** |
| Resistor network, DIP-16, isolated | 8 × 1 kΩ, "4116R-1-102" | segment resistors for the bar graphs (RN3–RN28) | **notch / dot = pin 1** |
| Ceramic disc capacitor | 100 nF, "104" | decoupling for every chip (e.g. C205 next to U201) | no orientation |
| Ceramic capacitor | 1 µF, "105" | button filter, slow oscillator (C202, C203) | no orientation |
| Electrolytic capacitor | 10 µF, 100 µF | reset delay (C201), board power input (C204) | **stripe = negative** |
| LED, 3 mm | orange, red, blue | HALTED (D1), FAULT (D2), CLK (D201) | **long leg = positive** |
| LED, 3 mm | green, orange, white, blue, yellow | the CPU board's debug LEDs (D3–D41) | **long leg = positive**; on active-low ones the positive leg goes on the resistor side and the negative on the signal |
| LED bar graph, 10 segments (DIP-20) | yellow | the CPU board's value displays (DS1–DS26) | **pin 1 is on the printed side**; if you're not sure, measure in diode mode |
| Trimpot | 100 kΩ, "104" | slow clock speed (RV201) | the middle pin is the wiper |
| Crystal oscillator | 8 MHz, 25.175 MHz | CPU clock (X201), VGA pixel clock (X701) | **sharp corner = pin 1** |

## Resistors and the color code

![Resistor color code table and three examples](gorseller/renk-kodu.svg)

Hold the resistor with the gold (or silver) band on the **right** and read from the left:

- **4 bands** (carbon film, beige body, ± 5%): two digits, multiplier, tolerance.
  330 Ω = **orange** (3) **orange** (3) **brown** (× 10) **gold** (± 5%): 33 × 10 = 330.
- **5 bands** (metal film, usually a blue body, ± 1%): three digits, multiplier, tolerance.
  680 Ω = **blue** (6) **gray** (8) **black** (0) **black** (× 1) **brown** (± 1%).

The values in this computer:

| Value | Bands | Where |
|---|---|---|
| 330 Ω ± 5% | orange, orange, brown, gold | LED series resistor |
| 1 kΩ ± 5% | brown, black, red, gold | slow oscillator, the CPU board's LEDs |
| 10 kΩ ± 5% | brown, black, orange, gold | pull-ups, RC |
| 680 Ω ± 1% | blue, gray, black, black, brown | VGA DAC color bit |
| 1.3 kΩ ± 1% | brown, orange, black, brown, brown | VGA DAC brightness bit |

If you're not sure, measure with a multimeter: across both leads, before the resistor goes into the
circuit. Brown and red, and orange and red, are easy to mix up in dim light; if you fit 3.3 kΩ instead
of 330 Ω the LED is barely visible, and if you fit 1 kΩ instead of 10 kΩ the pull-up draws current it
doesn't need.

## LED: anatomy and polarity

![Side cross-section of an LED, schematic symbol and color table](gorseller/led-anatomi.svg)

An LED is a diode: current flows only from the **anode to the cathode**. Inserted backwards it won't light (in a 5 V circuit it usually isn't damaged either; turn it around and insert it again).
There are four ways to find the polarity:

1. **The long leg is the anode (+).** No help once the legs have been trimmed.
2. **The flat edge of the flange is the cathode (−).** One side of the rim at the base of the body is flat.
3. **The large piece inside (the anvil, or cup) is the cathode.** You can see it against the light; the die sits on top of it.
4. **The multimeter's diode mode:** with the red probe on the anode and the black on the cathode, the
   LED glows faintly and the display shows the forward voltage (Vf).

### LED colors in this computer

The color comes from the LED's job (`cpu16/board/passives.ts`, `LED_RENK_KURALLARI`); the 3D view, the
panel and this page use the same rule.

| LED | Job | Color | Why | Vf |
|---|---|---|---|---|
| D2 | FAULT: the CPU stopped on an illegal (undefined) instruction | red | error: the color that draws the most attention | ≈ 1.9 V |
| D1 | HALTED: the CPU stopped with the HALT instruction | orange (amber) | a warning, but not an error | ≈ 2.0 V |
| D201 | CLK: the CPU clock | blue | blinks all the time, so it should stand apart from the other status LEDs | ≈ 3.1 V |
| D3, D5 … D17, D25 | r0–r7 read (`~ROE0`–`~ROE7`), memory read (`MEMRD`) | green | read: a value is coming out of memory or a register onto the data bus | ≈ 2.1 V |
| D4, D6 … D18, D26–D32 | r0–r7 write (`~WSEL0`–`~WSEL7`), memory write (`MEMW`), TA, TB, MAR, IR load, PC load and increment | orange (amber) | write and load: a register or memory will change on this clock edge | ≈ 2.0 V |
| D19–D24 | data bus driver (`~SRC_REG`, `~SRC_ALU`, `~SRC_PC`, `~SRC_MEM`, `~SRC_IMM`, `~SRC_FLAGS`) | white | the source driving the data bus; at most one of the six lights | ≈ 3.1 V |
| D33–D37 | N, Z, C, V, I flags | blue | the ALU's status bits, kept apart from the value displays | ≈ 3.1 V |
| D38–D41 | micro-step (`STEP0`–`STEP3`) | yellow | a four-bit number, like the value displays | ≈ 2.0 V |
| DS1–DS26 | bar graphs: data bus, PC, address (MAR), instruction (IR), ALU result, contents of r0–r7 | yellow | value display: for watching data and addresses | ≈ 2.0 V |
| (none) | if you add a power / "all good" indicator | green | traffic light logic | ≈ 2.1 V |

The rules are applied in this order; an LED whose job matches none of them is red. Red is kept for
errors only (FAULT), so that at a glance it says "something went wrong".

## Series resistor: always drive an LED through a resistor

![Signal, resistor, LED and GND: node voltages and current](gorseller/seri-direnc.svg)

Once the LED's forward voltage (Vf) is exceeded, its current is set almost entirely by the resistor in
the circuit. Without a resistor, the LED draws more current from the 74HC output than the output
transistor can handle: the output voltage collapses, the chip heats up, and the LED can die. The
calculation takes four steps:

1. Voltage across the resistor: V_R = 5 V − Vf.
2. Resistor for the current you want: R = V_R / I. 5–10 mA is bright enough for a 3 mm LED (20 mA at most).
3. Pick the next standard value up (E12: … 220, 270, **330**, 390, 470 …).
4. Power in the resistor: P = I² · R. A few mW is nothing for a ¼ W resistor.

Example, the CLK LED (D201, blue, Vf ≈ 3.1 V, R205 = 330 Ω):

```
V_R = 5 V − 3.1 V = 1.9 V
I   = 1.9 V / 330 Ω ≈ 5.8 mA
P   = (5.8 mA)² · 330 Ω ≈ 11 mW
```

The same 330 Ω gives ≈ 9.4 mA with the red LED (D2, Vf ≈ 1.9 V). Blue gets a little less current, but
blue LEDs are bright anyway; to the eye their brightness is about the same. A 74HC output drops
0.2–0.4 V at this current, so the real current is a bit lower than calculated. Draw at most ± 25 mA from a 74HC output.

**Don't connect an LED straight to a pulled-up line:** a line held at 1 by a 10 kΩ pull-up (e.g. the
memory data bus `MD0`–`MD7`, `DE`, `DO`) can't supply the LED's current; its voltage drops to 2–3 V and
inputs may no longer read it as 1. To watch such a line, use the display module (74HC541 + LEDs +
resistors, see the [README](README.en.md)). The CPU board's internal data bus (`BUS0`–`BUS15`), on the
other hand, is pulled down: it is already 0 while nothing drives it, and when a 74HC541 or 74HC245
drives it, a 1 kΩ segment draws ≈ 3 mA. The output supplies that easily, so the bar graph can be
connected directly.

## Debug LEDs on the CPU board

As on James Sharman's and Ben Eater's breadboard computers, the CPU board has an LED for every
important line and a bar graph for every important value: while you step through a program, you can see
at a glance which register is being read, which one will be written, who drives the data bus and the
value on it. Each one draws ≈ 3 mA through 1 kΩ, which is enough for a 3 mm LED. In the worst case (all
bits 1) the 39 LEDs and the 208 segments of the 26 displays draw ≈ 0.75 A; since about half the bits of
a value are usually 0, the real figure is about half that. A 5 V 3 A adapter ([production](../docs/uretim.en.md#4-power-supply))
covers it, but feed the CPU board's power from both ends.

**Active-low signals** (those whose name starts with `~`, such as `~ROE0`, `~WSEL0`, `~SRC_ALU`,
`~PC_LOAD`) are active when they are 0. Their LEDs are wired the other way round: **VCC → 1 kΩ → LED →
signal**. When the output goes to 0 it sinks the current to GND and the LED lights; at 1 both ends sit
at 5 V and no current flows. This way the LED always lights when the signal is "active". When
inserting: the LED's long leg (anode) goes on the resistor side, the short leg (cathode) on the signal.

![Active-low LED: VCC, resistor, LED and signal](gorseller/seri-direnc.svg)

**Bar graph** (10-segment LED bar, DIP-20): ten separate LEDs in one package. Segment k's anode is pin
k and its cathode is pin (21 − k): anodes 1–10 on the bottom row, cathodes 20–11 on the top row. The
eight bits of a byte are on segments 1–8, and 9 and 10 are unused; **segment 1 on the left is bit 0**.
A lit segment is 1 and a dark one is 0: 0x35 = 0011 0101 → segments 1, 3, 5 and 6 light. In front of
each byte sits an 8 × 1 kΩ isolated resistor network (DIP-16): resistor k is between pins k and
(17 − k); pins 1–8 are on the signals, pins 16–9 on the segment anodes.

| Display | Value | Block |
|---|---|---|
| DS1, DS2 | internal data bus `BUS0`–`BUS15` | Register file |
| DS3, DS4 | program counter `PC1`–`PC15` (PC0 is always 0: segment 1 unused) | Program counter |
| DS5, DS6 | address `A0`–`A15` (MAR) | MAR and IR |
| DS7, DS8 | instruction `IR0`–`IR15` | MAR and IR |
| DS9, DS10 | ALU result `RES0`–`RES15` | ALU |
| DS11–DS26 | contents of r0–r7 `R0Q0`–`R7Q15` (DS11, DS12 = r0; DS13, DS14 = r1 … DS25, DS26 = r7) | Register file |

The register content displays connect to the register's own outputs, not to the data bus: the outputs
of the register's 74HC574s are always enabled, and the 74HC541 buffers behind them drive the data bus.
That's why the values of all eight registers are visible at any moment, and you don't need to remove
these displays while you drive with the switch input.

## Pull-up and pull-down resistors

![Floating input, pull-up and pull-down, resistor network](gorseller/cekme-direnci.svg)

If a CMOS input isn't connected to anything (a **floating input**), its level is undefined: your
finger, a neighboring wire or noise moves it around between 0 and 1. Both transistors of the input
stage stay half on, and the chip draws current and heats up (you'll see this yourself in step 5 of
Experiment 2).

A pull-up or pull-down resistor gives the input a **default level**:

- **Pull-up:** 10 kΩ to VCC. While nothing drives it, the line is 1. When a button or an output pulls
  the line to 0, 5 V / 10 kΩ = 0.5 mA flows through the resistor; 10 kΩ is so much larger than the
  output's internal resistance of a few tens of ohms that the output easily makes the line 0.
- **Pull-down:** 10 kΩ to GND. While nothing drives it, the line is 0.

In this computer:

| Resistor | Line | Direction | Why |
|---|---|---|---|
| R204 | `~WAIT` | up | if no board that requests wait states is installed, the CPU doesn't wait |
| R202 | `STEP_RC` | up | 1 when the ADIM (step) button (SW202) is released; GND while pressed |
| R601 | `UART_RXD` | up | so the receiver doesn't pick up random bytes while no USB-UART module is connected |
| R602, R603 | `PS2_CLK`, `PS2_DAT` | up | PS/2 lines are open collector: both sides only pull to 0 |
| RN401–RN403 | memory data bus, `DE`, `DO` | up | empty address regions read as 0xFF |
| RN1, RN2 | CPU internal data bus | down | the bus is 0 while no register drives it |

**Why 10 kΩ?** A smaller one (1 kΩ) wastes 5 mA while the line is driven to 0 and strains the driver.
A larger one (1 MΩ) charges the line's capacitance (≈ 20 pF) slowly: τ = R · C = 20 µs, the return to 1
comes late and noise gets in easily. With 10 kΩ, τ = 0.2 µs and the current is 0.5 mA: both reasonable.

## Resistor network (SIP-9)

![SIP-9 resistor network: outside, internal schematic, A103J code](gorseller/direnc-dizisi.svg)

Eight pull resistors in one part. Inside, one end of each of the eight resistors connects to a bus tied
to the **dotted pin 1** (the common lead, COM), and the other ends come out on pins 2–9. With the
common lead on VCC, the eight lines are pulled up; on GND, they are pulled down.

The **A103J** printed on it: A = bussed network (common lead), 103 = 10 × 10³ Ω = 10 kΩ, J = ± 5%.
Inserted backwards (dot on the right), the common lead lands on a signal line and a signal pin on the
supply: that line is stuck at 1 or 0. Before inserting, check the dot and the COM net in the schematic.

## Decoupling: 100 nF next to every chip

![Chip, 100 nF, short current loop and long supply wire](gorseller/dekuplaj.svg)

When a 74HC output switches, it charges its load capacitance within nanoseconds. When eight outputs
switch at once, the charge drawn is Q = 8 × 50 pF × 5 V = 2 nC. If this current comes through a long
supply wire, the wire's inductance (10 cm ≈ 100 nH) causes a spike of V = L · di/dt = 100 nH × 0.3 A /
5 ns ≈ 6 V: VCC collapses, GND bounces, and flip-flops trigger falsely. A 100 nF right next to the chip
supplies the same charge with a harmless dip of ΔV = 2 nC / 100 nF ≈ 20 mV.

Rules:

- **One 100 nF per chip**, as close to the VCC and GND pins as possible, with short leads.
  The full computer has hundreds of them; in the 3D view each one is an orange disc next to its chip.
- **One 100 µF electrolytic on the power rail of every board (every breadboard)** (e.g. C204 on the
  clock board): it covers slow changes and the drop along the cable.
- If behavior breaks when the clock speeds up, decoupling is the first place to look.

On 74HC chips VCC is always the highest-numbered pin (14 on 14 pins, 16 on 16, 20 on 20), and GND is
the opposite corner (7, 8, 10). The 28-pin memories (62256, 28C256) follow the same pattern: VCC 28, GND 14.

## Reading capacitor markings

![Ceramic codes 104 and 105, electrolytic, oscillator](gorseller/kondansator-okuma.svg)

**Ceramic:** a three-digit code in **pF**: two digits, followed by the number of zeros to append.

| Code | Reads as | Value | In this computer |
|---|---|---|---|
| 104 | 10 × 10⁴ pF | 100 nF = 0.1 µF | decoupling |
| 105 | 10 × 10⁵ pF | 1 µF | button filter (C202), slow oscillator (C203) |
| 103 | 10 × 10³ pF | 10 nF | not used |
| 102 | 10 × 10² pF | 1 nF | not used |
| 220 | 22 × 10⁰ pF | 22 pF | not used |

Ceramics have no orientation. The code on the trimpot follows the same rule, but the unit is ohms:
104 on RV201 = 100 kΩ.

**Electrolytic:** the value and voltage are printed plainly ("100µF 16V"). **It is polarized:** the
light-colored stripe on the body (with − marks on it) shows the negative leg, and the long leg is
positive. Inserted backwards it heats up, swells and can burst. The voltage rating should be at least
twice the line voltage: 10 V or 16 V for 5 V.

**RC circuits:** C201 (10 µF) charges through R201 (10 kΩ): τ = R · C = 0.1 s, which is how long the
power-on reset lasts. C202 (1 µF) filters the bounce of the ADIM button. C203 (1 µF), R203 (1 kΩ) and
RV201 (0–100 kΩ) set the frequency of the slow oscillator: f ≈ 1 / (R · C) ≈ 10 Hz … 1 kHz.

**Oscillator:** a metal can the size of a DIP-14, with only 4 pins. The sharp corner and the dot mark
pin 1: 1 EN (floating or 1 = running), 7 GND, 8 output, 14 VCC. X201 is 8 MHz in the first build (CPU 1 MHz).

## Breadboard layout

![LED + series resistor, decoupling, pull-up and button on a breadboard](gorseller/breadboard-yerlesim.svg)

On both sides of the breadboard's center channel, the **vertical columns of five** are connected
inside; the long rails along the edges (+ and −) are connected horizontally. If both legs of a component
go into the same column, it is shorted.

1. **LED + series resistor:** the signal wire into one column, the resistor from that column to a free
   column, the LED's long leg into the resistor's column, and its short leg into another column and
   from there to the GND rail.
2. **Decoupling:** the chip straddles the center channel; the 100 nF goes between the two power rails,
   right next to the VCC pin. 100 µF at the end of the rail, with the striped leg on the − rail. Connect
   the top and bottom rails to each other at the ends.
3. **Pull-up + button:** the input wire into one column, 10 kΩ from the + rail to that column, and the
   button from that column to a column that goes to the GND rail. Released, the input is 1; pressed, 0.

## In the 3D view

Silikon3D → "CPU16 board 3D":

- **Click a passive:** the side panel opens with how to read its value (color bands, "104", "A103J"),
  its drawing, its job on this board, the calculations (LED current, pull-up current, τ) and the live
  level of its pins. You can click through to related components (the LED's resistor, the decoupling
  capacitor's chip).
- **Hover over it:** a one-line summary in the tooltip, e.g. "blue LED · CLK · ≈ 5.8 mA · lit".
- **The LEDs are live:** they glow when the signal they follow is 1 (0 for the active-low ones), and
  their halo and the spot of light on the board appear. The bar graph segments are live too; click a
  display and the panel shows the value in binary, hexadecimal and decimal.
  `kart.yakinlas("D201")` moves the camera close to the CLK LED; slow the clock down with `kart.hiz(2)`
  and watch it blink.
- **Solder joints take the color of their level** (red 1, gray 0, purple Z). The simulation doesn't
  know resistor values: a net connected only to passives (e.g. the LED's anode, `LED_CLK`) takes the
  color of the signal at the other end of the resistor.
- The slide switches (SW203, SW204) show their positions live.

## Troubleshooting

| Symptom | Check |
|---|---|
| LED never lights | inserted backwards (is the long leg on the signal side?), resistor in the wrong column, signal always 0 |
| LED very dim | resistor too large (3.3 kΩ: orange, orange, **red**), driver loaded |
| LED lights but the chip gets hot | series resistor missing or shorted |
| Behavior changes when you touch it | missing pull-up or pull-down (floating input), SIP network inserted backwards |
| A data line always 1 or always 0 | SIP network's dot at the wrong end: the common lead is on a signal line |
| Breaks when the clock speeds up | missing decoupling, 100 nF capacitors far from the chips, no 100 µF at the rail ends |
| Electrolytic gets hot or has swollen | inserted backwards: the stripe should be on the GND side |
| Reset never ends or never happens | C201 backwards, R201 the wrong value (10 kΩ = brown, black, orange) |
