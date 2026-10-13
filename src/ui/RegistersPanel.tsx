import { useApp } from "../state/store";
import { sim } from "../sim/SimClient";
import { disassemble } from "../sim/asm6502";
import { flags, h2, h4 } from "./format";
import { Section } from "./Shell";
import { useT } from "./ceviri";

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
  const t = useT();
  if (!snap) return null;
  const tr = snap.trace;
  const read = (a: number) => (a < 256 ? snap.zeroPage[a] : a < 512 ? snap.stackPage[a - 256] : 0);
  const regs: [string, string, boolean?][] = [
    ["A", "$" + h2(tr.a)], ["X", "$" + h2(tr.x)], ["Y", "$" + h2(tr.y)],
    ["SP", "$" + h2(tr.sp)], [t("P (bayraklar)", "P (flags)"), flags(tr.p)], [t("Yön", "Direction"), tr.rw ? t("okuma", "read") : t("yazma", "write"), true],
    [t("Adres yolu", "Address bus"), "$" + h4(tr.ab)], [t("Veri yolu", "Data bus"), "$" + h2(tr.db)],
  ];
  return (
    <Section title={t("Yazmaçlar", "Registers")} actions={<span className="hint-text">{t("die'dan okunuyor", "read from the die")}</span>}>
      <div className="kahraman">
        <span className="k-ad">PC</span>
        <span className="k-deger">${h4(tr.pc)}</span>
        <span className="k-ek yazi">
          {tr.sync ? <>{t("komut çekiliyor:", "fetching:")} <b>{disassemble(read, tr.ab).text}</b></> : t("komut yürütülüyor", "executing")}
        </span>
      </div>
      <div className="degerler">
        {regs.map(([k, v, yazi]) => (
          <div key={k} className="deger"><span>{k}</span><b className={yazi ? "yazi" : undefined}>{v}</b></div>
        ))}
      </div>
      <div className="pins tek-satir" aria-label={t("Pinler", "Pins")}>
        {PINS.map((p) => {
          const high = snap.pins[p.name];
          return (
            <button
              key={p.name}
              className={`pin ${high ? "on" : ""}${p.toggle ? " toggle" : ""}`}
              disabled={!p.toggle}
              title={`${p.label} = ${high ? 1 : 0} · ${p.toggle ? t("tıkla: pini değiştir", "click to toggle the pin") : t("çip tarafından sürülüyor", "driven by the chip")}`}
              onClick={() => sim.pin(p.name, !high)}
            >
              {p.activeLow ? <span className="overline">{p.label}</span> : p.label}
            </button>
          );
        })}
      </div>
      <p className="hint-text">{t("Pinler: 1 olanlar kırmızı; kesikli çerçeveli olanlara tıklayıp değiştirebilirsin.", "Pins at 1 are red. Click the ones with a dashed border to toggle them.")}</p>
      {snap.oscillations > 0 && <p className="warn">{t(`Kararsız devre: ${snap.oscillations} kez döngü sınırına ulaşıldı.`, `Unstable circuit: the iteration limit was hit ${snap.oscillations} times.`)}</p>}
    </Section>
  );
}
