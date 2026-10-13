// Pasif elemanların değerleri ve okunuşları: direnç renk bantları, seramik kondansatör kodu ("104"),
// direnç dizisi kodu ("A103J"), LED akımı. Saf fonksiyonlar: 3D görünüm (bant renkleri, gövde
// yazıları), bilgi paneli ve rehberin çizimleri (kit/gorseller) aynı tabloları kullanır. Sayı ve birim
// metinleri dili son parametre olarak alır (varsayılan Türkçe: rehber ve belgeler).

import type { Dil } from "./bolum-bilgi.ts";
import { PASSIVES } from "./passives.ts";

// ---------------------------------------------------------------- sayı biçimi (Türkçe ondalık virgül, İngilizce nokta)

/** En çok `basamak` ondalıkla, sondaki sıfırlar atılmış sayı: Türkçede virgüllü, İngilizcede noktalı */
export function sayi(x: number, basamak = 2, dil: Dil = "tr"): string {
  const r = String(Number(x.toFixed(basamak)));
  return dil === "en" ? r : r.replace(".", ",");
}

/** 330 → "330 Ω", 1300 → "1,3 kΩ", 10 000 → "10 kΩ" */
export function ohmMetni(ohm: number, dil: Dil = "tr"): string {
  if (ohm >= 1e6) return `${sayi(ohm / 1e6, 2, dil)} MΩ`;
  if (ohm >= 1e3) return `${sayi(ohm / 1e3, 2, dil)} kΩ`;
  return `${sayi(ohm, 2, dil)} Ω`;
}

/** 1e-7 → "100 nF", 1e-4 → "100 µF", 2.2e-11 → "22 pF" */
export function faradMetni(f: number, dil: Dil = "tr"): string {
  if (f >= 1e-6 - 1e-12) return `${sayi(f * 1e6, 2, dil)} µF`;
  if (f >= 1e-9 - 1e-15) return `${sayi(f * 1e9, 2, dil)} nF`;
  return `${sayi(f * 1e12, 2, dil)} pF`;
}

export const akimMetni = (a: number, dil: Dil = "tr"): string =>
  Math.abs(a) >= 1e-3 ? `${sayi(a * 1e3, 1, dil)} mA` : Math.abs(a) >= 1e-4 ? `${sayi(a * 1e3, 2, dil)} mA` : `${sayi(a * 1e6, 0, dil)} µA`;
export const gucMetni = (w: number, dil: Dil = "tr"): string => (w >= 1 ? `${sayi(w, 2, dil)} W` : `${sayi(w * 1e3, 1, dil)} mW`);
export const sureMetni = (s: number, dil: Dil = "tr"): string =>
  s >= 1 ? `${sayi(s, 2, dil)} s` : s >= 1e-3 ? `${sayi(s * 1e3, 1, dil)} ms` : `${sayi(s * 1e6, 1, dil)} µs`;
export const frekansMetni = (hz: number, dil: Dil = "tr"): string =>
  hz >= 1e6 ? `${sayi(hz / 1e6, 3, dil)} MHz` : hz >= 1e3 ? `${sayi(hz / 1e3, 2, dil)} kHz` : `${sayi(hz, 1, dil)} Hz`;

// ---------------------------------------------------------------- renk kodu (IEC 60062)

export type BantRenk =
  | "siyah" | "kahverengi" | "kirmizi" | "turuncu" | "sari" | "yesil" | "mavi" | "mor" | "gri" | "beyaz" | "altin" | "gumus";

export interface RenkKodu {
  renk: BantRenk;
  ad: string;
  /** İngilizce adı */
  en: string;
  /** çizimdeki renk */
  hex: string;
  /** üstündeki yazının rengi (renk örneği kutularında) */
  yazi: string;
  rakam?: number;
  /** çarpanın 10'un kuvveti olarak üssü (altın −1, gümüş −2) */
  us?: number;
  /** tolerans (%) */
  tolerans?: number;
}

