// Belgeler bölümünün dizini ve adresleri: belgeler hangi grupta ve hangi okuma sırasında (docs/README.md'deki
// okuma yolları), adres biçimi (#belgeler/<yol>#<çapa>), belgelerdeki göreli bağlantıların uygulama içi
// adrese ya da GitHub'daki dosyaya çevrilmesi, görsel yolları ve belgelerde arama. Dizinde olmayan yeni bir
// belge kaybolmaz, "Diğer" grubunun sonuna düşer. Saf: DOM'a dokunmaz; testleri tests/belgeler.test.ts.

export interface BelgeKaydi {
  /** depo köküne göre yol: "cpu16/docs/spec.md" */
  yol: string;
  ad: string;
}

export interface Grup {
  ad: string;
  belgeler: BelgeKaydi[];
}

export const HASH = "#belgeler";
export const VARSAYILAN = "docs/README.md";
export const GITHUB = "https://github.com/MihrimatriX/breadboarding";

const deney = (n: number, dosya: string, ad: string): BelgeKaydi => ({ yol: `cpu16/kit/deney-${dosya}.md`, ad: `${n}. ${ad}` });

/** Gruplar ve okuma sırası */
export const DIZIN: Grup[] = [
  {
    ad: "Başlangıç",
    belgeler: [
      { yol: "docs/README.md", ad: "Okuma yolu" },
      { yol: "README.md", ad: "Proje: genel bakış" },
      { yol: "CONTRIBUTING.md", ad: "Katkı rehberi" },
    ],
  },
  {
    ad: "CPU16: tasarım",
    belgeler: [
      { yol: "cpu16/README.md", ad: "CPU16'ya genel bakış" },
      { yol: "cpu16/docs/mimari.md", ad: "Mimari (blok) diyagramları" },
      { yol: "cpu16/docs/roadmap.md", ad: "Yol haritası" },
      { yol: "cpu16/docs/spec.md", ad: "Tasarım spesifikasyonu" },
      { yol: "cpu16/docs/isa-ayrintilari.md", ad: "Komut seti ayrıntıları" },
      { yol: "cpu16/docs/mikromimari.md", ad: "Mikromimari ve mikrokod" },
      { yol: "cpu16/docs/parcalar.md", ad: "Parça kütüphanesi" },
      { yol: "cpu16/docs/kartlar.md", ad: "Kartlar: şema = kod" },
      { yol: "cpu16/docs/anakart.md", ad: "Anakart" },
      { yol: "cpu16/docs/anakart-kartlari.md", ad: "Anakart: saat, bellek, önbellek" },
      { yol: "cpu16/docs/anakart-gc-video.md", ad: "Anakart: G/Ç ve video" },
      { yol: "cpu16/docs/3d-gorunum.md", ad: "3D görünüm ve konsol" },
    ],
  },
  {
    ad: "CPU16: yazılım",
    belgeler: [
      { yol: "cpu16/docs/as16.md", ad: "as16 assembler" },
      { yol: "cpu16/docs/bios.md", ad: "BIOS" },
      { yol: "cpu16/docs/cc16.md", ad: "cc16 C derleyicisi" },
      { yol: "cpu16/docs/c-ornekleri.md", ad: "C örnekleri" },
    ],
  },
  {
    ad: "CPU16: kurulum ve üretim",
    belgeler: [
      { yol: "cpu16/docs/kurulum.md", ad: "Kurulum belgeleri" },
      { yol: "cpu16/docs/breadboard.md", ad: "Breadboard'da bütün bilgisayar" },
      { yol: "cpu16/docs/uretim.md", ad: "Üretim ve devreye alma" },
    ],
  },
  {
    ad: "Deney seti",
    belgeler: [
      { yol: "cpu16/kit/README.md", ad: "Deney seti: araçlar ve kurallar" },
      { yol: "cpu16/kit/led-ve-direnc.md", ad: "LED, direnç ve kondansatör" },
      deney(1, "01-saat", "Saat ve reset kartı"),
      deney(2, "02-kapilar", "Kapılar ve CMOS"),
      deney(3, "03-programlayici", "EEPROM programlayıcı"),
      deney(4, "04-register", "Register dosyası ve veriyolu"),
      deney(5, "05-alu", "ALU ve bayraklar"),
      deney(6, "06-komut-cekme", "Program sayacı, komut çekme"),
      deney(7, "07-mikrokod", "Mikrokod ve kontrol birimi"),
      deney(8, "08-bellek", "Bellek kartı ve ilk program"),
      deney(9, "09-onbellek", "Bekleme durumları, önbellek"),
      deney(10, "10-gc", "G/Ç kartı"),
      deney(11, "11-video", "Video kartı"),
      deney(12, "12-bios", "BIOS ve Web Serial"),
      deney(13, "13-c", "C derleyicisi: yılan oyunu"),
      deney(14, "14-kendin-yap-bellek", "Kendin yap bellek"),
    ],
  },
  {
    ad: "hesap8",
    belgeler: [
      { yol: "hesap8/README.md", ad: "Hesap makinesi: genel bakış" },
      { yol: "hesap8/docs/tasarim.md", ad: "Tasarım" },
      { yol: "hesap8/docs/kurulum-rehberi.md", ad: "Fiziksel kurulum rehberi" },
    ],
  },
];

