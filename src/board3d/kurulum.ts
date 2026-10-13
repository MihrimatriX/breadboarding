// Kurulum modu: kartı gerçekte kurarken tel tel ilerleme. Veri kurulum belgesiyle aynıdır
// (cpu16/kurulum/plan.ts): aynı tel numaraları (T0001 …), aynı sıra, aynı renkler; böylece
// yazdırılmış belge ile ekran yan yana kullanılabilir. Takılan teller tarayıcıda saklanır
// (kart başına), 3D sahne seçili teli iki bacağı arasında çizer. Panelin metin yardımcıları da burada,
// dili parametre alır (varsayılan Türkçe; kart ve blok adlarının İngilizcesi adlar.ts'te).

import { create } from "zustand";
import type { Board } from "../../cpu16/board/board";
import { buildComputerBoard } from "../../cpu16/board/computer";
import { boardLayout, cardTitle, type BoardLayout } from "../../cpu16/board/layout";
import { buildProgrammerBoard } from "../../cpu16/board/programmer-card";
import { KURULUM_KARTLARI, kurulumKarti, type KurulumKarti, type KurulumKaynagi } from "../../cpu16/kurulum/kartlar";
import { kurulumPlani, renkKodu, type CipYeri, type KurulumPlani, type Tel } from "../../cpu16/kurulum/plan";
import type { Dil } from "../ui/ceviri";
import { blokAdi as adlarBlokAdi, kartBasligi } from "./adlar";
import { aktifKart, kartDegisince, kartModeli, kartYerlesimi, type KartTuru } from "./aktif";
import { findPart } from "./store";

export { KURULUM_KARTLARI };

/** Kart türünün kurulum listesindeki kartları: hesap makinesi bölümünde yalnız o, bilgisayarda onun dışındakiler */
export const gorunenKartlar = (tur: KartTuru = aktifKart()): KurulumKarti[] =>
  KURULUM_KARTLARI.filter((k) => (k.kaynak === "hesap") === (tur === "hesap"));

// ---------------------------------------------------------------- metinler (iki dil)

/** Kartın adı seçili dilde: "Saat ve reset kartı", "Clock and reset board" (İngilizcesi adlar.ts) */
export const kartAdi = (kart: string, dil: Dil = "tr"): string => kartBasligi(kart, cardTitle(kart), dil);

/** Bloğun adı seçili dilde (adlar.ts; programlayıcı kartının tek bloğu 3D sahnede olmadığından orada yok) */
export const blokAdi = (ad: string, dil: Dil = "tr"): string => (dil === "en" && ad === "Programlayıcı" ? "Programmer" : adlarBlokAdi(ad, dil));

/** Binlik ayraçlı sayı seçili dilde: 1.234, 1,234 */
export const sayiYaz = (n: number, dil: Dil = "tr"): string => n.toLocaleString(dil === "en" ? "en-US" : "tr-TR");

/** İngilizce sıra sayısı: 1st, 2nd, 3rd, 4th, 11th */
export const siraSayisi = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

/** PCB telinin rengi ve sınıfı: "sarı tel · adres", "yellow wire · Address" */
export function pcbTelRengi(t: Pick<Tel, "renk" | "sinif">, dil: Dil = "tr"): string {
  if (dil === "tr") return `${t.renk} tel · ${t.sinif}`;
  const r = renkKodu(t.sinif).en;
  return `${r.renk} wire · ${r.ad}`;
}

/** DIP bacağının yeri: 1..n/2 alt sırada soldan sağa, gerisi üst sırada sağdan sola (çentik solda) */
export function bacakYeri(pin: number, pinSayisi: number): { sira: "alt" | "üst"; sol: number } {
  const yarim = pinSayisi / 2;
  return pin <= yarim ? { sira: "alt", sol: pin } : { sira: "üst", sol: pinSayisi - pin + 1 };
}

/** Bacağın yeri yazıyla: "alt sırada soldan 3. · yer C4", "bottom row, 3rd from left · grid C4" */
export function bacakYeriYazisi(pin: number, cip: Pick<CipYeri, "pinSayisi" | "hucre">, dil: Dil = "tr"): string {
  const { sira, sol } = bacakYeri(pin, cip.pinSayisi);
  if (dil === "tr") return `${sira} sırada soldan ${sol}. · yer ${cip.hucre}`;
  return `${sira === "alt" ? "bottom" : "top"} row, ${siraSayisi(sol)} from left · grid ${cip.hucre}`;
}

