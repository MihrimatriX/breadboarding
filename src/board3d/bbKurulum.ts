// Breadboard kurulum modu: panoları tel tel kurarken. Hesap makinesinde tek pano (hesap8/breadboard, 60
// board); bilgisayarda her kart kendi panosu (cpu16/breadboard, 7 pano), pano ve aşama seçilir. Tel
// numaraları yazdırılan breadboard belgesiyle aynıdır (pano başına T0001 …, kurulum sırası); her tel
// delikten deliğe yazılır ("BB07 c14 → BB08 h3, 42 mm, sarı"; bilgisayarda önünde panonun adı: "CPU ·
// …"). Takılan teller tarayıcıda pano başına saklanır; 3D sahne odaktaki teli kalın ve parlak,
// panonun takılan tellerini kendi renginde, takılmayanları soluk çizer.

import { create } from "zustand";
import { delikVar, DUGUM_BOARD, SATIR, satirRayi, SUTUN, yerelDugum } from "../../cpu16/board/breadboard/geometri";
import { noktaBoardu, renkAdi, ucEtiketi, type BbPlanTemel, type BbTel } from "../../cpu16/board/breadboard/plan";
import { KART_SIRASI } from "../../cpu16/breadboard/panolar";
import { RENK_KODU } from "../../cpu16/kurulum/plan";
import type { BbPlani } from "../../hesap8/breadboard/plan";
import { renkTanimi } from "../../hesap8/breadboard/renk";
import type { Dil } from "../ui/ceviri";
import { kartBasligi } from "./adlar";
import { aktifKart, bbSahnesi, kartDegisince, type BbPanosu, type KartTuru } from "./aktif";
import { secimOku, secimYaz } from "./kurulum";

/** Telin numarası belgelerdeki gibi: T0001 */
export const telKimligi = (no: number): string => `T${String(no).padStart(4, "0")}`;

/** Hesap makinesinin telinin tek satırlık tarifi: "BB07 c14 → BB08 h3, 42 mm, sarı" (genel: BbPanosu.tarif) */
export function telTarifi(p: BbPlani, t: BbTel, dil: Dil = "tr"): string {
  const n = t.yol.length;
  return `${ucEtiketi(p.yerlesim, t.yol[0], t.yol[1], dil)} → ${ucEtiketi(p.yerlesim, t.yol[n - 2], t.yol[n - 1], dil)}, ${Math.round(t.uzunluk)} mm, ${renkAdi(t.renk, dil)}`;
}

/** Bir ucun şeridinde (ya da rayında) ne var: "U12.3, U14.11" ya da "+5 V rayı (üst)" */
export function ucunKomsulari(p: Pick<BbPlanTemel, "yerlesim">, X: number, Y: number, dil: Dil = "tr"): string {
  const no = noktaBoardu(p.yerlesim, X, Y);
  const b = p.yerlesim.boards[no];
  const r = Y - b.y0;
  const c = X - b.x0;
  const ray = satirRayi(r);
  if (ray) {
    const ad = ray.endsWith("+") ? "+5 V" : "GND";
    const ust = ray.startsWith("ust");
    return dil === "en" ? `${ad} rail (${ust ? "top" : "bottom"})` : `${ad} rayı (${ust ? "üst" : "alt"})`;
  }
  const d = no * DUGUM_BOARD + yerelDugum(r, c);
  const pinler: string[] = [];
  for (const q of p.yerlesim.parcalar) {
    if (q.board !== no) continue;
    for (const k of q.bacaklar) {
      const kb = k.Y - b.y0;
      if (satirRayi(kb)) continue;
      if (no * DUGUM_BOARD + yerelDugum(kb, k.X - b.x0) === d) pinler.push(`${q.ref}.${k.pin}`);
    }
  }
  if (pinler.length) return [...new Set(pinler)].join(", ");
  return dil === "en" ? "empty strip (wires only)" : "boş şerit (yalnız teller)";
}

// ---------------------------------------------------------------- metinler (iki dil)

