// CPU16 tezgâhı, düz bellek kipi (Faz 1): as16 ile derle, 64 KB düz RAM'li referans
// emülatörde (SimpleBus) adım adım çalıştır. Faz 1 örnek programları bu kipte çalışır.
// Motor cpu16/ klasöründe; bu dosya sadece Silikon3D arayüzüne bağlar.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { assemble } from "../../cpu16/asm/assembler";
import { Cpu16, SimpleBus, type StepResult } from "../../cpu16/emu/cpu";
import { disassemble } from "../../cpu16/emu/disasm";
import { ModeSwitch } from "../ui/ModeSwitch";

const sources = import.meta.glob("../../cpu16/programs/*.s", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const PROGRAMS = Object.fromEntries(Object.entries(sources).map(([p, s]) => [p.split("/").pop()!.replace(/\.s$/, ""), s]));
const ORDER = ["hello", "fib", "add32", "bubble", "irq"].filter((n) => n in PROGRAMS);
const LABELS: Record<string, string> = {
  hello: "hello.s · UART'a merhaba", fib: "fib.s · Fibonacci", add32: "add32.s · 32 bit + yazılımla çarpma",
  bubble: "bubble.s · sıralama", irq: "irq.s · kesmeler",
};
const MEMDEFAULT: Record<string, number> = { hello: 0x0000 };
const REG_NAMES = ["r0", "r1", "r2", "r3", "r4", "r5", "r6 · sp", "r7 · lr"];

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

  const build = useCallback((text: string, autorun = false) => {
    stop();
    const res = assemble(text);
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
    build(PROGRAMS[ORDER[0]], true);
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
    setProg(name);
    setSrc(PROGRAMS[name]);
    setMemAddr(hex4(MEMDEFAULT[name] ?? 0x4000));
    build(PROGRAMS[name]);
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
    return Array.from({ length: 8 }, (_, r) => {
      const a = (base + r * 16) & 0xffff;
      const bytes = Array.from({ length: 16 }, (_, k) => {
        const addr = (a + k) & 0xffff;
        const v = bus.mem[addr];
        return { v, changed: prevMem.current !== null && prevMem.current[addr] !== v };
      });
      return { a, bytes };
    });
  })();

  return (
    <div className="bench">
      <header className="toolbar">
        <div className="brand">
          <h1>Silikon3D</h1>
          <span>CPU16 · kendi 16 bit işlemcimiz</span>
        </div>
        <ModeSwitch mode="cpu16" />
        {switcher}
        <div className="clock">
          <button onClick={step} disabled={!cpu || running} title="Bir komut çalıştır">Adım</button>
          <button className="primary" onClick={running ? pause : run} disabled={!cpu}>{running ? "Durdur" : "Çalıştır"}</button>
          <button onClick={() => build(src)}>Sıfırla</button>
          <button onClick={raiseIrq} disabled={!cpu} title="IRQ hattını kaldır (irq.s örneği için)">IRQ</button>
          <span className={`bench-status s-${status.kind}`}>{status.text}</span>
        </div>
        <div className="meter">
          <span>Komut <b>{cpu ? cpu.instructions.toLocaleString("tr-TR") : "-"}</b></span>
          <span>PC <b>{cpu ? hex4(cpu.pc) : "-"}</b></span>
        </div>
      </header>

      <section className="bench-src">
        <div className="row between">
          <h2>Kaynak</h2>
          <div className="row">
            <select id="cpu16-prog" value={prog} onChange={(e) => pick(e.target.value)} aria-label="Örnek program">
              {ORDER.map((n) => <option key={n} value={n}>{LABELS[n] ?? n}</option>)}
            </select>
            <button className="primary" onClick={() => build(src)}>Derle ve yükle</button>
          </div>
        </div>
        <textarea
          id="cpu16-src"
          spellCheck={false}
          value={src}
          aria-label="Assembly kaynak kodu"
          onChange={(e) => setSrc(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); build(src); }
          }}
        />
        {errors.length > 0 && (
          <ol className="bench-errors">{errors.map((e, i) => <li key={i}>satır {e.line}: {e.message}</li>)}</ol>
        )}
        <p className="muted small">{info} Ctrl+Enter: derle.</p>
      </section>

      <section className="bench-panel">
        <h2>Register'lar</h2>
        <div className="bench-regs">
          {cpu && [...REG_NAMES.map((n, i) => [n, cpu.regs[i], cpu.regs[i] !== prevRegs.current[i]] as const), ["pc", cpu.pc, false] as const].map(([n, v, ch]) => (
            <div key={n} className={ch ? "changed" : ""}>
              <b>{n}<i>{v > 32767 ? v - 65536 : v}</i></b>
              <span>{hex4(v)}</span>
              <span className="leds">{Array.from({ length: 16 }, (_, k) => <i key={k} className={(v >> (15 - k)) & 1 ? "on" : ""} />)}</span>
            </div>
          ))}
        </div>
        <div className="pins">
          {cpu && (["n", "z", "c", "v", "i"] as const).map((f) => <span key={f} className={`pin ${cpu[f] ? "on" : ""}`}>{f.toUpperCase()}</span>)}
          {cpu?.irq && <span className="pin on">IRQ</span>}
        </div>

        <h2>Komut izi</h2>
        <div className="bench-trace">
          {trace.map((t) => (
            <div key={t.a} className={t.cur ? "cur" : ""}><span>{hex4(t.a)}</span><span>{hex4(t.w)}</span><span>{t.text}</span></div>
          ))}
        </div>

        <h2>UART çıkışı</h2>
        <pre className="bench-uart">{bus?.output || "UART boş: programın 0xFF00'a yazdığı baytlar burada görünür"}</pre>

        <div className="row between">
          <h2>Bellek</h2>
          <input id="cpu16-mem" value={memAddr} onChange={(e) => setMemAddr(e.target.value)} size={6} aria-label="Bellek başlangıç adresi (hex)" />
        </div>
        <pre className="bench-mem">
          {memRows.map((r) => (
            <div key={r.a}>
              <span className="ad">{hex4(r.a)}</span>{"  "}
              {r.bytes.map((b, k) => (
                <span key={k} className={b.changed ? "ch" : b.v === 0 ? "z" : ""}>{hex2(b.v)}{k === 7 ? "  " : " "}</span>
              ))}
              {" "}{r.bytes.map((b) => (b.v >= 32 && b.v < 127 ? String.fromCharCode(b.v) : ".")).join("")}
            </div>
          ))}
        </pre>
      </section>
    </div>
  );
}
