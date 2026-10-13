// Bir pasif elemanın kartta ne iş yaptığı: LED'in seri direnci ve onu süren sinyal, çekme
// dirençleri, RC çiftleri, dekuplaj kondansatörünün çipi, VGA DAC'ı. Saf fonksiyonlar: 3D sahne
// (LED'in yanması), bilgi paneli ve ipucu metni bunları kullanır; testler de. Açıklama metinleri
// seçili dilde (pasifAciklamasi(p, ctx, dil)); hesaplar iki dilde aynı.

import type { ChipPlace, PassivePlace } from "../../cpu16/board/layout";
import {
  LED_RENK_KURALLARI, LED_RENKLERI, PASSIVES, type LedRenk,
} from "../../cpu16/board/passives";
import {
  VCC, akimMetni, direncBantlari, direncGucu, faradMetni, frekansMetni, gucMetni, kodAcilimi, ledAkimi, ohmMetni, pasifDegeri, rcSabiti, renkKodu, sayi,
  sureMetni, ucHaneliKod, type PasifDeger,
} from "../../cpu16/board/pasif-bilgi";
import type { Dil } from "../ui/ceviri";
import { parcaBasligi } from "./adlar";
import { chip as chipDef } from "../../cpu16/chips/library";
import { RAKAM_SEGMENT } from "../../cpu16/chips/parts/gosterge";
import { dacVolts } from "./beam";
import type { Endpoint } from "./wires";

/** Seviye: 0, 1, 2 = Z, 3 = X */
export type Seviye = number;

export interface PasifBaglam {
  ends: Map<number, Endpoint[]>;
  find: (ref: string) => { chip?: ChipPlace; passive?: PassivePlace } | null;
  netName: (net: number) => string;
  /** canlı seviye (simülasyon yoksa 3) */
  level: (net: number) => Seviye;
  /** ölçülen saat hızı (Hz), biliniyorsa */
  hz?: number;
}

const GND = 0;
const VCCNET = 1;
const isPower = (net: number) => net === GND || net === VCCNET;

/** Seviyenin Türkçe adı */
export const SEVIYE_ADI = ["0 (düşük, 0 V)", "1 (yüksek, 5 V)", "Z (boşta, sürülmüyor)", "X (belirsiz)"];
export const SEVIYE_KISA = ["0", "1", "Z", "X"];

const pinNet = (p: PassivePlace, num: number) => p.pins.find((q) => q.num === num)?.net ?? -1;
const others = (ctx: PasifBaglam, net: number, ref: string) => (ctx.ends.get(net) ?? []).filter((e) => e.ref !== ref);
const passiveOf = (ctx: PasifBaglam, e: Endpoint) => (e.kind === "passive" ? ctx.find(e.ref)?.passive ?? null : null);
const ohmOf = (p: PassivePlace) => {
  const d = pasifDegeri(p.part);
  return d && (d.tur === "direnc" || d.tur === "dizi" || d.tur === "pot") ? d.ohm : null;
};
const faradOf = (p: PassivePlace) => {
  const d = pasifDegeri(p.part);
  return d && (d.tur === "seramik" || d.tur === "elektrolitik") ? d.farad : null;
};
const isResistor = (p: PassivePlace) => p.kind === "direnc" && ohmOf(p) !== null;
const isCap = (p: PassivePlace) => p.kind === "kondansator" || p.kind === "elektrolitik";

/** Bir netin sürücüsü: o nete çıkışı bağlı ilk çip pini (ör. U206.Y0) */
export function netDriver(ctx: PasifBaglam, net: number): Endpoint | null {
  for (const e of ctx.ends.get(net) ?? []) {
    if (e.kind !== "chip") continue;
    try {
      const dir = chipDef(e.part).pins.find((q) => q.name === e.name)?.dir;
      if (dir === "out" || dir === "tri" || dir === "bidir") return e;
    } catch {
      // kütüphanede olmayan parça
    }
  }
  return null;
}

/** Bir netin ilk alıcısı: o nete girişi bağlı çip pini */
export function netAlici(ctx: Pick<PasifBaglam, "ends">, net: number): Endpoint | null {
  for (const e of ctx.ends.get(net) ?? []) {
    if (e.kind !== "chip") continue;
    try {
      if (chipDef(e.part).pins.find((q) => q.name === e.name)?.dir === "in") return e;
    } catch {
      // kütüphanede olmayan parça
    }
  }
  return null;
}

/** Direnç bir LED'in seri direnciyse o LED (besleme netleri üzerinden aranmaz) */
export function seriLed(p: PassivePlace, ctx: Pick<PasifBaglam, "ends" | "find">): PassivePlace | null {
  if (p.kind !== "direnc") return null;
  for (const q of p.pins) {
    if (q.net <= 1) continue;
    for (const e of ctx.ends.get(q.net) ?? []) {
      if (e.kind !== "passive" || e.ref === p.ref) continue;
      const o = ctx.find(e.ref)?.passive;
      if (o?.kind === "led") return o;
    }
  }
  return null;
}

/**
 * Direncin bir bacağının karşısındaki net: iki uçlu direnç ya da yalıtılmış direnç dizisi (DIP-16:
 * k. direnç k. ve 17 − k. bacak arasında). Direnç değilse null.
 */
function direncKarsisi(r: PassivePlace, num: number): number | null {
  if (r.kind === "direnc" && r.pins.length === 2) return r.pins.find((q) => q.num !== num)?.net ?? -1;
  if (r.kind === "dipdizi") return pinNet(r, r.pins.length + 1 - num);
  return null;
}

/**
 * Simülasyon dirençlerin değerini bilmez: yalnız pasiflere bağlı bir net (ör. LED'in anodu, 7 segment
 * göstergenin segmenti) Z görünür. Böyle bir net tek bir dirençle (iki uçlu ya da yalıtılmış dizinin
 * bir direnciyle) çipin sürdüğü bir nete bağlıysa onun seviyesini taşır (akım akmıyorsa iki uç aynı
 * gerilimde; LED yanarken anot ≈ Vf, yine "1" sayılır).
 */
export function etkinNet(ends: Map<number, Endpoint[]>, find: PasifBaglam["find"], n: number): number {
  if (n <= 1) return n;
  const list = ends.get(n) ?? [];
  if (list.some((e) => e.kind === "chip")) return n;
  let out = -1;
  for (const e of list) {
    if (e.kind !== "passive") continue;
    const r = find(e.ref)?.passive;
    const karsi = r ? direncKarsisi(r, e.num) : null;
    if (karsi === null) continue;
    if (out >= 0) return n;
    out = karsi;
  }
  if (out < 0) return n;
  return out <= 1 || (ends.get(out) ?? []).some((e) => e.kind === "chip") ? out : n;
}

// ---------------------------------------------------------------- LED

export interface LedDevresi {
  renk: LedRenk;
  /** anot (pin 1) ve katot (pin 2) netleri */
  anot: number;
  katot: number;
  /** LED'i yakan sinyal: anodu süren çip yoksa seri direncin öbür ucu; aktif düşükte katot */
  sinyal: number;
  direnc: PassivePlace | null;
  ohm: number | null;
  /** VCC → direnç → LED → sinyal: sinyal 0 iken yanar (CPU kartının ~ROE0 gibi LED'leri) */
  aktifDusuk: boolean;
}

/** LED'in yandığı net: anot netini süren çip yoksa, anoda bağlı direncin öbür ucu (sinyal → R → LED) */
export function ledSignal(p: PassivePlace, ends: Map<number, Endpoint[]>, find: PasifBaglam["find"]): number {
  return ledDevresi(p, { ends, find }).sinyal;
}

export function ledDevresi(p: PassivePlace, ctx: Pick<PasifBaglam, "ends" | "find">): LedDevresi {
  const anot = pinNet(p, 1);
  const katot = pinNet(p, 2);
  const out: LedDevresi = { renk: p.led ?? "kirmizi", anot, katot, sinyal: anot, direnc: null, ohm: null, aktifDusuk: false };
  if (anot < 0) return out;
  const list = ctx.ends.get(anot) ?? [];
  for (const e of list) {
    if (e.kind !== "passive" || e.ref === p.ref) continue;
    const r = ctx.find(e.ref)?.passive;
    if (r && r.pins.length === 2 && r.kind === "direnc") {
      out.direnc = r;
      out.ohm = ohmOf(r);
      if (!list.some((x) => x.kind === "chip")) out.sinyal = r.pins.find((q) => q.num !== e.num)?.net ?? -1;
      // direncin öbür ucu VCC, katot bir sinyalde: aktif düşük LED, katodu süren çıkış 0 olunca yanar
      if (out.sinyal === VCCNET && katot > VCCNET) {
        out.aktifDusuk = true;
        out.sinyal = katot;
      }
      break;
    }
  }
  return out;
}

/** LED yanıyor mu: sinyal 1 ve katot 0 (aktif düşükte sinyal, yani katot, 0) */
export const ledYanik = (d: LedDevresi, level: (net: number) => Seviye): boolean =>
  d.aktifDusuk
    ? d.sinyal >= 0 && level(d.sinyal) === 0
    : d.sinyal >= 0 && level(d.sinyal) === 1 && (d.katot === GND || level(d.katot) === 0);

/** LED'in akımı (A): ileri gerilim renginden, direnç devreden */
export function ledAkimiOf(d: LedDevresi): number | null {
  return d.ohm ? ledAkimi(VCC, LED_RENKLERI[d.renk].vf, d.ohm) : null;
}

// ---------------------------------------------------------------- çekme dirençleri, RC

export interface Cekme {
  yon: "yukari" | "asagi";
  ohm: number;
  /** çekilen sinyal netleri */
  hatlar: number[];
}

/** Bir ucu VCC'de ya da GND'de olan direnç / direnç dizisi */
export function cekmeDirenci(p: PassivePlace): Cekme | null {
  const ohm = ohmOf(p);
  if (ohm === null || (p.kind !== "direnc" && p.kind !== "dizi")) return null;
  const nets = p.pins.map((q) => q.net);
  const hatlar = nets.filter((n) => n > 1);
  if (p.kind === "dizi") {
    const com = pinNet(p, 1);
    if (!isPower(com)) return null;
    return { yon: com === VCCNET ? "yukari" : "asagi", ohm, hatlar };
  }
  if (nets.length !== 2 || hatlar.length !== 1) return null;
  if (nets.includes(VCCNET)) return { yon: "yukari", ohm, hatlar };
  if (nets.includes(GND)) return { yon: "asagi", ohm, hatlar };
  return null;
}

export interface RcCifti {
  direnc: PassivePlace;
  kondansator: PassivePlace;
  ohm: number;
  farad: number;
  /** ortak net */
  net: number;
  tau: number;
  /** dirence seri trimpot (yavaş osilatör): en büyük direnç */
  pot?: PassivePlace;
}

