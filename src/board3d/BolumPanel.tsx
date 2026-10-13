// Bölüm etiketlerinin arayüzü: araç çubuğundaki "Etiketler" düğmeleri, yan paneldeki bölüm açıklaması
// (İnceleme sekmesinde: başlık, görev, nasıl çalışır, aşama ve deney, sinyaller, alt bölümler, parçalar)
// ve çipin ipucundaki / inceleme panelindeki grup etiketi. Metinler cpu16/board/bolum-bilgi.ts'ten,
// seçili dilde (bolumMetni, asamaAdi).

import { useMemo, useState, type CSSProperties } from "react";
import { asamaAdi, bolumMetni, bolumSinyalleri, bolumZinciri, type Bolum, type BolumTuru } from "../../cpu16/board/bolum-bilgi";
import { sec as dilde, useDil, useT, type IkiDil } from "../ui/ceviri";
import { Group } from "../ui/Shell";
import { bolumRengi, bolumu, ETIKET_KIPLERI, katalog, useBolum, type EtiketKipi } from "./bolum";
import { boardModel, useKart } from "./store";

const KIP_ADI: Record<EtiketKipi, IkiDil> = {
  kapali: { tr: "kapalı", en: "off" },
  bolumler: { tr: "bölümler", en: "regions" },
  ayrintili: { tr: "ayrıntılı", en: "detailed" },
};

/**
 * Araç çubuğu: Etiketler kapalı / bölümler / ayrıntılı (kısayol E). Saat hızı gibi açılır liste: araç
 * çubuğu 1440 px'lik ekranda da tek satırda kalsın (daha dar ekranda bilgisayarda "⋯" menüsüne geçer).
 */
export function EtiketGrubu() {
  const t = useT();
  return (
    <Group label={t("Etiketler", "Labels")} className="etiket-grubu">
      <EtiketSecimi className="speed" etiket={<span className="tb-label kisalir">{t("Etiketler", "Labels")}</span>} />
    </Group>
  );
}

/** Dar ekranda (bilgisayarın kalabalık araç çubuğunda) aynı seçim "⋯" menüsünde */
export function EtiketMenuSecimi() {
  const t = useT();
  return <EtiketSecimi className="ayar-satiri etiket-menude" etiket={<span>{t("Etiketler", "Labels")}</span>} />;
}

function EtiketSecimi({ className, etiket }: { className: string; etiket: React.ReactNode }) {
  const kip = useBolum((s) => s.kip);
  const t = useT();
  const dil = useDil();
  return (
    <label className={className} title={t("Bölüm etiketleri · kısayol: E", "Section labels · shortcut: E")}>
      {etiket}
      <select value={kip} onChange={(e) => useBolum.getState().kipSec(e.target.value as EtiketKipi)} aria-label={t("Etiketler", "Labels")}>
        {ETIKET_KIPLERI.map((x) => <option key={x.k} value={x.k}>{dilde(KIP_ADI[x.k], dil)}</option>)}
      </select>
    </label>
  );
}

const TUR_ADI: Record<BolumTuru, IkiDil> = {
  kart: { tr: "Kart", en: "Board" },
  bolge: { tr: "Breadboard bölgesi", en: "Breadboard region" },
  blok: { tr: "İşlev bloğu", en: "Function block" },
  grup: { tr: "Çip grubu", en: "Chip group" },
};
const ALT_BASLIK: Record<BolumTuru, IkiDil> = {
  kart: { tr: "Bölgeler", en: "Regions" },
  bolge: { tr: "Bloklar", en: "Blocks" },
  blok: { tr: "Çip grupları", en: "Chip groups" },
  grup: { tr: "", en: "" },
};

/** Parçanın grubu (çipin ya da pasifin; 100 nF'ların grubu yok) */
export const parcaGrubu = (ref: string): Bolum | null => bolumu(katalog().grubu.get(ref) ?? null);

/** Çipin ipucundaki satır: grubunun etiketi ve görevi */
export function BolumIpucuSatiri({ refName }: { refName: string }) {
  const kip = useBolum((s) => s.kip);
  const dil = useDil();
  const g = parcaGrubu(refName);
  if (!g || kip === "kapali") return null;
  const m = bolumMetni(g, dil);
  return (
    <div className="tt-bolum" style={{ "--renk": bolumRengi(g.id) } as CSSProperties}>
      <b>{m.etiket}</b> {m.gorev}
    </div>
  );
}

/** İnceleme panelindeki etiket: parçanın grubu (tıklanınca grubun açıklaması) */
export function BolumEtiketi({ refName }: { refName: string }) {
  const dil = useDil();
  const g = parcaGrubu(refName);
  if (!g) return null;
  const m = bolumMetni(g, dil);
  return (
    <button className="etiket bolum-etiketi" style={{ "--renk": bolumRengi(g.id) } as CSSProperties} onClick={() => useBolum.getState().sec(g.id)} title={`${m.baslik}: ${m.gorev}`}>
      <i aria-hidden="true" />
      {m.etiket}
    </button>
  );
}

/** Parçalar listesi bir kerede en çok bu kadar */
const PARCA_SINIRI = 40;

