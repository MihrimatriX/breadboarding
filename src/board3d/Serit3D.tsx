// Şerit kablo ve arka panel yolları 3D'de: breadboard'da panolar arası 64 damarlı kablo, PCB'de arka
// panelin yolları ve kartları arka panele bağlayan kısa kablolar. Damarlar şeridin dokusu (damar başına 3
// piksel damar + 1 piksel oluk), renkleri canlı; uzaktan mipmap ile harelenmez. Bir damara tıklayınca
// sinyali seçilir (useKart.net): bütün panolarda o netin telleri yanar, kabloda o damar parlar, öbürleri
// soluklaşır; yan panelde hangi damar olduğu ve hangi kartlara gittiği yazar. IDC soketleri ayrıntılı
// (passiveGeometry.ts idcSoketi) ve üstlerinde kartın adıyla etiket.

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, DataTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshStandardMaterial, RGBAFormat, SRGBColorSpace, Vector3 } from "three";
import { LEVEL_COLOR } from "./levels";
import { idcSoketi, IDC_BOY } from "./passiveGeometry";
import { DAMAR, damarNo, damarSinyalleri, seritGeometrisi, seritIsini } from "./serit";
import { boardModel, liveNets, useKart } from "./store";
import { TextQuads, type TextItem } from "./TextQuads";

/** 1 dünya birimi = 10 mm */
const S = 0.1;
/** damar başına doku pikseli: 3 damar, 1 oluk (64 × 4 = 256, mipmap için 2'nin kuvveti) */
const PIKSEL = 4;

/** kablo: gri yalıtım, damarlar canlı seviyeye çalar; bakır: arka panelin koyu zemininde bakır yollar */
export type Palet = "kablo" | "bakir";
const TABAN: Record<Palet, Color> = { kablo: new Color("#a3a8b0"), bakir: new Color("#13261d") };
const OLUK: Record<Palet, Color> = { kablo: new Color("#80858d"), bakir: new Color("#13261d") };
const MAVI = new Color("#2f6fd6");
const KIRMIZI_CIZGI = new Color("#c23030");
const BILINMEYEN = new Color("#7d838c");
const BAKIR = new Color("#a07a3a");
const SEVIYE = LEVEL_COLOR.map((c) => new Color(c));
const tmpC = new Color();

/** Bir damarın rengi: seviyesi (0, 1, Z, X), paleti; seçili sinyal varsa öbürleri soluk */
function damarRengi(c: Color, net: number, k: number, v: Uint8Array | null, palet: Palet, vurgu: number | null): Color {
  const lv = net < 0 ? -1 : net <= 1 ? net : v ? (v[net] ?? 3) : 3;
  if (palet === "kablo") {
    // 1. damar kırmızı çizgili (canlı değeri yoksa); seçili damar yalıtımsız parlak
    c.copy(lv === 1 ? SEVIYE[1] : lv === 0 ? MAVI : k === 0 ? KIRMIZI_CIZGI : BILINMEYEN);
    if (vurgu === null) c.lerp(TABAN.kablo, k === 0 && lv < 0 ? 0 : 0.45);
  } else if (lv < 0) c.copy(TABAN.bakir);
  else c.copy(lv === 1 ? SEVIYE[1] : lv === 0 ? BAKIR : SEVIYE[lv]);
  if (vurgu !== null && net !== vurgu) c.lerp(TABAN[palet], 0.85);
  return c;
}

/** Damarların netleri: arka panel pininin sinyali (kartta yoksa −1). Sahne kart ya da görünüm değişince yeniden kurulur. */
export function useDamarNetleri(): Int32Array {
  return useMemo(() => {
    const { board } = boardModel();
    return Int32Array.from(damarSinyalleri(), (s) => (s && board.has(s) ? board.n(s) : -1));
  }, []);
}

