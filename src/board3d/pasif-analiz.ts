// Bir pasif elemanın kartta ne iş yaptığı: LED'in seri direnci ve onu süren sinyal, çekme
// dirençleri, RC çiftleri, dekuplaj kondansatörünün çipi, VGA DAC'ı. Saf fonksiyonlar: 3D sahne
// (LED'in yanması), bilgi paneli ve ipucu metni bunları kullanır; testler de.

import type { ChipPlace, PassivePlace } from "../../cpu16/board/layout";
import {
  LED_RENK_KURALLARI, LED_RENKLERI, PASSIVES, type LedRenk,
} from "../../cpu16/board/passives";
import {
  VCC, akimMetni, direncBantlari, direncGucu, faradMetni, frekansMetni, gucMetni, kodAcilimi, ledAkimi, ohmMetni, pasifDegeri, rcSabiti, sayi,
  sureMetni, type PasifDeger,
} from "../../cpu16/board/pasif-bilgi";
import { chip as chipDef } from "../../cpu16/chips/library";
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
 * Simülasyon dirençlerin değerini bilmez: yalnız pasiflere bağlı bir net (ör. LED'in anodu) Z görünür.
 * Böyle bir net tek bir iki uçlu dirençle çipin sürdüğü bir nete bağlıysa onun seviyesini taşır
 * (akım akmıyorsa iki uç aynı gerilimde; LED yanarken anot ≈ Vf, yine "1" sayılır).
 */
export function etkinNet(ends: Map<number, Endpoint[]>, find: PasifBaglam["find"], n: number): number {
  if (n <= 1) return n;
  const list = ends.get(n) ?? [];
  if (list.some((e) => e.kind === "chip")) return n;
  let out = -1;
  for (const e of list) {
    if (e.kind !== "passive") continue;
    const r = find(e.ref)?.passive;
    if (!r || r.kind !== "direnc" || r.pins.length !== 2) continue;
    if (out >= 0) return n;
    out = r.pins.find((q) => q.num !== e.num)?.net ?? -1;
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
  /** LED'i yakan sinyal: anodu süren çip yoksa seri direncin öbür ucu */
  sinyal: number;
  direnc: PassivePlace | null;
  ohm: number | null;
}

/** LED'in yandığı net: anot netini süren çip yoksa, anoda bağlı direncin öbür ucu (sinyal → R → LED) */
export function ledSignal(p: PassivePlace, ends: Map<number, Endpoint[]>, find: PasifBaglam["find"]): number {
  return ledDevresi(p, { ends, find }).sinyal;
}

export function ledDevresi(p: PassivePlace, ctx: Pick<PasifBaglam, "ends" | "find">): LedDevresi {
  const anot = pinNet(p, 1);
  const katot = pinNet(p, 2);
  const out: LedDevresi = { renk: p.led ?? "kirmizi", anot, katot, sinyal: anot, direnc: null, ohm: null };
  if (anot < 0) return out;
  const list = ctx.ends.get(anot) ?? [];
  for (const e of list) {
    if (e.kind !== "passive" || e.ref === p.ref) continue;
    const r = ctx.find(e.ref)?.passive;
    if (r && r.pins.length === 2 && r.kind === "direnc") {
      out.direnc = r;
      out.ohm = ohmOf(r);
      if (!list.some((x) => x.kind === "chip")) out.sinyal = r.pins.find((q) => q.num !== e.num)?.net ?? -1;
      break;
    }
  }
  return out;
}

/** LED yanıyor mu: sinyal 1 ve katot 0 */
export const ledYanik = (d: LedDevresi, level: (net: number) => Seviye): boolean =>
  d.sinyal >= 0 && level(d.sinyal) === 1 && (d.katot === GND || level(d.katot) === 0);

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
  /** elemanın türü, Türkçe */
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

export const TUR_ADI: Record<PassivePlace["kind"], string> = {
  direnc: "Direnç",
  dizi: "Direnç dizisi (SIP-9)",
  kondansator: "Seramik kondansatör",
  elektrolitik: "Elektrolitik kondansatör",
  led: "LED (ışık yayan diyot)",
  konnektor: "Konnektör",
  osilator: "Kristal osilatör",
  buton: "Basmalı buton",
  anahtar: "Sürgülü anahtar",
  pot: "Trimpot (ayarlı direnç)",
  modul: "Modül",
  dip: "DIP anahtar",
  gosterge: "7 segment gösterge",
  dipdizi: "Direnç dizisi (DIP-16, yalıtılmış)",
};

const v = (x: number, b = 2) => `${sayi(x, b)} V`;
const net = (ctx: PasifBaglam, n: number) => (n < 0 ? "bağlı değil" : ctx.netName(n));
const chipLabel = (e: Endpoint) => `${e.ref}.${e.name}`;

function ledAciklama(p: PassivePlace, ctx: PasifBaglam): Aciklama {
  const d = ledDevresi(p, ctx);
  const info = LED_RENKLERI[d.renk];
  const kural = LED_RENK_KURALLARI.find((k) => k.renk === d.renk && k.desen.test(p.role));
  const I = ledAkimiOf(d);
  const sig = net(ctx, d.sinyal);
  const drv = d.sinyal >= 0 ? netDriver(ctx, d.sinyal) : null;
  const gorev = [
    `${p.role}: ${sig} sinyali 1 olunca akım ${sig}${d.direnc ? ` → ${d.direnc.ref}` : ""} → ${p.ref} → GND yolundan akar ve LED yanar; 0 olunca söner.`,
    `Renk: ${info.ad}${kural ? `, çünkü ${kural.neden}` : ""}. Kutup: anot (+, uzun bacak) pin 1 → ${net(ctx, d.anot)}; katot (−, kısa bacak, flanşın düz kenarı) pin 2 → ${net(ctx, d.katot)}.`,
  ];
  const hesaplar: Hesap[] = [];
  if (I !== null && d.ohm) {
    const [lo, hi] = info.vfAralik;
    hesaplar.push(
      { ad: "LED akımı", formul: `I = (5 V − ${v(info.vf, 1)}) / ${ohmMetni(d.ohm)}`, sonuc: `≈ ${akimMetni(I)}` },
      { ad: `Vf aralığı ${sayi(lo)}–${sayi(hi)} V`, formul: `I = ${akimMetni(ledAkimi(VCC, hi, d.ohm))} … ${akimMetni(ledAkimi(VCC, lo, d.ohm))}`, sonuc: "3 mm LED en çok 20 mA" },
      { ad: `${d.direnc!.ref} dirençteki güç`, formul: `P = I² · R = (${akimMetni(I)})² · ${ohmMetni(d.ohm)}`, sonuc: `≈ ${gucMetni(direncGucu(I, d.ohm))} (¼ W direnç için çok az)` },
    );
    gorev.push("74HC çıkışı bu akımda ≈ 0,2–0,4 V düşer; gerçek akım hesaptakinden biraz azdır. Bir 74HC çıkışından en çok ±25 mA çekilir, LED için 5–10 mA yeterince parlak.");
  }
  let durum: Durum;
  const lv = d.sinyal >= 0 ? ctx.level(d.sinyal) : 3;
  if (lv === 1) {
    durum = { ton: "yanik", metin: `YANIYOR: ${sig} = 1${drv ? ` (${chipLabel(drv)} çıkışı yüksek)` : ""}.` };
    if (/CLK/.test(sig) && (ctx.hz ?? 0) > 30) durum.metin += " Hızlı saatte LED saniyede onlarca kez yanıp söner; göz ortalamasını görür, yarı parlak yanar.";
  } else if (lv === 0) durum = { ton: "sonuk", metin: `SÖNÜK: ${sig} = 0${drv ? ` (${chipLabel(drv)} çıkışı düşük)` : ""}.` };
  else durum = { ton: "bilgi", metin: `${sig} = ${SEVIYE_KISA[lv]}: simülasyon henüz bu hattı sürmedi.` };
  if (d.direnc && d.sinyal !== d.anot) {
    durum.metin += ` Simülasyonda dirençlerin değeri yok: ${net(ctx, d.anot)} neti Z görünür; parlaklık direncin öbür ucundaki ${sig}'den hesaplanır.`;
  }
  return {
    tur: TUR_ADI.led,
    deger: `${info.ad}, 3 mm · Vf ≈ ${v(info.vf, 1)}`,
    ozet: `${info.ad} LED · ${p.role.replace(/ LED'i$/, "")}${I !== null ? ` · ≈ ${akimMetni(I)}` : ""} · ${ledYanik(d, ctx.level) ? "yanıyor" : "sönük"}`,
    gorev,
    hesaplar,
    durum,
    ilgili: d.direnc ? [{ ref: d.direnc.ref, neden: `seri direnç (${ohmMetni(d.ohm!)})` }] : [],
  };
}

function cekmeMetni(c: Cekme, ctx: PasifBaglam, tek: boolean): string[] {
  const hedef = c.yon === "yukari" ? "1'e (VCC, 5 V)" : "0'a (GND)";
  const ters = c.yon === "yukari" ? "0" : "1";
  const hat = tek ? `${net(ctx, c.hatlar[0])} hattını` : `${c.hatlar.length} hattı`;
  return [
    `Çekme direnci (${c.yon === "yukari" ? "pull-up" : "pull-down"}): kimse sürmediğinde ${hat} ${hedef} çeker. Bir çıkış hattı ${ters} sürünce direnç onu ezmez, çünkü ${ohmMetni(c.ohm)} çıkışın birkaç on ohm'luk iç direncine göre çok büyüktür.`,
    "Direnç olmasa: CMOS girişi boşta kalır (yüzen giriş). Seviyesi belirsizdir; parmağın, komşu telin parazitiyle 0 ile 1 arasında gidip gelir, giriş katı yarı iletimde kalıp akım çeker, çip ısınabilir.",
  ];
}

function cekmeHesap(c: Cekme): Hesap[] {
  const I = VCC / c.ohm;
  const yon = c.yon === "yukari" ? "0'a" : "1'e";
  return [
    { ad: `Hat ${yon} sürülünce akım`, formul: `I = 5 V / ${ohmMetni(c.ohm)}`, sonuc: `= ${akimMetni(I)}` },
    { ad: "Dirençteki güç", formul: `P = V² / R = 25 / ${ohmMetni(c.ohm)}`, sonuc: `= ${gucMetni(VCC * VCC / c.ohm)}` },
  ];
}

function cekmeDurum(c: Cekme, ctx: PasifBaglam): Durum {
  const lv = c.hatlar.map((n) => ctx.level(n));
  const aktif = lv.filter((x) => x === (c.yon === "yukari" ? 0 : 1)).length;
  if (c.hatlar.length === 1) {
    const l = lv[0];
    if (l === (c.yon === "yukari" ? 0 : 1)) return { ton: "bilgi", metin: `Şu an ${net(ctx, c.hatlar[0])} = ${l}: hattı bir çıkış (ya da buton) sürüyor, direnç üzerinden ${akimMetni(VCC / c.ohm)} akıyor.` };
    if (l === 0 || l === 1) return { ton: "bilgi", metin: `Şu an ${net(ctx, c.hatlar[0])} = ${l}: direncin iki ucu aynı gerilimde, akım yok.` };
    return { ton: "uyari", metin: `Şu an ${net(ctx, c.hatlar[0])} = ${SEVIYE_KISA[l]}.` };
  }
  const bir = lv.filter((x) => x === 1).length;
  const sifir = lv.filter((x) => x === 0).length;
  const akim = aktif ? `${aktif} dirençten akım akıyor (toplam ${akimMetni((aktif * VCC) / c.ohm)}).` : "Hepsi dinlenme seviyesinde: hiçbir dirençten akım akmıyor.";
  return { ton: "bilgi", metin: `Şu an ${c.hatlar.length} hattın ${bir}'i 1, ${sifir}'i 0. ${akim}` };
}

function rcMetni(rc: RcCifti, ctx: PasifBaglam, p: PassivePlace): { gorev: string[]; hesap: Hesap[] } {
  const role = `${rc.direnc.role} ${rc.kondansator.role}`;
  const tau = { ad: "Zaman sabiti", formul: `τ = R · C = ${ohmMetni(rc.ohm)} · ${faradMetni(rc.farad)}`, sonuc: `= ${sureMetni(rc.tau)}` };
  if (rc.pot) {
    const potOhm = ohmOf(rc.pot) ?? 0;
    const lo = 1 / rcSabiti(rc.ohm, rc.farad);
    const hi = 1 / rcSabiti(rc.ohm + potOhm, rc.farad);
    return {
      gorev: [`Yavaş osilatör: 74HC14 Schmitt evirici, ${rc.direnc.ref} + ${rc.pot.ref} ve ${rc.kondansator.ref}. Kondansatör direnç üzerinden dolar ve boşalır; gerilimi Schmitt'in iki eşiği arasında gidip geldikçe çıkış kare dalga verir. Trimpotu çevirmek R'yi, dolayısıyla frekansı değiştirir.`],
      hesap: [
        { ad: "Direnç aralığı", formul: `R = ${ohmMetni(rc.ohm)} + (0 … ${ohmMetni(potOhm)})`, sonuc: `${ohmMetni(rc.ohm)} … ${ohmMetni(rc.ohm + potOhm)}` },
        { ad: "Frekans (yaklaşık)", formul: `f ≈ 1 / (R · C)`, sonuc: `${frekansMetni(hi)} … ${frekansMetni(lo)}` },
        { ad: "CPU saati (osilatör / 8)", formul: `f / 8`, sonuc: `${frekansMetni(hi / 8)} … ${frekansMetni(lo / 8)}` },
      ],
    };
  }
  if (/reset/i.test(role)) {
    return {
      gorev: [
        `Açılış reseti: güç gelince ${rc.kondansator.ref} boştur (0 V), ${net(ctx, rc.net)} 0'dır ve bilgisayar resette bekler. ${rc.kondansator.ref}, ${rc.direnc.ref} üzerinden dolar; gerilim 74HC14'ün eşiğini (≈ 2,5–3 V) geçince reset biter. RESET butonu kondansatörü boşaltıp aynı şeyi tekrarlar.`,
      ],
      hesap: [tau, { ad: "Eşiğe varış (≈ 0,7 τ)", formul: "t ≈ 0,7 · τ", sonuc: `≈ ${sureMetni(0.7 * rc.tau)}` }],
    };
  }
  if (/sıçrama|buton/i.test(role)) {
    return {
      gorev: [
        `Buton sıçrama (bounce) süzgeci: mekanik kontak basılınca birkaç milisaniye açılıp kapanır. ${rc.kondansator.ref} hızlı sıçramaları yutar, gerilim ancak τ mertebesinde değişir; 74HC14'ün Schmitt girişi tek temiz kenar verir.`,
      ],
      hesap: [tau],
    };
  }
  return { gorev: [`${p.ref}, ${rc.direnc.ref === p.ref ? rc.kondansator.ref : rc.direnc.ref} ile bir RC devresi kurar (${net(ctx, rc.net)}).`], hesap: [tau] };
}

function direncAciklama(p: PassivePlace, ctx: PasifBaglam, d: Extract<PasifDeger, { tur: "direnc" }>): Aciklama {
  const bantlar = direncBantlari(d.ohm, d.tolerans);
  const renkler = bantlar.map((b) => b.ad).join("-");
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
    gorev.push(
      `${led.ref} (${info.ad} LED) için akım sınırlayıcı. LED bir diyottur: ileri gerilimi (Vf ≈ ${v(info.vf, 1)}) aşılınca akımı neredeyse yalnız devredeki direnç sınırlar. Direnç olmasa 74HC çıkışı ile LED aşırı akım çeker, ikisi de zarar görür.`,
      `Seri bağlantı: ${net(ctx, ld.sinyal)} → ${p.ref} → ${led.ref} → GND. Direnç LED'in önünde ya da arkasında olabilir, akım aynıdır.`,
    );
    if (I !== null) {
      hesaplar.push(
        { ad: "Dirençteki gerilim", formul: `V_R = 5 V − Vf = 5 V − ${v(info.vf, 1)}`, sonuc: `= ${v(VCC - info.vf, 1)}` },
        { ad: "LED akımı (Ohm yasası)", formul: `I = V_R / R = ${v(VCC - info.vf, 1)} / ${ohmMetni(d.ohm)}`, sonuc: `≈ ${akimMetni(I)}` },
        { ad: "Dirençteki güç", formul: "P = I² · R", sonuc: `≈ ${gucMetni(direncGucu(I, d.ohm))}` },
      );
      ek = ` · ${led.ref} için ≈ ${akimMetni(I)}`;
    }
    ilgili.push({ ref: led.ref, neden: `${info.ad} LED` });
    const lv = ctx.level(ld.sinyal);
    durum = lv === 1
      ? { ton: "yanik", metin: `Şu an ${net(ctx, ld.sinyal)} = 1: direncin üzerinden ≈ ${akimMetni(I ?? 0)} akıyor, ${led.ref} yanıyor.` }
      : lv === 0
        ? { ton: "sonuk", metin: `Şu an ${net(ctx, ld.sinyal)} = 0: akım yok, ${led.ref} sönük.` }
        : { ton: "bilgi", metin: `Şu an ${net(ctx, ld.sinyal)} = ${SEVIYE_KISA[lv]}.` };
  } else if (dac) {
    const sira = dac.girisler.slice().sort((a, b) => a.ohm - b.ohm);
    gorev.push(
      `VGA renk DAC'ı, ${dac.kanal} kanal: ${sira.map((g) => `${g.direnc.ref} (${ohmMetni(g.ohm)}, ${net(ctx, g.net)})`).join(" ve ")} monitörün 75 Ω'luk girişine bağlanır. Dirençler ve 75 Ω bir gerilim bölücüdür: hangi bitler 1 ise o dirençlerden akım akar, monitör 0–0,7 V arasında bir parlaklık görür.`,
      `Küçük direnç (680 Ω) renk bitidir, büyüğü (1,3 kΩ) parlaklık biti: ağırlıkları ≈ 2/3 ve 1/3. %1 metal film önerilir (mavi gövde, 5 bant).`,
    );
    const combos = [[0, 0], [0, 1], [1, 0], [1, 1]] as const;
    for (const [a, b] of combos) {
      if (sira.length < 2) break;
      const lvl = (n: number) => (n === sira[0].net ? a : n === sira[1].net ? b : 0);
      hesaplar.push({ ad: `renk ${a}, parlaklık ${b}`, formul: "V = Σ(Vᵢ/Rᵢ) / (Σ 1/Rᵢ + 1/75 Ω)", sonuc: `≈ ${v(dacVolts(sira.map((g) => ({ net: g.net, ohms: g.ohm })), lvl))}` });
    }
    const now = dacVolts(sira.map((g) => ({ net: g.net, ohms: g.ohm })), (n) => ctx.level(n));
    durum = { ton: "bilgi", metin: `Şu an ${dac.kanal} pinde ≈ ${v(now)} (${sira.map((g) => `${net(ctx, g.net)} = ${SEVIYE_KISA[ctx.level(g.net)]}`).join(", ")}).` };
    ilgili.push({ ref: dac.konnektor.ref, neden: "VGA konnektörü" }, ...sira.filter((g) => g.direnc.ref !== p.ref).map((g) => ({ ref: g.direnc.ref, neden: "aynı kanal" })));
    ek = ` · ${dac.kanal} DAC`;
  } else {
    if (cekme) {
      gorev.push(...cekmeMetni(cekme, ctx, true));
      hesaplar.push(...cekmeHesap(cekme));
      durum = cekmeDurum(cekme, ctx);
      ek = ` · ${net(ctx, cekme.hatlar[0])} ${cekme.yon === "yukari" ? "yukarı" : "aşağı"} çekme`;
    }
    if (rc) {
      const r = rcMetni(rc, ctx, p);
      gorev.push(...r.gorev);
      hesaplar.push(...r.hesap);
      ilgili.push({ ref: rc.kondansator.ref, neden: `RC: ${faradMetni(rc.farad)}` });
      if (rc.pot) ilgili.push({ ref: rc.pot.ref, neden: "seri trimpot" });
    }
    if (!gorev.length) gorev.push(`${p.role}: ${net(ctx, p.pins[0]?.net ?? -1)} ile ${net(ctx, p.pins[1]?.net ?? -1)} arasında.`);
    else gorev.unshift(`${p.role}.`);
  }
  // her iki ucu da sürülüyorsa akım
  return {
    tur: `${TUR_ADI.direnc} (${d.film === "metal" ? "metal film, mavi gövde, 5 bant" : "karbon film, bej gövde, 4 bant"}, ¼ W)`,
    deger: `${ohmMetni(d.ohm)} ± %${sayi(d.tolerans)}`,
    ozet: `${ohmMetni(d.ohm)} (${renkler})${ek}`,
    gorev,
    hesaplar,
    durum,
    ilgili,
  };
}

function diziAciklama(p: PassivePlace, ctx: PasifBaglam, d: Extract<PasifDeger, { tur: "dizi" }>): Aciklama {
  const c = cekmeDirenci(p);
  const com = pinNet(p, 1);
  const gorev = [
    `${p.role}.`,
    `İçeride ${d.adet} direnç var: hepsinin bir ucu noktalı 1. pine (ortak uç) bağlı bir baraya, öbür uçları 2–${d.adet + 1}. pinlere çıkar. Ortak uç burada ${net(ctx, com)}: ${c?.yon === "yukari" ? "her hat yukarı (1'e) çekilir" : c?.yon === "asagi" ? "her hat aşağı (0'a) çekilir" : "bağlı"}. Sekiz ayrı direnç yerine tek parça: daha az lehim, daha az yer.`,
    `Kod ${d.kod}: A = ortak uçlu (bussed) dizi, ${kodAcilimi(d.kod.slice(1, 4), "Ω")}, J = ± %5. Takarken noktalı uç ortak hatta (${net(ctx, com)}) gelmeli; ters takılırsa bir sinyal hattı besleme olur.`,
  ];
  if (c) gorev.push(...cekmeMetni(c, ctx, false).slice(1));
  return {
    tur: `${TUR_ADI.dizi}, ${d.adet} × ${ohmMetni(d.ohm)}`,
    deger: `${d.adet} × ${ohmMetni(d.ohm)} · ${d.kod}`,
    ozet: `${d.adet} × ${ohmMetni(d.ohm)} (${d.kod}) · ${c ? (c.yon === "yukari" ? "VCC'ye çekme" : "GND'ye çekme") : "dizi"} · ${p.role}`,
    gorev,
    hesaplar: c ? [...cekmeHesap(c), { ad: `${d.adet} hat birden`, formul: `${d.adet} × ${akimMetni(VCC / c.ohm)}`, sonuc: `= ${akimMetni((d.adet * VCC) / c.ohm)} (ortak uçtan)` }] : [],
    durum: c ? cekmeDurum(c, ctx) : undefined,
    ilgili: [],
  };
}

function seramikAciklama(p: PassivePlace, ctx: PasifBaglam, d: Extract<PasifDeger, { tur: "seramik" }>): Aciklama {
  const chipRef = p.chip ?? /^(U\d+)\b/.exec(p.role)?.[1];
  const ci = chipRef ? ctx.find(chipRef)?.chip : undefined;
  const gorev: string[] = [];
  const hesaplar: Hesap[] = [{ ad: "Kodun okunuşu", formul: kodAcilimi(d.kod, "pF"), sonuc: `= ${sayi(d.farad * 1e6, 3)} µF` }];
  const ilgili: Aciklama["ilgili"] = [];
  if (ci) {
    const vcc = ci.pins.find((q) => q.net === VCCNET && /VCC|VDD/.test(q.name));
    const gnd = ci.pins.find((q) => q.net === GND && /GND|VSS/.test(q.name));
    gorev.push(
      `${ci.ref} (${ci.part}) entegresinin dekuplaj kondansatörü: VCC (${vcc?.num ?? "?"}) ve GND (${gnd?.num ?? "?"}) bacakları arasında, çipin hemen yanında.`,
      "Çipin çıkışları değişirken nanosaniyelik akım darbeleri çekilir. Besleme kablosunun endüktansı bu hızlı akımı veremez: VCC çöker, GND zıplar, flip-floplar yanlış tetiklenir. 100 nF çipin yanındaki küçük depodur, darbeyi o karşılar. Kural: her entegreye bir tane, bacaklarına olabildiğince yakın, bacakları kısa.",
    );
    hesaplar.push(
      { ad: "8 çıkış aynı anda değişince yük", formul: "Q = 8 × 50 pF × 5 V", sonuc: "= 2 nC" },
      { ad: "Kondansatör verirse", formul: "ΔV = Q / C = 2 nC / 100 nF", sonuc: "≈ 20 mV (zararsız)" },
      { ad: "10 cm tel verirse (≈ 100 nH)", formul: "V = L · di/dt = 100 nH × 0,3 A / 5 ns", sonuc: "≈ 6 V sıçrama: besleme çöker" },
    );
    ilgili.push({ ref: ci.ref, neden: `${ci.part}, dekuple ettiği çip` });
  } else {
    const rc = rcCifti(p, ctx);
    if (rc) {
      const r = rcMetni(rc, ctx, p);
      gorev.push(`${p.role}.`, ...r.gorev);
      hesaplar.push(...r.hesap);
      ilgili.push({ ref: rc.direnc.ref, neden: `RC: ${ohmMetni(rc.ohm)}` });
      if (rc.pot) ilgili.push({ ref: rc.pot.ref, neden: "seri trimpot" });
    } else gorev.push(`${p.role}.`);
  }
  gorev.push(`Kutupsuzdur: iki yönde de takılır. Gövdedeki "${d.kod}" kodu pF cinsindendir: iki rakam ve arkasına eklenecek sıfır sayısı.`);
  return {
    tur: `${TUR_ADI.kondansator} (disk, ${d.volt} V)`,
    deger: `${faradMetni(d.farad)} · kod ${d.kod}`,
    ozet: `${faradMetni(d.farad)} (${d.kod}) · ${ci ? `${ci.ref} dekuplajı` : p.role}`,
    gorev,
    hesaplar,
    ilgili,
  };
}

function elektrolitikAciklama(p: PassivePlace, ctx: PasifBaglam, d: Extract<PasifDeger, { tur: "elektrolitik" }>): Aciklama {
  const plus = pinNet(p, 1);
  const minus = pinNet(p, 2);
  const gorev: string[] = [`${p.role}.`];
  const hesaplar: Hesap[] = [];
  const ilgili: Aciklama["ilgili"] = [];
  const rc = rcCifti(p, ctx);
  if (rc) {
    const r = rcMetni(rc, ctx, p);
    gorev.push(...r.gorev);
    hesaplar.push(...r.hesap);
    ilgili.push({ ref: rc.direnc.ref, neden: `RC: ${ohmMetni(rc.ohm)}` });
  } else if (plus === VCCNET && minus === GND) {
    gorev.push("Kartın besleme girişindeki büyük depo. 100 nF'lar nanosaniyelik darbeleri karşılar; bu ise kartın toplam akımındaki yavaş (mikrosaniye–milisaniye) değişimleri ve uzun besleme kablosunun düşümünü dengeler. Kural: her kartın (her breadboard'un) besleme rayına bir tane.");
    hesaplar.push({ ad: "1 ms boyunca 50 mA fazladan akım", formul: "ΔV = I · t / C = 50 mA × 1 ms / 100 µF", sonuc: "= 0,5 V (kablo yetişene kadar)" });
  }
  gorev.push(
    `Kutupludur: gövdedeki açık renk şerit (− işaretleri) eksi bacağı gösterir, uzun bacak artıdır. Burada + (pin 1) ${net(ctx, plus)}, − (pin 2) ${net(ctx, minus)}. Ters takılırsa ısınır, şişer, patlayabilir.`,
    `Gerilim değeri hattın en az iki katı olmalı: 5 V için ${d.volt} V.`,
  );
  return {
    tur: `${TUR_ADI.elektrolitik}, kutuplu`,
    deger: `${faradMetni(d.farad)} · ${d.volt} V`,
    ozet: `${faradMetni(d.farad)} ${d.volt} V elektrolitik · ${p.role} · şerit = −`,
    gorev,
    hesaplar,
    ilgili,
  };
}

function osilatorAciklama(p: PassivePlace, d: Extract<PasifDeger, { tur: "osilator" }>): Aciklama {
  const hz = d.hz ?? 8e6;
  const gorev = [
    `${p.role}. İçinde kuvars kristal ve osilatör devresi var: 8. bacaktan 5 V'luk kare dalga çıkar. Metal kılıfın sivri köşesi (ve noktası) 1. bacaktır; DIP-14 yuvasının yalnız 4 bacağı vardır: 1 EN (boşta ya da 1 = çalışır), 7 GND, 8 OUT, 14 VCC.`,
  ];
  const hesaplar: Hesap[] = [{ ad: "Periyot", formul: `T = 1 / f = 1 / ${frekansMetni(hz)}`, sonuc: `= ${sayi(1e9 / hz, 1)} ns` }];
  if (d.hz === null) {
    gorev.push("İlk kurulumda 8 MHz tak (CPU 1 MHz); tasarım hedefi 32 MHz (CPU 4 MHz). CPU saati osilatörün sekizde biridir: Johnson sayacı 8 durumu gezer.");
    hesaplar.push({ ad: "CPU saati", formul: "8 MHz / 8", sonuc: "= 1 MHz" });
  } else {
    gorev.push("VGA'nın 640 × 480 @ 60 Hz kipi: bir satır 800 piksel saati, bir kare 525 satır.");
    hesaplar.push({ ad: "Satır süresi", formul: `800 / ${frekansMetni(hz)}`, sonuc: `≈ ${sayi((800 / hz) * 1e6, 2)} µs` }, { ad: "Kare hızı", formul: `${frekansMetni(hz)} / (800 × 525)`, sonuc: `≈ ${sayi(hz / 800 / 525, 2)} Hz` });
  }
  return { tur: `${TUR_ADI.osilator} (DIP-14 metal kılıf)`, deger: d.hz === null ? "8 MHz (ilk kurulum) · hedef 32 MHz" : frekansMetni(hz), ozet: `${d.hz === null ? "8 MHz" : frekansMetni(hz)} osilatör · ${p.role}`, gorev, hesaplar, ilgili: [] };
}

/** "OTOMATİK (1) / ADIM (0)" → { 1: "OTOMATİK", 0: "ADIM" } */
function anahtarAdlari(role: string): Record<number, string> | null {
  const m = /^(.*?)\s*\(1\)\s*\/\s*(.*?)\s*\(0\)/.exec(role);
  return m ? { 1: m[1], 0: m[2] } : null;
}

export function pasifAciklamasi(p: PassivePlace, ctx: PasifBaglam): Aciklama {
  const d = pasifDegeri(p.part);
  if (p.kind === "led") return ledAciklama(p, ctx);
  if (d?.tur === "direnc") return direncAciklama(p, ctx, d);
  if (d?.tur === "dizi") return diziAciklama(p, ctx, d);
  if (d?.tur === "seramik") return seramikAciklama(p, ctx, d);
  if (d?.tur === "elektrolitik") return elektrolitikAciklama(p, ctx, d);
  if (d?.tur === "osilator") return osilatorAciklama(p, d);
  const title = PASSIVES[p.part]?.title ?? p.part;
  if (p.kind === "buton") {
    const n1 = pinNet(p, 1);
    const n2 = pinNet(p, 2);
    const sig = isPower(n1) ? n2 : n1;
    const rc = sig >= 0 ? (ctx.ends.get(sig) ?? []).map((e) => passiveOf(ctx, e)).find((x) => x && isCap(x)) : undefined;
    const lv = ctx.level(sig);
    return {
      tur: `${TUR_ADI.buton} (6 mm, anlık)`,
      deger: "basılıyken kapalı",
      ozet: `${p.role} · basınca ${net(ctx, sig)} → GND`,
      gorev: [
        `${p.role}: basılıyken ${net(ctx, sig)} hattını GND'ye bağlar; bırakınca hat çekme direnciyle 1'e döner.${rc ? ` ${rc.ref} kontak sıçramasını süzer.` : ""}`,
        "6 mm butonun dört bacağı vardır: aynı kenardaki iki bacak içeride hep bağlıdır, basınca iki çift birleşir. Breadboard'da ortadaki kanalın üstüne tak; emin değilsen multimetrenin süreklilik kipiyle bak.",
      ],
      hesaplar: [],
      durum: { ton: "bilgi", metin: `Şu an ${net(ctx, sig)} = ${SEVIYE_KISA[lv]}${lv === 0 ? " (basılı ya da kondansatör boş)" : lv === 1 ? " (bırakılmış)" : ""}.` },
      ilgili: rc ? [{ ref: rc.ref, neden: "sıçrama süzgeci / RC" }] : [],
    };
  }
  if (p.kind === "anahtar") {
    const c = pinNet(p, 2);
    const adlar = anahtarAdlari(p.role);
    const lv = ctx.level(c);
    return {
      tur: `${TUR_ADI.anahtar} (1 kutup, 2 konum)`,
      deger: adlar ? `${adlar[1]} / ${adlar[0]}` : "SPDT",
      ozet: `${p.role}${adlar && (lv === 0 || lv === 1) ? ` · şu an ${adlar[lv]}` : ""}`,
      gorev: [`Ortadaki bacak (C) sürgünün konumuna göre A'ya ya da B'ye bağlanır. A = ${net(ctx, pinNet(p, 1))}, B = ${net(ctx, pinNet(p, 3))}: ${net(ctx, c)} hattı 1 ya da 0 olur. Sürgülü anahtar konumunu korur; buton gibi bırakınca geri dönmez.`],
      hesaplar: [],
      durum: { ton: "bilgi", metin: `Şu an ${net(ctx, c)} = ${SEVIYE_KISA[lv]}${adlar && (lv === 0 || lv === 1) ? `: ${adlar[lv]}` : ""}.` },
      ilgili: [],
    };
  }
  if (d?.tur === "pot") {
    return {
      tur: `${TUR_ADI.pot}, ${ohmMetni(d.ohm)}`,
      deger: `${ohmMetni(d.ohm)} · kod ${d.kod}`,
      ozet: `${ohmMetni(d.ohm)} trimpot (${d.kod}) · ${p.role}`,
      gorev: [
        `${p.role}. Uçlar 1 ve 3 arasında sabit ${ohmMetni(d.ohm)} var; orta uç (W, silecek) bunun üstünde kayar. Burada W ve 3 birleşik: iki uçlu ayarlı direnç (reosta) gibi 0 … ${ohmMetni(d.ohm)}. Küçük tornavidayla çevrilir.`,
        `Üstündeki kod ${d.kod}: ${kodAcilimi(d.kod, "Ω")}.`,
      ],
      hesaplar: [],
      ilgili: [],
    };
  }
  if (p.kind === "konnektor") {
    const pins = p.pins.filter((q) => q.net > 1);
    const high = pins.filter((q) => ctx.level(q.net) === 1).length;
    let ac = `${title}.`;
    if (p.edge) ac = "Arka panel konnektörü (2 × 32, 2,54 mm): kartın bütün ortak sinyalleri (adres, veri, saat, reset, durum, besleme) buradan geçer; her kartta pin düzeni aynıdır, böylece kartlar arka panelde aynı adlı hatları paylaşır. Besleme pinleri birden fazladır (GND 1, 2, 62, 64; VCC 3, 4, 63): akım birkaç pine bölünür.";
    else if (/VGA/.test(p.part)) ac = "VGA (DE-15) konnektörü: 1 R, 2 G, 3 B (0–0,7 V, monitörde 75 Ω'a), 13 HSYNC, 14 VSYNC, GND 5–8 ve 10. Renkler direnç DAC'ından gelir.";
    else if (/PS2/.test(p.part)) ac = "PS/2 klavye konnektörü (6 pin mini-DIN): 1 DATA, 3 GND, 4 +5 V, 5 CLK. Saat ve veri hatları açık kollektördür: iki taraf da yalnız 0'a çeker, 1'i 10 kΩ çekme dirençleri verir.";
    else if (/CH340/.test(p.part)) ac = "CH340 USB-UART modülünün 6 pinlik yuvası (FTDI düzeni): GND, ~CTS, VCC, TXD, RXD, ~DTR. Modülün TXD'si kartın RX'ine, RXD'si kartın TX'ine gider.";
    return {
      tur: TUR_ADI.konnektor,
      deger: `${p.pins.length} pin`,
      ozet: `${title} · ${pins.length} sinyal`,
      gorev: [ac],
      hesaplar: [],
      durum: { ton: "bilgi", metin: `Şu an ${pins.length} sinyal pininin ${high}'i 1.` },
      ilgili: [],
    };
  }
  return { tur: TUR_ADI[p.kind], deger: undefined, ozet: `${title} · ${p.role}`, gorev: [`${p.role}.`, PASSIVES[p.part]?.usage ?? ""].filter(Boolean), hesaplar: [], ilgili: [] };
}
