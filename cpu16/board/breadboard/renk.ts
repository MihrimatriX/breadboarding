// Breadboard tellerinin renkleri: yaygın 10 renkli 22 AWG tek damarlı tel takımlarındaki renkler. Hangi
// rengin hangi sinyal grubuna gittiği projeye özgüdür (hesap makinesi: hesap8/breadboard/renk.ts, CPU16:
// cpu16/breadboard/renk.ts); burada yalnız renklerin adı ve 3D / belge rengi var.

export type TelRengi = "kirmizi" | "siyah" | "sari" | "turuncu" | "mor" | "yesil" | "mavi" | "beyaz" | "gri" | "kahverengi";

export interface RenkTanimi {
  renk: TelRengi;
  ad: string;
  hex: string;
  /** hangi teller */
  grup: string;
  aciklama: string;
}

/** Renklerin adı ve rengi (belgelerde kutucuk, 3D'de yalıtım) */
export const TEL_RENGI: Record<TelRengi, { ad: string; hex: string }> = {
  kirmizi: { ad: "kırmızı", hex: "#d62828" },
  siyah: { ad: "siyah", hex: "#1f1f1f" },
  sari: { ad: "sarı", hex: "#f2c40f" },
  turuncu: { ad: "turuncu", hex: "#f08a24" },
  mor: { ad: "mor", hex: "#7b3fb5" },
  yesil: { ad: "yeşil", hex: "#2f9e44" },
  mavi: { ad: "mavi", hex: "#1f66cc" },
  beyaz: { ad: "beyaz", hex: "#f4f4f0" },
  gri: { ad: "gri", hex: "#8a8f98" },
  kahverengi: { ad: "kahverengi", hex: "#8b5a2b" },
};

/** Grubu ve açıklamasıyla renk tanımı */
export function renkGrubu(renk: TelRengi, grup: string, aciklama: string): RenkTanimi {
  return { renk, ...TEL_RENGI[renk], grup, aciklama };
}

/** Renk tablosundan bir rengin tanımı (tabloda yoksa adı ve rengi, grubu boş) */
export function tablodanRenk(tablo: readonly RenkTanimi[], r: TelRengi): RenkTanimi {
  return tablo.find((x) => x.renk === r) ?? { renk: r, ...TEL_RENGI[r], grup: "", aciklama: "" };
}
