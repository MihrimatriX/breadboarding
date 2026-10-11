// Deney seti (Faz 10): deneylerin sırası ve her deneyde kurulan kart blokları.
// Rehber dosyalarındaki (cpu16/kit/deney-*.md) "otomatik" bölümler bu tablodan ve kart
// tanımlarından üretilir: npm run cpu16 -- kit. Elle yazılan metin işaretlerin dışında kalır.

/** Deneylerin kurulduğu bilgisayar tanımları (board/ altındaki kart kodları) */
export type KitBoard = "bilgisayar" | "programlayici";

export interface DeneyKart {
  board: KitBoard;
  card: string;
  /** Bu deneyde kurulan bloklar; boşsa kartın o ana kadar kurulmamış her şeyi */
  blocks?: string[];
}

export interface Deney {
  no: number;
  /** Dosya adı: deney-NN-<kisa>.md */
  kisa: string;
  baslik: string;
  /** Kurulan donanım; yoksa deney yalnızca yazılım/ölçüm deneyidir */
  kartlar?: DeneyKart[];
  /** Otomatik bölümde ek olarak gösterilecek tek çip (ör. 74HC00 doğruluk tablosu) */
  cip?: string;
}

export const DENEYLER: Deney[] = [
  { no: 1, kisa: "saat", baslik: "Saat ve reset kartı", kartlar: [{ board: "bilgisayar", card: "clk" }] },
  { no: 2, kisa: "kapilar", baslik: "Kapılar ve CMOS transistörler", cip: "74HC00" },
  { no: 3, kisa: "programlayici", baslik: "Flash programlayıcı", kartlar: [{ board: "programlayici", card: "prog" }] },
  { no: 4, kisa: "register", baslik: "Register dosyası ve veriyolu", kartlar: [{ board: "bilgisayar", card: "cpu", blocks: ["Register dosyası"] }] },
  { no: 5, kisa: "alu", baslik: "ALU ve bayraklar", kartlar: [{ board: "bilgisayar", card: "cpu", blocks: ["Geçici register'lar", "ALU", "Bayraklar ve koşul"] }] },
  {
    no: 6, kisa: "komut-cekme", baslik: "Program sayacı ve komut çekme",
    kartlar: [{ board: "bilgisayar", card: "cpu", blocks: ["Program sayacı", "MAR ve IR", "Bellek arayüzü"] }],
  },
  { no: 7, kisa: "mikrokod", baslik: "Mikrokod ve kontrol birimi", kartlar: [{ board: "bilgisayar", card: "cpu" }] },
  { no: 8, kisa: "bellek", baslik: "Bellek kartı ve ilk program", kartlar: [{ board: "bilgisayar", card: "mem", blocks: ["UART"] }] },
  { no: 9, kisa: "onbellek", baslik: "Bekleme durumları ve önbellek" },
  { no: 10, kisa: "gc", baslik: "G/Ç kartı: UART, zamanlayıcı, kesmeler, klavye" },
  { no: 11, kisa: "video", baslik: "Video kartı: ekranda Merhaba" },
  { no: 12, kisa: "bios", baslik: "BIOS, önyükleyici ve Web Serial" },
  { no: 13, kisa: "c", baslik: "C derleyicisi: yılan oyunu" },
];

/** Yalnızca simülasyonda kullanılan bloklar (gerçek kartta kurulmaz) */
export const SADECE_SIM: DeneyKart[] = [
  // Faz 4 test bellek kartının 64 KB RAM'i: kapı seviyesi testler programı doğrudan RAM'e yükler.
  // Gerçek kartta program Flash'tan çalışır (Deney 8, bellek kartı); test kartının yalnızca
  // 0xFF00 çıkış mandalı kurulur.
  { board: "bilgisayar", card: "mem", blocks: ["RAM"] },
];

export const dosyaAdi = (d: Deney) => `deney-${String(d.no).padStart(2, "0")}-${d.kisa}.md`;
