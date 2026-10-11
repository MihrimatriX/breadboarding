// Kontrol birimi üreteci: CPU kartında ROM yok. Mikrokod (micro/cpu16.ucode) ve ALU kod çözme tablosu
// (alu-kod.ts) bu dosyada çok seviyeli bir 74HC devresine çevrilir; devre karta gerçek çipler olarak
// yerleşir (Board API: 74HC138 / 74HC151 çipleri ve yapıştırıcı kapılar). Şema, KiCad, BOM, 3D görünüm,
// deney rehberleri ve zamanlama analizi bu devreyi kartın geri kalanı gibi görür.
//
// Tek kaynak .ucode dosyasıdır: mikrokod değişince devre yeniden üretilir. Tarayıcıda ve Node'da dosya
// okumadan çalışmak için .ucode metni micro/cpu16-ucode.ts'e gömülür (npm run cpu16 -- kontrol;
// testler gömülü kopyanın dosyayla aynı olduğunu ve devrenin tabloyla birebir aynı olduğunu denetler).
//
// Mikrokod (13 bit adres → 32 kontrol biti) dört katmanda:
//   1. Kod çözücüler (74HC138): adım (STEP0..2 → ~ADIM0..7), komut (IR15..12 → ~KOP0..15; INT = 1
//      iken hepsi pasif) ve f3'e göre dallanan komutlar için alt çözücüler (IR2..0, izin = ~KOPk →
//      ~KOPk_F0..7). Adım 8..15'e yalnızca tek bir komut (SWI) ulaşıyorsa ikinci adım çözücüsü o
//      komutun hattıyla açılır: çıkışları doğrudan "komut ∧ adım" terimleridir.
//   2. Atomlar: aynı mikro programı çalıştıran (op, f3, COND) kümeleri. Kesme girişi (INT = 1) de bir
//      atomdur. Her an tam bir atom aktiftir (tek sıcak), her atomun aktif düşük bir hattı vardır;
//      bütün adımlarda aynı kelimeyi üreten atomların (ör. yasadışı komutlar) ortak bir hattı da.
//   3. VEYA ağı: her (kontrol biti, adım) için "bu adımda bu biti 1 olan atomlar" kümesi. Küme ya
//      içerdiği atomların hatlarının NAND'ı (VEYA), ya da içermediklerinin AND'ı (hiçbiri değil) olarak
//      kurulur; hangisi az çip payı tutuyorsa. Kümeler arasında ortak alt kümeler bir kez kurulur.
//   4. Adım boyutu: adım 0..7'nin en az dördünde 1 olabilen bitler 74HC151 ile (seçici = STEP0..2,
//      veri = 3. katmanın kümeleri, ~E = STEP3), seyrek bitler adım ∧ küme terimlerinin VEYA'sıyla.
// ALU kod çözme (7 bit → 24 bit) aynı yöntemle: işlem kodu çözücüleri (~AIS0..), işlem bitlerinin
// kendileri (AOPi = 0 kümesi), VEYA ağı, h (IR8) ve C bayrağına bağlı terimler.
//
// Karta yerleştirme (KontrolYerlestirici): kapılar Board.flexibleGlue ile kartın diğer yapıştırıcı
// çiplerinden sonra paketlenir; çözücüler kartın boşalan yuvalarına (cpu-card.ts), kalanı sona.
//
// Ayrıntı ve sayılar: cpu16/docs/mikromimari.md ("Kapı seviyesinde kontrol birimi").

import { romAddress } from "../micro/control.ts";
import { UCODE_KAYNAGI } from "../micro/cpu16-ucode.ts";
import { assembleMicrocode } from "../micro/microasm.ts";
import { ALU_ADRES, aluKelimesi } from "./alu-kod.ts";
import type { Board, ChipInstance } from "./board.ts";

// ------------------------------------------------------------------------------------------------
// Soyut devre: üretecin çıktısı. Netler adlarıyla anılır; "GND" ve "VCC" sabittir.

export type Islev = "and" | "nand" | "or" | "nor" | "not";

export interface Kapi {
  tur: "kapi";
  islev: Islev;
  giris: string[];
  cikis: string;
  blok: string;
  rol: string;
}

/** Çipin görevi (karta yerleştirirken yuva seçmek için) */
export type CipTuru = "adim" | "komut" | "cw" | "alu";

export interface Cip {
  tur: "cip";
  parca: "74HC138" | "74HC151";
  gorev: CipTuru;
  /** pin → net */
  baglanti: Record<string, string>;
  blok: string;
  rol: string;
}

export type Eleman = Kapi | Cip;

export type Cikis = string | 0 | 1;

export interface KontrolDevresi {
  /** yerleştirme sırasıyla elemanlar (her eleman girişlerinden sonra gelir) */
  elemanlar: Eleman[];
  /** kontrol register'ının (CR) 32 D girişi: net ya da sabit */
  mk: Cikis[];
  /** ALU kontrol bitleri AD0..AD23: net ("AD<n>") ya da sabit */
  ad: Cikis[];
}

/** Kontrol biriminin girişleri (CPU kartındaki net adları) */
export const KONTROL_GIRISLERI = {
  adim: ["STEP0", "STEP1", "STEP2", "STEP3"],
  int: "INT",
  op: ["IR12", "IR13", "IR14", "IR15"],
  f3: ["IR0", "IR1", "IR2"],
  cond: "COND",
  aop: ["AOP0", "AOP1", "AOP2", "AOP3", "AOP4"],
  h: "IR8",
  c: "CFLAG",
  cN: "~CFLAG",
} as const;

/** Bütün giriş netleri (test düzeneği bunları sürer) */
export const KONTROL_GIRIS_NETLERI: string[] = [
  ...KONTROL_GIRISLERI.adim, KONTROL_GIRISLERI.int, ...KONTROL_GIRISLERI.op, ...KONTROL_GIRISLERI.f3, KONTROL_GIRISLERI.cond,
  ...KONTROL_GIRISLERI.aop, KONTROL_GIRISLERI.h, KONTROL_GIRISLERI.c, KONTROL_GIRISLERI.cN,
];

export const BLOK_KONTROL = "Kontrol birimi";
export const BLOK_ALU_KOD = "ALU kod çözücü";

// ------------------------------------------------------------------------------------------------
// Devre yazıcı: kapıları yapısal olarak paylaşır (aynı işlev + aynı girişler = aynı net), yelpaze
// girişi kütüphanedeki kapılara sığmayanları ağaca böler.

/** Kapı türlerinin yaklaşık çip payı (paketlemede: 74HC08 dört AND2, 74HC11 üç AND3 …) */
const PAY: Record<string, number> = {
  "and/2": 1 / 4, "and/3": 1 / 3, "and/4": 1 / 2,
  "nand/2": 1 / 4, "nand/3": 1 / 3, "nand/4": 1 / 2, "nand/8": 1,
  "or/2": 1 / 4, "nor/2": 1 / 4, "nor/3": 1 / 3, not: 1 / 6,
};

