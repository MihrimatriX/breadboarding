// Kurulum belgelerinin board çizimleri (SVG, mm): board'un zemini (delikler, raylar, numaralar,
// harfler), parçalar (DIP, geniş DIP, gösterge, SIP, iki bacaklılar, buton, uyarlayıcı, osilatör,
// trimpot, anahtar, modül) ve o board'un üstünden geçen teller. Hesap makinesinin ve CPU16 panolarının
// breadboard belgeleri (hesap8/breadboard/belge.ts, cpu16/breadboard/belge.ts) ortak kullanır.

import { esc } from "../../kurulum/stil.ts";
import { ADIM, BX_ADIM, BY_ADIM, KENAR_ALT, KENAR_SAG, KENAR_SOL, KENAR_UST, satirHarfi, SUTUN } from "./geometri.ts";
import { noktaBoardu, type BbTel } from "./plan.ts";
import type { BbBoard, BbParca, BbYerlesim } from "./yerlesim.ts";

const X0 = KENAR_SOL;
const Y0 = KENAR_UST;
/** board içi (r, c) → mm (board'un sol üst köşesine göre) */
const bx = (c: number) => (c - X0) * ADIM;
const by = (r: number) => (r - Y0) * ADIM;
/** board'un mm cinsinden boyu */
export const BW = (KENAR_SAG - KENAR_SOL) * ADIM;
export const BH = (KENAR_ALT - KENAR_UST) * ADIM;
const f = (n: number) => n.toFixed(2);

/** Board'un zemini: delikler, ray çizgileri, numaralar, harfler */
export function boardZemini(): string {
  const p = ADIM;
  const d = 0.95;
  const s: string[] = [];
  s.push(`<rect x="0" y="0" width="${f(BW)}" height="${f(BH)}" rx="1.5" fill="#f4f0e6" stroke="#9c9586" stroke-width="0.3"/>`);
  s.push(`<rect x="0" y="${f(by(7.55))}" width="${f(BW)}" height="${f(by(9.45) - by(7.55))}" fill="#e6e0d2"/>`);
  // delikler: kesikli çizgi (her kesik bir delik; PDF'te desen dolgusundan çok daha küçük)
  const delikSirasi = (r: number, c0: number, c1: number, kesik: string) =>
    `<line x1="${f(bx(c0) - d / 2)}" y1="${f(by(r))}" x2="${f(bx(c1) + d / 2)}" y2="${f(by(r))}" stroke="#8d877a" stroke-width="${d}" stroke-dasharray="${kesik}"/>`;
  for (let r = 3; r <= 14; r++) if (satirHarfi(r)) s.push(delikSirasi(r, 1, SUTUN, `${d} ${f(p - d)}`));
  const rayKesik = `${[0, 1, 2, 3].map(() => `${d} ${f(p - d)}`).join(" ")} ${d} ${f(2 * p - d)}`;
  for (const r of [0, 1, 16, 17]) s.push(delikSirasi(r, 3, 61, rayKesik));
  for (const [r, renk] of [[-0.75, "#d0343a"], [1.72, "#2f63c4"], [15.28, "#2f63c4"], [17.75, "#d0343a"]] as const) {
    s.push(`<line x1="${f(bx(2.2))}" y1="${f(by(r))}" x2="${f(bx(61.8))}" y2="${f(by(r))}" stroke="${renk}" stroke-width="0.3"/>`);
  }
  const yazi = (x: number, y: number, t: string, renk = "#7a7466", boy = 1.5) => `<text x="${f(x)}" y="${f(y)}" font-size="${boy}" fill="${renk}" text-anchor="middle" dominant-baseline="central">${esc(t)}</text>`;
  for (const [r, t, renk] of [[0, "+", "#d0343a"], [1, "−", "#2f63c4"], [16, "−", "#2f63c4"], [17, "+", "#d0343a"]] as const) {
    s.push(yazi(bx(1.4), by(r), t, renk, 2), yazi(bx(62.6), by(r), t, renk, 2));
  }
  for (let r = 3; r <= 14; r++) {
    const h = satirHarfi(r);
    if (h) s.push(yazi(bx(0.1), by(r), h), yazi(bx(63.9), by(r), h));
  }
  for (let c = 1; c <= SUTUN; c++) if (c === 1 || c % 5 === 0) s.push(yazi(bx(c), by(2.2), String(c), "#7a7466", 1.3), yazi(bx(c), by(14.8), String(c), "#7a7466", 1.3));
  return s.join("");
}

