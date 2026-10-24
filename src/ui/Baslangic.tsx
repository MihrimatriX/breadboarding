// Başlangıç paneli (uygulama içi kılavuz): ilk ziyarette sol altta açılan, sahneyi kapatmayan küçük bir
// kutu. Solda altı bölümün listesi, sağda seçilenin tanıtımı ve 3-4 maddelik ilk adımları (metinler
// kilavuz.ts'te, iki dilde); altta ortak kısayollar ve dil seçimi. Açılınca bulunulan bölüm seçili gelir;
// listeden başka bir bölümü okuyup oradan o bölüme geçilebilir, panel açık kalır ki adımlar izlenebilsin.
// Sol üstteki düğmenin kutusundaki "Başlangıç ve yardım" ya da "?" tuşu istendiği an yeniden açar. Kapatınca tarayıcı hatırlar;
// otomatik testlerde (navigator.webdriver) kendiliğinden açılmaz ki ekran görüntülerinde sahneyi örtmesin.

import { useEffect, useRef, useState, type KeyboardEvent as TusOlayi } from "react";
import { create } from "zustand";
import { BOLUMLER, bolum, type Mode } from "./ModeSwitch";
import { Simge, type SimgeAdi } from "./simgeler";
import { sec, useDil, useT } from "./ceviri";
import { GIRIS, ILK_ADIMLAR, ORTAK_IPUCLARI, PANEL_IPUCU, parcala } from "./kilavuz";

const ANAHTAR = "silikon3d.baslangic";

function ilkZiyaret(): boolean {
  try {
    if (localStorage.getItem(ANAHTAR)) return false;
  } catch {
    // depolama kapalı: her açılışta göstermek yerine hiç gösterme
    return false;
  }
  return !navigator.webdriver;
}

export const useBaslangic = create<{ acik: boolean; odakla: boolean }>(() => ({ acik: ilkZiyaret(), odakla: false }));

/** Paneli aç (düğmeyle açılınca klavye odağı panele geçer) */
export function baslangiciAc(): void {
  useBaslangic.setState({ acik: true, odakla: true });
}

export function baslangiciKapat(): void {
  useBaslangic.setState({ acik: false, odakla: false });
  try {
    localStorage.setItem(ANAHTAR, "goruldu");
  } catch {
    // depolama kapalı: yalnız bu oturumda kapalı kalır
  }
}

/** Klavye kısayolu "?": yazı alanlarında ve klavyeyi karta ileten ekranlarda değil */
function yardimTusu(e: KeyboardEvent): boolean {
  if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return false;
  const el = e.target as HTMLElement | null;
  return !el?.closest?.("input, textarea, select, [contenteditable], .vga-screen, #cpu16-vga, #cpu16-term");
}

/** Ters tırnaklı kılavuz metni: tırnak içleri <kbd> */
function Metin({ m }: { m: string }) {
  return <>{parcala(m).map((p, i) => (p.tus ? <kbd key={i}>{p.yazi}</kbd> : p.yazi))}</>;
}

const IPUCU_SIMGELERI: SimgeAdi[] = ["klavye", "dil"];

