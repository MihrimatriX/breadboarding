import { useApp } from "../state/store";
import { sim } from "../sim/SimClient";
import { hzLabel } from "./format";
import { Group, Meter, OdakDugmesi, PanelToggle, TasmaMenusu } from "./Shell";
import { Simge } from "./simgeler";

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
  return (
    <div className="toolbar">
      <Group label="Çalıştırma">
        <button className="primary" onClick={() => (running ? sim.pause() : sim.run())} title="Kısayol: Boşluk">
          <Simge ad={running ? "duraklat" : "oynat"} />
          {running ? "Duraklat" : "Çalıştır"}
        </button>
        <button onClick={() => sim.reset()} title="Kısayol: R"><Simge ad="sifirla" />Sıfırla</button>
      </Group>
      <Group label="Adım adım">
        <button onClick={() => sim.stepInstruction()} title="Bir sonraki komutun başına kadar · kısayol: N"><Simge ad="adim" />Sonraki komut</button>
        <button onClick={() => sim.halfStep(1)} title="Yarım saat çevrimi · kısayol: ."><Simge ad="yarim" />½ çevrim</button>
        <TasmaMenusu title="Diğer adımlar">
          <button onClick={() => sim.halfStep(2)} title="İki yarım çevrim: bir saat çevrimi">Tam çevrim (1 saat)</button>
        </TasmaMenusu>
      </Group>
      <Group label="Saat hızı" className="tb-grow">
        <label className="speed" htmlFor="speed">
          Hız
          <input id="speed" type="range" min={0} max={90} value={fromHz(hz)} onChange={(e) => sim.setHz(toHz(+e.target.value))} />
          <span>{hzLabel(hz)}</span>
        </label>
      </Group>
      <Group label="Paneller" className="tb-end">
        <PanelToggle which="bottom" open={bottom} onToggle={onBottom} ad="Mantık analizörü" />
        <PanelToggle which="side" open={side} onToggle={onSide} />
        <OdakDugmesi />
      </Group>
    </div>
  );
}

/** Üst çubuktaki canlı ölçümler */
export function Meters() {
  const running = useApp((s) => s.running);
  const measured = useApp((s) => s.measuredHz);
  // seçici metni döndürür: her karede gelen yeni anlık görüntü, sayı değişmedikçe yeniden çizdirmez
  const cevrim = useApp((s) => {
    const t = s.snapshot?.trace;
    return t ? Math.floor(t.halfCycle / 2) + (t.halfCycle % 2 ? "½" : "") : "-";
  });
  return (
    <>
      <Meter label="Çevrim">{cevrim}</Meter>
      <Meter label="Ölçülen hız">{running ? hzLabel(measured) : "durdu"}</Meter>
    </>
  );
}