/** Direnç ya da kondansatörün RC eşi: aynı sinyal netinde öbürü */
export function rcCifti(p: PassivePlace, ctx: PasifBaglam): RcCifti | null {
  if (!isResistor(p) && !isCap(p)) return null;
  for (const q of p.pins) {
    if (q.net < 0 || isPower(q.net)) continue;
    for (const e of others(ctx, q.net, p.ref)) {
      const o = passiveOf(ctx, e);
      if (!o) continue;
      const r = isResistor(p) && isCap(o) ? p : isCap(p) && isResistor(o) ? o : null;
      const c = r === p ? o : r ? p : null;
      if (!r || !c) continue;
      const ohm = ohmOf(r)!;
      const farad = faradOf(c)!;
      // direncin öbür ucunda trimpot var mı (R + pot seri)
      const rOther = r.pins.find((x) => x.net !== q.net)?.net ?? -1;
      const pot = rOther > 1 ? others(ctx, rOther, r.ref).map((x) => passiveOf(ctx, x)).find((x) => x?.kind === "pot") ?? undefined : undefined;
      return { direnc: r, kondansator: c, ohm, farad, net: q.net, tau: rcSabiti(ohm, farad), pot };
    }
  }
  return null;
}

/** VGA DAC direnci: öbür ucu VGA konnektörünün RED / GREEN / BLUE pinine bağlı */
export interface DacDirenci {
  kanal: "kırmızı" | "yeşil" | "mavi";
  konnektor: PassivePlace;
  /** aynı kanaldaki dirençler ve sürdükleri netler */
  girisler: { direnc: PassivePlace; ohm: number; net: number }[];
}

export function dacDirenci(p: PassivePlace, ctx: PasifBaglam): DacDirenci | null {
  if (!isResistor(p) || p.pins.length !== 2) return null;
  for (const q of p.pins) {
    if (q.net < 0 || isPower(q.net)) continue;
    for (const e of others(ctx, q.net, p.ref)) {
      const k = passiveOf(ctx, e);
      const names = k ? PASSIVES[k.part]?.pins.map((x) => x.name) ?? [] : [];
      const pin = names[e.num - 1];
      const kanal = pin === "RED" ? "kırmızı" : pin === "GREEN" ? "yeşil" : pin === "BLUE" ? "mavi" : null;
      if (!k || !kanal) continue;
      const girisler = others(ctx, q.net, k.ref).flatMap((x) => {
        const r = passiveOf(ctx, x);
        if (!r || !isResistor(r)) return [];
        const net = r.pins.find((y) => y.num !== x.num)?.net ?? -1;
        return [{ direnc: r, ohm: ohmOf(r)!, net }];
      });
      return { kanal, konnektor: k, girisler };
    }
  }
  return null;
}

// ---------------------------------------------------------------- DIP anahtar, 7 segment gösterge

export interface DipAnahtar {
  /** gövdedeki numarası (soldan 1, 2, …) */
  no: number;
  /** birleştirdiği bacaklar: k. ve (n + 1 − k). */
  pinler: [number, number];
  /** sinyal ucu (besleme olmayan uç; ikisi de sinyalse ikinci bacak) */
  net: number;
  /** açık (ON): iki uç birleşik, aynı seviyede (hesap makinesinde giriş 1) */
  acik: boolean;
}

/** DIP anahtarın anahtarları ve canlı konumları: k. anahtar k. ve (n + 1 − k). bacağı birleştirir */
export function dipAnahtarlari(p: PassivePlace, level: (net: number) => Seviye): DipAnahtar[] {
  const n = p.pins.length;
  const lv = (x: number) => (x < 0 ? 2 : level(x));
  return Array.from({ length: Math.floor(n / 2) }, (_, i) => {
    const k = i + 1;
    const a = pinNet(p, k);
    const b = pinNet(p, n + 1 - k);
    const la = lv(a);
    return { no: k, pinler: [k, n + 1 - k], net: isPower(b) && !isPower(a) ? a : b, acik: la <= 1 && la === lv(b) };
  });
}

/** Göstergenin segmentleri (a … g ve nokta) */
export const SEGMENT_ADLARI = ["a", "b", "c", "d", "e", "f", "g", "dp"] as const;
export type SegmentAdi = (typeof SEGMENT_ADLARI)[number];

/**
 * Göstergenin her segmenti: bacağı ve segmenti yakan net. Segment bacağı yalnız direnç dizisine bağlı
 * (simülasyonda Z): dizinin öbür ucundaki sürücü çıkışı (74HC4511) kullanılır (etkinNet).
 */
export function segmentNetleri(p: PassivePlace, ends: Map<number, Endpoint[]>, find: PasifBaglam["find"]): { seg: SegmentAdi; pin: number; net: number }[] {
  const pins = PASSIVES[p.part]?.pins ?? [];
  return SEGMENT_ADLARI.map((seg) => {
    const pin = pins.find((q) => q.name.toLowerCase() === seg)?.num ?? -1;
    const n = pin < 0 ? -1 : pinNet(p, pin);
    return { seg, pin, net: n < 0 ? -1 : etkinNet(ends, find, n) };
  });
}

/** Yanan segmentlerden okunan karakter (74HC4511 deseni): sönük boşluk, yalnız g "−", tanınmayan "?" */
export function segmentKarakteri(yanan: readonly string[]): string {
  const s = SEGMENT_ADLARI.slice(0, 7).filter((x) => yanan.includes(x)).join("");
  if (!s) return " ";
  const r = RAKAM_SEGMENT.indexOf(s);
  return r >= 0 ? String(r) : s === "g" ? "−" : "?";
}

/** Yalıtılmış direnç dizisinin değeri: RN_470_ISO_8 → 8 × 470 Ω */
function isoDizi(part: string): { ohm: number; adet: number } | null {
  const m = /^RN_(\d+)([KM])?_ISO_(\d+)$/.exec(part);
  return m ? { ohm: Number(m[1]) * (m[2] === "K" ? 1e3 : m[2] === "M" ? 1e6 : 1), adet: Number(m[3]) } : null;
}

// ---------------------------------------------------------------- açıklama

export interface Hesap {
  ad: string;
  formul: string;
  sonuc: string;
}

export interface Durum {
  metin: string;
  ton: "yanik" | "sonuk" | "bilgi" | "uyari";
}

export interface Aciklama {
  /** elemanın türü, seçili dilde */
  tur: string;
  /** değerin okunuşu */
  deger?: string;
  /** ipucu metni için tek satır */
  ozet: string;
  /** "Bu kartta görevi" paragrafları */
  gorev: string[];
  hesaplar: Hesap[];
  /** canlı durum */
  durum?: Durum;
  /** ilgili elemanlar (panelde tıklanır) */
  ilgili: { ref: string; neden: string }[];
}

export const TUR_ADI: Record<PassivePlace["kind"], { tr: string; en: string }> = {
  direnc: { tr: "Direnç", en: "Resistor" },
  dizi: { tr: "Direnç dizisi (SIP-9)", en: "Resistor network (SIP-9)" },
  kondansator: { tr: "Seramik kondansatör", en: "Ceramic capacitor" },
  elektrolitik: { tr: "Elektrolitik kondansatör", en: "Electrolytic capacitor" },
  led: { tr: "LED (ışık yayan diyot)", en: "LED (light-emitting diode)" },
  konnektor: { tr: "Konnektör", en: "Connector" },
  osilator: { tr: "Kristal osilatör", en: "Crystal oscillator" },
  buton: { tr: "Basmalı buton", en: "Push button" },
  anahtar: { tr: "Sürgülü anahtar", en: "Slide switch" },
  pot: { tr: "Trimpot (ayarlı direnç)", en: "Trimpot (adjustable resistor)" },
  modul: { tr: "Modül", en: "Module" },
  dip: { tr: "DIP anahtar", en: "DIP switch" },
  gosterge: { tr: "7 segment gösterge", en: "7-segment display" },
  dipdizi: { tr: "Direnç dizisi (DIP-16, yalıtılmış)", en: "Resistor network (DIP-16, isolated)" },
  cubuk: { tr: "LED çubuk gösterge (10 segment)", en: "LED bar graph (10 segments)" },
};

/** LED renklerinin İngilizce adları (Türkçeleri passives.ts'te, LED_RENKLERI) */
const LED_RENK_EN: Record<LedRenk, string> = { kirmizi: "red", turuncu: "orange (amber)", sari: "yellow", yesil: "green", mavi: "blue", beyaz: "white" };

/** LED renk kurallarının nedenleri İngilizce, kuralın deseniyle (Türkçeleri passives.ts'te, LED_RENK_KURALLARI) */
const KURAL_NEDENI_EN: Record<string, string> = {
  "FAULT|HATA": "error: the color that draws the most attention",
  "HALT": "the CPU has stopped: a warning, not an error (the yellow of a traffic light)",
  "\\bCLK\\b|SAAT": "clock: it blinks all the time, so it should stand apart from the other status LEDs",
  "VCC|BESLEME|GÜÇ|HAZIR|\\bOK\\b": "power / all is well",
  "ISLEM_": "the selected operation on the calculator: only one of the four LEDs is lit",
  "okuma": "read: a value is coming out of memory or a register onto the bus",
  "yazma|yükleme|artırma": "write and load: a register or memory will change on this clock edge (amber: caution)",
  "veriyolu sürücüsü": "the source driving the bus: apart from the read and write colors; at most one of the six is lit",
  "bayrağı": "flags: the ALU's status bits, apart from the value displays",
  "mikro adım": "micro step: a four-bit number, like the value displays",
  "çubuk gösterge": "value display: like data and address monitoring",
  "\\b(?:A|D|DE|DO|AD|BUS)\\d+\\b|VERİ|ADRES": "monitoring data and address lines",
};

/** LED renk kuralının nedeni, seçili dilde (İngilizcesi yoksa Türkçesi; test her kuralı denetler) */
export const ledKuralNedeni = (k: { desen: RegExp; neden: string }, dil: Dil = "tr"): string =>
  dil === "en" ? KURAL_NEDENI_EN[k.desen.source] ?? k.neden : k.neden;

/**
 * Ayrı açıklaması olmayan parçaların (modüller) kullanımı İngilizce; Türkçesi passives.ts'te (usage).
 * Parça başlıklarının İngilizcesi adlar.ts'te (parcaBasligi).
 */
const KULLANIM_EN: Record<string, string> = {
  ARDUINO_NANO: "The brain of the EEPROM programmer: takes Intel HEX over the serial port and writes it to the chip",
};

/** Parçanın seçili dildeki başlığı ve kullanımı */
function parcaAdi(part: string, dil: Dil): { ad: string; kullanim: string } {
  const p = PASSIVES[part];
  return { ad: parcaBasligi(part, p?.title ?? part, dil), kullanim: dil === "en" ? KULLANIM_EN[part] ?? "" : p?.usage ?? "" };
}

const KANAL_EN: Record<DacDirenci["kanal"], string> = { kırmızı: "red", yeşil: "green", mavi: "blue" };

/** Seçili dile göre metin seçici ve sayı biçimleri (Türkçede ondalık virgül, İngilizcede nokta) */
function dilde(dil: Dil) {
  const en = dil === "en";
  return {
    en,
    t: (tr: string, ing: string) => (en ? ing : tr),
    sayi: (x: number, b = 2) => sayi(x, b, dil),
    v: (x: number, b = 2) => `${sayi(x, b, dil)} V`,
    ohm: (x: number) => ohmMetni(x, dil),
    farad: (x: number) => faradMetni(x, dil),
    akim: (x: number) => akimMetni(x, dil),
    guc: (x: number) => gucMetni(x, dil),
    sure: (x: number) => sureMetni(x, dil),
    frekans: (x: number) => frekansMetni(x, dil),
    kod: (kod: string, birim: "pF" | "Ω") => kodAcilimi(kod, birim, dil),
    tur: (k: PassivePlace["kind"]) => TUR_ADI[k][dil],
    led: (r: LedRenk) => (en ? LED_RENK_EN[r] : LED_RENKLERI[r].ad),
    net: (ctx: PasifBaglam, n: number) => (n < 0 ? (en ? "not connected" : "bağlı değil") : ctx.netName(n)),
  };
}
type Yazi = ReturnType<typeof dilde>;

