// Pasif elemanların 3D gövdeleri (mm cinsinden, elemanın yerel çerçevesinde): x pin ekseni (1. pin
// −x'te), y yukarı, z ön (kameraya bakan yüz). Her biçim bir kez kurulur, aynı parçanın bütün
// örnekleri tek bir InstancedMesh ile çizilir. Yazılar (104, A103J, 100µF 16V …) küçük tuval
// dokularıdır.

import {
  BoxGeometry, BufferGeometry, CanvasTexture, CatmullRomCurve3, CircleGeometry, Color, CurvePath, CylinderGeometry, ExtrudeGeometry, Float32BufferAttribute,
  LatheGeometry, LineCurve3, Matrix4, PlaneGeometry, QuadraticBezierCurve3, SRGBColorSpace, Shape, ShapeGeometry, SphereGeometry, TubeGeometry, Vector2, Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const KEEP = new Set(["position", "normal", "uv", "color"]);

/** Geometrileri birleştir (indekssiz, ortak öznitelikler); color verilenler sabit renkle boyanır */
export function merge(parts: (BufferGeometry | { g: BufferGeometry; color: string })[]): BufferGeometry {
  const withColor = parts.some((p) => !(p instanceof BufferGeometry));
  const list = parts.map((p) => {
    const src = p instanceof BufferGeometry ? p : p.g;
    const g = src.index ? src.toNonIndexed() : src.clone();
    for (const name of Object.keys(g.attributes)) if (!KEEP.has(name)) g.deleteAttribute(name);
    if (!g.getAttribute("uv")) g.setAttribute("uv", new Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    if (withColor) {
      const c = new Color(p instanceof BufferGeometry ? "#ffffff" : p.color);
      const n = g.getAttribute("position").count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
      g.setAttribute("color", new Float32BufferAttribute(arr, 3));
    }
    return g;
  });
  const out = mergeGeometries(list, false);
  if (!out) throw new Error("geometri birleştirilemedi");
  for (const g of list) g.dispose();
  return out;
}

const at = (g: BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);

/** Noktalardan geçen yumuşak tel (bacak) */
export function wire(points: [number, number, number][], radius = 0.27, radial = 5, segments = points.length * 4): BufferGeometry {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), false, "centripetal");
  return new TubeGeometry(curve, Math.max(4, segments), radius, radial, false);
}

/** Düz parçalar + yuvarlatılmış köşelerden tel: eksenel bacakların 90° kıvrımı */
function bentWire(points: [number, number, number][], bend: number, radius: number): BufferGeometry {
  const path = new CurvePath<Vector3>();
  const v = points.map((p) => new Vector3(...p));
  let cur = v[0].clone();
  for (let i = 1; i < v.length; i++) {
    const next = v[i];
    if (i < v.length - 1) {
      const a = next.clone().sub(cur).normalize();
      const b = v[i + 1].clone().sub(next).normalize();
      const p0 = next.clone().addScaledVector(a, -bend);
      const p1 = next.clone().addScaledVector(b, bend);
      path.add(new LineCurve3(cur, p0));
      path.add(new QuadraticBezierCurve3(p0, next.clone(), p1));
      cur = p1;
    } else path.add(new LineCurve3(cur, next.clone()));
  }
  return new TubeGeometry(path, 24, radius, 6, false);
}

// ---------------------------------------------------------------- eksenel direnç

/** DIN0207 gövde: 6,3 mm boy, uçlarda şişkin (köpek kemiği) profil */
const R_HALF = 3.15;
export const R_Y = 1.6;
function resistorRadius(x: number): number {
  const u = Math.abs(x);
  if (u <= 1.55) return 1.02;
  if (u <= 2.15) {
    const t = (u - 1.55) / 0.6;
    return 1.02 + 0.25 * t * t * (3 - 2 * t);
  }
  if (u <= 2.8) return 1.27;
  const t = Math.min(1, (u - 2.8) / (R_HALF - 2.8));
  return 1.27 * Math.sqrt(Math.max(0, 1 - t * t * t * t));
}

