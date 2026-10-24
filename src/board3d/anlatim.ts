// Anlatım sekmesi: sahnedeki kartı (bilgisayar ya da hesap makinesi) blok blok gezen rehberli tur. Adımlar
// bölüm kataloğundan (cpu16/board/bolum-bilgi.ts), metinleri katalogdaki görev ve "nasıl çalışır"; panel
// (AnlatimPanel.tsx) adımı seçili bölüm yapar, kamera oraya uçar. Saf, testli (cpu16/tests/arayuz.test.ts).

import { bolumleri, bolumZinciri, type Bolum, type BolumKatalogu } from "../../cpu16/board/bolum-bilgi";

/** Turun adımları, gezilecek sırayla */
export function turAdimlari(k: BolumKatalogu): Bolum[] {
  const out: Bolum[] = [];
  for (const kart of k.kartlar) {
    // kartın genel bakışı, sonra bütün blokları kataloğun (devrenin yazıldığı) sırasıyla
    out.push(...bolumleri(k, "kart", kart), ...bolumleri(k, "blok", kart));
  }
  return out;
}

/**
 * Seçili bölümün turdaki yeri: kendisi turdaysa onun sırası, değilse turdaki en yakın üst bölümünün
 * (grubun bloğu, bölgenin kartı); hiçbir şey seçili değilse ya da turda yoksa −1
 */
export function turdakiYeri(k: BolumKatalogu, adimlar: readonly Bolum[], id: string | null): number {
  if (!id) return -1;
  const zincir = bolumZinciri(k, id);
  for (let i = zincir.length - 1; i >= 0; i--) {
    const j = adimlar.findIndex((a) => a.id === zincir[i].id);
    if (j >= 0) return j;
  }
  return -1;
}
