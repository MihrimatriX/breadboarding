// Seçili çipin içi: kapı seviyesi şema, canlı. Kapıya tıkla → transistör şeması; tele tıkla → net.

import { useMemo } from "react";
import { chipInside, type InsideGate } from "../../cpu16/board/inside";
import type { Gate } from "../../cpu16/chips/logic";
import { LEVEL_VAR, levelOf } from "./levels";
import { boardModel, liveNets, useKart } from "./store";

const BUBBLE = 3;

function shape(g: InsideGate): { d: string; bubble: boolean; label?: string } {
  const { x, y, w, h } = g;
  const inv = g.kind === "NAND" || g.kind === "NOR" || g.kind === "XNOR" || g.kind === "NOT";
  const bw = inv ? w - 2 * BUBBLE : w;
  switch (g.kind) {
    case "AND":
    case "NAND":
      return { d: `M${x} ${y}H${x + bw / 2}A${bw / 2} ${h / 2} 0 0 1 ${x + bw / 2} ${y + h}H${x}Z`, bubble: inv };
    case "OR":
    case "NOR":
      return { d: `M${x} ${y}Q${x + bw * 0.6} ${y} ${x + bw} ${y + h / 2}Q${x + bw * 0.6} ${y + h} ${x} ${y + h}Q${x + bw * 0.3} ${y + h / 2} ${x} ${y}Z`, bubble: inv };
    case "XOR":
    case "XNOR":
      return {
        d: `M${x + 4} ${y}Q${x + bw * 0.6} ${y} ${x + bw} ${y + h / 2}Q${x + bw * 0.6} ${y + h} ${x + 4} ${y + h}Q${x + 4 + bw * 0.3} ${y + h / 2} ${x + 4} ${y}Z` +
          `M${x} ${y}Q${x + bw * 0.3} ${y + h / 2} ${x} ${y + h}`,
        bubble: inv,
      };
    case "NOT":
    case "BUF":
      return { d: `M${x} ${y + 2}L${x + bw} ${y + h / 2}L${x} ${y + h - 2}Z`, bubble: inv };
    case "TBUF":
      return { d: `M${x} ${y + 2}L${x + bw} ${y + h / 2}L${x} ${y + h - 2}Z`, bubble: false, label: "en" };
    case "DFF":
      return { d: `M${x} ${y}h${w}v${h}h${-w}Z`, bubble: false, label: "D-FF" };
    case "LATCH":
      return { d: `M${x} ${y}h${w}v${h}h${-w}Z`, bubble: false, label: "mandal" };
    default:
      return { d: `M${x} ${y}h${w}v${h}h${-w}Z`, bubble: false, label: "bellek" };
  }
}

export function InsideDiagram({ refName }: { refName: string }) {
  useKart((s) => s.tick);
  const selectedGate = useKart((s) => s.gate);
  const selectedNet = useKart((s) => s.net);
  const { board } = boardModel();
  const ins = useMemo(() => chipInside(board.c.gates as Gate[], board.instance(refName)), [board, refName]);
  const v = liveNets.values;
  const name = (n: number) => board.netName(n);

  return (
    <svg className="inside-svg" viewBox={`0 0 ${ins.width} ${ins.height}`} width={ins.width} height={ins.height} role="img" aria-label={`${refName} çipinin kapı seviyesi şeması`}>
      {ins.wires.map((w, i) => {
        const lv = levelOf(v, w.net);
        return (
          <polyline
            key={i}
            points={w.points.join(" ")}
            fill="none"
            style={{ stroke: LEVEL_VAR[lv] }}
            strokeWidth={selectedNet === w.net ? 2.6 : 1.3}
            onClick={() => useKart.getState().selectNet(w.net)}
            className="wire"
          >
            <title>{`${name(w.net)} = ${"01ZX"[lv]}`}</title>
          </polyline>
        );
      })}
      {ins.ties.map((t, i) => (
        <text key={i} x={t.x} y={t.y + 3} className="tie" textAnchor="end">{t.v}</text>
      ))}
      {ins.gates.map((g) => {
        const s = shape(g);
        const out = levelOf(v, g.outputs[0]);
        const sel = selectedGate === g.gate;
        return (
          <g
            key={g.gate}
            className={`gate${sel ? " sel" : ""}${g.kind === "BEHAV" ? " behav" : ""}`}
            onClick={() => g.kind !== "BEHAV" && useKart.getState().selectGate(g.gate)}
          >
            <title>{`${g.kind} · çıkış ${g.outputs.map((o) => `${name(o)}=${"01ZX"[levelOf(v, o)]}`).join(", ")}`}</title>
            <path d={s.d} className={`sema-govde${out === 1 ? " on" : ""}${sel ? " sel" : ""}`} strokeWidth={sel ? 1.8 : 1.1} />
            {s.bubble && <circle cx={g.x + g.w - BUBBLE} cy={g.y + g.h / 2} r={BUBBLE} className={`sema-govde${sel ? " sel" : ""}`} strokeWidth={1.1} />}
            {s.label && <text x={g.x + g.w / 2} y={g.y + g.h / 2 + 3} textAnchor="middle" className="glabel">{s.label}</text>}
          </g>
        );
      })}
      {ins.pins.map((p) => {
        const lv = levelOf(v, p.net);
        const left = p.side === "left";
        return (
          <g key={p.name} className="ipin" onClick={() => useKart.getState().selectNet(p.net)}>
            <rect x={p.x - 4} y={p.y - 4} width={8} height={8} style={{ fill: LEVEL_VAR[lv] }} />
            <text x={left ? p.x - 8 : p.x + 8} y={p.y + 4} textAnchor={left ? "end" : "start"} className={selectedNet === p.net ? "sel" : ""}>
              {p.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
