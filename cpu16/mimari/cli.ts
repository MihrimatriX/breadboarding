// npm run cpu16 -- mimari [cpu|makine|hesap|hepsi] [-o dizin] [--koyu]
//
// Mimari diyagramlarını tek başına açılan SVG olarak yazar, Türkçe ve İngilizce (açık tema, yazdırmaya
// uygun; --koyu: koyu tema, dosya adı "-koyu" ile biter; İngilizcesi ".en.svg" ile). Dizin verilmezse
// belgelerin resimleri güncellenir: cpu16/docs/img/mimari-cpu.svg, mimari-makine.svg,
// hesap8/docs/img/mimari-hesap.svg ve İngilizceleri (mimari-cpu.en.svg …; depoda, bir test bunların
// devreyle güncel olduğunu denetler). Diyagram devreye uymuyorsa (denetim.ts) yazmaz.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mimariSvg } from "./belge.ts";
import { diyagramiDenetle } from "./denetim.ts";
import { DIYAGRAMLAR, diyagramKur, type DiyagramKaydi } from "./index.ts";
import type { Dil } from "./model.ts";

const KULLANIM = "kullanım: npm run cpu16 -- mimari [cpu|makine|hesap|hepsi] [-o dizin] [--koyu]";

const DILLER: readonly Dil[] = ["tr", "en"];

/** Dosya adının sonu: "-koyu" ve İngilizcede ".en" ("mimari-cpu-koyu.en.svg") */
const son = (koyu: boolean, dil: Dil) => `${koyu ? "-koyu" : ""}${dil === "en" ? ".en" : ""}.svg`;

const belgeDizini = (d: DiyagramKaydi) => `${d.kart === "hesap" ? "hesap8" : "cpu16"}/docs/img`;

/** Belgelerdeki yeri (depo köküne göre) */
export const belgeDosyasi = (d: DiyagramKaydi, dil: Dil = "tr"): string => `${belgeDizini(d)}/${d.dosya}${son(false, dil)}`;

export async function mimariMain(args: string[]): Promise<number> {
  const i = args.indexOf("-o");
  if (i >= 0 && !args[i + 1]) {
    console.error(KULLANIM);
    return 2;
  }
  const dizin = i >= 0 ? args[i + 1] : undefined;
  const koyu = args.includes("--koyu");
  const secim = args.find((a, k) => !a.startsWith("-") && args[k - 1] !== "-o") ?? "hepsi";
  const liste = secim === "hepsi" ? DIYAGRAMLAR : DIYAGRAMLAR.filter((d) => d.id === secim);
  if (!liste.length) {
    console.error(`bilinmeyen diyagram: ${secim}\n${KULLANIM}`);
    return 2;
  }
  let hata = 0;
  for (const d of liste) {
    for (const dil of DILLER) {
      const k = diyagramKur(d.id, dil);
      const hatalar = diyagramiDenetle(k);
      if (hatalar.length) {
        console.error(`${d.id} (${dil}): diyagram devreye uymuyor, yazılmadı:\n  ${hatalar.join("\n  ")}`);
        hata++;
        continue;
      }
      const ad = `${d.dosya}${son(koyu, dil)}`;
      const dosya = dizin ? join(dizin, ad) : `${belgeDizini(d)}/${ad}`;
      mkdirSync(join(dosya, ".."), { recursive: true });
      const svg = mimariSvg(d.id, koyu ? "koyu" : "acik", dil);
      writeFileSync(dosya, svg);
      // kutuların ve çerçevelerin (kartların yapıştırıcı lojiği) entegreleri
      const bloklar = [...k.diyagram.kutular.flatMap((x) => x.bloklar), ...k.diyagram.gruplar.flatMap((g) => g.bloklar ?? [])];
      const cip = new Set(k.devre.parcalar(bloklar).cipler.map((c) => c.ref)).size;
      const kutu = k.diyagram.kutular.filter((x) => x.rol !== "not").length;
      console.log(`${dosya}: ${kutu} kutu, ${k.diyagram.yollar.length} yol, ${cip} entegre, ${(svg.length / 1024).toFixed(0)} KB`);
    }
  }
  return hata ? 1 : 0;
}