/** Panoların kısa adının İngilizcesi (tel tarifinin başında; Türkçesi cpu16/breadboard/panolar.ts kisa) */
const KISA_EN: Record<string, string> = { Saat: "Clock", Bellek: "Memory", Önbellek: "Cache", "G/Ç": "I/O", KYB: "DIY" };

/** Panonun adı ve kısa adı seçili dilde (Türkçesi panonun kendi tanımında, kart adının İngilizcesi adlar.ts) */
export function panoAdlari(p: Pick<BbPanosu, "kart" | "kisa" | "baslik">, dil: Dil = "tr"): { baslik: string; kisa: string } {
  if (dil === "tr") return { baslik: p.baslik, kisa: p.kisa };
  return { baslik: kartBasligi(p.kart, p.baslik, dil), kisa: KISA_EN[p.kisa] ?? p.kisa };
}

/** Telin rengi ve grubu: "sarı tel · Adres", "yellow wire · Address"; ray köprüsünde grubun yerine "ray köprüsü" */
export function telRengiYazisi(p: Pick<BbPanosu, "kart" | "renk">, t: Pick<BbTel, "renk" | "ray">, dil: Dil = "tr"): string {
  const r = p.renk(t.renk);
  if (dil === "tr") return `${r.ad.toLocaleLowerCase("tr-TR")} tel · ${t.ray ? "ray köprüsü" : r.grup}`;
  // bilgisayarın renk grupları PCB'nin renk kodundan (cpu16/breadboard/renk.ts: grup = RENK_KODU.ad)
  const grup = p.kart === "hesap" ? renkTanimi(t.renk).en.grup : (RENK_KODU.find((k) => k.ad === r.grup)?.en.ad ?? r.grup);
  return `${renkAdi(t.renk, "en")} wire · ${t.ray ? "rail jumper" : grup}`;
}

/**
 * Aşama adlarının ve aşama sonu testlerinin İngilizcesi: Türkçeleri cpu16/breadboard/panolar.ts ve
 * hesap8/breadboard/yerlesim.ts'te. Türkçe metinle eşlenir: metin değişirse Türkçe görünür, test eksiği yakalar.
 */
