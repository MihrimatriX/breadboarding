// Konsoldan ve otomatik ekran görüntülerinden kamera: kart.yakinlas("D201") bir elemana yaklaşır,
// kart.kamera() kameranın yerini ve baktığı noktayı verir, kart.kamera([x,y,z], [x,y,z]) ayarlar;
// kart.ekranda("U3", 1) bir bacağın ekrandaki yerini verir (otomatik tıklama testleri); kart.cizim()
// son karenin çizim çağrısı, üçgen sayısı ve çözünürlüğü (dpr; kamera sürüklenirken kareler yavaşsa düşer).
// Ayrıca tuval oranına göre görüş açısı: dar tuvalde (yan panel geniş, alt panel kapalı) genel bakış
// yanlardan taşmasın diye görüş açısı orantılı genişler; kameranın yeri ve uçuşlar değişmez.
// window.kart (bilgisayar) ya da window.hesap (hesap makinesi) BoardView'da kurulur; bu bileşen kendi
// işlevlerini sahnedeki kartınkine ekler.

import { useEffect } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import { useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { aktifKart } from "./aktif";
import { boardLayoutData, findPart } from "./store";

const S = 0.1;

/** Genel bakışların ayarlandığı en dar tuval oranı (genişlik / yükseklik); altında görüş genişler */
const ORAN_ESIGI = { cpu16: 1.8, hesap: 1.2 } as const;

type Vec = [number, number, number];

export function KameraApi() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const gl = useThree((s) => s.gl);
  const oran = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const z = Math.min(1, oran / ORAN_ESIGI[aktifKart() === "hesap" ? "hesap" : "cpu16"]);
    if (Math.abs(camera.zoom - z) < 1e-3) return;
    camera.zoom = z;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, oran, invalidate]);
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
      /** Son karenin çizim çağrısı ve üçgen sayısı (başarım ölçümü) */
      cizim: () => ({ cagri: gl.info.render.calls, ucgen: gl.info.render.triangles, dpr: gl.getPixelRatio() }),
      /** Bir bacağın (pin verilmezse elemanın ortasının) ekrandaki yeri, sayfa pikseli; yükseklik mm */
      ekranda: (ref: string, pin?: number, yukseklik = 0) => {
        const part = findPart(ref);
        const c = part?.chip ?? part?.passive;
        if (!c) return null;
        const p = pin === undefined ? { x: c.x + c.w / 2, y: c.y + c.h / 2 } : c.pins.find((q) => q.num === pin);
        if (!p) return null;
        const lay = boardLayoutData();
        const v = new Vector3((p.x - lay.width / 2) * S, yukseklik * S, (p.y - lay.height / 2) * S).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: Math.round(r.left + ((v.x + 1) / 2) * r.width), y: Math.round(r.top + ((1 - v.y) / 2) * r.height) };
      },
    };
    const attach = () => {
      const k = (window as unknown as Record<string, Record<string, unknown> | undefined>)[aktifKart() === "hesap" ? "hesap" : "kart"];
      if (k && k.yakinlas !== api.yakinlas) Object.assign(k, api);
    };
    attach();
    const id = window.setInterval(attach, 500);
    return () => window.clearInterval(id);
  }, [camera, controls, gl]);
  return null;
}
