// Bölüm katmanı 3D'de (bolum.ts, bolumSahne.ts): bölge (PCB'de blok) çerçeveleri, başlık plakaları,
// seçili ya da üstüne gelinen bölümün kalın çizgileri ve kenar etiketlerinin ekrandaki yerleri.
//
// Çizim: bütün çerçeveler tek bir kalın çizgi ağında (ekran pikseliyle kalınlık), bütün plakalar tek
// bir ağda (yazılar bir dokuya bir kez çizilir); ikisi de derinlik sınamasız, her şeyin üstünde.
// Plakalar kameradan uzaklığa göre belirir ve kaybolur (LOD): yazı ekranda okunacak kadar büyükken
// görünür, yaklaştıkça yazı ekranda 30 pikseli geçmesin diye küçülür. Breadboard'da üç kat: uzaktan
// bölge plakaları ("REGISTER DOSYASI"), yaklaşınca onların yerine her board'un modül plakaları ("R0",
// "TOPLAYICI"), daha da yaklaşınca (ayrıntılı kipte) kenar etiketleri; PCB'de bölge (blok) plakaları
// kenar etiketleri gelince söner (çiplerin üstünü örtmesin).
// Plakaya tıklamak bölümü seçer ve kamerayı ona götürür; üstüne gelince görevi ipucunda.
//
// Kenar etiketleri (yalnız ayrıntılı kipte, yakından): her karede kamera değiştiyse ekranda görünen çip
// gruplarından ekranın ortasına en yakın olanlar seçilir, iki yandaki sütunlara yerleştirilir
// (bolumSahne.ts kenarYerlesimi) ve useKenar'a yazılır; BolumKatmani onları DOM'da çizer.
//
// Yazılar seçili dilde: dil değişince plakalar o dilin sahnesinden (sahneDili) yeniden çizilir, kenar
// etiketleri yeniden hesaplanır.

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, Mesh, MeshBasicMaterial, PerspectiveCamera, SRGBColorSpace, Vector3,
  type Intersection, type Raycaster,
} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { create } from "zustand";
import { bolumleri, bolumMetni, type BolumTuru } from "../../cpu16/board/bolum-bilgi";
import type { BoardLayout } from "../../cpu16/board/layout";
import { ucusAdimi, useAyar } from "../ui/ayarlar";
import { useDil } from "../ui/ceviri";
import { aktifKart } from "./aktif";
import { useBbKurulum } from "./bbKurulum";
import { bolumRengi, bolumu, katalog, plakaYazisi, sahneBolumleri, useBolum, type EtiketKipi } from "./bolum";
import { kapasite, kenarYerlesimi, PLAKA, sahneDili, type Kutu, type Plaka, type SahneBolumleri } from "./bolumSahne";
import { useKurulum } from "./kurulum";
import { boardLayoutData, useKart } from "./store";

/** 1 dünya birimi = 10 mm (BoardScene ile aynı) */
const S = 0.1;
/** çizgilerin ve plakaların yüksekliği (dünya birimi; derinlik sınaması yok, yalnız paralaks) */
const CIZGI_Y = 0.03;
const PLAKA_Y = 0.6;
const PARCA_Y = 0.4;

type Dunya = (x: number, y: number) => [number, number];

function useDunya(): { lay: BoardLayout; w: Dunya } {
  const lay = boardLayoutData();
  return useMemo(() => {
    const cx = lay.width / 2;
    const cz = lay.height / 2;
    return { lay, w: (x: number, y: number) => [(x - cx) * S, (y - cz) * S] };
  }, [lay]);
}

/** Bir parçanın yerleşimdeki dikdörtgeni (mm) */
function parcaKutusu(lay: BoardLayout, ref: string): Kutu | null {
  const p = lay.chips.find((c) => c.ref === ref) ?? lay.passives.find((c) => c.ref === ref);
  return p ? { x: p.x, y: p.y, w: p.w, h: p.h } : null;
}

/** Bölümün sahnedeki kutusu (mm): çerçevesi, kartın panosu ya da parçalarının birleşimi */
export function bolumKutusu(id: string, s: SahneBolumleri, lay: BoardLayout): Kutu | null {
  const c = s.cerceveler.find((x) => x.id === id);
  if (c) return c.kutu;
  const b = bolumu(id);
  if (!b) return null;
  if (b.tur === "kart") {
    const k = s.kartKutusu.get(b.kart);
    if (k) return k;
  }
  const kutular = b.refs.map((r) => parcaKutusu(lay, r)).filter((k): k is Kutu => !!k);
  if (!kutular.length) return null;
  const x0 = Math.min(...kutular.map((k) => k.x));
  const y0 = Math.min(...kutular.map((k) => k.y));
  return { x: x0, y: y0, w: Math.max(...kutular.map((k) => k.x + k.w)) - x0, h: Math.max(...kutular.map((k) => k.y + k.h)) - y0 };
}

