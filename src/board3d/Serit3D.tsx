// Şerit kablo ve arka panel yolları 3D'de: breadboard'da panolar arası 64 damarlı kablo, PCB'de arka
// panelin yolları ve kartları arka panele bağlayan kısa kablolar. Damarlar şeridin dokusu (damar başına 3
// piksel damar + 1 piksel oluk), renkleri canlı; uzaktan mipmap ile harelenmez. Kablo dik açıyla dönerken
// 45° katlanır: koldaki k. damar koridordaki k. damarın üstünde biter. Bir damara tıklayınca sinyali seçilir
// (useKart.net): o damar baştan sona, her şeyin üstünde parlayan bir izle çizilir, öbürleri soluklaşır;
// sinyalin uçları olan kartların soketleri çerçevelenir ve etiketlerine uç sayısı yazılır; yan panelde hangi
// damar olduğu ve hangi kartlara gittiği. IDC soketleri ayrıntılı (passiveGeometry.ts idcSoketi).

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, Color, DataTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RGBAFormat, SRGBColorSpace, Vector3 } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { useDil } from "../ui/ceviri";
import { LEVEL_COLOR } from "./levels";
import { idcSoketi, IDC_BOY } from "./passiveGeometry";
import { DAMAR, damarGruplari, damarNo, damarSinyalleri, damarU, damarYolu, seritGeometrisi, seritIsini } from "./serit";
import { boardModel, liveNets, netEnds, useKart } from "./store";
import { TextQuads, type TextItem } from "./TextQuads";

/** 1 dünya birimi = 10 mm */
const S = 0.1;
/** damar başına doku pikseli: 3 damar, 1 oluk (64 × 4 = 256, mipmap için 2'nin kuvveti) */
const PIKSEL = 4;

/** kablo: gri yalıtım, damarlar canlı seviyeye çalar; bakır: arka panelin koyu zemininde bakır yollar */
export type Palet = "kablo" | "bakir";
const TABAN: Record<Palet, Color> = { kablo: new Color("#a3a8b0"), bakir: new Color("#13261d") };
const OLUK: Record<Palet, Color> = { kablo: new Color("#80858d"), bakir: new Color("#13261d") };
/** bir sinyal seçiliyken öbür damarların soluklaşması (arka panelde yollar seçilebilsin diye az) */
const SOLUK: Record<Palet, number> = { kablo: 0.85, bakir: 0.55 };
const MAVI = new Color("#2f6fd6");
const KIRMIZI_CIZGI = new Color("#c23030");
const BILINMEYEN = new Color("#7d838c");
const BAKIR = new Color("#a07a3a");
const SEVIYE = LEVEL_COLOR.map((c) => new Color(c));
/** sinyalin uçları olan kartların soketlerinin çerçevesi ve etiketi */
const VURGU = "#ffd34d";
const tmpC = new Color();

/** Bir damarın seviyesi: −1 bağlantısız, 0, 1, 2 (Z), 3 (X) */
const seviye = (net: number, v: Uint8Array | null) => (net < 0 ? -1 : net <= 1 ? net : v ? (v[net] ?? 3) : 3);

/** Bir damarın rengi: seviyesi (0, 1, Z, X), paleti; seçili sinyal varsa öbürleri soluk */
function damarRengi(c: Color, net: number, k: number, v: Uint8Array | null, palet: Palet, vurgu: number | null): Color {
  const lv = seviye(net, v);
  if (palet === "kablo") {
    // 1. damar kırmızı çizgili (canlı değeri yoksa); seçili damar yalıtımsız parlak
    c.copy(lv === 1 ? SEVIYE[1] : lv === 0 ? MAVI : k === 0 ? KIRMIZI_CIZGI : BILINMEYEN);
    if (vurgu === null) c.lerp(TABAN.kablo, k === 0 && lv < 0 ? 0 : 0.45);
  } else if (lv < 0) c.copy(TABAN.bakir);
  else c.copy(lv === 1 ? SEVIYE[1] : lv === 0 ? BAKIR : SEVIYE[lv]);
  if (vurgu !== null && net !== vurgu) c.lerp(TABAN[palet], SOLUK[palet]);
  return c;
}

