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
import { ModeSwitch } from "../ui/ModeSwitch";
import { VgaRenderer } from "./vga";
import { TerminalText, WebSerialLink, webSerial } from "./serial";

const sources = import.meta.glob("../../cpu16/bios/ornekler/*.{s,c}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
/** Örnekler: assembly dosyaları uzantısız ("merhaba"), C dosyaları uzantılı ("yilan.c") anahtarla */
const EXAMPLES = Object.fromEntries(Object.entries(sources).map(([p, s]) => [p.split("/").pop()!.replace(/\.s$/, ""), s]));
const ORDER = ["merhaba", "saat", "renkler", "onbellek", "selam.c", "yilan.c"].filter((n) => n in EXAMPLES);
const LABELS: Record<string, string> = {
  merhaba: "merhaba.s · renkli selam ve toplam",
  saat: "saat.s · kutu çizimi ve saat",
  renkler: "renkler.s · 16×16 renk tablosu",
  onbellek: "onbellek.s · önbellek açık / kapalı",
  "selam.c": "selam.c · C: printf, renkler, özyineleme",
  "yilan.c": "yilan.c · C: yılan oyunu (W A S D)",
};
const isC = (name: string) => name.endsWith(".c");
/** Kart testi programları (cpu16/bios/testler): gerçek kart bunları simülatörle aynı çıktıyla geçmeli */
const TESTLER = Object.fromEntries(
  Object.entries(import.meta.glob("../../cpu16/bios/testler/*.{s,c}", { query: "?raw", import: "default", eager: true }) as Record<string, string>).map(([p, s]) => [
    p.split("/").pop()!,
    s,
  ]),
);

/** Hız seçenekleri: 4 MHz'in katı; 0 = turbo (karede sığdığı kadar). */
const SPEEDS = [
  { v: 0.1, label: "1/10 hız (400 kHz)" },
  { v: 1, label: "gerçek hız (4 MHz)" },
  { v: 4, label: "×4 (16 MHz)" },
  { v: 0, label: "turbo" },
];
/** Bir karede emülasyona ayrılan en uzun süre (ms). */
const FRAME_BUDGET_MS = 11;
/** Tarayıcı işlevleri için bırakılan tuşlar (yenile, tam ekran, geliştirici araçları). */
const BROWSER_KEYS = new Set(["Tab", "F5", "F11", "F12"]);
const REG_NAMES = ["r0", "r1", "r2", "r3", "r4", "r5", "r6 · sp", "r7 · lr"];
const IRQ_NAMES = ["zamanlayıcı", "klavye", "UART", "vsync"];

const hex4 = (n: number) => (n & 0xffff).toString(16).toUpperCase().padStart(4, "0");
const hex2 = (n: number) => (n & 0xff).toString(16).toUpperCase().padStart(2, "0");

let biosBuild: BiosBuild | null = null;
/** BIOS ilk kullanımda derlenir (bios.s, Vite ?raw ile gömülü). */
function bios(): BiosBuild {
  biosBuild ??= buildBios(biosSource);
  return biosBuild;
}

type Status = { kind: "idle" | "run" | "halt" | "bad"; text: string };

export function MachineBench({ switcher }: { switcher: ReactNode }) {
  const [m] = useState(() => {
    const mach = new Machine();
    mach.loadFlash(bios().flash);
    mach.reset();
    return mach;
  });
  const [term] = useState(() => new TerminalText());
  const [boardTerm] = useState(() => new TerminalText());
  const [prog, setProg] = useState(ORDER[0]);
  const [src, setSrc] = useState(EXAMPLES[ORDER[0]] ?? "");
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  const [info, setInfo] = useState("BIOS açıldı. Ekrana tıklayıp monitöre komut yazabilir ya da bir program yükleyebilirsin.");
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [testOut, setTestOut] = useState("");
  /** Gerçek kartın UART hızı: UART bit süresi CPU saatinden (TCLK) bölünür, 1 MHz'de 28 800 baud */
  const [baud, setBaud] = useState(115200);
  const [focused, setFocused] = useState(false);
  const [flashRun, setFlashRun] = useState<string | null>(null);
  const [bad, setBad] = useState<string | null>(null);
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
            setBad(`yasadışı komut @ ${hex4(m.cpu.illegalAt ?? m.cpu.pc)}`);
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

  // Terminal hep en alttan gösterilir
  useEffect(() => {
    const el = termRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

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
    if (m.step() === "illegal") setBad(`yasadışı komut @ ${hex4(m.cpu.illegalAt ?? m.cpu.pc)}`);
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
    if (isC(prog)) {
      // cc16, BIOS hedefi: RAM'e 0x4000'dan yüklenir, giriş __reset (0x4000)
      const b = buildProgram({ [`/${prog}`]: src }, [`/${prog}`], { lib: LIB, target: "bios" });
      setErrors(b.errors.map((e) => ({ line: e.line, message: e.col ? `${e.col}. sütun: ${e.message}` : e.message })));
      if (b.errors.length) {
        setInfo("Derleme başarısız; hataları düzeltip tekrar dene.");
        return null;
      }
      return { image: b.image, ranges: b.ranges, symbols: new Map([["main", 0x4000]]) } as unknown as ReturnType<typeof assemble>;
    }
    const res = assemble(src);
    setErrors(res.errors);
    if (res.errors.length) {
      setInfo("Derleme başarısız; hataları düzeltip tekrar dene.");
      return null;
    }
    if (!res.ranges.length) {
      setInfo("Program boş.");
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
    const what = mode === "ram" ? "RAM'e yükleniyor" : "EEPROM'a yazılıyor";
    setBusy(what);
    start();
    const r = await uploadHex(link, hex, {
      mode,
      run: mode === "ram",
      onProgress: (d, t) => setBusy(`${what} ${d}/${t}`),
    });
    linkRef.current = null;
    setBusy(null);
    if (!r.ok) {
      setInfo(`Yükleme başarısız: ${r.message}`);
      return;
    }
    if (mode === "ram") {
      setInfo(`${size} bayt (0x${hex4(size)}), ${r.records} HEX kaydı UART'tan yüklendi; G ${hex4(entry)} ile çalıştırıldı. BIOS: "${r.message}".`);
      return;
    }
    const w = entry >> 14;
    if (w === 1) {
      const cmd = `B ${w} ${w}\rG ${hex4(entry)}\r`;
      setFlashRun(cmd);
      setInfo(`EEPROM'a yazıldı (${size} bayt, EEPROM ofseti = CPU adresi). Çalıştırmak için monitörde: B ${w} ${w} (pencere ${w} → EEPROM bank ${w}), sonra G ${hex4(entry)}.`);
    } else {
      setInfo(`EEPROM 32 KB'tır (bank 0 BIOS'un, bank 1 programların): EEPROM'dan çalıştırılacak program 0x4000–0x7FFF'e yerleştirilmeli.`);
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
      setBusy("Karta gönderiliyor");
      const r = await uploadHex(link, hex, {
        mode: "ram",
        run: true,
        timeoutMs: 3000,
        onProgress: (d, t) => setBusy(`Karta gönderiliyor ${d}/${t}`),
      });
      setInfo(r.ok ? `Kart: ${r.message}; G ile çalıştırıldı.` : `Kart: yükleme başarısız: ${r.message}`);
    } catch (e) {
      setInfo(`Web Serial: ${(e as Error).message}`);
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
    setBusy("Kart testi: beklenen çıktılar simülatörde hesaplanıyor");
    await new Promise((r) => setTimeout(r, 30));
    let close = async () => {};
    try {
      const programs = kartTestProgramlari(TESTLER, LIB);
      const expected = await beklenenCiktilar(programs, bios().flash);
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
      const res = await kartTesti(link, programs, expected, (t) => setBusy(`Kart testi: ${t}`));
      setTestOut(sonucMetni(programs, res));
    } catch (e) {
      setTestOut(`Kart testi yapılamadı: ${(e as Error).message}`);
    } finally {
      linkRef.current = null;
      await close();
      setBusy(null);
    }
  };

  const pick = (name: string) => {
    setProg(name);
    setSrc(EXAMPLES[name]);
    setErrors([]);
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
    ? { kind: "bad", text: bad }
    : busy
      ? { kind: "run", text: busy }
      : !running
        ? { kind: "idle", text: "duraklatıldı" }
        : cpu.halted
          ? { kind: "halt", text: "HALT · kesme bekliyor" }
          : { kind: "run", text: "çalışıyor" };

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
    return Array.from({ length: 8 }, (_, r) => {
      const a = (base + r * 16) & 0xffff;
      return { a, bytes: Array.from({ length: 16 }, (_, k) => m.peek((a + k) & 0xffff)) };
    });
  })();

  const pend = m.irqPending;
  const hits = m.cache.totalHits;
  const misses = m.cache.totalMisses;
  const rate = hits + misses ? ((hits / (hits + misses)) * 100).toFixed(1) : "-";
  const seconds = m.cycles / CPU_HZ;

  return (
    <div className="bench bench-m">
      <header className="toolbar">
        <div className="brand">
          <h1>Silikon3D</h1>
          <span>CPU16 · anakart + BIOS</span>
        </div>
        <ModeSwitch mode="cpu16" />
        {switcher}
        <div className="clock">
          <button onClick={step} disabled={running || !!busy} title="Bir komut çalıştır">Adım</button>
          <button className="primary" onClick={running ? pause : start} disabled={!!busy || !!bad}>{running ? "Durdur" : "Çalıştır"}</button>
          <button onClick={resetMachine} disabled={!!busy} title="Reset düğmesi: CPU ve cihazlar sıfırlanır, RAM ve EEPROM kalır">Sıfırla</button>
          <select value={speed} onChange={(e) => pickSpeed(Number(e.target.value))} aria-label="Saat hızı">
            {SPEEDS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
          <span className={`bench-status s-${status.kind}`}>{status.text}</span>
        </div>
        <div className="meter">
          <span>Süre <b>{seconds.toFixed(1)} s</b></span>
          <span>Hız <b>{running ? mhz.toFixed(2) : "0.00"} MHz</b></span>
          <span>Komut <b>{cpu.instructions.toLocaleString("tr-TR")}</b></span>
          <span>PC <b>{hex4(cpu.pc)}</b></span>
        </div>
      </header>

      <section className="bench-main">
        <div className={`vga${focused ? " focused" : ""}`}>
          <canvas
            ref={canvasRef}
            id="cpu16-vga"
            tabIndex={0}
            role="img"
            aria-label="VGA ekranı, 80×30 metin. Odaktayken klavye PS/2 olarak karta gider."
            onKeyDown={onScreenKeyDown}
            onKeyUp={onScreenKeyUp}
            onFocus={() => setFocused(true)}
            onBlur={releaseKeys}
          />
          {!focused && <span className="vga-hint">Klavyeyi kullanmak için ekrana tıkla (PS/2, ABD düzeni)</span>}
        </div>
        <pre id="cpu16-screen-text" className="sr-only">{m.renderText()}</pre>

        <div className="bench-src">
          <div className="row between">
            <h2>Program</h2>
            <select value={prog} onChange={(e) => pick(e.target.value)} aria-label="Örnek program">
              {ORDER.map((n) => <option key={n} value={n}>{LABELS[n] ?? n}</option>)}
            </select>
          </div>
          <textarea
            id="cpu16-msrc"
            spellCheck={false}
            value={src}
            aria-label={isC(prog) ? "C kaynak kodu" : "Assembly kaynak kodu"}
            onChange={(e) => setSrc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void upload("ram");
              }
            }}
          />
          {errors.length > 0 && (
            <ol className="bench-errors">{errors.map((e, i) => <li key={i}>satır {e.line}: {e.message}</li>)}</ol>
          )}
          <div className="row wrap">
            <button className="primary" onClick={() => void upload("ram")} disabled={!!busy}>Derle ve RAM'e yükle</button>
            <button onClick={() => void upload("flash")} disabled={!!busy} title="F komutu: 28C256 EEPROM'a korumalı sayfa yazmasıyla yazar (yalnız bank 1, 0x4000–0x7FFF; bank 0 BIOS'un)">EEPROM'a yaz</button>
            {flashRun && <button onClick={runFromFlash} disabled={!!busy}>EEPROM'dan çalıştır</button>}
            <button
              onClick={() => void sendToBoard()}
              disabled={!serialOk || !!busy}
              title={serialOk ? "Gerçek karta USB-UART üzerinden HEX gönder (L, sonra G)" : "Bu tarayıcıda Web Serial yok: Chrome ya da Edge (masaüstü), https ya da localhost gerekir"}
            >
              Karta gönder (Web Serial)
            </button>
          </div>
          <div className="row wrap">
            <button
              onClick={() => void boardTest("kart")}
              disabled={!serialOk || !!busy}
              title="cpu16/bios/testler'deki 4 programı karta yükler, çıktılarını simülatörünkiyle karşılaştırır (CPU, bellek, önbellek, G/Ç ve video)"
            >
              Kart testi (Web Serial)
            </button>
            <button onClick={() => void boardTest("sim")} disabled={!!busy} title="Aynı testi bu tezgâhtaki simüle karta karşı çalıştır">
              Kart testini simülatörde dene
            </button>
          </div>
          <label className="row small muted">
            Kartın UART hızı
            <select value={baud} onChange={(e) => setBaud(Number(e.target.value))} aria-label="Kartın UART hızı (baud)">
              <option value={115200}>115 200 baud (CPU 4 MHz)</option>
              <option value={57600}>57 600 baud (CPU 2 MHz)</option>
              <option value={28800}>28 800 baud (CPU 1 MHz, ilk kurulum)</option>
            </select>
          </label>
          {testOut && <pre className="bench-uart" aria-label="Kart testi sonucu">{testOut}</pre>}
          {!serialOk && <p className="muted small">Karta gönder: bu tarayıcıda Web Serial yok (Chrome / Edge masaüstü, https ya da localhost gerekir). Kart yine de CLI ile yüklenebilir.</p>}
          <p className="muted small">
            {info} Yükleme gerçek karttaki gibi çalışır: reset, BIOS açılır, program monitöre UART'tan Intel HEX olarak gider (bkz. cpu16/docs/bios.md). Ctrl+Enter: derle ve RAM'e yükle.
          </p>
          {boardTerm.text && (
            <>
              <h2>Kart (Web Serial)</h2>
              <pre className="bench-uart">{boardTerm.text}</pre>
            </>
          )}
        </div>
      </section>

      <section className="bench-panel">
        <h2>Register'lar</h2>
        <div className="bench-regs">
          {[...REG_NAMES.map((n, i) => [n, cpu.regs[i], cpu.regs[i] !== prevRegs.current[i]] as const), ["pc", cpu.pc, false] as const].map(([n, v, ch]) => (
            <div key={n} className={ch && !running ? "changed" : ""}>
              <b>{n}<i>{v > 32767 ? v - 65536 : v}</i></b>
              <span>{hex4(v)}</span>
              <span className="leds">{Array.from({ length: 16 }, (_, k) => <i key={k} className={(v >> (15 - k)) & 1 ? "on" : ""} />)}</span>
            </div>
          ))}
        </div>
        <div className="pins">
          {(["n", "z", "c", "v", "i"] as const).map((f) => <span key={f} className={`pin ${cpu[f] ? "on" : ""}`}>{f.toUpperCase()}</span>)}
          {cpu.irq && <span className="pin on">IRQ</span>}
        </div>

        <h2>Komut izi</h2>
        <div className="bench-trace">
          {trace.map((t) => (
            <div key={t.a} className={t.cur ? "cur" : ""}><span>{hex4(t.a)}</span><span>{hex4(t.w)}</span><span>{t.text}</span></div>
          ))}
        </div>

        <div className="row between">
          <h2>UART terminali · 115200</h2>
          <button className="link" onClick={() => { term.clear(); redraw(); }}>temizle</button>
        </div>
        <pre
          ref={termRef}
          id="cpu16-term"
          className="bench-uart bench-term"
          tabIndex={0}
          aria-label="UART terminali; odaktayken tuşlar karta UART'tan gider"
          onKeyDown={onTermKeyDown}
        >
          {term.text || "UART boş"}
        </pre>
        <form className="row" onSubmit={(e) => { e.preventDefault(); sendLine(); }}>
          <input value={termLine} onChange={(e) => setTermLine(e.target.value)} placeholder="monitör komutu, ör. D 4000" aria-label="UART'a gönderilecek satır" />
          <button type="submit">Gönder</button>
        </form>

        <h2>Anakart</h2>
        <dl className="bench-kv">
          <dt>Bank</dt>
          <dd>{Array.from(m.banks, (b, i) => `B${i}=${hex2(b)}`).join("  ")}</dd>
          <dt>Önbellek</dt>
          <dd>{m.cache.enabled ? "açık" : "kapalı"} · isabet {hits.toLocaleString("tr-TR")} · ıskalama {misses.toLocaleString("tr-TR")} · %{rate}</dd>
          <dt>Bekleme</dt>
          <dd>{m.waitCycles.toLocaleString("tr-TR")} döngü</dd>
          <dt>IRQ</dt>
          <dd>
            bekleyen {IRQ_NAMES.filter((_, i) => (pend >> i) & 1).join(", ") || "-"} · maske {hex2(m.irqMask)} · kaynak {m.irqSource === 0xff ? "yok" : m.irqSource}
          </dd>
          <dt>Zamanlayıcı</dt>
          <dd>{m.timer.ctrl & 1 ? `açık, ${m.timer.reload} ms'de bir (1 kHz tık)` : "kapalı"}</dd>
          <dt>Video</dt>
          <dd>kare {m.video.frames.toLocaleString("tr-TR")} · imleç {m.video.cursorX},{m.video.cursorY}</dd>
        </dl>

        <div className="row between">
          <h2>Bellek (CPU adresi)</h2>
          <input id="cpu16-mmem" value={memAddr} onChange={(e) => setMemAddr(e.target.value)} size={6} aria-label="Bellek başlangıç adresi (hex)" />
        </div>
        <pre className="bench-mem">
          {memRows.map((r) => (
            <div key={r.a}>
              <span className="ad">{hex4(r.a)}</span>{"  "}
              {r.bytes.map((v, k) => (
                <span key={k} className={v === 0 ? "z" : ""}>{hex2(v)}{k === 7 ? "  " : " "}</span>
              ))}
              {" "}{r.bytes.map((v) => (v >= 32 && v < 127 ? String.fromCharCode(v) : ".")).join("")}
            </div>
          ))}
        </pre>
      </section>
    </div>
  );
}
