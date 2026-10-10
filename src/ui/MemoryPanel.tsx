import { useState } from "react";
import { useApp } from "../state/store";
import { sim } from "../sim/SimClient";
import { h2, h4 } from "./format";

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
    <section>
      <div className="row between">
        <h2>Bellek</h2>
        <div className="seg">
          <button className={page === 0 ? "on" : ""} onClick={() => setPage(0)}>Sayfa 0</button>
          <button className={page === 1 ? "on" : ""} onClick={() => setPage(1)}>Yığın $01xx</button>
        </div>
      </div>
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
      {sel !== null && (
        <form className="row" onSubmit={(e) => { e.preventDefault(); const v = parseInt(val, 16); if (!Number.isNaN(v)) sim.poke(sel, v); }}>
          <span className="muted">${h4(sel)} =</span>
          <input id="pokeval" value={val} onChange={(e) => setVal(e.target.value)} maxLength={2} style={{ width: "5ch" }} />
          <button type="submit">Yaz</button>
        </form>
      )}
    </section>
  );
}