/** n girişli AND'ın çip payı (4'ten genişler AND4 zinciri) */
function andPay(n: number): number {
  if (n <= 1) return 0;
  if (n <= 4) return PAY[`and/${n}`];
  return PAY["and/4"] + andPay(n - 3);
}

/** n girişli NAND'ın çip payı (5–6: AND4 + NAND; 7–8: 74HC30; daha genişi AND ön katıyla) */
function nandPay(n: number): number {
  if (n <= 1) return PAY.not;
  if (n <= 4) return PAY[`nand/${n}`];
  if (n <= 6) return PAY["and/4"] + PAY[`nand/${n - 3}`];
  if (n <= 8) return PAY["nand/8"];
  return PAY["nand/8"] + andPay(n - 7);
}

class Yazici {
  readonly elemanlar: Eleman[] = [];
  private readonly ezber = new Map<string, string>();
  private readonly suren = new Map<string, number>();
  /** ertelenmiş yeniden adlandırmalar (eski → yeni); sonlandir() bütün bağlantılara uygular */
  private readonly takma = new Map<string, string>();
  /** adı değiştirilebilen çip çıkışları (ör. 74HC138 çıkışları) */
  private readonly cipCikisi = new Set<string>();
  private sayac = 0;
  private readonly onek: string;
  blok = "";

  constructor(onek: string) {
    this.onek = onek;
  }

  private yeniAd(): string {
    return `${this.onek}${this.sayac++}`;
  }

  /** Netin güncel adı */
  ad(net: string): string {
    return this.takma.get(net) ?? net;
  }

  private icNet(net: string): boolean {
    return net.startsWith(this.onek) && /^\d+$/.test(net.slice(this.onek.length));
  }

  /** Tek kapı (yelpaze girişi kütüphaneye uygun olmalı). `ad` verilirse çıkış bu adla, `zorla` ise paylaşılmadan */
  kapi(islev: Islev, giris: string[], ad?: string, rol = "", zorla = false): string {
    const anahtar = `${islev}(${[...giris].map((g) => this.ad(g)).sort().join(",")})`;
    if (!zorla) {
      const var_ = this.ezber.get(anahtar);
      if (var_ !== undefined) {
        if (ad && this.icNet(var_) && this.yenidenAdlandir(var_, ad)) return ad;
        return this.ad(var_);
      }
    }
    const cikis = ad ?? this.yeniAd();
    this.suren.set(cikis, this.elemanlar.length);
    this.elemanlar.push({ tur: "kapi", islev, giris: [...giris], cikis, blok: this.blok, rol });
    if (!this.ezber.has(anahtar)) this.ezber.set(anahtar, cikis);
    return cikis;
  }

  /** MSI çip; `adlandirilabilir` çıkışlar sonradan bir çıkış adı alabilir */
  cip(parca: Cip["parca"], gorev: CipTuru, baglanti: Record<string, string>, rol: string, adlandirilabilir: string[] = []): void {
    this.elemanlar.push({ tur: "cip", parca, gorev, baglanti, blok: this.blok, rol });
    for (const n of adlandirilabilir) this.cipCikisi.add(n);
  }

  not(a: string, ad?: string, rol = "", zorla = false): string {
    return this.kapi("not", [a], ad, rol, zorla);
  }

  or(a: string, b: string, ad?: string, rol = "", zorla = false): string {
    return this.kapi("or", [a, b], ad, rol, zorla);
  }

  nor(giris: string[], ad?: string, rol = "", zorla = false): string {
    if (giris.length > 3) return this.not(this.or2agaci(giris), ad, rol, zorla);
    return this.kapi("nor", giris, ad, rol, zorla);
  }

  private or2agaci(giris: string[]): string {
    let x = giris[0];
    for (const g of giris.slice(1)) x = this.or(x, g);
    return x;
  }

  /** AND: 1 giriş = tel (adlı çıkışta tampon), ≤ 4 tek kapı, daha genişi AND4 zinciri */
  and(giris: string[], ad?: string, rol = "", zorla = false): string {
    const g = [...new Set(giris.map((x) => this.ad(x)))];
    if (g.length === 1) return ad ? this.kapi("and", [g[0], g[0]], ad, rol, true) : g[0];
    if (g.length <= 4) return this.kapi("and", g, ad, rol, zorla);
    const ilk = this.and(g.slice(0, g.length - 3), undefined, rol);
    return this.kapi("and", [ilk, ...g.slice(g.length - 3)], ad, rol, zorla);
  }

  /** NAND: 1 giriş = NOT, ≤ 4 tek kapı, 5–6 AND4 + NAND, 7–8 tek 74HC30, daha genişi AND ön katıyla */
  nand(giris: string[], ad?: string, rol = "", zorla = false): string {
    const g = [...new Set(giris.map((x) => this.ad(x)))];
    if (g.length === 1) return this.not(g[0], ad, rol, zorla);
    if (g.length <= 4) return this.kapi("nand", g, ad, rol, zorla);
    if (g.length <= 6) return this.kapi("nand", [this.and(g.slice(0, 4), undefined, rol), ...g.slice(4)], ad, rol, zorla);
    if (g.length <= 8) return this.kapi("nand", g, ad, rol, zorla);
    const ust = g.slice(0, 7);
    return this.kapi("nand", [...ust, this.and(g.slice(7), undefined, rol)], ad, rol, zorla);
  }

  /** Bir netin adını değiştir (sonlandir() bütün bağlantılara uygular). Her net bir kez. */
  yenidenAdlandir(eski: string, yeni: string): boolean {
    if (this.takma.has(eski)) return false;
    this.takma.set(eski, yeni);
    const i = this.suren.get(eski);
    if (i !== undefined) this.suren.set(yeni, i);
    return true;
  }

  /** Var olan bir sinyale çıkış adı ver: adı değiştirilebiliyorsa yeniden adlandır, yoksa kopya kapı ya da tampon */
  adlandir(net: string, isim: string, rol: string): string {
    const n = this.ad(net);
    if (n === net && (this.icNet(n) || this.cipCikisi.has(n)) && this.yenidenAdlandir(n, isim)) return isim;
    const i = this.suren.get(n);
    const k = i === undefined ? undefined : this.elemanlar[i];
    if (k && k.tur === "kapi") return this.kapi(k.islev, k.giris, isim, rol, true);
    return this.kapi("and", [n, n], isim, rol, true);
  }

