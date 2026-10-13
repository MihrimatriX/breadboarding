import { useState } from "react";
import { useApp } from "../state/store";
import { sim } from "../sim/SimClient";
import { h2, h4 } from "./format";
import { Section } from "./Shell";
import { useT } from "./ceviri";

/** visible: sekme gizliyken her karede 256 hücre yeniden çizilmesin (seçim ve sayfa korunur) */
export function MemoryPanel({ visible = true }: { visible?: boolean }) {
  const snap = useApp((s) => (visible ? s.snapshot : null));
  const [page, setPage] = useState<0 | 1>(0);
  const [sel, setSel] = useState<number | null>(null);
  const [val, setVal] = useState("");
  const t = useT();
  if (!snap) return null;
  const data = page === 0 ? snap.zeroPage : snap.stackPage;
  const base = page * 256;
  const ab = snap.trace.ab;
  return (
    <Section
      title={t("Bellek", "Memory")}
      actions={
        <div className="seg" role="group" aria-label={t("Bellek sayfası", "Memory page")}>
          <button className={page === 0 ? "on" : ""} aria-pressed={page === 0} onClick={() => setPage(0)}>{t("Sayfa 0", "Zero page")}</button>
          <button className={page === 1 ? "on" : ""} aria-pressed={page === 1} onClick={() => setPage(1)}>{t("Yığın $01xx", "Stack $01xx")}</button>
        </div>
      }
    >
      <div className="mem" aria-label={t(`Bellek $${h4(base)}–$${h4(base + 255)}`, `Memory $${h4(base)}–$${h4(base + 255)}`)}>
        {Array.from(data, (v, i) => [
          i % 16 === 0 && <span key={`a${i}`} className="mem-adr" aria-hidden="true">{h2(i)}</span>,
          <button
            key={i}
            className={`${base + i === ab ? "ab" : ""} ${sel === base + i ? "sel" : ""} ${page === 1 && i === snap.trace.sp ? "sp" : ""}`}
            title={`$${h4(base + i)}`}
            onClick={() => { setSel(base + i); setVal(h2(v)); }}
          >
            {h2(v)}
          </button>,
        ])}
      </div>
      <p className="legend">
        <span><i className="sw ab" /> {t("adres yolundaki bayt", "byte on the address bus")}</span>
        {page === 1 && <span><i className="sw sp" /> {t("yığın göstergesi", "stack pointer")}</span>}
        <span>{t("Bir bayta tıkla: değerini değiştir.", "Click a byte to change its value.")}</span>
      </p>
      {sel !== null && (
        <form className="row" onSubmit={(e) => { e.preventDefault(); const v = parseInt(val, 16); if (!Number.isNaN(v)) sim.poke(sel, v); }}>
          <span className="mono muted">${h4(sel)} =</span>
          <input id="pokeval" className="mono" value={val} onChange={(e) => setVal(e.target.value)} maxLength={2} style={{ width: "6ch", flex: "none" }} aria-label={t("Yeni değer (hex)", "New value (hex)")} />
          <button type="submit">{t("Yaz", "Write")}</button>
        </form>
      )}
    </Section>
  );
}
