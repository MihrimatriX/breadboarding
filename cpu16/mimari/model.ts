// Mimari diyagramları: tanım türleri ve devreden (Board) hesaplanan içerik.
//
// Bir diyagram elle yerleştirilir (kutular ızgarada, yollar dik açılı çizgiler), ama içeriği devreden
// gelir: her kutu kartın bir ya da birkaç işlev bloğunu (ChipInstance.block) taşır, kutudaki parça
// listesi ve sayıları o blokların çiplerinden sayılır. Her yol gerçek netlere bağlıdır; testler
// (cpu16/tests/mimari.test.ts, hesap8/tests/mimari.test.ts) çizilen her bağlantının netlistte
// karşılığı olduğunu, okların yönünün sürücü / okuyucu pinlere uyduğunu ve her bloğun tam bir
// kutuda durduğunu denetler. Devre değişince sayılar kendiliğinden değişir; bir bağlantı koparsa
// test düşer.
//
// Yapıştırıcı lojik çiplerinin (74HC00, 08, 32 …) her birimi (kapısı) Board'da bir bloğa aittir
// (ChipInstance.glueUnits): bağlantı denetimi bir pini birimin bloğuna sayar, kutular da kendi
// bloklarına düşen kapıları "+ N kapı" olarak gösterir.

import { partValue, type Board, type ChipInstance, type Passive } from "../board/board.ts";

// ---------------------------------------------------------------- tanım türleri

/** Kutunun renk rolü (lejantta açıklanır) */
export const KUTU_ROLLERI = ["register", "islem", "secici", "tampon", "bellek", "kontrol", "gc", "not"] as const;
export type KutuRolu = (typeof KUTU_ROLLERI)[number];
/** Yolun renk rolü */
export const YOL_TURLERI = ["veri", "adres", "kontrol", "saat", "yerel", "dis"] as const;
export type YolTuru = (typeof YOL_TURLERI)[number];
export type Nokta = readonly [number, number];
/** Kutunun yola göre yönü: giriş (yol → kutu), çıkış (kutu → yol), iki yönlü */
export type Yon = "giris" | "cikis" | "iki";

/** Kartın bir işlev bloğu: kart adı (Board.card) ve blok adı (Board.block) */
export interface BlokKimligi {
  card: string;
  block: string;
}

