// Kart görünümünün durumu: worker istemcisi, seçimler, teller, program düzenleyicisi ve canlı değerler
// (net seviyeleri, ekran, bellek penceresi). Sahnede ya bütün CPU16 bilgisayarı (anakartın bütün
// kartları, worker'da) ya da 8 bit hesap makinesi (hesap.ts, ana iş parçacığında) vardır: kartın
// yapısı aktif.ts'ten, seçimler ve canlı değerler buradan.

import { create } from "zustand";
import type { Board } from "../../cpu16/board/board";
import type { BoardLayout } from "../../cpu16/board/layout";
import type { GateState } from "../../cpu16/board/computer";
import { LIB } from "../../cpu16/cc/lib-vite";
import { TerminalText } from "../cpu16/serial";
import { useAyar } from "../ui/ayarlar";
import { cizimIste } from "../render/cizimDongusu";
import { ceviri, type Dil, type IkiDil } from "../ui/ceviri";
import { aktifGorunum, aktifKart, cpuBbHazir, cpuBbYukle, gorunumDegisince, gorunumHazir, gorunumSec, kartDegisince, kartModeli, kartParcasi, kartUclari, kartYerlesimi, type Gorunum, type KartTuru, type Parca } from "./aktif";
import { compileProgram, detectLanguage, type Lang, type ProgramError } from "./program";
import type { FromWorker, MemWindow, ToWorker } from "./protocol";
import { ekranBilgisi, type ScreenFrame } from "./screen";
import type { Endpoint } from "./wires";

/** Seçili arayüz dili (derleme özeti ve ekran bilgisi bu dilde yazılır) */
const seciliDil = (): Dil => useAyar.getState().dil;

// ---------------------------------------------------------------- örnek programlar

