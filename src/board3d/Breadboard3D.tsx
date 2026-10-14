// Breadboard görünümü 3D'de: hesap makinesi (hesap8/breadboard: tek pano, 60 board) ya da CPU16
// bilgisayarı (cpu16/breadboard: her kart kendi panosunda, 7 pano, 149 board; panolar arası 64 damarlı
// şerit kablo). Her panonun taban plakası, board'ları (krem gövde; delik deseni, kırmızı / mavi ray
// çizgileri, sütun numaraları ve satır harfleri tek bir dokudan), board adları ve atlama telleri.
// Teller gerçek atlama telleri gibi: renkli yalıtım düz yatar, köşelerde yuvarlak dirsekle kıvrılan tek
// parça bir boru (telYolu.ts), uçlarda deliğe iner, deliğin ağzında çıplak bakır görünür; önce takılan tel
// altta kalır (kesişmede üstteki tel kamburlaşır).
//
// Başarım: teller parça parça (pano başına board sırası) birleştirilmiş ağlarda. Uzaktan her parça
// yassı şeritlerden tek çizim (hepsi baştan kurulur, ucuz); yakından borular ve çıplak uçlar (iki
// çizim), kameranın baktığı yere yakın parçalardan başlayarak kare başına birkaç milisaniyede kurulur.
// Ekran dışındaki parçalar çizilmez; renkler köşe renkleriyle değişir.
//
// Renkler: "seçili çip" kipinde teller yalıtımlarının renginde (uzaktan, seçim yokken soluk: modüller
// ve çipler öne çıksın); bir çip ya da net seçilince o
// netlerin telleri canlı seviyenin renginde (0 mavi, 1 kırmızı) parlar, ötekiler soluklaşır. "hepsi"
// kipinde bütün teller canlı seviyede; "yok" kipinde teller gizli. Kurulum modu açıkken panonun
// takılan telleri kendi renginde, takılmayanlar ve öbür panolarınkiler soluk; odaktaki tel ayrıca
// kalın ve uçları nabız gibi atar. Bir tele tıklanınca da öyle: o tel baştan sona kalın ve parlak, öbürleri
// soluk (kurulum modunda tıklanan tel odağa gelir).

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, Group, InstancedMesh, MeshLambertMaterial, MeshStandardMaterial, Mesh, Object3D, PlaneGeometry, SRGBColorSpace, Uint16BufferAttribute, Uint32BufferAttribute, Vector3,
  type Camera,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { delikVar, noktaninBoardu, KENAR_ALT, KENAR_SAG, KENAR_SOL, KENAR_UST, mmX, mmY, satirHarfi, SUTUN } from "../../cpu16/board/breadboard/geometri";
import { telYollari3B, type BbTel } from "../../cpu16/board/breadboard/plan";
import { ucusAdimi } from "../ui/ayarlar";
import { useDil } from "../ui/ceviri";
import { kartBasligi } from "./adlar";
import { aktifGorunum, bbSahnesi, panodakiBoard, type BbPanosu, type BbSahnesi } from "./aktif";
import { bbPano, bbSeciliTel, panoAdlari, useBbKurulum } from "./bbKurulum";
import { sahneBolumleri, useEtiketlerAcik } from "./bolum";
import { LEVEL_COLOR } from "./levels";
import { boardLayoutData, findPart, liveNets, useKart } from "./store";
import { IDC_KABLO_Y } from "./passiveGeometry";
import { DAMAR, DAMAR_ADIM } from "./serit";
import { DamarSeritleri, IdcSoketleri, useDamarNetleri, type SeritParcasi, type Soket } from "./Serit3D";
import { TextQuads, type TextItem } from "./TextQuads";
import { isinTeli, yuvarlakYol } from "./telYolu";

/** 1 dünya birimi = 10 mm (BoardScene ile aynı) */
const S = 0.1;
/** board kalınlığı ve taban plakası (mm) */
const BOARD_KALINLIK = 8.5;
const PLAKA_KALINLIK = 5;
/** tel: yalıtımın yarıçapı, kat 0'da ekseninin yüksekliği, kat başına yükselme; yalıtımın bittiği yükseklik */
const TEL_R = 0.68;
const TEL_H = 1.6;
const KAT_H = 1.3;
const YALITIM_UCU = 1.0;
/** çıplak uç: yarıçap, deliğin ağzından üstü ve altı */
const BAKIR_R = 0.32;

const noRaycast = () => null;
const tmpO = new Object3D();
const tmpC = new Color();
const YUKARI = new Vector3(0, 1, 0);
const tmpV = new Vector3();

type Dunya = (x: number, y: number) => [number, number];

/** Breadboard görünümü mü (sahnedeki kartta breadboard seçili) */
export const breadboardSahnede = (): boolean => aktifGorunum() === "breadboard";

function useDunya() {
  const lay = boardLayoutData();
  return useMemo(() => {
    const cx = lay.width / 2;
    const cz = lay.height / 2;
    return { lay, w: ((x: number, y: number) => [(x - cx) * S, (y - cz) * S]) as Dunya };
  }, [lay]);
}

/** Panoların tellerinin 3D yolları (katlarıyla; pano başına bir kez) */
const yolOnbellegi = new WeakMap<readonly BbTel[], number[][]>();
function yollar3B(teller: readonly BbTel[]): number[][] {
  let y = yolOnbellegi.get(teller);
  if (!y) {
    y = telYollari3B(teller);
    yolOnbellegi.set(teller, y);
  }
  return y;
}

// ---------------------------------------------------------------- board dokusu

