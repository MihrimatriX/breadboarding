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
import { aktifKart, kartDegisince, kartModeli, kartParcasi, kartUclari, kartYerlesimi, type KartTuru, type Parca } from "./aktif";
import { compileProgram, detectLanguage, type Lang, type ProgramError } from "./program";
import type { FromWorker, MemWindow, ToWorker } from "./protocol";
import type { ScreenFrame } from "./screen";
import type { Endpoint } from "./wires";

// ---------------------------------------------------------------- örnek programlar

const kit = import.meta.glob("../../cpu16/kit/programlar/*.s", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const progs = import.meta.glob("../../cpu16/programs/hello.s", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const own = import.meta.glob("./ornekler/*.{s,c}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const fileName = (p: string) => p.split("/").pop()!;

export interface Example {
  name: string;
  label: string;
  source: string;
}

const EXAMPLE_LABELS: Record<string, string> = {
  "video-deneme.s": "video-deneme.s · VGA: Merhaba, 16 renk, kare sayacı",
  "merhaba-vga.c": "merhaba-vga.c · C: printf (UART) ve VGA",
  "gc-deneme.s": "gc-deneme.s · UART, zamanlayıcı, klavye kesmeleri",
  "bellek-deneme.s": "bellek-deneme.s · 128 KB RAM sınaması",
  "onbellek-deneme.s": "onbellek-deneme.s · önbellek açık / kapalı",
  "kyb-deneme.s": "kyb-deneme.s · kendin yap bellek kartı (16 × 74HC574)",
  "hello.s": "hello.s · UART'a merhaba",
};
const ORDER = ["video-deneme.s", "merhaba-vga.c", "gc-deneme.s", "hello.s", "bellek-deneme.s", "onbellek-deneme.s", "kyb-deneme.s"];

export const EXAMPLES: Example[] = Object.entries({ ...kit, ...progs, ...own })
  .map(([p, source]) => ({ name: fileName(p), label: EXAMPLE_LABELS[fileName(p)] ?? fileName(p), source }))
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

/** Her karede değişen net değerleri React durumuna konmaz; çizim döngüsü buradan okur */
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
}
/** Ekran (metin kipinden ya da ışın kipinden) ve izlenen bellek penceresi */
export const liveScreen = { frame: null as ScreenFrame | null, beam: null as { rgba: Uint8ClampedArray; width: number; height: number; x: number; y: number } | null, version: 0 };
export const liveMem = { window: null as MemWindow | null, version: 0 };

export const SPEEDS = [
  { hz: 1, label: "1 Hz" },
  { hz: 4, label: "4 Hz" },
  { hz: 20, label: "20 Hz" },
  { hz: 200, label: "200 Hz" },
  { hz: 1000, label: "1 kHz" },
  { hz: 0, label: "en hızlı" },
];

export type WireMode = "yok" | "secili" | "hepsi";
export type BottomTab = "program" | "ic";
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
  /** üstüne gelinen parça; ek: ipucuna eklenen satır (ör. DIP anahtarın hangi anahtarı) */
  hover: { ref: string; x: number; y: number; ek?: string } | null;
  /**
   * kamera bu bloğa (ya da "Gösterge" gibi bir ön adla başlayan bloklara) gitsin; blok null: genel
   * bakış. n her istekte artar: aynı yere yeniden gidilebilsin.
   */
  odak: { blok: string | null; n: number } | null;
  wires: WireMode;
  /** GND / VCC tellerini de çiz */
  power: boolean;
  bottom: BottomTab;
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
  /** kamerayı yerleşimdeki bir işlev bloğuna götür (seçim değişmez); null: genel bakış */
  focusBlock(blok: string | null): void;
  setWires(m: WireMode): void;
  setPower(on: boolean): void;
  setBottom(t: BottomTab): void;
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

let worker: Worker | null = null;
const send = (m: ToWorker, transfer: Transferable[] = []) => worker?.postMessage(m, transfer);
let lastPanel = 0;
const terminal = new TerminalText();

export const currentLang = (s: Pick<KartState, "langMode" | "source">): Lang => (s.langMode === "otomatik" ? detectLanguage(s.source) : s.langMode);

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
  hover: null,
  odak: null,
  wires: "secili",
  power: false,
  bottom: "program",
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
    set({ chip: ref, gate: null, odak: null, ...(ref && findPart(ref)?.chip ? { bottom: "ic" as const } : {}) });
    // bellek çipinin içi worker'dan gelir (yalnız bilgisayarda)
    if (aktifKart() !== "cpu16") return;
    const ci = ref ? boardModel().board.chips.find((c) => c.ref === ref) : null;
    send({ type: "watch", ref: ci?.def.behavioral ? ci.ref : null });
  },
  selectGate(g) {
    set({ gate: g });
  },
  selectNet(n) {
    set({ net: n });
  },
  focusBlock(blok) {
    set({ odak: { blok, n: (get().odak?.n ?? 0) + 1 }, hover: null });
  },
  setWires(m) {
    set({ wires: m });
  },
  setPower(on) {
    set({ power: on });
  },
  setBottom(t) {
    set({ bottom: t });
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
    set({ example: name, source: ex.source, langMode: "otomatik", errors: [], info: "", bottom: "program" });
  },
  check() {
    const s = get();
    const lang = currentLang(s);
    const r = compileProgram(s.source, lang, LIB);
    set({ errors: r.errors, info: r.flash ? `${r.info} · derlendi (henüz yüklenmedi)` : `${lang === "c" ? "C" : "Assembly"}: ${r.errors.length} hata` });
    return !!r.flash;
  },
  compileAndLoad(run = true) {
    const s = get();
    const lang = currentLang(s);
    const r = compileProgram(s.source, lang, LIB);
    if (!r.flash) {
      set({ errors: r.errors, info: `${lang === "c" ? "C" : "Assembly"}: ${r.errors.length} hata` });
      return false;
    }
    terminal.clear();
    const name = s.example && EXAMPLES.find((e) => e.name === s.example)?.source === s.source ? s.example : `düzenlenmiş program (${lang === "c" ? "C" : "assembly"})`;
    set({ errors: [], info: `${r.info} · EEPROM bank 0'a yazıldı, RESET`, uart: "", loaded: name, running: run });
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
    }
  },
}));