// ---------------------------------------------------------------- çizgiler

/** Ekran pikseliyle kalın, renkli çizgi parçaları (tek çizim); konumlar dünya biriminde */
function KalinCizgi({ konum, renk, kalinlik, sira }: { konum: Float32Array; renk: Float32Array; kalinlik: number; sira: number }) {
  const size = useThree((s) => s.size);
  const obj = useMemo(() => {
    const geo = new LineSegmentsGeometry();
    geo.setPositions(konum);
    geo.setColors(renk);
    const mat = new LineMaterial({ linewidth: kalinlik, vertexColors: true, worldUnits: false, depthTest: false, depthWrite: false, transparent: true });
    const line = new LineSegments2(geo, mat);
    line.raycast = () => {};
    line.renderOrder = sira;
    return { line, geo, mat };
  }, [konum, renk, kalinlik, sira]);
  useEffect(() => () => {
    obj.geo.dispose();
    obj.mat.dispose();
  }, [obj]);
  useEffect(() => {
    obj.mat.resolution.set(size.width, size.height);
  }, [obj, size]);
  return <primitive object={obj.line} />;
}

const tmpC = new Color();

/** [x0, y0, x1, y1, …] (mm) → dünya konumları ve tek renk */
function cizgiDizileri(parcalar: { kenarlar: number[]; renk: string }[], w: Dunya, y: number): { konum: Float32Array; renk: Float32Array } {
  const n = parcalar.reduce((s, p) => s + p.kenarlar.length / 4, 0);
  const konum = new Float32Array(n * 6);
  const renk = new Float32Array(n * 6);
  let o = 0;
  for (const p of parcalar) {
    tmpC.set(p.renk);
    for (let k = 0; k + 3 < p.kenarlar.length; k += 4) {
      const [x0, z0] = w(p.kenarlar[k], p.kenarlar[k + 1]);
      const [x1, z1] = w(p.kenarlar[k + 2], p.kenarlar[k + 3]);
      konum.set([x0, y, z0, x1, y, z1], o);
      renk.set([tmpC.r, tmpC.g, tmpC.b, tmpC.r, tmpC.g, tmpC.b], o);
      o += 6;
    }
  }
  return { konum, renk };
}

const dikdortgen = (k: Kutu, pay: number): number[] => {
  const [x0, y0, x1, y1] = [k.x - pay, k.y - pay, k.x + k.w + pay, k.y + k.h + pay];
  return [x0, y0, x1, y0, x1, y0, x1, y1, x1, y1, x0, y1, x0, y1, x0, y0];
};

/** Bölümün vurgu çizgileri (mm): çerçevesi; kartta panonun çevresi; ötekilerde her parçasının çevresi */
function vurguKenarlari(id: string, s: SahneBolumleri, lay: BoardLayout): number[] {
  const c = s.cerceveler.find((x) => x.id === id);
  if (c) return c.kenarlar;
  const b = bolumu(id);
  if (!b) return [];
  if (b.tur === "kart") {
    const k = s.kartKutusu.get(b.kart);
    if (k) return dikdortgen(k, 5);
  }
  return b.refs.flatMap((r) => {
    const k = parcaKutusu(lay, r);
    return k ? dikdortgen(k, 1.4) : [];
  });
}

function Cerceveler({ s }: { s: SahneBolumleri }) {
  const { w } = useDunya();
  const d = useMemo(() => cizgiDizileri(s.cerceveler, w, CIZGI_Y), [s, w]);
  return <KalinCizgi konum={d.konum} renk={d.renk} kalinlik={2.4} sira={35} />;
}

/** Koyu hâle: vurgu çizgisi krem board'da da tellerin üstünde de seçilir */
const HALE = "#0b0f14";

/** Bölümün vurgu çizgisi: kendi renginde ve altında koyu hâle */
function vurguCizgisi(id: string | null, s: SahneBolumleri, lay: BoardLayout, w: Dunya) {
  if (!id) return null;
  const kenarlar = vurguKenarlari(id, s, lay);
  if (!kenarlar.length) return null;
  return { renk: cizgiDizileri([{ kenarlar, renk: bolumRengi(id) }], w, PARCA_Y), hale: cizgiDizileri([{ kenarlar, renk: HALE }], w, PARCA_Y) };
}

