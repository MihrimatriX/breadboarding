// Seçilen pasif elemanın bilgi paneli: değerinin okunuşu (renk bantları, "104", "A103J"), çizimi,
// bu karttaki görevi, hesapları (LED akımı, çekme akımı, RC), canlı durumu ve bacakları. Metinler
// pasif-analiz.ts'ten, çizimler rehberle aynı kütüphaneden (cpu16/kit/cizim.ts; temaya göre koyu ya da
// açık palet, zemin saydam); hepsi seçili dilde.

import { useId, useMemo } from "react";
import type { PassivePlace } from "../../cpu16/board/layout";
import { LED_RENKLERI, PASSIVES } from "../../cpu16/board/passives";
import { pasifDegeri } from "../../cpu16/board/pasif-bilgi";
import {
  ACIK, KOYU, cekmeCizimi, dekuplajCizimi, diziCizimi, direncCizimi, elektrolitikCizimi, ledCizimi, ledDevreCizimi, osilatorCizimi, seramikCizimi,
  svgBelge, type Palet, type Parca,
} from "../../cpu16/kit/cizim";
import { useAyar } from "../ui/ayarlar";
import { useDil, useT, type Cevir, type Dil } from "../ui/ceviri";
import { levelOf } from "./levels";
import {
  cekmeDirenci, etkinNet, ledDevresi, ledYanik, netAlici, netDriver, pasifAciklamasi, seriLed, type PasifBaglam,
} from "./pasif-analiz";
import { boardModel, findPart, liveNets, netEnds, useKart } from "./store";
import "./PassiveInfo.css";

const seviyeler = (t: Cevir) => [t("0 düşük", "0 low"), t("1 yüksek", "1 high"), t("Z boşta", "Z floating"), t("X belirsiz", "X unknown")];
/** Panelin zemini saydam: açık temada rehberin açık paleti zeminsiz */
const ACIK_PANEL: Palet = { ...ACIK, zemin: null };
const uc = (e: { kind: string; ref: string; name: string; num: number }) => (e.kind === "chip" ? `${e.ref}.${e.name}` : `${e.ref}.${e.num}`);

function useBaglam(): PasifBaglam {
  const rate = useKart((s) => s.rate);
  const { board } = boardModel();
  return useMemo(
    () => ({ ends: netEnds(), find: findPart, netName: (n: number) => board.netName(n), level: (n: number) => levelOf(liveNets.values, n), hz: rate }),
    [board, rate],
  );
}

/** Bacağın görevi: LED'de anot/katot, elektrolitikte +/−, dizide ortak uç, çubukta segmentin anodu/katodu */
function bacakAdi(p: PassivePlace, num: number, ad: string, t: Cevir): string {
  if (p.kind === "led") return num === 1 ? t("anot (+)", "anode (+)") : t("katot (−)", "cathode (−)");
  if (p.kind === "cubuk") return num <= 10 ? t(`${num}. segment anodu`, `segment ${num} anode`) : t(`${21 - num}. segment katodu`, `segment ${21 - num} cathode`);
  if (p.kind === "elektrolitik") return num === 1 ? t("+ (uzun)", "+ (long)") : t("− (şerit)", "− (stripe)");
  if (p.kind === "dizi") return num === 1 ? t("ortak (COM)", "common (COM)") : `R${num - 1}`;
  const n = PASSIVES[p.part]?.pins.find((q) => q.num === num)?.name ?? ad;
  return n === String(num) ? "" : n;
}

