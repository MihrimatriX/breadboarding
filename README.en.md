[Türkçe](README.md)

# breadboarding

[![CI](https://github.com/MihrimatriX/breadboarding/actions/workflows/ci.yml/badge.svg)](https://github.com/MihrimatriX/breadboarding/actions/workflows/ci.yml)

This repository shows the inside of a computer from the bottom layer to the top. **Silikon3D** is a 3D
simulator that runs in the browser: it runs the die of a real MOS 6502 transistor by transistor and
shows the signals live. The same app holds two circuit projects of ours. **CPU16** is a 16-bit computer
built entirely from 74HC chips, with its own instruction set, BIOS and C compiler. **hesap8** is an
8-bit four-function calculator that works with no program and no clock. Both circuits follow the
**schematic = code** rule: the circuit is defined once in TypeScript, and the gate-level simulation, 3D
view, KiCad schematic, bill of materials and build guide are all generated from that definition. Tests
tie every layer to the reference model.

- [What's here](#whats-here)
- [Quick start](#quick-start): [with npm](#with-npm), [with Docker](#with-docker)
- [Commands](#commands): [npm scripts](#npm-scripts), [CPU16 and hesap8 command line](#cpu16-and-hesap8-command-line)
- [Project structure](#project-structure)
- [Documentation map](#documentation-map), [build guides](#build-guides)
- [Tests and verification](#tests-and-verification)
- [Silikon3D architecture](#silikon3d-architecture)
- [Contributing](#contributing), [License](#license)

## What's here

### Silikon3D: six sections

The app's top bar has six sections. The `#...` part of the address bar shows which section is open, so
you can bookmark these addresses.

| Section | Address | What you see |
|---|---|---|
| **6502 die** | `#6502` | The die of a real MOS 6502 (visual6502 data). Metal, polysilicon and diffusion are separate layers in 3D. 3,510 transistors and 1,725 nodes run at switch level; wires at 1 light up red. You can click a wire to probe it, add it to the logic analyzer, or assemble and load your own 6502 program. |
| **CPU16 workbench** | `#cpu16` | A small development environment (Web IDE) for CPU16. You write assembly or C, compile it, and run the program on the motherboard with BIOS (VGA screen, PS/2 keyboard, UART terminal) or in a flat 64 KB memory. If a real board is connected, you can also send the program to it over Web Serial. |
| **CPU16 board 3D** | `#kart` | The whole computer in one scene: 7 boards, 460 chips, 641 passive components, ~5,000 gates. All of it runs at gate level in a Web Worker, one clock cycle at a time. You go down from the computer to a board, from the board to a chip, from the chip to a gate and from the gate to transistors, with live signals at every level. Every region and chip group on the boards has a label (**Labels**, shortcut `E`); click a label and the side panel shows its job, how it works and its chips. The monitor shows the program's output, and you can type on the keyboard. |
| **8-bit calculator 3D** | `#hesap` | The calculator's board: 216 chips, 15 seven-segment digits. You flip the switches and the result reaches the displays after the gate delays; the side panel shows what each block is computing at that moment. Regions and chip groups have labels; click one to see its description in the side panel. |
| **Architecture** | `#mimari` | Block diagrams: the CPU board, the whole computer (7 boards, backplane, peripherals) and the calculator. Each box is a functional block with its job, the chips inside it and their counts (counted from the circuit). Lines are data, address and control paths; line width is the bit count and arrows show direction. Hover over a box to highlight its paths; click it to see its chips, gates and paths in the side panel, and use "Show in 3D" to find it on the 3D board. Details: [mimari.md](cpu16/docs/mimari.en.md). |
| **Docs** | `#belgeler` | The docs for CPU16, hesap8 and the experiment kit, inside the app: a grouped list, search (ignores Turkish diacritics, shortcut `/`) and an "On this page" table of contents. Links and anchors between docs open in the app; links to source files go to GitHub. Each doc is a separate chunk that downloads only when you open it. Address: `#belgeler/<path>#<anchor>`. |

<details>
<summary>Details and keyboard shortcuts for the 6502 die section</summary>

| Feature | Description |
| --- | --- |
| 3D die | Metal, polysilicon and 4 diffusion types are separate layers. Each of the 8,233 polygons is triangulated and given thickness. |
| Live signals | The state of all 1,725 nodes is uploaded to the GPU as a single texture every frame; wires that are high (1) light up red. |
| Probing | Click any wire: its name, 0/1 state, and the transistors it drives and connects to. Click the connections to walk through the circuit. |
| Find a signal | Type a name or number such as `clk0`, `ab5`, `alucin` or `#1234` and the camera flies there. |
| Separate the layers | Use the slider to spread the layers vertically and see the diffusion underneath. |
| Transistors | 3,510 transistors drawn as blocks over the gate region; conducting ones are green. |
| Logic analyzer | Waveforms of the signals you pick, plus a visual6502-style trace table (ab, db, rw, sync, pc, a, x, y, s, p, instruction). |
| Clock control | Half cycle, full cycle, next instruction, continuous run from 1 Hz to 4 kHz. |
| Pins | Drive the RDY, RES, IRQ and NMI pins by hand. |
| Memory and program | Page 0 and the stack page are live; click a cell to write a value. Assemble your own program with the built-in 6502 assembler. |

Shortcuts: `Space` run/pause, `.` half cycle, `N` next instruction, `R` reset, `Esc` clear the
selection. Keyboard shortcuts for the CPU16 board 3D section and the `kart.*` commands in the browser
console: [3d-gorunum.md](cpu16/docs/3d-gorunum.en.md#console).

</details>

### CPU16: a 16-bit computer built from 74HC chips ([cpu16/](cpu16/README.en.md))

A project in the family of Ben Eater's 8-bit computer and the Gigatron; the difference is that it is
16 bits wide and you can open up every layer.

- Processor: 8 registers, fixed 16-bit instructions, NZCV flags, 64 KB address space, memory-mapped
  I/O at `0xFF00`. Instructions run on microcode, and the microcode is built from 74HC gates instead of
  being stored in a ROM (the CPU board has 210 chips). An instruction takes 5 clock cycles on average. For
  debugging, the CPU board has 39 LEDs (which register is being read, which one is being written, who
  drives the data bus, the flags, the micro-step) and 26 bar graph displays (data bus, PC, address,
  instruction, ALU result and the contents of all eight registers); they light up live in 3D.
- Motherboard: banked memory (32 KB EEPROM + 128 KB RAM), 2 KB cache, UART, PS/2 keyboard, timer,
  interrupt controller, a VGA 80 × 30 text board and a 16-byte "build your own memory" teaching
  board. All of it uses common 7400-series chips plus two memory chips (62256, 28C256).
- Software: the as16 assembler, the cc16 C compiler (struct, union, switch, long, pointers, libc16),
  and BIOS + monitor + UART bootloader. In the last experiment you play a snake game written in C on
  the VGA screen. C examples with line-by-line comments: [c-ornekleri.md](cpu16/docs/c-ornekleri.en.md).
- To build it: KiCad schematics, a 14-experiment kit (from the clock board to the snake game), build
  guides with a numbered wire list and chip cards for each board, an Arduino EEPROM programmer, and a
  board test that compares the real board against the simulator over UART.
- Golden model: the instruction-level reference emulator defines correct behavior. The microcode
  model, the gate-level boards and (when their turn comes) the real boards must run the same programs
  and match the emulator in lockstep.

Current stage: the simulation side is done, and the real boards come next ([roadmap](cpu16/docs/roadmap.en.md)).

### hesap8: an 8-bit four-function calculator ([hesap8/](hesap8/README.en.md))

Two 8-bit numbers (0–255) are entered on DIP switches. The calculator adds, subtracts, multiplies and
divides, and shows the result on decimal seven-segment displays (the remainder too, for division).
There is no program, microcontroller, ROM or clock: it is a purely combinational circuit of 216 common
74HC chips. All 4 × 256 × 256 = 262,144 cases have been tested at gate level and match the golden model.

## Quick start

### With npm

You need **Node 22** (`.nvmrc`). The `cpu16` and `hesap8` commands use Node's built-in TypeScript
support (`--experimental-strip-types`), so the version must be at least 22.6.

```bash
git clone https://github.com/MihrimatriX/breadboarding
cd breadboarding
nvm use              # .nvmrc: Node 22 (without nvm, install Node 22 yourself)
npm ci               # install with the versions in package-lock.json
npm run dev          # http://localhost:5173
```

Then run a few things from the command line:

```bash
npm run cpu16 -- run cpu16/programs/hello.s            # Merhaba, CPU16! (reference emulator)
npm run cpu16 -- cc cpu16/programs/c/hello.c --run     # compile C, run it in the emulator
npm run hesap8 -- hesapla 255 / 7                      # A [255]  B [  7]  sonuç [    36]  kalan [  3]
npm run check                                          # type check + all tests
```

`public/chips/mos6502/chip.json` comes ready in the repository. To regenerate it, run
`npm run import:6502` (it downloads from the visual6502 repository).

### With Docker

You don't need Node on your machine; Docker and Docker Compose v2 are enough.

```bash
docker compose up -d          # production build on nginx: http://localhost:8080
docker compose up dev         # development server (Vite + HMR): http://localhost:5173
docker compose run --rm cli cpu16 -- run cpu16/programs/hello.s
docker compose run --rm cli hesap8 -- hesapla 255 x 7
docker compose run --rm cli check                       # type check + tests
docker compose run --rm cli cpu16 -- machine            # motherboard with BIOS, UART on the terminal (exit: Ctrl-])
docker compose down           # stop
```

| Service / target | What it does |
|---|---|
| `web` | Serves the `npm run build` output with a non-root nginx on 8080. Files with a content hash in their name (`assets/*`) stay cached for a year, `index.html` is revalidated on every load, and text is sent gzipped. Health check: `/healthz`. Plain `docker compose up` starts only this service. |
| `dev` | The Vite development server. The source folder is mounted into the container, so the browser updates by itself when you save a file. `node_modules` lives in a named volume mounted over the host folder; the container doesn't write dependencies to the host. |
| `cli` | Runs `npm run <script>`: `cpu16`, `hesap8`, `check`, `test` … Files it generates (for example the `kurulum` build guides) are written to the source folder on the host. |
| `docker build --target test .` | Type checking and all tests run while the image builds (`npm run docker:test`). |

Fine tuning:

- Ports: `WEB_PORT=8000 docker compose up -d`, `DEV_PORT=5174 docker compose up dev`.
- File ownership on Linux: `dev` and `cli` run as uid 1000 in the container (the first user on most
  Linux installs). If your user ID is different:
  `DOCKER_USER="$(id -u):$(id -g)" docker compose up dev`.
- If HMR misses file changes (Docker Desktop, a Windows folder under WSL):
  `CHOKIDAR_USEPOLLING=true docker compose up dev`.
- When `package.json` changes, refresh the dependency volume:
  `docker compose down -v && docker compose up --build dev`.
- Web Serial (loading onto a real board from the CPU16 workbench) only works in a secure context:
  `localhost` or HTTPS. If you open the server from another machine as `http://ip:8080`, the simulator
  works but sending to the board does not.
- On a corporate network that inspects TLS, `npm ci` fails with a certificate error. Pass the root
  certificate as a secret so it stays out of the image: `docker build --secret id=npm_ca,src=kok-sertifika.pem .`
- The container has no `kicad-cli` or Chromium, so `npm run cpu16 -- kurulum` and `breadboard-belge` produce only HTML there.
  For the PDFs, run the command on the host ([kurulum.md](cpu16/docs/kurulum.en.md)).

The details are in the comments in `Dockerfile`, `docker-compose.yml` and `docker/nginx/default.conf`.

### Deploying: search engines and link previews

The build writes a page for each section at the root: `index.html` (home page), `6502.html`,
`cpu16.html`, `kart.html`, `hesap.html`, `mimari.html` and `belgeler.html`. They are all the same app.
Each has its own title, description, Open Graph and Twitter card (`public/og/*.png`, 1200×630) and
JSON-LD, and opens the app in its section. nginx serves them at addresses such as `/kart` and `/6502`.
Next to them are `robots.txt`, `site.webmanifest` and the icons (`favicon.svg`, `icon-192.png`,
`icon-512.png`, `apple-touch-icon.png`). All the text lives in one place: [src/seo.ts](src/seo.ts).

Give the build the site's public address. It is used for the canonical link, `og:url`, absolute
image URLs and `sitemap.xml`:

```bash
SITE_URL=https://silikon3d.example npm run build
SITE_URL=https://silikon3d.example docker compose up -d --build
```

Without it, the tags use relative URLs and no sitemap is written. Some sites (Facebook, LinkedIn)
only show a preview image when its URL is absolute.

## Commands

### npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite development server, http://localhost:5173 |
| `npm run build` | type check (`tsc -b`) + production build into `dist/` |
| `npm run preview` | serve `dist/` locally (http://localhost:4173) |
| `npm test` | all vitest tests (6502, CPU16, hesap8; ≈ 1 minute) |
| `npm run typecheck` | type check only |
| `npm run check` | type check + tests: run this before you open a PR |
| `npm run cpu16 -- <command>` | CPU16 command line (below) |
| `npm run hesap8 -- <command>` | calculator command line (below) |
| `npm run import:6502` | download the 6502 die data from visual6502 and convert it to `public/chips/mos6502/chip.json` |
| `npm run docker:build` | build the production image (`docker compose build web`) |
| `npm run docker:up` / `docker:down` | start `web` in the background (http://localhost:8080) / stop it |
| `npm run docker:dev` | development server in Docker |
| `npm run docker:test` | run the tests inside the Docker image |

### CPU16 and hesap8 command line

In Docker the same commands start with `docker compose run --rm cli` instead of `npm run`.

| Command | What it does |
|---|---|
| `npm run cpu16 -- run cpu16/programs/fib.s [--trace]` | assemble an assembly program and run it in the reference emulator |
| `npm run cpu16 -- asm program.s [-o x.hex\|x.bin] [--list]` | assemble with as16 (Intel HEX or raw binary) |
| `npm run cpu16 -- dis x.bin` | disassemble a binary file |
| `npm run cpu16 -- cc program.c --run` | compile C with cc16 and run it in the emulator |
| `npm run cpu16 -- cc cpu16/bios/ornekler/selam.c --hedef bios --run` | run a C program on the model of the motherboard with BIOS |
| `npm run cpu16 -- machine [program.s]` | motherboard + BIOS; UART connected to the terminal (exit: Ctrl-]) |
| `npm run cpu16 -- machine cpu16/kit/programlar/bellek-deneme.s --rom --led` | experiment program without the BIOS, FF00 LEDs |
| `npm run cpu16 -- bios -o bios.bin` / `charrom -o charrom.bin` | EEPROM images (28C256) |
| `npm run cpu16 -- chips` | parts library: gate and transistor counts |
| `npm run cpu16 -- board` | chip counts per board and electrical rule check (ERC) |
| `npm run cpu16 -- board kicad` | regenerate the KiCad schematics and BOMs (`cpu16/kicad/`) |
| `npm run cpu16 -- kontrol` | after a microcode change, regenerate and check the control unit (74HC gates) |
| `npm run cpu16 -- zamanlama [--anakart]` | static timing analysis from the schematic |
| `npm run cpu16 -- kit` | regenerate the automatic sections of the experiment guides |
| `npm run cpu16 -- kurulum hepsi` | build guides (wire list, chip cards, handbook) |
| `npm run cpu16 -- mimari [cpu\|makine\|hesap\|hepsi] [-o dir]` | architecture (block) diagrams as standalone SVGs (without a directory: the images in the docs) |
| `npm run cpu16 -- kart-testi --port /dev/ttyUSB0` | compare the real board with the simulator over UART |
| `npm run hesap8 -- ozet [--yol]` | calculator: chips block by block, longest path, ERC |
| `npm run hesap8 -- hesapla 255 x 7` | run the gate-level circuit and print the displays (`+ - x /`) |
| `npm run hesap8 -- dogrula [--hepsi]` | compare with the golden model (`--hepsi`: 262,144 cases) |

All the options: the top of `cpu16/tools/cli.ts` and [cpu16/README.md](cpu16/README.en.md#commands).

## Project structure

```
breadboarding/
├── src/                    Silikon3D web app (React 18 + react-three-fiber + Vite)
│   ├── chip/ sim/ render/  6502 die: chip data format, switch-level engine, 3D layers
│   ├── ui/ state/          panels, section switching, zustand store
│   ├── cpu16/              CPU16 workbench: Web IDE, motherboard + BIOS, Web Serial
│   ├── board3d/            3D view of the CPU16 and calculator boards (gate level, Web Worker)
│   └── mimari/             Architecture section: block diagrams (pan, zoom, detail panel)
├── cpu16/                  the CPU16 computer (details: cpu16/README.md)
│   ├── docs/               design docs: spec, microarchitecture, boards, motherboard, BIOS, cc16, production
│   ├── emu/ asm/ micro/    reference emulator (golden model), as16 assembler, microcode
│   ├── chips/              74HC parts library: gate model, CMOS transistor expansion, KiCad symbol
│   ├── board/              boards as code (schematic = code), ERC, timing analysis, KiCad output
│   ├── kicad/              generated KiCad schematics and BOMs (never edited by hand)
│   ├── bios/ cc/ lib/      BIOS and examples, cc16 C compiler, crt0 and libc16
│   ├── programs/           example assembly and C programs
│   ├── kit/                experiment kit: 14 experiment guides, test programs
│   ├── kurulum/            build guide generator (HTML + PDF)
│   ├── mimari/             block diagrams: layout, content from the circuit, netlist check, SVG
│   ├── programlayici/      Arduino EEPROM programmer and yaz.py
│   ├── tools/              npm run cpu16 commands
│   └── tests/              vitest tests
├── hesap8/                 8-bit calculator: circuit, simulation, command line, docs, tests
├── public/chips/mos6502/   6502 die data (visual6502, CC BY-NC-SA 3.0)
├── scripts/                import-visual6502.mjs
├── tests/                  6502 tests (against visual6502's recorded trace)
├── docs/                   reading path for the docs
├── docker/nginx/           nginx config for the production image
├── Dockerfile, docker-compose.yml, .dockerignore
└── .github/                CI (tests, build, Docker image) and issue templates
```

## Documentation map

If you are new, here is an order for reading the docs: **[docs/README.md](docs/README.en.md)**.

| Topic | Document |
|---|---|
| Contributing: setup, branch and PR workflow, rules | [CONTRIBUTING.md](CONTRIBUTING.en.md) |
| Short index: folders, commands, rules that never change, pitfalls (Claude Code reads it every session) | [CLAUDE.md](CLAUDE.md) |
| CPU16 overview and commands | [cpu16/README.md](cpu16/README.en.md) |
| Roadmap, phases, current stage | [roadmap.md](cpu16/docs/roadmap.en.md) |
| Design, instruction set, memory map | [spec.md](cpu16/docs/spec.en.md), [isa-ayrintilari.md](cpu16/docs/isa-ayrintilari.en.md) |
| Assembler (as16) | [as16.md](cpu16/docs/as16.en.md) |
| Microarchitecture, microcode, control unit built from gates | [mikromimari.md](cpu16/docs/mikromimari.en.md) |
| 74HC parts library | [parcalar.md](cpu16/docs/parcalar.en.md) |
| Boards: schematic = code, KiCad, ERC | [kartlar.md](cpu16/docs/kartlar.en.md) |
| Architecture (block) diagrams: CPU board, whole computer, calculator | [mimari.md](cpu16/docs/mimari.en.md) |
| Motherboard: memory, cache, I/O, video | [anakart.md](cpu16/docs/anakart.en.md), [anakart-kartlari.md](cpu16/docs/anakart-kartlari.en.md), [anakart-gc-video.md](cpu16/docs/anakart-gc-video.en.md) |
| 3D board view and console API | [3d-gorunum.md](cpu16/docs/3d-gorunum.en.md) |
| BIOS, monitor, bootloader | [bios.md](cpu16/docs/bios.en.md) |
| C compiler (cc16) | [cc16.md](cpu16/docs/cc16.en.md) |
| Annotated C examples | [c-ornekleri.md](cpu16/docs/c-ornekleri.en.md) |
| Production: clock speed, build order, board test | [uretim.md](cpu16/docs/uretim.en.md) |
| Build guides: wire list, chip cards, handbook | [kurulum.md](cpu16/docs/kurulum.en.md) |
| The whole computer on breadboards: breadboard panels, ribbon cable, hole-to-hole wires | [breadboard.md](cpu16/docs/breadboard.en.md) |
| Experiment kit (14 experiments) | [kit/README.md](cpu16/kit/README.en.md), first [led-ve-direnc.md](cpu16/kit/led-ve-direnc.en.md) |
| The calculator | [hesap8/README.md](hesap8/README.en.md), [tasarim.md](hesap8/docs/tasarim.en.md), [kurulum-rehberi.md](hesap8/docs/kurulum-rehberi.en.md) |
| License of the 6502 data | [NOTICE.md](public/chips/mos6502/NOTICE.md) |

### Build guides

If you want to build with real chips, go in this order:

1. [LEDs, resistors and capacitors](cpu16/kit/led-ve-direnc.en.md): read it once before the first experiment.
2. [Experiment kit](cpu16/kit/README.en.md): [Experiment 1: clock board](cpu16/kit/deney-01-saat.md) → …
   → [Experiment 13: snake game](cpu16/kit/deney-13-c.md); optionally
   [Experiment 14: build your own memory](cpu16/kit/deney-14-kendin-yap-bellek.md).
3. [Build guides](cpu16/docs/kurulum.en.md): layout per board, numbered wire list, chip cards
   (`npm run cpu16 -- kurulum hepsi`). Two routes: PCB or breadboard panels
   ([breadboard.md](cpu16/docs/breadboard.en.md), `npm run cpu16 -- breadboard-belge hepsi`).
4. [Production and bring-up](cpu16/docs/uretim.en.md): speed target, build order, board test.
5. The calculator: [physical build guide](hesap8/docs/kurulum-rehberi.en.md)
   (`npm run cpu16 -- kurulum hesap`).

## Tests and verification

```bash
npm test                                                  # all tests (760 tests, ≈ 1 minute)
npm run check                                             # type check + tests
npx vitest run cpu16/tests/emu.test.ts                    # a single file
npx vitest run cpu16/tests/cc-bios.test.ts -t "yılan"     # tests in one file whose name matches
```

A layer counts as "done" once it passes its tests:

- 6502: `tests/mos6502.test.ts` compares our engine with a 600-half-cycle trace recorded from
  visual6502's original `chipsim.js` (address bus, data bus, R/W, SYNC). It also checks that the sum of
  1..10 comes out as 55 and that SP=$FD after reset. In Node the engine runs ≈ 12,000 half cycles per second.
- CPU16: every opcode and flag edge case; the microcode model, the gate-level CPU and the whole
  motherboard match the emulator instruction by instruction (BIOS boot and the timer interrupt
  included); every chip passes its datasheet table at gate and transistor level; the KiCad files and
  experiment guides are identical to what the code regenerates (a schematic fixed by hand without
  updating the code turns CI red); the C compiler, BIOS, snake game, build guides, timing.
- hesap8: 74HC4511, the structure of the circuit, edge cases, lamp test, the KiCad netlist; for every
  case, `npm run hesap8 -- dogrula --hepsi`.

Some tests run extra checks when they find a tool and are skipped when they don't: `kicad-cli`
(KiCad 7+, schematic netlists), `g++` and `python3` (the EEPROM programmer software). The Docker test
target doesn't have these tools, so 16 tests are skipped there.

GitHub Actions runs the tests and the build on every push and PR. It also builds the Docker image and
checks that the container serves the page with the right headers (`.github/workflows/ci.yml`).

## Silikon3D architecture

```
src/
  chip/            Shared chip data format (ChipData) and derived indexes
  sim/
    SwitchLevelEngine.ts   Switch-level netlist simulator (NMOS + PMOS)
    machines/mos6502.ts    Machine that connects the die to memory, clock and buses
    sim.worker.ts          The simulation runs on a separate thread
    SimClient.ts           Worker <-> React bridge
    asm6502.ts             Assembler / disassembler
  render/
    dieGeometry.ts         Polygon -> 3D layer geometry (earcut)
    geometry.worker.ts     Triangulation on a separate thread
    DieModel.tsx           Layer meshes, shader, BVH picking under the mouse
    shaders.ts             Shader that reads node state from a data texture
    Transistors.tsx        3,510 transistors with InstancedMesh
    CameraRig.tsx          Camera flight to the selected signal
  state/           zustand store + large arrays that change every frame (live.ts)
  ui/              Panels, section switching
  cpu16/           CPU16 workbench (uses the emulator and compiler under cpu16/ directly)
  board3d/         Board 3D view; board.worker.ts runs the gate-level machine
  mimari/          Block diagrams (drawing from cpu16/mimari; SVG by hand, no library)
```

**Data flow (6502):** every ~16 ms the worker runs as many half cycles as its budget allows and sends
the node and transistor states as `Uint8Array` (zero-copy transfer). `SimClient` puts them in the `live`
object; only registers, pins and trace rows go to React. On the 3D side, `useFrame` updates the texture
if `live.version` has changed. This way React doesn't re-render on every node change.

**Why this stack:**

| Choice | Why | Alternative |
| --- | --- | --- |
| React + react-three-fiber | Panel UI and 3D scene share one component model | Plain Three.js (less abstraction, but the UI by hand) |
| Web Worker | At 4 kHz the simulation runs without stalling the 3D view | WASM (Rust) engine: 5-10× faster, may be needed for large chips |
| Data texture + shader | 1,700 nodes in a single texture update | One material per node (thousands of draw calls) |
| three-mesh-bvh | Instant mouse picking on a million triangles | GPU picking (color-coded second render) |
| zustand | Selector-based subscriptions, no needless renders | Redux Toolkit (too much at this scale) |

**Next steps for Silikon3D:** the die of our own chip (Verilog → Yosys → OpenLane/OpenROAD with the
open Sky130 PDK; a GDS importer, multi-layer metal and vias), a schematic view that groups the
transistors in a selected region into gates, a Rust + WASM engine and LOD for large chips, and camera
path recording with frame-by-frame export for video. CPU16 has its own roadmap:
[roadmap.md](cpu16/docs/roadmap.en.md).

## Contributing

Setup, branch and PR workflow, code rules, and adding a new chip / board / example program:
**[CONTRIBUTING.md](CONTRIBUTING.en.md)**. For a new feature or a bug, use the "Özellik isteği"
(feature request) or "Hata bildirimi" (bug report) template under **Issues > New issue** on GitHub.

## License

The code is MIT ([LICENSE](LICENSE)). The die data under `public/chips/mos6502/` belongs to the
visual6502 project and is distributed under **CC BY-NC-SA 3.0** (no commercial use, attribution
required; [NOTICE.md](public/chips/mos6502/NOTICE.md)). If you use 6502 images in monetized videos,
keep this license in mind. The CPU16 and calculator data are not subject to this restriction.
