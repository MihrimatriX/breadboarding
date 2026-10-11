// Konsoldan ve otomatik ekran görüntülerinden kamera: kart.yakinlas("D201") bir elemana yaklaşır,
// kart.kamera() kameranın yerini ve baktığı noktayı verir, kart.kamera([x,y,z], [x,y,z]) ayarlar.
// window.kart BoardView'da kurulur; bu bileşen kendi işlevlerini ona ekler.

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { boardLayoutData, findPart } from "./store";

const S = 0.1;

type Vec = [number, number, number];

export function KameraApi() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  useEffect(() => {
    if (!controls) return;
    const set = (cam: Vec, target: Vec) => {
      controls.target.set(...target);
      camera.position.set(...cam);
      controls.update();
    };
    const api = {
      kamera: (cam?: Vec, target?: Vec) => {
        if (cam && target) set(cam, target);
        const r = (v: { x: number; y: number; z: number }) => [v.x, v.y, v.z].map((n) => Math.round(n * 100) / 100);
        return { kamera: r(camera.position), hedef: r(controls.target) };
      },
      /** Bir çipe ya da pasife yaklaş: mesafe mm, yükseklik açısı derece */
      yakinlas: (ref: string, mesafe = 45, aci = 50, yon = 0) => {
        const part = findPart(ref);
        const c = part?.chip ?? part?.passive;
        if (!c) return false;
        const lay = boardLayoutData();
        const x = (c.x + c.w / 2 - lay.width / 2) * S;
        const z = (c.y + c.h / 2 - lay.height / 2) * S;
        const d = mesafe * S;
        const e = (aci * Math.PI) / 180;
        const a = (yon * Math.PI) / 180;
        set([x + d * Math.cos(e) * Math.sin(a), 0.2 + d * Math.sin(e), z + d * Math.cos(e) * Math.cos(a)], [x, 0.2, z]);
        return true;
      },
    };
    const attach = () => {
      const k = (window as unknown as { kart?: Record<string, unknown> }).kart;
      if (k && k.yakinlas !== api.yakinlas) Object.assign(k, api);
    };
    attach();
    const id = window.setInterval(attach, 500);
    return () => window.clearInterval(id);
  }, [camera, controls]);
  return null;
}
