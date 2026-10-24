// 3D tuvallerin çizim döngüsü (saf kısım; tuvaldeki bağlantısı TuvalCizimi.ts'te). Tuvaller
// frameloop="demand" ile yalnız bir şey değişince çizilir: boşta GPU ve ana iş parçacığı dinlenir,
// paneller ve düzenleyici akıcı kalır. Yeni kareyi isteyenler:
// - kamera (OrbitControls, sönümleme dahil) ve React'in three nesnelerine verdiği özellikler: kendiliğinden;
// - canlı değerler (6502 düğümleri, net seviyeleri, ekran): React durumunda değiller, yazan yer cizimIste() der;
// - sahnenin okuduğu depolar (seçim, kip, kurulum): TuvalCizimi abone olur, değişince çizer (kareGerekir);
// - süren animasyonlar (kamera uçuşu, nabız halkaları): useFrame'in içinde state.invalidate().
// Çözünürlük de burada: kamera sürüklenirken kareler yavaşsa adım adım düşer (DprAyari).

const dinleyenler = new Set<() => void>();

/** Canlı değerler değişti: bağlı bütün tuvaller bir kare çizer */
export function cizimIste(): void {
  for (const f of dinleyenler) f();
}

/** Bir tuvalin yeni kare isteğini kaydet; dönen işlev kaydı siler */
export function cizimDinle(f: () => void): () => void {
  dinleyenler.add(f);
  return () => {
    dinleyenler.delete(f);
  };
}

/** İmlecin altındaki parça: ekrandaki yeri (x, y) sahneyi değiştirmez, parçası ve ek satırı değiştirir */
interface Imlec {
  ref: string;
  ek?: string;
}
const ayniParca = (a: unknown, b: unknown): boolean => {
  const x = a as Imlec | null | undefined;
  const y = b as Imlec | null | undefined;
  return !x || !y ? x === y : x.ref === y.ref && x.ek === y.ek;
};

/**
 * Depo değişikliği yeni bir kare ister mi: sahneyi etkileyebilen bir alan değiştiyse evet. yoksay: sahnenin
 * okumadığı alanlar (kartın deposunda program düzenleyicisi, yan panellerin sayaçları): kart sahnedeyken
 * düzenleyiciye yazmak 3D'yi her tuşta yeniden çizdirmesin. Bilinmeyen (yeni) alan yeniden çizdirir.
 * Kartın "hover" alanında fare aynı parçanın üstünde kıpırdadıkça yalnız ipucunun yeri değişir, sahne değil.
 */
export function kareGerekir(yeni: object, eski: object, yoksay?: ReadonlySet<string>): boolean {
  const a = yeni as Record<string, unknown>;
  const b = eski as Record<string, unknown>;
  for (const k in a) {
    if (a[k] === b[k] || yoksay?.has(k)) continue;
    if (k === "hover" && ayniParca(a[k], b[k])) continue;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- uyarlanır çözünürlük

/** Kaç sürükleme karesinin ortancasına bakılır */
export const DPR_PENCERE = 20;
/** Ortanca kare süresi bundan uzunsa (≈ 40 fps'in altı) çözünürlük bir adım düşer */
export const DPR_YAVAS = 1 / 40;
/** Ortanca bundan kısaysa (≈ 55 fps'in üstü) ve bu art arda DPR_HIZLI_PENCERE pencere sürerse bir adım çıkar */
export const DPR_HIZLI = 1 / 55;
export const DPR_HIZLI_PENCERE = 3;
/** Düştükten sonra en çok bu kadar kez geri çıkar (yavaş ↔ hızlı arasında gidip gelmesin) */
export const DPR_DONUS = 2;
/**
 * Bundan uzun aralık kare süresi sayılmaz: kullanıcı sürüklerken fareyi durdurdu. Cömert: kısa duraklamalar
 * ortancayı bozmaz, çok yavaş bir makinenin (saniyede birkaç kare) kareleri de sayılır.
 */
export const DPR_ARA = 1;
export const DPR_ADIM = 0.5;

/** Başlangıç çözünürlüğü: cihazınki, en çok 2 (4K ve üstünde 3 kat piksel, gözle fark edilmez) */
export const dprTavani = (cihaz: number): number => Math.min(2, Math.max(1, cihaz || 1));

/**
 * Kamera sürüklenirken (kullanıcının akıcılığı en çok fark ettiği an) kare sürelerini toplar; ortanca
 * yavaşsa çözünürlüğü yarım adım düşürür (en az 1), hızlı kalırsa geri çıkarır. Boşta ya da canlı
 * değerlerle çizilen kareler sayılmaz: isteğe bağlı çizimde aralarındaki boşluk kare süresi değildir.
 */
export class DprAyari {
  dpr: number;
  private readonly tavan: number;
  private pencere: number[] = [];
  private hizli = 0;
  private donus = 0;
  private dustu = false;

  constructor(tavan: number) {
    this.tavan = tavan;
    this.dpr = tavan;
  }

  /** Sürüklemedeki bir karenin süresi (saniye); çözünürlük değişecekse yenisi, yoksa null */
  kare(sure: number): number | null {
    if (!(sure > 0) || sure > DPR_ARA) return null;
    this.pencere.push(sure);
    if (this.pencere.length < DPR_PENCERE) return null;
    const sirali = this.pencere.slice().sort((a, b) => a - b);
    const ortanca = sirali[sirali.length >> 1];
    this.pencere = [];
    if (ortanca > DPR_YAVAS) {
      this.hizli = 0;
      if (this.dpr <= 1) return null;
      this.dustu = true;
      return (this.dpr = Math.max(1, this.dpr - DPR_ADIM));
    }
    if (ortanca < DPR_HIZLI && this.dpr < this.tavan && this.dustu && this.donus < DPR_DONUS) {
      if (++this.hizli < DPR_HIZLI_PENCERE) return null;
      this.hizli = 0;
      this.donus++;
      return (this.dpr = Math.min(this.tavan, this.dpr + DPR_ADIM));
    }
    this.hizli = 0;
    return null;
  }

  /** Sürükleme bitti: yarım kalan pencere atılır (sonraki sürükleme baştan sayar) */
  ara(): void {
    this.pencere = [];
  }
}
