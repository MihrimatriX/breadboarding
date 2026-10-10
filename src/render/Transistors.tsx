import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, InstancedMesh, Matrix4 } from "three";
import { chipToWorld } from "../chip/chipIndex";
import { live } from "../state/live";
import { useApp } from "../state/store";
import { LEVEL_GAP } from "./DieModel";

const ON = new Color("#4dff6a").multiplyScalar(1.6);
const OFF = new Color("#2a3038");

/** Her transistörün kapı bölgesinde küçük bir blok: iletimdeyse yeşil yanar */
export function Transistors() {
  const chip = useApp((s) => s.chip)!;
  const explode = useApp((s) => s.explode);
  const ref = useRef<InstancedMesh>(null);
  const count = chip.transistors.length;

  const matrices = useMemo(() => {
    const m = new Matrix4();
    return chip.transistors.map((t) => {
      const [x0, x1, y0, y1] = t.bbox;
      const [wx, wz] = chipToWorld(chip, (x0 + x1) / 2, (y0 + y1) / 2);
      m.makeScale(Math.max(0.012, (x1 - x0) * chip.scale), 0.02, Math.max(0.012, (y1 - y0) * chip.scale));
      m.setPosition(wx, 0, wz);
      return m.clone();
    });
  }, [chip]);

  useLayoutEffect(() => {
    const mesh = ref.current!;
    matrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, OFF);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  let seen = -1;
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || !live.transistorOn || live.version === seen) return;
    seen = live.version;
    for (let i = 0; i < count; i++) mesh.setColorAt(i, live.transistorOn[i] ? ON : OFF);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} position-y={LEVEL_GAP * explode + 0.04} raycast={() => null}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
