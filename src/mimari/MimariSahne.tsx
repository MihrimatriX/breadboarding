// Mimari diyagramının sahnesi: SVG çizimi, kaydırma / yakınlaştırma, üstüne gelince vurgulama, seçim.
//
// Çizim cpu16/mimari/agac.ts'in öğe ağacından (belge çıktısıyla aynı ağaç); renkler temanın
// belirteçleri (svgStili(CSS_PALETI)). Ağaç bir kez çizilir; üstüne gelince değişen yalnız küçük bir
// <style>: seçilmeyenler soluklaşır, kutu ve yolları tam renkte kalır.
//
// Fare: tekerlek imlecin olduğu yere yakınlaştırır, sürükleme kaydırır, tıklama seçer (4 pikselden
// az kayma tıklama sayılır). Dokunmatik: tek parmak kaydırır, iki parmak yakınlaştırır. Klavye: kutular
// Tab ile gezilir (görünüme kaydırılır), Enter seçer; sahne odaktayken oklar kaydırır.

import { createElement, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent as RFocusEvent, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { agac, CSS_PALETI, svgStili, type Oge } from "../../cpu16/mimari/agac.ts";
import type { Sahne } from "../../cpu16/mimari/cizim.ts";
import type { Vurgu } from "../../cpu16/mimari/iliski.ts";

export type Hedef = { tur: "kutu" | "yol"; id: string };

export const ayniHedef = (a: Hedef | null, b: Hedef | null): boolean => a === b || (!!a && !!b && a.tur === b.tur && a.id === b.id);

// ---------------------------------------------------------------- görünüm (kaydırma, yakınlaştırma)

export interface Gorunum {
  /** ölçek: diyagram birimi → ekran pikseli */
  s: number;
  x: number;
  y: number;
}

export interface GorunumDenetimi {
  g: Gorunum | null;
  /** sahneye sığan ölçek */
  sigan: number;
  sigdir(): void;
  yakinlas(k: number, px?: number, py?: number): void;
  kaydir(dx: number, dy: number): void;
  /** ölçeği ve konumu doğrudan yaz (sürükleme, iki parmak) */
  yaz(g: Gorunum): void;
  /** diyagramdaki dikdörtgen ekranda değilse görünüme kaydır */
  gorunurYap(r: { x: number; y: number; w: number; h: number }): void;
  /** sahnenin piksel boyutu */
  boyut: { W: number; H: number } | null;
  olcu: (el: HTMLElement | null) => void;
}

const EN_BUYUK = 4;

/** Görünümün durumu: sahnenin boyutu ölçülür, kullanıcı dokunana dek diyagram sahneye sığdırılır */
export function useGorunum(w: number, h: number, anahtar: string): GorunumDenetimi {
  const [boyut, setBoyut] = useState<{ W: number; H: number } | null>(null);
  const [g, setG] = useState<Gorunum | null>(null);
  const elle = useRef(false);
  const gozlemci = useRef<ResizeObserver | null>(null);
  // kenar payı; altta bilgi satırına yer kalır
  const pay = boyut && boyut.W < 600 ? 10 : 24;
  const altPay = boyut && boyut.W < 600 ? 44 : 64;
  const sigan = boyut ? Math.max(0.05, Math.min((boyut.W - 2 * pay) / w, (boyut.H - pay - altPay) / h)) : 1;

  /** diyagram sahneden tamamen kaçmasın: her kenarda en az 80 piksel görünür kalır */
  const sinirla = useCallback(
    (x: Gorunum): Gorunum => {
      if (!boyut) return x;
      const s = Math.min(EN_BUYUK, Math.max(sigan * 0.5, x.s));
      const kal = 80;
      return {
        s,
        x: Math.min(boyut.W - kal, Math.max(kal - w * s, x.x)),
        y: Math.min(boyut.H - kal, Math.max(kal - h * s, x.y)),
      };
    },
    [boyut, sigan, w, h],
  );

  const sigdir = useCallback(() => {
    if (!boyut) return;
    elle.current = false;
    setG({ s: sigan, x: (boyut.W - w * sigan) / 2, y: pay + (boyut.H - pay - altPay - h * sigan) / 2 });
  }, [boyut, sigan, w, h, pay, altPay]);

  // diyagram değişince ve kullanıcı dokunmadıysa sahne boyu değişince yeniden sığdır
  useLayoutEffect(() => {
    elle.current = false;
  }, [anahtar]);
  useLayoutEffect(() => {
    if (!elle.current) sigdir();
  }, [sigdir, anahtar]);

  const olcu = useCallback((el: HTMLElement | null) => {
    gozlemci.current?.disconnect();
    gozlemci.current = null;
    if (!el) return;
    const yaz = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setBoyut((b) => (b && b.W === r.width && b.H === r.height ? b : { W: r.width, H: r.height }));
    };
    yaz();
    gozlemci.current = new ResizeObserver(yaz);
    gozlemci.current.observe(el);
  }, []);

  const yakinlas = useCallback(
    (k: number, px?: number, py?: number) => {
      if (!boyut) return;
      elle.current = true;
      setG((o) => {
        if (!o) return o;
        const s = Math.min(EN_BUYUK, Math.max(sigan * 0.5, o.s * k));
        const kk = s / o.s;
        const cx = px ?? boyut.W / 2;
        const cy = py ?? boyut.H / 2;
        return sinirla({ s, x: cx - (cx - o.x) * kk, y: cy - (cy - o.y) * kk });
      });
    },
    [boyut, sigan, sinirla],
  );
  const kaydir = useCallback(
    (dx: number, dy: number) => {
      elle.current = true;
      setG((o) => (o ? sinirla({ ...o, x: o.x + dx, y: o.y + dy }) : o));
    },
    [sinirla],
  );
  const yaz = useCallback(
    (x: Gorunum) => {
      elle.current = true;
      setG(sinirla(x));
    },
    [sinirla],
  );
  const gorunurYap = useCallback(
    (r: { x: number; y: number; w: number; h: number }) => {
      if (!boyut) return;
      setG((o) => {
        if (!o) return o;
        const p = 24;
        const sx = o.x + r.x * o.s;
        const sy = o.y + r.y * o.s;
        const ex = sx + r.w * o.s;
        const ey = sy + r.h * o.s;
        let dx = 0;
        let dy = 0;
        if (ex > boyut.W - p) dx = boyut.W - p - ex;
        if (sx + dx < p) dx = p - sx;
        if (ey > boyut.H - p) dy = boyut.H - p - ey;
        if (sy + dy < p) dy = p - sy;
        if (!dx && !dy) return o;
        elle.current = true;
        return sinirla({ ...o, x: o.x + dx, y: o.y + dy });
      });
    },
    [boyut, sinirla],
  );
  return { g, sigan, sigdir, yakinlas, kaydir, yaz, gorunurYap, boyut, olcu };
}

