// CPU16'nın breadboard planı: her kartın panosu (yerleşim + kurulum sırasıyla teller) ve bütün makine
// (panoların masadaki yeri, panolar arası 64 damarlı şerit kablo). Tavlama ve yönlendirme kart başına
// saniyeler–bir dakika sürdüğünden sonuçlar cpu16/breadboard/veri/ altında saklanır (`npm run cpu16 --
// breadboard --uret` yeniden üretir); plan saklanan veriden kurulur. Ortak motor:
// cpu16/board/breadboard/.

import type { Board } from "../board/board.ts";
import { BY_ADIM, mmX, mmY } from "../board/breadboard/geometri.ts";
import { panoParcalari, plakaBoyu } from "../board/breadboard/gorunum.ts";
import {
  bbOlcu as olcu, cipYerleri, netlistParmakIzi, sirala, telKodla, telleriCoz, telRenkleri, ucEtiketi, type BbOlcu, type BbPlanTemel, type BbVeri,
} from "../board/breadboard/plan.ts";
import { panolariDogrula, type DogrulamaSonucu, type SeritKablo } from "../board/breadboard/dogrulama.ts";
import { boardAdi } from "../board/breadboard/geometri.ts";
import { yonlendir, type BbTel, type YonlendirmeSecenekleri } from "../board/breadboard/yonlendirme.ts";
import type { BoardLayout } from "../board/layout.ts";
import { buildFullMachineBoard } from "../board/machine-board.ts";
import { KART_SIRASI, MAKINE_SIRALARI, panoTanimi, type PanoTanimi } from "./panolar.ts";
import { CPU_BB_RENKLERI, cpuTelRengi } from "./renk.ts";
import { BB_VERILERI } from "./veri/index.ts";
import { kartYerlesimi } from "./yerlesim.ts";

/** En uzun tel (delikten deliğe, mm): daha uzunlar boş bir şeritte bölünür ya da aktarma şeridinden geçer */
export const EN_UZUN_TEL = 300;

export interface KartBbPlani extends BbPlanTemel {
  kart: string;
  tanim: PanoTanimi;
}

/** Kartın ölçüleri (CPU16 renk kodu) */
export const kartOlcu = (p: BbPlanTemel): BbOlcu => olcu(p, CPU_BB_RENKLERI);

// ---------------------------------------------------------------- üretim ve kurma

export interface KartUretimi {
  veri: BbVeri;
  plan: KartBbPlani;
  binme: number;
  kesisme: number;
}

/** Kartın panosunu üret: tavlama + yönlendirme (kart başına birkaç saniye–bir dakika) */
export function kartPlaniUret(board: Board, kart: string, o: YonlendirmeSecenekleri & { adim?: number } = {}): KartUretimi {
  const tanim = panoTanimi(kart);
  const yerlesim = kartYerlesimi(board, kart, { adim: o.adim });
  const r = yonlendir(board, yerlesim, cpuTelRengi, { enUzun: EN_UZUN_TEL, ...o });
  const teller = sirala(yerlesim, r.teller, CPU_BB_RENKLERI);
  for (const t of teller) if (t.ad.includes("|")) throw new Error(`net adında | var: ${t.ad}`);
  const cipler = yerlesim.parcalar.filter((p) => p.cipMi).map((p) => `${p.ref}|${boardAdi(p.board)}|${p.sutun}`);
  const veri: BbVeri = { parmakIzi: netlistParmakIzi(board, kart), cipler, teller: teller.map(telKodla) };
  return { veri, plan: { kart, tanim, yerlesim, teller, asamalar: tanim.asamalar }, binme: r.binme, kesisme: r.kesisme };
}

/** Saklanan veriden kartın planı (hızlı) */
export function kartPlaniKur(board: Board, kart: string, veri: BbVeri): KartBbPlani {
  const tanim = panoTanimi(kart);
  const iz = netlistParmakIzi(board, kart);
  if (iz !== veri.parmakIzi) throw new Error(`${kart}: breadboard verisi eski (netlist ${iz}, veri ${veri.parmakIzi}): npm run cpu16 -- breadboard --uret ${kart}`);
  const yerlesim = kartYerlesimi(board, kart, { yerler: cipYerleri(veri.cipler) });
  const teller = telleriCoz(board, veri.teller, telRenkleri(board, yerlesim, cpuTelRengi));
  return { kart, tanim, yerlesim, teller, asamalar: tanim.asamalar };
}