  /** Ertelenmiş adları bağlantılara uygula */
  sonlandir(): void {
    for (const e of this.elemanlar) {
      if (e.tur === "kapi") {
        e.giris = e.giris.map((x) => this.ad(x));
        e.cikis = this.ad(e.cikis);
      } else {
        for (const k of Object.keys(e.baglanti)) e.baglanti[k] = this.ad(e.baglanti[k]);
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------
// Tek sıcak hatlar üzerinde VEYA ağı

const bitSay = (x: bigint): number => {
  let n = 0;
  for (; x; x &= x - 1n) n++;
  return n;
};

interface Hat {
  /** hattın aktif olduğu değerler (alfabedeki bit konumları) */
  kapsam: bigint;
  /** aktif düşük net (tembel hatlarda ilk kullanımda üretilir) */
  net?: string;
  uret?: () => string;
  /** üretilmemişse kurulma maliyeti (çip payı) */
  maliyet: number;
  /** varsa aynı hattın aktif yüksek hali (ör. INT): tek hatlı kümede NOT gerekmez */
  yuksek?: string;
}

/** İstenen kutup: Y = aktif yüksek (küme), D = aktif düşük (¬küme), L = tüketicinin NAND'ına düzleşen aktif düşük giriş listesi */
type Kutup = "Y" | "D" | "L";
type Bicim = "icerir" | "disarida";

interface Cozum {
  bicim: Bicim | "sabit";
  sabit?: 0 | 1;
  /** girişler: hat (sayı < hatlar.length) ya da düğüm (sayı ≥ hatlar.length) */
  ogeler: number[];
  kutuplar: Set<Kutup>;
  netler: Partial<Record<Kutup, Cikis | string[]>>;
}

class VeyaAgi {
  private readonly istekler = new Map<bigint, Set<Kutup>>();
  private readonly cozum = new Map<bigint, Cozum>();
  /** ortak alt kümeler: iki öğenin AND'ı (aktif düşük VEYA) */
  private readonly dugumler: { a: number; b: number; net?: string }[] = [];
  private readonly y: Yazici;
  private readonly evren: bigint;
  private readonly hatlar: Hat[];

  constructor(y: Yazici, evren: bigint, hatlar: Hat[]) {
    this.y = y;
    this.evren = evren;
    this.hatlar = hatlar;
  }

  iste(kume: bigint, kutup: Kutup): void {
    if (!this.istekler.has(kume)) this.istekler.set(kume, new Set());
    this.istekler.get(kume)!.add(kutup);
  }

  /** Kümenin hatlarla örtüsü (açgözlü; hatlar üst üste binebilir, VEYA/VE etkilenmez) */
  private ortu(kume: bigint): number[] | null {
    const sec: number[] = [];
    let kalan = kume;
    while (kalan) {
      let en = -1;
      let enPuan = -Infinity;
      this.hatlar.forEach((h, i) => {
        if ((h.kapsam & ~kume) !== 0n) return;
        const yeni = bitSay(h.kapsam & kalan);
        if (!yeni) return;
        // henüz kurulmamış hat: maliyeti iki kat sayılır (yalnız gerçekten işe yarıyorsa kurulsun)
        const puan = yeni - (h.net ? 0 : h.maliyet * 2);
        if (puan > enPuan) {
          enPuan = puan;
          en = i;
        }
      });
      if (en < 0) return null;
      sec.push(en);
      kalan &= ~this.hatlar[en].kapsam;
    }
    // gereksiz hatları at
    return sec.filter((i, k) => {
      const digerleri = sec.filter((j, m) => m !== k && j !== -1).reduce((a, j) => a | this.hatlar[j].kapsam, 0n);
      const gereksiz = (this.hatlar[i].kapsam & ~digerleri) === 0n;
      if (gereksiz) sec[k] = -1;
      return !gereksiz;
    });
  }

  /** Bir çözümün kapı maliyeti (n girişle) */
  private pay(bicim: Bicim, kutuplar: Set<Kutup>, n: number, yuksekVar = false): number {
    let toplam = 0;
    let ilk = true;
    const ters = (m: number) => (m === 1 && yuksekVar ? 0 : nandPay(m));
    for (const k of kutuplar) {
      let p: number;
      if (k === "L") p = bicim === "icerir" ? 0.03 * n : ters(n);
      else {
        const ve = (bicim === "icerir") === (k === "D");
        p = ve ? andPay(n) : ters(n);
      }
      toplam += ilk ? p : Math.min(p, PAY.not);
      ilk = false;
    }
    return toplam;
  }

  private yuksekVar(ogeler: number[]): boolean {
    return ogeler.length === 1 && ogeler[0] < this.hatlar.length && this.hatlar[ogeler[0]].yuksek !== undefined;
  }

  private hatMaliyeti(ogeler: number[]): number {
    return ogeler.reduce((a, i) => a + (this.hatlar[i].net ? 0 : this.hatlar[i].maliyet), 0);
  }

  cozumle(): void {
    // 1. her küme: içerir ya da dışarıda biçimi
    for (const [kume, kutuplar] of this.istekler) {
      if (kume === 0n || kume === this.evren) {
        this.cozum.set(kume, { bicim: "sabit", sabit: kume === 0n ? 0 : 1, ogeler: [], kutuplar, netler: {} });
        continue;
      }
      const ic = this.ortu(kume);
      const dis = this.ortu(this.evren & ~kume);
      const m = (b: Bicim, o: number[] | null) => (o ? this.pay(b, kutuplar, o.length, this.yuksekVar(o)) + this.hatMaliyeti(o) : Infinity);
      const mi = m("icerir", ic), md = m("disarida", dis);
      if (mi === Infinity && md === Infinity) throw new Error(`küme hatlarla kurulamıyor: ${kume.toString(2)}`);
      const bicim: Bicim = mi <= md ? "icerir" : "disarida";
      this.cozum.set(kume, { bicim, ogeler: (bicim === "icerir" ? ic : dis)!, kutuplar, netler: {} });
    }
    // 2. ortak alt kümeler: en çok kazandıran öğe çiftini düğüm yap, tekrarla
    const listeler = [...this.cozum.values()].filter((c) => c.bicim !== "sabit");
    for (;;) {
      const ciftler = new Map<string, { a: number; b: number; kazanc: number }>();
      for (const c of listeler) {
        const n = c.ogeler.length;
        if (n < 2) continue;
        const fark = this.pay(c.bicim as Bicim, c.kutuplar, n) - this.pay(c.bicim as Bicim, c.kutuplar, n - 1);
        const s = [...c.ogeler].sort((x, z) => x - z);
        for (let i = 0; i < s.length; i++) {
          for (let j = i + 1; j < s.length; j++) {
            const k = `${s[i]},${s[j]}`;
            const e = ciftler.get(k) ?? { a: s[i], b: s[j], kazanc: -andPay(2) };
            e.kazanc += fark;
            ciftler.set(k, e);
          }
        }
      }
      let en: { a: number; b: number; kazanc: number } | null = null;
      for (const e of ciftler.values()) if (!en || e.kazanc > en.kazanc + 1e-9) en = e;
      if (!en || en.kazanc <= 1e-9) break;
      const id = this.hatlar.length + this.dugumler.length;
      this.dugumler.push({ a: en.a, b: en.b });
      for (const c of listeler) {
        if (c.ogeler.includes(en.a) && c.ogeler.includes(en.b)) c.ogeler = [...c.ogeler.filter((x) => x !== en!.a && x !== en!.b), id];
      }
    }
  }

  private ogeNet(i: number): string {
    if (i < this.hatlar.length) {
      const h = this.hatlar[i];
      if (!h.net) h.net = h.uret!();
      return h.net;
    }
    const d = this.dugumler[i - this.hatlar.length];
    if (!d.net) d.net = this.y.and([this.ogeNet(d.a), this.ogeNet(d.b)], undefined, "ortak alt küme");
    return d.net;
  }

  private cozumu(kume: bigint): Cozum {
    if (kume === 0n || kume === this.evren) return { bicim: "sabit", sabit: kume === 0n ? 0 : 1, ogeler: [], kutuplar: new Set(), netler: {} };
    const c = this.cozum.get(kume);
    if (!c) throw new Error("istenmemiş küme");
    return c;
  }

  /** Aktif yüksek (Y) ya da aktif düşük (D) küme sinyali */
  net(kume: bigint, kutup: "Y" | "D", rol: string): Cikis {
    const c = this.cozumu(kume);
    if (c.bicim === "sabit") return (kutup === "Y" ? c.sabit : 1 - c.sabit!) as 0 | 1;
    const var_ = c.netler[kutup];
    if (var_ !== undefined) return var_ as Cikis;
    const tekYuksek = c.ogeler.length === 1 && c.ogeler[0] < this.hatlar.length ? this.hatlar[c.ogeler[0]].yuksek : undefined;
    if (tekYuksek !== undefined && (c.bicim === "icerir") === (kutup === "Y")) return (c.netler[kutup] = tekYuksek);
    const diger = c.netler[kutup === "Y" ? "D" : "Y"];
    const girdiler = c.ogeler.map((i) => this.ogeNet(i));
    let net: string;
    if (typeof diger === "string" && girdiler.length > 1) net = this.y.not(diger, undefined, rol);
    else {
      const ve = (c.bicim === "icerir") === (kutup === "D");
      net = ve ? this.y.and(girdiler, undefined, rol) : this.y.nand(girdiler, undefined, rol);
    }
    c.netler[kutup] = net;
    return net;
  }

  /** Aktif düşük giriş listesi: AND'ı ¬küme olan netler (tüketici NAND'ına düzleşir) */
  liste(kume: bigint, rol: string): string[] | 0 | 1 {
    const c = this.cozumu(kume);
    if (c.bicim === "sabit") return c.sabit!;
    if (c.bicim === "icerir") return c.ogeler.map((i) => this.ogeNet(i));
    return [this.net(kume, "D", rol) as string];
  }
}

// ------------------------------------------------------------------------------------------------
// Mikrokod

/**
 * Bir kontrol biti adım 0..7'nin en az bu kadarında 1 olabiliyorsa 74HC151 ile kurulur (çip başına
 * sekiz adım terimi); daha seyrek bitler adım ∧ küme terimleriyle. 3 ve 5 de denendi: 4 en az çip.
 */
const MUX_ESIGI = 4;

interface Atom {
  op: number;
  /** (f3 << 1 | cond) değerleri */
  parca: number[];
}

function bit(w: number, b: number): boolean {
  return ((w >>> b) & 1) === 1;
}

function mikrokodDevresi(y: Yazici, rom: Uint32Array): Cikis[] {
  const G = KONTROL_GIRISLERI;
  y.blok = BLOK_KONTROL;
  // ---- INT = 1: kelime yalnızca adıma bağlı olmalı (kesme girişi)
  const irq = Array.from({ length: 16 }, (_, s) => rom[romAddress(true, 0, 0, false, s)]);
  for (let op = 0; op < 16; op++)
    for (let f3 = 0; f3 < 8; f3++)
      for (const c of [false, true])
        for (let s = 0; s < 16; s++)
          if (rom[romAddress(true, op, f3, c, s)] !== irq[s]) throw new Error("kesme mikro programı komuta bağlı: desteklenmiyor");

  // ---- atomlar: her op'un (f3, COND) değerlerini aynı mikro programa göre böl
  const imza = (op: number, fc: number) => Array.from({ length: 16 }, (_, s) => rom[romAddress(false, op, fc >> 1, (fc & 1) === 1, s)]).join(",");
  const atomlar: Atom[] = [];
  const opAtomlari: number[][] = [];
  for (let op = 0; op < 16; op++) {
    const gruplar = new Map<string, number[]>();
    for (let fc = 0; fc < 16; fc++) {
      const k = imza(op, fc);
      if (!gruplar.has(k)) gruplar.set(k, []);
      gruplar.get(k)!.push(fc);
    }
    opAtomlari.push([]);
    for (const parca of gruplar.values()) {
      opAtomlari[op].push(atomlar.length);
      atomlar.push({ op, parca });
    }
  }
  const IRQ = atomlar.length;
  const evren = (1n << BigInt(IRQ + 1)) - 1n;
  const kelime = (s: number, a: number): number => {
    if (a === IRQ) return irq[s];
    const { op, parca } = atomlar[a];
    return rom[romAddress(false, op, parca[0] >> 1, (parca[0] & 1) === 1, s)];
  };

  // ---- kod çözücüler: adım 0..7 (her zaman: ~ADIM0 aynı zamanda INT mantığının "adım 0"ı), komut
  const adimHat = Array.from({ length: 16 }, (_, s) => `~ADIM${s}`);
  const baglanti138 = (a: readonly string[], e1: string, e2: string, e3: string, cik: (string | null)[]) => {
    const p: Record<string, string> = { A0: a[0], A1: a[1], A2: a[2], "~E1": e1, "~E2": e2, E3: e3 };
    cik.forEach((n, k) => {
      if (n) p[`~Y${k}`] = n;
    });
    return p;
  };
  y.cip("74HC138", "adim", baglanti138(G.adim, G.adim[3], "GND", "VCC", adimHat.slice(0, 8)), "adım çözücü: adım 0..7");
  // adım 8..15: yalnızca tek bir atom (ör. SWI) bu adımlara ulaşıyorsa çözücü o atomun hattıyla
  // açılır; çıkışları doğrudan "atom ∧ adım" terimleridir (yuksekAtom, aşağıda belirlenir)
  let yuksekAdim = false;
  let yuksekAtom = -1;
  const adimNet = (s: number): string => {
    if (s >= 8 && !yuksekAdim) {
      yuksekAdim = true;
      if (yuksekAtom >= 0) {
        const hat = adimHat.slice(8).map((n) => `${n}_A`);
        adimHat.splice(8, 8, ...hat);
        y.cip("74HC138", "adim", baglanti138(G.adim, hatNet(atomHatIdx(yuksekAtom)), "GND", G.adim[3], hat), "adım çözücü: adım 8..15 (yalnızca uzun komut)");
      } else y.cip("74HC138", "adim", baglanti138(G.adim, "GND", "GND", G.adim[3], adimHat.slice(8)), "adım çözücü: adım 8..15");
    }
    return adimHat[s];
  };
  const opHat = Array.from({ length: 16 }, (_, k) => `~KOP${k}`);
  y.cip("74HC138", "komut", baglanti138(G.op, G.op[3], G.int, "VCC", opHat.slice(0, 8)), "komut çözücü: op 0..7 (INT = 1 iken pasif)");
  y.cip("74HC138", "komut", baglanti138(G.op, G.int, "GND", G.op[3], opHat.slice(8)), "komut çözücü: op 8..15 (INT = 1 iken pasif)");

  // ---- tembel yardımcılar
  const tersler = new Map<string, string>();
  const ters = (net: string, ad: string, rol: string) => {
    if (!tersler.has(net)) tersler.set(net, y.not(net, ad, rol));
    return tersler.get(net)!;
  };
  const altCozucu = new Map<number, string[]>();
  const altHat = (op: number, f3: number): string => {
    if (!altCozucu.has(op)) {
      const hat = Array.from({ length: 8 }, (_, f) => `~KOP${op}_F${f}`);
      y.cip("74HC138", "komut", baglanti138(G.f3, opHat[op], "GND", "VCC", hat), `op ${op} alt çözücü: f3`);
      altCozucu.set(op, hat);
    }
    return altCozucu.get(op)![f3];
  };
  /** f3 = v ise 1 (aktif yüksek) */
  const f3Esit = (v: number): string => {
    const lit = G.f3.map((n, i) => ((v >> i) & 1 ? n : ters(n, `~${n}`, "f3 çözme")));
    return y.not(y.nand(lit, undefined, "f3 çözme"), undefined, "f3 çözme");
  };

  // ---- atom hatları (aktif düşük)
  const hatlar: Hat[] = [];
  for (let op = 0; op < 16; op++) {
    const kapsam = opAtomlari[op].reduce((a, i) => a | (1n << BigInt(i)), 0n);
    hatlar.push({ kapsam, net: opHat[op], maliyet: 0 });
  }
  for (let op = 0; op < 16; op++) {
    const ids = opAtomlari[op];
    if (ids.length === 1) continue;
    // yalnızca COND'a bağlı: iki parça, her biri 8 f3 değerinin hepsi ve tek COND değeri
    const condBagli = ids.length === 2 && ids.every((i) => atomlar[i].parca.length === 8 && new Set(atomlar[i].parca.map((fc) => fc & 1)).size === 1);
    const f3Bagli = ids.every((i) => atomlar[i].parca.every((fc) => atomlar[i].parca.includes(fc ^ 1)));
    for (const i of ids) {
      const parca = atomlar[i].parca;
      let uret: () => string;
      let maliyet: number;
      const rol = `komut sınıfı: op ${op}`;
      if (condBagli) {
        // yalnızca COND'a bağlı: ~atom = ~KOPk ∨ ¬(COND = c)
        const c = parca[0] & 1;
        uret = () => y.or(opHat[op], c ? ters(G.cond, "~COND", "koşul tersi") : G.cond, `~KOP${op}_C${c}`, rol);
        maliyet = PAY["or/2"];
      } else if (f3Bagli) {
        const f3ler = [...new Set(parca.map((fc) => fc >> 1))].sort((a, b) => a - b);
        const tumf = Array.from({ length: 8 }, (_, f) => f);
        const disari = tumf.filter((f) => !f3ler.includes(f));
        if (ids.length === 2 && (f3ler.length === 1 || disari.length === 1)) {
          // iki parça, biri tek f3: alt çözücü yerine kapılar (op 0: CMP = f3 7)
          const tek = f3ler.length === 1 ? f3ler[0] : disari[0];
          const esit = () => f3Esit(tek);
          uret = f3ler.length === 1
            ? () => y.or(opHat[op], ters(esit(), `~F${tek}`, "f3 çözme"), undefined, rol)
            : () => y.or(opHat[op], esit(), undefined, rol);
          maliyet = PAY["or/2"] + 0.3;
        } else if (f3ler.length === 1) {
          uret = () => altHat(op, f3ler[0]);
          maliyet = 0.1;
        } else if (f3ler.length <= disari.length + 1) {
          uret = () => y.and(f3ler.map((f) => altHat(op, f)), undefined, rol);
          maliyet = andPay(f3ler.length);
        } else {
          // ¬(op ∧ f3 ∉ dışarı) = NAND(op, dışarıdakilerin hatları)
          uret = () => y.nand([ters(opHat[op], `KOP${op}`, "komut"), ...disari.map((f) => altHat(op, f))], undefined, rol);
          maliyet = nandPay(disari.length + 1) + PAY.not;
        }
      } else {
        throw new Error(`op ${op}: hem f3'e hem COND'a bağlı mikro program: desteklenmiyor`);
      }
      hatlar.push({ kapsam: 1n << BigInt(i), uret, maliyet });
    }
  }
  hatlar.push({ kapsam: 1n << BigInt(IRQ), uret: () => ters(G.int, "~INT", "kesme girişi"), maliyet: PAY.not, yuksek: G.int });
  const atomHatti = hatlar.length;
  const hatNet = (i: number) => {
    const h = hatlar[i];
    if (!h.net) h.net = h.uret!();
    return h.net;
  };
  /** atomun kendi hattı: kapsamı tam olarak o atom (op hattı tek atomluysa op hattı) */
  const atomHatIdx = (a: number) => hatlar.findIndex((h, i) => i < atomHatti && h.kapsam === 1n << BigInt(a));
  // aynı mikro programı çalıştıran atomlar (ör. bütün yasadışı komutlar): birleşik hat = hatlarının AND'ı
  const siniflar = new Map<string, number[]>();
  for (let a = 0; a < IRQ; a++) {
    const k = Array.from({ length: 16 }, (_, st) => kelime(st, a)).join(",");
    if (!siniflar.has(k)) siniflar.set(k, []);
    siniflar.get(k)!.push(a);
  }
  for (const uyeler of siniflar.values()) {
    if (uyeler.length < 2) continue;
    const ids = uyeler.map(atomHatIdx);
    hatlar.push({
      kapsam: uyeler.reduce((x, a) => x | (1n << BigInt(a)), 0n),
      uret: () => y.and(ids.map(hatNet), undefined, "aynı mikro program"),
      maliyet: andPay(uyeler.length),
    });
  }
  const agi = new VeyaAgi(y, evren, hatlar);

  // ---- her bit, her adım: biti 1 olan atomlar
  const kume = (b: number, s: number) => {
    let k = 0n;
    for (let a = 0; a <= IRQ; a++) if (bit(kelime(s, a), b)) k |= 1n << BigInt(a);
    return k;
  };
  interface Plan {
    /** 74HC151 ile mi (adım 0..7) */
    mux: boolean;
    /** adım → küme */
    adimlar: Map<number, bigint>;
  }
  const planlar: Plan[] = [];
  let yuksekKumeler = 0n;
  for (let b = 0; b < 32; b++) {
    const adimlar = new Map<number, bigint>();
    for (let s = 0; s < 16; s++) {
      const k = kume(b, s);
      if (k) adimlar.set(s, k);
    }
    const mux = [...adimlar.keys()].filter((s) => s < 8).length >= MUX_ESIGI;
    for (const [s, k] of adimlar) if (s >= 8) yuksekKumeler |= k;
    planlar.push({ mux, adimlar });
    // seçicinin veri girişi aktif yüksek küme ister; adım terimleri aktif düşük
    for (const [s, k] of adimlar) agi.iste(k, mux && s < 8 ? "Y" : "D");
  }
  agi.cozumle();
  if (bitSay(yuksekKumeler) === 1) yuksekAtom = yuksekKumeler.toString(2).length - 1;
  const atomlu = (s: number, k: bigint) => s >= 8 && yuksekAtom >= 0 && k === 1n << BigInt(yuksekAtom);

  // ---- adım boyutu
  const mk: Cikis[] = [];
  const terimler = (adimlar: [number, bigint][], rol: string): string[] => {
    // aynı kümeli adımlar birleşir: ¬T = ¬(adımlar) ∨ ¬küme (atomla açılan çözücünün hatlarında küme zaten içeride)
    const gruplar = new Map<string, { k: bigint; ss: number[] }>();
    for (const [s, k] of adimlar) {
      const anahtar = `${k}|${atomlu(s, k)}`;
      if (!gruplar.has(anahtar)) gruplar.set(anahtar, { k, ss: [] });
      gruplar.get(anahtar)!.ss.push(s);
    }
    return [...gruplar.values()].map(({ k, ss }) => {
      const nAdim = y.and(ss.map(adimNet), undefined, rol);
      if (atomlu(ss[0], k)) return nAdim;
      const nKume = agi.net(k, "D", rol);
      return nKume === 1 ? nAdim : y.or(nAdim, nKume as string, undefined, rol);
    });
  };
  planlar.forEach((p, b) => {
    const rol = `CW${b}`;
    const ad = `MK${b}`;
    if (!p.adimlar.size) return void (mk[b] = 0);
    const yuksek = [...p.adimlar].filter(([s]) => s >= 8);
    if (p.mux) {
      // ~E = STEP3: adım 8..15'te Y = 0
      const conn: Record<string, string> = { S0: G.adim[0], S1: G.adim[1], S2: G.adim[2], "~E": G.adim[3] };
      for (let s = 0; s < 8; s++) {
        const n = agi.net(p.adimlar.get(s) ?? 0n, "Y", rol);
        conn[`I${s}`] = n === 0 ? "GND" : n === 1 ? "VCC" : n;
      }
      if (!yuksek.length) {
        conn.Y = ad;
        y.cip("74HC151", "cw", conn, `CW${b}: adım seçici (adım 0..7)`);
        mk[b] = ad;
      } else {
        conn["~Y"] = `~${ad}_0`;
        y.cip("74HC151", "cw", conn, `CW${b}: adım seçici (adım 0..7)`);
        mk[b] = y.nand([conn["~Y"], ...terimler(yuksek, rol)], ad, rol);
      }
      return;
    }
    const t = [...p.adimlar];
    const gruplar = new Set(t.map(([s, k]) => `${k}|${atomlu(s, k)}`));
    if (gruplar.size === 1 && !atomlu(t[0][0], t[0][1])) {
      // tek terim: bit = adımlar ∧ küme = NOR(¬adımlar, ¬küme)
      const k = t[0][1];
      const nAdim = y.and(t.map(([s]) => adimNet(s)), undefined, rol);
      const nKume = agi.net(k, "D", rol);
      mk[b] = nKume === 1 ? y.not(nAdim, ad, rol) : y.nor([nAdim, nKume as string], ad, rol);
      return;
    }
    mk[b] = y.nand(terimler(t, rol), ad, rol);
  });
  return mk;
}

// ------------------------------------------------------------------------------------------------
// ALU kod çözme

function aluDevresi(y: Yazici): Cikis[] {
  const G = KONTROL_GIRISLERI;
  y.blok = BLOK_ALU_KOD;
  const evren = (1n << 32n) - 1n;
  const tablo = Array.from({ length: ALU_ADRES }, (_, a) => aluKelimesi(a));
  // her işlem değeri, her bit: (h, c) → 4 bitlik doğruluk tablosu (indeks h + 2c)
  const davranis = (v: number, b: number) => {
    let t = 0;
    for (let hc = 0; hc < 4; hc++) if (bit(tablo[v | ((hc & 1) << 5) | ((hc >> 1) << 6)], b)) t |= 1 << hc;
    return t;
  };
  // varsayılan davranış: 8'li blokta bundan farklı değer yoksa blok çözülmez
  const imza = (v: number) => Array.from({ length: 24 }, (_, b) => davranis(v, b)).join(",");
  const say = new Map<string, number>();
  for (let v = 0; v < 32; v++) say.set(imza(v), (say.get(imza(v)) ?? 0) + 1);
  const varsayilan = [...say].sort((a, b) => b[1] - a[1])[0][0];

  const hatlar: Hat[] = [];
  const blokNet = (blok: number): (string | null)[] => {
    return Array.from({ length: 8 }, (_, k) => {
      const v = 8 * blok + k;
      return imza(v) === varsayilan ? null : `~AIS${v}`;
    });
  };
  const bloklar = new Map<number, (string | null)[]>();
  const bloklariKur = (blok: number) => {
    if (bloklar.has(blok)) return;
    const n = blokNet(blok);
    bloklar.set(blok, n);
    const p: Record<string, string> = { A0: G.aop[0], A1: G.aop[1], A2: G.aop[2] };
    if (blok === 0) Object.assign(p, { "~E1": G.aop[3], "~E2": G.aop[4], E3: "VCC" });
    else if (blok === 1) Object.assign(p, { "~E1": G.aop[4], "~E2": "GND", E3: G.aop[3] });
    else if (blok === 2) Object.assign(p, { "~E1": G.aop[3], "~E2": "GND", E3: G.aop[4] });
    else Object.assign(p, { "~E1": y.nand([G.aop[3], G.aop[4]], undefined, "işlem 24..31"), "~E2": "GND", E3: "VCC" });
    n.forEach((x, k) => {
      if (x) p[`~Y${k}`] = x;
    });
    y.cip("74HC138", "alu", p, `ALU işlem çözücü: ${8 * blok}..${8 * blok + 7}`, n.filter((x): x is string => x !== null));
  };
  for (let v = 0; v < 32; v++) {
    const blok = v >> 3;
    if (imza(v) === varsayilan) continue;
    hatlar.push({ kapsam: 1n << BigInt(v), uret: () => (bloklariKur(blok), `~AIS${v}`), maliyet: 0.02 });
  }
  // ikili gruplar: AOPi = 0 (aktif düşük hat = AOPi'nin kendisi) ve AOPi = 1 (¬AOPi)
  for (let i = 0; i < 5; i++) {
    let sifir = 0n;
    for (let v = 0; v < 32; v++) if (!((v >> i) & 1)) sifir |= 1n << BigInt(v);
    hatlar.push({ kapsam: sifir, net: G.aop[i], maliyet: 0 });
    hatlar.push({ kapsam: evren & ~sifir, uret: () => y.not(G.aop[i], `~${G.aop[i]}`, "işlem biti tersi"), maliyet: PAY.not });
  }
  const agi = new VeyaAgi(y, evren, hatlar);

  // her bit: değerleri (h, c) davranışına göre grupla
  const planlar = Array.from({ length: 24 }, (_, b) => {
    const gruplar = new Map<number, bigint>();
    for (let v = 0; v < 32; v++) {
      const d = davranis(v, b);
      if (d) gruplar.set(d, (gruplar.get(d) ?? 0n) | (1n << BigInt(v)));
    }
    return gruplar;
  });
  planlar.forEach((g) => {
    const tek = g.size === 1;
    for (const [d, k] of g) {
      if (d === 0b1111) agi.iste(k, tek ? "Y" : "L");
      else agi.iste(k, "D");
    }
  });
  agi.cozumle();

  // (h, c) davranışının aktif yüksek ve aktif düşük hali
  const hN = () => y.not(G.h, `~${G.h}`, "h biti tersi");
  const literal = (d: number): [hi: string, lo: string] => {
    switch (d) {
      case 0b1100: return [G.c, G.cN];
      case 0b0011: return [G.cN, G.c];
      case 0b1010: return [G.h, hN()];
      case 0b0101: return [hN(), G.h];
      default: {
        // genel: dört satırın VEYA'sı
        const satirlar: string[] = [];
        for (let hc = 0; hc < 4; hc++) {
          if (!((d >> hc) & 1)) continue;
          satirlar.push(y.nand([hc & 1 ? G.h : hN(), hc & 2 ? G.c : G.cN], undefined, "h, C birleşimi"));
        }
        const hi = y.nand(satirlar, undefined, "h, C birleşimi");
        return [hi, y.not(hi, undefined, "h, C birleşimi")];
      }
    }
  };
  const ad: Cikis[] = [];
  planlar.forEach((g, b) => {
    const isim = `AD${b}`;
    const rol = `ALU kontrol biti ${b}`;
    if (!g.size) return void (ad[b] = 0);
    const terimler: string[] = [];
    let bir: bigint | null = null;
    for (const [d, k] of g) {
      if (d === 0b1111) bir = k;
      else {
        const [, lo] = literal(d);
        const nk = agi.net(k, "D", rol);
        if (g.size === 1) {
          ad[b] = nk === 1 ? y.not(lo, isim, rol, true) : y.nor([lo, nk as string], isim, rol, true);
          return;
        }
        terimler.push(nk === 1 ? lo : y.or(lo, nk as string, undefined, rol));
      }
    }
    if (bir !== null && g.size === 1) {
      const n = agi.net(bir, "Y", rol);
      if (typeof n !== "string") return void (ad[b] = n);
      ad[b] = y.adlandir(n, isim, rol);
      return;
    }
    const l = bir === null ? [] : agi.liste(bir, rol);
    if (l === 1) return void (ad[b] = 1);
    ad[b] = y.nand([...(l === 0 ? [] : l), ...terimler], isim, rol, true);
  });
  return ad;
}

// ------------------------------------------------------------------------------------------------

let onbellek: { kaynak: string; devre: KontrolDevresi } | null = null;

/** Mikrokod kaynağından kontrol devresi (aynı kaynak için önbellekten) */
export function kontrolDevresi(kaynak: string = UCODE_KAYNAGI): KontrolDevresi {
  if (onbellek?.kaynak === kaynak) return onbellek.devre;
  const micro = assembleMicrocode(kaynak);
  if (micro.errors.length) throw new Error(`mikrokod: ${micro.errors.map((e) => `satır ${e.line}: ${e.message}`).join("; ")}`);
  const y = new Yazici("kb");
  const mk = mikrokodDevresi(y, micro.rom);
  const ya = new Yazici("ak");
  const ad = aluDevresi(ya);
  y.sonlandir();
  ya.sonlandir();
  const son = (yz: Yazici) => (c: Cikis): Cikis => (typeof c === "string" ? yz.ad(c) : c);
  const devre: KontrolDevresi = { elemanlar: [...y.elemanlar, ...ya.elemanlar], mk: mk.map(son(y)), ad: ad.map(son(ya)) };
  onbellek = { kaynak, devre };
  return devre;
}

// ------------------------------------------------------------------------------------------------
// Soyut devreyi değerlendirme (üretecin kendi denetimi ve özet için; asıl kanıt kart üzerinde LogicSim)

export function devreyiDegerlendir(d: KontrolDevresi, giris: Record<string, boolean>): (n: string) => boolean {
  const v = new Map<string, boolean>(Object.entries(giris));
  v.set("GND", false);
  v.set("VCC", true);
  const al = (n: string) => {
    const x = v.get(n);
    if (x === undefined) throw new Error(`değeri yok: ${n}`);
    return x;
  };
  for (const e of d.elemanlar) {
    if (e.tur === "kapi") {
      const g = e.giris.map(al);
      const r = { and: g.every(Boolean), nand: !g.every(Boolean), or: g.some(Boolean), nor: !g.some(Boolean), not: !g[0] }[e.islev];
      v.set(e.cikis, r);
    } else if (e.parca === "74HC138") {
      const p = e.baglanti;
      const en = !al(p["~E1"]) && !al(p["~E2"]) && al(p.E3);
      const sec = (al(p.A0) ? 1 : 0) | (al(p.A1) ? 2 : 0) | (al(p.A2) ? 4 : 0);
      for (let k = 0; k < 8; k++) if (p[`~Y${k}`]) v.set(p[`~Y${k}`], !(en && sec === k));
    } else {
      const p = e.baglanti;
      const sec = (al(p.S0) ? 1 : 0) | (al(p.S1) ? 2 : 0) | (al(p.S2) ? 4 : 0);
      const y = !al(p["~E"]) && al(p[`I${sec}`]);
      if (p.Y) v.set(p.Y, y);
      if (p["~Y"]) v.set(p["~Y"], !y);
    }
  }
  return al;
}

/** Üretilen devrenin bütün adreslerde tabloyla aynı olduğunu denetler (soyut devre üzerinde) */
export function devreyiDenetle(d: KontrolDevresi, rom: Uint32Array): string[] {
  const G = KONTROL_GIRISLERI;
  const hatalar: string[] = [];
  const deger = (c: Cikis, al: (n: string) => boolean) => (typeof c === "string" ? al(c) : c === 1);
  for (let a = 0; a < rom.length && hatalar.length < 10; a++) {
    const g: Record<string, boolean> = {};
    G.adim.forEach((n, i) => (g[n] = ((a >> i) & 1) === 1));
    g[G.cond] = ((a >> 4) & 1) === 1;
    G.f3.forEach((n, i) => (g[n] = ((a >> (5 + i)) & 1) === 1));
    G.op.forEach((n, i) => (g[n] = ((a >> (8 + i)) & 1) === 1));
    g[G.int] = ((a >> 12) & 1) === 1;
    G.aop.forEach((n) => (g[n] = false));
    g[G.h] = false;
    g[G.c] = false;
    g[G.cN] = true;
    const al = devreyiDegerlendir(d, g);
    let w = 0;
    d.mk.forEach((c, b) => (w |= (deger(c, al) ? 1 : 0) << b));
    if (w >>> 0 !== rom[a]) hatalar.push(`mikrokod adres ${a}: ${(w >>> 0).toString(16)} ≠ ${rom[a].toString(16)}`);
  }
  for (let a = 0; a < ALU_ADRES && hatalar.length < 10; a++) {
    const g: Record<string, boolean> = {};
    G.adim.forEach((n) => (g[n] = false));
    [G.cond, G.int, ...G.f3, ...G.op].forEach((n) => (g[n] = false));
    G.aop.forEach((n, i) => (g[n] = ((a >> i) & 1) === 1));
    g[G.h] = ((a >> 5) & 1) === 1;
    g[G.c] = ((a >> 6) & 1) === 1;
    g[G.cN] = !g[G.c];
    const al = devreyiDegerlendir(d, g);
    let w = 0;
    d.ad.forEach((c, b) => (w |= (deger(c, al) ? 1 : 0) << b));
    if (w !== aluKelimesi(a)) hatalar.push(`ALU adres ${a}: ${w.toString(16)} ≠ ${aluKelimesi(a).toString(16)}`);
  }
  return hatalar;
}

// ------------------------------------------------------------------------------------------------
// Karta yerleştirme

export interface KontrolBirimi {
  /** CR'nin D girişleri */
  mk: Cikis[];
  /** ALU kontrol bitleri */
  ad: Cikis[];
  /** yerleştirilen MSI çipleri (74HC138, 74HC151); kapılar yapıştırıcı lojik çiplerine paketlenir */
  cipler: ChipInstance[];
}

/**
 * Kontrol birimini karta yerleştirir. Kapılar hemen eklenir (Board.flexibleGlue: kartın diğer
 * yapıştırıcı çiplerinden sonra paketlenir, boş birimleri doldurur). MSI çipleri yuva yuva:
 * yerlestir() bir çipi kartın o anki sırasına koyar (ör. eski ROM'ların yuvaları, böylece kartın
 * diğer çiplerinin referansları değişmez), kalanlariErtele() geri kalanını kartın yapıştırıcı
 * çiplerinden sonraya bırakır. Netler adlı olduğu için yerleştirme sırası devreyi değiştirmez.
 */
export class KontrolYerlestirici implements KontrolBirimi {
  readonly mk: Cikis[];
  readonly ad: Cikis[];
  readonly cipler: ChipInstance[] = [];
  private readonly b: Board;
  private readonly kalan: Cip[];

  constructor(b: Board, d: KontrolDevresi = kontrolDevresi()) {
    this.b = b;
    this.mk = d.mk;
    this.ad = d.ad;
    this.kalan = d.elemanlar.filter((e): e is Cip => e.tur === "cip");
    const eskiBlok = b.block;
    const eskiEsnek = b.flexibleGlue;
    b.flexibleGlue = true;
    for (const e of d.elemanlar) {
      if (e.tur !== "kapi") continue;
      b.block = e.blok;
      const g = e.giris;
      const rol = e.rol;
      switch (e.islev) {
        case "not": b.not(g[0], e.cikis, rol); break;
        case "or": b.or(g[0], g[1], e.cikis, rol); break;
        case "nor": g.length === 2 ? b.nor(g[0], g[1], e.cikis, rol) : b.nor3(g[0], g[1], g[2], e.cikis, rol); break;
        case "and":
          if (g.length === 2) b.and(g[0], g[1], e.cikis, rol);
          else if (g.length === 3) b.and3(g[0], g[1], g[2], e.cikis, rol);
          else b.and4(g[0], g[1], g[2], g[3], e.cikis, rol);
          break;
        case "nand":
          if (g.length === 2) b.nand(g[0], g[1], e.cikis, rol);
          else if (g.length === 3) b.nand3(g[0], g[1], g[2], e.cikis, rol);
          else if (g.length === 4) b.nand4(g[0], g[1], g[2], g[3], e.cikis, rol);
          else b.nand8(g, e.cikis, rol);
          break;
      }
    }
    b.flexibleGlue = eskiEsnek;
    b.block = eskiBlok;
  }

  /**
   * Görevi `gorev` olan çiplerden rolü sırada ilk olanı (op 0..7, op 8..15, …; yoksa sıradaki
   * herhangi bir çipi) şimdi yerleştir; çip kalmadıysa null
   */
  yerlestir(gorev?: CipTuru): ChipInstance | null {
    let i = -1;
    this.kalan.forEach((c, k) => {
      if (c.gorev === gorev && (i < 0 || c.rol.localeCompare(this.kalan[i].rol, "tr", { numeric: true }) < 0)) i = k;
    });
    if (i < 0) i = 0;
    const c = this.kalan.splice(i, 1)[0];
    if (!c) return null;
    const eskiBlok = this.b.block;
    this.b.block = c.blok;
    const inst = this.b.place(c.parca, c.baglanti, c.rol);
    this.b.block = eskiBlok;
    this.cipler.push(inst);
    return inst;
  }

  /** Kalan bütün çipleri şimdi yerleştir */
  hepsi(): void {
    while (this.yerlestir()) {}
  }

  /** Kalan çipleri kartın yapıştırıcı çiplerinden sonraya ertele (Board.defer) */
  kalanlariErtele(): void {
    this.b.defer(() => this.hepsi());
  }
}

/** Kontrol birimini tek seferde yerleştir (bütün çipler şimdi; ör. testte tek başına bir kart) */
export function kontrolBirimiKur(b: Board, d: KontrolDevresi = kontrolDevresi()): KontrolBirimi {
  const k = new KontrolYerlestirici(b, d);
  k.hepsi();
  return k;
}

// ------------------------------------------------------------------------------------------------
// Özet (CLI ve belgeler)

export interface KontrolOzeti {
  /** blok → parça → adet (kapılar türüne göre, paketlenmeden önce) */
  msi: Record<string, Record<string, number>>;
  kapilar: Record<string, Record<string, number>>;
}

export function kontrolOzeti(d: KontrolDevresi = kontrolDevresi()): KontrolOzeti {
  const msi: KontrolOzeti["msi"] = {};
  const kapilar: KontrolOzeti["kapilar"] = {};
  for (const e of d.elemanlar) {
    if (e.tur === "cip") {
      msi[e.blok] ??= {};
      msi[e.blok][e.parca] = (msi[e.blok][e.parca] ?? 0) + 1;
    } else {
      const k = e.islev === "not" ? "not" : `${e.islev}${e.giris.length}`;
      kapilar[e.blok] ??= {};
      kapilar[e.blok][k] = (kapilar[e.blok][k] ?? 0) + 1;
    }
  }
  return { msi, kapilar };
}

/** cpu16/micro/cpu16-ucode.ts: .ucode metninin gömülü kopyası */
export function gomuluUcodeDosyasi(kaynak: string): { path: string; content: string } {
  const satirlar = kaynak.replace(/\n$/, "").split("\n");
  const content = [
    "// Bu dosya üretilir (npm run cpu16 -- kontrol); elle değiştirme. Kaynak: cpu16/micro/cpu16.ucode.",
    "// Kart tanımı (kontrol birimi üreteci, board/kontrol.ts) mikrokodu tarayıcıda ve Node'da dosya",
    "// okumadan buradan alır; testler bu kopyanın .ucode dosyasıyla aynı olduğunu denetler.",
    "",
    "export const UCODE_KAYNAGI = [",
    ...satirlar.map((s) => `  ${JSON.stringify(s)},`),
    '].join("\\n") + "\\n";',
    "",
  ].join("\n");
  return { path: "cpu16/micro/cpu16-ucode.ts", content };
}