export function Baslangic({ mode }: { mode: Mode }) {
  const acik = useBaslangic((s) => s.acik);
  const odakla = useBaslangic((s) => s.odakla);
  const kutu = useRef<HTMLDivElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const dil = useDil();
  const t = useT();
  // okunan bölüm: açılınca ve bölüm değişince bulunulan bölüm
  const [secili, setSecili] = useState<Mode>(mode);
  useEffect(() => setSecili(mode), [mode, acik]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (yardimTusu(e)) {
        e.preventDefault();
        if (useBaslangic.getState().acik) baslangiciKapat();
        else baslangiciAc();
      } else if (e.key === "Escape" && useBaslangic.getState().acik && kutu.current?.contains(e.target as Node)) {
        e.stopPropagation();
        baslangiciKapat();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    if (acik && odakla) kutu.current?.focus();
  }, [acik, odakla]);

  if (!acik) return null;

  // bölüm listesi dikey sekmeler: yukarı / aşağı ok, Home, End
  const okTusu = (e: TusOlayi<HTMLDivElement>) => {
    const i = BOLUMLER.findIndex((b) => b.mode === secili);
    const n = BOLUMLER.length;
    const j = e.key === "ArrowDown" ? (i + 1) % n : e.key === "ArrowUp" ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    setSecili(BOLUMLER[j].mode);
    liste.current?.querySelector<HTMLButtonElement>(`[data-bolum="${BOLUMLER[j].mode}"]`)?.focus();
  };

  const b = bolum(secili);
  const ad = sec(b.ad, dil);
  return (
    <div className="baslangic" role="dialog" aria-modal="false" aria-labelledby="baslangic-baslik" tabIndex={-1} ref={kutu}>
      <div className="bs-bas">
        <div>
          <p className="bs-ust">{t("Başlangıç", "Getting started")}</p>
          <h2 id="baslangic-baslik">{t("Silikon3D'ye hoş geldin", "Welcome to Silikon3D")}</h2>
        </div>
        <button className="icon-btn" onClick={baslangiciKapat} aria-label={t("Kapat", "Close")} data-tip={t("Kapat (Esc)", "Close (Esc)")} data-tip-hiza="son">
          <Simge ad="kapat" />
        </button>
      </div>
      <p className="bs-giris">{sec(GIRIS, dil)}</p>
      <div className="bs-govde">
        <div className="bs-liste" role="tablist" aria-orientation="vertical" aria-label={t("Bölümler", "Sections")} ref={liste} onKeyDown={okTusu}>
          {BOLUMLER.map((x) => (
            <button
              key={x.mode}
              role="tab"
              id={`bs-sekme-${x.mode}`}
              data-bolum={x.mode}
              aria-selected={x.mode === secili}
              aria-controls="bs-ayrinti"
              tabIndex={x.mode === secili ? 0 : -1}
              className="bs-sekme"
              onClick={() => setSecili(x.mode)}
            >
              <span className="bs-simge">{x.simge}</span>
              <span className="bs-sekme-ad">{sec(x.ad, dil)}</span>
              {x.mode === mode && (
                <span className="bs-nokta" title={t("Buradasın", "You are here")}>
                  <span className="sr-only">{t("(buradasın)", "(you are here)")}</span>
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="bs-ayrinti" id="bs-ayrinti" role="tabpanel" aria-labelledby={`bs-sekme-${secili}`}>
          <div className="bs-ayrinti-bas">
            <h3>{ad}</h3>
            {secili === mode ? (
              <span className="bs-burada">{t("buradasın", "you are here")}</span>
            ) : (
              <a href={b.hash} className="bs-ac">
                {t("bölümü aç", "open section")} <Simge ad="ok" boyut={14} />
              </a>
            )}
          </div>
          <p className="bs-tanitim">{sec(b.tanitim, dil)}</p>
          <p className="bs-adim-bas">{t("İlk adımlar", "First steps")}</p>
          <ol className="bs-adimlar">
            {ILK_ADIMLAR[secili].map((m, i) => (
              <li key={i}><Metin m={sec(m, dil)} /></li>
            ))}
          </ol>
        </div>
      </div>
      <div className="bs-ipuclari" role="group" aria-label={t("Ortak kısayollar", "Common shortcuts")}>
        {ORTAK_IPUCLARI.map((m, i) => (
          <span key={i}><Simge ad={IPUCU_SIMGELERI[i]} /> <span><Metin m={sec(m, dil)} /></span></span>
        ))}
      </div>
      <div className="bs-alt">
        <span className="hint-text">{sec(PANEL_IPUCU, dil)}</span>
        <button className="primary" onClick={baslangiciKapat}>{t("Başla", "Start")}</button>
      </div>
    </div>
  );
}