const chipLabel = (e: Endpoint) => `${e.ref}.${e.name}`;

function ledAciklama(p: PassivePlace, ctx: PasifBaglam, L: Yazi): Aciklama {
  const d = ledDevresi(p, ctx);
  const info = LED_RENKLERI[d.renk];
  const renk = L.led(d.renk);
  const kural = LED_RENK_KURALLARI.find((k) => k.renk === d.renk && k.desen.test(p.role));
  const I = ledAkimiOf(d);
  const sig = L.net(ctx, d.sinyal);
  const drv = d.sinyal >= 0 ? netDriver(ctx, d.sinyal) : null;
  const yanar = d.aktifDusuk ? 0 : 1;
  const yol = d.direnc ? ` → ${d.direnc.ref}` : "";
  const gorev = [
    d.aktifDusuk
      ? L.t(
        `${p.role}: aktif düşük. ${sig} sinyali 0 olunca akım VCC${yol} → ${p.ref} → ${sig} yolundan akar, ${drv ? `${chipLabel(drv)} çıkışı` : "sürücü çıkışı"} akımı GND'ye çeker ve LED yanar; 1 olunca iki uç da 5 V'tadır, LED söner. Sinyal 0 iken etkin olduğu için LED de 0 iken yanar: yanan LED "etkin" demektir.`,
        `${p.role}: active low. When ${sig} goes 0, current flows along VCC${yol} → ${p.ref} → ${sig}, ${drv ? `the ${chipLabel(drv)} output` : "the driver output"} sinks it to GND and the LED lights; at 1 both ends are at 5 V and the LED is off. The signal is active at 0, so the LED lights at 0 too: a lit LED means "active".`,
      )
      : L.t(
        `${p.role}: ${sig} sinyali 1 olunca akım ${sig}${yol} → ${p.ref} → GND yolundan akar ve LED yanar; 0 olunca söner.`,
        `${p.role}: when ${sig} goes 1, current flows along ${sig}${yol} → ${p.ref} → GND and the LED lights; at 0 it goes off.`,
      ),
    L.t(
      `Renk: ${renk}${kural ? `, çünkü ${kural.neden}` : ""}. Kutup: anot (+, uzun bacak) pin 1 → ${L.net(ctx, d.anot)}; katot (−, kısa bacak, flanşın düz kenarı) pin 2 → ${L.net(ctx, d.katot)}.`,
      `Color: ${renk}${kural ? ` (${ledKuralNedeni(kural, "en")})` : ""}. Polarity: anode (+, long leg) pin 1 → ${L.net(ctx, d.anot)}; cathode (−, short leg, flat side of the rim) pin 2 → ${L.net(ctx, d.katot)}.`,
    ),
  ];
  const hesaplar: Hesap[] = [];
  if (I !== null && d.ohm) {
    const [lo, hi] = info.vfAralik;
    hesaplar.push(
      { ad: L.t("LED akımı", "LED current"), formul: `I = (5 V − ${L.v(info.vf, 1)}) / ${L.ohm(d.ohm)}`, sonuc: `≈ ${L.akim(I)}` },
      {
        ad: `${L.t("Vf aralığı", "Vf range")} ${L.sayi(lo)}–${L.sayi(hi)} V`,
        formul: `I = ${L.akim(ledAkimi(VCC, hi, d.ohm))} … ${L.akim(ledAkimi(VCC, lo, d.ohm))}`,
        sonuc: L.t("3 mm LED en çok 20 mA", "3 mm LED: 20 mA at most"),
      },
      {
        ad: L.t(`${d.direnc!.ref} dirençteki güç`, `Power in ${d.direnc!.ref}`),
        formul: `P = I² · R = (${L.akim(I)})² · ${L.ohm(d.ohm)}`,
        sonuc: `≈ ${L.guc(direncGucu(I, d.ohm))} ${L.t("(¼ W direnç için çok az)", "(far below a ¼ W resistor's rating)")}`,
      },
    );
    gorev.push(L.t(
      "74HC çıkışı bu akımda ≈ 0,2–0,4 V düşer; gerçek akım hesaptakinden biraz azdır. Bir 74HC çıkışından en çok ±25 mA çekilir, LED için 5–10 mA yeterince parlak.",
      "A 74HC output drops ≈ 0.2–0.4 V at this current, so the real current is a little lower than calculated. A 74HC output can supply at most ±25 mA; 5–10 mA is bright enough for an LED.",
    ));
    if (d.ohm >= 1000) {
      gorev.push(L.t(
        `${L.ohm(d.ohm)} ile ≈ ${L.akim(I)}: hata ayıklama LED'i için yeter (yüksek verimli 3 mm LED bu akımda da rahat görünür). Kartta onlarca LED var; akım küçük tutulunca hem besleme bütçesi hem de LED'i süren sinyalin seviyesi rahat eder.`,
        `With ${L.ohm(d.ohm)}, ≈ ${L.akim(I)}: enough for a debug LED (a high-efficiency 3 mm LED is easy to see even at this current). The board has dozens of LEDs; keeping the current small spares both the power budget and the level of the signal driving the LED.`,
      ));
    }
  }
  let durum: Durum;
  const lv = d.sinyal >= 0 ? ctx.level(d.sinyal) : 3;
  const surucu = (x: number) => (drv ? L.t(` (${chipLabel(drv)} çıkışı ${x === 1 ? "yüksek" : "düşük"})`, ` (${chipLabel(drv)} output ${x === 1 ? "high" : "low"})`) : "");
  if (lv === yanar) {
    durum = { ton: "yanik", metin: `${L.t("YANIYOR", "ON")}: ${sig} = ${lv}${surucu(lv)}.` };
    if (/CLK/.test(sig) && (ctx.hz ?? 0) > 30) {
      durum.metin += L.t(
        " Hızlı saatte LED saniyede onlarca kez yanıp söner; göz ortalamasını görür, yarı parlak yanar.",
        " With a fast clock the LED blinks dozens of times a second; the eye sees the average, so it looks half bright.",
      );
    }
  } else if (lv === 0 || lv === 1) durum = { ton: "sonuk", metin: `${L.t("SÖNÜK", "OFF")}: ${sig} = ${lv}${surucu(lv)}.` };
  else durum = { ton: "bilgi", metin: `${sig} = ${SEVIYE_KISA[lv]}: ${L.t("simülasyon henüz bu hattı sürmedi.", "the simulation has not driven this line yet.")}` };
  if (d.direnc && !d.aktifDusuk && d.sinyal !== d.anot) {
    durum.metin += L.t(
      ` Simülasyonda dirençlerin değeri yok: ${L.net(ctx, d.anot)} neti Z görünür; parlaklık direncin öbür ucundaki ${sig}'den hesaplanır.`,
      ` The simulation has no resistor values: the ${L.net(ctx, d.anot)} net shows as Z, and the brightness is worked out from ${sig} on the other side of the resistor.`,
    );
  }
  return {
    tur: L.tur("led"),
    deger: `${renk}, 3 mm · Vf ≈ ${L.v(info.vf, 1)}`,
    ozet: `${renk} LED · ${p.role.replace(/ LED'i$/, "")}${I !== null ? ` · ≈ ${L.akim(I)}` : ""} · ${ledYanik(d, ctx.level) ? L.t("yanıyor", "on") : L.t("sönük", "off")}`,
    gorev,
    hesaplar,
    durum,
    ilgili: d.direnc ? [{ ref: d.direnc.ref, neden: `${L.t("seri direnç", "series resistor")} (${L.ohm(d.ohm!)})` }] : [],
  };
}

function cekmeMetni(c: Cekme, ctx: PasifBaglam, tek: boolean, L: Yazi): string[] {
  const yukari = c.yon === "yukari";
  const ters = yukari ? "0" : "1";
  return [
    L.t(
      `Çekme direnci (${yukari ? "pull-up" : "pull-down"}): kimse sürmediğinde ${tek ? `${L.net(ctx, c.hatlar[0])} hattını` : `${c.hatlar.length} hattı`} ${yukari ? "1'e (VCC, 5 V)" : "0'a (GND)"} çeker. Bir çıkış hattı ${ters} sürünce direnç onu ezmez, çünkü ${L.ohm(c.ohm)} çıkışın birkaç on ohm'luk iç direncine göre çok büyüktür.`,
      `Pull-${yukari ? "up" : "down"} resistor: when nothing drives ${tek ? `the ${L.net(ctx, c.hatlar[0])} line` : `the ${c.hatlar.length} lines`}, it pulls ${tek ? "it" : "them"} to ${yukari ? "1 (VCC, 5 V)" : "0 (GND)"}. When an output drives the line to ${ters}, the resistor does not override it, because ${L.ohm(c.ohm)} is much larger than the output's internal resistance of a few tens of ohms.`,
    ),
    L.t(
      "Direnç olmasa: CMOS girişi boşta kalır (yüzen giriş). Seviyesi belirsizdir; parmağın, komşu telin parazitiyle 0 ile 1 arasında gidip gelir, giriş katı yarı iletimde kalıp akım çeker, çip ısınabilir.",
      "Without the resistor the CMOS input floats, and its level is unknown: noise from a finger or a nearby wire swings it between 0 and 1, the input stage stays half on and draws current, and the chip can heat up.",
    ),
  ];
}

function cekmeHesap(c: Cekme, L: Yazi): Hesap[] {
  const I = VCC / c.ohm;
  return [
    {
      ad: L.t(`Hat ${c.yon === "yukari" ? "0'a" : "1'e"} sürülünce akım`, `Current when the line is driven to ${c.yon === "yukari" ? "0" : "1"}`),
      formul: `I = 5 V / ${L.ohm(c.ohm)}`,
      sonuc: `= ${L.akim(I)}`,
    },
    { ad: L.t("Dirençteki güç", "Power in the resistor"), formul: `P = V² / R = 25 / ${L.ohm(c.ohm)}`, sonuc: `= ${L.guc(VCC * VCC / c.ohm)}` },
  ];
}

function cekmeDurum(c: Cekme, ctx: PasifBaglam, L: Yazi): Durum {
  const lv = c.hatlar.map((n) => ctx.level(n));
  const aktif = lv.filter((x) => x === (c.yon === "yukari" ? 0 : 1)).length;
  if (c.hatlar.length === 1) {
    const l = lv[0];
    const hat = L.net(ctx, c.hatlar[0]);
    if (l === (c.yon === "yukari" ? 0 : 1)) {
      return { ton: "bilgi", metin: L.t(`Şu an ${hat} = ${l}: hattı bir çıkış (ya da buton) sürüyor, direnç üzerinden ${L.akim(VCC / c.ohm)} akıyor.`, `Now ${hat} = ${l}: an output (or a button) is driving the line, and ${L.akim(VCC / c.ohm)} flows through the resistor.`) };
    }
    if (l === 0 || l === 1) return { ton: "bilgi", metin: L.t(`Şu an ${hat} = ${l}: direncin iki ucu aynı gerilimde, akım yok.`, `Now ${hat} = ${l}: both ends of the resistor are at the same voltage, no current.`) };
    return { ton: "uyari", metin: `${L.t("Şu an", "Now")} ${hat} = ${SEVIYE_KISA[l]}.` };
  }
  const bir = lv.filter((x) => x === 1).length;
  const sifir = lv.filter((x) => x === 0).length;
  const toplam = L.akim((aktif * VCC) / c.ohm);
  const akim = aktif
    ? L.t(`${aktif} dirençten akım akıyor (toplam ${toplam}).`, `Current flows through ${aktif} ${aktif === 1 ? "resistor" : "resistors"} (${toplam} in total).`)
    : L.t("Hepsi dinlenme seviyesinde: hiçbir dirençten akım akmıyor.", "All at rest: no current flows through any resistor.");
  return { ton: "bilgi", metin: L.t(`Şu an ${c.hatlar.length} hattın ${bir}'i 1, ${sifir}'i 0. ${akim}`, `Now ${bir} of the ${c.hatlar.length} lines are 1 and ${sifir} are 0. ${akim}`) };
}