// ---------------------------------------------------------------- plan

const kaynaklar = new Map<KurulumKaynagi, { board: Board; layout: BoardLayout }>();
const planlar = new Map<string, KurulumPlani>();

/** Kurulum kaynağının kartı: 3D sahnenin modelleri (anakart, hesap) yeniden kurulmaz */
function kaynakKarti(kaynak: KurulumKaynagi): { board: Board; layout: BoardLayout } {
  switch (kaynak) {
    case "anakart":
      // pinden pine tel listesi PCB yerleşimiyle (breadboard telleri ayrı: bbKurulum)
      return { board: kartModeli("cpu16").board, layout: kartYerlesimi("cpu16", "pcb") };
    case "hesap":
      // pinden pine tel listesi (belgedekiyle aynı): PCB yerleşimiyle; breadboard telleri ayrı (bbKurulum)
      return { board: kartModeli("hesap").board, layout: kartYerlesimi("hesap", "pcb") };
    case "bilgisayar":
    case "programlayici": {
      const board = kaynak === "bilgisayar" ? buildComputerBoard().board : buildProgrammerBoard().board;
      return { board, layout: boardLayout(board) };
    }
  }
}

/**
 * Kartın kurulum planı. Anakart kartları ve hesap makinesi 3D sahnenin kendi modellerinden; CPU, saat
 * ve test bellek kartı belgedeki gibi test bilgisayarı tanımından, programlayıcı kendi tanımından
 * (ilk istekte kurulur). Tel numaraları komut satırının ürettiği belgeyle aynıdır.
 */
export function kartPlani(kart: string): KurulumPlani {
  const hazir = planlar.get(kart);
  if (hazir) return hazir;
  const { kaynak } = kurulumKarti(kart);
  let k = kaynaklar.get(kaynak);
  if (!k) {
    k = kaynakKarti(kaynak);
    kaynaklar.set(kaynak, k);
  }
  const plan = kurulumPlani(k.board, kart, { layout: k.layout });
  planlar.set(kart, plan);
  return plan;
}

/** 3D sahnede bir ucun konumu (mm): tam bilgisayarda aynı referans ve bacak; kart sahnede yoksa null */
export function ucKonumu(ref: string, pin: number): { x: number; y: number } | null {
  const part = findPart(ref);
  const place = part?.chip ?? part?.passive;
  const p = place?.pins.find((q) => q.num === pin);
  return p ? { x: p.x, y: p.y } : null;
}

/**
 * Kart 3D sahnede var mı: bilgisayarda anakartın kartları ile CPU ve saat kartı (programlayıcı ve test
 * bellek kartı yok), hesap makinesi bölümünde yalnız hesap makinesi
 */
export const sahnedeVar = (kart: string): boolean => {
  const { kaynak } = kurulumKarti(kart);
  if (aktifKart() === "hesap") return kaynak === "hesap";
  return kaynak !== "programlayici" && kaynak !== "hesap" && kart !== "mem";
};

// ---------------------------------------------------------------- ilerleme (tarayıcıda)

const anahtar = (kart: string) => `cpu16.kurulum.${kart}`;

