import { useApp } from "../state/store";
import { sim } from "../sim/SimClient";
import { live } from "../state/live";
import { Section } from "./Shell";
import { useT } from "./ceviri";

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
  const t = useT();
  if (!chip || !index) return null;
  if (node === null)
    return (
      <Section title={t("Ölçülen sinyal", "Probed signal")}>
        <p className="muted empty">
          {t(
            "Ölçmek için die üzerinde bir tele, poliye ya da difüzyona tıkla (ya da yukarıdan adıyla bul); ayrıntıları burada açılır.",
            "To probe, click a metal wire, polysilicon or diffusion on the die (or find it by name above). Its details open here.",
          )}
        </p>
      </Section>
    );
  const names = index.namesByNode.get(node) ?? [];
  const gates = index.gatesByNode.get(node) ?? [];
  const chans = index.channelsByNode.get(node) ?? [];
  const pullup = chip.pullups.includes(node);
  return (
    <Section title={t("Ölçülen sinyal", "Probed signal")} actions={<button className="link" onClick={() => useApp.getState().select(null)} title={t("Kısayol: Esc", "Shortcut: Esc")}>{t("kapat", "close")}</button>}>
      <div className="olcum-bas">
        <span className="big">{names[0] ?? t("isimsiz düğüm", "unnamed node")}</span>
        <span className={`level ${high ? "on" : ""}`}>{high ? t("1 · yüksek", "1 · high") : t("0 · alçak", "0 · low")}</span>
      </div>
      <dl className="kv">
        <dt>{t("Düğüm", "Node")}</dt>
        <dd className="mono">#{node}</dd>
        {names.length > 1 && (
          <>
            <dt>{t("Diğer adlar", "Other names")}</dt>
            <dd className="mono">{names.slice(1).join(", ")}</dd>
          </>
        )}
        <dt>{t("Poligon", "Polygons")}</dt>
        <dd>{index.segmentCount.get(node) ?? 0}{pullup ? t(" · pull-up yüklü", " · has pull-up") : ""}</dd>
      </dl>
      <div className="row wrap">
        <button
          onClick={() => {
            useApp.getState().toggleWatch(node);
            sim.syncWatch();
            if (!watching) onAnalizor?.();
          }}
        >
          {watching ? t("Analizörden çıkar", "Remove from analyzer") : t("Analizöre ekle", "Add to analyzer")}
        </button>
        <button onClick={() => useApp.getState().select(node, true)}>{t("Kamerayı götür", "Move camera here")}</button>
      </div>
      <h3>{t("Kapısını sürdüğü transistörler", "Transistors whose gate it drives")} <span className="count">{gates.length}</span></h3>
      <ul className="tlist">
        {gates.slice(0, 40).map((ti) => {
          const tr = chip.transistors[ti];
          return <li key={ti}><code>{tr.name}</code> <NodeLink node={tr.c1} /> ↔ <NodeLink node={tr.c2} /></li>;
        })}
        {gates.length > 40 && <li className="muted">{t(`… ve ${gates.length - 40} tane daha`, `… and ${gates.length - 40} more`)}</li>}
      </ul>
      <h3>{t("Kanalına bağlı transistörler", "Transistors on its channel")} <span className="count">{chans.length}</span></h3>
      <ul className="tlist">
        {chans.slice(0, 40).map((ti) => {
          const tr = chip.transistors[ti];
          return <li key={ti}><code>{tr.name}</code> {t("kapı:", "gate:")} <NodeLink node={tr.gate} /></li>;
        })}
        {chans.length > 40 && <li className="muted">{t(`… ve ${chans.length - 40} tane daha`, `… and ${chans.length - 40} more`)}</li>}
      </ul>
    </Section>
  );
}
