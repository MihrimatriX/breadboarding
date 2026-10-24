import { useEffect } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { GizmoHelper, GizmoViewport, OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { DieModel } from "./DieModel";
import { Transistors } from "./Transistors";
import { CameraRig } from "./CameraRig";
import { useApp } from "../state/store";
import { chipToWorld } from "../chip/chipIndex";
import { useAyar, useSahneRengi } from "../ui/ayarlar";
import { OnDerleme, TuvalCizimi, useTuvalDpr } from "./TuvalCizimi";

/** Sahnenin okuduğu depolar: değişince yeni kare (isteğe bağlı çizim, cizimDongusu.ts) */
const DEPOLAR = [{ depo: useApp }, { depo: useAyar }];

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

/** İlk kamera yeri; OrbitControls bu yerden die'ın ortasına bakar */
const KAMERA_BASI: [number, number, number] = [0, 7.2, 7.6];

/**
 * Kadraj: başlangıç bakışında die'ın dört köşesi tuvale sığsın. Tuval dar ya da kısa olunca (yan panel
 * geniş, alt panel açık) görüş açısı orantılı genişler; kameranın yeri, döndürme, yaklaşma ve sinyale
 * uçuş değişmez.
 */
function Kadraj() {
  const camera = useThree((s) => s.camera);
  const oran = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const chip = useApp((s) => s.chip);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera) || !chip) return;
    const ornek = new PerspectiveCamera(camera.fov, oran, camera.near, camera.far);
    ornek.position.set(...KAMERA_BASI);
    ornek.lookAt(0, 0, 0);
    ornek.updateMatrixWorld();
    const b = chip.bounds;
    const v = new Vector3();
    let uc = 0;
    for (const [x, y] of [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY], [b.maxX, b.maxY]]) {
      const [wx, wz] = chipToWorld(chip, x, y);
      v.set(wx, 0, wz).project(ornek);
      uc = Math.max(uc, Math.abs(v.x), Math.abs(v.y));
    }
    const z = Math.min(1, 0.9 / Math.max(uc, 1e-6));
    if (Math.abs(camera.zoom - z) < 1e-3) return;
    camera.zoom = z;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, oran, chip, invalidate]);
  return null;
}

export function DieScene() {
  const showTransistors = useApp((s) => s.showTransistors);
  const bloom = useApp((s) => s.bloom);
  // zemin temaya uyar; die'ın kendi renkleri değişmez
  const zemin = useSahneRengi();
  const { dpr, ayar, dprDegisti } = useTuvalDpr();
  return (
    <Canvas
      camera={{ position: KAMERA_BASI, fov: 40, near: 0.01, far: 200 }}
      frameloop="demand"
      dpr={dpr}
      raycaster={{ firstHitOnly: true } as never}
      onPointerMissed={() => useApp.getState().select(null)}
    >
      <color attach="background" args={[zemin]} />
      <hemisphereLight args={["#ffffff", "#202020", 0.9]} />
      <OnDerleme>
        <Substrate />
        <DieModel />
        {showTransistors && <Transistors />}
      </OnDerleme>
      <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI * 0.49} minDistance={0.2} maxDistance={40} />
      <CameraRig />
      <Kadraj />
      <TuvalCizimi depolar={DEPOLAR} ayar={ayar} dprDegisti={dprDegisti} />
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
