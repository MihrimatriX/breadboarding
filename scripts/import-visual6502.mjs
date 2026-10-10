// visual6502 die verisini indirir ve Silikon3D ChipData biçimine çevirir.
// Kaynak: https://github.com/trebonian/visual6502 (die verisi CC BY-NC-SA 3.0)
import { writeFile, mkdir } from "node:fs/promises";
import vm from "node:vm";

const BASE = "https://raw.githubusercontent.com/trebonian/visual6502/master/";
const OUT = new URL("../public/chips/mos6502/chip.json", import.meta.url);

async function load(file) {
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.text();
}

const ctx = {};
vm.createContext(ctx);
for (const f of ["segdefs.js", "transdefs.js", "nodenames.js"]) {
  vm.runInContext((await load(f)).replace(/^var /gm, "globalThis."), ctx);
}
const { segdefs, transdefs, nodenames } = ctx;

// visual6502 katmanları: 0 metal, 1 anahtarlı difüzyon, 2 giriş diyotu,
// 3 toprak difüzyonu, 4 besleme difüzyonu, 5 polisilikon
const layers = [
  { id: 1, name: "Difüzyon", level: 0, color: "#e6e600", thickness: 0.025, opacity: 1 },
  { id: 3, name: "GND difüzyon", level: 0, color: "#3fd23f", thickness: 0.025, opacity: 1 },
  { id: 4, name: "VCC difüzyon", level: 0, color: "#e04545", thickness: 0.025, opacity: 1 },
  { id: 2, name: "Giriş diyotu", level: 0, color: "#ff00ff", thickness: 0.025, opacity: 1 },
  { id: 5, name: "Polisilikon", level: 1, color: "#9a3fe0", thickness: 0.03, opacity: 1 },
  { id: 0, name: "Metal", level: 2, color: "#8080c0", thickness: 0.045, opacity: 0.5 },
];

let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, nodeCount = 0;
const pullups = new Set();
const segments = segdefs.map((s) => {
  const points = s.slice(3);
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]); maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]); maxY = Math.max(maxY, points[i + 1]);
  }
  nodeCount = Math.max(nodeCount, s[0] + 1);
  if (s[1] === "+") pullups.add(s[0]);
  return { node: s[0], layer: s[2], points };
});

const transistors = transdefs.map((t) => ({
  name: t[0], gate: t[1], c1: t[2], c2: t[3], bbox: t[4], kind: "nmos",
}));
for (const t of transistors) nodeCount = Math.max(nodeCount, t.gate + 1, t.c1 + 1, t.c2 + 1);

const chip = {
  id: "mos6502",
  name: "MOS 6502",
  description: "8-bit NMOS mikroişlemci (1975). Fotoğraflardan çıkarılmış gerçek die yerleşimi.",
  license: "Die verisi: Greg James, Brian Silverman, Barry Silverman, www.visual6502.org. CC BY-NC-SA 3.0.",
  bounds: { minX, minY, maxX, maxY },
  scale: 1 / 1000,
  layers,
  nodeCount,
  gnd: nodenames.vss,
  vcc: nodenames.vcc,
  pullups: [...pullups].sort((a, b) => a - b),
  segments,
  transistors,
  nodeNames: { ...nodenames },
};

await mkdir(new URL(".", OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(chip));
console.log(`Yazıldı: ${segments.length} poligon, ${transistors.length} transistör, ${nodeCount} düğüm`);
