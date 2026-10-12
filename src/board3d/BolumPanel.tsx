// Bölüm etiketlerinin arayüzü: araç çubuğundaki "Etiketler" düğmeleri, yan paneldeki bölüm açıklaması
// (İnceleme sekmesinde: başlık, görev, nasıl çalışır, aşama ve deney, sinyaller, alt bölümler, parçalar)
// ve çipin ipucundaki / inceleme panelindeki grup etiketi. Metinler cpu16/board/bolum-bilgi.ts'ten.

import { useMemo, useState, type CSSProperties } from "react";
import { bolumSinyalleri, bolumZinciri, type Bolum, type BolumTuru } from "../../cpu16/board/bolum-bilgi";
import { Group } from "../ui/Shell";
import { bolumRengi, bolumu, ETIKET_KIPLERI, katalog, useBolum, type EtiketKipi } from "./bolum";
import { boardModel, useKart } from "./store";

/**
 * Araç çubuğu: Etiketler kapalı / bölümler / ayrıntılı (kısayol E). Saat hızı gibi açılır liste: araç
 * çubuğu 1440 px'lik ekranda da tek satırda kalsın (daha dar ekranda bilgisayarda "⋯" menüsüne geçer).
 */
export function EtiketGrubu() {
  return (
    <Group label="Etiketler" className="etiket-grubu">
      <EtiketSecimi className="speed" etiket={<span className="tb-label kisalir">Etiketler</span>} />
    </Group>
  );
}

/** Dar ekranda (bilgisayarın kalabalık araç çubuğunda) aynı seçim "⋯" menüsünde */
export function EtiketMenuSecimi() {
  return <EtiketSecimi className="ayar-satiri etiket-menude" etiket={<span>Etiketler</span>} />;
}

function EtiketSecimi({ className, etiket }: { className: string; etiket: React.ReactNode }) {
  const kip = useBolum((s) => s.kip);
  return (
    <label className={className} title="Bölüm etiketleri · kısayol: E">
      {etiket}
      <select value={kip} onChange={(e) => useBolum.getState().kipSec(e.target.value as EtiketKipi)} aria-label="Etiketler">
        {ETIKET_KIPLERI.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}
      </select>
    </label>
  );
}

const TUR_ADI: Record<BolumTuru, string> = { kart: "Kart", bolge: "Breadboard bölgesi", blok: "İşlev bloğu", grup: "Çip grubu" };
const ALT_BASLIK: Record<BolumTuru, string> = { kart: "Bölgeler", bolge: "Bloklar", blok: "Çip grupları", grup: "" };

/** Parçanın grubu (çipin ya da pasifin; 100 nF'ların grubu yok) */
export const parcaGrubu = (ref: string): Bolum | null => bolumu(katalog().grubu.get(ref) ?? null);

/** Çipin ipucundaki satır: grubunun etiketi ve görevi */
export function BolumIpucuSatiri({ refName }: { refName: string }) {
  const kip = useBolum((s) => s.kip);
  const g = parcaGrubu(refName);
  if (!g || kip === "kapali") return null;
  return (
    <div className="tt-bolum" style={{ "--renk": bolumRengi(g.id) } as CSSProperties}>
      <b>{g.etiket}</b> {g.gorev}
    </div>
  );
}

/** İnceleme panelindeki etiket: parçanın grubu (tıklanınca grubun açıklaması) */
export function BolumEtiketi({ refName }: { refName: string }) {
  const g = parcaGrubu(refName);
  if (!g) return null;
  return (
    <button className="etiket bolum-etiketi" style={{ "--renk": bolumRengi(g.id) } as CSSProperties} onClick={() => useBolum.getState().sec(g.id)} title={`${g.baslik}: ${g.gorev}`}>
      <i aria-hidden="true" />
      {g.etiket}
    </button>
  );
}

/** Parçalar listesi bir kerede en çok bu kadar */
const PARCA_SINIRI = 40;

