// Kurulum planı: bir kartı fiziksel olarak kurmak için gereken her şey kart tanımından (board/*.ts)
// ve önerilen yerleşimden (board/layout.ts, 3D görünümle aynı) üretilir:
//   - çiplerin yeri, 1. pinin konumu (çentik solda), bloğu ve değeri (74AC ailesi dahil);
//   - her çipin besleme pinleri, sabit 0 / sabit 1 girişleri ve dekuplaj kondansatörü;
//   - numaralı tel listesi: her sinyal netinin karttaki uçları kısa bir zincire dizilir (en yakın
//     komşu), teller blok blok gruplanır; bir blok bitince o ana kadar kurulan blokların bütün
//     bağlantıları tamamdır (blok blok test edilebilir);
//   - sinyal sınıfları ve tel renk kodu, çip başına pin tabloları, kenar konnektörünün pin düzeni.
// Liste kurulum yönteminden bağımsızdır: breadboard'da takılacak teller, PCB'de bip testiyle
// denetlenecek bağlantılar, wire-wrap'te sarılacak teller aynı numaralarla durur.

import { partValue, type Board, type ChipInstance, type Passive } from "../board/board.ts";
import { boardLayout, cardTitle, type BoardLayout, type PassiveKind } from "../board/layout.ts";
import { BACKPLANE, PASSIVES } from "../board/passives.ts";
import { ohmMetni, pasifDegeri } from "../board/pasif-bilgi.ts";
import type { PinDir } from "../chips/types.ts";
import { DENEYLER, SADECE_SIM } from "../kit/deneyler.ts";

// ---------------------------------------------------------------- sinyal sınıfları ve renk kodu

export type SinyalSinifi = "adres" | "veri" | "secim" | "kontrol" | "saat" | "reset" | "dis";
export type UcSinifi = SinyalSinifi | "vcc" | "gnd";

export interface RenkKodu {
  sinif: UcSinifi;
  /** sınıfın adı */
  ad: string;
  /** telin rengi (siyah-beyaz baskıda da okunsun diye her yerde adıyla yazılır) */
  renk: string;
  hex: string;
  /** hangi hatlar */
  aciklama: string;
}

/** Tel renk kodu: breadboard ve wire-wrap tellerinin rengi, belgelerdeki renk kutucukları */
export const RENK_KODU: RenkKodu[] = [
  { sinif: "vcc", ad: "Besleme +5 V", renk: "kırmızı", hex: "#d62828", aciklama: "VCC rayı, çiplerin VCC bacağı, sabit 1'e bağlanan girişler" },
  { sinif: "gnd", ad: "Toprak", renk: "siyah", hex: "#1f1f1f", aciklama: "GND rayı, çiplerin GND bacağı, sabit 0'a bağlanan girişler" },
  { sinif: "adres", ad: "Adres", renk: "sarı", hex: "#f2c40f", aciklama: "A0..A15, PA14..PA19, bellek çiplerinin ve VRAM'in adres hatları, bank register'ları" },
  { sinif: "veri", ad: "Veri", renk: "mavi", hex: "#1f66cc", aciklama: "DE0..7, DO0..7, BUS0..15, register, ALU ve bellek veri hatları" },
  { sinif: "secim", ad: "Seçim ve yetki", renk: "turuncu", hex: "#f08a24", aciklama: "~CE, ~CS, ~OE, ~WE, ~MRD, ~MWE_E/O, seçici çıkışları, sürücü izinleri" },
  { sinif: "kontrol", ad: "Kontrol", renk: "yeşil", hex: "#2f9e44", aciklama: "mikrokod kelimesi, bayraklar, sayaç taşmaları ve diğer lojik hatlar" },
  { sinif: "saat", ad: "Saat", renk: "beyaz", hex: "#ffffff", aciklama: "CLK, OSC, TCLK, piksel ve karakter saati, kaydırma / mandal saatleri" },
  { sinif: "reset", ad: "Reset ve kesme", renk: "mor", hex: "#7b3fb5", aciklama: "~RESET, ~RST, RESET, IRQ, ~INT, VSYNC_REQ" },
  { sinif: "dis", ad: "Dış bağlantı", renk: "kahverengi", hex: "#8b5a2b", aciklama: "LED, buton, RC devreleri, VGA, PS/2 ve UART konnektör hatları" },
];

export const renkKodu = (s: UcSinifi): RenkKodu => RENK_KODU.find((r) => r.sinif === s)!;

