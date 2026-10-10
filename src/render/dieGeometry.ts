import { ShapeUtils, Vector2 } from "three";
import type { ChipData, LayerDef, Segment } from "../chip/types";

export interface LayerBuffers {
  layer: LayerDef;
  positions: Float32Array;
  normals: Float32Array;
  /** Her köşenin ait olduğu düğüm numarası (shader durum dokusundan okur) */
  nodes: Float32Array;
  indices: Uint32Array;
}

type ChipGeometryInput = Pick<ChipData, "segments" | "layers" | "bounds" | "scale">;

/**
 * Bir katmandaki tüm poligonları tek bir geometriye dönüştürür: üst yüz earcut ile
 * üçgenlenir, kenarlar dikey duvar olarak çıkarılır. Yükseklik 0..1 aralığında
 * üretilir; gerçek kalınlık ve katman yüksekliği mesh ölçeğinden gelir.
 */
export function buildLayerBuffers(chip: ChipGeometryInput, layer: LayerDef): LayerBuffers {
  const cx = (chip.bounds.minX + chip.bounds.maxX) / 2;
  const cy = (chip.bounds.minY + chip.bounds.maxY) / 2;
  const s = chip.scale;
  const pos: number[] = [];
  const nrm: number[] = [];
  const nod: number[] = [];
  const idx: number[] = [];
  let v = 0;

  const segs: Segment[] = chip.segments.filter((seg) => seg.layer === layer.id);
  for (const seg of segs) {
    const pts: Vector2[] = [];
    for (let i = 0; i < seg.points.length; i += 2) {
      pts.push(new Vector2((seg.points[i] - cx) * s, -(seg.points[i + 1] - cy) * s));
    }
    if (pts.length > 2 && pts[0].equals(pts[pts.length - 1])) pts.pop();
    if (pts.length < 3) continue;

    const tris = ShapeUtils.triangulateShape(pts, []);
    const top = v;
    for (const p of pts) {
      pos.push(p.x, 1, p.y);
      nrm.push(0, 1, 0);
      nod.push(seg.node);
      v++;
    }
    for (const t of tris) idx.push(top + t[0], top + t[2], top + t[1]);

    const dir = ShapeUtils.isClockWise(pts) ? -1 : 1;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dz = b.y - a.y;
      const len = Math.hypot(dx, dz) || 1;
      const nx = (dz / len) * dir;
      const nz = (-dx / len) * dir;
      pos.push(a.x, 1, a.y, b.x, 1, b.y, b.x, 0, b.y, a.x, 0, a.y);
      for (let k = 0; k < 4; k++) {
        nrm.push(nx, 0, nz);
        nod.push(seg.node);
      }
      idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
      v += 4;
    }
  }

  return {
    layer,
    positions: new Float32Array(pos),
    normals: new Float32Array(nrm),
    nodes: new Float32Array(nod),
    indices: new Uint32Array(idx),
  };
}
