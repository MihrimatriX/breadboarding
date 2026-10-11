// CPU16 bilgisayarının 3D hali: kartlar, entegreler, pinler ve arka panel, canlı sinyallerle.
// Bir çipe tıklayınca üstünde çipin "kalıbı" (die) açılır: kapılar ve teller canlı; kapıya
// tıklayınca alt panelde o kapının transistörleri görünür.

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, InstancedMesh, LineBasicMaterial, LineSegments, Object3D, SRGBColorSpace, Vector3,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { chipInside, type ChipInside } from "../../cpu16/board/inside";
import type { ChipPlace } from "../../cpu16/board/layout";
import { BACKPLANE } from "../../cpu16/board/passives";
import type { Gate } from "../../cpu16/chips/logic";
import { LEVEL_COLOR } from "./levels";
import { boardLayoutData, boardModel, liveNets, useKart } from "./store";

/** 1 dünya birimi = 10 mm */
const S = 0.1;
const BODY_H = 0.32;
const BODY_Y = 0.05;
const DIE_Y = 2.2;

const levelColors = LEVEL_COLOR.map((c) => new Color(c));
const PIN_COLORS = [new Color("#56606c"), new Color("#ff2a55"), new Color("#9d8cff"), new Color("#e6e600")];
const tmpC = new Color();
const DIE_LOW = new Color("#5d7390");
const tmpO = new Object3D();

function useLayoutWorld() {
  const lay = boardLayoutData();
  const cx = lay.width / 2;
  const cz = lay.height / 2;
  return useMemo(() => ({ lay, w: (x: number, y: number): [number, number] => [(x - cx) * S, (y - cz) * S] }), [lay, cx, cz]);
}

// ---------------------------------------------------------------- yazı atlası

interface TextItem {
  text: string;
  sub?: string;
  /** dünya koordinatında dikdörtgen (x, z, genişlik, derinlik) ve yükseklik */
  x: number;
  z: number;
  w: number;
  d: number;
  y: number;
  color: string;
  align?: "left" | "center";
}

