// Web IDE'deki editörün sözdizimi renklendirmesi: kaynağı satır satır renkli parçalara böler (KodAlani.tsx
// çizer). Derleyici değil, yazarken yarım kalmış kodda da çalışan basit bir tarayıcı: C'de yorum, dizgi,
// önişlemci, anahtar sözcük, tip, sayı ve çağrılan işlev; assembly'de (as16) yorum, etiket, komut,
// yönerge, register, dizgi ve sayı. Assembly'de satırın ilk sözcüğü komuttur (listesi gerekmez).
// Saf, testli (cpu16/tests/arayuz.test.ts).

import type { Dil } from "./dil";

export type KodTuru = "yorum" | "dizgi" | "sayi" | "anahtar" | "tip" | "islev" | "yonerge" | "komut" | "yazmac" | "etiket";

export interface Parca {
  /** yoksa düz metin */
  tur?: KodTuru;
  metin: string;
}

type Kural = readonly [KodTuru, RegExp];

const C_KURALLARI: readonly Kural[] = [
  ["yorum", /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y],
  ["dizgi", /"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?/y],
  ["yonerge", /#[ \t]*[A-Za-z]+/y],
  ["sayi", /(?:0[xX][\da-fA-F]+|0[bB][01]+|\d+)[uUlL]*\b/y],
  ["tip", /\b(?:void|char|short|int|long|unsigned|signed|float|double|struct|union|enum|typedef|const|static|extern|volatile|register)\b/y],
  ["anahtar", /\b(?:if|else|while|for|do|switch|case|default|break|continue|return|goto|sizeof)\b/y],
  ["islev", /[A-Za-z_]\w*(?=\s*\()/y],
];

const ASM_KURALLARI: readonly Kural[] = [
  ["yorum", /;[^\n]*/y],
  ["dizgi", /"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?/y],
  ["yazmac", /\b(?:[rR][0-7]|sp|SP|lr|LR)\b/y],
  ["sayi", /\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*)\b/y],
];

/** düz metin: bir sözcük, bir boşluk öbeği ya da tek karakter (sözcükler bölünmesin) */
const DUZ = /[A-Za-z_][\w.]*|\s+|[^]/y;

function tara(metin: string, kurallar: readonly Kural[], out: Parca[]): void {
  let i = 0;
  while (i < metin.length) {
    let bulundu = false;
    for (const [tur, re] of kurallar) {
      re.lastIndex = i;
      const m = re.exec(metin);
      if (m && m[0]) {
        out.push({ tur, metin: m[0] });
        i += m[0].length;
        bulundu = true;
        break;
      }
    }
    if (bulundu) continue;
    DUZ.lastIndex = i;
    const m = DUZ.exec(metin)!;
    out.push({ metin: m[0] });
    i += m[0].length;
  }
}

/** satır başı: girinti, etiket ("ad:"), komut ya da yönerge; "AD = değer" ve "AD .equ değer" sembol tanımı */
const ASM_BAS = /^(\s*)(?:([A-Za-z_.][\w.]*:)(\s*))?([A-Za-z_.][\w.]*)?/;

function asmSatiri(satir: string, out: Parca[]): void {
  const [bas, girinti, etiket, ara, sozcuk] = ASM_BAS.exec(satir)!;
  if (girinti) out.push({ metin: girinti });
  if (etiket) out.push({ tur: "etiket", metin: etiket });
  if (ara) out.push({ metin: ara });
  if (sozcuk) {
    const tanim = !etiket && /^\s*(?:=|\.equ\b)/i.test(satir.slice(bas.length));
    out.push({ tur: tanim ? "etiket" : sozcuk.startsWith(".") ? "yonerge" : "komut", metin: sozcuk });
  }
  tara(satir.slice(bas.length), ASM_KURALLARI, out);
}

/** Kaynağı satırlara ve satırları renkli parçalara böler; satırlar birleşince kaynağın kendisi çıkar */
export function renklendir(kaynak: string, dil: Dil): Parca[][] {
  const parcalar: Parca[] = [];
  if (dil === "c") tara(kaynak, C_KURALLARI, parcalar);
  else
    kaynak.split("\n").forEach((s, i) => {
      if (i > 0) parcalar.push({ metin: "\n" });
      asmSatiri(s, parcalar);
    });
  // satırlara böl (C'nin çok satırlı yorumu da bölünür); art arda düz parçalar birleşir
  const satirlar: Parca[][] = [[]];
  for (const p of parcalar) {
    p.metin.split("\n").forEach((metin, k) => {
      if (k > 0) satirlar.push([]);
      if (!metin) return;
      const satir = satirlar[satirlar.length - 1];
      const son = satir[satir.length - 1];
      if (son && !son.tur && !p.tur) son.metin += metin;
      else satir.push(p.tur ? { tur: p.tur, metin } : { metin });
    });
  }
  return satirlar;
}