export interface CizimSecenekleri {
  /** SIP direnç dizisinin yazısı */
  sipYazisi?: (p: BbParca) => string;
  /** LED'in rengi */
  ledRengi?: (p: BbParca) => string;
}

/** Çipin ikinci satırı: kısa değer */
const kisaDeger = (part: string) => part.replace(/^74HC/, "HC").replace(/^RN_470_ISO_8$/, "470 Ω × 8").replace(/^SW_DIP_(\d)$/, "DIP $1");

/** Parçanın çizimi (board içi mm) */
export function parcaCizimi(p: BbParca, b: BbBoard, o: CizimSecenekleri = {}): string {
  const L = p.bacaklar.map((k) => ({ pin: k.pin, r: k.Y - b.by * BY_ADIM, c: k.X - b.bx * BX_ADIM }));
  const cs = L.map((k) => k.c);
  const rs = L.map((k) => k.r);
  const c0 = Math.min(...cs), c1 = Math.max(...cs), r0 = Math.min(...rs), r1 = Math.max(...rs);
  const out: string[] = [];
  const yazi = (x: number, y: number, t: string, boy: number, renk: string, kalin = false) =>
    `<text x="${f(x)}" y="${f(y)}" font-size="${boy}" fill="${renk}" text-anchor="middle" dominant-baseline="central"${kalin ? ' font-weight="700"' : ""}>${esc(t)}</text>`;
  const ref = p.ref;
  if (p.tur === "dip" || p.tur === "genis" || p.tur === "osilator") {
    // DIP kanalın üstünde (e–f); geniş DIP d–h, osilatör DIP-14 kılıf (metal)
    const [ru, ra] = p.tur === "genis" ? [r0, r1] : [7, 10];
    const x = bx(c0) - 1.1, w = bx(c1) - bx(c0) + 2.2, y = by(ru) + 0.9, h = by(ra) - by(ru) - 1.8;
    const renk = p.tur === "osilator" ? "#8e939b" : p.cipMi ? "#232323" : p.part.startsWith("SW_DIP") ? "#2459c8" : "#3c3f44";
    out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="0.5" fill="${renk}"/>`);
    if (p.tur !== "osilator") out.push(`<path d="M ${f(x)} ${f(y + h / 2 - 1)} a 1 1 0 0 1 0 2" fill="#f4f0e6"/>`);
    out.push(`<circle cx="${f(x + 1.3)}" cy="${f(y + h - 1.1)}" r="0.45" fill="#f4f0e6"/>`);
    out.push(yazi(x + w / 2, y + h * 0.36, ref, 2.1, "#fff", true));
    out.push(yazi(x + w / 2, y + h * 0.72, p.tur === "osilator" ? "osilatör" : kisaDeger(p.part), 1.5, "#d8d8d8"));
  } else if (p.tur === "uyarlayici") {
    // şerit kablo uyarlayıcısı: kanalın üstünde 2 × 32 IDC başlık; 1. pin (kırmızı çizgi) solda, f satırında
    const x = bx(c0) - 1.2, w = bx(c1) - bx(c0) + 2.4, y = by(r0) - 1.6, h = by(r1) - by(r0) + 3.2;
    out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="0.6" fill="#2d3a2f"/>`);
    out.push(`<rect x="${f(x + 1)}" y="${f(y + h / 2 - 2.2)}" width="${f(w - 2)}" height="4.4" rx="0.4" fill="#151515"/>`);
    out.push(`<rect x="${f(x + 1)}" y="${f(y + h / 2 + 1.4)}" width="1.2" height="0.8" fill="#d0343a"/>`);
    out.push(yazi(x + w / 2, y + h / 2, `${ref} · şerit kablo uyarlayıcısı (2 × 32) · 1. pin sol altta`, 1.6, "#e8e8e8", true));
  } else if (p.tur === "gosterge") {
    const x = bx(c0) - 1.2, w = bx(c1) - bx(c0) + 2.4, y = by(r0) + 0.6, h = by(r1) - by(r0) - 1.2;
    out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="0.6" fill="#2b2b2b"/>`);
    out.push(yazi(x + w / 2, y + h * 0.42, "8.", 7, "#5a2a26", true));
    out.push(yazi(x + w / 2, y + h * 0.85, ref, 1.8, "#fff", true));
  } else if (p.tur === "sip") {
    const x = bx(c0) - 1.0, w = bx(c1) - bx(c0) + 2.0, y = by(r0) - 1.1;
    out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="2.2" rx="0.4" fill="#1d2b4a"/>`);
    const p1 = L.find((k) => k.pin === 1)!;
    out.push(`<circle cx="${f(bx(p1.c))}" cy="${f(by(p1.r) - 0.55)}" r="0.4" fill="#fff"/>`);
    out.push(yazi(x + w / 2, y + 1.1, o.sipYazisi ? o.sipYazisi(p) : `${ref} ${kisaDeger(p.part)}`, 1.3, "#fff"));
  } else if (p.tur === "modul" || p.tur === "pot" || p.tur === "anahtar") {
    // tek sıra bacaklı modül (CH340, PS/2, VGA), trimpot, sürgülü anahtar: bacakların üstünde gövde
    const x = bx(c0) - 1.3, w = bx(c1) - bx(c0) + 2.6, y = by(r0) - (p.tur === "modul" ? 4.2 : 2.6), h = p.tur === "modul" ? 5.2 : 3.6;
    const renk = p.tur === "pot" ? "#2f5fa8" : p.tur === "anahtar" ? "#333" : "#3d6b4a";
    out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="0.5" fill="${renk}"/>`);
    out.push(yazi(x + w / 2, y + h / 2, `${ref}${p.tur === "modul" ? ` ${p.part.replace(/^CONN_/, "")}` : ""}`, 1.3, "#fff", true));
  } else if (p.tur === "direnc" || p.tur === "kondansator" || p.tur === "led" || p.tur === "elektrolitik" || p.tur === "konnektor") {
    const a = L[0], z = L[1];
    const xa = bx(a.c), ya = by(a.r), xz = bx(z.c), yz = by(z.r);
    out.push(`<line x1="${f(xa)}" y1="${f(ya)}" x2="${f(xz)}" y2="${f(yz)}" stroke="#777" stroke-width="0.35"/>`);
    const mx = (xa + xz) / 2, my = (ya + yz) / 2;
    if (p.tur === "direnc") {
      const dik = xa === xz;
      out.push(`<rect x="${f(mx - (dik ? 0.9 : 2.6))}" y="${f(my - (dik ? 2.6 : 0.9))}" width="${dik ? 1.8 : 5.2}" height="${dik ? 5.2 : 1.8}" rx="0.7" fill="#d8c39b" stroke="#8b7a55" stroke-width="0.2"/>`);
      out.push(yazi(mx + (dik ? 2.2 : 0), my + (dik ? 0 : -2), ref, 1.3, "#333"));
    } else if (p.tur === "kondansator") {
      out.push(`<ellipse cx="${f(mx)}" cy="${f(my)}" rx="1.4" ry="0.9" fill="#c27632"/>`);
    } else if (p.tur === "led") {
      out.push(`<circle cx="${f(mx)}" cy="${f(my)}" r="1.5" fill="${o.ledRengi ? o.ledRengi(p) : "#e0352b"}" stroke="#444" stroke-width="0.2"/>`);
      out.push(yazi(mx + 2.4, my, ref, 1.3, "#333"));
    } else if (p.tur === "elektrolitik") {
      out.push(`<circle cx="${f(mx)}" cy="${f(my)}" r="2.6" fill="#1d3f7a"/>`, yazi(mx, my, ref, 1.3, "#fff"));
    } else {
      out.push(`<rect x="${f(mx - 1.4)}" y="${f(Math.min(ya, yz) - 1.4)}" width="2.8" height="${f(Math.abs(yz - ya) + 2.8)}" fill="#222"/>`, yazi(mx - 3, my, ref, 1.3, "#333"));
    }
  } else if (p.tur === "buton") {
    const x = bx(c0) - 0.6, w = bx(c1) - bx(c0) + 1.2, y = by(r0) + 0.6, h = by(r1) - by(r0) - 1.2;
    out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#26292e"/>`, `<circle cx="${f(x + w / 2)}" cy="${f(y + h / 2)}" r="1.6" fill="#555"/>`, yazi(x + w / 2, y - 1.2, ref, 1.3, "#333"));
  }
  // bacaklar
  for (const k of L) out.push(`<rect x="${f(bx(k.c) - 0.55)}" y="${f(by(k.r) - 0.55)}" width="1.1" height="1.1" fill="#111"/>`);
  return out.join("");
}

