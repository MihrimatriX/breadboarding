import { useApp } from "../state/store";
import { sim } from "../sim/SimClient";
import { live } from "../state/live";

const liveBit = (node: number) => (live.nodeState ? live.nodeState[node] === 1 : false);

function NodeLink({ node }: { node: number }) {
  const index = useApp((s) => s.index)!;
  const chip = useApp((s) => s.chip)!;
  if (node === chip.gnd) return <span className="rail gnd">GND</span>;
  if (node === chip.vcc) return <span className="rail vcc">VCC</span>;
  const name = index.namesByNode.get(node)?.[0];
  return (
    <button className="link" onClick={() => useApp.getState().select(node, true)}>
      {name ?? `#${node}`}
    </button>
  );
}

export function ProbePanel() {
  const node = useApp((s) => s.selectedNode);
  const chip = useApp((s) => s.chip);
  const index = useApp((s) => s.index);
  const watching = useApp((s) => (node !== null ? s.watch.some((w) => w.node === node) : false));
  // durum her karede değişebilir; yalnızca bu düğümün bitine abone ol
  // her karede yeni snapshot gelir; seçici o anda canlı diziden bu düğümün bitini okur
  const high = useApp((s) => s.snapshot !== null && node !== null && liveBit(node));
  if (!chip || !index) return null;
  if (node === null)
    return (
      <section>
        <h2>Ölçülen sinyal</h2>
        <p className="muted">Die üzerinde bir metal tele, poliye ya da difüzyona tıkla. Seçilen düğüm beyaz yanıp söner; transistörlerine buradan gezinebilirsin.</p>
      </section>
    );
  const names = index.namesByNode.get(node) ?? [];
  const gates = index.gatesByNode.get(node) ?? [];
  const chans = index.channelsByNode.get(node) ?? [];
  const pullup = chip.pullups.includes(node);
  return (
    <section>
      <h2>Ölçülen sinyal</h2>
      <div className="probe">
        <div className="probe-head">
          <span className="big">{names[0] ?? "isimsiz düğüm"}</span>
          <span className={`level ${high ? "on" : ""}`}>{high ? "1 · YÜKSEK" : "0 · ALÇAK"}</span>
        </div>
        <span className="muted">
          Düğüm #{node}{names.length > 1 ? ` · diğer adlar: ${names.slice(1).join(", ")}` : ""} · {index.segmentCount.get(node) ?? 0} poligon{pullup ? " · pull-up yüklü" : ""}
        </span>
        <div className="row">
          <button onClick={() => { useApp.getState().toggleWatch(node); sim.syncWatch(); }}>
            {watching ? "Analizörden çıkar" : "Analizöre ekle"}
          </button>
          <button onClick={() => useApp.getState().select(node, true)}>Kamerayı götür</button>
        </div>
        <h3>Kapısını sürdüğü transistörler ({gates.length})</h3>
        <ul className="tlist">
          {gates.slice(0, 40).map((ti) => {
            const t = chip.transistors[ti];
            return <li key={ti}><code>{t.name}</code> <NodeLink node={t.c1} /> ↔ <NodeLink node={t.c2} /></li>;
          })}
          {gates.length > 40 && <li className="muted">… ve {gates.length - 40} tane daha</li>}
        </ul>
        <h3>Kanalına bağlı transistörler ({chans.length})</h3>
        <ul className="tlist">
          {chans.slice(0, 40).map((ti) => {
            const t = chip.transistors[ti];
            return <li key={ti}><code>{t.name}</code> kapı: <NodeLink node={t.gate} /></li>;
          })}
          {chans.length > 40 && <li className="muted">… ve {chans.length - 40} tane daha</li>}
        </ul>
      </div>
    </section>
  );
}

