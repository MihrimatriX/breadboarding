// CPU16 breadboard komutları:
//   npm run cpu16 -- breadboard                     panoların ölçüleri, besleme bütçesi, şerit kablo; bağlantının
//                                                   kart kart ve bütün makinede netlistle doğrulanması
//   npm run cpu16 -- breadboard --uret [kart,…]     yerleşimi ve telleri yeniden üret (cpu16/breadboard/veri/)
//   npm run cpu16 -- breadboard-belge [kart|hepsi] [-o dizin] [--html]
//                                                   kart başına kurulum belgesi (HTML + PDF) ve dizin sayfası

import { writeFileSync } from "node:fs";
import type { Board } from "../board/board.ts";
import { DAGILIM_SINIRLARI, type BbVeri } from "../board/breadboard/plan.ts";
import { plakaBoyu } from "../board/breadboard/gorunum.ts";
import { buildFullMachineBoard } from "../board/machine-board.ts";
import { beslemeButcesi } from "./besleme.ts";
import { KART_SIRASI } from "./panolar.ts";
import {
  EN_UZUN_TEL, kartiDogrula, kartOlcu, kartPlaniKur, kartPlaniUret, makinePlaniKur, makineyiDogrula, type KartBbPlani, type MakineBbPlani,
} from "./plan.ts";
import { cpuRenkTanimi } from "./renk.ts";
import { BB_VERILERI } from "./veri/index.ts";

/** Üretilen verinin kaynak dosyası */
function veriDosyasi(kart: string, v: BbVeri): string {
  const dizi = (a: string[]) => a.map((x) => `    ${JSON.stringify(x)},`).join("\n");
  return `// ${kart} kartının breadboard yerleşimi ve telleri: ÜRETİLİR, elle değiştirme (npm run cpu16 -- breadboard --uret ${kart}).
// Mantık çiplerinin yerleri ("ref|board|1. pinin sütunu") ve kurulum sırasıyla teller ("net|aşama|r: ray
// köprüsü|yol": başlangıç deliği "X,Y" ızgarada, sonra parçalar R/L/D/U + adım). cpu16/breadboard/plan.ts okur.

import type { BbVeri } from "../../board/breadboard/plan.ts";

export const VERI: BbVeri = {
  parmakIzi: ${JSON.stringify(v.parmakIzi)},
  cipler: [
${dizi(v.cipler)}
  ],
  teller: [
${dizi(v.teller)}
  ],
};
`;
}

// ---------------------------------------------------------------- rapor

const sayi = (n: number) => n.toLocaleString("tr-TR");

function kartRaporu(board: Board, p: KartBbPlani): boolean {
  const o = kartOlcu(p);
  const y = p.yerlesim;
  const plaka = plakaBoyu(p);
  const cip = y.parcalar.filter((q) => q.cipMi).length;
  const sinyal = p.teller.filter((t) => !t.ray);
  const asan = p.teller.filter((t) => t.uzunluk > EN_UZUN_TEL).length;
  const b = beslemeButcesi(board, p);
  console.log(`\n${p.tanim.baslik} (${p.kart}): ${y.nx} × ${y.ny} = ${o.board} board, taban ${Math.round(plaka.w)} × ${Math.round(plaka.h)} mm; ${cip} çip, ${y.parcalar.length} parça`);
  console.log(`  ${sayi(o.tel)} tel (${sayi(sinyal.length)} sinyal ve besleme, ${o.rayIc + o.rayArasi} ray köprüsü: ${o.rayIc} board içi, ${o.rayArasi} board'lar arası)`);
  console.log(`  delikten deliğe ${o.toplamM.toFixed(1)} m, kesim ${o.kesimM.toFixed(1)} m, ortalama ${o.ortalamaMm.toFixed(0)} mm, en uzun ${o.enUzunMm.toFixed(0)} mm; ${EN_UZUN_TEL} mm'den uzun ${asan} tel (%${((100 * asan) / o.tel).toFixed(1)})`);
  let alt = 0;
  console.log(`  kesim boyu: ${o.dagilim.map(([s, n]) => { const x = `${alt}–${s === Infinity ? "" : s}: ${n}`; alt = s; return x; }).join(", ")}`);
  console.log(`  renkler: ${o.renkler.map((r) => `${cpuRenkTanimi(r.renk).ad} ${r.sayi}`).join(", ")}`);
  console.log(`  aşamalar: ${o.asamalar.map((a) => `${a.no}. ${a.tel}`).join(", ")}`);
  console.log(`  besleme: ≈ ${sayi(Math.round(b.toplamMa))} mA, ${b.giris} giriş (en yüklü ≈ ${Math.round(b.enCokGirisMa)} mA), en uzak board'da ≈ ${Math.round(b.dusumMv)} mV düşüm`);
  const d = kartiDogrula(board, p);
  let tamam = !d.hatalar.length;
  for (let a = 1; a <= p.asamalar.length; a++) if (kartiDogrula(board, p, a).hatalar.length) tamam = false;
  console.log(`  bağlantı (fiziksel modelden): ${d.netSayisi} net, ${d.pinSayisi} bacak, ${d.telSayisi} tel — ${d.hatalar.length ? `${d.hatalar.length} SORUN` : "netlistle birebir aynı, her aşamanın sonunda da"}`);
  if (d.hatalar.length) console.log(d.hatalar.slice(0, 20).map((x) => `    ${x}`).join("\n"));
  return tamam;
}

