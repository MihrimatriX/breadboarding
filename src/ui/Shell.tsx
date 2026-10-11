// Uygulama iskeleti: üç bölümün (6502 die, CPU16 tezgâhı, CPU16 kartı 3D) ortak parçaları.
//   AppHeader: üst çubuk (marka, bölüm geçişi, canlı ölçümler, kısayollar)
//   Tabs: sekmeli paneller (yan ve alt paneller; yeni bir sekme diziye bir satır eklemekle gelir)
//   Splitter: alt panelin yüksekliğini sürükleyerek ayarlama
//   PanelToggle: yan / alt paneli açıp kapatan düğmeler
//   Menu: seyrek kullanılan denetimler için açılır kutu
//   useLayout: panel düzeni tercihleri (tarayıcıda saklanır)

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ModeSwitch, type Mode } from "./ModeSwitch";

// ---------------------------------------------------------------- düzen tercihleri

export interface LayoutPrefs {
  side: boolean;
  bottom: boolean;
  /** alt panelin (ya da tezgâhta düzenleyicinin) yüksekliği, piksel */
  bottomH: number;
  /** yan panelin seçili sekmesi */
  sideTab?: string;
}

function loadPrefs(key: string, defaults: LayoutPrefs): LayoutPrefs {
  try {
    const raw = localStorage.getItem(`silikon3d.duzen.${key}`);
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
          localStorage.setItem(`silikon3d.duzen.${key}`, JSON.stringify(next));
        } catch {
          // depolama kapalı: tercih yalnız bu oturumda geçerli
        }
        return next;
      }),
    [key],
  );
  return [prefs, update] as const;
}

// ---------------------------------------------------------------- üst çubuk

export interface Shortcut {
  keys: string;
  what: string;
}

/** Üst çubuk: marka ve bölümün kısa açıklaması, bölüm geçişi, canlı ölçümler ve kısayol listesi. */
export function AppHeader({ mode, context, meters, shortcuts }: { mode: Mode; context?: ReactNode; meters?: ReactNode; shortcuts?: Shortcut[] }) {
  return (
    <header className="appbar">
      <div className="brand">
        <Logo />
        <div className="brand-text">
          <h1>Silikon3D</h1>
          {context && <span className="brand-sub">{context}</span>}
        </div>
      </div>
      <ModeSwitch mode={mode} />
      <div className="appbar-end">
        {meters && <div className="meter">{meters}</div>}
        {shortcuts && shortcuts.length > 0 && (
          <Menu label={<><KeyIcon /> <span className="menu-label">Kısayollar</span></>} title="Klavye ve fare kısayolları" className="icon-btn" align="end">
            <dl className="keys">
              {shortcuts.map((s) => (
                <div key={s.keys}>
                  <dt><kbd>{s.keys}</kbd></dt>
                  <dd>{s.what}</dd>
                </div>
              ))}
            </dl>
          </Menu>
        )}
      </div>
    </header>
  );
}

/** Ölçüm: etiket + tablo rakamlı değer */
export function Meter({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <span className="m" title={title}>
      <span className="m-label">{label}</span>
      <b>{children}</b>
    </span>
  );
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y="9" width="6" height="6" rx="1" fill="var(--accent)" />
      {[8, 12, 16].map((p) => (
        <g key={p} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <line x1={p} y1="1.8" x2={p} y2="4" />
          <line x1={p} y1="20" x2={p} y2="22.2" />
          <line x1="1.8" y1={p} x2="4" y2={p} />
          <line x1="20" y1={p} x2="22.2" y2={p} />
        </g>
      ))}
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="5" width="16" height="10" rx="2" />
      <path d="M5.5 8.5h1M9.5 8.5h1M13.5 8.5h1M6 11.5h8" strokeLinecap="round" />
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

/** Yan ya da alt paneli açıp kapatır. */
export function PanelToggle({ which, open, onToggle }: { which: "side" | "bottom"; open: boolean; onToggle: () => void }) {
  const name = which === "side" ? "Yan panel" : "Alt panel";
  return (
    <button className="icon-btn" aria-pressed={open} onClick={onToggle} title={`${name}: ${open ? "gizle" : "göster"}`} aria-label={name}>
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
        {which === "side" ? (
          <rect x="12" y="3.5" width="5.5" height="13" rx="0" fill={open ? "currentColor" : "none"} opacity={open ? 0.55 : 1} />
        ) : (
          <rect x="2.5" y="11" width="15" height="5.5" rx="0" fill={open ? "currentColor" : "none"} opacity={open ? 0.55 : 1} />
        )}
      </svg>
    </button>
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

/** Alt panelin üst kenarı: yukarı sürükle büyüt, aşağı sürükle küçült (klavyede ok tuşları). */
export function Splitter({ value, onChange, min = 140, reserve = 200, label = "Alt panelin yüksekliği" }: {
  value: number;
  onChange: (px: number) => void;
  min?: number;
  /** panelin üstünde (sahneye) en az bu kadar yer kalır */
  reserve?: number;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const clamp = (h: number) => {
    const parent = ref.current?.parentElement;
    const max = parent ? Math.max(min, parent.clientHeight - reserve) : 900;
    return Math.round(Math.min(max, Math.max(min, h)));
  };
  return (
    <div
      ref={ref}
      className="splitter"
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      tabIndex={0}
      title="Sürükle: paneli büyüt / küçült"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, h: value };
        document.body.classList.add("resizing");
      }}
      onPointerMove={(e) => {
        if (drag.current) onChange(clamp(drag.current.h + (drag.current.y - e.clientY)));
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        drag.current = null;
        document.body.classList.remove("resizing");
      }}
      onPointerCancel={() => {
        drag.current = null;
        document.body.classList.remove("resizing");
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") onChange(clamp(value + 24));
        else if (e.key === "ArrowDown") onChange(clamp(value - 24));
        else return;
        e.preventDefault();
      }}
    />
  );
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