function rcMetni(rc: RcCifti, ctx: PasifBaglam, p: PassivePlace, L: Yazi): { gorev: string[]; hesap: Hesap[] } {
  const role = `${rc.direnc.role} ${rc.kondansator.role}`;
  const R = rc.direnc.ref;
  const C = rc.kondansator.ref;
  const tau = { ad: L.t("Zaman sabiti", "Time constant"), formul: `τ = R · C = ${L.ohm(rc.ohm)} · ${L.farad(rc.farad)}`, sonuc: `= ${L.sure(rc.tau)}` };
  if (rc.pot) {
    const potOhm = ohmOf(rc.pot) ?? 0;
    const lo = 1 / rcSabiti(rc.ohm, rc.farad);
    const hi = 1 / rcSabiti(rc.ohm + potOhm, rc.farad);
    return {
      gorev: [L.t(
        `Yavaş osilatör: 74HC14 Schmitt evirici, ${R} + ${rc.pot.ref} ve ${C}. Kondansatör direnç üzerinden dolar ve boşalır; gerilimi Schmitt'in iki eşiği arasında gidip geldikçe çıkış kare dalga verir. Trimpotu çevirmek R'yi, dolayısıyla frekansı değiştirir.`,
        `Slow oscillator: a 74HC14 Schmitt inverter, ${R} + ${rc.pot.ref} and ${C}. The capacitor charges and discharges through the resistor; as its voltage swings between the two Schmitt thresholds, the output gives a square wave. Turning the trimpot changes R, and with it the frequency.`,
      )],
      hesap: [
        { ad: L.t("Direnç aralığı", "Resistance range"), formul: `R = ${L.ohm(rc.ohm)} + (0 … ${L.ohm(potOhm)})`, sonuc: `${L.ohm(rc.ohm)} … ${L.ohm(rc.ohm + potOhm)}` },
        { ad: L.t("Frekans (yaklaşık)", "Frequency (approx.)"), formul: `f ≈ 1 / (R · C)`, sonuc: `${L.frekans(hi)} … ${L.frekans(lo)}` },
        { ad: L.t("CPU saati (osilatör / 8)", "CPU clock (oscillator / 8)"), formul: `f / 8`, sonuc: `${L.frekans(hi / 8)} … ${L.frekans(lo / 8)}` },
      ],
    };
  }
  if (/reset/i.test(role)) {
    const net_ = L.net(ctx, rc.net);
    return {
      gorev: [L.t(
        `Açılış reseti: güç gelince ${C} boştur (0 V), ${net_} 0'dır ve bilgisayar resette bekler. ${C}, ${R} üzerinden dolar; gerilim 74HC14'ün eşiğini (≈ 2,5–3 V) geçince reset biter. RESET butonu kondansatörü boşaltıp aynı şeyi tekrarlar.`,
        `Power-on reset: when power arrives, ${C} is empty (0 V), ${net_} is 0 and the computer waits in reset. ${C} charges through ${R}; once the voltage passes the 74HC14's threshold (≈ 2.5–3 V), reset ends. The RESET button discharges the capacitor and repeats the same thing.`,
      )],
      hesap: [tau, { ad: L.t("Eşiğe varış (≈ 0,7 τ)", "Time to threshold (≈ 0.7 τ)"), formul: L.t("t ≈ 0,7 · τ", "t ≈ 0.7 · τ"), sonuc: `≈ ${L.sure(0.7 * rc.tau)}` }],
    };
  }
  if (/sıçrama|buton/i.test(role)) {
    return {
      gorev: [L.t(
        `Buton sıçrama (bounce) süzgeci: mekanik kontak basılınca birkaç milisaniye açılıp kapanır. ${C} hızlı sıçramaları yutar, gerilim ancak τ mertebesinde değişir; 74HC14'ün Schmitt girişi tek temiz kenar verir.`,
        `Button debounce filter: a mechanical contact opens and closes for a few milliseconds when pressed. ${C} swallows the fast bounces, so the voltage changes only on the order of τ; the 74HC14's Schmitt input turns that into one clean edge.`,
      )],
      hesap: [tau],
    };
  }
  const obur = R === p.ref ? C : R;
  return { gorev: [L.t(`${p.ref}, ${obur} ile bir RC devresi kurar (${L.net(ctx, rc.net)}).`, `${p.ref} forms an RC circuit with ${obur} (${L.net(ctx, rc.net)}).`)], hesap: [tau] };
}

function direncAciklama(p: PassivePlace, ctx: PasifBaglam, d: Extract<PasifDeger, { tur: "direnc" }>, L: Yazi): Aciklama {
  const bantlar = direncBantlari(d.ohm, d.tolerans);
  const renkler = bantlar.map((b) => (L.en ? renkKodu(b.renk).en : b.ad)).join("-");
  const gorev: string[] = [];
  const hesaplar: Hesap[] = [];
  const ilgili: Aciklama["ilgili"] = [];
  let durum: Durum | undefined;
  let ek = "";
  // LED'in seri direnci mi
  const led = seriLed(p, ctx);
  const dac = dacDirenci(p, ctx);
  const cekme = cekmeDirenci(p);
  const rc = rcCifti(p, ctx);
  if (led) {
    const ld = ledDevresi(led, ctx);
    const I = ledAkimiOf(ld);
    const info = LED_RENKLERI[ld.renk];
    const renk = L.led(ld.renk);
    const sig = L.net(ctx, ld.sinyal);
    gorev.push(
      L.t(
        `${led.ref} (${renk} LED) için akım sınırlayıcı. LED bir diyottur: ileri gerilimi (Vf ≈ ${L.v(info.vf, 1)}) aşılınca akımı neredeyse yalnız devredeki direnç sınırlar. Direnç olmasa 74HC çıkışı ile LED aşırı akım çeker, ikisi de zarar görür.`,
        `Current limiter for ${led.ref} (${renk} LED). An LED is a diode: once its forward voltage (Vf ≈ ${L.v(info.vf, 1)}) is exceeded, almost only the resistor in the circuit limits the current. Without the resistor the 74HC output and the LED would carry too much current, and both could be damaged.`,
      ),
      ld.aktifDusuk
        ? L.t(
          `Seri bağlantı: VCC → ${p.ref} → ${led.ref} → ${sig} (aktif düşük): ${sig} 0 olunca onu süren çıkış akımı çeker ve LED yanar. Direnç LED'in önünde ya da arkasında olabilir, akım aynıdır.`,
          `Series connection: VCC → ${p.ref} → ${led.ref} → ${sig} (active low): when ${sig} goes 0, the output driving it sinks the current and the LED lights. The resistor can sit before or after the LED; the current is the same.`,
        )
        : L.t(
          `Seri bağlantı: ${sig} → ${p.ref} → ${led.ref} → GND. Direnç LED'in önünde ya da arkasında olabilir, akım aynıdır.`,
          `Series connection: ${sig} → ${p.ref} → ${led.ref} → GND. The resistor can sit before or after the LED; the current is the same.`,
        ),
    );
    if (I !== null) {
      hesaplar.push(
        { ad: L.t("Dirençteki gerilim", "Voltage across the resistor"), formul: `V_R = 5 V − Vf = 5 V − ${L.v(info.vf, 1)}`, sonuc: `= ${L.v(VCC - info.vf, 1)}` },
        { ad: L.t("LED akımı (Ohm yasası)", "LED current (Ohm's law)"), formul: `I = V_R / R = ${L.v(VCC - info.vf, 1)} / ${L.ohm(d.ohm)}`, sonuc: `≈ ${L.akim(I)}` },
        { ad: L.t("Dirençteki güç", "Power in the resistor"), formul: "P = I² · R", sonuc: `≈ ${L.guc(direncGucu(I, d.ohm))}` },
      );
      ek = L.t(` · ${led.ref} için ≈ ${L.akim(I)}`, ` · ≈ ${L.akim(I)} for ${led.ref}`);
    }
    ilgili.push({ ref: led.ref, neden: `${renk} LED` });
    const lv = ctx.level(ld.sinyal);
    durum = lv === 0 || lv === 1
      ? ledYanik(ld, ctx.level)
        ? { ton: "yanik", metin: L.t(`Şu an ${sig} = ${lv}: direncin üzerinden ≈ ${L.akim(I ?? 0)} akıyor, ${led.ref} yanıyor.`, `Now ${sig} = ${lv}: ≈ ${L.akim(I ?? 0)} flows through the resistor and ${led.ref} is on.`) }
        : { ton: "sonuk", metin: L.t(`Şu an ${sig} = ${lv}: akım yok, ${led.ref} sönük.`, `Now ${sig} = ${lv}: no current, ${led.ref} is off.`) }
      : { ton: "bilgi", metin: `${L.t("Şu an", "Now")} ${sig} = ${SEVIYE_KISA[lv]}.` };
  } else if (dac) {
    const sira = dac.girisler.slice().sort((a, b) => a.ohm - b.ohm);
    const kanal = L.en ? KANAL_EN[dac.kanal] : dac.kanal;
    const liste = sira.map((g) => `${g.direnc.ref} (${L.ohm(g.ohm)}, ${L.net(ctx, g.net)})`).join(L.t(" ve ", " and "));
    gorev.push(
      L.t(
        `VGA renk DAC'ı, ${kanal} kanal: ${liste} monitörün 75 Ω'luk girişine bağlanır. Dirençler ve 75 Ω bir gerilim bölücüdür: hangi bitler 1 ise o dirençlerden akım akar, monitör 0–0,7 V arasında bir parlaklık görür.`,
        `VGA color DAC, ${kanal} channel: ${liste} connect to the monitor's 75 Ω input. The resistors and the 75 Ω form a voltage divider: current flows through the resistors whose bits are 1, and the monitor sees a brightness between 0 and 0.7 V.`,
      ),
      L.t(
        "Küçük direnç (680 Ω) renk bitidir, büyüğü (1,3 kΩ) parlaklık biti: ağırlıkları ≈ 2/3 ve 1/3. %1 metal film önerilir (mavi gövde, 5 bant).",
        "The smaller resistor (680 Ω) is the color bit and the larger one (1.3 kΩ) the intensity bit: their weights are ≈ 2/3 and 1/3. 1% metal film is recommended (blue body, 5 bands).",
      ),
    );
    const combos = [[0, 0], [0, 1], [1, 0], [1, 1]] as const;
    for (const [a, b] of combos) {
      if (sira.length < 2) break;
      const lvl = (n: number) => (n === sira[0].net ? a : n === sira[1].net ? b : 0);
      hesaplar.push({ ad: L.t(`renk ${a}, parlaklık ${b}`, `color ${a}, intensity ${b}`), formul: "V = Σ(Vᵢ/Rᵢ) / (Σ 1/Rᵢ + 1/75 Ω)", sonuc: `≈ ${L.v(dacVolts(sira.map((g) => ({ net: g.net, ohms: g.ohm })), lvl))}` });
    }
    const now = L.v(dacVolts(sira.map((g) => ({ net: g.net, ohms: g.ohm })), (n) => ctx.level(n)));
    const seviyeler = sira.map((g) => `${L.net(ctx, g.net)} = ${SEVIYE_KISA[ctx.level(g.net)]}`).join(", ");
    durum = { ton: "bilgi", metin: L.t(`Şu an ${kanal} pinde ≈ ${now} (${seviyeler}).`, `Now ≈ ${now} on the ${kanal} pin (${seviyeler}).`) };
    ilgili.push({ ref: dac.konnektor.ref, neden: L.t("VGA konnektörü", "VGA connector") }, ...sira.filter((g) => g.direnc.ref !== p.ref).map((g) => ({ ref: g.direnc.ref, neden: L.t("aynı kanal", "same channel") })));
    ek = ` · ${kanal} DAC`;
  } else {
    if (cekme) {
      gorev.push(...cekmeMetni(cekme, ctx, true, L));
      hesaplar.push(...cekmeHesap(cekme, L));
      durum = cekmeDurum(cekme, ctx, L);
      const hat = L.net(ctx, cekme.hatlar[0]);
      ek = cekme.yon === "yukari" ? L.t(` · ${hat} yukarı çekme`, ` · ${hat} pull-up`) : L.t(` · ${hat} aşağı çekme`, ` · ${hat} pull-down`);
    }
    if (rc) {
      const r = rcMetni(rc, ctx, p, L);
      gorev.push(...r.gorev);
      hesaplar.push(...r.hesap);
      ilgili.push({ ref: rc.kondansator.ref, neden: `RC: ${L.farad(rc.farad)}` });
      if (rc.pot) ilgili.push({ ref: rc.pot.ref, neden: L.t("seri trimpot", "series trimpot") });
    }
    const a = L.net(ctx, p.pins[0]?.net ?? -1);
    const b = L.net(ctx, p.pins[1]?.net ?? -1);
    if (!gorev.length) gorev.push(L.t(`${p.role}: ${a} ile ${b} arasında.`, `${p.role}: between ${a} and ${b}.`));
    else gorev.unshift(`${p.role}.`);
  }
  const film = d.film === "metal"
    ? L.t("metal film, mavi gövde, 5 bant", "metal film, blue body, 5 bands")
    : L.t("karbon film, bej gövde, 4 bant", "carbon film, beige body, 4 bands");
  return {
    tur: `${L.tur("direnc")} (${film}, ¼ W)`,
    deger: L.t(`${L.ohm(d.ohm)} ± %${L.sayi(d.tolerans)}`, `${L.ohm(d.ohm)} ± ${L.sayi(d.tolerans)}%`),
    ozet: `${L.ohm(d.ohm)} (${renkler})${ek}`,
    gorev,
    hesaplar,
    durum,
    ilgili,
  };
}