function lathePiece(x0: number, x1: number, color: string): { g: BufferGeometry; color: string } {
  const n = Math.max(2, Math.ceil((x1 - x0) / 0.24));
  const pts: Vector2[] = [];
  for (let k = 0; k <= n; k++) {
    const x = x0 + ((x1 - x0) * k) / n;
    pts.push(new Vector2(Math.max(0.001, resistorRadius(x)), x));
  }
  const g = new LatheGeometry(pts, 14);
  g.rotateZ(-Math.PI / 2);
  g.translate(0, R_Y, 0);
  return { g, color };
}

/** Bantların gövde üstündeki yerleri (mm): 4 bant ya da 5 bant, tolerans bandı sağda, ayrık */
export const BAND_SLOTS: Record<number, [number, number][]> = {
  4: [[-2.78, -2.32], [-1.78, -1.36], [-0.98, -0.56], [2.2, 2.66]],
  5: [[-2.8, -2.42], [-1.9, -1.54], [-1.2, -0.84], [-0.5, -0.14], [2.24, 2.66]],
};

/** Direnç gövdesi + renk bantları (köşe renkleri), x ∈ [−3,15, 3,15] */
export function resistorBody(bands: string[], bodyColor: string): BufferGeometry {
  const slots = BAND_SLOTS[bands.length] ?? BAND_SLOTS[4];
  const parts: { g: BufferGeometry; color: string }[] = [];
  let x = -R_HALF;
  slots.forEach(([a, b], i) => {
    if (a > x) parts.push(lathePiece(x, a, bodyColor));
    parts.push(lathePiece(a, b, bands[i]));
    x = b;
  });
  parts.push(lathePiece(x, R_HALF, bodyColor));
  return merge(parts);
}

/** Eksenel bacaklar: gövde uçlarından yatay, 90° kıvrılıp karta iner */
export function axialLeads(span: number, y = R_Y, inner = 2.9): BufferGeometry {
  const h = span / 2;
  return merge([
    bentWire([[-inner, y, 0], [-h, y, 0], [-h, -0.5, 0]], 0.5, 0.28),
    bentWire([[inner, y, 0], [h, y, 0], [h, -0.5, 0]], 0.5, 0.28),
  ]);
}

// ---------------------------------------------------------------- seramik disk kondansatör

const DISC_Y = 4.1;
const LEAN = 0.5;
const leanM = new Matrix4().makeTranslation(0, 1.0, 0).multiply(new Matrix4().makeRotationX(-LEAN)).multiply(new Matrix4().makeTranslation(0, -1.0, 0));
const lean = (x: number, y: number, z: number): [number, number, number] => {
  const v = new Vector3(x, y, z).applyMatrix4(leanM);
  return [v.x, v.y, v.z];
};

/** Disk gövde: basık küre, ön yüzü yukarı bakacak şekilde geriye yatık (bacaklar kıvrık) */
export function discBody(w = 12, h = 7): BufferGeometry {
  const g = new SphereGeometry(1, w, h);
  g.scale(2.45, 2.3, 0.95);
  g.translate(0, DISC_Y, 0);
  g.applyMatrix4(leanM);
  return g;
}

/** Diskin önündeki "104" yazısının düzlemi */
export function discLabelPlane(): BufferGeometry {
  const g = new PlaneGeometry(3.2, 1.6);
  g.translate(0, DISC_Y - 0.15, 0.97);
  g.applyMatrix4(leanM);
  return g;
}

export function discLeads(pitch: number): BufferGeometry {
  const h = pitch / 2;
  return merge([-1, 1].map((s) => wire([[s * h, -0.5, 0], [s * h, 0.6, 0], lean(s * 1.9, 1.7, 0), lean(s * 1.35, 2.5, 0)], 0.24, 4, 8)));
}

// ---------------------------------------------------------------- elektrolitik

