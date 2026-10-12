// Pasif elemanlar 3D'de, gerçeğe yakın: renk bantlı eksenel dirençler, "104" yazılı disk
// kondansatörler, şeritli elektrolitikler, düz kenarlı flanşı ve uzun anot bacağıyla LED'ler (canlı
// sinyalle yanar, halesi ve karttaki ışık lekesiyle), noktalı ve "A103J" yazılı direnç dizileri,
// metal kutulu osilatörler, butonlar, sürgülü anahtarlar (konumu canlı), trimpot ve konnektörler;
// hesap makinesinde DIP anahtarlar (sürgüleri canlı, tıklanınca değişir), segmentleri canlı yanan
// 7 segment göstergeler ve DIP-16 direnç dizileri, basılı tutulan lamba testi butonu.
// Aynı parçanın örnekleri tek InstancedMesh: ~500 pasif birkaç düzine çizim çağrısıdır. Tıklama
// ve üstüne gelme görünmez kutularla (her pasife bir kutu) yakalanır.

import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CircleGeometry, Color, EdgesGeometry, Euler, Group, InstancedMesh, LineSegments, Material, Matrix4, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, Sprite, SpriteMaterial, Texture, Vector3,
} from "three";
import type { PassivePlace } from "../../cpu16/board/layout";
import { LED_RENKLERI } from "../../cpu16/board/passives";
import { direncBantlari, faradMetni, frekansMetni, pasifDegeri } from "../../cpu16/board/pasif-bilgi";
import { basilabilir, butonBas, useHesap } from "./hesap";
import { dipAnahtarlari, etkinNet, ledDevresi, ledYanik, segmentNetleri, type SegmentAdi } from "./pasif-analiz";
import {
  BAND_SLOTS, DIP_TOP, DIP_TRAVEL, DIPDIZI_TOP, LED_DIE, LED_TOP, RAKAM_ORTA, SEGMENT_BOY, SEGMENT_YERI, SEG_TOP, axialLeads, boxAt, buttonBody, buttonCap,
  canSide, canTexture, canTop, canTopTexture, dipArrayBody, dipSwitchBody, dipSwitchKnob, dipSwitchTexture, discBody, discLabelPlane, discLeads,
  displayBody, flatPins, glowTexture, headerBase, headerPin, labelTexture, ledEpoxy, ledInner, ledLeads, moduleBody, oscCan, oscTexture, plusMark, ps2Body,
  resistorBody, segmentBar, segmentDot, sipBody, sipFrontPlane, slideBody, slideKnob, topPlane, trimpotBody, vgaBody,
} from "./passiveGeometry";
import { boardLayoutData, boardModel, findPart, liveNets, netEnds, useKart } from "./store";

/** 1 dünya birimi = 10 mm */
const S = 0.1;
const noRaycast = () => null;
const PIN_COLORS = [new Color("#56606c"), new Color("#ff2a55"), new Color("#9d8cff"), new Color("#e6e600")];
const level = (v: Uint8Array | null, net: number) => (net < 0 ? 2 : net <= 1 ? net : v ? (v[net] ?? 3) : 3);
const tmpM = new Matrix4();
const tmpM2 = new Matrix4();
const tmpQ = new Quaternion();
const tmpP = new Vector3();
const tmpS = new Vector3(S, S, S);
const tmpC = new Color();
const UP = new Euler();

type W = (x: number, y: number) => [number, number];

function useWorld() {
  const lay = boardLayoutData();
  const cx = lay.width / 2;
  const cz = lay.height / 2;
  return useMemo(() => ({ lay, w: ((x: number, y: number) => [(x - cx) * S, (y - cz) * S]) as W }), [lay, cx, cz]);
}

/** Elemanın yerel çerçevesi: kaplama dikdörtgeninin ortası, dikeyse −90° döner, mm → dünya ölçeği */
function partMatrix(p: PassivePlace, w: W, out: Matrix4, extra?: Matrix4): Matrix4 {
  const [x, z] = w(p.x + p.w / 2, p.y + p.h / 2);
  UP.set(0, p.vertical ? -Math.PI / 2 : 0, 0);
  tmpQ.setFromEuler(UP);
  out.compose(tmpP.set(x, 0, z), tmpQ, tmpS);
  if (extra) out.multiply(extra);
  return out;
}

/** Pinlerin yerel konumu (mm): x pin ekseni, z ön */
export function localPins(p: PassivePlace): { num: number; lx: number; lz: number }[] {
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  return p.pins.map((q) => {
    const dx = q.x - cx;
    const dy = q.y - cy;
    return p.vertical ? { num: q.num, lx: dy, lz: -dx } : { num: q.num, lx: dx, lz: dy };
  });
}

/** useMemo + kapanışta dispose (geometriler, malzemeler, dokular) */
function useOwned<const T extends readonly { dispose(): void }[]>(make: () => T, deps: unknown[]): T {
  const v = useMemo(make, deps);
  useEffect(() => () => v.forEach((x) => x.dispose()), [v]);
  return v;
}

/** Ayrıntı katmanlarının (bacaklar, yazılar, lehim noktaları) görüneceği en büyük uzaklık (dünya birimi) */
const DETAIL = 25;

interface BatchProps<T> {
  items: T[];
  geometry: BufferGeometry;
  material: Material;
  matrix: (it: T, m: Matrix4) => Matrix4;
  color?: (it: T) => string | Color;
  renderOrder?: number;
  /** yalnız kamera bu kadar yakındayken çiz (ayrıntı) */
  far?: number;
  /** yalnız kamera bu kadar uzaktayken çiz (az üçgenli uzak biçim) */
  near?: number;
}

const cardOf = (it: unknown): string => (it as { card?: string }).card ?? (it as { p?: { card: string } }).p?.card ?? "";

/**
 * Aynı biçimin bütün örnekleri: kart başına bir InstancedMesh. Böylece yakından bakınca ekran
 * dışındaki kartlar kırpılır (InstancedMesh bütün örneklerini kapsayan küreyle kırpılır) ve
 * ayrıntılar (far) yalnız kameraya yakın kartlarda çizilir.
 */
function Batch<T>(props: BatchProps<T>) {
  const chunks = useMemo(() => {
    const m = new Map<string, T[]>();
    for (const it of props.items) (m.get(cardOf(it)) ?? m.set(cardOf(it), []).get(cardOf(it))!).push(it);
    return [...m.entries()];
  }, [props.items]);
  return <>{chunks.map(([card, list]) => <Chunk key={card} {...props} items={list} />)}</>;
}

