// Kurulum belgelerinin ortak HTML parçaları: A4 baskı stili, kaçış, renk kutucuğu, onay kutusu.
// Belgeler hem tarayıcıda açılıp yazdırılabilir hem de Chromium ile PDF'e çevrilir (kurulum/cli.ts).

import { RENK_KODU, renkKodu, type UcSinifi } from "./plan.ts";

export const esc = (s: string | number): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Renk kutucuğu + renk adı (siyah-beyaz baskıda da okunur) */
export const renkEtiketi = (s: UcSinifi, adiYaz = true): string => {
  const r = renkKodu(s);
  return `<span class="sw" style="background:${r.hex}"></span>${adiYaz ? `<span class="rk">${esc(r.renk)}</span>` : ""}`;
};

export const kutu = '<span class="kutu"></span>';

export const DEPO_URL = "https://github.com/MihrimatriX/breadboarding/blob/main";

/** Renk kodu tablosu (lejant) */
export function renkTablosu(): string {
  const rows = RENK_KODU.map((r) => `<tr><td>${renkEtiketi(r.sinif)}</td><td><b>${esc(r.ad)}</b></td><td>${esc(r.aciklama)}</td></tr>`).join("");
  return `<table class="tablo renk-tablo"><thead><tr><th style="width:28mm">Tel rengi</th><th style="width:34mm">Sınıf</th><th>Hangi hatlar</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export const STIL = `
@page { size: A4; margin: 12mm 11mm 15mm 11mm; }
@page yatay { size: A4 landscape; margin: 10mm 11mm 14mm 11mm; }
:root { --ink:#1b1b1b; --muted:#5b5b5b; --line:#c8c8c4; --soft:#f2f2ef; --accent:#1f4e79; --mono:"DejaVu Sans Mono","Cascadia Mono",Consolas,monospace; }
* { box-sizing: border-box; }
html { font-family: Inter, "DejaVu Sans", "Segoe UI", Arial, sans-serif; color: var(--ink); font-size: 9pt; line-height: 1.38;
  font-variant-numeric: tabular-nums; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; background: #fff; }
@media screen { body { max-width: 282mm; margin: 0 auto; padding: 8mm 10mm 30mm; } section.bolum { border-top: 1px dashed #bbb; margin-top: 10mm; padding-top: 6mm; } }
h1, h2, h3, h4 { font-weight: 650; line-height: 1.2; margin: 0 0 2.5mm; break-after: avoid; }
h1 { font-size: 24pt; letter-spacing: -0.01em; }
h2 { font-size: 15pt; color: var(--accent); margin-top: 1mm; }
h3 { font-size: 11pt; margin-top: 5mm; }
h4 { font-size: 9.5pt; margin-top: 3mm; }
p { margin: 0 0 2.2mm; }
ul, ol { margin: 0 0 2.5mm; padding-left: 5mm; }
li { margin-bottom: 0.8mm; }
a { color: var(--accent); }
code, .mono { font-family: var(--mono); font-size: 0.92em; }
.muted { color: var(--muted); }
.kucuk { font-size: 7.5pt; }
section.bolum { break-before: page; }
section.yatay { page: yatay; }
.not { border-left: 1.2mm solid var(--accent); background: var(--soft); padding: 2mm 3mm; margin: 2.5mm 0; break-inside: avoid; }
.uyari { border-left: 1.2mm solid #c0392b; background: #fbeeee; padding: 2mm 3mm; margin: 2.5mm 0; break-inside: avoid; }
table.tablo { border-collapse: collapse; width: 100%; margin: 1.5mm 0 3mm; font-size: 8pt; }
table.tablo th, table.tablo td { border-bottom: 0.2mm solid var(--line); padding: 0.7mm 1.3mm; text-align: left; vertical-align: top; }
table.tablo th { background: var(--soft); font-weight: 600; border-bottom: 0.35mm solid #888; }
table.tablo thead { display: table-header-group; }
table.tablo tr { break-inside: avoid; }
td.sag, th.sag { text-align: right; }
td.orta, th.orta { text-align: center; }
.sw { display: inline-block; width: 3.3mm; height: 3.3mm; border: 0.25mm solid #444; border-radius: 0.7mm; vertical-align: -0.6mm; margin-right: 1mm; }
.rk { font-size: 7.5pt; }
.kutu { display: inline-block; width: 3.2mm; height: 3.2mm; border: 0.3mm solid #333; border-radius: 0.5mm; vertical-align: -0.6mm; background: #fff; }
.ref { font-family: var(--mono); font-weight: 700; }
.net { font-family: var(--mono); font-weight: 600; }
.pa { color: var(--muted); font-size: 7.2pt; }
.id { font-family: var(--mono); font-weight: 700; }
/* kapak */
.ust { font-size: 9pt; color: var(--muted); letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 18mm; }
.kapak h1 { font-size: 34pt; margin-bottom: 3mm; }
.kapak .alt { font-size: 12pt; color: var(--muted); margin-bottom: 8mm; max-width: 165mm; }
.olgular { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2.5mm; margin: 6mm 0 8mm; }
.olgu { border: 0.3mm solid var(--line); border-radius: 1.5mm; padding: 2.5mm 3mm; }
.olgu b { display: block; font-size: 16pt; font-weight: 650; line-height: 1.1; }
.olgu span { font-size: 7.5pt; color: var(--muted); }
.icindekiler { columns: 2; column-gap: 8mm; font-size: 9pt; }
.icindekiler li { break-inside: avoid; }
.dipnot { margin-top: 10mm; font-size: 7.5pt; color: var(--muted); }
/* harita */
figure.harita { margin: 0 0 4mm; break-inside: avoid; }
figure.harita figcaption { font-size: 8pt; color: var(--muted); margin-top: 1mm; }
figure.harita svg { display: block; }
section.yatay figure.harita, figure.harita.yatay { page: yatay; }
.lejant { display: flex; flex-wrap: wrap; gap: 1.5mm 4mm; font-size: 7.5pt; margin: 1mm 0 3mm; }
.lejant span.bk { display: inline-block; width: 3.5mm; height: 3.5mm; border: 0.25mm solid #777; vertical-align: -0.7mm; margin-right: 1mm; }
/* tel listesi */
table.teller { font-size: 7.8pt; }
table.teller td { padding-top: 0.35mm; padding-bottom: 0.35mm; }
table.teller td.ucn { white-space: nowrap; }
tr.blokbas td { background: #e4ebf3; font-weight: 650; border-bottom: 0.35mm solid #888; }
/* çip kartları */
article.cip { break-inside: avoid; margin: 0 0 3mm; border: 0.3mm solid var(--line); border-radius: 1.5mm; padding: 1.6mm 2.5mm 2mm; }
.cip-bas { display: flex; align-items: baseline; gap: 2.5mm; flex-wrap: wrap; margin-bottom: 0.6mm; }
.cip-bas .ref { font-size: 12pt; }
.cip-bas .deger { font-size: 10.5pt; font-weight: 650; }
.cip-bas .baslik { color: var(--muted); font-size: 8pt; }
.cip-alt { font-size: 7.5pt; color: var(--muted); margin-bottom: 1.5mm; }
.cip-alt b { color: var(--ink); font-weight: 600; }
table.dip { border-collapse: separate; border-spacing: 0; width: 100%; table-layout: fixed; font-size: 7.4pt; }
table.dip td { padding: 0.25mm 1mm; vertical-align: middle; height: 5mm; line-height: 1.2; }
table.dip td.bilgi-sol { text-align: right; }
table.dip td.no { width: 6.5mm; text-align: center; font-weight: 700; background: #d9d9d4; border: 0.25mm solid #888; font-size: 7pt; }
table.dip td.govde { width: 34mm; border-left: 0.5mm solid #222; border-right: 0.5mm solid #222; background: #fbfbf9; position: relative; padding: 0 1.2mm; }
table.dip.genis td.govde { width: 46mm; }
table.dip tr:first-child td.govde { border-top: 0.5mm solid #222; }
table.dip tr:last-child td.govde { border-bottom: 0.5mm solid #222; }
table.dip tr:first-child td.govde::before { content: ""; position: absolute; left: 50%; top: -0.5mm; width: 5mm; height: 2.5mm; margin-left: -2.5mm;
  border: 0.5mm solid #222; border-top: none; border-radius: 0 0 2.5mm 2.5mm; background: #fff; }
.govde .adlar { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 6.8pt; }
.govde .adlar span:last-child { text-align: right; }
.govde .p1 { display: inline-block; width: 1.6mm; height: 1.6mm; border-radius: 50%; background: #222; margin-right: 0.8mm; vertical-align: 0; }
.bilgi .net { font-size: 7.4pt; }
.bilgi .tel { font-family: var(--mono); font-size: 6.4pt; color: #333; white-space: nowrap; }
.bilgi .tel b { font-weight: 700; }
.bilgi .gri { color: #8a8a8a; }
.kapi { font-size: 7.2pt; color: var(--muted); margin-top: 1mm; }
/* kenar konnektörü */
table.kenar td { font-size: 7.6pt; }
table.kenar td.pin { font-weight: 700; text-align: center; background: var(--soft); width: 8mm; }
`;

/** Bir HTML belgesi (başlık, stil, gövde) */
export function htmlBelge(baslik: string, govde: string, aciklama = ""): string {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(baslik)}</title>
${aciklama ? `<meta name="description" content="${esc(aciklama)}">` : ""}
<style>${STIL}</style>
</head>
<body>
${govde}
</body>
</html>
`;
}
