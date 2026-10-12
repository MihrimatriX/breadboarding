// Bölüm çerçevelerinin ortak geometrisi ve renkleri: 3D sahne (src/board3d/bolumSahne.ts) ve
// breadboard kurulum belgeleri (pano haritasındaki bölge çerçeveleri, board çizimlerindeki grup
// etiketleri; cpu16/breadboard/belge.ts, hesap8/breadboard/belge.ts) aynı bölgeyi aynı renkte çizer.
//
// Bölge: panoda aynı rolü taşıyan board'lar (ör. "Register dosyası"); board ızgarasında hücreler.
// Renk: panonun içinde komşu iki bölge aynı renkte olmaz; her kart paletin başka bir yerinden başlar.
// Kırmızı yok (arayüzde kırmızı yalnız hata ve lojik 1); renkler krem board'da, beyaz kâğıtta ve iki
// temanın sahne zemininde en az 3:1 (cpu16/tests/bolum-3d.test.ts).

import { bolumKimligi, type BolumKatalogu } from "./bolum-bilgi.ts";

/** Bölge çerçevelerinin renkleri (krem board'da ve kâğıtta) */
export const BOLUM_RENKLERI = ["#2d6bd2", "#0d7f73", "#5a7d12", "#a8640a", "#7a4fd0", "#0b78a3", "#86602a", "#5a6f87"] as const;

// ---------------------------------------------------------------- hücre birleşiminin sınırı

export interface Hucre {
  i: number;
  j: number;
}

/**
 * Izgara hücrelerinin birleşiminin sınırı, içe doğru `ic` kadar kaydırılmış: [x0, y0, x1, y1, …]
 * parçaları (mm). Hücre (i, j): [x0 + i·dx, x0 + (i+1)·dx] × [y0 + j·dy, y0 + (j+1)·dy]. Dış köşelerde
 * kenar kısalır, iç köşelerde uzar: L biçimli bir bölge de kapalı tek bir çizgiyle sarılır.
 */
export function hucreSiniri(hucreler: readonly Hucre[], x0: number, y0: number, dx: number, dy: number, ic: number): number[] {
  const var_ = new Set(hucreler.map((h) => `${h.i},${h.j}`));
  const v = (i: number, j: number) => var_.has(`${i},${j}`);
  const out: number[] = [];
  for (const { i, j } of hucreler) {
    const xa = x0 + i * dx;
    const xb = x0 + (i + 1) * dx;
    const ya = y0 + j * dy;
    const yb = y0 + (j + 1) * dy;
    // yatay kenar (dj = -1 üst, +1 alt): uçları sol ve sağ komşuya göre
    for (const dj of [-1, 1]) {
      if (v(i, j + dj)) continue;
      const sol = !v(i - 1, j) ? ic : v(i - 1, j + dj) ? -ic : 0;
      const sag = !v(i + 1, j) ? -ic : v(i + 1, j + dj) ? ic : 0;
      const y = dj < 0 ? ya + ic : yb - ic;
      out.push(xa + sol, y, xb + sag, y);
    }
    // dikey kenar (di = -1 sol, +1 sağ): uçları üst ve alt komşuya göre
    for (const di of [-1, 1]) {
      if (v(i + di, j)) continue;
      const ust = !v(i, j - 1) ? ic : v(i + di, j - 1) ? -ic : 0;
      const alt = !v(i, j + 1) ? -ic : v(i + di, j + 1) ? ic : 0;
      const x = di < 0 ? xa + ic : xb - ic;
      out.push(x, ya + ust, x, yb + alt);
    }
  }
  return out;
}

