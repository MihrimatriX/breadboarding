// Hesap makinesinin komut satırı aracı:
//   npm run hesap8 -- ozet [--yol]         çip sayıları (blok blok), pasifler, en uzun yol, ERC
//   npm run hesap8 -- hesapla 255 x 7      kapı seviyesi devreyi çalıştır, göstergeleri yaz (+ - x /)
//   npm run hesap8 -- dogrula              2000 örnek + uç durumlar, altın modelle karşılaştır
//   npm run hesap8 -- dogrula --hepsi      bütün 4 × 256 × 256 = 262 144 durum (iş parçacıklarına bölünür)
//   npm run hesap8 -- breadboard           breadboard planı: ölçüler, bağlantının netlistle doğrulanması
//   npm run hesap8 -- breadboard --uret    yerleşimi ve telleri yeniden üret (hesap8/breadboard/veri.ts)
//   npm run hesap8 -- breadboard-belge [-o dizin] [--html]
//                                          breadboard kurulum belgesi (HTML + PDF; varsayılan dizin
//                                          hesap8/breadboard/cikti/, depoya girmez)

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
import { availableParallelism } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { erc } from "../cpu16/board/board.ts";
import { birlesimselYol } from "../cpu16/board/zamanlama.ts";
import { buildHesapBoard, ISLEMLER } from "./kart.ts";
import { beklenen, ornekDurumlar, type Durum, type Gorunum, type IslemKodu } from "./model.ts";
import { HesapSim } from "./sim.ts";
import { bbDogrula } from "./breadboard/dogrulama.ts";
import { bbOlcu, bbPlani, bbPlaniUret, type BbPlani, type BbVeri } from "./breadboard/plan.ts";
import { renkTanimi } from "./breadboard/renk.ts";

const ayni = (x: Gorunum, y: Gorunum) => x.a === y.a && x.b === y.b && x.sonuc === y.sonuc && x.kalan === y.kalan && x.hata === y.hata;
const goster = (g: Gorunum) => `A [${g.a}]  B [${g.b}]  sonuç [${g.sonuc}]  kalan [${g.kalan}]${g.hata ? "  HATA" : ""}`;