/** Elemanın türüne göre çizimler (temanın paletiyle, seçili dilde) */
function cizimler(p: PassivePlace, ctx: PasifBaglam, id: string, palet: Palet, t: Cevir, dil: Dil): { baslik: string; parca: Parca }[] {
  const d = pasifDegeri(p.part);
  const out: { baslik: string; parca: Parca }[] = [];
  const ledDevre = (led: PassivePlace) => {
    const c = ledDevresi(led, ctx);
    if (!c.direnc || !c.ohm) return;
    const drv = netDriver(ctx, c.sinyal);
    out.push({
      baslik: t("Devre", "Circuit"),
      parca: ledDevreCizimi({
        surucu: drv ? uc(drv) : ctx.netName(c.sinyal), sinyal: ctx.netName(c.sinyal), direnc: c.direnc.ref, ohm: c.ohm, led: led.ref, renk: c.renk,
        seviye: ctx.level(c.sinyal), aktifDusuk: c.aktifDusuk,
      }, palet, dil),
    });
  };
  if (p.kind === "led") {
    const c = ledDevresi(p, ctx);
    out.push({ baslik: t("Anatomi", "Anatomy"), parca: ledCizimi(c.renk, palet, { id, yanik: ledYanik(c, ctx.level) }, dil) });
    ledDevre(p);
  } else if (d?.tur === "direnc") {
    out.push({ baslik: t("Renk bantları", "Color bands"), parca: direncCizimi(d.ohm, d.tolerans, palet, { id, etiket: true }, dil) });
    const led = seriLed(p, ctx);
    const c = cekmeDirenci(p);
    if (led) ledDevre(led);
    else if (c) {
      const hat = c.hatlar[0];
      const al = netAlici(ctx, hat);
      out.push({ baslik: t("Devre", "Circuit"), parca: cekmeCizimi({ yon: c.yon, ohm: c.ohm, ref: p.ref, hat: ctx.netName(hat), alici: al ? uc(al) : undefined, seviye: ctx.level(hat) }, palet, dil) });
    }
  } else if (d?.tur === "dizi") {
    const com = p.pins.find((q) => q.num === 1)?.net ?? -1;
    out.push({ baslik: t("Dışı ve içi", "Outside and inside"), parca: diziCizimi(d.kod, p.pins.length, palet, { ortak: `COM → ${com >= 0 ? ctx.netName(com) : "?"}`, ohm: d.ohm }, dil) });
    const c = cekmeDirenci(p);
    if (c) {
      const hat = t(`${c.hatlar.length} hat`, `${c.hatlar.length} lines`);
      const surucu = c.yon === "yukari" ? t("çıkış: 0'a sürer", "output: drives 0") : t("çıkış: 1'e sürer", "output: drives 1");
      out.push({ baslik: t("Her hat için", "For each line"), parca: cekmeCizimi({ yon: c.yon, ohm: c.ohm, ref: `${p.ref} (${hat})`, hat, surucu }, palet, dil) });
    }
  } else if (d?.tur === "seramik") {
    out.push({ baslik: t("Kodun okunuşu", "Reading the code"), parca: seramikCizimi(d.kod, palet, dil) });
    const ci = p.chip ? ctx.find(p.chip)?.chip : undefined;
    if (ci) {
      const pin = (re: RegExp, net: number) => ci.pins.find((q) => q.net === net && re.test(q.name))?.num ?? 0;
      out.push({ baslik: t("Dekuplaj", "Decoupling"), parca: dekuplajCizimi({ cip: ci.ref, part: ci.part, pinSayisi: ci.pins.length, vcc: pin(/VCC|VDD/, 1), gnd: pin(/GND|VSS/, 0), ref: p.ref, kod: d.kod }, palet, dil) });
    }
  } else if (d?.tur === "elektrolitik") {
    out.push({ baslik: t("Kutup", "Polarity"), parca: elektrolitikCizimi(`${Math.round(d.farad * 1e6)}µF`, d.volt, palet, dil) });
  } else if (d?.tur === "osilator") {
    out.push({ baslik: t("Üstten", "From above"), parca: osilatorCizimi(d.hz ? (d.hz / 1e6).toFixed(3) : "8.000", palet, dil) });
  }
  return out;
}

function Cizim({ baslik, parca, palet }: { baslik: string; parca: Parca; palet: Palet }) {
  // aynı metin aynı kalır: React yalnız değişince DOM'a yazar (canlı seviye değişince)
  const html = useMemo(() => svgBelge(parca, palet, baslik), [parca.g, parca.w, parca.h, baslik, palet]);
  return (
    <figure className="pi-cizim">
      <figcaption>{baslik}</figcaption>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </figure>
  );
}

