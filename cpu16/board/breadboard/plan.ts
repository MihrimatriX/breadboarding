// Breadboard planının ortak parçaları: yerleşim + teller, kurulum sırasıyla numaralı. Yerleşimin
// tavlaması ve yönlendirme saniyeler sürdüğünden projeler sonuçları üretilmiş bir veri dosyasında saklar
// (hesap makinesi: hesap8/breadboard/veri.ts, CPU16: cpu16/breadboard/veri/); plan saklanan veriden
// kurulur (3D görünüm, kurulum modu, belgeler). Veri netlistin parmak izini taşır: devre değişip veri
// eskirse plan kurulmaz (testler de bağlantıyı yalnız fiziksel modelden yeniden kurup netlistle
// karşılaştırır: dogrulama.ts).

import type { Board } from "../board.ts";
import { BX_ADIM, BY_ADIM, delikEtiketi } from "./geometri.ts";
import { tablodanRenk, type RenkTanimi, type TelRengi } from "./renk.ts";
import { yolUzunlugu, UC_PAYI, type BbTel, type RenkSecici, bacakNeti } from "./yonlendirme.ts";
import { pinNeti, type Asama, type BbYerlesim } from "./yerlesim.ts";

export type { BbTel } from "./yonlendirme.ts";

/** Bir panonun planı: yerleşim, kurulum sırasıyla teller, aşamalar */
export interface BbPlanTemel {
  yerlesim: BbYerlesim;
  /** kurulum sırasıyla: aşama; ray köprüleri, besleme, sinyaller; board; soldan sağa */
  teller: BbTel[];
  asamalar: Asama[];
}

// ---------------------------------------------------------------- parmak izi

