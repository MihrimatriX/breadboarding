// İnceleme panelindeki bacak diyagramı: seçili entegrenin bacak düzeni, datasheet'teki gibi üstten bakış
// (çentik üstte, 1. bacak sol üstte, saat yönünün tersine). Her bacak canlı seviyesinin renginde (--lv0..3);
// tıklanınca neti seçilir (3D'de bütün uçları birleşir), seçili netin bacakları vurgulu. "~" ile başlayan
// adlar (aktif düşük) üstü çizili yazılır. Yerleşim saf: pinKonumu (testi cpu16/tests/arayuz.test.ts).

import type { PinPlace } from "../../cpu16/board/layout";
import { useT } from "../ui/ceviri";
import { LEVEL_NAME, levelOf } from "./levels";
import { liveNets, useKart } from "./store";

/** DIP bacağının datasheet çizimindeki yeri: 1..n/2 solda yukarıdan aşağı, gerisi sağda aşağıdan yukarı */
export function pinKonumu(num: number, pinSayisi: number): { sag: boolean; sira: number } {
  const yarim = pinSayisi / 2;
  return num <= yarim ? { sag: false, sira: num - 1 } : { sag: true, sira: pinSayisi - num };
}

const SATIR = 18;
const UST = 10;
const GOVDE_SOL = 46;
const GOVDE_SAG = 154;
const BACAK = 14;

export function PinDiyagrami({ refName, part, pins }: { refName: string; part: string; pins: readonly Pick<PinPlace, "num" | "name" | "net">[] }) {
  const t = useT();
  const secili = useKart((s) => s.net);
  useKart((s) => s.tick);
  const n = pins.length;
  const yarim = n / 2;
  const h = UST * 2 + yarim * SATIR;
  return (
    <svg className="pin-diyagrami" viewBox={`0 0 200 ${h}`} role="group" aria-label={t(`${refName} bacak düzeni`, `${refName} pinout`)}>
      <rect x={GOVDE_SOL} y={UST - 4} width={GOVDE_SAG - GOVDE_SOL} height={yarim * SATIR + 8} rx={4} className="pd-govde" />
      <path d={`M${100 - 7} ${UST - 4} a7 7 0 0 0 14 0`} className="pd-centik" />
      <text x={100} y={UST + (yarim * SATIR) / 2 + 3} textAnchor="middle" className="pd-parca">{part}</text>
      {pins.map((p) => {
        const { sag, sira } = pinKonumu(p.num, n);
        const y = UST + (sira + 0.5) * SATIR;
        const lv = p.net < 0 ? 2 : levelOf(liveNets.values, p.net);
        const sec = p.net >= 0 && p.net === secili;
        const aktifDusuk = p.name.startsWith("~");
        const ad = aktifDusuk ? p.name.slice(1) : p.name;
        const bx = sag ? GOVDE_SAG : GOVDE_SOL - BACAK;
        return (
          <g
            key={p.num}
            className={`pd-pin${sec ? " sec" : ""}${p.net > 1 ? " secilir" : ""}`}
            onClick={() => p.net > 1 && useKart.getState().selectNet(p.net === secili ? null : p.net)}
          >
            <title>{`${p.num} · ${p.name} · ${LEVEL_NAME[lv]}`}</title>
            <rect x={bx} y={y - 4} width={BACAK} height={8} rx={1.5} className={`pd-bacak l${lv}`} />
            <text x={sag ? GOVDE_SAG + BACAK + 4 : GOVDE_SOL - BACAK - 4} y={y + 3} textAnchor={sag ? "start" : "end"} className="pd-no">{p.num}</text>
            <text x={sag ? GOVDE_SAG - 5 : GOVDE_SOL + 5} y={y + 3} textAnchor={sag ? "end" : "start"} className="pd-ad" textDecoration={aktifDusuk ? "overline" : undefined}>{ad}</text>
          </g>
        );
      })}
    </svg>
  );
}