/** Eldeki belgelerin grupları: dizinde olup dosyası olmayan atlanır, dizinde olmayan "Diğer"e eklenir */
export function katalog(yollar: Iterable<string>): Grup[] {
  const var_ = new Set(yollar);
  const gruplar = DIZIN.map((g) => ({ ad: g.ad, belgeler: g.belgeler.filter((b) => var_.has(b.yol)) })).filter((g) => g.belgeler.length);
  const bilinen = new Set(DIZIN.flatMap((g) => g.belgeler.map((b) => b.yol)));
  const diger = [...var_].filter((y) => !bilinen.has(y)).sort().map((yol) => ({ yol, ad: yol.split("/").pop()!.replace(/\.md$/, "") }));
  return diger.length ? [...gruplar, { ad: "Diğer", belgeler: diger }] : gruplar;
}

/** Okuma sırasında önceki ve sonraki belge */
export function komsular(gruplar: Grup[], yol: string): { onceki?: BelgeKaydi; sonraki?: BelgeKaydi } {
  const hepsi = gruplar.flatMap((g) => g.belgeler);
  const i = hepsi.findIndex((b) => b.yol === yol);
  return i < 0 ? {} : { onceki: hepsi[i - 1], sonraki: hepsi[i + 1] };
}

// ---------------------------------------------------------------- adresler

/** Uygulama içi adres: #belgeler/<yol> ya da #belgeler/<yol>#<çapa> */
export function belgeHash(yol: string, capa?: string | null): string {
  return `${HASH}/${yol}${capa ? `#${capa}` : ""}`;
}

/** location.hash → belge yolu ve çapa (tarayıcının yüzde kodlaması çözülür) */
export function hashCoz(hash: string): { yol: string | null; capa: string | null } {
  let h = hash;
  try {
    h = decodeURIComponent(hash);
  } catch {
    // bozuk yüzde kodlaması: olduğu gibi
  }
  if (!h.startsWith(`${HASH}/`)) return { yol: null, capa: null };
  const geri = h.slice(HASH.length + 1);
  const k = geri.indexOf("#");
  const yol = k < 0 ? geri : geri.slice(0, k);
  return { yol: yol || null, capa: k < 0 ? null : geri.slice(k + 1) || null };
}

/** Belgenin klasörüne göre göreli yolu depo köküne göre yola çevirir; depo dışına çıkarsa null */
export function yolBirlestir(belge: string, goreli: string): string | null {
  const p = goreli.startsWith("/") ? [] : belge.split("/").slice(0, -1);
  for (const x of goreli.split("/")) {
    if (x === "" || x === ".") continue;
    if (x === "..") {
      if (!p.length) return null;
      p.pop();
    } else p.push(x);
  }
  return p.join("/") + (goreli.endsWith("/") && p.length ? "/" : "");
}

export type Hedef = { tur: "belge"; yol: string; capa: string | null } | { tur: "dis"; url: string };

const DIS = /^(?:https?:|mailto:)/i;

