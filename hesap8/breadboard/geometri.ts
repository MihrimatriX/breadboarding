// Breadboard geometrisi: tam boy 830 delikli breadboard (BB830 türü) ve bütün board'ları kapsayan
// 0,1" (2,54 mm) ızgara. Bütün yerleşim ve tel yönlendirme bu ızgarada, tam sayı (X, Y) noktalarında
// yapılır; mm ancak 3D görünüm ve belgeler için hesaplanır.
//
// Bir board (üstten bakış, x sağa, y aşağı; 1. sütun solda):
//
//   satır  0  üst + rayı  (dış, kırmızı çizgi)   50 delik: sütun 3–7, 9–13, …, 57–61 (5'li gruplar)
//   satır  1  üst − rayı  (iç, mavi çizgi)
//   satır  2  (delik yok)
//   satır  3–7   a b c d e   her sütunun a–e'si bir şerit (5 delik, aralarında iletken)
//   satır  8–9   orta kanal (7,62 mm: e ile f arası 3 adım)
//   satır 10–14  f g h i j   her sütunun f–j'si bir şerit
//   satır 15  (delik yok)
//   satır 16  alt − rayı  (iç, mavi çizgi)
//   satır 17  alt + rayı  (dış, kırmızı çizgi)
//
// Raylar boydan boya kesintisizdir (BB830). Ortadan bölük raylı bir board kullanılırsa her rayın
// iki yarısı ayrıca köprülenmelidir (belgelerde yazar). Board 63 × 2,54 = 165,1 mm'nin biraz
// fazlası: 65 adım (165,1 mm) eninde, 21,5 adım (54,6 mm) boyunda; board'lar ızgarada 65 sütun ×
// 22 satır aralıkla dizilir (yan yana bitişik, alt alta 1,27 mm boşluk).

export const ADIM = 2.54;
export const SUTUN = 63;
/** board'un ızgaradaki eni ve boyu (adım) */
export const BX_ADIM = 65;
export const BY_ADIM = 22;
/** board kenarlarının satır/sütun ızgarasına göre konumu (adım) */
export const KENAR_SOL = -0.5;
export const KENAR_SAG = 64.5;
export const KENAR_UST = -2.25;
export const KENAR_ALT = 19.25;

export const SATIR = { ustArti: 0, ustEksi: 1, a: 3, e: 7, f: 10, j: 14, altEksi: 16, altArti: 17 } as const;
export const SATIR_HARFI = "abcdefghij";

/** Yerel satır (0–17) → harf satırı (a–j) ise harfi */
export function satirHarfi(r: number): string | undefined {
  if (r >= 3 && r <= 7) return SATIR_HARFI[r - 3];
  if (r >= 10 && r <= 14) return SATIR_HARFI[r - 5];
  return undefined;
}

export function harfSatiri(h: string): number {
  const i = SATIR_HARFI.indexOf(h);
  if (i < 0) throw new Error(`satır harfi değil: ${h}`);
  return i < 5 ? 3 + i : 5 + i;
}

/** Ray satırı mı; hangi ray */
export type RayAdi = "ust+" | "ust-" | "alt-" | "alt+";
export const RAY_SATIRI: Record<RayAdi, number> = { "ust+": 0, "ust-": 1, "alt-": 16, "alt+": 17 };
export const rayKutbu = (r: RayAdi): "VCC" | "GND" => (r.endsWith("+") ? "VCC" : "GND");

export function satirRayi(r: number): RayAdi | undefined {
  return r === 0 ? "ust+" : r === 1 ? "ust-" : r === 16 ? "alt-" : r === 17 ? "alt+" : undefined;
}

/** Ray deliği olan sütunlar: 3–61, 6'lı gruplarda (5 delik + 1 boşluk) */
export const rayDeligiVar = (c: number): boolean => c >= 3 && c <= 61 && c % 6 !== 2;

/** Yerel (satır, sütun) bir delik mi */
export function delikVar(r: number, c: number): boolean {
  if (c < 1 || c > SUTUN) return false;
  if ((r >= 3 && r <= 7) || (r >= 10 && r <= 14)) return true;
  if (satirRayi(r) !== undefined) return rayDeligiVar(c);
  return false;
}

/** Board ızgaradaki yeri */
export interface BbKonum {
  /** sıra numarası (0'dan), adı BB01, BB02 … */
  no: number;
  ad: string;
  /** ızgaradaki sütun ve satırı (0 = sol / arka) */
  bx: number;
  by: number;
}

export const boardAdi = (no: number): string => `BB${String(no + 1).padStart(2, "0")}`;

/** Board'un yerel (r, c) deliğinin küresel ızgara noktası */
export const kureselX = (bx: number, c: number): number => bx * BX_ADIM + c;
export const kureselY = (by: number, r: number): number => by * BY_ADIM + r;

/** Izgara noktası → mm (taban plakasının sol üst köşesi 0, 0; board'ların dışında `kenar` mm pay) */
export const PAY = 12;
export const mmX = (X: number): number => PAY + (X - KENAR_SOL) * ADIM;
export const mmY = (Y: number): number => PAY + (Y - KENAR_UST) * ADIM;

/** Delik etiketi: "c14", "üst+14", "alt−3" */
export function delikEtiketi(r: number, c: number): string {
  const h = satirHarfi(r);
  if (h) return `${h}${c}`;
  const ray = satirRayi(r);
  if (ray) return `${ray.startsWith("ust") ? "üst" : "alt"}${ray.endsWith("+") ? "+" : "−"}${c}`;
  return `?${r},${c}`;
}

/** Bir board'daki düğümler (iletken parçalar): 63 üst şerit, 63 alt şerit, 4 ray */
export const DUGUM_BOARD = 2 * SUTUN + 4;

/** Yerel delikten board içi düğüm numarası: 0..62 üst şerit, 63..125 alt şerit, 126..129 raylar */
export function yerelDugum(r: number, c: number): number {
  if (r >= 3 && r <= 7) return c - 1;
  if (r >= 10 && r <= 14) return SUTUN + c - 1;
  const ray = satirRayi(r);
  if (ray === "ust+") return 2 * SUTUN;
  if (ray === "ust-") return 2 * SUTUN + 1;
  if (ray === "alt-") return 2 * SUTUN + 2;
  if (ray === "alt+") return 2 * SUTUN + 3;
  return -1;
}

/** Düğüm numarasının delikleri (yerel r, c) */
export function dugumDelikleri(d: number): [number, number][] {
  if (d < SUTUN) return [3, 4, 5, 6, 7].map((r) => [r, d + 1]);
  if (d < 2 * SUTUN) return [10, 11, 12, 13, 14].map((r) => [r, d - SUTUN + 1]);
  const r = [0, 1, 16, 17][d - 2 * SUTUN];
  const out: [number, number][] = [];
  for (let c = 3; c <= 61; c++) if (rayDeligiVar(c)) out.push([r, c]);
  return out;
}

/** Board'daki bütün delikler (830) */
export function boardDelikleri(): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r <= 17; r++) for (let c = 1; c <= SUTUN; c++) if (delikVar(r, c)) out.push([r, c]);
  return out;
}