/** Kutunun içinde bir bölme: kendi adı, parçaları ve görevi olan alt birim */
export interface Bolme {
  ad: string;
  gorev?: string;
  /** bölmenin blokları (kutunun bloklarından; kartı kutununkiyle aynı) */
  bloklar?: string[];
  /** ya da: görevi (ChipInstance.role, yapıştırıcı birimin görevi) bu ifadeye uyan parçalar */
  rol?: RegExp;
  /** kutuya göre yer (diyagram birimi) */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Kutu {
  id: string;
  /** kutudaki ad (büyük harf), ör. "PROGRAM SAYACI" */
  ad: string;
  /** kutuda adın altında tek satırlık görev */
  gorev: string;
  /** yan panelde: birkaç cümle */
  aciklama: string;
  rol: KutuRolu;
  x: number;
  y: number;
  w: number;
  h: number;
  /** kutudaki bloklar (cihaz kutularında boş) */
  bloklar: BlokKimligi[];
  bolmeler?: Bolme[];
  /** kartta olmayan dış cihaz (VGA monitörü, PS/2 klavye …): parça listesi yok, kesik çizgili */
  cihaz?: boolean;
  /** kutuda gösterilecek pasif parçalar (anahtar, gösterge, konnektör …); verilmezse bilinen türler */
  pasifGoster?: boolean;
  /** tıklanınca açılacak başka bir diyagram (ör. makinede CPU kartı → CPU diyagramı) */
  ayrinti?: string;
}

/** Kutuları çevreleyen çerçeve (ör. makinede bir kart) */
export interface Grup {
  id: string;
  ad: string;
  /** başlığın sağında, ör. "194 entegre" (verilmezse içindeki kutuların çip sayısı) */
  ek?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** içindeki kutular */
  kutular: string[];
  aciklama?: string;
  /** başka bir diyagram (ör. CPU kartının ayrıntısı) */
  ayrinti?: string;
  /** çerçevenin kendi blokları (kutularda olmayan: kartın yapıştırıcı lojiği, arka panel konnektörleri);
   * parça listesi yan panelde, başlıkta yalnız entegre sayısı */
  bloklar?: BlokKimligi[];
  /** başlıkta kendi bloklarının entegre sayısının adı, ör. "yapıştırıcı lojik" → "194 entegre · 72 yapıştırıcı lojik" */
  bloklarAdi?: string;
  /** başlık çizgisi yok (arka panel gibi içinden yol geçen çerçeveler) */
  sade?: boolean;
}

/** Yol etiketinin yeri: metnin taban çizgisinin ortası (hiza "orta") */
export interface YolEtiketi {
  x: number;
  y: number;
  /** verilmezse yolun adı ve genişliği */
  metin?: string;
  hiza?: "bas" | "orta" | "son";
  /** 90° döndürülmüş (dikey yol boyunca) */
  dikey?: boolean;
}

/** Sayfa içi bağlayıcı: yol bir etiketle biter, karşılığı aynı adlı başka bir bağlayıcıdır */
export interface Baglayici {
  /** çizginin bittiği nokta */
  nokta: Nokta;
  metin: string;
  /** etiketin çizgiye göre yönü */
  yon: "sol" | "sag" | "yukari" | "asagi";
}

export interface YolUcu {
  /** kutu ya da grup kimliği */
  kutu: string;
  yon: Yon;
}

export interface Yol {
  id: string;
  tur: YolTuru;
  /** ör. "VERİ YOLU" */
  ad: string;
  /** etikette "(16 BİT)"; verilmezse yazılmaz */
  bit?: number;
  /** yan panel ve ipucu: ne taşır */
  aciklama: string;
  /** taşıdığı netler (Board'daki adlarıyla) */
  netler: string[];
  uclar: YolUcu[];
  /** gövde: kutulara değmeyen ortak çizgiler (veri yolu omurgası gibi) */
  govde?: Nokta[][];
  /** kollar: en az bir ucu bir kutunun kenarında; öbür ucu kutuda, gövdede, başka kolda ya da bağlayıcıda */
  kollar: Nokta[][];
  etiketler: YolEtiketi[];
  baglayicilar?: Baglayici[];
}

/** Lejanttaki kısaltma */
export type Kisaltma = readonly [kisa: string, uzun: string];

export interface Diyagram {
  id: string;
  /** başlık çubuğunda */
  baslik: string;
  /** başlık çubuğunun sağında */
  altBaslik: string;
  /** yan panelde: diyagram ne gösteriyor */
  aciklama: string;
  genislik: number;
  yukseklik: number;
  kutular: Kutu[];
  gruplar: Grup[];
  yollar: Yol[];
  /** lejant kutusu: yer ve kısaltmalar */
  lejant: { x: number; y: number; w: number; h: number; kisaltmalar: Kisaltma[] };
}

// ---------------------------------------------------------------- yardımcılar

/** "A0".."A15" gibi bir dizi net adı */
export const netDizisi = (onek: string, n: number, bas = 0): string[] => Array.from({ length: n }, (_, i) => `${onek}${bas + i}`);

/** Türkçe büyük harf (i → İ) */
export const buyuk = (s: string): string => s.toLocaleUpperCase("tr-TR");

/** Yol etiketinin metni: ad ve genişlik */
export const yolEtiketMetni = (y: Pick<Yol, "ad" | "bit">, e?: Pick<YolEtiketi, "metin">): string =>
  e?.metin ?? (y.bit ? `${y.ad} (${y.bit} BİT)` : y.ad);

/** Kart adlarının okunur karşılığı (makinede) */
export const KART_ADLARI: Record<string, string> = {
  cpu: "CPU",
  clk: "Saat ve reset",
  bellek: "Bellek",
  onbellek: "Önbellek",
  gc: "G/Ç",
  video: "Video",
  kyb: "Kendin yap bellek",
  hesap: "Hesap makinesi",
};

// ---------------------------------------------------------------- devre çözümlemesi

/** Bir pinin netlistteki yeri: hangi parça, hangi blok, hangi yön */
export interface PinUcu {
  ref: string;
  pin: string;
  card: string;
  block: string;
  /** pasif uçlar (konnektör, anahtar, gösterge) iki yönlü sayılır */
  dir: "in" | "out" | "tri" | "bidir" | "passive";
  part: string;
}

/**
 * Bağlantı denetiminde sayılan pasifler: konnektörler, anahtarlar, göstergeler, osilatörler, LED'ler.
 * Direnç ve kondansatörler sayılmaz (bir veri hattını çeken direnç, o bloğu yola bağlamaz).
 */
const BAGLANTI_PASIFI = /^(CONN|SW|DISP|OSC|BACKPLANE|LED)/;

const blokAnahtari = (card: string, block: string) => `${card}\u0000${block}`;

/** Yapıştırıcı çipinde bir pinin bloğu: pinin birimi hangi bloğa aitse (birim yoksa çipin bloğu) */
export function pininBlogu(ci: ChipInstance, pin: string): string {
  return ci.glueUnits?.find((u) => u.pins.includes(pin))?.block ?? ci.block;
}

/** Bir kutu ya da bölmenin parçaları */
export interface Parcalar {
  /** entegreler: çipin bloğu kutudaysa (yapıştırıcı çipleri yalnız "Yapıştırıcı lojik" bloğunda) */
  cipler: ChipInstance[];
  /** pasif elemanlar (dekuplaj kondansatörleri hariç) */
  pasifler: Passive[];
  /** yapıştırıcı çiplerinde bu kutunun bloklarına düşen kapılar */
  kapilar: { ref: string; part: string; role: string; block: string }[];
}

/** Bir devrenin çözümlemesi: bloklar, parçalar, netlerin uçları (bir kez kurulur) */
export class Devre {
  readonly board: Board;
  private readonly ciplerBlokta = new Map<string, ChipInstance[]>();
  private readonly pasiflerBlokta = new Map<string, Passive[]>();
  private readonly kapilarBlokta = new Map<string, Parcalar["kapilar"]>();
  private readonly uclar = new Map<number, PinUcu[]>();
  /** devredeki bütün bloklar (çip ya da pasif taşıyan) */
  readonly bloklar: BlokKimligi[] = [];
  /** net adı → numara (adsız iç netler "n123", bağlanmamış çıkışlar "U12.Q0" adıyla) */
  private readonly netAdlari = new Map<string, number>();