const kit = import.meta.glob("../../cpu16/kit/programlar/*.s", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const progs = import.meta.glob("../../cpu16/programs/hello.s", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const own = import.meta.glob("./ornekler/*.{s,c}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const fileName = (p: string) => p.split("/").pop()!;

export interface Example {
  name: string;
  label: IkiDil;
  source: string;
}

const EXAMPLE_LABELS: Record<string, IkiDil> = {
  "video-deneme.s": { tr: "video-deneme.s · VGA: Merhaba, 16 renk, kare sayacı", en: "video-deneme.s · VGA: hello, 16 colors, frame counter" },
  "merhaba-vga.c": { tr: "merhaba-vga.c · C: printf (UART) ve VGA", en: "merhaba-vga.c · C: printf (UART) and VGA" },
  "gc-deneme.s": { tr: "gc-deneme.s · UART, zamanlayıcı, klavye kesmeleri", en: "gc-deneme.s · UART, timer and keyboard interrupts" },
  "bellek-deneme.s": { tr: "bellek-deneme.s · 128 KB RAM sınaması", en: "bellek-deneme.s · 128 KB RAM test" },
  "onbellek-deneme.s": { tr: "onbellek-deneme.s · önbellek açık / kapalı", en: "onbellek-deneme.s · cache on / off" },
  "kyb-deneme.s": { tr: "kyb-deneme.s · kendin yap bellek kartı (16 × 74HC574)", en: "kyb-deneme.s · DIY memory board (16 × 74HC574)" },
  "hello.s": { tr: "hello.s · UART'a merhaba", en: "hello.s · hello on the UART" },
};
const ORDER = ["video-deneme.s", "merhaba-vga.c", "gc-deneme.s", "hello.s", "bellek-deneme.s", "onbellek-deneme.s", "kyb-deneme.s"];

export const EXAMPLES: Example[] = Object.entries({ ...kit, ...progs, ...own })
  .map(([p, source]) => ({ name: fileName(p), label: EXAMPLE_LABELS[fileName(p)] ?? { tr: fileName(p), en: fileName(p) }, source }))
  .sort((a, b) => {
    const ia = ORDER.indexOf(a.name);
    const ib = ORDER.indexOf(b.name);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name);
  });

// ---------------------------------------------------------------- kart modeli

/**
 * Sahnedeki kartın yapısı (aktif.ts): CPU16'da ana iş parçacığında da kurulur (yerleşim, çip içi
 * şemaları), worker'dakiyle aynı; hesap makinesinde simülasyon da bu kartla çalışır.
 */
export function boardModel(): { board: Board } {
  return kartModeli();
}
export function boardLayoutData(): BoardLayout {
  return kartYerlesimi();
}
/** Her netin uçları (çip ve pasif pinleri) */
export function netEnds(): Map<number, Endpoint[]> {
  return kartUclari();
}
/** Referanstan yerleşim: çip ya da pasif eleman */
export function findPart(ref: string | null): Parca | null {
  return kartParcasi(ref);
}

/**
 * Her karede değişen net değerleri React durumuna konmaz; çizim döngüsü buradan okur. Tuval isteğe bağlı
 * çizilir: değerleri (ve ekranı) yazan yer cizimIste() der.
 */
export const liveNets = { values: null as Uint8Array | null, prev: null as Uint8Array | null, version: 0 };

/** Her kart türünün son net değerleri: sahnedeki kart değişince canlı değerler onunkine döner */
const sonDegerler = new Map<KartTuru, Uint8Array>();

/** Bir kartın yeni net değerleri; kart sahnedeyse hemen çizilir */
export function netDegerleri(tur: KartTuru, values: Uint8Array): void {
  sonDegerler.set(tur, values);
  if (tur !== aktifKart()) return;
  liveNets.prev = liveNets.values;
  liveNets.values = values;
  liveNets.version++;
  cizimIste();
}
/** Ekran (metin kipinden ya da ışın kipinden) ve izlenen bellek penceresi */
export const liveScreen = { frame: null as ScreenFrame | null, beam: null as { rgba: Uint8ClampedArray; width: number; height: number; x: number; y: number } | null, version: 0 };
export const liveMem = { window: null as MemWindow | null, version: 0 };

/** Saat hızı seçenekleri (Hz); 0: en hızlı */
export const SPEEDS = [1, 4, 20, 200, 1000, 0];
export const speedLabel = (hz: number, dil: Dil = "tr"): string =>
  hz === 0 ? (dil === "en" ? "fastest" : "en hızlı") : hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`;

export type WireMode = "yok" | "secili" | "hepsi";
export type LangMode = "otomatik" | Lang;

interface KartState {
  ready: boolean;
  error: string | null;
  running: boolean;
  hz: number;
  state: GateState | null;
  cycles: number;
  rate: number;
  uart: string;
  /** yan panelleri yenilemek için sayaç (saniyede ~10) */
  tick: number;
  /** seçili çip ya da pasif eleman */
  chip: string | null;
  gate: number | null;
  net: number | null;
  /** breadboard'da tıklanıp seçilen atlama teli: panosu (kart) ve no'su; çip ve net seçimiyle birlikte olmaz */
  tel: { kart: string; no: number } | null;
  /** üstüne gelinen parça; ek: ipucuna eklenen satır (ör. DIP anahtarın hangi anahtarı) */
  hover: { ref: string; x: number; y: number; ek?: string } | null;
  /**
   * kamera bu bloğa (ya da "Gösterge" gibi bir ön adla başlayan bloklara) gitsin; blok null: genel
   * bakış. n her istekte artar: aynı yere yeniden gidilebilsin.
   */
  odak: { blok: string | null; kart?: string; n: number } | null;
  wires: WireMode;
  /** GND / VCC tellerini de çiz */
  power: boolean;
  /** sahnedeki kartın görünümü: breadboard (atlama telleri) ya da PCB */
  gorunum: Gorunum;
  /** bilgisayarın breadboard verisi yükleniyor (ayrı parça) */
  gorunumYukleniyor: boolean;
  // ekran
  screenText: string;
  screenInfo: string;
  beam: boolean;
  beamFrames: number;
  /** worker'ın bulduğu bağlantılar */
  has: { screen: boolean; keyboard: boolean; uart: boolean; beam: boolean };
  // program düzenleyicisi
  example: string;
  source: string;
  langMode: LangMode;
  errors: ProgramError[];
  info: string;
  /** EEPROM'daki programın adı */
  loaded: string;
  run(): void;
  pause(): void;
  step(mode: "cycle" | "instr"): void;
  reset(): void;
  setHz(hz: number): void;
  selectChip(ref: string | null): void;
  selectGate(g: number | null): void;
  selectNet(n: number | null): void;
  selectTel(t: { kart: string; no: number } | null): void;
  /** kamerayı yerleşimdeki bir işlev bloğuna götür (seçim değişmez); null: genel bakış */
  /** kamerayı bir bloğa (ön adıyla bütün alt blokları), bir karta (kart verilirse) ya da bütün karta (null) götür */
  focusBlock(blok: string | null, kart?: string): void;
  setWires(m: WireMode): void;
  setPower(on: boolean): void;
  setGorunum(g: Gorunum): void;
  /** bilgisayarın breadboard verisini yükle (görünüm seçiliyse ya da seçilince) */
  bbVerisiniYukle(): Promise<void>;
  setSource(src: string): void;
  setLangMode(m: LangMode): void;
  loadExample(name: string): void;
  /** yalnızca derle (hataları göster) */
  check(): boolean;
  /** derle; başarılıysa EEPROM'a yaz ve RESET (run: çalıştır) */
  compileAndLoad(run?: boolean): boolean;
  sendKeys(codes: number[]): void;
  sendUart(text: string): void;
  setBeam(on: boolean): void;
}

/**
 * Kartın deposunda 3D sahnenin okumadığı alanlar: program düzenleyicisi, yan panellerin sayaçları ve ekran
 * metni. Tuval isteğe bağlı çizilir; bunlar değişince yeni kare istenmez (canlı değerler cizimIste ile
 * gelir). Sahne bunlardan birini okumaya başlarsa buradan çıkar (cizim-dongusu.test.ts denetler).
 */
export const KART_SAHNE_DISI: ReadonlySet<string> = new Set<keyof KartState>([
  "state", "cycles", "rate", "uart", "hz", "error", "screenText", "screenInfo", "beamFrames", "example", "source", "langMode", "errors", "info", "loaded",
]);

let worker: Worker | null = null;
const send = (m: ToWorker, transfer: Transferable[] = []) => worker?.postMessage(m, transfer);
let lastPanel = 0;
const terminal = new TerminalText();

export const currentLang = (s: Pick<KartState, "langMode" | "source">): Lang => (s.langMode === "otomatik" ? detectLanguage(s.source) : s.langMode);

/** Derleme hatalarının özeti: "C: 2 hata" */
const hataOzeti = (lang: Lang, n: number): string =>
  `${lang === "c" ? "C" : "Assembly"}: ${ceviri(`${n} hata`, `${n} error${n === 1 ? "" : "s"}`)}`;

const firstExample = EXAMPLES[0];

export const useKart = create<KartState>((set, get) => ({
  ready: false,
  error: null,
  running: false,
  hz: 0,
  state: null,
  cycles: 0,
  rate: 0,
  uart: "",
  tick: 0,
  chip: null,
  gate: null,
  net: null,
  tel: null,
  hover: null,
  odak: null,
  wires: "secili",
  power: false,
  gorunum: aktifGorunum(),
  gorunumYukleniyor: false,
  screenText: "",
  screenInfo: "",
  beam: false,
  beamFrames: 0,
  has: { screen: false, keyboard: false, uart: false, beam: false },
  example: firstExample?.name ?? "",
  source: firstExample?.source ?? "",
  langMode: "otomatik",
  errors: [],
  info: "",
  loaded: "",
  run() {
    set({ running: true });
    send({ type: "run", hz: get().hz });
  },
  pause() {
    set({ running: false });
    send({ type: "pause" });
  },
  step(mode) {
    set({ running: false });
    send({ type: "step", mode });
  },
  reset() {
    terminal.clear();
    set({ uart: "", running: false });
    send({ type: "reset" });
  },
  setHz(hz) {
    set({ hz });
    send({ type: "speed", hz });
  },
  selectChip(ref) {
    set({ chip: ref, gate: null, odak: null, tel: null });
    // bellek çipinin içi worker'dan gelir (yalnız bilgisayarda)
    if (aktifKart() !== "cpu16") return;
    const ci = ref ? boardModel().board.chips.find((c) => c.ref === ref) : null;
    send({ type: "watch", ref: ci?.def.behavioral ? ci.ref : null });
  },
  selectGate(g) {
    set({ gate: g });
  },
  selectNet(n) {
    set(n === null ? { net: n } : { net: n, tel: null });
  },
  selectTel(t) {
    if (t && get().chip !== null) get().selectChip(null);
    set(t ? { tel: t, net: null, gate: null } : { tel: null });
  },
  focusBlock(blok, kart) {
    set({ odak: { blok, kart, n: (get().odak?.n ?? 0) + 1 }, hover: null });
  },
  setWires(m) {
    set({ wires: m });
  },
  setPower(on) {
    set({ power: on });
  },
  setGorunum(g) {
    const tur = aktifKart();
    if (gorunumHazir(tur, g)) {
      gorunumSec(g);
      return;
    }
    void get().bbVerisiniYukle().then(() => {
      if (aktifKart() === tur && gorunumHazir(tur, g)) gorunumSec(g, tur);
    });
  },
  async bbVerisiniYukle() {
    if (cpuBbHazir()) return;
    set({ gorunumYukleniyor: true });
    try {
      await cpuBbYukle();
    } catch (e) {
      set({ error: `${ceviri("Breadboard verisi yüklenemedi", "Could not load the breadboard data")}: ${String((e as Error).message ?? e)}` });
    } finally {
      set({ gorunumYukleniyor: false });
    }
  },
  setSource(src) {
    set({ source: src });
  },
  setLangMode(m) {
    set({ langMode: m });
  },
  loadExample(name) {
    const ex = EXAMPLES.find((e) => e.name === name);
    if (!ex) return;
    set({ example: name, source: ex.source, langMode: "otomatik", errors: [], info: "" });
  },
  check() {
    const s = get();
    const lang = currentLang(s);
    const r = compileProgram(s.source, lang, LIB, seciliDil());
    set({ errors: r.errors, info: r.flash ? `${r.info} · ${ceviri("derlendi (henüz yüklenmedi)", "compiled (not loaded yet)")}` : hataOzeti(lang, r.errors.length) });
    return !!r.flash;
  },
  compileAndLoad(run = true) {
    const s = get();
    const lang = currentLang(s);
    const r = compileProgram(s.source, lang, LIB, seciliDil());
    if (!r.flash) {
      set({ errors: r.errors, info: hataOzeti(lang, r.errors.length) });
      return false;
    }
    terminal.clear();
    const dilAdi = lang === "c" ? "C" : "assembly";
    const name = s.example && EXAMPLES.find((e) => e.name === s.example)?.source === s.source ? s.example : ceviri(`düzenlenmiş program (${dilAdi})`, `edited program (${dilAdi})`);
    set({ errors: [], info: `${r.info} · ${ceviri("EEPROM bank 0'a yazıldı, RESET", "written to EEPROM bank 0, RESET")}`, uart: "", loaded: name, running: run });
    send({ type: "load", flash: r.flash, run: false }, [r.flash.buffer]);
    if (run) send({ type: "run", hz: get().hz });
    return true;
  },
  sendKeys(codes) {
    if (codes.length) send({ type: "key", codes });
  },
  sendUart(text) {
    const bytes = [...text].map((ch) => (ch === "\n" ? 13 : ch.charCodeAt(0) & 0xff));
    if (bytes.length) send({ type: "uart", bytes });
  },
  setBeam(on) {
    set({ beam: on });
    send({ type: "beam", on });
    if (!on) {
      liveScreen.beam = null;
      liveScreen.version++;
      cizimIste();
    }
  },
}));

/** Worker'ı başlatır (kart görünümü ilk açıldığında bir kez) */
export function startBoardWorker() {
  if (worker) return;
  try {
    const s = useKart.getState();
    const first = compileProgram(s.source, currentLang(s), LIB, seciliDil());
    if (!first.flash) throw new Error(`${s.example}: ${first.errors[0]?.message ?? ceviri("derlenemedi", "compile failed")}`);
    worker = new Worker(new URL("./board.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<FromWorker>) => onWorker(e.data);
    worker.onerror = (e) => useKart.setState({ error: e.message || ceviri("Simülasyon başlatılamadı", "The simulation could not start") });
    useKart.setState({ loaded: s.example, info: `${first.info} · ${ceviri("EEPROM bank 0'da", "in EEPROM bank 0")}` });
    send({ type: "init", flash: first.flash }, [first.flash.buffer]);
  } catch (err) {
    useKart.setState({ error: String((err as Error).message ?? err) });
  }
}

function onWorker(m: FromWorker) {
  if (m.type === "error") useKart.setState({ error: m.message, running: false });
  else if (m.type === "ready") {
    const expect = kartModeli("cpu16").board.c.netCount;
    if (m.netCount !== expect) {
      useKart.setState({ error: ceviri(`Worker'daki kart (${m.netCount} net) görünümdekinden (${expect} net) farklı`, `The board in the worker (${m.netCount} nets) differs from the one in the view (${expect} nets)`) });
    } else useKart.setState({ ready: true, has: { screen: m.screen, keyboard: m.keyboard, uart: m.uart, beam: m.beam } });
  } else if (m.type === "screen") {
    liveScreen.frame = m.frame;
    liveScreen.version++;
    cizimIste();
    useKart.setState({ screenText: m.frame.text, screenInfo: ekranBilgisi(m.frame, seciliDil()) });
  } else if (m.type === "beam") {
    liveScreen.beam = { rgba: m.rgba, width: m.width, height: m.height, x: m.x, y: m.y };
    liveScreen.version++;
    cizimIste();
    useKart.setState({ beamFrames: m.frames });
  } else {
    netDegerleri("cpu16", m.values);
    if (m.mem) {
      liveMem.window = m.mem;
      liveMem.version++;
    }
    for (const b of m.out) terminal.push(b);
    const now = performance.now();
    const s = useKart.getState();
    const patch: Partial<KartState> = {};
    if (m.out.length) patch.uart = terminal.text;
    if (s.running !== m.running) patch.running = m.running;
    // paneller saniyede ~10 kez yenilenir; duraklatınca hemen
    if (!m.running || now - lastPanel > 100) {
      Object.assign(patch, { state: m.state, cycles: m.cycles, rate: m.rate, tick: s.tick + 1 });
      lastPanel = now;
    }
    if (Object.keys(patch).length) useKart.setState(patch);
  }
}