function diziAciklama(p: PassivePlace, ctx: PasifBaglam, d: Extract<PasifDeger, { tur: "dizi" }>, L: Yazi): Aciklama {
  const c = cekmeDirenci(p);
  const com = L.net(ctx, pinNet(p, 1));
  const gorev = [
    `${p.role}.`,
    L.t(
      `İçeride ${d.adet} direnç var: hepsinin bir ucu noktalı 1. pine (ortak uç) bağlı bir baraya, öbür uçları 2–${d.adet + 1}. pinlere çıkar. Ortak uç burada ${com}: ${c?.yon === "yukari" ? "her hat yukarı (1'e) çekilir" : c?.yon === "asagi" ? "her hat aşağı (0'a) çekilir" : "bağlı"}. Sekiz ayrı direnç yerine tek parça: daha az lehim, daha az yer.`,
      `Inside are ${d.adet} resistors: one end of each goes to a common bus on the dotted pin 1 (the common pin), and the other ends come out on pins 2–${d.adet + 1}. Here the common pin is on ${com}: ${c?.yon === "yukari" ? "every line is pulled up (to 1)" : c?.yon === "asagi" ? "every line is pulled down (to 0)" : "connected"}. One part instead of eight separate resistors: less soldering, less space.`,
    ),
    L.t(
      `Kod ${d.kod}: A = ortak uçlu (bussed) dizi, ${L.kod(d.kod.slice(1, 4), "Ω")}, J = ± %5. Takarken noktalı uç ortak hatta (${com}) gelmeli; ters takılırsa bir sinyal hattı besleme olur.`,
      `Code ${d.kod}: A = bussed network, ${L.kod(d.kod.slice(1, 4), "Ω")}, J = ± 5%. When you insert it, the dotted end must go to the common line (${com}); inserted backwards, a signal line becomes a power line.`,
    ),
  ];
  if (c) gorev.push(...cekmeMetni(c, ctx, false, L).slice(1));
  const cekmeAdi = c ? (c.yon === "yukari" ? L.t("VCC'ye çekme", "pull-up to VCC") : L.t("GND'ye çekme", "pull-down to GND")) : L.t("dizi", "network");
  return {
    tur: `${L.tur("dizi")}, ${d.adet} × ${L.ohm(d.ohm)}`,
    deger: `${d.adet} × ${L.ohm(d.ohm)} · ${d.kod}`,
    ozet: `${d.adet} × ${L.ohm(d.ohm)} (${d.kod}) · ${cekmeAdi} · ${p.role}`,
    gorev,
    hesaplar: c
      ? [...cekmeHesap(c, L), { ad: L.t(`${d.adet} hat birden`, `All ${d.adet} lines at once`), formul: `${d.adet} × ${L.akim(VCC / c.ohm)}`, sonuc: `= ${L.akim((d.adet * VCC) / c.ohm)} ${L.t("(ortak uçtan)", "(through the common pin)")}` }]
      : [],
    durum: c ? cekmeDurum(c, ctx, L) : undefined,
    ilgili: [],
  };
}

function seramikAciklama(p: PassivePlace, ctx: PasifBaglam, d: Extract<PasifDeger, { tur: "seramik" }>, L: Yazi): Aciklama {
  const chipRef = p.chip ?? /^(U\d+)\b/.exec(p.role)?.[1];
  const ci = chipRef ? ctx.find(chipRef)?.chip : undefined;
  const gorev: string[] = [];
  const hesaplar: Hesap[] = [{ ad: L.t("Kodun okunuşu", "Reading the code"), formul: L.kod(d.kod, "pF"), sonuc: `= ${L.sayi(d.farad * 1e6, 3)} µF` }];
  const ilgili: Aciklama["ilgili"] = [];
  if (ci) {
    const vcc = ci.pins.find((q) => q.net === VCCNET && /VCC|VDD/.test(q.name))?.num ?? "?";
    const gnd = ci.pins.find((q) => q.net === GND && /GND|VSS/.test(q.name))?.num ?? "?";
    gorev.push(
      L.t(
        `${ci.ref} (${ci.part}) entegresinin dekuplaj kondansatörü: VCC (${vcc}) ve GND (${gnd}) bacakları arasında, çipin hemen yanında.`,
        `Decoupling capacitor for ${ci.ref} (${ci.part}): between its VCC (${vcc}) and GND (${gnd}) pins, right next to the chip.`,
      ),
      L.t(
        "Çipin çıkışları değişirken nanosaniyelik akım darbeleri çekilir. Besleme kablosunun endüktansı bu hızlı akımı veremez: VCC çöker, GND zıplar, flip-floplar yanlış tetiklenir. 100 nF çipin yanındaki küçük depodur, darbeyi o karşılar. Kural: her entegreye bir tane, bacaklarına olabildiğince yakın, bacakları kısa.",
        "When the chip's outputs switch, they draw current pulses lasting nanoseconds. The inductance of the power wiring cannot deliver such fast current: VCC sags, GND bounces, and flip-flops trigger falsely. The 100 nF is a small reservoir next to the chip that supplies the pulse. Rule: one per chip, as close to its pins as possible, with short legs.",
      ),
    );
    hesaplar.push(
      { ad: L.t("8 çıkış aynı anda değişince yük", "Charge when 8 outputs switch at once"), formul: "Q = 8 × 50 pF × 5 V", sonuc: "= 2 nC" },
      { ad: L.t("Kondansatör verirse", "If the capacitor supplies it"), formul: "ΔV = Q / C = 2 nC / 100 nF", sonuc: L.t("≈ 20 mV (zararsız)", "≈ 20 mV (harmless)") },
      {
        ad: L.t("10 cm tel verirse (≈ 100 nH)", "If 10 cm of wire supplies it (≈ 100 nH)"),
        formul: L.t("V = L · di/dt = 100 nH × 0,3 A / 5 ns", "V = L · di/dt = 100 nH × 0.3 A / 5 ns"),
        sonuc: L.t("≈ 6 V sıçrama: besleme çöker", "≈ 6 V spike: the supply collapses"),
      },
    );
    ilgili.push({ ref: ci.ref, neden: L.t(`${ci.part}, dekuple ettiği çip`, `${ci.part}, the chip it decouples`) });
  } else {
    const rc = rcCifti(p, ctx);
    if (rc) {
      const r = rcMetni(rc, ctx, p, L);
      gorev.push(`${p.role}.`, ...r.gorev);
      hesaplar.push(...r.hesap);
      ilgili.push({ ref: rc.direnc.ref, neden: `RC: ${L.ohm(rc.ohm)}` });
      if (rc.pot) ilgili.push({ ref: rc.pot.ref, neden: L.t("seri trimpot", "series trimpot") });
    } else gorev.push(`${p.role}.`);
  }
  gorev.push(L.t(
    `Kutupsuzdur: iki yönde de takılır. Gövdedeki "${d.kod}" kodu pF cinsindendir: iki rakam ve arkasına eklenecek sıfır sayısı.`,
    `It has no polarity: it fits either way round. The "${d.kod}" code on the body is in pF: two digits and the number of zeros to append.`,
  ));
  return {
    tur: `${L.tur("kondansator")} (${L.t("disk", "disc")}, ${d.volt} V)`,
    deger: `${L.farad(d.farad)} · ${L.t("kod", "code")} ${d.kod}`,
    ozet: `${L.farad(d.farad)} (${d.kod}) · ${ci ? L.t(`${ci.ref} dekuplajı`, `${ci.ref} decoupling`) : p.role}`,
    gorev,
    hesaplar,
    ilgili,
  };
}

