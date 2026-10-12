// Görünüm ayarları: tema (sistem / koyu / açık), yazı boyutu (normal / büyük) ve odak modu (yan ve alt
// paneller gizli, sahne tam). Tercihler tarayıcıda saklanır; tema seçilmemişse işletim sisteminin
// tercihi izlenir (sistem değişince sayfa da değişir). Ayarlar <html> öğesine data-tema, data-boyut ve
// data-odak olarak yazılır; styles.css belirteçleri bunlara göre değişir. index.html'deki küçük betik
// aynı anahtarları ilk boyamadan önce okur ki sayfa açılırken yanlış temada parlamasın.
//
// Kısayollar (yazı alanlarında ve klavyeyi karta ileten ekranlarda değil): T tema, Y yazı boyutu,
// F odak modu.

import { useEffect } from "react";
import { create } from "zustand";

export type TemaSecimi = "sistem" | "koyu" | "acik";
export type Tema = "koyu" | "acik";
export type YaziBoyutu = "normal" | "buyuk";

const ANAHTAR = { tema: "silikon3d.tema", boyut: "silikon3d.boyut", odak: "silikon3d.odak" } as const;

function oku(anahtar: string): string | null {
  try {
    return localStorage.getItem(anahtar);
  } catch {
    // depolama kapalı: varsayılanlar
    return null;
  }
}

function yaz(anahtar: string, deger: string | null): void {
  try {
    if (deger === null) localStorage.removeItem(anahtar);
    else localStorage.setItem(anahtar, deger);
  } catch {
    // depolama kapalı: tercih yalnız bu oturumda geçerli
  }
}

const sistemSorgusu = (): MediaQueryList | null =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: light)") : null;

function sistemTemasi(): Tema {
  return sistemSorgusu()?.matches ? "acik" : "koyu";
}

function ilkSecim(): TemaSecimi {
  const t = oku(ANAHTAR.tema);
  return t === "koyu" || t === "acik" ? t : "sistem";
}

interface Ayarlar {
  secim: TemaSecimi;
  /** seçim "sistem" ise işletim sisteminin teması */
  tema: Tema;
  boyut: YaziBoyutu;
  odak: boolean;
  temaSec(t: TemaSecimi): void;
  /** koyu ↔ açık (sistem seçiliyse görünenin tersi) */
  temaDegistir(): void;
  boyutSec(b: YaziBoyutu): void;
  odakSec(on: boolean): void;
}

export const useAyar = create<Ayarlar>((set, get) => {
  const secim = ilkSecim();
  return {
    secim,
    tema: secim === "sistem" ? sistemTemasi() : secim,
    boyut: oku(ANAHTAR.boyut) === "buyuk" ? "buyuk" : "normal",
    odak: oku(ANAHTAR.odak) === "1",
    temaSec(t) {
      yaz(ANAHTAR.tema, t === "sistem" ? null : t);
      set({ secim: t, tema: t === "sistem" ? sistemTemasi() : t });
    },
    temaDegistir() {
      get().temaSec(get().tema === "koyu" ? "acik" : "koyu");
    },
    boyutSec(b) {
      yaz(ANAHTAR.boyut, b);
      set({ boyut: b });
    },
    odakSec(on) {
      yaz(ANAHTAR.odak, on ? "1" : "0");
      set({ odak: on });
    },
  };
});

/** <html> öğesindeki işaretler: CSS bunlara bakar */
function uygula(a: Pick<Ayarlar, "tema" | "boyut" | "odak">): void {
  const kok = document.documentElement;
  kok.dataset.tema = a.tema;
  kok.dataset.boyut = a.boyut;
  kok.dataset.odak = a.odak ? "1" : "0";
  kok.style.colorScheme = a.tema === "acik" ? "light" : "dark";
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = a.tema === "acik" ? "#f7f8fa" : "#1b1f25";
}

/** Klavyeyi başka bir şeye ileten yerlerde (yazı alanı, VGA ekranı, terminal) kısayol yok */
export function kisayolAlani(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const el = e.target as HTMLElement | null;
  return !el?.closest?.("input, textarea, select, [contenteditable], .vga-screen, #cpu16-vga, #cpu16-term");
}

/**
 * Ayarları sayfaya bağlar: <html> işaretleri, sistem teması değişikliği ve T / Y / F kısayolları.
 * Root bir kez çağırır.
 */
export function useAyarlariUygula(): void {
  useEffect(() => {
    // işaretler ayar değişir değişmez (React yeniden çizmeden önce) yazılır: tuval çizimleri yeni
    // yazı boyutunu ve renkleri ilk çizimde okusun
    uygula(useAyar.getState());
    return useAyar.subscribe((s, once) => {
      if (s.tema !== once.tema || s.boyut !== once.boyut || s.odak !== once.odak) uygula(s);
    });
  }, []);
  useEffect(() => {
    const q = sistemSorgusu();
    if (!q) return;
    const degisti = () => {
      if (useAyar.getState().secim === "sistem") useAyar.setState({ tema: sistemTemasi() });
    };
    q.addEventListener("change", degisti);
    return () => q.removeEventListener("change", degisti);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !kisayolAlani(e)) return;
      const a = useAyar.getState();
      const k = e.key.toLocaleLowerCase("tr-TR");
      if (k === "t") a.temaDegistir();
      else if (k === "y") a.boyutSec(a.boyut === "normal" ? "buyuk" : "normal");
      else if (k === "f") a.odakSec(!a.odak);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** 3D sahnelerin zemini: temanın sahne rengi (styles.css'teki --surface-scene ile aynı) */
export const SAHNE_RENGI: Record<Tema, string> = { koyu: "#121519", acik: "#d7dce3" };

export function useSahneRengi(): string {
  return SAHNE_RENGI[useAyar((s) => s.tema)];
}