/**
 * Dikdörtgenlerin birleşiminin sınırı ve içi, içe doğru `ic` kadar kaydırılmış (hucreSiniri gibi, ama
 * hücreler eşit değil: dikdörtgenlerin kenarları birleşimi düzensiz bir ızgaraya böler). Taban
 * plakasında modüller arasında boşluk olduğundan board'lar düzgün bir ızgarada durmaz; bir bölgenin
 * board'ları ve aralarındaki köprüler buradan tek bir çizgiyle sarılır. Dikdörtgenlerin kenarları
 * birbirinden en az 2·ic uzak olmalı (board'lar ve boşluklar öyle).
 */
export function kutularinSiniri(kutular: readonly { x: number; y: number; w: number; h: number }[], ic: number): { kenarlar: number[]; alanlar: { x: number; y: number; w: number; h: number }[] } {
  const tekil = (a: number[]) => [...new Set(a.map((v) => Math.round(v * 1e6) / 1e6))].sort((p, q) => p - q);
  const xs = tekil(kutular.flatMap((k) => [k.x, k.x + k.w]));
  const ys = tekil(kutular.flatMap((k) => [k.y, k.y + k.h]));
  const dolu = new Set<string>();
  for (let i = 0; i + 1 < xs.length; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2;
    for (let j = 0; j + 1 < ys.length; j++) {
      const cy = (ys[j] + ys[j + 1]) / 2;
      if (kutular.some((k) => k.x < cx && cx < k.x + k.w && k.y < cy && cy < k.y + k.h)) dolu.add(`${i},${j}`);
    }
  }
  const v = (i: number, j: number) => dolu.has(`${i},${j}`);
  // kenarlar hücre hücre (hucreSiniri), sonra aynı doğrudaki bitişik parçalar birleşir
  const yatay = new Map<number, [number, number][]>();
  const dikey = new Map<number, [number, number][]>();
  const ekle = (m: Map<number, [number, number][]>, k: number, a: number, b: number) => {
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push([Math.min(a, b), Math.max(a, b)]);
  };
  const alanlar: { x: number; y: number; w: number; h: number }[] = [];
  for (const s of dolu) {
    const [i, j] = s.split(",").map(Number);
    const [xa, xb, ya, yb] = [xs[i], xs[i + 1], ys[j], ys[j + 1]];
    for (const dj of [-1, 1]) {
      if (v(i, j + dj)) continue;
      const sol = !v(i - 1, j) ? ic : v(i - 1, j + dj) ? -ic : 0;
      const sag = !v(i + 1, j) ? -ic : v(i + 1, j + dj) ? ic : 0;
      ekle(yatay, dj < 0 ? ya + ic : yb - ic, xa + sol, xb + sag);
    }
    for (const di of [-1, 1]) {
      if (v(i + di, j)) continue;
      const ust = !v(i, j - 1) ? ic : v(i + di, j - 1) ? -ic : 0;
      const alt = !v(i, j + 1) ? -ic : v(i + di, j + 1) ? ic : 0;
      ekle(dikey, di < 0 ? xa + ic : xb - ic, ya + ust, yb + alt);
    }
    const [l, r, u, a] = [v(i - 1, j) ? 0 : ic, v(i + 1, j) ? 0 : ic, v(i, j - 1) ? 0 : ic, v(i, j + 1) ? 0 : ic];
    alanlar.push({ x: xa + l, y: ya + u, w: xb - xa - l - r, h: yb - ya - u - a });
  }
  const birlestir = (m: Map<number, [number, number][]>, yatayMi: boolean, out: number[]) => {
    for (const [k, parcalar] of m) {
      parcalar.sort((p, q) => p[0] - q[0]);
      let [a, b] = parcalar[0];
      const yaz = () => out.push(...(yatayMi ? [a, k, b, k] : [k, a, k, b]));
      for (const [p, q] of parcalar.slice(1)) {
        if (p <= b + 1e-6) b = Math.max(b, q);
        else {
          yaz();
          [a, b] = [p, q];
        }
      }
      yaz();
    }
  };
  const kenarlar: number[] = [];
  birlestir(yatay, true, kenarlar);
  birlestir(dikey, false, kenarlar);
  return { kenarlar, alanlar };
}