/** Birçok yazıyı tek dokuya çizer ve hepsini tek bir düz yüzey ağıyla gösterir */
function TextQuads({ items, cellW = 256, cellH = 80, font = 30 }: { items: TextItem[]; cellW?: number; cellH?: number; font?: number }) {
  const { geometry, texture } = useMemo(() => {
    const cols = Math.floor(2048 / cellW);
    const rows = Math.ceil(items.length / cols);
    const canvas = document.createElement("canvas");
    canvas.width = cols * cellW;
    canvas.height = Math.max(1, rows * cellH);
    const ctx = canvas.getContext("2d")!;
    ctx.textBaseline = "middle";
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    items.forEach((it, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const ox = col * cellW;
      const oy = row * cellH;
      ctx.fillStyle = it.color;
      ctx.textAlign = it.align === "left" ? "left" : "center";
      const tx = it.align === "left" ? ox + 6 : ox + cellW / 2;
      if (it.sub) {
        ctx.font = `600 ${font}px "IBM Plex Mono", ui-monospace, monospace`;
        ctx.fillText(it.text, tx, oy + cellH * 0.32, cellW - 8);
        ctx.font = `${Math.round(font * 0.72)}px "IBM Plex Mono", ui-monospace, monospace`;
        ctx.globalAlpha = 0.75;
        ctx.fillText(it.sub, tx, oy + cellH * 0.72, cellW - 8);
        ctx.globalAlpha = 1;
      } else {
        ctx.font = `600 ${font}px "IBM Plex Sans", system-ui, sans-serif`;
        ctx.fillText(it.text, tx, oy + cellH / 2, cellW - 8);
      }
      const u0 = ox / canvas.width;
      const u1 = (ox + cellW) / canvas.width;
      const v0 = 1 - oy / canvas.height;
      const v1 = 1 - (oy + cellH) / canvas.height;
      const b = pos.length / 3;
      pos.push(it.x, it.y, it.z, it.x + it.w, it.y, it.z, it.x + it.w, it.y, it.z + it.d, it.x, it.y, it.z + it.d);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return { geometry: g, texture: t };
  }, [items, cellW, cellH, font]);
  useEffect(() => () => { geometry.dispose(); texture.dispose(); }, [geometry, texture]);
  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshBasicMaterial map={texture} transparent depthWrite={false} side={DoubleSide} />
    </mesh>
  );
}

// ---------------------------------------------------------------- kartlar ve arka panel

function Cards() {
  const { lay, w } = useLayoutWorld();
  const outline = useMemo(() => {
    const pos: number[] = [];
    for (const b of lay.blocks) {
      const [x0, z0] = w(b.x, b.y);
      const [x1, z1] = w(b.x + b.w, b.y + b.h);
      const y = 0.002;
      pos.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    return g;
  }, [lay, w]);
  const titles = useMemo<TextItem[]>(() => [
    ...lay.blocks.map((b) => {
      const [x, z] = w(b.x + 1, b.y + 0.5);
      return { text: b.name, x, z, w: Math.min(b.w - 2, 60) * S, d: 5 * S, y: 0.003, color: "#d8e6dc", align: "left" as const };
    }),
    ...lay.cards.map((c) => {
      const [x, z] = w(c.x + 6, c.y + 2);
      return { text: c.title, x, z, w: 90 * S, d: 7 * S, y: 0.003, color: "#ffffff", align: "left" as const };
    }),
  ], [lay, w]);
  const maxH = Math.max(...lay.cards.map((c) => c.h));
  const [bx, bz] = w(lay.width / 2, maxH + 13);
  return (
    <group>
      {lay.cards.map((c) => {
        const [x, z] = w(c.x + c.w / 2, c.y + c.h / 2);
        const [kx, kz] = w(c.connectorX, c.h - 3);
        return (
          <group key={c.name}>
            <mesh position={[x, -0.08, z]} raycast={() => null}>
              <boxGeometry args={[c.w * S, 0.16, c.h * S]} />
              <meshStandardMaterial color="#0f3d2c" roughness={0.55} metalness={0.1} />
            </mesh>
            <mesh position={[kx, 0.12, kz]} raycast={() => null}>
              <boxGeometry args={[82 * S, 0.24, 5 * S]} />
              <meshStandardMaterial color="#0b0b0d" roughness={0.6} />
            </mesh>
          </group>
        );
      })}
      <lineSegments geometry={outline} raycast={() => null}>
        <lineBasicMaterial color="#cfe3d6" transparent opacity={0.35} />
      </lineSegments>
      <TextQuads items={titles} cellW={512} cellH={48} font={30} />
      <mesh position={[bx, -0.08, bz]} raycast={() => null}>
        <boxGeometry args={[lay.width * S, 0.16, 20 * S]} />
        <meshStandardMaterial color="#13261d" roughness={0.6} />
      </mesh>
      <BackplaneTraces />
      <Leds />
    </group>
  );
}

/** Arka paneldeki bakır yollar: her biri bir arka panel sinyali, canlı renkte */
function BackplaneTraces() {
  const { lay, w } = useLayoutWorld();
  const { board } = boardModel();
  const signals = useMemo(() => [...new Set(Object.values(BACKPLANE))].filter((n) => n !== "GND" && n !== "VCC" && board.has(n)), [board]);
  const ref = useRef<LineSegments>(null);
  const version = useRef(-1);
  const geo = useMemo(() => {
    const maxH = Math.max(...lay.cards.map((c) => c.h));
    const x0 = lay.cards[0].connectorX - 40;
    const x1 = lay.cards[lay.cards.length - 1].connectorX + 40;
    const pos: number[] = [];
    signals.forEach((_, i) => {
      const y = maxH + 4.5 + (i * 17) / signals.length;
      const [a, z] = w(x0, y);
      const [b] = w(x1, y);
      pos.push(a, 0.004, z, b, 0.004, z);
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("color", new BufferAttribute(new Float32Array(pos.length), 3));
    return g;
  }, [lay, w, signals]);
  const nets = useMemo(() => signals.map((s) => board.n(s)), [signals, board]);
  useFrame(() => {
    if (version.current === liveNets.version || !ref.current) return;
    version.current = liveNets.version;
    const col = geo.getAttribute("color") as BufferAttribute;
    nets.forEach((n, i) => {
      const lv = liveNets.values?.[n] ?? 3;
      const c = lv === 1 ? levelColors[1] : lv === 0 ? tmpC.set("#a07a3a") : levelColors[lv];
      col.setXYZ(2 * i, c.r, c.g, c.b);
      col.setXYZ(2 * i + 1, c.r, c.g, c.b);
    });
    col.needsUpdate = true;
  });
  return (
    <lineSegments ref={ref} geometry={geo} raycast={() => null}>
      <lineBasicMaterial vertexColors />
    </lineSegments>
  );
}

function Leds() {
  const { lay, w } = useLayoutWorld();
  const { board } = boardModel();
  const card = lay.cards[0];
  const leds = useMemo(() => [
    { name: "HALTED", net: board.n("HALTED"), color: "#4dff6a", pos: w(card.x + 14, card.h - 4) },
    { name: "FAULT", net: board.n("FAULT"), color: "#ff3b3b", pos: w(card.x + 26, card.h - 4) },
  ], [board, card, w]);
  const mats = useRef<({ emissiveIntensity: number } | null)[]>([]);
  useFrame(() => {
    leds.forEach((l, i) => {
      const m = mats.current[i];
      if (m) m.emissiveIntensity = liveNets.values?.[l.net] === 1 ? 2.2 : 0.05;
    });
  });
  const labels = useMemo<TextItem[]>(() => leds.map((l) => ({
    text: l.name, x: l.pos[0] - 0.5, z: l.pos[1] - 1.1, w: 1, d: 0.35, y: 0.003, color: "#d8e6dc",
  })), [leds]);
  return (
    <group>
      {leds.map((l, i) => (
        <mesh key={l.name} position={[l.pos[0], 0.15, l.pos[1]]} raycast={() => null}>
          <sphereGeometry args={[0.15, 16, 12]} />
          <meshStandardMaterial ref={(m) => (mats.current[i] = m)} color={l.color} emissive={l.color} emissiveIntensity={0.05} transparent opacity={0.9} />
        </mesh>
      ))}
      <TextQuads items={labels} cellW={256} cellH={64} font={34} />
    </group>
  );
}

// ---------------------------------------------------------------- entegreler

function Chips() {
  const { lay, w } = useLayoutWorld();
  const chips = lay.chips;
  const body = useRef<InstancedMesh>(null);
  const pins = useRef<InstancedMesh>(null);
  const pads = useRef<InstancedMesh>(null);
  const caps = useRef<InstancedMesh>(null);
  const selected = useKart((s) => s.chip);
  const hover = useKart((s) => s.hover?.ref ?? null);
  const flatPins = useMemo(() => chips.flatMap((c) => c.pins.map((p) => ({ chip: c, pin: p }))), [chips]);
  const version = useRef(-1);

  useLayoutEffect(() => {
    chips.forEach((c, i) => {
      const [x, z] = w(c.x + c.w / 2, c.y + c.h / 2);
      tmpO.position.set(x, BODY_Y + BODY_H / 2, z);
      tmpO.scale.set(c.w * S, BODY_H, c.h * S);
      tmpO.updateMatrix();
      body.current!.setMatrixAt(i, tmpO.matrix);
      const [cx, cz] = w(c.x + c.w + 2.2, c.y + c.h / 2);
      tmpO.position.set(cx, 0.12, cz);
      tmpO.scale.set(0.12, 0.24, 0.5);
      tmpO.updateMatrix();
      caps.current!.setMatrixAt(i, tmpO.matrix);
    });
    flatPins.forEach(({ pin }, i) => {
      const [x, z] = w(pin.x, pin.y);
      tmpO.position.set(x, 0.12, z);
      tmpO.scale.set(0.06, 0.24, 0.06);
      tmpO.updateMatrix();
      pins.current!.setMatrixAt(i, tmpO.matrix);
      tmpO.position.set(x, 0.004, z);
      tmpO.scale.set(0.17, 0.008, 0.17);
      tmpO.updateMatrix();
      pads.current!.setMatrixAt(i, tmpO.matrix);
      pins.current!.setColorAt(i, PIN_COLORS[0]);
      pads.current!.setColorAt(i, PIN_COLORS[0]);
    });
    for (const m of [body.current!, pins.current!, pads.current!, caps.current!]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [chips, flatPins, w]);

  useLayoutEffect(() => {
    chips.forEach((c, i) => body.current!.setColorAt(i, tmpC.set(c.ref === selected ? "#3a4a66" : c.ref === hover ? "#2a313b" : "#141619")));
    body.current!.instanceColor!.needsUpdate = true;
  }, [chips, selected, hover]);

  useFrame(() => {
    if (version.current === liveNets.version || !liveNets.values) return;
    version.current = liveNets.version;
    const v = liveNets.values;
    flatPins.forEach(({ pin }, i) => {
      const lv = pin.net < 0 ? 2 : pin.net <= 1 ? pin.net : v[pin.net];
      pins.current!.setColorAt(i, PIN_COLORS[lv] ?? PIN_COLORS[3]);
      pads.current!.setColorAt(i, PIN_COLORS[lv] ?? PIN_COLORS[3]);
    });
    pins.current!.instanceColor!.needsUpdate = true;
    pads.current!.instanceColor!.needsUpdate = true;
  });

  const labels = useMemo<TextItem[]>(() => chips.map((c) => {
    const [x, z] = w(c.x + c.w * 0.06, c.y + c.h * 0.12);
    return { text: c.ref, sub: c.part, x, z, w: c.w * S * 0.88, d: c.h * S * 0.76, y: BODY_Y + BODY_H + 0.002, color: "#e8ebef" };
  }), [chips, w]);

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const c = chips[e.instanceId ?? -1];
    if (c) useKart.setState({ hover: { ref: c.ref, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY } });
  };
  return (
    <group>
      <instancedMesh
        ref={body}
        args={[undefined, undefined, chips.length]}
        onPointerMove={onMove}
        onPointerOut={() => useKart.setState({ hover: null })}
        onClick={(e) => {
          e.stopPropagation();
          const c = chips[e.instanceId ?? -1];
          if (c) useKart.getState().selectChip(c.ref);
        }}
      >
        <boxGeometry />
        <meshStandardMaterial color="#ffffff" roughness={0.75} metalness={0.05} />
      </instancedMesh>
      <TextQuads items={labels} />
      <instancedMesh
        ref={pins}
        args={[undefined, undefined, flatPins.length]}
        onClick={(e) => {
          e.stopPropagation();
          const p = flatPins[e.instanceId ?? -1];
          if (p && p.pin.net > 1) useKart.getState().selectNet(p.pin.net);
        }}
      >
        <boxGeometry />
        <meshStandardMaterial color="#ffffff" roughness={0.35} metalness={0.6} />
      </instancedMesh>
      <instancedMesh ref={pads} args={[undefined, undefined, flatPins.length]} raycast={() => null}>
        <boxGeometry />
        <meshStandardMaterial color="#ffffff" roughness={0.4} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, undefined, chips.length]} raycast={() => null}>
        <boxGeometry />
        <meshStandardMaterial color="#c98a3a" roughness={0.6} />
      </instancedMesh>
    </group>
  );
}

// ---------------------------------------------------------------- seçili net: pinleri birleştiren çizgiler

function NetLines() {
  const net = useKart((s) => s.net);
  const { lay, w } = useLayoutWorld();
  const ref = useRef<LineSegments>(null);
  const version = useRef(-1);
  const geo = useMemo(() => {
    if (net === null) return null;
    const pts = lay.chips.flatMap((c) => c.pins.filter((p) => p.net === net).map((p) => w(p.x, p.y)));
    if (pts.length < 2) return null;
    // en kısa yayılan ağaç (Prim)
    const inTree = [0];
    const rest = pts.map((_, i) => i).slice(1);
    const pos: number[] = [];
    while (rest.length) {
      let best = [0, 0, Infinity];
      for (const a of inTree) for (const [k, b] of rest.entries()) {
        const d = Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
        if (d < best[2]) best = [a, k, d];
      }
      const b = rest.splice(best[1], 1)[0];
      inTree.push(b);
      pos.push(pts[best[0]][0], 0.5, pts[best[0]][1], pts[b][0], 0.5, pts[b][1]);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    return g;
  }, [net, lay, w]);
  useEffect(() => () => geo?.dispose(), [geo]);
  useFrame(() => {
    if (!ref.current || net === null || version.current === liveNets.version) return;
    version.current = liveNets.version;
    const lv = liveNets.values?.[net] ?? 3;
    (ref.current.material as LineBasicMaterial).color.copy(lv === 0 ? tmpC.set("#7fb3ff") : levelColors[lv]);
  });
  if (!geo) return null;
  return (
    <lineSegments ref={ref} geometry={geo} raycast={() => null} renderOrder={10}>
      <lineBasicMaterial color="#ffffff" depthTest={false} transparent />
    </lineSegments>
  );
}

// ---------------------------------------------------------------- çipin kalıbı (die): kapılar havada

function Die({ chip }: { chip: ChipPlace }) {
  const { w } = useLayoutWorld();
  const { board } = boardModel();
  const ins: ChipInside = useMemo(() => chipInside(board.c.gates as Gate[], board.instance(chip.ref)), [board, chip]);
  const selectedGate = useKart((s) => s.gate);
  const tiles = useRef<InstancedMesh>(null);
  const wires = useRef<LineSegments>(null);
  const bonds = useRef<LineSegments>(null);
  const version = useRef(-1);
  const [cx, cz] = w(chip.x + chip.w / 2, chip.y + chip.h / 2);
  const dieW = Math.min(9, Math.max(5, ins.width * 0.012));
  const s = dieW / ins.width;
  const dieD = ins.height * s;
  const X = (x: number) => cx - dieW / 2 + x * s;
  const Z = (y: number) => cz - dieD / 2 + y * s;

  const wireGeo = useMemo(() => {
    const pos: number[] = [];
    const nets: number[] = [];
    for (const wr of ins.wires) {
      for (let k = 0; k + 3 < wr.points.length; k += 2) {
        pos.push(X(wr.points[k]), DIE_Y + 0.012, Z(wr.points[k + 1]), X(wr.points[k + 2]), DIE_Y + 0.012, Z(wr.points[k + 3]));
        nets.push(wr.net, wr.net);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("color", new BufferAttribute(new Float32Array(pos.length), 3));
    return { g, nets };
  }, [ins, cx, cz, s]);

  const bondGeo = useMemo(() => {
    const pos: number[] = [];
    const nets: number[] = [];
    for (const p of ins.pins) {
      const pkg = chip.pins.find((q) => q.name === p.name);
      if (!pkg) continue;
      const [px, pz] = w(pkg.x, pkg.y);
      pos.push(X(p.x), DIE_Y, Z(p.y), px, BODY_Y + BODY_H, pz);
      nets.push(p.net, p.net);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("color", new BufferAttribute(new Float32Array(pos.length), 3));
    return { g, nets };
  }, [ins, chip, cx, cz, s]);
  useEffect(() => () => { wireGeo.g.dispose(); bondGeo.g.dispose(); }, [wireGeo, bondGeo]);

  useLayoutEffect(() => {
    ins.gates.forEach((g, i) => {
      tmpO.position.set(X(g.x + g.w / 2), DIE_Y + 0.03, Z(g.y + g.h / 2));
      tmpO.scale.set(g.w * s, 0.05, g.h * s);
      tmpO.updateMatrix();
      tiles.current!.setMatrixAt(i, tmpO.matrix);
      tiles.current!.setColorAt(i, levelColors[0]);
    });
    tiles.current!.instanceMatrix.needsUpdate = true;
    tiles.current!.computeBoundingSphere();
    version.current = -1;
  }, [ins, cx, cz, s]);

  useFrame(() => {
    if (!liveNets.values || version.current === liveNets.version) return;
    version.current = liveNets.version;
    const v = liveNets.values;
    const lvl = (n: number) => (n <= 1 ? n : v[n]);
    ins.gates.forEach((g, i) => {
      const lv = lvl(g.outputs[0]);
      const c = lv === 0 ? DIE_LOW : levelColors[lv] ?? levelColors[3];
      tiles.current!.setColorAt(i, g.gate === useKart.getState().gate ? tmpC.set("#ffffff") : c);
    });
    tiles.current!.instanceColor!.needsUpdate = true;
    for (const { g, nets } of [wireGeo, bondGeo]) {
      const col = g.getAttribute("color") as BufferAttribute;
      nets.forEach((n, k) => {
        const lv = lvl(n);
        const c = lv === 0 ? tmpC.set("#4f6a8a") : levelColors[lv];
        col.setXYZ(k, c.r, c.g, c.b);
      });
      col.needsUpdate = true;
    }
  });
  useEffect(() => {
    version.current = -1;
  }, [selectedGate]);

  return (
    <group>
      <mesh position={[cx, DIE_Y - 0.03, cz]} raycast={() => null}>
        <boxGeometry args={[dieW + 0.3, 0.05, dieD + 0.3]} />
        <meshStandardMaterial color="#1a2330" roughness={0.35} metalness={0.5} transparent opacity={0.94} />
      </mesh>
      <instancedMesh
        ref={tiles}
        args={[undefined, undefined, ins.gates.length]}
        onClick={(e) => {
          e.stopPropagation();
          const g = ins.gates[e.instanceId ?? -1];
          if (g && g.kind !== "BEHAV") useKart.getState().selectGate(g.gate);
        }}
      >
        <boxGeometry />
        <meshStandardMaterial color="#ffffff" roughness={0.5} emissive="#000000" />
      </instancedMesh>
      <lineSegments ref={wires} geometry={wireGeo.g} raycast={() => null}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
      <lineSegments ref={bonds} geometry={bondGeo.g} raycast={() => null}>
        <lineBasicMaterial vertexColors transparent opacity={0.55} />
      </lineSegments>
    </group>
  );
}

// ---------------------------------------------------------------- kamera

const OVERVIEW = { target: new Vector3(0, 0, 3), cam: new Vector3(0, 56, 38) };

function CameraFly() {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const chip = useKart((s) => s.chip);
  const { lay, w } = useLayoutWorld();
  const anim = useRef<{ target: Vector3; cam: Vector3; t0: Vector3; c0: Vector3; t: number } | null>(null);
  useEffect(() => {
    if (!controls) return;
    const c = chip ? lay.chips.find((x) => x.ref === chip) : null;
    const start = { t0: controls.target.clone(), c0: camera.position.clone(), t: 0 };
    if (!c) {
      anim.current = { target: OVERVIEW.target.clone(), cam: OVERVIEW.cam.clone(), ...start };
      return;
    }
    const [x, z] = w(c.x + c.w / 2, c.y + c.h / 2);
    anim.current = { target: new Vector3(x, 1.4, z), cam: new Vector3(x, 1.4 + 6.5, z + 5.5), ...start };
  }, [chip, controls, camera, lay, w]);
  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + dt * 1.4);
    const k = 1 - Math.pow(1 - a.t, 3);
    controls.target.lerpVectors(a.t0, a.target, k);
    camera.position.lerpVectors(a.c0, a.cam, k);
    controls.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

function SelectedDie() {
  const chip = useKart((s) => s.chip);
  const { lay } = useLayoutWorld();
  const c = chip ? lay.chips.find((x) => x.ref === chip) : null;
  return c ? <Die key={c.ref} chip={c} /> : null;
}

export function BoardScene() {
  return (
    <Canvas
      camera={{ position: OVERVIEW.cam.toArray(), fov: 40, near: 0.05, far: 400 }}
      dpr={[1, 2]}
      onPointerMissed={() => {
        const s = useKart.getState();
        if (s.gate !== null) s.selectGate(null);
        else s.selectChip(null);
      }}
    >
      <color attach="background" args={["#07090c"]} />
      <hemisphereLight args={["#ffffff", "#1a2028", 1.1]} />
      <directionalLight position={[20, 40, 15]} intensity={1.3} />
      <Cards />
      <Chips />
      <NetLines />
      <SelectedDie />
      <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI * 0.48} minDistance={1.5} maxDistance={120} />
      <CameraFly />
    </Canvas>
  );
}

