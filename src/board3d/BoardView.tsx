// "CPU16 kartı" bölümü: kapı seviyesi bilgisayar 3D'de, kart → çip → kapı → transistör.

import { useEffect, useMemo, useState } from "react";
import { gateCmos } from "../../cpu16/board/inside";
import type { Gate } from "../../cpu16/chips/logic";
import { disassemble } from "../../cpu16/emu/disasm";
import { ModeSwitch } from "../ui/ModeSwitch";
import { BoardScene } from "./BoardScene";
import { CmosDiagram } from "./CmosDiagram";
import { InsideDiagram } from "./InsideDiagram";
import { LEVEL_NAME, hex4, levelOf } from "./levels";
import { PROGRAM_ORDER, SPEEDS, boardLayoutData, boardModel, liveNets, startBoardWorker, useKart } from "./store";

const LABELS: Record<string, string> = {
  hello: "hello.s · UART'a merhaba", fib: "fib.s · Fibonacci", add32: "add32.s · 32 bit toplama",
  bubble: "bubble.s · sıralama", irq: "irq.s · kesmeler",
};
const REG_NAMES = ["r0", "r1", "r2", "r3", "r4", "r5", "sp", "lr"];

function Toolbar() {
  const s = useKart();
  const st = s.state;
  return (
    <header className="toolbar">
      <div className="brand">
        <h1>Silikon3D</h1>
        <span>CPU16 kartı · 153 entegre, kapı seviyesinde</span>
      </div>
      <ModeSwitch mode="kart" />
      <div className="clock">
        <select value={s.program} onChange={(e) => s.setProgram(e.target.value)} aria-label="Program">
          {PROGRAM_ORDER.map((n) => <option key={n} value={n}>{LABELS[n] ?? n}</option>)}
        </select>
        <button onClick={() => s.step("cycle")} disabled={!s.ready} title="Kısayol: .">1 saat</button>
        <button onClick={() => s.step("instr")} disabled={!s.ready} title="Kısayol: N">1 komut</button>
        <button className="primary" onClick={() => (s.running ? s.pause() : s.run())} disabled={!s.ready} title="Kısayol: Boşluk">
          {s.running ? "Duraklat" : "Çalıştır"}
        </button>
        <button onClick={s.reset} disabled={!s.ready}>Sıfırla</button>
        <button onClick={s.raiseIrq} disabled={!s.ready} title="IRQ hattını kaldır (irq.s için)">IRQ</button>
        <label className="speed">
          Saat
          <select value={s.hz} onChange={(e) => s.setHz(+e.target.value)} aria-label="Saat hızı">
            {SPEEDS.map((x) => <option key={x.hz} value={x.hz}>{x.label}</option>)}
          </select>
        </label>
      </div>
      <div className="meter">
        <span>Döngü <b>{s.cycles.toLocaleString("tr-TR")}</b></span>
        <span>Hız <b>{s.running ? `${Math.round(s.rate).toLocaleString("tr-TR")} Hz` : "durdu"}</b></span>
        <span>PC <b>{st ? hex4(st.pc) : "-"}</b></span>
        {st?.halted && <span className="bench-status s-halt">{st.fault ? "HATA" : "HALT"}</span>}
      </div>
    </header>
  );
}

function StatePanel() {
  const st = useKart((s) => s.state);
  const uart = useKart((s) => s.uart);
  if (!st) return null;
  return (
    <section>
      <h2>CPU durumu</h2>
      <div className="regs">
        {st.regs.map((v, i) => (
          <div key={i}><b>{REG_NAMES[i]}</b><span>{hex4(v)}</span></div>
        ))}
        <div><b>PC</b><span>{hex4(st.pc)}</span></div>
        <div><b>IR</b><span>{hex4(st.ir)}</span></div>
        <div><b>Adım</b><span>{st.step}</span></div>
      </div>
      <p className="dis">{Number.isNaN(st.ir) ? "IR tanımsız" : disassemble(st.ir, (st.pc - 2) & 0xffff)}</p>
      <div className="pins">
        {(["n", "z", "c", "v", "i"] as const).map((f) => <span key={f} className={`pin ${st[f] ? "on" : ""}`}>{f.toUpperCase()}</span>)}
      </div>
      <h2>UART</h2>
      <pre className="bench-uart">{uart || "Program 0xFF00'a yazınca karakterler burada görünür"}</pre>
    </section>
  );
}