/** Bir board'un üst yüzü: delikler, ray çizgileri, numaralar, harfler (bütün board'lar aynı doku) */
function boardDokusu(): CanvasTexture {
  const P = 32; // adım başına piksel
  const W = Math.round((KENAR_SAG - KENAR_SOL) * P);
  const H = Math.round((KENAR_ALT - KENAR_UST) * P);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  const px = (c: number) => (c - KENAR_SOL) * P;
  const py = (r: number) => (r - KENAR_UST) * P;
  g.fillStyle = "#f2eee3";
  g.fillRect(0, 0, W, H);
  // orta kanal: hafif oluk
  g.fillStyle = "#e3ddcf";
  g.fillRect(0, py(7.55), W, py(9.45) - py(7.55));
  g.fillStyle = "#d6cfbf";
  g.fillRect(0, py(8.42), W, py(8.58) - py(8.42));
  // ray çizgileri: + dış (kırmızı), − iç (mavi)
  const cizgi = (r: number, renk: string) => {
    g.fillStyle = renk;
    g.fillRect(px(2.2), py(r) - P * 0.05, px(61.8) - px(2.2), P * 0.1);
  };
  cizgi(-0.75, "#d0343a");
  cizgi(1.72, "#2f63c4");
  cizgi(15.28, "#2f63c4");
  cizgi(17.75, "#d0343a");
  g.font = `600 ${Math.round(P * 0.62)}px "IBM Plex Sans", system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const [r, isaret, renk] of [[0, "+", "#d0343a"], [1, "−", "#2f63c4"], [16, "−", "#2f63c4"], [17, "+", "#d0343a"]] as const) {
    g.fillStyle = renk;
    g.fillText(isaret, px(1.4), py(r));
    g.fillText(isaret, px(62.6), py(r));
  }
  // delikler: koyu kare ağız, içi daha koyu
  for (let r = 0; r <= 17; r++) {
    for (let c = 1; c <= SUTUN; c++) {
      if (!delikVar(r, c)) continue;
      const x = px(c);
      const y = py(r);
      g.fillStyle = "#c9c2b2";
      g.fillRect(x - P * 0.26, y - P * 0.26, P * 0.52, P * 0.52);
      g.fillStyle = "#2c2a26";
      g.fillRect(x - P * 0.17, y - P * 0.17, P * 0.34, P * 0.34);
    }
  }
  // satır harfleri iki yanda, sütun numaraları şeritlerin dışında (1, 5, 10, …, 60)
  g.fillStyle = "#6c675c";
  g.font = `500 ${Math.round(P * 0.5)}px "IBM Plex Sans", system-ui, sans-serif`;
  for (let r = 0; r <= 17; r++) {
    const h = satirHarfi(r);
    if (!h) continue;
    g.fillText(h, px(0.1), py(r));
    g.fillText(h, px(63.9), py(r));
  }
  g.font = `500 ${Math.round(P * 0.44)}px "IBM Plex Sans", system-ui, sans-serif`;
  for (let c = 1; c <= SUTUN; c++) {
    if (c !== 1 && c % 5) continue;
    g.fillText(String(c), px(c), py(2.25));
    g.fillText(String(c), px(c), py(14.75));
  }
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- taban plakaları ve board'lar

/** Taban plakasının rengi; modül tabanları bölgenin rengiyle bunun karışımı */
const PLAKA_RENGI = "#3a3d42";

/**
 * Modül tabanları: her bölgenin (modülün) board'larının altında, kenarlarından taşan renkli bir zemin
 * (bolumSahne.ts taban). Modüller arasındaki boşlukta iki renkli pervazın arasında koyu plaka kalır:
 * uzaktan her modül ayrı bir ada olarak okunur (James Sharman'ın panolarındaki bölümler gibi).
 */
function ModulTabanlari() {
  const { w } = useDunya();
  const s = sahneBolumleri(undefined, "breadboard");
  const obj = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const y = (-BOARD_KALINLIK + 0.4) * S;
    const plaka = new Color(PLAKA_RENGI);
    for (const c of s.cerceveler) {
      tmpC.set(c.renk).lerp(plaka, 0.18);
      for (const k of c.taban ?? []) {
        const [x0, z0] = w(k.x, k.y);
        const [x1, z1] = w(k.x + k.w, k.y + k.h);
        const b = pos.length / 3;
        pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
        for (let v = 0; v < 4; v++) col.push(tmpC.r, tmpC.g, tmpC.b);
        idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, side: DoubleSide });
    const m = new Mesh(geo, mat);
    m.raycast = noRaycast;
    return { m, geo, mat };
  }, [s, w]);
  useEffect(() => () => {
    obj.geo.dispose();
    obj.mat.dispose();
  }, [obj]);
  return <primitive object={obj.m} />;
}

export function BreadboardTabani() {
  const { w } = useDunya();
  const sahne = bbSahnesi();
  // bütün panoların board'ları: sahnedeki dikdörtgen ve adı
  const boards = useMemo(() => sahne.panolar.flatMap((p) => p.plan.yerlesim.boards.map((b) => ({ ad: b.ad, d: panodakiBoard(p, b) }))), [sahne]);
  const ust = useRef<InstancedMesh>(null);
  const govde = useRef<InstancedMesh>(null);
  const [doku, ustGeo, govdeGeo, ustMat, govdeMat] = useMemo(() => {
    const t = boardDokusu();
    const pg = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const bg = new BoxGeometry(1, 1, 1);
    return [t, pg, bg, new MeshStandardMaterial({ map: t, roughness: 0.82, metalness: 0 }), new MeshStandardMaterial({ color: "#e6e0d2", roughness: 0.85 })] as const;
  }, []);
  useEffect(() => () => [doku, ustGeo, govdeGeo, ustMat, govdeMat].forEach((x) => x.dispose()), [doku, ustGeo, govdeGeo, ustMat, govdeMat]);
  useLayoutEffect(() => {
    boards.forEach(({ d }, i) => {
      const [x, z] = w(d.x + d.w / 2, d.y + d.h / 2);
      tmpO.position.set(x, 0, z);
      tmpO.scale.set(d.w * S, 1, d.h * S);
      tmpO.updateMatrix();
      ust.current!.setMatrixAt(i, tmpO.matrix);
      tmpO.position.set(x, (-BOARD_KALINLIK / 2) * S - 0.002, z);
      tmpO.scale.set(d.w * S - 0.004, BOARD_KALINLIK * S, d.h * S - 0.004);
      tmpO.updateMatrix();
      govde.current!.setMatrixAt(i, tmpO.matrix);
    });
    for (const m of [ust.current!, govde.current!]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [boards, w]);
  // board adı sol üst köşede (ray deliklerinin solundaki boşlukta)
  const adlar = useMemo<TextItem[]>(() => boards.map(({ ad, d }) => {
    const [x, z] = w(d.x + 0.4, d.y + 0.9);
    return { text: ad, x, z, w: 7.2 * S, d: 2.25 * S, y: 0.002, color: "#4b463d", align: "left" as const };
  }), [boards, w]);
  // birden çok pano: adı plakanın dışında, koridordan uzak kenarda (arka sırada arkada, ön sırada önde);
  // bölüm etiketleri açıkken yerinde kartın plakası var (Bolumler3D)
  const etiketler = useEtiketlerAcik();
  // başlıklar dokuya çizilir: dil değişince yeniden çizilir
  const dil = useDil();
  const basliklar = useMemo<TextItem[]>(() => (sahne.panolar.length < 2 ? [] : sahne.panolar.map((p) => {
    const [x, z] = w(p.x + 4, p.sira === "on" ? p.y + p.h + 6 : p.y - 20);
    const n = p.plan.yerlesim.boards.length;
    const text = `${kartBasligi(p.kart, p.baslik, dil)} · ${n} ${dil === "en" ? "breadboards" : "board"}`;
    return { text, x, z, w: 150 * S, d: 14 * S, y: (-BOARD_KALINLIK - PLAKA_KALINLIK) * S, color: "#c9d2dc", align: "left" as const };
  })), [sahne, w, dil]);
  return (
    <group>
      {sahne.panolar.map((p) => {
        const [x, z] = w(p.x + p.w / 2, p.y + p.h / 2);
        return (
          <mesh key={p.kart} position={[x, (-BOARD_KALINLIK - PLAKA_KALINLIK / 2) * S, z]} raycast={noRaycast}>
            <boxGeometry args={[p.w * S, PLAKA_KALINLIK * S, p.h * S]} />
            <meshStandardMaterial color={PLAKA_RENGI} roughness={0.6} metalness={0.25} />
          </mesh>
        );
      })}
      <ModulTabanlari />
      <instancedMesh ref={govde} args={[govdeGeo, govdeMat, boards.length]} raycast={noRaycast} />
      <instancedMesh ref={ust} args={[ustGeo, ustMat, boards.length]} raycast={noRaycast} />
      <TextQuads items={adlar} cellW={256} cellH={80} font={52} />
      {basliklar.length > 0 && !etiketler && <TextQuads items={basliklar} cellW={512} cellH={48} font={30} />}
      {sahne.serit && <SeritKablo sahne={sahne} />}
    </group>
  );
}

// ---------------------------------------------------------------- şerit kablo (bilgisayarda)

/** Şerit kablo: 64 damar × 1,27 mm; IDC soketi uyarlayıcının başlığının üstünde (altı SOKET_TABAN, mm) */
const SERIT_GEN = DAMAR * DAMAR_ADIM;
const SOKET_TABAN = 8.5;
const MASA = -BOARD_KALINLIK - PLAKA_KALINLIK + 0.6;
/** kablonun kıvrımlarının köşeden uzaklığı (mm) */
const SERIT_DIRSEK = 7;

/**
 * Panolar arası 64 damarlı şerit kablo: masada koridor boyunca uzanır; her sokete koridordan 45° katlanarak
 * dik açıyla ayrılır, panonun kenarında yükselip soketin kapağının altına girer (kesim boyu
 * cpu16/breadboard/plan.ts seritKablolari ile aynı yoldan). Damarlar canlı; bir damara tıklayınca sinyali
 * seçilir, o damar koridor boyunca ve her sokete parlayan bir izle çizilir (Serit3D.tsx).
 */
function SeritKablo({ sahne }: { sahne: BbSahnesi }) {
  const { w } = useDunya();
  const dil = useDil();
  const netler = useDamarNetleri();
  const s = sahne.serit!;
  const { parcalar, soketler } = useMemo(() => {
    const dunya = (p: readonly number[]) => {
      const out: number[] = [];
      for (let i = 0; i < p.length; i += 3) {
        const [x, z] = w(p[i], p[i + 2]);
        out.push(x, p[i + 1] * S, z);
      }
      return out;
    };
    const sirali = [...s.soketler].sort((a, b) => a.x - b.x);
    const dzOf = (k: { y: number }) => Math.sign(s.koridorY - k.y) || 1;
    // 45° katlamanın yönü (σ: kırım x − kx = σ·(z − koridorY)); kablo ilk ve son sokette biter: uçlarda kol
    // ile koridor kırımın iki yanında, temiz bir köşe; aradaki soketlerde koridor altından sürer
    const sigma = (i: number) => (i === 0 ? -dzOf(sirali[0]) : i === sirali.length - 1 ? dzOf(sirali[i]) : 1);
    const ilk = sirali[0];
    const son = sirali[sirali.length - 1];
    const parcalar: SeritParcasi[] = [
      { yol: dunya([ilk.x, MASA, s.koridorY, son.x, MASA, s.koridorY]), en: [0, 0, 1], g: SERIT_GEN * S, bas: sigma(0), uc: sigma(sirali.length - 1) },
    ];
    const soketler: Soket[] = [];
    sirali.forEach((k, i) => {
      const p = sahne.panolar.find((q) => k.x >= q.x && k.x <= q.x + q.w && k.y >= q.y && k.y <= q.y + q.h);
      // koridora doğru: soketin kapağının altından çıkar, panonun kenarını geçince masaya iner
      const dz = dzOf(k);
      const kenar = (p ? (dz > 0 ? p.y + p.h : p.y) : k.y) + dz * 9;
      const yk = SOKET_TABAN + IDC_KABLO_Y;
      const yol = yuvarlakYol([k.x, yk, k.y - dz * 2.8, k.x, yk, kenar, k.x, MASA + 0.5, kenar, k.x, MASA + 0.5, s.koridorY], SERIT_DIRSEK);
      // koridorda 45° katlanır: koldaki k. damar koridordaki k. damarın üstünde biter (σ = −1'de kablo
      // ters yüzüyle döner: 1. damar +x'te, soket de 180° dönük)
      const sg = sigma(i);
      parcalar.push({ yol: dunya(yol), en: [sg, 0, 0], g: SERIT_GEN * S, uc: dz });
      const [x, z] = w(k.x, k.y);
      soketler.push({ x, y: SOKET_TABAN * S, z, kart: p?.kart ?? "", ref: k.ref, etiket: p ? `${panoAdlari(p, dil).kisa} · ${k.ref}` : k.ref, yon: -dz, ters: sg < 0 });
    });
    return { parcalar, soketler };
  }, [s, w, sahne, dil]);
  return (
    <group>
      <DamarSeritleri parcalar={parcalar} palet="kablo" netler={netler} />
      <IdcSoketleri soketler={soketler} netler={netler} />
    </group>
  );
}

// ---------------------------------------------------------------- atlama telleri

const BORU_KOSE = 7;
const BAKIR_KOSE = 5;

/** Bir telin 3D noktaları (mm, sahnenin yerleşiminde): [x, y (yükseklik), z, …] */
function telNoktalari(p3: number[], ox: number, oy: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < p3.length; i += 3) out.push(ox + mmX(p3[i]), TEL_H + p3[i + 2] * KAT_H, oy + mmY(p3[i + 1]));
  return out;
}

/**
 * Telin borusunun ekseni dünyada: delikteki uçtan (yükseklik `alt`, mm) kalkar, köşelerde yuvarlak
 * dirseklerle kıvrılır, öbür deliğe iner. [x, y, z, …] dünya birimi.
 */
function boruYolu(n: readonly number[], alt: number, w: Dunya): number[] {
  const k = n.length;
  const mm = yuvarlakYol([n[0], alt, n[2], ...n, n[k - 3], alt, n[k - 1]]);
  const out: number[] = [];
  for (let i = 0; i < mm.length; i += 3) {
    const [x, z] = w(mm[i], mm[i + 2]);
    out.push(x, mm[i + 1] * S, z);
  }
  return out;
}

const tmpX = new Vector3();
const tmpZ = new Vector3();
const tmpA = new Vector3();
const tmpB = new Vector3();
const BIR_X = new Vector3(1, 0, 0);

/** Boru geometrisi: tek parça (yol) ya da uçları açık silindirler (ekle); yarıçap r (dünya birimi), k köşe */
class Borular {
  pos: number[] = [];
  nor: number[] = [];
  idx: number[] = [];
  constructor(readonly k: number) {}
  /**
   * Noktalardan ([x, y, z, …] dünya birimi) geçen tek parça boru: ardışık halkalar paylaşılır, köşede
   * dikiş ya da boşluk kalmaz. Halka sayısını döndürür (her halka k köşe).
   */
  yol(p: readonly number[], r: number): number {
    const n = p.length / 3;
    const o = this.pos.length / 3;
    const k = this.k;
    for (let i = 0; i < n; i++) {
      // halkanın yönü: iki komşu kirişin açıortayı (uçlarda tek kiriş)
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      tmpA.set(p[3 * i] - p[3 * a], p[3 * i + 1] - p[3 * a + 1], p[3 * i + 2] - p[3 * a + 2]);
      tmpB.set(p[3 * b] - p[3 * i], p[3 * b + 1] - p[3 * i + 1], p[3 * b + 2] - p[3 * i + 2]);
      if (tmpA.lengthSq() > 0) tmpA.normalize();
      if (tmpB.lengthSq() > 0) tmpB.normalize();
      tmpV.addVectors(tmpA, tmpB).normalize();
      // halkanın eksenleri bir öncekinden taşınır (paralel taşıma): boru dirseklerde burulmaz
      if (i === 0) tmpX.copy(Math.abs(tmpV.y) < 0.999 ? YUKARI : BIR_X).cross(tmpV);
      else tmpX.addScaledVector(tmpV, -tmpX.dot(tmpV));
      tmpX.normalize();
      tmpZ.crossVectors(tmpV, tmpX);
      for (let q = 0; q < k; q++) {
        const t = (2 * Math.PI * q) / k;
        const nx = Math.cos(t) * tmpX.x + Math.sin(t) * tmpZ.x;
        const ny = Math.cos(t) * tmpX.y + Math.sin(t) * tmpZ.y;
        const nz = Math.cos(t) * tmpX.z + Math.sin(t) * tmpZ.z;
        this.pos.push(p[3 * i] + nx * r, p[3 * i + 1] + ny * r, p[3 * i + 2] + nz * r);
        this.nor.push(nx, ny, nz);
      }
      if (i === 0) continue;
      const u = o + (i - 1) * k;
      const v = o + i * k;
      for (let q = 0; q < k; q++) {
        const j = (q + 1) % k;
        this.idx.push(u + q, u + j, v + q, u + j, v + j, v + q);
      }
    }
    return n;
  }
  ekle(a: Vector3, b: Vector3, r: number): void {
    tmpV.subVectors(b, a);
    // boruya dik iki eksen
    const yatay = Math.abs(tmpV.y) < 0.999 * tmpV.length();
    tmpX.copy(yatay ? YUKARI : new Vector3(1, 0, 0)).cross(tmpV).normalize();
    tmpZ.crossVectors(tmpV, tmpX).normalize();
    const o = this.pos.length / 3;
    for (let i = 0; i < this.k; i++) {
      const t = (2 * Math.PI * i) / this.k;
      const nx = Math.cos(t) * tmpX.x + Math.sin(t) * tmpZ.x;
      const ny = Math.cos(t) * tmpX.y + Math.sin(t) * tmpZ.y;
      const nz = Math.cos(t) * tmpX.z + Math.sin(t) * tmpZ.z;
      this.pos.push(a.x + nx * r, a.y + ny * r, a.z + nz * r, b.x + nx * r, b.y + ny * r, b.z + nz * r);
      this.nor.push(nx, ny, nz, nx, ny, nz);
      const j = (i + 1) % this.k;
      this.idx.push(o + 2 * i, o + 2 * j, o + 2 * i + 1, o + 2 * j, o + 2 * j + 1, o + 2 * i + 1);
    }
  }
  geometri(renkli: boolean): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute("normal", new BufferAttribute(new Float32Array(this.nor), 3));
    if (renkli) g.setAttribute("color", new BufferAttribute(new Float32Array(this.pos.length), 3));
    g.setIndex(this.pos.length / 3 > 65535 ? new Uint32BufferAttribute(this.idx, 1) : new Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** Yassı şeritler: a → b, genişlik 2r, yüzü yukarı */
class Seritler {
  pos: number[] = [];
  idx: number[] = [];
  ekle(a: Vector3, b: Vector3, r: number): void {
    tmpV.subVectors(b, a);
    tmpX.crossVectors(tmpV, YUKARI).normalize().multiplyScalar(r);
    const o = this.pos.length / 3;
    this.pos.push(a.x - tmpX.x, a.y, a.z - tmpX.z, a.x + tmpX.x, a.y, a.z + tmpX.z, b.x + tmpX.x, b.y, b.z + tmpX.z, b.x - tmpX.x, b.y, b.z - tmpX.z);
    this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  geometri(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute("normal", new BufferAttribute(new Float32Array(this.pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute("color", new BufferAttribute(new Float32Array(this.pos.length), 3));
    g.setIndex(this.pos.length / 3 > 65535 ? new Uint32BufferAttribute(this.idx, 1) : new Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** Sahnenin bütün telleri, pano pano */
interface TelVerisi {
  teller: BbTel[];
  /** telin panosu (sahne.panolar sırası) */
  pano: Int32Array;
  /** telin 3D noktaları (mm, sahnenin yerleşiminde) */
  noktalar: number[][];
  /** parçalar (pano başına board sırası): tellerin sırası */
  parcalar: number[][];
}

function telVerisi(sahne: BbSahnesi): TelVerisi {
  const teller: BbTel[] = [];
  const pano: number[] = [];
  const noktalar: number[][] = [];
  const parcalar: number[][] = [];
  sahne.panolar.forEach((p, pi) => {
    const yollar = yollar3B(p.plan.teller);
    const ny = p.plan.yerlesim.ny;
    const ilk = parcalar.length;
    for (let r = 0; r < ny; r++) parcalar.push([]);
    p.plan.teller.forEach((t, ti) => {
      parcalar[ilk + noktaninBoardu(p.plan.yerlesim.boards, t.yol[0], t.yol[1]).by].push(teller.length);
      teller.push(t);
      pano.push(pi);
      noktalar.push(telNoktalari(yollar[ti], p.x, p.y));
    });
  });
  return { teller, pano: new Int32Array(pano), noktalar, parcalar: parcalar.filter((x) => x.length) };
}

/** Bir parçanın ağları: şeritler hep var, borular ve çıplak uçlar kurulunca */
interface AgParcasi {
  teller: number[];
  serit: Mesh;
  seritTel: Int32Array;
  yalitim: Mesh | null;
  yalitimTel: Int32Array | null;
  bakir: Mesh | null;
  merkez: Vector3;
}

/** Bütün tellerin ağları ve tembel kurulumu */
class TelAgi {
  grup = new Group();
  parcalar: AgParcasi[];
  /** kurulmayı bekleyen parçalar */
  bekleyen: number;
  readonly yalMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.02 });
  readonly serMat = new MeshLambertMaterial({ vertexColors: true });
  readonly bakMat = new MeshStandardMaterial({ color: "#d9d4c8", roughness: 0.3, metalness: 0.9 });

  constructor(readonly v: TelVerisi, readonly w: Dunya) {
    // tıklama: ağların üçgenleri değil, tellerin eksenleri (kapsül) taranır; r3f tekerlekte ve her
    // basışta da ışın attığından üçgen taraması kasardı. Delikten deliğe, dünya biriminde.
    const eksenler = v.noktalar.map((n) => {
      const k = n.length;
      const e: number[] = [];
      for (const [x, y, z] of [[n[0], YALITIM_UCU, n[2]], ...Array.from({ length: k / 3 }, (_, j) => [n[3 * j], n[3 * j + 1], n[3 * j + 2]]), [n[k - 3], YALITIM_UCU, n[k - 1]]]) {
        this.nokta(tmpA, x, y, z);
        e.push(tmpA.x, tmpA.y, tmpA.z);
      }
      return e;
    });
    this.grup.raycast = (rc, hits) => {
      if (!this.grup.visible) return;
      const { origin: o, direction: d } = rc.ray;
      const h = isinTeli([o.x, o.y, o.z], [d.x, d.y, d.z], eksenler, TEL_R * 1.6 * S);
      if (h) hits.push({ distance: h.t, point: rc.ray.at(h.t, new Vector3()), object: this.grup, index: h.tel });
    };
    this.parcalar = v.parcalar.map((teller) => {
      const ser = new Seritler();
      const serTel: number[] = [];
      const m = new Vector3();
      for (const gi of teller) {
        const n = v.noktalar[gi];
        const k = n.length / 3;
        for (let j = 0; j + 1 < k; j++) {
          ser.ekle(this.nokta(tmpA, n[3 * j], n[3 * j + 1], n[3 * j + 2]), this.nokta(tmpB, n[3 * j + 3], n[3 * j + 4], n[3 * j + 5]), TEL_R * S);
          serTel.push(gi);
        }
        m.add(this.nokta(tmpA, n[0], 0, n[2]));
      }
      const serit = new Mesh(ser.geometri(), this.serMat);
      serit.raycast = noRaycast;
      this.grup.add(serit);
      return { teller, serit, seritTel: new Int32Array(serTel), yalitim: null, yalitimTel: null, bakir: null, merkez: m.divideScalar(Math.max(1, teller.length)) };
    });
    this.bekleyen = this.parcalar.length;
  }

  nokta(v: Vector3, x: number, y: number, z: number): Vector3 {
    const [wx, wz] = this.w(x, z);
    return v.set(wx, y * S, wz);
  }

  /** Parçanın borularını ve çıplak uçlarını kur */
  kur(q: AgParcasi): void {
    const yal = new Borular(BORU_KOSE);
    const yalTel: number[] = [];
    const bak = new Borular(BAKIR_KOSE);
    for (const gi of q.teller) {
      const n = this.v.noktalar[gi];
      const k = n.length / 3;
      // yalıtım tek parça boru: deliğin ağzından kalkar, köşelerde kıvrılır, öbür deliğe iner
      const halka = yal.yol(boruYolu(n, YALITIM_UCU, this.w), TEL_R * S);
      for (let h = 0; h < halka; h++) yalTel.push(gi);
      // çıplak bakır deliğin ağzından içeri
      for (const j of [0, k - 1]) {
        const x = n[3 * j];
        const z = n[3 * j + 2];
        bak.ekle(this.nokta(tmpA, x, YALITIM_UCU + 0.1, z), this.nokta(tmpB, x, -0.6, z), BAKIR_R * S);
      }
    }
    q.yalitim = new Mesh(yal.geometri(true), this.yalMat);
    q.yalitimTel = new Int32Array(yalTel);
    q.bakir = new Mesh(bak.geometri(false), this.bakMat);
    for (const m of [q.yalitim, q.bakir]) {
      m.raycast = noRaycast;
      m.visible = false;
      this.grup.add(m);
    }
    this.bekleyen--;
  }

  /** Bekleyen parçaları hedefe yakın olandan başlayarak kur (süre sınırıyla, ms); kurulanları döndürür */
  kurBekleyenleri(hedef: Vector3, sureMs: number): AgParcasi[] {
    const kurulan: AgParcasi[] = [];
    if (!this.bekleyen) return kurulan;
    const t0 = performance.now();
    const sira = this.parcalar.filter((q) => !q.yalitim).sort((a, b) => a.merkez.distanceToSquared(hedef) - b.merkez.distanceToSquared(hedef));
    for (const q of sira) {
      this.kur(q);
      kurulan.push(q);
      if (performance.now() - t0 > sureMs) break;
    }
    return kurulan;
  }

  /** Yakından borular (kurulduysa), uzaktan şeritler */
  goster(uzak: boolean): void {
    for (const q of this.parcalar) {
      const boru = !uzak && !!q.yalitim;
      q.serit.visible = !boru;
      if (q.yalitim) q.yalitim.visible = boru;
      if (q.bakir) q.bakir.visible = boru;
    }
  }

  /** şerit başına 4 köşe; boruda halka başına BORU_KOSE köşe (yalitimTel halka başına) */
  boya(q: AgParcasi, renkler: Float32Array): void {
    boya(q.serit.geometry, q.seritTel, 4, renkler);
    if (q.yalitim) boya(q.yalitim.geometry, q.yalitimTel!, 2 * BORU_KOSE, renkler);
  }

  dispose(): void {
    for (const q of this.parcalar) for (const m of [q.serit, q.yalitim, q.bakir]) m?.geometry.dispose();
    for (const m of [this.yalMat, this.serMat, this.bakMat]) m.dispose();
  }
}

const SEVIYE = LEVEL_COLOR.map((c) => new Color(c));
/** tellerde 0 koyu kartta değil krem board'da: koyu mavi okunur */
SEVIYE[0] = new Color("#2f6fd6");
const KARTON = new Color("#f2eee3");
/** kamera bundan yüksekteyse (dünya birimi) teller yassı şerit olarak çizilir */
const UZAK = 32;
/** uzaktan, seçim yokken tellerin krem board rengine karışma oranı */
const UZAK_SOLUKLUK = 0.5;

/** Seçili çipin ya da netin netleri (GND / VCC yalnız istenirse) */
function seciliNetler(chip: string | null, net: number | null, power: boolean): Set<number> {
  const s = new Set<number>();
  if (net !== null) s.add(net);
  const part = findPart(chip);
  const pins = part?.chip?.pins ?? part?.passive?.pins ?? [];
  for (const p of pins) if (p.net > 1 || (power && p.net >= 0)) s.add(p.net);
  return s;
}

/** Geometrinin köşe renkleri: her öğe (boru ya da şerit) `kose` köşe, rengi telinin rengi */
function boya(g: BufferGeometry, tel: Int32Array, kose: number, renkler: Float32Array): void {
  const attr = g.getAttribute("color") as BufferAttribute;
  const arr = attr.array as Float32Array;
  let o = 0;
  for (let k = 0; k < tel.length; k++) {
    const i = 3 * tel[k];
    const r = renkler[i], gg = renkler[i + 1], b = renkler[i + 2];
    for (let v = 0; v < kose; v++, o += 3) {
      arr[o] = r;
      arr[o + 1] = gg;
      arr[o + 2] = b;
    }
  }
  attr.needsUpdate = true;
}

/** Kameranın baktığı yer: OrbitControls'un hedefi (yoksa kameranın altı) */
const hedefi = (camera: Camera, controls: unknown): Vector3 => (controls as OrbitControlsImpl | null)?.target ?? new Vector3(camera.position.x, 0, camera.position.z);

export function AtlamaTelleri() {
  const { w } = useDunya();
  const sahne = bbSahnesi();
  const veri = useMemo(() => telVerisi(sahne), [sahne]);
  const agi = useMemo(() => new TelAgi(veri, w), [veri, w]);
  useEffect(() => () => agi.dispose(), [agi]);
  const teller = veri.teller;
  const yalitimRengi = useMemo(() => teller.map((t, i) => new Color(sahne.panolar[veri.pano[i]].renk(t.renk).hex)), [teller, sahne, veri]);
  const panoNo = (kart: string) => sahne.panolar.findIndex((p) => p.kart === kart);

  const mode = useKart((s) => s.wires);
  const chip = useKart((s) => s.chip);
  const net = useKart((s) => s.net);
  const power = useKart((s) => s.power);
  const kurulumAcik = useBbKurulum((s) => s.acik);
  const yapilan = useBbKurulum((s) => s.yapilan);
  const kurPano = useBbKurulum((s) => s.pano);
  const kurAsama = useBbKurulum((s) => s.asama);
  const tel = useKart((s) => s.tel);
  const secili = useMemo(() => seciliNetler(chip, net, power), [chip, net, power]);
  /** seçili telin sahnedeki sırası (yoksa -1) */
  const seciliTel = useMemo(() => (tel ? teller.findIndex((t, i) => t.no === tel.no && sahne.panolar[veri.pano[i]].kart === tel.kart) : -1), [tel, teller, sahne, veri]);
  const durum = useRef({ anahtar: "", surum: -1, agi });
  const renkler = useMemo(() => new Float32Array(teller.length * 3), [teller]);
  useFrame(({ camera, controls }) => {
    const uzak = camera.position.y > UZAK;
    // boruları kameranın baktığı yerden başlayarak kur: yakındayken kare başına daha çok
    const kurulan = agi.kurBekleyenleri(hedefi(camera, controls), uzak ? 4 : 10);
    agi.goster(uzak);
    const canli = mode === "hepsi" || (!kurulumAcik && secili.size > 0);
    // uzaktan (seçim yokken) teller soluk: çipler, LED'ler ve modüllerin tabanları öne çıkar
    const soluk = uzak && !canli && !kurulumAcik;
    const anahtar = `${mode}|${chip}|${net}|${power}|${kurulumAcik}|${yapilan.size}|${kurPano}|${kurAsama}|${soluk}|${seciliTel}`;
    const d = durum.current;
    if (d.agi === agi && anahtar === d.anahtar && (!canli || d.surum === liveNets.version)) {
      for (const q of kurulan) agi.boya(q, renkler);
      return;
    }
    durum.current = { anahtar, surum: liveNets.version, agi };
    const v = liveNets.values;
    const kp = panoNo(kurPano);
    for (let i = 0; i < teller.length; i++) {
      const t = teller[i];
      const seviye = () => {
        const lv = t.net <= 1 ? t.net : v ? (v[t.net] ?? 3) : 3;
        return SEVIYE[lv] ?? SEVIYE[3];
      };
      if (kurulumAcik) {
        tmpC.copy(yalitimRengi[i]);
        if (veri.pano[i] !== kp || (kurAsama !== null && t.asama !== kurAsama)) tmpC.lerp(KARTON, 0.9);
        else if (!yapilan.has(t.no)) tmpC.lerp(KARTON, 0.82);
      } else if (seciliTel >= 0) {
        tmpC.copy(yalitimRengi[i]);
        if (i !== seciliTel) tmpC.lerp(KARTON, 0.72);
      } else if (mode === "hepsi") {
        tmpC.copy(seviye());
        if (secili.size && !secili.has(t.net)) tmpC.lerp(KARTON, 0.7);
      } else if (secili.size) {
        if (secili.has(t.net)) tmpC.copy(seviye());
        else tmpC.copy(yalitimRengi[i]).lerp(KARTON, 0.72);
      } else {
        tmpC.copy(yalitimRengi[i]);
        if (soluk) tmpC.lerp(KARTON, UZAK_SOLUKLUK);
      }
      renkler[3 * i] = tmpC.r;
      renkler[3 * i + 1] = tmpC.g;
      renkler[3 * i + 2] = tmpC.b;
    }
    for (const q of agi.parcalar) agi.boya(q, renkler);
  });
  const gorunur = mode !== "yok" || kurulumAcik;
  // tele tıklayınca: kurulum modunda (o panodaysa) odağa gelir, değilse seçilir (baştan sona vurgu)
  const tikla = (e: ThreeEvent<MouseEvent>) => {
    // grubun ışın testi telin sırasını index'e yazar (TelAgi)
    const gi = e.index;
    if (gi === undefined) return;
    e.stopPropagation();
    const kart = sahne.panolar[veri.pano[gi]].kart;
    const k = useBbKurulum.getState();
    if (k.acik) {
      if (k.pano === kart) k.sec(teller[gi].no);
    } else useKart.getState().selectTel({ kart, no: teller[gi].no });
  };
  return <primitive object={agi.grup} visible={gorunur} onClick={tikla} />;
}

// ---------------------------------------------------------------- kurulum modu: odaktaki tel

/**
 * Odaktaki tel kalın ve parlak, uçlarında nabız gibi atan halkalar. Kurulum modunda sıradaki tel (kamera
 * iki ucu çerçeveler); kurulum kapalıyken tıklanıp seçilen tel (useKart.tel; kamera yerinde kalır).
 */
export function BbKurulumSahne() {
  const acik = useBbKurulum((s) => s.acik);
  const kurTel = useBbKurulum(bbSeciliTel);
  const pano = useBbKurulum((s) => s.pano);
  const secim = useKart((s) => s.tel);
  if (acik) {
    if (!kurTel) return null;
    const p = bbPano(pano);
    return (
      <group>
        <SeciliTel tel={kurTel} p={p} />
        <KurulumKamera tel={kurTel} p={p} />
      </group>
    );
  }
  const p = secim && bbSahnesi().panolar.find((x) => x.kart === secim.kart);
  // tellerin no'su kurulum sırası: no = sıra + 1 (bbSeciliTel gibi)
  const tel = p && p.plan.teller[secim.no - 1];
  return tel ? <SeciliTel tel={tel} p={p} /> : null;
}

function SeciliTel({ tel, p }: { tel: BbTel; p: BbPanosu }) {
  const { w } = useDunya();
  const obj = useMemo(() => {
    const i = p.plan.teller.findIndex((t) => t.no === tel.no);
    const n = telNoktalari(yollar3B(p.plan.teller)[i], p.x, p.y);
    const hex = p.renk(tel.renk).hex;
    const renk = new Color(hex);
    const mat = new MeshStandardMaterial({ color: renk, emissive: renk, emissiveIntensity: 0.55, roughness: 0.4, depthTest: false, transparent: true });
    // kalın tek parça boru; uçları board'un yüzüne iner
    const b = new Borular(BORU_KOSE);
    b.yol(boruYolu(n, 0, w), TEL_R * 1.5 * S);
    const geo = b.geometri(false);
    const k = n.length / 3;
    const uclar = [0, k - 1].map((j) => w(n[3 * j], n[3 * j + 2]));
    return { mat, geo, uclar, halka: tel.renk === "beyaz" || tel.renk === "siyah" ? "#ffffff" : hex };
  }, [tel, p, w]);
  useEffect(() => () => {
    obj.mat.dispose();
    obj.geo.dispose();
  }, [obj]);
  const halkalar = useRef<(Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const s = 1 + 0.4 * (0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 5));
    for (const m of halkalar.current) m?.scale.set(s, s, s);
  });
  return (
    <group renderOrder={20}>
      <mesh geometry={obj.geo} material={obj.mat} renderOrder={20} raycast={noRaycast} />
      {obj.uclar.map(([x, z], i) => (
        <mesh key={`h${i}`} ref={(m) => (halkalar.current[i] = m)} position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={21} raycast={noRaycast}>
          <ringGeometry args={[0.14, 0.22, 28]} />
          <meshBasicMaterial color={obj.halka} side={DoubleSide} depthTest={false} transparent />
        </mesh>
      ))}
    </group>
  );
}

function KurulumKamera({ tel, p }: { tel: BbTel; p: BbPanosu }) {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const izle = useBbKurulum((s) => s.izle);
  const { w } = useDunya();
  const anim = useRef<{ target: Vector3; cam: Vector3; t0: Vector3; c0: Vector3; t: number } | null>(null);
  useEffect(() => {
    if (!controls || !izle) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < tel.yol.length; i += 2) {
      x0 = Math.min(x0, p.x + mmX(tel.yol[i])); x1 = Math.max(x1, p.x + mmX(tel.yol[i]));
      y0 = Math.min(y0, p.y + mmY(tel.yol[i + 1])); y1 = Math.max(y1, p.y + mmY(tel.yol[i + 1]));
    }
    const [ax, az] = w(x0, y0);
    const [bx, bz] = w(x1, y1);
    const d = Math.min(90, Math.max(6, Math.max(bx - ax, (bz - az) * 1.4) * 1.5));
    const tx = (ax + bx) / 2;
    const tz = (az + bz) / 2;
    anim.current = { target: new Vector3(tx, 0, tz), cam: new Vector3(tx, d * 0.85, tz + d * 0.5), t0: controls.target.clone(), c0: camera.position.clone(), t: 0 };
  }, [tel, p, izle, controls, camera, w]);
  useFrame((_, dt) => {
    const an = anim.current;
    if (!an || !controls) return;
    an.t = ucusAdimi(an.t, dt, 1.6);
    const k = 1 - Math.pow(1 - an.t, 3);
    controls.target.lerpVectors(an.t0, an.target, k);
    camera.position.lerpVectors(an.c0, an.cam, k);
    controls.update();
    if (an.t >= 1) anim.current = null;
  });
  return null;
}

/**
 * Genel bakış: bütün taban plakaları önden (anahtarların olduğu kenardan) eğik; arkadakiler de okunur.
 * kay: hedef sağa kayar (bilgisayarda sağ üstteki VGA paneli panoları örtmesin), yakin: uzaklık çarpanı.
 */
export function breadboardGenelBakis(width: number, height: number, kay = 0, yakin = 1.42): { target: Vector3; cam: Vector3 } {
  const L = Math.max(width, height * 1.2) * S;
  const d = L * yakin;
  const e = (54 * Math.PI) / 180;
  const zc = -height * S * 0.03;
  const x = L * kay;
  return { target: new Vector3(x, 0, zc), cam: new Vector3(x, d * Math.sin(e), zc + d * Math.cos(e)) };
}
