// Şerit kablo ve arka panel yolları için saf geometri: bir eksen yolu boyunca düz şerit (enine doku
// koordinatı u: 0'da 1. damar, 1'de sonuncusu), şeride değen ışının hangi damara değdiği, arka panel
// pinlerinin sinyalleri. Damarlar ayrı çizgiler değil, şeridin dokusu (Serit3D.tsx): yakından keskin,
// uzaktan mipmap ile harelenmeden okunur. React'ten bağımsız; testleri cpu16/tests/breadboard-3d.test.ts.

import { BufferAttribute, BufferGeometry } from "three";
import { BACKPLANE, BACKPLANE_PINS } from "../../cpu16/board/passives";

/** Şerit kablonun damar sayısı ve adımı (mm): 2 × 32 IDC, 64 × 1,27 = 81,28 mm */
export const DAMAR = BACKPLANE_PINS;
export const DAMAR_ADIM = 1.27;

type Vec = readonly [number, number, number];

/** İlk ya da son parçanın birim yönü (ilerleme yönünde) */
function uctakiYon(yol: readonly number[], son: boolean): [number, number, number] {
  const a = son ? yol.length - 6 : 0;
  const t = [yol[a + 3] - yol[a], yol[a + 4] - yol[a + 1], yol[a + 5] - yol[a + 2]];
  const l = Math.hypot(t[0], t[1], t[2]) || 1;
  return [t[0] / l, t[1] / l, t[2] / l];
}

/**
 * Düz şerit: eksen yolu (dünya, [x, y, z, …]) boyunca, genişlik yönü `en` (birim vektör, yola dik), genişlik
 * g. Yüzü ilk noktada yukarı bakar; çift yüzlü malzemeyle çizilir. uv: u enine (−en kenarı 0), v sabit.
 * uc ≠ 0: son kenar eğik (45° katlama): enine e'deki nokta boyuna uc·e kayar; kablo dik açıyla dönerken
 * koldaki k. damar koridordaki k. damarın tam üstünde biter. bas: ilk kenar için aynısı (koridorun başı).
 */
