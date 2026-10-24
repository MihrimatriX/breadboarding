import { useApp } from "../state/store";
import { sim } from "../sim/SimClient";
import { hzLabel } from "./format";
import { Group, Meter, OdakDugmesi, PanelToggle, TasmaMenusu } from "./Shell";
import { Simge } from "./simgeler";
import { useT } from "./ceviri";

// kaydırıcı logaritmik: 1 Hz .. 4 kHz (yarım çevrim/sn)
const toHz = (v: number) => Math.round(Math.pow(10, v / 25));
const fromHz = (hz: number) => Math.log10(hz) * 25;

/**
 * 6502 die bölümünün araç çubuğu: çalıştır / sıfırla, adım düğmeleri (seyrek olan "tam çevrim" ⋯
 * menüsünde), saat hızı, panel düğmeleri ve odak modu.
 */
export function Toolbar({ side, bottom, onSide, onBottom }: { side: boolean; bottom: boolean; onSide: () => void; onBottom: () => void }) {
  const running = useApp((s) => s.running);
  const hz = useApp((s) => s.hz);
  const t = useT();
  return (
    <div className="toolbar">
      <Group label={t("Çalıştırma", "Run controls")}>
        <button className="primary" onClick={() => (running ? sim.pause() : sim.run())} title={t("Kısayol: Boşluk", "Shortcut: Space")}>
          <Simge ad={running ? "duraklat" : "oynat"} />
          {running ? t("Duraklat", "Pause") : t("Çalıştır", "Run")}
        </button>
        <button onClick={() => sim.reset()} title={t("Kısayol: R", "Shortcut: R")}><Simge ad="sifirla" />{t("Sıfırla", "Reset")}</button>
      </Group>
      <Group label={t("Adım adım", "Stepping")}>
        <button onClick={() => sim.stepInstruction()} title={t("Bir sonraki komutun başına kadar · kısayol: N", "To the start of the next instruction · shortcut: N")}><Simge ad="adim" />{t("Sonraki komut", "Next instruction")}</button>
        <button onClick={() => sim.halfStep(1)} title={t("Yarım saat çevrimi · kısayol: .", "Half a clock cycle · shortcut: .")}><Simge ad="yarim" />{t("½ çevrim", "½ cycle")}</button>
        <TasmaMenusu title={t("Diğer adımlar", "More steps")}>
          <button onClick={() => sim.halfStep(2)} title={t("İki yarım çevrim: bir saat çevrimi", "Two half cycles: one clock cycle")}>{t("Tam çevrim (1 saat)", "Full cycle (1 clock)")}</button>
        </TasmaMenusu>
      </Group>
      <Group label={t("Saat hızı", "Clock speed")} className="tb-grow">
        <label className="speed" htmlFor="speed">
          {t("Hız", "Speed")}
          <input id="speed" type="range" min={0} max={90} value={fromHz(hz)} onChange={(e) => sim.setHz(toHz(+e.target.value))} />
          <span>{hzLabel(hz)}</span>
        </label>
      </Group>
      <Group label={t("Paneller", "Panels")} className="tb-end">
        <PanelToggle which="bottom" open={bottom} onToggle={onBottom} ad={t("Mantık analizörü", "Logic analyzer")} />
        <PanelToggle which="side" open={side} onToggle={onSide} />
        <OdakDugmesi />
      </Group>
    </div>
  );
}

/** Durum çubuğundaki canlı ölçümler */
export function Meters() {
  const running = useApp((s) => s.running);
  const measured = useApp((s) => s.measuredHz);
  const t = useT();
  // seçici metni döndürür: her karede gelen yeni anlık görüntü, sayı değişmedikçe yeniden çizdirmez
  const cevrim = useApp((s) => {
    const tr = s.snapshot?.trace;
    return tr ? Math.floor(tr.halfCycle / 2) + (tr.halfCycle % 2 ? "½" : "") : "-";
  });
  return (
    <>
      <Meter label={t("Çevrim", "Cycle")}>{cevrim}</Meter>
      <Meter label={t("Ölçülen hız", "Measured speed")}>{running ? hzLabel(measured) : t("durdu", "paused")}</Meter>
    </>
  );
}
