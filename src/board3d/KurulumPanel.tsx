// Kurulum modu paneli: kartı tel tel kurarken yanında açık dursun. Odaktaki tel büyük yazılır
// (nereden, nereye, hangi bacak, hangi renk), iki çipin bacak düzeni küçük çizimle gösterilir,
// "Taktım" ile işaretlenir ve sıradaki tele geçilir. Bloklar kurulum sırasıyla (deney sırası)
// listelenir; tel numaraları yazdırılan kurulum belgesiyle aynıdır. Metinler seçili dilde (ceviri.ts);
// kart, blok ve renk adlarının İngilizcesi kurulum.ts ve cpu16/kurulum'da.

import { useEffect, useMemo, useState } from "react";
import { renkKodu, type CipYeri, type KurulumPlani, type Tel, type Uc } from "../../cpu16/kurulum/plan";
import { useDil, useT } from "../ui/ceviri";
import { gorunumHazir } from "./aktif";
import { BbKurulumPanel, SifirlaDugmesi } from "./BbKurulumPanel";
import { bacakYeri, bacakYeriYazisi, blokAdi, gorunenKartlar, kartAdi, pcbTelRengi, sahnedeVar, sayiYaz, seciliTel, useKurulum } from "./kurulum";
import { useKart } from "./store";
import "./kurulum.css";

/** Küçük DIP çizimi: çentik solda, 1. pin sol altta; seçili bacak telin renginde */
function MiniDip({ cip, pin, renk }: { cip: CipYeri; pin: number; renk: string }) {
  const t = useT();
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
    <svg className="kur-dip" viewBox={`0 0 ${w} ${h}`} width={w * 1.6} height={h * 1.6} role="img" aria-label={t(`${cip.ref}, ${pin}. bacak`, `${cip.ref}, pin ${pin}`)}>
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
  const t = useT();
  const dil = useDil();
  const cip = plan.cipler.find((c) => c.ref === uc.ref);
  const pasif = cip ? null : plan.pasifler.find((p) => p.ref === uc.ref);
  return (
    <div className="kur-uc">
      <div className="kur-uc-yon">{yon}</div>
      <div className="kur-uc-ref">
        {uc.ref}
        <span className="kur-uc-deger">{cip?.deger ?? pasif?.part ?? ""}</span>
      </div>
      <div className="kur-uc-pin">
        {t(`${uc.pin}. bacak`, `pin ${uc.pin}`)} <b>{uc.ad}</b>
      </div>
      {cip && <div className="kur-uc-yer">{bacakYeriYazisi(uc.pin, cip, dil)}</div>}
      {pasif && <div className="kur-uc-yer">{pasif.baslik} · {t("yer", "grid")} {pasif.hucre}</div>}
      {cip && <MiniDip cip={cip} pin={uc.pin} renk={renk} />}
    </div>
  );
}

function TelKarti({ tel, plan, takildi }: { tel: Tel; plan: KurulumPlani; takildi: boolean }) {
  const t = useT();
  const dil = useDil();
  const renk = tel.renk === "siyah" ? "#444" : tel.hex;
  return (
    <div className={`kur-tel ${takildi ? "takildi" : ""}`}>
      <div className="kur-tel-bas">
        <span className="kur-tel-id">{tel.id}</span>
        <span className="kur-renk" style={{ background: renk }} />
        <span className="kur-tel-renk">{pcbTelRengi(tel, dil)}</span>
        {takildi && <span className="kur-rozet">{t("takıldı", "placed")}</span>}
      </div>
      <div className="kur-tel-net">
        net <b>{tel.net}</b> · ≈ {tel.uzunluk >= 100 ? `${(tel.uzunluk / 10).toFixed(0)} cm` : `${Math.round(tel.uzunluk)} mm`} · {blokAdi(tel.blok, dil)}
      </div>
      <div className="kur-tel-uclar">
        <UcKarti uc={tel.from} plan={plan} renk={renk} yon={t("nereden", "from")} />
        <div className="kur-ok" aria-hidden>
          →
        </div>
        <UcKarti uc={tel.to} plan={plan} renk={renk} yon={t("nereye", "to")} />
      </div>
    </div>
  );
}

