// PCB görünümünde bakır yollar: bir netin kartın içindeki bağlantıları (wires.ts netTree kenarları) kartın
// yüzeyinde dik açılı, köşeleri 45° pahlı yollar olarak. Her kartın kendi ızgarası (1,27 mm): çip ve pasif
// gövdelerinin üstü pahalı (yol mümkünse çevresinden dolanır), başka netlerin pedleri çok pahalı, aynı
// hesapta daha önce döşenen yolların üstü pahalı (yollar üst üste binmek yerine yan yana gider). A* yönlü:
// her kıvrımın bir maliyeti var, yollar az kıvrımlı. Saf fonksiyonlar (React'ten ve three'den bağımsız);
// testleri cpu16/tests/pcb-yol.test.ts.

import type { BoardLayout } from "../../cpu16/board/layout";
import type { WireEdge } from "./wires";

/** Izgara adımı (mm): DIP pin aralığı (yollar pinlerin arasından geçmez; ince ızgara büyük kartta yavaş) */
export const YOL_ADIM = 2.54;
/** maliyetler (adım başına 1): gövde üstü, başka netin pedi, kıvrım, daha önce döşenmiş yol */
const GOVDE = 20;
const YABANCI_PED = 40;
const KIVRIM = 4;
const YUK = 3;
/** A* sezgisinin ağırlığı (1: en ucuz yol, büyüdükçe hızlı ama dolambaçlı) */
const SEZGI = 2;
/** bir yolun A*'ında açılabilecek en çok durum (bulunamazsa düz çizgi) */
const EN_COK = 400_000;

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

/** Bir kartın ızgarası: düğüm (i, j) = (x0 + i·adim, y0 + j·adim) */
export interface Izgara {
  x0: number;
  y0: number;
  adim: number;
  nx: number;
  ny: number;
  /** düğüm bir gövdenin üstünde mi */
  govde: Uint8Array;
  /** düğümdeki pedin neti (yoksa −1; iki ped aynı düğümdeyse −2: herkese yabancı) */
  ped: Int32Array;
  /** bu hesapta düğümden geçen yol sayısı */
  yuk: Uint16Array;
  /** A*'ın tamponları (düğüm × 4 yön) ve geçerli oldukları arama (kuşak) */
  g?: Float32Array;
  once?: Int32Array;
  kusakDizi?: Uint32Array;
  kusak?: number;
}

