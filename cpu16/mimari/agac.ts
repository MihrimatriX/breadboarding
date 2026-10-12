// Sahneden SVG öğe ağacı. Uygulama (React) ve belge çıktısı (düz SVG metni) aynı ağacı çizer.
// Görünüş sınıflarla verilir (mm-k-register, mm-y-veri, mm-t-ad …): uygulamada src/mimari/mimari.css
// temanın belirteçleriyle boyar, çıktıda svgMetni() açık temanın değerlerini <style> olarak gömer.
//
// Katmanlar: kâğıt ve başlık, kart çerçeveleri, yol çizgileri (hale + çizgi + dallanma noktaları),
// kutular, yolların okları / etiketleri / bağlayıcıları, lejant. Çizgilerin altındaki hale kâğıt
// renginde: sonradan çizilen yol öncekini kestiği yerde aralık bırakır (kesişen yollar karışmaz).

import { BASLIK_H, type SMetin, type Sahne } from "./cizim.ts";
import { KUTU_ROLLERI, YOL_TURLERI } from "./model.ts";

export interface Oge {
  t: string;
  a?: Record<string, string | number | undefined>;
  c?: Oge[];
  /** yazı içeriği */
  m?: string;
  /** içerik kaçırılmadan yazılır (<style>) */
  ham?: boolean;
}

const metin = (x: SMetin): Oge => ({
  t: "text",
  a: {
    class: `mm-t mm-t-${x.s}`,
    x: x.dikey ? undefined : x.x,
    y: x.dikey ? undefined : x.y,
    transform: x.dikey ? `translate(${x.x} ${x.y}) rotate(-90)` : undefined,
    "text-anchor": x.hiza ?? "start",
  },
  m: x.m,
});

/** Sahnenin öğe ağacı (kök: <svg>) */
export function agac(s: Sahne, o: { baslikGoster?: boolean } = {}): Oge {
  const c: Oge[] = [];
  // ---- kâğıt ve başlık
  c.push({ t: "rect", a: { class: "mm-kagit", x: 0.5, y: 0.5, width: s.w - 1, height: s.h - 1, rx: 10 } });
  c.push({ t: "path", a: { class: "mm-baslik-bg", d: `M0.5 ${BASLIK_H} V10.5 A10 10 0 0 1 10.5 0.5 H${s.w - 10.5} A10 10 0 0 1 ${s.w - 0.5} 10.5 V${BASLIK_H} Z` } });
  c.push({ t: "g", a: { class: "mm-baslik" }, c: s.baslik.map(metin) });

  // ---- kart çerçeveleri
  for (const g of s.gruplar) {
    c.push({
      t: "g",
      a: { class: `mm-grup${g.ayrinti ? " mm-ayrintili" : ""}`, "data-kutu": g.id, "data-ayrinti": g.ayrinti },
      c: [
        { t: "rect", a: { class: "mm-grup-govde", x: g.x, y: g.y, width: g.w, height: g.h, rx: 12 } },
        ...(g.sade ? [] : [{ t: "path", a: { class: "mm-grup-cizgi", d: `M${g.x + 1} ${g.y + 34} H${g.x + g.w - 1}` } }]),
        ...g.metinler.map(metin),
      ],
    });
  }

  // ---- yol çizgileri: önce gövdeler, sonra kollar (kollar gövdelerin üstünden geçer); her yolda önce
  // bütün haleler, sonra çizgiler (bir yol kendini kesmez)
  for (const govde of [true, false]) {
    for (const y of s.yollar) {
      const cizgiler = y.cizgiler.filter((z) => !!z.govde === govde);
      if (!cizgiler.length && (govde || !y.noktalar.length)) continue;
      const hale = cizgiler.map((z) => ({ t: "path", a: { class: "mm-hale", d: z.hale ?? z.d, "stroke-width": y.w + 6 } }));
      const cizgi = cizgiler.map((z) => ({ t: "path", a: { class: "mm-cizgi", d: z.d, "stroke-width": y.w, "data-kutular": z.kutu } }));
      const nokta = govde ? [] : y.noktalar.map((n) => ({ t: "circle", a: { class: "mm-nokta", cx: n.x, cy: n.y, r: n.r } }));
      c.push({ t: "g", a: { class: `mm-yol mm-y-${y.tur}`, "data-yol": y.id }, c: [...hale, ...cizgi, ...nokta] });
    }
  }

  // ---- kutular
  for (const k of s.kutular) {
    const govde: Oge = { t: "rect", a: { class: "mm-kutu-govde", x: k.x, y: k.y, width: k.w, height: k.h, rx: 8 } };
    const bolmeler: Oge[] = k.bolmeler.map((b, i) => {
      // bölmeler arası ayraç: bölmenin kutunun içinde kalan kenarları (kesik çizgi)
      const d: string[] = [];
      if (b.x > k.x + 0.5) d.push(`M${b.x} ${b.y + 6} V${b.y + b.h - 6}`);
      if (b.y > k.y + 0.5) d.push(`M${b.x + 6} ${b.y} H${b.x + b.w - 6}`);
      return { t: "path", a: { class: "mm-bolme", d: d.join(" ") || undefined, "data-bolme": i } };
    });
    c.push({
      t: "g",
      a: {
        class: `mm-kutu mm-k-${k.rol}${k.cihaz ? " mm-cihaz" : ""}${k.ayrinti ? " mm-ayrintili" : ""}`,
        "data-kutu": k.id,
        "data-ayrinti": k.ayrinti,
      },
      c: [govde, ...bolmeler.filter((b) => b.a?.d), ...k.metinler.map(metin)],
    });
  }

  // ---- yolların okları, etiketleri, bağlayıcıları
  for (const y of s.yollar) {
    const ok = y.oklar.map((o) => ({ t: "path", a: { class: "mm-ok", d: o.d, "data-kutular": o.kutu } }));
    const bag = y.baglayicilar.flatMap((b) => [
      { t: "rect", a: { class: "mm-bag", x: b.x, y: b.y, width: b.w, height: b.h, rx: 11 } },
      metin(b.metin),
    ]);
    const et = y.etiketler.map(metin);
    c.push({ t: "g", a: { class: `mm-yol-ust mm-y-${y.tur}`, "data-yol": y.id }, c: [...ok, ...bag, ...et] });
  }

  // ---- lejant
  const L = s.lejant;
  c.push({
    t: "g",
    a: { class: "mm-lejant" },
    c: [
      { t: "rect", a: { class: "mm-lejant-govde", x: L.x, y: L.y, width: L.w, height: L.h, rx: 8 } },
      ...L.cizgiler.map((z) => ({ t: "path", a: { class: `mm-lej-cizgi mm-y-${z.tur}`, d: z.d, "stroke-width": z.w } })),
      ...L.kutucuklar.map((k) => ({ t: "rect", a: { class: `mm-lej-kutu mm-k-${k.rol}`, x: k.x, y: k.y, width: k.w, height: k.h, rx: 3 } })),
      ...L.metinler.map(metin),
    ],
  });

  return {
    t: "svg",
    a: {
      xmlns: "http://www.w3.org/2000/svg",
      class: "mm-svg",
      viewBox: `0 0 ${s.w} ${s.h}`,
      width: o.baslikGoster === false ? undefined : s.w,
      height: o.baslikGoster === false ? undefined : s.h,
    },
    c,
  };
}