function okuYapilan(kart: string): Set<string> {
  try {
    const raw = localStorage.getItem(anahtar(kart));
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function yazYapilan(kart: string, yapilan: Set<string>): void {
  try {
    localStorage.setItem(anahtar(kart), JSON.stringify([...yapilan]));
  } catch {
    /* gizli pencere ya da kapalı depolama: ilerleme yalnızca bu oturumda kalır */
  }
}

// ---------------------------------------------------------------- durum

export interface KurulumState {
  /** panel açık mı (3D sahne teli yalnızca açıkken çizer) */
  acik: boolean;
  kart: string;
  plan: KurulumPlani | null;
  yukleniyor: boolean;
  hata: string | null;
  /** takıldı diye işaretlenen teller */
  yapilan: Set<string>;
  /** odaktaki tel */
  secili: string | null;
  /** kamera odaktaki tele gitsin */
  izle: boolean;
  ac(acik: boolean): void;
  setIzle(izle: boolean): void;
  kartSec(kart: string): Promise<void>;
  /** teli takıldı / takılmadı işaretle; takıldıysa odak sıradaki açık tele geçer */
  isaretle(id: string, takildi?: boolean): void;
  sec(id: string | null): void;
  /** sıradaki (yön 1) ya da önceki (yön −1) tel; yalnizAcik: takılmamışları gez */
  git(yon: 1 | -1, yalnizAcik?: boolean): void;
  /** kartın bütün işaretlerini sil */
  sifirla(): void;
}

/** Sıradaki takılmamış tel (verilen telden sonra; yoksa baştan) */
export function siradakiAcik(teller: readonly Tel[], yapilan: ReadonlySet<string>, sonra?: string | null): Tel | null {
  const i0 = sonra ? teller.findIndex((t) => t.id === sonra) + 1 : 0;
  for (let k = 0; k < teller.length; k++) {
    const t = teller[(i0 + k) % teller.length];
    if (!yapilan.has(t.id)) return t;
  }
  return null;
}

export const useKurulum = create<KurulumState>((set, get) => ({
  acik: false,
  kart: gorunenKartlar()[0].kart,
  plan: null,
  yukleniyor: false,
  hata: null,
  yapilan: new Set(),
  secili: null,
  izle: true,

  ac(acik) {
    set({ acik });
    if (acik && !get().plan && !get().yukleniyor) void get().kartSec(get().kart);
  },

  async kartSec(kart) {
    set({ kart, yukleniyor: true, hata: null, plan: null, secili: null, yapilan: okuYapilan(kart) });
    try {
      // ağır iş (bilgisayar tanımı ve plan) bir karelik gecikmeyle: "yükleniyor" önce görünsün
      await new Promise((r) => setTimeout(r, 16));
      const plan = kartPlani(kart);
      if (get().kart !== kart) return;
      const yapilan = get().yapilan;
      set({ plan, yukleniyor: false, secili: siradakiAcik(plan.teller, yapilan)?.id ?? plan.teller[0]?.id ?? null });
    } catch (e) {
      if (get().kart === kart) set({ yukleniyor: false, hata: String((e as Error).message ?? e) });
    }
  },

  isaretle(id, takildi) {
    const { kart, plan } = get();
    const yapilan = new Set(get().yapilan);
    const yeni = takildi ?? !yapilan.has(id);
    if (yeni) yapilan.add(id);
    else yapilan.delete(id);
    yazYapilan(kart, yapilan);
    const secili = yeni && plan ? (siradakiAcik(plan.teller, yapilan, id)?.id ?? id) : id;
    set({ yapilan, secili });
  },

  sec(id) {
    set({ secili: id });
  },

  setIzle(izle) {
    set({ izle });
  },

  git(yon, yalnizAcik = false) {
    const { plan, secili, yapilan } = get();
    if (!plan || !plan.teller.length) return;
    const t = plan.teller;
    let i = Math.max(0, t.findIndex((x) => x.id === secili));
    for (let k = 0; k < t.length; k++) {
      i = (i + yon + t.length) % t.length;
      if (!yalnizAcik || !yapilan.has(t[i].id)) break;
    }
    set({ secili: t[i].id });
  },

  sifirla() {
    const { kart, plan } = get();
    const yapilan = new Set<string>();
    yazYapilan(kart, yapilan);
    set({ yapilan, secili: plan?.teller[0]?.id ?? null });
  },
}));

/** Odaktaki tel (plan yüklüyse) */
export const seciliTel = (s: Pick<KurulumState, "plan" | "secili">): Tel | null =>
  (s.plan && s.secili ? s.plan.teller.find((t) => t.id === s.secili) : null) ?? null;

// sahnedeki kart değişince listede olmayan kart bırakılır (plan, panel açılınca yeniden yüklenir)
kartDegisince((tur) => {
  const liste = gorunenKartlar(tur);
  const { kart } = useKurulum.getState();
  if (liste.some((k) => k.kart === kart)) return;
  const yeni = liste[0].kart;
  useKurulum.setState({ kart: yeni, plan: null, yukleniyor: false, hata: null, secili: null, yapilan: okuYapilan(yeni) });
});
