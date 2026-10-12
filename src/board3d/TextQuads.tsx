// Yazı atlası: birçok kısa yazı (çip adları, kart başlıkları, board adları) birkaç dokuya çizilir,
// her doku tek bir ağla gösterilir (BoardScene, Breadboard3D).

import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, SRGBColorSpace } from "three";

const noRaycast = () => null;

export interface TextItem {
  text: string;
  sub?: string;
  /** dünya koordinatında dikdörtgen (x, z, genişlik, derinlik) ve yükseklik */
  x: number;
  z: number;
  w: number;
  d: number;
  y: number;
  color: string;
  align?: "left" | "center";
}

/** Birçok yazıyı dokulara çizer (doku başına en çok 2048 × 4096) ve her dokuyu tek bir ağla gösterir */
export function TextQuads({ items, cellW = 256, cellH = 80, font = 30 }: { items: TextItem[]; cellW?: number; cellH?: number; font?: number }) {
  const chunks = useMemo(() => {
    const cols = Math.floor(2048 / cellW);
    const perTex = cols * Math.floor(4096 / cellH);
    const out: { geometry: BufferGeometry; texture: CanvasTexture }[] = [];
    for (let start = 0; start < items.length; start += perTex) {
      const list = items.slice(start, start + perTex);
      const rows = Math.ceil(list.length / cols);
      const canvas = document.createElement("canvas");
      canvas.width = cols * cellW;
      canvas.height = Math.max(1, rows * cellH);
      const ctx = canvas.getContext("2d")!;
      ctx.textBaseline = "middle";
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      list.forEach((it, i) => {
        const ox = (i % cols) * cellW;
        const oy = Math.floor(i / cols) * cellH;
        ctx.fillStyle = it.color;
        ctx.textAlign = it.align === "left" ? "left" : "center";
        const tx = it.align === "left" ? ox + 6 : ox + cellW / 2;
        if (it.sub) {
          ctx.font = `600 ${font}px "IBM Plex Mono", ui-monospace, monospace`;
          ctx.fillText(it.text, tx, oy + cellH * 0.32, cellW - 8);
          ctx.font = `${Math.round(font * 0.72)}px "IBM Plex Mono", ui-monospace, monospace`;
          ctx.globalAlpha = 0.75;
          ctx.fillText(it.sub, tx, oy + cellH * 0.72, cellW - 8);
          ctx.globalAlpha = 1;
        } else {
          ctx.font = `600 ${font}px "IBM Plex Sans", system-ui, sans-serif`;
          ctx.fillText(it.text, tx, oy + cellH / 2, cellW - 8);
        }
        const u0 = ox / canvas.width;
        const u1 = (ox + cellW) / canvas.width;
        const v0 = 1 - oy / canvas.height;
        const v1 = 1 - (oy + cellH) / canvas.height;
        const b = pos.length / 3;
        pos.push(it.x, it.y, it.z, it.x + it.w, it.y, it.z, it.x + it.w, it.y, it.z + it.d, it.x, it.y, it.z + it.d);
        uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
        idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
      });
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
      geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
      geometry.setIndex(idx);
      geometry.computeVertexNormals();
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 8;
      out.push({ geometry, texture });
    }
    return out;
  }, [items, cellW, cellH, font]);
  useEffect(() => () => chunks.forEach((c) => { c.geometry.dispose(); c.texture.dispose(); }), [chunks]);
  return (
    <>
      {chunks.map((c, i) => (
        <mesh key={i} geometry={c.geometry} raycast={noRaycast}>
          <meshBasicMaterial map={c.texture} transparent depthWrite={false} side={DoubleSide} />
        </mesh>
      ))}
    </>
  );
}