/** Net adından sinyal sınıfı (tel rengi). Kart önekleri (GC_, V_, C_, M_, K_) ve "~" yok sayılır. */
export function sinyalSinifi(net: string): SinyalSinifi {
  const n = net.replace(/^~/, "");
  const s = n.replace(/^(GC|V|C|M|K)_/, "");
  if (/^(LED_|VGA_|PS\d_)|_RC$|^SLOW_FB$|^UART_(TXD|RXD)$/.test(n)) return "dis";
  if (/RESET|RST|IRQ|^INT(_|$)|VSYNC_REQ|^WAKE$/.test(s)) return "reset";
  if (/CLK|OSC|SHCP|STCP|(^|_)CP$|_CK$/.test(s) || n === "V_H2") return "saat";
  if (/^(A|PA|FA|MA|VA|ADR|RS)\d+$/.test(s) || /^BANK\d+_\d+$/.test(s)) return "adres";
  if (
    /^(CE|CS|OE|WE|WO|RD|WR)(_|\d|[A-Z]?$)/.test(s) ||
    /_(CE|CS|OE|WE|WO|EN|SEL)(_|\d|$)/.test(s) ||
    /SEL|^SRC_|^(MRD|MWE_[EO]|MWR|IO|ROE\d+)$|^OE_|_OE$/.test(s) ||
    /^[A-Z]?(CE|OE|WE)$|WE_[EO]$|^EN/.test(s) ||
    (net.startsWith("~") && /^G\d*$/.test(s))
  ) return "secim";
  if (/^(D|DE|DO|DI|BUS|FD|MD|KE|KO|CD|ATD?|CHR|RES|SUM|LOGIC|TA|TB|TD|X|Y|IMM|IR|R|RB|U|RXD|FP|CX|CY|TX)\d+$/.test(s)) return "veri";
  return "kontrol";
}

/** Belgelerde gösterilen net adı: adsız netler KiCad şemasındaki gibi N123 */
export const netGorunen = (name: string): string => (/^n\d+$/.test(name) ? `N${name.slice(1)}` : name);

// ---------------------------------------------------------------- tipler

export interface Uc {
  ref: string;
  pin: number;
  /** pin adı (çipte D0, ~OE …; pasifte +, A, COM …) */
  ad: string;
  pasif: boolean;
  /** ucun ait olduğu işlev bloğu (yapıştırıcı çipte kapının bloğu) */
  blok: string;
  /** önerilen yerleşimde pinin konumu (mm, kartın sol üst köşesine göre) */
  x: number;
  y: number;
}

/** Ucun kısa yazımı: çipte U12-3, pasifte R5.2 (deney rehberleriyle aynı) */
export const ucEtiketi = (u: Pick<Uc, "ref" | "pin" | "pasif">): string => (u.pasif ? `${u.ref}.${u.pin}` : `${u.ref}-${u.pin}`);

export interface Tel {
  /** T0001 … (kart içinde) */
  id: string;
  blok: string;
  /** blokların kurulum sırasındaki yeri (0 = besleme ve arka panel) */
  blokSira: number;
  /** gösterilen net adı */
  net: string;
  netId: number;
  sinif: SinyalSinifi;
  renk: string;
  hex: string;
  from: Uc;
  to: Uc;
  /** iki bacak arası dik açılı yol, yaklaşık (mm) */
  uzunluk: number;
}

export interface CipYeri {
  ref: string;
  /** BOM değeri (74AC ailesi için 74ACxxx) */
  deger: string;
  baslik: string;
  kilif: string;
  pinSayisi: number;
  /** 15,24 mm (geniş) DIP */
  genis: boolean;
  /** ZIF ya da soket footprint'i */
  soket: boolean;
  blok: string;
  gorev: string;
  /** gövde dikdörtgeni (mm, kart koordinatı) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 1. pinin konumu; çentik her zaman solda, 1. pin sol altta */
  pin1: { x: number; y: number };
  /** bütün pinlerin konumu */
  pins: { num: number; x: number; y: number }[];
  /** haritadaki ızgara hücresi, ör. "C4" */
  hucre: string;
  /** yapıştırıcı lojik çipinde kapıların blokları (sırayla) */
  kapilar?: { no: number; blok: string; gorev: string }[];
  dekuplaj: string[];
}

export interface PasifYeri {
  ref: string;
  part: string;
  baslik: string;
  blok: string;
  gorev: string;
  tur: PassiveKind;
  x: number;
  y: number;
  w: number;
  h: number;
  dikey: boolean;
  /** dekuplaj kondansatörünün çipi */
  cip?: string;
  /** kenar konnektörü */
  kenar?: boolean;
  hucre: string;
  pins: { num: number; x: number; y: number }[];
}