const ASAMA_EN: Record<string, string> = {
  // hesap makinesi
  "Taban, besleme ve anahtarlar": "Base, power and switches",
  "A sayısının göstergesi": "Display for number A",
  "B sayısının göstergesi": "Display for number B",
  "Toplama ve çıkarma": "Add and subtract",
  Çarpma: "Multiply",
  Bölme: "Divide",
  "Sonuç seçici, sonuç ve kalan göstergeleri": "Result selector, result and remainder displays",
  // bilgisayarın panoları: ilk aşama hepsinde aynı
  "Taban, besleme ve şerit kablo uyarlayıcısı": "Base, power and ribbon cable adapter",
  "Besleme girişlerine 5 V ver (çip yok): her board'un dört rayında ölç (+ raylar 4,9–5,1 V, − raylar 0 V); uyarlayıcının 3, 4 ve 63. pinleri 5 V, 1, 2, 62 ve 64. pinleri 0 V. Şerit kabloyu henüz takma.":
    "Apply 5 V to the power inputs with no chips fitted and measure all four rails on every breadboard (+ rails 4.9–5.1 V, − rails 0 V). On the adapter, pins 3, 4 and 63 read 5 V; pins 1, 2, 62 and 64 read 0 V. Do not connect the ribbon cable yet.",
  // CPU
  "Register dosyası ve iç veriyolu": "Register file and internal bus",
  "Deney 4: veriyoluna anahtarlarla değer ver, bir register'a yaz, geri oku: yazarken o register'ın WSEL LED'i, okurken ROE LED'i yanar, register'ın çubukları içeriğini, veriyolu çubukları veriyolundaki değeri gösterir; sürülmeyen veriyolu 0 okunur (RN1, RN2). Veriyolunu anahtar modülüyle sürerken veriyolu çubuklarının dizilerini (RN3, RN4) çıkar.":
    "Experiment 4: put a value on the bus with the switches, write it to a register and read it back. The register's WSEL LED lights while writing and its ROE LED while reading; the register's bar displays show its contents and the bus bars show the value on the bus. An undriven bus reads 0 (RN1, RN2). While you drive the bus from the switch module, remove the bus bars' resistor arrays (RN3, RN4).",
  "ALU, geçici register'lar ve bayraklar": "ALU, temporary registers and flags",
  "Deney 5: iki geçici register'a değer yükle, ALU işlemlerini (toplama, çıkarma, mantık, kaydırma) ve Z/N/C/V bayraklarını tabloyla karşılaştır; TA/TB yükleme LED'leri, sonuç çubukları (ALU çıkışı) ve bayrak LED'leri her adımı gösterir.":
    "Experiment 5: load values into the two temporary registers and check the ALU operations (add, subtract, logic, shift) and the Z/N/C/V flags against the table. The TA/TB load LEDs, the result bars (ALU output) and the flag LEDs show every step.",
  "Program sayacı, MAR, IR ve bellek arayüzü": "Program counter, MAR, IR and memory interface",
  "Deney 6: PC'yi sıfırla ve adım adım artır; PC çubuklarında adresin, MAR çubuklarında bellek adresinin, IR çubuklarında komutun değiştiğini, bellek okuma (yeşil) ve yazma (amber) LED'lerinde erişimi izle.":
    "Experiment 6: reset the PC and step it forward. Watch the address change on the PC bars, the memory address on the MAR bars and the instruction on the IR bars, and follow each access on the memory read (green) and write (amber) LEDs.",
  "Kontrol birimi, sabit birimi ve durum LED'leri": "Control unit, constant unit and status LEDs",
  "Deney 7: saat kartı ve test belleğiyle ilk komutları adım adım çalıştır; mikro adım LED'leri her saatte bir ilerler, HALT komutunda HALTED LED'i yanar, FAULT sönük kalır.":
    "Experiment 7: with the clock board and the test memory, step through the first instructions. The micro-step LEDs advance once per clock, the HALTED LED lights on the HALT instruction and FAULT stays off.",
  // saat
  "Osilatör, reset ve butonlar": "Oscillator, reset and buttons",
  "Deney 1: osilatör çıkışında (X201 8. pin) kare dalga; RESET butonuna basınca U201'in reset çıkışı değişir, bırakınca ≈ 0,1 s sonra döner; yavaş osilatör pot ile hızlanıp yavaşlar.":
    "Experiment 1: a square wave at the oscillator output (X201 pin 8). Pressing RESET changes the reset output of U201; it returns about 0.1 s after you release it. The pot speeds the slow oscillator up and down.",
  "Saat üretimi, bekleme ve dağıtım": "Clock generation, wait and distribution",
  "Deney 1: CLK LED'i YAVAŞ kipte yanıp söner; ADIM kipinde her basışta tek bir saat; uyarlayıcının 5. pininde (CLK) osilatörün 1/8'i.":
    "Experiment 1: the CLK LED blinks in SLOW mode; in STEP mode each press gives one clock; pin 5 of the adapter (CLK) carries 1/8 of the oscillator frequency.",
  // bellek
  "Adres çözme ve bank register'ları": "Address decoding and bank registers",
  "Deney 8: bank register'larına (FF10–FF1F) yaz, geri oku; adres çözücünün seçim çıkışlarını adres anahtarlarıyla dene.":
    "Experiment 8: write to the bank registers (FF10–FF1F) and read them back; try the address decoder's select outputs with the address switches.",
  "Bayt sıralayıcı, EEPROM ve RAM": "Byte sequencer, EEPROM and RAM",
  "Deney 8: EEPROM'daki ilk programı çalıştır (önbellek kartının bekleme blokları da takılı olmalı); RAM'e yazıp geri oku.":
    "Experiment 8: run the first program from the EEPROM (the cache board's wait blocks must be fitted too); write to RAM and read it back.",
  // önbellek
  "G/Ç çözme, bekleme ve sıralama": "I/O decoding, wait and sequencing",
  "Deney 8: bellek kartıyla birlikte ilk program çalışır (her kelime iki baytta, bekleme turlarıyla).":
    "Experiment 8: together with the memory board, the first program runs (each word as two bytes, with wait cycles).",
  "Etiket ve veri belleği, sayaçlar": "Tag and data memory, counters",
  "Deney 9: reset sonrası etiket temizleme sayacı 1024 satırı dolaşır; önbellek açıkken aynı programın isabet sayacı artar.":
    "Experiment 9: after reset the tag clear counter walks through all 1024 lines; with the cache on, the hit counter rises for the same program.",
  // G/Ç
  "Adres çözme ve durum register'ları": "Address decoding and status registers",
  "Deney 10: G/Ç adreslerini (FF20–FF3F) okuyan bir programla durum register'ının sabit bitlerini gör.":
    "Experiment 10: run a program that reads the I/O addresses (FF20–FF3F) and check the fixed bits of the status register.",
  "UART ve USB-seri modülü": "UART and USB serial module",
  "Deney 10: CH340 modülünü tak; 115200 8N1 terminalde BIOS'un açılış yazısı ve yankı.":
    "Experiment 10: plug in the CH340 module; a 115200 8N1 terminal shows the BIOS startup message and echoes what you type.",
  "Zamanlayıcı ve kesme denetleyicisi": "Timer and interrupt controller",
  "Deney 10: zamanlayıcı kesmesiyle sayan örnek program; IRQ hattı (uyarlayıcının 8. pini) periyodik.":
    "Experiment 10: an example program counts with the timer interrupt; the IRQ line (adapter pin 8) is periodic.",
  "PS/2 klavye": "PS/2 keyboard",
  "Deney 10: PS/2 klavyede basılan tuşların kodları terminale yazılır.": "Experiment 10: the codes of keys pressed on the PS/2 keyboard appear on the terminal.",
  // video
  "Adres çözme, CPU arayüzü ve VRAM": "Address decoding, CPU interface and VRAM",
  "Deney 11: VRAM'e (pencere üzerinden) yaz ve geri oku; bekleme hattı yalnız tarama sırasında.":
    "Experiment 11: write to VRAM (through the window) and read it back; the wait line is active only during scanning.",
  "Piksel saati, sayaçlar ve tarama": "Pixel clock, counters and scanning",
  "Deney 11: HSYNC 31,5 kHz, VSYNC 60 Hz (osiloskop ya da frekans ölçer); monitör siyah bir görüntüye kilitlenir.":
    "Experiment 11: HSYNC 31.5 kHz, VSYNC 60 Hz (oscilloscope or frequency counter); the monitor locks onto a black picture.",
  "Piksel yolu, imleç ve renk DAC'ı": "Pixel path, cursor and color DAC",
  "Deney 11: ekranda BIOS'un açılış yazısı ve yanıp sönen imleç.": "Experiment 11: the BIOS startup message and a blinking cursor on the screen.",
  // KYB
  "Adres çözme ve veriyolu tamponu": "Address decoding and bus buffer",
  "Deney 14: FF40–FF4F'yi okuyan program; seçim hatları adres anahtarlarıyla doğru hücreyi seçer.":
    "Experiment 14: a program reads FF40–FF4F; with the address switches, the select lines pick the right cell.",
  "Bellek hücreleri": "Memory cells",
  "Deney 14: 16 baytın her birine yaz, geri oku (BIOS'un bellek testi).": "Experiment 14: write each of the 16 bytes and read it back (the BIOS memory test).",
};

