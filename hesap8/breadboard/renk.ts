// Hesap makinesinin breadboard tel renk kodu. Renklerin adı ve rengi ortak motorda
// (cpu16/board/breadboard/renk.ts); burada her rengin hesap makinesindeki sinyal grubu: hata ararken
// telin rengi hangi devreye ait olduğunu söyler.

import { renkGrubu, type RenkTanimi, type TelRengi } from "../../cpu16/board/breadboard/renk.ts";

export type { RenkTanimi, TelRengi } from "../../cpu16/board/breadboard/renk.ts";

/** Hesap makinesinin renk tanımı: grubun İngilizcesiyle (3D görünümün kurulum modu İngilizceyken) */
export type HesapRenk = RenkTanimi & { en: { grup: string } };

const grup = (renk: TelRengi, ad: string, aciklama: string, en: string): HesapRenk => ({ ...renkGrubu(renk, ad, aciklama), en: { grup: en } });

export const BB_RENKLERI: HesapRenk[] = [
  grup("kirmizi", "+5 V", "+ raylar, ray köprüleri, çiplerin VCC bacağı, 1'e bağlı girişler, anahtarların ortak ucu", "+5 V"),
  grup("siyah", "GND", "− raylar, ray köprüleri, çiplerin GND bacağı, 0'a bağlı (kullanılmayan) girişler, göstergelerin ortak katodu", "GND"),
  grup("sari", "A sayısı", "A0–A7", "Number A"),
  grup("turuncu", "B sayısı", "B0–B7, tersleri (NB, bölme) ve çıkarmada çevrilmiş hali (BX)", "Number B"),
  grup("mor", "Kontrol", "işlem anahtarları ve kod çözme (OP, TOPLA … BOL), lamba testi, söndürme (~BI), NEG, HATA, B = 0", "Control"),
  grup("yesil", "Ara işlem", "toplayıcıların, çarpıcının ve bölücünün iç sinyalleri: kısmi çarpımlar, ara toplamlar, eldeler, kalanlar", "Intermediate signals"),
  grup("mavi", "Sonuç", "dört işlemin sonuçları (M, P, Q, K, T8) ve seçilen sonuç (SONUC0–15)", "Result"),
  grup("beyaz", "Onluk (BCD)", "ikiliden onluğa çevirme ağı ve 74HC4511'lerin BCD girişleri", "Decimal (BCD)"),
  grup("gri", "Segmentler", "74HC4511 çıkışları → 470 Ω dizi → gösterge", "Segments"),
  grup("kahverengi", "LED'ler", "330 Ω ile LED arası, eksi işareti", "LEDs"),
];

export const renkTanimi = (r: TelRengi): HesapRenk => BB_RENKLERI.find((x) => x.renk === r)!;

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
