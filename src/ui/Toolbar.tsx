import { useApp } from "../state/store";
import { sim } from "../sim/SimClient";
import { hzLabel } from "./format";
import { ModeSwitch } from "./ModeSwitch";

// kaydırıcı logaritmik: 1 Hz .. 4 kHz (yarım çevrim/sn)
const toHz = (v: number) => Math.round(Math.pow(10, v / 25));
const fromHz = (hz: number) => Math.log10(hz) * 25;

export function Toolbar() {
  const running = useApp((s) => s.running);
  const hz = useApp((s) => s.hz);
  const measured = useApp((s) => s.measuredHz);
  const t = useApp((s) => s.snapshot?.trace);
  const chip = useApp((s) => s.chip);
  return (
    <header className="toolbar">
      <div className="brand">
        <h1>Silikon3D</h1>
        <span>{chip ? `${chip.name} · ${chip.transistors.length.toLocaleString("tr-TR")} transistör` : "yükleniyor"}</span>
      </div>
      <ModeSwitch mode="6502" />
      <div className="clock">
        <button onClick={() => sim.halfStep(1)} title="Kısayol: .">½ çevrim</button>
        <button onClick={() => sim.halfStep(2)}>Tam çevrim</button>
        <button onClick={() => sim.stepInstruction()} title="Kısayol: N">Sonraki komut</button>
        <button className="primary" onClick={() => (running ? sim.pause() : sim.run())} title="Kısayol: Boşluk">
          {running ? "Duraklat" : "Çalıştır"}
        </button>
        <button onClick={() => sim.reset()} title="Kısayol: R">Sıfırla</button>
        <label className="speed" htmlFor="speed">
          Hız
          <input id="speed" type="range" min={0} max={90} value={fromHz(hz)} onChange={(e) => sim.setHz(toHz(+e.target.value))} />
          <span>{hzLabel(hz)}</span>
        </label>
      </div>
      <div className="meter">
        <span>Çevrim <b>{t ? Math.floor(t.halfCycle / 2) + (t.halfCycle % 2 ? "½" : "") : "-"}</b></span>
        <span>Ölçülen <b>{running ? hzLabel(measured) : "durdu"}</b></span>
      </div>
    </header>
  );
}
