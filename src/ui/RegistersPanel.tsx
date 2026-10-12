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

/**
 * Yazmaçlar: en önemlisi (PC ve o anki komut) büyük, A X Y SP P ve yollar altında tek bir değer
 * grubunda, pinler en altta. visible: sekme ya da bölüm gizliyken her karede yeniden çizilmesin.
 */
export function RegistersPanel({ visible = true }: { visible?: boolean }) {
  const snap = useApp((s) => (visible ? s.snapshot : null));
  if (!snap) return null;
  const t = snap.trace;
  const read = (a: number) => (a < 256 ? snap.zeroPage[a] : a < 512 ? snap.stackPage[a - 256] : 0);
  const regs: [string, string, boolean?][] = [
    ["A", "$" + h2(t.a)], ["X", "$" + h2(t.x)], ["Y", "$" + h2(t.y)],
    ["SP", "$" + h2(t.sp)], ["P (bayraklar)", flags(t.p)], ["Yön", t.rw ? "okuma" : "yazma", true],
    ["Adres yolu", "$" + h4(t.ab)], ["Veri yolu", "$" + h2(t.db)],
  ];
  return (
    <Section title="Yazmaçlar" actions={<span className="hint-text">die'dan okunuyor</span>}>
      <div className="kahraman">
        <span className="k-ad">PC</span>
        <span className="k-deger">${h4(t.pc)}</span>
        <span className="k-ek yazi">
          {t.sync ? <>komut çekiliyor: <b>{disassemble(read, t.ab).text}</b></> : "komut yürütülüyor"}
        </span>
      </div>
      <div className="degerler">
        {regs.map(([k, v, yazi]) => (
          <div key={k} className="deger"><span>{k}</span><b className={yazi ? "yazi" : undefined}>{v}</b></div>
        ))}
      </div>
      <div className="pins tek-satir" aria-label="Pinler">
        {PINS.map((p) => {
          const high = snap.pins[p.name];
          return (
            <button
              key={p.name}
              className={`pin ${high ? "on" : ""}${p.toggle ? " toggle" : ""}`}
              disabled={!p.toggle}
              title={`${p.label} = ${high ? 1 : 0} · ${p.toggle ? "tıkla: pini değiştir" : "çip tarafından sürülüyor"}`}
              onClick={() => sim.pin(p.name, !high)}
            >
              {p.activeLow ? <span className="overline">{p.label}</span> : p.label}
            </button>
          );
        })}
      </div>
      <p className="hint-text">Pinler: 1 olanlar kırmızı; kesikli çerçeveli olanlara tıklayıp değiştirebilirsin.</p>
      {snap.oscillations > 0 && <p className="warn">Kararsız devre: {snap.oscillations} kez döngü sınırına ulaşıldı.</p>}
    </Section>
  );
}
