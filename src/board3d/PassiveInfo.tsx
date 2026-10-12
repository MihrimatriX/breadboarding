// Seçilen pasif elemanın bilgi paneli: değerinin okunuşu (renk bantları, "104", "A103J"), çizimi,
// bu karttaki görevi, hesapları (LED akımı, çekme akımı, RC), canlı durumu ve bacakları. Metinler
// pasif-analiz.ts'ten, çizimler rehberle aynı kütüphaneden (cpu16/kit/cizim.ts; temaya göre koyu ya da
// açık palet, zemin saydam).

import { useId, useMemo } from "react";
import type { PassivePlace } from "../../cpu16/board/layout";
import { LED_RENKLERI, PASSIVES } from "../../cpu16/board/passives";
import { pasifDegeri } from "../../cpu16/board/pasif-bilgi";
import {
  ACIK, KOYU, cekmeCizimi, dekuplajCizimi, diziCizimi, direncCizimi, elektrolitikCizimi, ledCizimi, ledDevreCizimi, osilatorCizimi, seramikCizimi,
  svgBelge, type Palet, type Parca,
} from "../../cpu16/kit/cizim";
import { useAyar } from "../ui/ayarlar";
import { levelOf } from "./levels";
import {
  cekmeDirenci, etkinNet, ledDevresi, netAlici, netDriver, pasifAciklamasi, seriLed, type PasifBaglam,
} from "./pasif-analiz";
import { boardModel, findPart, liveNets, netEnds, useKart } from "./store";
import "./PassiveInfo.css";

const SEVIYE = ["0 düşük", "1 yüksek", "Z boşta", "X belirsiz"];
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

/** Bacağın görevi: LED'de anot/katot, elektrolitikte +/−, dizide ortak uç */
function bacakAdi(p: PassivePlace, num: number, ad: string): string {
  if (p.kind === "led") return num === 1 ? "anot (+)" : "katot (−)";
  if (p.kind === "elektrolitik") return num === 1 ? "+ (uzun)" : "− (şerit)";
  if (p.kind === "dizi") return num === 1 ? "ortak (COM)" : `R${num - 1}`;
  const n = PASSIVES[p.part]?.pins.find((q) => q.num === num)?.name ?? ad;
  return n === String(num) ? "" : n;
}