/** Kutunun yan yüzü (doku: kılıf, şerit ve yazı) ve üst kapağı; uv.y yüksekliğe göre */
export function canSide(d: number, h: number): BufferGeometry {
  const r = d / 2;
  const prof: [number, number][] = [
    [r * 0.9, 0.35], [r, 0.7], [r, 1.15], [r * 0.93, 1.4], [r, 1.65], [r, h - 0.5], [r * 0.96, h - 0.18], [r * 0.88, h],
  ];
  const g = new LatheGeometry(prof.map(([x, y]) => new Vector2(x, y)), 24);
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) uv.setY(i, Math.min(1, Math.max(0, (pos.getY(i) - 0.35) / (h - 0.35))));
  return g;
}

export function canTop(d: number, h: number): BufferGeometry {
  const g = new CircleGeometry(d / 2 * 0.88, 24);
  g.rotateX(-Math.PI / 2);
  g.translate(0, h - 0.02, 0);
  return g;
}

/** Elektrolitiğin şerit açısı: lathe u = 0 ön (+z), 0,25 = +x (− bacağı) */
export const STRIPE_U = 0.13;

export function canTexture(value: string, volt: string): CanvasTexture {
  const W = 512;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1b2e6b";
  ctx.fillRect(0, 0, W, H);
  // açık şerit ve eksi işaretleri (− bacağı tarafında)
  const sw = W * 0.16;
  const sx = W * STRIPE_U - sw / 2;
  ctx.fillStyle = "#c9d0da";
  ctx.fillRect(sx, 0, sw, H);
  ctx.fillStyle = "#1b2e6b";
  for (let y = 22; y < H; y += 46) ctx.fillRect(sx + sw * 0.25, y, sw * 0.5, 9);
  // değer: dikey yazı, ön yüzde (u = 0, iki kenara sarılır)
  const text = (x: number) => {
    ctx.save();
    ctx.translate(x, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e8ecf2";
    ctx.font = `600 34px "IBM Plex Sans", system-ui, sans-serif`;
    ctx.fillText(value, 0, -18);
    ctx.font = `500 26px "IBM Plex Sans", system-ui, sans-serif`;
    ctx.fillText(`${volt}  105°C`, 0, 18);
    ctx.restore();
  };
  // yazı şeridin solunda (u ≈ −0,06): önden bakınca şerit de yazı da görünür
  text(-W * 0.06);
  text(W * 0.94);
  return finish(c);
}

export function canTopTexture(): CanvasTexture {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d")!;
  const gr = ctx.createRadialGradient(S * 0.4, S * 0.4, 4, S / 2, S / 2, S / 2);
  gr.addColorStop(0, "#f2f4f6");
  gr.addColorStop(1, "#9aa3ad");
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, S, S);
  // basınç tahliye çentiği (K biçimi)
  ctx.strokeStyle = "#5d6670";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(S * 0.42, S * 0.18);
  ctx.lineTo(S * 0.42, S * 0.82);
  ctx.moveTo(S * 0.42, S * 0.5);
  ctx.lineTo(S * 0.78, S * 0.2);
  ctx.moveTo(S * 0.42, S * 0.5);
  ctx.lineTo(S * 0.78, S * 0.8);
  ctx.stroke();
  return finish(c);
}

/** Kartın üstüne basılı "+" işareti (elektrolitiğin + bacağının yanında) */
export function plusMark(): BufferGeometry {
  return merge([new BoxGeometry(1.6, 0.05, 0.35), new BoxGeometry(0.35, 0.05, 1.6)]);
}

// ---------------------------------------------------------------- LED (3 mm)

export const LED_BASE = 1.2;
const FLANGE_H = 1.0;
const BODY_H = 2.6;
export const LED_TOP = LED_BASE + FLANGE_H + BODY_H + 1.5;

