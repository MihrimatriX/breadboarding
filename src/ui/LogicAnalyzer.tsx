import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/store";
import { sim } from "../sim/SimClient";
import { disassemble } from "../sim/asm6502";
import { flags, h2, h4 } from "./format";
import { Tabs, type TabDef } from "./Shell";
import { useAyar } from "./ayarlar";
import { useT } from "./ceviri";

type AnalyzerTab = "wave" | "trace";
const TABS: TabDef<AnalyzerTab>[] = [
  { id: "wave", label: { tr: "Dalga formu", en: "Waveform" } },
  { id: "trace", label: { tr: "İz tablosu", en: "Trace table" } },
];

/** visual6502 expert'teki iz tablosu + seçilen sinyallerin dalga formu */
export function LogicAnalyzer() {
  const [tab, setTab] = useState<AnalyzerTab>("wave");
  const t = useT();
  return (
    <div className="analyzer">
      <Tabs tabs={TABS} value={tab} onChange={setTab} label={t("Mantık analizörü", "Logic analyzer")} actions={<Watched />} />
      <div className="analyzer-body" role="tabpanel">{tab === "wave" ? <Waveforms /> : <TraceTable />}</div>
    </div>
  );
}

/** İzlenen sinyaller: sekme çubuğunun sağında, tıklayınca analizörden çıkar */
function Watched() {
  const watch = useApp((s) => s.watch);
  const index = useApp((s) => s.index);
  const t = useT();
  if (watch.length === 0) return <span className="hint-text">{t('Ölçtüğün sinyali "Analizöre ekle" ile buraya al.', 'Probe a signal and press "Add to analyzer" to bring it here.')}</span>;
  return (
    <div className="row chips" role="group" aria-label={t("İzlenen sinyaller", "Watched signals")}>
      <span className="hint-text">{t("İzlenen", "Watching")}</span>
      {watch.map((w) => {
        const ad = index?.namesByNode.get(w.node)?.[0] ?? `#${w.node}`;
        return (
          <button key={w.node} className="chip" onClick={() => { useApp.getState().toggleWatch(w.node); sim.syncWatch(); }} title={t("Analizörden çıkar", "Remove from analyzer")} aria-label={t(`${ad}: analizörden çıkar`, `${ad}: remove from analyzer`)}>
            {ad} <span aria-hidden="true">×</span>
          </button>
        );
      })}
    </div>
  );
}

function TraceTable() {
  const rows = useApp((s) => s.rows);
  const snap = useApp((s) => s.snapshot);
  const t = useT();
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
          <tr><th>{t("½ çevrim", "½ cycle")}</th><th>{t("Adres", "Address")}</th><th>{t("Veri", "Data")}</th><th>R/W</th><th>Sync</th><th>PC</th><th>A</th><th>X</th><th>Y</th><th>SP</th><th>P</th><th>{t("Komut", "Instruction")}</th></tr>
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
      {rows.length === 0 && <p className="muted pad">{t("Çalıştır ya da adım at; her yarım çevrim burada bir satır olur.", "Run or step; each half cycle adds a row here.")}</p>}
    </div>
  );
}

/** Kök yazı boyutu (yazı boyutu ayarı: normal 16, büyük 18): tuvaldeki şeritler de onunla büyür */
const kokPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

function Waveforms() {
  const watch = useApp((s) => s.watch);
  const index = useApp((s) => s.index);
  const tema = useAyar((s) => s.tema);
  const boyut = useAyar((s) => s.boyut);
  const t = useT();
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
  const k = kokPx() / 16;
  const lane = Math.round(34 * k);

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
    const labelW = Math.round(104 * k), n = 128;
    const step = (w - labelW - 8) / n;
    const font = Math.round(14 * k);
    g.font = `500 ${font}px ${css.getPropertyValue("--mono")}`;
    g.textBaseline = "middle";
    // ızgara: her tam çevrim
    g.strokeStyle = css.getPropertyValue("--wave-grid");
    g.lineWidth = 1;
    for (let i = 0; i <= n; i += 2) {
      const x = Math.round(labelW + i * step) + 0.5;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    }
    const dalga = css.getPropertyValue("--wave");
    watch.forEach((tr, li) => {
      const y0 = 10 * k + li * lane, hi = y0 + 4 * k, lo = y0 + lane - 10 * k;
      g.fillStyle = css.getPropertyValue("--text-muted");
      g.fillText(index?.namesByNode.get(tr.node)?.[0] ?? `#${tr.node}`, 4, (hi + lo) / 2);
      const s = tr.samples.slice(-n);
      const x0 = labelW + (n - s.length) * step;
      // yüksek bölümlerin altı hafifçe dolu: 1 ile 0 bir bakışta ayrılır
      g.globalAlpha = 0.12;
      g.fillStyle = dalga;
      s.forEach((v, i) => {
        if (v) g.fillRect(x0 + i * step, hi, step, lo - hi);
      });
      g.globalAlpha = 1;
      g.strokeStyle = dalga;
      g.lineWidth = 2;
      g.lineJoin = "round";
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
      g.font = `400 ${font}px ${css.getPropertyValue("--sans")}`;
      g.fillStyle = css.getPropertyValue("--text-muted");
      g.fillText(t('İzlenen sinyal yok: die üzerinde bir düğüm seç, "Analizöre ekle"ye bas.', 'No signals watched: select a node on the die and press "Add to analyzer".'), 4, 20 * k);
    }
  }, [watch, index, width, tema, boyut, k, lane, t]);

  return (
    <div className="wave">
      <canvas ref={canvas} style={{ height: Math.max(56 * k, watch.length * lane + 16 * k) }} />
    </div>
  );
}
