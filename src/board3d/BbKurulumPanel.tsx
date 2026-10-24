// Breadboard kurulum paneli: odaktaki tel delikten deliğe büyük yazılır (hangi pano, hangi board, hangi
// delik, kaç mm, hangi renk; uçların şeridinde hangi bacaklar var), "Taktım" ile işaretlenir, sıradakine
// geçilir. Aşamalar kurulum sırasıyla; her aşamanın sonunda bir test. Bilgisayarda pano (kart) ve aşama
// seçilir. Numaralar yazdırılan breadboard belgesiyle aynı. Metinler seçili dilde (ceviri.ts); pano,
// aşama ve renk adlarının İngilizcesi bbKurulum.ts'te.

import { useEffect, useMemo, useState } from "react";
import { satirHarfi, satirRayi } from "../../cpu16/board/breadboard/geometri";
import { noktaBoardu, renkAdi, ucEtiketi, type BbTel } from "../../cpu16/board/breadboard/plan";
import { useDil, useT } from "../ui/ceviri";
import { bbSahnesi, type BbPanosu } from "./aktif";
import { asamaMetni, bbGezilenTeller, bbPano, bbPencere, bbSeciliTel, bbTakilanSayisi, panoAdlari, telKimligi, telRengiYazisi, ucunKomsulari, useBbKurulum } from "./bbKurulum";
import { asamaDilimleri, sayiYaz, type AsamaDilimi } from "./kurulum";
import "./kurulum.css";

const renkHex = (p: BbPanosu, t: BbTel) => (t.renk === "siyah" ? "#444" : p.renk(t.renk).hex);
const mm = (x: number) => `${Math.round(x)} mm`;
/** aşamanın sonundaki test (bilgisayarın panolarında) */
const asamaTesti = (a: object): string | undefined => (a as { test?: string }).test;

/**
 * Tel ucunun delik haritası (bbPencere): çevredeki birkaç sütun, ucun yarısı. Ucun deliği telin renginde,
 * aynı şeritteki (ya da raydaki) delikler vurgulu: oraya takılan bacaklar bu uçla birleşir.
 */
function DelikHaritasi({ r, c, renk, etiket }: { r: number; c: number; renk: string; etiket: string }) {
  const { r0, r1, c0, c1, delikler } = bbPencere(r, c);
  const A = 11;
  const sol = 16;
  const ust = 14;
  const x = (cc: number) => sol + (cc - c0 + 0.5) * A;
  const y = (rr: number) => ust + (rr - r0 + 0.5) * A;
  const satirlar = Array.from({ length: r1 - r0 + 1 }, (_, i) => r0 + i);
  return (
    <svg className="kur-delik" viewBox={`0 0 ${sol + (c1 - c0 + 1) * A + 4} ${ust + (r1 - r0 + 1) * A + 2}`} role="img" aria-label={etiket}>
      {satirlar.map((rr) => {
        const h = satirHarfi(rr);
        const ray = satirRayi(rr);
        const ad = h ?? (ray ? (ray.endsWith("+") ? "+" : "−") : "");
        return ad ? <text key={rr} x={sol - 5} y={y(rr) + 3} textAnchor="end" className={`kur-delik-yazi${ray ? (ray.endsWith("+") ? " arti" : " eksi") : ""}`}>{ad}</text> : null;
      })}
      {[c0, c, c1].filter((v, i, a) => a.indexOf(v) === i).map((cc) => (
        <text key={cc} x={x(cc)} y={ust - 4} textAnchor="middle" className={`kur-delik-yazi${cc === c ? " hedef" : ""}`}>{cc}</text>
      ))}
      {delikler.map((d) => (
        <rect
          key={`${d.r},${d.c}`}
          x={x(d.c) - (d.hedef ? 4 : 2.6)}
          y={y(d.r) - (d.hedef ? 4 : 2.6)}
          width={d.hedef ? 8 : 5.2}
          height={d.hedef ? 8 : 5.2}
          rx={d.hedef ? 2 : 1}
          className={d.hedef ? "kur-delik-hedef" : d.bagli ? "kur-delik-bagli" : "kur-delik-bos"}
          style={d.hedef ? { fill: renk } : undefined}
        />
      ))}
    </svg>
  );
}

