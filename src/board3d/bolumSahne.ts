// Bölüm etiketlerinin sahnedeki yerleri: saf hesap (3D'den ve tarayıcıdan bağımsız; testler node'da
// çalıştırır). Metinler cpu16/board/bolum-bilgi.ts'ten; burada yalnız geometri:
//
//   breadboard'da her bölge (aynı işi yapan board'lar, ör. "Register dosyası") bir çerçeve: board
//   hücrelerinin birleşiminin sınırı, içe doğru birkaç mm; L biçimli bölgeler de tek çizgiyle sarılır.
//   Bölgenin en büyük dikdörtgenine ortalanmış bir başlık plakası (yazı sığacak kadar büyük, gerekirse
//   iki satır). Kartın plakası panonun dışında (koridordan uzak kenarda). Her board'un ortasında da
//   modülünün (çip gruplarının) küçük plakaları, alt alta: "R0", "TOPLAYICI", "MİKROKOD KAPI AĞI";
//   bunlar yaklaşınca bölge plakalarının yerine gelir (Bolumler3D.tsx).
//   PCB'de her işlev bloğunun dikdörtgeni bir çerçeve, plakası bloğun ortasında.
//
// Renkler: komşu iki çerçeve aynı renkte olmaz (açgözlü boyama). Kırmızı yok: arayüzde kırmızı yalnız
// hata ve lojik 1. Breadboard renkleri krem board'da ve iki temanın sahne zemininde en az 3:1 (çizgi),
// PCB renkleri koyu yeşil kartta en az 3:1 (cpu16/tests/bolum-3d.test.ts denetler). Breadboard
// bölgeleri, hücre sınırı ve boyama cpu16/board/bolum-cizim.ts'te: kurulum belgelerinin pano haritası
// aynı bölgeyi aynı renkte çizer.
//
// Kenar etiketleri (yakından, çip gruplarına): ekranın iki yanında birer sütun; kutular hedeflerinin
// yüksekliğine göre sıralanır ve üst üste binmeden yerleşir (kenarYerlesimi).

import { ADIM, BY_ADIM, mmX, mmY } from "../../cpu16/board/breadboard/geometri";
import { boardDikdortgeni } from "../../cpu16/board/breadboard/gorunum";
import type { BlockPlace, CardPlace } from "../../cpu16/board/layout";
import { bolumKimligi, type BolumKatalogu } from "../../cpu16/board/bolum-bilgi";
import { BOLUM_RENKLERI, boardGrupEtiketi, boardunGruplari, boya, hucreSiniri, kutularinSiniri, panoBolgeleri, tamDikdortgenler, type Hucre } from "../../cpu16/board/bolum-cizim";

export { boya, hucreSiniri, tamDikdortgenler, type Hucre };
/** Breadboard'daki çerçeve renkleri (krem board üstünde; kurulum belgelerinin pano haritasında da aynı) */
export const BB_RENKLERI = BOLUM_RENKLERI;
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

/** Plakanın yazısını h yüksekliğine indir (satırlar aynı) */
const plakaBoyla = (m: PlakaMetni, h: number, olc: Olcer): PlakaMetni => ({ ...m, h, w: plakaEni(h, Math.max(...m.satirlar.map(olc))), d: plakaBoyu(h, m.satirlar.length) });

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
  /**
   * breadboard'da modülün tabanı: board'larının ve aralarındaki köprülerin birleşimi, dışa doğru
   * TABAN_PAY kadar büyük (board'ların altında, kenarlarından renkli bir pervaz olarak görünür)
   */
  taban?: Kutu[];
}

export interface Plaka extends PlakaMetni {
  id: string;
  /** modul: board'un ortasında, board'daki bir çip grubunun (id: grup:…) plakası */
  tur: "kart" | "bolge" | "blok" | "modul";
  renk: string;
  /** plakanın ortası (mm) */
  x: number;
  y: number;
}

