// İsteğe bağlı çizimin tuvaldeki bağlantısı (kurallar cizimDongusu.ts'te): canlı değer ya da sahnenin
// okuduğu bir depo değişince yeni kare ister; kamera sürüklenirken kare sürelerini ölçüp tuvalin
// çözünürlüğünü ayarlar. 6502 die'da ve kart sahnesinde <Canvas frameloop="demand" dpr={dpr}> ile.
// OnDerleme: sahne ilk görünmeden önce shader'ları arka planda derler.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { cizimDinle, DprAyari, dprTavani, kareGerekir } from "./cizimDongusu";

/** zustand deposu ve sahnenin okumadığı alanları */
export interface Depo {
  depo: { subscribe(f: (yeni: object, eski: object) => void): () => void };
  yoksay?: ReadonlySet<string>;
}

interface Olaylar {
  addEventListener(tur: string, f: () => void): void;
  removeEventListener(tur: string, f: () => void): void;
}

/**
 * Tuvalin çözünürlüğü (Canvas'ın dışında tutulur: Canvas yeniden çizilince R3F dpr özelliğini yeniden
 * uygular, ölçülen değer kaybolmasın). Cihazınkiyle başlar, en çok 2.
 */
export function useTuvalDpr(): { dpr: number; ayar: DprAyari; dprDegisti: (dpr: number) => void } {
  const [ayar] = useState(() => new DprAyari(dprTavani(window.devicePixelRatio)));
  const [dpr, dprDegisti] = useState(ayar.dpr);
  return { dpr, ayar, dprDegisti };
}

/** Tuvalin içine: depolar modül düzeyinde sabit bir dizi olmalı (her çizimde yenisi aboneliği yeniler) */
export function TuvalCizimi({ depolar, ayar, dprDegisti }: { depolar: readonly Depo[]; ayar: DprAyari; dprDegisti: (dpr: number) => void }): null {
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls) as Olaylar | null;
  useEffect(() => {
    const bitir = [cizimDinle(() => invalidate()), ...depolar.map(({ depo, yoksay }) => depo.subscribe((yeni, eski) => kareGerekir(yeni, eski, yoksay) && invalidate()))];
    return () => bitir.forEach((f) => f());
  }, [invalidate, depolar]);
  // yalnız sürüklerken ölçülür: kareler art arda gelir, aralarındaki süre gerçekten kare süresidir
  const suruklenen = useRef({ acik: false, son: 0 });
  useEffect(() => {
    if (!controls) return;
    const basla = () => {
      suruklenen.current = { acik: true, son: 0 };
    };
    const bit = () => {
      suruklenen.current.acik = false;
      ayar.ara();
    };
    controls.addEventListener("start", basla);
    controls.addEventListener("end", bit);
    return () => {
      controls.removeEventListener("start", basla);
      controls.removeEventListener("end", bit);
    };
  }, [controls, ayar]);
  useFrame(() => {
    const s = suruklenen.current;
    if (!s.acik) return;
    const simdi = performance.now();
    const yeni = s.son ? ayar.kare((simdi - s.son) / 1000) : null;
    s.son = simdi;
    if (yeni !== null) dprDegisti(yeni);
  });
  return null;
}

/** Paralel derleme takılırsa sahne en geç bu kadar sonra görünür (ms) */
const DERLEME_EN_COK = 4000;

/**
 * Sahne ilk görünmeden önce shader'ları derler (gl.compileAsync). Tarayıcı paralel derlemeyi destekliyorsa
 * (KHR_parallel_shader_compile; masaüstü Chrome ve Edge) derleme sürücünün iş parçacıklarında yürür, ana
 * iş parçacığı kilitlenmez: bölüm açılırken arayüz donmaz, sahne hazır olunca görünür. Desteklemiyorsa ilk
 * kare eskisi gibi derler. Sonradan eklenen nesneler (kazınan yollar, teller) çoğunlukla aynı malzemeleri kullanır.
 */
export function OnDerleme({ children }: { children: ReactNode }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const [hazir, setHazir] = useState(false);
  useEffect(() => {
    let bitti = false;
    const goster = () => {
      if (bitti) return;
      bitti = true;
      setHazir(true);
    };
    const id = window.setTimeout(goster, DERLEME_EN_COK);
    gl.compileAsync(scene, camera).then(goster, goster);
    return () => {
      bitti = true;
      window.clearTimeout(id);
    };
  }, [gl, scene, camera]);
  return <group visible={hazir}>{children}</group>;
}
