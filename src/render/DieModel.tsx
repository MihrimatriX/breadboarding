import { useEffect, useMemo, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, Color, Mesh, ShaderMaterial, Vector2 } from "three";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";
import type { LayerBuffers } from "./dieGeometry";
import { dieFragment, dieVertex } from "./shaders";
import { STATE_TEX_WIDTH, useNodeStateTexture } from "./useNodeStateTexture";
import { live } from "../state/live";
import { useApp } from "../state/store";

// BVH ile milyonlarca üçgende fare altı seçim anlık çalışır
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

/** Katmanlar arası dikey boşluk (dünya birimi), "katmanları ayır" ile çarpılır */
export const LEVEL_GAP = 0.035;

export function DieModel() {
  const chip = useApp((s) => s.chip)!;
  const layerVisible = useApp((s) => s.layerVisible);
  const explode = useApp((s) => s.explode);
  const [layers, setLayers] = useState<LayerBuffers[] | null>(null);
  const state = useNodeStateTexture(chip.nodeCount);

  useEffect(() => {
    const worker = new Worker(new URL("./geometry.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<{ layers: LayerBuffers[] }>) => {
      setLayers(ev.data.layers);
      worker.terminate();
    };
    worker.postMessage({ segments: chip.segments, layers: chip.layers, bounds: chip.bounds, scale: chip.scale });
    return () => worker.terminate();
  }, [chip]);

  // tüm katmanların paylaştığı uniform'lar
  const shared = useMemo(
    () => ({
      uState: { value: state.tex },
      uTexSize: { value: new Vector2(STATE_TEX_WIDTH, state.height) },
      uSelected: { value: -1 },
      uHovered: { value: -1 },
      uTime: { value: 0 },
      uGlow: { value: 0.6 },
    }),
    [state],
  );

  const meshes = useMemo(() => {
    if (!layers) return [];
    return layers.map((l) => {
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(l.positions, 3));
      g.setAttribute("normal", new BufferAttribute(l.normals, 3));
      g.setAttribute("aNode", new BufferAttribute(l.nodes, 1));
      g.setIndex(new BufferAttribute(l.indices, 1));
      g.computeBoundingSphere();
      g.computeBoundsTree();
      const m = new ShaderMaterial({
        vertexShader: dieVertex,
        fragmentShader: dieFragment,
        transparent: l.layer.opacity < 1,
        depthWrite: l.layer.opacity >= 1,
        uniforms: {
          ...shared,
          uColor: { value: new Color(l.layer.color) },
          uHighColor: { value: new Color("#ff2a55") },
          uOpacity: { value: l.layer.opacity },
        },
      });
      return { layer: l.layer, geometry: g, material: m };
    });
  }, [layers, shared]);

  useEffect(() => () => meshes.forEach((m) => { m.geometry.disposeBoundsTree(); m.geometry.dispose(); m.material.dispose(); }), [meshes]);

  let seenVersion = -1;
  useFrame((st, dt) => {
    shared.uTime.value += dt;
    const { selectedNode, hoveredNode, bloom } = useApp.getState();
    // seçili düğüm nabız gibi atar (uTime): seçim sürdükçe kareler de sürer
    if (selectedNode !== null) st.invalidate();
    shared.uSelected.value = selectedNode ?? -1;
    shared.uHovered.value = hoveredNode ?? -1;
    shared.uGlow.value = bloom ? 0.9 : 0.15;
    if (live.nodeState && live.version !== seenVersion) {
      seenVersion = live.version;
      state.write(live.nodeState);
    }
  });

  const nodeOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const geo = (e.object as Mesh).geometry as BufferGeometry;
    return e.face ? (geo.getAttribute("aNode").getX(e.face.a) as number) : null;
  };

  return (
    <group>
      {meshes.map(({ layer, geometry, material }) => (
        <mesh
          key={layer.id}
          geometry={geometry}
          material={material}
          visible={layerVisible[layer.id] !== false}
          position-y={layer.level * LEVEL_GAP * explode}
          scale-y={layer.thickness}
          renderOrder={layer.opacity < 1 ? 2 : 0}
          onPointerMove={(e) => {
            e.stopPropagation();
            useApp.getState().hover(nodeOf(e));
          }}
          onPointerOut={() => useApp.getState().hover(null)}
          onClick={(e) => {
            if (e.delta > 4) return; // sürükleme sonrası tıklama sayılmasın
            e.stopPropagation();
            useApp.getState().select(nodeOf(e));
          }}
        />
      ))}
    </group>
  );
}
