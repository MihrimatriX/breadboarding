// npm run cpu16 -- kurulum [kart|hepsi] [-o dizin] [--html]
//
// Kart başına kurulum belgesi (HTML + PDF), KiCad şemasının PDF'i ve genel kurulum el kitabı.
// Çıktı varsayılan olarak cpu16/kurulum/cikti/ altına yazılır (depoya girmez, .gitignore).
//   <dizin>/<kart>/<kart>-kurulum.html|pdf   kurulum belgesi
//   <dizin>/<kart>/<kart>-sema.pdf           KiCad şeması (kicad-cli varsa)
//   <dizin>/kurulum-el-kitabi.html|pdf       genel el kitabı
//   <dizin>/README.md                        dizin
// PDF'ler Chromium ile basılır (playwright paketi: depoda ya da global kurulu). Bulunamazsa yalnızca
// HTML yazılır; HTML tarayıcıda açılıp "Yazdır → PDF" ile de basılabilir. --html: PDF üretme.

import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { kartBelgesi } from "./belge.ts";
import { elKitabi } from "./el-kitabi.ts";
import { KURULUM_KARTLARI, KurulumVerisi } from "./kartlar.ts";
import type { KurulumPlani } from "./plan.ts";

export const KURULUM_CIKTI = "cpu16/kurulum/cikti";

interface Uretilen {
  kart: string;
  baslik: string;
  plan?: KurulumPlani;
  html: string;
  pdf?: string;
  sema?: string;
}

/** PDF'teki sayfa sayısı (Chromium ve KiCad sayfa nesnelerini düz yazar) */
export function pdfSayfaSayisi(path: string): number {
  const text = readFileSync(path).toString("latin1");
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

/** playwright: önce depodan, sonra global kurulumdan */
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

const altBilgi = (metin: string) => `<div style="font-size:7pt;font-family:Inter,'DejaVu Sans',Arial,sans-serif;color:#666;width:100%;padding:0 11mm;display:flex;justify-content:space-between;">
<span>${metin}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

async function pdfBas(isler: { html: string; pdf: string; altbilgi: string }[]): Promise<boolean> {
  const pw = playwrightBul();
  if (!pw) {
    console.error("playwright bulunamadı: PDF üretilmedi (HTML'i tarayıcıda açıp yazdırabilirsin)");
    return false;
  }
  const browser = await pw.chromium.launch();
  try {
    const page = await browser.newPage();
    for (const is of isler) {
      await page.goto(pathToFileURL(resolve(is.html)).href, { waitUntil: "load" });
      await page.pdf({
        path: is.pdf, format: "A4", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
        headerTemplate: "<span></span>", footerTemplate: altBilgi(is.altbilgi),
        margin: { top: "12mm", bottom: "15mm", left: "11mm", right: "11mm" },
      });
      console.log(`${is.pdf}: ${pdfSayfaSayisi(is.pdf)} sayfa`);
    }
  } finally {
    await browser.close();
  }
  return true;
}

function kicadVar(): boolean {
  try {
    execFileSync("kicad-cli", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function dizinMetni(list: Uretilen[], elkitabi: { html: string; pdf?: string }, out: string, tarih: string): string {
  const rel = (p?: string) => (p ? relative(out, p) : "");
  const sayfa = (p?: string) => (p && existsSync(p) ? ` (${pdfSayfaSayisi(p)} sayfa)` : "");
  const lines = [
    "# CPU16 kurulum belgeleri",
    "",
    `Üretildi: ${tarih} · \`npm run cpu16 -- kurulum hepsi\` (kaynak: \`cpu16/kurulum/\`, açıklama: \`cpu16/docs/kurulum.md\`).`,
    "Şema değişirse yeniden üret: tel numaraları şemaya göre verilir.",
    "",
    `- **Kurulum el kitabı**: [${rel(elkitabi.pdf ?? elkitabi.html)}](${rel(elkitabi.pdf ?? elkitabi.html)})${sayfa(elkitabi.pdf)} — araçlar, tel renk kodu, listelerin okunuşu, besleme, çip yönü, blok blok kurma ve test, breadboard (Deney 1–8) ve PCB montajı, wire-wrap eki.`,
    "",
    "| Kart | Deney | Entegre | Tel | Kurulum belgesi | Şema | HTML |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const u of list) {
    const p = u.plan!;
    lines.push(
      `| ${u.baslik} (\`${u.kart}\`) | ${p.deneyler.join(", ")} | ${p.cipler.length} | ${p.teller.length.toLocaleString("tr-TR")} | ` +
      `${u.pdf ? `[${rel(u.pdf)}](${rel(u.pdf)})${sayfa(u.pdf)}` : "—"} | ${u.sema ? `[${rel(u.sema)}](${rel(u.sema)})${sayfa(u.sema)}` : "—"} | [${rel(u.html)}](${rel(u.html)}) |`,
    );
  }
  const top = list.reduce((s, u) => s + u.plan!.teller.length, 0);
  lines.push(
    "",
    `Toplam ${list.reduce((s, u) => s + u.plan!.cipler.length, 0)} entegre, ${top.toLocaleString("tr-TR")} sinyal teli.`,
    "",
    "Her kurulum belgesinde: kapak ve malzeme listesi (soketler ve besleme bütçesi dahil), nasıl kullanılır ve tel renk kodu,",
    "yerleşim haritası, kurulum sırası ve blok haritaları, besleme ve dekuplaj tablosu, numaralı tel listesi (işaret kutulu;",
    "breadboard'da takılacak teller, PCB'de bip testi listesi), çip kartları (her pinin neti ve telleri), pasif elemanlar,",
    "kenar konnektörü. Deney rehberleri: `cpu16/kit/`.",
    "",
  );
  return lines.join("\n");
}