  constructor(board: Board) {
    this.board = board;
    board.c.netNames.forEach((ad, i) => {
      if (!this.netAdlari.has(ad)) this.netAdlari.set(ad, i);
    });
    const blokEkle = (card: string, block: string) => {
      const k = blokAnahtari(card, block);
      if (!this.ciplerBlokta.has(k) && !this.pasiflerBlokta.has(k)) this.bloklar.push({ card, block });
      return k;
    };
    const ucEkle = (net: number, u: PinUcu) => {
      if (net === board.c.GND || net === board.c.VCC) return;
      let l = this.uclar.get(net);
      if (!l) this.uclar.set(net, (l = []));
      l.push(u);
    };
    for (const ci of board.chips) {
      const k = blokEkle(ci.card, ci.block);
      let l = this.ciplerBlokta.get(k);
      if (!l) this.ciplerBlokta.set(k, (l = []));
      l.push(ci);
      for (const u of ci.glueUnits ?? []) {
        const kk = blokAnahtari(ci.card, u.block);
        let g = this.kapilarBlokta.get(kk);
        if (!g) this.kapilarBlokta.set(kk, (g = []));
        g.push({ ref: ci.ref, part: partValue(ci), role: u.role, block: u.block });
      }
      for (const p of ci.def.pins) {
        if (p.dir === "power" || p.dir === "nc") continue;
        const net = ci.nets[p.name];
        if (net === undefined) continue;
        ucEkle(net, { ref: ci.ref, pin: p.name, card: ci.card, block: pininBlogu(ci, p.name), dir: p.dir === "passive" ? "passive" : p.dir, part: partValue(ci) });
      }
    }
    for (const p of board.passives) {
      if (p.part === "C_100N") continue;
      const k = blokEkle(p.card, p.block);
      let l = this.pasiflerBlokta.get(k);
      if (!l) this.pasiflerBlokta.set(k, (l = []));
      l.push(p);
      if (!BAGLANTI_PASIFI.test(p.part)) continue;
      for (const [pin, net] of Object.entries(p.pins)) ucEkle(net, { ref: p.ref, pin, card: p.card, block: p.block, dir: "passive", part: p.part });
    }
  }

