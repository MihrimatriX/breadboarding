// Kurulum belgesi üretilen kartlar: hangi bilgisayar tanımından gelir, ne işe yarar.
// Kaynak, KiCad şemasının kaynağıyla aynıdır (board/kicad-files.ts, KICAD_CARDS): CPU, saat ve test
// bellek kartı test bilgisayarından (buildComputerBoard), anakart kartları anakarttan. CPU ve saat
// kartı iki tanımda da aynı çipler, aynı teller; yalnızca adsız netlerin numaraları (N123) tanıma göre
// değişir, belgedeki adlar şemadakilerle aynı olsun diye şemanın tanımı kullanılır.

import type { Board } from "../board/board.ts";
import { buildComputerBoard } from "../board/computer.ts";
import { boardLayout, type BoardLayout } from "../board/layout.ts";
import { buildFullMachineBoard } from "../board/machine-board.ts";
import { buildProgrammerBoard } from "../board/programmer-card.ts";
import { buildHesapBoard } from "../../hesap8/kart.ts";
import { kurulumPlani, type KurulumPlani } from "./plan.ts";

export type KurulumKaynagi = "anakart" | "bilgisayar" | "programlayici" | "hesap";

export interface KurulumKarti {
  kart: string;
  kaynak: KurulumKaynagi;
  /** kartın işi, kapakta */
  aciklama: string;
  /**
   * Kurulum yolu: deneyler (1–8) breadboard'da, tam bilgisayar PCB'de (kartlar KiCad şemalarından,
   * çipler soketlerde). "breadboard → PCB": önce deneyde breadboard'da, sonra bilgisayarda PCB.
   */
  yol: "breadboard" | "breadboard → PCB" | "PCB";
  /** belgelerin başlığındaki ürün adı (varsayılan "CPU16"; bilgisayardan bağımsız aletlerde kendi adı) */
  urun?: string;
  /** deney rehberi yerine aşama aşama kurulum rehberi (depoda markdown) */
  rehber?: string;
}