export const RENK_KODU: RenkKodu[] = [
  { renk: "siyah", ad: "siyah", en: "black", hex: "#1d1d1f", yazi: "#ffffff", rakam: 0, us: 0 },
  { renk: "kahverengi", ad: "kahverengi", en: "brown", hex: "#7a4522", yazi: "#ffffff", rakam: 1, us: 1, tolerans: 1 },
  { renk: "kirmizi", ad: "kırmızı", en: "red", hex: "#d4282c", yazi: "#ffffff", rakam: 2, us: 2, tolerans: 2 },
  { renk: "turuncu", ad: "turuncu", en: "orange", hex: "#f27a12", yazi: "#1d1d1f", rakam: 3, us: 3 },
  { renk: "sari", ad: "sarı", en: "yellow", hex: "#f5d31a", yazi: "#1d1d1f", rakam: 4, us: 4 },
  { renk: "yesil", ad: "yeşil", en: "green", hex: "#2e9a45", yazi: "#ffffff", rakam: 5, us: 5, tolerans: 0.5 },
  { renk: "mavi", ad: "mavi", en: "blue", hex: "#2659cc", yazi: "#ffffff", rakam: 6, us: 6, tolerans: 0.25 },
  { renk: "mor", ad: "mor", en: "violet", hex: "#7d3cba", yazi: "#ffffff", rakam: 7, us: 7, tolerans: 0.1 },
  { renk: "gri", ad: "gri", en: "gray", hex: "#8b8d90", yazi: "#1d1d1f", rakam: 8, us: 8, tolerans: 0.05 },
  { renk: "beyaz", ad: "beyaz", en: "white", hex: "#f3f3f0", yazi: "#1d1d1f", rakam: 9, us: 9 },
  { renk: "altin", ad: "altın", en: "gold", hex: "#c8a03c", yazi: "#1d1d1f", us: -1, tolerans: 5 },
  { renk: "gumus", ad: "gümüş", en: "silver", hex: "#b9bec4", yazi: "#1d1d1f", us: -2, tolerans: 10 },
];

const RENK = new Map(RENK_KODU.map((r) => [r.renk, r]));
export const renkKodu = (r: BantRenk): RenkKodu => RENK.get(r)!;

export interface Bant {
  renk: BantRenk;
  ad: string;
  hex: string;
  gorev: "rakam" | "carpan" | "tolerans";
  /** okunuşu: "3", "× 10", "± %5" */
  anlam: string;
}

const usMetni = (us: number) => {
  const sup = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  const s = String(Math.abs(us)).split("").map((d) => sup[Number(d)]).join("");
  return `10${us < 0 ? "⁻" : ""}${s}`;
};

/** Çarpan bandının okunuşu: × 1, × 10, × 100, × 1 k … × 0,1 */
export const carpanMetni = (us: number): string =>
  us < 0 ? `× ${sayi(10 ** us)}` : us < 3 ? `× ${10 ** us}` : us < 6 ? `× ${10 ** (us - 3)} k` : us < 9 ? `× ${10 ** (us - 6)} M` : `× ${10 ** (us - 9)} G`;

/**
 * Değerden renk bantları. Tolerans %2 ve altıysa 5 bant (3 rakam, metal film), değilse 4 bant
 * (2 rakam, karbon film). Değer bu kadar anlamlı rakamla yazılamıyorsa hata.
 */
export function direncBantlari(ohm: number, tolerans = 5): Bant[] {
  if (!(ohm > 0)) throw new Error(`Geçersiz direnç: ${ohm}`);
  const n = tolerans <= 2 ? 3 : 2;
  const us = Math.floor(Math.log10(ohm) + 1e-9) - (n - 1);
  const anlamli = Math.round(ohm / 10 ** us);
  if (Math.abs(anlamli * 10 ** us - ohm) > ohm * 1e-9 || us < -2 || us > 9) {
    throw new Error(`${ohm} Ω, ${n} anlamlı rakamla renk koduna yazılamaz`);
  }
  const rakamlar = String(anlamli).padStart(n, "0").split("").map(Number);
  const tol = RENK_KODU.find((r) => r.tolerans === tolerans);
  if (!tol) throw new Error(`±%${tolerans} toleransın renk bandı yok`);
  const carpan = RENK_KODU.find((r) => r.us === us)!;
  const bant = (r: RenkKodu, gorev: Bant["gorev"], anlam: string): Bant => ({ renk: r.renk, ad: r.ad, hex: r.hex, gorev, anlam });
  return [
    ...rakamlar.map((d) => bant(RENK_KODU.find((r) => r.rakam === d)!, "rakam", String(d))),
    bant(carpan, "carpan", carpanMetni(us)),
    bant(tol, "tolerans", `± %${sayi(tolerans)}`),
  ];
}

