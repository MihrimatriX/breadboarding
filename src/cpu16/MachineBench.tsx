// CPU16 tezgâhı, anakart kipi (Faz 6–7): BIOS'lu tam makine (cpu16/emu/machine.ts).
// VGA ekranı (VRAM + karakter ROM'u), PS/2 klavye, UART terminali. Program as16 ile derlenir ve
// gerçek kartta olduğu gibi BIOS önyükleyicisine (L / F komutu) UART'tan Intel HEX olarak gönderilir.
// Aynı yükleyici Web Serial ile gerçek karta da gönderebilir.

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import biosSource from "../../cpu16/bios/bios.s?raw";
import { assemble } from "../../cpu16/asm/assembler";
import { buildProgram } from "../../cpu16/cc/index";
import { LIB } from "../../cpu16/cc/lib-vite";
import { buildBios, type BiosBuild } from "../../cpu16/bios/build";
import { MachineLink } from "../../cpu16/bios/simlink";
import { programHex, uploadHex, type SerialLink } from "../../cpu16/bios/uploader";
import { beklenenCiktilar, kartTesti, kartTestProgramlari, sonucMetni } from "../../cpu16/bios/kart-testi";
import { disassemble } from "../../cpu16/emu/disasm";
import { CPU_HZ, Machine } from "../../cpu16/emu/machine";
import { SET2 } from "../../cpu16/emu/devices/keyboard";
import { textToChar } from "../../cpu16/video/font";
import { sec, useDil, useT, type IkiDil } from "../ui/ceviri";
import {
  AppHeader, Bayrak, Group, Menu, Meter, OdakDugmesi, PanelToggle, Section, Splitter, Tabs, YanBolucu, duzenStili, heightShare, useLayout, usePaneller, type Shortcut, type TabDef,
} from "../ui/Shell";
import { Simge } from "../ui/simgeler";
import { dilBul, ornekDili, type Dil } from "./dil";
import { KodAlani } from "./KodAlani";
import { VgaRenderer } from "./vga";
import { TerminalText, WebSerialLink, webSerial } from "./serial";

