// Breadboard kurulum paneli: odaktaki tel delikten deliğe büyük yazılır (hangi pano, hangi board, hangi
// delik, kaç mm, hangi renk; uçların şeridinde hangi bacaklar var), "Taktım" ile işaretlenir, sıradakine
// geçilir. Aşamalar kurulum sırasıyla; her aşamanın sonunda bir test. Bilgisayarda pano (kart) ve aşama
// seçilir. Numaralar yazdırılan breadboard belgesiyle aynı.

import { useEffect, useMemo, useState } from "react";
import { ucEtiketi, type BbTel } from "../../cpu16/board/breadboard/plan";
import { bbSahnesi, type BbPanosu } from "./aktif";
import { bbGezilenTeller, bbPano, bbSeciliTel, telKimligi, ucunKomsulari, useBbKurulum } from "./bbKurulum";
import "./kurulum.css";

const sayi = (n: number) => n.toLocaleString("tr-TR");
const renkHex = (p: BbPanosu, t: BbTel) => (t.renk === "siyah" ? "#444" : p.renk(t.renk).hex);
const mm = (x: number) => `${Math.round(x)} mm`;
/** aşamanın sonundaki test (bilgisayarın panolarında) */
const asamaTesti = (a: object): string | undefined => (a as { test?: string }).test;

function Uc({ p, t, son }: { p: BbPanosu; t: BbTel; son: boolean }) {
  const n = t.yol.length;
  const [X, Y] = son ? [t.yol[n - 2], t.yol[n - 1]] : [t.yol[0], t.yol[1]];
  const [board, delik] = ucEtiketi(p.plan.yerlesim, X, Y).split(" ");
  return (
    <div className="kur-uc">
      <div className="kur-uc-yon">{son ? "nereye" : "nereden"}</div>
      <div className="kur-uc-ref">
        {p.kisa ? `${p.kisa} · ` : ""}
        {board} <span className="kur-uc-deger">{delik}</span>
      </div>
      <div className="kur-uc-yer">{ucunKomsulari(p.plan, X, Y)}</div>
    </div>
  );
}

function TelKarti({ p, t, takildi }: { p: BbPanosu; t: BbTel; takildi: boolean }) {
  const asama = p.plan.asamalar.find((a) => a.no === t.asama);
  const r = p.renk(t.renk);
  return (
    <div className={`kur-tel ${takildi ? "takildi" : ""}`}>
      <div className="kur-tel-bas">
        <span className="kur-tel-id">{telKimligi(t.no)}</span>
        <span className="kur-renk" style={{ background: renkHex(p, t) }} />
        <span className="kur-tel-renk">
          {r.ad.toLocaleLowerCase("tr-TR")} tel · {t.ray ? "ray köprüsü" : r.grup}
        </span>
        {takildi && <span className="kur-rozet">takıldı</span>}
      </div>
      <div className="kur-tel-net">
        delikten deliğe <b>{mm(t.uzunluk)}</b> · kes <b>{mm(t.kesim)}</b> · net <b>{t.ad}</b> · {t.asama}. aşama{asama ? `: ${asama.ad}` : ""}
      </div>
      <div className="kur-tel-uclar">
        <Uc p={p} t={t} son={false} />
        <div className="kur-ok" aria-hidden>
          →
        </div>
        <Uc p={p} t={t} son />
      </div>
    </div>
  );
}

