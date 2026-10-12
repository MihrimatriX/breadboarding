// npm run cpu16 -- mimari [cpu|makine|hesap|hepsi] [-o dizin] [--koyu]
//
// Mimari diyagramlarını tek başına açılan SVG olarak yazar (açık tema, yazdırmaya uygun; --koyu: koyu
// tema, dosya adı "-koyu" ile biter). Dizin verilmezse belgelerin resimleri güncellenir:
// cpu16/docs/img/mimari-cpu.svg, mimari-makine.svg ve hesap8/docs/img/mimari-hesap.svg (depoda; bir
// test bunların devreyle güncel olduğunu denetler). Diyagram devreye uymuyorsa (denetim.ts) yazmaz.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mimariSvg } from "./belge.ts";
import { diyagramiDenetle } from "./denetim.ts";
import { DIYAGRAMLAR, diyagramKur, type DiyagramKaydi } from "./index.ts";

const KULLANIM = "kullanım: npm run cpu16 -- mimari [cpu|makine|hesap|hepsi] [-o dizin] [--koyu]";

/** Belgelerdeki yeri (depo köküne göre) */
export const belgeDosyasi = (d: DiyagramKaydi): string => `${d.kart === "hesap" ? "hesap8" : "cpu16"}/docs/img/${d.dosya}.svg`;

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
    const k = diyagramKur(d.id);
    const hatalar = diyagramiDenetle(k);
    if (hatalar.length) {
      console.error(`${d.id}: diyagram devreye uymuyor, yazılmadı:\n  ${hatalar.join("\n  ")}`);
      hata++;
      continue;
    }
    const dosya = dizin ? join(dizin, `${d.dosya}${koyu ? "-koyu" : ""}.svg`) : belgeDosyasi(d).replace(/\.svg$/, koyu ? "-koyu.svg" : ".svg");
    mkdirSync(join(dosya, ".."), { recursive: true });
    const svg = mimariSvg(d.id, koyu ? "koyu" : "acik");
    writeFileSync(dosya, svg);
    // kutuların ve çerçevelerin (kartların yapıştırıcı lojiği) entegreleri
    const bloklar = [...k.diyagram.kutular.flatMap((x) => x.bloklar), ...k.diyagram.gruplar.flatMap((g) => g.bloklar ?? [])];
    const cip = new Set(k.devre.parcalar(bloklar).cipler.map((c) => c.ref)).size;
    const kutu = k.diyagram.kutular.filter((x) => x.rol !== "not").length;
    console.log(`${dosya}: ${kutu} kutu, ${k.diyagram.yollar.length} yol, ${cip} entegre, ${(svg.length / 1024).toFixed(0)} KB`);
  }
  return hata ? 1 : 0;
}