/** Üretilen breadboard verisinin kaynak dosyası */
function veriDosyasi(v: BbVeri): string {
  const dizi = (a: string[]) => a.map((x) => `    ${JSON.stringify(x)},`).join("\n");
  return `// Breadboard yerleşimi ve telleri: ÜRETİLİR, elle değiştirme (npm run hesap8 -- breadboard --uret).
// Mantık çiplerinin yerleri ("ref|board|1. pinin sütunu") ve kurulum sırasıyla teller ("net|aşama|r: ray
// köprüsü|yol": başlangıç deliği "X,Y" ızgarada, sonra parçalar R/L/D/U + adım). plan.ts okur.

import type { BbVeri } from "./plan.ts";

export const BB_VERI: BbVeri = {
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

/** playwright: önce depodan, sonra global kurulumdan (cpu16 kurulum belgeleri gibi) */
function playwrightBul(): { chromium: { launch(o?: object): Promise<any> } } | null {
  const req = createRequire(import.meta.url);
  try {
    return req("playwright");
  } catch {
    /* depoda yok */
  }
  try {
    const root = execSync("npm root -g", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return req(join(root, "playwright"));
  } catch {
    return null;
  }
}

/** Breadboard kurulum belgesi: HTML, sonra Chromium ile A4 PDF (alt bilgide sayfa numarası) */
async function bbBelgeYaz(args: string[]): Promise<number> {
  const i = args.indexOf("-o");
  const out = i >= 0 ? args[i + 1] : "hesap8/breadboard/cikti";
  if (!out) {
    console.error("kullanım: npm run hesap8 -- breadboard-belge [-o dizin] [--html]");
    return 1;
  }
  const { bbBelgesi } = await import("./breadboard/belge.ts");
  const { KurulumVerisi } = await import("../cpu16/kurulum/kartlar.ts");
  const { pdfSayfaSayisi } = await import("../cpu16/kurulum/cli.ts");
  const plan = bbPlani();
  const tarih = new Date().toISOString().slice(0, 10);
  mkdirSync(out, { recursive: true });
  const html = join(out, "hesap8-breadboard-kurulum.html");
  writeFileSync(html, bbBelgesi(plan, { eskiTel: new KurulumVerisi().plan("hesap").teller.length, tarih }));
  console.log(`${html}: ${plan.yerlesim.boards.length} board, ${plan.teller.length} tel`);
  if (args.includes("--html")) return 0;
  const pw = playwrightBul();
  if (!pw) {
    console.error("playwright bulunamadı: PDF üretilmedi (HTML'i tarayıcıda açıp yazdırabilirsin)");
    return 0;
  }
  const pdf = join(out, "hesap8-breadboard-kurulum.pdf");
  const browser = await pw.chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(resolve(html)).href, { waitUntil: "load" });
    await page.pdf({
      path: pdf, format: "A4", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-size:7pt;font-family:Inter,'DejaVu Sans',Arial,sans-serif;color:#666;width:100%;padding:0 11mm;display:flex;justify-content:space-between;">
<span>8 bit hesap makinesi · breadboard kurulumu · ${tarih}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      margin: { top: "12mm", bottom: "15mm", left: "11mm", right: "11mm" },
    });
  } finally {
    await browser.close();
  }
  console.log(`${pdf}: ${pdfSayfaSayisi(pdf)} sayfa`);
  return 0;
}

/** Durumları sırayla devreye uygula; farklı çıkanları döndür (en çok `sinir` tane) */
function sina(sim: HesapSim, durumlar: Iterable<Durum>, sinir = 20): { sayi: number; farklar: string[] } {
  let sayi = 0;
  const farklar: string[] = [];
  for (const [a, b, op] of durumlar) {
    sim.ayarla(a, b, op);
    const o = sim.oku();
    const e = beklenen(a, b, op);
    sayi++;
    if (!ayni(o, e) && farklar.length < sinir) farklar.push(`${a} ${ISLEMLER[op].simge} ${b}: devre ${goster(o)} | beklenen ${goster(e)}`);
  }
  return { sayi, farklar };
}

/** Bir A aralığı için bütün B'ler ve bütün işlemler */
function* aralik(a0: number, a1: number): Generator<Durum> {
  for (let a = a0; a < a1; a++) for (const op of [0, 1, 2, 3] as IslemKodu[]) for (let b = 0; b < 256; b++) yield [a, b, op];
}

if (!isMainThread) {
  // iş parçacığı: kendi devresini kurar, A aralığını dener
  const { a0, a1 } = workerData as { a0: number; a1: number };
  const sim = new HesapSim();
  const r = sina(sim, aralik(a0, a1));
  parentPort!.postMessage(r);
} else {
  const [cmd = "ozet", ...rest] = process.argv.slice(2);
  if (cmd === "ozet") {
    const t = performance.now();
    const k = buildHesapBoard();
    const ms = Math.round(performance.now() - t);
    const b = k.board;
    console.log(`8 bit hesap makinesi: ${b.chips.length} entegre, ${b.passives.length} pasif eleman, ${b.c.gates.length} kapı (kurulum ${ms} ms)`);
    const bloklar = new Map<string, Map<string, number>>();
    for (const c of b.chips) {
      const m = bloklar.get(c.block) ?? new Map<string, number>();
      m.set(c.def.part, (m.get(c.def.part) ?? 0) + 1);
      bloklar.set(c.block, m);
    }
    for (const [blok, m] of bloklar) {
      const n = [...m.values()].reduce((x, y) => x + y, 0);
      console.log(`  ${blok.padEnd(26)} ${String(n).padStart(3)}  ${[...m].map(([p, x]) => `${p} × ${x}`).join(", ")}`);
    }
    const parca = new Map<string, number>();
    for (const c of b.chips) parca.set(c.def.part, (parca.get(c.def.part) ?? 0) + 1);
    console.log(`Entegreler: ${[...parca].sort().map(([p, n]) => `${p} × ${n}`).join(", ")}`);
    const pasif = new Map<string, number>();
    for (const p of b.passives) pasif.set(p.part, (pasif.get(p.part) ?? 0) + 1);
    console.log(`Pasifler:   ${[...pasif].sort().map(([p, n]) => `${p} × ${n}`).join(", ")}`);
    console.log(`Onluğa çevirme modülleri: ${Object.entries(k.bcd).map(([g, x]) => `${g} ${x.moduller.length}`).join(", ")}`);
    console.log(`Göstergeler: ${k.gruplar.map((g) => `${g.baslik} ${g.haneler.length + (g.isaret ? 1 : 0)}`).join(", ")}`);
    // anahtarı çevirdikten ne kadar sonra göstergeler doğru: anahtarlardan segmentlere en uzun yol
    const hedef = k.gruplar.flatMap((g) => g.haneler.flatMap((h) => h.seg));
    const tip = birlesimselYol(b, [...k.a, ...k.b, ...k.op], hedef, "tip");
    const maks = birlesimselYol(b, [...k.a, ...k.b, ...k.op], hedef, "maks");
    const blokOf = new Map(b.chips.map((c) => [c.ref, c.block]));
    const bloklarYol: string[] = [];
    for (const a of maks.adimlar) {
      const bl = blokOf.get(a.ref)!;
      if (bloklarYol[bloklarYol.length - 1] !== bl) bloklarYol.push(bl);
    }
    console.log(`En uzun yol (anahtar → segment): tipik ${Math.round(tip.t)} ns, en kötü ${Math.round(maks.t)} ns, ${maks.adimlar.length} çip geçer`);
    console.log(`  ${bloklarYol.join(" → ")}`);
    if (rest.includes("--yol")) for (const a of maks.adimlar) console.log(`  ${a.ref.padEnd(5)} ${a.part.padEnd(9)} ${a.from.padEnd(4)} → ${a.to.padEnd(4)} ${a.net.padEnd(14)} +${a.d.toFixed(0).padStart(3)} = ${a.t.toFixed(0)} ns`);
    const sorun = erc(b);
    console.log(sorun.length ? sorun.join("\n") : "ERC: sorun yok");
  } else if (cmd === "hesapla") {
    const [as, os, bs] = rest;
    const op = ["+", "-", "x", "/"].indexOf(os ?? "");
    const a = Number(as);
    const b = Number(bs);
    if (op < 0 || !(a >= 0 && a <= 255) || !(b >= 0 && b <= 255)) {
      console.error("kullanım: npm run hesap8 -- hesapla <0..255> <+|-|x|/> <0..255>");
      process.exit(1);
    }
    const sim = new HesapSim();
    sim.ayarla(a, b, op as IslemKodu);
    const o = sim.oku();
    console.log(goster(o));
    console.log(ayni(o, beklenen(a, b, op as IslemKodu)) ? "altın modelle aynı" : `FARKLI, beklenen: ${goster(beklenen(a, b, op as IslemKodu))}`);
  } else if (cmd === "dogrula") {
    const t = performance.now();
    if (rest.includes("--hepsi")) {
      const n = Math.min(availableParallelism(), 8);
      console.log(`Bütün 262 144 durum, ${n} iş parçacığı …`);
      const parcalar = Array.from({ length: n }, (_, i) => [Math.floor((256 * i) / n), Math.floor((256 * (i + 1)) / n)]);
      const sonuclar = await Promise.all(
        parcalar.map(
          ([a0, a1]) =>
            new Promise<{ sayi: number; farklar: string[] }>((ok, hata) => {
              const w = new Worker(new URL(import.meta.url), { workerData: { a0, a1 } });
              w.once("message", ok);
              w.once("error", hata);
            }),
        ),
      );
      const sayi = sonuclar.reduce((x, r) => x + r.sayi, 0);
      const farklar = sonuclar.flatMap((r) => r.farklar);
      const sn = ((performance.now() - t) / 1000).toFixed(1);
      if (farklar.length) {
        console.log(farklar.slice(0, 20).join("\n"));
        console.log(`${sayi} durumdan en az ${farklar.length} tanesi FARKLI (${sn} s)`);
        process.exit(1);
      }
      console.log(`${sayi} durumun hepsi altın modelle aynı (${sn} s)`);
    } else {
      const r = sina(new HesapSim(), ornekDurumlar());
      const sn = ((performance.now() - t) / 1000).toFixed(1);
      if (r.farklar.length) {
        console.log(r.farklar.join("\n"));
        console.log(`${r.sayi} durumdan ${r.farklar.length} tanesi FARKLI (${sn} s)`);
        process.exit(1);
      }
      console.log(`${r.sayi} durumun hepsi altın modelle aynı (${sn} s); bütün durumlar için: dogrula --hepsi`);
    }
  } else if (cmd === "breadboard") {
    let plan: BbPlani;
    if (rest.includes("--uret")) {
      const t = performance.now();
      const r = bbPlaniUret(buildHesapBoard(), { log: (x) => console.log(`  ${x}`) });
      writeFileSync(new URL("./breadboard/veri.ts", import.meta.url), veriDosyasi(r.veri));
      console.log(`hesap8/breadboard/veri.ts yazıldı (${((performance.now() - t) / 1000).toFixed(1)} s): ${r.binme} üst üste binen tel parçası, ${r.kesisme} kesişme`);
      plan = r.plan;
    } else {
      plan = bbPlani();
    }
    const d = bbDogrula(plan.kart.board, plan.yerlesim, plan.teller);
    const o = bbOlcu(plan);
    const sayi = (n: number) => n.toLocaleString("tr-TR");
    console.log(`Breadboard: ${o.board} board (BB830), ${sayi(plan.yerlesim.parcalar.length)} parça, ${sayi(o.tel)} atlama teli`);
    console.log(`  ray köprüsü: ${o.rayIc} board içi (üst ↔ alt ray çifti), ${o.rayArasi} board'lar arası`);
    console.log(`  delikten deliğe ${o.toplamM.toFixed(1)} m, kesim (uçlar dahil) ${o.kesimM.toFixed(1)} m, ortalama ${o.ortalamaMm.toFixed(0)} mm, en uzun ${o.enUzunMm.toFixed(0)} mm`);
    let alt = 0;
    console.log(`  kesim boyu: ${o.dagilim.map(([s, n]) => { const x = `${alt}–${s === Infinity ? "" : s} mm: ${n}`; alt = s; return x; }).join(", ")}`);
    console.log(`  renkler: ${o.renkler.map((r) => `${renkTanimi(r.renk).ad} ${r.sayi} (${r.kesimM.toFixed(1)} m)`).join(", ")}`);
    console.log(`  aşamalar: ${o.asamalar.map((a) => `${a.no}. ${a.tel}`).join(", ")}`);
    console.log(`Bağlantı (yalnız fiziksel modelden, birleşim-bul): ${d.netSayisi} net, ${d.pinSayisi} bacak, ${d.telSayisi} tel`);
    if (d.hatalar.length) {
      console.log(d.hatalar.slice(0, 40).join("\n"));
      console.log(`${d.hatalar.length} SORUN`);
      process.exit(1);
    }
    console.log("  netlistle birebir aynı: açık devre yok, kısa devre yok, her bacak bir delikte, hiçbir delikte iki şey yok, gövde ve tel ucu üstünden geçen tel yok");
  } else if (cmd === "breadboard-belge") {
    process.exit(await bbBelgeYaz(rest));
  } else {
    console.error(`bilinmeyen komut: ${cmd} (ozet | hesapla | dogrula [--hepsi] | breadboard [--uret] | breadboard-belge [-o dizin] [--html])`);
    process.exit(1);
  }
}
