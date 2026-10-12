// İkiliden onluğa (BCD) çevirme, birleşimsel "3 ekle ve kaydır" (double dabble) ağı.
// Algoritma: ikili sayı en anlamlı bitten başlayarak BCD hanelerine bit bit kaydırılır; her
// kaydırmadan önce 5 ya da daha büyük olan her haneye 3 eklenir (kaydırınca 2 katı + 6 = onluk
// taşma). Donanımda her "≥ 5 ise 3 ekle" bir modüldür: 3 kapı (≥ 5 algılama) + bir 74HC283.
// Bir modül yalnızca o noktada hanenin gerçekten 5'i geçebildiği yerlere konur (bütün girişler
// denenerek bulunur), böylece 8 bit için 7, 16 bit için 30'a yakın modül yeter.

import type { Board } from "../cpu16/board/board.ts";
import { Havuz } from "./havuz.ts";

type Net = number;

export interface BcdModul {
  /** kaçıncı kaydırmadan önce (0 = ilk) */
  adim: number;
  /** hangi hane (0 = birler) */
  hane: number;
  /** 74HC283'ün referansı */
  ref: string;
}

export interface BcdAgi {
  /** onluk haneler, birlerden başlayarak; her hane 4 bit (D0..D3), sabit 0 bitler GND */
  haneler: Net[][];
  moduller: BcdModul[];
}

/**
 * Hangi (adım, hane) noktasında modül gerekir: n bitlik bütün girişler için algoritmayı sayıyla
 * çalıştırıp hanenin o anda 5'e ulaşabildiği yerleri bulur. i. adımda yazmaçta yalnız girişin en
 * anlamlı i biti vardır: 2^i ayrı değer. Her adımda bu değerler birer kez işlenir (girişleri tek tek
 * çalıştırmaktan n kat az iş).
 */
export function modulYerleri(n: number, haneSayisi: number): boolean[][] {
  const gerek = Array.from({ length: n }, () => Array<boolean>(haneSayisi).fill(false));
  let yazmaclar = new Uint32Array(1); // BCD yazmacı (4 bit / hane), girişin kaydırılmış her başı için
  for (let i = 0; i < n; i++) {
    const sonraki = new Uint32Array(2 * yazmaclar.length);
    for (let k = 0; k < yazmaclar.length; k++) {
      let reg = yazmaclar[k];
      for (let h = 0; h < haneSayisi; h++) {
        if (((reg >>> (4 * h)) & 15) >= 5) {
          gerek[i][h] = true;
          reg += 3 << (4 * h);
        }
      }
      sonraki[2 * k] = reg * 2; // sıradaki giriş biti 0
      sonraki[2 * k + 1] = reg * 2 + 1; // 1
    }
    yazmaclar = sonraki;
  }
  return gerek;
}

/** n bitlik ikili sayının (bits[0] en düşük) onluk hanelerini üreten ağ */
export function onlugaCevir(b: Board, bits: Net[], haneSayisi: number, blok: string, onek: string): BcdAgi {
  const n = bits.length;
  const GND = b.c.GND;
  const gerek = modulYerleri(n, haneSayisi);
  const eskiBlok = b.block;
  b.block = blok;
  const h = new Havuz(b, `${blok}: ≥ 5 algılama`);
  let reg: Net[] = Array(4 * haneSayisi).fill(GND);
  const moduller: BcdModul[] = [];
  for (let i = 0; i < n; i++) {
    for (let hane = 0; hane < haneSayisi; hane++) {
      if (!gerek[i][hane]) continue;
      const d = reg.slice(4 * hane, 4 * hane + 4);
      // ≥ 5 = d3 + d2·(d1 + d0)
      const d10 = d[1] === GND ? d[0] : d[0] === GND ? d[1] : h.or(d[0], d[1]);
      const d210 = d[2] === GND || d10 === GND ? GND : h.and(d[2], d10);
      const ge5 = d[3] === GND ? d210 : d210 === GND ? d[3] : h.or(d[3], d210, b.n(`${onek}_GE5_${i}_${hane}`));
      if (ge5 === GND) throw new Error(`${blok}: ${i}. adım ${hane}. hane 5'e ulaşamıyor ama modül istendi`);
      const out = [0, 1, 2, 3].map((k) => b.n(`${onek}_${i}_${hane}_${k}`));
      const u = b.place("74HC283", {
        A1: d[0], A2: d[1], A3: d[2], A4: d[3], B1: ge5, B2: ge5, B3: GND, B4: GND, CIN: GND,
        S1: out[0], S2: out[1], S3: out[2], S4: out[3],
      }, `${blok}: ${i + 1}. kaydırmadan önce ${hane === 0 ? "birler" : hane === 1 ? "onlar" : hane === 2 ? "yüzler" : hane === 3 ? "binler" : "on binler"} hanesi ≥ 5 ise + 3`);
      moduller.push({ adim: i, hane, ref: u.ref });
      reg.splice(4 * hane, 4, ...out);
    }
    const dusen = reg[reg.length - 1];
    if (dusen !== GND) throw new Error(`${blok}: ${haneSayisi} hane yetmiyor`);
    reg = [bits[n - 1 - i], ...reg.slice(0, -1)];
  }
  h.bitir();
  b.block = eskiBlok;
  return { haneler: Array.from({ length: haneSayisi }, (_, k) => reg.slice(4 * k, 4 * k + 4)), moduller };
}