// ---------------------------------------------------------------- öğe ağacından React

const OZ_ADI: Record<string, string> = { class: "className", "text-anchor": "textAnchor", "stroke-width": "strokeWidth" };

function ogeCiz(o: Oge, key: number, adlar: ReadonlyMap<string, string>): ReactNode {
  const props: Record<string, unknown> = { key };
  for (const [k, v] of Object.entries(o.a ?? {})) if (v !== undefined && v !== "") props[OZ_ADI[k] ?? k] = v;
  const kutu = o.a?.["data-kutu"];
  if (o.t === "g" && typeof kutu === "string") {
    // kutular ve kart çerçeveleri klavyeyle gezilir
    props.tabIndex = 0;
    props.role = "button";
    props["aria-label"] = adlar.get(kutu) ?? kutu;
  }
  const cocuklar = o.m !== undefined ? o.m : o.c?.map((c, i) => ogeCiz(c, i, adlar));
  return createElement(o.t, props, cocuklar);
}

/** Diyagramın kendisi: yalnız diyagram değişince yeniden çizilir */
const Cizim = memo(function Cizim({ sahne, adlar }: { sahne: Sahne; adlar: ReadonlyMap<string, string> }) {
  const kok = useMemo(() => agac(sahne, { baslikGoster: false }), [sahne]);
  return <>{kok.c?.map((c, i) => ogeCiz(c, i, adlar))}</>;
});

/** Diyagramın görünüş stili (uygulamada temanın belirteçleriyle); bütün diyagramlarda aynı */
const STIL = svgStili(CSS_PALETI);

