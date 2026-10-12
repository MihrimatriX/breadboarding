// Seçili kapının CMOS transistör şeması: PMOS ağı üstte (VCC), NMOS ağı altta (GND).
// Kapı, Silikon3D'nin anahtar seviyesi motorunda canlı çalışır; iletimdeki transistörler yeşil.

import { useMemo } from "react";
import { GateProbe, nodeLabel } from "../../cpu16/board/inside";
import { GND_NODE, VCC_NODE } from "../../cpu16/chips/cmos";
import type { Gate } from "../../cpu16/chips/logic";
import { LEVEL_NAME, LEVEL_VAR } from "./levels";
import { boardModel, liveNets, useKart } from "./store";

export function CmosDiagram({ gate }: { gate: number }) {
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
  const onCount = cm.transistors.filter((t) => probe.on(t.index)).length;

  return (
    <div className="cmos">
      <p className="muted small cmos-ozet">
        {g.kind} kapısı · {cm.transistors.length} transistör ({cm.transistors.filter((t) => t.pmos).length} PMOS, {cm.transistors.filter((t) => !t.pmos).length} NMOS) · şu an {onCount} tanesi iletimde.
        {" "}Girişler: {cm.inputNodes.map((n, i) => <b key={i} className={`lv l${level(n)}`}>{nodeLabel(cm, n) || "?"}={LEVEL_NAME[level(n)]} </b>)}
        Çıkış: {cm.outputNodes.map((n, i) => <b key={i} className={`lv l${level(n)}`}>{nodeLabel(cm, n) || "?"}={LEVEL_NAME[level(n)]} </b>)}
      </p>
      <svg className="cmos-svg" viewBox={`0 0 ${cm.width} ${cm.height}`} width={cm.width} height={cm.height} role="img" aria-label={`${g.kind} kapısının transistör şeması`}>
        {cm.nodes.map((n, i) => (
          <g key={i}>
            <line x1={n.x1} x2={n.x2} y1={n.y} y2={n.y} style={{ stroke: n.rail === "VCC" ? "var(--sema-vcc)" : n.rail === "GND" ? "var(--sema-gnd)" : LEVEL_VAR[level(n.node)] }} strokeWidth={n.rail ? 3 : 2} />
            {n.label && <text x={n.x2 + 4} y={n.y + 4} className="nlabel">{n.label}</text>}
          </g>
        ))}
        {cm.transistors.map((t) => {
          const on = probe.on(t.index);
          const mid = (t.y1 + t.y2) / 2;
          const top = mid - 9;
          const bot = mid + 9;
          const gl = level(t.gate);
          const ch = { stroke: on ? "var(--sema-acik)" : "var(--sema-kapali)" };
          const gc = { stroke: LEVEL_VAR[gl] };
          const gx = t.pmos ? t.x - 13 : t.x - 8;
          return (
            <g key={t.index} className="fet">
              <title>{`${t.pmos ? "PMOS" : "NMOS"} t${t.index}: kapı ${nodeLabel(cm, t.gate) || "iç düğüm"} = ${LEVEL_NAME[gl]} → ${on ? "iletimde" : "kesimde"}`}</title>
              <line x1={t.x} x2={t.x} y1={t.y1} y2={top} style={ch} strokeWidth={1.6} />
              <line x1={t.x} x2={t.x} y1={bot} y2={t.y2} style={ch} strokeWidth={1.6} />
              <line x1={t.x} x2={t.x} y1={top} y2={bot} style={ch} strokeWidth={on ? 4 : 2} strokeDasharray={on ? undefined : "3 3"} />
              <line x1={t.x - 5} x2={t.x - 5} y1={top} y2={bot} style={gc} strokeWidth={2} />
              {t.pmos && <circle cx={t.x - 9} cy={mid} r={3} fill="none" style={gc} strokeWidth={1.4} />}
              <line x1={gx - 8} x2={gx} y1={mid} y2={mid} style={gc} strokeWidth={1.6} />
              <text x={gx - 10} y={mid + 4} textAnchor="end" className="glabel">{nodeLabel(cm, t.gate)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