/** Bantlardan değer (renk kodunu okuma): 4 ya da 5 bant, sonuncusu tolerans */
export function bantlariOku(renkler: readonly BantRenk[]): { ohm: number; tolerans: number } {
  if (renkler.length !== 4 && renkler.length !== 5) throw new Error("4 ya da 5 bant olmalı");
  const r = renkler.map(renkKodu);
  const rakam = r.slice(0, -2);
  if (rakam.some((x) => x.rakam === undefined)) throw new Error("Rakam bandı altın ya da gümüş olamaz");
  const deger = Number(rakam.map((x) => x.rakam).join(""));
  const us = r[r.length - 2].us!;
  const tol = r[r.length - 1].tolerans;
  if (tol === undefined) throw new Error(`${r[r.length - 1].ad} tolerans bandı değil`);
  return { ohm: Number((deger * 10 ** us).toPrecision(12)), tolerans: tol };
}

/** Bantların okunuşu: "3 3 × 10¹ = 330 Ω" */
export function bantFormulu(bantlar: readonly Bant[], ohm: number): string {
  const rakam = bantlar.filter((b) => b.gorev === "rakam").map((b) => b.anlam).join("");
  const c = bantlar.find((b) => b.gorev === "carpan")!;
  const us = renkKodu(c.renk).us!;
  return `${rakam} × ${usMetni(us)} = ${ohmMetni(ohm)}`;
}

// ---------------------------------------------------------------- üç haneli kodlar

/**
 * Üç haneli kod: iki anlamlı rakam + sıfır sayısı. Seramik kondansatörde birim pF (104 = 100 nF),
 * direnç dizisinde ve trimpotta Ω (103 = 10 kΩ). 10'dan küçük değerlerde R ondalık işaretidir (4R7).
 */
export function ucHaneliKod(deger: number): string {
  if (deger < 10) return sayi(deger, 1).replace(",", "R").replace(/^(\d)$/, "$1R0");
  const us = Math.floor(Math.log10(deger) + 1e-9) - 1;
  const iki = Math.round(deger / 10 ** us);
  if (Math.abs(iki * 10 ** us - deger) > deger * 1e-9) throw new Error(`${deger}: iki anlamlı rakamla yazılamaz`);
  return `${iki}${us}`;
}

export function ucHaneliKoduOku(kod: string): number {
  const r = /^(\d)R(\d)$/.exec(kod);
  if (r) return Number(`${r[1]}.${r[2]}`);
  const m = /^(\d\d)(\d)$/.exec(kod);
  if (!m) throw new Error(`Kod okunamadı: ${kod}`);
  return Number(m[1]) * 10 ** Number(m[2]);
}

/** Kodun açılımı: "104 = 10 × 10⁴ pF = 100 nF" */
export function kodAcilimi(kod: string, birim: "pF" | "Ω", dil: Dil = "tr"): string {
  const m = /^(\d\d)(\d)$/.exec(kod);
  if (!m) return kod;
  const v = ucHaneliKoduOku(kod);
  const son = birim === "pF" ? faradMetni(v * 1e-12, dil) : ohmMetni(v, dil);
  return `${kod} = ${m[1]} × ${usMetni(Number(m[2]))} ${birim} = ${son}`;
}

// ---------------------------------------------------------------- parçanın değeri

