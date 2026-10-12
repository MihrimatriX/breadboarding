// Kurulum modunun 3D katmanı: odaktaki tel iki bacağı arasında kendi renginde, kalın ve her şeyin
// üstünde çizilir; uçlarında nabız gibi atan halkalar. Takılan teller (bu kartta) ince, kendi
// renklerinde kalır: kart ilerledikçe gerçek kartın görüntüsüne benzer.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, LineBasicMaterial, LineSegments, Vector3, type Mesh } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Tel } from "../../cpu16/kurulum/plan";
import { ucusAdimi } from "../ui/ayarlar";
import { seciliTel, sahnedeVar, ucKonumu, useKurulum } from "./kurulum";
import { boardLayoutData } from "./store";
import { arcPoints } from "./wires";

/** BoardScene ile aynı ölçek: 1 dünya birimi = 10 mm; çip bacağının üstü */
const S = 0.1;
const PIN_TOP = 0.24;

function useDunya() {
  const lay = boardLayoutData();
  return useMemo(() => {
    const cx = lay.width / 2;
    const cz = lay.height / 2;
    return (x: number, y: number): [number, number] => [(x - cx) * S, (y - cz) * S];
  }, [lay]);
}

/** Telin 3D yolu (x, y, z noktaları); uçlardan biri sahnede yoksa null */
function telYolu(t: Tel, w: (x: number, y: number) => [number, number], ekYukseklik = 0): number[] | null {
  const a = ucKonumu(t.from.ref, t.from.pin);
  const b = ucKonumu(t.to.ref, t.to.pin);
  if (!a || !b) return null;
  const [ax, az] = w(a.x, a.y);
  const [bx, bz] = w(b.x, b.y);
  const d = Math.hypot(bx - ax, bz - az);
  return arcPoints(ax, az, bx, bz, PIN_TOP, Math.min(6, 0.3 + 0.18 * d) + ekYukseklik);
}

/** Nokta dizisini parça listesine (her parça iki uç) çevirir */
function parcalar(pts: number[], out: number[]): void {
  for (let k = 0; k + 5 < pts.length; k += 3) for (let j = 0; j < 6; j++) out.push(pts[k + j]);
}

function SeciliTel({ tel }: { tel: Tel }) {
  const w = useDunya();
  const size = useThree((s) => s.size);
  const obj = useMemo(() => {
    const pts = telYolu(tel, w, 0.4);
    if (!pts) return null;
    const pos: number[] = [];
    parcalar(pts, pos);
    const geo = new LineSegmentsGeometry();
    geo.setPositions(pos);
    const mat = new LineMaterial({ color: new Color(tel.hex).getHex(), linewidth: 6, depthTest: false, transparent: true, worldUnits: false });
    const line = new LineSegments2(geo, mat);
    line.renderOrder = 20;
    line.frustumCulled = false;
    line.raycast = () => {};
    const n = pts.length;
    return { line, geo, mat, uc: [[pts[0], pts[1], pts[2]], [pts[n - 3], pts[n - 2], pts[n - 1]]] as [number, number, number][] };
  }, [tel, w]);
  useEffect(() => () => {
    obj?.geo.dispose();
    obj?.mat.dispose();
  }, [obj]);
  useEffect(() => {
    obj?.mat.resolution.set(size.width, size.height);
  }, [obj, size]);
  const halkalar = useRef<(Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const s = 1 + 0.35 * (0.5 + 0.5 * Math.sin(t * 5));
    for (const m of halkalar.current) m?.scale.set(s, s, s);
  });
  if (!obj) return null;
  // beyaz tel koyu kartta görünsün, siyah tel (yalnız GND, burada olmaz) için de açık halka
  const halkaRengi = tel.renk === "beyaz" || tel.renk === "siyah" ? "#ffffff" : tel.hex;
  return (
    <group>
      <primitive object={obj.line} />
      {obj.uc.map(([x, y, z], i) => (
        <mesh key={i} ref={(m) => (halkalar.current[i] = m)} position={[x, y + 0.02, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={21} raycast={() => {}}>
          <ringGeometry args={[0.07, 0.12, 24]} />
          <meshBasicMaterial color={halkaRengi} side={DoubleSide} depthTest={false} transparent />
        </mesh>
      ))}
    </group>
  );
}

/** Takılan teller: tek çizim çağrısı, telin kendi rengi */
function TakilanTeller({ teller }: { teller: Tel[] }) {
  const w = useDunya();
  const obj = useMemo(() => {
    if (!teller.length) return null;
    const pos: number[] = [];
    const col: number[] = [];
    const c = new Color();
    for (const t of teller) {
      const pts = telYolu(t, w);
      if (!pts) continue;
      const once = pos.length;
      parcalar(pts, pos);
      c.set(t.renk === "siyah" ? "#3a3a3a" : t.hex);
      for (let k = once; k < pos.length; k += 3) col.push(c.r, c.g, c.b);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
    const mat = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 });
    const line = new LineSegments(geo, mat);
    line.renderOrder = 6;
    line.frustumCulled = false;
    line.raycast = () => {};
    return { line, geo, mat };
  }, [teller, w]);
  useEffect(() => () => {
    obj?.geo.dispose();
    obj?.mat.dispose();
  }, [obj]);
  return obj ? <primitive object={obj.line} /> : null;
}

