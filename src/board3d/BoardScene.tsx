// Sahnedeki kart 3D'de: bütün CPU16 bilgisayarı (anakartın kartları, arka panel ve arkada VGA
// monitörü) ya da 8 bit hesap makinesi (tek kart; DIP anahtarlar ve 7 segment göstergeler), hepsi
// canlı sinyallerle. Entegreler, pasif elemanlar; çipten çipe teller kavisli atlama telleri olarak
// çizilir (rengi netin değeri). Bir çipe tıklayınca üstünde çipin "kalıbı" (die) açılır: kapılar ve
// teller canlı; kapıya tıklayınca alt panelde o kapının transistörleri görünür.

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, InstancedMesh, LineBasicMaterial, LineSegments, Object3D, SRGBColorSpace, Vector3,
  type InterleavedBufferAttribute, type PerspectiveCamera,
} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { chipInside, type ChipInside } from "../../cpu16/board/inside";
import type { ChipPlace } from "../../cpu16/board/layout";
import { BACKPLANE } from "../../cpu16/board/passives";
import type { Gate } from "../../cpu16/chips/logic";
import { aktifKart, type KartTuru } from "./aktif";
import { LEVEL_COLOR } from "./levels";
import { KameraApi } from "./KameraApi";
import { Passives3D } from "./Passives3D";
import { updateScreenCanvas, screenCanvas } from "./screenCanvas";
import { boardLayoutData, boardModel, findPart, liveNets, netEnds, useKart } from "./store";
import { KurulumSahne } from "./KurulumSahne";
import { allWires, busRouter, netWires, partWires, wireGeometry, type Endpoint, type WireEdge } from "./wires";

/** 1 dünya birimi = 10 mm */
const S = 0.1;
const BODY_H = 0.32;
const BODY_Y = 0.05;
const DIE_Y = 2.2;
const PIN_TOP = 0.24;

const levelColors = LEVEL_COLOR.map((c) => new Color(c));
const PIN_COLORS = [new Color("#56606c"), new Color("#ff2a55"), new Color("#9d8cff"), new Color("#e6e600")];
/** tellerde 0 koyu kartın üstünde görünsün diye açık mavi; 1, Z, X her yerdeki gibi */
const WIRE_COLORS = [new Color("#5f8fd6"), new Color("#ff2a55"), new Color("#9d8cff"), new Color("#e6e600")];
const tmpC = new Color();
const DIE_LOW = new Color("#5d7390");
const tmpO = new Object3D();
const noRaycast = () => null;

function useLayoutWorld() {
  const lay = boardLayoutData();
  const cx = lay.width / 2;
  const cz = lay.height / 2;
  return useMemo(() => ({ lay, w: (x: number, y: number): [number, number] => [(x - cx) * S, (y - cz) * S] }), [lay, cx, cz]);
}

const level = (v: Uint8Array | null, net: number) => (net < 0 ? 2 : net <= 1 ? net : v ? (v[net] ?? 3) : 3);

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