/** Renkli epoksi: düz kenarlı flanş (katot tarafı, +x) + silindir + kubbe */
export function ledEpoxy(): BufferGeometry {
  const r = 1.9;
  const flat = 1.45;
  const a = Math.acos(flat / r);
  const shape = new Shape();
  shape.absarc(0, 0, r, a, 2 * Math.PI - a, false);
  shape.lineTo(flat, Math.sin(a) * r);
  const flange = new ExtrudeGeometry(shape, { depth: FLANGE_H, bevelEnabled: false, curveSegments: 20 });
  flange.rotateX(-Math.PI / 2);
  flange.translate(0, LED_BASE, 0);
  const body = new CylinderGeometry(1.5, 1.5, BODY_H, 22, 1, true);
  body.translate(0, LED_BASE + FLANGE_H + BODY_H / 2, 0);
  const dome = new SphereGeometry(1.5, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.translate(0, LED_BASE + FLANGE_H + BODY_H, 0);
  return merge([flange, body, dome]);
}

/** İçteki metal: ince direk (anot, −x) ve geniş örs (katot, +x), örsün çanağında yonga */
export function ledInner(): BufferGeometry {
  const post = at(new BoxGeometry(0.32, 2.9, 0.3), -0.7, LED_BASE + 1.45, 0);
  const anvil = at(new BoxGeometry(0.85, 2.35, 0.32), 0.5, LED_BASE + 1.18, 0);
  const cup = at(new BoxGeometry(1.3, 0.3, 0.6), 0.5, LED_BASE + 2.4, 0);
  const bond = wire([[-0.7, LED_BASE + 2.9, 0], [-0.2, LED_BASE + 3.25, 0], [0.45, LED_BASE + 2.62, 0]], 0.05, 3);
  return merge([post, anvil, cup, bond]);
}

/** Yonganın yeri (ışığın çıktığı nokta) */
export const LED_DIE: [number, number, number] = [0.5, LED_BASE + 2.62, 0];

/** Bacaklar: anot (−x) uzun: kartın üstünde bir dirsek; katot düz */
export function ledLeads(pitch: number): BufferGeometry {
  const h = pitch / 2;
  return merge([
    wire([[-0.7, LED_BASE + 0.2, 0], [-h, LED_BASE - 0.3, 0], [-h - 0.75, 0.6, 0], [-h, 0.05, 0], [-h, -0.5, 0]], 0.22, 5),
    wire([[0.5, LED_BASE + 0.2, 0], [h, LED_BASE - 0.3, 0], [h, -0.5, 0]], 0.22, 5),
  ]);
}

/** Işık halesi ve karttaki ışık lekesi için yumuşak radyal doku */
export function glowTexture(): CanvasTexture {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.75)");
  g.addColorStop(0.45, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return finish(c);
}

// ---------------------------------------------------------------- SIP-9 direnç dizisi

export function sipBody(n: number): BufferGeometry {
  const L = n * 2.54 - 0.3;
  const y0 = 0.9;
  const H = 4.7;
  const r = 0.8;
  const s = new Shape();
  s.moveTo(-L / 2, y0);
  s.lineTo(L / 2, y0);
  s.lineTo(L / 2, y0 + H - r);
  s.quadraticCurveTo(L / 2, y0 + H, L / 2 - r, y0 + H);
  s.lineTo(-L / 2 + r, y0 + H);
  s.quadraticCurveTo(-L / 2, y0 + H, -L / 2, y0 + H - r);
  s.lineTo(-L / 2, y0);
  const g = new ExtrudeGeometry(s, { depth: 2.4, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -1.2);
  return g;
}

export function sipFrontPlane(n: number): BufferGeometry {
  const g = new PlaneGeometry(n * 2.54 - 0.8, 4.2);
  g.translate(0, 3.25, 1.21);
  return g;
}

/** Yassı bacaklar, verilen x konumlarında */
export function flatPins(xs: number[], top = 1.0, w = 0.55, t = 0.25, zs?: number[]): BufferGeometry {
  return merge(xs.map((x, i) => at(new BoxGeometry(w, top + 0.5, t), x, (top - 0.5) / 2, zs?.[i] ?? 0)));
}

// ---------------------------------------------------------------- osilatör kılıfı

/** DIP-14 metal kutu: 1. bacak köşesi (−x, +z) sivri, öbürleri yuvarlak */
export function oscCan(w: number, d: number, h: number): BufferGeometry {
  const r = 1.3;
  const x0 = -w / 2;
  const x1 = w / 2;
  // şekil düzlemi: x, y (y → −z olur): 1. bacak köşesi (−x, +z) → şekilde (x0, −d/2)
  const y0 = -d / 2;
  const y1 = d / 2;
  const s = new Shape();
  s.moveTo(x0, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0);
  const g = new ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 2, curveSegments: 5 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.5, 0);
  return g;
}

export function topPlane(w: number, d: number, y: number): BufferGeometry {
  const g = new PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// ---------------------------------------------------------------- buton, anahtar, trimpot, konnektör

export function buttonBody(): BufferGeometry {
  return merge([
    { g: at(new BoxGeometry(6, 3.3, 6), 0, 1.65 + 0.3, 0), color: "#1e2024" },
    { g: at(new BoxGeometry(6.15, 0.3, 6.15), 0, 3.75, 0), color: "#b9bfc6" },
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ g: at(new BoxGeometry(0.7, 1.6, 0.3), sx * 3.15, 0.3, sz * 2.25), color: "#c8cdd2" }))),
  ]);
}