  /** Adlı netin numarası (yoksa undefined; Board.n gibi yeni net açmaz) */
  net(ad: string): number | undefined {
    return this.netAdlari.get(ad);
  }

  /** Netin uçları (çip pinleri ve bağlantı pasifleri; GND / VCC için boş) */
  netUclari(net: number): readonly PinUcu[] {
    return this.uclar.get(net) ?? [];
  }

  /** Blokların parçaları; `rol` verilirse yalnız görevi ona uyanlar */
  parcalar(bloklar: readonly BlokKimligi[], rol?: RegExp): Parcalar {
    const out: Parcalar = { cipler: [], pasifler: [], kapilar: [] };
    for (const b of bloklar) {
      const k = blokAnahtari(b.card, b.block);
      out.cipler.push(...(this.ciplerBlokta.get(k) ?? []).filter((c) => !rol || rol.test(c.role)));
      out.pasifler.push(...(this.pasiflerBlokta.get(k) ?? []).filter((p) => !rol || rol.test(p.role)));
      out.kapilar.push(...(this.kapilarBlokta.get(k) ?? []).filter((g) => !rol || rol.test(g.role)));
    }
    return out;
  }

  /** Bir kartın blokları (devredeki sırasıyla) */
  kartBloklari(card: string): BlokKimligi[] {
    return this.bloklar.filter((b) => b.card === card);
  }

  /** Uç bu bloklardan birinde mi */
  static blokta(u: Pick<PinUcu, "card" | "block">, bloklar: readonly BlokKimligi[]): boolean {
    return bloklar.some((b) => b.card === u.card && b.block === u.block);
  }

  /**
   * Netlerin bu bloklardaki uçları: sürenler (çıkış, üç durumlu, çift yönlü, pasif) ve okuyanlar
   * (giriş, çift yönlü, pasif).
   */
  yolUclari(netler: readonly string[], bloklar: readonly BlokKimligi[]): { suren: PinUcu[]; okuyan: PinUcu[]; eksik: string[] } {
    const suren: PinUcu[] = [];
    const okuyan: PinUcu[] = [];
    const eksik: string[] = [];
    for (const ad of netler) {
      const n = this.net(ad);
      if (n === undefined) {
        eksik.push(ad);
        continue;
      }
      for (const u of this.netUclari(n)) {
        if (!Devre.blokta(u, bloklar)) continue;
        if (u.dir !== "in") suren.push(u);
        if (u.dir === "in" || u.dir === "bidir" || u.dir === "passive") okuyan.push(u);
      }
    }
    return { suren, okuyan, eksik };
  }

