// Hesap makinesinin breadboard kurulum modu: 60 board'u tel tel kurarken (hesap8/breadboard planı).
// Tel numaraları yazdırılan breadboard belgesiyle aynıdır (T0001 …, kurulum sırası); her tel delikten
// deliğe yazılır ("BB07 c14 → BB08 h3, 42 mm, sarı"). Takılan teller tarayıcıda saklanır; 3D sahne
// odaktaki teli kalın ve parlak, takılanları kendi renginde, takılmayanları soluk çizer.

import { create } from "zustand";
import { BX_ADIM, BY_ADIM, DUGUM_BOARD, satirRayi, yerelDugum } from "../../hesap8/breadboard/geometri";
import { noktaBoardu, ucEtiketi, type BbPlani, type BbTel } from "../../hesap8/breadboard/plan";
import { renkTanimi } from "../../hesap8/breadboard/renk";
import { hesapPlani } from "./aktif";

/** Telin numarası belgelerdeki gibi: T0001 */
export const telKimligi = (no: number): string => `T${String(no).padStart(4, "0")}`;

/** Telin tek satırlık tarifi: "BB07 c14 → BB08 h3, 42 mm, sarı" */
export function telTarifi(p: BbPlani, t: BbTel): string {
  const n = t.yol.length;
  return `${ucEtiketi(p.yerlesim, t.yol[0], t.yol[1])} → ${ucEtiketi(p.yerlesim, t.yol[n - 2], t.yol[n - 1])}, ${Math.round(t.uzunluk)} mm, ${renkTanimi(t.renk).ad.toLocaleLowerCase("tr-TR")}`;
}

/** Bir ucun şeridinde (ya da rayında) ne var: "U12.3, U14.11" ya da "+5 V rayı" */
export function ucunKomsulari(p: BbPlani, X: number, Y: number): string {
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

// ---------------------------------------------------------------- ilerleme (tarayıcıda)

const ANAHTAR = "hesap8.breadboard.kurulum";

function okuYapilan(): Set<number> {
  try {
    const raw = localStorage.getItem(ANAHTAR);
    const x = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(x) ? x.filter((n): n is number => typeof n === "number") : []);
  } catch {
    return new Set();
  }
}

function yazYapilan(y: Set<number>): void {
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify([...y]));
  } catch {
    /* gizli pencere ya da kapalı depolama: ilerleme yalnız bu oturumda */
  }
}

// ---------------------------------------------------------------- durum

export interface BbKurulumState {
  acik: boolean;
  /** takılan tellerin numaraları */
  yapilan: Set<number>;
  /** odaktaki telin numarası */
  secili: number | null;
  izle: boolean;
  ac(acik: boolean): void;
  setIzle(izle: boolean): void;
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

export const useBbKurulum = create<BbKurulumState>((set, get) => ({
  acik: false,
  yapilan: okuYapilan(),
  secili: null,
  izle: true,
  ac(acik) {
    set({ acik });
    if (acik && get().secili === null) set({ secili: bbSiradakiAcik(hesapPlani().teller, get().yapilan)?.no ?? 1 });
  },
  setIzle(izle) {
    set({ izle });
  },
  isaretle(no, takildi) {
    const yapilan = new Set(get().yapilan);
    const yeni = takildi ?? !yapilan.has(no);
    if (yeni) yapilan.add(no);
    else yapilan.delete(no);
    yazYapilan(yapilan);
    set({ yapilan, secili: yeni ? (bbSiradakiAcik(hesapPlani().teller, yapilan, no)?.no ?? no) : no });
  },
  sec(no) {
    set({ secili: no });
  },
  git(yon, yalnizAcik = false) {
    const t = hesapPlani().teller;
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
    yazYapilan(yapilan);
    set({ yapilan, secili: 1 });
  },
}));

/** Odaktaki tel */
export const bbSeciliTel = (s: Pick<BbKurulumState, "secili">): BbTel | null => (s.secili ? (hesapPlani().teller[s.secili - 1] ?? null) : null);
