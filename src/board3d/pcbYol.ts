// PCB görünümünün kazınmış bakır yolları: kartın bütün kart içi bağlantıları (wires.ts allWires kenarları)
// iki katmanlı bir kartta gibi. Üst katmanda yollar yalnız yatay, alt katmanda yalnız dikey gider; yol
// yön değiştirdiği yerde via ile katman değiştirir (eski otomatik yönlendirilmiş iki katmanlı kartlar gibi):
// yatay ve dikey yollar birbirini serbestçe keser, yalnız aynı yöndeki yollar yer için yarışır. Her kartın
// kendi ızgarası; başka netin pedinin üstü ve başka netin bakırı çok pahalı, aynı netin bakırı paylaşılır
// (net bir ağaç olur), çip ve pasif gövdelerinin altı biraz pahalı. Pinler ızgaraya oturmaz: yol pinin en
// yakın düğümünden başlar, pinle düğüm arası kısa bir uçla bağlanır. Saf fonksiyonlar (React'ten ve
// three'den bağımsız; kazıma pcbYol.worker.ts'te koşar); testleri cpu16/tests/pcb-yol.test.ts.

import type { BoardLayout } from "../../cpu16/board/layout";
import type { WireEdge } from "./wires";

/** Izgara adımı (mm): yarım DIP pin aralığı (pinle düğüm arası uç ≤ 0,9 mm, pedin altında kalır) */
export const YOL_ADIM = 1.27;
/** maliyetler (adım başına 1): gövde altı, başka netin pedi, başka netin bakırı, katman değiştirme */
const GOVDE = 1;
const YABANCI_PED = 200;
const CAKISMA = 40;
const VIA = 10;
/** A* sezgisinin ağırlığı (1: en ucuz yol, büyüdükçe hızlı ama dolambaçlı) */
const SEZGI = 1.5;
/** bir aramada açılabilecek en çok durum (bulunamazsa düz çizgi) */
const EN_COK = 600_000;
/** arama penceresi: uçların sınır kutusunun çevresinde bu kadar düğüm (bulunamazsa bütün kart) */
const PENCERE = 30;

export interface Dikdortgen {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Ped {
  x: number;
  y: number;
  net: number;
}

/** Bir kartın ızgarası: düğüm (i, j) = (x0 + i·adim, y0 + j·adim); durum = düğüm·2 + katman (0 üst, 1 alt) */
export interface Izgara {
  x0: number;
  y0: number;
  adim: number;
  nx: number;
  ny: number;
  /** düğüm bir gövdenin altında mı */
  govde: Uint8Array;
  /** düğümdeki pedin neti (yoksa −1; iki ped aynı düğümdeyse −2: herkese yabancı) */
  ped: Int32Array;
  /** durumun (düğüm, katman) bakırının neti: −1 boş, −2 birden çok net */
  sahip: Int32Array;
  /** A*'ın tamponları ve geçerli oldukları arama (kuşak: tamponlar sıfırlanmaz) */
  g: Float32Array;
  once: Int32Array;
  kusakDizi: Uint32Array;
  kusak: number;
}

export function izgaraKur(alan: Dikdortgen, govdeler: readonly Dikdortgen[], pedler: readonly Ped[], adim = YOL_ADIM): Izgara {
  const nx = Math.max(2, Math.floor(alan.w / adim) + 1);
  const ny = Math.max(2, Math.floor(alan.h / adim) + 1);
  const N = nx * ny;
  const iz: Izgara = {
    x0: alan.x, y0: alan.y, adim, nx, ny, govde: new Uint8Array(N), ped: new Int32Array(N).fill(-1), sahip: new Int32Array(2 * N).fill(-1),
    g: new Float32Array(2 * N), once: new Int32Array(2 * N), kusakDizi: new Uint32Array(2 * N), kusak: 0,
  };
  for (const g of govdeler) {
    const i0 = Math.max(0, Math.ceil((g.x - alan.x) / adim)), i1 = Math.min(nx - 1, Math.floor((g.x + g.w - alan.x) / adim));
    const j0 = Math.max(0, Math.ceil((g.y - alan.y) / adim)), j1 = Math.min(ny - 1, Math.floor((g.y + g.h - alan.y) / adim));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) iz.govde[j * nx + i] = 1;
  }
  for (const p of pedler) {
    const d = dugum(iz, p.x, p.y);
    iz.ped[d] = iz.ped[d] === -1 || iz.ped[d] === p.net ? p.net : -2;
  }
  return iz;
}

