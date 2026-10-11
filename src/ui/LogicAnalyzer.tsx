import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/store";
import { sim } from "../sim/SimClient";
import { disassemble } from "../sim/asm6502";
import { flags, h2, h4 } from "./format";
import { Tabs, type TabDef } from "./Shell";

type AnalyzerTab = "wave" | "trace";
const TABS: TabDef<AnalyzerTab>[] = [
  { id: "wave", label: "Dalga formu" },
  { id: "trace", label: "İz tablosu" },
];

/** visual6502 expert'teki iz tablosu + seçilen sinyallerin dalga formu */
export function LogicAnalyzer() {
  const [tab, setTab] = useState<AnalyzerTab>("wave");
  return (
    <div className="analyzer">
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Mantık analizörü" actions={<Watched />} />
      <div className="analyzer-body" role="tabpanel">{tab === "wave" ? <Waveforms /> : <TraceTable />}</div>
    </div>
  );
}

/** İzlenen sinyaller: sekme çubuğunun sağında, tıklayınca analizörden çıkar */
function Watched() {
  const watch = useApp((s) => s.watch);
  const index = useApp((s) => s.index);
  if (watch.length === 0) return <span className="hint-text">Ölçtüğün sinyali "Analizöre ekle" ile buraya al.</span>;
  return (
    <div className="row chips" aria-label="İzlenen sinyaller">
      <span className="hint-text">İzlenen</span>
      {watch.map((w) => (
        <button key={w.node} className="chip" onClick={() => { useApp.getState().toggleWatch(w.node); sim.syncWatch(); }} title="Analizörden çıkar">
          {index?.namesByNode.get(w.node)?.[0] ?? `#${w.node}`} <span aria-hidden="true">✕</span>
        </button>
      ))}
    </div>
  );
}

function TraceTable() {
  const rows = useApp((s) => s.rows);
  const snap = useApp((s) => s.snapshot);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows]);
  const read = (a: number) => (!snap ? 0 : a < 256 ? snap.zeroPage[a] : a < 512 ? snap.stackPage[a - 256] : 0);
  return (
    <div className="trace" ref={ref}>
      <table>
        <thead>
          <tr><th>½çevrim</th><th>ab</th><th>db</th><th>rw</th><th>sync</th><th>pc</th><th>a</th><th>x</th><th>y</th><th>s</th><th>p</th><th>komut</th></tr>
        </thead>
        <tbody>
          {rows.slice(-120).map((r) => (
            <tr key={r.halfCycle} className={r.sync ? "fetch" : ""}>
              <td>{r.halfCycle}</td><td>{h4(r.ab)}</td><td>{h2(r.db)}</td><td>{r.rw ? 1 : 0}</td><td>{r.sync ? 1 : 0}</td>
              <td>{h4(r.pc)}</td><td>{h2(r.a)}</td><td>{h2(r.x)}</td><td>{h2(r.y)}</td><td>{h2(r.sp)}</td><td>{flags(r.p)}</td>
              <td>{r.sync && r.rw ? disassemble(read, r.ab).text : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted pad">Çalıştır ya da adım at; her yarım çevrim burada bir satır olur.</p>}
    </div>
  );
}

function Waveforms() {
  const watch = useApp((s) => s.watch);
  const index = useApp((s) => s.index);
  const canvas = useRef<HTMLCanvasElement>(null);
  // panel genişliği değişince (yan panel açılıp kapanınca) yeniden çiz
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ro = new ResizeObserver(() => setWidth(c.clientWidth));
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    const css = getComputedStyle(c);
    const lane = 26, labelW = 96, n = 128;
    const step = (w - labelW - 8) / n;
    g.font = `12px ${css.getPropertyValue("--mono")}`;
    // ızgara: her tam çevrim
    g.strokeStyle = css.getPropertyValue("--wave-grid");
    for (let i = 0; i <= n; i += 2) {
      g.beginPath(); g.moveTo(labelW + i * step, 0); g.lineTo(labelW + i * step, h); g.stroke();
    }
    watch.forEach((tr, li) => {
      const y0 = 8 + li * lane, hi = y0 + 2, lo = y0 + lane - 8;
      g.fillStyle = css.getPropertyValue("--text");
      g.fillText(index?.namesByNode.get(tr.node)?.[0] ?? `#${tr.node}`, 8, lo);
      const s = tr.samples.slice(-n);
      const x0 = labelW + (n - s.length) * step;
      g.strokeStyle = css.getPropertyValue("--accent");
      g.lineWidth = 1.6;
      g.beginPath();
      s.forEach((v, i) => {
        const x = x0 + i * step, y = v ? hi : lo;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
        g.lineTo(x + step, y);
      });
      g.stroke();
      g.lineWidth = 1;
    });
    if (watch.length === 0) {
      g.fillStyle = css.getPropertyValue("--text-muted");
      g.fillText("İzlenen sinyal yok. Die üzerinde bir düğüm seçip \"Analizöre ekle\"ye bas.", 12, 24);
    }
  }, [watch, index, width]);

  return (
    <div className="wave">
      <canvas ref={canvas} style={{ height: Math.max(60, watch.length * 26 + 16) }} />
    </div>
  );
}
