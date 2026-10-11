import { useEffect, useState } from "react";
import { App } from "./App";
import { Cpu16Bench } from "./cpu16/Cpu16Bench";
import { BoardView } from "./board3d/BoardView";
import { modeFromHash, type Mode } from "./ui/ModeSwitch";
import { useApp } from "./state/store";
import { sim } from "./sim/SimClient";

/** 6502 die görünümü, CPU16 tezgâhı ve CPU16 kartı arasında geçiş. Die görünümü bağlı kalır, sadece durdurulur. */
export function Root() {
  const [mode, setMode] = useState<Mode>(modeFromHash);
  useEffect(() => {
    const onHash = () => setMode(modeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (mode !== "6502" && useApp.getState().running) {
      sim.pause();
      useApp.setState({ running: false });
    }
  }, [mode]);
  return (
    <>
      <App active={mode === "6502"} />
      {mode === "cpu16" && <Cpu16Bench />}
      {mode === "kart" && <BoardView />}
    </>
  );
}
