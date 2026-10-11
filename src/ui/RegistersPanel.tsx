import { useApp } from "../state/store";
import { sim } from "../sim/SimClient";
import { disassemble } from "../sim/asm6502";
import { flags, h2, h4 } from "./format";
import { Section } from "./Shell";

const PINS: { name: string; label: string; toggle?: boolean; activeLow?: boolean }[] = [
  { name: "clk0", label: "CLK0" },
  { name: "rw", label: "R/W" },
  { name: "sync", label: "SYNC" },
  { name: "rdy", label: "RDY", toggle: true },
  { name: "res", label: "RES", toggle: true, activeLow: true },
  { name: "irq", label: "IRQ", toggle: true, activeLow: true },
  { name: "nmi", label: "NMI", toggle: true, activeLow: true },
];

export function RegistersPanel() {
  const snap = useApp((s) => s.snapshot);
  if (!snap) return null;
  const t = snap.trace;
  const read = (a: number) => (a < 256 ? snap.zeroPage[a] : a < 512 ? snap.stackPage[a - 256] : 0);
  const regs: [string, string][] = [
    ["A", "$" + h2(t.a)], ["X", "$" + h2(t.x)], ["Y", "$" + h2(t.y)],
    ["SP", "$" + h2(t.sp)], ["PC", "$" + h4(t.pc)], ["P", flags(t.p)],
    ["Adres yolu", "$" + h4(t.ab)], ["Veri yolu", "$" + h2(t.db)], ["Yön", t.rw ? "Okuma" : "Yazma"],
  ];
  return (
    <Section title="Yazmaçlar" actions={<span className="hint-text">die'dan okunuyor</span>}>
      <div className="regs">
        {regs.map(([k, v]) => (
          <div key={k}><b>{k}</b><span>{v}</span></div>
        ))}
      </div>
      <div className="pins" aria-label="Pinler">
        {PINS.map((p) => {
          const high = snap.pins[p.name];
          return (
            <button
              key={p.name}
              className={`pin ${high ? "on" : ""}${p.toggle ? " toggle" : ""}`}
              disabled={!p.toggle}
              title={p.toggle ? "Tıkla: pini değiştir" : "Çip tarafından sürülüyor"}
              onClick={() => sim.pin(p.name, !high)}
            >
              {p.activeLow ? <span className="overline">{p.label}</span> : p.label}
            </button>
          );
        })}
      </div>
      <p className="dis">{t.sync ? `Komut çekiliyor  $${h4(t.ab)}  ${disassemble(read, t.ab).text}` : "Komut yürütülüyor"}</p>
      {snap.oscillations > 0 && <p className="warn">Kararsız devre: {snap.oscillations} kez döngü sınırına ulaşıldı.</p>}
    </Section>
  );
}
