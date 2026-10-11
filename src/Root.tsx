import { useEffect, useState } from "react";
import { App } from "./App";
import { Cpu16Bench } from "./cpu16/Cpu16Bench";
import { modeFromHash, type Mode } from "./ui/ModeSwitch";
import { useApp } from "./state/store";
import { sim } from "./sim/SimClient";

/** 6502 die görünümü ile CPU16 tezgâhı arasında geçiş. Die görünümü bağlı kalır, sadece durdurulur. */
export function Root() {
  const [mode, setMode] = useState<Mode>(modeFromHash);
  useEffect(() => {
    const onHash = () => setMode(modeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (mode === "cpu16" && useApp.getState().running) {
      sim.pause();
      useApp.setState({ running: false });
    }
  }, [mode]);
  return (
    <>
      <App active={mode === "6502"} />
      {mode === "cpu16" && <Cpu16Bench />}
    </>
  );
}
