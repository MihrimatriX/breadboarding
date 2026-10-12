// Breadboard modelinin bağımsız doğrulaması: yalnızca fiziksel modelden (şeritler, raylar, ray
// köprüleri, atlama telleri, deliklerdeki bacaklar) birleşim-bul (union-find) ile bağlantı kurulur ve
// hesap makinesinin netlistiyle karşılaştırılır. Yönlendiricinin iç durumuna hiç bakmaz.
//
// Denetimler: her parça bir kez ve her pini bir delikte; delikler gerçekten var; hiçbir delikte iki
// şey yok (iki tel ucu ya da bir uç ve bir pin); teller yalnız yatay/dikey; hiçbir tel bir gövdenin,
// bir pinin ya da başka bir telin ucunun üstünden geçmiyor; açık devre yok (her netin bütün pinleri
// aynı iletken parçada); kısa devre yok (her iletken parçada tek net; bağlantısız pinler yalnız).

import type { Board } from "../../cpu16/board/board.ts";
import { BX_ADIM, BY_ADIM, DUGUM_BOARD, delikVar, satirRayi, yerelDugum } from "./geometri.ts";
import { pinNeti, pinNumaralari, type BbYerlesim } from "./yerlesim.ts";

export interface DogrulamaSonucu {
  hatalar: string[];
  /** karşılaştırılan net ve pin sayıları */
  netSayisi: number;
  pinSayisi: number;
  telSayisi: number;
}

interface TelGirdisi {
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

export function bbDogrula(board: Board, y0: BbYerlesim, teller0: TelGirdisi[], o: DogrulamaSecenekleri = {}): DogrulamaSonucu {
  const hatalar: string[] = [];
  const asama = o.asama;
  const y: BbYerlesim = asama === undefined ? y0 : { ...y0, parcalar: y0.parcalar.filter((p) => p.asama <= asama) };
  const teller = asama === undefined ? teller0 : teller0.filter((t) => (t.asama ?? 0) <= asama);
  const hata = (s: string) => { if (hatalar.length < 200) hatalar.push(s); };
  const boardAt = new Map(y.boards.map((b) => [`${b.bx},${b.by}`, b]));
  /** küresel ızgara noktası → (board, yerel satır, sütun) ya da undefined */
  const yerel = (X: number, Y: number) => {
    const bx = Math.floor(X / BX_ADIM);
    const by = Math.floor((Y + 3) / BY_ADIM);
    const b = boardAt.get(`${bx},${by}`);
    if (!b) return undefined;
    const r = Y - by * BY_ADIM;
    const c = X - bx * BX_ADIM;
    if (!delikVar(r, c)) return undefined;
    return { b, r, c };
  };
  const dugum = (X: number, Y: number): number => {
    const l = yerel(X, Y);
    return l ? l.b.no * DUGUM_BOARD + yerelDugum(l.r, l.c) : -1;
  };
  const anahtar = (X: number, Y: number) => `${X},${Y}`;

  // ---- parçalar
  const nesne = new Map<string, Parameters<typeof pinNeti>[0]>();
  for (const c of board.chips) nesne.set(c.ref, c);
  for (const p of board.passives) nesne.set(p.ref, p);
  const goruldu = new Set<string>();
  const delikte = new Map<string, string>(); // delik → ne oturuyor
  const govdeler: [number, number, number, number, string][] = [];
  for (const p of y.parcalar) {
    if (goruldu.has(p.ref)) hata(`${p.ref} iki kez yerleşmiş`);
    goruldu.add(p.ref);
    const x = nesne.get(p.ref);
    if (!x) { hata(`${p.ref} netlistte yok`); continue; }
    const pinler = pinNumaralari(x);
    for (const num of pinler) if (!p.bacaklar.some((b) => b.pin === num)) hata(`${p.ref}.${num} hiçbir deliğe oturmamış`);
    for (const b of p.bacaklar) {
      if (!pinler.includes(b.pin)) hata(`${p.ref}: olmayan pin ${b.pin}`);
      if (!yerel(b.X, b.Y)) hata(`${p.ref}.${b.pin} delik olmayan yerde (${b.X}, ${b.Y})`);
      const k = anahtar(b.X, b.Y);
      if (delikte.has(k)) hata(`delik iki kez kullanılmış: ${p.ref}.${b.pin} ve ${delikte.get(k)}`);
      delikte.set(k, `${p.ref}.${b.pin}`);
    }
    govdeler.push([...p.govde, p.ref]);
  }
  if (asama === undefined) for (const r of nesne.keys()) if (!goruldu.has(r)) hata(`${r} yerleşmemiş`);

  // ---- teller: uçlar, yatay/dikey, gövde ve uç üstünden geçmeme
  const uclar = new Set<string>();
  teller.forEach((t, i) => {
    const n = t.yol.length / 2;
    if (n < 2 || t.yol.length % 2) { hata(`tel ${i + 1}: yol bozuk`); return; }
    for (const [X, Y] of [[t.yol[0], t.yol[1]], [t.yol[t.yol.length - 2], t.yol[t.yol.length - 1]]]) {
      if (!yerel(X, Y)) hata(`tel ${i + 1}: ucu delik olmayan yerde (${X}, ${Y})`);
      const k = anahtar(X, Y);
      if (delikte.has(k)) hata(`delik iki kez kullanılmış: tel ${i + 1} ve ${delikte.get(k)}`);
      delikte.set(k, `tel ${i + 1}`);
      uclar.add(k);
    }
    for (let j = 1; j < n; j++) {
      if (t.yol[2 * j] !== t.yol[2 * j - 2] && t.yol[2 * j + 1] !== t.yol[2 * j - 1]) hata(`tel ${i + 1}: çapraz parça`);
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
        if (g) hata(`tel ${i + 1} ${g} gövdesinin üstünden geçiyor (${X}, ${Y})`);
        else if (delikte.has(k)) hata(`tel ${i + 1} ${delikte.get(k)} üstünden geçiyor (${X}, ${Y})`);
      }
    }
  });

