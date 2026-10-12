// Breadboard modelinin bağımsız doğrulaması: yalnızca fiziksel modelden (şeritler, raylar, ray
// köprüleri, atlama telleri, deliklerdeki bacaklar; birden çok panoda panolar arası şerit kablo) birleşim-
// bul (union-find) ile bağlantı kurulur ve netlistle karşılaştırılır. Yönlendiricinin iç durumuna hiç
// bakmaz.
//
// Denetimler: her parça bir kez ve her pini bir delikte; delikler gerçekten var; hiçbir delikte iki
// şey yok (iki tel ucu ya da bir uç ve bir pin); teller yalnız yatay/dikey; hiçbir tel bir gövdenin,
// bir pinin ya da başka bir telin ucunun üstünden geçmiyor; açık devre yok (her netin bütün pinleri
// aynı iletken parçada); kısa devre yok (her iletken parçada tek net; bağlantısız pinler yalnız).
//
// Yalnız fiziksel parçalar (BbParca.ek: ör. panonun besleme girişi) netlistte yoktur; bacaklarının
// netleri kendi tablolarındadır ve aynı biçimde denetlenir.

import type { Board } from "../board.ts";
import { DUGUM_BOARD, delikVar, noktaninBoardu, satirRayi, yerelDugum } from "./geometri.ts";
import { pinNeti, pinNumaralari, type BbYerlesim } from "./yerlesim.ts";

export interface DogrulamaSonucu {
  hatalar: string[];
  /** karşılaştırılan net ve pin sayıları */
  netSayisi: number;
  pinSayisi: number;
  telSayisi: number;
}

export interface TelGirdisi {
  net?: number;
  asama?: number;
  yol: number[];
}

export interface DogrulamaSecenekleri {
  /**
   * Kurulumun bu aşamasının sonundaki durum: yalnız bu aşamaya kadar takılan parçalar ve teller (her
   * aşamanın sonunda o ana dek takılan her netin bütün bacakları bağlı olmalı: aşama testi yapılabilsin)
   */
  asama?: number;
  /** yalnız bu kartın parçaları (birden çok kartlı netlistte bir kartın panosu) */
  kart?: string;
  /**
   * Bir tel, kendinden önce takılan bir telin ucunun üstünden geçebilir (çok yoğun panolarda; sıra
   * önemli olur). Verilmezse hiçbir tel hiçbir telin ucunun üstünden geçemez (her sıra kurulabilir).
   */
  oncekiUcUstu?: boolean;
}

/** Bir pano: bir kartın (ya da kartsız tek panonun) yerleşimi ve telleri */
export interface DogrulamaPanosu {
  /** panonun adı (hata iletilerinde) */
  ad?: string;
  /** panonun kartı: netlistten yalnız bu kartın parçaları beklenir */
  kart?: string;
  yerlesim: BbYerlesim;
  teller: TelGirdisi[];
}

/**
 * Panolar arası şerit kablo: her damar, takılı olduğu her uyarlayıcının aynı numaralı pinini birleştirir
 * (64 damarlı kablonun k. damarı, k. pin). `uclar`: [pano sırası, uyarlayıcının ref'i].
 */
export interface SeritKablo {
  ad: string;
  damar: number;
  uclar: [number, string][];
}

class BirlesimBul {
  private readonly ata: Int32Array;
  constructor(n: number) {
    this.ata = new Int32Array(n);
    for (let i = 0; i < n; i++) this.ata[i] = i;
  }
  bul(x: number): number {
    while (this.ata[x] !== x) {
      this.ata[x] = this.ata[this.ata[x]];
      x = this.ata[x];
    }
    return x;
  }
  birlestir(a: number, b: number): void {
    const x = this.bul(a);
    const z = this.bul(b);
    if (x !== z) this.ata[x] = z;
  }
}

