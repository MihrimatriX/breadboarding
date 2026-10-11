import { useState } from "react";
import { useApp } from "../state/store";
import { sim } from "../sim/SimClient";
import { h2, h4 } from "./format";
import { Section } from "./Shell";

export function MemoryPanel() {
  const snap = useApp((s) => s.snapshot);
  const [page, setPage] = useState<0 | 1>(0);
  const [sel, setSel] = useState<number | null>(null);
  const [val, setVal] = useState("");
  if (!snap) return null;
  const data = page === 0 ? snap.zeroPage : snap.stackPage;
  const base = page * 256;
  const ab = snap.trace.ab;
  return (
    <Section
      title="Bellek"
      actions={
        <div className="seg" role="group" aria-label="Bellek sayfası">
          <button className={page === 0 ? "on" : ""} aria-pressed={page === 0} onClick={() => setPage(0)}>Sayfa 0</button>
          <button className={page === 1 ? "on" : ""} aria-pressed={page === 1} onClick={() => setPage(1)}>Yığın $01xx</button>
        </div>
      }
    >
      <div className="mem">
        {Array.from(data, (v, i) => (
          <button
            key={i}
            className={`${base + i === ab ? "ab" : ""} ${sel === base + i ? "sel" : ""} ${page === 1 && i === snap.trace.sp ? "sp" : ""}`}
            title={`$${h4(base + i)}`}
            onClick={() => { setSel(base + i); setVal(h2(v)); }}
          >
            {h2(v)}
          </button>
        ))}
      </div>
      <p className="legend">
        <span><i className="sw ab" /> adres yolundaki bayt</span>
        {page === 1 && <span><i className="sw sp" /> yığın göstergesi</span>}
        <span>Bir bayta tıkla: değerini değiştir.</span>
      </p>
      {sel !== null && (
        <form className="row" onSubmit={(e) => { e.preventDefault(); const v = parseInt(val, 16); if (!Number.isNaN(v)) sim.poke(sel, v); }}>
          <span className="mono muted">${h4(sel)} =</span>
          <input id="pokeval" value={val} onChange={(e) => setVal(e.target.value)} maxLength={2} style={{ width: "6ch", flex: "none" }} aria-label="Yeni değer (hex)" />
          <button type="submit">Yaz</button>
        </form>
      )}
    </Section>
  );
}