  // ---- birleşim-bul: düğümler (şerit ve raylar) + bir parçanın aynı pininin bacakları
  const uf = new BirlesimBul(y.boards.length * DUGUM_BOARD);
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
    }
  }
  // her pinin iletken parçası; net → parçalar, parça → netler
  const netParca = new Map<number, Set<number>>();
  const parcaNet = new Map<number, Set<string>>();
  let pinSayisi = 0;
  for (const p of y.parcalar) {
    const x = nesne.get(p.ref);
    if (!x) continue;
    for (const b of p.bacaklar) {
      const d = dugum(b.X, b.Y);
      if (d < 0) continue;
      pinSayisi++;
      const net = pinNeti(x, b.pin);
      const kok = uf.bul(d);
      const kimlik = net < 0 ? `boş ${p.ref}.${b.pin}` : board.netName(net);
      if (!parcaNet.has(kok)) parcaNet.set(kok, new Set());
      parcaNet.get(kok)!.add(kimlik);
      if (net >= 0) {
        if (!netParca.has(net)) netParca.set(net, new Set());
        netParca.get(net)!.add(kok);
      }
    }
  }
  // raylar da kendi netlerinin parçasında olmalı
  for (const b of y.boards) {
    for (const r of [0, 1, 16, 17]) {
      const d = b.no * DUGUM_BOARD + yerelDugum(r, 3);
      const kutup = satirRayi(r)!.endsWith("+") ? "VCC" : "GND";
      const kok = uf.bul(d);
      if (!parcaNet.has(kok)) parcaNet.set(kok, new Set());
      parcaNet.get(kok)!.add(kutup);
      const net = kutup === "VCC" ? board.c.VCC : board.c.GND;
      netParca.get(net)?.add(kok);
    }
  }
  for (const [net, parcalar] of netParca) if (parcalar.size > 1) hata(`açık devre: ${board.netName(net)} ${parcalar.size} parçada`);
  for (const [, netler] of parcaNet) if (netler.size > 1) hata(`kısa devre: ${[...netler].slice(0, 6).join(", ")}`);
  // netlistteki her netin pini var mı (yerleşmemiş pin yukarıda yakalanır)
  return { hatalar, netSayisi: netParca.size, pinSayisi, telSayisi: teller.length };
}