function makineRaporu(m: MakineBbPlani): boolean {
  const tel = m.kartlar.flatMap((k) => k.teller);
  const toplam = tel.reduce((s, t) => s + t.uzunluk, 0);
  const kesim = tel.reduce((s, t) => s + t.kesim, 0);
  const board = m.kartlar.reduce((s, k) => s + k.yerlesim.boards.length, 0);
  const asan = tel.filter((t) => t.uzunluk > EN_UZUN_TEL).length;
  const dag = DAGILIM_SINIRLARI.map((s) => [s, 0] as [number, number]);
  for (const t of tel) dag.find(([s]) => t.kesim <= s)![1]++;
  const ray = tel.filter((t) => t.ray).length;
  console.log(`\nBütün makine: ${m.kartlar.length} pano, ${board} board, ${sayi(tel.length)} tel (${ray} ray köprüsü), masa ${Math.round(m.w)} × ${Math.round(m.h)} mm`);
  console.log(`  delikten deliğe ${(toplam / 1000).toFixed(1)} m, kesim ${(kesim / 1000).toFixed(1)} m, ortalama ${(toplam / tel.length).toFixed(0)} mm, en uzun ${Math.max(...tel.map((t) => t.uzunluk)).toFixed(0)} mm`);
  console.log(`  ${EN_UZUN_TEL} mm'den kısa: %${((100 * (tel.length - asan)) / tel.length).toFixed(1)} (${sayi(tel.length - asan)} / ${sayi(tel.length)})`);
  let alt = 0;
  console.log(`  kesim boyu: ${dag.map(([s, n]) => { const x = `${alt}–${s === Infinity ? "" : s}: ${n}`; alt = s; return x; }).join(", ")}`);
  console.log(`  şerit kablo: 64 damar, ${m.serit.soketler.length} soket (${m.serit.soketler.map((s) => `${s.kart} ${s.ref}`).join(", ")}), kesim ≈ ${m.serit.boyMm} mm`);
  const d = makineyiDogrula(m);
  console.log(`  bağlantı (bütün panolar + şerit kablo, fiziksel modelden): ${d.netSayisi} net, ${d.pinSayisi} bacak, ${d.telSayisi} tel — ${d.hatalar.length ? `${d.hatalar.length} SORUN` : "anakartın netlistiyle birebir aynı"}`);
  if (d.hatalar.length) console.log(d.hatalar.slice(0, 20).map((x) => `    ${x}`).join("\n"));
  return !d.hatalar.length;
}

export async function breadboardMain(args: string[]): Promise<number> {
  const { board } = buildFullMachineBoard();
  const i = args.indexOf("--uret");
  const kartlar: KartBbPlani[] = [];
  if (i >= 0) {
    const istenen = args[i + 1] && !args[i + 1].startsWith("-") ? args[i + 1].split(",") : KART_SIRASI;
    for (const k of istenen) if (!KART_SIRASI.includes(k)) {
      console.error(`bilinmeyen kart: ${k} (${KART_SIRASI.join(", ")})`);
      return 1;
    }
    for (const k of KART_SIRASI) {
      if (!istenen.includes(k)) {
        kartlar.push(kartPlaniKur(board, k, BB_VERILERI[k]));
        continue;
      }
      const t = performance.now();
      const r = kartPlaniUret(board, k, { log: (x) => console.log(`  ${k}: ${x}`) });
      writeFileSync(new URL(`./veri/${k}.ts`, import.meta.url), veriDosyasi(k, r.veri));
      console.log(`cpu16/breadboard/veri/${k}.ts yazıldı (${((performance.now() - t) / 1000).toFixed(1)} s): ${r.binme} üst üste binen tel parçası, ${r.kesisme} kesişme`);
      kartlar.push(r.plan);
    }
  } else {
    for (const k of KART_SIRASI) kartlar.push(kartPlaniKur(board, k, BB_VERILERI[k]));
  }
  let tamam = true;
  for (const p of kartlar) if (!kartRaporu(board, p)) tamam = false;
  if (!makineRaporu(makinePlaniKur(board, kartlar))) tamam = false;
  if (!tamam) {
    console.log("SORUN VAR");
    return 1;
  }
  console.log("\nHer pano tek başına ve bütün makine netlistle birebir aynı: açık devre yok, kısa devre yok, her bacak bir delikte, hiçbir delikte iki şey yok, gövde üstünden geçen tel yok.");
  return 0;
}