/** Vurgu: seçili olmayanlar soluk; vurgulananlar ve hedef tam renkte */
function vurguStili(v: Vurgu | null, hedef: Hedef | null): string {
  if (!v) return "";
  const kok = ".mm-sahne.mm-vurgulu";
  const parcalar = [
    ...[...v.kutular].map((id) => `${kok} [data-kutu="${id}"]`),
    ...[...v.yollar].map((id) => `${kok} [data-yol="${id}"]`),
  ];
  let s = parcalar.length ? `${parcalar.join(",\n")} { opacity: 1; }\n` : "";
  if (hedef?.tur === "kutu") s += `${kok} .mm-kutu[data-kutu="${hedef.id}"] .mm-kutu-govde { stroke-width: 3.5; }\n`;
  if (hedef?.tur === "yol") s += `${kok} [data-yol="${hedef.id}"] .mm-t-etiket { font-size: 13.5px; }\n`;
  return s;
}

/** Bir öğenin hedefi: içinde durduğu kutu / çerçeve ya da yol */
function hedefBul(el: EventTarget | null): Hedef | null {
  const e = el as Element | null;
  if (!e?.closest) return null;
  const k = e.closest("[data-kutu]");
  if (k) return { tur: "kutu", id: k.getAttribute("data-kutu")! };
  const y = e.closest("[data-yol]");
  if (y) return { tur: "yol", id: y.getAttribute("data-yol")! };
  return null;
}

// ---------------------------------------------------------------- sahne

export interface SahneOzellikleri {
  sahne: Sahne;
  /** kutu / çerçeve kimliği → okunur ad (ekran okuyucu, Tab ile gezme) */
  adlar: ReadonlyMap<string, string>;
  gorunum: GorunumDenetimi;
  vurgu: Vurgu | null;
  /** vurgunun hedefi (üstüne gelinen ya da seçili) */
  hedef: Hedef | null;
  secim: Hedef | null;
  sec: (h: Hedef | null) => void;
  /** üstüne gelinen değişti (fare ya da klavye odağı) */
  uzerinde: (h: Hedef | null) => void;
  /** "ayrıntı ›" ya da çift tıklama: kutunun ayrıntılı diyagramı */
  ayrintiAc: (id: string) => void;
  etiket: string;
  /** sahnenin altındaki bilgi satırı */
  bilgi: ReactNode;
}