export function PassiveInfo({ p }: { p: PassivePlace }) {
  useKart((s) => s.tick);
  const ctx = useBaglam();
  const rid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const palet = useAyar((s) => (s.tema === "acik" ? ACIK_PANEL : KOYU));
  const t = useT();
  const dil = useDil();
  const SEVIYE = seviyeler(t);
  const a = pasifAciklamasi(p, ctx, dil);
  const ciz = cizimler(p, ctx, `pi${rid}`, palet, t, dil);
  const led = p.kind === "led" || p.kind === "cubuk" ? LED_RENKLERI[p.led ?? "kirmizi"] : null;
  const select = useKart.getState();
  return (
    <div className="pasif-info">
      <div className="pi-kimlik">
        {led && <i className="pi-led" style={{ background: led.isik, boxShadow: `0 0 10px ${led.isik}` }} />}
        <div>
          <div className="pi-tur">{a.tur}</div>
          {a.deger && <div className="pi-deger">{a.deger}</div>}
        </div>
      </div>
      {a.durum && <div className={`pi-durum pi-${a.durum.ton}`}>{a.durum.metin}</div>}
      {ciz.slice(0, 1).map((c) => <Cizim key={c.baslik} {...c} palet={palet} />)}
      <h3 className="pi-baslik">{t("Bu kartta görevi", "Its job on this board")}</h3>
      {a.gorev.map((g, i) => <p key={i} className="pi-metin">{g}</p>)}
      {ciz.slice(1).map((c) => <Cizim key={c.baslik} {...c} palet={palet} />)}
      {a.hesaplar.length > 0 && (
        <>
          <h3 className="pi-baslik">{t("Hesap", "Calculation")}</h3>
          <table className="pi-hesap">
            <tbody>
              {a.hesaplar.map((h, i) => (
                <tr key={i}>
                  <th>{h.ad}</th>
                  <td>
                    <code>{h.formul}</code>
                    <b>{h.sonuc}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <h3 className="pi-baslik">{t("Bacaklar (canlı)", "Pins (live)")}</h3>
      <ul className="pi-bacaklar">
        {p.pins.map((q) => {
          const ends = (ctx.ends.get(q.net) ?? []).filter((e) => e.ref !== p.ref);
          const cips = ends.filter((e) => e.kind === "chip");
          const ef = q.net >= 0 ? etkinNet(ctx.ends, ctx.find, q.net) : -1;
          const lv = q.net < 0 ? 2 : ctx.level(q.net);
          const elv = ef !== q.net && ef >= 0 ? ctx.level(ef) : null;
          return (
            <li key={q.num}>
              <span className="pi-no">{q.num}</span>
              {bacakAdi(p, q.num, q.name, t) && <span className="pi-ad">{bacakAdi(p, q.num, q.name, t)}</span>}
              {q.net < 0 ? (
                <span className="pi-soluk">{t("bağlı değil", "not connected")}</span>
              ) : (
                <button className="pi-net" onClick={() => select.selectNet(q.net > 1 ? q.net : null)} title={t("Neti seç", "Select net")}>
                  {ctx.netName(q.net)}
                </button>
              )}
              <b
                className={`pi-lv pi-l${elv ?? lv}`}
                title={elv !== null
                  ? t(`${ctx.netName(ef)} üzerinden: simülasyon dirençleri bilmez, bu net kendi başına ${SEVIYE[lv]}`, `Through ${ctx.netName(ef)}: the simulation does not model resistors; on its own this net is ${SEVIYE[lv]}`)
                  : undefined}
              >
                {SEVIYE[elv ?? lv]}
                {elv !== null && <small> ({t(`${ctx.netName(ef)} üzerinden`, `through ${ctx.netName(ef)}`)})</small>}
              </b>
              {q.net >= 0 && q.net <= 1 && <span className="pi-soluk">{t("besleme rayı", "power rail")}</span>}
              {q.net > 1 && cips.length > 0 && (
                <span className="pi-uclar">
                  {cips.slice(0, 4).map((e, i) => (
                    <button key={i} onClick={() => select.selectChip(e.ref)} title={t(`${e.part} · ${e.card} kartı`, `${e.part} · ${e.card} board`)}>{uc(e)}</button>
                  ))}
                  {cips.length > 4 && <span className="pi-soluk">+{cips.length - 4}</span>}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {a.ilgili.length > 0 && (
        <div className="pi-ilgili">
          <span className="pi-soluk">{t("İlgili:", "Related:")}</span>
          {a.ilgili.map((x) => (
            <button key={x.ref} onClick={() => select.selectChip(x.ref)}>
              {x.ref} <span>{x.neden}</span>
            </button>
          ))}
        </div>
      )}
      <p className="pi-rehber">
        {t("Rehber", "Guide")}: <code>{t("cpu16/kit/led-ve-direnc.md", "cpu16/kit/led-ve-direnc.en.md")}</code>{" "}
        {t("(renk kodu, LED, çekme direnci, dekuplaj, breadboard)", "(color code, LEDs, pull-up resistors, decoupling, breadboard)")}
      </p>
    </div>
  );
}

/** Üstüne gelince ipucu: tek satır özet */
export function PassiveTooltip({ p }: { p: PassivePlace }) {
  const ctx = useBaglam();
  const a = pasifAciklamasi(p, ctx, useDil());
  const led = p.kind === "led" || p.kind === "cubuk" ? LED_RENKLERI[p.led ?? "kirmizi"] : null;
  return (
    <span className="pi-ipucu">
      {led && <i className="pi-led pi-led-k" style={{ background: led.isik }} />}
      {a.ozet}
    </span>
  );
}
