/// <reference lib="webworker" />
import type { ChipData } from "../chip/types";
import { buildLayerBuffers } from "./dieGeometry";

declare const self: DedicatedWorkerGlobalScope;

/** 8.000+ poligonun üçgenlemesi ana iş parçacığını kilitlemesin diye burada yapılır */
self.onmessage = (ev: MessageEvent<Pick<ChipData, "segments" | "layers" | "bounds" | "scale">>) => {
  const chip = ev.data;
  const layers = chip.layers.map((l) => buildLayerBuffers(chip, l));
  const transfer = layers.flatMap((l) => [l.positions.buffer, l.normals.buffer, l.nodes.buffer, l.indices.buffer]);
  self.postMessage({ layers }, transfer);
};