/** Damar dokusu: canlı değerler ya da seçili net değişince yeniden boyanır */
function useDamarDokusu(netler: Int32Array, palet: Palet): DataTexture {
  const doku = useMemo(() => {
    const t = new DataTexture(new Uint8Array(DAMAR * PIKSEL * 4), DAMAR * PIKSEL, 1, RGBAFormat);
    t.colorSpace = SRGBColorSpace;
    t.generateMipmaps = true;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.anisotropy = 8;
    return t;
  }, []);
  useEffect(() => () => doku.dispose(), [doku]);
  const net = useKart((s) => s.net);
  const surum = useRef("");
  useFrame(() => {
    const anahtar = `${liveNets.version}|${net}`;
    if (surum.current === anahtar) return;
    surum.current = anahtar;
    const vurgu = net !== null && netler.includes(net) ? net : null;
    const data = doku.image.data as Uint8Array;
    const yaz = (i: number, c: Color) => {
      const h = c.getHex();
      data.set([h >> 16, (h >> 8) & 255, h & 255, 255], 4 * i);
    };
    for (let k = 0; k < DAMAR; k++) {
      damarRengi(tmpC, netler[k], k, liveNets.values, palet, vurgu);
      for (let p = 0; p < PIKSEL - 1; p++) yaz(k * PIKSEL + p, tmpC);
      yaz(k * PIKSEL + PIKSEL - 1, OLUK[palet]);
    }
    doku.needsUpdate = true;
  });
  return doku;
}

/** Bir şerit: eksen yolu (dünya), genişlik yönü (birim) ve genişlik (dünya birimi) */
export interface SeritParcasi {
  yol: number[];
  en: [number, number, number];
  g: number;
}

/**
 * Şeritler (aynı 64 damar, aynı doku): tıklanan damarın sinyali seçilir. Işın testi analitik (seritIsini):
 * ışın her basışta ve tekerlekte de atılır, üçgen taranmaz. GND / VCC damarı seçilmez (her yerde ucu var).
 */
export function DamarSeritleri({ parcalar, palet, netler }: { parcalar: SeritParcasi[]; palet: Palet; netler: Int32Array }) {
  const doku = useDamarDokusu(netler, palet);
  const obj = useMemo(() => {
    const mat = new MeshStandardMaterial({ map: doku, roughness: palet === "kablo" ? 0.8 : 0.4, metalness: palet === "bakir" ? 0.35 : 0, side: DoubleSide });
    const meshes = parcalar.map((p) => {
      const m = new Mesh(seritGeometrisi(p.yol, p.en, p.g), mat);
      m.raycast = (rc, hits) => {
        const { origin: o, direction: d } = rc.ray;
        const h = seritIsini([o.x, o.y, o.z], [d.x, d.y, d.z], p.yol, p.en, p.g);
        if (h) hits.push({ distance: h.t, point: rc.ray.at(h.t, new Vector3()), object: m, index: damarNo(h.u) });
      };
      return m;
    });
    return { mat, meshes };
  }, [parcalar, doku, palet]);
  useEffect(() => () => {
    obj.mat.dispose();
    for (const m of obj.meshes) m.geometry.dispose();
  }, [obj]);
  const tikla = (e: ThreeEvent<MouseEvent>) => {
    if (e.index === undefined) return;
    e.stopPropagation();
    const n = netler[e.index];
    if (n > 1) useKart.getState().selectNet(n);
  };
  return (
    <group onClick={tikla}>
      {obj.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}

/** Bir IDC soketi: alt yüzünün ortası (dünya) ve üstündeki etiket ("CPU · J1") */
export interface Soket {
  x: number;
  y: number;
  z: number;
  etiket: string;
}

/** 2 × 32 IDC soketleri; taban > 0 (mm): altlarında erkek başlığın gövdesi de (arka paneldeki konnektör) */
export function IdcSoketleri({ soketler, taban = 0 }: { soketler: Soket[]; taban?: number }) {
  const [geo, mat] = useMemo(() => [idcSoketi(DAMAR / 2, taban), new MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })] as const, [taban]);
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);
  const etiketler = useMemo<TextItem[]>(() => soketler.map((k) => ({
    text: k.etiket, x: k.x, z: k.z, y: k.y + (taban + IDC_BOY + 0.05) * S, w: 60 * S, d: 4.4 * S, color: "#e8e2d2", align: "center" as const,
  })), [soketler, taban]);
  return (
    <group>
      {soketler.map((k, i) => (
        <mesh key={i} geometry={geo} material={mat} position={[k.x, k.y, k.z]} scale={[S, S, S]} raycast={() => null} />
      ))}
      <TextQuads items={etiketler} cellW={512} cellH={56} font={34} />
    </group>
  );
}