function Chunk<T>({ items, geometry, material, matrix, color, renderOrder, far, near }: BatchProps<T>) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    items.forEach((it, i) => {
      m.setMatrixAt(i, matrix(it, tmpM));
      if (color) m.setColorAt(i, tmpC.set(color(it)));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items, geometry, material, matrix, color]);
  useFrame(({ camera }) => {
    const m = ref.current;
    if ((!far && !near) || !m?.boundingSphere) return;
    const d = camera.position.distanceTo(m.boundingSphere.center) - m.boundingSphere.radius;
    const vis = (!far || d < far) && (!near || d >= near);
    if (m.visible !== vis) m.visible = vis;
  });
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} raycast={noRaycast} renderOrder={renderOrder} />;
}

const std = (o: ConstructorParameters<typeof MeshStandardMaterial>[0]) => new MeshStandardMaterial(o);
const tinned = () => std({ color: "#cdd2d7", metalness: 0.45, roughness: 0.3 });

function byPart(list: PassivePlace[]): [string, PassivePlace[]][] {
  const m = new Map<string, PassivePlace[]>();
  for (const p of list) (m.get(p.part) ?? m.set(p.part, []).get(p.part)!).push(p);
  return [...m.entries()];
}

const span = (p: PassivePlace) => {
  const lp = localPins(p);
  return lp.length >= 2 ? Math.abs(lp[lp.length - 1].lx - lp[0].lx) : 7.62;
};

// ---------------------------------------------------------------- dirençler

const RES_BODY = { karbon: "#d8c39b", metal: "#5288d8" };

function Resistors({ list, w }: { list: PassivePlace[]; w: W }) {
  const groups = useMemo(() => byPart(list), [list]);
  const [leads, leadMat, bodyMat] = useOwned(() => [axialLeads(span(list[0])), tinned(), std({ vertexColors: true, roughness: 0.48, metalness: 0.05 })], [list]);
  const bodies = useOwned(
    () => groups.map(([part]) => {
      const d = pasifDegeri(part);
      if (d?.tur !== "direnc") return resistorBody(["#888888", "#888888", "#888888", "#888888"], RES_BODY.karbon);
      const bands = direncBantlari(d.ohm, d.tolerans);
      return resistorBody(bands.map((b) => b.hex), d.film === "metal" ? RES_BODY.metal : RES_BODY.karbon);
    }),
    [groups],
  );
  const mat = useMemo(() => (p: PassivePlace, m: Matrix4) => partMatrix(p, w, m), [w]);
  return (
    <>
      {groups.map(([part, ps], i) => <Batch key={part} items={ps} geometry={bodies[i]} material={bodyMat} matrix={mat} />)}
      <Batch items={list} geometry={leads} material={leadMat} matrix={mat} far={DETAIL} />
    </>
  );
}

// ---------------------------------------------------------------- seramik kondansatörler

function DiscCaps({ list, w }: { list: PassivePlace[]; w: W }) {
  const groups = useMemo(() => byPart(list), [list]);
  const [body, lowBody, leads, plane, bodyMat, leadMat] = useOwned(
    () => [discBody(), discBody(6, 4), discLeads(span(list[0])), discLabelPlane(), std({ roughness: 0.62, metalness: 0 }), tinned()],
    [list],
  );
  const labels = useOwned(
    () => groups.map(([part]) => {
      const d = pasifDegeri(part);
      const t = labelTexture([d?.tur === "seramik" ? d.kod : "?"], { w: 128, h: 64, color: "#2a1608", font: 46 });
      return new MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.35, depthWrite: false });
    }),
    [groups],
  );
  useEffect(() => () => labels.forEach((m) => m.map?.dispose()), [labels]);
  const mat = useMemo(() => (p: PassivePlace, m: Matrix4) => partMatrix(p, w, m), [w]);
  const color = useMemo(() => (p: PassivePlace) => (p.part === "C_100N" ? "#c27632" : "#d5a43c"), []);
  return (
    <>
      <Batch items={list} geometry={body} material={bodyMat} matrix={mat} color={color} far={DETAIL} />
      <Batch items={list} geometry={lowBody} material={bodyMat} matrix={mat} color={color} near={DETAIL} />
      <Batch items={list} geometry={leads} material={leadMat} matrix={mat} far={DETAIL} />
      {groups.map(([part, ps], i) => <Batch key={part} items={ps} geometry={plane} material={labels[i]} matrix={mat} renderOrder={2} far={DETAIL} />)}
    </>
  );
}

// ---------------------------------------------------------------- elektrolitikler

function Electrolytics({ list, w }: { list: PassivePlace[]; w: W }) {
  const groups = useMemo(() => byPart(list), [list]);
  const parts = useOwned(
    () => groups.map(([part, ps]) => {
      const d = pasifDegeri(part);
      const value = d?.tur === "elektrolitik" ? faradMetni(d.farad).replace(" ", "") : part;
      const volt = d?.tur === "elektrolitik" ? `${d.volt}V` : "";
      const tex = canTexture(value, volt);
      const dia = Math.min(ps[0].w, ps[0].h);
      const side = canSide(dia, ps[0].height);
      const top = canTop(dia, ps[0].height);
      const mat = std({ map: tex, roughness: 0.42, metalness: 0.05 });
      return { side, top, mat, dispose: () => [side, top, mat, tex].forEach((x) => x.dispose()) };
    }),
    [groups],
  );
  const [topMat, , plus, plusMat] = useOwned(() => {
    const t = canTopTexture();
    return [std({ map: t, roughness: 0.35, metalness: 0.35 }), t, plusMark(), new MeshBasicMaterial({ color: "#e8efe9" })];
  }, []);
  const mat = useMemo(() => (p: PassivePlace, m: Matrix4) => partMatrix(p, w, m), [w]);
  // "+" baskısı: gövdenin + bacağı (1. pin) tarafında, dışarıda
  const plusM = useMemo(() => (p: PassivePlace, m: Matrix4) => {
    const lp = localPins(p).find((q) => q.num === 1);
    const r = Math.min(p.w, p.h) / 2;
    return partMatrix(p, w, m, tmpM2.makeTranslation(Math.min(lp?.lx ?? -1, 0) - r - 1.3, 0.01, lp?.lz ?? 0));
  }, [w]);
  return (
    <>
      {groups.map(([part, ps], i) => (
        <group key={part}>
          <Batch items={ps} geometry={parts[i].side} material={parts[i].mat} matrix={mat} />
          <Batch items={ps} geometry={parts[i].top} material={topMat} matrix={mat} />
        </group>
      ))}
      <Batch items={list} geometry={plus} material={plusMat} matrix={plusM} far={DETAIL} />
    </>
  );
}

