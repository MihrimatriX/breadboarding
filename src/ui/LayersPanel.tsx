import { useApp } from "../state/store";
import { Section } from "./Shell";
import { useDil, useT } from "./ceviri";

/** Katman adları çip verisinde Türkçe (scripts/import-visual6502.mjs); İngilizcesi katman kimliğine göre */
const KATMAN_EN: Record<number, string> = {
  0: "Metal",
  1: "Diffusion",
  2: "Input diode",
  3: "GND diffusion",
  4: "VCC diffusion",
  5: "Polysilicon",
};

export function LayersPanel() {
  const chip = useApp((s) => s.chip);
  const visible = useApp((s) => s.layerVisible);
  const explode = useApp((s) => s.explode);
  const showT = useApp((s) => s.showTransistors);
  const bloom = useApp((s) => s.bloom);
  const dil = useDil();
  const t = useT();
  const st = useApp.getState();
  if (!chip) return null;
  return (
    <>
      <Section title={t("Katmanlar", "Layers")}>
        <div className="layers">
          {[...chip.layers].sort((a, b) => b.level - a.level).map((l) => (
            <label key={l.id}>
              <input type="checkbox" checked={visible[l.id] !== false} onChange={(e) => st.setLayerVisible(l.id, e.target.checked)} />
              <span className="sw" style={{ background: l.color }} />
              {dil === "en" ? KATMAN_EN[l.id] ?? l.name : l.name}
            </label>
          ))}
        </div>
      </Section>
      <Section title={t("Görünüm", "View")}>
        <div className="layers">
          <label>
            <input type="checkbox" checked={showT} onChange={(e) => st.setShowTransistors(e.target.checked)} />
            <span className="sw" style={{ background: "var(--ok)" }} />
            {t("Transistörler", "Transistors")}
          </label>
          <label>
            <input type="checkbox" checked={bloom} onChange={(e) => st.setBloom(e.target.checked)} />
            <span className="sw" style={{ background: "var(--accent)" }} />
            {t("Parlama", "Glow")}
          </label>
        </div>
        <label className="speed" htmlFor="explode">
          {t("Katmanları ayır", "Separate layers")}
          <input id="explode" type="range" min={1} max={40} value={explode} onChange={(e) => st.setExplode(+e.target.value)} />
          <span>{explode}×</span>
        </label>
      </Section>
    </>
  );
}