export function buttonCap(): BufferGeometry {
  const g = new CylinderGeometry(1.75, 1.75, 1.7, 18);
  g.translate(0, 3.9 + 0.85, 0);
  return g;
}

export function slideBody(): BufferGeometry {
  return merge([
    { g: at(new BoxGeometry(8.6, 3.4, 4.0), 0, 1.7 + 0.4, 0), color: "#1e2024" },
    { g: at(new BoxGeometry(8.7, 0.35, 4.2), 0, 3.95, 0), color: "#c2c8cf" },
    { g: at(new BoxGeometry(4.2, 0.36, 1.6), 0, 4.0, 0), color: "#2a2d31" },
  ]);
}

export function slideKnob(): BufferGeometry {
  const g = new BoxGeometry(1.5, 2.0, 1.4);
  g.translate(0, 5.0, 0);
  return g;
}

export function trimpotBody(): BufferGeometry {
  return merge([
    { g: at(new BoxGeometry(9.5, 4.8, 9.5), 0, 2.4 + 0.3, 0), color: "#2f62c4" },
    { g: at(new CylinderGeometry(1.6, 1.6, 0.6, 18), 0, 5.4, 0.6), color: "#efe7d4" },
    { g: at(new BoxGeometry(2.6, 0.2, 0.4), 0, 5.72, 0.6), color: "#3a3326" },
    { g: at(new BoxGeometry(0.4, 0.2, 2.6), 0, 5.72, 0.6), color: "#3a3326" },
  ]);
}

/** Erkek pin başlığı: siyah plastik taban; altın pinler ayrı (instanced) */
export function headerBase(cols: number, rows: number): BufferGeometry {
  return at(new BoxGeometry(cols * 2.54, 2.5, rows * 2.54), 0, 1.25, 0);
}

export function headerPin(height: number): BufferGeometry {
  return at(new BoxGeometry(0.64, height + 0.6, 0.64), 0, (height - 0.6) / 2, 0);
}

export function boxAt(w: number, h: number, d: number, y = h / 2, x = 0, z = 0): BufferGeometry {
  return at(new BoxGeometry(w, h, d), x, y, z);
}

export function ps2Body(w: number, d: number): BufferGeometry {
  return merge([
    { g: at(new BoxGeometry(w, 12, d), 0, 6, 0), color: "#6b44a6" },
    { g: at(new BoxGeometry(w + 0.3, 12.3, 0.4), 0, 6.1, d / 2 + 0.2), color: "#b8bec6" },
    { g: at(new CylinderGeometry(4.6, 4.6, 0.6, 24).rotateX(Math.PI / 2), 0, 6.4, d / 2 + 0.45), color: "#c8ced6" },
    { g: at(new CylinderGeometry(3.7, 3.7, 0.7, 24).rotateX(Math.PI / 2), 0, 6.4, d / 2 + 0.55), color: "#4d2d82" },
  ]);
}

