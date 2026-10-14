// PCB görünümünün kazınmış bakır yolları: kartın bütün kart içi bağlantıları (wires.ts allWires kenarları)
// iki katmanlı bir kartta gibi. Her katmanın tercih ettiği bir yönü var (üst yatay, alt dikey): yol katman
// içinde de döner ama ters yönde gitmesi pahalı, katman değiştirmesi (via) daha pahalı. Böylece kısa
// bağlantılar tek katmanda L çizer, uzunlar tercih ettikleri yönde katman değiştirir; köşeler 45° pahlanır.
// Her kartın kendi ızgarası; başka netin pedinin üstü ve başka netin bakırı çok pahalı, aynı netin bakırı
// paylaşılır (net bir ağaç olur), çip ve pasif gövdelerinin altı biraz pahalı. Pinler ızgaraya oturmaz: yol
// pinin en yakın düğümünden başlar, pinle düğüm arası kısa bir uçla bağlanır. Saf fonksiyonlar (React'ten
// ve three'den bağımsız; kazıma pcbYol.worker.ts'te koşar); testleri cpu16/tests/pcb-yol.test.ts.

import type { BoardLayout } from "../../cpu16/board/layout";
import type { WireEdge } from "./wires";

/** Izgara adımı (mm): yarım DIP pin aralığı (pinle düğüm arası uç ≤ 0,9 mm, pedin altında kalır) */
export const YOL_ADIM = 1.27;
/** maliyetler (adım başına 1): gövde altı, başka netin pedi, başka netin bakırı, katmanın ters yönü, kıvrım, via */
const GOVDE = 1;
const YABANCI_PED = 200;
const CAKISMA = 15;
const TERS = 1;
const KIVRIM = 3;
const VIA = 8;
/** A* sezgisinin ağırlığı (1: en ucuz yol, büyüdükçe hızlı ama dolambaçlı) */
const SEZGI = 1.5;
/** bir aramada açılabilecek en çok durum (bulunamazsa düz çizgi) */
const EN_COK = 800_000;
/** arama penceresi: uçların sınır kutusunun çevresinde bu kadar düğüm (bulunamazsa bütün kart) */
const PENCERE = 12;
/** köşelerin pahı (mm) */
const PAH = YOL_ADIM * 0.5;

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

/**
 * Bir kartın ızgarası: düğüm (i, j) = (x0 + i·adim, y0 + j·adim). Bakır düğüm·2 + katman (0 üst, 1 alt);
 * aramanın durumu düğüm·4 + katman·2 + eksen (0 yatay, 1 dikey).
 */
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
  /** düğümün katmandaki bakırının neti: −1 boş, −2 birden çok net */
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
    g: new Float32Array(4 * N), once: new Int32Array(4 * N), kusakDizi: new Uint32Array(4 * N), kusak: 0,
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

/** Bir bağlantının kazınmış bakırı: üst ve alt katmanın parçaları [x0, y0, x1, y1, …] ve vialar [x, y, …] (mm) */
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
  const cakisma = (n: number, L: number) => {
    const o = sahip[2 * n + L];
    return o !== -1 && o !== net ? CAKISMA : 0;
  };
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
  // ped delikli: yol iki katmandan da, iki eksende de başlayabilir
  for (let k = 0; k < 4; k++) {
    const st = 4 * s + k;
    kd[st] = kusak;
    g[st] = 0;
    once[st] = -1;
    it(h(s), st);
  }
  for (let acilan = 0; hf.length && acilan < EN_COK; acilan++) {
    const st = cek();
    const n = st >> 2;
    const L = (st >> 1) & 1;
    const a = st & 1;
    if (n === t) return st;
    const ci = n % nx, cj = (n / nx) | 0;
    // eksen boyunca iki komşu (katmanın ters ekseninde pahalı)
    for (const d of [-1, 1]) {
      const ni = a ? ci : ci + d, nj = a ? cj + d : cj;
      if (ni < i0 || ni > i1 || nj < j0 || nj > j1 || ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      const m = nj * nx + ni;
      dene(st, 4 * m + 2 * L + a, 1 + (a !== L ? TERS : 0) + (govde[m] ? GOVDE : 0) + yabanci(m) + cakisma(m, L), m);
    }
    // aynı katmanda kıvrım, öbür katmana via
    dene(st, st ^ 1, KIVRIM, n);
    dene(st, st ^ 2, VIA + yabanci(n) + cakisma(n, L ^ 1), n);
  }
  return null;
}

/** Köşeleri c kadar (komşu parçaların yarısını aşmadan) pahlar; uçlar korunur. Noktalar [x, y, …] */
export function pahla(p: readonly number[], c: number): number[] {
  const n = p.length / 2;
  const out = [p[0], p[1]];
  for (let k = 1; k + 1 < n; k++) {
    const [px, py] = [p[2 * k], p[2 * k + 1]];
    const ux = px - p[2 * k - 2], uy = py - p[2 * k - 1];
    const vx = p[2 * k + 2] - px, vy = p[2 * k + 3] - py;
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    // düz giden nokta köşe değil: atlanır
    if (lu > 1e-9 && lv > 1e-9 && Math.abs(ux * vy - uy * vx) < 1e-9 * lu * lv && ux * vx + uy * vy > 0) continue;
    const d = Math.min(c, lu / 2, lv / 2);
    if (d < 1e-6) out.push(px, py);
    else out.push(px - (ux / lu) * d, py - (uy / lu) * d, px + (vx / lv) * d, py + (vy / lv) * d);
  }
  if (n > 1) out.push(p[2 * n - 2], p[2 * n - 1]);
  // art arda aynı noktalar atılır (iki köşenin pahı bir parçanın ortasında buluşabilir)
  const tek = out.slice(0, 2);
  for (let i = 2; i < out.length; i += 2) if (Math.abs(out[i] - tek[tek.length - 2]) > 1e-6 || Math.abs(out[i + 1] - tek[tek.length - 1]) > 1e-6) tek.push(out[i], out[i + 1]);
  return tek;
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
  // katman koşuları: her biri bir çoklu çizgi (köşeleri eksen değişen düğümler), koşular arasında via;
  // ilk koşu pinden, son koşu pine kısa uçla başlar ve biter
  let L = (durumlar[0] >> 1) & 1;
  let kos = [a.x, a.y];
  const bitir = () => {
    const p = pahla(kos, PAH);
    const hedef = L ? out.alt : out.ust;
    for (let i = 0; i + 3 < p.length; i += 2) hedef.push(p[i], p[i + 1], p[i + 2], p[i + 3]);
  };
  let onceki = -1;
  for (const st of durumlar) {
    const n = st >> 2;
    const Ls = (st >> 1) & 1;
    if (Ls !== L) {
      bitir();
      out.via.push(x(n), y(n));
      L = Ls;
      kos = [x(n), y(n)];
    } else if (n !== onceki) kos.push(x(n), y(n));
    onceki = n;
    iz.sahip[2 * n + Ls] = iz.sahip[2 * n + Ls] === -1 || iz.sahip[2 * n + Ls] === net ? net : -2;
  }
  kos.push(b.x, b.y);
  bitir();
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
