// Panonun besleme bütçesi: parçaların akımı (cpu16/kurulum/plan.ts akim(), PCB kurulum belgelerindeki
// bütçeyle aynı tablo), board sütunu başına bir 5 V girişi; girişten en uzak board'da raylardaki düşüm.

import { partValue, type Board } from "../board/board.ts";
import { akim, ledSeriOhm } from "../kurulum/plan.ts";
import type { KartBbPlani } from "./plan.ts";

/** Board başına akım ve en uzak board'daki tahmini gerilim düşümü */
export interface BeslemeButcesi {
  /** toplam akım (mA) */
  toplamMa: number;
  /** besleme girişi sayısı (her board sütununa bir) */
  giris: number;
  /** en çok yüklenen girişin akımı (mA) */
  enCokGirisMa: number;
  /** girişten en uzak board'da + ve − raylarındaki toplam düşüm (mV) */
  dusumMv: number;
}

/** Ray + arka-ön köprü başına direnç (Ω): ray şeridi ≈ 30 mΩ, iki temas ≈ 20 mΩ, 22 AWG köprü ≈ 2 mΩ */
export const KOPRU_OHM = 0.05;

export function beslemeButcesi(board: Board, p: KartBbPlani): BeslemeButcesi {
  const y = p.yerlesim;
  const nesne = new Map<string, string>([...board.chips.map((c) => [c.ref, partValue(c)] as const), ...board.passives.map((q) => [q.ref, q.part] as const)]);
  const boardMa = y.boards.map(() => 0);
  for (const q of y.parcalar) {
    const deger = q.ek ? q.part : (nesne.get(q.ref) ?? q.part);
    const a = akim(deger, deger === "LED" && !q.ek ? ledSeriOhm(board, q.ref) : undefined);
    if (a && !q.ek) boardMa[q.board] += a.mA;
  }
  const gy = p.tanim.uyarlayici.by;
  let dusum = 0;
  let enCok = 0;
  for (let bx = 0; bx < y.nx; bx++) {
    // girişten uzaklaşan board'lar: k. köprüden kendinden sonraki board'ların akımı geçer
    const sutun = y.boards.filter((b) => b.bx === bx).sort((a, b) => Math.abs(a.by - gy) - Math.abs(b.by - gy));
    const akimlar = sutun.map((b) => boardMa[b.no]);
    enCok = Math.max(enCok, akimlar.reduce((s, x) => s + x, 0));
    let d = 0;
    for (let k = 1; k < akimlar.length; k++) d += KOPRU_OHM * akimlar.slice(k).reduce((s, x) => s + x, 0);
    dusum = Math.max(dusum, 2 * d);
  }
  return { toplamMa: boardMa.reduce((s, x) => s + x, 0), giris: y.nx, enCokGirisMa: enCok, dusumMv: dusum };
}