/** Tek panonun doğrulaması (hesap makinesi; ya da `kart` ile birden çok kartlı netlistte bir kart) */
export function bbDogrula(board: Board, y0: BbYerlesim, teller0: TelGirdisi[], o: DogrulamaSecenekleri = {}): DogrulamaSonucu {
  return panolariDogrula(board, [{ kart: o.kart, yerlesim: y0, teller: teller0 }], [], { asama: o.asama, oncekiUcUstu: o.oncekiUcUstu });
}

/**
 * Birden çok panonun (bütün makinenin) doğrulaması: her panonun kendi şeritleri, rayları ve telleri;
 * panolar arası bağlantı yalnız şerit kablolarla. `kart` verilen panolarda netlistin o kartının bütün
 * parçaları beklenir; kartsız pano netlistin bütün parçalarını bekler.
 */
export function panolariDogrula(board: Board, panolar: DogrulamaPanosu[], kablolar: SeritKablo[], o: Pick<DogrulamaSecenekleri, "asama" | "oncekiUcUstu"> = {}): DogrulamaSonucu {
  const hatalar: string[] = [];
  const asama = o.asama;
  const hata = (s: string) => { if (hatalar.length < 200) hatalar.push(s); };
  const cok = panolar.length > 1;
  const onek = (i: number) => (cok ? `${panolar[i].ad ?? panolar[i].kart ?? i}: ` : "");

  // ---- netlistin parçaları
  const nesne = new Map<string, Parameters<typeof pinNeti>[0]>();
  for (const c of board.chips) nesne.set(c.ref, c);
  for (const p of board.passives) nesne.set(p.ref, p);
  const kartOf = (r: string) => nesne.get(r)!.card;

  // düğümler: pano başına board × DUGUM_BOARD
  const taban: number[] = [];
  let dugumSayisi = 0;
  for (const p of panolar) {
    taban.push(dugumSayisi);
    dugumSayisi += p.yerlesim.boards.length * DUGUM_BOARD;
  }
  const uf = new BirlesimBul(dugumSayisi);
  /** netin iletken parçaları ve parçanın netleri (pin kimlikleri) */
  const netParca = new Map<number, Set<number>>();
  const parcaNet = new Map<number, Set<string>>();
  let pinSayisi = 0;
  let telSayisi = 0;
  const goruldu = new Set<string>();
  /** pinlerin düğümleri: "pano|ref|pin" → düğüm (şerit kabloların uçları) */
  const pinDugumu = new Map<string, number>();

  const panoBilgisi = panolar.map((pano, pi) => {
    const y: BbYerlesim = asama === undefined ? pano.yerlesim : { ...pano.yerlesim, parcalar: pano.yerlesim.parcalar.filter((p) => p.asama <= asama) };
    const teller = asama === undefined ? pano.teller : pano.teller.filter((t) => (t.asama ?? 0) <= asama);
    /** küresel ızgara noktası → (board, yerel satır, sütun) ya da undefined */
    const yerel = (X: number, Y: number) => {
      const b = noktaninBoardu(y.boards, X, Y);
      const r = Y - b.y0;
      const c = X - b.x0;
      if (!delikVar(r, c)) return undefined;
      return { b, r, c };
    };
    const dugum = (X: number, Y: number): number => {
      const l = yerel(X, Y);
      return l ? taban[pi] + l.b.no * DUGUM_BOARD + yerelDugum(l.r, l.c) : -1;
    };
    return { y, teller, yerel, dugum };
  });

  panolar.forEach((pano, pi) => {
    const { y, teller, yerel, dugum } = panoBilgisi[pi];
    const on = onek(pi);
    const anahtar = (X: number, Y: number) => `${X},${Y}`;

    // ---- parçalar
    const delikte = new Map<string, string>(); // delik → ne oturuyor
    const govdeler: [number, number, number, number, string][] = [];
    for (const p of y.parcalar) {
      if (goruldu.has(p.ref)) hata(`${on}${p.ref} iki kez yerleşmiş`);
      goruldu.add(p.ref);
      const x = nesne.get(p.ref);
      if (!x && !p.ek) { hata(`${on}${p.ref} netlistte yok`); continue; }
      if (x && p.ek) hata(`${on}${p.ref} hem netlistte hem yalnız fiziksel parça`);
      if (x && pano.kart !== undefined && kartOf(p.ref) !== pano.kart) hata(`${on}${p.ref} başka kartın parçası (${kartOf(p.ref)})`);
      const pinler = p.ek ? Object.keys(p.ek).map(Number) : pinNumaralari(x!);
      for (const num of pinler) if (!p.bacaklar.some((b) => b.pin === num)) hata(`${on}${p.ref}.${num} hiçbir deliğe oturmamış`);
      for (const b of p.bacaklar) {
        if (!pinler.includes(b.pin)) hata(`${on}${p.ref}: olmayan pin ${b.pin}`);
        if (!yerel(b.X, b.Y)) hata(`${on}${p.ref}.${b.pin} delik olmayan yerde (${b.X}, ${b.Y})`);
        const k = anahtar(b.X, b.Y);
        if (delikte.has(k)) hata(`${on}delik iki kez kullanılmış: ${p.ref}.${b.pin} ve ${delikte.get(k)}`);
        delikte.set(k, `${p.ref}.${b.pin}`);
      }
      govdeler.push([...p.govde, p.ref]);
    }

    // ---- teller: uçlar, yatay/dikey, gövde ve uç üstünden geçmeme
    /** tel ucunun deliği → telin sırası */
    const ucTeli = new Map<string, number>();
    teller.forEach((t, i) => {
      const n = t.yol.length / 2;
      if (n < 2 || t.yol.length % 2) { hata(`${on}tel ${i + 1}: yol bozuk`); return; }
      for (const [X, Y] of [[t.yol[0], t.yol[1]], [t.yol[t.yol.length - 2], t.yol[t.yol.length - 1]]]) {
        if (!yerel(X, Y)) hata(`${on}tel ${i + 1}: ucu delik olmayan yerde (${X}, ${Y})`);
        const k = anahtar(X, Y);
        if (delikte.has(k)) hata(`${on}delik iki kez kullanılmış: tel ${i + 1} ve ${delikte.get(k)}`);
        delikte.set(k, `tel ${i + 1}`);
        ucTeli.set(k, i);
      }
      for (let j = 1; j < n; j++) {
        if (t.yol[2 * j] !== t.yol[2 * j - 2] && t.yol[2 * j + 1] !== t.yol[2 * j - 1]) hata(`${on}tel ${i + 1}: çapraz parça`);
      }
    });
    // gövde ızgarası
    const govdeHucre = new Map<string, string>();
    for (const [x0, y0, x1, y1, ref] of govdeler) for (let Y = y0; Y <= y1; Y++) for (let X = x0; X <= x1; X++) govdeHucre.set(anahtar(X, Y), ref);
    teller.forEach((t, i) => {
      const n = t.yol.length / 2;
      for (let j = 1; j < n; j++) {
        const x0 = t.yol[2 * j - 2], y0 = t.yol[2 * j - 1], x1 = t.yol[2 * j], y1 = t.yol[2 * j + 1];
        const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
        let X = x0, Y = y0;
        const son = j === n - 1;
        while (X !== x1 || Y !== y1) {
          X += dx; Y += dy;
          if (son && X === x1 && Y === y1) break; // telin kendi ucu
          const k = anahtar(X, Y);
          const g = govdeHucre.get(k);
          if (g) hata(`${on}tel ${i + 1} ${g} gövdesinin üstünden geçiyor (${X}, ${Y})`);
          else if (delikte.has(k)) {
            const u = ucTeli.get(k);
            // önce takılan telin ucu (izin verildiyse): o tel altta kalır
            if (!(o.oncekiUcUstu && u !== undefined && u < i)) hata(`${on}tel ${i + 1} ${delikte.get(k)} üstünden geçiyor (${X}, ${Y})`);
          }
        }
      }
    });
    telSayisi += teller.length;

    // ---- birleşim-bul: düğümler (şerit ve raylar) + bir parçanın aynı pininin bacakları
    for (const t of teller) {
      const a = dugum(t.yol[0], t.yol[1]);
      const z = dugum(t.yol[t.yol.length - 2], t.yol[t.yol.length - 1]);
      if (a >= 0 && z >= 0) uf.birlestir(a, z);
    }
    for (const p of y.parcalar) {
      const ilk = new Map<number, number>();
      for (const b of p.bacaklar) {
        const d = dugum(b.X, b.Y);
        if (d < 0) continue;
        if (ilk.has(b.pin)) uf.birlestir(ilk.get(b.pin)!, d);
        else ilk.set(b.pin, d);
        pinDugumu.set(`${pi}|${p.ref}|${b.pin}`, d);
      }
    }
  });

  // ---- panolar arası: şerit kablolar (k. damar, uyarlayıcıların k. pini)
  /** şerit kablonun damarındaki bağlantısız pinler: hepsi aynı (boş) damarın, birbirine kısa devre değil */
  const damarBos = new Map<string, string>();
  for (const k of kablolar) {
    for (let d = 1; d <= k.damar; d++) {
      let ilk = -1;
      for (const [pi, ref] of k.uclar) {
        damarBos.set(`${pi}|${ref}|${d}`, `boş damar ${k.ad}:${d}`);
        const n = pinDugumu.get(`${pi}|${ref}|${d}`);
        if (n === undefined) continue; // bu aşamada uyarlayıcı henüz takılmamış
        if (ilk < 0) ilk = n;
        else uf.birlestir(ilk, n);
      }
    }
  }

  // ---- her pinin iletken parçası; net → parçalar, parça → netler
  panolar.forEach((_, pi) => {
    const { y, dugum } = panoBilgisi[pi];
    for (const p of y.parcalar) {
      const x = nesne.get(p.ref);
      if (!x && !p.ek) continue;
      for (const b of p.bacaklar) {
        const d = dugum(b.X, b.Y);
        if (d < 0) continue;
        pinSayisi++;
        const net = p.ek ? (p.ek[b.pin] ?? -1) : pinNeti(x!, b.pin);
        const kok = uf.bul(d);
        const kimlik = net < 0 ? (damarBos.get(`${pi}|${p.ref}|${b.pin}`) ?? `boş ${onek(pi)}${p.ref}.${b.pin}`) : board.netName(net);
        if (!parcaNet.has(kok)) parcaNet.set(kok, new Set());
        parcaNet.get(kok)!.add(kimlik);
        if (net >= 0) {
          if (!netParca.has(net)) netParca.set(net, new Set());
          netParca.get(net)!.add(kok);
        }
      }
    }
  });
  // raylar da kendi netlerinin parçasında olmalı
  panolar.forEach((_, pi) => {
    for (const b of panoBilgisi[pi].y.boards) {
      for (const r of [0, 1, 16, 17]) {
        const d = taban[pi] + b.no * DUGUM_BOARD + yerelDugum(r, 3);
        const kutup = satirRayi(r)!.endsWith("+") ? "VCC" : "GND";
        const kok = uf.bul(d);
        if (!parcaNet.has(kok)) parcaNet.set(kok, new Set());
        parcaNet.get(kok)!.add(kutup);
        const net = kutup === "VCC" ? board.c.VCC : board.c.GND;
        netParca.get(net)?.add(kok);
      }
    }
  });
  // netlistteki her parça bir panoda (aşama denetiminde yalnız takılanlar beklenir)
  if (asama === undefined) {
    const kartlar = new Set(panolar.map((p) => p.kart));
    for (const r of nesne.keys()) {
      if (goruldu.has(r)) continue;
      if (kartlar.has(undefined) || kartlar.has(kartOf(r))) hata(`${r} yerleşmemiş`);
    }
  }
  for (const [net, parcalar] of netParca) if (parcalar.size > 1) hata(`açık devre: ${board.netName(net)} ${parcalar.size} parçada`);
  for (const [, netler] of parcaNet) if (netler.size > 1) hata(`kısa devre: ${[...netler].slice(0, 6).join(", ")}`);
  return { hatalar, netSayisi: netParca.size, pinSayisi, telSayisi };
}
