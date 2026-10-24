// CPU16 tezgâhı, düz bellek kipi (Faz 1): as16 ya da cc16 (C, ROM hedefi) ile derle, 64 KB düz
// RAM'li referans emülatörde (SimpleBus) adım adım çalıştır. Faz 1 örnek programları bu kipte çalışır.
// Motor cpu16/ klasöründe; bu dosya sadece Silikon3D arayüzüne bağlar.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { assemble } from "../../cpu16/asm/assembler";
import { buildProgram } from "../../cpu16/cc/index";
import { LIB } from "../../cpu16/cc/lib-vite";
import { Cpu16, SimpleBus, type StepResult } from "../../cpu16/emu/cpu";
import { disassemble } from "../../cpu16/emu/disasm";
import { sec, useDil, useT, type IkiDil } from "../ui/ceviri";
import { AppHeader, Bayrak, Group, Meter, OdakDugmesi, PanelToggle, Section, Tabs, TasmaMenusu, YanBolucu, duzenStili, useLayout, usePaneller, type Shortcut, type TabDef } from "../ui/Shell";
import { Simge } from "../ui/simgeler";
import { dilBul, ornekDili, type Dil } from "./dil";
import { KodAlani } from "./KodAlani";

const sources = import.meta.glob("../../cpu16/programs/*.{s,c}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
/** Örnekler: assembly dosyaları uzantısız ("fib"), C dosyaları uzantılı ("merhaba.c") anahtarla */
const PROGRAMS = Object.fromEntries(Object.entries(sources).map(([p, s]) => [p.split("/").pop()!.replace(/\.s$/, ""), s]));
const ORDER = ["hello", "fib", "add32", "bubble", "irq", "merhaba.c"].filter((n) => n in PROGRAMS);
const LABELS: Record<string, IkiDil> = {
  hello: { tr: "hello.s · UART'a merhaba", en: "hello.s · hello over UART" },
  fib: { tr: "fib.s · Fibonacci", en: "fib.s · Fibonacci" },
  add32: { tr: "add32.s · 32 bit + yazılımla çarpma", en: "add32.s · 32-bit add + software multiply" },
  bubble: { tr: "bubble.s · sıralama", en: "bubble.s · sorting" },
  irq: { tr: "irq.s · kesmeler", en: "irq.s · interrupts" },
  "merhaba.c": { tr: "merhaba.c · C: printf ve özyineleme", en: "merhaba.c · C: printf and recursion" },
};

/** Derleyici hatası: sütun yalnız cc16'dan gelir; ileti cpu16/asm ve cpu16/cc'den Türkçe */
type Hata = { line: number; col?: number; message: string };

/** Kaynağı derler: assembly as16 ile, C cc16 ile (ROM hedefi: 0x0000'dan kendi vektörleriyle) */
function compileSource(text: string, lang: Dil) {
  if (lang === "asm") return assemble(text);
  const b = buildProgram({ "/program.c": text }, ["/program.c"], { lib: LIB });
  return {
    image: b.image,
    ranges: b.ranges,
    symbols: b.symbols,
    errors: b.errors.map((e): Hata => ({ line: e.line, col: e.col || undefined, message: e.message })),
  };
}
const MEMDEFAULT: Record<string, number> = { hello: 0x0000 };
const REG_NAMES = ["r0", "r1", "r2", "r3", "r4", "r5", "r6 sp", "r7 lr"];

type SideTab = "durum" | "bellek";
const SIDE_TABS: { id: SideTab; label: IkiDil; title: IkiDil }[] = [
  { id: "durum", label: { tr: "Durum", en: "Status" }, title: { tr: "Register'lar, UART çıkışı, komut izi", en: "Registers, UART output, instruction trace" } },
  { id: "bellek", label: { tr: "Bellek", en: "Memory" }, title: { tr: "Bellek dökümü", en: "Memory dump" } },
];

const hex4 = (n: number) => (n & 0xffff).toString(16).toUpperCase().padStart(4, "0");
const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");

interface Machine {
  cpu: Cpu16;
  bus: SimpleBus;
}

/** Durum ve bilgi metinleri iki dilli saklanır: dil sonradan değişince de doğru dilde görünsün */
type Status = { kind: "idle" | "run" | "halt" | "bad"; text: IkiDil };
const HAZIR: IkiDil = { tr: "hazır", en: "ready" };
const haltDurumu = (i: boolean): Status => ({ kind: "halt", text: i ? { tr: "HALT · kesme bekliyor", en: "HALT · waiting for interrupt" } : { tr: "HALT", en: "HALT" } });

export function FlatBench({ switcher }: { switcher: ReactNode }) {
  const t = useT();
  const dil = useDil();
  const yer = dil === "en" ? "en-US" : "tr-TR";
  const [prog, setProg] = useState(ORDER[0]);
  const [src, setSrc] = useState(PROGRAMS[ORDER[0]]);
  /** Editördeki dil: örnekten gelir, yazdıkça içerikten tahmin edilir; elle seçilirse o kalır */
  const [lang, setLang] = useState<Dil>(ornekDili(ORDER[0]));
  const langManual = useRef(false);
  const [errors, setErrors] = useState<Hata[]>([]);
  const [info, setInfo] = useState<IkiDil>({ tr: "", en: "" });
  const [status, setStatus] = useState<Status>({ kind: "idle", text: HAZIR });
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
  const panel = usePaneller(lay);

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
      setStatus(haltDurumu(cpu.i));
      stop();
    } else if (r === "illegal") {
      const a = hex4(cpu.illegalAt ?? 0);
      setStatus({ kind: "bad", text: { tr: `yasadışı komut @ ${a}`, en: `illegal instruction @ ${a}` } });
      stop();
    }
  };

  const build = useCallback((text: string, lang: Dil, autorun = false) => {
    stop();
    const res = compileSource(text, lang);
    setErrors(res.errors);
    if (res.errors.length) {
      m.current = null;
      setInfo({ tr: "Derleme başarısız; hataları düzeltip tekrar derle.", en: "Compile failed. Fix the errors and compile again." });
      setStatus({ kind: "bad", text: { tr: "derleme hatası", en: "compile error" } });
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
    const n = res.symbols.size;
    setInfo({ tr: `${size} bayt, ${n} sembol. Yüklendi; Adım veya Çalıştır'a bas.`, en: `${size} bytes, ${n} symbols. Loaded: press Step or Run.` });
    setStatus({ kind: "idle", text: HAZIR });
    if (autorun) {
      snapshot();
      const r = cpu.run(10_000);
      if (r !== "ok") setStatus(r === "halted" ? haltDurumu(cpu.i) : { kind: "bad", text: { tr: "yasadışı komut", en: "illegal instruction" } });
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
    setStatus({ kind: "run", text: { tr: "çalışıyor", en: "running" } });
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
    setStatus({ kind: "idle", text: { tr: "duraklatıldı", en: "paused" } });
  };

  const raiseIrq = () => {
    const cpu = m.current?.cpu;
    if (!cpu) return;
    cpu.irq = true;
    irqPending.current = true;
    if (cpu.halted && cpu.i) run();
    else if (!cpu.i) {
      setInfo({
        tr: "IRQ hattı kalktı, ama kesmeler kapalı (I=0); program EI çalıştırınca alınacak.",
        en: "The IRQ line is up, but interrupts are disabled (I=0). The CPU takes it once the program runs EI.",
      });
    }
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

  const shortcuts: Shortcut[] = [{ keys: "Ctrl+Enter", what: t("Düzenleyicide: derleyip yükler", "In the editor: compile and load") }];
  const sideTabs: TabDef<SideTab>[] = SIDE_TABS.map((x) => ({ id: x.id, label: sec(x.label, dil), title: sec(x.title, dil) }));

  return (
    <div className="bench bench-flat shell" data-side={panel.side ? "open" : "closed"} style={duzenStili(lay)}>
      <AppHeader
        mode="cpu16"
        context={t("CPU16 · düz bellek (64 KB RAM)", "CPU16 · flat memory (64 KB RAM)")}
        shortcuts={shortcuts}
        meters={
          <>
            <Meter label={t("Komut", "Instructions")}>{cpu ? cpu.instructions.toLocaleString(yer) : "-"}</Meter>
            <Meter label="PC" mono>{cpu ? hex4(cpu.pc) : "-"}</Meter>
          </>
        }
      />
      <div className="toolbar">
        <Group label={t("Çalıştırma", "Execution")}>
          <button className="primary" onClick={running ? pause : run} disabled={!cpu}>
            <Simge ad={running ? "duraklat" : "oynat"} />
            {running ? t("Durdur", "Pause") : t("Çalıştır", "Run")}
          </button>
          <button onClick={step} disabled={!cpu || running} title={t("Bir komut çalıştır", "Run one instruction")}><Simge ad="adim" />{t("Adım", "Step")}</button>
          <button onClick={() => build(src, lang)} title={t("Programı yeniden yükle, CPU'yu sıfırla", "Reload the program and reset the CPU")}><Simge ad="sifirla" />{t("Sıfırla", "Reset")}</button>
          <TasmaMenusu title={t("Diğer: kesme", "More: interrupt")}>
            <button onClick={raiseIrq} disabled={!cpu} title={t("IRQ hattını kaldır (irq.s örneği için)", "Raise the IRQ line (for the irq.s example)")}>{t("IRQ hattını kaldır", "Raise the IRQ line")}</button>
          </TasmaMenusu>
        </Group>
        <Group label={t("Durum", "Status")}>
          <span className={`bench-status s-${status.kind}`} role="status">{sec(status.text, dil)}</span>
        </Group>
        <Group label={t("Kip", "Mode")}>
          <span className="tb-label kisalir">{t("Makine", "Machine")}</span>
          {switcher}
        </Group>
        <Group label={t("Paneller", "Panels")} className="tb-end">
          <PanelToggle which="side" open={lay.side} onToggle={() => setLay({ side: !lay.side })} />
          <OdakDugmesi />
        </Group>
      </div>

      <div className="workspace">
        <section className="bench-main">
          <div className="bench-src panel fill">
            <div className="panel-head">
              <h2>{t("Kaynak", "Source")}</h2>
              <select id="cpu16-prog" value={prog} onChange={(e) => pick(e.target.value)} aria-label={t("Örnek program", "Example program")}>
                {ORDER.map((n) => <option key={n} value={n}>{LABELS[n] ? sec(LABELS[n], dil) : n}</option>)}
              </select>
              <div className="seg" role="group" aria-label={t("Dil", "Language")}>
                <button className={lang === "asm" ? "on" : ""} aria-pressed={lang === "asm"} onClick={() => chooseLang("asm")} title={t("as16 ile derlenir", "Assembled with as16")}>Assembly</button>
                <button className={lang === "c" ? "on" : ""} aria-pressed={lang === "c"} onClick={() => chooseLang("c")} title={t("cc16 C derleyicisiyle derlenir (ROM hedefi)", "Compiled with the cc16 C compiler (ROM target)")}>C</button>
              </div>
              <span className="hint-text grow">
                {lang === "c" ? t("cc16 · program 0x0000'dan; printf UART'a yazar", "cc16 · program at 0x0000; printf writes to UART") : t("as16 ile derlenir", "built with as16")}
              </span>
              <button className="primary" onClick={() => build(src, lang)} title="Ctrl+Enter"><Simge ad="yukle" />{t("Derle ve yükle", "Compile and load")}</button>
            </div>
            <KodAlani
              id="cpu16-src"
              value={src}
              dil={lang}
              hataliSatirlar={errors.map((e) => e.line)}
              aria-label={lang === "c" ? t("C kaynak kodu", "C source code") : t("Assembly kaynak kodu", "Assembly source code")}
              onChange={(e) => edit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); build(src, lang); }
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
          </div>
        </section>

        {panel.side && <YanBolucu lay={lay} setLay={setLay} />}
        {panel.side && (
          <aside className="bench-panel side" aria-label={t("Makine durumu", "Machine state")}>
            <Tabs tabs={sideTabs} value={sideTab} onChange={(s) => setLay({ sideTab: s })} label={t("Yan panel", "Side panel")} />
            <div className="side-body" role="tabpanel" hidden={sideTab !== "durum"}>
              <Section title={t("Register'lar", "Registers")} actions={!running && <span className="hint-text">{t("sarı: son adımda değişen", "yellow: changed in the last step")}</span>}>
                {cpu ? (
                  <>
                    <div className="kahraman">
                      <span className="k-ad">PC</span>
                      <span className="k-deger">{hex4(cpu.pc)}</span>
                      <span className="k-ek">{trace.find((t) => t.cur)?.text ?? ""}</span>
                    </div>
                    <div className="bench-regs">
                      {REG_NAMES.map((n, i) => [n, cpu.regs[i], cpu.regs[i] !== prevRegs.current[i]] as const).map(([n, v, ch]) => (
                        <div key={n} className={ch ? "changed" : ""}>
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
                  </>
                ) : (
                  <p className="muted">
                    {t('Program derlenemedi: kaynaktaki hataları düzeltip "Derle ve yükle"ye bas.', 'The program did not compile: fix the errors in the source and press "Compile and load".')}
                  </p>
                )}
              </Section>

              <Section title={t("UART çıkışı", "UART output")}>
                <pre className="bench-uart">
                  {bus?.output || (
                    <span className="uart-bos">{t("UART boş: programın 0xFF00'a yazdığı baytlar burada görünür.", "UART is empty: bytes the program writes to 0xFF00 show up here.")}</span>
                  )}
                </pre>
              </Section>

              <Section title={t("Komut izi", "Instruction trace")}>
                <div className="bench-trace">
                  {trace.map((t) => (
                    <div key={t.a} className={t.cur ? "cur" : ""}><span>{hex4(t.a)}</span><span>{hex4(t.w)}</span><span>{t.text}</span></div>
                  ))}
                </div>
              </Section>
            </div>

            <div className="side-body" role="tabpanel" hidden={sideTab !== "bellek"}>
              <Section
                title={t("Bellek", "Memory")}
                actions={<input id="cpu16-mem" className="addr" value={memAddr} onChange={(e) => setMemAddr(e.target.value)} size={6} aria-label={t("Bellek başlangıç adresi (hex)", "Memory start address (hex)")} />}
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
                <p className="legend"><span><i className="sw ch" /> {t("son adımda değişen bayt", "byte changed in the last step")}</span></p>
              </Section>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
