// npm run cpu16 -- breadboard-belge [kart|hepsi] [-o dizin] [--html]
//
// CPU16'nın breadboard kurulum belgeleri (HTML + PDF). Çıktı varsayılan olarak
// cpu16/breadboard/cikti/ altına yazılır (depoya girmez, .gitignore).
//   <dizin>/<kart>-breadboard.html|pdf      kartın panosunun kurulum belgesi
//   <dizin>/breadboard-dizin.html|pdf       bütün makine: panolar, şerit kablo, besleme, belgeler ("hepsi")
//   <dizin>/README.md                       dizin ("hepsi")
// PDF'ler Chromium ile basılır (playwright; cpu16/kurulum/cli.ts). Bulunamazsa yalnız HTML yazılır;
// HTML tarayıcıda açılıp "Yazdır → PDF" ile de basılabilir. --html: PDF üretme.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildFullMachineBoard } from "../board/machine-board.ts";
import { pdfBas, pdfSayfaSayisi } from "../kurulum/cli.ts";
import { dizinBelgesi, kartBbBelgesi, type UretilenBelge } from "./belge.ts";
import { beslemeButcesi } from "./besleme.ts";
import { KART_SIRASI } from "./panolar.ts";
import { EN_UZUN_TEL, kartOlcu, kartPlaniKur, makinePlaniKur, type MakineBbPlani } from "./plan.ts";
import { BB_VERILERI } from "./veri/index.ts";

export const BB_BELGE_CIKTI = "cpu16/breadboard/cikti";
const KULLANIM = "kullanım: npm run cpu16 -- breadboard-belge [kart|hepsi] [-o dizin] [--html]";

const sayi = (n: number, k = 0) => n.toLocaleString("tr-TR", { minimumFractionDigits: k, maximumFractionDigits: k });

/** README.md: dizin */
function dizinMetni(m: MakineBbPlani, belgeler: UretilenBelge[], dizin: { html: string; pdf?: string }, out: string, tarih: string): string {
  const sayfa = (p?: string) => (p && existsSync(join(out, p)) ? ` (${pdfSayfaSayisi(join(out, p))} sayfa)` : "");
  const bag = (p?: string) => (p ? `[${p}](${p})${sayfa(p)}` : "—");
  const tel = m.kartlar.flatMap((k) => k.teller);
  const board = m.kartlar.reduce((s, k) => s + k.yerlesim.boards.length, 0);
  const lines = [
    "# CPU16 breadboard kurulum belgeleri",
    "",
    `Üretildi: ${tarih} · \`npm run cpu16 -- breadboard-belge hepsi\` (kaynak: \`cpu16/breadboard/\`, açıklama: \`cpu16/docs/breadboard.md\`).`,
    "Her kart kendi panosunda (bir taban plakasında bir grup BB830 breadboard); kartlar arası bütün bağlantılar 64 damarlı",
    "bir şerit kablodan (arka panel) geçer. PCB'li kurulumun belgeleri üst dizinde (`../`).",
    "",
    `- **Dizin**: ${bag(dizin.pdf ?? dizin.html)} — bütün makine, panoların yerleri, şerit kablo (soketlerin yeri, damar → sinyal), besleme, bütün tellerin kesim listesi.`,
    "",
    "| Kart | Board | Entegre | Tel | Kesim | Akım | Kurulum belgesi | HTML |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const k of KART_SIRASI) {
    const p = m.kartlar.find((x) => x.kart === k)!;
    const u = belgeler.find((x) => x.kart === k);
    if (!u) continue;
    const o = kartOlcu(p);
    const b = beslemeButcesi(m.board, p);
    lines.push(
      `| ${p.tanim.baslik} (\`${k}\`) | ${p.yerlesim.nx} × ${p.yerlesim.ny} = ${o.board} | ${p.yerlesim.parcalar.filter((q) => q.cipMi).length} | ` +
      `${sayi(o.tel)} | ${sayi(o.kesimM, 0)} m | ≈ ${sayi(b.toplamMa)} mA | ${bag(u.pdf)} | [${u.html}](${u.html}) |`,
    );
  }
  const asan = tel.filter((t) => t.uzunluk > EN_UZUN_TEL).length;
  lines.push(
    "",
    `Toplam ${board} breadboard, ${sayi(tel.length)} atlama teli (kesim ${sayi(tel.reduce((s, t) => s + t.kesim, 0) / 1000, 0)} m; ` +
    `${EN_UZUN_TEL} mm'den kısa olanlar %${sayi((100 * (tel.length - asan)) / tel.length, 1)}), şerit kablo ≈ ${sayi(m.serit.boyMm)} mm ve ${m.serit.soketler.length} IDC soketi.`,
    "",
    "Her kurulum belgesinde: kapak, nasıl okunur (delik adları, raylar, renk kodu), panonun haritası ve makinedeki yeri,",
    "besleme, aşamalar ve her aşamanın sonundaki test, board board yerleşim çizimleri, aşama aşama numaralı tel listesi",
    "(işaret kutulu, delikten deliğe), renk ve boya göre kesim listesi, malzeme listesi. Aynı teller uygulamada da",
    "adım adım gösterilir: Silikon3D → CPU16 kartı 3D → Görünüm: Breadboard → Kurulum.",
    "",
  );
  return lines.join("\n");
}

