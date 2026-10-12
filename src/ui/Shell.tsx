// Uygulama iskeleti: beş bölümün (6502 die, CPU16 tezgâhı, CPU16 kartı 3D, 8 bit hesap 3D, mimari) ortak parçaları.
//   AppHeader: üst çubuk (marka, bölüm geçişi, canlı ölçümler, tema, görünüm ayarları, kısayollar,
//              Başlangıç paneli)
//   Tabs: sekmeli paneller (yan ve alt paneller; yeni bir sekme diziye bir satır eklemekle gelir)
//   Splitter: alt panelin yüksekliğini ya da yan panelin genişliğini sürükleyerek ayarlama
//   PanelToggle, OdakDugmesi: yan / alt paneli açıp kapatan düğmeler, odak modu (paneller gizli)
//   Menu, TasmaMenusu: seyrek kullanılan denetimler için açılır kutu ("⋯")
//   useLayout: panel düzeni tercihleri (tarayıcıda saklanır)

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { ModeSwitch, type Mode } from "./ModeSwitch";
import { baslangiciAc } from "./Baslangic";
import { Simge } from "./simgeler";
import { useAyar, type TemaSecimi } from "./ayarlar";

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

export interface Shortcut {
  keys: string;
  what: string;
}

/** Her bölümün kısayol listesinin sonunda */
const ORTAK_KISAYOLLAR: Shortcut[] = [
  { keys: "F", what: "Odak modu: yan ve alt panelleri gizle / göster" },
  { keys: "T", what: "Tema: koyu / açık" },
  { keys: "Y", what: "Yazı boyutu: normal / büyük" },
  { keys: "?", what: "Başlangıç: bölümler ve ipuçları" },
];

/** Üst çubuk: marka ve bölümün kısa açıklaması, bölüm geçişi, canlı ölçümler, tema, görünüm ayarları, kısayol listesi ve Başlangıç. */
export function AppHeader({ mode, context, meters, shortcuts }: { mode: Mode; context?: ReactNode; meters?: ReactNode; shortcuts?: Shortcut[] }) {
  const ozel = shortcuts ?? [];
  return (
    <header className="appbar">
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
        {meters && <div className="meter" role="group" aria-label="Canlı ölçümler">{meters}</div>}
        <div className="appbar-tools">
          <TemaDugmesi />
          <GorunumMenusu />
          <Menu label={<><Simge ad="klavye" boyut={18} /> <span className="menu-label">Kısayollar</span></>} title="Klavye ve fare kısayolları" className="icon-btn" align="end">
            <p className="menu-baslik">Kısayollar</p>
            <dl className="keys">
              {[...ozel, ...ORTAK_KISAYOLLAR].map((s, i) => (
                <div key={s.keys} className={i === ozel.length && ozel.length > 0 ? "ayrac" : undefined}>
                  <dt><kbd>{s.keys}</kbd></dt>
                  <dd>{s.what}</dd>
                </div>
              ))}
            </dl>
          </Menu>
          <button className="icon-btn" onClick={baslangiciAc} aria-label="Başlangıç ve yardım" data-tip="Başlangıç: bölümler ve ipuçları (?)" data-tip-hiza="son">
            <Simge ad="yardim" boyut={20} />
          </button>
        </div>
      </div>
    </header>
  );
}

/** Koyu ↔ açık tema (T). Ayar menüsünde "Sistem" de seçilebilir. */
function TemaDugmesi() {
  const tema = useAyar((s) => s.tema);
  const sonraki = tema === "koyu" ? "açık" : "koyu";
  return (
    <button
      className="icon-btn"
      onClick={() => useAyar.getState().temaDegistir()}
      aria-label={`Temayı değiştir: ${sonraki}`}
      data-tip={`Tema: ${sonraki} (T)`}
      data-tip-hiza="son"
    >
      <Simge ad={tema === "koyu" ? "gunes" : "ay"} boyut={20} />
    </button>
  );
}

const TEMALAR: { t: TemaSecimi; ad: string }[] = [
  { t: "sistem", ad: "Sistem" },
  { t: "koyu", ad: "Koyu" },
  { t: "acik", ad: "Açık" },
];

