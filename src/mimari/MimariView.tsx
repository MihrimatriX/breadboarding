// "Mimari" bölümü: bilgisayarın ve hesap makinesinin blok diyagramları (cpu16/mimari). Üç diyagram:
// CPU16 işlemci kartı, bütün bilgisayar (kartlar, arka panel, dış cihazlar) ve 8 bit hesap makinesi.
// Kutuların içeriği ve yolların netleri devreden gelir; testler her bağlantının netlistte karşılığı
// olduğunu denetler (cpu16/tests/mimari.test.ts).
//
// Düzen öbür bölümlerle aynı: üst çubuk, araç çubuğu (diyagram seçimi, yakınlaştırma, paneller),
// sahne ve yan panel (seçilenin ayrıntıları). Adres: #mimari ya da #mimari/<cpu|makine|hesap>.

import "./mimari.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KUTU_ROLU_ADI, YOL_TURU_ADI } from "../../cpu16/mimari/cizim.ts";
import { DIYAGRAMLAR, diyagramKaydi, diyagramKur, type DiyagramKimligi } from "../../cpu16/mimari/index.ts";
import { iliskiKur, vurgula } from "../../cpu16/mimari/iliski.ts";
import { kutuGorevi, netOzeti, yolEtiketMetni } from "../../cpu16/mimari/model.ts";
import { kisayolAlani } from "../ui/ayarlar";
import { AppHeader, Group, OdakDugmesi, PanelToggle, YanBolucu, duzenStili, useLayout, usePaneller, type Shortcut } from "../ui/Shell";
import { bolumuGoster } from "./bolumuGoster";
import { MimariPanel } from "./MimariPanel";
import { MimariSahne, ayniHedef, useGorunum, type Hedef } from "./MimariSahne";

const KISAYOLLAR: Shortcut[] = [
  { keys: "1 · 2 · 3", what: "Diyagram: CPU kartı, bütün bilgisayar, hesap makinesi" },
  { keys: "Tekerlek", what: "İmlecin olduğu yere yakınlaştır / uzaklaştır" },
  { keys: "Sürükle", what: "Diyagramı kaydır (dokunmatikte iki parmakla yakınlaştır)" },
  { keys: "+ / −", what: "Yakınlaştır / uzaklaştır" },
  { keys: "0", what: "Sahneye sığdır" },
  { keys: "Tab", what: "Kutular arasında gez, Enter: ayrıntılar" },
  { keys: "Esc", what: "Seçimi kaldır" },
];

const KAYIT = "silikon3d.mimari.diyagram";

function hashDiyagrami(): DiyagramKimligi | null {
  const m = /^#mimari\/(\w+)/.exec(location.hash);
  return m ? diyagramKaydi(m[1])?.id ?? null : null;
}

function ilkDiyagram(): DiyagramKimligi {
  const h = hashDiyagrami();
  if (h) return h;
  try {
    const k = localStorage.getItem(KAYIT);
    if (k && diyagramKaydi(k)) return k as DiyagramKimligi;
  } catch {
    // depolama kapalı: ilk diyagram
  }
  return "cpu";
}

/** Bölümden çıkıp dönünce (ör. 3D'den geri) seçim kaldığı yerde */
let sonSecim: { id: DiyagramKimligi; secim: Hedef | null } | null = null;

