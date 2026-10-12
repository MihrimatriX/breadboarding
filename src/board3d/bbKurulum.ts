// Breadboard kurulum modu: panoları tel tel kurarken. Hesap makinesinde tek pano (hesap8/breadboard, 60
// board); bilgisayarda her kart kendi panosu (cpu16/breadboard, 7 pano), pano ve aşama seçilir. Tel
// numaraları yazdırılan breadboard belgesiyle aynıdır (pano başına T0001 …, kurulum sırası); her tel
// delikten deliğe yazılır ("BB07 c14 → BB08 h3, 42 mm, sarı"; bilgisayarda önünde panonun adı: "CPU ·
// …"). Takılan teller tarayıcıda pano başına saklanır; 3D sahne odaktaki teli kalın ve parlak,
// panonun takılan tellerini kendi renginde, takılmayanları soluk çizer.

import { create } from "zustand";
import { BX_ADIM, BY_ADIM, DUGUM_BOARD, satirRayi, yerelDugum } from "../../cpu16/board/breadboard/geometri";
import { noktaBoardu, ucEtiketi, type BbPlanTemel, type BbTel } from "../../cpu16/board/breadboard/plan";
import { KART_SIRASI } from "../../cpu16/breadboard/panolar";
import type { BbPlani } from "../../hesap8/breadboard/plan";
import { renkTanimi } from "../../hesap8/breadboard/renk";
import { aktifKart, bbSahnesi, kartDegisince, type BbPanosu, type KartTuru } from "./aktif";

/** Telin numarası belgelerdeki gibi: T0001 */
export const telKimligi = (no: number): string => `T${String(no).padStart(4, "0")}`;

/** Hesap makinesinin telinin tek satırlık tarifi: "BB07 c14 → BB08 h3, 42 mm, sarı" (genel: BbPanosu.tarif) */
export function telTarifi(p: BbPlani, t: BbTel): string {
  const n = t.yol.length;
  return `${ucEtiketi(p.yerlesim, t.yol[0], t.yol[1])} → ${ucEtiketi(p.yerlesim, t.yol[n - 2], t.yol[n - 1])}, ${Math.round(t.uzunluk)} mm, ${renkTanimi(t.renk).ad.toLocaleLowerCase("tr-TR")}`;
}

/** Bir ucun şeridinde (ya da rayında) ne var: "U12.3, U14.11" ya da "+5 V rayı" */
export function ucunKomsulari(p: Pick<BbPlanTemel, "yerlesim">, X: number, Y: number): string {
  const no = noktaBoardu(p.yerlesim, X, Y);
  const b = p.yerlesim.boards[no];
  const r = Y - b.by * BY_ADIM;
  const c = X - b.bx * BX_ADIM;
  const ray = satirRayi(r);
  if (ray) return `${ray.endsWith("+") ? "+5 V" : "GND"} rayı (${ray.startsWith("ust") ? "üst" : "alt"})`;
  const d = no * DUGUM_BOARD + yerelDugum(r, c);
  const pinler: string[] = [];
  for (const q of p.yerlesim.parcalar) {
    if (q.board !== no) continue;
    for (const k of q.bacaklar) {
      const kb = k.Y - b.by * BY_ADIM;
      if (satirRayi(kb)) continue;
      if (no * DUGUM_BOARD + yerelDugum(kb, k.X - b.bx * BX_ADIM) === d) pinler.push(`${q.ref}.${k.pin}`);
    }
  }
  return pinler.length ? [...new Set(pinler)].join(", ") : "boş şerit (yalnız teller)";
}

// ---------------------------------------------------------------- pano ve ilerleme (tarayıcıda)

/** Kart türünün ilk panosu (bilgisayarda kurulum sırasıyla ilk kart: saat) */
const ilkPano = (tur: KartTuru): string => (tur === "hesap" ? "hesap" : KART_SIRASI[0]);

/** Panonun ilerlemesinin tarayıcıdaki anahtarı (hesap makinesininki eskisi gibi) */
export const bbKurulumAnahtari = (kart: string): string => (kart === "hesap" ? "hesap8.breadboard.kurulum" : `cpu16.breadboard.kurulum.${kart}`);

/** Sahnedeki kartın panosu (yoksa ilki) */
export function bbPano(kart: string): BbPanosu {
  const s = bbSahnesi();
  return s.panolar.find((p) => p.kart === kart) ?? s.panolar[0];
}

function okuYapilan(kart: string): Set<number> {
  try {
    const raw = localStorage.getItem(bbKurulumAnahtari(kart));
    const x = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(x) ? x.filter((n): n is number => typeof n === "number") : []);
  } catch {
    return new Set();
  }
}

