// Uygulama iskeleti: beş bölümün (6502 die, CPU16 tezgâhı, CPU16 kartı 3D, 8 bit hesap 3D, mimari) ortak parçaları.
//   AppHeader: üst çubuk (marka, bölüm geçişi, canlı ölçümler, tema, görünüm ayarları, kısayollar,
//              Başlangıç paneli); sığmazsa kademe kademe sıkışır (sikisma.ts)
//   Meter, Bayrak: canlı ölçüm ve bayrak rozetleri
//   Tabs: sekmeli paneller (yan ve alt paneller; yeni bir sekme diziye bir satır eklemekle gelir)
//   Splitter: alt panelin yüksekliğini ya da yan panelin genişliğini sürükleyerek ayarlama
//   PanelToggle, OdakDugmesi: yan / alt paneli açıp kapatan düğmeler, odak modu (paneller gizli)
//   Menu, TasmaMenusu: seyrek kullanılan denetimler için açılır kutu ("⋯")
//   useLayout: panel düzeni tercihleri (tarayıcıda saklanır)

import { isValidElement, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { ModeSwitch, type Mode } from "./ModeSwitch";
import { baslangiciAc } from "./Baslangic";
import { Simge } from "./simgeler";
import { useAyar, type TemaSecimi } from "./ayarlar";
import { useSikisma } from "./sikisma";
import { sec, useDil, useT, type Dil, type IkiDil } from "./ceviri";

/** Kısayol ve sekme tablolarında metin düz yazı (tek dil) ya da { tr, en } olabilir */
function ikiDilMi(x: unknown): x is IkiDil {
  return typeof x === "object" && x !== null && !isValidElement(x) && "tr" in x && "en" in x;
}

/** Düz yazıyı olduğu gibi, iki dilli metni seçili dilde verir */
export function metin<T>(m: T | IkiDil, dil: Dil): T | string {
  return ikiDilMi(m) ? sec(m, dil) : m;
}

// ---------------------------------------------------------------- düzen tercihleri

export interface LayoutPrefs {
  side: boolean;
  bottom: boolean;
  /** alt panelin (ya da tezgâhta düzenleyicinin) yüksekliği, piksel */
  bottomH: number;
  /** yan panelin seçili sekmesi */
  sideTab?: string;
  /** yan panelin elle ayarlanmış genişliği, piksel (yoksa bölümün varsayılanı) */
  sideW?: number;
}

/** Düzen tercihlerinin anahtarı. Yeni arayüzde varsayılanlar değişti (alt panel çoğu bölümde kapalı,
 * yan panel daha geniş): eski "silikon3d.duzen.*" kayıtları okunmaz. */
const DUZEN_ANAHTARI = (key: string) => `silikon3d.yerlesim.${key}`;

function loadPrefs(key: string, defaults: LayoutPrefs): LayoutPrefs {
  try {
    const raw = localStorage.getItem(DUZEN_ANAHTARI(key));
    if (raw) return { ...defaults, ...(JSON.parse(raw) as Partial<LayoutPrefs>) };
  } catch {
    // depolama kapalı ya da bozuk: varsayılan düzen
  }
  return defaults;
}

/** İlk açılışta alt panele pencere yüksekliğinin bir payı verilir (sonra sürükleyerek ayarlanır). */
export function heightShare(share: number, min: number, max: number): number {
  const h = typeof window === "undefined" ? 900 : window.innerHeight;
  return Math.round(Math.min(max, Math.max(min, h * share)));
}

/** Bir bölümün panel düzeni: yan panel açık mı, alt panel açık mı, alt panelin yüksekliği. */
export function useLayout(key: string, defaults: LayoutPrefs) {
  const [prefs, setPrefs] = useState<LayoutPrefs>(() => loadPrefs(key, defaults));
  const update = useCallback(
    (patch: Partial<LayoutPrefs>) =>
      setPrefs((p) => {
        const next = { ...p, ...patch };
        try {
          localStorage.setItem(DUZEN_ANAHTARI(key), JSON.stringify(next));
        } catch {
          // depolama kapalı: tercih yalnız bu oturumda geçerli
        }
        return next;
      }),
    [key],
  );
  return [prefs, update] as const;
}

/** Bölümün kök öğesine yazılan ölçüler: alt panelin yüksekliği ve (elle ayarlandıysa) yan panelin genişliği */
export function duzenStili(lay: LayoutPrefs, bottomVar = "--bottom-h"): CSSProperties {
  return {
    [bottomVar]: `${lay.bottomH}px`,
    ...(lay.sideW ? { "--side-w": `min(${lay.sideW}px, 60vw)` } : {}),
  } as CSSProperties;
}

/** Odak modunda yan ve alt paneller gizlenir: bölümler panelleri bununla açar */
export function usePaneller(lay: LayoutPrefs): { side: boolean; bottom: boolean; odak: boolean } {
  const odak = useAyar((s) => s.odak);
  return { side: lay.side && !odak, bottom: lay.bottom && !odak, odak };
}

// ---------------------------------------------------------------- üst çubuk

/** Kısayol satırı. Modül düzeyindeki tablolarda metinler { tr, en } olarak verilir (dil değişince güncellenir). */
export interface Shortcut {
  keys: string | IkiDil;
  what: string | IkiDil;
}

/** Her bölümün kısayol listesinin sonunda */
const ORTAK_KISAYOLLAR: Shortcut[] = [
  { keys: "F", what: { tr: "Odak modu: yan ve alt panelleri gizle / göster", en: "Focus mode: hide / show the side and bottom panels" } },
  { keys: "T", what: { tr: "Tema: koyu / açık", en: "Theme: dark / light" } },
  { keys: "Y", what: { tr: "Yazı boyutu: normal / büyük", en: "Text size: normal / large" } },
  { keys: "L", what: { tr: "Dil: Türkçe / English", en: "Language: Türkçe / English" } },
  { keys: "?", what: { tr: "Başlangıç: bölümler ve ipuçları", en: "Getting started: sections and tips" } },
];

/** Üst çubuk: marka ve bölümün kısa açıklaması, bölüm geçişi, canlı ölçümler, tema, görünüm ayarları, kısayol listesi ve Başlangıç. */
export function AppHeader({ mode, context, meters, shortcuts }: { mode: Mode; context?: ReactNode; meters?: ReactNode; shortcuts?: Shortcut[] }) {
  const ozel = shortcuts ?? [];
  const dil = useDil();
  const t = useT();
  // sığmazsa kademe kademe yer açılır (bölüm adları simgeye döner, ikincil ölçümler gizlenir …)
  const ref = useRef<HTMLElement>(null);
  useSikisma(ref);
  return (
    <header className="appbar" ref={ref}>
      <div className="brand" title={typeof context === "string" ? context : undefined}>
        <Logo />
        <div className="brand-text">
          <h1>
            Silikon<em>3D</em>
          </h1>
          {context && <span className="brand-sub">{context}</span>}
        </div>
      </div>
      <ModeSwitch mode={mode} />
      <div className="appbar-end">
        {meters && <div className="meter" role="group" aria-label={t("Canlı ölçümler", "Live readings")}>{meters}</div>}
        <div className="appbar-tools">
          <DilDugmesi />
          <TemaDugmesi />
          <GorunumMenusu />
          <Menu label={<><Simge ad="klavye" boyut={18} /> <span className="menu-label">{t("Kısayollar", "Shortcuts")}</span></>} title={t("Klavye ve fare kısayolları", "Keyboard and mouse shortcuts")} className="icon-btn kisayol-btn" align="end">
            <p className="menu-baslik">{t("Kısayollar", "Shortcuts")}</p>
            <dl className="keys">
              {[...ozel, ...ORTAK_KISAYOLLAR].map((s, i) => (
                <div key={i} className={i === ozel.length && ozel.length > 0 ? "ayrac" : undefined}>
                  <dt><kbd>{metin(s.keys, dil)}</kbd></dt>
                  <dd>{metin(s.what, dil)}</dd>
                </div>
              ))}
            </dl>
          </Menu>
          <button className="icon-btn" onClick={baslangiciAc} aria-label={t("Başlangıç ve yardım", "Getting started and help")} data-tip={t("Başlangıç: bölümler ve ipuçları (?)", "Getting started: sections and tips (?)")} data-tip-hiza="son">
            <Simge ad="yardim" boyut={20} />
          </button>
        </div>
      </div>
    </header>
  );
}

/** Türkçe ↔ İngilizce (L). Düğmede geçilecek dilin kısaltması yazar. */
function DilDugmesi() {
  const dil = useAyar((s) => s.dil);
  const t = useT();
  return (
    <button
      className="icon-btn dil-btn"
      onClick={() => useAyar.getState().dilSec(dil === "tr" ? "en" : "tr")}
      aria-label={t("Switch to English", "Türkçeye geç")}
      lang={dil === "tr" ? "en" : "tr"}
      data-tip={t("English (L)", "Türkçe (L)")}
      data-tip-hiza="son"
    >
      {dil === "tr" ? "EN" : "TR"}
    </button>
  );
}

/** Koyu ↔ açık tema (T). Ayar menüsünde "Sistem" de seçilebilir. */
function TemaDugmesi() {
  const tema = useAyar((s) => s.tema);
  const t = useT();
  const sonraki = tema === "koyu" ? t("açık", "light") : t("koyu", "dark");
  return (
    <button
      className="icon-btn tema-btn"
      onClick={() => useAyar.getState().temaDegistir()}
      aria-label={t(`Temayı değiştir: ${sonraki}`, `Switch theme: ${sonraki}`)}
      data-tip={t(`Tema: ${sonraki} (T)`, `Theme: ${sonraki} (T)`)}
      data-tip-hiza="son"
    >
      <Simge ad={tema === "koyu" ? "gunes" : "ay"} boyut={20} />
    </button>
  );
}

const TEMALAR: { t: TemaSecimi; ad: IkiDil }[] = [
  { t: "sistem", ad: { tr: "Sistem", en: "System" } },
  { t: "koyu", ad: { tr: "Koyu", en: "Dark" } },
  { t: "acik", ad: { tr: "Açık", en: "Light" } },
];

/** Görünüm ayarları: tema, yazı boyutu, dil, odak modu */
function GorunumMenusu() {
  const secim = useAyar((s) => s.secim);
  const boyut = useAyar((s) => s.boyut);
  const odak = useAyar((s) => s.odak);
  const dil = useAyar((s) => s.dil);
  const t = useT();
  const a = useAyar.getState();
  return (
    <Menu label={<Simge ad="ayarlar" boyut={20} />} title={t("Görünüm: tema, yazı boyutu, dil, odak modu", "View: theme, text size, language, focus mode")} className="icon-btn tasma" align="end">
      <p className="menu-baslik">{t("Görünüm", "View")}</p>
      <div className="ayar-satiri">
        <span>{t("Tema", "Theme")}</span>
        <span className="seg" role="group" aria-label={t("Tema", "Theme")}>
          {TEMALAR.map((x) => (
            <button key={x.t} className={secim === x.t ? "on" : ""} aria-pressed={secim === x.t} onClick={() => a.temaSec(x.t)}>{sec(x.ad, dil)}</button>
          ))}
        </span>
      </div>
      <div className="ayar-satiri">
        <span>{t("Yazı boyutu", "Text size")}</span>
        <span className="seg" role="group" aria-label={t("Yazı boyutu", "Text size")}>
          <button className={boyut === "normal" ? "on" : ""} aria-pressed={boyut === "normal"} onClick={() => a.boyutSec("normal")}>Normal</button>
          <button className={boyut === "buyuk" ? "on" : ""} aria-pressed={boyut === "buyuk"} onClick={() => a.boyutSec("buyuk")}>{t("Büyük", "Large")}</button>
        </span>
      </div>
      <div className="ayar-satiri">
        <span>{t("Dil", "Language")}</span>
        <span className="seg" role="group" aria-label={t("Dil", "Language")}>
          <button className={dil === "tr" ? "on" : ""} aria-pressed={dil === "tr"} lang="tr" onClick={() => a.dilSec("tr")}>Türkçe</button>
          <button className={dil === "en" ? "on" : ""} aria-pressed={dil === "en"} lang="en" onClick={() => a.dilSec("en")}>English</button>
        </span>
      </div>
      <label className="ayar-satiri chk">
        <span>{t("Odak modu: paneller gizli", "Focus mode: panels hidden")}</span>
        <input type="checkbox" checked={odak} onChange={(e) => a.odakSec(e.target.checked)} />
      </label>
      <p className="menu-not">
        <span>{t("Kısayollar:", "Shortcuts:")}</span>
        <span><kbd>T</kbd> {t("tema", "theme")}</span>
        <span><kbd>Y</kbd> {t("yazı boyutu", "text size")}</span>
        <span><kbd>F</kbd> {t("odak modu", "focus mode")}</span>
        <span><kbd>L</kbd> {t("dil", "language")}</span>
      </p>
    </Menu>
  );
}

/**
 * Ölçüm: etiket + tablo rakamlı değer. mono: değer onaltılık (PC gibi); ikincil: dar ekranda gizlenir.
 * Etiket dar ekranda görünmez olur (ekran okuyucuda kalır): ipucu verilmemişse etiket ipucu olur.
 */
export function Meter({ label, children, title, mono = false, ikincil = false }: { label: string; children: ReactNode; title?: string; mono?: boolean; ikincil?: boolean }) {
  return (
    <span className={`m${mono ? " mono" : ""}${ikincil ? " ikincil" : ""}`} title={title ?? label}>
      <span className="m-label">{label}</span>
      <b>{children}</b>
    </span>
  );
}

/** Bayrak rozeti (N Z C V I): 1 olan lojik 1 renginde; değeri yalnız renkle değil, ekran okuyucuda da */
export function Bayrak({ ad, on }: { ad: string; on: boolean }) {
  const A = ad.toUpperCase();
  return (
    <span className={`pin${on ? " on" : ""}`} title={`${A} = ${on ? 1 : 0}`}>
      {A}
      <span className="sr-only"> = {on ? 1 : 0}</span>
    </span>
  );
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
      <rect x="0.5" y="0.5" width="27" height="27" rx="7" className="logo-zemin" />
      <rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.25" y="11.25" width="5.5" height="5.5" rx="1" className="logo-cekirdek" />
      {[11, 14, 17].map((p) => (
        <g key={p} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.75">
          <line x1={p} y1="4.8" x2={p} y2="6.6" />
          <line x1={p} y1="21.4" x2={p} y2="23.2" />
          <line x1="4.8" y1={p} x2="6.6" y2={p} />
          <line x1="21.4" y1={p} x2="23.2" y2={p} />
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------- araç çubuğu

/** Araç çubuğunda bir denetim öbeği; öbekler arasına ince ayraç girer. */
export function Group({ children, label, className = "" }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <div className={`tb-group ${className}`} role={label ? "group" : undefined} aria-label={label}>
      {children}
    </div>
  );
}

/** Yan ya da alt paneli açıp kapatır. Odak modundayken basılırsa odak modu kapanır ve panel görünür. */
export function PanelToggle({ which, open, onToggle, ad }: { which: "side" | "bottom"; open: boolean; onToggle: () => void; ad?: string }) {
  const odak = useAyar((s) => s.odak);
  const t = useT();
  const name = ad ?? (which === "side" ? t("Yan panel", "Side panel") : t("Alt panel", "Bottom panel"));
  const gorunur = open && !odak;
  const tikla = () => {
    if (odak) {
      useAyar.getState().odakSec(false);
      if (!open) onToggle();
    } else onToggle();
  };
  return (
    <button className="icon-btn" aria-pressed={gorunur} onClick={tikla} data-tip={`${name}: ${gorunur ? t("gizle", "hide") : t("göster", "show")}`} data-tip-hiza="son" aria-label={name}>
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
        {which === "side" ? (
          <rect x="12" y="3.5" width="5.5" height="13" rx="0" fill={gorunur ? "currentColor" : "none"} opacity={gorunur ? 0.55 : 1} />
        ) : (
          <rect x="2.5" y="11" width="15" height="5.5" rx="0" fill={gorunur ? "currentColor" : "none"} opacity={gorunur ? 0.55 : 1} />
        )}
      </svg>
    </button>
  );
}

/** Odak modu (F): yan ve alt paneller gizlenir, sahne bütün alanı alır */
export function OdakDugmesi() {
  const odak = useAyar((s) => s.odak);
  const t = useT();
  return (
    <button
      className="icon-btn"
      aria-pressed={odak}
      onClick={() => useAyar.getState().odakSec(!odak)}
      aria-label={t("Odak modu", "Focus mode")}
      data-tip={odak ? t("Odak modundan çık: paneller görünür (F)", "Leave focus mode: panels visible (F)") : t("Odak modu: paneller gizli, sahne tam (F)", "Focus mode: panels hidden, full scene (F)")}
      data-tip-hiza="son"
    >
      <Simge ad={odak ? "daralt" : "genislet"} boyut={20} />
    </button>
  );
}

/** Araç çubuğunda seyrek kullanılan denetimler: "⋯" düğmesiyle açılan kutu */
export function TasmaMenusu({ children, title, align = "start" }: { children: ReactNode; title?: string; align?: "start" | "end" }) {
  const t = useT();
  return (
    <Menu label={<Simge ad="daha" boyut={20} />} title={title ?? t("Diğer denetimler", "More controls")} className="icon-btn tasma" align={align}>
      <div className="menu-col">{children}</div>
    </Menu>
  );
}

// ---------------------------------------------------------------- sekmeler

export interface TabDef<T extends string> {
  id: T;
  /** modül düzeyindeki tablolarda { tr, en } */
  label: ReactNode | IkiDil;
  title?: string | IkiDil;
  disabled?: boolean;
}

/**
 * Sekme çubuğu. Sekmeler bir diziden gelir; yeni bir panel (ör. "Kurulum") eklemek için diziye bir
 * öğe eklemek yeter. Ok tuşlarıyla sekmeler arasında gezilir.
 */
export function Tabs<T extends string>({ tabs, value, onChange, label, actions, className = "" }: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  actions?: ReactNode;
  className?: string;
}) {
  const base = useId();
  const dil = useDil();
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    const usable = tabs.filter((t) => !t.disabled);
    const i = usable.findIndex((t) => t.id === value);
    const next =
      e.key === "Home" ? usable[0] : e.key === "End" ? usable[usable.length - 1] : usable[(i + (e.key === "ArrowRight" ? 1 : usable.length - 1)) % usable.length];
    if (!next) return;
    e.preventDefault();
    onChange(next.id);
    const el = e.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`);
    el?.focus();
  };
  return (
    <div className={`tabbar ${className}`}>
      <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`${base}-${t.id}`}
            data-tab={t.id}
            aria-selected={value === t.id}
            tabIndex={value === t.id ? 0 : -1}
            className={value === t.id ? "on" : ""}
            disabled={t.disabled}
            title={t.title === undefined ? undefined : metin(t.title, dil)}
            onClick={() => onChange(t.id)}
          >
            {metin(t.label, dil)}
          </button>
        ))}
      </div>
      {actions && <div className="tabbar-actions">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- bölücü

/**
 * Sürüklenebilir bölücü. Yatay (varsayılan): alt panelin üst kenarı; yukarı sürükle büyüt, aşağı
 * sürükle küçült. Dikey: yan panelin sol kenarı (bölücü yan panelden hemen önce gelir); sola sürükle
 * genişlet. Klavyede ok tuşları.
 */
export function Splitter({ value, onChange, min = 140, reserve = 200, label, yon = "yatay" }: {
  value: number;
  onChange: (px: number) => void;
  min?: number;
  /** panelin yanında / üstünde (sahneye) en az bu kadar yer kalır */
  reserve?: number;
  label?: string;
  yon?: "yatay" | "dikey";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ p: number; v: number } | null>(null);
  const t = useT();
  const dikey = yon === "dikey";
  const sinif = dikey ? "resizing-x" : "resizing";
  /** dikey bölücüde değer kayıtlı değilse yan panelin o anki genişliği */
  const simdiki = () => (dikey ? (ref.current?.nextElementSibling as HTMLElement | null)?.getBoundingClientRect().width ?? value : value);
  const clamp = (v: number) => {
    const parent = ref.current?.parentElement;
    const boy = parent ? (dikey ? parent.clientWidth : parent.clientHeight) : 900;
    const max = Math.max(min, boy - reserve);
    return Math.round(Math.min(max, Math.max(min, v)));
  };
  return (
    <div
      ref={ref}
      className={`splitter${dikey ? " dikey" : ""}`}
      role="separator"
      aria-orientation={dikey ? "vertical" : "horizontal"}
      aria-label={label ?? t("Alt panelin yüksekliği", "Bottom panel height")}
      aria-valuenow={value || undefined}
      aria-valuemin={min}
      tabIndex={0}
      title={dikey ? t("Sürükle: paneli genişlet / daralt", "Drag to widen / narrow the panel") : t("Sürükle: paneli büyüt / küçült", "Drag to resize the panel")}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { p: dikey ? e.clientX : e.clientY, v: simdiki() };
        document.body.classList.add(sinif);
      }}
      onPointerMove={(e) => {
        if (drag.current) onChange(clamp(drag.current.v + (drag.current.p - (dikey ? e.clientX : e.clientY))));
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        drag.current = null;
        document.body.classList.remove(sinif);
      }}
      onPointerCancel={() => {
        drag.current = null;
        document.body.classList.remove(sinif);
      }}
      onKeyDown={(e) => {
        const art = dikey ? "ArrowLeft" : "ArrowUp";
        const azal = dikey ? "ArrowRight" : "ArrowDown";
        if (e.key === art) onChange(clamp(simdiki() + 24));
        else if (e.key === azal) onChange(clamp(simdiki() - 24));
        else return;
        e.preventDefault();
      }}
    />
  );
}

/** Yan panelin sol kenarındaki bölücü: genişlik tercihlere yazılır */
export function YanBolucu({ lay, setLay }: { lay: LayoutPrefs; setLay: (p: Partial<LayoutPrefs>) => void }) {
  const t = useT();
  return <Splitter yon="dikey" value={lay.sideW ?? 0} onChange={(w) => setLay({ sideW: w })} min={320} reserve={420} label={t("Yan panelin genişliği", "Side panel width")} />;
}

// ---------------------------------------------------------------- açılır menü

/** Bir düğmeyle açılan küçük kutu: dışına tıklayınca, Esc ile ya da klavye odağı kutudan çıkınca (Tab) kapanır. */
export function Menu({ label, title, children, align = "start", placement = "down", keepMounted = false, className = "" }: {
  label: ReactNode;
  title?: string;
  children: ReactNode;
  align?: "start" | "end";
  /** kutu düğmenin altında mı üstünde mi açılır */
  placement?: "down" | "up";
  /** kapalıyken de içerik sayfada (gizli) dursun: içindeki düğmelerin durumu dışarıdan okunabilsin */
  keepMounted?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open]);
  return (
    <div
      className="menu"
      ref={ref}
      onBlur={(e) => {
        // odak sayfanın başka bir yerine geçti (pencere değişince relatedTarget boş: açık kalır)
        if (open && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button className={`menu-btn ${className}`} aria-expanded={open} aria-controls={id} title={title} onClick={() => setOpen(!open)}>
        {label}
        <svg className="chev" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {(open || keepMounted) && (
        <div id={id} className={`menu-pop ${align} ${placement}`} hidden={!open}>
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- panel bölümü

/** Panel içinde başlıklı bölüm: başlık solda, küçük eylemler sağda. */
export function Section({ title, actions, children, className = "", id }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`psec ${className}`} id={id}>
      <div className="psec-head">
        <h2>{title}</h2>
        {actions && <div className="psec-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
