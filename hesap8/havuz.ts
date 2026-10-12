// Kapı havuzu: bir bloğun kapılarını toplar, blok bitince aynı türden kapıları çiplere paketler
// (74HC08'de 4 AND, 74HC04'te 6 NOT …). Board'un kendi "yapıştırıcı lojik" paketlemesinden farkı:
// çipler kendi bloğunda kalır (çarpmanın AND'leri "Çarpma" bloğunda), böylece 3D görünümde ve
// kurulum belgesinde her blok kendi çipleriyle bir arada durur.

import type { Board } from "../cpu16/board/board.ts";

type Net = number;

const TURLER = {
  and: { part: "74HC08", units: 4, pins: (u: number) => [`${u}A`, `${u}B`, `${u}Y`] },
  or: { part: "74HC32", units: 4, pins: (u: number) => [`${u}A`, `${u}B`, `${u}Y`] },
  nand: { part: "74HC00", units: 4, pins: (u: number) => [`${u}A`, `${u}B`, `${u}Y`] },
  nor: { part: "74HC02", units: 4, pins: (u: number) => [`${u}A`, `${u}B`, `${u}Y`] },
  xor: { part: "74HC86", units: 4, pins: (u: number) => [`${u}A`, `${u}B`, `${u}Y`] },
  not: { part: "74HC04", units: 6, pins: (u: number) => [`${u}A`, `${u}Y`] },
  nand8: { part: "74HC30", units: 1, pins: () => ["A", "B", "C", "D", "E", "F", "G", "H", "Y"] },
} as const;
type Tur = keyof typeof TURLER;

interface Kapi {
  ins: Net[];
  out: Net;
  rol: string;
}

export class Havuz {
  private readonly kapilar = new Map<Tur, Kapi[]>();
  private readonly b: Board;
  private readonly ad: string;
  private readonly blok: string;
  private bitti = false;

  /** `ad`: çiplerin görev yazısının başı (ör. "kısmi çarpımlar B3 · A") */
  constructor(b: Board, ad: string) {
    this.b = b;
    this.ad = ad;
    this.blok = b.block;
  }

  private ekle(tur: Tur, ins: Net[], out?: Net, rol = ""): Net {
    if (this.bitti) throw new Error(`${this.ad}: havuz kapandıktan sonra kapı eklenemez`);
    const y = out ?? this.b.c.net();
    let l = this.kapilar.get(tur);
    if (!l) this.kapilar.set(tur, (l = []));
    l.push({ ins, out: y, rol });
    return y;
  }

  and(a: Net, x: Net, out?: Net, rol?: string) { return this.ekle("and", [a, x], out, rol); }
  or(a: Net, x: Net, out?: Net, rol?: string) { return this.ekle("or", [a, x], out, rol); }
  nand(a: Net, x: Net, out?: Net, rol?: string) { return this.ekle("nand", [a, x], out, rol); }
  nor(a: Net, x: Net, out?: Net, rol?: string) { return this.ekle("nor", [a, x], out, rol); }
  xor(a: Net, x: Net, out?: Net, rol?: string) { return this.ekle("xor", [a, x], out, rol); }
  not(a: Net, out?: Net, rol?: string) { return this.ekle("not", [a], out, rol); }
  /** 2..8 girişli NAND (74HC30); eksik girişler VCC */
  nand8(ins: Net[], out?: Net, rol?: string) {
    if (ins.length < 2 || ins.length > 8) throw new Error(`nand8: ${ins.length} giriş`);
    return this.ekle("nand8", [...ins, ...Array<Net>(8 - ins.length).fill(this.b.c.VCC)], out, rol);
  }

  /** Kapıları çiplere yerleştir (bloğun içinde); boş birimlerin girişleri GND */
  bitir(): void {
    if (this.bitti) return;
    this.bitti = true;
    const blok = this.b.block;
    this.b.block = this.blok;
    for (const tur of Object.keys(TURLER) as Tur[]) {
      const l = this.kapilar.get(tur) ?? [];
      const t = TURLER[tur];
      for (let i = 0; i < l.length; i += t.units) {
        const grup = l.slice(i, i + t.units);
        const conn: Record<string, Net> = {};
        for (let u = 1; u <= t.units; u++) {
          const pins = t.pins(u);
          const k = grup[u - 1];
          if (k) pins.forEach((p, j) => (conn[p] = j < k.ins.length ? k.ins[j] : k.out));
          else pins.slice(0, -1).forEach((p) => (conn[p] = this.b.c.GND));
        }
        const roller = [...new Set(grup.map((k) => k.rol).filter(Boolean))];
        this.b.place(t.part, conn, roller.length ? `${this.ad}: ${roller.join(", ")}` : this.ad);
      }
    }
    this.b.block = blok;
  }
}