export function seritGeometrisi(yol: readonly number[], en: Vec, g: number, uc = 0, bas = 0): BufferGeometry {
  const n = yol.length / 3;
  const pos = new Float32Array(n * 6);
  const nor = new Float32Array(n * 6);
  const uv = new Float32Array(n * 4);
  const h = g / 2;
  let isaret = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const tx = yol[3 * b] - yol[3 * a], ty = yol[3 * b + 1] - yol[3 * a + 1], tz = yol[3 * b + 2] - yol[3 * a + 2];
    // yüzün normali en × T; ilk noktada yukarı bakacak yönde
    let nx = en[1] * tz - en[2] * ty, ny = en[2] * tx - en[0] * tz, nz = en[0] * ty - en[1] * tx;
    const l = Math.hypot(nx, ny, nz) || 1;
    if (!isaret) isaret = ny < 0 ? -1 : 1;
    nx = (isaret * nx) / l; ny = (isaret * ny) / l; nz = (isaret * nz) / l;
    const [x, y, z] = [yol[3 * i], yol[3 * i + 1], yol[3 * i + 2]];
    pos.set([x - en[0] * h, y - en[1] * h, z - en[2] * h, x + en[0] * h, y + en[1] * h, z + en[2] * h], 6 * i);
    nor.set([nx, ny, nz, nx, ny, nz], 6 * i);
    uv.set([0, 0.5, 1, 0.5], 4 * i);
  }
  // eğik uçlar: enine e'deki köşe boyuna (uc ya da bas)·e kayar
  for (const [k, i] of [[uc, n - 1], [bas, 0]] as const) {
    if (!k || n < 2) continue;
    const t = uctakiYon(yol, i > 0);
    for (let e = 0; e < 3; e++) {
      pos[6 * i + e] -= t[e] * h * k;
      pos[6 * i + 3 + e] += t[e] * h * k;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const [a0, a1, b0, b1] = [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 3];
    // üçgenin yüzü (a1 − a0) × (b0 − a0) ∝ en × T: normalle aynı yöne baksın
    if (isaret > 0) idx.push(a0, a1, b0, a1, b1, b0);
    else idx.push(a0, b0, a1, a1, b0, b1);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("normal", new BufferAttribute(nor, 3));
  geo.setAttribute("uv", new BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Işın (o + t·d, d birim) şeride değiyor mu: en yakın değme noktasının ışın boyunca uzaklığı ve enine yeri
 * u (0 … 1; damar = floor(u · DAMAR)). Şeridin her parçası düz bir dörtgen (yolun iki noktası ± en·g/2);
 * uc ya da bas ≠ 0 ise son ya da ilk parça eğik kenarlı (seritGeometrisi).
 */
export function seritIsini(o: Vec, d: Vec, yol: readonly number[], en: Vec, g: number, uc = 0, bas = 0): { t: number; u: number } | null {
  let bulunan: { t: number; u: number } | null = null;
  for (let j = 0; j + 5 < yol.length; j += 3) {
    const son = j + 6 === yol.length;
    const ilk = j === 0;
    const sx = yol[j + 3] - yol[j], sy = yol[j + 4] - yol[j + 1], sz = yol[j + 5] - yol[j + 2];
    const boy2 = sx * sx + sy * sy + sz * sz;
    if (!boy2) continue;
    // dörtgenin düzlemi: normal = en × s
    const nx = en[1] * sz - en[2] * sy, ny = en[2] * sx - en[0] * sz, nz = en[0] * sy - en[1] * sx;
    const dn = d[0] * nx + d[1] * ny + d[2] * nz;
    if (Math.abs(dn) < 1e-12) continue;
    const t = ((yol[j] - o[0]) * nx + (yol[j + 1] - o[1]) * ny + (yol[j + 2] - o[2]) * nz) / dn;
    if (t < 0 || (bulunan && t >= bulunan.t)) continue;
    const hx = o[0] + t * d[0] - yol[j], hy = o[1] + t * d[1] - yol[j + 1], hz = o[2] + t * d[2] - yol[j + 2];
    const boy = Math.sqrt(boy2);
    const boyuna = (hx * sx + hy * sy + hz * sz) / boy;
    const enine = hx * en[0] + hy * en[1] + hz * en[2];
    if (boyuna < (ilk ? bas * enine : 0) || boyuna > boy + (son ? uc * enine : 0) || Math.abs(enine) > g / 2) continue;
    bulunan = { t, u: enine / g + 0.5 };
  }
  return bulunan;
}

/**
 * Bir damarın şerit boyunca yolu (dünya, [x, y, z, …]): eksenden enine (u − 0,5)·g kaymış; eğik uçlarda
 * (uc, bas) son ya da ilk nokta da kayar. Seçili damarın parlayan izi için.
 */
export function damarYolu(yol: readonly number[], en: Vec, g: number, uc: number, u: number, bas = 0): number[] {
  const e = (u - 0.5) * g;
  const out = yol.map((v, i) => v + en[i % 3] * e);
  if (yol.length > 3) {
    for (const [k, o] of [[uc, out.length - 3], [bas, 0]] as const) {
      if (!k) continue;
      const t = uctakiYon(yol, o > 0);
      for (let j = 0; j < 3; j++) out[o + j] += t[j] * k * e;
    }
  }
  return out;
}

/** Damarın enine yeri: ortası (0 … 1) */
export const damarU = (k: number): number => (k + 0.5) / DAMAR;

/** Damar (0'dan) → enine yer u'dan: 0 … DAMAR − 1 */
export const damarNo = (u: number): number => Math.min(DAMAR - 1, Math.max(0, Math.floor(u * DAMAR)));

/** Arka panelin her pininin sinyali (1. damar = 1. pin); kullanılmayan pin boş */
export const damarSinyalleri = (): string[] => Array.from({ length: DAMAR }, (_, k) => BACKPLANE[k + 1] ?? "");

/**
 * Soketin kafasındaki pin haritasının grupları: aynı ön ekle art arda giden en az 3 sinyal ("A0" … "A15"
 * → "A0–15", pin 9 … 24). Pinler 1'den.
 */
export function damarGruplari(): { ad: string; ilk: number; son: number }[] {
  const ad = damarSinyalleri();
  const parca = (s: string) => /^(.*?)(\d+)$/.exec(s);
  const out: { ad: string; ilk: number; son: number }[] = [];
  for (let k = 0; k < ad.length; ) {
    const p = parca(ad[k]);
    let j = k + 1;
    while (p && j < ad.length) {
      const q = parca(ad[j]);
      if (!q || q[1] !== p[1] || +q[2] !== +p[2] + (j - k)) break;
      j++;
    }
    if (p && j - k >= 3) out.push({ ad: `${p[1]}${p[2]}–${parca(ad[j - 1])![2]}`, ilk: k + 1, son: j });
    k = j;
  }
  return out;
}

/** Bir sinyalin arka panel pinleri (1'den): GND, VCC birden çok pinde */
export const sinyalinDamarlari = (ad: string): number[] => damarSinyalleri().flatMap((s, k) => (s === ad ? [k + 1] : []));
