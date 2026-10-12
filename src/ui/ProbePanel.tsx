import { useApp } from "../state/store";
import { sim } from "../sim/SimClient";
import { live } from "../state/live";
import { Section } from "./Shell";

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

/** Ölçülen sinyal: seçili düğümün adı ve seviyesi büyük, ayrıntılar ve transistörleri altında. onAnalizor: analizöre eklenince alt paneli aç. */
export function ProbePanel({ onAnalizor }: { onAnalizor?: () => void }) {
  const node = useApp((s) => s.selectedNode);
  const chip = useApp((s) => s.chip);
  const index = useApp((s) => s.index);
  const watching = useApp((s) => (node !== null ? s.watch.some((w) => w.node === node) : false));
  // her karede yeni snapshot gelir; seçici o anda canlı diziden bu düğümün bitini okur
  const high = useApp((s) => s.snapshot !== null && node !== null && liveBit(node));
  if (!chip || !index) return null;
  if (node === null)
    return (
      <Section title="Ölçülen sinyal">
        <p className="muted empty">Ölçmek için die üzerinde bir tele, poliye ya da difüzyona tıkla (ya da yukarıdan adıyla bul); ayrıntıları burada açılır.</p>
      </Section>
    );
  const names = index.namesByNode.get(node) ?? [];
  const gates = index.gatesByNode.get(node) ?? [];
  const chans = index.channelsByNode.get(node) ?? [];
  const pullup = chip.pullups.includes(node);
  return (
    <Section title="Ölçülen sinyal" actions={<button className="link" onClick={() => useApp.getState().select(null)} title="Kısayol: Esc">kapat</button>}>
      <div className="olcum-bas">
        <span className="big">{names[0] ?? "isimsiz düğüm"}</span>
        <span className={`level ${high ? "on" : ""}`}>{high ? "1 · yüksek" : "0 · alçak"}</span>
      </div>
      <dl className="kv">
        <dt>Düğüm</dt>
        <dd className="mono">#{node}</dd>
        {names.length > 1 && (
          <>
            <dt>Diğer adlar</dt>
            <dd className="mono">{names.slice(1).join(", ")}</dd>
          </>
        )}
        <dt>Poligon</dt>
        <dd>{index.segmentCount.get(node) ?? 0}{pullup ? " · pull-up yüklü" : ""}</dd>
      </dl>
      <div className="row wrap">
        <button
          onClick={() => {
            useApp.getState().toggleWatch(node);
            sim.syncWatch();
            if (!watching) onAnalizor?.();
          }}
        >
          {watching ? "Analizörden çıkar" : "Analizöre ekle"}
        </button>
        <button onClick={() => useApp.getState().select(node, true)}>Kamerayı götür</button>
      </div>
      <h3>Kapısını sürdüğü transistörler <span className="count">{gates.length}</span></h3>
      <ul className="tlist">
        {gates.slice(0, 40).map((ti) => {
          const t = chip.transistors[ti];
          return <li key={ti}><code>{t.name}</code> <NodeLink node={t.c1} /> ↔ <NodeLink node={t.c2} /></li>;
        })}
        {gates.length > 40 && <li className="muted">… ve {gates.length - 40} tane daha</li>}
      </ul>
      <h3>Kanalına bağlı transistörler <span className="count">{chans.length}</span></h3>
      <ul className="tlist">
        {chans.slice(0, 40).map((ti) => {
          const t = chip.transistors[ti];
          return <li key={ti}><code>{t.name}</code> kapı: <NodeLink node={t.gate} /></li>;
        })}
        {chans.length > 40 && <li className="muted">… ve {chans.length - 40} tane daha</li>}
      </ul>
    </Section>
  );
}
