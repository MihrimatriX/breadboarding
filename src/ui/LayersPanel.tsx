import { useApp } from "../state/store";
import { Section } from "./Shell";

export function LayersPanel() {
  const chip = useApp((s) => s.chip);
  const visible = useApp((s) => s.layerVisible);
  const explode = useApp((s) => s.explode);
  const showT = useApp((s) => s.showTransistors);
  const bloom = useApp((s) => s.bloom);
  const st = useApp.getState();
  if (!chip) return null;
  return (
    <>
      <Section title="Katmanlar">
        <div className="layers">
          {[...chip.layers].sort((a, b) => b.level - a.level).map((l) => (
            <label key={l.id}>
              <input type="checkbox" checked={visible[l.id] !== false} onChange={(e) => st.setLayerVisible(l.id, e.target.checked)} />
              <span className="sw" style={{ background: l.color }} />
              {l.name}
            </label>
          ))}
        </div>
      </Section>
      <Section title="Görünüm">
        <div className="layers">
          <label>
            <input type="checkbox" checked={showT} onChange={(e) => st.setShowTransistors(e.target.checked)} />
            <span className="sw" style={{ background: "#4dff6a" }} />
            Transistörler
          </label>
          <label>
            <input type="checkbox" checked={bloom} onChange={(e) => st.setBloom(e.target.checked)} />
            <span className="sw" style={{ background: "#ff2a55" }} />
            Parlama
          </label>
        </div>
        <label className="speed" htmlFor="explode">
          Katmanları ayır
          <input id="explode" type="range" min={1} max={40} value={explode} onChange={(e) => st.setExplode(+e.target.value)} />
          <span>{explode}×</span>
        </label>
      </Section>
    </>
  );
}
