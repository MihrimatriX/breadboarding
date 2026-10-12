// Başlangıç paneli: ilk ziyarette sol altta açılan, sahneyi kapatmayan küçük bir tanıtım. Beş bölümü
// birkaç cümleyle anlatır, fare ve klavye ipuçlarını verir. Üst çubuktaki "?" düğmesi ya da "?" tuşu
// istendiği an yeniden açar. Kapatınca tarayıcı hatırlar; otomatik testlerde (navigator.webdriver)
// kendiliğinden açılmaz ki ekran görüntülerinde sahneyi örtmesin.

import { useEffect, useRef } from "react";
import { create } from "zustand";
import { BOLUMLER, type Mode } from "./ModeSwitch";
import { Simge } from "./simgeler";

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

export function Baslangic({ mode }: { mode: Mode }) {
  const acik = useBaslangic((s) => s.acik);
  const odakla = useBaslangic((s) => s.odakla);
  const kutu = useRef<HTMLDivElement>(null);

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
  return (
    <div className="baslangic" role="dialog" aria-modal="false" aria-labelledby="baslangic-baslik" tabIndex={-1} ref={kutu}>
      <div className="bs-bas">
        <div>
          <p className="bs-ust">Başlangıç</p>
          <h2 id="baslangic-baslik">Silikon3D'ye hoş geldin</h2>
        </div>
        <button className="icon-btn" onClick={baslangiciKapat} aria-label="Kapat" data-tip="Kapat (Esc)" data-tip-hiza="son">
          <Simge ad="kapat" />
        </button>
      </div>
      <p className="bs-giris">
        Bir bilgisayarı transistörden karta kadar tarayıcıda, canlı sinyallerle çalıştırır. Beş bölüm var; üst çubuktan istediğin an
        geçebilirsin, her bölüm kaldığı yerden devam eder.
      </p>
      <ul className="bs-bolumler">
        {BOLUMLER.map((b) => (
          <li key={b.mode}>
            <a href={b.hash} className="bs-bolum" aria-current={b.mode === mode ? "page" : undefined} onClick={baslangiciKapat}>
              <span className="bs-bolum-bas">
                <span className="bs-simge">{b.simge}</span>
                <b>{b.ad}</b>
                <span className="bs-git">{b.mode === mode ? "buradasın" : <>aç <Simge ad="ok" boyut={14} /></>}</span>
              </span>
              <span className="bs-tanitim">{b.tanitim}</span>
            </a>
          </li>
        ))}
      </ul>
      <div className="bs-ipuclari" aria-label="İpuçları">
        <span><Simge ad="fare" /> <kbd>Sürükle</kbd> döndür · <kbd>Sağ tık</kbd> kaydır · <kbd>Tekerlek</kbd> yakınlaş</span>
        <span><Simge ad="ayarlar" /> <kbd>T</kbd> tema · <kbd>Y</kbd> yazı boyutu · <kbd>F</kbd> odak modu (paneller gizli)</span>
        <span><Simge ad="klavye" /> Bütün kısayollar sağ üstte; <kbd>?</kbd> bu paneli açar</span>
      </div>
      <div className="bs-alt">
        <span className="hint-text">Paneller araç çubuğunun sağındaki düğmelerle gizlenir, kenarlarından sürüklenerek büyür; boyutları hatırlanır.</span>
        <button className="primary" onClick={baslangiciKapat}>Başla</button>
      </div>
    </div>
  );
}