/** Yan panel: seçili bölümün açıklaması */
export function BolumPanel() {
  const id = useBolum((s) => s.secili);
  const [hepsi, setHepsi] = useState(false);
  const b = bolumu(id);
  const { board } = boardModel();
  const sinyaller = useMemo(() => (b ? bolumSinyalleri(board, b.refs, 16) : []), [board, b]);
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
  // bölge ile tek bloğu aynı adı taşıyabilir ("Register dosyası"): zincirde bir kez
  const zincir = bolumZinciri(k, b.id).filter((z, i, a) => i === a.length - 1 || z.baslik !== a[i + 1].baslik);
  const altlar = b.alt.map((a) => k.bolumler.get(a)!).filter(Boolean);
  const renk = bolumRengi(b.id);
  const cipSayisi = parcalar.filter((p) => p.cip).length;
  const pasifSayisi = parcalar.length - cipSayisi;
  const sec = (x: string) => useBolum.getState().sec(x, true);
  const gorunen = hepsi ? parcalar : parcalar.slice(0, PARCA_SINIRI);
  return (
    <section className="bolum-panel" style={{ "--renk": renk } as CSSProperties} aria-label={`Bölüm: ${b.baslik}`}>
      <div className="parca-bas">
        <div className="bolum-ad">
          <span className="bolum-tur"><i aria-hidden="true" />{TUR_ADI[b.tur]}</span>
          <h2>{b.baslik}</h2>
        </div>
        <button className="link" onClick={() => useBolum.getState().sec(null)} title="Kısayol: Esc">kapat</button>
      </div>
      {zincir.length > 1 && (
        <nav className="bolum-zincir" aria-label="Bölümün yeri">
          {zincir.slice(0, -1).map((z) => (
            <span key={z.id}>
              <button className="link" onClick={() => sec(z.id)} title={z.gorev}>{z.baslik}</button>
              <span aria-hidden="true"> › </span>
            </span>
          ))}
          <span aria-current="location">{b.baslik}</span>
        </nav>
      )}
      <p className="parca-gorev">{b.gorev}</p>
      <div className="etiketler">
        <span className="etiket bolum-etiketi"><i aria-hidden="true" />{b.etiket}</span>
        {b.asamalar.map((a) => (
          <span key={a.no} className="etiket" title={`Kurulum aşaması ${a.no}: ${a.ad}`}>
            Aşama {a.no}{a.deney !== undefined ? ` · deney ${a.deney}` : ""}
          </span>
        ))}
        {cipSayisi > 0 && <span className="etiket">{cipSayisi.toLocaleString("tr-TR")} entegre</span>}
        {pasifSayisi > 0 && <span className="etiket">{pasifSayisi.toLocaleString("tr-TR")} pasif</span>}
      </div>
      <div className="bolum-blok">
        <h3>Nasıl çalışır</h3>
        <p className="bolum-nasil">{b.nasil}</p>
      </div>
      {b.asamalar.length > 0 && (
        <div className="bolum-blok">
          <h3>Kurulum</h3>
          <ul className="bolum-asamalar">
            {b.asamalar.map((a) => (
              <li key={a.no}>
                <b>Aşama {a.no}</b> {a.ad}{a.deney !== undefined ? <span className="hint-text"> · deney {a.deney}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {sinyaller.length > 0 && (
        <div className="bolum-blok">
          <h3>Dışarıyla bağlantıları</h3>
          <p className="bolum-sinyaller">{sinyaller.map((s) => <code key={s}>{s}</code>)}</p>
        </div>
      )}
      {altlar.length > 0 && (
        <div className="bolum-blok">
          <h3>{ALT_BASLIK[b.tur]}</h3>
          <ul className="bolum-altlar">
            {altlar.map((a) => (
              <li key={a.id} style={{ "--renk": bolumRengi(a.id) } as CSSProperties}>
                <i aria-hidden="true" />
                <button className="link" onClick={() => sec(a.id)}>{a.baslik}</button>
                <span className="hint-text">{a.refs.length.toLocaleString("tr-TR")} parça</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="bolum-blok">
        <h3>Parçalar <span className="hint-text">tıkla: seç</span></h3>
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
          <button className="link" onClick={() => setHepsi(!hepsi)}>{hepsi ? "daha az" : `+${(parcalar.length - PARCA_SINIRI).toLocaleString("tr-TR")} parça daha`}</button>
        )}
      </div>
    </section>
  );
}