/** Aşamanın adı ya da testi seçili dilde */
export const asamaMetni = (tr: string, dil: Dil = "tr"): string => (dil === "en" ? (ASAMA_EN[tr] ?? tr) : tr);

// ---------------------------------------------------------------- pano ve ilerleme (tarayıcıda)

/** Kart türünün ilk panosu (bilgisayarda kurulum sırasıyla ilk kart: saat) */
const panoSecimAnahtari = "silikon3d.bbkurulum.pano";
/** Kart türünün açılışta seçili panosu: hesap makinesinde tek pano; bilgisayarda en son seçilen, yoksa ilki */
const ilkPano = (tur: KartTuru): string => (tur === "hesap" ? "hesap" : secimOku(panoSecimAnahtari, KART_SIRASI, KART_SIRASI[0]));

/** Delik haritasında bir delik: board'un yerel satırı ve sütunu */
export interface PencereDeligi {
  r: number;
  c: number;
  /** telin ucunun takıldığı delik */
  hedef: boolean;
  /** hedefle aynı iletken parçada (5 delikli şerit ya da ray) */
  bagli: boolean;
}

/**
 * Tel ucunun küçük haritası: board'un (r, c) deliğinin çevresinde `gen` sütun, deliğin bulunduğu yarı
 * (üst ray + a–e ya da f–j + alt ray). Aynı şeritteki ya da raydaki delikler `bagli`: ucun neyle
 * birleştiği görünür.
 */