export function vgaBody(w: number, d: number): BufferGeometry {
  const shell = new Shape();
  // D biçimli kalkan: üstte geniş, altta dar
  shell.moveTo(-8.3, 3.2);
  shell.lineTo(8.3, 3.2);
  shell.lineTo(7.2, -3.2);
  shell.lineTo(-7.2, -3.2);
  shell.lineTo(-8.3, 3.2);
  const d1 = new ExtrudeGeometry(shell, { depth: 3, bevelEnabled: false });
  d1.translate(0, 6.5, d / 2 + 0.4);
  const inner = new Shape();
  inner.moveTo(-7.4, 2.5);
  inner.lineTo(7.4, 2.5);
  inner.lineTo(6.5, -2.5);
  inner.lineTo(-6.5, -2.5);
  inner.lineTo(-7.4, 2.5);
  const d2 = new ExtrudeGeometry(inner, { depth: 0.2, bevelEnabled: false });
  d2.translate(0, 6.5, d / 2 + 3.41);
  return merge([
    { g: at(new BoxGeometry(w, 12, d), 0, 6, 0), color: "#21418f" },
    { g: at(new BoxGeometry(Math.max(w + 3, 31), 12.6, 0.4), 0, 6.3, d / 2 + 0.2), color: "#c3c9d0" },
    { g: d1, color: "#c9cfd6" },
    { g: d2, color: "#232a36" },
    ...[-1, 1].map((s) => ({ g: at(new CylinderGeometry(1.25, 1.25, 4, 6).rotateX(Math.PI / 2), s * 12.5, 6.5, d / 2 + 2.2), color: "#d6dbe1" })),
  ]);
}

export function moduleBody(w: number, d: number): BufferGeometry {
  return merge([
    { g: at(new BoxGeometry(w, 1.6, d), 0, 2.8, 0), color: "#1f5f8b" },
    { g: at(new BoxGeometry(w * 0.3, 1.2, d * 0.3), 0, 4.2, 0), color: "#16181b" },
    { g: at(new BoxGeometry(w * 0.12, 2.6, d * 0.35), -w * 0.44, 4.9, 0), color: "#c8cdd2" },
  ]);
}

// ---------------------------------------------------------------- DIP anahtar, 7 segment gösterge, DIP direnç dizisi

/** DIP anahtar gövdesinin üstü (mm); sürgüler bunun üstünde, tıklanınca gövdeden önce yakalansın diye kabarık */
export const DIP_TOP = 4.6;
/** Sürgünün yolu: açık (ON) −z'ye (üst kenardaki "ON" yazısına doğru), kapalı +z'ye */
export const DIP_TRAVEL = 1.25;

export function dipSwitchBody(w: number, d: number): BufferGeometry {
  return boxAt(w - 0.3, DIP_TOP - 0.5, d - 0.5, 0.5 + (DIP_TOP - 0.5) / 2);
}

export function dipSwitchKnob(): BufferGeometry {
  return boxAt(1.15, 0.9, 2.1, DIP_TOP + 0.4);
}

/**
 * DIP anahtarın üst yüzü: her anahtarın oluğu, altında numarası (1 … n), üst kenarda "ON" ve ok.
 * xs: anahtarların yerel x konumları (mm), w × d: yüzün ölçüsü (mm)
 */
