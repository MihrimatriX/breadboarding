import { useState } from "react";
import { useApp } from "../state/store";
import { Section } from "./Shell";
import { useT } from "./ceviri";

/** visual6502'deki "find" gibi: sinyal adını yaz, die üzerinde bul ve oraya uç */
export function SignalSearch() {
  const index = useApp((s) => s.index);
  const chip = useApp((s) => s.chip);
  const [q, setQ] = useState("");
  /** bulunamayan arama (ileti çizilirken seçili dilde yazılır) */
  const [yok, setYok] = useState<string | null>(null);
  const t = useT();
  if (!index || !chip) return null;
  const go = () => {
    const key = q.trim();
    const node = /^#?\d+$/.test(key) ? +key.replace("#", "") : chip.nodeNames[key];
    if (node === undefined || node < 0 || node >= chip.nodeCount) {
      setYok(key);
      return;
    }
    setYok(null);
    useApp.getState().select(node, true);
  };
  return (
    <Section title={t("Sinyal bul", "Find signal")}>
      <form className="row" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input id="signal" className="mono" list="signals" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ör. clk0, ab5, 1234", "e.g. clk0, ab5, 1234")} aria-label={t("Sinyal adı ya da düğüm numarası", "Signal name or node number")} />
        <button type="submit">{t("Bul", "Find")}</button>
      </form>
      <datalist id="signals">
        {index.signalNames.map((n) => <option key={n} value={n} />)}
      </datalist>
      {yok !== null && <p className="warn">{t(`'${yok}' bulunamadı`, `'${yok}' not found`)}</p>}
    </Section>
  );
}
