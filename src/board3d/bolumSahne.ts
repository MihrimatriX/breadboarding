// Bölüm etiketlerinin sahnedeki yerleri: saf hesap (3D'den ve tarayıcıdan bağımsız; testler node'da
// çalıştırır). Metinler cpu16/board/bolum-bilgi.ts'ten; burada yalnız geometri:
//
//   breadboard'da her bölge (aynı işi yapan board'lar, ör. "Register dosyası") bir çerçeve: board
//   hücrelerinin birleşiminin sınırı, içe doğru birkaç mm; L biçimli bölgeler de tek çizgiyle sarılır.
//   Bölgenin en büyük dikdörtgenine ortalanmış bir başlık plakası (yazı sığacak kadar büyük, gerekirse
//   iki satır). Kartın plakası panonun dışında (koridordan uzak kenarda).
//   PCB'de her işlev bloğunun dikdörtgeni bir çerçeve, plakası bloğun ortasında.
//
// Renkler: komşu iki çerçeve aynı renkte olmaz (açgözlü boyama). Kırmızı yok: arayüzde kırmızı yalnız
// hata ve lojik 1. Breadboard renkleri krem board'da ve iki temanın sahne zemininde en az 3:1 (çizgi),
// PCB renkleri koyu yeşil kartta en az 3:1 (cpu16/tests/bolum-3d.test.ts denetler).
//
// Kenar etiketleri (yakından, çip gruplarına): ekranın iki yanında birer sütun; kutular hedeflerinin
// yüksekliğine göre sıralanır ve üst üste binmeden yerleşir (kenarYerlesimi).

import { ADIM, BX_ADIM, BY_ADIM } from "../../cpu16/board/breadboard/geometri";
import { boardDikdortgeni } from "../../cpu16/board/breadboard/gorunum";
import type { BlockPlace, CardPlace } from "../../cpu16/board/layout";
import { bolumKimligi, type BolumKatalogu } from "../../cpu16/board/bolum-bilgi";

/** Breadboard'daki çerçeve renkleri (krem board üstünde) */
export const BB_RENKLERI = ["#2d6bd2", "#0d7f73", "#5a7d12", "#a8640a", "#7a4fd0", "#0b78a3", "#86602a", "#5a6f87"] as const;
/** PCB'deki çerçeve renkleri (koyu yeşil kart üstünde açık tonlar) */
export const PCB_RENKLERI = ["#8fb4ff", "#5fd4c4", "#b5d96a", "#f0b45a", "#c4a6ff", "#6cc8f0", "#e0bf86", "#b8c6d6"] as const;
/** Kart plakasının şeridi (kartın kendi rengi yok) */
export const KART_RENGI = "#c9d2dc";