/** Seçili bölüm: hâleli kalın çizgi, çerçeveliyse içi hafif dolgu; üstüne gelinen bölüm: daha ince */
function Vurgular({ s }: { s: SahneBolumleri }) {
  const { lay, w } = useDunya();
  const secili = useBolum((x) => x.secili);
  const ustunde = useBolum((x) => x.ustunde?.id ?? null);
  const sec = useMemo(() => vurguCizgisi(secili, s, lay, w), [secili, s, lay, w]);
  const ust = useMemo(() => (ustunde !== secili ? vurguCizgisi(ustunde, s, lay, w) : null), [ustunde, secili, s, lay, w]);
  const alan = useMemo(() => s.cerceveler.find((c) => c.id === secili) ?? null, [secili, s]);
  return (
    <>
      {sec && <KalinCizgi konum={sec.hale.konum} renk={sec.hale.renk} kalinlik={8} sira={36} />}
      {sec && <KalinCizgi konum={sec.renk.konum} renk={sec.renk.renk} kalinlik={4.5} sira={37} />}
      {ust && <KalinCizgi konum={ust.hale.konum} renk={ust.hale.renk} kalinlik={6} sira={36} />}
      {ust && <KalinCizgi konum={ust.renk.konum} renk={ust.renk.renk} kalinlik={3.2} sira={37} />}
      {alan && <Dolgu alanlar={alan.alanlar} renk={alan.renk} />}
    </>
  );
}