export function MimariSahne({ sahne, adlar, gorunum, vurgu, hedef, secim, sec, uzerinde, ayrintiAc, etiket, bilgi }: SahneOzellikleri) {
  const svg = useRef<SVGSVGElement>(null);
  const isaretler = useRef(new Map<number, { x: number; y: number }>());
  const surukleme = useRef<{ x0: number; y0: number; g: Gorunum; hareket: boolean; hedef: Hedef | null; ayrinti: string | null } | null>(null);
  const tutam = useRef<{ d0: number; g: Gorunum; mx: number; my: number } | null>(null);
  const sonTik = useRef<{ t: number; id: string } | null>(null);
  const [suruklenyor, setSurukleniyor] = useState(false);
  const { g } = gorunum;

  // tekerlek: React'in onWheel'i pasif, sayfa kaymasın diye elle bağlanır
  const yakinlas = gorunum.yakinlas;
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const tekerlek = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const birim = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      // dokunmatik yüzeyde iki parmak sıkıştırma ctrl + tekerlek olarak gelir: daha duyarlı
      const k = Math.exp(-e.deltaY * birim * (e.ctrlKey ? 0.01 : 0.0015));
      yakinlas(k, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", tekerlek, { passive: false });
    return () => el.removeEventListener("wheel", tekerlek);
  }, [yakinlas]);

  const yerel = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!g) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isaretler.current.set(e.pointerId, yerel(e));
    if (isaretler.current.size === 1) {
      const t = e.target as Element;
      const ayrinti = t.classList?.contains("mm-t-grup-link") ? t.closest("[data-ayrinti]")?.getAttribute("data-ayrinti") ?? null : null;
      surukleme.current = { x0: e.clientX, y0: e.clientY, g, hareket: false, hedef: hedefBul(e.target), ayrinti };
    } else if (isaretler.current.size === 2) {
      const [a, b] = [...isaretler.current.values()];
      tutam.current = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, g, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (surukleme.current) surukleme.current.hareket = true;
    }
  };
  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (!isaretler.current.has(e.pointerId)) return;
    isaretler.current.set(e.pointerId, yerel(e));
    const t = tutam.current;
    if (t && isaretler.current.size >= 2) {
      const [a, b] = [...isaretler.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const s = t.g.s * (d / t.d0);
      // tutamın ortasındaki diyagram noktası parmakların ortasında kalır
      const wx = (t.mx - t.g.x) / t.g.s;
      const wy = (t.my - t.g.y) / t.g.s;
      gorunum.yaz({ s, x: mx - wx * s, y: my - wy * s });
      return;
    }
    const s = surukleme.current;
    if (!s) return;
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    if (!s.hareket && Math.hypot(dx, dy) > 4) {
      s.hareket = true;
      setSurukleniyor(true);
      uzerinde(null);
    }
    if (s.hareket) gorunum.yaz({ ...s.g, x: s.g.x + dx, y: s.g.y + dy });
  };
  const birak = (e: RPointerEvent<SVGSVGElement>, iptal: boolean) => {
    isaretler.current.delete(e.pointerId);
    if (isaretler.current.size < 2) tutam.current = null;
    if (isaretler.current.size > 0) return;
    const s = surukleme.current;
    surukleme.current = null;
    setSurukleniyor(false);
    if (!s || s.hareket || iptal) return;
    if (s.ayrinti) {
      ayrintiAc(s.ayrinti);
      return;
    }
    // aynı kutuya iki kez tıklama: ayrıntılı diyagram (varsa)
    const simdi = performance.now();
    const h = s.hedef;
    if (h?.tur === "kutu" && sonTik.current && sonTik.current.id === h.id && simdi - sonTik.current.t < 400) {
      const a = svg.current?.querySelector(`[data-kutu="${h.id}"]`)?.getAttribute("data-ayrinti");
      if (a) {
        sonTik.current = null;
        ayrintiAc(a);
        return;
      }
    }
    sonTik.current = h?.tur === "kutu" ? { t: simdi, id: h.id } : null;
    sec(h);
  };

  const onKeyDown = (e: RKeyboardEvent<SVGSVGElement>) => {
    const h = hedefBul(e.target);
    if ((e.key === "Enter" || e.key === " ") && h) {
      e.preventDefault();
      sec(h);
      return;
    }
    const adim = 60;
    const ok: Record<string, [number, number]> = { ArrowLeft: [adim, 0], ArrowRight: [-adim, 0], ArrowUp: [0, adim], ArrowDown: [0, -adim] };
    const d = ok[e.key];
    if (d) {
      e.preventDefault();
      gorunum.kaydir(d[0], d[1]);
    }
  };

  // Tab ile gelinen kutu görünüme kaydırılır ve vurgulanır
  const onFocus = (e: RFocusEvent<SVGSVGElement>) => {
    const h = hedefBul(e.target);
    if (!h || h.tur !== "kutu") return;
    if (!(e.target as Element).matches?.(":focus-visible")) return;
    const r = sahne.kutular.find((k) => k.id === h.id) ?? sahne.gruplar.find((k) => k.id === h.id);
    if (r) gorunum.gorunurYap(r);
    uzerinde(h);
  };

  const secili = secim?.tur === "kutu" ? sahne.kutular.find((k) => k.id === secim.id) ?? sahne.gruplar.find((k) => k.id === secim.id) : undefined;

  return (
    <>
      <svg
        ref={svg}
        className={`mm-sahne${vurgu ? " mm-vurgulu" : ""}${suruklenyor ? " mm-surukle" : ""}`}
        role="group"
        aria-roledescription="diyagram"
        aria-label={etiket}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => birak(e, false)}
        onPointerCancel={(e) => birak(e, true)}
        onPointerOver={(e) => {
          if (e.pointerType !== "touch" && !surukleme.current) uzerinde(hedefBul(e.target));
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "touch") uzerinde(null);
        }}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={() => uzerinde(null)}
      >
        <style>{STIL}</style>
        <style>{vurguStili(vurgu, hedef)}</style>
        {g && (
          <g transform={`translate(${g.x} ${g.y}) scale(${g.s})`}>
            <Cizim sahne={sahne} adlar={adlar} />
            {secili && <rect className="mm-secim" x={secili.x - 5} y={secili.y - 5} width={secili.w + 10} height={secili.h + 10} rx={12} />}
          </g>
        )}
      </svg>
      {bilgi && <div className="mm-bilgi" aria-live="polite">{bilgi}</div>}
    </>
  );
}