export function dipSwitchTexture(xs: number[], w: number, d: number): CanvasTexture {
  const k = 40;
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(d * k);
  const ctx = c.getContext("2d")!;
  const X = (x: number) => (x + w / 2) * k;
  const Z = (z: number) => (z + d / 2) * k;
  // oluklar
  ctx.fillStyle = "#101216";
  for (const x of xs) ctx.fillRect(X(x) - 0.8 * k, Z(-2.45), 1.6 * k, 4.9 * k);
  ctx.fillStyle = "#f4f6fa";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(1.55 * k)}px "IBM Plex Sans", system-ui, sans-serif`;
  xs.forEach((x, i) => ctx.fillText(String(i + 1), X(x), Z(d / 2 - 1.25)));
  // "ON" ve üst kenara bakan ok (ilk anahtarın üstünde)
  const ox = X(xs[0]) + (xs.length > 2 ? 0.9 * k : 0.2 * k);
  ctx.textAlign = "left";
  ctx.font = `700 ${Math.round(1.45 * k)}px "IBM Plex Sans", system-ui, sans-serif`;
  ctx.fillText("ON", ox, Z(-d / 2 + 1.25));
  const ax = ox - 0.75 * k;
  const az = Z(-d / 2 + 1.25);
  ctx.beginPath();
  ctx.moveTo(ax, az - 0.6 * k);
  ctx.lineTo(ax + 0.5 * k, az + 0.4 * k);
  ctx.lineTo(ax - 0.5 * k, az + 0.4 * k);
  ctx.closePath();
  ctx.fill();
  return finish(c);
}

/** 7 segment göstergenin gövdesi (0,56" tek hane): kartın üstünde kara kutu */
export const SEG_TOP = 7.8;
export function displayBody(w: number, d: number): BufferGeometry {
  return merge([
    { g: boxAt(w - 0.2, SEG_TOP - 0.4, d - 0.2, 0.4 + (SEG_TOP - 0.4) / 2), color: "#121316" },
    // yüzün kenarındaki ince çerçeve (segmentlerin durduğu koyu yüzden ayrılsın)
    { g: boxAt(w - 0.2, 0.06, 0.5, SEG_TOP + 0.03, 0, -(d - 0.2) / 2 + 0.25), color: "#24262b" },
    { g: boxAt(w - 0.2, 0.06, 0.5, SEG_TOP + 0.03, 0, (d - 0.2) / 2 - 0.25), color: "#24262b" },
  ]);
}

/** Segmentlerin yeri (rakamın ortasına göre, mm; z aşağı): a üstte, g ortada, d altta */
export const SEGMENT_YERI: Record<string, { x: number; z: number; dikey: boolean }> = (() => {
  const W = 6.0;
  const H = 11.6;
  return {
    a: { x: 0, z: -H / 2, dikey: false },
    b: { x: W / 2, z: -H / 4, dikey: true },
    c: { x: W / 2, z: H / 4, dikey: true },
    d: { x: 0, z: H / 2, dikey: false },
    e: { x: -W / 2, z: H / 4, dikey: true },
    f: { x: -W / 2, z: -H / 4, dikey: true },
    g: { x: 0, z: 0, dikey: false },
    dp: { x: W / 2 + 1.45, z: H / 2 + 0.15, dikey: false },
  };
})();
/** Segmentin boyu ve kalınlığı (mm) */
export const SEGMENT_BOY = { yatay: 5.3, dikey: 5.1, kalinlik: 1.25 };
/** Rakamın gövdedeki yeri ve eğikliği: üst kısım sağa yatık (x' = x − k·z) */
export const RAKAM_ORTA = { x: -0.75, z: -0.15, egim: 0.1 };

/** Altıgen uçlu segment (yatay ya da dikey), göstergenin yüzünde */
export function segmentBar(dikey: boolean): BufferGeometry {
  const L = dikey ? SEGMENT_BOY.dikey : SEGMENT_BOY.yatay;
  const t = SEGMENT_BOY.kalinlik;
  const pts: [number, number][] = [[-L / 2, 0], [-L / 2 + t / 2, t / 2], [L / 2 - t / 2, t / 2], [L / 2, 0], [L / 2 - t / 2, -t / 2], [-L / 2 + t / 2, -t / 2]];
  const s = new Shape();
  pts.forEach(([a, b], i) => {
    const [x, y] = dikey ? [b, a] : [a, b];
    if (i) s.lineTo(x, y);
    else s.moveTo(x, y);
  });
  s.closePath();
  const g = new ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  g.translate(0, SEG_TOP + 0.02, 0);
  return g;
}

export function segmentDot(): BufferGeometry {
  const g = new CircleGeometry(0.62, 12);
  g.rotateX(-Math.PI / 2);
  g.translate(0, SEG_TOP + 0.02, 0);
  return g;
}

/** DIP-16 direnç dizisi: çip gibi kara gövde (yazı ayrı düzlemde) */
export const DIPDIZI_TOP = 3.6;
export function dipArrayBody(w: number, d: number): BufferGeometry {
  return boxAt(w, DIPDIZI_TOP - 0.6, d, 0.6 + (DIPDIZI_TOP - 0.6) / 2);
}

// ---------------------------------------------------------------- çubuk gösterge (CPU kartı)

/** 10 segmentli çubuk göstergenin üst yüzü (mm) */
export const CUBUK_TOP = 6.5;
/** Segment penceresi (mm): x boyunca en, z boyunca boy; her segment bir sütunun (2,54 mm) ortasında */
export const CUBUK_SEGMENT = { en: 1.7, boy: 5.4 };

/** Kara gövde ve 1. bacak köşesindeki açık renkli işaret */
export function barBody(w: number, d: number): BufferGeometry {
  return merge([
    { g: boxAt(w - 0.2, CUBUK_TOP - 0.4, d - 0.2, 0.4 + (CUBUK_TOP - 0.4) / 2), color: "#141518" },
    { g: boxAt(1.0, 0.05, 1.0, CUBUK_TOP + 0.025, -(w - 0.2) / 2 + 1.0, (d - 0.2) / 2 - 1.0), color: "#5a5f66" },
  ]);
}

/** Bir segmentin penceresi: üst yüzde ince dikdörtgen (rengi canlı) */
export function barSegment(): BufferGeometry {
  return boxAt(CUBUK_SEGMENT.en, 0.08, CUBUK_SEGMENT.boy, CUBUK_TOP + 0.04);
}

// ---------------------------------------------------------------- yazı dokuları

function finish(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Osilatörün üst yüzü: frekans, birim ve sol alt köşede 1. bacak noktası; aspect = derinlik / genişlik */
export function oscTexture(freq: string, aspect: number): CanvasTexture {
  const W = 512;
  const H = Math.round(W * aspect);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#2b3036";
  ctx.beginPath();
  ctx.arc(H * 0.13, H * 0.84, H * 0.065, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(H * 0.3)}px "IBM Plex Sans", system-ui, sans-serif`;
  ctx.fillText(freq, W / 2, H * 0.38, W * 0.8);
  ctx.font = `600 ${Math.round(H * 0.17)}px "IBM Plex Sans", system-ui, sans-serif`;
  ctx.fillText("MHz", W / 2, H * 0.68, W * 0.6);
  return finish(c);
}

/** Saydam zeminde ortalı yazı (ve isteğe bağlı 1. pin noktası) */
export function labelTexture(lines: string[], o: { w?: number; h?: number; color?: string; dot?: "sol" | "sol-alt"; bg?: string; font?: number } = {}): CanvasTexture {
  const W = o.w ?? 256;
  const H = o.h ?? 128;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  if (o.bg) {
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = o.color ?? "#ffffff";
  if (o.dot) {
    ctx.beginPath();
    const dx = H * 0.22;
    ctx.arc(dx, o.dot === "sol-alt" ? H - dx : H / 2, H * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }
  const size = o.font ?? Math.round((H * 0.72) / lines.length);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => {
    ctx.font = `700 ${i ? Math.round(size * 0.8) : size}px "IBM Plex Sans", system-ui, sans-serif`;
    ctx.fillText(l, W / 2 + (o.dot === "sol" ? H * 0.12 : 0), (H * (i + 0.5)) / lines.length + (lines.length > 1 ? (i ? -H * 0.04 : H * 0.04) : 0), W * 0.9);
  });
  return finish(c);
}
