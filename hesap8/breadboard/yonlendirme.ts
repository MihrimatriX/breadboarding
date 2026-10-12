// Breadboard tel yönlendirmesi. Her net, pinlerinin oturduğu 5 delikli şeritler (ve raylar) ile
// bu şeritlerin boş deliklerine takılan atlama telleriyle kurulur. Teller düz yatar, yalnız yatay
// ve dikey gider (90° kıvrım), çip ve parça gövdelerinin üstünden geçmez; aynı deliğe iki uç ya da
// bir uç ve bir pin girmez; hiçbir tel başka bir telin ucunun üstünden geçmez ve hiçbir telin ucu
// başka bir telin altında kalmaz. Bu son iki kural telleri sırasından bağımsız kılar: tel listesi
// hangi sırayla takılırsa takılsın her uç deliğine erişilebilir.
//
// Yöntem:
// 1. Ray köprüleri (sabit yollar): her board'un üst ve alt ray çiftleri, arka-ön komşu board'lar, en
//    arka ve en ön sıradaki yan yana board'lar.
// 2. Aşama aşama (kurulum sırası): o aşamada takılan pinlerin şeritleri, netin önceki aşamalardan
//    kalan ağacına Prim usulü eklenir: ağaçtaki şeritlerin boş deliklerinden henüz bağlanmamış
//    şeritlerin boş deliklerine A* ile en ucuz yol. Besleme bacakları ve sabit girişler en yakın raya
//    ya da aynı netin komşu şeridine. Bağlantı bekleyen her şeridin 1–2 deliği "ayrılmıştır": hiçbir
//    tel üstünden geçemez.
// 3. Söküp yeniden döşeme turları: üst üste binen ya da çok dolanan her tel sökülür ve öteki bütün
//    teller yerindeyken yeniden yönlendirilir; üst üste binilen kenarların maliyeti her turda artar
//    (müzakereli tıkanıklık). Sökülen tel netini iki parçaya ayırır; yenisi bu iki parçayı, telin
//    aşamasında takılı olan şeritlerden birleştirir (her aşamanın sonunda devre yine tam bağlı).
// Maliyet: uzunluk, kıvrım, başka bir telle kesişme, boş deliklerin üstünü örtme (bağlantı bekleyen
// şeritlerde pahalı), iki telin aynı çizgide üst üste binmesi (çok pahalı).

import type { Board } from "../../cpu16/board/board.ts";
import { ADIM, BX_ADIM, BY_ADIM, DUGUM_BOARD, dugumDelikleri, kureselX, kureselY, yerelDugum } from "./geometri.ts";
import { telRengi, type TelRengi } from "./renk.ts";
import { pinNeti, type BbBoard, type BbYerlesim } from "./yerlesim.ts";

export interface BbTel {
  /** kurulum sırası (1'den) */
  no: number;
  net: number;
  /** netin adı (netlistteki) */
  ad: string;
  renk: TelRengi;
  asama: number;
  /** ray köprüsü (board'ların raylarını birbirine bağlar) */
  ray: boolean;
  /** köşe noktaları, uçlar dahil: [X0, Y0, X1, Y1, …] ızgara */
  yol: number[];
  /** delikten deliğe uzunluk (mm) */
  uzunluk: number;
  /** kesim boyu (mm): uzunluk + iki uçta 8'er mm (≈ 6 mm soyulmuş uç + 2 mm iniş) */
  kesim: number;
}

export const UC_PAYI = 8;

export interface YonlendirmeSonucu {
  teller: Omit<BbTel, "no">[];
  /** üst üste binen tel parçası (kenar) sayısı */
  binme: number;
  /** tellerin kesişme sayısı */
  kesisme: number;
}

export interface YonlendirmeSecenekleri {
  /** söküp yeniden döşeme turu */
  tur?: number;
  log?: (s: string) => void;
}

/** Izgara sınırları: board'ların dışında 3 adım pay (teller taban plakasının kenarından da geçebilir) */
export function izgaraSiniri(y: Pick<BbYerlesim, "nx" | "ny">): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: -3, y0: -4, x1: y.nx * BX_ADIM + 2, y1: (y.ny - 1) * BY_ADIM + 21 };
}

/** Bir telin uzunluğu (mm) */
export function yolUzunlugu(yol: number[]): number {
  let s = 0;
  for (let i = 2; i < yol.length; i += 2) s += Math.abs(yol[i] - yol[i - 2]) + Math.abs(yol[i + 1] - yol[i - 1]);
  return s * ADIM;
}

// ---------------------------------------------------------------- ikili yığın