/** Birçok yazıyı dokulara çizer (doku başına en çok 2048 × 4096) ve her dokuyu tek bir ağla gösterir */
function TextQuads({ items, cellW = 256, cellH = 80, font = 30 }: { items: TextItem[]; cellW?: number; cellH?: number; font?: number }) {
  const chunks = useMemo(() => {
    const cols = Math.floor(2048 / cellW);
    const perTex = cols * Math.floor(4096 / cellH);
    const out: { geometry: BufferGeometry; texture: CanvasTexture }[] = [];
    for (let start = 0; start < items.length; start += perTex) {
      const list = items.slice(start, start + perTex);
      const rows = Math.ceil(list.length / cols);
      const canvas = document.createElement("canvas");
      canvas.width = cols * cellW;
      canvas.height = Math.max(1, rows * cellH);
      const ctx = canvas.getContext("2d")!;
      ctx.textBaseline = "middle";
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      list.forEach((it, i) => {
        const ox = (i % cols) * cellW;
        const oy = Math.floor(i / cols) * cellH;
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
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
      geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
      geometry.setIndex(idx);
      geometry.computeVertexNormals();
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 8;
      out.push({ geometry, texture });
    }
    return out;
  }, [items, cellW, cellH, font]);
  useEffect(() => () => chunks.forEach((c) => { c.geometry.dispose(); c.texture.dispose(); }), [chunks]);
  return (
    <>
      {chunks.map((c, i) => (
        <mesh key={i} geometry={c.geometry} raycast={noRaycast}>
          <meshBasicMaterial map={c.texture} transparent depthWrite={false} side={DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- kartlar ve arka panel

function Cards() {
  const { lay, w } = useLayoutWorld();
  // arka panel şeridi yalnız kartların kenar konnektörü varsa (bilgisayar); hesap makinesi tek kart
  const backplane = useMemo(() => lay.passives.some((p) => p.edge), [lay]);
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
  return (
    <group>
      {lay.cards.map((c) => {
        const [x, z] = w(c.x + c.w / 2, c.y + c.h / 2);
        return (
          <mesh key={c.name} position={[x, -0.08, z]} raycast={noRaycast}>
            <boxGeometry args={[c.w * S, 0.16, c.h * S]} />
            <meshStandardMaterial color="#0f3d2c" roughness={0.55} metalness={0.1} />
          </mesh>
        );
      })}
      {backplane && lay.rows.map((r, i) => {
        const [x, z] = w(r.x + r.w / 2, r.backplaneY + r.backplaneH / 2);
        return (
          <mesh key={i} position={[x, -0.08, z]} raycast={noRaycast}>
            <boxGeometry args={[(r.w + 20) * S, 0.16, r.backplaneH * S]} />
            <meshStandardMaterial color="#13261d" roughness={0.6} />
          </mesh>
        );
      })}
      {lay.rows.slice(1).map((r, i) => {
        // sıralar arasında arka panel kablosu (sol kenarda)
        const top = lay.rows[i];
        const [x, z0] = w(r.x - 8, top.backplaneY + top.backplaneH / 2);
        const [, z1] = w(r.x - 8, r.backplaneY + r.backplaneH / 2);
        return (
          <mesh key={`k${i}`} position={[x, 0.02, (z0 + z1) / 2]} raycast={noRaycast}>
            <boxGeometry args={[6 * S, 0.06, z1 - z0]} />
            <meshStandardMaterial color="#8a8f99" roughness={0.7} />
          </mesh>
        );
      })}
      <lineSegments geometry={outline} raycast={noRaycast}>
        <lineBasicMaterial color="#cfe3d6" transparent opacity={0.35} />
      </lineSegments>
      <TextQuads items={titles} cellW={512} cellH={48} font={30} />
      {backplane && <BackplaneTraces />}
    </group>
  );
}

/** Arka paneldeki bakır yollar: her biri bir arka panel sinyali, canlı renkte (her kart sırasında) */
function BackplaneTraces() {
  const { lay, w } = useLayoutWorld();
  const { board } = boardModel();
  const signals = useMemo(() => [...new Set(Object.values(BACKPLANE))].filter((n) => n !== "GND" && n !== "VCC" && board.has(n)), [board]);
  const ref = useRef<LineSegments>(null);
  const version = useRef(-1);
  const geo = useMemo(() => {
    const pos: number[] = [];
    for (const r of lay.rows) {
      signals.forEach((_, i) => {
        const y = r.backplaneY + 1.5 + (i * (r.backplaneH - 3)) / signals.length;
        const [a, z] = w(r.x - 6, y);
        const [b] = w(r.x + r.w + 6, y);
        pos.push(a, 0.004, z, b, 0.004, z);
      });
    }
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
    const per = nets.length;
    for (let k = 0; k < col.count / 2; k++) {
      const lv = liveNets.values?.[nets[k % per]] ?? 3;
      const c = lv === 1 ? levelColors[1] : lv === 0 ? tmpC.set("#a07a3a") : levelColors[lv];
      col.setXYZ(2 * k, c.r, c.g, c.b);
      col.setXYZ(2 * k + 1, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  });
  return (
    <lineSegments ref={ref} geometry={geo} raycast={noRaycast}>
      <lineBasicMaterial vertexColors />
    </lineSegments>
  );
}

// ---------------------------------------------------------------- entegreler

function Chips() {
  const { lay, w } = useLayoutWorld();
  const chips = lay.chips;
  const body = useRef<InstancedMesh>(null);
  const pins = useRef<InstancedMesh>(null);
  const pads = useRef<InstancedMesh>(null);
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
    });
    flatPins.forEach(({ pin }, i) => {
      const [x, z] = w(pin.x, pin.y);
      tmpO.position.set(x, PIN_TOP / 2, z);
      tmpO.scale.set(0.06, PIN_TOP, 0.06);
      tmpO.updateMatrix();
      pins.current!.setMatrixAt(i, tmpO.matrix);
      tmpO.position.set(x, 0.004, z);
      tmpO.scale.set(0.17, 0.008, 0.17);
      tmpO.updateMatrix();
      pads.current!.setMatrixAt(i, tmpO.matrix);
      pins.current!.setColorAt(i, PIN_COLORS[0]);
      pads.current!.setColorAt(i, PIN_COLORS[0]);
    });
    for (const m of [body.current!, pins.current!, pads.current!]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
    version.current = -1;
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
      const c = PIN_COLORS[level(v, pin.net)] ?? PIN_COLORS[3];
      pins.current!.setColorAt(i, c);
      pads.current!.setColorAt(i, c);
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
      <instancedMesh ref={pads} args={[undefined, undefined, flatPins.length]} raycast={noRaycast}>
        <boxGeometry />
        <meshStandardMaterial color="#ffffff" roughness={0.4} metalness={0.5} />
      </instancedMesh>
    </group>
  );
}

// ---------------------------------------------------------------- pasif elemanlar

/** Pasifler (Passives3D.tsx: gövdeler, bantlar, LED ışığı, seçim) ve kartın üstündeki referans yazıları */
function Passives() {
  const { lay, w } = useLayoutWorld();
  const labels = useMemo<TextItem[]>(() => lay.passives.filter((p) => !p.chip && p.kind !== "kondansator").map((p) => {
    const [x, z] = w(p.x, p.y + p.h + 0.4);
    return { text: p.ref, x, z, w: Math.max(4, p.w) * S, d: 2.6 * S, y: 0.004, color: "#b8c8bd", align: "left" as const };
  }), [lay, w]);
  return (
    <group>
      <Passives3D />
      <TextQuads items={labels} cellW={256} cellH={64} font={34} />
    </group>
  );
}

// ---------------------------------------------------------------- teller (kavisli atlama telleri)

const pinTop = (e: Endpoint) => {
  if (e.kind === "chip") return PIN_TOP;
  const p = findPart(e.ref)?.passive;
  return p?.kind === "konnektor" ? p.height * S : 0.16;
};

/**
 * Birleştirilmiş tel katmanı: tek çizim çağrısı, renkler net değeri değişince güncellenir.
 * width ≤ 1 ise ince (1 piksel, sıradan LineSegments: binlerce tel için en ucuzu), değilse
 * kalın (LineSegments2).
 */
function WireLayer({ edges, width, opacity = 1, onTop = false, order = 0 }: { edges: WireEdge[]; width: number; opacity?: number; onTop?: boolean; order?: number }) {
  const { lay, w } = useLayoutWorld();
  const size = useThree((s) => s.size);
  const version = useRef(-1);
  const obj = useMemo(() => {
    if (!edges.length) return null;
    const wg = wireGeometry(edges, w, pinTop, busRouter(lay));
    const transparent = opacity < 1 || onTop;
    if (width <= 1) {
      const geo = new BufferGeometry();
      geo.setAttribute("position", new BufferAttribute(wg.positions, 3));
      const colors = new BufferAttribute(new Float32Array(wg.positions.length), 3);
      geo.setAttribute("color", colors);
      const mat = new LineBasicMaterial({ vertexColors: true, transparent, opacity, depthTest: !onTop });
      const line = new LineSegments(geo, mat);
      line.raycast = () => {};
      line.renderOrder = order;
      line.frustumCulled = false;
      return { line, geo, mat, nets: wg.nets, colors: () => { colors.needsUpdate = true; return colors.array as Float32Array; } };
    }
    const geo = new LineSegmentsGeometry();
    geo.setPositions(wg.positions);
    geo.setColors(new Float32Array(wg.positions.length));
    const mat = new LineMaterial({ linewidth: width, vertexColors: true, transparent, opacity, depthTest: !onTop, worldUnits: false });
    const line = new LineSegments2(geo, mat);
    line.raycast = () => {};
    line.renderOrder = order;
    line.frustumCulled = false;
    return {
      line, geo, mat, nets: wg.nets,
      colors: () => {
        const attr = geo.getAttribute("instanceColorStart") as InterleavedBufferAttribute;
        attr.data.needsUpdate = true;
        return attr.data.array as Float32Array;
      },
    };
  }, [edges, lay, w, width, opacity, onTop, order]);
  useEffect(() => () => {
    obj?.geo.dispose();
    obj?.mat.dispose();
  }, [obj]);
  useEffect(() => {
    if (obj?.mat instanceof LineMaterial) obj.mat.resolution.set(size.width, size.height);
    version.current = -1;
  }, [obj, size]);
  useFrame(() => {
    if (!obj || version.current === liveNets.version) return;
    version.current = liveNets.version;
    const v = liveNets.values;
    // her parça 6 sayı: iki ucun rengi (r g b r g b)
    const arr = obj.colors();
    const nets = obj.nets;
    let lastNet = -2;
    let c = WIRE_COLORS[3];
    for (let k = 0; k < nets.length; k++) {
      if (nets[k] !== lastNet) {
        lastNet = nets[k];
        c = WIRE_COLORS[level(v, lastNet)] ?? WIRE_COLORS[3];
      }
      const o = 6 * k;
      arr[o] = arr[o + 3] = c.r;
      arr[o + 1] = arr[o + 4] = c.g;
      arr[o + 2] = arr[o + 5] = c.b;
    }
  });
  return obj ? <primitive object={obj.line} /> : null;
}

function Wires() {
  const mode = useKart((s) => s.wires);
  const power = useKart((s) => s.power);
  const chip = useKart((s) => s.chip);
  const net = useKart((s) => s.net);
  const all = useMemo(() => (mode === "hepsi" ? allWires(netEnds(), { power }) : []), [mode, power]);
  const mine = useMemo(() => (mode !== "yok" && chip ? partWires(chip, netEnds(), { power }) : []), [mode, chip, power]);
  const sel = useMemo(() => (net !== null ? netWires(net, netEnds()) : []), [net]);
  return (
    <group>
      {/* bütün bilgisayar: binlerce tel, ince çizgi (ucuz) */}
      <WireLayer edges={all} width={1} opacity={chip ? 0.35 : 0.85} />
      <WireLayer edges={mine} width={2.2} order={5} />
      <WireLayer edges={sel} width={3.2} onTop order={10} />
    </group>
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
      <mesh position={[cx, DIE_Y - 0.03, cz]} raycast={noRaycast}>
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
      <lineSegments ref={wires} geometry={wireGeo.g} raycast={noRaycast}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
      <lineSegments ref={bonds} geometry={bondGeo.g} raycast={noRaycast}>
        <lineBasicMaterial vertexColors transparent opacity={0.55} />
      </lineSegments>
    </group>
  );
}

// ---------------------------------------------------------------- VGA monitörü (kartların arkasında)

function Monitor() {
  const { lay } = useLayoutWorld();
  const texture = useMemo(() => {
    const t = new CanvasTexture(screenCanvas());
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  const seen = useRef(-1);
  useFrame(() => {
    const v = updateScreenCanvas();
    if (v !== seen.current) {
      seen.current = v;
      texture.needsUpdate = true;
    }
  });
  const sw = 34;
  const sh = 25.5;
  const z = -(lay.height * S) / 2 - 9;
  const y = sh / 2 + 4;
  return (
    <group position={[0, 0, z]}>
      <group position={[0, y, 0]} rotation={[-0.12, 0, 0]}>
        <mesh raycast={noRaycast}>
          <boxGeometry args={[sw + 2.4, sh + 2.4, 1.6]} />
          <meshStandardMaterial color="#1b1e22" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0, 0.95]} raycast={noRaycast}>
          <planeGeometry args={[sw, sh]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      </group>
      <mesh position={[0, 2, -1]} raycast={noRaycast}>
        <boxGeometry args={[3, 4, 2]} />
        <meshStandardMaterial color="#1b1e22" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.15, -1]} raycast={noRaycast}>
        <boxGeometry args={[14, 0.3, 8]} />
        <meshStandardMaterial color="#1b1e22" roughness={0.7} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- kamera

/**
 * Genel bakış. Bilgisayar: bütün kartlar ve arkadaki monitör, hafif eğik. Hesap makinesi: uzun tek
 * kart önden (göstergelerin olduğu alt kenardan) eğik bakılarak; göstergeler ve anahtarlar okunur.
 */
function overview(width: number, height: number, tur: KartTuru) {
  if (tur === "hesap") {
    // uzun ve dar kart: 30° eğik, yukarıdan; bütün boyu dikey görüş açısına sığar, yakın kenardaki
    // göstergeler en büyük görünür
    const L = Math.max(height, width * 1.4) * S;
    const d = L * 1.24;
    const e = (30 * Math.PI) / 180;
    const zc = L * 0.1;
    return { target: new Vector3(0, 0, zc), cam: new Vector3(0, d * Math.cos(e), zc + d * Math.sin(e)) };
  }
  const span = Math.max(width * 0.8, height) * S;
  // hedef biraz sağda: kartlar ekranın solunda kalır, sağ üstteki VGA paneli onları örtmez
  return { target: new Vector3(span * 0.1, 0, -span * 0.08), cam: new Vector3(span * 0.1, span * 1.22, span * 0.98) };
}

function CameraFly() {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const chip = useKart((s) => s.chip);
  const odak = useKart((s) => s.odak);
  const { lay, w } = useLayoutWorld();
  const anim = useRef<{ target: Vector3; cam: Vector3; t0: Vector3; c0: Vector3; t: number } | null>(null);
  // bilgisayarda sağ üstte VGA paneli var: hedef biraz sağa kayar ki panel çerçeveleneni örtmesin
  const kay = aktifKart() === "cpu16" ? 0.1 : 0;
  useEffect(() => {
    if (!controls || !odak) return;
    const start = { t0: controls.target.clone(), c0: camera.position.clone(), t: 0 };
    if (odak.blok === null) {
      const o = overview(lay.width, lay.height, aktifKart());
      anim.current = { target: o.target, cam: o.cam, ...start };
      return;
    }
    // "Gösterge" gibi bir ön ad bütün "Gösterge: …" bloklarını birlikte çerçeveler
    const bs = lay.blocks.filter((x) => x.name === odak.blok || x.name.startsWith(`${odak.blok}:`));
    if (!bs.length) return;
    const [ax, az] = w(Math.min(...bs.map((b) => b.x)), Math.min(...bs.map((b) => b.y)));
    const [bx, bz] = w(Math.max(...bs.map((b) => b.x + b.w)), Math.max(...bs.map((b) => b.y + b.h)));
    // uzaklık: blokların dört köşesi ekrana sığana dek geri çekil (eğik bakışta yakın kenar daha geniş görünür)
    const tz = (az + bz) / 2;
    const deneme = (camera as PerspectiveCamera).clone();
    const v = new Vector3();
    const sigar = (d: number) => {
      const tx = (ax + bx) / 2 + d * kay;
      deneme.position.set(tx, 0.3 + d * 0.8, tz + d * 0.6);
      deneme.lookAt(tx, 0.3, tz);
      deneme.updateMatrixWorld();
      return [[ax, az], [bx, az], [ax, bz], [bx, bz]].every(([x, z]) => {
        v.set(x, 0, z).project(deneme);
        return Math.abs(v.x) <= 0.94 && Math.abs(v.y) <= 0.92;
      });
    };
    let d = 8;
    while (d < 150 && !sigar(d)) d *= 1.06;
    const tx = (ax + bx) / 2 + d * kay;
    anim.current = { target: new Vector3(tx, 0.3, tz), cam: new Vector3(tx, 0.3 + d * 0.8, tz + d * 0.6), ...start };
  }, [odak, controls, camera, lay, w, kay]);
  useEffect(() => {
    if (!controls) return;
    const part = findPart(chip);
    const c = part?.chip ?? part?.passive ?? null;
    const start = { t0: controls.target.clone(), c0: camera.position.clone(), t: 0 };
    if (!c) {
      // seçim kalkınca genel bakış (bir bloğa gidilmişse orada kalır)
      if (useKart.getState().odak) return;
      const o = overview(lay.width, lay.height, aktifKart());
      anim.current = { target: o.target, cam: o.cam, ...start };
      return;
    }
    // çip ve tellerinin öbür uçları birlikte görünsün: uçların kutusunu çerçevele
    let x0 = c.x, x1 = c.x + c.w, y0 = c.y, y1 = c.y + c.h;
    for (const e of partWires(c.ref, netEnds(), { power: false })) {
      for (const p of [e.a, e.b]) {
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
    }
    const [ax, az] = w(x0, y0);
    const [bx, bz] = w(x1, y1);
    const extent = Math.max(bx - ax, (bz - az) * 1.4);
    const d = part?.chip ? Math.min(100, Math.max(11, extent * 1.15)) : Math.min(70, Math.max(5, extent * 1.15));
    // kutunun ortası; bilgisayarda biraz sağa kaydırılır ki sağ üstteki VGA paneli çipi örtmesin
    const tx = (ax + bx) / 2 + d * kay;
    const tz = (az + bz) / 2;
    const ty = part?.chip ? 1.2 : 0.2;
    anim.current = { target: new Vector3(tx, ty, tz), cam: new Vector3(tx, ty + d * 0.78, tz + d * 0.62), ...start };
  }, [chip, controls, camera, lay, w, kay]);
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
  const c = findPart(chip)?.chip;
  return c ? <Die key={c.ref} chip={c} /> : null;
}

export function BoardScene() {
  const lay = boardLayoutData();
  const tur = aktifKart();
  // aynı nesne kalmalı: her yeniden çizimde yeni bir hedef OrbitControls'un hedefini genel bakışa sıfırlardı
  const o = useMemo(() => overview(lay.width, lay.height, tur), [lay, tur]);
  return (
    <Canvas
      key={tur}
      camera={{ position: o.cam.toArray(), fov: 40, near: 0.2, far: 800 }}
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
      <Passives />
      <Wires />
      <KurulumSahne />
      <SelectedDie />
      {tur === "cpu16" && <Monitor />}
      <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI * 0.48} minDistance={1.5} maxDistance={260} target={o.target} />
      <CameraFly />
      <KameraApi />
    </Canvas>
  );
}
