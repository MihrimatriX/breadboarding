// Açılış sayfası (src/giris/Giris.tsx): adres kararı ve iki dilli metinler. Sitenin kökü (adres çubuğunda
// # yok) ve #giris açılış sayfasını açar; bölümler kendi adreslerinde (#6502, #cpu16, …) doğrudan açılır.
// Bölümlerin adı, tanıtımı ve simgesi ModeSwitch.tsx'teki BOLUMLER'den, önizleme görselleri seo.ts'teki
// SAYFALAR'dan gelir: burada yalnız açılış sayfasına özgü metinler. Testi cpu16/tests/arayuz.test.ts.

import type { IkiDil } from "../ui/ceviri";
import type { Mode } from "../ui/ModeSwitch";

export const GIRIS_HASH = "#giris";

/** Adres açılış sayfasını mı gösteriyor: kök (hash yok ya da yalnız "#") ya da #giris */
export function girisMi(hash: string): boolean {
  return hash === "" || hash === "#" || hash === GIRIS_HASH;
}

export const KAHRAMAN = {
  ust: { tr: "Açık kaynak · tarayıcıda, kurulum yok", en: "Open source · runs in your browser, nothing to install" },
  baslik: { tr: "Transistörden karta, tarayıcıda çalışan bir bilgisayar", en: "A computer from transistors to boards, running in your browser" },
  giris: {
    tr: "Silikon3D, gerçek bir MOS 6502'nin kalıbından yaygın 74HC çipleriyle kurduğumuz 16 bit bilgisayar CPU16'ya kadar her katmanı canlı sinyallerle çalıştırır. Kalıba yaklaş, kartın tellerini izle, BIOS'lu bilgisayara C ile program yaz.",
    en: "Silikon3D runs every layer with live signals, from the die of a real MOS 6502 to CPU16, the 16-bit computer we built from common 74HC chips. Zoom into the die, follow the wires on the boards, write C for the computer and its BIOS.",
  },
} satisfies Record<string, IkiDil>;

/** Yolculuk: dört seviye, her biri bir bölümde */
export interface Adim {
  mode: Mode;
  seviye: IkiDil;
  metin: IkiDil;
}

export const YOLCULUK: Adim[] = [
  {
    mode: "6502",
    seviye: { tr: "Transistör", en: "Transistor" },
    metin: { tr: "MOS 6502'nin 3.510 transistörü, katman katman 3D'de ve anahtar seviyesinde.", en: "The 3,510 transistors of the MOS 6502, layer by layer in 3D, at the switch level." },
  },
  {
    mode: "kart",
    seviye: { tr: "Kapı", en: "Gate" },
    metin: { tr: "Her 74HC çipinin içindeki kapılar; bütün bilgisayar kapı seviyesinde çalışır.", en: "The gates inside every 74HC chip; the whole computer is simulated at the gate level." },
  },
  {
    mode: "mimari",
    seviye: { tr: "Kart", en: "Board" },
    metin: { tr: "Kartlar, yollar ve kontrol birimi: devrenin kodundan üretilen blok diyagramları.", en: "Boards, buses and the control unit: block diagrams generated from the circuit's code." },
  },
  {
    mode: "cpu16",
    seviye: { tr: "Bilgisayar", en: "Computer" },
    metin: { tr: "BIOS, VGA ekranı, klavye ve UART: assembly ya da C yaz, derle, çalıştır.", en: "BIOS, VGA screen, keyboard and UART: write assembly or C, compile and run it." },
  },
];

/** Projenin kuralları: neden böyle kurulduğu */
export const ILKELER: { baslik: IkiDil; metin: IkiDil }[] = [
  {
    baslik: { tr: "Yalnız yaygın 74HC çipleri", en: "Only common 74HC chips" },
    metin: { tr: "Her parça birden fazla üreticinin sattığı basit bir mantık çipi; tek istisna bellek.", en: "Every part is a simple logic chip sold by more than one maker; memory is the only exception." },
  },
  {
    baslik: { tr: "Kontrol birimi kapılarla", en: "A control unit made of gates" },
    metin: { tr: "İşlemci kartında ROM yok: mikrokod 74HC kapılarından bir devreye çevrilir.", en: "No ROM on the CPU board: the microcode is turned into a circuit of 74HC gates." },
  },
  {
    baslik: { tr: "Şema = kod", en: "Schematic = code" },
    metin: { tr: "Kartlar kodda tanımlı; 3D, KiCad, malzeme listesi ve kurulum belgeleri ondan üretilir.", en: "The boards are defined in code; the 3D view, KiCad, bill of materials and build guides are generated from it." },
  },
  {
    baslik: { tr: "Altın model", en: "A golden model" },
    metin: { tr: "Mikrokod, kapı seviyesindeki kartlar ve gerçek kart emülatörle adım adım aynı kalır.", en: "The microcode, the gate-level boards and the real board stay in lockstep with the emulator." },
  },
];