/** Elemanın türüne göre çizimler (temanın paletiyle) */
function cizimler(p: PassivePlace, ctx: PasifBaglam, id: string, palet: Palet): { baslik: string; parca: Parca }[] {
  const d = pasifDegeri(p.part);
  const out: { baslik: string; parca: Parca }[] = [];
  const ledDevre = (led: PassivePlace) => {
    const c = ledDevresi(led, ctx);
    if (!c.direnc || !c.ohm) return;
    const drv = netDriver(ctx, c.sinyal);
    out.push({
      baslik: "Devre",
      parca: ledDevreCizimi({
        surucu: drv ? uc(drv) : ctx.netName(c.sinyal), sinyal: ctx.netName(c.sinyal), direnc: c.direnc.ref, ohm: c.ohm, led: led.ref, renk: c.renk,
        seviye: ctx.level(c.sinyal),
      }, palet),
    });
  };
  if (p.kind === "led") {
    const c = ledDevresi(p, ctx);
    out.push({ baslik: "Anatomi", parca: ledCizimi(c.renk, palet, { id, yanik: ctx.level(c.sinyal) === 1 && c.sinyal >= 0 }) });
    ledDevre(p);
  } else if (d?.tur === "direnc") {
    out.push({ baslik: "Renk bantları", parca: direncCizimi(d.ohm, d.tolerans, palet, { id, etiket: true }) });
    const led = seriLed(p, ctx);
    const c = cekmeDirenci(p);
    if (led) ledDevre(led);
    else if (c) {
      const hat = c.hatlar[0];
      const al = netAlici(ctx, hat);
      out.push({ baslik: "Devre", parca: cekmeCizimi({ yon: c.yon, ohm: c.ohm, ref: p.ref, hat: ctx.netName(hat), alici: al ? uc(al) : undefined, seviye: ctx.level(hat) }, palet) });
    }
  } else if (d?.tur === "dizi") {
    const com = p.pins.find((q) => q.num === 1)?.net ?? -1;
    out.push({ baslik: "Dışı ve içi", parca: diziCizimi(d.kod, p.pins.length, palet, { ortak: `COM → ${com >= 0 ? ctx.netName(com) : "?"}`, ohm: d.ohm }) });
    const c = cekmeDirenci(p);
    if (c) out.push({ baslik: "Her hat için", parca: cekmeCizimi({ yon: c.yon, ohm: c.ohm, ref: `${p.ref} (${c.hatlar.length} hat)`, hat: `${c.hatlar.length} hat`, surucu: c.yon === "yukari" ? "çıkış: 0'a sürer" : "çıkış: 1'e sürer" }, palet) });
  } else if (d?.tur === "seramik") {
    out.push({ baslik: "Kodun okunuşu", parca: seramikCizimi(d.kod, palet) });
    const ci = p.chip ? ctx.find(p.chip)?.chip : undefined;
    if (ci) {
      const pin = (re: RegExp, net: number) => ci.pins.find((q) => q.net === net && re.test(q.name))?.num ?? 0;
      out.push({ baslik: "Dekuplaj", parca: dekuplajCizimi({ cip: ci.ref, part: ci.part, pinSayisi: ci.pins.length, vcc: pin(/VCC|VDD/, 1), gnd: pin(/GND|VSS/, 0), ref: p.ref, kod: d.kod }, palet) });
    }
  } else if (d?.tur === "elektrolitik") {
    out.push({ baslik: "Kutup", parca: elektrolitikCizimi(`${Math.round(d.farad * 1e6)}µF`, d.volt, palet) });
  } else if (d?.tur === "osilator") {
    out.push({ baslik: "Üstten", parca: osilatorCizimi(d.hz ? (d.hz / 1e6).toFixed(3) : "8.000", palet) });
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
  const a = pasifAciklamasi(p, ctx);
  const ciz = cizimler(p, ctx, `pi${rid}`, palet);
  const led = p.kind === "led" ? LED_RENKLERI[p.led ?? "kirmizi"] : null;
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
      <h3 className="pi-baslik">Bu kartta görevi</h3>
      {a.gorev.map((g, i) => <p key={i} className="pi-metin">{g}</p>)}
      {ciz.slice(1).map((c) => <Cizim key={c.baslik} {...c} palet={palet} />)}
      {a.hesaplar.length > 0 && (
        <>
          <h3 className="pi-baslik">Hesap</h3>
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
      <h3 className="pi-baslik">Bacaklar (canlı)</h3>
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
              {bacakAdi(p, q.num, q.name) && <span className="pi-ad">{bacakAdi(p, q.num, q.name)}</span>}
              {q.net < 0 ? (
                <span className="pi-soluk">bağlı değil</span>
              ) : (
                <button className="pi-net" onClick={() => select.selectNet(q.net > 1 ? q.net : null)} title="Neti seç">
                  {ctx.netName(q.net)}
                </button>
              )}
              <b className={`pi-lv pi-l${elv ?? lv}`} title={elv !== null ? `${ctx.netName(ef)} üzerinden: simülasyon dirençleri bilmez, bu net kendi başına ${SEVIYE[lv]}` : undefined}>
                {SEVIYE[elv ?? lv]}
                {elv !== null && <small> ({ctx.netName(ef)} üzerinden)</small>}
              </b>
              {q.net >= 0 && q.net <= 1 && <span className="pi-soluk">besleme rayı</span>}
              {q.net > 1 && cips.length > 0 && (
                <span className="pi-uclar">
                  {cips.slice(0, 4).map((e, i) => (
                    <button key={i} onClick={() => select.selectChip(e.ref)} title={`${e.part} · ${e.card} kartı`}>{uc(e)}</button>
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
          <span className="pi-soluk">İlgili:</span>
          {a.ilgili.map((x) => (
            <button key={x.ref} onClick={() => select.selectChip(x.ref)}>
              {x.ref} <span>{x.neden}</span>
            </button>
          ))}
        </div>
      )}
      <p className="pi-rehber">
        Rehber: <code>cpu16/kit/led-ve-direnc.md</code> (renk kodu, LED, çekme direnci, dekuplaj, breadboard)
      </p>
    </div>
  );
}

/** Üstüne gelince ipucu: tek satır özet */
export function PassiveTooltip({ p }: { p: PassivePlace }) {
  const ctx = useBaglam();
  const a = pasifAciklamasi(p, ctx);
  const led = p.kind === "led" ? LED_RENKLERI[p.led ?? "kirmizi"] : null;
  return (
    <span className="pi-ipucu">
      {led && <i className="pi-led pi-led-k" style={{ background: led.isik }} />}
      {a.ozet}
    </span>
  );
}
