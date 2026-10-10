import { live } from "./state/live";
import { useApp } from "./state/store";
import { sim } from "./sim/SimClient";
import { assemble } from "./sim/asm6502";

/**
 * Tarayıcı konsolundan betik yazmak için `window.silikon`.
 * Örnek: silikon.load("LDA #5\nSTA $10\nloop: JMP loop"); silikon.step(40); silikon.mem(0x10)
 */
export function installConsoleApi() {
  const nodeId = (signal: string | number) => {
    const chip = useApp.getState().chip;
    if (!chip) throw new Error("Çip henüz yüklenmedi");
    const id = typeof signal === "number" ? signal : chip.nodeNames[signal];
    if (id === undefined) throw new Error(`Sinyal bulunamadı: ${signal}`);
    return id;
  };
  const api = {
    run: () => sim.run(),
    pause: () => sim.pause(),
    step: (halfCycles = 1) => sim.halfStep(halfCycles),
    next: () => sim.stepInstruction(),
    reset: () => sim.reset(),
    speed: (hz: number) => sim.setHz(hz),
    load: (source: string) => {
      const { bytes } = assemble(source);
      sim.loadProgram(bytes);
      return `${bytes.length} bayt yüklendi`;
    },
    poke: (address: number, value: number) => sim.poke(address, value),
    mem: (address: number) => {
      const s = useApp.getState().snapshot;
      if (!s) return undefined;
      return address < 256 ? s.zeroPage[address] : address < 512 ? s.stackPage[address - 256] : undefined;
    },
    regs: () => useApp.getState().snapshot?.trace,
    node: (signal: string | number) => live.nodeState?.[nodeId(signal)] ?? 0,
    pin: (name: string, high: boolean) => sim.pin(name, high),
    find: (signal: string | number) => useApp.getState().select(nodeId(signal), true),
    watch: (signal: string | number) => {
      const id = nodeId(signal);
      if (!useApp.getState().watch.some((w) => w.node === id)) useApp.getState().toggleWatch(id);
      sim.syncWatch();
    },
    signals: () => useApp.getState().index?.signalNames ?? [],
  };
  (window as unknown as { silikon: typeof api }).silikon = api;
}
