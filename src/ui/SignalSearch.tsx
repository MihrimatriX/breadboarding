import { useState } from "react";
import { useApp } from "../state/store";
import { Section } from "./Shell";

/** visual6502'deki "find" gibi: sinyal adını yaz, die üzerinde bul ve oraya uç */
export function SignalSearch() {
  const index = useApp((s) => s.index);
  const chip = useApp((s) => s.chip);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  if (!index || !chip) return null;
  const go = () => {
    const key = q.trim();
    const node = /^#?\d+$/.test(key) ? +key.replace("#", "") : chip.nodeNames[key];
    if (node === undefined || node < 0 || node >= chip.nodeCount) {
      setErr(`'${key}' bulunamadı`);
      return;
    }
    setErr("");
    useApp.getState().select(node, true);
  };
  return (
    <Section title="Sinyal bul">
      <form className="row" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input id="signal" className="mono" list="signals" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ör. clk0, ab5, a3, alu2, 1234" aria-label="Sinyal adı ya da düğüm numarası" />
        <button type="submit">Bul</button>
      </form>
      <datalist id="signals">
        {index.signalNames.map((n) => <option key={n} value={n} />)}
      </datalist>
      {err && <p className="warn">{err}</p>}
    </Section>
  );
}