export interface BlokYeri {
  ad: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GucSatiri {
  ref: string;
  deger: string;
  kilif: string;
  blok: string;
  vcc: number[];
  gnd: number[];
  /** VCC'ye bağlanan sinyal girişleri (sabit 1) */
  sabit1: { pin: number; ad: string }[];
  /** GND'ye bağlanan sinyal girişleri (sabit 0; boş kapı girişleri dahil) */
  sabit0: { pin: number; ad: string }[];
  dekuplaj: string[];
}

export interface PasifGuc {
  ref: string;
  part: string;
  gorev: string;
  vcc: number[];
  gnd: number[];
}

export interface PinTel {
  id: string;
  /** telin öbür ucu (U40-7, J101.25 …) */
  karsi: string;
  karsiAd: string;
}

export interface PinSatiri {
  pin: number;
  ad: string;
  yon: PinDir;
  /** gösterilen net adı; bağlı değilse null */
  net: string | null;
  sinif: UcSinifi | "bos";
  teller: PinTel[];
  /** netin bu karttaki uç sayısı (bu pin dahil) */
  netUclari: number;
  /** net bir arka panel sinyaliyse konnektör pini */
  kenar?: number;
  /** "besleme", "sabit 0", "sabit 1", "boş çıkış (bağlanmaz)" … */
  not?: string;
}

export interface CipKarti {
  ref: string;
  deger: string;
  baslik: string;
  kilif: string;
  pinSayisi: number;
  genis: boolean;
  blok: string;
  gorev: string;
  hucre: string;
  dekuplaj: string[];
  kapilar?: CipYeri["kapilar"];
  pinler: PinSatiri[];
}

export interface PasifKarti {
  ref: string;
  part: string;
  baslik: string;
  blok: string;
  gorev: string;
  hucre: string;
  pinler: PinSatiri[];
}

export interface KenarPini {
  pin: number;
  /** BACKPLANE düzenindeki sinyal; boş pinlerde null */
  sinyal: string | null;
  sinif: UcSinifi | "bos";
  /** konnektörün bu pini kartta bir nete bağlı mı (arka panelde var olan sinyal) */
  bagli: boolean;
  /** bu kart açısından yön */
  yon: "besleme" | "çıkış" | "giriş" | "çift yönlü" | "pasif" | "kullanılmaz" | "boş";
  teller: PinTel[];
  /** konnektör dışında bu nete bağlı karttaki uçlar */
  kartUclari: number;
}

export interface BlokPlani {
  ad: string;
  /** kurulum sırası (0 = besleme ve arka panel) */
  sira: number;
  deney?: number;
  /** bu blokta takılan çipler */
  cipler: string[];
  /** kapıları bu blokta kullanılan yapıştırıcı çipleri */
  yapistirici: { ref: string; deger: string; kapilar: number[] }[];
  pasifler: string[];
  telSayisi: number;
  ilkTel?: string;
  sonTel?: string;
  /** haritadaki blok rengi */
  renk: string;
}

export interface MalzemeSatiri {
  deger: string;
  baslik: string;
  kilif: string;
  adet: number;
  refs: string[];
}

export interface GucButcesi {
  satirlar: { kalem: string; adet: number; birim: number; toplam: number }[];
  /** mA */
  toplam: number;
}

export interface KurulumPlani {
  kart: string;
  baslik: string;
  /** kartın kurulduğu deneyler */
  deneyler: number[];
  /** kartın kurulmayan (yalnızca simülasyonda olan) blokları */
  haric: string[];
  olcu: { w: number; h: number };
  /** ızgara adımı (mm): haritadaki hücreler */
  izgara: number;
  bloklar: BlokPlani[];
  blokYerleri: BlokYeri[];
  cipler: CipYeri[];
  pasifler: PasifYeri[];
  guc: GucSatiri[];
  pasifGuc: PasifGuc[];
  teller: Tel[];
  cipKartlari: CipKarti[];
  pasifKartlari: PasifKarti[];
  /** kenar konnektörü (arka panel); programlayıcıda yok */
  kenar: { ref: string; pinler: KenarPini[] } | null;
  malzeme: { cipler: MalzemeSatiri[]; pasifler: MalzemeSatiri[]; soketler: { kilif: string; adet: number }[] };
  gucButcesi: GucButcesi;
  /** besleme pini sayısı (çip ve pasiflerin VCC / GND'ye giden uçları) */
  beslemePinleri: number;
  /** tek uçlu (kartta bağlanmayan) sinyal pinleri */
  bosPinler: number;
}

export interface PlanSecenekleri {
  /** aynı Board için önceden hesaplanmış yerleşim (birden çok kart için tekrar hesaplanmasın) */
  layout?: BoardLayout;
  /** kurulmayan bloklar; verilmezse deneyler.ts'teki SADECE_SIM (ör. test bellek kartının RAM'i) */
  haric?: string[];
}

// ---------------------------------------------------------------- yardımcılar

const natural = (a: string, b: string) => a.localeCompare(b, "tr", { numeric: true });
const BESLEME_BLOK = "Besleme ve arka panel";
const YAPISTIRICI_BLOK = "Yapıştırıcı lojik";
const SINIF_SIRA: SinyalSinifi[] = ["adres", "veri", "secim", "kontrol", "saat", "reset", "dis"];
const BLOK_RENKLERI = [
  "#dbe9f6", "#fde2c8", "#d9f0d3", "#f3d6e7", "#fff1b8", "#e2dcf3", "#d2f0ee", "#f6d8d0", "#e6eccf", "#dfe3e8", "#f8e3f0", "#d7ecf9",
];

/** Kartın bloklarının deneyleri (deneyler.ts): listelenen bloklar o deneyde, listesiz kayıt kalanların hepsi */
export function blokDeneyleri(kart: string, bloklar: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of DENEYLER) {
    for (const k of d.kartlar ?? []) {
      if (k.card !== kart) continue;
      for (const b of bloklar) if (!out.has(b) && (!k.blocks || k.blocks.includes(b))) out.set(b, d.no);
    }
  }
  return out;
}

/** Izgara sütununun harfi: 0 → A, 25 → Z, 26 → AA … */
export function sutunHarfi(c: number): string {
  let s = "";
  let k = c;
  do {
    s = String.fromCharCode(65 + (k % 26)) + s;
    k = Math.floor(k / 26) - 1;
  } while (k >= 0);
  return s;
}