/** Seçili çerçevenin içi: bölgenin renginde hafif, saydam dolgu (tek çizim) */
function Dolgu({ alanlar, renk }: { alanlar: Kutu[]; renk: string }) {
  const { w } = useDunya();
  const obj = useMemo(() => {
    const pos: number[] = [];
    const idx: number[] = [];
    for (const k of alanlar) {
      const [x0, z0] = w(k.x, k.y);
      const [x1, z1] = w(k.x + k.w, k.y + k.h);
      const b = pos.length / 3;
      pos.push(x0, CIZGI_Y, z0, x1, CIZGI_Y, z0, x1, CIZGI_Y, z1, x0, CIZGI_Y, z1);
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    geo.setIndex(idx);
    const mat = new MeshBasicMaterial({ color: renk, transparent: true, opacity: 0.14, depthTest: false, depthWrite: false, side: DoubleSide });
    const m = new Mesh(geo, mat);
    m.renderOrder = 34;
    m.raycast = () => {};
    return { m, geo, mat };
  }, [alanlar, renk, w]);
  useEffect(() => () => {
    obj.geo.dispose();
    obj.mat.dispose();
  }, [obj]);
  return <primitive object={obj.m} />;
}

// ---------------------------------------------------------------- plakalar

/** Doku pikseli / yazı yüksekliği: bölge ve kart plakaları; modül plakaları (ekranda daha küçük, çok sayıda) */
const U_BOLGE = 72;
const U_MODUL = 40;

/**
 * Plakaları bir dokuya çizer (raf yerleşimi; aynı yazı ve renkteki plakalar dokuda bir kez) ve hepsini
 * tek ağda toplar
 */
function plakaAgi(plakalar: Plaka[], w: Dunya, U: number): { geo: BufferGeometry; doku: CanvasTexture; alfa: Float32Array } {
  const EN = 2048;
  const hucreler = new Map<string, { x: number; y: number; w: number; h: number; p: Plaka }>();
  const anahtar = (p: Plaka) => `${p.renk}|${p.satirlar.join("\n")}|${(p.w / p.h).toFixed(3)}`;
  let x = 0;
  let y = 0;
  let raf = 0;
  for (const p of plakalar) {
    if (hucreler.has(anahtar(p))) continue;
    const pw = Math.min(EN, Math.ceil((p.w / p.h) * U) + 4);
    const ph = Math.ceil((p.d / p.h) * U) + 4;
    if (x + pw > EN) {
      x = 0;
      y += raf;
      raf = 0;
    }
    hucreler.set(anahtar(p), { x, y, w: pw, h: ph, p });
    x += pw;
    raf = Math.max(raf, ph);
  }
  const yer = plakalar.map((p) => hucreler.get(anahtar(p))!);
  const cv = document.createElement("canvas");
  cv.width = EN;
  cv.height = Math.max(4, y + raf);
  const g = cv.getContext("2d")!;
  const yuvarla = (ox: number, oy: number, pw: number, ph: number, r: number) => {
    g.beginPath();
    g.roundRect(ox, oy, pw, ph, r);
  };
  for (const { x: ox0, y: oy0, w: pw0, h: ph0, p } of hucreler.values()) {
    const [ox, oy, pw, ph] = [ox0 + 2, oy0 + 2, pw0 - 4, ph0 - 4];
    const r = Math.min(0.3 * U, ph / 4);
    g.save();
    yuvarla(ox, oy, pw, ph, r);
    g.clip();
    g.fillStyle = "rgba(21, 26, 33, 0.94)";
    g.fillRect(ox, oy, pw, ph);
    g.fillStyle = p.renk;
    g.fillRect(ox, oy, PLAKA.serit * U, ph);
    g.restore();
    g.lineWidth = 2;
    g.strokeStyle = "rgba(255, 255, 255, 0.16)";
    yuvarla(ox + 1, oy + 1, pw - 2, ph - 2, r);
    g.stroke();
    g.fillStyle = "#ffffff";
    g.font = plakaYazisi(U);
    g.textBaseline = "alphabetic";
    g.textAlign = "left";
    p.satirlar.forEach((t, k) => {
      const orta = oy + (PLAKA.dikeyBosluk + 0.5 + k * PLAKA.satir) * U;
      // büyük harflerin ortası satırın ortasında (büyük harf yüksekliği ≈ 0,7 em)
      g.fillText(t, ox + (PLAKA.serit + PLAKA.solBosluk) * U, orta + 0.35 * U);
    });
  }
  const n = plakalar.length;
  const pos = new Float32Array(n * 12);
  const uv = new Float32Array(n * 8);
  const renk = new Float32Array(n * 16).fill(1);
  const idx: number[] = [];
  plakalar.forEach((p, i) => {
    const [cx, cz] = w(p.x, p.y);
    const hw = (p.w * S) / 2;
    const hd = (p.d * S) / 2;
    pos.set([cx - hw, PLAKA_Y, cz - hd, cx + hw, PLAKA_Y, cz - hd, cx + hw, PLAKA_Y, cz + hd, cx - hw, PLAKA_Y, cz + hd], i * 12);
    const { x: ox, y: oy, w: pw, h: ph } = yer[i];
    const [u0, u1] = [(ox + 2) / EN, (ox + pw - 2) / EN];
    const [v0, v1] = [1 - (oy + 2) / cv.height, 1 - (oy + ph - 2) / cv.height];
    uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
    const b = i * 4;
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("uv", new BufferAttribute(uv, 2));
  // köşe rengi dört bileşenli: dördüncüsü plakanın saydamlığı (LOD)
  geo.setAttribute("color", new BufferAttribute(renk, 4));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const doku = new CanvasTexture(cv);
  doku.colorSpace = SRGBColorSpace;
  doku.anisotropy = 8;
  // -1: ilk karede her plakanın saydamlığı yazılır
  return { geo, doku, alfa: new Float32Array(n).fill(-1) };
}

/** Plaka yazısının ekrandaki en büyük yüksekliği (px): daha yakında plaka küçülür */
const PLAKA_EN_BUYUK = { bolge: 30, kart: 40, modul: 22 } as const;

const egri = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const tmpV = new Vector3();
const ileri = new Vector3();

/** Ekranın dikey pikseli / dünya birimi, bir birim uzaklıkta */
const odakPikseli = (camera: PerspectiveCamera, yukseklik: number) => (yukseklik / 2 / Math.tan((camera.fov * Math.PI) / 360)) * camera.zoom;

/**
 * Plakaların saydamlığı, ekranda milimetre başına piksele göre (yazının okunurluğu ayrıca). Modül
 * plakası olan sahnede (breadboard) bölge plakaları yaklaşınca modüllere bırakır, modüller daha da
 * yaklaşınca (ayrıntılı kipte) kenar etiketlerine.
 */
function plakaSaydamligi(tur: Plaka["tur"], pikselMm: number, kip: EtiketKipi, moduller: boolean): number {
  if (tur === "kart") return 1;
  if (tur === "modul") return egri(1.0, 1.4, pikselMm) * (1 - (kip === "ayrintili" ? egri(3.2, 4.2, pikselMm) : egri(5, 7, pikselMm)));
  if (moduller) return 1 - egri(0.95, 1.35, pikselMm);
  return 1 - (kip === "ayrintili" ? egri(1.6, 2.5, pikselMm) : egri(4, 6, pikselMm));
}

function Plakalar({ s, plakalar, u }: { s: SahneBolumleri; plakalar: Plaka[]; u: number }) {
  const { w } = useDunya();
  const kip = useBolum((x) => x.kip);
  const bbKurulum = useBbKurulum((x) => x.acik);
  const pcbKurulum = useKurulum((x) => x.acik);
  const kurulum = bbKurulum || pcbKurulum;
  const moduller = s.modulPlakalari.length > 0;
  const ag = useMemo(() => plakaAgi(plakalar, w, u), [plakalar, w, u]);
  const mat = useMemo(() => new MeshBasicMaterial({ map: ag.doku, transparent: true, depthTest: false, depthWrite: false, vertexColors: true, side: DoubleSide }), [ag]);
  useEffect(() => () => {
    ag.geo.dispose();
    ag.doku.dispose();
    mat.dispose();
  }, [ag, mat]);
  const mesh = useMemo(() => {
    const m = new Mesh(ag.geo, mat);
    m.renderOrder = 40;
    m.frustumCulled = false;
    // yalnız görünen plakalar tıklanır
    m.raycast = (r: Raycaster, out: Intersection[]) => {
      const hits: Intersection[] = [];
      Mesh.prototype.raycast.call(m, r, hits);
      for (const h of hits) {
        const i = Math.floor((h.faceIndex ?? 0) / 2);
        if (ag.alfa[i] > 0.5) out.push({ ...h, instanceId: i });
      }
    };
    return m;
  }, [ag, mat]);
  const merkez = useMemo(() => plakalar.map((p) => {
    const [x, z] = w(p.x, p.y);
    return new Vector3(x, PLAKA_Y, z);
  }), [plakalar, w]);
  // plakanın ölçeği: yaklaşınca yazı ekranda en çok PLAKA_EN_BUYUK piksel kalır (bölgenin üstünü örtmesin)
  const olcek = useMemo(() => new Float32Array(plakalar.length).fill(1), [plakalar]);
  useFrame(({ camera, size }) => {
    const cam = camera as PerspectiveCamera;
    const f = odakPikseli(cam, size.height);
    cam.getWorldDirection(ileri);
    const renk = ag.geo.getAttribute("color") as BufferAttribute;
    const konum = ag.geo.getAttribute("position") as BufferAttribute;
    let degisti = false;
    let tasindi = false;
    plakalar.forEach((p, i) => {
      const derinlik = tmpV.copy(merkez[i]).sub(cam.position).dot(ileri);
      let a = 0;
      if (!kurulum && derinlik > 0.1) {
        const pikselMm = (f * S) / derinlik;
        const yazi = p.h * pikselMm;
        // ekranda okunamayacak kadar küçük plaka gösterilmez; yaklaşınca bir alt kata bırakır
        a = egri(9, 12, yazi) * plakaSaydamligi(p.tur, pikselMm, kip, moduller);
        const k = Math.min(1, PLAKA_EN_BUYUK[p.tur === "kart" ? "kart" : p.tur === "modul" ? "modul" : "bolge"] / yazi);
        if (Math.abs(k - olcek[i]) > 0.01) {
          olcek[i] = k;
          const hw = (p.w * S * k) / 2;
          const hd = (p.d * S * k) / 2;
          const { x, z } = merkez[i];
          konum.array.set([x - hw, PLAKA_Y, z - hd, x + hw, PLAKA_Y, z - hd, x + hw, PLAKA_Y, z + hd, x - hw, PLAKA_Y, z + hd], i * 12);
          tasindi = true;
        }
      }
      if (Math.abs(a - ag.alfa[i]) > 0.01 || (a === 0) !== (ag.alfa[i] === 0) || (a === 1) !== (ag.alfa[i] === 1)) {
        ag.alfa[i] = a;
        for (let k = 0; k < 4; k++) renk.setW(i * 4 + k, a * 0.97);
        degisti = true;
      }
    });
    if (degisti) renk.needsUpdate = true;
    if (tasindi) konum.needsUpdate = true;
  });
  const plakaId = (e: ThreeEvent<PointerEvent | MouseEvent>) => plakalar[e.instanceId ?? -1]?.id ?? null;
  return (
    <primitive
      object={mesh}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        const id = plakaId(e);
        if (!id) return;
        useBolum.getState().ustundeSec({ id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
        useKart.setState({ hover: null });
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        useBolum.getState().ustundeSec(null);
        document.body.style.cursor = "";
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        const id = plakaId(e);
        if (id) useBolum.getState().sec(id, true);
      }}
    />
  );
}

// ---------------------------------------------------------------- kamera: seçilen bölüme

function BolumUcusu({ s }: { s: SahneBolumleri }) {
  const controls = useThree((x) => x.controls) as OrbitControlsImpl | null;
  const camera = useThree((x) => x.camera);
  const ucus = useBolum((x) => x.ucus);
  const { lay, w } = useDunya();
  const anim = useRef<{ target: Vector3; cam: Vector3; t0: Vector3; c0: Vector3; t: number } | null>(null);
  useEffect(() => {
    if (!ucus || !controls) return;
    const k = bolumKutusu(ucus.id, s, lay);
    if (!k) return;
    const [ax, az] = w(k.x, k.y);
    const [bx, bz] = w(k.x + k.w, k.y + k.h);
    // bilgisayarda sağ üstte VGA paneli: hedef biraz sağa kayar (CameraFly ile aynı)
    const kay = aktifKart() === "cpu16" ? 0.1 : 0;
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
        return Math.abs(v.x) <= 0.9 && Math.abs(v.y) <= 0.88;
      });
    };
    let d = 6;
    while (d < 240 && !sigar(d)) d *= 1.06;
    const tx = (ax + bx) / 2 + d * kay;
    anim.current = { target: new Vector3(tx, 0.3, tz), cam: new Vector3(tx, 0.3 + d * 0.8, tz + d * 0.6), t0: controls.target.clone(), c0: camera.position.clone(), t: 0 };
  }, [ucus, controls, camera, s, lay, w]);
  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = ucusAdimi(a.t, dt, 1.4);
    const k = 1 - Math.pow(1 - a.t, 3);
    controls.target.lerpVectors(a.t0, a.target, k);
    camera.position.lerpVectors(a.c0, a.cam, k);
    controls.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

// ---------------------------------------------------------------- kenar etiketleri: ekrandaki yerleri

export interface KenarEtiketi {
  id: string;
  etiket: string;
  renk: string;
  taraf: "sol" | "sag";
  /** kutunun iç kenarı (x; solda sağ kenarı, sağda sol kenarı), üstü (y) ve boyu, sahnenin pikseli */
  x: number;
  y: number;
  h: number;
  /** grubun ekranda görünen parçaları: dörtgenleri ve ortaları */
  parcalar: { kose: [number, number][]; orta: [number, number] }[];
}

interface KenarDurumu {
  etiketler: KenarEtiketi[];
}

export const useKenar = create<KenarDurumu>(() => ({ etiketler: [] }));

/** Kenar kutusunun boyu, aralarındaki boşluk, sütunların ekran kenarına uzaklığı ve tahmini eni (px; yazı boyutuyla büyür) */
export const KUTU = { h: 30, ara: 6, kenar: 14, en: 216 } as const;
/** Kenar etiketleri çiplerin ekranda en az bu kadar büyük olduğu yerde (piksel / mm); breadboard'da modül plakaları sönünce */
const KENAR_ESIGI = { pcb: 1.3, modul: 3.4 } as const;
/** Bir sütunda en çok bu kadar kenar etiketi: ekranın ortasına en yakın gruplar */
const SUTUN_EN_COK = 8;

interface GrupYeri {
  id: string;
  etiket: string;
  renk: string;
  kart: string;
  /** parçaların ortası ve dört köşesi (dünya birimi) */
  parcalar: { orta: Vector3; kose: Vector3[] }[];
}

function KenarHesabi({ s }: { s: SahneBolumleri }) {
  const { lay, w } = useDunya();
  const kip = useBolum((x) => x.kip);
  const bbKurulum = useBbKurulum((x) => x.acik);
  const pcbKurulum = useKurulum((x) => x.acik);
  const kurulum = bbKurulum || pcbKurulum;
  const gl = useThree((x) => x.gl);
  const dil = useDil();
  const gruplar = useMemo<GrupYeri[]>(() => {
    // çiplerin üstü 0,37, pasiflerin üstü ≈ 0,12 dünya birimi
    const yer = new Map<string, { k: Kutu; y: number }>([...lay.chips.map((c) => [c.ref, { k: c, y: 0.37 }] as const), ...lay.passives.map((p) => [p.ref, { k: p, y: 0.12 }] as const)]);
    return bolumleri(katalog(), "grup").map((g) => ({
      id: g.id,
      etiket: bolumMetni(g, dil).etiket,
      renk: bolumRengi(g.id),
      kart: g.kart,
      parcalar: g.refs.flatMap((r) => {
        const p = yer.get(r);
        if (!p) return [];
        const [x0, z0] = w(p.k.x, p.k.y);
        const [x1, z1] = w(p.k.x + p.k.w, p.k.y + p.k.h);
        return [{ orta: new Vector3((x0 + x1) / 2, p.y, (z0 + z1) / 2), kose: [new Vector3(x0, p.y, z0), new Vector3(x1, p.y, z0), new Vector3(x1, p.y, z1), new Vector3(x0, p.y, z1)] }];
      }),
    })).filter((g) => g.parcalar.length > 0);
  }, [lay, w, dil]);
  const kartKoseleri = useMemo(() => new Map([...s.kartKutusu].map(([k, b]) => {
    const [x0, z0] = w(b.x, b.y);
    const [x1, z1] = w(b.x + b.w, b.y + b.h);
    return [k, [new Vector3(x0, 0, z0), new Vector3(x1, 0, z0), new Vector3(x1, 0, z1), new Vector3(x0, 0, z1)]] as const;
  })), [s, w]);
  const son = useRef({ anahtar: "", engel: null as { x0: number; x1: number; y1: number } | null, engelZamani: -1, olcek: 1, imza: [] as number[], secili: null as string | null });
  // sahne ya da dil değişince kamera kıpırdamasa da yeniden hesaplanır
  useEffect(() => {
    son.current.anahtar = "";
    son.current.imza = [];
    return () => useKenar.setState({ etiketler: [] });
  }, [s, gruplar]);
  useFrame(({ camera, size, clock }) => {
    const durum = son.current;
    if (kip !== "ayrintili" || kurulum) {
      if (durum.anahtar !== "") {
        durum.anahtar = "";
        useKenar.setState({ etiketler: [] });
      }
      return;
    }
    const cam = camera as PerspectiveCamera;
    const W = size.width;
    const H = size.height;
    const f = odakPikseli(cam, H);
    cam.getWorldDirection(ileri);
    const ekran = (p: Vector3): [number, number] => {
      tmpV.copy(p).project(cam);
      return [((tmpV.x + 1) / 2) * W, ((1 - tmpV.y) / 2) * H];
    };
    // VGA paneli (ya da onu açan düğme) sağ sütunun üstünü kapatır: yeri yarım saniyede bir okunur
    const t = clock.getElapsedTime();
    if (durum.engelZamani < 0 || t - durum.engelZamani > 0.5) {
      durum.engelZamani = t;
      // "Yazı boyutu: büyük" kökün yazısını büyütür; kutular da büyür
      durum.olcek = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;
      const sahne = gl.domElement.closest(".stage");
      const e = sahne?.querySelector(".vga-panel, .vga-open");
      if (sahne && e) {
        const a = sahne.getBoundingClientRect();
        const b = e.getBoundingClientRect();
        durum.engel = { x0: b.left - a.left, x1: b.right - a.left, y1: b.bottom - a.top };
      } else durum.engel = null;
    }
    const secili = useBolum.getState().secili;
    // kamera, tuval ve seçim değişmediyse yeniden hesaplanmaz
    const e0 = durum.engel;
    const imza = [...cam.matrixWorld.elements, cam.projectionMatrix.elements[0], cam.projectionMatrix.elements[5], W, H, durum.olcek, e0?.y1 ?? -1, gruplar.length];
    if (durum.anahtar !== "" && imza.length === durum.imza.length && imza.every((v, i) => v === durum.imza[i]) && secili === durum.secili) return;
    durum.imza = imza;
    durum.secili = secili;
    const esik = s.modulPlakalari.length ? KENAR_ESIGI.modul : KENAR_ESIGI.pcb;
    const merkezX = W / 2;
    const merkezY = H / 2;
    const adaylar: { g: GrupYeri; gorunen: { kose: [number, number][]; orta: [number, number] }[]; ax: number; ay: number; oncelik: number }[] = [];
    for (const g of gruplar) {
      const gorunen: { kose: [number, number][]; orta: [number, number] }[] = [];
      let pikselMm = 0;
      for (const p of g.parcalar) {
        const derinlik = tmpV.copy(p.orta).sub(cam.position).dot(ileri);
        if (derinlik < 0.2) continue;
        const orta = ekran(p.orta);
        if (orta[0] < 0 || orta[0] > W || orta[1] < 0 || orta[1] > H) continue;
        pikselMm = Math.max(pikselMm, (f * S) / derinlik);
        gorunen.push({ orta, kose: p.kose.map(ekran) });
      }
      if (!gorunen.length || pikselMm < esik) continue;
      const ax = gorunen.reduce((a, p) => a + p.orta[0], 0) / gorunen.length;
      const ay = gorunen.reduce((a, p) => a + p.orta[1], 0) / gorunen.length;
      adaylar.push({ g, gorunen, ax, ay, oncelik: g.id === secili ? -1 : Math.hypot(ax - merkezX, (ay - merkezY) * 1.3) });
    }
    adaylar.sort((a, b) => a.oncelik - b.oncelik);
    // sütunlar: panonun (kartın) hemen dışında; pano ekranı taşıyorsa ekranın kenarında
    let minX = Infinity;
    let maxX = -Infinity;
    for (const k of new Set(adaylar.map((a) => a.g.kart))) {
      for (const p of kartKoseleri.get(k) ?? []) {
        const [x] = ekran(p);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
    const kh = KUTU.h * durum.olcek;
    const ke = KUTU.en * durum.olcek;
    const solX = Math.min(merkezX - 40, Math.max(KUTU.kenar + ke, minX - 16));
    const sagX = Math.max(merkezX + 40, Math.min(W - KUTU.kenar - ke, maxX + 16));
    const e = durum.engel;
    const sagUst = e && e.x0 < sagX + ke && e.x1 > sagX ? e.y1 + 12 : KUTU.kenar;
    const sinir = { sol: [KUTU.kenar, H - KUTU.kenar], sag: [sagUst, H - KUTU.kenar] } as const;
    const kap = {
      sol: Math.min(SUTUN_EN_COK, kapasite(sinir.sol[0], sinir.sol[1], kh, KUTU.ara)),
      sag: Math.min(SUTUN_EN_COK, kapasite(sinir.sag[0], sinir.sag[1], kh, KUTU.ara)),
    };
    const sutun: Record<"sol" | "sag", typeof adaylar> = { sol: [], sag: [] };
    for (const a of adaylar) {
      const ilk: "sol" | "sag" = a.ax < merkezX ? "sol" : "sag";
      const obur = ilk === "sol" ? "sag" : "sol";
      if (sutun[ilk].length < kap[ilk]) sutun[ilk].push(a);
      else if (sutun[obur].length < kap[obur]) sutun[obur].push(a);
    }
    const etiketler: KenarEtiketi[] = [];
    for (const taraf of ["sol", "sag"] as const) {
      const yer = kenarYerlesimi(sutun[taraf].map((a) => ({ id: a.g.id, y: a.ay })), sinir[taraf][0], sinir[taraf][1], kh, KUTU.ara);
      for (const a of sutun[taraf]) {
        etiketler.push({ id: a.g.id, etiket: a.g.etiket, renk: a.g.renk, taraf, x: taraf === "sol" ? solX : sagX, y: yer.get(a.g.id)!, h: kh, parcalar: a.gorunen });
      }
    }
    const r = (v: number) => Math.round(v);
    const anahtar = etiketler.map((x) => `${x.id}:${r(x.x)},${r(x.y)}:${x.parcalar.map((p) => p.kose.map(([a, b]) => `${r(a)},${r(b)}`).join(" ")).join("|")}`).join(";") || "-";
    if (anahtar === durum.anahtar) return;
    durum.anahtar = anahtar;
    useKenar.setState({ etiketler });
  });
  return null;
}

// ---------------------------------------------------------------- konsol ve otomatik testler

/**
 * window.kart / window.hesap'a bölüm işlevleri: kart.bolum("grup:cpu:r0") seçer (kamera gider),
 * kart.etiketler("bolumler") kipi değiştirir, kart.bolumler("bolge") listeler, kart.plakaEkranda(id)
 * plakanın ortasının sayfadaki yerini, kart.kenarEtiketleri() ekrandaki kenar etiketlerini verir.
 */
function BolumApi({ s }: { s: SahneBolumleri }) {
  const camera = useThree((x) => x.camera);
  const gl = useThree((x) => x.gl);
  const { w } = useDunya();
  useEffect(() => {
    const api = {
      bolum: (id?: string | null) => {
        if (id !== undefined) useBolum.getState().sec(id, true);
        return useBolum.getState().secili;
      },
      etiketler: (k?: EtiketKipi) => {
        if (k) useBolum.getState().kipSec(k);
        return useBolum.getState().kip;
      },
      bolumler: (tur?: BolumTuru) => [...katalog().bolumler.values()].filter((b) => !tur || b.tur === tur).map((b) => `${b.id} · ${bolumMetni(b, useAyar.getState().dil).etiket}`),
      plakaEkranda: (id: string) => {
        const p = s.plakalar.find((x) => x.id === id);
        if (!p) return null;
        const [x, z] = w(p.x, p.y);
        const v = new Vector3(x, PLAKA_Y, z).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: Math.round(r.left + ((v.x + 1) / 2) * r.width), y: Math.round(r.top + ((1 - v.y) / 2) * r.height) };
      },
      kenarEtiketleri: () => useKenar.getState().etiketler.map((e) => e.id),
    };
    const ekle = () => {
      const k = (window as unknown as Record<string, Record<string, unknown> | undefined>)[aktifKart() === "hesap" ? "hesap" : "kart"];
      if (k && k.plakaEkranda !== api.plakaEkranda) Object.assign(k, api);
    };
    ekle();
    const id = window.setInterval(ekle, 500);
    return () => window.clearInterval(id);
  }, [camera, gl, s, w]);
  return null;
}

// ---------------------------------------------------------------- hepsi

/** Sahnedeki kartın bölüm katmanı. Etiket kipi kapalıyken de seçili bölüm vurgulanır ve kamera ona gider. */
export function Bolumler3D() {
  const kip = useBolum((x) => x.kip);
  const gorunum = useKart((x) => x.gorunum);
  const dil = useDil();
  const s = useMemo(() => sahneDili(sahneBolumleri(aktifKart(), gorunum), dil), [gorunum, dil]);
  return (
    <group>
      {kip !== "kapali" && (
        <>
          <Cerceveler s={s} />
          <Plakalar s={s} plakalar={s.plakalar} u={U_BOLGE} />
          {s.modulPlakalari.length > 0 && <Plakalar s={s} plakalar={s.modulPlakalari} u={U_MODUL} />}
          <KenarHesabi s={s} />
        </>
      )}
      <Vurgular s={s} />
      <BolumUcusu s={s} />
      <BolumApi s={s} />
    </group>
  );
}