/** Bir noktanın en yakın düğümü */
export function dugum(iz: Pick<Izgara, "x0" | "y0" | "adim" | "nx" | "ny">, x: number, y: number): number {
  const i = Math.min(iz.nx - 1, Math.max(0, Math.round((x - iz.x0) / iz.adim)));
  const j = Math.min(iz.ny - 1, Math.max(0, Math.round((y - iz.y0) / iz.adim)));
  return j * iz.nx + i;
}

/** Bir bağlantının kazınmış bakırı: üst (yatay) ve alt (dikey) katmanın parçaları [x0, y0, x1, y1, …] ve vialar [x, y, …] (mm) */
export interface Kazinti {
  net: number;
  ust: number[];
  alt: number[];
  via: number[];
}

/** A*: s'den t'ye en ucuz yolun son durumu ya da null; iz.once geri yürümek için */
function ara(iz: Izgara, s: number, t: number, net: number, pay: number): number | null {
  const { nx, ny, g, once, kusakDizi: kd, ped, govde, sahip } = iz;
  const kusak = ++iz.kusak;
  const gOf = (st: number) => (kd[st] === kusak ? g[st] : Infinity);
  const si = s % nx, sj = (s / nx) | 0;
  const ti = t % nx, tj = (t / nx) | 0;
  const i0 = Math.min(si, ti) - pay, i1 = Math.max(si, ti) + pay;
  const j0 = Math.min(sj, tj) - pay, j1 = Math.max(sj, tj) + pay;
  const h = (n: number) => SEZGI * (Math.abs((n % nx) - ti) + Math.abs(((n / nx) | 0) - tj));
  const yabanci = (n: number) => (ped[n] !== -1 && ped[n] !== net ? YABANCI_PED : 0);
  const cakisma = (st: number) => (sahip[st] !== -1 && sahip[st] !== net ? CAKISMA : 0);
  // ikili yığın: (öncelik, durum); eskimiş girişler açılınca atlanır
  const hf: number[] = [];
  const hs: number[] = [];
  const it = (f: number, st: number) => {
    let k = hf.length;
    hf.push(f);
    hs.push(st);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[p] <= hf[k]) break;
      [hf[p], hf[k]] = [hf[k], hf[p]];
      [hs[p], hs[k]] = [hs[k], hs[p]];
      k = p;
    }
  };
  const cek = (): number => {
    const st = hs[0];
    const f = hf.pop()!;
    const x = hs.pop()!;
    if (hf.length) {
      hf[0] = f;
      hs[0] = x;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < hf.length && hf[l] < hf[m]) m = l;
        if (r < hf.length && hf[r] < hf[m]) m = r;
        if (m === k) break;
        [hf[m], hf[k]] = [hf[k], hf[m]];
        [hs[m], hs[k]] = [hs[k], hs[m]];
        k = m;
      }
    }
    return st;
  };
  const dene = (st: number, ns: number, m: number, n: number) => {
    const ng = gOf(st) + m;
    if (ng < gOf(ns)) {
      kd[ns] = kusak;
      g[ns] = ng;
      once[ns] = st;
      it(ng + h(n), ns);
    }
  };
  // ped delikli: yol iki katmandan da başlayabilir
  for (const L of [0, 1]) {
    const st = 2 * s + L;
    kd[st] = kusak;
    g[st] = 0;
    once[st] = -1;
    it(h(s), st);
  }
  for (let acilan = 0; hf.length && acilan < EN_COK; acilan++) {
    const st = cek();
    const n = st >> 1;
    const L = st & 1;
    if (n === t) return st;
    const ci = n % nx, cj = (n / nx) | 0;
    // katmanın yönünde iki komşu: üstte ±x, altta ±y
    for (const d of [-1, 1]) {
      const ni = L ? ci : ci + d, nj = L ? cj + d : cj;
      if (ni < i0 || ni > i1 || nj < j0 || nj > j1 || ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      const m = nj * nx + ni;
      dene(st, 2 * m + L, 1 + (govde[m] ? GOVDE : 0) + yabanci(m) + cakisma(2 * m + L), m);
    }
    // via: aynı düğümde öbür katman
    dene(st, st ^ 1, VIA + yabanci(n) + cakisma(st ^ 1), n);
  }
  return null;
}

