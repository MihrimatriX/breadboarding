// Breadboard tellerinin renk kodu. Yaygın 10 renkli 22 AWG tek damarlı tel takımlarındaki renkler;
// her renk bir sinyal grubu: hata ararken telin rengi hangi devreye ait olduğunu söyler.

export type TelRengi = "kirmizi" | "siyah" | "sari" | "turuncu" | "mor" | "yesil" | "mavi" | "beyaz" | "gri" | "kahverengi";

export interface RenkTanimi {
  renk: TelRengi;
  ad: string;
  hex: string;
  /** hangi teller */
  grup: string;
  aciklama: string;
}

export const BB_RENKLERI: RenkTanimi[] = [
  { renk: "kirmizi", ad: "kırmızı", hex: "#d62828", grup: "+5 V", aciklama: "+ raylar, ray köprüleri, çiplerin VCC bacağı, 1'e bağlı girişler, anahtarların ortak ucu" },
  { renk: "siyah", ad: "siyah", hex: "#1f1f1f", grup: "GND", aciklama: "− raylar, ray köprüleri, çiplerin GND bacağı, 0'a bağlı (kullanılmayan) girişler, göstergelerin ortak katodu" },
  { renk: "sari", ad: "sarı", hex: "#f2c40f", grup: "A sayısı", aciklama: "A0–A7" },
  { renk: "turuncu", ad: "turuncu", hex: "#f08a24", grup: "B sayısı", aciklama: "B0–B7, tersleri (NB, bölme) ve çıkarmada çevrilmiş hali (BX)" },
  { renk: "mor", ad: "mor", hex: "#7b3fb5", grup: "Kontrol", aciklama: "işlem anahtarları ve kod çözme (OP, TOPLA … BOL), lamba testi, söndürme (~BI), NEG, HATA, B = 0" },
  { renk: "yesil", ad: "yeşil", hex: "#2f9e44", grup: "Ara işlem", aciklama: "toplayıcıların, çarpıcının ve bölücünün iç sinyalleri: kısmi çarpımlar, ara toplamlar, eldeler, kalanlar" },
  { renk: "mavi", ad: "mavi", hex: "#1f66cc", grup: "Sonuç", aciklama: "dört işlemin sonuçları (M, P, Q, K, T8) ve seçilen sonuç (SONUC0–15)" },
  { renk: "beyaz", ad: "beyaz", hex: "#f4f4f0", grup: "Onluk (BCD)", aciklama: "ikiliden onluğa çevirme ağı ve 74HC4511'lerin BCD girişleri" },
  { renk: "gri", ad: "gri", hex: "#8a8f98", grup: "Segmentler", aciklama: "74HC4511 çıkışları → 470 Ω dizi → gösterge" },
  { renk: "kahverengi", ad: "kahverengi", hex: "#8b5a2b", grup: "LED'ler", aciklama: "330 Ω ile LED arası, eksi işareti" },
];

export const renkTanimi = (r: TelRengi): RenkTanimi => BB_RENKLERI.find((x) => x.renk === r)!;

/**
 * Netin tel rengi. `bloklar`: netin uçlarının bulunduğu bloklar (adsız netlerde karar bloktan).
 */
export function telRengi(ad: string, bloklar: string[]): TelRengi {
  if (ad === "VCC") return "kirmizi";
  if (ad === "GND") return "siyah";
  if (/^A\d$/.test(ad)) return "sari";
  if (/^(B|NB|BX)\d$/.test(ad)) return "turuncu";
  if (/_LED$|^LED_/.test(ad)) return /^[A-Z]+\d_[a-g]_LED$/.test(ad) ? "gri" : "kahverengi";
  if (/^(A|B|SONUC|KALAN|SN|KL)\d_[a-g]$/.test(ad)) return "gri";
  if (/^(OP\d(_N)?|TOPLA|CIKAR|CARP|BOL|LT_N|NEG|HATA|B_SIFIR(_N)?|KALAN_SONUK|ISARET_g|[A-Z]+_BI\d_N)$/.test(ad)) return "mor";
  if (/^(SONUC\d+|M\d|P\d+|Q\d|K\d|T8)$/.test(ad)) return "mavi";
  if (bloklar.some((b) => b.startsWith("Onluğa çevirme"))) return "beyaz";
  if (bloklar.some((b) => b.startsWith("Gösterge"))) return "mor";
  return "yesil";
}