// ---------------------------------------------------------------- LED'ler

function Leds({ list, w }: { list: PassivePlace[]; w: W }) {
  const [epoxy, inner, leads, innerMat, leadMat, glow, floor] = useOwned(
    () => [ledEpoxy(), ledInner(), ledLeads(span(list[0])), std({ color: "#9aa2aa", metalness: 0.55, roughness: 0.35 }), tinned(), glowTexture(), new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)],
    [list],
  );
  return (
    <>
      {list.map((p) => <Led key={p.ref} p={p} w={w} epoxy={epoxy} inner={inner} leads={leads} innerMat={innerMat} leadMat={leadMat} glow={glow} floor={floor} />)}
    </>
  );
}

function Led({ p, w, epoxy, inner, leads, innerMat, leadMat, glow, floor }: {
  p: PassivePlace; w: W; epoxy: BufferGeometry; inner: BufferGeometry; leads: BufferGeometry; innerMat: Material; leadMat: Material; glow: Texture; floor: BufferGeometry;
}) {
  const info = LED_RENKLERI[p.led ?? "kirmizi"];
  const circuit = useMemo(() => ledDevresi(p, { ends: netEnds(), find: findPart }), [p]);
  const [lens, die, halo, pool] = useOwned(() => [
    std({ color: info.govde, emissive: info.isik, emissiveIntensity: 0, transparent: true, opacity: 0.74, roughness: 0.18, metalness: 0, depthWrite: false, toneMapped: false }),
    new MeshBasicMaterial({ color: info.isik, toneMapped: false }),
    new SpriteMaterial({ map: glow, color: info.isik, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }),
    new MeshBasicMaterial({ map: glow, color: info.isik, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }),
  ], [info, glow]);
  const group = useRef<Group>(null);
  const dieRef = useRef<Mesh>(null);
  const haloRef = useRef<Sprite>(null);
  const bright = useRef(0);
  const m = useMemo(() => partMatrix(p, w, new Matrix4()), [p, w]);
  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    g.matrixAutoUpdate = false;
    g.matrix.copy(m);
    g.matrixWorldNeedsUpdate = true;
  }, [m]);
  useFrame((_, dt) => {
    const v = liveNets.values;
    const target = v && ledYanik(circuit, (n) => level(v, n)) ? 1 : 0;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) / 0.06);
    const prev = bright.current;
    const b = Math.abs(target - prev) < 1e-3 ? target : prev + (target - prev) * k;
    if (b === prev && lens.userData.ready) return;
    lens.userData.ready = true;
    bright.current = b;
    lens.emissiveIntensity = b * 0.95;
    lens.opacity = 0.74 + b * 0.16;
    halo.opacity = b * 0.5;
    pool.opacity = b * 0.45;
    if (dieRef.current) dieRef.current.visible = b > 0.05;
    if (haloRef.current) haloRef.current.scale.setScalar(6 + b * 7);
  });
  return (
    <group ref={group}>
      <mesh geometry={inner} material={innerMat} raycast={noRaycast} />
      <mesh geometry={leads} material={leadMat} raycast={noRaycast} />
      <mesh ref={dieRef} position={LED_DIE} raycast={noRaycast} visible={false} material={die}>
        <sphereGeometry args={[0.32, 10, 8]} />
      </mesh>
      <mesh geometry={epoxy} material={lens} raycast={noRaycast} renderOrder={3} />
      <sprite ref={haloRef} material={halo} position={[LED_DIE[0] * 0.3, LED_TOP - 1.6, 0]} raycast={noRaycast} renderOrder={4} />
      <mesh geometry={floor} material={pool} position={[0, 0.05, 0]} scale={[20, 1, 20]} raycast={noRaycast} renderOrder={4} />
    </group>
  );
}

// ---------------------------------------------------------------- direnç dizileri

function Sips({ list, w }: { list: PassivePlace[]; w: W }) {
  const n = list[0].pins.length;
  const groups = useMemo(() => byPart(list), [list]);
  const [body, front, pins, bodyMat, pinMat] = useOwned(
    () => [sipBody(n), sipFrontPlane(n), flatPins(localPins(list[0]).map((q) => q.lx)), std({ color: "#1c1e21", roughness: 0.5, metalness: 0.05 }), tinned()],
    [list, n],
  );
  const labels = useOwned(
    () => groups.map(([part]) => {
      const d = pasifDegeri(part);
      const t = labelTexture([d?.tur === "dizi" ? d.kod : part], { w: 512, h: 96, color: "#f2f2ee", dot: "sol", font: 60 });
      return new MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.3, depthWrite: false });
    }),
    [groups],
  );
  useEffect(() => () => labels.forEach((m) => m.map?.dispose()), [labels]);
  const mat = useMemo(() => (p: PassivePlace, m: Matrix4) => partMatrix(p, w, m), [w]);
  return (
    <>
      <Batch items={list} geometry={body} material={bodyMat} matrix={mat} />
      <Batch items={list} geometry={pins} material={pinMat} matrix={mat} far={DETAIL} />
      {groups.map(([part, ps], i) => <Batch key={part} items={ps} geometry={front} material={labels[i]} matrix={mat} renderOrder={2} far={DETAIL * 2} />)}
    </>
  );
}

// ---------------------------------------------------------------- osilatörler

