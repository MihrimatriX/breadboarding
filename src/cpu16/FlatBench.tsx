// CPU16 tezgâhı, düz bellek kipi (Faz 1): as16 ya da cc16 (C, ROM hedefi) ile derle, 64 KB düz
// RAM'li referans emülatörde (SimpleBus) adım adım çalıştır. Faz 1 örnek programları bu kipte çalışır.
// Motor cpu16/ klasöründe; bu dosya sadece Silikon3D arayüzüne bağlar.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { assemble } from "../../cpu16/asm/assembler";
import { buildProgram } from "../../cpu16/cc/index";
import { LIB } from "../../cpu16/cc/lib-vite";
import { Cpu16, SimpleBus, type StepResult } from "../../cpu16/emu/cpu";
import { disassemble } from "../../cpu16/emu/disasm";
import { AppHeader, Group, Meter, PanelToggle, Section, Tabs, useLayout, type Shortcut, type TabDef } from "../ui/Shell";
import { Simge } from "../ui/simgeler";
import { dilBul, ornekDili, type Dil } from "./dil";

const sources = import.meta.glob("../../cpu16/programs/*.{s,c}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
/** Örnekler: assembly dosyaları uzantısız ("fib"), C dosyaları uzantılı ("merhaba.c") anahtarla */
const PROGRAMS = Object.fromEntries(Object.entries(sources).map(([p, s]) => [p.split("/").pop()!.replace(/\.s$/, ""), s]));
const ORDER = ["hello", "fib", "add32", "bubble", "irq", "merhaba.c"].filter((n) => n in PROGRAMS);
const LABELS: Record<string, string> = {
  hello: "hello.s · UART'a merhaba", fib: "fib.s · Fibonacci", add32: "add32.s · 32 bit + yazılımla çarpma",
  bubble: "bubble.s · sıralama", irq: "irq.s · kesmeler", "merhaba.c": "merhaba.c · C: printf ve özyineleme",
};

/** Kaynağı derler: assembly as16 ile, C cc16 ile (ROM hedefi: 0x0000'dan kendi vektörleriyle) */
function compileSource(text: string, lang: Dil) {
  if (lang === "asm") return assemble(text);
  const b = buildProgram({ "/program.c": text }, ["/program.c"], { lib: LIB });
  return {
    image: b.image,
    ranges: b.ranges,
    symbols: b.symbols,
    errors: b.errors.map((e) => ({ line: e.line, message: e.col ? `${e.col}. sütun: ${e.message}` : e.message })),
  };
}
const MEMDEFAULT: Record<string, number> = { hello: 0x0000 };
const REG_NAMES = ["r0", "r1", "r2", "r3", "r4", "r5", "r6 · sp", "r7 · lr"];

const SHORTCUTS: Shortcut[] = [{ keys: "Ctrl+Enter", what: "Düzenleyicide: derleyip yükler" }];
type SideTab = "durum" | "bellek";
const SIDE_TABS: TabDef<SideTab>[] = [
  { id: "durum", label: "Durum", title: "Register'lar, UART çıkışı, komut izi" },
  { id: "bellek", label: "Bellek", title: "Bellek dökümü" },
];

const hex4 = (n: number) => (n & 0xffff).toString(16).toUpperCase().padStart(4, "0");
const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");

interface Machine {
  cpu: Cpu16;
  bus: SimpleBus;
}

type Status = { kind: "idle" | "run" | "halt" | "bad"; text: string };

export function FlatBench({ switcher }: { switcher: ReactNode }) {
  const [prog, setProg] = useState(ORDER[0]);
  const [src, setSrc] = useState(PROGRAMS[ORDER[0]]);
  /** Editördeki dil: örnekten gelir, yazdıkça içerikten tahmin edilir; elle seçilirse o kalır */
  const [lang, setLang] = useState<Dil>(ornekDili(ORDER[0]));
  const langManual = useRef(false);
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  const [info, setInfo] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "hazır" });
  const [running, setRunning] = useState(false);
  const [memAddr, setMemAddr] = useState("0000");
  const [, setFrame] = useState(0);
  const m = useRef<Machine | null>(null);
  const prevRegs = useRef<number[]>([]);
  const prevMem = useRef<Uint8Array | null>(null);
  const irqPending = useRef(false);
  const runningRef = useRef(false);
  const [lay, setLay] = useLayout("cpu16-duz", { side: true, bottom: true, bottomH: 0, sideTab: "durum" });
  const sideTab = (SIDE_TABS.some((t) => t.id === lay.sideTab) ? lay.sideTab : "durum") as SideTab;

  const redraw = () => setFrame((f) => f + 1);
  const snapshot = () => {
    if (!m.current) return;
    prevRegs.current = Array.from(m.current.cpu.regs);
    prevMem.current = m.current.bus.mem.slice();
  };
  const stop = () => {
    runningRef.current = false;
    setRunning(false);
  };

  const afterStep = (r: StepResult) => {
    const cpu = m.current!.cpu;
    if (irqPending.current && !cpu.i) {
      cpu.irq = false; // işleyiciye girildi: cihaz hattı bırakır
      irqPending.current = false;
    }
    if (r === "halted") {
      setStatus({ kind: "halt", text: cpu.i ? "HALT · kesme bekliyor" : "HALT" });
      stop();
    } else if (r === "illegal") {
      setStatus({ kind: "bad", text: `yasadışı komut @ ${hex4(cpu.illegalAt ?? 0)}` });
      stop();
    }
  };

  const build = useCallback((text: string, lang: Dil, autorun = false) => {
    stop();
    const res = compileSource(text, lang);
    setErrors(res.errors);
    if (res.errors.length) {
      m.current = null;
      setInfo("Derleme başarısız; hataları düzeltip tekrar derle.");
      setStatus({ kind: "bad", text: "derleme hatası" });
      return;
    }
    const bus = new SimpleBus();
    bus.load(res.image);
    bus.onOutput = redraw;
    const cpu = new Cpu16(bus);
    m.current = { cpu, bus };
    prevRegs.current = Array.from(cpu.regs);
    prevMem.current = null;
    irqPending.current = false;
    const size = res.ranges.reduce((n, [s, e]) => n + e - s, 0);
    setInfo(`${size} bayt, ${res.symbols.size} sembol. Yüklendi; Adım veya Çalıştır'a bas.`);
    setStatus({ kind: "idle", text: "hazır" });
    if (autorun) {
      snapshot();
      const r = cpu.run(10_000);
      if (r !== "ok") {
        const c = cpu;
        setStatus(r === "halted" ? { kind: "halt", text: c.i ? "HALT · kesme bekliyor" : "HALT" } : { kind: "bad", text: "yasadışı komut" });
      }
    }
    redraw();
  }, []);

  useEffect(() => {
    build(PROGRAMS[ORDER[0]], ornekDili(ORDER[0]), true);
    return () => {
      runningRef.current = false;
    };
  }, [build]);

  const step = () => {
    if (!m.current) return;
    snapshot();
    afterStep(m.current.cpu.step());
    redraw();
  };

  const run = () => {
    if (!m.current || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setStatus({ kind: "run", text: "çalışıyor" });
    snapshot();
    const tick = () => {
      if (!runningRef.current || !m.current) return;
      for (let i = 0; i < 2000 && runningRef.current; i++) {
        const r = m.current.cpu.step();
        afterStep(r);
        if (r !== "ok") break;
      }
      redraw();
      if (runningRef.current) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const pause = () => {
    stop();
    setStatus({ kind: "idle", text: "duraklatıldı" });
  };

  const raiseIrq = () => {
    const cpu = m.current?.cpu;
    if (!cpu) return;
    cpu.irq = true;
    irqPending.current = true;
    if (cpu.halted && cpu.i) run();
    else if (!cpu.i) setInfo("IRQ hattı kalktı, ama kesmeler kapalı (I=0); program EI çalıştırınca alınacak.");
    redraw();
  };

  const pick = (name: string) => {
    const l = ornekDili(name);
    setProg(name);
    setSrc(PROGRAMS[name]);
    langManual.current = false;
    setLang(l);
    setMemAddr(hex4(MEMDEFAULT[name] ?? 0x4000));
    build(PROGRAMS[name], l);
  };
  const edit = (text: string) => {
    setSrc(text);
    if (!langManual.current) setLang((l) => dilBul(text) ?? l);
  };
  const chooseLang = (l: Dil) => {
    langManual.current = true;
    setLang(l);
  };

  const cpu = m.current?.cpu;
  const bus = m.current?.bus;

  const trace = (() => {
    if (!cpu) return [];
    const start = Math.max(0, cpu.pc - 8) & 0xfffe;
    return Array.from({ length: 11 }, (_, k) => {
      const a = start + k * 2;
      const w = cpu.read16(a);
      return { a, w, text: disassemble(w, a), cur: a === cpu.pc };
    });
  })();

  const memRows = (() => {
    if (!bus) return [];
    const base = (parseInt(memAddr, 16) || 0) & 0xfff0;
    return Array.from({ length: 16 }, (_, r) => {
      const a = (base + r * 8) & 0xffff;
      const bytes = Array.from({ length: 8 }, (_, k) => {
        const addr = (a + k) & 0xffff;
        const v = bus.mem[addr];
        return { v, changed: prevMem.current !== null && prevMem.current[addr] !== v };
      });
      return { a, bytes };
    });
  })();

  return (
    <div className="bench bench-flat shell" data-side={lay.side ? "open" : "closed"}>
      <AppHeader
        mode="cpu16"
        context="CPU16 · düz bellek (64 KB RAM)"
        shortcuts={SHORTCUTS}
        meters={
          <>
            <Meter label="Komut">{cpu ? cpu.instructions.toLocaleString("tr-TR") : "-"}</Meter>
            <Meter label="PC">{cpu ? hex4(cpu.pc) : "-"}</Meter>
          </>
        }
      />
      <div className="toolbar">
        <Group label="Kip">{switcher}</Group>
        <Group label="Çalıştırma">
          <button onClick={step} disabled={!cpu || running} title="Bir komut çalıştır"><Simge ad="adim" />Adım</button>
          <button className="primary" onClick={running ? pause : run} disabled={!cpu}>
            <Simge ad={running ? "duraklat" : "oynat"} />
            {running ? "Durdur" : "Çalıştır"}
          </button>
          <button onClick={() => build(src, lang)} title="Programı yeniden yükle, CPU'yu sıfırla"><Simge ad="sifirla" />Sıfırla</button>
          <button onClick={raiseIrq} disabled={!cpu} title="IRQ hattını kaldır (irq.s örneği için)">IRQ</button>
        </Group>
        <Group label="Durum">
          <span className={`bench-status s-${status.kind}`} role="status">{status.text}</span>
        </Group>
        <Group label="Paneller" className="tb-end">
          <PanelToggle which="side" open={lay.side} onToggle={() => setLay({ side: !lay.side })} />
        </Group>
      </div>

      <div className="workspace">
        <section className="bench-main">
          <div className="bench-src panel fill">
            <div className="panel-head">
              <h2>Kaynak</h2>
              <select id="cpu16-prog" value={prog} onChange={(e) => pick(e.target.value)} aria-label="Örnek program">
                {ORDER.map((n) => <option key={n} value={n}>{LABELS[n] ?? n}</option>)}
              </select>
              <div className="seg" role="group" aria-label="Dil">
                <button className={lang === "asm" ? "on" : ""} aria-pressed={lang === "asm"} onClick={() => chooseLang("asm")} title="as16 ile derlenir">Assembly</button>
                <button className={lang === "c" ? "on" : ""} aria-pressed={lang === "c"} onClick={() => chooseLang("c")} title="cc16 C derleyicisiyle derlenir (ROM hedefi)">C</button>
              </div>
              <span className="hint-text grow">{lang === "c" ? "cc16 · program 0x0000'dan; printf UART'a yazar" : "as16 ile derlenir"}</span>
            </div>
            <textarea
              id="cpu16-src"
              spellCheck={false}
              value={src}
              aria-label={lang === "c" ? "C kaynak kodu" : "Assembly kaynak kodu"}
              onChange={(e) => edit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); build(src, lang); }
              }}
            />
            {errors.length > 0 && (
              <ol className="bench-errors">{errors.map((e, i) => <li key={i}>satır {e.line}: {e.message}</li>)}</ol>
            )}
            <div className="panel-foot">
              <button className="primary" onClick={() => build(src, lang)} title="Ctrl+Enter"><Simge ad="yukle" />Derle ve yükle</button>
              <p className="info" role="status">{info}</p>
            </div>
          </div>
        </section>

        {lay.side && (
          <aside className="bench-panel side" aria-label="Makine durumu">
            <Tabs tabs={SIDE_TABS} value={sideTab} onChange={(t) => setLay({ sideTab: t })} label="Yan panel" />
            <div className="side-body" role="tabpanel" hidden={sideTab !== "durum"}>
              <Section title="Register'lar">
                <div className="bench-regs">
                  {cpu && [...REG_NAMES.map((n, i) => [n, cpu.regs[i], cpu.regs[i] !== prevRegs.current[i]] as const), ["pc", cpu.pc, false] as const].map(([n, v, ch]) => (
                    <div key={n} className={ch ? "changed" : ""}>
                      <b>{n}<i>{v > 32767 ? v - 65536 : v}</i></b>
                      <span>{hex4(v)}</span>
                      <span className="leds">{Array.from({ length: 16 }, (_, k) => <i key={k} className={(v >> (15 - k)) & 1 ? "on" : ""} />)}</span>
                    </div>
                  ))}
                </div>
                <div className="pins" aria-label="Bayraklar">
                  {cpu && (["n", "z", "c", "v", "i"] as const).map((f) => <span key={f} className={`pin ${cpu[f] ? "on" : ""}`}>{f.toUpperCase()}</span>)}
                  {cpu?.irq && <span className="pin on">IRQ</span>}
                </div>
              </Section>

              <Section title="UART çıkışı">
                <pre className="bench-uart">{bus?.output || "UART boş: programın 0xFF00'a yazdığı baytlar burada görünür"}</pre>
              </Section>

              <Section title="Komut izi">
                <div className="bench-trace">
                  {trace.map((t) => (
                    <div key={t.a} className={t.cur ? "cur" : ""}><span>{hex4(t.a)}</span><span>{hex4(t.w)}</span><span>{t.text}</span></div>
                  ))}
                </div>
              </Section>
            </div>

            <div className="side-body" role="tabpanel" hidden={sideTab !== "bellek"}>
              <Section
                title="Bellek"
                actions={<input id="cpu16-mem" className="addr" value={memAddr} onChange={(e) => setMemAddr(e.target.value)} size={6} aria-label="Bellek başlangıç adresi (hex)" />}
              >
                <pre className="bench-mem">
                  {memRows.map((r) => (
                    <div key={r.a}>
                      <span className="ad">{hex4(r.a)}</span>{"  "}
                      {r.bytes.map((b, k) => (
                        <span key={k} className={b.changed ? "ch" : b.v === 0 ? "z" : ""}>{hex2(b.v)}{k === 3 ? "  " : " "}</span>
                      ))}
                      {" "}{r.bytes.map((b) => (b.v >= 32 && b.v < 127 ? String.fromCharCode(b.v) : ".")).join("")}
                    </div>
                  ))}
                </pre>
                <p className="legend"><span><i className="sw ch" /> son adımda değişen bayt</span></p>
              </Section>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