export interface Kutu {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bir yazının eni, yazı yüksekliği 1 iken (em); tarayıcıda tuvalle ölçülür, testlerde tahmin */
export type Olcer = (s: string) => number;

/** Plakanın ölçüleri yazı yüksekliği cinsinden: renk şeridi, iç boşluklar, satır aralığı */
export const PLAKA = { serit: 0.24, solBosluk: 0.55, sagBosluk: 0.6, satir: 1.2, dikeyBosluk: 0.45 } as const;

export interface PlakaMetni {
  satirlar: string[];
  /** yazı yüksekliği (mm) */
  h: number;
  /** plakanın eni ve boyu (mm) */
  w: number;
  d: number;
}

const plakaEni = (h: number, yaziEni: number) => h * (PLAKA.serit + PLAKA.solBosluk + PLAKA.sagBosluk + yaziEni);
const plakaBoyu = (h: number, n: number) => h * (2 * PLAKA.dikeyBosluk + 1 + (n - 1) * PLAKA.satir);

/**
 * Yazıyı en × boy kutusuna sığdırır: tek satır ya da en dengeli iki satır (boşluktan bölünür), hangisi
 * daha büyük yazı veriyorsa; tek satır biraz küçük kalıyorsa bile tercih edilir. Yazı en çok enYuksek.
 */
export function plakaSigdir(metin: string, en: number, boy: number, olc: Olcer, enYuksek: number): PlakaMetni {
  const tek = { satirlar: [metin], gen: olc(metin) };
  let iki: { satirlar: string[]; gen: number } | null = null;
  for (let i = metin.indexOf(" "); i > 0; i = metin.indexOf(" ", i + 1)) {
    const a = metin.slice(0, i).trimEnd();
    const b = metin.slice(i + 1).trimStart();
    const gen = Math.max(olc(a), olc(b));
    if (!iki || gen < iki.gen) iki = { satirlar: [a, b], gen };
  }
  const yuk = (x: { satirlar: string[]; gen: number }) =>
    Math.min(enYuksek, en / plakaEni(1, x.gen), boy / plakaBoyu(1, x.satirlar.length));
  const h1 = yuk(tek);
  const sec = iki && yuk(iki) * 0.8 > h1 ? iki : tek;
  const h = Math.max(0, yuk(sec));
  return { satirlar: sec.satirlar, h, w: plakaEni(h, sec.gen), d: plakaBoyu(h, sec.satirlar.length) };
}

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

/** Komşuluk listesiyle açgözlü boyama: her öğe komşularının kullanmadığı ilk renk (sırayla dönerek) */
export function boya(n: number, komsu: (a: number, b: number) => boolean, renkSayisi: number): number[] {
  const renk: number[] = [];
  for (let a = 0; a < n; a++) {
    const dolu = new Set<number>();
    for (let b = 0; b < a; b++) if (komsu(a, b)) dolu.add(renk[b]);
    let r = a % renkSayisi;
    for (let k = 0; k < renkSayisi && dolu.has(r); k++) r = (r + 1) % renkSayisi;
    renk.push(r);
  }
  return renk;
}

// ---------------------------------------------------------------- sahnenin bölümleri

export interface Cerceve {
  /** bölümün kimliği (bolge:… ya da blok:…) */
  id: string;
  kart: string;
  renk: string;
  /** sınır çizgileri: [x0, y0, x1, y1, …] (mm, sahnenin yerleşiminde) */
  kenarlar: number[];
  /** sınırın kutusu (kamera çerçevelemesi için) */
  kutu: Kutu;
  /** çerçevenin içi: board hücreleri (PCB'de blok), içe kaymış (seçilince hafif dolgu) */
  alanlar: Kutu[];
}

export interface Plaka extends PlakaMetni {
  id: string;
  tur: "kart" | "bolge" | "blok";
  renk: string;
  /** plakanın ortası (mm) */
  x: number;
  y: number;
}

export interface SahneBolumleri {
  cerceveler: Cerceve[];
  plakalar: Plaka[];
  /** parça → içinde durduğu çerçevenin sırası (kenar etiketinin rengi) */
  parcaCercevesi: Map<string, number>;
  /** kart → kartın kutusu: pano ya da PCB kartı (mm) */
  kartKutusu: Map<string, Kutu>;
  /** çerçeveler koyu zeminde mi (PCB): açık tonlar */
  koyuZemin: boolean;
}

/** Breadboard sahnesinden gereken: panonun yeri, board'ları ve parçaların board'ları */
export interface BbPanoGirdisi {
  kart: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sira?: "arka" | "on";
  plan: { yerlesim: { boards: readonly { bx: number; by: number; rol: string }[]; parcalar: readonly { ref: string; board: number }[] } };
}

export interface YaziBoylari {
  /** bölge (ya da PCB'de blok) plakasının en büyük yazısı (mm) */
  bolge: number;
  /** kart plakasının en büyük yazısı (mm) */
  kart: number;
}

const kutuBirlesimi = (k: Kutu[]): Kutu => {
  const x0 = Math.min(...k.map((a) => a.x));
  const y0 = Math.min(...k.map((a) => a.y));
  return { x: x0, y: y0, w: Math.max(...k.map((a) => a.x + a.w)) - x0, h: Math.max(...k.map((a) => a.y + a.h)) - y0 };
};

/** Çerçevenin içe kayması (mm): komşu iki bölgenin çizgileri arasında boşluk kalsın */
const BB_IC = 3.2;
const PCB_IC = 0.9;

/**
 * Breadboard sahnesinin bölümleri: her panonun her bölgesi (board'ların rolü) bir çerçeve ve plaka,
 * her kartın plakası panonun dışında. Katalogda olmayan rol atlanır.
 */
export function bbSahneBolumleri(panolar: readonly BbPanoGirdisi[], k: BolumKatalogu, olc: Olcer, yazi: YaziBoylari): SahneBolumleri {
  const b0 = boardDikdortgeni(0, 0);
  const dx = BX_ADIM * ADIM;
  const dy = BY_ADIM * ADIM;
  // board'lar arasındaki boşluk (dikeyde 1,27 mm) iki hücreye bölünür
  const bosluk = dy - b0.h;
  const bolgeler: { id: string; kart: string; pano: number; hucreler: Hucre[]; x0: number; y0: number }[] = [];
  const parcaBolgesi = new Map<string, number>();
  panolar.forEach((p, pi) => {
    const sira = new Map<string, number>();
    const boards = [...p.plan.yerlesim.boards].sort((a, b) => a.by - b.by || a.bx - b.bx);
    for (const b of boards) {
      const id = bolumKimligi.bolge(p.kart, b.rol);
      if (!k.bolumler.has(id)) continue;
      let n = sira.get(id);
      if (n === undefined) {
        n = bolgeler.length;
        sira.set(id, n);
        bolgeler.push({ id, kart: p.kart, pano: pi, hucreler: [], x0: p.x + b0.x, y0: p.y + b0.y - bosluk / 2 });
      }
      bolgeler[n].hucreler.push({ i: b.bx, j: b.by });
    }
    for (const q of p.plan.yerlesim.parcalar) {
      const b = p.plan.yerlesim.boards[q.board];
      const n = b ? sira.get(bolumKimligi.bolge(p.kart, b.rol)) : undefined;
      if (n !== undefined) parcaBolgesi.set(q.ref, n);
    }
  });
  const komsu = (a: number, b: number) => {
    const A = bolgeler[a];
    const B = bolgeler[b];
    if (A.pano !== B.pano) return false;
    return A.hucreler.some((h) => B.hucreler.some((g) => Math.abs(h.i - g.i) + Math.abs(h.j - g.j) === 1));
  };
  const renkler = boya(bolgeler.length, komsu, BB_RENKLERI.length);
  const cerceveler: Cerceve[] = [];
  const plakalar: Plaka[] = [];
  bolgeler.forEach((b, n) => {
    const renk = BB_RENKLERI[renkler[n]];
    const kenarlar = hucreSiniri(b.hucreler, b.x0, b.y0, dx, dy, BB_IC);
    const kutu = kutuBirlesimi(b.hucreler.map((h) => ({ x: b.x0 + h.i * dx, y: b.y0 + h.j * dy, w: dx, h: dy })));
    // dolgu: komşusu bölgede olan kenar içe kaymaz (board'lar arasında boşluk kalmasın)
    const var_ = new Set(b.hucreler.map((h) => `${h.i},${h.j}`));
    const ic = (i: number, j: number) => (var_.has(`${i},${j}`) ? 0 : BB_IC);
    const alanlar = b.hucreler.map((h) => {
      const [l, r, u, a] = [ic(h.i - 1, h.j), ic(h.i + 1, h.j), ic(h.i, h.j - 1), ic(h.i, h.j + 1)];
      return { x: b.x0 + h.i * dx + l, y: b.y0 + h.j * dy + u, w: dx - l - r, h: dy - u - a };
    });
    cerceveler.push({ id: b.id, kart: b.kart, renk, kenarlar, kutu, alanlar });
    // plaka, yazısının en büyük olduğu dikdörtgende (eşitlikte alanı büyük olanda)
    const etiket = k.bolumler.get(b.id)!.etiket;
    let en: { m: PlakaMetni; x: number; y: number; alan: number } | null = null;
    for (const r of tamDikdortgenler(b.hucreler)) {
      const iw = (r.i1 - r.i0 + 1) * dx;
      const ih = (r.j1 - r.j0 + 1) * dy;
      const m = plakaSigdir(etiket, iw - 8 * BB_IC, ih - 4 * BB_IC, olc, yazi.bolge);
      if (!en || m.h > en.m.h + 1e-6 || (Math.abs(m.h - en.m.h) <= 1e-6 && iw * ih > en.alan)) {
        en = { m, x: b.x0 + r.i0 * dx + iw / 2, y: b.y0 + r.j0 * dy + ih / 2, alan: iw * ih };
      }
    }
    plakalar.push({ ...en!.m, id: b.id, tur: "bolge", renk, x: en!.x, y: en!.y });
  });
  const kartKutusu = new Map<string, Kutu>();
  for (const p of panolar) {
    kartKutusu.set(p.kart, { x: p.x, y: p.y, w: p.w, h: p.h });
    const kart = k.bolumler.get(bolumKimligi.kart(p.kart));
    if (!kart) continue;
    const m = plakaSigdir(kart.etiket, p.w - 16, yazi.kart * 2, olc, yazi.kart);
    const ara = 8;
    const y = p.sira === "on" ? p.y + p.h + ara + m.d / 2 : p.y - ara - m.d / 2;
    plakalar.push({ ...m, id: kart.id, tur: "kart", renk: KART_RENGI, x: p.x + p.w / 2, y });
  }
  return { cerceveler, plakalar, parcaCercevesi: parcaBolgesi, kartKutusu, koyuZemin: false };
}

/** PCB sahnesinin bölümleri: her işlev bloğu bir çerçeve, plakası bloğun ortasında; kart plakası yok (kartın kendi başlığı var) */
export function pcbSahneBolumleri(
  lay: { blocks: readonly BlockPlace[]; cards: readonly CardPlace[]; chips: readonly { ref: string; card: string; block: string }[]; passives: readonly { ref: string; card: string; block: string }[] },
  k: BolumKatalogu,
  olc: Olcer,
  yazi: Pick<YaziBoylari, "bolge">,
): SahneBolumleri {
  const bloklar = lay.blocks.filter((b) => k.bolumler.has(bolumKimligi.blok(b.card, b.name)));
  const komsu = (a: number, b: number) => {
    const A = bloklar[a];
    const B = bloklar[b];
    const yakin = 8;
    return A.card === B.card && A.x - yakin < B.x + B.w && B.x - yakin < A.x + A.w && A.y - yakin < B.y + B.h && B.y - yakin < A.y + A.h;
  };
  const renkler = boya(bloklar.length, komsu, PCB_RENKLERI.length);
  const cerceveler: Cerceve[] = [];
  const plakalar: Plaka[] = [];
  const sira = new Map<string, number>();
  bloklar.forEach((b, n) => {
    const id = bolumKimligi.blok(b.card, b.name);
    const renk = PCB_RENKLERI[renkler[n]];
    sira.set(`${b.card}\n${b.name}`, n);
    const kenarlar = hucreSiniri([{ i: 0, j: 0 }], b.x, b.y, b.w, b.h, PCB_IC);
    const alan = { x: b.x + PCB_IC, y: b.y + PCB_IC, w: b.w - 2 * PCB_IC, h: b.h - 2 * PCB_IC };
    cerceveler.push({ id, kart: b.card, renk, kenarlar, kutu: { x: b.x, y: b.y, w: b.w, h: b.h }, alanlar: [alan] });
    const m = plakaSigdir(k.bolumler.get(id)!.etiket, b.w - 6, b.h - 4, olc, yazi.bolge);
    plakalar.push({ ...m, id, tur: "blok", renk, x: b.x + b.w / 2, y: b.y + b.h / 2 });
  });
  const parcaCercevesi = new Map<string, number>();
  for (const p of [...lay.chips, ...lay.passives]) {
    const n = sira.get(`${p.card}\n${p.block}`);
    if (n !== undefined) parcaCercevesi.set(p.ref, n);
  }
  const kartKutusu = new Map(lay.cards.map((c) => [c.name, { x: c.x, y: c.y, w: c.w, h: c.h }]));
  return { cerceveler, plakalar, parcaCercevesi, kartKutusu, koyuZemin: true };
}

// ---------------------------------------------------------------- kenar etiketleri

/** Bir sütuna kaç kutu sığar */
export const kapasite = (ust: number, alt: number, h: number, bosluk: number): number => Math.max(0, Math.floor((alt - ust + bosluk) / (h + bosluk)));

/**
 * Kenar sütunundaki kutular: her kutu hedefinin yüksekliğine (y, kutunun ortası) en yakın yerde,
 * sıraları korunarak ve üst üste binmeden [ust, alt] aralığında. Çakışan kutular küme olur ve küme,
 * kutularının istediği yerlerin ortalamasına oturur (en küçük kareler); kümeler sınırlara itilir.
 * Dönen: kimlik → kutunun üst kenarı. Kutu sayısı kapasiteyi aşarsa en alttakiler taşar.
 */
export function kenarYerlesimi(istekler: readonly { id: string; y: number }[], ust: number, alt: number, h: number, bosluk: number): Map<string, number> {
  const sirali = [...istekler].sort((a, b) => a.y - b.y);
  const adim = h + bosluk;
  const sinirla = (t: number, n: number) => Math.max(ust, Math.min(t, alt - n * adim + bosluk));
  type Kume = { bas: number; n: number; toplam: number; tepe: number };
  const kumeler: Kume[] = [];
  sirali.forEach((s, i) => {
    let k: Kume = { bas: i, n: 1, toplam: s.y - h / 2, tepe: 0 };
    k.tepe = sinirla(k.toplam, 1);
    while (kumeler.length) {
      const o = kumeler[kumeler.length - 1];
      if (o.tepe + o.n * adim <= k.tepe + 1e-9) break;
      const toplam = o.toplam + k.toplam - k.n * o.n * adim;
      const n = o.n + k.n;
      k = { bas: o.bas, n, toplam, tepe: sinirla(toplam / n, n) };
      kumeler.pop();
    }
    kumeler.push(k);
  });
  const out = new Map<string, number>();
  for (const k of kumeler) for (let m = 0; m < k.n; m++) out.set(sirali[k.bas + m].id, k.tepe + m * adim);
  return out;
}

/**
 * p0'dan p1'e giden doğrunun bir çokgene ilk girdiği nokta (p0'a en yakın kesişim); çokgen p0'ı
 * içeriyorsa ya da kesişim yoksa p1.
 */
export function girisNoktasi(p0: [number, number], p1: [number, number], cokgen: readonly [number, number][]): [number, number] {
  let enT = 1;
  const rx = p1[0] - p0[0];
  const ry = p1[1] - p0[1];
  for (let a = 0; a < cokgen.length; a++) {
    const [ax, ay] = cokgen[a];
    const [bx, by] = cokgen[(a + 1) % cokgen.length];
    const sx = bx - ax;
    const sy = by - ay;
    const pay = rx * sy - ry * sx;
    if (Math.abs(pay) < 1e-12) continue;
    const t = ((ax - p0[0]) * sy - (ay - p0[1]) * sx) / pay;
    const u = ((ax - p0[0]) * ry - (ay - p0[1]) * rx) / pay;
    if (t >= 0 && t < enT && u >= 0 && u <= 1) enT = t;
  }
  return [p0[0] + rx * enT, p0[1] + ry * enT];
}