export function izgaraKur(alan: Dikdortgen, govdeler: readonly Dikdortgen[], pedler: readonly Ped[], adim = YOL_ADIM): Izgara {
  const nx = Math.max(2, Math.floor(alan.w / adim) + 1);
  const ny = Math.max(2, Math.floor(alan.h / adim) + 1);
  const iz: Izgara = { x0: alan.x, y0: alan.y, adim, nx, ny, govde: new Uint8Array(nx * ny), ped: new Int32Array(nx * ny).fill(-1), yuk: new Uint16Array(nx * ny) };
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
export function dugum(iz: Izgara, x: number, y: number): number {
  const i = Math.min(iz.nx - 1, Math.max(0, Math.round((x - iz.x0) / iz.adim)));
  const j = Math.min(iz.ny - 1, Math.max(0, Math.round((y - iz.y0) / iz.adim)));
  return j * iz.nx + i;
}

const DI = [1, -1, 0, 0];
const DJ = [0, 0, 1, -1];

/**
 * a'dan b'ye bakır yol (net: kendi pedlerinin üstünden geçebilir): köşe noktaları [x, y, …] (mm), a ve b
 * dahil. Bulunamazsa (ya da çok pahalıysa) düz çizgi.
 */
export function yolBul(iz: Izgara, a: { x: number; y: number }, b: { x: number; y: number }, net: number): number[] {
  const { nx } = iz;
  const s = dugum(iz, a.x, a.y);
  const t = dugum(iz, b.x, b.y);
  if (s === t) return [a.x, a.y, b.x, b.y];
  // önce uçların çevresindeki pencerede (hızlı), bulunamazsa bütün kartta
  const son = ara(iz, s, t, net, PENCERE) ?? ara(iz, s, t, net, Infinity);
  if (son === null) return [a.x, a.y, b.x, b.y];
  // geriye yürü, yalnız köşeleri tut
  const hucreler: number[] = [];
  for (let st = son; st >= 0; st = iz.once![st]) hucreler.push(st >> 2);
  hucreler.reverse();
  const nokta = (c: number) => [iz.x0 + (c % nx) * iz.adim, iz.y0 + ((c / nx) | 0) * iz.adim];
  const out = [a.x, a.y];
  for (let k = 0; k < hucreler.length; k++) {
    const kose = k === 0 || k === hucreler.length - 1 || hucreler[k + 1] - hucreler[k] !== hucreler[k] - hucreler[k - 1];
    if (kose) out.push(...nokta(hucreler[k]));
  }
  out.push(b.x, b.y);
  return tekrarsiz(out);
}

/** Arama penceresi: uçların sınır kutusunun çevresinde bu kadar düğüm */
const PENCERE = 24;

/** A*: s'den t'ye en ucuz yolun son durumu (düğüm·4 + yön) ya da null; iz.once geri yürümek için */
function ara(iz: Izgara, s: number, t: number, net: number, pay: number): number | null {
  const { nx, ny } = iz;
  // tamponlar ızgarada saklanır; her aramanın bir kuşağı var, eski kuşağın değerleri geçersiz (sıfırlanmaz)
  const N = nx * ny * 4;
  iz.g ??= new Float32Array(N);
  iz.once ??= new Int32Array(N);
  iz.kusakDizi ??= new Uint32Array(N);
  const kusak = (iz.kusak = (iz.kusak ?? 0) + 1);
  const g = iz.g;
  const once = iz.once;
  const kd = iz.kusakDizi;
  const gOf = (st: number) => (kd[st] === kusak ? g[st] : Infinity);
  const si = s % nx, sj = (s / nx) | 0;
  const ti = t % nx, tj = (t / nx) | 0;
  const i0 = Math.min(si, ti) - pay, i1 = Math.max(si, ti) + pay;
  const j0 = Math.min(sj, tj) - pay, j1 = Math.max(sj, tj) + pay;
  // ağırlıklı sezgi: gövdelerle dolu kartta yumuşak engeller aramayı genişletmesin (yol en ucuzdan az sapar)
  const h = (d: number) => SEZGI * (Math.abs((d % nx) - ti) + Math.abs(((d / nx) | 0) - tj));
  // ikili yığın: (öncelik, durum) çiftleri; eskimiş girişler açılınca atlanır
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
  for (let d = 0; d < 4; d++) {
    kd[s * 4 + d] = kusak;
    g[s * 4 + d] = 0;
    once[s * 4 + d] = -1;
    it(h(s), s * 4 + d);
  }
  for (let acilan = 0; hf.length && acilan < EN_COK; acilan++) {
    const st = cek();
    const c = st >> 2;
    const d = st & 3;
    if (c === t) return st;
    const ci = c % nx, cj = (c / nx) | 0;
    const gs = gOf(st);
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d ^ 1)) continue; // geri dönmez
      const ni = ci + DI[nd], nj = cj + DJ[nd];
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny || ni < i0 || ni > i1 || nj < j0 || nj > j1) continue;
      const n = nj * nx + ni;
      const p = iz.ped[n];
      const m = 1 + (iz.govde[n] ? GOVDE : 0) + (p !== -1 && p !== net ? YABANCI_PED : 0) + iz.yuk[n] * YUK + (nd !== d ? KIVRIM : 0);
      const ns = n * 4 + nd;
      const ng = gs + m;
      if (ng < gOf(ns)) {
        kd[ns] = kusak;
        g[ns] = ng;
        once[ns] = st;
        it(ng + h(n), ns);
      }
    }
  }
  return null;
}

/** Art arda aynı noktaları atar */
function tekrarsiz(p: number[]): number[] {
  const out = p.slice(0, 2);
  for (let i = 2; i < p.length; i += 2) if (Math.abs(p[i] - out[out.length - 2]) > 1e-6 || Math.abs(p[i + 1] - out[out.length - 1]) > 1e-6) out.push(p[i], p[i + 1]);
  return out;
}

/** Yolun düğümlerinin yükünü artırır (sonraki yollar yanından geçsin) */
export function yukle(iz: Izgara, yol: readonly number[]): void {
  for (let k = 0; k + 3 < yol.length; k += 2) {
    const a = dugum(iz, yol[k], yol[k + 1]);
    const b = dugum(iz, yol[k + 2], yol[k + 3]);
    const ai = a % iz.nx, aj = (a / iz.nx) | 0, bi = b % iz.nx, bj = (b / iz.nx) | 0;
    const n = Math.max(Math.abs(bi - ai), Math.abs(bj - aj));
    for (let s = 0; s <= n; s++) {
      const i = Math.round(ai + ((bi - ai) * s) / Math.max(1, n));
      const j = Math.round(aj + ((bj - aj) * s) / Math.max(1, n));
      iz.yuk[j * iz.nx + i]++;
    }
  }
}

/** Köşeleri c kadar (komşu parçaların yarısını aşmadan) 45° pahlar; uçlar korunur */
export function pahla(yol: readonly number[], c: number): number[] {
  const n = yol.length / 2;
  if (n < 3) return yol.slice();
  const out = [yol[0], yol[1]];
  for (let k = 1; k + 1 < n; k++) {
    const [px, py] = [yol[2 * k], yol[2 * k + 1]];
    const ux = px - yol[2 * k - 2], uy = py - yol[2 * k - 1];
    const vx = yol[2 * k + 2] - px, vy = yol[2 * k + 3] - py;
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    const d = Math.min(c, lu / 2, lv / 2);
    if (d < 1e-6) {
      out.push(px, py);
      continue;
    }
    out.push(px - (ux / lu) * d, py - (uy / lu) * d, px + (vx / lv) * d, py + (vy / lv) * d);
  }
  out.push(yol[2 * n - 2], yol[2 * n - 1]);
  // komşu iki köşenin pahları parçanın ortasında buluşabilir: aynı nokta iki kez kalmasın
  return tekrarsiz(out);
}