// ekran bilgisi seçili dilde: dil değişince son kareninki yeniden yazılır
useAyar.subscribe((a, once) => {
  if (a.dil !== once.dil && liveScreen.frame) useKart.setState({ screenInfo: ekranBilgisi(liveScreen.frame, a.dil) });
});

// ---------------------------------------------------------------- kart değişince

// sahnedeki kartın görünümü değişince: parçalar aynı (seçimler kalır), yerleşim ve sahne yenilenir
gorunumDegisince((g) => {
  liveNets.version++;
  // breadboard'da yalnız fiziksel parçalar da var (besleme girişleri, tamponlar): öbür görünümde yoksa seçim kalkar
  useKart.setState((s) => ({ gorunum: g, chip: s.chip && findPart(s.chip) ? s.chip : null, tel: null, hover: null, odak: null, tick: s.tick + 1 }));
});

kartDegisince((tur) => {
  // referanslar karta özgü: seçimler kalkar; canlı değerler yeni kartın son değerleri olur
  liveNets.prev = null;
  liveNets.values = sonDegerler.get(tur) ?? null;
  liveNets.version++;
  useKart.setState((s) => ({ chip: null, gate: null, net: null, tel: null, hover: null, odak: null, gorunum: aktifGorunum(tur), tick: s.tick + 1 }));
});