class Yigin {
  private k = new Float64Array(1 << 16);
  private v = new Int32Array(1 << 16);
  n = 0;
  temizle(): void { this.n = 0; }
  ekle(key: number, val: number): void {
    if (this.n === this.k.length) {
      const k2 = new Float64Array(this.k.length * 2); k2.set(this.k); this.k = k2;
      const v2 = new Int32Array(this.v.length * 2); v2.set(this.v); this.v = v2;
    }
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p;
    }
    this.k[i] = key; this.v[i] = val;
  }
  al(): number {
    const top = this.v[0];
    const key = this.k[--this.n];
    const val = this.v[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= key) break;
      this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
    }
    this.k[i] = key; this.v[i] = val;
    return top;
  }
}

// ---------------------------------------------------------------- maliyetler

const M = {
  adim: 1,
  kivrim: 3,
  /** boş deliğin üstünden geçmek (delik artık kullanılamaz) */
  bosDelik: 0.2,
  /** bağlantı bekleyen şeridin deliğini örtmek */
  bekleyenDelik: 1.5,
  /** başka telin ucunun üstünden geçmek */
  telUcu: 2,
  /** başka bir telle kesişmek */
  kesisme: 0.6,
  /** başka bir telle aynı çizgide üst üste (müzakereli: tarihle artar) */
  binme: 30,
};

interface Kayit {
  hucreler: number[];
  net: number;
  asama: number;
  ray: boolean;
  /** uç düğümleri */
  u1: number;
  u2: number;
  canli: boolean;
}

// ---------------------------------------------------------------- yönlendirici

