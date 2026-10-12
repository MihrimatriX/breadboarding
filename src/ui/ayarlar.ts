// Görünüm ayarları: tema (sistem / koyu / açık), yazı boyutu (normal / büyük), odak modu (yan ve alt
// paneller gizli, sahne tam) ve arayüz dili (Türkçe / İngilizce; metinler ceviri.ts ile). Tercihler tarayıcıda saklanır; tema seçilmemişse işletim sisteminin
// tercihi izlenir (sistem değişince sayfa da değişir). Ayarlar <html> öğesine data-tema, data-boyut ve
// data-odak olarak, dil lang olarak yazılır; styles.css belirteçleri bunlara göre değişir. index.html'deki küçük betik
// aynı anahtarları ilk boyamadan önce okur ki sayfa açılırken yanlış temada parlamasın. İşletim
// sisteminin "hareketi azalt" tercihi de buradan okunur (azHareket: 3D kamera uçuşları).
//
// Kısayollar (yazı alanlarında ve klavyeyi karta ileten ekranlarda değil): T tema, Y yazı boyutu,
// F odak modu, L dil.

import { useEffect } from "react";
import { create } from "zustand";

export type TemaSecimi = "sistem" | "koyu" | "acik";
export type Tema = "koyu" | "acik";
export type YaziBoyutu = "normal" | "buyuk";
export type Dil = "tr" | "en";

const ANAHTAR = { tema: "silikon3d.tema", boyut: "silikon3d.boyut", odak: "silikon3d.odak", dil: "silikon3d.dil" } as const;

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

/**
 * İlk açılışta dil: kaydedilmiş seçim varsa o. Yoksa tarayıcının dil listesine (navigator.languages)
 * göre karar verilir.
 */
export function ilkDil(kayitli: string | null, tarayici: readonly string[]): Dil {
  if (kayitli === "tr" || kayitli === "en") return kayitli;
  // TODO(human): kayıtlı seçim yokken varsayılan dil
  void tarayici;
  return "tr";
}

const tarayiciDilleri = (): readonly string[] =>
  typeof navigator !== "undefined" && typeof window !== "undefined" ? (navigator.languages ?? [navigator.language]) : [];

interface Ayarlar {
  secim: TemaSecimi;
  /** seçim "sistem" ise işletim sisteminin teması */
  tema: Tema;
  boyut: YaziBoyutu;
  odak: boolean;
  dil: Dil;
  temaSec(t: TemaSecimi): void;
  /** koyu ↔ açık (sistem seçiliyse görünenin tersi) */
  temaDegistir(): void;
  boyutSec(b: YaziBoyutu): void;
  odakSec(on: boolean): void;
  dilSec(d: Dil): void;
}

export const useAyar = create<Ayarlar>((set, get) => {
  const secim = ilkSecim();
  return {
    secim,
    tema: secim === "sistem" ? sistemTemasi() : secim,
    boyut: oku(ANAHTAR.boyut) === "buyuk" ? "buyuk" : "normal",
    odak: oku(ANAHTAR.odak) === "1",
    dil: ilkDil(oku(ANAHTAR.dil), tarayiciDilleri()),
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
    dilSec(d) {
      yaz(ANAHTAR.dil, d);
      set({ dil: d });
    },
  };
});

/** <html> öğesindeki işaretler: CSS bunlara bakar */
function uygula(a: Pick<Ayarlar, "tema" | "boyut" | "odak" | "dil">): void {
  const kok = document.documentElement;
  kok.lang = a.dil;
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
 * Ayarları sayfaya bağlar: <html> işaretleri, sistem teması değişikliği ve T / Y / F / L kısayolları.
 * Root bir kez çağırır.
 */
export function useAyarlariUygula(): void {
  useEffect(() => {
    // işaretler ayar değişir değişmez (React yeniden çizmeden önce) yazılır: tuval çizimleri yeni
    // yazı boyutunu ve renkleri ilk çizimde okusun
    uygula(useAyar.getState());
    return useAyar.subscribe((s, once) => {
      if (s.tema !== once.tema || s.boyut !== once.boyut || s.odak !== once.odak || s.dil !== once.dil) uygula(s);
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
      else if (k === "l") a.dilSec(a.dil === "tr" ? "en" : "tr");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

const azHareketSorgusu: MediaQueryList | null =
  typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

/**
 * İşletim sisteminde "hareketi azalt" açık mı. CSS geçişleri styles.css'te kapanır; JS ile yapılan kamera
 * uçuşları buna bakar ve hedefe kayarak değil, hemen geçer; kart sahnelerinde kamera bırakınca süzülmez.
 */
export function azHareket(): boolean {
  return azHareketSorgusu?.matches ?? false;
}

/** Kamera uçuşunun bir karelik ilerlemesi (0..1): hareket azaltılmışsa doğrudan sona */
export function ucusAdimi(t: number, dt: number, hiz: number): number {
  return azHareket() ? 1 : Math.min(1, t + dt * hiz);
}

/** 3D sahnelerin zemini: temanın sahne rengi (styles.css'teki --surface-scene ile aynı) */
export const SAHNE_RENGI: Record<Tema, string> = { koyu: "#121519", acik: "#d7dce3" };

export function useSahneRengi(): string {
  return SAHNE_RENGI[useAyar((s) => s.tema)];
}