/** Kamera odaktaki telin iki ucunu birlikte çerçeveler (izle açıkken) */
function KurulumKamera({ tel }: { tel: Tel | null }) {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const izle = useKurulum((s) => s.izle);
  const w = useDunya();
  const anim = useRef<{ target: Vector3; cam: Vector3; t0: Vector3; c0: Vector3; t: number } | null>(null);
  useEffect(() => {
    if (!controls || !tel || !izle) return;
    const a = ucKonumu(tel.from.ref, tel.from.pin);
    const b = ucKonumu(tel.to.ref, tel.to.pin);
    if (!a || !b) return;
    const [ax, az] = w(Math.min(a.x, b.x), Math.min(a.y, b.y));
    const [bx, bz] = w(Math.max(a.x, b.x), Math.max(a.y, b.y));
    const d = Math.min(80, Math.max(7, Math.max(bx - ax, (bz - az) * 1.4) * 1.6));
    // tel ekranın sol yarısında kalsın: sağ üstteki VGA paneli uçlarını örtmesin
    const tx = (ax + bx) / 2 + d * 0.3;
    const tz = (az + bz) / 2;
    anim.current = { target: new Vector3(tx, 0.4, tz), cam: new Vector3(tx, 0.4 + d * 0.8, tz + d * 0.55), t0: controls.target.clone(), c0: camera.position.clone(), t: 0 };
  }, [tel, izle, controls, camera, w]);
  useFrame((_, dt) => {
    const an = anim.current;
    if (!an || !controls) return;
    an.t = ucusAdimi(an.t, dt, 1.6);
    const k = 1 - Math.pow(1 - an.t, 3);
    controls.target.lerpVectors(an.t0, an.target, k);
    camera.position.lerpVectors(an.c0, an.cam, k);
    controls.update();
    if (an.t >= 1) anim.current = null;
  });
  return null;
}

export function KurulumSahne() {
  const acik = useKurulum((s) => s.acik);
  const kart = useKurulum((s) => s.kart);
  const plan = useKurulum((s) => s.plan);
  const yapilan = useKurulum((s) => s.yapilan);
  const tel = useKurulum(seciliTel);
  const takilan = useMemo(() => (plan ? plan.teller.filter((t) => yapilan.has(t.id)) : []), [plan, yapilan]);
  if (!acik || !plan || !sahnedeVar(kart)) return null;
  return (
    <group>
      <TakilanTeller teller={takilan} />
      {tel && <SeciliTel tel={tel} />}
      <KurulumKamera tel={tel} />
    </group>
  );
}