const hucreAdi = (x: number, y: number, adim: number) => `${sutunHarfi(Math.floor(x / adim))}${Math.floor(y / adim) + 1}`;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Açık yol üzerinde 2-opt iyileştirmesi (fixStart: ilk uç yerinde kalır) */
function ikiOpt<T extends { x: number; y: number }>(p: T[], fixStart: boolean): void {
  const n = p.length;
  if (n < 3) return;
  for (let round = 0; round < 40; round++) {
    let improved = false;
    for (let i = fixStart ? 1 : 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        let delta = 0;
        if (i > 0) delta += dist(p[i - 1], p[j]) - dist(p[i - 1], p[i]);
        if (j < n - 1) delta += dist(p[i], p[j + 1]) - dist(p[j], p[j + 1]);
        if (delta < -1e-6) {
          for (let a = i, b = j; a < b; a++, b--) [p[a], p[b]] = [p[b], p[a]];
          improved = true;
        }
      }
    }
    if (!improved) return;
  }
}

/** En yakın komşu zinciri: start'tan başlayıp her adımda en yakın uca */
function zincir<T extends { x: number; y: number }>(start: T, rest: T[]): T[] {
  const path = [start];
  const left = [...rest];
  let cur = start;
  while (left.length) {
    let bi = 0;
    for (let i = 1; i < left.length; i++) if (dist(cur, left[i]) < dist(cur, left[bi])) bi = i;
    cur = left.splice(bi, 1)[0];
    path.push(cur);
  }
  return path;
}

/**
 * Tahmini akım (mA, 5 V, 1 MHz CPU saati; bellekler seçiliyken, en kötü durum). Kaba hesap: uretim.md
 * "Besleme". LED'in akımı seri direncinden: (5 V − 2 V) / R, 330 Ω ile 9 mA, 1 kΩ ile 3 mA (ledSeriOhm).
 */
export function akim(deger: string, ledOhm = 330): { kalem: string; mA: number } | null {
  if (/^74AC/.test(deger)) return { kalem: "74AC çipleri (piksel saatinde)", mA: 4 };
  if (/^74HC/.test(deger)) return { kalem: "74HC çipleri (1 MHz'de dinamik akım)", mA: 1 };
  if (deger === "62256") return { kalem: "62256 SRAM (seçiliyken)", mA: 30 };
  if (deger === "28C256") return { kalem: "28C256 EEPROM (okurken)", mA: 30 };
  if (deger === "LED") return { kalem: `LED (${ohmMetni(ledOhm)}, yanarken)`, mA: Math.round(3000 / ledOhm) };
  if (deger === "DISP_BAR_10") return { kalem: "çubuk gösterge (8 segment × ≈ 3 mA, bayt 0xFF iken)", mA: 24 };
  if (deger === "DISP_7SEG_CC") return { kalem: "7 segment hane (7 × ≈ 6 mA, lamba testinde hepsi yanar)", mA: 42 };
  if (deger === "OSC_CAN" || deger === "OSC_25M175") return { kalem: "kristal osilatör modülü", mA: 25 };
  if (deger === "CONN_PS2") return { kalem: "PS/2 klavye (konnektörden beslenir)", mA: 100 };
  if (deger === "ARDUINO_NANO") return { kalem: "Arduino Nano (USB'den beslenir)", mA: 25 };
  return null;
}

/** LED'in seri direnci (Ω): anoduna bağlı direnç (sinyal → R → LED ya da VCC → R → LED); yoksa 330 */
export function ledSeriOhm(board: Board, ref: string): number {
  const led = board.passives.find((p) => p.ref === ref);
  const anot = led?.pins["1"];
  const r = anot === undefined ? undefined : board.passives.find((q) => q !== led && /^R_/.test(q.part) && Object.values(q.pins).includes(anot));
  const d = r ? pasifDegeri(r.part) : null;
  return d?.tur === "direnc" ? d.ohm : 330;
}

// ---------------------------------------------------------------- plan