// ---------------------------------------------------------------- makine: panoların yeri, şerit kablo

/** Panolar arası boşluk ve koridor (mm) */
export const PANO_ARASI = 60;
export const KORIDOR = 140;

export interface PanoYeri {
  kart: string;
  /** taban plakasının sol üst köşesi ve boyu (mm, makine düzleminde) */
  x: number;
  y: number;
  w: number;
  h: number;
  sira: "arka" | "on";
}

export interface SeritSoketi {
  kart: string;
  /** uyarlayıcının referansı (J1, J201 …) */
  ref: string;
  /** soketin ortası (mm, makine düzleminde) */
  x: number;
  y: number;
}

export interface SeritKabloPlani {
  damar: number;
  /** soketler kablo boyunca sırayla (soldan sağa) */
  soketler: SeritSoketi[];
  /** koridorun orta çizgisi (mm) */
  koridorY: number;
  /** kesim boyu (mm): soketler arası yol + her sokette inip çıkma + %10 pay */
  boyMm: number;
}

export interface MakineBbPlani {
  board: Board;
  kartlar: KartBbPlani[];
  yerler: PanoYeri[];
  serit: SeritKabloPlani;
  w: number;
  h: number;
}

/** Panoların masadaki yeri: arka sıra koridora ön kenarıyla, ön sıra arka kenarıyla bakar; iki sıra ortalanır */
export function panoYerleri(kartlar: KartBbPlani[]): { yerler: PanoYeri[]; w: number; h: number; koridorY: number } {
  const boy = new Map(kartlar.map((k) => [k.kart, plakaBoyu(k)]));
  const sira = (l: string[]) => {
    const w = l.reduce((s, k) => s + boy.get(k)!.w, 0) + PANO_ARASI * (l.length - 1);
    const h = Math.max(...l.map((k) => boy.get(k)!.h));
    return { w, h };
  };
  const arka = sira(MAKINE_SIRALARI.arka);
  const on = sira(MAKINE_SIRALARI.on);
  const w = Math.max(arka.w, on.w);
  const yerler: PanoYeri[] = [];
  const diz = (l: string[], genislik: number, y: (h: number) => number, s: "arka" | "on") => {
    let x = (w - genislik) / 2;
    for (const k of l) {
      const b = boy.get(k)!;
      yerler.push({ kart: k, x, y: y(b.h), w: b.w, h: b.h, sira: s });
      x += b.w + PANO_ARASI;
    }
  };
  // arka sıra koridora dayanır (alt kenarları aynı çizgide), ön sıra koridorun öbür yanında
  diz(MAKINE_SIRALARI.arka, arka.w, (h) => arka.h - h, "arka");
  diz(MAKINE_SIRALARI.on, on.w, () => arka.h + KORIDOR, "on");
  return { yerler, w, h: arka.h + KORIDOR + on.h, koridorY: arka.h + KORIDOR / 2 };
}

