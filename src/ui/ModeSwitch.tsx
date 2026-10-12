import type { ReactNode } from "react";
import { onYukle } from "../bolumler";

export type Mode = "6502" | "cpu16" | "kart" | "hesap" | "mimari";

export function modeFromHash(): Mode {
  if (location.hash === "#cpu16") return "cpu16";
  if (location.hash === "#kart") return "kart";
  if (location.hash === "#hesap") return "hesap";
  if (location.hash === "#mimari" || location.hash.startsWith("#mimari/")) return "mimari";
  return "6502";
}

/** Bir bölümün adı, üst çubuktaki ipucu ve Başlangıç panelindeki tanıtımı */
export interface Bolum {
  mode: Mode;
  hash: string;
  ad: string;
  /** üst çubuk ipucu: tek satır */
  ipucu: string;
  /** Başlangıç panelinde: ne olduğu, nasıl kullanılır */
  tanitim: string;
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
    ad: "6502 die",
    ipucu: "MOS 6502'nin kalıbı: 3.510 transistör, 3D ve canlı",
    tanitim:
      "Gerçek MOS 6502 işlemcisinin kalıbı, transistör seviyesinde çalışıyor. Die üzerinde bir tele tıklayıp sinyali ölç, mantık analizörüne ekle; Program sekmesinden kendi 6502 kodunu yükle.",
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
    ad: "CPU16 tezgâhı",
    ipucu: "Kendi 16 bit işlemcimiz: assembly / C yaz, derle, çalıştır",
    tanitim:
      "Kendi 16 bit işlemcimiz için assembly ya da C yaz, derle ve BIOS'lu makinede çalıştır. VGA ekranı, PS/2 klavye ve UART terminali tezgâhta; Web Serial ile gerçek karta da gönderebilirsin.",
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
    ad: "CPU16 kartı 3D",
    ipucu: "Aynı bilgisayar kartlarıyla 3D'de, kapı seviyesinde",
    tanitim:
      "Aynı bilgisayarın bütün kartları ve entegreleri 3D'de, kapı seviyesinde. Bir çipe tıkla: telleri, bağlantıları ve içindeki kapılar açılır. Kurulum sekmesi kartı tel tel kurdurur.",
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
    ad: "8 bit hesap 3D",
    ipucu: "DIP anahtarlı, 7 segment göstergeli hesap makinesi kartı",
    tanitim:
      "İki 8 bitlik sayıyı DIP anahtarlarla gir; toplama, çıkarma, çarpma ve bölme tamamen kapılarla yapılır, sonuç 7 segment göstergelerde. Anahtarlara 3D'de ya da Hesap sekmesinden tıkla.",
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
    ad: "Mimari",
    ipucu: "Blok diyagramları: kartlar, yollar ve görevleri",
    tanitim:
      "Bilgisayarın ve hesap makinesinin blok diyagramları: her kutu bir işlev bloğu (görevi ve entegreleri), çizgiler veri, adres ve kontrol yolları. Bir kutuya tıkla: parçaları ve yolları açılır, 3D'de yerine git.",
    simge: svg(
      <>
        <rect x="2.5" y="3" width="6" height="5" rx="1" />
        <rect x="11.5" y="3" width="6" height="5" rx="1" />
        <rect x="7" y="12.5" width="6" height="5" rx="1" />
        <path d="M8.5 5.5h3M5.5 8v2.25h9V8M10 10.25v2.25" opacity="0.8" />
      </>,
    ),
  },
];

export const bolum = (mode: Mode): Bolum => BOLUMLER.find((b) => b.mode === mode)!;

/** Uygulamanın bölümleri arasında geçiş: 6502 die görünümü, CPU16 tezgâhı, CPU16 kartı (3D), 8 bit hesap makinesi (3D) ve mimari diyagramları. */
export function ModeSwitch({ mode }: { mode: Mode }) {
  return (
    <nav className="modes" aria-label="Bölüm">
      {BOLUMLER.map((b) => (
        <a
          key={b.mode}
          href={b.hash}
          aria-current={mode === b.mode ? "page" : undefined}
          data-tip={b.ipucu}
          onPointerEnter={() => onYukle(b.mode)}
          onFocus={() => onYukle(b.mode)}
        >
          {b.simge}
          <span className="modes-ad">{b.ad}</span>
        </a>
      ))}
    </nav>
  );
}
