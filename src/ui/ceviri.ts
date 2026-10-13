// Arayüz dili: Türkçe ve İngilizce. Metinler sözlük dosyasında değil, kullanıldıkları yerde çift olarak
// durur: bileşende `const t = useT(); t("Durdur", "Stop")`, bileşen dışında `ceviri("Durdur", "Stop")`.
// Böylece bir metnin iki dili yan yana okunur ve bir bileşeni değiştiren onun çevirisini de görür.
// Seçim ayarlar.ts'teki depoda (useAyar().dil); saf fonksiyonlar dili parametre olarak alır.

import { useAyar, type Dil } from "./ayarlar";

export type { Dil };

/** İki dilli metin (veri tablolarında): { tr: "Durdur", en: "Stop" } */
export interface IkiDil {
  tr: string;
  en: string;
}

export type Cevir = (tr: string, en: string) => string;

const TR: Cevir = (tr) => tr;
const EN: Cevir = (_tr, en) => en;

/** Dile göre çevirici; dil değişince bileşen yeniden çizilir */
export function useT(): Cevir {
  return useAyar((s) => s.dil) === "en" ? EN : TR;
}

export function useDil(): Dil {
  return useAyar((s) => s.dil);
}

/** Bileşen dışında (konsol API'si, olay işleyicileri): o anki dil. Yeniden çizimi tetiklemez. */
export function ceviri(tr: string, en: string): string {
  return useAyar.getState().dil === "en" ? en : tr;
}

/** Veri tablolarındaki iki dilli metnin seçili dildeki hâli */
export const sec = (m: IkiDil, dil: Dil): string => m[dil];