function BlokListesi({ plan }: { plan: KurulumPlani }) {
  const t = useT();
  const dil = useDil();
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
          const bitti = teller.filter((x) => yapilan.has(x.id)).length;
          const acik = acikBlok === b.ad;
          return (
            <section key={b.ad} className={`kur-blok ${acik ? "acik" : ""}`}>
              <button className="kur-blok-bas" onClick={() => setAcikBlok(acik ? null : b.ad)} aria-expanded={acik}>
                <span className="kur-blok-renk" style={{ background: b.renk }} />
                <span className="kur-blok-ad">
                  {b.sira}. {blokAdi(b.ad, dil)}
                  {b.deney !== undefined && <span className="kur-blok-deney">{t("Deney", "Experiment")} {b.deney}</span>}
                </span>
                <span className="kur-blok-sayi">
                  {sayiYaz(bitti, dil)} / {sayiYaz(teller.length, dil)}
                </span>
                <span className="kur-mini-bar">
                  <span style={{ width: `${teller.length ? (100 * bitti) / teller.length : 0}%` }} />
                </span>
              </button>
              {acik && (
                <ol className="kur-liste">
                  {teller.map((x) => (
                    <li key={x.id} className={`${x.id === secili ? "secili" : ""} ${yapilan.has(x.id) ? "takildi" : ""}`}>
                      <input type="checkbox" checked={yapilan.has(x.id)} onChange={(e) => isaretle(x.id, e.target.checked)} aria-label={t(`${x.id} takıldı`, `${x.id} placed`)} />
                      <button onClick={() => sec(x.id)}>
                        <span className="kur-li-id">{x.id}</span>
                        <span className="kur-renk kucuk" style={{ background: x.renk === "siyah" ? "#444" : x.hex }} title={t(x.renk, renkKodu(x.sinif).en.renk)} />
                        <span className="kur-li-uc">
                          {x.from.ref}-{x.from.pin} → {x.to.ref}-{x.to.pin}
                        </span>
                        <span className="kur-li-net">{x.net}</span>
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

/** Kurulum paneli: breadboard görünümündeyse breadboard telleri (delikten deliğe), değilse pinden pine teller */
export function KurulumPanel() {
  const t = useT();
  const gorunum = useKart((s) => s.gorunum);
  // bilgisayarın breadboard verisi ayrı parça: yüklenince panel açılır
  const yukleniyor = useKart((s) => s.gorunumYukleniyor);
  if (gorunum !== "breadboard") return <PinKurulumPanel />;
  return !yukleniyor && gorunumHazir() ? <BbKurulumPanel /> : <p className="kur-not">{t("Breadboard panoları yükleniyor…", "Loading the panels…")}</p>;
}

function PinKurulumPanel() {
  const t = useT();
  const dil = useDil();
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
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName) || el.closest(".vga-screen"))) return;
      const st = useKurulum.getState();
      const x = seciliTel(st);
      if (e.key === "Enter" && x) {
        e.preventDefault();
        st.isaretle(x.id, true);
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
  const bitti = plan ? plan.teller.filter((x) => yapilan.has(x.id)).length : 0;
  const yuzde = toplam ? Math.floor((100 * bitti) / toplam) : 0;
  const deneyler = plan?.deneyler.join(", ") || "-";

  return (
    <div className="kur">
      <div className="kur-ust">
        <label className="kur-kart">
          <span>{t("Kart", "Board")}</span>
          <select value={s.kart} onChange={(e) => void s.kartSec(e.target.value)}>
            {gorunenKartlar().map((k) => (
              <option key={k.kart} value={k.kart}>
                {kartAdi(k.kart, dil)} · {k.yol}
              </option>
            ))}
          </select>
        </label>
        <label className="kur-izle" title={t("Kamera odaktaki telin iki ucunu çerçevelesin", "Keep both ends of the current wire in view")}>
          <input type="checkbox" checked={s.izle} onChange={(e) => s.setIzle(e.target.checked)} /> {t("Kamera teli izlesin", "Camera follows the wire")}
        </label>
      </div>

      {s.yukleniyor && <p className="kur-not">{t("Kurulum planı hazırlanıyor…", "Preparing the build plan…")}</p>}
      {s.hata && <p className="kur-not hata">{s.hata}</p>}

      {plan && (
        <>
          <div className="kur-ilerleme" aria-label={t(`${bitti} / ${toplam} tel takıldı`, `${bitti} / ${toplam} wires placed`)}>
            <div className="kur-bar">
              <span style={{ width: `${toplam ? (100 * bitti) / toplam : 0}%` }} />
            </div>
            <div className="kur-ilerleme-yazi">
              <span>
                <b>{sayiYaz(bitti, dil)}</b> / {sayiYaz(toplam, dil)} {t(`tel takıldı · %${yuzde}`, `wires placed · ${yuzde}%`)}
              </span>
              <span className="kur-ilerleme-ek">
                {t(
                  `${sayiYaz(plan.cipler.length)} entegre · ${sayiYaz(plan.pasifler.length)} pasif · Deney ${deneyler}`,
                  `${sayiYaz(plan.cipler.length, "en")} chips · ${sayiYaz(plan.pasifler.length, "en")} passives${plan.deneyler.length ? ` · ${plan.deneyler.length > 1 ? "Experiments" : "Experiment"} ${deneyler}` : ""}`,
                )}
              </span>
            </div>
          </div>

          {!sahnedeVar(s.kart) && <p className="kur-not">{t("Bu kart 3D sahnedeki bilgisayarda yok; teller yalnız listede.", "This board is not in the 3D scene; its wires are only in the list.")}</p>}

          {tel ? (
            <TelKarti tel={tel} plan={plan} takildi={yapilan.has(tel.id)} />
          ) : (
            <p className="kur-not">{t("Bu kartın bütün telleri takıldı.", "Every wire on this board is placed.")}</p>
          )}

          <div className="kur-dugmeler">
            <button onClick={() => s.git(-1)} title={t("Önceki tel (←)", "Previous wire (←)")}>
              ← {t("Önceki", "Previous")}
            </button>
            {tel && (
              <button className="primary" onClick={() => s.isaretle(tel.id)} title={t("Takıldı olarak işaretle ve sıradakine geç (Enter)", "Mark as placed and go to the next wire (Enter)")}>
                {yapilan.has(tel.id) ? t("Takılmadı say", "Mark as not placed") : t("Taktım ✓", "Placed ✓")}
              </button>
            )}
            <button onClick={() => s.git(1)} title={t("Sonraki tel (→)", "Next wire (→)")}>
              {t("Sonraki", "Next")} →
            </button>
            <button onClick={() => s.git(1, true)} title={t("Takılmamış sıradaki tel", "Next wire not yet placed")}>
              {t("Sıradaki açık", "Next open")}
            </button>
          </div>
          <p className="kur-ipucu">
            {t("Enter: taktım · ← →: gez. Numaralar yazdırılan kurulum belgesiyle aynı", "Enter: placed · ← →: move. The numbers match the printed build guide")} (
            <code>npm run cpu16 -- kurulum{plan.kart === "hesap" ? " hesap" : ""}</code>).{" "}
            {t("PCB'de aynı liste bip testi listesidir.", "On a PCB, use the same list for the continuity (beep) test.")}
          </p>

          <BlokListesi plan={plan} />

          <div className="kur-alt">
            <SifirlaDugmesi bos={bitti === 0} sifirla={s.sifirla} baslik={t("Bu kartın bütün işaretlerini sil", "Clear all marks for this board")} />
          </div>
        </>
      )}
    </div>
  );
}