/** Kurulum sırasıyla (deney sırası) */
export const KURULUM_KARTLARI: KurulumKarti[] = [
  {
    kart: "clk", kaynak: "bilgisayar", yol: "breadboard → PCB",
    aciklama: "Kristal osilatörden CPU saatini (CLK, osilatör / 8), bellek yazma penceresini (WR_WIN) ve uzatılmayan zaman tabanını (TCLK) üretir. Açılış reseti ve RESET butonu, OTOMATİK / ADIM kipi ve ADIM butonu (bir basış = bir CPU döngüsü), YAVAŞ / HIZLI osilatör seçimi, bellek kartlarının bekleme isteğiyle (~WAIT) saati uzatma.",
  },
  {
    kart: "prog", kaynak: "programlayici", yol: "breadboard",
    aciklama: "EEPROM programlayıcı: Arduino Nano seri porttan Intel HEX alır, iki 74HC595 kaydırmalı register'la 15 bitlik adresi kurar, ZIF soketteki 28C256'yı korumalı sayfa yazmayla programlar ve doğrular. BIOS EEPROM'u ve video kartının karakter ROM'u bununla yazılır.",
  },
  {
    kart: "cpu", kaynak: "bilgisayar", yol: "breadboard → PCB",
    aciklama: "16 bitlik işlemcinin kendisi: 8 × 16 bit register dosyası, geçici register'lar (TA, TB), ALU ve kod çözücüsü, bayraklar, program sayacı, MAR ve IR, bellek arayüzü ve kapılarla kurulu mikrokod kontrol birimi. Kartta ROM yok: mikrokod ve ALU kod çözme 74HC kapılarıdır. Deney 4–7'de blok blok kurulur.",
  },
  {
    kart: "mem", kaynak: "bilgisayar", yol: "breadboard",
    aciklama: "Test bellek kartının gerçek kurulumda yalnızca 0xFF00 çıkış mandalı kurulur: CPU'nun FF00 adresine yazdığı bayt 74HC574'te tutulur ve 8 LED'le (gösterge modülü) izlenir. G/Ç kartına kadar programların tek çıkışı, sonra hata ayıklama ışığıdır. Kartın 64 KB RAM bloğu yalnızca simülasyondadır.",
  },
  {
    kart: "bellek", kaynak: "anakart", yol: "breadboard → PCB",
    aciklama: "Bilgisayarın ana belleği: 32 KB EEPROM (28C256, BIOS) ve 128 KB RAM (4 × 62256), 16 KB'lik bank'lar halinde. Bank register'ları fiziksel adresin üst bitlerini (PA14..PA19) üretir; bayt sıralayıcı her 16 bitlik kelimeyi iki 8 bitlik erişimle okur ve yazar, bu sırada ~WAIT ile CPU'yu bekletir.",
  },
  {
    kart: "onbellek", kaynak: "anakart", yol: "breadboard → PCB",
    aciklama: "2 KB doğrudan eşlemeli önbellek: 1024 satırlık etiket ve veri SRAM'leri, 74HC688 karşılaştırıcılar, yazma gözetleme, isabet ve ıskalama sayaçları. G/Ç adres çözme ile bekleme ve sıralama blokları bellek kartı için de gereklidir (Deney 8).",
  },
  {
    kart: "gc", kaynak: "anakart", yol: "PCB",
    aciklama: "Giriş / çıkış kartı: UART verici ve alıcısı (CH340 USB-seri modülüne), PS/2 klavye arayüzü, programlanabilir zamanlayıcı, kesme denetleyicisi ve durum register'ları. Bilgisayarın terminali ve klavyesi bu karttan geçer.",
  },
  {
    kart: "video", kaynak: "anakart", yol: "PCB",
    aciklama: "VGA video kartı: 25,175 MHz piksel saati, 640 × 480 @ 60 Hz tarama, 80 × 30 karakterlik metin ekranı, 16 renk, imleç. VRAM CPU ile ekran taraması arasında paylaşılır; karakter ROM'u (28C256) programlayıcıyla yazılır. Piksel yolunda birkaç 74AC çipi vardır.",
  },
  {
    kart: "kyb", kaynak: "anakart", yol: "PCB",
    aciklama: "Kendin yap bellek kartı (eğitim kartı, FF40–FF4F): 16 baytlık RAM, her bayt bir 74HC574; adres çözme ve veriyolu tamponu. Bir 62256'nın içinde olanı açıkta gösterir. Bilgisayarın çalışması için gerekmez.",
  },
  {
    kart: "hesap", kaynak: "hesap", yol: "PCB", urun: "8 bit hesap makinesi", rehber: "hesap8/docs/kurulum-rehberi.md",
    aciklama: "8 bit hesap makinesi (bilgisayardan bağımsız): A ve B sayıları 8'li DIP anahtarlarla, işlem 2'li DIP anahtarla seçilir; toplama, çıkarma, çarpma ve bölme tamamen 74HC kapılarıyla, program ve saat olmadan yapılır. Sayılar ve sonuç onluk 7 segment göstergelerde (A, B, işaret + 5 haneli sonuç, bölmede kalan). Bloklar ayrı ayrı breadboard'da denenebilir; bütün kart PCB içindir.",
  },
];

export const kurulumKarti = (kart: string): KurulumKarti => {
  const k = KURULUM_KARTLARI.find((x) => x.kart === kart);
  if (!k) throw new Error(`Bilinmeyen kart: ${kart} (kartlar: ${KURULUM_KARTLARI.map((x) => x.kart).join(", ")})`);
  return k;
};

/** Bilgisayar tanımları ve yerleşimleri bir kez kurulur, bütün kartlar paylaşır */
export class KurulumVerisi {
  private readonly boards = new Map<KurulumKaynagi, { board: Board; layout: BoardLayout }>();

  board(k: KurulumKaynagi): { board: Board; layout: BoardLayout } {
    let x = this.boards.get(k);
    if (!x) {
      const board =
        k === "anakart" ? buildFullMachineBoard().board
        : k === "bilgisayar" ? buildComputerBoard().board
        : k === "hesap" ? buildHesapBoard().board
        : buildProgrammerBoard().board;
      x = { board, layout: boardLayout(board) };
      this.boards.set(k, x);
    }
    return x;
  }

  plan(kart: string): KurulumPlani {
    const { board, layout } = this.board(kurulumKarti(kart).kaynak);
    return kurulumPlani(board, kart, { layout });
  }
}