  /** `kaynak` bloklarında sürülüp `hedef` bloklarında okunan netler (adlarıyla; adsız iç netler "n123") */
  aradakiNetler(kaynak: readonly BlokKimligi[], hedef: readonly BlokKimligi[]): string[] {
    const out: string[] = [];
    for (const [net, uclar] of this.uclar) {
      const surer = uclar.some((u) => u.dir !== "in" && u.dir !== "passive" && Devre.blokta(u, kaynak));
      if (!surer) continue;
      if (uclar.some((u) => (u.dir === "in" || u.dir === "bidir") && Devre.blokta(u, hedef))) out.push(this.board.netName(net));
    }
    return out;
  }
}

/** Kutunun tek satırlık görevi; bölmeli kutularda (görevi bölmelerinde yazan) bölmelerin görevleri */
export const kutuGorevi = (k: Pick<Kutu, "gorev" | "bolmeler">): string =>
  k.gorev || (k.bolmeler ?? []).map((b) => b.gorev ?? "").filter(Boolean).join("; ");

/** Kısa pasif adları (kutularda ve yan panelde) */
const PASIF_ADLARI: Record<string, string> = {
  SW_DIP_8: "8'li DIP anahtar",
  SW_DIP_2: "2'li DIP anahtar",
  SW_PUSH: "buton",
  SW_SPDT: "iki konumlu anahtar",
  DISP_7SEG_CC: "7 segment gösterge",
  LED: "LED",
  CONN_VGA: "VGA konnektörü",
  CONN_PS2: "PS/2 konnektörü",
  CONN_CH340: "USB-UART modülü",
  CONN_5V: "5 V girişi",
  OSC_CAN: "kristal osilatör",
  OSC_25M175: "25,175 MHz osilatör",
  BACKPLANE_2x32: "2 × 32 konnektör",
  POT_100K: "potansiyometre",
};

/** Pasifin kısa adı (bilinmeyen türlerde parça kodu) */
export const pasifAdi = (part: string): string => PASIF_ADLARI[part] ?? part;
/** Kutuda gösterilen pasif türleri */
export const gosterilenPasif = (part: string): boolean => part in PASIF_ADLARI;

/** Parça değeri → adet, adede göre (eşitse parça adına göre) */
export function sayim(parcalar: readonly string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const p of parcalar) m.set(p, (m.get(p) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"));
}

/** "74HC574 ×16" (tek ise yalnız parça) */
export const sayimMetni = ([p, n]: readonly [string, number]): string => (n > 1 ? `${p} ×${n}` : p);

/** Çip listesinin sayımı (74AC çipleri 74AC olarak) */
export const cipSayimi = (cipler: readonly ChipInstance[]): [string, number][] => sayim(cipler.map((c) => partValue(c)));

/** Kutuda gösterilen pasiflerin sayımı (kısa adlarıyla) */
export const pasifSayimi = (pasifler: readonly Passive[]): [string, number][] => sayim(pasifler.filter((p) => gosterilenPasif(p.part)).map((p) => pasifAdi(p.part)));

/** Bir kutunun ya da bölmenin parçaları */
export function kutuParcalari(d: Devre, k: Pick<Kutu, "bloklar">, b?: Pick<Bolme, "bloklar" | "rol">): Parcalar {
  if (!b) return d.parcalar(k.bloklar);
  const bloklar = b.bloklar ? k.bloklar.filter((x) => b.bloklar!.includes(x.block)) : k.bloklar;
  return d.parcalar(bloklar, b.rol);
}

/** Net adlarının kısa yazımı: ardışık numaralar aralık olur ("A0–A15, DE0–DE7, ~MRD") */
export function netOzeti(netler: readonly string[]): string {
  const parcalar: string[] = [];
  let i = 0;
  while (i < netler.length) {
    const m = /^(.*?)(\d+)$/.exec(netler[i]);
    if (!m) {
      parcalar.push(netler[i]);
      i++;
      continue;
    }
    const [, onek, sayi] = m;
    let j = i;
    let son = Number(sayi);
    while (j + 1 < netler.length) {
      const m2 = /^(.*?)(\d+)$/.exec(netler[j + 1]);
      if (!m2 || m2[1] !== onek || Number(m2[2]) !== son + 1) break;
      son++;
      j++;
    }
    parcalar.push(j > i + 1 ? `${onek}${sayi}–${onek}${son}` : j === i + 1 ? `${netler[i]}, ${netler[j]}` : netler[i]);
    i = j + 1;
  }
  return parcalar.join(", ");
}
