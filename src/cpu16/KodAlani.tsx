// Web IDE'nin renkli editörü: yazım, seçim, geri alma ve ekran okuyucu düz bir <textarea>'da kalır (yazısı
// saydam, imleci görünür); arkasındaki <pre> aynı metni renkli parçalar hâlinde çizer (renklendir.ts) ve
// textarea kaydıkça onunla birlikte kayar. Hatalı satırların zemini hata renginde. Yazı ölçüleri iki
// katmanda ortak (styles.css, .kod-alani): biri değişirse ötekiyle kayar.

import { forwardRef, useMemo, useRef, type TextareaHTMLAttributes } from "react";
import type { Dil } from "./dil";
import { renklendir } from "./renklendir";

type Ozellikler = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> & {
  value: string;
  dil: Dil;
  /** hatalı satırların numaraları (1'den) */
  hataliSatirlar?: readonly number[];
};

/** ref textarea'ya gider (satıra gitme, seçim) */
export const KodAlani = forwardRef<HTMLTextAreaElement, Ozellikler>(function KodAlani({ value, dil, hataliSatirlar = [], onScroll, ...ta }, ref) {
  const kod = useRef<HTMLElement>(null);
  const satirlar = useMemo(() => renklendir(value, dil), [value, dil]);
  const hatali = new Set(hataliSatirlar);
  return (
    <div className="kod-alani">
      <pre aria-hidden="true">
        <code ref={kod}>
          {satirlar.map((s, i) => (
            <span key={i} className={hatali.has(i + 1) ? "kd-satir kd-hata" : "kd-satir"}>
              {s.map((p, j) => (p.tur ? <span key={j} className={`kd-${p.tur}`}>{p.metin}</span> : p.metin))}
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
      <textarea
        {...ta}
        ref={ref}
        value={value}
        spellCheck={false}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (kod.current) kod.current.style.transform = `translate(${-el.scrollLeft}px, ${-el.scrollTop}px)`;
          onScroll?.(e);
        }}
      />
    </div>
  );
});