/** Görünüm ayarları: tema, yazı boyutu, odak modu */
function GorunumMenusu() {
  const secim = useAyar((s) => s.secim);
  const boyut = useAyar((s) => s.boyut);
  const odak = useAyar((s) => s.odak);
  const a = useAyar.getState();
  return (
    <Menu label={<Simge ad="ayarlar" boyut={20} />} title="Görünüm: tema, yazı boyutu, odak modu" className="icon-btn tasma" align="end">
      <p className="menu-baslik">Görünüm</p>
      <div className="ayar-satiri">
        <span>Tema</span>
        <span className="seg" role="group" aria-label="Tema">
          {TEMALAR.map((x) => (
            <button key={x.t} className={secim === x.t ? "on" : ""} aria-pressed={secim === x.t} onClick={() => a.temaSec(x.t)}>{x.ad}</button>
          ))}
        </span>
      </div>
      <div className="ayar-satiri">
        <span>Yazı boyutu</span>
        <span className="seg" role="group" aria-label="Yazı boyutu">
          <button className={boyut === "normal" ? "on" : ""} aria-pressed={boyut === "normal"} onClick={() => a.boyutSec("normal")}>Normal</button>
          <button className={boyut === "buyuk" ? "on" : ""} aria-pressed={boyut === "buyuk"} onClick={() => a.boyutSec("buyuk")}>Büyük</button>
        </span>
      </div>
      <label className="ayar-satiri chk">
        <span>Odak modu: paneller gizli</span>
        <input type="checkbox" checked={odak} onChange={(e) => a.odakSec(e.target.checked)} />
      </label>
      <p className="menu-not">
        <span>Kısayollar:</span>
        <span><kbd>T</kbd> tema</span>
        <span><kbd>Y</kbd> yazı boyutu</span>
        <span><kbd>F</kbd> odak modu</span>
      </p>
    </Menu>
  );
}

/**
 * Ölçüm: etiket + tablo rakamlı değer. mono: değer onaltılık (PC gibi); ikincil: dar ekranda gizlenir.
 */
export function Meter({ label, children, title, mono = false, ikincil = false }: { label: string; children: ReactNode; title?: string; mono?: boolean; ikincil?: boolean }) {
  return (
    <span className={`m${mono ? " mono" : ""}${ikincil ? " ikincil" : ""}`} title={title}>
      <span className="m-label">{label}</span>
      <b>{children}</b>
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
  const name = ad ?? (which === "side" ? "Yan panel" : "Alt panel");
  const gorunur = open && !odak;
  const tikla = () => {
    if (odak) {
      useAyar.getState().odakSec(false);
      if (!open) onToggle();
    } else onToggle();
  };
  return (
    <button className="icon-btn" aria-pressed={gorunur} onClick={tikla} data-tip={`${name}: ${gorunur ? "gizle" : "göster"}`} data-tip-hiza="son" aria-label={name}>
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
  return (
    <button
      className="icon-btn"
      aria-pressed={odak}
      onClick={() => useAyar.getState().odakSec(!odak)}
      aria-label="Odak modu"
      data-tip={odak ? "Odak modundan çık: paneller görünür (F)" : "Odak modu: paneller gizli, sahne tam (F)"}
      data-tip-hiza="son"
    >
      <Simge ad={odak ? "daralt" : "genislet"} boyut={20} />
    </button>
  );
}

/** Araç çubuğunda seyrek kullanılan denetimler: "⋯" düğmesiyle açılan kutu */
export function TasmaMenusu({ children, title = "Diğer denetimler", align = "start" }: { children: ReactNode; title?: string; align?: "start" | "end" }) {
  return (
    <Menu label={<Simge ad="daha" boyut={20} />} title={title} className="icon-btn tasma" align={align}>
      <div className="menu-col">{children}</div>
    </Menu>
  );
}

// ---------------------------------------------------------------- sekmeler

export interface TabDef<T extends string> {
  id: T;
  label: ReactNode;
  title?: string;
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
            title={t.title}
            onClick={() => onChange(t.id)}
          >
            {t.label}
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
export function Splitter({ value, onChange, min = 140, reserve = 200, label = "Alt panelin yüksekliği", yon = "yatay" }: {
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
      aria-label={label}
      aria-valuenow={value || undefined}
      aria-valuemin={min}
      tabIndex={0}
      title={dikey ? "Sürükle: paneli genişlet / daralt" : "Sürükle: paneli büyüt / küçült"}
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
  return <Splitter yon="dikey" value={lay.sideW ?? 0} onChange={(w) => setLay({ sideW: w })} min={320} reserve={420} label="Yan panelin genişliği" />;
}

// ---------------------------------------------------------------- açılır menü

/** Bir düğmeyle açılan küçük kutu: dışına tıklayınca ya da Esc ile kapanır. */
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
    <div className="menu" ref={ref}>
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