export interface SahneBolumleri {
  cerceveler: Cerceve[];
  plakalar: Plaka[];
  /** breadboard'da board'ların modül plakaları (board başına en çok üç grup, alt alta); PCB'de boş */
  modulPlakalari: Plaka[];
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
  plan: {
    yerlesim: {
      boards: readonly { bx: number; by: number; x0: number; y0: number; rol: string; gruplar?: readonly string[] }[];
      parcalar: readonly { ref: string; board: number; part?: string; cipMi?: boolean; sutun?: number; bacaklar?: readonly { X: number; Y: number }[] }[];
    };
  };
}

export interface YaziBoylari {
  /** bölge (ya da PCB'de blok) plakasının en büyük yazısı (mm) */
  bolge: number;
  /** kart plakasının en büyük yazısı (mm) */
  kart: number;
  /** board'ların modül plakalarının en büyük yazısı (mm; breadboard'da) */
  modul?: number;
}

/** Board başına en çok bu kadar modül plakası (fazla gruplar yakında kenar etiketlerinde) */
export const MODUL_EN_COK = 3;

/** Hata ayıklama göstergeleri (LED'ler ve çubuk göstergeler; dirençleri değil): modül plakaları bunları örtmez */
const gostergeMi = (part?: string) => part === "LED" || part === "DISP_BAR_10";

const kutuBirlesimi = (k: Kutu[]): Kutu => {
  const x0 = Math.min(...k.map((a) => a.x));
  const y0 = Math.min(...k.map((a) => a.y));
  return { x: x0, y: y0, w: Math.max(...k.map((a) => a.x + a.w)) - x0, h: Math.max(...k.map((a) => a.y + a.h)) - y0 };
};

/** Çerçevenin içe kayması (mm): komşu iki bölgenin çizgileri arasında boşluk kalsın */
const BB_IC = 3.2;
/**
 * Breadboard'da modül tabanının board'ların dışına taşması (mm): modüller arasındaki ≈ 20 mm boşlukta iki
 * yanda birer renkli pervaz, ortada taban plakasının koyu rengi kalır
 */
export const TABAN_PAY = 6;
const PCB_IC = 0.9;

/**
 * Breadboard sahnesinin bölümleri: her panonun her bölgesi (board'ların rolü) bir çerçeve ve plaka,
 * her kartın plakası panonun dışında. Katalogda olmayan rol atlanır.
 */