/**
 * a'dan b'ye bakır (net: kendi pedlerinin ve bakırının üstünden geçebilir). Bulunursa yolun bakırı ızgarada
 * netine yazılır (sonraki yollar çevresinden dolanır ya da aynı netse paylaşır). Bulunamazsa düz bir üst
 * katman parçası.
 */
export function yolBul(iz: Izgara, a: { x: number; y: number }, b: { x: number; y: number }, net: number): Kazinti {
  const out: Kazinti = { net, ust: [], alt: [], via: [] };
  const s = dugum(iz, a.x, a.y);
  const t = dugum(iz, b.x, b.y);
  const son = s === t ? null : (ara(iz, s, t, net, PENCERE) ?? ara(iz, s, t, net, Infinity));
  if (son === null) {
    out.ust.push(a.x, a.y, b.x, b.y);
    return out;
  }
  const durumlar: number[] = [];
  for (let st = son; st >= 0; st = iz.once[st]) durumlar.push(st);
  durumlar.reverse();
  const x = (n: number) => iz.x0 + (n % iz.nx) * iz.adim;
  const y = (n: number) => iz.y0 + ((n / iz.nx) | 0) * iz.adim;
  const parca = (L: number, x0: number, y0: number, x1: number, y1: number) => (L ? out.alt : out.ust).push(x0, y0, x1, y1);
  // pinden ilk düğüme ve son düğümden pine kısa uçlar: ilk ve son koşunun katmanında
  parca(durumlar[0] & 1, a.x, a.y, x(s), y(s));
  let bas = durumlar[0];
  for (let k = 1; k <= durumlar.length; k++) {
    const st = durumlar[k];
    if (k < durumlar.length && (st & 1) === (bas & 1)) continue;
    // bas … durumlar[k − 1] aynı katmanda bir koşu
    const o = durumlar[k - 1];
    if (o >> 1 !== bas >> 1) parca(bas & 1, x(bas >> 1), y(bas >> 1), x(o >> 1), y(o >> 1));
    if (k < durumlar.length) out.via.push(x(st >> 1), y(st >> 1));
    bas = st;
  }
  parca(durumlar[durumlar.length - 1] & 1, x(t), y(t), b.x, b.y);
  // bakır ızgaraya: via düğümünde iki katmanın durumu da yolda (art arda)
  for (const st of durumlar) iz.sahip[st] = iz.sahip[st] === -1 || iz.sahip[st] === net ? net : -2;
  return out;
}

/** Bir kartın ızgarası: gövdeler (kenar konnektörü hariç) ve bütün pedler */

export function kartIzgarasi(lay: Pick<BoardLayout, "cards" | "chips" | "passives">, kart: string): Izgara | null {
  const c = lay.cards.find((x) => x.name === kart);
  if (!c) return null;
  const govdeler: Dikdortgen[] = [...lay.chips.filter((x) => x.card === kart), ...lay.passives.filter((x) => x.card === kart && !x.edge)];
  const pedler: Ped[] = [...lay.chips, ...lay.passives].filter((x) => x.card === kart).flatMap((x) => x.pins.map((p) => ({ x: p.x, y: p.y, net: p.net })));
  return izgaraKur(c, govdeler, pedler);
}

/**
 * Kart içi kenarları kart kart kazır, birer birer (worker sonuçları parti parti gönderir): her kartta kısa
 * bağlantılar önce (yerel netler temiz kalır, uzunlar çevresinden dolanır). Kartlar arası kenarlar arka
 * panelden gider, burada yoktur.
 */
export function* kazi(lay: Pick<BoardLayout, "cards" | "chips" | "passives">, edges: readonly WireEdge[]): Generator<Kazinti> {
  const kartlar = new Map<string, WireEdge[]>();
  for (const e of edges) {
    if (e.a.card !== e.b.card) continue;
    let l = kartlar.get(e.a.card);
    if (!l) kartlar.set(e.a.card, (l = []));
    l.push(e);
  }
  const boy = (e: WireEdge) => Math.abs(e.a.x - e.b.x) + Math.abs(e.a.y - e.b.y);
  for (const [kart, l] of kartlar) {
    const iz = kartIzgarasi(lay, kart);
    if (!iz) continue;
    l.sort((p, q) => boy(p) - boy(q));
    for (const e of l) yield yolBul(iz, e.a, e.b, e.net);
  }
}