export function bbPencere(r: number, c: number, gen = 7): { r0: number; r1: number; c0: number; c1: number; delikler: PencereDeligi[] } {
  const [r0, r1] = r <= 8 ? [SATIR.ustArti, SATIR.e] : [SATIR.f, SATIR.altArti];
  const c0 = Math.max(1, Math.min(SUTUN - gen + 1, c - Math.floor(gen / 2)));
  const c1 = c0 + gen - 1;
  const dugum = yerelDugum(r, c);
  const delikler: PencereDeligi[] = [];
  for (let rr = r0; rr <= r1; rr++)
    for (let cc = c0; cc <= c1; cc++)
      if (delikVar(rr, cc)) delikler.push({ r: rr, c: cc, hedef: rr === r && cc === c, bagli: yerelDugum(rr, cc) === dugum });
  return { r0, r1, c0, c1, delikler };
}

/** Panonun ilerlemesinin tarayıcıdaki anahtarı (hesap makinesininki eskisi gibi) */
export const bbKurulumAnahtari = (kart: string): string => (kart === "hesap" ? "hesap8.breadboard.kurulum" : `cpu16.breadboard.kurulum.${kart}`);

/** Sahnedeki kartın panosu (yoksa ilki) */
export function bbPano(kart: string): BbPanosu {
  const s = bbSahnesi();
  return s.panolar.find((p) => p.kart === kart) ?? s.panolar[0];
}

/** Panonun takıldı diye işaretlenmiş tel sayısı (pano seçim listesinde) */
export const bbTakilanSayisi = (kart: string): number => okuYapilan(kart).size;

function okuYapilan(kart: string): Set<number> {
  try {
    const raw = localStorage.getItem(bbKurulumAnahtari(kart));
    const x = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(x) ? x.filter((n): n is number => typeof n === "number") : []);
  } catch {
    return new Set();
  }
}

function yazYapilan(kart: string, y: Set<number>): void {
  try {
    localStorage.setItem(bbKurulumAnahtari(kart), JSON.stringify([...y]));
  } catch {
    /* gizli pencere ya da kapalı depolama: ilerleme yalnız bu oturumda */
  }
}

// ---------------------------------------------------------------- durum

export interface BbKurulumState {
  acik: boolean;
  /** panonun kartı: "hesap" ya da CPU16 kartı (cpu, clk, …) */
  pano: string;
  /** yalnız bu aşamanın telleri (null: hepsi) */
  asama: number | null;
  /** panonun takılan tellerinin numaraları */
  yapilan: Set<number>;
  /** odaktaki telin numarası (panoda) */
  secili: number | null;
  izle: boolean;
  ac(acik: boolean): void;
  setIzle(izle: boolean): void;
  panoSec(kart: string): void;
  asamaSec(no: number | null): void;
  isaretle(no: number, takildi?: boolean): void;
  sec(no: number | null): void;
  git(yon: 1 | -1, yalnizAcik?: boolean): void;
  sifirla(): void;
}