/** Bir yerleşimin kart ızgaraları (yerleşim başına bir kez kurulur) */
const izgaraOnbellegi = new WeakMap<object, Map<string, Izgara>>();
function kartIzgarasi(lay: Pick<BoardLayout, "cards" | "chips" | "passives">, kart: string): Izgara | null {
  let m = izgaraOnbellegi.get(lay);
  if (!m) izgaraOnbellegi.set(lay, (m = new Map()));
  let iz = m.get(kart);
  if (!iz) {
    const c = lay.cards.find((x) => x.name === kart);
    if (!c) return null;
    const govdeler: Dikdortgen[] = [...lay.chips.filter((x) => x.card === kart), ...lay.passives.filter((x) => x.card === kart && !x.edge)];
    const pedler: Ped[] = [...lay.chips, ...lay.passives].filter((x) => x.card === kart).flatMap((x) => x.pins.map((p) => ({ x: p.x, y: p.y, net: p.net })));
    iz = izgaraKur(c, govdeler, pedler);
    m.set(kart, iz);
  }
  return iz;
}

/** Bir bakır yol: neti, köşe noktaları [x, y, …] (mm, köşeleri pahlı) ve hangi seçime ait olduğu */
export interface BakirYol<T = unknown> {
  net: number;
  yol: number[];
  etiket: T;
}

/**
 * Kenarların kart içindekileri bakır yol olarak döşer, birer birer (görünüm kare başına birkaç milisaniye
 * harcar, büyük bir çipte takılmaz): kartlar arası kenarlar arka panelden gider, burada yoktur. Her yol
 * kendi kartının ızgarasında, uzunlar önce (kısalar araya sığsın), köşeleri pahlı. Aynı anda tek bir
 * döşeme sürer (ızgaraların yükü paylaşılır).
 */
export function* bakirYollariSirayla<T>(lay: Pick<BoardLayout, "cards" | "chips" | "passives">, gruplar: readonly { edges: readonly WireEdge[]; etiket: T }[]): Generator<BakirYol<T>> {
  const ic = gruplar.flatMap((g) => g.edges.filter((e) => e.a.card === e.b.card).map((e) => ({ e, etiket: g.etiket })));
  for (const k of new Set(ic.map((x) => x.e.a.card))) kartIzgarasi(lay, k)?.yuk.fill(0);
  const boy = (e: WireEdge) => Math.abs(e.a.x - e.b.x) + Math.abs(e.a.y - e.b.y);
  ic.sort((p, q) => boy(q.e) - boy(p.e));
  for (const { e, etiket } of ic) {
    const iz = kartIzgarasi(lay, e.a.card);
    if (!iz) continue;
    const yol = yolBul(iz, e.a, e.b, e.net);
    yukle(iz, yol);
    yield { net: e.net, yol: pahla(yol, YOL_ADIM * 0.6), etiket };
  }
}

/** Hepsi birden (testler): bakirYollariSirayla'nın sonucu */
export const bakirYollari = (lay: Pick<BoardLayout, "cards" | "chips" | "passives">, edges: readonly WireEdge[]): BakirYol<null>[] =>
  [...bakirYollariSirayla(lay, [{ edges, etiket: null }])];

/**
 * Düz bir yolun şeridi (x, z düzleminde; noktalar [x, z, …]): her noktada iki köşe (sol, sağ), köşelerde
 * gönye (sivri açıda en çok 2 genişlik). Dönen dizi [xL, zL, xR, zR, …].
 */
export function yolSeridi(p: readonly number[], w: number): number[] {
  const n = p.length / 2;
  const out: number[] = [];
  const h = w / 2;
  const birim = (x: number, z: number) => {
    const l = Math.hypot(x, z) || 1;
    return [x / l, z / l];
  };
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const [ux, uz] = birim(p[2 * i] - p[2 * a], p[2 * i + 1] - p[2 * a + 1]);
    const [vx, vz] = birim(p[2 * b] - p[2 * i], p[2 * b + 1] - p[2 * i + 1]);
    // gönye: iki parçanın sol normallerinin (−z, x) ortalaması; uçlarda tek parçanınki
    const sx = -(uz + vz), sz = ux + vx;
    let [mx, mz] = Math.hypot(sx, sz) > 1e-6 ? birim(sx, sz) : [-vz, vx];
    if (i === 0) [mx, mz] = [-vz, vx];
    if (i === n - 1) [mx, mz] = [-uz, ux];
    const cos = i === 0 || i === n - 1 ? 1 : Math.max(0.5, mx * -uz + mz * ux);
    const k = h / cos;
    out.push(p[2 * i] + mx * k, p[2 * i + 1] + mz * k, p[2 * i] - mx * k, p[2 * i + 1] - mz * k);
  }
  return out;
}
