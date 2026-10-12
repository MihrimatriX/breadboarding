// Hesap makinesinin breadboard görünümü 3D'de (hesap8/breadboard): taban plakası, 60 board (krem
// gövde; delik deseni, kırmızı / mavi ray çizgileri, sütun numaraları ve satır harfleri tek bir
// dokudan), board adları ve atlama telleri. Teller gerçek atlama telleri gibi: renkli yalıtım düz
// yatar, uçlarda deliğe iner, deliğin ağzında çıplak bakır görünür; önce takılan tel altta kalır
// (kesişmede üstteki tel kamburlaşır). Bütün teller iki örneklenmiş ağda (yalıtım, bakır).
//
// Renkler: "seçili çip" kipinde teller yalıtımlarının renginde; bir çip ya da net seçilince o
// netlerin telleri canlı seviyenin renginde (0 mavi, 1 kırmızı) parlar, ötekiler soluklaşır. "hepsi"
// kipinde bütün teller canlı seviyede; "yok" kipinde teller gizli. Kurulum modu açıkken takılan
// teller kendi renginde, takılmayanlar soluk; odaktaki tel ayrıca kalın ve uçları nabız gibi atar.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, InstancedMesh, MeshLambertMaterial, MeshStandardMaterial,
  Object3D, PlaneGeometry, Quaternion, SRGBColorSpace, Uint16BufferAttribute, Uint32BufferAttribute, Vector3, type Group, type Mesh,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { BY_ADIM, delikVar, KENAR_ALT, KENAR_SAG, KENAR_SOL, KENAR_UST, mmX, mmY, satirHarfi, SUTUN } from "../../hesap8/breadboard/geometri";
import { boardDikdortgeni } from "../../hesap8/breadboard/gorunum";
import { telYollari3B, type BbTel } from "../../hesap8/breadboard/plan";
import { renkTanimi } from "../../hesap8/breadboard/renk";
import { aktifHesapGorunumu, aktifKart, hesapPlani } from "./aktif";
import { bbSeciliTel, useBbKurulum } from "./bbKurulum";
import { LEVEL_COLOR } from "./levels";
import { boardLayoutData, findPart, liveNets, useKart } from "./store";
import { TextQuads, type TextItem } from "./TextQuads";

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

/** Breadboard görünümü mü (hesap makinesi sahnede ve breadboard seçili) */
export const breadboardSahnede = (): boolean => aktifKart() === "hesap" && aktifHesapGorunumu() === "breadboard";

