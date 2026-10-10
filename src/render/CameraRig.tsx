import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { chipToWorld } from "../chip/chipIndex";
import { useApp } from "../state/store";

/** Arama ile seçilen sinyale kamerayı yumuşakça uçurur */
export function CameraRig() {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const focus = useApp((s) => s.focusRequest);
  const anim = useRef<{ target: Vector3; cam: Vector3; t: number } | null>(null);

  useEffect(() => {
    const { chip, index } = useApp.getState();
    if (!focus || !chip || !index || !controls) return;
    const o = focus.node * 4;
    const b = index.nodeBounds;
    if (!Number.isFinite(b[o])) return;
    const [x, z] = chipToWorld(chip, (b[o] + b[o + 2]) / 2, (b[o + 1] + b[o + 3]) / 2);
    const size = Math.max(b[o + 2] - b[o], b[o + 3] - b[o + 1]) * chip.scale;
    const dist = Math.min(6, Math.max(0.8, size * 1.6));
    anim.current = { target: new Vector3(x, 0, z), cam: new Vector3(x, dist * 0.9, z + dist * 0.7), t: 0 };
  }, [focus, controls]);

  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + dt * 1.8);
    const k = 1 - Math.pow(1 - a.t, 3);
    controls.target.lerp(a.target, k * 0.25);
    camera.position.lerp(a.cam, k * 0.25);
    controls.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}