function AsamaListesi({ p }: { p: BbPanosu }) {
  const yapilan = useBbKurulum((s) => s.yapilan);
  const secili = useBbKurulum((s) => s.secili);
  const sec = useBbKurulum((s) => s.sec);
  const isaretle = useBbKurulum((s) => s.isaretle);
  const tel = useBbKurulum(bbSeciliTel);
  const [acik, setAcik] = useState<number | null>(null);
  useEffect(() => setAcik(tel?.asama ?? null), [tel?.asama]);
  const gruplar = useMemo(() => p.plan.asamalar.map((a) => ({ a, teller: p.plan.teller.filter((t) => t.asama === a.no) })), [p]);
  return (
    <div className="kur-bloklar">
      {gruplar.map(({ a, teller }) => {
        const bitti = teller.filter((t) => yapilan.has(t.no)).length;
        const ac = acik === a.no;
        const test = asamaTesti(a);
        return (
          <section key={a.no} className={`kur-blok ${ac ? "acik" : ""}`}>
            <button className="kur-blok-bas" onClick={() => setAcik(ac ? null : a.no)} aria-expanded={ac}>
              <span className="kur-blok-ad">
                {a.no}. {a.ad}
              </span>
              <span className="kur-blok-sayi">
                {sayi(bitti)} / {sayi(teller.length)}
              </span>
              <span className="kur-mini-bar">
                <span style={{ width: `${teller.length ? (100 * bitti) / teller.length : 0}%` }} />
              </span>
            </button>
            {ac && test && <p className="kur-ipucu">Aşamanın sonunda: {test}</p>}
            {ac && (
              <ol className="kur-liste">
                {teller.map((t) => {
                  const n = t.yol.length;
                  return (
                    <li key={t.no} className={`${t.no === secili ? "secili" : ""} ${yapilan.has(t.no) ? "takildi" : ""}`}>
                      <input type="checkbox" checked={yapilan.has(t.no)} onChange={(e) => isaretle(t.no, e.target.checked)} aria-label={`${telKimligi(t.no)} takıldı`} />
                      <button onClick={() => sec(t.no)}>
                        <span className="kur-li-id">{telKimligi(t.no)}</span>
                        <span className="kur-renk kucuk" style={{ background: renkHex(p, t) }} title={p.renk(t.renk).ad} />
                        <span className="kur-li-uc">
                          {ucEtiketi(p.plan.yerlesim, t.yol[0], t.yol[1])} → {ucEtiketi(p.plan.yerlesim, t.yol[n - 2], t.yol[n - 1])}
                        </span>
                        <span className="kur-li-net">{mm(t.uzunluk)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}

function SifirlaDugmesi({ bos, ad }: { bos: boolean; ad: string }) {
  const sifirla = useBbKurulum((s) => s.sifirla);
  const [soruyor, setSoruyor] = useState(false);
  useEffect(() => {
    if (!soruyor) return;
    const t = setTimeout(() => setSoruyor(false), 4000);
    return () => clearTimeout(t);
  }, [soruyor]);
  return (
    <button
      className={`kur-sifirla ${soruyor ? "soruyor" : ""}`}
      disabled={bos}
      title={`${ad}: bütün işaretleri sil`}
      onClick={() => {
        if (!soruyor) return setSoruyor(true);
        setSoruyor(false);
        sifirla();
      }}
    >
      {soruyor ? "Emin misin? Bütün işaretler silinecek" : "İşaretleri sil"}
    </button>
  );
}

/** Bilgisayarda pano ve aşama seçimi; hesap makinesinde tek pano */
function PanoSecimi({ p }: { p: BbPanosu }) {
  const sahne = bbSahnesi();
  const asama = useBbKurulum((s) => s.asama);
  const st = useBbKurulum.getState();
  if (sahne.panolar.length === 1) {
    return (
      <span className="kur-kart">
        <span>Breadboard</span>
        <b>
          {p.plan.yerlesim.boards.length} board · {sayi(p.plan.teller.length)} atlama teli
        </b>
      </span>
    );
  }
  return (
    <>
      <label className="kur-kart">
        <span>Pano</span>
        <select value={p.kart} onChange={(e) => st.panoSec(e.target.value)}>
          {sahne.panolar.map((x) => (
            <option key={x.kart} value={x.kart}>
              {x.baslik} · {x.plan.yerlesim.boards.length} board · {sayi(x.plan.teller.length)} tel
            </option>
          ))}
        </select>
      </label>
      <label className="kur-kart">
        <span>Aşama</span>
        <select value={asama ?? ""} onChange={(e) => st.asamaSec(e.target.value === "" ? null : +e.target.value)}>
          <option value="">Bütün aşamalar</option>
          {p.plan.asamalar.map((a) => (
            <option key={a.no} value={a.no}>
              {a.no}. {a.ad}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function BbKurulumPanel() {
  const s = useBbKurulum();
  const tel = useBbKurulum(bbSeciliTel);
  const p = bbPano(s.pano);
  useEffect(() => {
    useBbKurulum.getState().ac(true);
    return () => useBbKurulum.getState().ac(false);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName) || el.closest(".vga-screen"))) return;
      const st = useBbKurulum.getState();
      const t = bbSeciliTel(st);
      if (e.key === "Enter" && t) {
        e.preventDefault();
        st.isaretle(t.no, true);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        st.git(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        st.git(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const gezilen = bbGezilenTeller(s);
  const toplam = gezilen.length;
  const bitti = gezilen.filter((t) => s.yapilan.has(t.no)).length;
  const asama = s.asama === null ? null : p.plan.asamalar.find((a) => a.no === s.asama);
  return (
    <div className="kur">
      <div className="kur-ust">
        <PanoSecimi p={p} />
        <label className="kur-izle" title="Kamera odaktaki telin iki ucunu çerçevelesin">
          <input type="checkbox" checked={s.izle} onChange={(e) => s.setIzle(e.target.checked)} /> Kamera teli izlesin
        </label>
      </div>
      <div className="kur-ilerleme" aria-label={`${bitti} / ${toplam} tel takıldı`}>
        <div className="kur-bar">
          <span style={{ width: `${toplam ? (100 * bitti) / toplam : 0}%` }} />
        </div>
        <div className="kur-ilerleme-yazi">
          <span>
            <b>{sayi(bitti)}</b> / {sayi(toplam)} tel takıldı · %{toplam ? Math.floor((100 * bitti) / toplam) : 0}
          </span>
          <span className="kur-ilerleme-ek">{asama ? `${asama.no}. aşama` : `${p.plan.asamalar.length} aşama · her aşamanın sonunda test`}</span>
        </div>
      </div>
      {tel ? <TelKarti p={p} t={tel} takildi={s.yapilan.has(tel.no)} /> : <p className="kur-not">Bütün teller takıldı.</p>}
      <div className="kur-dugmeler">
        <button onClick={() => s.git(-1)} title="Önceki tel (←)">
          ← Önceki
        </button>
        {tel && (
          <button className="primary" onClick={() => s.isaretle(tel.no)} title="Takıldı olarak işaretle ve sıradakine geç (Enter)">
            {s.yapilan.has(tel.no) ? "Takılmadı say" : "Taktım ✓"}
          </button>
        )}
        <button onClick={() => s.git(1)} title="Sonraki tel (→)">
          Sonraki →
        </button>
        <button onClick={() => s.git(1, true)} title="Takılmamış sıradaki tel">
          Sıradaki açık
        </button>
      </div>
      <p className="kur-ipucu">
        Enter: taktım · ← →: gez. Delikler: board adı (BB01 panonun sol arka köşesi) ve delik (a–j satırı + sütun; raylar üst+/üst−/alt−/alt+). Numaralar
        yazdırılan belgeyle aynı (<code>{bbSahnesi().belgeKomutu}</code>).
      </p>
      <AsamaListesi p={p} />
      <div className="kur-alt">
        <SifirlaDugmesi bos={s.yapilan.size === 0} ad={p.baslik} />
      </div>
    </div>
  );
}
