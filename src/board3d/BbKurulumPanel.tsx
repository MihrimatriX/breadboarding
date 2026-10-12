// Hesap makinesinin breadboard kurulum paneli: odaktaki tel delikten deliğe büyük yazılır (hangi
// board, hangi delik, kaç mm, hangi renk; uçların şeridinde hangi bacaklar var), "Taktım" ile
// işaretlenir, sıradakine geçilir. Aşamalar kurulum sırasıyla; her aşamanın sonunda bir test
// (hesap8/docs/kurulum-rehberi.md). Numaralar yazdırılan breadboard belgesiyle aynı.

import { useEffect, useMemo, useState } from "react";
import type { BbTel } from "../../hesap8/breadboard/plan";
import { renkTanimi } from "../../hesap8/breadboard/renk";
import { hesapPlani } from "./aktif";
import { bbSeciliTel, telKimligi, ucunKomsulari, useBbKurulum } from "./bbKurulum";
import { ucEtiketi } from "../../hesap8/breadboard/plan";
import "./kurulum.css";

const sayi = (n: number) => n.toLocaleString("tr-TR");
const renkHex = (t: BbTel) => (t.renk === "siyah" ? "#444" : renkTanimi(t.renk).hex);
const mm = (x: number) => `${Math.round(x)} mm`;

function Uc({ t, son }: { t: BbTel; son: boolean }) {
  const p = hesapPlani();
  const n = t.yol.length;
  const [X, Y] = son ? [t.yol[n - 2], t.yol[n - 1]] : [t.yol[0], t.yol[1]];
  const [board, delik] = ucEtiketi(p.yerlesim, X, Y).split(" ");
  return (
    <div className="kur-uc">
      <div className="kur-uc-yon">{son ? "nereye" : "nereden"}</div>
      <div className="kur-uc-ref">
        {board} <span className="kur-uc-deger">{delik}</span>
      </div>
      <div className="kur-uc-yer">{ucunKomsulari(p, X, Y)}</div>
    </div>
  );
}

function TelKarti({ t, takildi }: { t: BbTel; takildi: boolean }) {
  const p = hesapPlani();
  const asama = p.asamalar.find((a) => a.no === t.asama);
  return (
    <div className={`kur-tel ${takildi ? "takildi" : ""}`}>
      <div className="kur-tel-bas">
        <span className="kur-tel-id">{telKimligi(t.no)}</span>
        <span className="kur-renk" style={{ background: renkHex(t) }} />
        <span className="kur-tel-renk">
          {renkTanimi(t.renk).ad.toLocaleLowerCase("tr-TR")} tel · {t.ray ? "ray köprüsü" : renkTanimi(t.renk).grup}
        </span>
        {takildi && <span className="kur-rozet">takıldı</span>}
      </div>
      <div className="kur-tel-net">
        delikten deliğe <b>{mm(t.uzunluk)}</b> · kes <b>{mm(t.kesim)}</b> · net <b>{t.ad}</b> · {t.asama}. aşama{asama ? `: ${asama.ad}` : ""}
      </div>
      <div className="kur-tel-uclar">
        <Uc t={t} son={false} />
        <div className="kur-ok" aria-hidden>
          →
        </div>
        <Uc t={t} son />
      </div>
    </div>
  );
}

function AsamaListesi() {
  const p = hesapPlani();
  const yapilan = useBbKurulum((s) => s.yapilan);
  const secili = useBbKurulum((s) => s.secili);
  const sec = useBbKurulum((s) => s.sec);
  const isaretle = useBbKurulum((s) => s.isaretle);
  const tel = useBbKurulum(bbSeciliTel);
  const [acik, setAcik] = useState<number | null>(null);
  useEffect(() => setAcik(tel?.asama ?? null), [tel?.asama]);
  const gruplar = useMemo(() => p.asamalar.map((a) => ({ a, teller: p.teller.filter((t) => t.asama === a.no) })), [p]);
  return (
    <div className="kur-bloklar">
      {gruplar.map(({ a, teller }) => {
        const bitti = teller.filter((t) => yapilan.has(t.no)).length;
        const ac = acik === a.no;
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
            {ac && (
              <ol className="kur-liste">
                {teller.map((t) => {
                  const n = t.yol.length;
                  return (
                    <li key={t.no} className={`${t.no === secili ? "secili" : ""} ${yapilan.has(t.no) ? "takildi" : ""}`}>
                      <input type="checkbox" checked={yapilan.has(t.no)} onChange={(e) => isaretle(t.no, e.target.checked)} aria-label={`${telKimligi(t.no)} takıldı`} />
                      <button onClick={() => sec(t.no)}>
                        <span className="kur-li-id">{telKimligi(t.no)}</span>
                        <span className="kur-renk kucuk" style={{ background: renkHex(t) }} title={renkTanimi(t.renk).ad} />
                        <span className="kur-li-uc">
                          {ucEtiketi(p.yerlesim, t.yol[0], t.yol[1])} → {ucEtiketi(p.yerlesim, t.yol[n - 2], t.yol[n - 1])}
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

function SifirlaDugmesi({ bos }: { bos: boolean }) {
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
      title="Breadboard'un bütün işaretlerini sil"
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

export function BbKurulumPanel() {
  const s = useBbKurulum();
  const tel = useBbKurulum(bbSeciliTel);
  const p = hesapPlani();
  useEffect(() => {
    useBbKurulum.getState().ac(true);
    return () => useBbKurulum.getState().ac(false);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName))) return;
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
  const toplam = p.teller.length;
  const bitti = s.yapilan.size;
  return (
    <div className="kur">
      <div className="kur-ust">
        <span className="kur-kart">
          <span>Breadboard</span>
          <b>
            {p.yerlesim.boards.length} board · {sayi(toplam)} atlama teli
          </b>
        </span>
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
          <span className="kur-ilerleme-ek">{p.asamalar.length} aşama · her aşamanın sonunda test</span>
        </div>
      </div>
      {tel ? <TelKarti t={tel} takildi={s.yapilan.has(tel.no)} /> : <p className="kur-not">Bütün teller takıldı.</p>}
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
        Enter: taktım · ← →: gez. Delikler: board adı (BB01 sol arka köşe) ve delik (a–j satırı + sütun; raylar üst+/üst−/alt−/alt+). Numaralar
        yazdırılan belgeyle aynı (<code>npm run hesap8 -- breadboard-belge</code>).
      </p>
      <AsamaListesi />
      <div className="kur-alt">
        <SifirlaDugmesi bos={bitti === 0} />
      </div>
    </div>
  );
}
