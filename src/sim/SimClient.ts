import { live } from "../state/live";
import { cizimIste } from "../render/cizimDongusu";
import { useApp } from "../state/store";
import type { FromWorker, ToWorker } from "./protocol";

/** Simülasyon worker'ı ile React dünyası arasındaki tek köprü */
class SimClient {
  private worker: Worker | null = null;

  start(chipUrl: string, program: number[]) {
    this.worker?.terminate();
    this.worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.handle(ev.data);
    this.send({ type: "load", chipUrl, program });
  }

  private handle(msg: FromWorker) {
    const app = useApp.getState();
    switch (msg.type) {
      case "ready":
        this.send({ type: "watch", nodes: app.watch.map((w) => w.node) });
        if (app.running) this.send({ type: "run", hz: app.hz });
        break;
      case "frame":
        live.nodeState = msg.nodeState;
        live.transistorOn = msg.transistorOn;
        live.version++;
        cizimIste();
        app.applyFrame(msg);
        break;
      case "error":
        app.setError(msg.message);
        break;
    }
  }

  send(msg: ToWorker) {
    this.worker?.postMessage(msg);
  }

  run() { this.send({ type: "run", hz: useApp.getState().hz }); }
  pause() { this.send({ type: "pause" }); }
  setHz(hz: number) { useApp.getState().setHz(hz); this.send({ type: "setHz", hz }); }
  halfStep(n = 1) { this.send({ type: "step", halfSteps: n }); }
  stepInstruction() { this.send({ type: "stepInstruction" }); }
  reset() { useApp.getState().clearTrace(); this.send({ type: "reset" }); }
  loadProgram(bytes: number[]) { useApp.getState().clearTrace(); this.send({ type: "program", bytes }); }
  poke(address: number, value: number) { this.send({ type: "poke", address, value }); }
  pin(name: string, high: boolean) { this.send({ type: "pin", name, high }); }
  syncWatch() { this.send({ type: "watch", nodes: useApp.getState().watch.map((w) => w.node) }); }
}

export const sim = new SimClient();
