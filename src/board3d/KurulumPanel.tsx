// Kurulum modu paneli: kartı tel tel kurarken yanında açık dursun. Odaktaki tel büyük yazılır
// (nereden, nereye, hangi bacak, hangi renk), iki çipin bacak düzeni küçük çizimle gösterilir,
// "Taktım" ile işaretlenir ve sıradaki tele geçilir. Bloklar kurulum sırasıyla (deney sırası)
// listelenir; tel numaraları yazdırılan kurulum belgesiyle aynıdır.

import { useEffect, useMemo, useState } from "react";
import { cardTitle } from "../../cpu16/board/layout";
import type { CipYeri, KurulumPlani, Tel, Uc } from "../../cpu16/kurulum/plan";
import { KURULUM_KARTLARI, sahnedeVar, seciliTel, useKurulum } from "./kurulum";
import "./kurulum.css";

const sayi = (n: number) => n.toLocaleString("tr-TR");

/** DIP bacağının yeri: 1..n/2 alt sırada soldan sağa, gerisi üst sırada sağdan sola (çentik solda) */
export function bacakYeri(pin: number, pinSayisi: number): { sira: "alt" | "üst"; sol: number } {
  const yarim = pinSayisi / 2;
  return pin <= yarim ? { sira: "alt", sol: pin } : { sira: "üst", sol: pinSayisi - pin + 1 };
}

/** Küçük DIP çizimi: çentik solda, 1. pin sol altta; seçili bacak telin renginde */
function MiniDip({ cip, pin, renk }: { cip: CipYeri; pin: number; renk: string }) {
  const yarim = cip.pinSayisi / 2;
  const adim = 9;
  const w = yarim * adim + 8;
  const h = 34;
  const bacak = (n: number) => {
    const { sira, sol } = bacakYeri(n, cip.pinSayisi);
    return { x: 4 + (sol - 0.5) * adim, y: sira === "alt" ? h - 3 : 3 };
  };
  const p = bacak(pin);
  return (
    <svg className="kur-dip" viewBox={`0 0 ${w} ${h}`} width={w * 1.6} height={h * 1.6} role="img" aria-label={`${cip.ref}, ${pin}. bacak`}>
      <rect x={2} y={7} width={w - 4} height={h - 14} rx={2} className="kur-dip-govde" />
      <path d={`M2 ${h / 2 - 4} a4 4 0 0 1 0 8`} className="kur-dip-centik" />
      <circle cx={6.5} cy={h - 11} r={1.4} className="kur-dip-nokta" />
      {Array.from({ length: cip.pinSayisi }, (_, i) => {
        const b = bacak(i + 1);
        return <rect key={i} x={b.x - 2} y={b.y - 2} width={4} height={4} rx={0.6} className="kur-dip-bacak" />;
      })}
      <circle cx={p.x} cy={p.y} r={4.2} fill={renk} stroke="#fff" strokeWidth={1} />
      <text x={w / 2} y={h / 2 + 3} textAnchor="middle" className="kur-dip-yazi">{cip.deger}</text>
    </svg>
  );
}

function UcKarti({ uc, plan, renk, yon }: { uc: Uc; plan: KurulumPlani; renk: string; yon: string }) {
  const cip = plan.cipler.find((c) => c.ref === uc.ref);
  const pasif = cip ? null : plan.pasifler.find((p) => p.ref === uc.ref);
  const yer = cip ? bacakYeri(uc.pin, cip.pinSayisi) : null;
  return (
    <div className="kur-uc">
      <div className="kur-uc-yon">{yon}</div>
      <div className="kur-uc-ref">
        {uc.ref}
        <span className="kur-uc-deger">{cip?.deger ?? pasif?.part ?? ""}</span>
      </div>
      <div className="kur-uc-pin">
        {uc.pin}. bacak <b>{uc.ad}</b>
      </div>
      {yer && (
        <div className="kur-uc-yer">
          {yer.sira} sırada soldan {yer.sol}. · yer {cip!.hucre}
        </div>
      )}
      {pasif && <div className="kur-uc-yer">{pasif.baslik} · yer {pasif.hucre}</div>}
      {cip && <MiniDip cip={cip} pin={uc.pin} renk={renk} />}
    </div>
  );
}

