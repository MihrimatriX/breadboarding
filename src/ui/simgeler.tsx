// Düğme simgeleri: satır içi SVG, yazının rengini alır (currentColor). 20 × 20 ızgarada, 1,5 px çizgi;
// yazıyla birlikte kullanılınca düğmede yazının solunda durur (styles.css: .simge).

import type { ReactNode } from "react";

const YOLLAR = {
  oynat: <path d="M6.5 4.5v11l9-5.5z" fill="currentColor" stroke="none" />,
  duraklat: <path d="M7 4.5v11M13 4.5v11" strokeWidth="2.4" />,
  adim: <path d="M5 4.5v11l7-5.5zM15 4.5v11" />,
  yarim: <path d="M4.5 13.5h4v-7h4v7h3" />,
  sifirla: <path d="M4.5 10a5.5 5.5 0 1 0 1.6-3.9M4.5 3.5v3.2h3.2" />,
  derle: <path d="M7 6 3.5 10 7 14M13 6l3.5 4-3.5 4M11 4.5l-2 11" />,
  yukle: <path d="M10 13.5v-9M6.5 8 10 4.5 13.5 8M4 15.5h12" />,
  yardim: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M8 8.2a2 2 0 1 1 2.9 1.8c-.6.3-.9.8-.9 1.4v.3" />
      <path d="M10 14h.01" strokeWidth="2.2" />
    </>
  ),
  kapat: <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />,
  klavye: (
    <>
      <rect x="2" y="5" width="16" height="10" rx="2" />
      <path d="M5.5 8.5h1M9.5 8.5h1M13.5 8.5h1M6 11.5h8" />
    </>
  ),
  fare: (
    <>
      <rect x="5.5" y="2.5" width="9" height="15" rx="4.5" />
      <path d="M10 5.5v3" />
    </>
  ),
  ok: <path d="M4.5 10h11M11 5.5l4.5 4.5-4.5 4.5" />,
  imlec: <path d="M5 3.5l10 6-4.5 1.2L8.5 15z" />,
} satisfies Record<string, ReactNode>;

export type SimgeAdi = keyof typeof YOLLAR;

/** Satır içi simge; boyut piksel (varsayılan 16) */
export function Simge({ ad, boyut = 16 }: { ad: SimgeAdi; boyut?: number }) {
  return (
    <svg className="simge" viewBox="0 0 20 20" width={boyut} height={boyut} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {YOLLAR[ad]}
    </svg>
  );
}
