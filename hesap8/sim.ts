// Hesap makinesinin kapı seviyesi simülasyonu: anahtarları ayarla, devre yerleşsin, göstergeleri oku.
// Anahtar kapalı (1) = net VCC'ye bağlanır (dışarıdan sürülür); açık (0) = çekme direnci 0 yapar.

import { LogicSim, L1 } from "../cpu16/chips/logic.ts";
import { RAKAM_SEGMENT, SEGMENTLER } from "../cpu16/chips/parts/gosterge.ts";
import { buildHesapBoard, type GostergeGrubu, type HesapKarti } from "./kart.ts";
import type { Gorunum, IslemKodu } from "./model.ts";

/** Segment değerlerinden (a..g) görünen karakter: sönük → boşluk, rakam, tanınmayan desen → "?" */
export function segmentKarakteri(seg: readonly number[]): string {
  const yanan = SEGMENTLER.filter((_, i) => seg[i] === 1).join("");
  if (!yanan) return " ";
  const r = RAKAM_SEGMENT.indexOf(yanan);
  if (r >= 0) return String(r);
  return yanan === "g" ? "-" : "?";
}

export class HesapSim {
  readonly kart: HesapKarti;
  readonly sim: LogicSim;
  a = 0;
  b = 0;
  op: IslemKodu = 0;
  lambaTesti = false;

  constructor(kart: HesapKarti = buildHesapBoard()) {
    this.kart = kart;
    this.sim = new LogicSim(kart.board.c);
    for (const p of kart.board.pulls) this.sim.pull(p.net, p.level);
    this.sim.settle();
  }

  private anahtar(net: number, acik: boolean) {
    if (acik) this.sim.drive(net, true);
    else this.sim.release(net);
  }

  /** A, B ve işlem anahtarlarını ayarla, devre yerleşsin */
  ayarla(a: number, b: number, op: IslemKodu): void {
    this.a = a & 0xff;
    this.b = b & 0xff;
    this.op = op;
    this.kart.a.forEach((n, i) => this.anahtar(n, ((this.a >> i) & 1) === 1));
    this.kart.b.forEach((n, i) => this.anahtar(n, ((this.b >> i) & 1) === 1));
    this.kart.op.forEach((n, i) => this.anahtar(n, ((op >> i) & 1) === 1));
    this.sim.settle();
  }

  /** Lamba testi butonu (basılı = LT_N 0) */
  lamba(basili: boolean): void {
    this.lambaTesti = basili;
    if (basili) this.sim.drive(this.kart.ltN, false);
    else this.sim.release(this.kart.ltN);
    this.sim.settle();
  }

  /** Netlerin değerleri sayıya (bit 0 ilk) */
  sayi(nets: number[]): number {
    return nets.reduce((v, n, i) => v | ((this.sim.get(n) === L1 ? 1 : 0) << i), 0);
  }

  grupMetni(g: GostergeGrubu): string {
    const isaret = g.isaret ? (this.sim.get(g.isaret.g) === L1 ? "-" : " ") : "";
    return isaret + g.haneler.map((h) => segmentKarakteri(h.seg.map((n) => this.sim.get(n)))).join("");
  }

  /** Göstergelerde görünenler */
  oku(): Gorunum {
    const g = (ad: GostergeGrubu["ad"]) => this.grupMetni(this.kart.gruplar.find((x) => x.ad === ad)!);
    return { a: g("a"), b: g("b"), sonuc: g("sonuc"), kalan: g("kalan"), hata: this.sim.get(this.kart.ic.hata) === L1 };
  }
}