function useDunya() {
  const lay = boardLayoutData();
  return useMemo(() => {
    const cx = lay.width / 2;
    const cz = lay.height / 2;
    return { lay, w: (x: number, y: number): [number, number] => [(x - cx) * S, (y - cz) * S] };
  }, [lay]);
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

// ---------------------------------------------------------------- taban ve board'lar

export function BreadboardTabani() {
  const { lay, w } = useDunya();
  const plan = hesapPlani();
  const boards = plan.yerlesim.boards;
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
    boards.forEach((b, i) => {
      const d = boardDikdortgeni(b.bx, b.by);
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
  const adlar = useMemo<TextItem[]>(() => boards.map((b) => {
    const d = boardDikdortgeni(b.bx, b.by);
    const [x, z] = w(d.x + 0.4, d.y + 0.9);
    return { text: b.ad, x, z, w: 7.2 * S, d: 2.25 * S, y: 0.002, color: "#4b463d", align: "left" as const };
  }), [boards, w]);
  return (
    <group>
      <mesh position={[0, (-BOARD_KALINLIK - PLAKA_KALINLIK / 2) * S, 0]} raycast={noRaycast}>
        <boxGeometry args={[lay.width * S, PLAKA_KALINLIK * S, lay.height * S]} />
        <meshStandardMaterial color="#3a3d42" roughness={0.6} metalness={0.25} />
      </mesh>
      <instancedMesh ref={govde} args={[govdeGeo, govdeMat, boards.length]} raycast={noRaycast} />
      <instancedMesh ref={ust} args={[ustGeo, ustMat, boards.length]} raycast={noRaycast} />
      <TextQuads items={adlar} cellW={256} cellH={80} font={52} />
    </group>
  );
}

// ---------------------------------------------------------------- atlama telleri

/**
 * Tellerin ağları, parça parça (taban plakasının board sıraları: yakından bakınca ekran dışındaki
 * parçalar çizilmez). Her parçada üç birleştirilmiş geometri: yalıtım boruları (köşeden köşeye ve
 * uçlarda deliğe inen), uçların çıplak bakırı ve uzaktan bakış için yassı şeritler (parça başına iki
 * üçgen). Durağan geometri tek çizim çağrısıdır; renkler köşe renkleriyle değişir.
 */
interface TelParcasi {
  yalitim: BufferGeometry;
  /** her borunun teli (boru başına BORU_KOSE * 2 köşe) */
  yalitimTel: Int32Array;
  serit: BufferGeometry;
  seritTel: Int32Array;
  bakir: BufferGeometry;
}

const BORU_KOSE = 7;
const BAKIR_KOSE = 5;

/** Bir telin 3D noktaları (mm): [x, y (yükseklik), z, …] */
function telNoktalari(p3: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < p3.length; i += 3) out.push(mmX(p3[i]), TEL_H + p3[i + 2] * KAT_H, mmY(p3[i + 1]));
  return out;
}

const tmpX = new Vector3();
const tmpZ = new Vector3();
const tmpA = new Vector3();
const tmpB = new Vector3();

/** Boru (uçları açık silindir) geometrisi: a → b, yarıçap r (dünya birimi), k köşe */
class Borular {
  pos: number[] = [];
  nor: number[] = [];
  idx: number[] = [];
  constructor(readonly k: number) {}
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

function telAgiKur(teller: readonly BbTel[], w: (x: number, y: number) => [number, number], parcaSayisi: number, parcasi: (t: BbTel) => number): TelParcasi[] {
  const yollar = telYollari3B(teller);
  const P = Array.from({ length: parcaSayisi }, () => ({ yal: new Borular(BORU_KOSE), yalTel: [] as number[], ser: new Seritler(), serTel: [] as number[], bak: new Borular(BAKIR_KOSE) }));
  const nokta = (v: Vector3, x: number, y: number, z: number) => {
    const [wx, wz] = w(x, z);
    return v.set(wx, y * S, wz);
  };
  yollar.forEach((p3, ti) => {
    const q = P[parcasi(teller[ti])];
    const n = telNoktalari(p3);
    const k = n.length / 3;
    for (let j = 0; j + 1 < k; j++) {
      let [ax, ay, az] = [n[3 * j], n[3 * j + 1], n[3 * j + 2]];
      let [bx, by, bz] = [n[3 * j + 3], n[3 * j + 4], n[3 * j + 5]];
      // yatay parçalar köşelerde yarıçap kadar uzar: dirsekler kapalı görünür
      if (ay === by) {
        const dx = Math.sign(bx - ax);
        const dz = Math.sign(bz - az);
        ax -= dx * TEL_R; az -= dz * TEL_R;
        bx += dx * TEL_R; bz += dz * TEL_R;
      }
      nokta(tmpA, ax, ay, az);
      nokta(tmpB, bx, by, bz);
      q.yal.ekle(tmpA, tmpB, TEL_R * S);
      q.yalTel.push(ti);
      q.ser.ekle(tmpA, tmpB, TEL_R * S);
      q.serTel.push(ti);
    }
    // uçlar: yalıtım deliğe iner, çıplak bakır deliğin ağzından içeri
    for (const j of [0, k - 1]) {
      const x = n[3 * j];
      const z = n[3 * j + 2];
      q.yal.ekle(nokta(tmpA, x, n[3 * j + 1], z), nokta(tmpB, x, YALITIM_UCU, z), TEL_R * S);
      q.yalTel.push(ti);
      q.bak.ekle(nokta(tmpA, x, YALITIM_UCU + 0.1, z), nokta(tmpB, x, -0.6, z), BAKIR_R * S);
    }
  });
  return P.map((q) => ({
    yalitim: q.yal.geometri(true), yalitimTel: new Int32Array(q.yalTel),
    serit: q.ser.geometri(), seritTel: new Int32Array(q.serTel),
    bakir: q.bak.geometri(false),
  }));
}

const SEVIYE = LEVEL_COLOR.map((c) => new Color(c));
/** tellerde 0 koyu kartta değil krem board'da: koyu mavi okunur */
SEVIYE[0] = new Color("#2f6fd6");
const KARTON = new Color("#f2eee3");
/** kamera bundan yüksekteyse (dünya birimi) teller yassı şerit olarak çizilir */
const UZAK = 32;

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

export function AtlamaTelleri() {
  const { w } = useDunya();
  const plan = hesapPlani();
  const teller = plan.teller;
  const ny = plan.yerlesim.ny;
  const parcalar = useMemo(() => telAgiKur(teller, w, ny, (t) => Math.min(ny - 1, Math.max(0, Math.floor((t.yol[1] + 3) / BY_ADIM)))), [teller, w, ny]);
  useEffect(() => () => parcalar.forEach((q) => [q.yalitim, q.serit, q.bakir].forEach((g) => g.dispose())), [parcalar]);
  const yakinGrup = useRef<Group>(null);
  const uzakGrup = useRef<Group>(null);
  const [yalMat, serMat, bakMat] = useMemo(() => [
    new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.02 }),
    new MeshLambertMaterial({ vertexColors: true }),
    new MeshStandardMaterial({ color: "#d9d4c8", roughness: 0.3, metalness: 0.9 }),
  ] as const, []);
  useEffect(() => () => [yalMat, serMat, bakMat].forEach((x) => x.dispose()), [yalMat, serMat, bakMat]);
  const yalitimRengi = useMemo(() => teller.map((t) => new Color(renkTanimi(t.renk).hex)), [teller]);

  const mode = useKart((s) => s.wires);
  const chip = useKart((s) => s.chip);
  const net = useKart((s) => s.net);
  const power = useKart((s) => s.power);
  const kurulumAcik = useBbKurulum((s) => s.acik);
  const yapilan = useBbKurulum((s) => s.yapilan);
  const secili = useMemo(() => seciliNetler(chip, net, power), [chip, net, power]);
  const durum = useRef({ anahtar: "", surum: -1, parcalar });
  const renkler = useMemo(() => new Float32Array(teller.length * 3), [teller]);
  useFrame(({ camera }) => {
    // uzaktan yassı şeritler, yakından borular
    const uzak = camera.position.y > UZAK;
    if (yakinGrup.current) yakinGrup.current.visible = !uzak;
    if (uzakGrup.current) uzakGrup.current.visible = uzak;
    const canli = mode === "hepsi" || (!kurulumAcik && secili.size > 0);
    const anahtar = `${mode}|${chip}|${net}|${power}|${kurulumAcik}|${yapilan.size}`;
    const d = durum.current;
    if (d.parcalar === parcalar && anahtar === d.anahtar && (!canli || d.surum === liveNets.version)) return;
    durum.current = { anahtar, surum: liveNets.version, parcalar };
    const v = liveNets.values;
    for (let i = 0; i < teller.length; i++) {
      const t = teller[i];
      const seviye = () => {
        const lv = t.net <= 1 ? t.net : v ? (v[t.net] ?? 3) : 3;
        return SEVIYE[lv] ?? SEVIYE[3];
      };
      if (kurulumAcik) {
        tmpC.copy(yalitimRengi[i]);
        if (!yapilan.has(t.no)) tmpC.lerp(KARTON, 0.82);
      } else if (mode === "hepsi") {
        tmpC.copy(seviye());
        if (secili.size && !secili.has(t.net)) tmpC.lerp(KARTON, 0.7);
      } else if (secili.size) {
        if (secili.has(t.net)) tmpC.copy(seviye());
        else tmpC.copy(yalitimRengi[i]).lerp(KARTON, 0.72);
      } else {
        tmpC.copy(yalitimRengi[i]);
      }
      renkler[3 * i] = tmpC.r;
      renkler[3 * i + 1] = tmpC.g;
      renkler[3 * i + 2] = tmpC.b;
    }
    for (const q of parcalar) {
      boya(q.yalitim, q.yalitimTel, 2 * BORU_KOSE, renkler);
      boya(q.serit, q.seritTel, 4, renkler);
    }
  });
  const gorunur = mode !== "yok" || kurulumAcik;
  return (
    <group visible={gorunur}>
      <group ref={yakinGrup}>
        {parcalar.map((q, i) => (
          <group key={i}>
            <mesh geometry={q.yalitim} material={yalMat} raycast={noRaycast} />
            <mesh geometry={q.bakir} material={bakMat} raycast={noRaycast} />
          </group>
        ))}
      </group>
      <group ref={uzakGrup} visible={false}>
        {parcalar.map((q, i) => (
          <mesh key={i} geometry={q.serit} material={serMat} raycast={noRaycast} />
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- kurulum modu: odaktaki tel

/** Odaktaki tel kalın ve parlak, uçlarında nabız gibi atan halkalar; kamera iki ucu çerçeveler */
export function BbKurulumSahne() {
  const acik = useBbKurulum((s) => s.acik);
  const tel = useBbKurulum(bbSeciliTel);
  if (!acik || !tel) return null;
  return (
    <group>
      <SeciliTel tel={tel} />
      <KurulumKamera tel={tel} />
    </group>
  );
}

function SeciliTel({ tel }: { tel: BbTel }) {
  const { w } = useDunya();
  const plan = hesapPlani();
  const obj = useMemo(() => {
    const i = plan.teller.findIndex((t) => t.no === tel.no);
    const p3 = telYollari3B(plan.teller)[i];
    const n = telNoktalari(p3);
    const renk = new Color(renkTanimi(tel.renk).hex);
    const mat = new MeshStandardMaterial({ color: renk, emissive: renk, emissiveIntensity: 0.55, roughness: 0.4, depthTest: false, transparent: true });
    const geo = new CylinderGeometry(1, 1, 1, 10, 1, false);
    const parcalar: { p: [number, number, number]; q: Quaternion; s: [number, number, number] }[] = [];
    const ekle = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      const [x0, z0] = w(ax, az);
      const [x1, z1] = w(bx, bz);
      tmpV.set(x1 - x0, (by - ay) * S, z1 - z0);
      const len = tmpV.length();
      if (len < 1e-6) return;
      parcalar.push({ p: [(x0 + x1) / 2, ((ay + by) / 2) * S, (z0 + z1) / 2], q: new Quaternion().setFromUnitVectors(YUKARI, tmpV.normalize()), s: [TEL_R * 1.5 * S, len + TEL_R * 1.5 * S, TEL_R * 1.5 * S] });
    };
    const k = n.length / 3;
    for (let j = 0; j + 1 < k; j++) ekle(n[3 * j], n[3 * j + 1], n[3 * j + 2], n[3 * j + 3], n[3 * j + 4], n[3 * j + 5]);
    for (const j of [0, k - 1]) ekle(n[3 * j], n[3 * j + 1], n[3 * j + 2], n[3 * j], 0, n[3 * j + 2]);
    const uclar = [0, k - 1].map((j) => w(n[3 * j], n[3 * j + 2]));
    return { mat, geo, parcalar, uclar, halka: tel.renk === "beyaz" || tel.renk === "siyah" ? "#ffffff" : renkTanimi(tel.renk).hex };
  }, [tel, plan, w]);
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
      {obj.parcalar.map((x, i) => (
        <mesh key={i} geometry={obj.geo} material={obj.mat} position={x.p} quaternion={x.q} scale={x.s} renderOrder={20} raycast={noRaycast} />
      ))}
      {obj.uclar.map(([x, z], i) => (
        <mesh key={`h${i}`} ref={(m) => (halkalar.current[i] = m)} position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={21} raycast={noRaycast}>
          <ringGeometry args={[0.14, 0.22, 28]} />
          <meshBasicMaterial color={obj.halka} side={DoubleSide} depthTest={false} transparent />
        </mesh>
      ))}
    </group>
  );
}

function KurulumKamera({ tel }: { tel: BbTel }) {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const izle = useBbKurulum((s) => s.izle);
  const { w } = useDunya();
  const anim = useRef<{ target: Vector3; cam: Vector3; t0: Vector3; c0: Vector3; t: number } | null>(null);
  useEffect(() => {
    if (!controls || !izle) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < tel.yol.length; i += 2) {
      x0 = Math.min(x0, mmX(tel.yol[i])); x1 = Math.max(x1, mmX(tel.yol[i]));
      y0 = Math.min(y0, mmY(tel.yol[i + 1])); y1 = Math.max(y1, mmY(tel.yol[i + 1]));
    }
    const [ax, az] = w(x0, y0);
    const [bx, bz] = w(x1, y1);
    const d = Math.min(90, Math.max(6, Math.max(bx - ax, (bz - az) * 1.4) * 1.5));
    const tx = (ax + bx) / 2;
    const tz = (az + bz) / 2;
    anim.current = { target: new Vector3(tx, 0, tz), cam: new Vector3(tx, d * 0.85, tz + d * 0.5), t0: controls.target.clone(), c0: camera.position.clone(), t: 0 };
  }, [tel, izle, controls, camera, w]);
  useFrame((_, dt) => {
    const an = anim.current;
    if (!an || !controls) return;
    an.t = Math.min(1, an.t + dt * 1.6);
    const k = 1 - Math.pow(1 - an.t, 3);
    controls.target.lerpVectors(an.t0, an.target, k);
    camera.position.lerpVectors(an.c0, an.cam, k);
    controls.update();
    if (an.t >= 1) anim.current = null;
  });
  return null;
}

/** Genel bakış: bütün taban plakası önden (anahtarların olduğu kenardan) eğik; göstergeler arkada okunur */
export function breadboardGenelBakis(width: number, height: number): { target: Vector3; cam: Vector3 } {
  const L = Math.max(width, height * 1.2) * S;
  const d = L * 1.42;
  const e = (54 * Math.PI) / 180;
  const zc = -height * S * 0.03;
  return { target: new Vector3(0, 0, zc), cam: new Vector3(0, d * Math.sin(e), zc + d * Math.cos(e)) };
}