function TelKarti({ tel, plan, takildi }: { tel: Tel; plan: KurulumPlani; takildi: boolean }) {
  const renk = tel.renk === "siyah" ? "#444" : tel.hex;
  return (
    <div className={`kur-tel ${takildi ? "takildi" : ""}`}>
      <div className="kur-tel-bas">
        <span className="kur-tel-id">{tel.id}</span>
        <span className="kur-renk" style={{ background: renk }} />
        <span className="kur-tel-renk">
          {tel.renk} tel · {tel.sinif}
        </span>
        {takildi && <span className="kur-rozet">takıldı</span>}
      </div>
      <div className="kur-tel-net">
        net <b>{tel.net}</b> · ≈ {tel.uzunluk >= 100 ? `${(tel.uzunluk / 10).toFixed(0)} cm` : `${Math.round(tel.uzunluk)} mm`} · {tel.blok}
      </div>
      <div className="kur-tel-uclar">
        <UcKarti uc={tel.from} plan={plan} renk={renk} yon="nereden" />
        <div className="kur-ok" aria-hidden>
          →
        </div>
        <UcKarti uc={tel.to} plan={plan} renk={renk} yon="nereye" />
      </div>
    </div>
  );
}

function BlokListesi({ plan }: { plan: KurulumPlani }) {
  const yapilan = useKurulum((s) => s.yapilan);
  const secili = useKurulum((s) => s.secili);
  const sec = useKurulum((s) => s.sec);
  const isaretle = useKurulum((s) => s.isaretle);
  const tel = useKurulum(seciliTel);
  const [acikBlok, setAcikBlok] = useState<string | null>(null);
  // odaktaki telin bloğu açık dursun (Taktım ile blok değişince liste de geçer)
  useEffect(() => setAcikBlok(tel?.blok ?? null), [tel?.blok]);
  const blokTelleri = useMemo(() => {
    const m = new Map<string, Tel[]>();
    for (const t of plan.teller) (m.get(t.blok) ?? m.set(t.blok, []).get(t.blok)!).push(t);
    return m;
  }, [plan]);
  return (
    <div className="kur-bloklar">
      {plan.bloklar
        .filter((b) => b.telSayisi > 0)
        .map((b) => {
          const teller = blokTelleri.get(b.ad) ?? [];
          const bitti = teller.filter((t) => yapilan.has(t.id)).length;
          const acik = acikBlok === b.ad;
          return (
            <section key={b.ad} className={`kur-blok ${acik ? "acik" : ""}`}>
              <button className="kur-blok-bas" onClick={() => setAcikBlok(acik ? null : b.ad)} aria-expanded={acik}>
                <span className="kur-blok-renk" style={{ background: b.renk }} />
                <span className="kur-blok-ad">
                  {b.sira}. {b.ad}
                  {b.deney !== undefined && <span className="kur-blok-deney">Deney {b.deney}</span>}
                </span>
                <span className="kur-blok-sayi">
                  {sayi(bitti)} / {sayi(teller.length)}
                </span>
                <span className="kur-mini-bar">
                  <span style={{ width: `${teller.length ? (100 * bitti) / teller.length : 0}%` }} />
                </span>
              </button>
              {acik && (
                <ol className="kur-liste">
                  {teller.map((t) => (
                    <li key={t.id} className={`${t.id === secili ? "secili" : ""} ${yapilan.has(t.id) ? "takildi" : ""}`}>
                      <input type="checkbox" checked={yapilan.has(t.id)} onChange={(e) => isaretle(t.id, e.target.checked)} aria-label={`${t.id} takıldı`} />
                      <button onClick={() => sec(t.id)}>
                        <span className="kur-li-id">{t.id}</span>
                        <span className="kur-renk kucuk" style={{ background: t.renk === "siyah" ? "#444" : t.hex }} title={t.renk} />
                        <span className="kur-li-uc">
                          {t.from.ref}-{t.from.pin} → {t.to.ref}-{t.to.pin}
                        </span>
                        <span className="kur-li-net">{t.net}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
    </div>
  );
}

/** İki adımlı silme: ilk basış sorar, birkaç saniye içinde ikinci basış siler */
function SifirlaDugmesi({ bos }: { bos: boolean }) {
  const sifirla = useKurulum((s) => s.sifirla);
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
      title="Bu kartın bütün işaretlerini sil"
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

export function KurulumPanel() {
  const s = useKurulum();
  const tel = useKurulum(seciliTel);
  const { plan, yapilan } = s;

  useEffect(() => {
    s.ac(true);
    return () => useKurulum.getState().ac(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // kısayollar: Enter / boşluk = taktım, ← → gez (yazı alanındayken değil)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const st = useKurulum.getState();
      const t = seciliTel(st);
      if (e.key === "Enter" && t) {
        e.preventDefault();
        st.isaretle(t.id, true);
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

  const toplam = plan?.teller.length ?? 0;
  const bitti = plan ? plan.teller.filter((t) => yapilan.has(t.id)).length : 0;
  const yuzde = toplam ? Math.floor((100 * bitti) / toplam) : 0;

  return (
    <div className="kur">
      <div className="kur-ust">
        <label className="kur-kart">
          <span>Kart</span>
          <select value={s.kart} onChange={(e) => void s.kartSec(e.target.value)}>
            {KURULUM_KARTLARI.map((k) => (
              <option key={k.kart} value={k.kart}>
                {cardTitle(k.kart)} · {k.yol}
              </option>
            ))}
          </select>
        </label>
        <label className="kur-izle" title="Kamera odaktaki telin iki ucunu çerçevelesin">
          <input type="checkbox" checked={s.izle} onChange={(e) => s.setIzle(e.target.checked)} /> Kamera teli izlesin
        </label>
      </div>

      {s.yukleniyor && <p className="kur-not">Kurulum planı hazırlanıyor…</p>}
      {s.hata && <p className="kur-not hata">{s.hata}</p>}

      {plan && (
        <>
          <div className="kur-ilerleme" aria-label={`${bitti} / ${toplam} tel takıldı`}>
            <div className="kur-bar">
              <span style={{ width: `${toplam ? (100 * bitti) / toplam : 0}%` }} />
            </div>
            <div className="kur-ilerleme-yazi">
              <b>{sayi(bitti)}</b> / {sayi(toplam)} tel takıldı · %{yuzde}
              <span className="kur-ilerleme-ek">
                {sayi(plan.cipler.length)} entegre · {sayi(plan.pasifler.length)} pasif · Deney {plan.deneyler.join(", ") || "-"}
              </span>
            </div>
          </div>

          {!sahnedeVar(s.kart) && <p className="kur-not">Bu kart 3D sahnedeki bilgisayarda yok; teller yalnız listede.</p>}

          {tel ? (
            <TelKarti tel={tel} plan={plan} takildi={yapilan.has(tel.id)} />
          ) : (
            <p className="kur-not">Bu kartın bütün telleri takıldı.</p>
          )}

          <div className="kur-dugmeler">
            <button onClick={() => s.git(-1)} title="Önceki tel (←)">
              ← Önceki
            </button>
            {tel && (
              <button className="primary" onClick={() => s.isaretle(tel.id)} title="Takıldı olarak işaretle ve sıradakine geç (Enter)">
                {yapilan.has(tel.id) ? "Takılmadı say" : "Taktım ✓"}
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
            Enter: taktım · ← →: gez. Numaralar yazdırılan kurulum belgesiyle aynı (<code>npm run cpu16 -- kurulum</code>). PCB'de aynı
            liste bip testi listesidir.
          </p>

          <BlokListesi plan={plan} />

          <div className="kur-alt">
            <SifirlaDugmesi bos={bitti === 0} />
          </div>
        </>
      )}
    </div>
  );
}
