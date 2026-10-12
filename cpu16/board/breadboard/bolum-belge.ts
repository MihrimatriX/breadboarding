// Kurulum belgelerinin bölüm işaretleri (CPU16 panoları ve hesap makinesi ortak): pano haritasında
// bölge çerçeveleri ve etiketleri, board çizimlerinde çip gruplarının etiketleri ve "Bölümler" (her
// bölgenin görevi, nasıl çalıştığı, çip grupları, parçaları ve board'ları). Metinler
// cpu16/board/bolum-bilgi.ts'ten; renkler 3D görünümdeki bölge çerçeveleriyle aynı
// (cpu16/board/bolum-cizim.ts).

import { esc } from "../../kurulum/stil.ts";
import type { Board } from "../board.ts";
import { bolumKatalogu, bolumKimligi, bolumleri, type Bolum, type BolumKatalogu } from "../bolum-bilgi.ts";
import { boardunGruplari, grupBolgeleri, hucreSiniri, panoBolgeleri, type BolgeBoardu, type PanoBolgesi } from "../bolum-cizim.ts";
import { PASSIVES } from "../passives.ts";
import type { GrupEtiketi } from "./cizim.ts";

/** Belgenin istediği yerleşim: board'lar (ad, rol, ızgara) ve parçalar (board, çip mi) */
export interface BelgeYerlesimi {
  boards: readonly (BolgeBoardu & { no: number; ad: string; gruplar?: readonly string[] })[];
  parcalar: readonly { ref: string; board: number; part: string; cipMi: boolean; tur: string; sutun?: number }[];
}

const KATALOGLAR = new WeakMap<Board, BolumKatalogu>();
/** Kartın bölüm kataloğu (her belgede yeniden kurulmasın; CPU16'da bütün makinenin kartı) */
export function katalogu(tur: "cpu16" | "hesap", board: Board): BolumKatalogu {
  let k = KATALOGLAR.get(board);
  if (!k) KATALOGLAR.set(board, (k = bolumKatalogu(tur, board)));
  return k;
}

// ---------------------------------------------------------------- pano haritası

/**
 * Haritanın ölçüleri (SVG birimi): board W × H, board'lar arası yatayda gx; her board sırasının üstünde
 * bölge etiketine `ust`, altında `alt` boşluk. Haritanın üstünde y0 kadar yer (kenarın adı).
 */
export const HARITA = { W: 52, H: 17, gx: 3, ust: 6, alt: 2, y0: 7 } as const;
const SIRA = HARITA.H + HARITA.ust + HARITA.alt;
/** board'un haritadaki sol üst köşesi */
export const haritaX = (bx: number): number => bx * (HARITA.W + HARITA.gx);
export const haritaY = (by: number): number => HARITA.y0 + HARITA.ust + by * SIRA;
/** haritanın eni ve boyu (altta ön kenarın adı için yer) */
export const haritaBoyu = (nx: number, ny: number): { w: number; h: number } => ({ w: nx * (HARITA.W + HARITA.gx) - HARITA.gx, h: HARITA.y0 + ny * SIRA + 7 });

/** çerçevenin hücre kenarından içe kayması */
const IC = 0.55;
/** BÜYÜK HARF kalın DejaVu Sans'ın ortalama harf eni (em) */
const KALIN_EN = 0.72;
/** BÜYÜK HARF normal yazının ortalama harf eni (em; DejaVu Sans, ölçülmüş ≈ 0,56) */
const NORMAL_EN = 0.6;

/** Yazıyı en'e sığdır: büyükten küçüğe boy, en küçükte de sığmazsa "…" ile kısalt */
function sigdir(metin: string, en: number, boy: number, enKucuk: number, harf = KALIN_EN): { metin: string; boy: number } {
  const b = Math.max(enKucuk, Math.min(boy, en / (harf * metin.length)));
  if (harf * b * metin.length <= en) return { metin, boy: b };
  const n = Math.max(1, Math.floor(en / (harf * b)) - 1);
  return { metin: `${metin.slice(0, n).trimEnd()}…`, boy: b };
}

