// Kartın genel bakışı (yan panelde hiçbir parça seçili değilken, BoardView.tsx): bilgisayarda kart kart,
// hesap makinesinde blok blok (tek kart) entegre ve pasif eleman sayıları. Saf: PCB yerleşiminden okur.
// Hesap makinesinin "Gösterge: 1. sayı" gibi alt blokları ön adlarıyla ("Gösterge") tek satırda toplanır;
// kamera da ön adla bütün alt blokları birlikte çerçeveler (BoardScene.tsx, CameraFly). Testi
// cpu16/tests/arayuz.test.ts.

import type { BoardLayout } from "../../cpu16/board/layout";

export interface OzetSatiri {
  /** kartın adı (cpu, bellek, …) ya da bloğun ön adı (Anahtarlar, Gösterge, …) */
  ad: string;
  /** kartın Türkçe başlığı; blokta adın kendisi */
  baslik: string;
  entegre: number;
  pasif: number;
}

export interface KartOzeti {
  satirlar: OzetSatiri[];
  entegre: number;
  pasif: number;
}

/** Blok adının ön adı: "Gösterge: 1. sayı" → "Gösterge" */
export const blokOnAdi = (blok: string): string => blok.split(":")[0].trim();

/** Yerleşimin kart kart (grup "kart") ya da blok blok (grup "blok") özeti; satırlar yerleşimdeki sırayla */
export function kartOzeti(lay: Pick<BoardLayout, "cards" | "blocks" | "chips" | "passives">, grup: "kart" | "blok"): KartOzeti {
  const satirlar = new Map<string, OzetSatiri>();
  if (grup === "kart") for (const c of lay.cards) satirlar.set(c.name, { ad: c.name, baslik: c.title, entegre: 0, pasif: 0 });
  else for (const b of lay.blocks) {
    const ad = blokOnAdi(b.name);
    if (!satirlar.has(ad)) satirlar.set(ad, { ad, baslik: ad, entegre: 0, pasif: 0 });
  }
  const anahtar = (p: { card: string; block: string }) => (grup === "kart" ? p.card : blokOnAdi(p.block));
  for (const c of lay.chips) {
    const s = satirlar.get(anahtar(c));
    if (s) s.entegre++;
  }
  for (const p of lay.passives) {
    const s = satirlar.get(anahtar(p));
    if (s) s.pasif++;
  }
  // parçası olmayan satır (yalnız çerçeve) gösterilmez
  const dolu = [...satirlar.values()].filter((s) => s.entegre + s.pasif > 0);
  return { satirlar: dolu, entegre: lay.chips.length, pasif: lay.passives.length };
}