/** Damarların netleri: arka panel pininin sinyali (kartta yoksa −1). Sahne kart ya da görünüm değişince yeniden kurulur. */
export function useDamarNetleri(): Int32Array {
  return useMemo(() => {
    const { board } = boardModel();
    return Int32Array.from(damarSinyalleri(), (s) => (s && board.has(s) ? board.n(s) : -1));
  }, []);
}

/** Seçili sinyalin damarı (yoksa −1; GND / VCC seçilmez) */
function useSeciliDamar(netler: Int32Array): number {
  const net = useKart((s) => s.net);
  return net !== null && net > 1 ? netler.indexOf(net) : -1;
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

/**
 * Bir şerit: eksen yolu (dünya), genişlik yönü (birim), genişlik (dünya birimi); uc, bas: son ve ilk kenarın
 * eğimi (45° katlama, serit.ts seritGeometrisi)
 */
export interface SeritParcasi {
  yol: number[];
  en: [number, number, number];
  g: number;
  uc?: number;
  bas?: number;
}

/**
 * Seçili damarın izi: şeritlerin boyunca o damarın yolu (ve ekIz: ör. arka panelde kablodan yola iniş),
 * her şeyin üstünde kalın bir çizgi, rengi sinyalin canlı seviyesi.
 */
function DamarIzi({ yollar, net }: { yollar: number[][]; net: number }) {
  const size = useThree((s) => s.size);
  const obj = useMemo(() => {
    const seg: number[] = [];
    for (const y of yollar) for (let i = 0; i + 5 < y.length; i += 3) seg.push(y[i], y[i + 1], y[i + 2], y[i + 3], y[i + 4], y[i + 5]);
    const geo = new LineSegmentsGeometry();
    geo.setPositions(seg);
    const mat = new LineMaterial({ linewidth: 5, worldUnits: false, depthTest: false, transparent: true });
    const line = new LineSegments2(geo, mat);
    line.renderOrder = 30;
    line.frustumCulled = false;
    line.raycast = () => {};
    return { geo, mat, line };
  }, [yollar]);
  useEffect(() => () => {
    obj.geo.dispose();
    obj.mat.dispose();
  }, [obj]);
  useEffect(() => {
    obj.mat.resolution.set(size.width, size.height);
  }, [obj, size]);
  const surum = useRef(-1);
  useFrame(() => {
    if (surum.current === liveNets.version) return;
    surum.current = liveNets.version;
    const lv = seviye(net, liveNets.values);
    obj.mat.color.copy(lv === 0 ? MAVI : SEVIYE[lv] ?? SEVIYE[3]).lerp(tmpC.set("#ffffff"), 0.25);
  });
  return <primitive object={obj.line} />;
}

/**
 * Şeritler (aynı 64 damar, aynı doku): tıklanan damarın sinyali seçilir, seçili damar parlayan bir izle
 * çizilir. Işın testi analitik (seritIsini): ışın her basışta ve tekerlekte de atılır, üçgen taranmaz.
 * GND / VCC damarı seçilmez (her yerde ucu var). ekIz: seçili damarın şeritler dışındaki yolu (dünya).
 */
export function DamarSeritleri({ parcalar, palet, netler, ekIz }: { parcalar: SeritParcasi[]; palet: Palet; netler: Int32Array; ekIz?: (k: number) => number[][] }) {
  const doku = useDamarDokusu(netler, palet);
  const secili = useSeciliDamar(netler);
  const obj = useMemo(() => {
    const mat = new MeshStandardMaterial({ map: doku, roughness: palet === "kablo" ? 0.8 : 0.4, metalness: palet === "bakir" ? 0.35 : 0, side: DoubleSide });
    const meshes = parcalar.map((p) => {
      const m = new Mesh(seritGeometrisi(p.yol, p.en, p.g, p.uc, p.bas), mat);
      m.raycast = (rc, hits) => {
        const { origin: o, direction: d } = rc.ray;
        const h = seritIsini([o.x, o.y, o.z], [d.x, d.y, d.z], p.yol, p.en, p.g, p.uc, p.bas);
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
  const iz = useMemo(
    () => (secili < 0 ? null : [...parcalar.map((p) => damarYolu(p.yol, p.en, p.g, p.uc ?? 0, damarU(secili), p.bas)), ...(ekIz?.(secili) ?? [])]),
    [secili, parcalar, ekIz],
  );
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
      {iz && <DamarIzi yollar={iz} net={netler[secili]} />}
    </group>
  );
}

/**
 * Bir IDC soketi: alt yüzünün ortası (dünya), takılı olduğu kart ve konnektörü, etiketi ("CPU · J1") ve
 * etiketin hangi yanda durduğu (z yönünde ±1: kablonun çıkmadığı yan)
 */
export interface Soket {
  x: number;
  y: number;
  z: number;
  kart: string;
  ref: string;
  etiket: string;
  yon: number;
  /** 180° dönük (1. pin +x'te; kablo ters yüzüyle katlanınca) */
  ters?: boolean;
}

/** pin haritası dokusu: 32 sütun × 64 piksel; üstte grup bandı, altta tek ve çift pinlerin satırları */
const HARITA_W = 2048;
const HARITA_H = 256;
const GRUP_H = 96;
const SATIR_H = (HARITA_H - GRUP_H) / 2;
const SUTUN = DAMAR / 2;
const GRUP_RENK = ["#5aa0ff", "#ff7a59", "#47c784", "#c58cff", "#e6c84f", "#4fd1d9"];

/** Bir yazıyı genişliğe sığdırır (yazı boyunu küçülterek) */
function sigdir(g: CanvasRenderingContext2D, metin: string, boy: number, genislik: number, kalin = false): void {
  let b = boy;
  do g.font = `${kalin ? 700 : 600} ${b}px "IBM Plex Sans", system-ui, sans-serif`;
  while (g.measureText(metin).width > genislik && --b > 9);
}

/**
 * Soketin kafasındaki pin haritası (kapağın üstü): her sütunda iki pin (üstte tek, altta çift numaralı;
 * kablonun n. damarı n. pin), her pinin numarası ve sinyalinin adı; üstte sinyal grupları (A0–15, DE0–7,
 * …) renkli bantlarla. Seçili sinyalin pinleri sarı.
 */
function pinHaritasiCiz(g: CanvasRenderingContext2D, secili: number | null, netler: Int32Array): void {
  const ad = damarSinyalleri();
  const w = HARITA_W / SUTUN;
  g.fillStyle = "#2c2e34";
  g.fillRect(0, 0, HARITA_W, HARITA_H);
  g.textAlign = "center";
  g.textBaseline = "middle";
  damarGruplari().forEach((gr, i) => {
    const x0 = Math.floor((gr.ilk - 1) / 2) * w;
    const x1 = Math.ceil(gr.son / 2) * w;
    g.fillStyle = GRUP_RENK[i % GRUP_RENK.length];
    g.fillRect(x0 + 4, GRUP_H - 16, x1 - x0 - 8, 8);
    g.fillStyle = "#e8e2d2";
    sigdir(g, gr.ad, 54, x1 - x0 - 8, true);
    g.fillText(gr.ad, (x0 + x1) / 2, GRUP_H / 2 - 6);
  });
  for (let p = 1; p <= DAMAR; p++) {
    const x = Math.floor((p - 1) / 2) * w;
    const y = GRUP_H + ((p - 1) % 2) * SATIR_H;
    const isik = secili !== null && netler[p - 1] === secili;
    if (isik) {
      g.fillStyle = VURGU;
      g.fillRect(x + 2, y + 2, w - 4, SATIR_H - 4);
    }
    g.strokeStyle = "#45484f";
    g.strokeRect(x + 0.5, y + 0.5, w - 1, SATIR_H - 1);
    g.fillStyle = isik ? "#1b1c20" : "#8a8f99";
    g.font = `600 17px "IBM Plex Sans", system-ui, sans-serif`;
    g.fillText(String(p), x + w / 2, y + 12);
    const metin = ad[p - 1] || "·";
    g.save();
    g.translate(x + w / 2, y + 12 + (SATIR_H - 12) / 2);
    g.rotate(-Math.PI / 2);
    g.fillStyle = isik ? "#1b1c20" : "#e8e2d2";
    sigdir(g, metin, 24, SATIR_H - 26);
    g.fillText(metin, 0, 0);
    g.restore();
  }
}

/**
 * 2 × 32 IDC soketleri; taban > 0 (mm): altlarında erkek başlığın gövdesi de (arka paneldeki konnektör).
 * Kafalarında pin haritası (hangi damar hangi pinde, hangi sinyal). Seçili sinyalin uçları olan kartların
 * soketleri çerçevelenir, etiketlerine o karttaki uç sayısı yazılır (konnektörün kendi pini sayılmaz):
 * sinyal kartlar arasında nereden nereye gidiyor.
 */
export function IdcSoketleri({ soketler, netler, taban = 0 }: { soketler: Soket[]; netler: Int32Array; taban?: number }) {
  const dil = useDil();
  const net = useKart((s) => s.net);
  const [geo, mat, cerceve, harita, haritaMat, haritaGeo] = useMemo(() => {
    const cv = document.createElement("canvas");
    cv.width = HARITA_W;
    cv.height = HARITA_H;
    const t = new CanvasTexture(cv);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return [
      idcSoketi(DAMAR / 2, taban),
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
      new MeshStandardMaterial({ color: VURGU, emissive: VURGU, emissiveIntensity: 0.6, transparent: true, opacity: 0.35, depthWrite: false }),
      t,
      new MeshBasicMaterial({ map: t }),
      new PlaneGeometry(SUTUN * 2.54, 6.2).rotateX(-Math.PI / 2),
    ] as const;
  }, [taban]);
  useEffect(() => () => {
    for (const x of [geo, mat, cerceve, harita, haritaMat, haritaGeo]) x.dispose();
  }, [geo, mat, cerceve, harita, haritaMat, haritaGeo]);
  const vurgu = net !== null && net > 1 && netler.includes(net) ? net : null;
  useEffect(() => {
    pinHaritasiCiz((harita.image as HTMLCanvasElement).getContext("2d")!, vurgu, netler);
    harita.needsUpdate = true;
  }, [harita, vurgu, netler]);
  /** soket başına seçili sinyalin o karttaki uç sayısı (seçim yoksa ya da arka panel sinyali değilse null) */
  const uclar = useMemo(() => {
    if (vurgu === null) return null;
    const ends = netEnds().get(vurgu) ?? [];
    return soketler.map((k) => ends.filter((e) => e.card === k.kart && e.ref !== k.ref).length);
  }, [vurgu, soketler]);
  // kartın adı soketin yanında (kablonun çıkmadığı yan), kafası pin haritasına kalır
  const etiketler = useMemo<TextItem[]>(() => soketler.map((k, i) => {
    const n = uclar?.[i] ?? 0;
    const text = n > 0 ? `${k.etiket} · ${n} ${dil === "en" ? (n === 1 ? "end" : "ends") : "uç"}` : k.etiket;
    return {
      text, x: k.x, z: k.z + k.yon * 7.2 * S, y: k.y + (taban + IDC_BOY + 0.05) * S, w: 60 * S, d: 4.4 * S,
      color: n > 0 ? VURGU : uclar ? "#8a8f99" : "#e8e2d2", align: "center" as const,
    };
  }), [soketler, taban, uclar, dil]);
  const L = SUTUN * 2.54 + 5.1;
  return (
    <group>
      {soketler.map((k, i) => (
        <group key={i} position={[k.x, k.y, k.z]} rotation={[0, k.ters ? Math.PI : 0, 0]} scale={[S, S, S]}>
          <mesh geometry={geo} material={mat} raycast={() => null} />
          <mesh geometry={haritaGeo} material={haritaMat} position={[0, taban + IDC_BOY + 0.04, 0]} raycast={() => null} />
          {(uclar?.[i] ?? 0) > 0 && (
            <mesh material={cerceve} position={[0, taban + IDC_BOY / 2, 0]} raycast={() => null}>
              <boxGeometry args={[L + 3, IDC_BOY + 1.6, 9.6]} />
            </mesh>
          )}
        </group>
      ))}
      <TextQuads items={etiketler} cellW={512} cellH={56} font={34} />
    </group>
  );
}
