// Yazı tipleri sayfayı bekletmeden yüklenir (index.html: media="print" ile, yüklenince "all"). 3D
// sahnedeki çip ve kart yazıları bir kez tuvale çizilip dokuya dönüşür: yazı tipi o an hazır değilse
// sahne hep yedek yazı tipiyle kalırdı. Kart sahnesi bu yüzden yazı tiplerini (en çok ~2 sn) bekler;
// çevrimdışıyken ya da yazı tipleri gelmezse sistem yazı tipleriyle hemen açılır.

import { useEffect, useState } from "react";

/** 3D dokularda kullanılan yüzler (BoardScene.tsx ve passiveGeometry.ts) */
const YUZLER = ['600 16px "IBM Plex Mono"', '400 16px "IBM Plex Mono"', '600 16px "IBM Plex Sans"', '500 16px "IBM Plex Sans"', '700 16px "IBM Plex Sans"'];
const EN_COK_MS = 2000;

let hazir: Promise<void> | null = null;
let bitti = false;

function stilSayfasi(): Promise<void> {
  const link = document.getElementById("yazi-tipleri") as HTMLLinkElement | null;
  if (!link || link.dataset.durum) return Promise.resolve();
  return new Promise((tamam) => {
    link.addEventListener("load", () => tamam(), { once: true });
    link.addEventListener("error", () => tamam(), { once: true });
  });
}

/** Yazı tipleri hazır (ya da beklemekten vazgeçildi) */
export function yaziTipleriHazir(): Promise<void> {
  if (!hazir) {
    const bekle = async () => {
      if (typeof document === "undefined" || !document.fonts) return;
      await stilSayfasi();
      await Promise.all(YUZLER.map((y) => document.fonts.load(y).catch(() => [])));
    };
    hazir = Promise.race([bekle().catch(() => {}), new Promise<void>((r) => setTimeout(r, EN_COK_MS))]).then(() => {
      bitti = true;
    });
  }
  return hazir;
}

export function useYaziTipleri(): boolean {
  const [ok, setOk] = useState(bitti);
  useEffect(() => {
    if (ok) return;
    let iptal = false;
    void yaziTipleriHazir().then(() => {
      if (!iptal) setOk(true);
    });
    return () => {
      iptal = true;
    };
  }, [ok]);
  return ok;
}