// ---------------------------------------------------------------- düz SVG metni

const kac = (s: string | number) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function yaz(o: Oge, girinti: string, out: string[]): void {
  const oz = Object.entries(o.a ?? {})
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => ` ${k}="${kac(v!)}"`)
    .join("");
  if (o.m !== undefined) out.push(`${girinti}<${o.t}${oz}>${o.ham ? o.m : kac(o.m)}</${o.t}>`);
  else if (!o.c?.length) out.push(`${girinti}<${o.t}${oz}/>`);
  else {
    out.push(`${girinti}<${o.t}${oz}>`);
    for (const ch of o.c) yaz(ch, `${girinti}  `, out);
    out.push(`${girinti}</${o.t}>`);
  }
}

/**
 * Mimari diyagramının görünüş renkleri ve yazı tipleri. Uygulamada değerler CSS belirteçleridir
 * (var(--mm-kagit) …, temaya göre değişir); belge çıktısında açık temanın düz renkleri (palet.ts).
 */
export interface Palet {
  kagit: string;
  cerceve: string;
  baslikBg: string;
  baslikYazi: string;
  grupBg: string;
  grupCizgi: string;
  yazi: string;
  ikincil: string;
  soluk: string;
  baglanti: string;
  /** yazı tipleri (CSS font-family) */
  sans: string;
  mono: string;
  yol: Record<string, string>;
  kutu: Record<string, { cizgi: string; dolgu: string }>;
}