const Simge = ({ d }: { d: string }) => (
  <svg className="simge" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

export function MimariView() {
  const [id, setId] = useState<DiyagramKimligi>(ilkDiyagram);
  const [secim, setSecim] = useState<Hedef | null>(() => (sonSecim?.id === id ? sonSecim.secim : null));
  const [hover, setHover] = useState<Hedef | null>(null);
  const [lay, setLay] = useLayout("mimari", { side: true, bottom: false, bottomH: 0 });
  const panel = usePaneller(lay);

  const k = useMemo(() => diyagramKur(id), [id]);
  const il = useMemo(() => iliskiKur(k.diyagram, k.devre), [k]);
  const adlar = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of k.diyagram.kutular) m.set(x.id, kutuGorevi(x) ? `${x.ad}: ${kutuGorevi(x)}` : x.ad);
    for (const g of k.diyagram.gruplar) m.set(g.id, g.ad);
    return m;
  }, [k]);
  const gorunum = useGorunum(k.sahne.w, k.sahne.h, id);

  useEffect(() => {
    sonSecim = { id, secim };
  }, [id, secim]);

  const diyagramSec = useCallback((yeni: DiyagramKimligi) => {
    setId(yeni);
    setSecim(null);
    setHover(null);
    history.replaceState(null, "", `#mimari/${yeni}`);
    try {
      localStorage.setItem(KAYIT, yeni);
    } catch {
      // depolama kapalı: seçim yalnız bu oturumda
    }
  }, []);

  const sec = useCallback(
    (h: Hedef | null) => {
      setSecim((o) => (ayniHedef(o, h) ? o : h));
      // seçilenin ayrıntıları yan panelde: kapalıysa açılır
      if (h && !lay.side) setLay({ side: true });
    },
    [lay.side, setLay],
  );
  const uzerinde = useCallback((h: Hedef | null) => setHover((o) => (ayniHedef(o, h) ? o : h)), []);
  const ayrintiAc = useCallback((x: string) => {
    if (diyagramKaydi(x)) diyagramSec(x as DiyagramKimligi);
  }, [diyagramSec]);
  const goster3d = useCallback((block: string, card: string) => void bolumuGoster(k.kayit.kart, block, card), [k]);

  // adres değişince (ör. elle #mimari/hesap) diyagram
  useEffect(() => {
    const onHash = () => {
      const h = hashDiyagrami();
      if (h && h !== id) diyagramSec(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [id, diyagramSec]);

  // kısayollar: 1-3 diyagram, + / − / 0 yakınlaştırma, Esc seçimi kaldırır
  const { yakinlas, sigdir } = gorunum;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!kisayolAlani(e)) return;
      const d = DIYAGRAMLAR[Number(e.key) - 1];
      if (d && /^[1-9]$/.test(e.key)) diyagramSec(d.id);
      else if (e.key === "+" || e.key === "=") yakinlas(1.25);
      else if (e.key === "-" || e.key === "−") yakinlas(0.8);
      else if (e.key === "0") sigdir();
      else if (e.key === "Escape" && secim) setSecim(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [diyagramSec, yakinlas, sigdir, secim]);

  const hedef = hover ?? secim;
  const vurgu = useMemo(() => (hedef ? vurgula(il, hedef) : null), [il, hedef]);
  const bilgi = useMemo(() => bilgiSatiri(k, hedef), [k, hedef]);
  const yuzde = gorunum.g ? Math.round(gorunum.g.s * 100) : null;

  return (
    <div className="app mimari shell" data-side={panel.side ? "open" : "closed"} data-bottom="closed" style={duzenStili(lay)}>
      <AppHeader mode="mimari" context="Mimari · blok diyagramları" shortcuts={KISAYOLLAR} />
      <div className="toolbar">
        <Group label="Diyagram">
          <span className="tb-label kisalir">Diyagram</span>
          <span className="seg mm-secici" role="group" aria-label="Diyagram">
            {DIYAGRAMLAR.map((d, i) => (
              <button key={d.id} className={id === d.id ? "on" : ""} aria-pressed={id === d.id} onClick={() => diyagramSec(d.id)} title={`${d.ad} (${i + 1})`}>
                {d.kisa}
              </button>
            ))}
          </span>
        </Group>
        <Group label="Yakınlaştırma" className="mm-zoom">
          <button className="icon-btn" onClick={() => yakinlas(0.8)} aria-label="Uzaklaştır" data-tip="Uzaklaştır (−)">
            <Simge d="M5 10h10" />
          </button>
          <span className="mm-yuzde" aria-live="off" title="Yakınlaştırma: diyagramın gerçek boyuna göre">{yuzde === null ? "" : `%${yuzde}`}</span>
          <button className="icon-btn" onClick={() => yakinlas(1.25)} aria-label="Yakınlaştır" data-tip="Yakınlaştır (+)">
            <Simge d="M5 10h10M10 5v10" />
          </button>
          <button className="mm-sigdir" onClick={sigdir} data-tip="Bütün diyagram sahneye sığsın (0)">
            <Simge d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4" />
            <span className="kisalir">Sığdır</span>
          </button>
        </Group>
        <Group label="Paneller" className="tb-end">
          <PanelToggle which="side" open={lay.side} onToggle={() => setLay({ side: !lay.side })} ad="Ayrıntılar paneli" />
          <OdakDugmesi />
        </Group>
      </div>
      <div className="workspace">
        <div className="center">
          <main className="stage mm-stage" ref={gorunum.olcu}>
            <MimariSahne
              sahne={k.sahne}
              adlar={adlar}
              gorunum={gorunum}
              vurgu={vurgu}
              hedef={hedef}
              secim={secim}
              sec={sec}
              uzerinde={uzerinde}
              ayrintiAc={ayrintiAc}
              etiket={`${k.kayit.ad}: blok diyagramı`}
              bilgi={bilgi}
            />
          </main>
        </div>
        {panel.side && <YanBolucu lay={lay} setLay={setLay} />}
        {panel.side && (
          <aside className="side mm-side" aria-label="Ayrıntılar">
            <div className="side-body">
              <MimariPanel k={k} il={il} secim={secim} sec={sec} ayrintiAc={ayrintiAc} goster3d={goster3d} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

/** Sahnenin altındaki satır: üstüne gelinen ya da seçilenin kısa tanımı; yoksa ipucu */
function bilgiSatiri(k: ReturnType<typeof diyagramKur>, h: Hedef | null) {
  if (!h) {
    return (
      <span className="mm-ipucu">
        <span className="ince-yok">Kutunun üstüne gel: yolları öne çıkar · tıkla: ayrıntılar · tekerlek: yakınlaştır · sürükle: kaydır</span>
        <span className="ince-var">Dokun: ayrıntılar (aşağıda) · iki parmak: yakınlaştır · sürükle: kaydır</span>
      </span>
    );
  }
  if (h.tur === "yol") {
    const y = k.diyagram.yollar.find((x) => x.id === h.id);
    if (!y) return null;
    return (
      <>
        <i className={`mm-sw mm-sw-y mm-y-${y.tur}`} aria-hidden="true" />
        <b>{yolEtiketMetni(y)}</b>
        <span className="mm-bilgi-ek">{YOL_TURU_ADI[y.tur]} · {netOzeti(y.netler)}</span>
      </>
    );
  }
  const x = k.diyagram.kutular.find((z) => z.id === h.id);
  if (x) {
    const n = x.cihaz ? 0 : k.devre.parcalar(x.bloklar).cipler.length;
    return (
      <>
        <i className={`mm-sw mm-sw-k mm-k-${x.rol}${x.cihaz ? " mm-sw-cihaz" : ""}`} aria-hidden="true" />
        <b>{x.ad}</b>
        <span className="mm-bilgi-ek">{[x.cihaz ? "Dış cihaz" : `${KUTU_ROLU_ADI[x.rol]} · ${n} entegre`, kutuGorevi(x)].filter(Boolean).join(" · ")}</span>
      </>
    );
  }
  const g = k.diyagram.gruplar.find((z) => z.id === h.id);
  if (!g) return null;
  return (
    <>
      <i className="mm-sw mm-sw-kart" aria-hidden="true" />
      <b>{g.ad}</b>
      <span className="mm-bilgi-ek">{g.ayrinti ? "çift tıkla: ayrıntılı diyagram" : `${g.kutular.length} kutu`}</span>
    </>
  );
}