/** Hücrelerin içindeki bütün tam dikdörtgenler (hücre aralıkları, uçlar dahil) */
export function tamDikdortgenler(hucreler: readonly Hucre[]): { i0: number; j0: number; i1: number; j1: number }[] {
  const var_ = new Set(hucreler.map((h) => `${h.i},${h.j}`));
  const is = hucreler.map((h) => h.i);
  const js = hucreler.map((h) => h.j);
  const [imin, imax, jmin, jmax] = [Math.min(...is), Math.max(...is), Math.min(...js), Math.max(...js)];
  const out: { i0: number; j0: number; i1: number; j1: number }[] = [];
  for (let i0 = imin; i0 <= imax; i0++) {
    for (let j0 = jmin; j0 <= jmax; j0++) {
      for (let i1 = i0; i1 <= imax && var_.has(`${i1},${j0}`); i1++) {
        for (let j1 = j0; j1 <= jmax; j1++) {
          let tam = true;
          for (let i = i0; i <= i1 && tam; i++) tam = var_.has(`${i},${j1}`);
          if (!tam) break;
          out.push({ i0, j0, i1, j1 });
        }
      }
    }
  }
  return out;
}

/**
 * Komşuluk listesiyle açgözlü boyama: her öğe komşularının kullanmadığı ilk renk (sırayla dönerek,
 * `ofset`ten başlayarak).
 */
export function boya(n: number, komsu: (a: number, b: number) => boolean, renkSayisi: number, ofset = 0): number[] {
  const renk: number[] = [];
  for (let a = 0; a < n; a++) {
    const dolu = new Set<number>();
    for (let b = 0; b < a; b++) if (komsu(a, b)) dolu.add(renk[b]);
    let r = (a + ofset) % renkSayisi;
    for (let k = 0; k < renkSayisi && dolu.has(r); k++) r = (r + 1) % renkSayisi;
    renk.push(r);
  }
  return renk;
}

// ---------------------------------------------------------------- panonun bölgeleri

export interface PanoBolgesi {
  /** bölgenin kimliği (bolge:kart:ad) */
  id: string;
  /** board'ları: ızgara hücreleri (bx, by), (by, bx) sırasıyla */
  hucreler: Hucre[];
  renk: string;
}

/** Panonun board'larından gereken */
export interface BolgeBoardu {
  bx: number;
  by: number;
  rol: string;
}

/**
 * Panonun bölgeleri, board'ların rolünden: ilk board'larının sırasıyla (arkadan öne, soldan sağa).
 * Katalogda olmayan rol (ör. parçasız board) atlanır.
 */
export function panoBolgeleri(kart: string, boards: readonly BolgeBoardu[], k: BolumKatalogu): PanoBolgesi[] {
  const out: { id: string; hucreler: Hucre[] }[] = [];
  const sira = new Map<string, number>();
  for (const b of [...boards].sort((a, c) => a.by - c.by || a.bx - c.bx)) {
    const id = bolumKimligi.bolge(kart, b.rol);
    if (!k.bolumler.has(id)) continue;
    let n = sira.get(id);
    if (n === undefined) {
      n = out.length;
      sira.set(id, n);
      out.push({ id, hucreler: [] });
    }
    out[n].hucreler.push({ i: b.bx, j: b.by });
  }
  const komsu = (a: number, b: number) => out[a].hucreler.some((h) => out[b].hucreler.some((g) => Math.abs(h.i - g.i) + Math.abs(h.j - g.j) === 1));
  const renk = boya(out.length, komsu, BOLUM_RENKLERI.length, 3 * Math.max(0, k.kartlar.indexOf(kart)));
  return out.map((b, n) => ({ ...b, renk: BOLUM_RENKLERI[renk[n]] }));
}