function ChipPanel() {
  const ref = useKart((s) => s.chip);
  const net = useKart((s) => s.net);
  useKart((s) => s.tick);
  const { board } = boardModel();
  const ci = ref ? board.instance(ref) : null;
  const transistors = useMemo(() => {
    if (!ci || ci.def.behavioral) return 0;
    // her kapının CMOS açılımı (cmos.ts) toplanır
    let n = 0;
    for (let g = ci.gates[0]; g < ci.gates[1]; g++) n += gateCmos(board.c.gates[g] as Gate, (x) => board.netName(x)).transistors.length;
    return n;
  }, [ci, board]);
  if (!ci) {
    return (
      <section>
        <h2>Bir entegreye tıkla</h2>
        <p className="muted">Çipin üstünde kalıbı açılır: kapılar ve teller canlı. Kapıya tıklayınca altta o kapının transistörleri görünür. Bir pine tıklamak o netin bağlı olduğu bütün pinleri gösterir.</p>
      </section>
    );
  }
  const v = liveNets.values;
  return (
    <section>
      <div className="row between">
        <h2>{ci.ref} · {ci.def.part}</h2>
        <button className="link" onClick={() => useKart.getState().selectChip(null)}>kapat</button>
      </div>
      <p className="muted small">{ci.def.title}</p>
      <p className="small">{ci.role}<br /><span className="muted">{ci.block} · {ci.card === "cpu" ? "CPU kartı" : "bellek kartı"} · {ci.def.pkg}{transistors ? ` · ${transistors} transistör` : " · davranışsal model"}</span></p>
      <div className="kpins">
        {ci.def.pins.map((p) => {
          const n = ci.nets[p.name];
          const lv = n === undefined ? 2 : levelOf(v, n);
          return (
            <button key={p.num} className={`kpin l${lv}${n === net ? " sel" : ""}`} onClick={() => n !== undefined && n > 1 && useKart.getState().selectNet(n)} title={n !== undefined ? board.netName(n) : "bağlı değil"}>
              <i>{p.num}</i>{p.name}<b>{LEVEL_NAME[lv]}</b>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function NetPanel() {
  const net = useKart((s) => s.net);
  useKart((s) => s.tick);
  const lay = boardLayoutData();
  const { board } = boardModel();
  if (net === null) return null;
  const pins = lay.chips.flatMap((c) => c.pins.filter((p) => p.net === net).map((p) => ({ ref: c.ref, part: c.part, pin: p.name })));
  const lv = levelOf(liveNets.values, net);
  return (
    <section>
      <div className="row between">
        <h2>Net {board.netName(net)} <span className={`lv l${lv}`}>{LEVEL_NAME[lv]}</span></h2>
        <button className="link" onClick={() => useKart.getState().selectNet(null)}>kapat</button>
      </div>
      <p className="muted small">{pins.length} pine bağlı. 3D'de bu pinler beyaz çizgilerle birleşir.</p>
      <ul className="tlist">
        {pins.map((p, i) => (
          <li key={i}><button className="link" onClick={() => useKart.getState().selectChip(p.ref)}>{p.ref}</button> <code>{p.part}</code> {p.pin}</li>
        ))}
      </ul>
    </section>
  );
}

function Bottom() {
  const chip = useKart((s) => s.chip);
  const gate = useKart((s) => s.gate);
  const [tab, setTab] = useState<"gates" | "fets">("gates");
  useEffect(() => setTab(gate !== null ? "fets" : "gates"), [gate]);
  const { board } = boardModel();
  if (!chip) {
    return <p className="muted pad">Kart görünümü: sürükle döndür, sağ tıkla kaydır, tekerlekle yakınlaş. Bir entegreye tıklayınca içi burada açılır.</p>;
  }
  const behavioral = !!board.instance(chip).def.behavioral;
  return (
    <div className="analyzer">
      <div className="row between">
        <div className="seg">
          <button className={tab === "gates" ? "on" : ""} onClick={() => setTab("gates")}>Kapılar · {chip}</button>
          <button className={tab === "fets" ? "on" : ""} onClick={() => setTab("fets")} disabled={gate === null}>
            Transistörler{gate !== null ? ` · ${board.c.gates[gate].kind}` : ""}
          </button>
        </div>
        <span className="muted small">
          {behavioral ? "Bellek çipleri davranışsal modeldir: iç hücreleri kapı olarak çizilmez." : "Renkler: kırmızı 1 · koyu 0 · mor Z · sarı X. Kapıya tıkla: transistörleri."}
        </span>
      </div>
      <div className="inside-wrap">
        {tab === "gates" ? <InsideDiagram refName={chip} /> : gate !== null ? <CmosDiagram gate={gate} /> : null}
      </div>
    </div>
  );
}

function Tooltip() {
  const hover = useKart((s) => s.hover);
  if (!hover) return null;
  const ci = boardModel().board.instance(hover.ref);
  return (
    <div className="tooltip" style={{ transform: `translate(${hover.x + 14}px, ${hover.y + 14}px)` }}>
      <b>{ci.ref}</b> {ci.def.part} <span>{ci.role}</span>
    </div>
  );
}

export function BoardView() {
  const ready = useKart((s) => s.ready);
  const error = useKart((s) => s.error);
  useEffect(() => {
    startBoardWorker();
    installKartApi();
    // bölümden çıkınca simülasyon durur (worker ve kart durumu korunur)
    return () => useKart.getState().pause();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      const s = useKart.getState();
      if (e.key === " ") { e.preventDefault(); s.running ? s.pause() : s.run(); }
      else if (e.key === ".") s.step("cycle");
      else if (e.key === "n" || e.key === "N") s.step("instr");
      else if (e.key === "Escape") s.gate !== null ? s.selectGate(null) : s.selectChip(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="app kart">
      <Toolbar />
      <main className="stage">
        <BoardScene />
        {!ready && !error && <div className="overlay">Kart kuruluyor…</div>}
        {error && <div className="overlay warn">{error}</div>}
      </main>
      <aside className="side">
        <StatePanel />
        <ChipPanel />
        <NetPanel />
      </aside>
      <section className="bottom">
        <Bottom />
      </section>
      <Tooltip />
    </div>
  );
}

/** Tarayıcı konsolundan ve otomatik testlerden kullanım: kart.secCip("U12") vb. */
function installKartApi() {
  const api = {
    durum: () => useKart.getState().state,
    uart: () => useKart.getState().uart,
    calistir: () => useKart.getState().run(),
    duraklat: () => useKart.getState().pause(),
    adim: (mode: "cycle" | "instr" = "instr") => useKart.getState().step(mode),
    hiz: (hz: number) => useKart.getState().setHz(hz),
    program: (name: string) => useKart.getState().setProgram(name),
    secCip: (ref: string | null) => useKart.getState().selectChip(ref),
    secKapi: (g: number | null) => useKart.getState().selectGate(g),
    secNet: (name: string) => useKart.getState().selectNet(boardModel().board.n(name)),
    cipler: () => boardModel().board.chips.map((c) => `${c.ref} ${c.def.part} · ${c.role}`),
    kapilar: (ref: string) => {
      const ci = boardModel().board.instance(ref);
      return Array.from({ length: ci.gates[1] - ci.gates[0] }, (_, i) => `${ci.gates[0] + i} ${boardModel().board.c.gates[ci.gates[0] + i].kind}`);
    },
  };
  (window as unknown as { kart: typeof api }).kart = api;
}