function elektrolitikAciklama(p: PassivePlace, ctx: PasifBaglam, d: Extract<PasifDeger, { tur: "elektrolitik" }>, L: Yazi): Aciklama {
  const plus = pinNet(p, 1);
  const minus = pinNet(p, 2);
  const gorev: string[] = [`${p.role}.`];
  const hesaplar: Hesap[] = [];
  const ilgili: Aciklama["ilgili"] = [];
  const rc = rcCifti(p, ctx);
  if (rc) {
    const r = rcMetni(rc, ctx, p, L);
    gorev.push(...r.gorev);
    hesaplar.push(...r.hesap);
    ilgili.push({ ref: rc.direnc.ref, neden: `RC: ${L.ohm(rc.ohm)}` });
  } else if (plus === VCCNET && minus === GND) {
    gorev.push(L.t(
      "Kartın besleme girişindeki büyük depo. 100 nF'lar nanosaniyelik darbeleri karşılar; bu ise kartın toplam akımındaki yavaş (mikrosaniye–milisaniye) değişimleri ve uzun besleme kablosunun düşümünü dengeler. Kural: her kartın (her breadboard'un) besleme rayına bir tane.",
      "The large reservoir at the board's power input. The 100 nF capacitors handle the nanosecond pulses; this one evens out the slow (microsecond to millisecond) changes in the board's total current and the drop along the long power cable. Rule: one on the power rail of every board (every breadboard).",
    ));
    hesaplar.push({
      ad: L.t("1 ms boyunca 50 mA fazladan akım", "50 mA extra current for 1 ms"),
      formul: "ΔV = I · t / C = 50 mA × 1 ms / 100 µF",
      sonuc: L.t("= 0,5 V (kablo yetişene kadar)", "= 0.5 V (until the cable catches up)"),
    });
  }
  gorev.push(
    L.t(
      `Kutupludur: gövdedeki açık renk şerit (− işaretleri) eksi bacağı gösterir, uzun bacak artıdır. Burada + (pin 1) ${L.net(ctx, plus)}, − (pin 2) ${L.net(ctx, minus)}. Ters takılırsa ısınır, şişer, patlayabilir.`,
      `It is polarized: the light stripe on the body (− marks) shows the negative leg, and the long leg is positive. Here + (pin 1) is ${L.net(ctx, plus)} and − (pin 2) is ${L.net(ctx, minus)}. Inserted backwards it heats up, swells and can burst.`,
    ),
    L.t(`Gerilim değeri hattın en az iki katı olmalı: 5 V için ${d.volt} V.`, `Its voltage rating should be at least twice the rail: ${d.volt} V for 5 V.`),
  );
  return {
    tur: `${L.tur("elektrolitik")}, ${L.t("kutuplu", "polarized")}`,
    deger: `${L.farad(d.farad)} · ${d.volt} V`,
    ozet: L.t(`${L.farad(d.farad)} ${d.volt} V elektrolitik · ${p.role} · şerit = −`, `${L.farad(d.farad)} ${d.volt} V electrolytic · ${p.role} · stripe = −`),
    gorev,
    hesaplar,
    ilgili,
  };
}

function osilatorAciklama(p: PassivePlace, d: Extract<PasifDeger, { tur: "osilator" }>, L: Yazi): Aciklama {
  const hz = d.hz ?? 8e6;
  const gorev = [L.t(
    `${p.role}. İçinde kuvars kristal ve osilatör devresi var: 8. bacaktan 5 V'luk kare dalga çıkar. Metal kılıfın sivri köşesi (ve noktası) 1. bacaktır; DIP-14 yuvasının yalnız 4 bacağı vardır: 1 EN (boşta ya da 1 = çalışır), 7 GND, 8 OUT, 14 VCC.`,
    `${p.role}. Inside are a quartz crystal and an oscillator circuit: a 5 V square wave comes out of pin 8. The sharp corner (and the dot) of the metal can marks pin 1; of the DIP-14 footprint, only 4 pins are present: 1 EN (open or 1 = running), 7 GND, 8 OUT, 14 VCC.`,
  )];
  const hesaplar: Hesap[] = [{ ad: L.t("Periyot", "Period"), formul: `T = 1 / f = 1 / ${L.frekans(hz)}`, sonuc: `= ${L.sayi(1e9 / hz, 1)} ns` }];
  if (d.hz === null) {
    gorev.push(L.t(
      "İlk kurulumda 8 MHz tak (CPU 1 MHz); tasarım hedefi 32 MHz (CPU 4 MHz). CPU saati osilatörün sekizde biridir: Johnson sayacı 8 durumu gezer.",
      "Fit 8 MHz for the first build (CPU 1 MHz); the design target is 32 MHz (CPU 4 MHz). The CPU clock is one eighth of the oscillator: the Johnson counter steps through 8 states.",
    ));
    hesaplar.push({ ad: L.t("CPU saati", "CPU clock"), formul: "8 MHz / 8", sonuc: "= 1 MHz" });
  } else {
    gorev.push(L.t("VGA'nın 640 × 480 @ 60 Hz kipi: bir satır 800 piksel saati, bir kare 525 satır.", "VGA's 640 × 480 @ 60 Hz mode: one line is 800 pixel clocks, one frame 525 lines."));
    hesaplar.push(
      { ad: L.t("Satır süresi", "Line time"), formul: `800 / ${L.frekans(hz)}`, sonuc: `≈ ${L.sayi((800 / hz) * 1e6, 2)} µs` },
      { ad: L.t("Kare hızı", "Frame rate"), formul: `${L.frekans(hz)} / (800 × 525)`, sonuc: `≈ ${L.sayi(hz / 800 / 525, 2)} Hz` },
    );
  }
  return {
    tur: `${L.tur("osilator")} (${L.t("DIP-14 metal kılıf", "DIP-14 metal can")})`,
    deger: d.hz === null ? L.t("8 MHz (ilk kurulum) · hedef 32 MHz", "8 MHz (first build) · target 32 MHz") : L.frekans(hz),
    ozet: `${d.hz === null ? "8 MHz" : L.frekans(hz)} ${L.t("osilatör", "oscillator")} · ${p.role}`,
    gorev,
    hesaplar,
    ilgili: [],
  };
}

/** "OTOMATİK (1) / ADIM (0)" → { 1: "OTOMATİK", 0: "ADIM" } */
function anahtarAdlari(role: string): Record<number, string> | null {
  const m = /^(.*?)\s*\(1\)\s*\/\s*(.*?)\s*\(0\)/.exec(role);
  return m ? { 1: m[1], 0: m[2] } : null;
}

/** Pasifin açıklaması seçili dilde (görev metinleri kartın Türkçe parça görevini, p.role, içerir) */
export function pasifAciklamasi(p: PassivePlace, ctx: PasifBaglam, dil: Dil = "tr"): Aciklama {
  const L = dilde(dil);
  const d = pasifDegeri(p.part);
  if (p.kind === "led") return ledAciklama(p, ctx, L);
  if (d?.tur === "direnc") return direncAciklama(p, ctx, d, L);
  if (d?.tur === "dizi") return diziAciklama(p, ctx, d, L);
  if (d?.tur === "seramik") return seramikAciklama(p, ctx, d, L);
  if (d?.tur === "elektrolitik") return elektrolitikAciklama(p, ctx, d, L);
  if (d?.tur === "osilator") return osilatorAciklama(p, d, L);
  const { ad: title, kullanim } = parcaAdi(p.part, dil);
  if (p.kind === "buton") {
    const n1 = pinNet(p, 1);
    const n2 = pinNet(p, 2);
    const sig = isPower(n1) ? n2 : n1;
    const hat = L.net(ctx, sig);
    const rc = sig >= 0 ? (ctx.ends.get(sig) ?? []).map((e) => passiveOf(ctx, e)).find((x) => x && isCap(x)) : undefined;
    const lv = ctx.level(sig);
    return {
      tur: `${L.tur("buton")} (6 mm, ${L.t("anlık", "momentary")})`,
      deger: L.t("basılıyken kapalı", "closed while pressed"),
      ozet: L.t(`${p.role} · basınca ${hat} → GND`, `${p.role} · press: ${hat} → GND`),
      gorev: [
        L.t(
          `${p.role}: basılıyken ${hat} hattını GND'ye bağlar; bırakınca hat çekme direnciyle 1'e döner.${rc ? ` ${rc.ref} kontak sıçramasını süzer.` : ""}`,
          `${p.role}: while pressed it connects the ${hat} line to GND; when released, the pull-up resistor brings the line back to 1.${rc ? ` ${rc.ref} filters the contact bounce.` : ""}`,
        ),
        L.t(
          "6 mm butonun dört bacağı vardır: aynı kenardaki iki bacak içeride hep bağlıdır, basınca iki çift birleşir. Breadboard'da ortadaki kanalın üstüne tak; emin değilsen multimetrenin süreklilik kipiyle bak.",
          "A 6 mm button has four legs: the two legs on the same side are always connected inside, and pressing joins the two pairs. On the breadboard, place it across the center channel; if you are unsure, check with a multimeter's continuity mode.",
        ),
      ],
      hesaplar: [],
      durum: {
        ton: "bilgi",
        metin: `${L.t("Şu an", "Now")} ${hat} = ${SEVIYE_KISA[lv]}${lv === 0 ? L.t(" (basılı ya da kondansatör boş)", " (pressed, or the capacitor is empty)") : lv === 1 ? L.t(" (bırakılmış)", " (released)") : ""}.`,
      },
      ilgili: rc ? [{ ref: rc.ref, neden: L.t("sıçrama süzgeci / RC", "debounce filter / RC") }] : [],
    };
  }
  if (p.kind === "anahtar") {
    const c = pinNet(p, 2);
    const hat = L.net(ctx, c);
    const adlar = anahtarAdlari(p.role);
    const lv = ctx.level(c);
    const a = L.net(ctx, pinNet(p, 1));
    const b = L.net(ctx, pinNet(p, 3));
    return {
      tur: `${L.tur("anahtar")} (${L.t("1 kutup, 2 konum", "single pole, 2 positions")})`,
      deger: adlar ? `${adlar[1]} / ${adlar[0]}` : "SPDT",
      ozet: `${p.role}${adlar && (lv === 0 || lv === 1) ? ` · ${L.t("şu an", "now")} ${adlar[lv]}` : ""}`,
      gorev: [L.t(
        `Ortadaki bacak (C) sürgünün konumuna göre A'ya ya da B'ye bağlanır. A = ${a}, B = ${b}: ${hat} hattı 1 ya da 0 olur. Sürgülü anahtar konumunu korur; buton gibi bırakınca geri dönmez.`,
        `The middle leg (C) connects to A or B depending on the slider position. A = ${a}, B = ${b}: the ${hat} line becomes 1 or 0. A slide switch stays where you put it; it does not spring back like a button.`,
      )],
      hesaplar: [],
      durum: { ton: "bilgi", metin: `${L.t("Şu an", "Now")} ${hat} = ${SEVIYE_KISA[lv]}${adlar && (lv === 0 || lv === 1) ? `: ${adlar[lv]}` : ""}.` },
      ilgili: [],
    };
  }
  if (d?.tur === "pot") {
    return {
      tur: `${L.tur("pot")}, ${L.ohm(d.ohm)}`,
      deger: `${L.ohm(d.ohm)} · ${L.t("kod", "code")} ${d.kod}`,
      ozet: `${L.ohm(d.ohm)} trimpot (${d.kod}) · ${p.role}`,
      gorev: [
        L.t(
          `${p.role}. Uçlar 1 ve 3 arasında sabit ${L.ohm(d.ohm)} var; orta uç (W, silecek) bunun üstünde kayar. Burada W ve 3 birleşik: iki uçlu ayarlı direnç (reosta) gibi 0 … ${L.ohm(d.ohm)}. Küçük tornavidayla çevrilir.`,
          `${p.role}. There is a fixed ${L.ohm(d.ohm)} between ends 1 and 3; the middle terminal (W, the wiper) slides along it. Here W and 3 are joined, so it works as a two-terminal variable resistor (rheostat), 0 … ${L.ohm(d.ohm)}. You turn it with a small screwdriver.`,
        ),
        L.t(`Üstündeki kod ${d.kod}: ${L.kod(d.kod, "Ω")}.`, `The code on top is ${d.kod}: ${L.kod(d.kod, "Ω")}.`),
      ],
      hesaplar: [],
      ilgili: [],
    };
  }
  if (p.kind === "konnektor") {
    const pins = p.pins.filter((q) => q.net > 1);
    const high = pins.filter((q) => ctx.level(q.net) === 1).length;
    let ac = `${title}.`;
    if (p.edge) {
      ac = L.t(
        "Arka panel konnektörü (2 × 32, 2,54 mm): kartın bütün ortak sinyalleri (adres, veri, saat, reset, durum, besleme) buradan geçer; her kartta pin düzeni aynıdır, böylece kartlar arka panelde aynı adlı hatları paylaşır. Besleme pinleri birden fazladır (GND 1, 2, 62, 64; VCC 3, 4, 63): akım birkaç pine bölünür.",
        "Backplane connector (2 × 32, 2.54 mm): all the board's shared signals (address, data, clock, reset, status, power) pass through here. The pinout is the same on every board, so the boards share the lines of the same name on the backplane. There are several power pins (GND 1, 2, 62, 64; VCC 3, 4, 63), so the current is split over a few pins.",
      );
    } else if (/VGA/.test(p.part)) {
      ac = L.t(
        "VGA (DE-15) konnektörü: 1 R, 2 G, 3 B (0–0,7 V, monitörde 75 Ω'a), 13 HSYNC, 14 VSYNC, GND 5–8 ve 10. Renkler direnç DAC'ından gelir.",
        "VGA (DE-15) connector: 1 R, 2 G, 3 B (0–0.7 V into 75 Ω in the monitor), 13 HSYNC, 14 VSYNC, GND 5–8 and 10. The colors come from the resistor DAC.",
      );
    } else if (/PS2/.test(p.part)) {
      ac = L.t(
        "PS/2 klavye konnektörü (6 pin mini-DIN): 1 DATA, 3 GND, 4 +5 V, 5 CLK. Saat ve veri hatları açık kollektördür: iki taraf da yalnız 0'a çeker, 1'i 10 kΩ çekme dirençleri verir.",
        "PS/2 keyboard connector (6-pin mini-DIN): 1 DATA, 3 GND, 4 +5 V, 5 CLK. The clock and data lines are open collector: both sides only pull to 0, and the 10 kΩ pull-up resistors provide the 1.",
      );
    } else if (/CH340/.test(p.part)) {
      ac = L.t(
        "CH340 USB-UART modülünün 6 pinlik yuvası (FTDI düzeni): GND, ~CTS, VCC, TXD, RXD, ~DTR. Modülün TXD'si kartın RX'ine, RXD'si kartın TX'ine gider.",
        "6-pin socket for the CH340 USB-UART module (FTDI layout): GND, ~CTS, VCC, TXD, RXD, ~DTR. The module's TXD goes to the board's RX, and its RXD to the board's TX.",
      );
    }
    return {
      tur: L.tur("konnektor"),
      deger: `${p.pins.length} ${L.t("pin", "pins")}`,
      ozet: `${title} · ${pins.length} ${L.t("sinyal", pins.length === 1 ? "signal" : "signals")}`,
      gorev: [ac],
      hesaplar: [],
      durum: { ton: "bilgi", metin: L.t(`Şu an ${pins.length} sinyal pininin ${high}'i 1.`, `Now ${high} of the ${pins.length} signal pins are 1.`) },
      ilgili: [],
    };
  }
  if (p.kind === "dip") return dipAciklama(p, ctx, L);
  if (p.kind === "gosterge") return gostergeAciklama(p, ctx, L);
  if (p.kind === "cubuk") return cubukAciklama(p, ctx, L);
  const iso = p.kind === "dipdizi" ? isoDizi(p.part) : null;
  if (iso) return isoDiziAciklama(p, ctx, iso, L);
  return { tur: L.tur(p.kind), deger: undefined, ozet: `${title} · ${p.role}`, gorev: [`${p.role}.`, kullanim].filter(Boolean), hesaplar: [], ilgili: [] };
}

