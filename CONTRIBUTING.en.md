# Contributing guide

For anyone who wants to contribute to this repository: setting up the environment, sending a change as
a PR, the repository's rules, and the steps for common tasks (new chip, board, example program). If you
are new to the project, start with the [README](README.en.md) and the [reading path for the docs](docs/README.en.md).

## Environment

**With npm** (Node 22, `.nvmrc`; at least 22.6 for the `cpu16` and `hesap8` commands):

```bash
git clone https://github.com/MihrimatriX/breadboarding
cd breadboarding
nvm use
npm ci
npm run dev        # http://localhost:5173
npm run check      # type check + tests
```

**With Docker** (no Node needed):

```bash
docker compose up dev                 # http://localhost:5173, the browser updates when you save a file
docker compose run --rm cli check     # type check + tests
docker compose run --rm cli cpu16 -- board
```

On Linux, if your user ID isn't 1000, put `DOCKER_USER="$(id -u):$(id -g)"` in front of the commands.
Details: [README, With Docker](README.en.md#with-docker).

Optional tools turn on extra tests (without them those tests are skipped): KiCad 7+ (`kicad-cli`:
schematic netlists and schematic PDFs), `g++` and `python3` (EEPROM programmer), `playwright` + Chromium
(PDFs of the build guides).

## Branch and PR workflow

1. Start a short-lived branch from `main`: `git switch -c hesap8-bolme-hizi`. One branch, one topic.
2. Make small commits that make sense on their own. Commit messages are in Turkish and follow the
   repository's format, `Konu: ne değişti` (topic: what changed), e.g. `Hesap makinesi: çok sayfalı KiCad şeması, komut satırı aracı ve testler`,
   `Zamanlama: bütün anakartın analizi; 74AC ailesi seçeneği`.
3. Before pushing:
   ```bash
   npm run check        # tsc -b + vitest (755 tests, ≈ 1 minute)
   npm run build        # production build
   ```
   If a board, microcode or experiment definition changed, regenerate the generated files first
   ([below](#generated-files)); the tests catch any that are stale.
4. Push the branch and open a PR against `main`. In the PR description, write what changed and how you
   tested it, and add a screenshot if the change needs one.
5. CI (tests, build, Docker image) must be green. **AFU reviews and merges**; nobody pushes to `main`
   directly.

If the spec ([spec.md](cpu16/docs/spec.en.md)) needs a change, first open a PR that changes only the
spec; the code comes after it ([roadmap](cpu16/docs/roadmap.en.md), rule 4).

For bugs and requests, GitHub has the "Hata bildirimi" (bug report) and "Özellik isteği" (feature
request) templates under **Issues > New issue**.

## Rules

### Schematic = code

Circuits are not drawn by hand. `cpu16/board/*.ts` (CPU16) and `hesap8/kart.ts` (the calculator) place
the chips and connect their pins to nets; the gate-level simulation, 3D view, KiCad schematic, BOM, the
parts tables in the experiment guides and the build guides are all generated from this definition.

- Don't edit the files under `cpu16/kicad/` by hand: change the definition and regenerate with
  `npm run cpu16 -- board kicad`. In KiCad only visual edits are allowed; a connection change that
  doesn't make it into the code turns CI red.
- A new part or net shows up in the 3D view, in KiCad and in the build guide as soon as it appears on
  the board. There is no hand-maintained list.

### Golden model: every layer matches the reference emulator

`cpu16/emu/` (the instruction-level emulator and the motherboard model `Machine`) defines correct
behavior. The microcode model (`cpu16/micro/`), the gate-level boards (`cpu16/board/`) and the real
boards must run the same programs and produce the same results as the emulator in lockstep.

- A change in behavior goes into the emulator and [isa-ayrintilari.md](cpu16/docs/isa-ayrintilari.en.md)
  first, and the lower layers are then made to match. If the emulator and the doc disagree, fix both
  together.
- When you find a bug, look in the layer where the difference first appears: the lockstep tests tell you which one.
- In hesap8 the golden model is `hesap8/model.ts`; the circuit must match it in every case
  (`npm run hesap8 -- dogrula --hepsi`).

### "Done" = test

A task is finished when it passes its tests. New behavior comes with a new test; tests live under
`cpu16/tests/`, `hesap8/tests/` or `tests/` (6502), depending on the file's topic. Some tests also check
that the generated files in the repository are up to date (KiCad, the symbol library, the embedded copy
of the microcode, the experiment guides).

### Code style

- Language: comments and commit messages are in Turkish. UI text is bilingual: `t("Durdur", "Stop")`
  (`src/ui/ceviri.ts`, details in `src/CLAUDE.md`). Docs are written in Turkish first, with the English
  version next to them (`spec.md` → `spec.en.md`); when you change a Turkish doc, update the English one
  too. In new code the identifiers are
  mostly Turkish too (`kurulumPlani`, `b.block = "Adres çözme"` in `buildKybCard`, `HesapSim`,
  `sinyalSinifi`); older parts (the 6502 side, the emulator core) are in English. Match the language of
  the file you change, and don't mix languages within one file.
- File header comment: a few lines on what the file does, who calls it and the related document (e.g.
  `cpu16/board/kyb-card.ts`, `cpu16/tools/cli.ts`). Generated files start with "do not edit by hand"
  and the command that generates them.
- TypeScript: `strict`, no unused variables or parameters (`tsc -b` reports them as errors). Code that
  runs in Node (`cpu16/`, `hesap8/`) uses imports with the `.ts` extension and runs directly with
  `node --experimental-strip-types`, so use only syntax that works by type stripping (no `enum`,
  `namespace` or parameter properties).
- Pure functions: computation and drawing logic stays outside React components, in tested pure
  functions (e.g. `src/board3d/wires.ts`, `screen.ts`, `cpu16/kurulum/plan.ts`).
- Formatting: 2-space indent (4 for C and Python), LF, UTF-8; `.editorconfig` tells your editor about
  these. The repository has no automatic formatter, so follow the style of the surrounding code.
- Dependencies: versions in `package.json` are pinned exactly (no `^`). If you need a new dependency,
  explain why in the PR; `package-lock.json` goes into the commit too.

## Common tasks

### Adding a new chip

In short, from [parcalar.md](cpu16/docs/parcalar.en.md#adding-a-new-chip):

1. Write a `ChipDef` under `cpu16/chips/parts/`: pin names in datasheet order, the gate circuit
   (`build`), the datasheet's function table (`ref`).
2. Add it to the list in `cpu16/chips/library.ts`.
3. Refresh the symbol library with `npm run cpu16 -- kicad-sym`, then run
   `npx vitest run cpu16/tests/chips.test.ts`: the gates = table and transistors = gates tests run for
   the new chip automatically.

Only common parts with more than one manufacturer go into the library (AFU's decision, [spec.md](cpu16/docs/spec.en.md)).

### Adding a new board (CPU16 motherboard)

1. `cpu16/board/<name>-card.ts`: `build<Name>Card(b: Board)`; `b.card = "<name>"`, `b.block = "…"` for
   the blocks, chips with `b.place("74HC138", { pin: "NET", … })`. The smallest board makes a good
   example: `kyb-card.ts`.
2. Add the behavior model to `cpu16/emu/machine.ts` (or `emu/devices/`): the golden model comes first.
3. Add the board to the `FULL_MACHINE_CARDS` list in `cpu16/board/machine-board.ts`. The whole
   motherboard, the timing analysis and the 3D view use this list; the board appears in 3D by itself.
4. For KiCad, `cpu16/board/kicad-files.ts` → `KICAD_CARDS`; for the title, `cpu16/board/layout.ts` →
   `CARD_TITLES`; for the build guide, `cpu16/kurulum/kartlar.ts` → `KURULUM_KARTLARI`.
5. Write a test that compares the board with the emulator (examples: `cpu16/tests/anakart-gc.test.ts`,
   `anakart-bellek.test.ts`).
6. `npm run cpu16 -- board` (chip counts and ERC), `npm run cpu16 -- board kicad`, and if the board goes
   into the experiments, `cpu16/kit/deneyler.ts` → `DENEYLER` and `npm run cpu16 -- kit`. Describe the
   board in the docs ([kartlar.md](cpu16/docs/kartlar.en.md), [anakart.md](cpu16/docs/anakart.en.md)).

### Adding a new example program

| Where | For | Where it shows up by itself | Test |
|---|---|---|---|
| `cpu16/programs/<name>.s` | assembly that runs in flat 64 KB memory | CPU16 workbench → Flat memory examples | `cpu16/tests/programs.test.ts` |
| `cpu16/programs/c/<name>.c` | cc16's `rom` target (`cc … --run`) | command line | `cpu16/tests/cc.test.ts`, "örnek programlar" |
| `cpu16/bios/ornekler/<name>.s` / `.c` | a program that runs on the BIOS (`--hedef bios`, `G 4000`) | CPU16 workbench → Motherboard + BIOS examples | `cpu16/tests/bios.test.ts` (asm), `cc-bios.test.ts` (C) |
| `cpu16/kit/programlar/<name>.s` | EEPROM programs for the experiments that come before the BIOS (`machine --rom`) | CPU16 board 3D → Program examples | `cpu16/tests/kit.test.ts` |

At the top of the program, write a comment that says what it does and how to run it; check its output in
a test. For the format of the annotated C examples, see [c-ornekleri.md](cpu16/docs/c-ornekleri.en.md).

### Changing an experiment guide

In the `cpu16/kit/deney-*.md` files, the section between `<!-- otomatik: başla … -->` and
`<!-- otomatik: bitti -->` (parts and pin-by-pin connections) is generated from the board definitions:
don't write there by hand, run `npm run cpu16 -- kit`. You can edit the text outside the markers freely.

## Generated files

| File | Command that generates it | When | In the repo | Checked by |
|---|---|---|---|---|
| `cpu16/kicad/**` (schematics, `cpu16.kicad_sym`, BOMs; `hesap/` included) | `npm run cpu16 -- board kicad` | when `cpu16/board/`, `cpu16/chips/` or `hesap8/kart.ts` changes | yes | `board.test.ts`, `chips.test.ts`, `hesap.test.ts` |
| `cpu16/kicad/cpu16.kicad_sym` (symbol library only) | `npm run cpu16 -- kicad-sym` | when a chip or passive is added | yes | `chips.test.ts` |
| `cpu16/micro/cpu16-ucode.ts` (embedded copy of the microcode) | `npm run cpu16 -- kontrol` | when `cpu16/micro/cpu16.ucode` changes | yes | `kontrol.test.ts` |
| auto-generated sections of `cpu16/kit/deney-*.md`, `cpu16/kit/gorseller/*.svg` | `npm run cpu16 -- kit` | when a board definition or `kit/deneyler.ts` changes | yes | `kit.test.ts` |
| `cpu16/docs/img/mimari-*.svg`, `hesap8/docs/img/mimari-hesap.svg` (block diagrams) | `npm run cpu16 -- mimari` | when a board definition, the diagram layout (`cpu16/mimari/`, `hesap8/mimari.ts`) or the theme colors (`src/mimari/mimari.css`, `src/styles.css`) change | yes | `cpu16/tests/mimari.test.ts` |
| `cpu16/breadboard/veri/<board>.ts` (breadboard layout and wires, with the netlist's fingerprint) | `npm run cpu16 -- breadboard --uret [board,…]` (CPU board ≈ 2.5 minutes) | when the board's netlist or the breadboard definition (`cpu16/breadboard/panolar.ts`, `yerlesim.ts`) changes | yes | `cpu16/tests/breadboard.test.ts` (fingerprint, connections match the netlist one to one) |
| `hesap8/breadboard/veri.ts` | `npm run hesap8 -- breadboard --uret` | when `hesap8/kart.ts` or `hesap8/breadboard/yerlesim.ts` changes | yes | `hesap8/tests/breadboard.test.ts` |
| `cpu16/breadboard/cikti/`, `hesap8/breadboard/cikti/` (breadboard build guides) | `npm run cpu16 -- breadboard-belge hepsi`, `npm run hesap8 -- breadboard-belge` | when you want them (for printing) | no (`.gitignore`) | `breadboard.test.ts` (HTML content) |
| `cpu16/kurulum/cikti/` (build guides as HTML + PDF, schematic PDFs) | `npm run cpu16 -- kurulum hepsi`, `… kurulum hesap` | when you want them (for printing) | no (`.gitignore`) | `kurulum.test.ts` (HTML content) |
| `public/chips/mos6502/chip.json` | `npm run import:6502` | when the visual6502 data or the converter changes | yes | `tests/mos6502.test.ts` |
| `public/og/*.png` (link previews), `public/icon-*.png`, `public/apple-touch-icon.png` | `npm run dev`, then `http://localhost:5173/scripts/og-gorselleri.html` (downloads the images one by one) | when a page title in `src/seo.ts` changes or a section is added | yes | `cpu16/tests/seo.test.ts` (every page has an image, sizes are right) |
| `dist/` | `npm run build` (with `SITE_URL=…` for canonical URLs and `sitemap.xml`) | release | no | CI |

The build guide PDFs need the `playwright` package (in the repository or global) and Chromium, and the
schematic PDFs need `kicad-cli`; without them only HTML is written ([kurulum.md](cpu16/docs/kurulum.en.md)).
The Docker container doesn't have these tools.

## Documentation

- The root [CLAUDE.md](CLAUDE.md) and the `CLAUDE.md` files under `cpu16/`, `hesap8/` and `src/` are
  short indexes: Claude Code reads them every session, and they are also the shortest introduction for a
  newcomer. If you add a new folder, command, generated file or rule, update the matching `CLAUDE.md` too.
- If you add a new document, link it from the [documentation map in the README](README.en.md#documentation-map)
  and from the [reading path](docs/README.en.md).
- Numbers in the docs (chip, test and wire counts) come from the code; when you change them, verify
  them with the matching command (`board`, `chips`, `hesap8 -- ozet`).
- When a phase or a large piece of work is done, update the "Now" line at the top of
  [roadmap.md](cpu16/docs/roadmap.en.md).
