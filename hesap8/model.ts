// Hesap makinesinin altın modeli: anahtarlardan göstergelerde ne görünmeli. Kapı seviyesi devre
// (kart.ts) bununla karşılaştırılır; 3D görünümün yan paneli de bunu "beklenen" olarak gösterir.

export type IslemKodu = 0 | 1 | 2 | 3;

export interface Gorunum {
  /** göstergelerde görünen metin: sönük hane boşluk, eksi işareti "-" */
  a: string;
  b: string;
  /** işaret hanesi + 5 hane */
  sonuc: string;
  kalan: string;
  hata: boolean;
}

const hane = (v: number, n: number) => String(v).padStart(n, " ");

export function hesapla(a: number, b: number, op: IslemKodu): { deger: number; kalan: number | null; hata: boolean } {
  if (op === 0) return { deger: a + b, kalan: null, hata: false };
  if (op === 1) return { deger: a - b, kalan: null, hata: false };
  if (op === 2) return { deger: a * b, kalan: null, hata: false };
  if (b === 0) return { deger: 0, kalan: null, hata: true };
  return { deger: Math.floor(a / b), kalan: a % b, hata: false };
}

export function beklenen(a: number, b: number, op: IslemKodu): Gorunum {
  const r = hesapla(a, b, op);
  return {
    a: hane(a, 3),
    b: hane(b, 3),
    sonuc: r.hata ? " ".repeat(6) : (r.deger < 0 ? "-" : " ") + hane(Math.abs(r.deger), 5),
    kalan: r.kalan === null ? "   " : hane(r.kalan, 3),
    hata: r.hata,
  };
}