/** Bir board'un çizimi: zemin, o board'daki teller (kırpılmış), parçalar */
export function boardCizimi(y: BbYerlesim, b: BbBoard, teller: BbTel[], renkHex: (t: BbTel) => string, o: CizimSecenekleri = {}): string {
  const id = `b${b.no}`;
  const ox = b.bx * BX_ADIM;
  const oy = b.by * BY_ADIM;
  const tel = (t: BbTel, alt: boolean) => {
    const pts: string[] = [];
    for (let i = 0; i < t.yol.length; i += 2) pts.push(`${f(bx(t.yol[i] - ox))},${f(by(t.yol[i + 1] - oy))}`);
    return alt
      ? `<polyline points="${pts.join(" ")}" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="1.15" stroke-linejoin="round"/>`
      : `<polyline points="${pts.join(" ")}" fill="none" stroke="${renkHex(t)}" stroke-width="0.8" stroke-linejoin="round"/>`;
  };
  const uc = (t: BbTel) => {
    const n = t.yol.length;
    return [[t.yol[0], t.yol[1]], [t.yol[n - 2], t.yol[n - 1]]].filter(([X, Y]) => noktaBoardu(y, X, Y) === b.no)
      .map(([X, Y]) => `<circle cx="${f(bx(X - ox))}" cy="${f(by(Y - oy))}" r="0.55" fill="${renkHex(t)}" stroke="#000" stroke-width="0.2"/>`).join("");
  };
  const parcalar = y.parcalar.filter((p) => p.board === b.no);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${f(BW + 2)} ${f(BH + 2)}" width="186mm" font-family="DejaVu Sans, Arial, sans-serif">
<clipPath id="${id}k"><rect x="0" y="0" width="${f(BW)}" height="${f(BH)}"/></clipPath>
${boardZemini()}
${parcalar.filter((p) => p.tur === "kondansator").map((p) => parcaCizimi(p, b, o)).join("")}
<g clip-path="url(#${id}k)">${teller.map((t) => tel(t, true)).join("")}${teller.map((t) => tel(t, false)).join("")}${teller.map(uc).join("")}</g>
${parcalar.filter((p) => p.tur !== "kondansator").map((p) => parcaCizimi(p, b, o)).join("")}
<text x="1.2" y="2.4" font-size="2.4" font-weight="700" fill="#4b463d">${esc(b.ad)}</text>
</svg>`;
}

/** Telin board'a değip değmediği (köşelerden biri ya da bir parçası board'un üstünde) */
export function boardaDegiyor(t: Pick<BbTel, "yol">, b: BbBoard): boolean {
  const x0 = b.bx * BX_ADIM + KENAR_SOL, x1 = b.bx * BX_ADIM + KENAR_SAG;
  const y0 = b.by * BY_ADIM + KENAR_UST, y1 = b.by * BY_ADIM + KENAR_ALT;
  for (let i = 2; i < t.yol.length; i += 2) {
    const ax = Math.min(t.yol[i - 2], t.yol[i]), zx = Math.max(t.yol[i - 2], t.yol[i]);
    const ay = Math.min(t.yol[i - 1], t.yol[i + 1]), zy = Math.max(t.yol[i - 1], t.yol[i + 1]);
    if (zx >= x0 && ax <= x1 && zy >= y0 && ay <= y1) return true;
  }
  return false;
}