const sources = import.meta.glob("../../cpu16/bios/ornekler/*.{s,c}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
/** Örnekler: assembly dosyaları uzantısız ("merhaba"), C dosyaları uzantılı ("yilan.c") anahtarla */
const EXAMPLES = Object.fromEntries(Object.entries(sources).map(([p, s]) => [p.split("/").pop()!.replace(/\.s$/, ""), s]));
const ORDER = [
  "merhaba", "saat", "renkler", "onbellek",
  "yeni.c", "selam.c", "sayilar.c", "uzun.c", "kalbur.c", "siralama.c", "liste.c", "hesap.c", "sabit.c",
  "ekran.c", "kesme.c", "hayat.c", "yilan.c",
].filter((n) => n in EXAMPLES);
const LABELS: Record<string, IkiDil> = {
  merhaba: { tr: "merhaba.s · renkli selam ve toplam", en: "merhaba.s · colored greeting and a sum" },
  saat: { tr: "saat.s · kutu çizimi ve saat", en: "saat.s · box drawing and a clock" },
  renkler: { tr: "renkler.s · 16×16 renk tablosu", en: "renkler.s · 16×16 color table" },
  onbellek: { tr: "onbellek.s · önbellek açık / kapalı", en: "onbellek.s · cache on / off" },
  "yeni.c": { tr: "yeni.c · C: boş şablon, buradan başla", en: "yeni.c · C: empty template, start here" },
  "selam.c": { tr: "selam.c · C: printf, renkler, özyineleme", en: "selam.c · C: printf, colors, recursion" },
  "sayilar.c": { tr: "sayilar.c · C: onluk, hex, ikilik; 16 bit taşma", en: "sayilar.c · C: decimal, hex, binary; 16-bit overflow" },
  "uzun.c": { tr: "uzun.c · C: 32 bit long, çarpma / bölme ne kadar sürer", en: "uzun.c · C: 32-bit long, how long multiply / divide take" },
  "kalbur.c": { tr: "kalbur.c · C: bit dizisiyle 65535'e kadar asallar", en: "kalbur.c · C: primes up to 65535 with a bit array" },
  "siralama.c": { tr: "siralama.c · C: 5 sıralama algoritması yarışıyor", en: "siralama.c · C: 5 sorting algorithms race" },
  "liste.c": { tr: "liste.c · C: struct, işaretçi, malloc ile bağlı liste", en: "liste.c · C: linked list with struct, pointers, malloc" },
  "hesap.c": { tr: "hesap.c · C: klavyeden hesap makinesi", en: "hesap.c · C: calculator on the keyboard" },
  "sabit.c": { tr: "sabit.c · C: sabit noktalı sayılar, sinüs eğrisi", en: "sabit.c · C: fixed-point numbers, a sine curve" },
  "ekran.c": { tr: "ekran.c · C: VGA'ya doğrudan: pencere, Türkçe, animasyon", en: "ekran.c · C: straight to VGA: windows, Turkish text, animation" },
  "kesme.c": { tr: "kesme.c · C: vsync kesmesine C fonksiyonu bağlamak", en: "kesme.c · C: hooking a C function to the vsync interrupt" },
  "hayat.c": { tr: "hayat.c · C: Hayat Oyunu (R, Q)", en: "hayat.c · C: Game of Life (R, Q)" },
  "yilan.c": { tr: "yilan.c · C: yılan oyunu (W A S D)", en: "yilan.c · C: snake game (W A S D)" },
};
/** Kullanıcının örnek üzerinde yaptığı değişiklikler tarayıcıda saklanır (sayfa yenilense de kaybolmaz) */
const KAYNAK_ANAHTARI = (name: string) => `cpu16.kaynak.${name}`;
function kayitliKaynak(name: string): string {
  try {
    return localStorage.getItem(KAYNAK_ANAHTARI(name)) ?? EXAMPLES[name] ?? "";
  } catch {
    return EXAMPLES[name] ?? "";
  }
}
function kaynakKaydet(name: string, src: string): void {
  try {
    if (src === EXAMPLES[name]) localStorage.removeItem(KAYNAK_ANAHTARI(name));
    else localStorage.setItem(KAYNAK_ANAHTARI(name), src);
  } catch {
    /* depolama kapalı: değişiklik yalnız bu oturumda kalır */
  }
}
/** Kart testi programları (cpu16/bios/testler): gerçek kart bunları simülatörle aynı çıktıyla geçmeli */
const TESTLER = Object.fromEntries(
  Object.entries(import.meta.glob("../../cpu16/bios/testler/*.{s,c}", { query: "?raw", import: "default", eager: true }) as Record<string, string>).map(([p, s]) => [
    p.split("/").pop()!,
    s,
  ]),
);

/** Hız seçenekleri: 4 MHz'in katı; 0 = turbo (karede sığdığı kadar). */
const SPEEDS: { v: number; label: IkiDil }[] = [
  { v: 0.1, label: { tr: "1/10 hız (400 kHz)", en: "1/10 speed (400 kHz)" } },
  { v: 1, label: { tr: "gerçek hız (4 MHz)", en: "real speed (4 MHz)" } },
  { v: 4, label: { tr: "×4 (16 MHz)", en: "×4 (16 MHz)" } },
  { v: 0, label: { tr: "turbo", en: "turbo" } },
];
/** Bir karede emülasyona ayrılan en uzun süre (ms). */
const FRAME_BUDGET_MS = 11;
/** Tarayıcı işlevleri için bırakılan tuşlar (yenile, tam ekran, geliştirici araçları). */
const BROWSER_KEYS = new Set(["Tab", "F5", "F11", "F12"]);
const REG_NAMES = ["r0", "r1", "r2", "r3", "r4", "r5", "r6 sp", "r7 lr"];
const IRQ_NAMES: IkiDil[] = [
  { tr: "zamanlayıcı", en: "timer" },
  { tr: "klavye", en: "keyboard" },
  { tr: "UART", en: "UART" },
  { tr: "vsync", en: "vsync" },
];

type SideTab = "durum" | "anakart";
const SIDE_TABS: { id: SideTab; label: IkiDil; title: IkiDil }[] = [
  { id: "durum", label: { tr: "Durum", en: "Status" }, title: { tr: "Register'lar, UART terminali, komut izi", en: "Registers, UART terminal, instruction trace" } },
  {
    id: "anakart",
    label: { tr: "Anakart ve bellek", en: "Motherboard and memory" },
    title: { tr: "Bank, önbellek, kesmeler, bellek dökümü", en: "Banks, cache, interrupts, memory dump" },
  },
];
const DERLEME_HATASI: IkiDil = { tr: "Derleme başarısız; hataları düzeltip tekrar dene.", en: "Compile failed. Fix the errors and try again." };

const hex4 = (n: number) => (n & 0xffff).toString(16).toUpperCase().padStart(4, "0");
const hex2 = (n: number) => (n & 0xff).toString(16).toUpperCase().padStart(2, "0");

let biosBuild: BiosBuild | null = null;
/** BIOS ilk kullanımda derlenir (bios.s, Vite ?raw ile gömülü). */
function bios(): BiosBuild {
  biosBuild ??= buildBios(biosSource);
  return biosBuild;
}

type Status = { kind: "idle" | "run" | "halt" | "bad"; text: string };
/** Derleyici hatası: sütun yalnız cc16'dan gelir; ileti cpu16/asm ve cpu16/cc'den Türkçe */
type Hata = { line: number; col?: number; message: string };
const yasadisi = (a: number): IkiDil => ({ tr: `yasadışı komut @ ${hex4(a)}`, en: `illegal instruction @ ${hex4(a)}` });

export function MachineBench({ switcher }: { switcher: ReactNode }) {
  const t = useT();
  const dil = useDil();
  const yer = dil === "en" ? "en-US" : "tr-TR";
  const [m] = useState(() => {
    const mach = new Machine();
    mach.loadFlash(bios().flash);
    mach.reset();
    return mach;
  });
  const [term] = useState(() => new TerminalText());
  const [boardTerm] = useState(() => new TerminalText());
  const [prog, setProg] = useState(ORDER[0]);
  const [src, setSrc] = useState(() => kayitliKaynak(ORDER[0]));
  /** Editördeki dil: örnekten gelir, yazdıkça içerikten tahmin edilir; elle seçilirse o kalır */
  const [lang, setLang] = useState<Dil>(() => dilBul(kayitliKaynak(ORDER[0])) ?? ornekDili(ORDER[0]));
  const langManual = useRef(false);
  const [errors, setErrors] = useState<Hata[]>([]);
  // bilgi, meşgul ve hata metinleri iki dilli saklanır: dil sonradan değişince de doğru dilde görünsün
  const [info, setInfo] = useState<IkiDil>({
    tr: "BIOS açıldı. Ekrana tıklayıp monitöre komut yazabilir ya da bir program yükleyebilirsin.",
    en: "The BIOS has started. Click the screen to type monitor commands, or load a program.",
  });
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState<IkiDil | null>(null);
  const [testOut, setTestOut] = useState("");
  /** Gerçek kartın UART hızı: UART bit süresi CPU saatinden (TCLK) bölünür, 1 MHz'de 28 800 baud */
  const [baud, setBaud] = useState(115200);
  const [focused, setFocused] = useState(false);
  const [flashRun, setFlashRun] = useState<string | null>(null);
  const [bad, setBad] = useState<IkiDil | null>(null);
  const [memAddr, setMemAddr] = useState("4000");
  const [termLine, setTermLine] = useState("");
  const [mhz, setMhz] = useState(0);
  const [, setTick] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const termRef = useRef<HTMLPreElement | null>(null);
  const runningRef = useRef(true);
  const speedRef = useRef(1);
  const linkRef = useRef<MachineLink | null>(null);
  /** UART çıkışının son iki karakteri (monitör istemini "> " yakalamak için). */
  const tail = useRef("");
  const held = useRef(new Set<string>());
  const prevRegs = useRef<number[]>(Array.from(m.cpu.regs));
  // düzenleyici ilk açılışta pencerenin yaklaşık üçte biri; VGA ekranı kalan yere 4:3 sığar
  const [lay, setLay] = useLayout("cpu16", { side: true, bottom: true, bottomH: heightShare(0.32, 240, 360), sideTab: "durum" });
  const sideTab = (SIDE_TABS.some((t) => t.id === lay.sideTab) ? lay.sideTab : "durum") as SideTab;
  // odak modunda düzenleyici ve yan panel gizli: VGA ekranı bütün alanı alır
  const panel = usePaneller(lay);

  const redraw = () => setTick((t) => t + 1);
  const setRun = (on: boolean) => {
    runningRef.current = on;
    setRunning(on);
  };

  // UART çıkışı: terminal, yükleyici bağlantısı ve istem yakalayıcı
  useEffect(() => {
    m.uartOnOutput = (b) => {
      term.push(b);
      tail.current = (tail.current + String.fromCharCode(b)).slice(-2);
      linkRef.current?.push(b);
    };
    return () => {
      m.uartOnOutput = undefined;
    };
  }, [m, term]);

  // Ana döngü: her karede geçen gerçek süre kadar döngü çalıştır, ekranı çiz.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const vga = new VgaRenderer(canvas);
    vga.draw(m.video, true);
    let raf = 0;
    let last = performance.now();
    let frame = 0;
    let meterAt = last;
    let meterCycles = m.cycles;
    const loop = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      if (runningRef.current) {
        const target = speedRef.current > 0 ? (dt / 1000) * CPU_HZ * speedRef.current : Infinity;
        const end = m.cycles + target;
        const t0 = performance.now();
        while (m.cycles < end && performance.now() - t0 < FRAME_BUDGET_MS) {
          if (m.run(Math.min(20_000, end - m.cycles)) === "illegal") {
            setRun(false);
            setBad(yasadisi(m.cpu.illegalAt ?? m.cpu.pc));
            break;
          }
        }
        if (++frame % 4 === 0) redraw();
      }
      vga.draw(m.video);
      if (now - meterAt >= 1000) {
        setMhz(((m.cycles - meterCycles) / ((now - meterAt) / 1000)) / 1e6);
        meterAt = now;
        meterCycles = m.cycles;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [m]);

  // Terminal hep en alttan gösterilir. Yalnız metin değişince: her çizimde scrollHeight okumak
  // (çalışırken saniyede ~15 kez) tarayıcıya boşuna yerleşim hesaplatıyordu.
  useEffect(() => {
    const el = termRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [term.text, panel.side, sideTab]);

  const start = () => {
    if (m.cpu.illegalAt !== null) return;
    prevRegs.current = Array.from(m.cpu.regs);
    setRun(true);
  };
  const pause = () => {
    setRun(false);
    redraw();
  };
  const step = () => {
    prevRegs.current = Array.from(m.cpu.regs);
    if (m.step() === "illegal") setBad(yasadisi(m.cpu.illegalAt ?? m.cpu.pc));
    redraw();
  };
  const resetMachine = () => {
    m.reset();
    tail.current = "";
    setBad(null);
    prevRegs.current = Array.from(m.cpu.regs);
    redraw();
  };
  const pickSpeed = (v: number) => {
    speedRef.current = v;
    setSpeed(v);
  };

  /** Derler; hata varsa null. */
  const compile = () => {
    if (lang === "c") {
      // cc16, BIOS hedefi: RAM'e 0x4000'dan yüklenir, giriş __reset (0x4000)
      const file = `/${prog.endsWith(".c") ? prog : `${prog}.c`}`;
      const b = buildProgram({ [file]: src }, [file], { lib: LIB, target: "bios" });
      setErrors(b.errors.map((e) => ({ line: e.line, col: e.col || undefined, message: e.message })));
      if (b.errors.length) {
        setInfo(DERLEME_HATASI);
        return null;
      }
      return { image: b.image, ranges: b.ranges, symbols: new Map([["main", 0x4000]]) } as unknown as ReturnType<typeof assemble>;
    }
    const res = assemble(src);
    setErrors(res.errors);
    if (res.errors.length) {
      setInfo(DERLEME_HATASI);
      return null;
    }
    if (!res.ranges.length) {
      setInfo({ tr: "Program boş.", en: "The program is empty." });
      return null;
    }
    return res;
  };

  /** Gerçek kartla aynı akış: reset → BIOS açılır → monitörde L/F → HEX kayıtları → (G). */
  const upload = async (mode: "ram" | "flash") => {
    if (busy) return;
    const res = compile();
    if (!res) return;
    const { hex, entry, size } = programHex(res);
    resetMachine();
    term.push(10);
    m.runUntil(() => tail.current === "> ", 4_000_000);
    const link = new MachineLink(m, false);
    linkRef.current = link;
    setFlashRun(null);
    const what: IkiDil = mode === "ram" ? { tr: "RAM'e yükleniyor", en: "Loading into RAM" } : { tr: "EEPROM'a yazılıyor", en: "Writing to EEPROM" };
    setBusy(what);
    start();
    const r = await uploadHex(link, hex, {
      mode,
      run: mode === "ram",
      dil,
      onProgress: (d, n) => setBusy({ tr: `${what.tr} ${d}/${n}`, en: `${what.en} ${d}/${n}` }),
    });
    linkRef.current = null;
    setBusy(null);
    if (!r.ok) {
      setInfo({ tr: `Yükleme başarısız: ${r.message}`, en: `Load failed: ${r.message}` });
      return;
    }
    const e = hex4(entry);
    if (mode === "ram") {
      setInfo({
        tr: `${size} bayt (0x${hex4(size)}), ${r.records} HEX kaydı UART'tan yüklendi; G ${e} ile çalıştırıldı. BIOS: "${r.message}".`,
        en: `Loaded ${size} bytes (0x${hex4(size)}) as ${r.records} HEX records over UART and started with G ${e}. BIOS: "${r.message}".`,
      });
      return;
    }
    const w = entry >> 14;
    if (w === 1) {
      const cmd = `B ${w} ${w}\rG ${e}\r`;
      setFlashRun(cmd);
      setInfo({
        tr: `EEPROM'a yazıldı (${size} bayt, EEPROM ofseti = CPU adresi). Çalıştırmak için monitörde: B ${w} ${w} (pencere ${w} → EEPROM bank ${w}), sonra G ${e}.`,
        en: `Written to EEPROM (${size} bytes, EEPROM offset = CPU address). To run it, type in the monitor: B ${w} ${w} (window ${w} → EEPROM bank ${w}), then G ${e}.`,
      });
    } else {
      setInfo({
        tr: `EEPROM 32 KB'tır (bank 0 BIOS'un, bank 1 programların): EEPROM'dan çalıştırılacak program 0x4000–0x7FFF'e yerleştirilmeli.`,
        en: `The EEPROM is 32 KB (bank 0 holds the BIOS, bank 1 holds programs): a program that runs from EEPROM must sit at 0x4000–0x7FFF.`,
      });
    }
  };

  const runFromFlash = () => {
    if (!flashRun) return;
    m.uartSend(flashRun);
    start();
  };

  const serialOk = webSerial() !== null;
  const sendToBoard = async () => {
    if (busy) return;
    const res = compile();
    if (!res) return;
    const { hex } = programHex(res);
    let link: WebSerialLink | null = null;
    try {
      link = await WebSerialLink.open(baud);
      link.onByte = (b) => {
        boardTerm.push(b);
        redraw();
      };
      setBusy({ tr: "Karta gönderiliyor", en: "Sending to the board" });
      const r = await uploadHex(link, hex, {
        mode: "ram",
        run: true,
        timeoutMs: 3000,
        dil,
        onProgress: (d, n) => setBusy({ tr: `Karta gönderiliyor ${d}/${n}`, en: `Sending to the board ${d}/${n}` }),
      });
      setInfo(
        r.ok
          ? { tr: `Kart: ${r.message}; G ile çalıştırıldı.`, en: `Board: ${r.message}; started with G.` }
          : { tr: `Kart: yükleme başarısız: ${r.message}`, en: `Board: load failed: ${r.message}` },
      );
    } catch (e) {
      const msg = `Web Serial: ${(e as Error).message}`;
      setInfo({ tr: msg, en: msg });
    } finally {
      await link?.close();
      setBusy(null);
    }
  };

  /** Kart testi: test programlarını önce bağımsız bir simülatörde çalıştırıp beklenen çıktıyı alır, sonra
   * aynı programları karta (Web Serial) ya da bu tezgâhtaki makineye yükleyip çıktıları karşılaştırır. */
  const boardTest = async (where: "kart" | "sim") => {
    if (busy) return;
    setTestOut("");
    setBusy({ tr: "Kart testi: beklenen çıktılar simülatörde hesaplanıyor", en: "Board test: computing the expected output in the simulator" });
    await new Promise((r) => setTimeout(r, 30));
    let close = async () => {};
    try {
      const programs = kartTestProgramlari(TESTLER, LIB);
      const expected = await beklenenCiktilar(programs, bios().flash, dil);
      let link: SerialLink;
      if (where === "kart") {
        const l = await WebSerialLink.open(baud);
        l.onByte = (b) => {
          boardTerm.push(b);
          redraw();
        };
        link = l;
        close = () => l.close();
      } else {
        resetMachine();
        term.push(10);
        m.runUntil(() => tail.current === "> ", 4_000_000);
        const l = new MachineLink(m, false);
        linkRef.current = l;
        link = l;
        start();
      }
      const res = await kartTesti(link, programs, expected, (s) => setBusy({ tr: `Kart testi: ${s}`, en: `Board test: ${s}` }), dil);
      setTestOut(sonucMetni(programs, res, dil));
    } catch (e) {
      setTestOut(t(`Kart testi yapılamadı: ${(e as Error).message}`, `Board test could not run: ${(e as Error).message}`));
    } finally {
      linkRef.current = null;
      await close();
      setBusy(null);
    }
  };

  const pick = (name: string) => {
    const text = kayitliKaynak(name);
    setProg(name);
    setSrc(text);
    langManual.current = false;
    setLang(dilBul(text) ?? ornekDili(name));
    setErrors([]);
  };
  const edit = (text: string) => {
    setSrc(text);
    kaynakKaydet(prog, text);
    if (!langManual.current) setLang((l) => dilBul(text) ?? l);
  };
  const chooseLang = (l: Dil) => {
    langManual.current = true;
    setLang(l);
    setErrors([]);
  };
  const restoreExample = () => {
    kaynakKaydet(prog, EXAMPLES[prog]);
    pick(prog);
  };

  // ---- klavye: VGA ekranı odaktayken tuşlar PS/2 set 2 kodlarına çevrilir
  const onScreenKeyDown = (e: ReactKeyboardEvent) => {
    if (e.metaKey || BROWSER_KEYS.has(e.code) || !SET2[e.code]) return;
    e.preventDefault();
    m.keyDown(e.code);
    held.current.add(e.code);
  };
  const onScreenKeyUp = (e: ReactKeyboardEvent) => {
    if (!held.current.has(e.code)) return;
    e.preventDefault();
    held.current.delete(e.code);
    m.keyUp(e.code);
  };
  const releaseKeys = () => {
    for (const code of held.current) m.keyUp(code);
    held.current.clear();
    setFocused(false);
  };

  // ---- UART terminali: tuşlar bayt olarak USB-UART köprüsünden gider
  const onTermKeyDown = (e: ReactKeyboardEvent) => {
    if (e.metaKey || e.altKey) return;
    let s: string | null = null;
    if (e.key === "Enter") s = "\r";
    else if (e.key === "Backspace") s = "\b";
    else if (e.key === "Escape") s = "\x1b";
    else if (e.ctrlKey && /^[a-z]$/i.test(e.key)) s = String.fromCharCode(e.key.toUpperCase().charCodeAt(0) - 64);
    else if (e.key.length === 1 && !e.ctrlKey) {
      const c = e.key.charCodeAt(0);
      const code = c < 0x80 ? c : textToChar(e.key);
      if (code !== undefined) s = String.fromCharCode(code);
    }
    if (s === null) return;
    e.preventDefault();
    m.uartSend(s);
  };
  const sendLine = () => {
    m.uartSend(Array.from(termLine, (ch) => (ch.charCodeAt(0) < 0x80 ? ch.charCodeAt(0) : (textToChar(ch) ?? 0x3f))));
    m.uartSend("\r");
    setTermLine("");
  };

  // ---- görünüm
  const cpu = m.cpu;
  const status: Status = bad
    ? { kind: "bad", text: sec(bad, dil) }
    : busy
      ? { kind: "run", text: sec(busy, dil) }
      : !running
        ? { kind: "idle", text: t("duraklatıldı", "paused") }
        : cpu.halted
          ? { kind: "halt", text: t("HALT · kesme bekliyor", "HALT · waiting for interrupt") }
          : { kind: "run", text: t("çalışıyor", "running") };

  const trace = (() => {
    const start = Math.max(0, cpu.pc - 8) & 0xfffe;
    return Array.from({ length: 9 }, (_, k) => {
      const a = (start + k * 2) & 0xffff;
      const w = m.peek16(a);
      return { a, w, text: disassemble(w, a), cur: a === cpu.pc };
    });
  })();

  const memRows = (() => {
    const base = (parseInt(memAddr, 16) || 0) & 0xfff0;
    return Array.from({ length: 16 }, (_, r) => {
      const a = (base + r * 8) & 0xffff;
      return { a, bytes: Array.from({ length: 8 }, (_, k) => m.peek((a + k) & 0xffff)) };
    });
  })();

  const pend = m.irqPending;
  const hits = m.cache.totalHits;
  const misses = m.cache.totalMisses;
  const rate = hits + misses ? ((hits / (hits + misses)) * 100).toFixed(1) : "-";
  const seconds = m.cycles / CPU_HZ;
  const shortcuts: Shortcut[] = [
    { keys: "Ctrl+Enter", what: t("Düzenleyicide: derleyip RAM'e yükler ve çalıştırır", "In the editor: compile, load into RAM and run") },
    { keys: t("Ekrana tıkla", "Click the screen"), what: t("Klavye PS/2 olarak karta gider (ABD düzeni)", "The keyboard goes to the board as PS/2 (US layout)") },
    { keys: t("Terminale tıkla", "Click the terminal"), what: t("Tuşlar UART'tan monitöre gider", "Keys go to the monitor over UART") },
  ];
  const sideTabs: TabDef<SideTab>[] = SIDE_TABS.map((x) => ({ id: x.id, label: sec(x.label, dil), title: sec(x.title, dil) }));

  return (
    <div className="bench bench-m shell" data-side={panel.side ? "open" : "closed"} style={duzenStili(lay, "--editor-h")}>
      <AppHeader
        mode="cpu16"
        context={t("CPU16 · anakart + BIOS", "CPU16 · motherboard + BIOS")}
        shortcuts={shortcuts}
        meters={
          <>
            <Meter label={t("Süre", "Time")} ikincil>{seconds.toLocaleString(yer, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s</Meter>
            <Meter label={t("Hız", "Speed")}>{(running ? mhz : 0).toLocaleString(yer, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MHz</Meter>
            <Meter label={t("Komut", "Instructions")} ikincil>{cpu.instructions.toLocaleString(yer)}</Meter>
            <Meter label="PC" mono>{hex4(cpu.pc)}</Meter>
          </>
        }
      />
      <div className="toolbar">
        <Group label={t("Çalıştırma", "Execution")}>
          <button className="primary" onClick={running ? pause : start} disabled={!!busy || !!bad}>
            <Simge ad={running ? "duraklat" : "oynat"} />
            {running ? t("Durdur", "Pause") : t("Çalıştır", "Run")}
          </button>
          <button onClick={step} disabled={running || !!busy} title={t("Bir komut çalıştır", "Run one instruction")}><Simge ad="adim" />{t("Adım", "Step")}</button>
          <button onClick={resetMachine} disabled={!!busy} title={t("Reset düğmesi: CPU ve cihazlar sıfırlanır, RAM ve EEPROM kalır", "Reset button: resets the CPU and devices, keeps RAM and EEPROM")}>
            <Simge ad="sifirla" />{t("Sıfırla", "Reset")}
          </button>
        </Group>
        <Group label={t("Saat hızı", "Clock speed")}>
          <span className="tb-label kisalir">{t("Saat", "Clock")}</span>
          <select value={speed} onChange={(e) => pickSpeed(Number(e.target.value))} aria-label={t("Saat hızı", "Clock speed")}>
            {SPEEDS.map((s) => <option key={s.v} value={s.v}>{sec(s.label, dil)}</option>)}
          </select>
          <span className={`bench-status s-${status.kind}`} role="status">{status.text}</span>
        </Group>
        <Group label={t("Kip", "Mode")}>
          <span className="tb-label kisalir">{t("Makine", "Machine")}</span>
          {switcher}
        </Group>
        <Group label={t("Paneller", "Panels")} className="tb-end">
          <PanelToggle which="bottom" open={lay.bottom} onToggle={() => setLay({ bottom: !lay.bottom })} ad={t("Program düzenleyicisi", "Program editor")} />
          <PanelToggle which="side" open={lay.side} onToggle={() => setLay({ side: !lay.side })} />
          <OdakDugmesi />
        </Group>
      </div>

      <div className="workspace">
        <section className="bench-main">
          <div className="monitor">
            <div className={`vga${focused ? " focused" : ""}`}>
              <canvas
                ref={canvasRef}
                id="cpu16-vga"
                tabIndex={0}
                role="img"
                aria-label={t("VGA ekranı, 80×30 metin. Odaktayken klavye PS/2 olarak karta gider.", "VGA screen, 80×30 text. While it has focus, the keyboard goes to the board as PS/2.")}
                onKeyDown={onScreenKeyDown}
                onKeyUp={onScreenKeyUp}
                onFocus={() => setFocused(true)}
                onBlur={releaseKeys}
              />
              {!focused && <span className="vga-hint">{t("Klavyeyi kullanmak için ekrana tıkla (PS/2, ABD düzeni)", "Click the screen to use the keyboard (PS/2, US layout)")}</span>}
            </div>
          </div>
          <pre id="cpu16-screen-text" className="sr-only">{m.renderText()}</pre>

          {panel.bottom && (
            <Splitter value={lay.bottomH} onChange={(h) => setLay({ bottomH: h })} min={220} reserve={180} label={t("Program düzenleyicisinin yüksekliği", "Program editor height")} />
          )}

          <div className="bench-src panel" hidden={!panel.bottom}>
            <div className="panel-head">
              <h2>Program</h2>
              <select value={prog} onChange={(e) => pick(e.target.value)} aria-label={t("Örnek program", "Example program")}>
                <optgroup label="Assembly">
                  {ORDER.filter((n) => ornekDili(n) === "asm").map((n) => <option key={n} value={n}>{LABELS[n] ? sec(LABELS[n], dil) : n}</option>)}
                </optgroup>
                <optgroup label="C">
                  {ORDER.filter((n) => ornekDili(n) === "c").map((n) => <option key={n} value={n}>{LABELS[n] ? sec(LABELS[n], dil) : n}</option>)}
                </optgroup>
              </select>
              <div className="seg" role="group" aria-label={t("Dil", "Language")}>
                <button className={lang === "asm" ? "on" : ""} aria-pressed={lang === "asm"} onClick={() => chooseLang("asm")} title={t("as16 ile derlenir", "Assembled with as16")}>Assembly</button>
                <button className={lang === "c" ? "on" : ""} aria-pressed={lang === "c"} onClick={() => chooseLang("c")} title={t("cc16 C derleyicisiyle derlenir (BIOS hedefi)", "Compiled with the cc16 C compiler (BIOS target)")}>C</button>
              </div>
              <span className="hint-text grow">
                {lang === "c" ? t("cc16 · BIOS üzerinde 0x4000'dan çalışır", "cc16 · runs on the BIOS from 0x4000") : t("as16 ile derlenir", "built with as16")}
                {src !== EXAMPLES[prog] && (
                  <>
                    {" · "}
                    <button className="link" onClick={restoreExample} title={t("Değişiklikleri at, örneğin aslına dön", "Discard your changes and go back to the original example")}>
                      {t("örneğe dön", "restore example")}
                    </button>
                  </>
                )}
              </span>
              <button className="primary" onClick={() => void upload("ram")} disabled={!!busy} title="Ctrl+Enter"><Simge ad="yukle" />{t("Derle ve RAM'e yükle", "Compile and load into RAM")}</button>
              <button
                onClick={() => void upload("flash")}
                disabled={!!busy}
                title={t(
                  "F komutu: 28C256 EEPROM'a korumalı sayfa yazmasıyla yazar (yalnız bank 1, 0x4000–0x7FFF; bank 0 BIOS'un)",
                  "F command: writes to the 28C256 EEPROM with protected page writes (bank 1 only, 0x4000–0x7FFF; bank 0 holds the BIOS)",
                )}
              >
                {t("EEPROM'a yaz", "Write to EEPROM")}
              </button>
              {flashRun && <button onClick={runFromFlash} disabled={!!busy}>{t("EEPROM'dan çalıştır", "Run from EEPROM")}</button>}
              <Menu label={t("Gerçek kart", "Real board")} title={t("Web Serial ile gerçek karta yükleme ve kart testi", "Load and test the real board over Web Serial")} align="end" keepMounted>
                <div className="menu-col">
                  <button
                    onClick={() => void sendToBoard()}
                    disabled={!serialOk || !!busy}
                    title={
                      serialOk
                        ? t("Gerçek karta USB-UART üzerinden HEX gönder (L, sonra G)", "Send the HEX to the real board over USB-UART (L, then G)")
                        : t("Bu tarayıcıda Web Serial yok: Chrome ya da Edge (masaüstü), https ya da localhost gerekir", "This browser has no Web Serial: you need desktop Chrome or Edge, on https or localhost")
                    }
                  >
                    {t("Karta gönder (Web Serial)", "Send to board (Web Serial)")}
                  </button>
                  <button
                    onClick={() => void boardTest("kart")}
                    disabled={!serialOk || !!busy}
                    title={t(
                      "cpu16/bios/testler'deki 4 programı karta yükler, çıktılarını simülatörünkiyle karşılaştırır (CPU, bellek, önbellek, G/Ç ve video)",
                      "Loads the 4 programs in cpu16/bios/testler onto the board and compares their output with the simulator's (CPU, memory, cache, I/O and video)",
                    )}
                  >
                    {t("Kart testi (Web Serial)", "Board test (Web Serial)")}
                  </button>
                  <button onClick={() => void boardTest("sim")} disabled={!!busy} title={t("Aynı testi bu tezgâhtaki simüle karta karşı çalıştır", "Run the same test against the simulated board in this workbench")}>
                    {t("Kart testini simülatörde dene", "Try the board test in the simulator")}
                  </button>
                  <label className="field">
                    <span>{t("Kartın UART hızı", "Board UART speed")}</span>
                    <select value={baud} onChange={(e) => setBaud(Number(e.target.value))} aria-label={t("Kartın UART hızı (baud)", "Board UART speed (baud)")}>
                      <option value={115200}>{t("115 200 baud (CPU 4 MHz)", "115,200 baud (CPU 4 MHz)")}</option>
                      <option value={57600}>{t("57 600 baud (CPU 2 MHz)", "57,600 baud (CPU 2 MHz)")}</option>
                      <option value={28800}>{t("28 800 baud (CPU 1 MHz, ilk kurulum)", "28,800 baud (CPU 1 MHz, first build)")}</option>
                    </select>
                  </label>
                  <p className="muted small">
                    {serialOk
                      ? t(
                          "Yükleme gerçek karttaki gibi çalışır: reset, BIOS açılır, program monitöre UART'tan Intel HEX olarak gider (bkz. cpu16/docs/bios.md).",
                          "Loading works as on the real board: reset, the BIOS starts, and the program goes to the monitor over UART as Intel HEX (see cpu16/docs/bios.md).",
                        )
                      : t(
                          "Bu tarayıcıda Web Serial yok (Chrome / Edge masaüstü, https ya da localhost gerekir). Kart yine de CLI ile yüklenebilir.",
                          "This browser has no Web Serial (it needs desktop Chrome / Edge, on https or localhost). You can still load the board from the CLI.",
                        )}
                  </p>
                </div>
              </Menu>
            </div>
            <KodAlani
              id="cpu16-msrc"
              value={src}
              dil={lang}
              hataliSatirlar={errors.map((e) => e.line)}
              aria-label={lang === "c" ? t("C kaynak kodu", "C source code") : t("Assembly kaynak kodu", "Assembly source code")}
              onChange={(e) => edit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void upload("ram");
                }
              }}
            />
            {errors.length > 0 && (
              <ol className="bench-errors">
                {errors.map((e, i) => (
                  <li key={i}>{t(`satır ${e.line}: ${e.col ? `${e.col}. sütun: ` : ""}`, `line ${e.line}${e.col ? `, column ${e.col}` : ""}: `)}{e.message}</li>
                ))}
              </ol>
            )}
            <div className="panel-foot">
              <p className="info" role="status">{sec(info, dil)}</p>
            </div>
            {testOut && <pre className="bench-uart" aria-label={t("Kart testi sonucu", "Board test result")}>{testOut}</pre>}
            {boardTerm.text && (
              <>
                <h3>{t("Kart (Web Serial)", "Board (Web Serial)")}</h3>
                <pre className="bench-uart">{boardTerm.text}</pre>
              </>
            )}
          </div>
        </section>

        {panel.side && <YanBolucu lay={lay} setLay={setLay} />}
        {panel.side && (
          <aside className="bench-panel side" aria-label={t("Makine durumu", "Machine state")}>
            <Tabs tabs={sideTabs} value={sideTab} onChange={(s) => setLay({ sideTab: s })} label={t("Yan panel", "Side panel")} />
            <div className="side-body" role="tabpanel" hidden={sideTab !== "durum"}>
              <Section title={t("Register'lar", "Registers")} actions={!running && <span className="hint-text">{t("sarı: son adımda değişen", "yellow: changed in the last step")}</span>}>
                <div className="kahraman">
                  <span className="k-ad">PC</span>
                  <span className="k-deger">{hex4(cpu.pc)}</span>
                  <span className="k-ek">{trace.find((t) => t.cur)?.text ?? ""}</span>
                </div>
                <div className="bench-regs">
                  {REG_NAMES.map((n, i) => [n, cpu.regs[i], cpu.regs[i] !== prevRegs.current[i]] as const).map(([n, v, ch]) => (
                    <div key={n} className={ch && !running ? "changed" : ""}>
                      <b>{n}<i>{v > 32767 ? v - 65536 : v}</i></b>
                      <span>{hex4(v)}</span>
                      <span className="leds" aria-hidden="true">{Array.from({ length: 16 }, (_, k) => <i key={k} className={(v >> (15 - k)) & 1 ? "on" : ""} />)}</span>
                    </div>
                  ))}
                </div>
                <div className="pins" aria-label={t("Bayraklar", "Flags")}>
                  {(["n", "z", "c", "v", "i"] as const).map((f) => <Bayrak key={f} ad={f} on={cpu[f]} />)}
                  {cpu.irq && <span className="pin on">IRQ</span>}
                </div>
              </Section>

              <Section
                title={t("UART terminali", "UART terminal")}
                actions={
                  <>
                    <span className="hint-text">{t("115 200 baud", "115,200 baud")}</span>
                    <button className="link" onClick={() => { term.clear(); redraw(); }}>{t("temizle", "clear")}</button>
                  </>
                }
              >
                <pre
                  ref={termRef}
                  id="cpu16-term"
                  className="bench-uart bench-term"
                  tabIndex={0}
                  aria-label={t("UART terminali; odaktayken tuşlar karta UART'tan gider", "UART terminal; while it has focus, keys go to the board over UART")}
                  onKeyDown={onTermKeyDown}
                >
                  {term.text || t("UART boş", "UART is empty")}
                </pre>
                <form className="row" onSubmit={(e) => { e.preventDefault(); sendLine(); }}>
                  <input
                    className="mono"
                    value={termLine}
                    onChange={(e) => setTermLine(e.target.value)}
                    placeholder={t("monitör komutu, ör. D 4000", "monitor command, e.g. D 4000")}
                    aria-label={t("UART'a gönderilecek satır", "Line to send over UART")}
                  />
                  <button type="submit">{t("Gönder", "Send")}</button>
                </form>
              </Section>

              <Section title={t("Komut izi", "Instruction trace")}>
                <div className="bench-trace">
                  {trace.map((t) => (
                    <div key={t.a} className={t.cur ? "cur" : ""}><span>{hex4(t.a)}</span><span>{hex4(t.w)}</span><span>{t.text}</span></div>
                  ))}
                </div>
              </Section>
            </div>

            <div className="side-body" role="tabpanel" hidden={sideTab !== "anakart"}>
              <Section title={t("Anakart", "Motherboard")}>
                <dl className="bench-kv">
                  <dt>{t("Bank", "Banks")}</dt>
                  <dd className="mono">{Array.from(m.banks, (b, i) => `B${i}=${hex2(b)}`).join("  ")}</dd>
                  <dt>{t("Önbellek", "Cache")}</dt>
                  <dd>
                    {t(
                      `${m.cache.enabled ? "açık" : "kapalı"} · isabet ${hits.toLocaleString(yer)} · ıskalama ${misses.toLocaleString(yer)} · %${rate}`,
                      `${m.cache.enabled ? "on" : "off"} · ${hits.toLocaleString(yer)} hits · ${misses.toLocaleString(yer)} misses · ${rate}%`,
                    )}
                  </dd>
                  <dt>{t("Bekleme", "Wait states")}</dt>
                  <dd>{m.waitCycles.toLocaleString(yer)} {t("döngü", "cycles")}</dd>
                  <dt>IRQ</dt>
                  <dd>
                    {t("bekleyen", "pending")} {IRQ_NAMES.filter((_, i) => (pend >> i) & 1).map((x) => sec(x, dil)).join(", ") || "-"} · {t("maske", "mask")} {hex2(m.irqMask)} ·{" "}
                    {t("kaynak", "source")} {m.irqSource === 0xff ? t("yok", "none") : m.irqSource}
                  </dd>
                  <dt>{t("Zamanlayıcı", "Timer")}</dt>
                  <dd>{m.timer.ctrl & 1 ? t(`açık, ${m.timer.reload} ms'de bir (1 kHz tık)`, `on, every ${m.timer.reload} ms (1 kHz tick)`) : t("kapalı", "off")}</dd>
                  <dt>Video</dt>
                  <dd>{t("kare", "frame")} {m.video.frames.toLocaleString(yer)} · {t("imleç", "cursor")} {m.video.cursorX},{m.video.cursorY}</dd>
                </dl>
              </Section>

              <Section
                title={t("Bellek (CPU adresi)", "Memory (CPU address)")}
                actions={<input id="cpu16-mmem" className="addr" value={memAddr} onChange={(e) => setMemAddr(e.target.value)} size={6} aria-label={t("Bellek başlangıç adresi (hex)", "Memory start address (hex)")} />}
              >
                <pre className="bench-mem">
                  {memRows.map((r) => (
                    <div key={r.a}>
                      <span className="ad">{hex4(r.a)}</span>{"  "}
                      {r.bytes.map((v, k) => (
                        <span key={k} className={v === 0 ? "z" : ""}>{hex2(v)}{k === 3 ? "  " : " "}</span>
                      ))}
                      {" "}{r.bytes.map((v) => (v >= 32 && v < 127 ? String.fromCharCode(v) : ".")).join("")}
                    </div>
                  ))}
                </pre>
              </Section>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