function Uc({ p, t, son }: { p: BbPanosu; t: BbTel; son: boolean }) {
  const tr = useT();
  const dil = useDil();
  const n = t.yol.length;
  const [X, Y] = son ? [t.yol[n - 2], t.yol[n - 1]] : [t.yol[0], t.yol[1]];
  const [board, delik] = ucEtiketi(p.plan.yerlesim, X, Y, dil).split(" ");
  const { kisa } = panoAdlari(p, dil);
  const b = p.plan.yerlesim.boards[noktaBoardu(p.plan.yerlesim, X, Y)];
  return (
    <div className="kur-uc">
      <div className="kur-uc-yon">{son ? tr("nereye", "to") : tr("nereden", "from")}</div>
      <div className="kur-uc-ref">
        {kisa ? `${kisa} · ` : ""}
        {board} <span className="kur-uc-deger">{delik}</span>
      </div>
      <div className="kur-uc-yer">{ucunKomsulari(p.plan, X, Y, dil)}</div>
      <DelikHaritasi r={Y - b.y0} c={X - b.x0} renk={renkHex(p, t)} etiket={tr(`${board} panosunda ${delik} deliği ve aynı şeritteki delikler`, `Hole ${delik} on ${board} and the holes on the same strip`)} />
    </div>
  );
}

/**
 * Aşama haritası: kurulumun blokları ya da aşamaları tek şeritte, dilimin eni tel sayısıyla orantılı,
 * dolgusu takılan teller. Odaktaki telin dilimi çerçeveli; tıklanınca dilimin ilk açık teline gidilir.
 */
export function AsamaHaritasi<K, T>({ dilimler, aktif, ad, sec }: { dilimler: AsamaDilimi<K, T>[]; aktif: K | undefined; ad: (k: K) => string; sec: (t: T) => void }) {
  const tr = useT();
  const dil = useDil();
  const i = dilimler.findIndex((d) => d.anahtar === aktif);
  const simdiki = dilimler[i];
  return (
    <div className="kur-harita">
      <div className="kur-harita-serit" role="list" aria-label={tr("Kurulumun aşamaları", "Build stages")}>
        {dilimler.map((d, j) => {
          const yazi = `${ad(d.anahtar)}: ${sayiYaz(d.bitti, dil)} / ${sayiYaz(d.toplam, dil)}`;
          return (
            <button
              key={j}
              role="listitem"
              className={`kur-harita-dilim${j === i ? " aktif" : ""}${d.bitti === d.toplam ? " bitti" : ""}`}
              style={{ flexGrow: d.toplam }}
              onClick={() => sec(d.hedef)}
              title={yazi}
              aria-label={yazi}
            >
              <span style={{ width: `${(100 * d.bitti) / d.toplam}%` }} />
            </button>
          );
        })}
      </div>
      {simdiki && (
        <div className="kur-harita-yazi">
          <span>
            {tr("Şu an", "Now")} <b>{ad(simdiki.anahtar)}</b>
          </span>
          <span>
            {tr(`${i + 1}. / ${dilimler.length} aşama`, `stage ${i + 1} of ${dilimler.length}`)} · {sayiYaz(simdiki.bitti, dil)} / {sayiYaz(simdiki.toplam, dil)}
          </span>
        </div>
      )}
    </div>
  );
}