/** Worker'ı başlatır (kart görünümü ilk açıldığında bir kez) */
export function startBoardWorker() {
  if (worker) return;
  try {
    const s = useKart.getState();
    const first = compileProgram(s.source, currentLang(s), LIB);
    if (!first.flash) throw new Error(`${s.example}: ${first.errors[0]?.message ?? "derlenemedi"}`);
    worker = new Worker(new URL("./board.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<FromWorker>) => onWorker(e.data);
    worker.onerror = (e) => useKart.setState({ error: e.message || "Simülasyon başlatılamadı" });
    useKart.setState({ loaded: s.example, info: `${first.info} · EEPROM bank 0'da` });
    send({ type: "init", flash: first.flash }, [first.flash.buffer]);
  } catch (err) {
    useKart.setState({ error: String((err as Error).message ?? err) });
  }
}

function onWorker(m: FromWorker) {
  if (m.type === "error") useKart.setState({ error: m.message, running: false });
  else if (m.type === "ready") {
    const expect = kartModeli("cpu16").board.c.netCount;
    if (m.netCount !== expect) useKart.setState({ error: `Worker'daki kart (${m.netCount} net) görünümdekinden (${expect} net) farklı` });
    else useKart.setState({ ready: true, has: { screen: m.screen, keyboard: m.keyboard, uart: m.uart, beam: m.beam } });
  } else if (m.type === "screen") {
    liveScreen.frame = m.frame;
    liveScreen.version++;
    useKart.setState({ screenText: m.frame.text, screenInfo: m.frame.info });
  } else if (m.type === "beam") {
    liveScreen.beam = { rgba: m.rgba, width: m.width, height: m.height, x: m.x, y: m.y };
    liveScreen.version++;
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

// ---------------------------------------------------------------- kart değişince

/** Her kart türünde alt panelin son sekmesi (hesap makinesinde program yok) */
const sonAltSekme = new Map<KartTuru, BottomTab>([["cpu16", "program"], ["hesap", "ic"]]);

kartDegisince((tur, onceki) => {
  // referanslar karta özgü: seçimler kalkar; canlı değerler yeni kartın son değerleri olur
  sonAltSekme.set(onceki, useKart.getState().bottom);
  liveNets.prev = null;
  liveNets.values = sonDegerler.get(tur) ?? null;
  liveNets.version++;
  useKart.setState((s) => ({ chip: null, gate: null, net: null, hover: null, odak: null, bottom: sonAltSekme.get(tur) ?? "ic", tick: s.tick + 1 }));
});