/**
 * Hassas dirençler: VGA renk DAC'ının ağırlıkları (680 Ω / 1,3 kΩ) monitörün 75 Ω girişine göre
 * renk seviyelerini belirler; %1 metal film (mavi gövde, 5 bant) önerilir. Kalanlar %5 karbon film.
 */
export const DIRENC_TOLERANS: Record<string, number> = { R_680: 1, R_1K3: 1 };

/** Önerilen gerilim değerleri: 5 V hattın en az iki katı */
export const KONDANSATOR_VOLT = { seramik: 50, elektrolitik: 16 };

export type PasifDeger =
  | { tur: "direnc"; ohm: number; tolerans: number; film: "karbon" | "metal" }
  | { tur: "dizi"; ohm: number; adet: number; kod: string; tolerans: number }
  | { tur: "seramik"; farad: number; kod: string; volt: number }
  | { tur: "elektrolitik"; farad: number; volt: number }
  | { tur: "pot"; ohm: number; kod: string }
  | { tur: "osilator"; hz: number | null };

const birimCarpani = (k: string | undefined) => (k === "K" ? 1e3 : k === "M" ? 1e6 : 1);

/** Parça adından değer: R_1K3 → 1,3 kΩ, RN_10K_8 → 8 × 10 kΩ, C_100N → 100 nF, OSC_25M175 → 25,175 MHz */
export function pasifDegeri(part: string): PasifDeger | null {
  let m = /^R_(\d+)(?:([KM])(\d*))?$/.exec(part);
  if (m) {
    const ohm = Number(`${m[1]}${m[2] && m[3] ? `.${m[3]}` : ""}`) * birimCarpani(m[2]);
    const tolerans = DIRENC_TOLERANS[part] ?? 5;
    return { tur: "direnc", ohm, tolerans, film: tolerans <= 2 ? "metal" : "karbon" };
  }
  m = /^RN_(\d+)([KM])?_(\d+)$/.exec(part);
  if (m) {
    const ohm = Number(m[1]) * birimCarpani(m[2]);
    return { tur: "dizi", ohm, adet: Number(m[3]), kod: `A${ucHaneliKod(ohm)}J`, tolerans: 5 };
  }
  m = /^C_(\d+)([PNU])$/.exec(part);
  if (m) {
    const farad = Number(m[1]) * { P: 1e-12, N: 1e-9, U: 1e-6 }[m[2] as "P" | "N" | "U"];
    if (/CP_Radial/.test(PASSIVES[part]?.footprint ?? "")) return { tur: "elektrolitik", farad, volt: KONDANSATOR_VOLT.elektrolitik };
    return { tur: "seramik", farad, kod: ucHaneliKod(Math.round(farad * 1e12)), volt: KONDANSATOR_VOLT.seramik };
  }
  m = /^POT_(\d+)([KM])?$/.exec(part);
  if (m) {
    const ohm = Number(m[1]) * birimCarpani(m[2]);
    return { tur: "pot", ohm, kod: ucHaneliKod(ohm) };
  }
  m = /^OSC_(\d+)M(\d*)$/.exec(part);
  if (m) return { tur: "osilator", hz: Number(`${m[1]}.${m[2] || 0}`) * 1e6 };
  if (/^OSC_/.test(part)) return { tur: "osilator", hz: null };
  return null;
}

// ---------------------------------------------------------------- hesaplar

/** Besleme gerilimi (V) */
export const VCC = 5;

/** LED akımı: I = (V − Vf) / R; LED iletime geçmiyorsa 0 */
export function ledAkimi(kaynak: number, vf: number, ohm: number): number {
  return Math.max(0, (kaynak - vf) / ohm);
}

/** İstenen akım için seri direnç: R = (V − Vf) / I */
export const seriDirenc = (kaynak: number, vf: number, akim: number): number => (kaynak - vf) / akim;

/** Dirençte harcanan güç: P = I² · R */
export const direncGucu = (akim: number, ohm: number): number => akim * akim * ohm;

/** RC zaman sabiti: τ = R · C */
export const rcSabiti = (ohm: number, farad: number): number => ohm * farad;
