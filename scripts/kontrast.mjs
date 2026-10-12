// Tema renklerinin karşıtlık denetimi (WCAG 2 oranı). src/styles.css içindeki koyu ve açık tema
// belirteçlerini okur, yazı / zemin çiftlerinin oranını yazar ve eşiğin altında kalan varsa 1 ile çıkar.
//
//   node scripts/kontrast.mjs
//
// Eşikler: gövde ve ikincil yazı 4,5:1 (küçük yazı); vurgu, bağlantı, durum ve lojik 1 rengi de yazı
// olarak kullanıldığı için 4,5:1; yalnız çizgi ve dolgu olarak kullanılan sinyal renkleri (dalga formu,
// şema seviyeleri) 3:1 (grafik öğe). Yarı saydam zeminler (ör. --hi-soft) altlarındaki yüzeyle
// karıştırılarak ölçülür.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");

/** Bir seçicinin ilk bloğundaki --ad: değer çiftleri */
function blok(secici) {
  const i = css.indexOf(secici);
  if (i < 0) throw new Error(`styles.css içinde yok: ${secici}`);
  const bas = css.indexOf("{", i);
  const son = css.indexOf("}", bas);
  const degerler = {};
  for (const m of css.slice(bas + 1, son).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) degerler[m[1]] = m[2].trim();
  return degerler;
}

const KOYU = blok(':root[data-tema="koyu"]');
const TEMALAR = { koyu: KOYU, acik: { ...KOYU, ...blok(':root[data-tema="acik"]') } };

/** "#rrggbb", "#rgb" ya da "rgba(r, g, b, a)" → [r, g, b, a] (0..255, a 0..1) */
function renk(deger) {
  const d = deger.trim();
  let m = /^#([0-9a-f]{6})$/i.exec(d);
  if (m) return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)).concat(1);
  m = /^#([0-9a-f]{3})$/i.exec(d);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)).concat(1);
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(d);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  throw new Error(`renk çözülemedi: ${deger}`);
}

/** Belirteç adı (var() zinciri çözülerek) ya da doğrudan renk */
function coz(t, ad, derinlik = 0) {
  if (derinlik > 8) throw new Error(`döngü: ${ad}`);
  const v = ad.startsWith("--") ? t[ad.slice(2)] : ad;
  if (v === undefined) throw new Error(`belirteç yok: ${ad}`);
  const m = /^var\((--[\w-]+)\)$/.exec(v.trim());
  return m ? coz(t, m[1], derinlik + 1) : renk(v);
}

/** "üst/alt": yarı saydam üst renk alt yüzeyin üstüne karıştırılır */
function zemin(t, tanim) {
  const katmanlar = tanim.split("/").map((s) => coz(t, s.trim()));
  let [r, g, b] = katmanlar.at(-1);
  for (let k = katmanlar.length - 2; k >= 0; k--) {
    const [r2, g2, b2, a] = katmanlar[k];
    [r, g, b] = [r2 * a + r * (1 - a), g2 * a + g * (1 - a), b2 * a + b * (1 - a)];
  }
  return [r, g, b];
}

const parlaklik = ([r, g, b]) => {
  const [R, G, B] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};
const oran = (a, b) => {
  const [x, y] = [parlaklik(a), parlaklik(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const YUZEYLER = ["--surface-0", "--surface-1", "--surface-2", "--surface-inset"];
const YAZI = 4.5;
const GRAFIK = 3;

/** [yazı, zeminler, eşik, açıklama] */
const CIFTLER = [
  ["--text", [...YUZEYLER, "--surface-3"], YAZI, "gövde yazısı"],
  ["--text-muted", [...YUZEYLER, "--surface-3"], YAZI, "ikincil yazı"],
  ["--text-faint", YUZEYLER, YAZI, "açıklama, etiket"],
  ["--text-muted", ["--accent-soft/--surface-1"], YAZI, "seçili satırda ikincil yazı"],
  ["--accent", ["--surface-1", "--surface-2", "--accent-soft/--surface-1"], YAZI, "vurgu yazısı (seçili sekme, bağlantı)"],
  ["--link", ["--surface-1", "--surface-2", "--surface-inset"], YAZI, "bağlantı"],
  ["--on-accent", ["--accent-bg", "--accent-bg-hover"], YAZI, "birincil düğme yazısı"],
  ["--hi", ["--surface-1", "--surface-inset", "--hi-soft/--surface-1"], YAZI, "lojik 1 (pin, bit, değer)"],
  ["--ok", ["--surface-1", "--ok-soft/--surface-1"], YAZI, "durum: çalışıyor / aynı"],
  ["--warn", ["--surface-1", "--warn-soft/--surface-1"], YAZI, "uyarı"],
  ["--danger", ["--surface-1", "--danger-soft/--surface-1"], YAZI, "hata"],
  ["--net", ["--surface-1", "--surface-inset"], YAZI, "net adı"],
  ["--z", ["--surface-1", "--surface-inset"], YAZI, "Z (yüksek empedans)"],
  ["--lo", ["--surface-1", "--surface-inset"], GRAFIK, "lojik 0 (çizgi)"],
  ["--x", ["--surface-inset", "--sema-bg"], GRAFIK, "X (belirsiz, çizgi)"],
  ["--wave", ["--surface-inset"], GRAFIK, "dalga formu çizgisi"],
  ["--lv0", ["--sema-bg"], GRAFIK, "şema: 0 seviyesi"],
  ["--lv3", ["--sema-bg"], GRAFIK, "şema: X seviyesi"],
  ["--sema-cizgi", ["--sema-bg", "--sema-govde"], GRAFIK, "şema çizgisi"],
  ["--sema-yazi", ["--sema-bg", "--sema-govde"], YAZI, "şema yazısı"],
];

let hata = 0;
for (const [ad, t] of Object.entries(TEMALAR)) {
  console.log(`\n${ad === "koyu" ? "Koyu" : "Açık"} tema`);
  for (const [yazi, zeminler, esik, aciklama] of CIFTLER) {
    const on = coz(t, yazi);
    const olcumler = zeminler.map((z) => {
      const r = oran(on, zemin(t, z));
      if (r < esik) hata++;
      return `${z.replaceAll("--", "")} ${r.toFixed(2)}${r < esik ? " ✗" : ""}`;
    });
    console.log(`  ${yazi.padEnd(15)} ≥${esik}  ${olcumler.join(" · ")}   (${aciklama})`);
  }
}
console.log(hata ? `\n${hata} çift eşiğin altında` : "\nBütün çiftler eşiğin üstünde");
process.exit(hata ? 1 : 0);