function cozul(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Belgedeki bir bağlantının hedefi: eldeki bir belgeye (ya da README'si olan klasöre) giden bağlantı
 * uygulama içinde açılır; depodaki başka dosyalar (kaynak kodu, klasörler) GitHub'da; dış adresler olduğu gibi.
 */
export function hedefCoz(belge: string, href: string, belgeVar: (yol: string) => boolean): Hedef {
  if (DIS.test(href)) return { tur: "dis", url: href };
  const k = href.indexOf("#");
  const capa = k < 0 ? null : cozul(href.slice(k + 1)) || null;
  const goreli = k < 0 ? href : href.slice(0, k);
  if (!goreli) return { tur: "belge", yol: belge, capa };
  const yol = yolBirlestir(belge, cozul(goreli));
  if (yol === null) return { tur: "dis", url: GITHUB };
  if (belgeVar(yol)) return { tur: "belge", yol, capa };
  if ((yol === "" || yol.endsWith("/")) && belgeVar(`${yol}README.md`)) return { tur: "belge", yol: `${yol}README.md`, capa };
  if (yol === "") return { tur: "dis", url: GITHUB };
  return { tur: "dis", url: `${GITHUB}/${yol.endsWith("/") ? "tree" : "blob"}/main/${yol}${capa ? `#${capa}` : ""}` };
}

/** GitHub'daki dosya sayfası */
export const githubAdresi = (yol: string) => `${GITHUB}/blob/main/${yol}`;

/** Belgedeki görselin adresi: dış adres olduğu gibi, depodaki dosya paketlenmiş adresiyle; bilinmiyorsa null */
export function gorselCoz(belge: string, src: string, adresler: Readonly<Record<string, string>>): string | null {
  if (/^https?:/i.test(src)) return src;
  const yol = yolBirlestir(belge, cozul(src));
  return (yol && adresler[yol]) ?? null;
}

// ---------------------------------------------------------------- arama

/** Aramada büyük / küçük harf, Türkçe I / İ / ı ve şapka, çengel, nokta gibi işaretler fark etmez */
export function katla(s: string): string {
  return s.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/\p{M}/gu, "");
}

export interface Eslesme {
  sayi: number;
  /** ilk eşleşmenin geçtiği satırdan kısa bir parça (markdown işaretleri ayıklanmış) */
  ornek: string;
}

/** Belge metninde sorgu kaç kez geçiyor, ilk geçtiği yer; hiç geçmiyorsa null */
export function metindeAra(metin: string, sorgu: string): Eslesme | null {
  const q = katla(sorgu.trim());
  if (!q) return null;
  let sayi = 0;
  let ornek = "";
  for (const satir of metin.split("\n")) {
    const k = katla(satir);
    let j = k.indexOf(q);
    if (j < 0) continue;
    if (!ornek) ornek = parca(satir, j, q.length);
    for (; j >= 0; j = k.indexOf(q, j + q.length)) sayi++;
  }
  return sayi ? { sayi, ornek } : null;
}

/** Satırdan eşleşmenin çevresi: bağlantı sözdizimi, `, *, satır başı işaretleri ve tablo çizgileri ayıklanır */
function parca(satir: string, j: number, n: number): string {
  const bas = Math.max(0, j - 40);
  const son = Math.min(satir.length, j + n + 60);
  const p = satir
    .slice(bas, son)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*]/g, "")
    .replace(/\s*\|\s*/g, " · ")
    .replace(/^[\s#>·-]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${bas > 0 ? "…" : ""}${p}${son < satir.length ? "…" : ""}`;
}

export interface AramaSonucu extends BelgeKaydi {
  /** metinde eşleşme (metin henüz inmediyse ya da yalnız adında geçiyorsa yok) */
  eslesme: Eslesme | null;
}

/** Arama: adında ya da metninde sorgu geçen belgeler, gruplarıyla; metni inmemiş belgeye yalnız adıyla bakılır */
export function belgelerdeAra(gruplar: Grup[], sorgu: string, metin: (yol: string) => string | undefined): { ad: string; belgeler: AramaSonucu[] }[] {
  const q = katla(sorgu.trim());
  return gruplar
    .map((g) => ({
      ad: g.ad,
      belgeler: g.belgeler.flatMap((b) => {
        const m = metin(b.yol);
        const eslesme = m === undefined ? null : metindeAra(m, sorgu);
        return eslesme || katla(b.ad).includes(q) ? [{ ...b, eslesme }] : [];
      }),
    }))
    .filter((g) => g.belgeler.length);
}