function yazYapilan(kart: string, y: Set<number>): void {
  try {
    localStorage.setItem(bbKurulumAnahtari(kart), JSON.stringify([...y]));
  } catch {
    /* gizli pencere ya da kapalı depolama: ilerleme yalnız bu oturumda */
  }
}

// ---------------------------------------------------------------- durum

export interface BbKurulumState {
  acik: boolean;
  /** panonun kartı: "hesap" ya da CPU16 kartı (cpu, clk, …) */
  pano: string;
  /** yalnız bu aşamanın telleri (null: hepsi) */
  asama: number | null;
  /** panonun takılan tellerinin numaraları */
  yapilan: Set<number>;
  /** odaktaki telin numarası (panoda) */
  secili: number | null;
  izle: boolean;
  ac(acik: boolean): void;
  setIzle(izle: boolean): void;
  panoSec(kart: string): void;
  asamaSec(no: number | null): void;
  isaretle(no: number, takildi?: boolean): void;
  sec(no: number | null): void;
  git(yon: 1 | -1, yalnizAcik?: boolean): void;
  sifirla(): void;
}

/** Sıradaki takılmamış tel (verilen telden sonra; yoksa baştan) */
export function bbSiradakiAcik(teller: readonly BbTel[], yapilan: ReadonlySet<number>, sonra?: number | null): BbTel | null {
  const i0 = sonra ? teller.findIndex((t) => t.no === sonra) + 1 : 0;
  for (let k = 0; k < teller.length; k++) {
    const t = teller[(i0 + k) % teller.length];
    if (!yapilan.has(t.no)) return t;
  }
  return null;
}

/** Gezilen teller: panonun bütün telleri ya da seçili aşamanınkiler */
export function bbGezilenTeller(s: Pick<BbKurulumState, "pano" | "asama">): BbTel[] {
  const t = bbPano(s.pano).plan.teller;
  return s.asama === null ? t : t.filter((x) => x.asama === s.asama);
}

export const useBbKurulum = create<BbKurulumState>((set, get) => ({
  acik: false,
  pano: ilkPano(aktifKart()),
  asama: null,
  yapilan: okuYapilan(ilkPano(aktifKart())),
  secili: null,
  izle: true,
  ac(acik) {
    set({ acik });
    if (acik && get().secili === null) set({ secili: bbSiradakiAcik(bbGezilenTeller(get()), get().yapilan)?.no ?? 1 });
  },
  setIzle(izle) {
    set({ izle });
  },
  panoSec(kart) {
    if (kart === get().pano) return;
    const yapilan = okuYapilan(kart);
    const yeni = { pano: kart, asama: null };
    set({ ...yeni, yapilan, secili: bbSiradakiAcik(bbGezilenTeller(yeni), yapilan)?.no ?? 1 });
  },
  asamaSec(no) {
    const yeni = { pano: get().pano, asama: no };
    const teller = bbGezilenTeller(yeni);
    set({ asama: no, secili: bbSiradakiAcik(teller, get().yapilan)?.no ?? teller[0]?.no ?? get().secili });
  },
  isaretle(no, takildi) {
    const { pano } = get();
    const yapilan = new Set(get().yapilan);
    const yeni = takildi ?? !yapilan.has(no);
    if (yeni) yapilan.add(no);
    else yapilan.delete(no);
    yazYapilan(pano, yapilan);
    set({ yapilan, secili: yeni ? (bbSiradakiAcik(bbGezilenTeller(get()), yapilan, no)?.no ?? no) : no });
  },
  sec(no) {
    set({ secili: no });
  },
  git(yon, yalnizAcik = false) {
    const t = bbGezilenTeller(get());
    if (!t.length) return;
    const { secili, yapilan } = get();
    let i = Math.max(0, t.findIndex((x) => x.no === secili));
    for (let k = 0; k < t.length; k++) {
      i = (i + yon + t.length) % t.length;
      if (!yalnizAcik || !yapilan.has(t[i].no)) break;
    }
    set({ secili: t[i].no });
  },
  sifirla() {
    const yapilan = new Set<number>();
    yazYapilan(get().pano, yapilan);
    set({ yapilan, secili: bbGezilenTeller(get())[0]?.no ?? 1 });
  },
}));

/** Odaktaki tel */
export const bbSeciliTel = (s: Pick<BbKurulumState, "pano" | "secili">): BbTel | null => (s.secili ? (bbPano(s.pano).plan.teller[s.secili - 1] ?? null) : null);

// sahnedeki kart değişince o kartın ilk panosu (ilerlemesi tarayıcıdan)
kartDegisince((tur) => {
  const pano = ilkPano(tur);
  if (useBbKurulum.getState().pano === pano) return;
  useBbKurulum.setState({ pano, asama: null, yapilan: okuYapilan(pano), secili: null });
});