export async function breadboardBelgeMain(args: string[]): Promise<number> {
  const i = args.indexOf("-o");
  const out = i >= 0 ? args[i + 1] : BB_BELGE_CIKTI;
  if (!out) {
    console.error(KULLANIM);
    return 1;
  }
  const secim = args.find((a, k) => !a.startsWith("-") && args[k - 1] !== "-o") ?? "hepsi";
  const kartlar = secim === "hepsi" ? KART_SIRASI : KART_SIRASI.filter((k) => k === secim);
  if (!kartlar.length) {
    console.error(`bilinmeyen kart: ${secim} (kartlar: ${KART_SIRASI.join(", ")}, hepsi)`);
    console.error(KULLANIM);
    return 1;
  }
  const pdf = !args.includes("--html");
  const tarih = new Date().toISOString().slice(0, 10);
  const { board } = buildFullMachineBoard();
  const m = makinePlaniKur(board, KART_SIRASI.map((k) => kartPlaniKur(board, k, BB_VERILERI[k])));
  mkdirSync(out, { recursive: true });

  const belgeler: UretilenBelge[] = [];
  const isler: { html: string; pdf: string; altbilgi: string }[] = [];
  for (const k of kartlar) {
    const p = m.kartlar.find((x) => x.kart === k)!;
    const u: UretilenBelge = { kart: k, html: `${k}-breadboard.html` };
    writeFileSync(join(out, u.html), kartBbBelgesi(m, p, { tarih }));
    console.log(`${join(out, u.html)}: ${p.yerlesim.boards.length} board, ${p.teller.length} tel`);
    if (pdf) {
      u.pdf = `${k}-breadboard.pdf`;
      isler.push({ html: join(out, u.html), pdf: join(out, u.pdf), altbilgi: `CPU16 · ${p.tanim.baslik} · breadboard kurulumu · ${tarih}` });
    }
    belgeler.push(u);
  }
  if (isler.length && !(await pdfBas(isler))) for (const u of belgeler) delete u.pdf;
  for (const u of belgeler) if (u.pdf) u.sayfa = pdfSayfaSayisi(join(out, u.pdf));

  if (secim === "hepsi") {
    const dizin: { html: string; pdf?: string } = { html: "breadboard-dizin.html" };
    writeFileSync(join(out, dizin.html), dizinBelgesi(m, belgeler, { tarih }));
    console.log(`${join(out, dizin.html)}: dizin`);
    if (pdf && belgeler.every((u) => u.pdf)) {
      dizin.pdf = "breadboard-dizin.pdf";
      const is = { html: join(out, dizin.html), pdf: join(out, dizin.pdf), altbilgi: `CPU16 · breadboard kurulumu · dizin · ${tarih}` };
      if (!(await pdfBas([is]))) delete dizin.pdf;
    }
    writeFileSync(join(out, "README.md"), dizinMetni(m, belgeler, dizin, out, tarih));
    console.log(`${join(out, "README.md")}: dizin`);
  }
  return 0;
}
