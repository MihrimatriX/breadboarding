import { useMemo } from "react";
import { DataTexture, NearestFilter, RedFormat, UnsignedByteType } from "three";

export const STATE_TEX_WIDTH = 1024;

/** Düğüm durumlarını tutan tek kanallı veri dokusu */
export function useNodeStateTexture(nodeCount: number) {
  return useMemo(() => {
    const height = Math.max(1, Math.ceil(nodeCount / STATE_TEX_WIDTH));
    const data = new Uint8Array(STATE_TEX_WIDTH * height);
    const tex = new DataTexture(data, STATE_TEX_WIDTH, height, RedFormat, UnsignedByteType);
    tex.magFilter = tex.minFilter = NearestFilter;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    return { tex, data, height };
  }, [nodeCount]);
}