/** Kırmızı segmentin akımı (gösterge ve dizi panelleri) */
function segmentHesabi(ohm: number, L: Yazi): Hesap {
  const vf = LED_RENKLERI.kirmizi.vf;
  const I = ledAkimi(VCC, vf, ohm);
  return {
    ad: L.t("Segment akımı", "Segment current"),
    formul: `I = (5 V − ${L.v(vf, 1)}) / ${L.ohm(ohm)}`,
    sonuc: L.t(`≈ ${L.akim(I)} · “8” gösterirken 7 segment ≈ ${L.akim(7 * I)}`, `≈ ${L.akim(I)} · showing "8", 7 segments ≈ ${L.akim(7 * I)}`),
  };
}

function dipAciklama(p: PassivePlace, ctx: PasifBaglam, L: Yazi): Aciklama {
  const sw = dipAnahtarlari(p, ctx.level);
  const n = p.pins.length;
  const bitler = sw.map((s) => (s.acik ? "1" : "0")).join("");
  const on = sw.filter((s) => s.acik).map((s) => s.no);
  // OFF iken girişi 0'a çeken direnç dizisi
  const cekme = sw.flatMap((s) => others(ctx, s.net, p.ref).map((e) => passiveOf(ctx, e))).find((x) => x && cekmeDirenci(x)) ?? null;
  const c = cekme ? cekmeDirenci(cekme) : null;
  const liste = sw.map((s) => `${s.no} → ${L.net(ctx, s.net)}`).join(", ");
  return {
    tur: `${L.tur("dip")} (${L.t(`${sw.length}'li`, `${sw.length}-position`)})`,
    deger: `${sw.length} ${L.t("anahtar", "switches")} · ON = 1, OFF = 0`,
    ozet: `${p.role} · ${bitler}`,
    gorev: [
      `${p.role}.`,
      L.t(
        `Her anahtar karşılıklı iki bacağı birleştirir: k. anahtar k. ve ${n + 1} − k. bacak (1. anahtar 1 ve ${n}. bacak). Bir uç VCC'de, öbür uç girişe gider: ON iken giriş 5 V'a bağlanır (1), OFF iken ${c ? `${L.ohm(c.ohm)} çekme direnci` : "çekme direnci"} girişi 0'a çeker.`,
        `Each switch joins two opposite pins: switch k joins pins k and ${n + 1} − k (switch 1 joins pins 1 and ${n}). One end is on VCC and the other goes to an input: when ON the input is connected to 5 V (1), when OFF ${c ? `the ${L.ohm(c.ohm)} pull-down resistor` : "the pull-down resistor"} pulls it to 0.`,
      ),
      L.t(`Anahtarlar: ${liste}. 3D'de anahtarın sürgüsüne tıklayınca konumu değişir.`, `Switches: ${liste}. In 3D, click a switch's slider to flip it.`),
    ],
    hesaplar: c ? [{ ad: L.t("ON iken çekme direncinden akım", "Current through the pull-down when ON"), formul: `I = 5 V / ${L.ohm(c.ohm)}`, sonuc: `= ${L.akim(VCC / c.ohm)}` }] : [],
    durum: {
      ton: "bilgi",
      metin: L.t(`Şu an ${on.length ? `ON: ${on.join(", ")}` : "hepsi OFF"} · soldan sağa ${bitler}.`, `Now ${on.length ? `ON: ${on.join(", ")}` : "all OFF"} · left to right ${bitler}.`),
    },
    ilgili: cekme ? [{ ref: cekme.ref, neden: L.t("çekme dirençleri (OFF = 0)", "pull-down resistors (OFF = 0)") }] : [],
  };
}

function gostergeAciklama(p: PassivePlace, ctx: PasifBaglam, L: Yazi): Aciklama {
  const seg = segmentNetleri(p, ctx.ends, ctx.find);
  const yanan = seg.filter((s) => s.net >= 0 && ctx.level(s.net) === 1).map((s) => s.seg);
  const kar = segmentKarakteri(yanan);
  const bagli = seg.filter((s) => s.net >= 0);
  const drv = bagli.length ? netDriver(ctx, bagli[0].net) : null;
  // segment bacağıyla sürücü arasındaki direnç (dizi ya da tek direnç)
  const ilk = bagli[0] ? pinNet(p, bagli[0].pin) : -1;
  const dir = ilk >= 0 ? others(ctx, ilk, p.ref).map((e) => passiveOf(ctx, e)).find((x) => x && (x.kind === "dipdizi" || x.kind === "direnc")) ?? null : null;
  const ohm = dir ? (isoDizi(dir.part)?.ohm ?? ohmOf(dir)) : null;
  const ilgili: Aciklama["ilgili"] = [];
  if (drv) ilgili.push({ ref: drv.ref, neden: `${L.t("sürücü", "driver")} (${drv.part})` });
  if (dir) ilgili.push({ ref: dir.ref, neden: dir.kind === "dipdizi" ? L.t("segment dirençleri", "segment resistors") : L.t("segment direnci", "segment resistor") });
  return {
    tur: `${L.tur("gosterge")} (${L.t("ortak katot", "common cathode")})`,
    deger: L.t(`0,56" tek hane · ${bagli.length} segment bağlı`, `0.56" single digit · ${bagli.length} segments connected`),
    ozet: `${p.role} · ${yanan.length ? L.t(`“${kar}” gösteriyor`, `showing "${kar}"`) : L.t("sönük", "off")}`,
    gorev: [
      `${p.role}.`,
      L.t(
        "Bir gövdede sekiz LED: a … g segmentleri ve nokta (DP). Katotları içeride birleşik, 3. ve 8. bacaktan GND'ye; bir segment, anoduna direnç üzerinden 1 gelince yanar.",
        "Eight LEDs in one body: segments a … g and the dot (DP). Their cathodes are joined inside and go to GND through pins 3 and 8; a segment lights when its anode gets a 1 through a resistor.",
      ),
      L.t(
        `Bacaklar: 1 e, 2 d, 3 ortak katot, 4 c, 5 DP, 6 b, 7 a, 8 ortak katot, 9 f, 10 g (alt sırada soldan 1 … 5, üstte sağdan 6 … 10).${drv ? ` Segmentleri ${drv.ref} (${drv.part}) sürer: BCD haneyi segment desenine çevirir.` : ""}`,
        `Pins: 1 e, 2 d, 3 common cathode, 4 c, 5 DP, 6 b, 7 a, 8 common cathode, 9 f, 10 g (bottom row 1 … 5 from the left, top row 6 … 10 from the right).${drv ? ` ${drv.ref} (${drv.part}) drives the segments: it turns the BCD digit into a segment pattern.` : ""}`,
      ),
    ],
    hesaplar: ohm ? [segmentHesabi(ohm, L)] : [],
    durum: yanan.length
      ? { ton: "yanik", metin: L.t(`YANIYOR: ${yanan.join(" ")} → “${kar}”.`, `ON: ${yanan.join(" ")} → "${kar}".`) }
      : { ton: "sonuk", metin: L.t("SÖNÜK: hiçbir segment yanmıyor (baştaki sıfır söndürüldü ya da grup sönük).", "OFF: no segment is lit (a blanked leading zero, or the whole group is dark).") },
    ilgili,
  };
}