/** SVG'nin <style>'ı: sınıflar → palet (uygulamadaki mimari.css'in düz karşılığı) */
export function svgStili(p: Palet): string {
  const yollar = Object.entries(p.yol)
    .map(([t, r]) => `.mm-y-${t} .mm-cizgi, .mm-lej-cizgi.mm-y-${t} { stroke: ${r}; } .mm-y-${t} .mm-ok, .mm-y-${t} .mm-nokta { fill: ${r}; } .mm-y-${t} .mm-t-etiket, .mm-y-${t} .mm-t-bag { fill: ${r}; } .mm-y-${t} .mm-bag { stroke: ${r}; }`)
    .join("\n");
  const kutular = Object.entries(p.kutu)
    .map(([r, k]) => `.mm-k-${r} .mm-kutu-govde, .mm-lej-kutu.mm-k-${r} { stroke: ${k.cizgi}; fill: ${k.dolgu}; } .mm-k-${r} .mm-bolme { stroke: ${k.cizgi}; }`)
    .join("\n");
  return `
.mm-t { font-family: ${p.sans}; fill: ${p.yazi}; }
.mm-kagit { fill: ${p.kagit}; stroke: ${p.cerceve}; stroke-width: 1; }
.mm-baslik-bg { fill: ${p.baslikBg}; }
.mm-t-baslik { font-size: 26px; font-weight: 700; fill: ${p.baslikYazi}; letter-spacing: 0.02em; }
.mm-t-alt-baslik { font-size: 15px; fill: ${p.baslikYazi}; }
.mm-grup-govde { fill: ${p.grupBg}; stroke: ${p.grupCizgi}; stroke-width: 1.5; }
.mm-grup-cizgi { stroke: ${p.grupCizgi}; stroke-width: 1; }
.mm-t-grup-ad { font-size: 15px; font-weight: 700; }
.mm-t-grup-ek { font-size: 13px; fill: ${p.ikincil}; }
.mm-t-grup-link { font-size: 13px; font-weight: 600; fill: ${p.baglanti}; }
.mm-kutu-govde { stroke-width: 2; }
.mm-cihaz .mm-kutu-govde, .mm-k-not .mm-kutu-govde { stroke-dasharray: 6 4; }
.mm-bolme { fill: none; stroke-width: 1; stroke-dasharray: 4 3; }
.mm-t-ad { font-size: 15px; font-weight: 700; }
.mm-t-bolme-ad { font-size: 13.5px; font-weight: 700; }
.mm-t-parca { font-family: ${p.mono}; font-size: 12.5px; fill: ${p.ikincil}; }
.mm-t-pasif { font-size: 12.5px; fill: ${p.ikincil}; }
.mm-t-kapi { font-size: 12px; fill: ${p.soluk}; font-style: italic; }
.mm-t-gorev { font-size: 12.5px; fill: ${p.ikincil}; }
.mm-hale { fill: none; stroke: ${p.kagit}; stroke-linejoin: round; }
.mm-cizgi { fill: none; stroke-linejoin: round; stroke-linecap: butt; }
.mm-nokta { stroke: ${p.kagit}; stroke-width: 1.5; }
.mm-bag { fill: ${p.kagit}; stroke-width: 1.5; }
.mm-t-etiket { font-size: 12.5px; font-weight: 700; letter-spacing: 0.02em; paint-order: stroke; stroke: ${p.kagit}; stroke-width: 4px; stroke-linejoin: round; }
.mm-t-bag { font-size: 12px; font-weight: 700; }
.mm-lejant-govde { fill: ${p.kagit}; stroke: ${p.grupCizgi}; stroke-width: 1.2; }
.mm-lej-cizgi { fill: none; }
.mm-lej-kutu { stroke-width: 1.5; }
.mm-t-lej-baslik { font-size: 13px; font-weight: 700; fill: ${p.ikincil}; letter-spacing: 0.04em; }
.mm-t-lej { font-size: 12.5px; fill: ${p.ikincil}; }
.mm-t-lej-kisa { font-size: 12.5px; font-weight: 700; }
${yollar}
${kutular}
`;
}

/** Düz SVG metni (belgeler ve dışa aktarma): stil gömülü, tek başına açılır */
export function svgMetni(s: Sahne, p: Palet, o: { baslik?: string; aciklama?: string } = {}): string {
  const kok = agac(s);
  kok.c = [
    ...(o.baslik ? [{ t: "title", m: o.baslik }] : []),
    ...(o.aciklama ? [{ t: "desc", m: o.aciklama }] : []),
    { t: "style", m: svgStili(p), ham: true },
    ...(kok.c ?? []),
  ];
  const out: string[] = [];
  yaz(kok, "", out);
  return out.join("\n") + "\n";
}

/** Uygulamanın paleti: temanın belirteçleri (src/mimari/mimari.css, src/styles.css) */
export const CSS_PALETI: Palet = {
  kagit: "var(--mm-kagit)",
  cerceve: "var(--mm-cerceve)",
  baslikBg: "var(--mm-baslik-bg)",
  baslikYazi: "var(--mm-baslik-yazi)",
  grupBg: "var(--mm-grup-bg)",
  grupCizgi: "var(--mm-grup-cizgi)",
  yazi: "var(--text)",
  ikincil: "var(--text-muted)",
  soluk: "var(--text-faint)",
  baglanti: "var(--link)",
  sans: "var(--sans)",
  mono: "var(--mono)",
  yol: Object.fromEntries(YOL_TURLERI.map((t) => [t, `var(--mm-y-${t})`])),
  kutu: Object.fromEntries(KUTU_ROLLERI.map((r) => [r, { cizgi: `var(--mm-k-${r})`, dolgu: `var(--mm-k-${r}-soft)` }])),
};