function Oscillators({ list, w }: { list: PassivePlace[]; w: W }) {
  const p0 = list[0];
  const cw = p0.vertical ? p0.h : p0.w;
  const cd = p0.vertical ? p0.w : p0.h;
  const groups = useMemo(() => byPart(list), [list]);
  const [can, top, pins, canMat, pinMat] = useOwned(
    () => [oscCan(cw + 1.4, cd - 0.2, 5), topPlane(cw, cd - 1.4, 5.78), flatPins(localPins(p0).map((q) => q.lx), 0.8, 0.5, 0.25, localPins(p0).map((q) => q.lz)), std({ color: "#d9dde2", metalness: 0.5, roughness: 0.3 }), tinned()],
    [list],
  );
  const labels = useOwned(
    () => groups.map(([part]) => {
      const d = pasifDegeri(part);
      const f = d?.tur === "osilator" && d.hz ? frekansMetni(d.hz).replace(" MHz", "") : "8.000";
      const t = oscTexture(f.replace(",", "."), (cd - 1.4) / cw);
      return new MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.3, depthWrite: false });
    }),
    [groups],
  );
  useEffect(() => () => labels.forEach((m) => m.map?.dispose()), [labels]);
  const mat = useMemo(() => (p: PassivePlace, m: Matrix4) => partMatrix(p, w, m), [w]);
  return (
    <>
      <Batch items={list} geometry={can} material={canMat} matrix={mat} />
      <Batch items={list} geometry={pins} material={pinMat} matrix={mat} far={DETAIL} />
      {groups.map(([part, ps], i) => <Batch key={part} items={ps} geometry={top} material={labels[i]} matrix={mat} renderOrder={2} far={DETAIL * 2} />)}
    </>
  );
}

// ---------------------------------------------------------------- butonlar, anahtarlar, trimpot

function Buttons({ list, w }: { list: PassivePlace[]; w: W }) {
  const [body, cap, bodyMat, capMat] = useOwned(() => [buttonBody(), buttonCap(), std({ vertexColors: true, roughness: 0.5, metalness: 0.15 }), std({ roughness: 0.45 })], []);
  const mat = useMemo(() => (p: PassivePlace, m: Matrix4) => partMatrix(p, w, m), [w]);
  const color = useMemo(() => (p: PassivePlace) => (/RESET/i.test(p.role) ? "#d1343c" : "#26292e"), []);
  // elle basılan butonlar (hesap makinesinde lamba testi) ayrı çizilir: tıklanır, basılıyken çöker
  const elle = useMemo(() => list.filter((p) => basilabilir(p.ref)), [list]);
  const sabit = useMemo(() => list.filter((p) => !elle.includes(p)), [list, elle]);
  return (
    <>
      <Batch items={list} geometry={body} material={bodyMat} matrix={mat} />
      <Batch items={sabit} geometry={cap} material={capMat} matrix={mat} color={color} />
      {elle.length > 0 && <PressCaps list={elle} w={w} geometry={cap} material={capMat} />}
    </>
  );
}

/** İmleç: tıklanabilir parçanın üstünde el */
const imlec = (el: boolean) => {
  document.body.style.cursor = el ? "pointer" : "";
};

/** Basılı tutulan butonların başlıkları: iki bacağı aynı seviyedeyken (kontak kapalı) aşağıda */
function PressCaps({ list, w, geometry, material }: { list: PassivePlace[]; w: W; geometry: BufferGeometry; material: Material }) {
  const ref = useRef<InstancedMesh>(null);
  const version = useRef(-1);
  const yerlestir = (m: InstancedMesh) => {
    list.forEach((p, i) => {
      const la = level(liveNets.values, p.pins[0]?.net ?? -1);
      const basili = la <= 1 && la === level(liveNets.values, p.pins[1]?.net ?? -1);
      m.setMatrixAt(i, partMatrix(p, w, tmpM, tmpM2.makeTranslation(0, basili ? -0.9 : 0, 0)));
    });
    m.instanceMatrix.needsUpdate = true;
  };
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    list.forEach((_, i) => m.setColorAt(i, tmpC.set("#e2b93b")));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    yerlestir(m);
    m.computeBoundingSphere();
    version.current = -1;
  }, [list, w]);
  useFrame(() => {
    const m = ref.current;
    if (!m || version.current === liveNets.version) return;
    version.current = liveNets.version;
    yerlestir(m);
  });
  useEffect(() => () => imlec(false), []);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, list.length]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        const p = list[e.instanceId ?? -1];
        if (!p) return;
        e.stopPropagation();
        butonBas(p.ref, true);
        const birak = () => {
          butonBas(p.ref, false);
          window.removeEventListener("pointerup", birak);
          window.removeEventListener("pointercancel", birak);
        };
        window.addEventListener("pointerup", birak);
        window.addEventListener("pointercancel", birak);
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => e.stopPropagation()}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        const p = list[e.instanceId ?? -1];
        if (p) useKart.setState({ hover: { ref: p.ref, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, ek: "Basılı tut: bütün segmentler yanar" } });
      }}
      onPointerOver={() => imlec(true)}
      onPointerOut={() => {
        imlec(false);
        useKart.setState({ hover: null });
      }}
    />
  );
}

function Switches({ list, w }: { list: PassivePlace[]; w: W }) {
  const [body, knob, pins, bodyMat, knobMat, pinMat] = useOwned(
    () => [slideBody(), slideKnob(), flatPins(localPins(list[0]).map((q) => q.lx), 0.8), std({ vertexColors: true, roughness: 0.45, metalness: 0.2 }), std({ color: "#f0efe9", roughness: 0.5 }), tinned()],
    [list],
  );
  const mat = useMemo(() => (p: PassivePlace, m: Matrix4) => partMatrix(p, w, m), [w]);
  const knobRef = useRef<InstancedMesh>(null);
  const version = useRef(-1);
  useFrame(() => {
    const k = knobRef.current;
    if (!k || version.current === liveNets.version) return;
    version.current = liveNets.version;
    list.forEach((p, i) => {
      const c = p.pins.find((q) => q.num === 2)?.net ?? -1;
      const lv = level(liveNets.values, c);
      // C = 1 → sürgü A (1. pin, −x) tarafında
      k.setMatrixAt(i, partMatrix(p, w, tmpM, tmpM2.makeTranslation(lv === 1 ? -1.1 : lv === 0 ? 1.1 : 0, 0, 0)));
    });
    k.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <Batch items={list} geometry={body} material={bodyMat} matrix={mat} />
      <Batch items={list} geometry={pins} material={pinMat} matrix={mat} far={DETAIL} />
      <instancedMesh ref={knobRef} args={[knob, knobMat, list.length]} raycast={noRaycast} frustumCulled={false} />
    </>
  );
}

function Trimpots({ list, w }: { list: PassivePlace[]; w: W }) {
  const [body, pins, top, bodyMat, pinMat, labelMat] = useOwned(() => {
    const d = pasifDegeri(list[0].part);
    const t = labelTexture([d?.tur === "pot" ? d.kod : ""], { w: 128, h: 64, color: "#f4f6fa", font: 40 });
    return [trimpotBody(), flatPins(localPins(list[0]).map((q) => q.lx), 0.8), topPlane(4, 2, 5.12).translate(-2.4, 0, -3.2), std({ vertexColors: true, roughness: 0.5 }), tinned(), new MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.3, depthWrite: false })];
  }, [list]);
  useEffect(() => () => labelMat.map?.dispose(), [labelMat]);
  const mat = useMemo(() => (p: PassivePlace, m: Matrix4) => partMatrix(p, w, m), [w]);
  return (
    <>
      <Batch items={list} geometry={body} material={bodyMat} matrix={mat} />
      <Batch items={list} geometry={pins} material={pinMat} matrix={mat} far={DETAIL} />
      <Batch items={list} geometry={top} material={labelMat} matrix={mat} renderOrder={2} far={DETAIL} />
    </>
  );
}

