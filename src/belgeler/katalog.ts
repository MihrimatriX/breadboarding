// Belgeler bölümünün dizini ve adresleri: belgeler hangi grupta ve hangi okuma sırasında (docs/README.md'deki
// okuma yolları), adres biçimi (#belgeler/<yol>#<çapa>), belgelerdeki göreli bağlantıların uygulama içi
// adrese ya da GitHub'daki dosyaya çevrilmesi, görsel yolları ve belgelerde arama. Dizinde olmayan yeni bir
// belge kaybolmaz, "Diğer" grubunun sonuna düşer. Saf: DOM'a dokunmaz; testleri tests/belgeler.test.ts.
//
// İki dil: bir belgenin İngilizcesi yanında aynı adla, .en.md uzantısıyla durur (spec.md → spec.en.md).
// İngilizce dosya listede ayrı belge olarak görünmez; adres de dilden bağımsızdır (hep Türkçe dosyanın
// yolu). Dil İngilizceyken İngilizcesi olan belge İngilizce açılır, olmayan Türkçe (dosyaSec).

import type { Dil, IkiDil } from "../ui/ceviri";

export interface BelgeKaydi {
  /** depo köküne göre Türkçe dosyanın yolu: "cpu16/docs/spec.md" */
  yol: string;
  ad: string;
}

export interface Grup {
  ad: string;
  belgeler: BelgeKaydi[];
}

interface DizinGrubu {
  ad: IkiDil;
  belgeler: { yol: string; ad: IkiDil }[];
}

export const HASH = "#belgeler";
export const VARSAYILAN = "docs/README.md";
export const GITHUB = "https://github.com/MihrimatriX/breadboarding";

const b = (yol: string, tr: string, en: string) => ({ yol, ad: { tr, en } });
const deney = (n: number, dosya: string, tr: string, en: string) => b(`cpu16/kit/deney-${dosya}.md`, `${n}. ${tr}`, `${n}. ${en}`);

/** Gruplar ve okuma sırası */
export const DIZIN: DizinGrubu[] = [
  {
    ad: { tr: "Başlangıç", en: "Getting started" },
    belgeler: [
      b("docs/README.md", "Okuma yolu", "Reading guide"),
      b("README.md", "Proje: genel bakış", "Project overview"),
      b("CONTRIBUTING.md", "Katkı rehberi", "Contributing guide"),
    ],
  },
  {
    ad: { tr: "CPU16: tasarım", en: "CPU16: design" },
    belgeler: [
      b("cpu16/README.md", "CPU16'ya genel bakış", "CPU16 overview"),
      b("cpu16/docs/mimari.md", "Mimari (blok) diyagramları", "Architecture (block) diagrams"),
      b("cpu16/docs/roadmap.md", "Yol haritası", "Roadmap"),
      b("cpu16/docs/spec.md", "Tasarım spesifikasyonu", "Design specification"),
      b("cpu16/docs/isa-ayrintilari.md", "Komut seti ayrıntıları", "Instruction set details"),
      b("cpu16/docs/mikromimari.md", "Mikromimari ve mikrokod", "Microarchitecture and microcode"),
      b("cpu16/docs/parcalar.md", "Parça kütüphanesi", "Parts library"),
      b("cpu16/docs/kartlar.md", "Kartlar: şema = kod", "Boards: schematic = code"),
      b("cpu16/docs/anakart.md", "Anakart", "Motherboard"),
      b("cpu16/docs/anakart-kartlari.md", "Anakart: saat, bellek, önbellek", "Motherboard: clock, memory, cache"),
      b("cpu16/docs/anakart-gc-video.md", "Anakart: G/Ç ve video", "Motherboard: I/O and video"),
      b("cpu16/docs/3d-gorunum.md", "3D görünüm ve konsol", "3D view and console"),
    ],
  },
  {
    ad: { tr: "CPU16: yazılım", en: "CPU16: software" },
    belgeler: [
      b("cpu16/docs/as16.md", "as16 assembler", "as16 assembler"),
      b("cpu16/docs/bios.md", "BIOS", "BIOS"),
      b("cpu16/docs/cc16.md", "cc16 C derleyicisi", "cc16 C compiler"),
      b("cpu16/docs/c-ornekleri.md", "C örnekleri", "C examples"),
    ],
  },
  {
    ad: { tr: "CPU16: kurulum ve üretim", en: "CPU16: build and production" },
    belgeler: [
      b("cpu16/docs/kurulum.md", "Kurulum belgeleri", "Build guides"),
      b("cpu16/docs/breadboard.md", "Breadboard'da bütün bilgisayar", "The whole computer on breadboards"),
      b("cpu16/docs/uretim.md", "Üretim ve devreye alma", "Production and bring-up"),
    ],
  },
  {
    ad: { tr: "Deney seti", en: "Experiment kit" },
    belgeler: [
      b("cpu16/kit/README.md", "Deney seti: araçlar ve kurallar", "Experiment kit: tools and rules"),
      b("cpu16/kit/led-ve-direnc.md", "LED, direnç ve kondansatör", "LEDs, resistors and capacitors"),
      deney(1, "01-saat", "Saat ve reset kartı", "Clock and reset board"),
      deney(2, "02-kapilar", "Kapılar ve CMOS", "Gates and CMOS"),
      deney(3, "03-programlayici", "EEPROM programlayıcı", "EEPROM programmer"),
      deney(4, "04-register", "Register dosyası ve veriyolu", "Register file and bus"),
      deney(5, "05-alu", "ALU ve bayraklar", "ALU and flags"),
      deney(6, "06-komut-cekme", "Program sayacı, komut çekme", "Program counter, instruction fetch"),
      deney(7, "07-mikrokod", "Mikrokod ve kontrol birimi", "Microcode and control unit"),
      deney(8, "08-bellek", "Bellek kartı ve ilk program", "Memory board and first program"),
      deney(9, "09-onbellek", "Bekleme durumları, önbellek", "Wait states, cache"),
      deney(10, "10-gc", "G/Ç kartı", "I/O board"),
      deney(11, "11-video", "Video kartı", "Video board"),
      deney(12, "12-bios", "BIOS ve Web Serial", "BIOS and Web Serial"),
      deney(13, "13-c", "C derleyicisi: yılan oyunu", "C compiler: snake game"),
      deney(14, "14-kendin-yap-bellek", "Kendin yap bellek", "Build your own memory"),
    ],
  },
  {
    ad: { tr: "hesap8", en: "hesap8" },
    belgeler: [
      b("hesap8/README.md", "Hesap makinesi: genel bakış", "Calculator overview"),
      b("hesap8/docs/tasarim.md", "Tasarım", "Design"),
      b("hesap8/docs/kurulum-rehberi.md", "Fiziksel kurulum rehberi", "Physical build guide"),
    ],
  },
];

