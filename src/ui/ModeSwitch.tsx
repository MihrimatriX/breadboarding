import type { ReactNode } from "react";
import { onYukle } from "../bolumler";
import { sec, useDil, useT, type IkiDil } from "./ceviri";

export type Mode = "6502" | "cpu16" | "kart" | "hesap" | "mimari" | "belgeler";

export function modeFromHash(): Mode {
  if (location.hash === "#cpu16") return "cpu16";
  if (location.hash === "#kart") return "kart";
  if (location.hash === "#hesap") return "hesap";
  if (location.hash === "#mimari" || location.hash.startsWith("#mimari/")) return "mimari";
  if (location.hash === "#belgeler" || location.hash.startsWith("#belgeler/")) return "belgeler";
  return "6502";
}

/** Bir bölümün adı, üst çubuktaki ipucu ve Başlangıç panelindeki tanıtımı (iki dilde) */
export interface Bolum {
  mode: Mode;
  hash: string;
  ad: IkiDil;
  /** üst çubuk ipucu: tek satır */
  ipucu: IkiDil;
  /** Başlangıç panelinde: ne olduğu (ilk adımlar Baslangic.tsx'te) */
  tanitim: IkiDil;
  simge: ReactNode;
}

const svg = (children: ReactNode) => (
  <svg className="simge" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const BOLUMLER: Bolum[] = [
  {
    mode: "6502",
    hash: "#6502",
    ad: { tr: "6502 die", en: "6502 die" },
    ipucu: { tr: "MOS 6502'nin kalıbı: 3.510 transistör, 3D ve canlı", en: "The MOS 6502 die: 3,510 transistors, live in 3D" },
    tanitim: {
      tr: "Gerçek MOS 6502 işlemcisinin kalıbı, transistör seviyesinde çalışıyor. Veri visual6502'den: 3.510 transistör, katman katman 3D'de.",
      en: "The die of a real MOS 6502 processor, simulated at the transistor level. The data comes from visual6502: 3,510 transistors, shown layer by layer in 3D.",
    },
    simge: svg(
      <>
        <rect x="3.5" y="3.5" width="13" height="13" rx="1.5" />
        <path d="M3.5 8h13M3.5 12h13M8 3.5v13M12 8v8.5" opacity="0.7" />
      </>,
    ),
  },
  {
    mode: "cpu16",
    hash: "#cpu16",
    ad: { tr: "CPU16 tezgâhı", en: "CPU16 workbench" },
    ipucu: { tr: "Kendi 16 bit işlemcimiz: assembly / C yaz, derle, çalıştır", en: "Our own 16-bit processor: write assembly or C, compile, run" },
    tanitim: {
      tr: "Kendi 16 bit işlemcimiz CPU16'nın emülatörü, BIOS'lu bilgisayarıyla birlikte. VGA ekranı, PS/2 klavye ve UART terminali tezgâhta; Web Serial ile programı gerçek karta da gönderebilirsin.",
      en: "An emulator of CPU16, our own 16-bit processor, together with its BIOS-based computer. The VGA screen, PS/2 keyboard and UART terminal sit on the workbench, and Web Serial can send your program to a real board.",
    },
    simge: svg(
      <>
        <rect x="2.5" y="3.5" width="15" height="11" rx="1.5" />
        <path d="M6 7.5l2 1.75L6 11M10 11h3.5M7 17.5h6" />
      </>,
    ),
  },
  {
    mode: "kart",
    hash: "#kart",
    ad: { tr: "CPU16 kartı 3D", en: "CPU16 board 3D" },
    ipucu: { tr: "Aynı bilgisayar kartlarıyla 3D'de, kapı seviyesinde", en: "The same computer and its boards in 3D, at the gate level" },
    tanitim: {
      tr: "Aynı bilgisayar, bütün kartları ve entegreleriyle 3D'de, kapı seviyesinde çalışıyor. Kartları PCB ya da breadboard olarak görebilirsin; Kurulum sekmesi kartı tel tel kurdurur.",
      en: "The same computer in 3D with all its boards and chips, simulated at the gate level. You can view the boards as PCBs or as breadboards, and the Build tab takes you through the build wire by wire.",
    },
    simge: svg(
      <>
        <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
        <rect x="5" y="7" width="4" height="3" rx="0.5" />
        <rect x="11" y="7" width="4" height="6" rx="0.5" />
        <path d="M5 13h4M7 10v3" opacity="0.7" />
      </>,
    ),
  },
  {
    mode: "hesap",
    hash: "#hesap",
    ad: { tr: "8 bit hesap 3D", en: "8-bit calculator 3D" },
    ipucu: { tr: "DIP anahtarlı, 7 segment göstergeli hesap makinesi kartı", en: "Calculator board with DIP switches and 7-segment displays" },
    tanitim: {
      tr: "74HC entegrelerinden kurulan 8 bit dört işlem hesap makinesi. İki sayıyı DIP anahtarlarla girersin; toplama, çıkarma, çarpma ve bölme tamamen kapılarla yapılır, sonuç 7 segment göstergelerde.",
      en: "An 8-bit, four-function calculator built from 74HC chips. You enter two numbers on DIP switches; addition, subtraction, multiplication and division are done entirely in gates, and the result shows on 7-segment displays.",
    },
    simge: svg(
      <>
        <rect x="4" y="2.5" width="12" height="15" rx="1.5" />
        <rect x="6.5" y="5" width="7" height="3" rx="0.5" />
        <path d="M7 11h.01M10 11h.01M13 11h.01M7 14h.01M10 14h.01M13 14h.01" strokeWidth="2.2" />
      </>,
    ),
  },
  {
    mode: "mimari",
    hash: "#mimari",
    ad: { tr: "Mimari", en: "Architecture" },
    ipucu: { tr: "Blok diyagramları: kartlar, yollar ve görevleri", en: "Block diagrams: boards, buses and what they do" },
    tanitim: {
      tr: "Bilgisayarın ve hesap makinesinin blok diyagramları. Her kutu bir işlev bloğu (görevi ve entegreleri), çizgiler veri, adres ve kontrol yolları.",
      en: "Block diagrams of the computer and the calculator. Each box is a functional block (its job and its chips), and the lines are the data, address and control buses.",
    },
    simge: svg(
      <>
        <rect x="2.5" y="3" width="6" height="5" rx="1" />
        <rect x="11.5" y="3" width="6" height="5" rx="1" />
        <rect x="7" y="12.5" width="6" height="5" rx="1" />
        <path d="M8.5 5.5h3M5.5 8v2.25h9V8M10 10.25v2.25" opacity="0.8" />
      </>,
    ),
  },
  {
    mode: "belgeler",
    hash: "#belgeler",
    ad: { tr: "Belgeler", en: "Docs" },
    ipucu: { tr: "CPU16 ve hesap8 belgeleri: spec, komut seti, kartlar, deneyler", en: "CPU16 and hesap8 docs: spec, instruction set, boards, experiments" },
    tanitim: {
      tr: "Depodaki bütün belgeler uygulamanın içinde: okuma yolu, CPU16'nın spec'i ve komut seti, kartlar, BIOS ve C derleyicisi, deney rehberleri, hesap makinesi.",
      en: "Every document in the repository, inside the app: the reading path, the CPU16 spec and instruction set, the boards, the BIOS and C compiler, the experiment guides and the calculator.",
    },
    simge: svg(
      <>
        <path d="M10 5.5c-1.6-1.2-3.8-1.7-6.5-1.5v11c2.7-.2 4.9.3 6.5 1.5 1.6-1.2 3.8-1.7 6.5-1.5V4c-2.7-.2-4.9.3-6.5 1.5z" />
        <path d="M10 5.5v11" opacity="0.7" />
      </>,
    ),
  },
];

export const bolum = (mode: Mode): Bolum => BOLUMLER.find((b) => b.mode === mode)!;

/** Uygulamanın bölümleri arasında geçiş: 6502 die görünümü, CPU16 tezgâhı, CPU16 kartı (3D), 8 bit hesap makinesi (3D), mimari diyagramları ve belgeler. */
export function ModeSwitch({ mode }: { mode: Mode }) {
  const dil = useDil();
  const t = useT();
  return (
    <nav className="modes" aria-label={t("Bölüm", "Section")}>
      {BOLUMLER.map((b) => (
        <a
          key={b.mode}
          href={b.hash}
          aria-current={mode === b.mode ? "page" : undefined}
          data-tip={sec(b.ipucu, dil)}
          onPointerEnter={() => onYukle(b.mode)}
          onFocus={() => onYukle(b.mode)}
        >
          {b.simge}
          <span className="modes-ad">{sec(b.ad, dil)}</span>
        </a>
      ))}
    </nav>
  );
}
