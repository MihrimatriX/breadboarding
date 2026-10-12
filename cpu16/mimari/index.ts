// Mimari diyagramlarının listesi: uygulama (src/mimari), dışa aktarma (cli.ts, belgeler) ve testler
// buradan kurar. Devreler ilk istekte bir kez kurulur (bilgisayar ≈ 0,1 s, hesap makinesi ≈ 0,03 s);
// CPU kartı ve bütün bilgisayar aynı devreyi paylaşır.

import { buildHesapBoard } from "../../hesap8/kart.ts";
import { hesapDiyagrami } from "../../hesap8/mimari.ts";
import type { Board } from "../board/board.ts";
import { buildFullMachineBoard } from "../board/machine-board.ts";
import { sahneKur, type Sahne } from "./cizim.ts";
import { cpuDiyagrami } from "./cpu.ts";
import { makineDiyagrami } from "./makine.ts";
import { Devre, type Diyagram } from "./model.ts";

export type DiyagramKimligi = "cpu" | "makine" | "hesap";

export interface DiyagramKaydi {
  id: DiyagramKimligi;
  /** seçicide ve dosya adında */
  ad: string;
  kisa: string;
  /** 3D bölümü: "cpu16" bilgisayar (#kart), "hesap" hesap makinesi (#hesap) */
  kart: "cpu16" | "hesap";
  /** dışa aktarılan dosyanın adı (uzantısız) */
  dosya: string;
}

export const DIYAGRAMLAR: readonly DiyagramKaydi[] = [
  { id: "cpu", ad: "CPU16 işlemci kartı", kisa: "CPU kartı", kart: "cpu16", dosya: "mimari-cpu" },
  { id: "makine", ad: "CPU16 bilgisayarı", kisa: "Bütün bilgisayar", kart: "cpu16", dosya: "mimari-makine" },
  { id: "hesap", ad: "8 bit hesap makinesi", kisa: "Hesap makinesi", kart: "hesap", dosya: "mimari-hesap" },
];

export const diyagramKaydi = (id: string): DiyagramKaydi | undefined => DIYAGRAMLAR.find((d) => d.id === id);

export interface KuruluDiyagram {
  kayit: DiyagramKaydi;
  diyagram: Diyagram;
  devre: Devre;
  sahne: Sahne;
}

let makine: { board: Board; devre: Devre } | null = null;
let hesap: { board: Board; devre: Devre } | null = null;
const kurulu = new Map<DiyagramKimligi, KuruluDiyagram>();

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

/** Diyagramı kur (devre, tanım, sahne); sonuç saklanır */
export function diyagramKur(id: DiyagramKimligi): KuruluDiyagram {
  const hazir = kurulu.get(id);
  if (hazir) return hazir;
  const kayit = diyagramKaydi(id);
  if (!kayit) throw new Error(`bilinmeyen diyagram: ${id}`);
  const { board, devre } = devreOf(kayit.kart);
  const diyagram = id === "cpu" ? cpuDiyagrami(board) : id === "makine" ? makineDiyagrami(board) : hesapDiyagrami(board, devre);
  const k = { kayit, diyagram, devre, sahne: sahneKur(diyagram, devre) };
  kurulu.set(id, k);
  return k;
}