/** Netlistin parmak izi: parçalar, pinleri ve netlerinin adları (FNV-1a, 32 bit); `kart`: yalnız o kartın parçaları */
export function netlistParmakIzi(board: Board, kart?: string): string {
  let h = 0x811c9dc5;
  const ekle = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  for (const c of board.chips) {
    if (kart !== undefined && c.card !== kart) continue;
    ekle(`${c.ref}:${c.def.part}:${c.block};`);
    for (const p of c.def.pins) ekle(`${p.num}=${board.netName(pinNeti(c, p.num))},`);
  }
  for (const p of board.passives) {
    if (kart !== undefined && p.card !== kart) continue;
    ekle(`${p.ref}:${p.part}:${p.block}:${p.role};`);
    for (const [num, net] of Object.entries(p.pins)) ekle(`${num}=${board.netName(net)},`);
  }
  return h.toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------- kodlama

/** Tel yolu: "X,Y" başlangıç, sonra her parça yön harfi + uzunluk (R sağ, L sol, D aşağı, U yukarı) */
export function yolKodla(yol: number[]): string {
  let s = `${yol[0]},${yol[1]}`;
  for (let i = 2; i < yol.length; i += 2) {
    const dx = yol[i] - yol[i - 2];
    const dy = yol[i + 1] - yol[i - 1];
    s += dx > 0 ? `R${dx}` : dx < 0 ? `L${-dx}` : dy > 0 ? `D${dy}` : `U${-dy}`;
  }
  return s;
}

export function yolCoz(s: string): number[] {
  const m = /^(-?\d+),(-?\d+)(.*)$/.exec(s);
  if (!m) throw new Error(`bozuk yol: ${s}`);
  let X = Number(m[1]);
  let Y = Number(m[2]);
  const yol = [X, Y];
  for (const p of m[3].matchAll(/([RLDU])(\d+)/g)) {
    const n = Number(p[2]);
    if (p[1] === "R") X += n; else if (p[1] === "L") X -= n; else if (p[1] === "D") Y += n; else Y -= n;
    yol.push(X, Y);
  }
  return yol;
}

export interface BbVeri {
  parmakIzi: string;
  /** mantık çiplerinin yeri: "U12|BB07|15" (ref, board, 1. pinin sütunu) */
  cipler: string[];
  /** kurulum sırasıyla teller: "ağ adı|aşama|r (ray köprüsü) ya da -|yol" */
  teller: string[];
}

/** Telin saklanan biçimi */
export const telKodla = (t: Pick<BbTel, "ad" | "asama" | "ray" | "yol">): string => `${t.ad}|${t.asama}|${t.ray ? "r" : "-"}|${yolKodla(t.yol)}`;

/** Saklanan tellerden plan telleri (numaralı, renkli, boylu) */
export function telleriCoz(board: Board, kayitlar: readonly string[], renk: (net: number) => TelRengi): BbTel[] {
  const netNo = new Map<string, number>();
  for (let n = 0; n < board.c.netNames.length; n++) netNo.set(board.netName(n), n);
  return kayitlar.map((s, i) => {
    const [ad, asama, ray, yolS] = s.split("|");
    const net = netNo.get(ad);
    if (net === undefined) throw new Error(`breadboard verisinde bilinmeyen net: ${ad}`);
    const yol = yolCoz(yolS);
    const uzunluk = yolUzunlugu(yol);
    const r: TelRengi = ray === "r" ? (net === board.c.VCC ? "kirmizi" : "siyah") : renk(net);
    return { no: i + 1, net, ad, renk: r, asama: Number(asama), ray: ray === "r", yol, uzunluk, kesim: Math.ceil(uzunluk + 2 * UC_PAYI) };
  });
}

/** Saklanan çip yerleri: ref → [board adı, 1. pinin sütunu] */
export function cipYerleri(kayitlar: readonly string[]): Map<string, [string, number]> {
  const yerler = new Map<string, [string, number]>();
  for (const s of kayitlar) {
    const [ref, b, c] = s.split("|");
    yerler.set(ref, [b, Number(c)]);
  }
  return yerler;
}

// ---------------------------------------------------------------- sıralama

/** Izgara noktasının board numarası (board'ların dışındaysa en yakın board) */
export function noktaBoardu(y: Pick<BbYerlesim, "nx" | "ny">, X: number, Y: number): number {
  const bx = Math.min(y.nx - 1, Math.max(0, Math.floor(X / BX_ADIM)));
  const by = Math.min(y.ny - 1, Math.max(0, Math.floor((Y + 3) / BY_ADIM)));
  return by * y.nx + bx;
}

/**
 * Kurulum sırası: aşama; ray köprüleri, besleme telleri, sinyaller; board; soldan sağa. Yönlendirici
 * hiçbir teli başka bir telin ucunun üstünden geçirmediği için her sıra kurulabilir; bu sıra eli
 * board board, soldan sağa gezdirir. Uçlar da sıralanır: önce numarası küçük board, aynıysa soldaki.
 * `renkler`: renklerin sırası (aynı yerdeki teller bu sırayla).
 */
export function sirala(y: BbYerlesim, teller: Omit<BbTel, "no">[], renkler: readonly RenkTanimi[]): BbTel[] {
  const RENK_SIRA = new Map<TelRengi, number>(renkler.map((r, i) => [r.renk, i]));
  const yon = (t: Omit<BbTel, "no">): Omit<BbTel, "no"> => {
    const n = t.yol.length;
    const a = noktaBoardu(y, t.yol[0], t.yol[1]);
    const z = noktaBoardu(y, t.yol[n - 2], t.yol[n - 1]);
    const ters = z < a || (z === a && (t.yol[n - 2] < t.yol[0] || (t.yol[n - 2] === t.yol[0] && t.yol[n - 1] < t.yol[1])));
    if (!ters) return t;
    const yol: number[] = [];
    for (let i = n - 2; i >= 0; i -= 2) yol.push(t.yol[i], t.yol[i + 1]);
    return { ...t, yol };
  };
  const anahtar = (t: Omit<BbTel, "no">) => {
    const tur = t.ray ? 0 : t.renk === "kirmizi" || t.renk === "siyah" ? 1 : 2;
    return [t.asama, tur, noktaBoardu(y, t.yol[0], t.yol[1]), t.yol[0], t.yol[1], RENK_SIRA.get(t.renk) ?? 0];
  };
  const k = teller.map(yon).map((t) => ({ t, a: anahtar(t) }));
  k.sort((p, q) => {
    for (let i = 0; i < p.a.length; i++) if (p.a[i] !== q.a[i]) return p.a[i] - q.a[i];
    return 0;
  });
  return k.map(({ t }, i) => ({ no: i + 1, ...t }));
}

// ---------------------------------------------------------------- renkler

/** Netin tel rengi: adından ve pinlerinin bloklarından (projenin renk seçicisi) */
export function telRenkleri(board: Board, y: BbYerlesim, renkSec: RenkSecici): (net: number) => TelRengi {
  const nesne = new Map<string, Parameters<typeof pinNeti>[0]>();
  for (const c of board.chips) nesne.set(c.ref, c);
  for (const p of board.passives) nesne.set(p.ref, p);
  const bloklar = new Map<number, Set<string>>();
  for (const p of y.parcalar) for (const b of p.bacaklar) {
    const n = bacakNeti(board, p, b.pin, nesne.get(p.ref));
    if (n < 0) continue;
    if (!bloklar.has(n)) bloklar.set(n, new Set());
    bloklar.get(n)!.add(p.blok);
  }
  const onbellek = new Map<number, TelRengi>();
  return (net) => {
    if (!onbellek.has(net)) onbellek.set(net, renkSec(board.netName(net), [...(bloklar.get(net) ?? [])]));
    return onbellek.get(net)!;
  };
}

// ---------------------------------------------------------------- ölçüler

export interface BbOlcu {
  board: number;
  /** bütün atlama telleri (ray köprüleri dahil) */
  tel: number;
  /** ray köprüleri: board içinde (üst ↔ alt ray çifti) ve board'lar arası */
  rayIc: number;
  rayArasi: number;
  /** delikten deliğe toplam ve kesim (uçlar dahil) toplamı, m */
  toplamM: number;
  kesimM: number;
  enUzunMm: number;
  ortalamaMm: number;
  /** kesim boyu dağılımı: [üst sınır mm, tel sayısı] */
  dagilim: [number, number][];
  /** renk başına tel sayısı ve kesim toplamı (m) */
  renkler: { renk: TelRengi; sayi: number; kesimM: number }[];
  asamalar: { no: number; ad: string; tel: number }[];
}

export const DAGILIM_SINIRLARI = [10, 20, 40, 80, 160, 320, 640, Infinity];

/** Planın ölçüleri; `renkler`: renk tablosu (sırası ve hangi renkler) */
export function bbOlcu(p: BbPlanTemel, renkler: readonly RenkTanimi[], sinirlar: readonly number[] = DAGILIM_SINIRLARI): BbOlcu {
  const t = p.teller;
  const ray = t.filter((x) => x.ray);
  // board içi köprü: iki ucu aynı board'da
  const rayIc = ray.filter((x) => noktaBoardu(p.yerlesim, x.yol[0], x.yol[1]) === noktaBoardu(p.yerlesim, x.yol[x.yol.length - 2], x.yol[x.yol.length - 1])).length;
  const toplam = t.reduce((a, x) => a + x.uzunluk, 0);
  const kesim = t.reduce((a, x) => a + x.kesim, 0);
  const dagilim: [number, number][] = sinirlar.map((s) => [s, 0]);
  for (const x of t) dagilim.find(([s]) => x.kesim <= s)![1]++;
  return {
    board: p.yerlesim.boards.length,
    tel: t.length,
    rayIc,
    rayArasi: ray.length - rayIc,
    toplamM: toplam / 1000,
    kesimM: kesim / 1000,
    enUzunMm: Math.max(...t.map((x) => x.uzunluk)),
    ortalamaMm: toplam / t.length,
    dagilim,
    renkler: renkler.map((r) => {
      const l = t.filter((x) => x.renk === r.renk);
      return { renk: r.renk, sayi: l.length, kesimM: l.reduce((a, x) => a + x.kesim, 0) / 1000 };
    }).filter((r) => r.sayi > 0),
    asamalar: p.asamalar.map((a) => ({ no: a.no, ad: a.ad, tel: t.filter((x) => x.asama === a.no).length })),
  };
}

/**
 * Tellerin üç boyutlu yolu (3D ve çizimler için): kurulum sırasında önce takılan tel altta kalır; bir
 * tel daha önce takılmış bir telin üstünden geçtiği noktada bir kat yükselir (kesişmede kısa bir
 * kambur, aynı çizgide giden tellerde boydan boya; en çok `enCok` kat). Her tel için köşe ve kat
 * değişimi noktaları: [X, Y, kat, X, Y, kat, …]; uçlar delikte (kat 0).
 */
export function telYollari3B(teller: readonly Pick<BbTel, "yol">[], enCok = 3): number[][] {
  const ust = new Map<number, number>(); // ızgara noktası → üstündeki ilk boş kat
  const anahtar = (X: number, Y: number) => (X + 1000) * 4096 + (Y + 1000);
  return teller.map((t) => {
    const X: number[] = [t.yol[0]];
    const Y: number[] = [t.yol[1]];
    for (let j = 2; j < t.yol.length; j += 2) {
      let x = t.yol[j - 2];
      let y = t.yol[j - 1];
      const dx = Math.sign(t.yol[j] - x);
      const dy = Math.sign(t.yol[j + 1] - y);
      while (x !== t.yol[j] || y !== t.yol[j + 1]) {
        x += dx;
        y += dy;
        X.push(x);
        Y.push(y);
      }
    }
    const n = X.length;
    const kat = new Array<number>(n).fill(0);
    for (let i = 1; i < n - 1; i++) kat[i] = Math.min(enCok, ust.get(anahtar(X[i], Y[i])) ?? 0);
    for (let i = 1; i < n - 1; i++) {
      const k = anahtar(X[i], Y[i]);
      ust.set(k, Math.max(ust.get(k) ?? 0, kat[i] + 1));
    }
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const kose = i === 0 || i === n - 1 || X[i + 1] - X[i] !== X[i] - X[i - 1] || Y[i + 1] - Y[i] !== Y[i] - Y[i - 1];
      if (kose || kat[i] !== kat[i - 1] || kat[i] !== kat[i + 1]) out.push(X[i], Y[i], kat[i]);
    }
    return out;
  });
}

// ---------------------------------------------------------------- yazılar

/** Izgara noktasının etiketi: "BB07 c14", "BB07 üst+14" */
export function ucEtiketi(y: BbYerlesim, X: number, Y: number): string {
  const b = y.boards[noktaBoardu(y, X, Y)];
  return `${b.ad} ${delikEtiketi(Y - b.by * BY_ADIM, X - b.bx * BX_ADIM)}`;
}

/** Renk tablosundaki tanım (tabloda yoksa adı ve rengi) */
export const renkBilgisi = (tablo: readonly RenkTanimi[], r: TelRengi): RenkTanimi => tablodanRenk(tablo, r);
