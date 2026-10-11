import { useEffect } from "react";
import { DieScene } from "./render/DieScene";
import { Toolbar } from "./ui/Toolbar";
import { RegistersPanel } from "./ui/RegistersPanel";
import { ProbePanel } from "./ui/ProbePanel";
import { SignalSearch } from "./ui/SignalSearch";
import { LayersPanel } from "./ui/LayersPanel";
import { MemoryPanel } from "./ui/MemoryPanel";
import { ProgramPanel } from "./ui/ProgramPanel";
import { LogicAnalyzer } from "./ui/LogicAnalyzer";
import { HoverTooltip } from "./ui/HoverTooltip";
import { useApp } from "./state/store";
import { sim } from "./sim/SimClient";
import { PROGRAMS } from "./sim/programs";
import type { ChipData } from "./chip/types";

const CHIP_URL = `${import.meta.env.BASE_URL}chips/mos6502/chip.json`;
const DEFAULT_WATCH = ["clk0", "sync", "rw", "ab0", "db0"];

export function App({ active = true }: { active?: boolean }) {
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const chip = useApp((s) => s.chip);

  useEffect(() => {
    let cancelled = false;
    fetch(CHIP_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Çip verisi yüklenemedi (HTTP ${r.status})`);
        return r.json() as Promise<ChipData>;
      })
      .then((data) => {
        if (cancelled) return;
        const app = useApp.getState();
        app.setChip(data);
        DEFAULT_WATCH.forEach((n) => app.toggleWatch(data.nodeNames[n]));
        useApp.setState({ running: true });
        sim.start(new URL(CHIP_URL, location.href).href, PROGRAMS[0].bytes);
      })
      .catch((e) => useApp.getState().setError(String(e.message ?? e)));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!active) return;
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === " ") { e.preventDefault(); useApp.getState().running ? sim.pause() : sim.run(); }
      else if (e.key === ".") sim.halfStep(1);
      else if (e.key === "n" || e.key === "N") sim.stepInstruction();
      else if (e.key === "r" || e.key === "R") sim.reset();
      else if (e.key === "Escape") useApp.getState().select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <div className="app" hidden={!active}>
      <Toolbar />
      <main className="stage">
        {status === "ready" && active && <DieScene />}
        {status === "loading" && <div className="overlay">Die verisi yükleniyor…</div>}
        {status === "error" && <div className="overlay warn">{error}</div>}
        <p className="hint">Tıkla: sinyali ölç · Sürükle: döndür · Sağ tık: kaydır · Tekerlek: yakınlaş · Boşluk: çalıştır/duraklat · N: sonraki komut</p>
      </main>
      <aside className="side">
        <RegistersPanel />
        <SignalSearch />
        <ProbePanel />
        <LayersPanel />
        <MemoryPanel />
        <ProgramPanel />
        {chip && <section className="credit">{chip.license}</section>}
      </aside>
      <section className="bottom">
        <LogicAnalyzer />
      </section>
      <HoverTooltip />
    </div>
  );
}