export function kurulumPlani(board: Board, kart: string, o: PlanSecenekleri = {}): KurulumPlani {
  const { VCC, GND } = board.c;
  const haric = o.haric ?? SADECE_SIM.filter((k) => k.card === kart).flatMap((k) => k.blocks ?? []);
  const haricMi = (blok: string) => haric.includes(blok);
  const chips = board.chips.filter((c) => c.card === kart && !haricMi(c.block));
  if (!chips.length && !board.passives.some((p) => p.card === kart)) throw new Error(`Böyle bir kart yok: ${kart}`);
  const refs = new Set(chips.map((c) => c.ref));
  const dekuplajCipi = (p: Passive) => /^(U\d+) dekuplaj$/.exec(p.role)?.[1];
  const passives = board.passives.filter((p) => {
    if (p.card !== kart) return false;
    const cip = dekuplajCipi(p);
    if (cip) return refs.has(cip);
    return !haricMi(p.block);
  });

  // ---- yerleşim (kart koordinatına taşınır)
  const lay = o.layout ?? boardLayout(board);
  const cardPlace = lay.cards.find((c) => c.name === kart)!;
  const ox = cardPlace.x;
  const oy = cardPlace.y;
  const izgara = 20;
  const chipPlace = new Map(lay.chips.filter((c) => c.card === kart).map((c) => [c.ref, c]));
  const pasPlace = new Map(lay.passives.filter((p) => p.card === kart).map((p) => [p.ref, p]));
  const pinXY = (ref: string, num: number): { x: number; y: number } => {
    const pl = chipPlace.get(ref) ?? pasPlace.get(ref);
    const p = pl?.pins.find((q) => q.num === num);
    if (!p) throw new Error(`${ref}.${num}: yerleşimde yok`);
    return { x: p.x - ox, y: p.y - oy };
  };

  // ---- uçlar: her pin bir uç; yapıştırıcı çipte pinin bloğu kapısının bloğudur
  const pinBlok = (ci: ChipInstance, pin: string) => ci.glueUnits?.find((u) => u.pins.includes(pin))?.block ?? ci.block;
  const pasifPinAdi = (p: Passive, num: number) => PASSIVES[p.part]?.pins.find((x) => x.num === num)?.name ?? String(num);
  interface PinKaydi { uc: Uc; net: number | undefined; yon: PinDir }
  const cipPinleri = new Map<string, PinKaydi[]>();
  const pasifPinleri = new Map<string, PinKaydi[]>();
  for (const ci of chips) {
    cipPinleri.set(ci.ref, ci.def.pins.map((p) => ({
      uc: { ref: ci.ref, pin: p.num, ad: p.name, pasif: false, blok: pinBlok(ci, p.name), ...pinXY(ci.ref, p.num) },
      net: ci.nets[p.name],
      yon: p.dir,
    })));
  }
  for (const p of passives) {
    const nums = Object.keys(p.pins).map(Number).sort((a, b) => a - b);
    const all = PASSIVES[p.part] ? PASSIVES[p.part].pins.map((x) => x.num) : nums;
    pasifPinleri.set(p.ref, all.map((num) => ({
      uc: { ref: p.ref, pin: num, ad: pasifPinAdi(p, num), pasif: true, blok: p.block, ...pinXY(p.ref, num) },
      net: p.pins[String(num)],
      yon: "passive" as PinDir,
    })));
  }
  const tumPinler = [...cipPinleri.values(), ...pasifPinleri.values()].flat();

  // ---- bloklar ve kurulum sırası: besleme önce, sonra deney sırası, aynı deneyde tanım sırası;
  // yapıştırıcı lojik (kapıları diğer bloklarda) en sonda
  const ilkGorulme: string[] = [];
  const gor = (b: string) => { if (!ilkGorulme.includes(b)) ilkGorulme.push(b); };
  for (const ci of chips) {
    gor(ci.block);
    for (const u of ci.glueUnits ?? []) gor(u.block);
  }
  for (const p of passives) gor(p.block);
  const deneyOf = blokDeneyleri(kart, ilkGorulme);
  const kartDeneyleri = [...new Set(deneyOf.values())].sort((a, b) => a - b);
  const anahtar = (b: string): [number, number] => {
    if (b === BESLEME_BLOK) return [-1, 0];
    if (b === YAPISTIRICI_BLOK) return [1e9, 0];
    return [deneyOf.get(b) ?? 1e6, ilkGorulme.indexOf(b)];
  };
  const blokSirasi = [...ilkGorulme].sort((a, b) => {
    const [da, ia] = anahtar(a);
    const [db, ib] = anahtar(b);
    return da - db || ia - ib;
  });
  const sira = new Map(blokSirasi.map((b, i) => [b, i]));

  // ---- netler: VCC / GND dışındaki her net, bu karttaki uçlarıyla
  const netUclari = new Map<number, Uc[]>();
  for (const k of tumPinler) {
    if (k.net === undefined || k.net === VCC || k.net === GND) continue;
    (netUclari.get(k.net) ?? netUclari.set(k.net, []).get(k.net)!).push(k.uc);
  }
  const netAdi = (n: number) => netGorunen(board.netName(n));

  // ---- teller: her net blok blok büyüyen bir ağaç; her blokta en yakın komşu zinciri + 2-opt,
  // önceki bloklardaki ağaca en yakın (tercihen zincirin ucundaki) noktadan bağlanır
  interface HamTel { a: Uc; b: Uc; net: number; blok: string; sinif: SinyalSinifi; adim: number }
  const ham: HamTel[] = [];
  for (const [net, ucs] of netUclari) {
    if (ucs.length < 2) continue;
    const sinif = sinyalSinifi(board.netName(net));
    const sorted = [...ucs].sort((a, b) => sira.get(a.blok)! - sira.get(b.blok)! || natural(a.ref, b.ref) || a.pin - b.pin);
    const gruplar: Uc[][] = [];
    for (const u of sorted) {
      const last = gruplar[gruplar.length - 1];
      if (last && last[0].blok === u.blok) last.push(u);
      else gruplar.push([u]);
    }
    const agac: Uc[] = [];
    const derece = new Map<Uc, number>();
    const ekle = (a: Uc, b: Uc, blok: string) => {
      ham.push({ a, b, net, blok, sinif, adim: ham.length });
      derece.set(a, (derece.get(a) ?? 0) + 1);
      derece.set(b, (derece.get(b) ?? 0) + 1);
    };
    for (const g of gruplar) {
      const blok = g[0].blok;
      if (!agac.length) {
        // merkezden en uzak uçtan başla (zincirin bir ucu)
        const cx = g.reduce((s, u) => s + u.x, 0) / g.length;
        const cy = g.reduce((s, u) => s + u.y, 0) / g.length;
        let start = g[0];
        for (const u of g) if (dist(u, { x: cx, y: cy }) > dist(start, { x: cx, y: cy }) + 1e-6) start = u;
        const path = zincir(start, g.filter((u) => u !== start));
        ikiOpt(path, false);
        for (let i = 1; i < path.length; i++) ekle(path[i - 1], path[i], blok);
        agac.push(...path);
        continue;
      }
      // ağaca bağlanma noktası: derecesi < 3 olan uçlar; zincir ucu (derece < 2) 25 mm'ye kadar tercih edilir
      let best: { t: Uc; p: Uc; cost: number } | null = null;
      for (const t of agac) {
        const d = derece.get(t) ?? 0;
        if (d >= 3) continue;
        for (const p of g) {
          const cost = dist(t, p) + (d >= 2 ? 25 : 0);
          if (!best || cost < best.cost - 1e-6) best = { t, p, cost };
        }
      }
      const path = zincir(best!.p, g.filter((u) => u !== best!.p));
      ikiOpt(path, true);
      ekle(best!.t, path[0], blok);
      for (let i = 1; i < path.length; i++) ekle(path[i - 1], path[i], blok);
      agac.push(...path);
    }
  }
  ham.sort((x, y) =>
    sira.get(x.blok)! - sira.get(y.blok)! ||
    SINIF_SIRA.indexOf(x.sinif) - SINIF_SIRA.indexOf(y.sinif) ||
    natural(netAdi(x.net), netAdi(y.net)) ||
    x.adim - y.adim);
  const teller: Tel[] = ham.map((h, i) => {
    const r = renkKodu(h.sinif);
    return {
      id: `T${String(i + 1).padStart(4, "0")}`,
      blok: h.blok, blokSira: sira.get(h.blok)!, net: netAdi(h.net), netId: h.net, sinif: h.sinif, renk: r.renk, hex: r.hex,
      from: h.a, to: h.b, uzunluk: Math.max(1, Math.round(dist(h.a, h.b))),
    };
  });

  // ---- pin → teller
  const pinAnahtari = (u: Pick<Uc, "ref" | "pin">) => `${u.ref}#${u.pin}`;
  const pinTelleri = new Map<string, PinTel[]>();
  const telEkle = (u: Uc, t: Tel, karsi: Uc) =>
    (pinTelleri.get(pinAnahtari(u)) ?? pinTelleri.set(pinAnahtari(u), []).get(pinAnahtari(u))!).push({ id: t.id, karsi: ucEtiketi(karsi), karsiAd: karsi.ad });
  for (const t of teller) {
    telEkle(t.from, t, t.to);
    telEkle(t.to, t, t.from);
  }

  const kenarPas = passives.find((p) => p.part === "BACKPLANE_2x32");
  const kenarNet = new Map<number, number>();
  if (kenarPas) for (const [num, net] of Object.entries(kenarPas.pins)) if (net !== VCC && net !== GND) kenarNet.set(net, Number(num));

  const satir = (k: PinKaydi): PinSatiri => {
    const { uc, net, yon } = k;
    const base = { pin: uc.pin, ad: uc.ad, yon, teller: pinTelleri.get(pinAnahtari(uc)) ?? [] };
    if (net === undefined) return { ...base, net: null, sinif: "bos", netUclari: 0, not: yon === "nc" ? "bağlantısız pin" : "bağlı değil" };
    if (net === VCC || net === GND) {
      const g = net === VCC;
      const not = yon === "power" ? "besleme" : yon === "passive" ? (g ? "VCC'ye" : "GND'ye") : g ? "sabit 1 (VCC'ye)" : "sabit 0 (GND'ye)";
      return { ...base, net: g ? "VCC" : "GND", sinif: g ? "vcc" : "gnd", netUclari: 0, not };
    }
    const n = netUclari.get(net)!.length;
    const row: PinSatiri = { ...base, net: netAdi(net), sinif: sinyalSinifi(board.netName(net)), netUclari: n };
    if (kenarNet.has(net)) row.kenar = kenarNet.get(net);
    if (n === 1) row.not = yon === "out" || yon === "tri" ? "boş çıkış (bağlanmaz)" : "bu kartta başka ucu yok";
    return row;
  };

  // ---- çipler ve pasifler
  const dekuplajlar = new Map<string, string[]>();
  for (const p of passives) {
    const cip = dekuplajCipi(p);
    if (cip) (dekuplajlar.get(cip) ?? dekuplajlar.set(cip, []).get(cip)!).push(p.ref);
  }
  const cipler: CipYeri[] = chips.map((ci) => {
    const pl = chipPlace.get(ci.ref)!;
    const p1 = pinXY(ci.ref, 1);
    const yer: CipYeri = {
      ref: ci.ref, deger: partValue(ci), baslik: ci.def.title, kilif: ci.def.pkg, pinSayisi: ci.def.pins.length,
      genis: ci.footprint.includes("W15.24"), soket: /Socket/.test(ci.footprint), blok: ci.block, gorev: ci.role,
      x: pl.x - ox, y: pl.y - oy, w: pl.w, h: pl.h, pin1: p1, pins: pl.pins.map((q) => ({ num: q.num, x: q.x - ox, y: q.y - oy })), hucre: hucreAdi(pl.x - ox + pl.w / 2, pl.y - oy + pl.h / 2, izgara),
      dekuplaj: dekuplajlar.get(ci.ref) ?? [],
    };
    if (ci.glueUnits) yer.kapilar = ci.glueUnits.map((u, k) => ({ no: k + 1, blok: u.block, gorev: u.role }));
    return yer;
  });
  const pasifler: PasifYeri[] = passives.map((p) => {
    const pl = pasPlace.get(p.ref)!;
    const yer: PasifYeri = {
      ref: p.ref, part: p.part, baslik: PASSIVES[p.part]?.title ?? p.part, blok: p.block, gorev: p.role, tur: pl.kind,
      x: pl.x - ox, y: pl.y - oy, w: pl.w, h: pl.h, dikey: pl.vertical, hucre: hucreAdi(pl.x - ox + pl.w / 2, pl.y - oy + pl.h / 2, izgara),
      pins: pl.pins.map((q) => ({ num: q.num, x: q.x - ox, y: q.y - oy })),
    };
    if (pl.chip) yer.cip = pl.chip;
    if (pl.edge) yer.kenar = true;
    return yer;
  });
  const blokYerleri: BlokYeri[] = lay.blocks
    .filter((b) => b.card === kart && (chips.some((c) => c.block === b.name) || passives.some((p) => p.block === b.name && !dekuplajCipi(p))))
    .map((b) => ({ ad: b.name, x: b.x - ox, y: b.y - oy, w: b.w, h: b.h }));

  // ---- besleme
  const guc: GucSatiri[] = chips.map((ci) => {
    const rows = cipPinleri.get(ci.ref)!;
    const pick = (net: number, dir: (d: PinDir) => boolean) => rows.filter((k) => k.net === net && dir(k.yon));
    return {
      ref: ci.ref, deger: partValue(ci), kilif: ci.def.pkg, blok: ci.block,
      vcc: pick(VCC, (d) => d === "power").map((k) => k.uc.pin),
      gnd: pick(GND, (d) => d === "power").map((k) => k.uc.pin),
      sabit1: pick(VCC, (d) => d !== "power").map((k) => ({ pin: k.uc.pin, ad: k.uc.ad })),
      sabit0: pick(GND, (d) => d !== "power").map((k) => ({ pin: k.uc.pin, ad: k.uc.ad })),
      dekuplaj: dekuplajlar.get(ci.ref) ?? [],
    };
  });
  const pasifGuc: PasifGuc[] = passives
    .map((p) => {
      const rows = pasifPinleri.get(p.ref)!;
      return { ref: p.ref, part: p.part, gorev: p.role, vcc: rows.filter((k) => k.net === VCC).map((k) => k.uc.pin), gnd: rows.filter((k) => k.net === GND).map((k) => k.uc.pin) };
    })
    .filter((p) => p.vcc.length || p.gnd.length);
  const beslemePinleri = tumPinler.filter((k) => k.net === VCC || k.net === GND).length;

  // ---- pin tabloları
  const cipKartlari: CipKarti[] = chips.map((ci, i) => {
    const y = cipler[i];
    const kartx: CipKarti = {
      ref: ci.ref, deger: y.deger, baslik: y.baslik, kilif: y.kilif, pinSayisi: y.pinSayisi, genis: y.genis, blok: ci.block, gorev: ci.role,
      hucre: y.hucre, dekuplaj: y.dekuplaj, pinler: cipPinleri.get(ci.ref)!.map(satir),
    };
    if (y.kapilar) kartx.kapilar = y.kapilar;
    return kartx;
  });
  const pasifKartlari: PasifKarti[] = passives.map((p, i) => ({
    ref: p.ref, part: p.part, baslik: pasifler[i].baslik, blok: p.block, gorev: p.role, hucre: pasifler[i].hucre,
    pinler: pasifPinleri.get(p.ref)!.map(satir),
  }));

  // ---- kenar konnektörü
  let kenar: KurulumPlani["kenar"] = null;
  if (kenarPas) {
    const rows = pasifPinleri.get(kenarPas.ref)!;
    const pinler: KenarPini[] = rows.map((k) => {
      const sinyal = BACKPLANE[k.uc.pin] ?? null;
      const teller = pinTelleri.get(pinAnahtari(k.uc)) ?? [];
      // pin konnektörde bir nete bağlı değil: boş pin (57..61) ya da bu bilgisayar tanımında olmayan sinyal
      if (k.net === undefined) return { pin: k.uc.pin, sinyal, sinif: sinyal ? sinyalSinifi(sinyal) : "bos", bagli: false, yon: sinyal ? "kullanılmaz" : "boş", teller, kartUclari: 0 };
      if (k.net === VCC || k.net === GND) {
        return { pin: k.uc.pin, sinyal, sinif: k.net === VCC ? "vcc" : "gnd", bagli: true, yon: "besleme", teller, kartUclari: 0 };
      }
      const diger = tumPinler.filter((x) => x.net === k.net && x.uc !== k.uc);
      const surer = diger.some((x) => x.yon === "out" || x.yon === "tri" || x.yon === "bidir");
      const okur = diger.some((x) => x.yon === "in" || x.yon === "bidir");
      const yalnizPasif = diger.length > 0 && diger.every((x) => x.yon === "passive");
      const yon: KenarPini["yon"] = !diger.length ? "kullanılmaz" : surer && okur ? "çift yönlü" : surer ? "çıkış" : okur ? "giriş" : yalnizPasif ? "pasif" : "giriş";
      return { pin: k.uc.pin, sinyal, sinif: sinyalSinifi(board.netName(k.net)), bagli: true, yon, teller, kartUclari: diger.length };
    });
    kenar = { ref: kenarPas.ref, pinler };
  }

  // ---- blok planları
  const bloklar: BlokPlani[] = blokSirasi.map((ad, i) => {
    const t = teller.filter((x) => x.blok === ad);
    const yap = chips
      .filter((c) => c.glueUnits?.some((u) => u.block === ad))
      .map((c) => ({ ref: c.ref, deger: partValue(c), kapilar: c.glueUnits!.flatMap((u, k) => (u.block === ad ? [k + 1] : [])) }));
    const plan: BlokPlani = {
      ad, sira: i, cipler: chips.filter((c) => c.block === ad).map((c) => c.ref), yapistirici: yap,
      pasifler: passives.filter((p) => p.block === ad).map((p) => p.ref), telSayisi: t.length, renk: BLOK_RENKLERI[i % BLOK_RENKLERI.length],
    };
    const d = ad === BESLEME_BLOK ? kartDeneyleri[0] : ad === YAPISTIRICI_BLOK ? undefined : deneyOf.get(ad);
    if (d !== undefined) plan.deney = d;
    if (t.length) {
      plan.ilkTel = t[0].id;
      plan.sonTel = t[t.length - 1].id;
    }
    return plan;
  });

  // ---- malzeme ve besleme bütçesi
  const grupla = <T>(list: T[], key: (x: T) => string) => {
    const m = new Map<string, T[]>();
    for (const x of list) (m.get(key(x)) ?? m.set(key(x), []).get(key(x))!).push(x);
    return [...m.entries()].sort((a, b) => natural(a[0], b[0]));
  };
  const malzeme: KurulumPlani["malzeme"] = {
    cipler: grupla(cipler, (c) => c.deger).map(([deger, l]) => ({ deger, baslik: l[0].baslik, kilif: l[0].kilif, adet: l.length, refs: l.map((c) => c.ref) })),
    pasifler: grupla(pasifler, (p) => p.part).map(([deger, l]) => ({ deger, baslik: l[0].baslik, kilif: PASSIVES[deger]?.footprint.split(":")[1] ?? "", adet: l.length, refs: l.map((p) => p.ref) })),
    soketler: grupla(cipler, (c) => {
      const dip = `DIP-${c.pinSayisi}${c.genis ? " geniş (15,24 mm)" : " (7,62 mm)"}`;
      if (!c.soket) return dip;
      return /ZIF/.test(c.gorev) ? `ZIF-${c.pinSayisi} (sıfır kuvvetli soket)` : `${dip}, ZIF önerilir (çip programlayıcıya taşınır)`;
    })
      .map(([kilif, l]) => ({ kilif, adet: l.length })),
  };
  const butce = new Map<string, { adet: number; birim: number }>();
  const akimlar = [...cipler.map((c) => akim(c.deger)), ...pasifler.map((p) => akim(p.part, p.part === "LED" ? ledSeriOhm(board, p.ref) : undefined))];
  for (const a of akimlar) {
    if (!a) continue;
    const r = butce.get(a.kalem) ?? { adet: 0, birim: a.mA };
    r.adet++;
    butce.set(a.kalem, r);
  }
  const satirlar = [...butce.entries()].map(([kalem, r]) => ({ kalem, adet: r.adet, birim: r.birim, toplam: r.adet * r.birim }));
  const gucButcesi: GucButcesi = { satirlar, toplam: satirlar.reduce((s, r) => s + r.toplam, 0) };

  return {
    kart, baslik: cardTitle(kart), deneyler: kartDeneyleri, haric, olcu: { w: cardPlace.w, h: cardPlace.h }, izgara,
    bloklar, blokYerleri, cipler, pasifler, guc, pasifGuc, teller, cipKartlari, pasifKartlari, kenar, malzeme, gucButcesi,
    beslemePinleri, bosPinler: [...netUclari.values()].filter((l) => l.length === 1).length,
  };
}
