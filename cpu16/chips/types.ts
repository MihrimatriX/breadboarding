// Parça kütüphanesinin ortak tipleri: pin tanımı, çip tanımı ve veri sayfası referans modeli.

import type { Circuit } from "./logic.ts";

/** in: giriş · out: itme-çekme çıkış · tri: üç durumlu çıkış · bidir: çift yönlü · power: besleme · nc: bağlı değil · passive: pasif eleman ucu */
export type PinDir = "in" | "out" | "tri" | "bidir" | "power" | "nc" | "passive";

export interface PinDef {
  num: number;
  /** "~" ile başlayan adlar aktif düşüktür (KiCad'de üst çizgi) */
  name: string;
  dir: PinDir;
}

/** pin adı → net numarası */
export type PinNets = Record<string, number>;

/** Referans modelin gördüğü giriş değerleri (sürülen pinler) */
export type RefIn = Record<string, 0 | 1>;
/** Referans modelin beklediği çıkışlar: null = veri sayfasına göre tanımsız (ör. güç verildikten sonra) */
export type RefOut = Record<string, 0 | 1 | "Z" | null>;

/**
 * Veri sayfasındaki fonksiyon tablosunun koddaki hali. Kapı modelinden bağımsız yazılır;
 * testler kapı modelini bununla karşılaştırır. `prev` kenar algılamak içindir.
 */
export interface RefModel<S = any> {
  /** Durumsuz (birleşimsel) mi */
  combinational?: boolean;
  init(): S;
  eval(s: S, prev: RefIn, cur: RefIn): { s: S; out: RefOut };
}

export interface ChipDef {
  /** Parça numarası, ör. "74HC283" */
  part: string;
  /** Kısa Türkçe açıklama */
  title: string;
  /** Kılıf, ör. "DIP-16" */
  pkg: string;
  /** KiCad footprint adı */
  footprint: string;
  pins: PinDef[];
  /** Çipin içini devreye kurar. Bellek çiplerinde ana belleğe erişim için bir tutamaç döndürebilir. */
  build(c: Circuit, p: PinNets): unknown;
  /** Veri sayfası fonksiyon tablosu (davranışsal bellek çiplerinde yok; onlar senaryo testleriyle sınanır) */
  ref?: RefModel;
  /** Kapı seviyesi değil, davranışsal model (bellekler) */
  behavioral?: boolean;
  /** CPU16'da nerede kullanıldığı */
  usage: string;
}

/**
 * Pin listesi kısaltması: pin 1'den başlayarak boşlukla ayrılmış adlar.
 * VCC/VDD/GND/VSS otomatik besleme, NC* bağlantısız; kalanlar `dirs` ile belirtilmezse giriştir.
 */
export function pinsOf(spec: string, dirs: { out?: string; tri?: string; bidir?: string } = {}): PinDef[] {
  const set = (s?: string) => new Set((s ?? "").split(/\s+/).filter(Boolean));
  const out = set(dirs.out);
  const tri = set(dirs.tri);
  const bidir = set(dirs.bidir);
  const names = spec.split(/\s+/).filter(Boolean);
  return names.map((name, i) => {
    let dir: PinDir = "in";
    if (/^(VCC|VDD|GND|VSS)$/.test(name)) dir = "power";
    else if (/^NC/.test(name)) dir = "nc";
    else if (out.has(name)) dir = "out";
    else if (tri.has(name)) dir = "tri";
    else if (bidir.has(name)) dir = "bidir";
    return { num: i + 1, name, dir };
  });
}

/** DIP footprint adı (KiCad standart kütüphanesi) */
export function dipFootprint(pins: number, wide = false): string {
  return `Package_DIP:DIP-${pins}_W${wide ? "15.24" : "7.62"}mm`;
}

// ---- referans modeller için yardımcılar

/** Pin adlarından sayı oku: names[0] en düşük bit */
export function busValue(p: RefIn, names: string[]): number {
  return names.reduce((v, n, i) => v | (p[n] << i), 0);
}

/** Sayıyı pin adlarına dağıt (names[0] en düşük bit) */
export function busOut(names: string[], v: number | null, out: RefOut = {}): RefOut {
  names.forEach((n, i) => (out[n] = v === null ? null : (((v >> i) & 1) as 0 | 1)));
  return out;
}

/** "D0".."D7" gibi ad dizisi */
export const range = (prefix: string, n: number, suffix = "", start = 0) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + start}${suffix}`);

/** Durumsuz (birleşimsel) referans model */
export function comb(fn: (p: RefIn) => RefOut): RefModel<null> {
  return { combinational: true, init: () => null, eval: (s, _prev, cur) => ({ s, out: fn(cur) }) };
}

export const b = (v: boolean): 0 | 1 => (v ? 1 : 0);