/** Bir telin kartı: kimlik, renk, boy, net, aşama, nereden → nereye (kurulum panelinde ve İnceleme'de seçili tel) */
export function TelKarti({ p, t, takildi }: { p: BbPanosu; t: BbTel; takildi: boolean }) {
  const tr = useT();
  const dil = useDil();
  const asama = p.plan.asamalar.find((a) => a.no === t.asama);
  const asamaAdi = asama ? `: ${asamaMetni(asama.ad, dil)}` : "";
  return (
    <div className={`kur-tel ${takildi ? "takildi" : ""}`}>
      <div className="kur-tel-bas">
        <span className="kur-tel-id">{telKimligi(t.no)}</span>
        <span className="kur-renk" style={{ background: renkHex(p, t) }} />
        <span className="kur-tel-renk">{telRengiYazisi(p, t, dil)}</span>
        {takildi && <span className="kur-rozet">{tr("takıldı", "placed")}</span>}
      </div>
      <div className="kur-tel-net">
        {tr("delikten deliğe", "hole to hole")} <b>{mm(t.uzunluk)}</b> · {tr("kes", "cut")} <b>{mm(t.kesim)}</b> · net <b>{t.ad}</b> ·{" "}
        {tr(`${t.asama}. aşama${asamaAdi}`, `stage ${t.asama}${asamaAdi}`)}
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
  const tr = useT();
  const dil = useDil();
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
                {a.no}. {asamaMetni(a.ad, dil)}
              </span>
              <span className="kur-blok-sayi">
                {sayiYaz(bitti, dil)} / {sayiYaz(teller.length, dil)}
              </span>
              <span className="kur-mini-bar">
                <span style={{ width: `${teller.length ? (100 * bitti) / teller.length : 0}%` }} />
              </span>
            </button>
            {ac && test && (
              <p className="kur-ipucu">
                {tr("Aşamanın sonunda:", "At the end of this stage:")} {asamaMetni(test, dil)}
              </p>
            )}
            {ac && (
              <ol className="kur-liste">
                {teller.map((t) => {
                  const n = t.yol.length;
                  return (
                    <li key={t.no} className={`${t.no === secili ? "secili" : ""} ${yapilan.has(t.no) ? "takildi" : ""}`}>
                      <input type="checkbox" checked={yapilan.has(t.no)} onChange={(e) => isaretle(t.no, e.target.checked)} aria-label={tr(`${telKimligi(t.no)} takıldı`, `${telKimligi(t.no)} placed`)} />
                      <button onClick={() => sec(t.no)}>
                        <span className="kur-li-id">{telKimligi(t.no)}</span>
                        <span className="kur-renk kucuk" style={{ background: renkHex(p, t) }} title={tr(p.renk(t.renk).ad, renkAdi(t.renk, "en"))} />
                        <span className="kur-li-uc">
                          {ucEtiketi(p.plan.yerlesim, t.yol[0], t.yol[1], dil)} → {ucEtiketi(p.plan.yerlesim, t.yol[n - 2], t.yol[n - 1], dil)}
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

/** İki adımlı silme: ilk basış sorar, birkaç saniye içinde ikinci basış siler (PCB paneli de kullanır) */
export function SifirlaDugmesi({ bos, sifirla, baslik }: { bos: boolean; sifirla: () => void; baslik: string }) {
  const tr = useT();
  const [soruyor, setSoruyor] = useState(false);
  useEffect(() => {
    if (!soruyor) return;
    const z = setTimeout(() => setSoruyor(false), 4000);
    return () => clearTimeout(z);
  }, [soruyor]);
  return (
    <button
      className={`kur-sifirla ${soruyor ? "soruyor" : ""}`}
      disabled={bos}
      title={baslik}
      onClick={() => {
        if (!soruyor) return setSoruyor(true);
        setSoruyor(false);
        sifirla();
      }}
    >
      {soruyor ? tr("Emin misin? Bütün işaretler silinecek", "Are you sure? All marks will be cleared") : tr("İşaretleri sil", "Clear marks")}
    </button>
  );
}

/** Bilgisayarda pano ve aşama seçimi; hesap makinesinde tek pano */
function PanoSecimi({ p }: { p: BbPanosu }) {
  const tr = useT();
  const dil = useDil();
  const sahne = bbSahnesi();
  const asama = useBbKurulum((s) => s.asama);
  const yapilan = useBbKurulum((s) => s.yapilan.size);
  const st = useBbKurulum.getState();
  if (sahne.panolar.length === 1) {
    const b = p.plan.yerlesim.boards.length;
    return (
      <span className="kur-kart">
        <span>{tr("Breadboard", "Panel")}</span>
        <b>
          {tr(`${b} board · ${sayiYaz(p.plan.teller.length)} atlama teli`, `${b} breadboards · ${sayiYaz(p.plan.teller.length, "en")} jumper wires`)}
        </b>
      </span>
    );
  }
  return (
    <>
      <label className="kur-kart">
        <span>{tr("Pano", "Panel")}</span>
        <select value={p.kart} onChange={(e) => st.panoSec(e.target.value)}>
          {sahne.panolar.map((x) => {
            const b = x.plan.yerlesim.boards.length;
            const n = sayiYaz(x.plan.teller.length, dil);
            // ilerleme: seçili pano durumdan, öbürleri tarayıcıdaki kayıttan
            const takilan = x.kart === p.kart ? yapilan : bbTakilanSayisi(x.kart);
            const ilerleme = takilan === 0 ? "" : takilan === x.plan.teller.length ? " · ✓" : ` · ${sayiYaz(takilan, dil)} ${tr("takıldı", "placed")}`;
            return (
              <option key={x.kart} value={x.kart}>
                {panoAdlari(x, dil).baslik} · {tr(`${b} board · ${n} tel`, `${b} breadboards · ${n} wires`)}
                {ilerleme}
              </option>
            );
          })}
        </select>
      </label>
      <label className="kur-kart">
        <span>{tr("Aşama", "Stage")}</span>
        <select value={asama ?? ""} onChange={(e) => st.asamaSec(e.target.value === "" ? null : +e.target.value)}>
          <option value="">{tr("Bütün aşamalar", "All stages")}</option>
          {p.plan.asamalar.map((a) => (
            <option key={a.no} value={a.no}>
              {a.no}. {asamaMetni(a.ad, dil)}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function BbKurulumPanel() {
  const tr = useT();
  const dil = useDil();
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
  const yuzde = toplam ? Math.floor((100 * bitti) / toplam) : 0;
  const asama = s.asama === null ? null : p.plan.asamalar.find((a) => a.no === s.asama);
  const asamaSayisi = p.plan.asamalar.length;
  const dilimler = useMemo(() => asamaDilimleri(p.plan.teller, (x) => x.asama, (x) => x.no, s.yapilan), [p, s.yapilan]);
  const asamaAdi = (no: number) => {
    const a = p.plan.asamalar.find((x) => x.no === no);
    return a ? `${no}. ${asamaMetni(a.ad, dil)}` : `${no}`;
  };
  return (
    <div className="kur">
      <div className="kur-ust">
        <PanoSecimi p={p} />
        <label className="kur-izle" title={tr("Kamera odaktaki telin iki ucunu çerçevelesin", "Keep both ends of the current wire in view")}>
          <input type="checkbox" checked={s.izle} onChange={(e) => s.setIzle(e.target.checked)} /> {tr("Kamera teli izlesin", "Camera follows the wire")}
        </label>
      </div>
      <div className="kur-ilerleme" aria-label={tr(`${bitti} / ${toplam} tel takıldı`, `${bitti} / ${toplam} wires placed`)}>
        <div className="kur-bar">
          <span style={{ width: `${toplam ? (100 * bitti) / toplam : 0}%` }} />
        </div>
        <div className="kur-ilerleme-yazi">
          <span>
            <b>{sayiYaz(bitti, dil)}</b> / {sayiYaz(toplam, dil)} {tr(`tel takıldı · %${yuzde}`, `wires placed · ${yuzde}%`)}
          </span>
          <span className="kur-ilerleme-ek">
            {asama
              ? tr(`${asama.no}. aşama`, `stage ${asama.no}`)
              : tr(`${asamaSayisi} aşama · her aşamanın sonunda test`, `${asamaSayisi} stages · a test at the end of each`)}
          </span>
        </div>
      </div>
      <AsamaHaritasi
        dilimler={dilimler}
        aktif={tel?.asama}
        ad={asamaAdi}
        sec={(x) => {
          // aşama süzgeci başka bir aşamadaysa kaldır: seçilen tel gezilen listede olsun
          if (s.asama !== null && s.asama !== x.asama) s.asamaSec(null);
          s.sec(x.no);
        }}
      />
      {tel ? <TelKarti p={p} t={tel} takildi={s.yapilan.has(tel.no)} /> : <p className="kur-not">{tr("Bütün teller takıldı.", "Every wire is placed.")}</p>}
      <div className="kur-dugmeler">
        <button onClick={() => s.git(-1)} title={tr("Önceki tel (←)", "Previous wire (←)")}>
          ← {tr("Önceki", "Previous")}
        </button>
        {tel && (
          <button className="primary" onClick={() => s.isaretle(tel.no)} title={tr("Takıldı olarak işaretle ve sıradakine geç (Enter)", "Mark as placed and go to the next wire (Enter)")}>
            {s.yapilan.has(tel.no) ? tr("Takılmadı say", "Mark as not placed") : tr("Taktım ✓", "Placed ✓")}
          </button>
        )}
        <button onClick={() => s.git(1)} title={tr("Sonraki tel (→)", "Next wire (→)")}>
          {tr("Sonraki", "Next")} →
        </button>
        <button onClick={() => s.git(1, true)} title={tr("Takılmamış sıradaki tel", "Next wire not yet placed")}>
          {tr("Sıradaki açık", "Next open")}
        </button>
      </div>
      <AsamaListesi p={p} />
      <p className="kur-ipucu">
        {tr(
          "Enter: taktım · ← →: gez. Delikler: board adı (BB01 panonun sol arka köşesi) ve delik (a–j satırı + sütun; raylar üst+/üst−/alt−/alt+). Haritada ucun deliği telin renginde, aynı şeritteki delikler vurgulu. İşaretler bu tarayıcıda saklanır. Numaralar yazdırılan belgeyle aynı",
          "Enter: placed · ← →: move. Holes: breadboard name (BB01 is the back left corner of the panel) and hole (row a–j + column; rails top+/top−/bottom−/bottom+, written üst/alt in the printed guide). On the map the end's hole is in the wire's colour and the holes on the same strip are highlighted. Marks are saved in this browser. The numbers match the printed guide",
        )}{" "}
        (<code>{bbSahnesi().belgeKomutu}</code>).
      </p>
      <div className="kur-alt">
        <SifirlaDugmesi bos={s.yapilan.size === 0} sifirla={s.sifirla} baslik={tr(`${p.baslik}: bütün işaretleri sil`, `${panoAdlari(p, "en").baslik}: clear all marks`)} />
      </div>
    </div>
  );
}