// ---------------------------------------------------------------- DIP anahtarlar (hesap makinesi)

const DIP_RENGI: Record<string, string> = { SW_DIP_8: "#2459c8", SW_DIP_2: "#c7302b" };

interface Surgu {
  p: PassivePlace;
  /** anahtarın numarası ve yerel x konumu (k. bacağın üstü) */
  no: number;
  lx: number;
}

function DipSwitches({ list, w }: { list: PassivePlace[]; w: W }) {
  const groups = useMemo(() => byPart(list), [list]);
  // her parça türü: gövde ve üst yüz (oluklar, numaralar, "ON")
  const parts = useOwned(
    () => groups.map(([part, ps]) => {
      const p0 = ps[0];
      const pw = p0.vertical ? p0.h : p0.w;
      const pd = p0.vertical ? p0.w : p0.h;
      const xs = localPins(p0).filter((q) => q.num <= p0.pins.length / 2).sort((a, b) => a.num - b.num).map((q) => q.lx);
      const tex = dipSwitchTexture(xs, pw - 0.3, pd - 0.5);
      const body = dipSwitchBody(pw, pd);
      const top = topPlane(pw - 0.3, pd - 0.5, DIP_TOP + 0.01);
      const bodyMat = std({ color: DIP_RENGI[part] ?? "#2459c8", roughness: 0.42, metalness: 0.05 });
      const topMat = new MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.2, depthWrite: false });
      return { body, top, bodyMat, topMat, dispose: () => [body, top, bodyMat, topMat, tex].forEach((x) => x.dispose()) };
    }),
    [groups],
  );
  const [knob, knobMat, legMat] = useOwned(() => [dipSwitchKnob(), std({ color: "#f3f1ea", roughness: 0.5 }), tinned()], []);
  const legs = useOwned(() => groups.map(([, ps]) => flatPins(localPins(ps[0]).map((q) => q.lx), 0.8, 0.55, 0.25, localPins(ps[0]).map((q) => q.lz))), [groups]);
  const mat = useMemo(() => (p: PassivePlace, m: Matrix4) => partMatrix(p, w, m), [w]);
  const surguler = useMemo<Surgu[]>(
    () => list.flatMap((p) => localPins(p).filter((q) => q.num <= p.pins.length / 2).sort((a, b) => a.num - b.num).map((q) => ({ p, no: q.num, lx: q.lx }))),
    [list],
  );
  const knobRef = useRef<InstancedMesh>(null);
  const version = useRef(-1);
  /** anahtarların konumu canlı: açık (ON) sürgü "ON" yazısına doğru */
  const yerlestir = (k: InstancedMesh) => {
    const durum = new Map(list.map((p) => [p, dipAnahtarlari(p, (n) => level(liveNets.values, n))]));
    surguler.forEach((s, i) => {
      const a = durum.get(s.p)?.[s.no - 1];
      k.setMatrixAt(i, partMatrix(s.p, w, tmpM, tmpM2.makeTranslation(s.lx, 0, a?.acik ? -DIP_TRAVEL : DIP_TRAVEL)));
    });
    k.instanceMatrix.needsUpdate = true;
  };
  useLayoutEffect(() => {
    const k = knobRef.current;
    if (!k) return;
    yerlestir(k);
    k.computeBoundingSphere();
    version.current = -1;
  }, [surguler, w]);
  useFrame(() => {
    const k = knobRef.current;
    if (!k || version.current === liveNets.version) return;
    version.current = liveNets.version;
    yerlestir(k);
  });
  useEffect(() => () => imlec(false), []);
  const surguBilgisi = (s: Surgu) => {
    const a = dipAnahtarlari(s.p, (n) => level(liveNets.values, n))[s.no - 1];
    return a ? `${s.no}. anahtar · ${boardModel().board.netName(a.net)} = ${a.acik ? "1 (ON)" : "0 (OFF)"} · tıkla: değiştir` : "";
  };
  return (
    <>
      {groups.map(([part, ps], i) => (
        <group key={part}>
          <Batch items={ps} geometry={parts[i].body} material={parts[i].bodyMat} matrix={mat} />
          <Batch items={ps} geometry={parts[i].top} material={parts[i].topMat} matrix={mat} renderOrder={2} />
          <Batch items={ps} geometry={legs[i]} material={legMat} matrix={mat} far={DETAIL} />
        </group>
      ))}
      <instancedMesh
        ref={knobRef}
        args={[knob, knobMat, surguler.length]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          const s = surguler[e.instanceId ?? -1];
          if (!s) return;
          e.stopPropagation();
          const a = dipAnahtarlari(s.p, (n) => level(liveNets.values, n))[s.no - 1];
          if (a) useHesap.getState().anahtarNet(a.net);
          useKart.setState((st) => (st.hover ? { hover: { ...st.hover, ek: surguBilgisi(s) } } : {}));
        }}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          const s = surguler[e.instanceId ?? -1];
          if (s) useKart.setState({ hover: { ref: s.p.ref, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, ek: surguBilgisi(s) } });
        }}
        onPointerOver={() => imlec(true)}
        onPointerOut={() => {
          imlec(false);
          useKart.setState({ hover: null });
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------- 7 segment göstergeler (hesap makinesi)

interface Segment {
  p: PassivePlace;
  seg: SegmentAdi;
  /** segmenti yakan net (sürücünün çıkışı; direnç dizisinin öbür ucu) */
  net: number;
}

/** Rakamın yüzdeki yeri: gövdenin ortasından kaydırılmış ve eğik (üstü sağa yatık) */
const RAKAM = new Matrix4().makeTranslation(RAKAM_ORTA.x, 0, RAKAM_ORTA.z).multiply(new Matrix4().set(1, 0, -RAKAM_ORTA.egim, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));
const SEG_YANIK = new Color("#ff2d1f");
const SEG_SONUK = new Color("#33201f");
const HALE_YANIK = new Color("#ff2a14").multiplyScalar(0.55);
const HALE_SONUK = new Color("#000000");

function segmentMatrix(s: Segment, w: W, out: Matrix4, hale = false): Matrix4 {
  const y = SEGMENT_YERI[s.seg];
  tmpM2.copy(RAKAM).multiply(new Matrix4().makeTranslation(y.x, hale ? 0.05 : 0, y.z));
  if (hale) {
    const L = s.seg === "dp" ? 1.3 : y.dikey ? SEGMENT_BOY.dikey : SEGMENT_BOY.yatay;
    const t = s.seg === "dp" ? 1.3 : SEGMENT_BOY.kalinlik;
    tmpM2.multiply(new Matrix4().makeScale(y.dikey ? t + 3.2 : L + 3.2, 1, y.dikey ? L + 3.2 : t + 3.2));
  }
  return partMatrix(s.p, w, out, tmpM2);
}

/** Canlı renkli örnekler: her net değişiminde renk yeniden hesaplanır */
function LiveBatch<T>({ items, geometry, material, matrix, renk, renderOrder }: {
  items: T[]; geometry: BufferGeometry; material: Material; matrix: (it: T, m: Matrix4) => Matrix4; renk: (it: T, v: Uint8Array | null) => Color; renderOrder?: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  const version = useRef(-1);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    items.forEach((it, i) => {
      m.setMatrixAt(i, matrix(it, tmpM));
      m.setColorAt(i, renk(it, liveNets.values));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    version.current = -1;
  }, [items, matrix, renk]);
  useFrame(() => {
    const m = ref.current;
    if (!m || version.current === liveNets.version) return;
    version.current = liveNets.version;
    items.forEach((it, i) => m.setColorAt(i, renk(it, liveNets.values)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} raycast={noRaycast} renderOrder={renderOrder} />;
}

function Displays({ list, w }: { list: PassivePlace[]; w: W }) {
  const segs = useMemo<Segment[]>(() => {
    const ends = netEnds();
    return list.flatMap((p) => segmentNetleri(p, ends, findPart).map((s) => ({ p, seg: s.seg, net: s.net })));
  }, [list]);
  const yatay = useMemo(() => segs.filter((s) => s.seg !== "dp" && !SEGMENT_YERI[s.seg].dikey), [segs]);
  const dikey = useMemo(() => segs.filter((s) => SEGMENT_YERI[s.seg].dikey), [segs]);
  const nokta = useMemo(() => segs.filter((s) => s.seg === "dp"), [segs]);
  const p0 = list[0];
  const [body, hBar, vBar, dot, glowPlane, bodyMat, segMat, glow] = useOwned(() => {
    const g = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    g.translate(0, SEG_TOP + 0.06, 0);
    return [
      displayBody(p0.vertical ? p0.h : p0.w, p0.vertical ? p0.w : p0.h), segmentBar(false), segmentBar(true), segmentDot(), g,
      std({ vertexColors: true, roughness: 0.55, metalness: 0.05 }), new MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), glowTexture(),
    ];
  }, [list]);
  const haleMat = useOwned(() => [new MeshBasicMaterial({ map: glow, color: "#ffffff", blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false })], [glow])[0];
  const mat = useMemo(() => (p: PassivePlace, m: Matrix4) => partMatrix(p, w, m), [w]);
  const segM = useMemo(() => (s: Segment, m: Matrix4) => segmentMatrix(s, w, m), [w]);
  const haleM = useMemo(() => (s: Segment, m: Matrix4) => segmentMatrix(s, w, m, true), [w]);
  const yanik = (s: Segment, v: Uint8Array | null) => s.net >= 0 && level(v, s.net) === 1;
  const segRenk = useMemo(() => (s: Segment, v: Uint8Array | null) => (yanik(s, v) ? SEG_YANIK : SEG_SONUK), []);
  const haleRenk = useMemo(() => (s: Segment, v: Uint8Array | null) => (yanik(s, v) ? HALE_YANIK : HALE_SONUK), []);
  return (
    <>
      <Batch items={list} geometry={body} material={bodyMat} matrix={mat} />
      <LiveBatch items={yatay} geometry={hBar} material={segMat} matrix={segM} renk={segRenk} renderOrder={2} />
      <LiveBatch items={dikey} geometry={vBar} material={segMat} matrix={segM} renk={segRenk} renderOrder={2} />
      <LiveBatch items={nokta} geometry={dot} material={segMat} matrix={segM} renk={segRenk} renderOrder={2} />
      <LiveBatch items={segs} geometry={glowPlane} material={haleMat} matrix={haleM} renk={haleRenk} renderOrder={4} />
    </>
  );
}

// ---------------------------------------------------------------- DIP-16 direnç dizileri (hesap makinesi)

function DipArrays({ list, w }: { list: PassivePlace[]; w: W }) {
  const p0 = list[0];
  const pw = p0.vertical ? p0.h : p0.w;
  const groups = useMemo(() => byPart(list), [list]);
  const [body, legs, top, bodyMat, legMat] = useOwned(() => {
    const lp = localPins(p0);
    return [
      dipArrayBody(pw - 1.2, 6.2), flatPins(lp.map((q) => q.lx), 1.6, 0.55, 0.3, lp.map((q) => q.lz)), topPlane(pw - 2.4, 4.4, DIPDIZI_TOP + 0.01),
      std({ color: "#17191c", roughness: 0.75, metalness: 0.05 }), tinned(),
    ];
  }, [list]);
  const labels = useOwned(
    () => groups.map(([part]) => {
      const ohm = /^RN_(\d+)/.exec(part)?.[1] ?? "";
      const kod = ohm.length >= 3 ? `${ohm.slice(0, 2)}${ohm.length - 2}` : ohm;
      const t = labelTexture(["4116R", kod], { w: 512, h: 112, color: "#e6e9ee", dot: "sol-alt", font: 44 });
      return new MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.3, depthWrite: false });
    }),
    [groups],
  );
  useEffect(() => () => labels.forEach((m) => m.map?.dispose()), [labels]);
  const mat = useMemo(() => (p: PassivePlace, m: Matrix4) => partMatrix(p, w, m), [w]);
  return (
    <>
      <Batch items={list} geometry={body} material={bodyMat} matrix={mat} />
      <Batch items={list} geometry={legs} material={legMat} matrix={mat} far={DETAIL} />
      {groups.map(([part, ps], i) => <Batch key={part} items={ps} geometry={top} material={labels[i]} matrix={mat} renderOrder={2} far={DETAIL * 2} />)}
    </>
  );
}

// ---------------------------------------------------------------- konnektörler, modüller

const isHeader = (p: PassivePlace) => /^BACKPLANE|PinHeader/.test(p.part) || (p.kind === "konnektor" && p.edge === true);
const isSocket = (p: PassivePlace) => /CH340|SOCKET/i.test(p.part);

function Connectors({ list, w }: { list: PassivePlace[]; w: W }) {
  const headers = useMemo(() => list.filter(isHeader), [list]);
  const sockets = useMemo(() => list.filter((p) => !isHeader(p) && isSocket(p)), [list]);
  const ps2 = useMemo(() => list.filter((p) => /PS2/.test(p.part)), [list]);
  const vga = useMemo(() => list.filter((p) => /VGA/.test(p.part)), [list]);
  const rest = useMemo(() => list.filter((p) => !headers.includes(p) && !sockets.includes(p) && !ps2.includes(p) && !vga.includes(p)), [list, headers, sockets, ps2, vga]);
  const dims = (p?: PassivePlace) => (p ? { w: p.vertical ? p.h : p.w, d: p.vertical ? p.w : p.h } : { w: 1, d: 1 });
  const hp = useMemo(() => headers.flatMap((p) => localPins(p).map((q) => ({ p, q }))), [headers]);
  const [hBase, hPin, sBody, ps2G, vgaG, black, gold, colored] = useOwned(() => {
    const s = dims(sockets[0]);
    const k = dims(ps2[0]);
    const g = dims(vga[0]);
    const cols = headers[0] ? Math.ceil(headers[0].pins.length / 2) : 1;
    return [
      headerBase(cols, 2), headerPin(headers[0]?.height ?? 8.5), boxAt(Math.max(1, s.w - 0.6), sockets[0]?.height ?? 8.5, 2.54),
      ps2Body(Math.min(14, k.w - 0.5), Math.min(12, k.d)), vgaBody(Math.min(28, g.w), Math.min(11, g.d)),
      std({ color: "#18191c", roughness: 0.55 }), std({ color: "#d9b44a", metalness: 0.55, roughness: 0.28 }), std({ vertexColors: true, roughness: 0.45, metalness: 0.2 }),
    ];
  }, [headers, sockets, ps2, vga]);
  const mat = useMemo(() => (p: PassivePlace, m: Matrix4) => partMatrix(p, w, m), [w]);
  const pinM = useMemo(() => (it: { p: PassivePlace; q: { lx: number; lz: number } }, m: Matrix4) => partMatrix(it.p, w, m, tmpM2.makeTranslation(it.q.lx, 0, it.q.lz)), [w]);
  const restM = useMemo(() => (p: PassivePlace, m: Matrix4) => partMatrix(p, w, m, tmpM2.makeScale(dims(p).w * 0.95, Math.max(2, p.height * 0.4), dims(p).d * 0.9).premultiply(new Matrix4().makeTranslation(0, Math.max(2, p.height * 0.4) / 2, 0))), [w]);
  const unit = useOwned(() => [new BoxGeometry(1, 1, 1)], [])[0];
  return (
    <>
      <Batch items={headers} geometry={hBase} material={black} matrix={mat} />
      <Batch items={hp} geometry={hPin} material={gold} matrix={pinM} />
      <Batch items={sockets} geometry={sBody} material={black} matrix={mat} />
      <Batch items={ps2} geometry={ps2G} material={colored} matrix={mat} />
      <Batch items={vga} geometry={vgaG} material={colored} matrix={mat} />
      <Batch items={rest} geometry={unit} material={black} matrix={restM} />
    </>
  );
}

function Modules({ list, w }: { list: PassivePlace[]; w: W }) {
  const p0 = list[0];
  const [g, m] = useOwned(() => [moduleBody(p0.vertical ? p0.h : p0.w, p0.vertical ? p0.w : p0.h), std({ vertexColors: true, roughness: 0.5 })], [list]);
  const mat = useMemo(() => (p: PassivePlace, mm: Matrix4) => partMatrix(p, w, mm), [w]);
  return <Batch items={list} geometry={g} material={m} matrix={mat} />;
}

// ---------------------------------------------------------------- pinler: canlı renkli lehim noktaları, konnektör uçları

interface PinItem {
  p: PassivePlace;
  pin: PassivePlace["pins"][number];
  lx: number;
  lz: number;
  /** rengin okunduğu net: yalnız pasiflere bağlı netlerde direncin öbür ucu (etkinNet) */
  net: number;
}

/** Pinlerin canlı rengi: kartın üstünde lehim noktası, konnektörlerde pinin ucu. Tıklayınca net seçilir. */
function Pads({ all, w }: { all: PassivePlace[]; w: W }) {
  const flat = useMemo(() => {
    const ends = netEnds();
    return all.flatMap((p) => {
      const lp = localPins(p);
      return p.pins.map((pin, i) => ({ p, pin, lx: lp[i].lx, lz: lp[i].lz, net: etkinNet(ends, findPart, pin.net) }));
    });
  }, [all]);
  const byCard = (list: PinItem[]) => {
    const m = new Map<string, PinItem[]>();
    for (const x of list) (m.get(x.p.card) ?? m.set(x.p.card, []).get(x.p.card)!).push(x);
    return [...m.entries()];
  };
  const tip = (x: PinItem) => isHeader(x.p) || isSocket(x.p);
  const pads = useMemo(() => byCard(flat.filter((x) => !tip(x))), [flat]);
  const tips = useMemo(() => byCard(flat.filter(tip)), [flat]);
  const [padG, tipG, padMat] = useOwned(() => {
    const pg = new CircleGeometry(0.85, 8);
    pg.rotateX(-Math.PI / 2);
    pg.translate(0, 0.03, 0);
    const tg = new BoxGeometry(0.72, 1.3, 0.72);
    tg.translate(0, -0.6, 0);
    return [pg, tg, std({ color: "#ffffff", roughness: 0.35, metalness: 0.4 })];
  }, []);
  const padM = useMemo(() => (x: PinItem, m: Matrix4) => partMatrix(x.p, w, m, tmpM2.makeTranslation(x.lx, 0, x.lz)), [w]);
  const tipM = useMemo(() => (x: PinItem, m: Matrix4) => partMatrix(x.p, w, m, tmpM2.makeTranslation(x.lx, x.p.height + 0.6, x.lz)), [w]);
  return (
    <>
      {pads.map(([card, list]) => <PinChunk key={`p${card}`} list={list} geometry={padG} material={padMat} matrix={padM} far={DETAIL} />)}
      {tips.map(([card, list]) => <PinChunk key={`t${card}`} list={list} geometry={tipG} material={padMat} matrix={tipM} />)}
    </>
  );
}

function PinChunk({ list, geometry, material, matrix, far }: {
  list: PinItem[]; geometry: BufferGeometry; material: Material; matrix: (x: PinItem, m: Matrix4) => Matrix4; far?: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  const version = useRef(-1);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    list.forEach((x, i) => {
      m.setMatrixAt(i, matrix(x, tmpM));
      m.setColorAt(i, PIN_COLORS[0]);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    version.current = -1;
  }, [list, matrix]);
  useFrame(({ camera }) => {
    const m = ref.current;
    if (!m) return;
    if (far && m.boundingSphere) {
      const vis = camera.position.distanceTo(m.boundingSphere.center) - m.boundingSphere.radius < far;
      if (m.visible !== vis) {
        m.visible = vis;
        version.current = -1;
      }
    }
    if (!m.visible || version.current === liveNets.version || !liveNets.values) return;
    version.current = liveNets.version;
    const v = liveNets.values;
    list.forEach((x, i) => m.setColorAt(i, PIN_COLORS[level(v, x.net)] ?? PIN_COLORS[3]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, list.length]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        const x = list[e.instanceId ?? -1];
        if (x && x.pin.net > 1) useKart.getState().selectNet(x.pin.net);
      }}
    />
  );
}

// ---------------------------------------------------------------- seçim: görünmez kutular, çerçeve

/** Elemanın tıklanan / çerçevelenen kutusu (dünya): x, z ortası, boyutları ve yüksekliği */
function hitBox(p: PassivePlace, w: W) {
  const [x, z] = w(p.x + p.w / 2, p.y + p.h / 2);
  const h = Math.max(2.5, p.kind === "led" ? LED_TOP : p.kind === "kondansator" ? 6.5 : p.height) * S;
  return { x, z, sx: p.w * S, sz: p.h * S, h };
}

function HitBoxes({ all, w }: { all: PassivePlace[]; w: W }) {
  const ref = useRef<InstancedMesh>(null);
  const [geo, mat] = useOwned(() => [new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ visible: false })], []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    all.forEach((p, i) => {
      const b = hitBox(p, w);
      tmpM.compose(tmpP.set(b.x, b.h / 2, b.z), tmpQ.identity(), new Vector3(b.sx, b.h, b.sz));
      m.setMatrixAt(i, tmpM);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [all, w]);
  return (
    <instancedMesh
      ref={ref}
      args={[geo, mat, all.length]}
      onClick={(e) => {
        e.stopPropagation();
        const p = all[e.instanceId ?? -1];
        if (p) useKart.getState().selectChip(p.ref);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        const p = all[e.instanceId ?? -1];
        if (p) useKart.setState({ hover: { ref: p.ref, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY } });
      }}
      onPointerOut={() => useKart.setState({ hover: null })}
    />
  );
}

function Outline({ refName, color, opacity, w }: { refName: string | null; color: string; opacity: number; w: W }) {
  const [geo] = useOwned(() => [new EdgesGeometry(new BoxGeometry(1, 1, 1))], []);
  const line = useRef<LineSegments>(null);
  const p = refName ? findPart(refName)?.passive : null;
  if (!p) return null;
  const b = hitBox(p, w);
  const pad = 0.12;
  return (
    <lineSegments ref={line} geometry={geo} position={[b.x, b.h / 2 + 0.01, b.z]} scale={[b.sx + pad, b.h + 0.04, b.sz + pad]} raycast={noRaycast} renderOrder={6}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthTest={false} />
    </lineSegments>
  );
}

// ---------------------------------------------------------------- hepsi

const ORDER: PassivePlace["kind"][] = [
  "direnc", "kondansator", "elektrolitik", "led", "dizi", "osilator", "buton", "anahtar", "pot", "konnektor", "modul", "dip", "gosterge", "dipdizi",
];

export function Passives3D({ children }: { children?: ReactNode }) {
  const { lay, w } = useWorld();
  const all = lay.passives;
  const kinds = useMemo(() => {
    const m = new Map<PassivePlace["kind"], PassivePlace[]>();
    for (const p of all) (m.get(p.kind) ?? m.set(p.kind, []).get(p.kind)!).push(p);
    return m;
  }, [all]);
  const selected = useKart((s) => s.chip);
  const hover = useKart((s) => s.hover?.ref ?? null);
  const list = (k: PassivePlace["kind"]) => kinds.get(k) ?? [];
  const C: Record<PassivePlace["kind"], (props: { list: PassivePlace[]; w: W }) => JSX.Element> = {
    direnc: Resistors, kondansator: DiscCaps, elektrolitik: Electrolytics, led: Leds, dizi: Sips, osilator: Oscillators,
    buton: Buttons, anahtar: Switches, pot: Trimpots, konnektor: Connectors, modul: Modules,
    dip: DipSwitches, gosterge: Displays, dipdizi: DipArrays,
  };
  return (
    <group>
      {ORDER.map((k) => {
        const l = list(k);
        const Comp = C[k];
        return l.length ? <Comp key={k} list={l} w={w} /> : null;
      })}
      <Pads all={all} w={w} />
      <HitBoxes all={all} w={w} />
      {hover !== selected && <Outline refName={hover} color="#9fb7d6" opacity={0.55} w={w} />}
      <Outline refName={selected} color="#8fd0ff" opacity={1} w={w} />
      {children}
    </group>
  );
}

/** Bant düzeni dışarıdan da okunur (testler) */
export const BAND_LAYOUT = BAND_SLOTS;