/** Uyarlayıcının ortası (mm, panonun kendi düzleminde) */
export function uyarlayiciMerkezi(p: KartBbPlani): { x: number; y: number; ref: string } {
  const u = p.yerlesim.parcalar.find((q) => q.tur === "uyarlayici")!;
  const xs = u.bacaklar.map((b) => mmX(b.X));
  const ys = u.bacaklar.map((b) => mmY(b.Y));
  return { ref: u.ref, x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

export function makinePlaniKur(board: Board, kartlar: KartBbPlani[]): MakineBbPlani {
  const { yerler, w, h, koridorY } = panoYerleri(kartlar);
  const soketler: SeritSoketi[] = kartlar.map((k) => {
    const yer = yerler.find((q) => q.kart === k.kart)!;
    const m = uyarlayiciMerkezi(k);
    return { kart: k.kart, ref: m.ref, x: yer.x + m.x, y: yer.y + m.y };
  }).sort((a, b) => a.x - b.x);
  let yol = 0;
  for (let i = 1; i < soketler.length; i++) yol += Math.abs(soketler[i].x - soketler[i - 1].x);
  for (const s of soketler) yol += 2 * Math.abs(s.y - koridorY);
  const serit: SeritKabloPlani = { damar: 64, soketler, koridorY, boyMm: Math.ceil((yol * 1.1) / 10) * 10 };
  return { board, kartlar: KART_SIRASI.map((k) => kartlar.find((x) => x.kart === k)!).filter(Boolean), yerler, serit, w, h };
}

let onbellek: MakineBbPlani | undefined;
/** Saklanan veriden bütün makinenin planı (tek örnek; kart verilirse onunla: 3D sahnenin kartı) */
export function makineBbPlani(board?: Board): MakineBbPlani {
  if (!onbellek || (board && onbellek.board !== board)) {
    const b = board ?? buildFullMachineBoard().board;
    onbellek = makinePlaniKur(b, KART_SIRASI.map((k) => kartPlaniKur(b, k, BB_VERILERI[k])));
  }
  return onbellek;
}

// ---------------------------------------------------------------- doğrulama

/** Panolar arası şerit kablo (doğrulama için): her uyarlayıcının k. pini k. damarda */
export function seritKablolari(m: Pick<MakineBbPlani, "kartlar">): SeritKablo[] {
  return [{ ad: "arka panel", damar: 64, uclar: m.kartlar.map((k, i) => [i, uyarlayiciMerkezi(k).ref] as [number, string]) }];
}

/** Bir kartın panosu tek başına: kartın parçaları ve netleri (öteki kartlara giden netler uyarlayıcıda biter) */
export function kartiDogrula(board: Board, p: KartBbPlani, asama?: number): DogrulamaSonucu {
  return panolariDogrula(board, [{ ad: p.tanim.kisa, kart: p.kart, yerlesim: p.yerlesim, teller: p.teller }], [], { asama, oncekiUcUstu: true });
}

/** Bütün makine: bütün panolar + şerit kablo = anakartın netlisti */
export function makineyiDogrula(m: MakineBbPlani): DogrulamaSonucu {
  return panolariDogrula(m.board, m.kartlar.map((k) => ({ ad: k.tanim.kisa, kart: k.kart, yerlesim: k.yerlesim, teller: k.teller })), seritKablolari(m), { oncekiUcUstu: true });
}

// ---------------------------------------------------------------- 3D yerleşimi ve yazılar

/** Bütün makinenin 3D yerleşimi (mm): panoların parçaları kendi yerlerinde */
export function makineLayout(m: MakineBbPlani): BoardLayout {
  const out: BoardLayout = { cards: [], rows: [], blocks: [], chips: [], passives: [], width: m.w, height: m.h };
  for (const k of m.kartlar) {
    const yer = m.yerler.find((q) => q.kart === k.kart)!;
    const p = panoParcalari(m.board, k.yerlesim, { kart: k.kart, ox: yer.x, oy: yer.y });
    out.blocks.push(...p.blocks);
    out.chips.push(...p.chips);
    out.passives.push(...p.passives);
  }
  return out;
}

/** Telin tarifi: "CPU · BB07 c14 → BB08 h3, 42 mm, sarı" */
export function cpuTelTarifi(p: KartBbPlani, t: BbTel, renkAdi: string): string {
  const n = t.yol.length;
  return `${p.tanim.kisa} · ${ucEtiketi(p.yerlesim, t.yol[0], t.yol[1])} → ${ucEtiketi(p.yerlesim, t.yol[n - 2], t.yol[n - 1])}, ${Math.round(t.uzunluk)} mm, ${renkAdi}`;
}

/** Board satırının mm cinsinden yüksekliği (belgelerde) */
export const BOARD_SATIRI_MM = BY_ADIM * 2.54;
