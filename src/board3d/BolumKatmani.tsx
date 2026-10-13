// Bölüm katmanının DOM'daki kısmı (sahnenin üstünde): kenar etiketleri (ayrıntılı kipte, yakından;
// yerleri Bolumler3D'deki KenarHesabi'ndan), etiketlerden çip gruplarına çizgiler, plakanın ya da
// etiketin üstüne gelince bölümün görevi (ipucu) ve E kısayolu (etiket kipleri arasında döner).
//
// Çizgiler: kutunun iç kenarından kısa bir yatay çıkış, sonra grubun çıkışa en yakın görünen parçasının
// kenarına (nokta); grubun ekranda görünen bütün parçalarının çevresi ince bir dörtgenle işaretlenir.
// Çizgilerin altında koyu bir hâle: renk krem board'da, tellerin üstünde ve iki temada da okunur.

import { useEffect, type CSSProperties } from "react";
import { kisayolAlani } from "../ui/ayarlar";
import { useT } from "../ui/ceviri";
import { bolumu, useBolum } from "./bolum";
import { girisNoktasi } from "./bolumSahne";
import { useKenar, type KenarEtiketi } from "./Bolumler3D";

function Cizgi({ e, kalin }: { e: KenarEtiketi; kalin: boolean }) {
  const y = e.y + e.h / 2;
  const dis = e.taraf === "sol" ? e.x + 12 : e.x - 12;
  const cikis: [number, number] = [dis, y];
  // çizgi çıkışa en yakın parçaya; grubun öbür görünen parçaları yalnız çevreleriyle işaretli
  const hedef = e.parcalar.reduce((en, p) => (Math.hypot(p.orta[0] - dis, p.orta[1] - y) < Math.hypot(en.orta[0] - dis, en.orta[1] - y) ? p : en));
  const [x, yy] = girisNoktasi(cikis, hedef.orta, hedef.kose);
  const yol = `M${e.x},${y}H${dis}L${x.toFixed(1)},${yy.toFixed(1)}`;
  const dortgenler = e.parcalar.map((p) => p.kose.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" "));
  const w = kalin ? 3 : 2;
  return (
    <g style={{ "--renk": e.renk } as CSSProperties}>
      <path d={yol} className="hale" strokeWidth={w + 3} />
      {dortgenler.map((d, i) => <polygon key={`h${i}`} points={d} className="hale" strokeWidth={w + 2.5} />)}
      <path d={yol} className="cizgi" strokeWidth={w} />
      {dortgenler.map((d, i) => <polygon key={i} points={d} className="parca" strokeWidth={w} />)}
      <circle cx={x} cy={yy} r={kalin ? 4 : 3} className="dugum" />
    </g>
  );
}

/** Plakanın ya da kenar etiketinin üstüne gelince: bölümün başlığı ve görevi */
function BolumIpucu() {
  const t = useT();
  const u = useBolum((s) => s.ustunde);
  const b = bolumu(u?.id ?? null);
  if (!u || !b) return null;
  return (
    <div className="tooltip bolum-ipucu" style={{ transform: `translate(${u.x + 14}px, ${u.y + 14}px)` }}>
      <div className="bi-ust">
        <b>{b.etiket}</b>
        <span>{b.baslik}</span>
      </div>
      <p>{b.gorev}</p>
      <div className="bi-alt">{t("Tıkla: nasıl çalıştığı ve çipleri yan panelde", "Click: how it works and its chips, in the side panel")}</div>
    </div>
  );
}

/** Sahnenin üstündeki bölüm katmanı (BoardScene, tuvalin yanında) */
export function BolumKatmani() {
  const kip = useBolum((s) => s.kip);
  const secili = useBolum((s) => s.secili);
  const ustunde = useBolum((s) => s.ustunde?.id ?? null);
  const etiketler = useKenar((s) => s.etiketler);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !kisayolAlani(e) || e.key.toLocaleLowerCase("tr-TR") !== "e") return;
      e.preventDefault();
      useBolum.getState().kipDegistir();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // katman kalkınca ipucu da kalkar
  useEffect(() => () => useBolum.getState().ustundeSec(null), []);
  const ustSec = (id: string) => (ev: React.PointerEvent) => useBolum.getState().ustundeSec({ id, x: ev.clientX, y: ev.clientY });
  return (
    <>
      {kip === "ayrintili" && etiketler.length > 0 && (
        <div className="bolum-katmani">
          <svg className="bolum-cizgiler" aria-hidden="true">
            {etiketler.map((e) => <Cizgi key={e.id} e={e} kalin={e.id === secili || e.id === ustunde} />)}
          </svg>
          {etiketler.map((e) => (
            <button
              key={e.id}
              type="button"
              className={`kenar-etiketi ${e.taraf}${e.id === secili ? " secili" : ""}`}
              style={{ left: e.x, top: e.y, "--renk": e.renk } as CSSProperties}
              aria-pressed={e.id === secili}
              onPointerEnter={ustSec(e.id)}
              onPointerMove={ustSec(e.id)}
              onPointerLeave={() => useBolum.getState().ustundeSec(null)}
              onFocus={(ev) => {
                const r = ev.currentTarget.getBoundingClientRect();
                useBolum.getState().ustundeSec({ id: e.id, x: r.left, y: r.bottom - 8 });
              }}
              onBlur={() => useBolum.getState().ustundeSec(null)}
              onClick={() => useBolum.getState().sec(e.id === secili ? null : e.id)}
            >
              {e.etiket}
            </button>
          ))}
        </div>
      )}
      <BolumIpucu />
    </>
  );
}
