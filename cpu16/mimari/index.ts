// Mimari diyagramlarının listesi: uygulama (src/mimari), dışa aktarma (cli.ts, belgeler) ve testler
// buradan kurar. Devreler ilk istekte bir kez kurulur (bilgisayar ≈ 0,1 s, hesap makinesi ≈ 0,03 s);
// CPU kartı ve bütün bilgisayar aynı devreyi paylaşır. Her diyagram dil başına bir kez kurulur
// (Türkçe ve İngilizce aynı devreyi kullanır; yalnız metinler değişir).

import { buildHesapBoard } from "../../hesap8/kart.ts";
import { hesapDiyagrami } from "../../hesap8/mimari.ts";
import type { Board } from "../board/board.ts";
import { buildFullMachineBoard } from "../board/machine-board.ts";
import { sahneKur, type Sahne } from "./cizim.ts";
import { cpuDiyagrami } from "./cpu.ts";
import { makineDiyagrami } from "./makine.ts";
import { Devre, type Dil, type Diyagram } from "./model.ts";

export type DiyagramKimligi = "cpu" | "makine" | "hesap";

export interface DiyagramKaydi {
  id: DiyagramKimligi;
  /** seçicide ve dosya adında */
  ad: string;
  kisa: string;
  /** İngilizce adlar */
  en: { ad: string; kisa: string };
  /** 3D bölümü: "cpu16" bilgisayar (#kart), "hesap" hesap makinesi (#hesap) */
  kart: "cpu16" | "hesap";
  /** dışa aktarılan dosyanın adı (uzantısız; İngilizcesi ".en" ekiyle) */
  dosya: string;
}

export const DIYAGRAMLAR: readonly DiyagramKaydi[] = [
  { id: "cpu", ad: "CPU16 işlemci kartı", kisa: "CPU kartı", en: { ad: "CPU16 processor board", kisa: "CPU board" }, kart: "cpu16", dosya: "mimari-cpu" },
  { id: "makine", ad: "CPU16 bilgisayarı", kisa: "Bütün bilgisayar", en: { ad: "CPU16 computer", kisa: "Whole computer" }, kart: "cpu16", dosya: "mimari-makine" },
  { id: "hesap", ad: "8 bit hesap makinesi", kisa: "Hesap makinesi", en: { ad: "8-bit calculator", kisa: "Calculator" }, kart: "hesap", dosya: "mimari-hesap" },
];

export const diyagramKaydi = (id: string): DiyagramKaydi | undefined => DIYAGRAMLAR.find((d) => d.id === id);

/** Kaydın seçili dildeki adları */
export const kayitAdlari = (d: DiyagramKaydi, dil: Dil = "tr"): { ad: string; kisa: string } => (dil === "en" ? d.en : d);

export interface KuruluDiyagram {
  kayit: DiyagramKaydi;
  diyagram: Diyagram;
  devre: Devre;
  sahne: Sahne;
  dil: Dil;
}

let makine: { board: Board; devre: Devre } | null = null;
let hesap: { board: Board; devre: Devre } | null = null;
const kurulu = new Map<string, KuruluDiyagram>();

function devreOf(kart: "cpu16" | "hesap") {
  if (kart === "cpu16") {
    if (!makine) {
      const board = buildFullMachineBoard().board;
      makine = { board, devre: new Devre(board) };
    }
    return makine;
  }
  if (!hesap) {
    const board = buildHesapBoard().board;
    hesap = { board, devre: new Devre(board) };
  }
  return hesap;
}

/** Diyagramı kur (devre, tanım, sahne) seçili dilde; sonuç saklanır */
export function diyagramKur(id: DiyagramKimligi, dil: Dil = "tr"): KuruluDiyagram {
  const anahtar = `${id}:${dil}`;
  const hazir = kurulu.get(anahtar);
  if (hazir) return hazir;
  const kayit = diyagramKaydi(id);
  if (!kayit) throw new Error(`bilinmeyen diyagram: ${id}`);
  const { board, devre } = devreOf(kayit.kart);
  const diyagram = id === "cpu" ? cpuDiyagrami(board, dil) : id === "makine" ? makineDiyagrami(board, dil) : hesapDiyagrami(board, devre, dil);
  const k = { kayit, diyagram, devre, sahne: sahneKur(diyagram, devre, dil), dil };
  kurulu.set(anahtar, k);
  return k;
}