/**
 * Kartın çip gruplarının bölgeleri: parçalarının çoğunun durduğu board'un bölgesi (eşitlikte önce
 * gelen bölge). Hesap makinesinde bloklar bölgelere bağlı değil; yerleşim ikisini de bağlar.
 */
export function grupBolgeleri(
  kart: string,
  yerlesim: { boards: readonly BolgeBoardu[]; parcalar: readonly { ref: string; board: number }[] },
  k: BolumKatalogu,
): Map<string, string> {
  const bolgeler = panoBolgeleri(kart, yerlesim.boards, k);
  const sira = new Map(bolgeler.map((b, n) => [b.id, n]));
  const say = new Map<string, Map<string, number>>();
  for (const q of yerlesim.parcalar) {
    const g = k.grubu.get(q.ref);
    const b = yerlesim.boards[q.board];
    if (!g || !b) continue;
    const id = bolumKimligi.bolge(kart, b.rol);
    if (!sira.has(id)) continue;
    const m = say.get(g) ?? new Map<string, number>();
    m.set(id, (m.get(id) ?? 0) + 1);
    say.set(g, m);
  }
  const out = new Map<string, string>();
  for (const [g, m] of say) out.set(g, [...m].sort((a, b) => b[1] - a[1] || sira.get(a[0])! - sira.get(b[0])!)[0][0]);
  return out;
}

// ---------------------------------------------------------------- board'un modülü

/** Board'un etiketinde gereken: grupları (modüler panoda) ve parçaları */
export interface ModulYerlesimi {
  boards: readonly { gruplar?: readonly string[] }[];
  parcalar: readonly { ref: string; board: number; cipMi?: boolean; sutun?: number }[];
}

/**
 * Board'un çip gruplarının kimlikleri, etiketlerinin sırasıyla: modüler panoda (CPU kartı) düzendeki
 * sırayla; öbür panolarda önce çipli gruplar (çip sayısına göre, eşitlikte soldaki), sonra yalnız
 * pasifli gruplar (LED'ler, butonlar). 3D'deki board plakaları ve kurulum belgelerinin board
 * çizimleri bu sırayı kullanır.
 */
export function boardunGruplari(kart: string, no: number, y: ModulYerlesimi, k: BolumKatalogu): string[] {
  const say = new Map<string, { cip: number; pasif: number; sol: number }>();
  for (const q of y.parcalar) {
    if (q.board !== no) continue;
    const g = k.grubu.get(q.ref);
    if (!g) continue;
    const s = say.get(g) ?? { cip: 0, pasif: 0, sol: Infinity };
    if (q.cipMi) s.cip++;
    else s.pasif++;
    s.sol = Math.min(s.sol, q.sutun ?? 0);
    say.set(g, s);
  }
  const duzen = (y.boards[no]?.gruplar ?? []).map((g) => bolumKimligi.grup(kart, g)).filter((g) => say.has(g));
  const kalan = [...say].filter(([g]) => !duzen.includes(g)).sort((a, b) => b[1].cip - a[1].cip || b[1].pasif - a[1].pasif || a[1].sol - b[1].sol);
  return [...duzen, ...kalan.map(([g]) => g)];
}

/**
 * Board'daki bir grubun etiketi. Modüler panoda grubun çipleri başka board'daysa ve bu board'da yalnız
 * göstergeleri (LED'ler, çubuk göstergeler) varsa "… GÖSTERGELERİ": R0'ın önündeki board "R0 GÖSTERGELERİ".
 */
export function boardGrupEtiketi(no: number, y: ModulYerlesimi, k: BolumKatalogu, g: string): string {
  const et = k.bolumler.get(g)!.etiket;
  if (!y.boards[no]?.gruplar) return et;
  let burada = false;
  let baska = false;
  for (const q of y.parcalar) {
    if (!q.cipMi || k.grubu.get(q.ref) !== g) continue;
    if (q.board === no) burada = true;
    else baska = true;
  }
  return !burada && baska ? `${et} GÖSTERGELERİ` : et;
}