export function yonlendir(board: Board, y: BbYerlesim, o: YonlendirmeSecenekleri = {}): YonlendirmeSonucu {
  const log = o.log ?? (() => {});
  const sinir = izgaraSiniri(y);
  const W = sinir.x1 - sinir.x0 + 1;
  const H = sinir.y1 - sinir.y0 + 1;
  const N = W * H;
  const hucre = (X: number, Y: number) => (Y - sinir.y0) * W + (X - sinir.x0);
  const hX = (h: number) => (h % W) + sinir.x0;
  const hY = (h: number) => Math.floor(h / W) + sinir.y0;

  // delikler ve düğümler
  const nb = y.boards.length;
  const dugumSayisi = nb * DUGUM_BOARD;
  const delikDugum = new Int32Array(N).fill(-1);
  /** 0 boş, 1 pin, 2 tel ucu */
  const delikDurum = new Uint8Array(N);
  const engel = new Uint8Array(N);
  const ortu = new Uint16Array(N);
  const yatay = new Uint8Array(N); // hücreden yatay geçen tel sayısı
  const dikey = new Uint8Array(N);
  const kenarY = new Uint8Array(N); // hücre → sağ komşu kenarı
  const kenarD = new Uint8Array(N); // hücre → alt komşu kenarı
  const tarihY = new Float32Array(N);
  const tarihD = new Float32Array(N);
  const dugumHucreleri: number[][] = Array.from({ length: dugumSayisi }, () => []);
  for (const b of y.boards) {
    for (let d = 0; d < DUGUM_BOARD; d++) {
      const g = b.no * DUGUM_BOARD + d;
      for (const [r, c] of dugumDelikleri(d)) {
        const h = hucre(kureselX(b.bx, c), kureselY(b.by, r));
        delikDugum[h] = g;
        dugumHucreleri[g].push(h);
      }
    }
  }

  // parçalar: pinler deliklere, gövdeler engel
  const parcaNesne = new Map<string, Parameters<typeof pinNeti>[0]>();
  for (const c of board.chips) parcaNesne.set(c.ref, c);
  for (const p of board.passives) parcaNesne.set(p.ref, p);
  /** düğümün neti (pinlerden); bağlantısız pin: pine özgü eksi kimlik */
  const dugumNet = new Int32Array(dugumSayisi).fill(-1);
  /** düğümdeki pinlerin en erken aşaması */
  const dugumAsama = new Int32Array(dugumSayisi).fill(99);
  const netAdi = (n: number) => board.netName(n);
  y.parcalar.forEach((p, pNo) => {
    const x = parcaNesne.get(p.ref)!;
    const [gx0, gy0, gx1, gy1] = p.govde;
    for (let Y = gy0; Y <= gy1; Y++) for (let X = gx0; X <= gx1; X++) engel[hucre(X, Y)] = 1;
    for (const bc of p.bacaklar) {
      const h = hucre(bc.X, bc.Y);
      const d = delikDugum[h];
      if (d < 0) throw new Error(`${p.ref}.${bc.pin} delik olmayan yere oturuyor (${bc.X}, ${bc.Y})`);
      if (delikDurum[h]) throw new Error(`${p.ref}.${bc.pin}: delik dolu (${bc.X}, ${bc.Y})`);
      delikDurum[h] = 1;
      const net = pinNeti(x, bc.pin);
      const id = net < 0 ? -(1000 + pNo * 100 + bc.pin) : net;
      if (dugumNet[d] === -1) dugumNet[d] = id;
      else if (dugumNet[d] !== id) throw new Error(`kısa devre: ${p.ref}.${bc.pin} (${net < 0 ? "boş" : netAdi(net)}) aynı şeritte ${dugumNet[d] < 0 ? "boş bir pinle" : netAdi(dugumNet[d])}`);
      dugumAsama[d] = Math.min(dugumAsama[d], p.asama);
    }
  });
  const delikKullanilabilir = (h: number) => delikDugum[h] >= 0 && delikDurum[h] === 0 && ortu[h] === 0 && engel[h] === 0;
  const bosSay = new Int32Array(dugumSayisi);
  for (let g = 0; g < dugumSayisi; g++) for (const h of dugumHucreleri[g]) if (delikKullanilabilir(h)) bosSay[g]++;

  // raylar
  const VCC = board.c.VCC;
  const GND = board.c.GND;
  const rayDugumu = (b: BbBoard, r: number) => b.no * DUGUM_BOARD + yerelDugum(r, 3);
  const rayNeti = new Int32Array(dugumSayisi).fill(-1);
  for (const b of y.boards) {
    for (const r of [0, 17]) rayNeti[rayDugumu(b, r)] = VCC;
    for (const r of [1, 16]) rayNeti[rayDugumu(b, r)] = GND;
  }
  for (let g = 0; g < dugumSayisi; g++) {
    if (rayNeti[g] < 0) continue;
    if (dugumNet[g] !== -1 && dugumNet[g] !== rayNeti[g]) throw new Error(`rayda yanlış net: ${netAdi(dugumNet[g])}`);
    dugumNet[g] = rayNeti[g];
    dugumAsama[g] = 1;
  }
  // netlerin uç düğümleri (raylar hariç)
  const netDugumleri = new Map<number, number[]>();
  for (let g = 0; g < dugumSayisi; g++) {
    const n = dugumNet[g];
    if (n < 0 || rayNeti[g] >= 0) continue;
    if (!netDugumleri.has(n)) netDugumleri.set(n, []);
    netDugumleri.get(n)!.push(g);
  }
  /** bağlantı bekliyor: ağaca henüz katılmamış uç düğümü (tek düğümlü netler beklemez) */
  const bekliyor = new Uint8Array(dugumSayisi);
  for (const [n, list] of netDugumleri) if (list.length > 1 || n === VCC || n === GND) for (const g of list) bekliyor[g] = 1;
  const tamam = new Set<number>();
  const ihtiyac = (g: number) => {
    const n = dugumNet[g];
    return n > 1 && rayNeti[g] < 0 && !tamam.has(n) && (netDugumleri.get(n)?.length ?? 0) > 1;
  };

  // ayrılmış delikler: neti tamamlanmamış düğümün 1–2 boş deliği (şeridin dış ucundan) hiçbir telin
  // altında kalmaz
  const ayrilmis = new Uint8Array(N);
  const ayrilan: number[][] = Array.from({ length: dugumSayisi }, () => []);
  const ayrilacak = (g: number) => {
    const n = dugumNet[g];
    if (n === VCC || n === GND) return 1;
    return (netDugumleri.get(n)?.length ?? 0) >= 3 ? 2 : 1;
  };
  const ayir = (g: number) => {
    const list = ayrilan[g];
    const istenen = ayrilacak(g);
    while (list.length < istenen) {
      let en = -1;
      let enP = -Infinity;
      for (const h of dugumHucreleri[g]) {
        if (!delikKullanilabilir(h) || ayrilmis[h]) continue;
        const r = ((hY(h) % BY_ADIM) + BY_ADIM) % BY_ADIM;
        const p = r <= 8 ? -r : r; // üst şeritte a, altta j önce
        if (p > enP) { enP = p; en = h; }
      }
      if (en < 0) break;
      list.push(en);
      ayrilmis[en] = 1;
    }
  };
  const birak = (g: number) => {
    for (const h of ayrilan[g]) ayrilmis[h] = 0;
    ayrilan[g] = [];
  };
  for (let g = 0; g < dugumSayisi; g++) if (bekliyor[g]) ayir(g);

  // ------------------------------------------------ teller
  const kayitlar: Kayit[] = [];
  const netTelleri = new Map<number, number[]>();

  const yonler = (hucreler: number[], i: number): [boolean, boolean] => {
    const h = hucreler[i];
    const a = i > 0 ? hucreler[i - 1] : -1;
    const b = i + 1 < hucreler.length ? hucreler[i + 1] : -1;
    const yt = (a >= 0 && Math.abs(a - h) === 1) || (b >= 0 && Math.abs(b - h) === 1);
    const dk = (a >= 0 && Math.abs(a - h) === W) || (b >= 0 && Math.abs(b - h) === W);
    return [yt, dk];
  };
  const kenarDegis = (h: number, s: number, d: number) => {
    if (s - h === 1) kenarY[h] += d;
    else if (h - s === 1) kenarY[s] += d;
    else if (s - h === W) kenarD[h] += d;
    else kenarD[s] += d;
  };

  const isle = (k: Kayit, geriKoy = false) => {
    const hs = k.hucreler;
    const a = hs[0];
    const z = hs[hs.length - 1];
    for (const u of [a, z]) {
      // geri koyarken uç deliğinin üstünden sonradan geçmiş teller olabilir (o teller sonra takılır)
      if (!geriKoy && !delikKullanilabilir(u)) throw new Error(`tel ucu kullanılamaz delikte (${hX(u)}, ${hY(u)})`);
      if (delikKullanilabilir(u)) bosSay[delikDugum[u]]--;
      delikDurum[u] = 2;
    }
    for (let i = 0; i < hs.length; i++) {
      const h = hs[i];
      const [yt, dk] = yonler(hs, i);
      if (i > 0 && i < hs.length - 1) {
        if (delikKullanilabilir(h)) bosSay[delikDugum[h]]--;
        ortu[h]++;
      }
      if (yt) yatay[h]++;
      if (dk) dikey[h]++;
      if (i + 1 < hs.length) kenarDegis(h, hs[i + 1], 1);
    }
    // uçlara takılan ayrılmış deliklerin yerine yenisi (yol işlendikten sonra)
    for (const u of [a, z]) {
      const g = delikDugum[u];
      const i = ayrilan[g].indexOf(u);
      if (i >= 0) {
        ayrilan[g].splice(i, 1);
        ayrilmis[u] = 0;
        if (bekliyor[g] || ihtiyac(g)) ayir(g);
      }
    }
    k.canli = true;
  };

  const sil = (k: Kayit) => {
    const hs = k.hucreler;
    for (let i = 0; i < hs.length; i++) {
      const h = hs[i];
      const [yt, dk] = yonler(hs, i);
      if (i > 0 && i < hs.length - 1) {
        ortu[h]--;
        if (delikKullanilabilir(h)) bosSay[delikDugum[h]]++;
      }
      if (yt) yatay[h]--;
      if (dk) dikey[h]--;
      if (i + 1 < hs.length) kenarDegis(h, hs[i + 1], -1);
    }
    for (const u of [hs[0], hs[hs.length - 1]]) {
      delikDurum[u] = 0;
      if (delikKullanilabilir(u)) bosSay[delikDugum[u]]++;
    }
    k.canli = false;
  };

  const telEkle = (hucreler: number[], net: number, asama: number, ray: boolean): number => {
    const k: Kayit = { hucreler, net, asama, ray, u1: delikDugum[hucreler[0]], u2: delikDugum[hucreler[hucreler.length - 1]], canli: false };
    isle(k);
    kayitlar.push(k);
    if (!netTelleri.has(net)) netTelleri.set(net, []);
    netTelleri.get(net)!.push(kayitlar.length - 1);
    return kayitlar.length - 1;
  };

  /** sabit yollu tel (ray köprüleri): köşe noktalarından hücre listesi */
  const sabitTel = (koseler: [number, number][], net: number) => {
    const hucreler: number[] = [];
    for (let i = 0; i < koseler.length; i++) {
      const [X, Y] = koseler[i];
      if (i === 0) { hucreler.push(hucre(X, Y)); continue; }
      const [pX, pY] = koseler[i - 1];
      const dx = Math.sign(X - pX);
      const dy = Math.sign(Y - pY);
      let cx = pX, cy = pY;
      while (cx !== X || cy !== Y) { cx += dx; cy += dy; hucreler.push(hucre(cx, cy)); }
    }
    telEkle(hucreler, net, 1, true);
  };

  // ------------------------------------------------ A*
  const DIR = [1, -1, W, -W];
  const S = N * 5;
  const gDeger = new Float32Array(S);
  const damga = new Uint32Array(S);
  const ata = new Int32Array(S);
  let dmg = 0;
  const yigin = new Yigin();
  const hedefDugum = new Uint8Array(dugumSayisi);
  const kaynakDugum = new Uint8Array(dugumSayisi);

  interface Pencere { x0: number; y0: number; x1: number; y1: number }
  const istatistik = { ara: 0, acilan: 0, genis: 0, tam: 0, gevsek: 0 };
  /**
   * Kaynak düğümlerin boş deliklerinden hedef düğümlerin birinin boş deliğine en ucuz yol.
   * Dönüş: hücre listesi ya da null.
   */
  const ara = (kaynaklar: number[], hedefler: number[], sezgisel: (h: number) => number, p: Pencere | null, gevsek = false): number[] | null => {
    dmg++;
    yigin.temizle();
    for (const g of hedefler) hedefDugum[g] = 1;
    for (const g of kaynaklar) kaynakDugum[g] = 1;
    const px0 = p ? Math.max(0, p.x0 - sinir.x0) : 0, px1 = p ? Math.min(W - 1, p.x1 - sinir.x0) : W - 1;
    const py0 = p ? Math.max(0, p.y0 - sinir.y0) : 0, py1 = p ? Math.min(H - 1, p.y1 - sinir.y0) : H - 1;
    let sonuc = -1;
    for (const g of kaynaklar) {
      for (const h of dugumHucreleri[g]) {
        if (!delikKullanilabilir(h)) continue;
        const s = h * 5 + 4;
        damga[s] = dmg;
        gDeger[s] = 0;
        ata[s] = -1;
        yigin.ekle(sezgisel(h), s);
      }
    }
    istatistik.ara++;
    while (yigin.n) {
      istatistik.acilan++;
      const s = yigin.al();
      const h = (s / 5) | 0;
      const yon = s - h * 5;
      const g0 = gDeger[s];
      if (yon < 4 && delikDugum[h] >= 0 && hedefDugum[delikDugum[h]] && delikKullanilabilir(h)) { sonuc = s; break; }
      const x = h % W;
      const yy = (h / W) | 0;
      for (let d = 0; d < 4; d++) {
        if (d === 0 ? x >= px1 : d === 1 ? x <= px0 : d === 2 ? yy >= py1 : yy <= py0) continue;
        if (yon < 4 && (yon ^ 1) === d) continue; // geri dönme
        const n = h + DIR[d];
        const nDugum = delikDugum[n];
        const hedefMi = nDugum >= 0 && hedefDugum[nDugum] === 1 && delikKullanilabilir(n);
        let c = M.adim;
        if (!hedefMi) {
          if (engel[n]) continue;
          if (nDugum >= 0) {
            // ayrılmış delik: yalnız kendi (kaynak) şeridinin
            if (ayrilmis[n] && !kaynakDugum[nDugum]) continue;
            // başka telin ucu: yalnız gevşek aramada (o tel bundan önce takılmalı)
            if (delikDurum[n] === 2) {
              if (!gevsek) continue;
              c += M.telUcu;
            } else if (ortu[n] === 0) c += kaynakDugum[nDugum] ? M.bosDelik : bekliyor[nDugum] || ihtiyac(nDugum) ? M.bekleyenDelik : M.bosDelik;
          }
          if (d < 2 ? dikey[n] : yatay[n]) c += M.kesisme;
        }
        if (yon < 4 && yon !== d) c += M.kivrim;
        // kenar binmesi: o kenarı kullanan her tel için, geçmiş turlardaki binmelerle artan ceza
        const kenar = d === 0 ? kenarY[h] : d === 1 ? kenarY[n] : d === 2 ? kenarD[h] : kenarD[n];
        const tarih = d === 0 ? tarihY[h] : d === 1 ? tarihY[n] : d === 2 ? tarihD[h] : tarihD[n];
        c += tarih;
        if (kenar) c += M.binme * kenar;
        const ns = n * 5 + d;
        const g1 = g0 + c;
        if (damga[ns] === dmg && gDeger[ns] <= g1) continue;
        damga[ns] = dmg;
        gDeger[ns] = g1;
        ata[ns] = s;
        yigin.ekle(g1 + sezgisel(n), ns);
      }
    }
    for (const g of hedefler) hedefDugum[g] = 0;
    for (const g of kaynaklar) kaynakDugum[g] = 0;
    if (sonuc < 0) return null;
    const out: number[] = [];
    for (let s = sonuc; s >= 0; s = ata[s]) out.push((s / 5) | 0);
    return out.reverse();
  };

  const kutu = (dugumler: number[]): Pencere => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const g of dugumler) for (const h of dugumHucreleri[g]) {
      const X = hX(h), Y = hY(h);
      if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
    }
    return { x0, y0, x1, y1 };
  };
  const kutuSezgisel = (hedefler: number[]) => {
    const { x0, y0, x1, y1 } = kutu(hedefler);
    return (h: number) => {
      const X = hX(h), Y = hY(h);
      return (X < x0 ? x0 - X : X > x1 ? X - x1 : 0) + (Y < y0 ? y0 - Y : Y > y1 ? Y - y1 : 0);
    };
  };
  const rayYSezgisel = (net: number) => {
    const satirlar = net === VCC ? [0, 17] : [1, 16];
    return (h: number) => {
      const yy = ((hY(h) % BY_ADIM) + BY_ADIM) % BY_ADIM;
      let m = Infinity;
      for (const r of satirlar) m = Math.min(m, Math.abs(yy - r), Math.abs(yy - r - BY_ADIM), Math.abs(yy - r + BY_ADIM));
      return m;
    };
  };
  const genislet = (p: Pencere, m: number): Pencere => ({ x0: p.x0 - m, y0: p.y0 - m, x1: p.x1 + m, y1: p.y1 + m });

  /** iki düğüm kümesini bağlayan yol (önce dar pencerede, bulamazsa genişleyerek) */
  const yolBul = (net: number, kaynaklar: number[], hedefler: number[], guc: boolean, atma = false): number[] | null => {
    const sez = guc ? rayYSezgisel(net) : kutuSezgisel(hedefler);
    const temel = guc ? kutu(kaynaklar) : kutu([...kaynaklar, ...hedefler]);
    for (const m of [guc ? 8 : 10, 30]) {
      const yol = ara(kaynaklar, hedefler, sez, genislet(temel, m));
      if (yol) return yol;
      istatistik.genis++;
    }
    istatistik.tam++;
    const yol = ara(kaynaklar, hedefler, sez, null);
    if (yol || !atma) return yol;
    // sıkışmış delik: başka tellerin uçlarının üstünden geçmeye izin ver
    istatistik.gevsek++;
    const yolG = ara(kaynaklar, hedefler, sez, null, true);
    if (yolG) return yolG;
    const tanim = (g: number) => {
      const b = y.boards[Math.floor(g / DUGUM_BOARD)];
      const hs = dugumHucreleri[g].map((h) => `${hX(h) - b.bx * BX_ADIM},${hY(h) - b.by * BY_ADIM}:${delikDurum[h]}${ortu[h] ? "o" : ""}${engel[h] ? "e" : ""}${ayrilmis[h] ? "a" : ""}`);
      return `${b.ad}#${g % DUGUM_BOARD}[${hs.join(" ")}]`;
    };
    throw new Error(`yol bulunamadı: ${netAdi(net)}; kaynak ${kaynaklar.slice(0, 6).map(tanim).join(" ")} hedef ${hedefler.slice(0, 6).map(tanim).join(" ")}`);
  };

  // ------------------------------------------------ 1. ray köprüleri
  const konumBoard = new Map(y.boards.map((b) => [`${b.bx},${b.by}`, b]));
  const kopru = (b: BbBoard, koseler: [number, number][], net: number) => sabitTel(koseler.map(([r, c]) => [kureselX(b.bx, c), kureselY(b.by, r)]), net);
  for (const b of y.boards) {
    // board içi: dış + raylar (63. sütun boyunca), iç − raylar (62. sütun boyunca)
    kopru(b, [[0, 61], [0, 63], [17, 63], [17, 61]], VCC);
    kopru(b, [[1, 61], [1, 62], [16, 62], [16, 61]], GND);
  }
  for (const b of y.boards) {
    if (!konumBoard.get(`${b.bx},${b.by + 1}`)) continue;
    // arkadaki board'un alt ray çifti → öndekinin üst ray çifti (sol uçta, düz)
    kopru(b, [[17, 4], [BY_ADIM + 0, 4]], VCC);
    kopru(b, [[16, 3], [BY_ADIM + 1, 3]], GND);
  }
  for (const b of y.boards) {
    if (!konumBoard.get(`${b.bx + 1},${b.by}`)) continue;
    if (b.by === 0) {
      kopru(b, [[0, 60], [-1, 60], [-1, BX_ADIM + 4], [0, BX_ADIM + 4]], VCC);
      kopru(b, [[1, 59], [-2, 59], [-2, BX_ADIM + 5], [1, BX_ADIM + 5]], GND);
    }
    if (b.by === y.ny - 1) {
      kopru(b, [[17, 60], [18, 60], [18, BX_ADIM + 4], [17, BX_ADIM + 4]], VCC);
      kopru(b, [[16, 59], [19, 59], [19, BX_ADIM + 5], [16, BX_ADIM + 5]], GND);
    }
  }
  log(`ray köprüleri: ${kayitlar.length}`);

  // ------------------------------------------------ 2. aşamalar
  /** netin ağaca bağlı düğümleri (güç netlerinde raylar baştan ağaçta) */
  const agac = new Map<number, Set<number>>();
  agac.set(VCC, new Set());
  agac.set(GND, new Set());
  for (let g = 0; g < dugumSayisi; g++) if (rayNeti[g] >= 0) agac.get(rayNeti[g])!.add(g);
  const asamaSayisi = Math.max(...y.parcalar.map((p) => p.asama));
  for (let asama = 1; asama <= asamaSayisi; asama++) {
    const once = kayitlar.length;
    for (const net of [VCC, GND]) {
      const list = (netDugumleri.get(net) ?? []).filter((g) => dugumAsama[g] === asama && bekliyor[g]).sort((a, b) => a - b);
      const t = agac.get(net)!;
      for (const g of list) {
        const yol = yolBul(net, [g], [...t], true, true)!;
        telEkle(yol, net, asama, false);
        bekliyor[g] = 0;
        birak(g);
        t.add(g);
      }
    }
    const isler: { net: number; uclar: number[]; kutu: number }[] = [];
    for (const [net, list] of netDugumleri) {
      if (net === VCC || net === GND) continue;
      const uclar = list.filter((g) => dugumAsama[g] <= asama);
      if (!list.some((g) => dugumAsama[g] === asama) || uclar.length < 2) continue;
      const k = kutu(uclar);
      isler.push({ net, uclar, kutu: k.x1 - k.x0 + k.y1 - k.y0 });
    }
    isler.sort((a, b) => a.kutu - b.kutu || a.net - b.net);
    for (const is of isler) {
      if (!agac.has(is.net)) agac.set(is.net, new Set());
      const t = agac.get(is.net)!;
      if (!t.size) {
        t.add(is.uclar[0]);
        bekliyor[is.uclar[0]] = 0;
      }
      for (;;) {
        const kalan = is.uclar.filter((g) => !t.has(g));
        if (!kalan.length) break;
        const yol = yolBul(is.net, [...t], kalan, false, true)!;
        const ti = telEkle(yol, is.net, asama, false);
        const z = kalan.includes(kayitlar[ti].u2) ? kayitlar[ti].u2 : kayitlar[ti].u1;
        t.add(z);
        bekliyor[z] = 0;
      }
      const hepsi = netDugumleri.get(is.net)!;
      if (hepsi.every((g) => t.has(g))) {
        tamam.add(is.net);
        for (const g of hepsi) birak(g);
      }
    }
    log(`aşama ${asama}: ${kayitlar.length - once} tel ${JSON.stringify(istatistik)}`);
  }
  // bütün netler tamam: ayrılmış delik kalmaz
  for (let g = 0; g < dugumSayisi; g++) birak(g);

  // ------------------------------------------------ 3. söküp yeniden döşeme
  const telBinme = (k: Kayit) => {
    let s = 0;
    const hs = k.hucreler;
    for (let i = 0; i + 1 < hs.length; i++) {
      const h = hs[i], n = hs[i + 1];
      const e = n - h === 1 ? kenarY[h] : h - n === 1 ? kenarY[n] : n - h === W ? kenarD[h] : kenarD[n];
      if (e > 1) s++;
    }
    return s;
  };
  const manhattan = (k: Kayit) => {
    const a = k.hucreler[0], z = k.hucreler[k.hucreler.length - 1];
    return Math.abs(hX(a) - hX(z)) + Math.abs(hY(a) - hY(z));
  };
  /** telin netindeki öteki tellerle, `bas` düğümünden erişilen düğümler */
  const bilesen = (ti: number, bas: number): Set<number> => {
    const k = kayitlar[ti];
    const komsu = new Map<number, number[]>();
    for (const j of netTelleri.get(k.net)!) {
      const q = kayitlar[j];
      if (j === ti || !q.canli) continue;
      if (!komsu.has(q.u1)) komsu.set(q.u1, []);
      if (!komsu.has(q.u2)) komsu.set(q.u2, []);
      komsu.get(q.u1)!.push(q.u2);
      komsu.get(q.u2)!.push(q.u1);
    }
    // aynı netin raylarının hepsi ray köprüleriyle zaten bağlı (köprüler de netTelleri'nde)
    const gorulen = new Set<number>([bas]);
    const kuyruk = [bas];
    while (kuyruk.length) {
      const u = kuyruk.pop()!;
      for (const v of komsu.get(u) ?? []) if (!gorulen.has(v)) { gorulen.add(v); kuyruk.push(v); }
    }
    return gorulen;
  };
  const yenidenDose = (ti: number): boolean => {
    const k = kayitlar[ti];
    const eski = k.hucreler;
    sil(k);
    const A = [...bilesen(ti, k.u1)].filter((g) => dugumAsama[g] <= k.asama);
    const B = [...bilesen(ti, k.u2)].filter((g) => dugumAsama[g] <= k.asama);
    if (A.includes(k.u2)) throw new Error(`ağaçta döngü: ${netAdi(k.net)}`);
    const guc = k.net === VCC || k.net === GND;
    // küçük taraf kaynak (güçte şerit tarafı)
    const [kay, hed] = A.length <= B.length ? [A, B] : [B, A];
    const yol = yolBul(k.net, kay, hed, guc);
    if (!yol) {
      isle(k, true);
      return false;
    }
    k.hucreler = yol;
    k.u1 = delikDugum[yol[0]];
    k.u2 = delikDugum[yol[yol.length - 1]];
    isle(k);
    return yol.length !== eski.length || yol.some((h, i) => h !== eski[i]);
  };
  const turSayisi = o.tur ?? 10;
  for (let tur = 1; tur <= turSayisi; tur++) {
    // tarih: üst üste binilen kenarlar pahalanır
    let binen = 0;
    for (let h = 0; h < N; h++) {
      if (kenarY[h] > 1) { tarihY[h] += 4; binen++; }
      if (kenarD[h] > 1) { tarihD[h] += 4; binen++; }
    }
    const adaylar = kayitlar.map((k, i) => ({ i, k })).filter(({ k }) => !k.ray && k.canli);
    const sirali = adaylar
      .map(({ i, k }) => ({ i, b: telBinme(k), f: k.hucreler.length - 1 - manhattan(k) }))
      .filter((x) => x.b > 0 || x.f > 6 || tur === turSayisi)
      .sort((a, b) => b.b - a.b || b.f - a.f);
    let degisen = 0;
    for (const { i } of sirali) if (yenidenDose(i)) degisen++;
    log(`tur ${tur}: ${binen} binen kenar, ${sirali.length} tel yeniden, ${degisen} değişti`);
  }

  // ------------------------------------------------ sonuç
  let binme = 0;
  let kesisme = 0;
  for (let h = 0; h < N; h++) {
    if (kenarY[h] > 1) binme += kenarY[h] - 1;
    if (kenarD[h] > 1) binme += kenarD[h] - 1;
    if (yatay[h] && dikey[h] && ortu[h] > 1) kesisme += Math.min(yatay[h], dikey[h]);
  }
  const renkler = new Map<number, TelRengi>();
  const netBloklari = new Map<number, Set<string>>();
  for (const p of y.parcalar) {
    const x = parcaNesne.get(p.ref)!;
    for (const bc of p.bacaklar) {
      const n = pinNeti(x, bc.pin);
      if (n < 0) continue;
      if (!netBloklari.has(n)) netBloklari.set(n, new Set());
      netBloklari.get(n)!.add(p.blok);
    }
  }
  const renkOf = (n: number): TelRengi => {
    if (!renkler.has(n)) renkler.set(n, telRengi(netAdi(n), [...(netBloklari.get(n) ?? [])]));
    return renkler.get(n)!;
  };
  const teller = kayitlar.map((k) => {
    const hs = k.hucreler;
    const yol: number[] = [hX(hs[0]), hY(hs[0])];
    for (let i = 1; i < hs.length - 1; i++) if (hs[i] - hs[i - 1] !== hs[i + 1] - hs[i]) yol.push(hX(hs[i]), hY(hs[i]));
    yol.push(hX(hs[hs.length - 1]), hY(hs[hs.length - 1]));
    const uzunluk = yolUzunlugu(yol);
    return { net: k.net, ad: netAdi(k.net), renk: k.ray ? (k.net === VCC ? "kirmizi" : "siyah") : renkOf(k.net), asama: k.asama, ray: k.ray, yol, uzunluk, kesim: Math.ceil(uzunluk + 2 * UC_PAYI) } as Omit<BbTel, "no">;
  });
  return { teller, binme, kesisme };
}
