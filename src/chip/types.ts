/**
 * Bir çipin fiziksel yerleşimi ve netlist'i. Hem visual6502 verisi hem de ileride
 * OpenLane/GDS'ten çıkarılacak kendi 16-bit çipimiz bu ortak biçime dönüştürülür.
 */
export type TransistorKind = "nmos" | "pmos";

export interface LayerDef {
  /** Kaynak verideki katman numarası */
  id: number;
  name: string;
  /** 0 = difüzyon seviyesi, 1 = poli, 2 = metal1, 3 = metal2 ... */
  level: number;
  color: string;
  /** 3D kalınlık (dünya birimi) */
  thickness: number;
  opacity: number;
}

export interface Segment {
  node: number;
  layer: number;
  /** x0,y0,x1,y1,... çip koordinatında kapalı poligon */
  points: number[];
}

export interface Transistor {
  name: string;
  gate: number;
  c1: number;
  c2: number;
  /** [xmin, xmax, ymin, ymax] */
  bbox: [number, number, number, number];
  kind: TransistorKind;
}

export interface ChipData {
  id: string;
  name: string;
  description: string;
  license: string;
  /** Çip koordinat sınırları */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Bir çip biriminin dünya birimindeki karşılığı */
  scale: number;
  layers: LayerDef[];
  nodeCount: number;
  gnd: number;
  vcc: number;
  /** Pull-up (NMOS yük transistörü) olan düğümler */
  pullups: number[];
  segments: Segment[];
  transistors: Transistor[];
  nodeNames: Record<string, number>;
}
