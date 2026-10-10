import { useMemo } from "react";
import { DataTexture, NearestFilter, RGBAFormat, UnsignedByteType } from "three";

export const STATE_TEX_WIDTH = 1024;

/**
 * Düğüm durumlarını tutan veri dokusu (R: 0/1 durum, G: yeni değişim parıltısı). Tek kanal (R8) bazı sürücülerde
 * sessizce sıfır okunduğu için RGBA kullanılır; durum R kanalındadır.
 */
export function useNodeStateTexture(nodeCount: number) {
  return useMemo(() => {
    const height = Math.max(1, Math.ceil(nodeCount / STATE_TEX_WIDTH));
    const data = new Uint8Array(STATE_TEX_WIDTH * height * 4);
    const tex = new DataTexture(data, STATE_TEX_WIDTH, height, RGBAFormat, UnsignedByteType);
    tex.magFilter = tex.minFilter = NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    const write = (state: Uint8Array) => {
      const n = Math.min(state.length, nodeCount);
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        const v = state[i] ? 255 : 0;
        // G kanalı: düğüm az önce değiştiyse 255, sonra her güncellemede söner
        data[o + 1] = data[o] !== v ? 255 : data[o + 1] >> 1;
        data[o] = v;
      }
      tex.needsUpdate = true;
    };
    return { tex, height, write };
  }, [nodeCount]);
}
