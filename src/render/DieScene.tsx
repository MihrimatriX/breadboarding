import { Canvas } from "@react-three/fiber";
import { GizmoHelper, GizmoViewport, OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { DieModel } from "./DieModel";
import { Transistors } from "./Transistors";
import { CameraRig } from "./CameraRig";
import { useApp } from "../state/store";

function Substrate() {
  const chip = useApp((s) => s.chip)!;
  const w = (chip.bounds.maxX - chip.bounds.minX) * chip.scale + 0.4;
  const d = (chip.bounds.maxY - chip.bounds.minY) * chip.scale + 0.4;
  return (
    <mesh position-y={-0.061} raycast={() => null}>
      <boxGeometry args={[w, 0.12, d]} />
      <meshStandardMaterial color="#14181f" roughness={0.9} />
    </mesh>
  );
}

export function DieScene() {
  const showTransistors = useApp((s) => s.showTransistors);
  const bloom = useApp((s) => s.bloom);
  return (
    <Canvas
      camera={{ position: [0, 7.2, 7.6], fov: 40, near: 0.01, far: 200 }}
      dpr={[1, 2]}
      raycaster={{ firstHitOnly: true } as never}
      onPointerMissed={() => useApp.getState().select(null)}
    >
      <color attach="background" args={["#07090c"]} />
      <hemisphereLight args={["#ffffff", "#202020", 0.9]} />
      <Substrate />
      <DieModel />
      {showTransistors && <Transistors />}
      <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI * 0.49} minDistance={0.2} maxDistance={40} />
      <CameraRig />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport labelColor="white" axisHeadScale={0.9} />
      </GizmoHelper>
      {bloom && (
        <EffectComposer>
          <Bloom intensity={0.7} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur />
        </EffectComposer>
      )}
    </Canvas>
  );
}