/** Bir segment LED'inin (çubuk ya da gösterge) akımı, rengiyle; `birlikte`: seçili dilde "0xFF iken" */
function segmentAkimi(ohm: number, renk: LedRenk, adet: number, birlikte: string, L: Yazi): Hesap {
  const vf = LED_RENKLERI[renk].vf;
  const I = ledAkimi(VCC, vf, ohm);
  return {
    ad: L.t("Segment akımı", "Segment current"),
    formul: `I = (5 V − ${L.v(vf, 1)}) / ${L.ohm(ohm)}`,
    sonuc: L.t(`≈ ${L.akim(I)} · ${birlikte} ${adet} segment ≈ ${L.akim(adet * I)}`, `≈ ${L.akim(I)} · ${birlikte}, ${adet} segments ≈ ${L.akim(adet * I)}`),
  };
}

function isoDiziAciklama(p: PassivePlace, ctx: PasifBaglam, d: { ohm: number; adet: number }, L: Yazi): Aciklama {
  const kod = ucHaneliKod(d.ohm);
  // dizinin yaktığı gösterge: bacaklarından birine bağlı 7 segment ya da çubuk gösterge
  const hedef = p.pins.flatMap((q) => (q.net > 1 ? others(ctx, q.net, p.ref) : [])).map((e) => passiveOf(ctx, e)).find((x) => x && (x.kind === "gosterge" || x.kind === "cubuk")) ?? null;
  const gorev = [
    `${p.role}.`,
    L.t(
      `İçeride ${d.adet} ayrı direnç: k. direnç k. ve ${p.pins.length + 1} − k. bacak arasında, birbirine bağlı değil (yalıtılmış). Kod ${kod}: ${L.kod(kod, "Ω")}. Çip gibi DIP-16 sokete takılır; 1. bacak çentik / nokta tarafında.`,
      `Inside are ${d.adet} separate resistors: resistor k sits between pins k and ${p.pins.length + 1} − k, not connected to each other (isolated). Code ${kod}: ${L.kod(kod, "Ω")}. It goes into a DIP-16 socket like a chip; pin 1 is on the notch / dot side.`,
    ),
  ];
  const hesaplar: Hesap[] = [];
  if (hedef?.kind === "cubuk") {
    gorev.push(L.t(
      `Sinyal ile çubuk göstergenin (${hedef.ref}) segmenti arasında: 1–8. bacaklar sinyallerde, 16–9. bacaklar segment anotlarında. Her segment LED'inin akımını sınırlar; LED'ler doğrudan sinyale bağlansa çıkışı aşırı yükler, seviyesini bozardı.`,
      `Between each signal and a segment of the bar graph (${hedef.ref}): pins 1–8 on the signals, pins 16–9 on the segment anodes. It limits the current of each segment LED; connected straight to the signal, the LEDs would overload the output and spoil its level.`,
    ));
    hesaplar.push(segmentAkimi(d.ohm, hedef.led ?? "sari", 8, L.t("bayt 0xFF iken", "with the byte at 0xFF"), L));
  } else {
    gorev.push(L.t(
      `Sürücünün (74HC4511) her segment çıkışı ile göstergenin${hedef ? ` (${hedef.ref})` : ""} o segmenti arasında: LED'in akımını sınırlar.`,
      `Between each segment output of the driver (74HC4511) and that segment of the display${hedef ? ` (${hedef.ref})` : ""}: it limits the LED current.`,
    ));
    hesaplar.push(segmentHesabi(d.ohm, L));
  }
  return {
    tur: `${L.tur("dipdizi")}, ${d.adet} × ${L.ohm(d.ohm)}`,
    deger: `${d.adet} × ${L.ohm(d.ohm)} · ${L.t("üstünde", "marked")} 4116R-1-${kod}`,
    ozet: `${d.adet} × ${L.ohm(d.ohm)} (4116R ${kod}) · ${p.role}`,
    gorev,
    hesaplar,
    ilgili: hedef ? [{ ref: hedef.ref, neden: hedef.kind === "cubuk" ? L.t("çubuk gösterge", "bar graph") : L.t("7 segment gösterge", "7-segment display") }] : [],
  };
}

// ---------------------------------------------------------------- çubuk gösterge

export interface CubukSegmenti {
  /** 1 … 10: soldan sağa; 1. segment bit 0 */
  no: number;
  /** anot bacağı k, katot bacağı 21 − k */
  anotPin: number;
  katotPin: number;
  anot: number;
  katot: number;
  /** segmenti yakan net: anot dizinin direnciyle bir sinyale bağlıysa o sinyal (etkinNet), boşsa −1 */
  net: number;
}

/** Çubuk göstergenin on segmenti: k. segmentin anodu k. bacak, katodu (21 − k). bacak */
export function cubukSegmentleri(p: PassivePlace, ends: Map<number, Endpoint[]>, find: PasifBaglam["find"]): CubukSegmenti[] {
  return Array.from({ length: 10 }, (_, i) => {
    const no = i + 1;
    const anot = pinNet(p, no);
    const katot = pinNet(p, 21 - no);
    return { no, anotPin: no, katotPin: 21 - no, anot, katot, net: anot < 0 || katot < 0 ? -1 : etkinNet(ends, find, anot) };
  });
}

/** Segment yanıyor mu: sinyali 1, katodu GND (ya da 0) */
export const cubukSegmentYanik = (s: CubukSegmenti, level: (net: number) => Seviye): boolean =>
  s.net >= 0 && level(s.net) === 1 && (s.katot === GND || level(s.katot) === 0);

/** Çubuğun gösterdiği bayt: k. segment bit k − 1 (boş segment 0) */
export function cubukDegeri(seg: readonly CubukSegmenti[], level: (net: number) => Seviye): number {
  return seg.slice(0, 8).reduce((acc, s) => acc | (cubukSegmentYanik(s, level) ? 1 << (s.no - 1) : 0), 0);
}

function cubukAciklama(p: PassivePlace, ctx: PasifBaglam, L: Yazi): Aciklama {
  const seg = cubukSegmentleri(p, ctx.ends, ctx.find);
  const bagli = seg.filter((s) => s.net >= 0);
  const bos = seg.filter((s) => s.net < 0).map((s) => s.no);
  const renk = p.led ?? "sari";
  const drv = bagli.length ? netDriver(ctx, bagli[0].net) : null;
  const dir = bagli.length ? others(ctx, bagli[0].anot, p.ref).map((e) => passiveOf(ctx, e)).find((x) => x && (x.kind === "dipdizi" || x.kind === "direnc")) ?? null : null;
  const ohm = dir ? (isoDizi(dir.part)?.ohm ?? ohmOf(dir)) : null;
  const deger = cubukDegeri(seg, ctx.level);
  const ikili = deger.toString(2).padStart(8, "0");
  const okunus = `${ikili.slice(0, 4)} ${ikili.slice(4)} = 0x${deger.toString(16).toUpperCase().padStart(2, "0")} = ${deger}`;
  const yanan = seg.filter((s) => cubukSegmentYanik(s, ctx.level)).map((s) => s.no);
  const belirsiz = bagli.filter((s) => ctx.level(s.net) > 1);
  const ilgili: Aciklama["ilgili"] = [];
  if (dir) ilgili.push({ ref: dir.ref, neden: dir.kind === "dipdizi" ? L.t("segment dirençleri", "segment resistors") : L.t("segment direnci", "segment resistor") });
  if (drv) ilgili.push({ ref: drv.ref, neden: `${L.t("sürücü", "driver")} (${drv.part})` });
  const durum: Durum = bagli.length && belirsiz.length === bagli.length
    ? { ton: "bilgi", metin: `${L.net(ctx, bagli[0].net)} … = ${SEVIYE_KISA[ctx.level(bagli[0].net)]}: ${L.t("simülasyon henüz bu hatları sürmedi.", "the simulation has not driven these lines yet.")}` }
    : yanan.length
      ? { ton: "yanik", metin: L.t(`YANIYOR: ${yanan.join(", ")}. segment · değer ${okunus}.`, `ON: segments ${yanan.join(", ")} · value ${okunus}.`) }
      : { ton: "sonuk", metin: L.t("SÖNÜK: bütün bitler 0 (değer 0).", "OFF: all bits 0 (value 0).") };
  if (belirsiz.length && belirsiz.length < bagli.length) durum.metin += L.t(` ${belirsiz.map((s) => L.net(ctx, s.net)).join(", ")} Z ya da X: sönük çizildi.`, ` ${belirsiz.map((s) => L.net(ctx, s.net)).join(", ")} Z or X: drawn as off.`);
  const segmentler = bagli.map((s) => `${s.no} ${L.net(ctx, s.net)}`).join(", ");
  return {
    tur: `${L.tur("cubuk")}, ${L.led(renk)}`,
    deger: `DIP-20 · ${bagli.length} ${L.t("segment bağlı", "segments connected")}`,
    ozet: `${p.role.replace(/: çubuk gösterge$/, "")} · ${belirsiz.length === bagli.length && bagli.length ? L.t("sürülmüyor", "not driven") : okunus}`,
    gorev: [
      `${p.role}.`,
      L.t(
        "Bir gövdede yan yana on ayrı LED (segment). k. segmentin anodu k. bacak, katodu (21 − k). bacak: alt sırada 1–10 anotlar soldan sağa, üst sırada 20–11 katotlar. Katotlar GND'de; bir segment, anoduna direnç üzerinden 1 gelince yanar. 1. bacak gövdenin yazılı / çentikli köşesinde.",
        "Ten separate LEDs (segments) side by side in one body. Segment k has its anode on pin k and its cathode on pin (21 − k): anodes 1–10 along the bottom row from left to right, cathodes 20–11 along the top. The cathodes are on GND; a segment lights when its anode gets a 1 through a resistor. Pin 1 is at the labeled / notched corner of the body.",
      ),
      L.t(
        `Segmentler: ${segmentler}${bos.length ? `; ${bos.join(", ")}. segment boş` : ""}. Soldan sağa 1. segment bit 0: yanan segment 1, sönük 0; bayt ikili olarak bir bakışta okunur (James Sharman'ın ve Ben Eater'ın breadboard bilgisayarlarındaki gibi).`,
        `Segments: ${segmentler}${bos.length ? `; ${bos.length === 1 ? "segment" : "segments"} ${bos.join(", ")} unused` : ""}. From the left, segment 1 is bit 0: a lit segment is 1 and a dark one 0, so you can read the byte in binary at a glance (as on James Sharman's and Ben Eater's breadboard computers).`,
      ),
      ...(drv
        ? [L.t(
          `Sinyali ${drv.ref} (${drv.part}) sürer. Segment başına ≈ 3 mA, 74HC çıkışının sınırının (±25 mA) çok altında: göstergeyi takmak sinyalin seviyesini bozmaz.`,
          `${drv.ref} (${drv.part}) drives the signal. About 3 mA per segment, far below the 74HC output limit (±25 mA), so adding the display does not spoil the signal level.`,
        )]
        : []),
    ],
    hesaplar: ohm ? [segmentAkimi(ohm, renk, 8, L.t("0xFF iken", "at 0xFF"), L)] : [],
    durum,
    ilgili,
  };
}