/** Yan panel: seçili bölümün açıklaması */
export function BolumPanel() {
  const id = useBolum((s) => s.secili);
  const [hepsi, setHepsi] = useState(false);
  const t = useT();
  const dil = useDil();
  const b = bolumu(id);
  const { board } = boardModel();
  const sinyaller = useMemo(() => (b ? bolumSinyalleri(board, b.refs, 16, dil) : []), [board, b, dil]);
  // parça adı ve görevi devreden (sahnedeki yerleşimden değil): bilgisayarın breadboard verisi daha
  // yüklenmemişken de (Mimari'den "3D'de göster") panel açılabilsin
  const parcalar = useMemo(() => {
    if (!b) return [];
    const cipler = new Map(board.chips.map((c) => [c.ref, c]));
    const pasifler = new Map(board.passives.map((p) => [p.ref, p]));
    return b.refs.map((ref) => {
      const c = cipler.get(ref);
      const p = pasifler.get(ref);
      return { ref, part: c?.def.part ?? p?.part ?? "", rol: c?.role ?? p?.role ?? "", cip: !!c };
    });
  }, [board, b]);
  if (!b) return null;
  const k = katalog();
  const m = bolumMetni(b, dil);
  // bölge ile tek bloğu aynı adı taşıyabilir ("Register dosyası"): zincirde bir kez
  const zincir = bolumZinciri(k, b.id).filter((z, i, a) => i === a.length - 1 || z.baslik !== a[i + 1].baslik);
  const altlar = b.alt.map((a) => k.bolumler.get(a)!).filter(Boolean);
  const renk = bolumRengi(b.id);
  const cipSayisi = parcalar.filter((p) => p.cip).length;
  const pasifSayisi = parcalar.length - cipSayisi;
  const sec = (x: string) => useBolum.getState().sec(x, true);
  const gorunen = hepsi ? parcalar : parcalar.slice(0, PARCA_SINIRI);
  const sayi = (n: number) => n.toLocaleString(dil === "en" ? "en-US" : "tr-TR");
  return (
    <section className="bolum-panel" style={{ "--renk": renk } as CSSProperties} aria-label={`${t("Bölüm", "Section")}: ${m.baslik}`}>
      <div className="parca-bas">
        <div className="bolum-ad">
          <span className="bolum-tur"><i aria-hidden="true" />{dilde(TUR_ADI[b.tur], dil)}</span>
          <h2>{m.baslik}</h2>
        </div>
        <button className="link" onClick={() => useBolum.getState().sec(null)} title={t("Kısayol: Esc", "Shortcut: Esc")}>{t("kapat", "close")}</button>
      </div>
      {zincir.length > 1 && (
        <nav className="bolum-zincir" aria-label={t("Bölümün yeri", "Where this section is")}>
          {zincir.slice(0, -1).map((z) => (
            <span key={z.id}>
              <button className="link" onClick={() => sec(z.id)} title={bolumMetni(z, dil).gorev}>{bolumMetni(z, dil).baslik}</button>
              <span aria-hidden="true"> › </span>
            </span>
          ))}
          <span aria-current="location">{m.baslik}</span>
        </nav>
      )}
      <p className="parca-gorev">{m.gorev}</p>
      <div className="etiketler">
        <span className="etiket bolum-etiketi"><i aria-hidden="true" />{m.etiket}</span>
        {b.asamalar.map((a) => (
          <span key={a.no} className="etiket" title={`${t("Kurulum aşaması", "Build stage")} ${a.no}: ${asamaAdi(a, dil)}`}>
            {t("Aşama", "Stage")} {a.no}{a.deney !== undefined ? ` · ${t("deney", "experiment")} ${a.deney}` : ""}
          </span>
        ))}
        {cipSayisi > 0 && <span className="etiket">{sayi(cipSayisi)} {t("entegre", cipSayisi === 1 ? "chip" : "chips")}</span>}
        {pasifSayisi > 0 && <span className="etiket">{sayi(pasifSayisi)} {t("pasif", pasifSayisi === 1 ? "passive" : "passives")}</span>}
      </div>
      <div className="bolum-blok">
        <h3>{t("Nasıl çalışır", "How it works")}</h3>
        <p className="bolum-nasil">{m.nasil}</p>
      </div>
      {b.asamalar.length > 0 && (
        <div className="bolum-blok">
          <h3>{t("Kurulum", "Build")}</h3>
          <ul className="bolum-asamalar">
            {b.asamalar.map((a) => (
              <li key={a.no}>
                <b>{t("Aşama", "Stage")} {a.no}</b> {asamaAdi(a, dil)}{a.deney !== undefined ? <span className="hint-text"> · {t("deney", "experiment")} {a.deney}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {sinyaller.length > 0 && (
        <div className="bolum-blok">
          <h3>{t("Dışarıyla bağlantıları", "Connections to the outside")}</h3>
          <p className="bolum-sinyaller">{sinyaller.map((s) => <code key={s}>{s}</code>)}</p>
        </div>
      )}
      {altlar.length > 0 && (
        <div className="bolum-blok">
          <h3>{dilde(ALT_BASLIK[b.tur], dil)}</h3>
          <ul className="bolum-altlar">
            {altlar.map((a) => (
              <li key={a.id} style={{ "--renk": bolumRengi(a.id) } as CSSProperties}>
                <i aria-hidden="true" />
                <button className="link" onClick={() => sec(a.id)}>{bolumMetni(a, dil).baslik}</button>
                <span className="hint-text">{sayi(a.refs.length)} {t("parça", a.refs.length === 1 ? "part" : "parts")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="bolum-blok">
        <h3>{t("Parçalar", "Parts")} <span className="hint-text">{t("tıkla: seç", "click to select")}</span></h3>
        <ul className="tlist bolum-parcalar">
          {gorunen.map((p) => (
            <li key={p.ref}>
              <button className="link" onClick={() => useKart.getState().selectChip(p.ref)}>{p.ref}</button>
              <code>{p.part}</code>
              <span>{p.rol}</span>
            </li>
          ))}
        </ul>
        {parcalar.length > PARCA_SINIRI && (
          <button className="link" onClick={() => setHepsi(!hepsi)}>
            {hepsi ? t("daha az", "show fewer") : `+${sayi(parcalar.length - PARCA_SINIRI)} ${t("parça daha", "more parts")}`}
          </button>
        )}
      </div>
    </section>
  );
}