export async function kurulumMain(args: string[]): Promise<number> {
  const i = args.indexOf("-o");
  const out = i >= 0 ? args[i + 1] : KURULUM_CIKTI;
  if (!out) {
    console.error("kullanım: npm run cpu16 -- kurulum [kart|hepsi] [-o dizin] [--html]");
    return 1;
  }
  const secim = args.find((a, k) => !a.startsWith("-") && args[k - 1] !== "-o") ?? "hepsi";
  const kartlar = secim === "hepsi" ? KURULUM_KARTLARI : KURULUM_KARTLARI.filter((k) => k.kart === secim);
  if (!kartlar.length) {
    console.error(`bilinmeyen kart: ${secim} (kartlar: ${KURULUM_KARTLARI.map((k) => k.kart).join(", ")}, hepsi)`);
    return 1;
  }
  const tarih = new Date().toISOString().slice(0, 10);
  const veri = new KurulumVerisi();
  const uretilen: Uretilen[] = [];
  const pdfIs: { html: string; pdf: string; altbilgi: string }[] = [];
  const kicad = !args.includes("--html") && kicadVar();
  if (!args.includes("--html") && !kicad) console.error("kicad-cli bulunamadı: şema PDF'leri üretilmedi");

  for (const kk of kartlar) {
    const plan = veri.plan(kk.kart);
    const dir = join(out, kk.kart);
    mkdirSync(dir, { recursive: true });
    const sch = `cpu16/kicad/${kk.kart}/${kk.kart}.kicad_sch`;
    const sema = kicad && existsSync(sch) ? join(dir, `${kk.kart}-sema.pdf`) : undefined;
    const html = join(dir, `${kk.kart}-kurulum.html`);
    writeFileSync(html, kartBelgesi(plan, kk, { tarih, semaDosyasi: `${kk.kart}-sema.pdf` }));
    console.log(`${html}: ${plan.cipler.length} entegre, ${plan.teller.length} tel`);
    const u: Uretilen = { kart: kk.kart, baslik: plan.baslik, plan, html };
    if (!args.includes("--html")) {
      u.pdf = join(dir, `${kk.kart}-kurulum.pdf`);
      pdfIs.push({ html, pdf: u.pdf, altbilgi: `CPU16 · ${plan.baslik} · kurulum belgesi · ${tarih}` });
    }
    if (sema) {
      execFileSync("kicad-cli", ["sch", "export", "pdf", "-o", sema, sch], { stdio: ["ignore", "ignore", "inherit"] });
      console.log(`${sema}: ${pdfSayfaSayisi(sema)} sayfa (KiCad şeması)`);
      u.sema = sema;
    }
    uretilen.push(u);
  }

  const kitap: { html: string; pdf?: string } = { html: join(out, "kurulum-el-kitabi.html") };
  if (secim === "hepsi") {
    mkdirSync(out, { recursive: true });
    const planlar = KURULUM_KARTLARI.map((k) => ({ kk: k, plan: veri.plan(k.kart) }));
    writeFileSync(kitap.html, elKitabi(planlar, { tarih }));
    console.log(`${kitap.html}: kurulum el kitabı`);
    if (!args.includes("--html")) {
      kitap.pdf = join(out, "kurulum-el-kitabi.pdf");
      pdfIs.push({ html: kitap.html, pdf: kitap.pdf, altbilgi: `CPU16 · Kurulum el kitabı · ${tarih}` });
    }
  }

  if (pdfIs.length && !(await pdfBas(pdfIs))) {
    for (const u of uretilen) delete u.pdf;
    delete kitap.pdf;
  }
  if (secim === "hepsi") {
    writeFileSync(join(out, "README.md"), dizinMetni(uretilen, kitap, out, tarih));
    console.log(`${join(out, "README.md")}: dizin`);
  }
  return 0;
}
