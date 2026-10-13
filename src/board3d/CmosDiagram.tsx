// Seçili kapının CMOS transistör şeması: PMOS ağı üstte (VCC), NMOS ağı altta (GND).
// Kapı, Silikon3D'nin anahtar seviyesi motorunda canlı çalışır; iletimdeki transistörler yeşil.

import { useMemo } from "react";
import { GateProbe, etiketDili, nodeLabel } from "../../cpu16/board/inside";
import { GND_NODE, VCC_NODE } from "../../cpu16/chips/cmos";
import type { Gate } from "../../cpu16/chips/logic";
import { useDil, useT } from "../ui/ceviri";
import { LEVEL_NAME, LEVEL_VAR } from "./levels";
import { boardModel, liveNets, useKart } from "./store";

export function CmosDiagram({ gate }: { gate: number }) {
  const t = useT();
  const dil = useDil();
  useKart((s) => s.tick);
  const { board } = boardModel();
  const g = board.c.gates[gate] as Gate;
  const ci = board.chips.find((c) => gate >= c.gates[0] && gate < c.gates[1]);
  // dış uçlara çipin pin adı verilir (varsa), yoksa net adı
  const pinName = useMemo(() => {
    const m = new Map<number, string>();
    if (ci) for (const [pin, net] of Object.entries(ci.nets)) if (net > 1 && !m.has(net)) m.set(net, pin);
    return (n: number) => m.get(n);
  }, [ci]);
  const probe = useMemo(() => new GateProbe(g, (n) => board.netName(n), pinName), [g, board, pinName]);
  const values = liveNets.values;
  if (values) probe.update(values);
  const cm = probe.cm;

  /** düğüm seviyesi: dış uçlarda kapı seviyesi simülasyonun değeri (veriyolunda Z olabilir), içeride motorun */
  const level = (node: number): number => {
    if (node === VCC_NODE) return 1;
    if (node === GND_NODE) return 0;
    const net = cm.boardNet.get(node);
    if (net !== undefined && values) return values[net];
    return probe.level(node);
  };
  const etiket = (node: number) => nodeLabel(cm, node, dil);
  const onCount = cm.transistors.filter((x) => probe.on(x.index)).length;
  const pmos = cm.transistors.filter((x) => x.pmos).length;
  const nmos = cm.transistors.length - pmos;

  return (
    <div className="cmos">
      <p className="muted small cmos-ozet">
        {t(
          `${g.kind} kapısı · ${cm.transistors.length} transistör (${pmos} PMOS, ${nmos} NMOS) · şu an ${onCount} tanesi iletimde.`,
          `${g.kind} gate · ${cm.transistors.length} transistors (${pmos} PMOS, ${nmos} NMOS) · ${onCount} conducting right now.`,
        )}
        {" "}{t("Girişler", "Inputs")}: {cm.inputNodes.map((n, i) => <b key={i} className={`lv l${level(n)}`}>{etiket(n) || "?"}={LEVEL_NAME[level(n)]} </b>)}
        {t("Çıkış", "Output")}: {cm.outputNodes.map((n, i) => <b key={i} className={`lv l${level(n)}`}>{etiket(n) || "?"}={LEVEL_NAME[level(n)]} </b>)}
      </p>
      <svg className="cmos-svg" viewBox={`0 0 ${cm.width} ${cm.height}`} width={cm.width} height={cm.height} role="img" aria-label={t(`${g.kind} kapısının transistör şeması`, `Transistor diagram of the ${g.kind} gate`)}>
        {cm.nodes.map((n, i) => (
          <g key={i}>
            <line x1={n.x1} x2={n.x2} y1={n.y} y2={n.y} style={{ stroke: n.rail === "VCC" ? "var(--sema-vcc)" : n.rail === "GND" ? "var(--sema-gnd)" : LEVEL_VAR[level(n.node)] }} strokeWidth={n.rail ? 3 : 2} />
            {n.label && <text x={n.x2 + 4} y={n.y + 4} className="nlabel">{etiketDili(n.label, dil)}</text>}
          </g>
        ))}
        {cm.transistors.map((tr) => {
          const on = probe.on(tr.index);
          const mid = (tr.y1 + tr.y2) / 2;
          const top = mid - 9;
          const bot = mid + 9;
          const gl = level(tr.gate);
          const ch = { stroke: on ? "var(--sema-acik)" : "var(--sema-kapali)" };
          const gc = { stroke: LEVEL_VAR[gl] };
          const gx = tr.pmos ? tr.x - 13 : tr.x - 8;
          const kapi = etiket(tr.gate) || t("iç düğüm", "internal node");
          return (
            <g key={tr.index} className="fet">
              <title>
                {t(
                  `${tr.pmos ? "PMOS" : "NMOS"} t${tr.index}: kapı ${kapi} = ${LEVEL_NAME[gl]} → ${on ? "iletimde" : "kesimde"}`,
                  `${tr.pmos ? "PMOS" : "NMOS"} t${tr.index}: gate ${kapi} = ${LEVEL_NAME[gl]} → ${on ? "conducting" : "off"}`,
                )}
              </title>
              <line x1={tr.x} x2={tr.x} y1={tr.y1} y2={top} style={ch} strokeWidth={1.6} />
              <line x1={tr.x} x2={tr.x} y1={bot} y2={tr.y2} style={ch} strokeWidth={1.6} />
              <line x1={tr.x} x2={tr.x} y1={top} y2={bot} style={ch} strokeWidth={on ? 4 : 2} strokeDasharray={on ? undefined : "3 3"} />
              <line x1={tr.x - 5} x2={tr.x - 5} y1={top} y2={bot} style={gc} strokeWidth={2} />
              {tr.pmos && <circle cx={tr.x - 9} cy={mid} r={3} fill="none" style={gc} strokeWidth={1.4} />}
              <line x1={gx - 8} x2={gx} y1={mid} y2={mid} style={gc} strokeWidth={1.6} />
              <text x={gx - 10} y={mid + 4} textAnchor="end" className="glabel">{etiket(tr.gate)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