export function bbSahneBolumleri(panolar: readonly BbPanoGirdisi[], k: BolumKatalogu, olc: Olcer, yazi: YaziBoylari): SahneBolumleri {
  const b0 = boardDikdortgeni({ x0: 0, y0: 0 });
  const dy = BY_ADIM * ADIM;
  // board'lar arasındaki boşluk (dikeyde 1,27 mm) iki hücreye bölünür
  const bosluk = dy - b0.h;
  /** board hücresi (mm, sahnede): board'un dikdörtgeni, dikeyde sıralar arası boşluğun yarısı kadar büyük */
  type Hucreli = { bx: number; by: number; x0: number; y0: number };
  const hucreKutusu = (p: BbPanoGirdisi, b: Hucreli): Kutu => {
    const d = boardDikdortgeni(b);
    return { x: p.x + d.x, y: p.y + d.y - bosluk / 2, w: d.w, h: d.h + bosluk };
  };
  const bolgeler: { id: string; kart: string; renk: string; hucreler: Hucre[]; kutu: (i: number, j: number) => Kutu }[] = [];
  const parcaBolgesi = new Map<string, number>();
  for (const p of panolar) {
    const sira = new Map<string, number>();
    const boardAt = new Map(p.plan.yerlesim.boards.map((b) => [`${b.bx},${b.by}`, b]));
    const kutu = (i: number, j: number) => hucreKutusu(p, boardAt.get(`${i},${j}`)!);
    for (const b of panoBolgeleri(p.kart, p.plan.yerlesim.boards, k)) {
      sira.set(b.id, bolgeler.length);
      bolgeler.push({ ...b, kart: p.kart, kutu });
    }
    for (const q of p.plan.yerlesim.parcalar) {
      const b = p.plan.yerlesim.boards[q.board];
      const n = b ? sira.get(bolumKimligi.bolge(p.kart, b.rol)) : undefined;
      if (n !== undefined) parcaBolgesi.set(q.ref, n);
    }
  }
  const cerceveler: Cerceve[] = [];
  const plakalar: Plaka[] = [];
  bolgeler.forEach((b) => {
    const renk = b.renk;
    // board hücreleri ve aynı bölgedeki komşu board'ların arasındaki köprüler (modüller arası boşluk
    // bölgenin içinden geçiyorsa): bölge tek bir çizgiyle sarılır, dolgusu boşluğu da kaplar
    const hucreler = b.hucreler.map((h) => b.kutu(h.i, h.j));
    const var_ = new Set(b.hucreler.map((h) => `${h.i},${h.j}`));
    const kopruler: Kutu[] = [];
    for (const h of b.hucreler) {
      const a = b.kutu(h.i, h.j);
      if (var_.has(`${h.i + 1},${h.j}`)) {
        const c = b.kutu(h.i + 1, h.j);
        const y0 = Math.max(a.y, c.y), y1 = Math.min(a.y + a.h, c.y + c.h);
        if (c.x > a.x + a.w + 1e-6 && y1 > y0) kopruler.push({ x: a.x + a.w, y: y0, w: c.x - a.x - a.w, h: y1 - y0 });
      }
      if (var_.has(`${h.i},${h.j + 1}`)) {
        const c = b.kutu(h.i, h.j + 1);
        const x0 = Math.max(a.x, c.x), x1 = Math.min(a.x + a.w, c.x + c.w);
        if (c.y > a.y + a.h + 1e-6 && x1 > x0) kopruler.push({ x: x0, y: a.y + a.h, w: x1 - x0, h: c.y - a.y - a.h });
      }
    }
    // çerçeve çizgisi modül tabanının dış kenarında (boşlukta, board'ların deliklerinin üstünde değil);
    // seçilince dolgu board'ların üstünde, içe kaymış
    const { alanlar } = kutularinSiniri([...hucreler, ...kopruler], BB_IC);
    const { kenarlar, alanlar: taban } = kutularinSiniri([...hucreler, ...kopruler], -TABAN_PAY);
    const kutu = kutuBirlesimi(taban);
    cerceveler.push({ id: b.id, kart: b.kart, renk, kenarlar, kutu, alanlar, taban });
    // plaka, yazısının en büyük olduğu dikdörtgende (eşitlikte alanı büyük olanda)
    const etiket = k.bolumler.get(b.id)!.etiket;
    let en: { m: PlakaMetni; x: number; y: number; alan: number } | null = null;
    for (const r of tamDikdortgenler(b.hucreler)) {
      // dikdörtgenin iç kutusu: sol sütunun en sağdaki sol kenarından sağ sütunun en soldaki sağ kenarına
      const sol = Math.max(...Array.from({ length: r.j1 - r.j0 + 1 }, (_, n) => b.kutu(r.i0, r.j0 + n).x));
      const sag = Math.min(...Array.from({ length: r.j1 - r.j0 + 1 }, (_, n) => { const q = b.kutu(r.i1, r.j0 + n); return q.x + q.w; }));
      const ust = b.kutu(r.i0, r.j0).y;
      const alt = b.kutu(r.i0, r.j1).y + b.kutu(r.i0, r.j1).h;
      const iw = sag - sol;
      const ih = alt - ust;
      const m = plakaSigdir(etiket, iw - 8 * BB_IC, ih - 4 * BB_IC, olc, yazi.bolge);
      if (!en || m.h > en.m.h + 1e-6 || (Math.abs(m.h - en.m.h) <= 1e-6 && iw * ih > en.alan)) {
        en = { m, x: sol + iw / 2, y: ust + ih / 2, alan: iw * ih };
      }
    }
    plakalar.push({ ...en!.m, id: b.id, tur: "bolge", renk, x: en!.x, y: en!.y });
  });
  // board'ların modül plakaları: board'un ortasında alt alta, aynı board'dakiler aynı yazı boyunda
  const modulPlakalari: Plaka[] = [];
  if (yazi.modul) {
    for (const p of panolar) {
      const renkler = new Map(bolgeler.filter((b) => b.kart === p.kart).map((b) => [b.id, b.renk]));
      p.plan.yerlesim.boards.forEach((b, no) => {
        const ids = boardunGruplari(p.kart, no, p.plan.yerlesim, k).slice(0, MODUL_EN_COK);
        if (!ids.length) return;
        const renk = renkler.get(bolumKimligi.bolge(p.kart, b.rol)) ?? BOLUM_RENKLERI[0];
        const d = boardDikdortgeni(b);
        const tam: Kutu = { x: p.x + d.x, y: p.y + d.y, w: b0.w, h: b0.h };
        const ara = 0.3;
        const etiketler = ids.map((id) => boardGrupEtiketi(no, p.plan.yerlesim, k, id));
        /** plakalar bir dikdörtgende alt alta (göstergelerin yanındaki alçak şeritte yazı büyük kalıyorsa yan yana), aynı yazı boyunda */
        const diz = (a: Kutu, yanaIzin = false) => {
          const n = ids.length;
          const alt = etiketler.map((e) => plakaSigdir(e, a.w * 0.86, (a.h * 0.8) / n - ara * yazi.modul!, olc, yazi.modul!));
          const yan = yanaIzin && n > 1 ? etiketler.map((e) => plakaSigdir(e, (a.w * 0.86) / n - ara * yazi.modul!, a.h * 0.8, olc, yazi.modul!)) : alt;
          const hAlt = Math.min(...alt.map((q) => q.h));
          const hYan = Math.min(...yan.map((q) => q.h));
          const yanYana = hYan > hAlt + 1e-6;
          const h = yanYana ? hYan : hAlt;
          const esit = (yanYana ? yan : alt).map((q) => plakaBoyla(q, h, olc));
          const yer: { x: number; y: number }[] = [];
          if (yanYana) {
            esit.forEach((_, i) => yer.push({ x: a.x + ((i + 0.5) * a.w) / n, y: a.y + a.h / 2 }));
          } else {
            const toplam = esit.reduce((t, q) => t + q.d, 0) + ara * h * (n - 1);
            let yy = a.y + a.h / 2 - toplam / 2;
            for (const q of esit) {
              yer.push({ x: a.x + a.w / 2, y: yy + q.d / 2 });
              yy += q.d + ara * h;
            }
          }
          return { a, h, esit, yer };
        };
        // modüler panoda göstergeli board'da plakalar göstergelerin solunda, sağında, üstünde ya da altında:
        // yazının en büyük olduğu şeritte (LED'ler ve çubuklar örtülmesin)
        let sec = diz(tam);
        const gosterge = b.gruplar ? p.plan.yerlesim.parcalar.filter((q) => q.board === no && gostergeMi(q.part) && q.bacaklar?.length) : [];
        if (gosterge.length) {
          const X = gosterge.flatMap((q) => q.bacaklar!.map((t) => t.X));
          const Y = gosterge.flatMap((q) => q.bacaklar!.map((t) => t.Y));
          const gx0 = p.x + mmX(Math.min(...X) - 1);
          const gx1 = p.x + mmX(Math.max(...X) + 1);
          const gy0 = p.y + mmY(Math.min(...Y) - 1);
          const gy1 = p.y + mmY(Math.max(...Y) + 1);
          const seritler: Kutu[] = [
            { x: tam.x, y: tam.y, w: gx0 - tam.x, h: tam.h },
            { x: gx1, y: tam.y, w: tam.x + tam.w - gx1, h: tam.h },
            { x: tam.x, y: tam.y, w: tam.w, h: gy0 - tam.y },
            { x: tam.x, y: gy1, w: tam.w, h: tam.y + tam.h - gy1 },
          ].filter((a) => a.w > 0 && a.h > 0);
          const adaylar = seritler.map((a) => diz(a, true));
          sec = adaylar.reduce((e, c) => (c.h > e.h + 1e-6 || (Math.abs(c.h - e.h) <= 1e-6 && c.a.w * c.a.h > e.a.w * e.a.h) ? c : e));
        }
        sec.esit.forEach((q, i) => modulPlakalari.push({ ...q, id: ids[i], tur: "modul", renk, ...sec.yer[i] }));
      });
    }
  }
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
  return { cerceveler, plakalar, modulPlakalari, parcaCercevesi: parcaBolgesi, kartKutusu, koyuZemin: false };
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
  return { cerceveler, plakalar, modulPlakalari: [], parcaCercevesi, kartKutusu, koyuZemin: true };
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