/** Sıradaki takılmamış tel (verilen telden sonra; yoksa baştan) */
export function bbSiradakiAcik(teller: readonly BbTel[], yapilan: ReadonlySet<number>, sonra?: number | null): BbTel | null {
  const i0 = sonra ? teller.findIndex((t) => t.no === sonra) + 1 : 0;
  for (let k = 0; k < teller.length; k++) {
    const t = teller[(i0 + k) % teller.length];
    if (!yapilan.has(t.no)) return t;
  }
  return null;
}

/** Gezilen teller: panonun bütün telleri ya da seçili aşamanınkiler */
export function bbGezilenTeller(s: Pick<BbKurulumState, "pano" | "asama">): BbTel[] {
  const t = bbPano(s.pano).plan.teller;
  return s.asama === null ? t : t.filter((x) => x.asama === s.asama);
}

export const useBbKurulum = create<BbKurulumState>((set, get) => ({
  acik: false,
  pano: ilkPano(aktifKart()),
  asama: null,
  yapilan: okuYapilan(ilkPano(aktifKart())),
  secili: null,
  izle: true,
  ac(acik) {
    set({ acik });
    if (acik && get().secili === null) set({ secili: bbSiradakiAcik(bbGezilenTeller(get()), get().yapilan)?.no ?? 1 });
  },
  setIzle(izle) {
    set({ izle });
  },
  panoSec(kart) {
    if (kart === get().pano) return;
    if (kart !== "hesap") secimYaz(panoSecimAnahtari, kart);
    const yapilan = okuYapilan(kart);
    const yeni = { pano: kart, asama: null };
    set({ ...yeni, yapilan, secili: bbSiradakiAcik(bbGezilenTeller(yeni), yapilan)?.no ?? 1 });
  },
  asamaSec(no) {
    const yeni = { pano: get().pano, asama: no };
    const teller = bbGezilenTeller(yeni);
    set({ asama: no, secili: bbSiradakiAcik(teller, get().yapilan)?.no ?? teller[0]?.no ?? get().secili });
  },
  isaretle(no, takildi) {
    const { pano } = get();
    const yapilan = new Set(get().yapilan);
    const yeni = takildi ?? !yapilan.has(no);
    if (yeni) yapilan.add(no);
    else yapilan.delete(no);
    yazYapilan(pano, yapilan);
    set({ yapilan, secili: yeni ? (bbSiradakiAcik(bbGezilenTeller(get()), yapilan, no)?.no ?? no) : no });
  },
  sec(no) {
    set({ secili: no });
  },
  git(yon, yalnizAcik = false) {
    const t = bbGezilenTeller(get());
    if (!t.length) return;
    const { secili, yapilan } = get();
    let i = Math.max(0, t.findIndex((x) => x.no === secili));
    for (let k = 0; k < t.length; k++) {
      i = (i + yon + t.length) % t.length;
      if (!yalnizAcik || !yapilan.has(t[i].no)) break;
    }
    set({ secili: t[i].no });
  },
  sifirla() {
    const yapilan = new Set<number>();
    yazYapilan(get().pano, yapilan);
    set({ yapilan, secili: bbGezilenTeller(get())[0]?.no ?? 1 });
  },
}));

/** Odaktaki tel */
export const bbSeciliTel = (s: Pick<BbKurulumState, "pano" | "secili">): BbTel | null => (s.secili ? (bbPano(s.pano).plan.teller[s.secili - 1] ?? null) : null);

// sahnedeki kart değişince o kartın ilk panosu (ilerlemesi tarayıcıdan)
kartDegisince((tur) => {
  const pano = ilkPano(tur);
  if (useBbKurulum.getState().pano === pano) return;
  useBbKurulum.setState({ pano, asama: null, yapilan: okuYapilan(pano), secili: null });
});
