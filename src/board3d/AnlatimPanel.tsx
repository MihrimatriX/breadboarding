// Yan paneldeki Anlatım sekmesi: sahnedeki kartı blok blok gezen tur (adımları anlatim.ts'te). Her adım
// bir bölümü seçer (useBolum): kamera oraya uçar, sahnede çipleri vurgulanır, altta bölüm paneli (görevi,
// nasıl çalışır, kurulum aşaması, dış sinyaller, parçalar) açılır. Sahneden başka bir bölüm seçilirse
// tur onun bloğunun adımında durur. ← → ile gezilir (yazı alanındayken değil).

import { useEffect, useMemo } from "react";
import { bolumMetni, type Bolum } from "../../cpu16/board/bolum-bilgi";
import { useDil, useT } from "../ui/ceviri";
import { kartBasligi } from "./adlar";
import { turAdimlari, turdakiYeri } from "./anlatim";
import { katalog, useBolum } from "./bolum";
import { BolumPanel } from "./BolumPanel";
import { sayi } from "./levels";

export function AnlatimPanel() {
  const t = useT();
  const dil = useDil();
  const secili = useBolum((s) => s.secili);
  const k = katalog();
  const adimlar = useMemo(() => turAdimlari(k), [k]);
  const i = turdakiYeri(k, adimlar, secili);
  const git = (j: number) => {
    if (adimlar.length) useBolum.getState().sec(adimlar[Math.max(0, Math.min(adimlar.length - 1, j))].id, true);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName) || el.closest(".vga-screen"))) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const j = turdakiYeri(k, adimlar, useBolum.getState().secili);
      git(e.key === "ArrowRight" ? j + 1 : Math.max(0, j - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, adimlar]);

  // adımlar kart kart öbeklenir (seçim listesinde)
  const kartlar = useMemo(() => {
    const m = new Map<string, Bolum[]>();
    for (const a of adimlar) (m.get(a.kart) ?? m.set(a.kart, []).get(a.kart)!).push(a);
    return [...m];
  }, [adimlar]);
  const adimAdi = (a: Bolum) => (a.tur === "kart" ? `${bolumMetni(a, dil).baslik} · ${t("genel bakış", "overview")}` : bolumMetni(a, dil).baslik);
  const blokSayisi = adimlar.filter((a) => a.tur === "blok").length;

  return (
    <div className="anlatim">
      <div className="an-gezgin">
        <div className="an-ust">
          <select value={i < 0 ? "" : adimlar[i].id} onChange={(e) => e.target.value && useBolum.getState().sec(e.target.value, true)} aria-label={t("Turun adımı", "Tour step")}>
            {i < 0 && <option value="">{t("Bir adım seç…", "Pick a step…")}</option>}
            {kartlar.map(([kart, liste]) => (
              <optgroup key={kart} label={kartBasligi(kart, bolumMetni(liste[0], "tr").baslik, dil)}>
                {liste.map((a) => (
                  <option key={a.id} value={a.id}>
                    {adimlar.indexOf(a) + 1}. {adimAdi(a)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="an-sayac" aria-live="polite">
            {i < 0 ? sayi(adimlar.length, dil) : `${sayi(i + 1, dil)} / ${sayi(adimlar.length, dil)}`}
          </span>
        </div>
        <div className="an-bar" aria-hidden="true">
          <span style={{ width: `${i < 0 ? 0 : (100 * (i + 1)) / adimlar.length}%` }} />
        </div>
        <div className="an-dugmeler">
          <button onClick={() => git(i - 1)} disabled={i <= 0} title={t("Önceki adım (←)", "Previous step (←)")}>
            ← {t("Önceki", "Previous")}
          </button>
          <button className="primary" onClick={() => git(i + 1)} disabled={i >= adimlar.length - 1} title={t("Sonraki adım (→)", "Next step (→)")}>
            {i < 0 ? t("Tura başla", "Start the tour") : t("Sonraki", "Next")} →
          </button>
        </div>
      </div>
      {i < 0 && !secili ? (
        <section className="an-giris">
          <h2>{k.tur === "hesap" ? t("Hesap makinesini blok blok tanı", "Get to know the calculator block by block") : t("Bilgisayarı blok blok tanı", "Get to know the computer block by block")}</h2>
          <p>
            {t(
              `Tur ${sayi(k.kartlar.length, dil)} kartın ${sayi(blokSayisi, dil)} işlev bloğunu sırayla gezer. Her adımda kamera bloğa gider, sahnede çipleri vurgulanır; burada ne işe yaradığı, nasıl çalıştığı, dışarıyla hangi sinyallerle bağlandığı ve hangi kurulum aşamasında kurulduğu yazar.`,
              `The tour visits the ${sayi(blokSayisi, dil)} function blocks of ${k.kartlar.length === 1 ? "the board" : `the ${sayi(k.kartlar.length, dil)} boards`} in order. At each step the camera flies to the block and its chips light up in the scene; this panel says what it is for, how it works, which signals connect it to the rest and in which build stage it goes in.`,
            )}
          </p>
          <p className="hint-text">{t("← → ile de gezebilirsin. Sahnede bir bölüme tıklarsan tur oradan sürer.", "You can also use ← →. Click a section in the scene and the tour carries on from there.")}</p>
        </section>
      ) : (
        <BolumPanel />
      )}
    </div>
  );
}