// ---------------------------------------------------------------- iki dil

const EN = /\.en\.md$/;

/** Türkçe belgenin İngilizce dosyası: spec.md → spec.en.md */
export const enYolu = (yol: string) => yol.replace(/\.md$/, ".en.md");

/** İngilizce dosyanın Türkçe eşi: spec.en.md → spec.md; İngilizce dosya değilse null */
export const trYolu = (yol: string): string | null => (EN.test(yol) ? yol.replace(EN, ".md") : null);

/** Seçili dilde gösterilecek dosya: İngilizcede .en.md'si varsa o, yoksa Türkçesi */
export function dosyaSec(yol: string, dil: Dil, dosyaVar: (yol: string) => boolean): string {
  return dil === "en" && dosyaVar(enYolu(yol)) ? enYolu(yol) : yol;
}

/**
 * Eldeki belgelerin seçili dildeki grupları: dizinde olup dosyası olmayan atlanır, dizinde olmayan "Diğer"e
 * eklenir. Yollar arasındaki .en.md dosyaları belge sayılmaz (Türkçe belgenin İngilizcesidir).
 */
export function katalog(yollar: Iterable<string>, dil: Dil = "tr"): Grup[] {
  const var_ = new Set([...yollar].filter((y) => !EN.test(y)));
  const gruplar = DIZIN.map((g) => ({ ad: g.ad[dil], belgeler: g.belgeler.filter((x) => var_.has(x.yol)).map((x) => ({ yol: x.yol, ad: x.ad[dil] })) })).filter(
    (g) => g.belgeler.length,
  );
  const bilinen = new Set(DIZIN.flatMap((g) => g.belgeler.map((x) => x.yol)));
  const diger = [...var_].filter((y) => !bilinen.has(y)).sort().map((yol) => ({ yol, ad: yol.split("/").pop()!.replace(/\.md$/, "") }));
  return diger.length ? [...gruplar, { ad: dil === "en" ? "Other" : "Diğer", belgeler: diger }] : gruplar;
}

/** Okuma sırasında önceki ve sonraki belge */
export function komsular(gruplar: Grup[], yol: string): { onceki?: BelgeKaydi; sonraki?: BelgeKaydi } {
  const hepsi = gruplar.flatMap((g) => g.belgeler);
  const i = hepsi.findIndex((x) => x.yol === yol);
  return i < 0 ? {} : { onceki: hepsi[i - 1], sonraki: hepsi[i + 1] };
}

// ---------------------------------------------------------------- adresler

/** Uygulama içi adres: #belgeler/<yol> ya da #belgeler/<yol>#<çapa> */
export function belgeHash(yol: string, capa?: string | null): string {
  return `${HASH}/${yol}${capa ? `#${capa}` : ""}`;
}

/** location.hash → belge yolu ve çapa (tarayıcının yüzde kodlaması çözülür; .en.md adresi Türkçe eşine) */
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
  return { yol: yol ? (trYolu(yol) ?? yol) : null, capa: k < 0 ? null : geri.slice(k + 1) || null };
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
 * uygulama içinde açılır; belgeVar .en.md'yi tanımıyorsa x.en.md bağlantısı x.md belgesine gider (dil
 * seçimi açılan belgeyi hangi dilde göstereceğine karar verir). Depodaki başka dosyalar (kaynak kodu,
 * klasörler) GitHub'da; dış adresler olduğu gibi.
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
  const tr = trYolu(yol);
  if (tr && belgeVar(tr)) return { tur: "belge", yol: tr, capa };
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

/**
 * Aramada büyük / küçük harf, Türkçe I / İ / ı ve şapka, çengel, nokta gibi işaretler fark etmez. İngilizce
 * metinde de zararsız: I önce ı'ya, sonra i'ye döner.
 */
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

/**
 * Arama: adında ya da metninde sorgu geçen belgeler, gruplarıyla; metni inmemiş belgeye yalnız adıyla
 * bakılır. metin(yol) seçili dilde gösterilen dosyanın metnini verir (bkz. dosyaSec).
 */
export function belgelerdeAra(gruplar: Grup[], sorgu: string, metin: (yol: string) => string | undefined): { ad: string; belgeler: AramaSonucu[] }[] {
  const q = katla(sorgu.trim());
  return gruplar
    .map((g) => ({
      ad: g.ad,
      belgeler: g.belgeler.flatMap((x) => {
        const m = metin(x.yol);
        const eslesme = m === undefined ? null : metindeAra(m, sorgu);
        return eslesme || katla(x.ad).includes(q) ? [{ ...x, eslesme }] : [];
      }),
    }))
    .filter((g) => g.belgeler.length);
}