export interface HaritaBolgeleri {
  bolgeler: PanoBolgesi[];
  /** board'ların üstüne çizilecek: bölge çerçeveleri ve etiketleri */
  svg: string;
}

/**
 * Pano haritasının bölge çerçeveleri: her bölge board'larının çevresinde renkli bir çizgi (L biçimli
 * bölgeler de tek çizgi), etiketi bölgenin sol üst board'unun üstünde, çizgiye asılı bir sekme.
 */
export function haritaBolgeleri(kart: string, boards: readonly BolgeBoardu[], k: BolumKatalogu): HaritaBolgeleri {
  const bolgeler = panoBolgeleri(kart, boards, k);
  const s: string[] = [];
  const dx = HARITA.W + HARITA.gx;
  const x0 = -HARITA.gx / 2;
  const y0 = haritaY(0) - HARITA.ust;
  for (const b of bolgeler) {
    const k2 = hucreSiniri(b.hucreler, x0, y0, dx, SIRA, IC);
    const d: string[] = [];
    for (let i = 0; i < k2.length; i += 4) d.push(`M${k2[i].toFixed(2)} ${k2[i + 1].toFixed(2)}H${k2[i + 2].toFixed(2)}V${k2[i + 3].toFixed(2)}`);
    s.push(`<path d="${d.join("")}" fill="none" stroke="${b.renk}" stroke-width="0.7" stroke-linecap="square"/>`);
  }
  for (const b of bolgeler) {
    const bolum = k.bolumler.get(b.id)!;
    const ilk = b.hucreler[0];
    // sekmenin sığacağı yer: ilk board'dan sağa, bölgenin aynı sıradaki board'ları
    let n = 1;
    while (b.hucreler.some((h) => h.j === ilk.j && h.i === ilk.i + n)) n++;
    const x = x0 + ilk.i * dx + IC;
    const y = y0 + ilk.j * SIRA + IC;
    const en = n * dx - 2 * IC - 2;
    const yazi = sigdir(bolum.etiket, en - 2.4, 2.8, 2.1);
    const w = KALIN_EN * yazi.boy * yazi.metin.length + 2.4;
    const h = HARITA.ust - 2 * IC - 0.7;
    s.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="0.6" fill="${b.renk}"/>`);
    s.push(`<text x="${(x + 1.2).toFixed(2)}" y="${(y + h / 2).toFixed(2)}" font-size="${yazi.boy.toFixed(2)}" font-weight="700" fill="#fff" dominant-baseline="central">${esc(yazi.metin)}</text>`);
  }
  return { bolgeler, svg: s.join("") };
}

/**
 * Board'daki çip gruplarının etiketleri (3D'deki board plakalarıyla aynı sırada: boardunGruplari), en
 * çok `satir` satıra sığdığı kadar; kalanlar "+N"
 */
export function boardGruplari(kart: string, no: number, y: BelgeYerlesimi, k: BolumKatalogu, en: number, boy: number, satir = 2): string[] {
  const et = boardunGruplari(kart, no, y, k).map((g) => k.bolumler.get(g)!.etiket);
  const sigar = (t: string) => NORMAL_EN * boy * t.length <= en;
  const out: string[] = [""];
  for (let i = 0; i < et.length; i++) {
    const son = out.length - 1;
    const kalan = et.length - i - 1;
    const ek = (t: string) => (kalan && out.length === satir ? `${t} +${kalan}` : t);
    const aday = out[son] ? `${out[son]} · ${et[i]}` : et[i];
    if (sigar(ek(aday))) {
      out[son] = aday;
      continue;
    }
    if (out[son] && out.length < satir && sigar(ek(et[i]))) {
      out.push(et[i]);
      continue;
    }
    // sığmadı: son satır "+N" ile biter (satırda hiç etiket yoksa bu etiket kısaltılır)
    if (!out[son]) out[son] = sigdir(et[i], en - NORMAL_EN * boy * 4, boy, boy, NORMAL_EN).metin + (kalan ? ` +${kalan}` : "");
    else out[son] = `${out[son]} +${et.length - i}`;
    return out;
  }
  return out.filter(Boolean);
}

// ---------------------------------------------------------------- board çizimlerinin grup etiketleri

/** Board çiziminde parçanın grubu: etiketi ve bölgesinin rengi (cizim.ts CizimSecenekleri.grup) */
export function grupEtiketleri(kart: string, y: BelgeYerlesimi, k: BolumKatalogu): (ref: string) => GrupEtiketi | undefined {
  const renk = new Map(panoBolgeleri(kart, y.boards, k).map((b) => [b.id, b.renk]));
  const bolgesi = grupBolgeleri(kart, y, k);
  return (ref) => {
    const g = k.grubu.get(ref);
    const b = g ? k.bolumler.get(g) : undefined;
    if (!g || !b) return undefined;
    return { id: g, etiket: b.etiket, renk: renk.get(bolgesi.get(g) ?? "") ?? "#5a6f87" };
  };
}

// ---------------------------------------------------------------- "Bölümler"

/** "U12, U13, U14, U15" → "U12–U15" (aynı önekli ardışık numaralar, üç ve fazlası) */
export function refOzeti(refs: readonly string[]): string {
  const ayir = (r: string) => {
    const m = /^(.*?)(\d+)$/.exec(r);
    return m ? { on: m[1], no: Number(m[2]), r } : { on: r, no: NaN, r };
  };
  const xs = refs.map(ayir).sort((a, b) => a.on.localeCompare(b.on) || a.no - b.no);
  const out: string[] = [];
  for (let i = 0; i < xs.length; ) {
    let j = i;
    while (j + 1 < xs.length && xs[j + 1].on === xs[i].on && xs[j + 1].no === xs[j].no + 1) j++;
    if (j - i >= 2) out.push(`${xs[i].r}–${xs[j].r}`);
    else for (let t = i; t <= j; t++) out.push(xs[t].r);
    i = j + 1;
  }
  return out.join(", ");
}

/** Pasifin kısa adı: başlığının parantezden önceki kısmı ("330 Ω direnç") */
const parcaAdi = (part: string, cipMi: boolean): string => (cipMi ? part : (PASSIVES[part]?.title ?? part).split(" (")[0]);

/** Grubun parçaları türlerine göre: "U41, U42 · 74HC574; R12–R15 · 330 Ω direnç" */
function parcaOzeti(refs: readonly string[], y: BelgeYerlesimi): string {
  const tur = new Map<string, string[]>();
  for (const r of refs) {
    const q = y.parcalar.find((p) => p.ref === r);
    if (!q) continue;
    const ad = parcaAdi(q.part, q.cipMi);
    tur.set(ad, [...(tur.get(ad) ?? []), r]);
  }
  return [...tur].map(([ad, rs]) => `<span class="ref">${esc(refOzeti(rs))}</span> ${esc(ad)}`).join("<br>");
}

/** Karşılaştırma için yalnız harfler ve rakamlar, büyük harfle ("A: yüzler hanesi" = "A YÜZLER HANESİ") */
const harfler = (s: string): string => s.toLocaleUpperCase("tr-TR").replace(/[^\p{L}\p{N}]/gu, "");

/** Board adları, ardışık numaralar aralıkla: "BB06–BB09, BB14" */
function boardOzeti(nolar: Iterable<number>, y: BelgeYerlesimi): string {
  return refOzeti([...new Set(nolar)].sort((a, b) => a - b).map((n) => y.boards.find((b) => b.no === n)?.ad ?? `BB${n + 1}`));
}

export const BOLUM_STIL = `
.bolge { break-inside: auto; margin: 0 0 4mm; }
.bolge h3 { display: flex; align-items: baseline; gap: 2mm; flex-wrap: wrap; border-left: 1.4mm solid var(--renk); padding-left: 2mm; margin-top: 4mm; }
.bolge-etiket { font-size: 8.5pt; font-weight: 700; letter-spacing: 0.03em; color: #fff; background: var(--renk); border-radius: 0.8mm; padding: 0.3mm 1.6mm; }
.bolge .nasil { color: #333; }
table.bolum-tablo td.grup b { font-size: 7.6pt; letter-spacing: 0.02em; }
table.bolum-tablo td.grup span { display: block; color: var(--muted); font-size: 7.2pt; }
table.bolum-tablo td .ref { font-weight: 600; }
`;

/**
 * "Bölümler": her bölge (haritadaki çerçevenin rengiyle) görevi ve nasıl çalıştığıyla, altında çip
 * grupları tablo olarak: etiket, görev, parçalar, board'lar. Grubun bölgesi parçalarının çoğunun
 * durduğu board'un bölgesidir; hiçbir board'a oturmayan grup (yoksa) "Öbür gruplar"da.
 * `cizimler`: board çizimlerinin bölümü ("5. bölüm").
 */
export function bolumlerHtml(kart: string, y: BelgeYerlesimi, k: BolumKatalogu, baslik: string, cizimler: string): string {
  const bolgeler = panoBolgeleri(kart, y.boards, k);
  const bolgesi = grupBolgeleri(kart, y, k);
  const gruplar = bolumleri(k, "grup", kart);
  const boardlari = (refs: readonly string[]) => y.parcalar.filter((q) => refs.includes(q.ref)).map((q) => q.board);
  const tablo = (gs: Bolum[]) => {
    const satir = gs.map((g) => {
      const alt = harfler(g.baslik) === harfler(g.etiket) ? "" : `<span>${esc(g.baslik)}</span>`;
      return `<tr><td class="grup"><b>${esc(g.etiket)}</b>${alt}</td><td>${esc(g.gorev)}</td><td class="kucuk">${parcaOzeti(g.refs, y)}</td><td class="mono kucuk">${boardOzeti(boardlari(g.refs), y)}</td></tr>`;
    }).join("");
    return `<table class="tablo bolum-tablo"><thead><tr><th style="width:34mm">Grup</th><th>Görevi</th><th style="width:42mm">Parçalar</th><th style="width:27mm">Board</th></tr></thead><tbody>${satir}</tbody></table>`;
  };
  const out: string[] = [];
  for (const b of bolgeler) {
    const bolum = k.bolumler.get(b.id)!;
    const gs = gruplar.filter((g) => bolgesi.get(g.id) === b.id);
    const nolar = y.boards.filter((x) => b.hucreler.some((h) => h.i === x.bx && h.j === x.by)).map((x) => x.no);
    const parcalar = y.parcalar.filter((q) => nolar.includes(q.board) && k.grubu.has(q.ref));
    const cip = parcalar.filter((q) => q.cipMi).length;
    const sayilar = [`${nolar.length} board`, cip ? `${cip} entegre` : "", parcalar.length > cip ? `${parcalar.length - cip} pasif` : ""].filter(Boolean).join(" · ");
    out.push(`<div class="bolge" style="--renk:${b.renk}">
<h3><span class="bolge-etiket">${esc(bolum.etiket)}</span>${esc(bolum.baslik)} <span class="muted kucuk">${boardOzeti(nolar, y)} · ${sayilar}</span></h3>
<p><b>Görevi:</b> ${esc(bolum.gorev)}</p>
<p class="nasil kucuk"><b>Nasıl çalışır:</b> ${esc(bolum.nasil)}</p>
${gs.length ? tablo(gs) : ""}
</div>`);
  }
  const kalan = gruplar.filter((g) => !bolgesi.has(g.id));
  if (kalan.length) out.push(`<div class="bolge" style="--renk:#5a6f87"><h3>Öbür gruplar</h3>${tablo(kalan)}</div>`);
  const kartB = k.bolumler.get(bolumKimligi.kart(kart));
  return `<h3>${esc(baslik)}</h3>
${kartB ? `<p>${esc(kartB.gorev)} ${esc(kartB.nasil)}</p>` : ""}
<p class="muted kucuk">Her bölge haritadaki çerçevesinin renginde; çip grupları board çizimlerinde (${esc(cizimler)}) aynı etiketle, board'un üstünde işaretlidir. Aynı açıklamalar uygulamada: 3D görünümde bir etikete tıkla.</p>
${out.join("\n")}`;
}
