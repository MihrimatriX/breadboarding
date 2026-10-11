// "Hesap" yan sekmesi: hesap makinesinin ön paneli gibi. Göstergeler (15 hanenin segmentleri, 3D'deki
// göstergelerle aynı netlerden, canlı), altın modelin beklediği ve devreyle uyuşup uyuşmadığı; A ve
// B'nin sekizer anahtarı, işlem düğmeleri, lamba testi; her bloğun şu an hesapladığı (onluk ve
// ikili). Blok adına tıklayınca kamera o bloğa gider.

import { useEffect, useState, type KeyboardEvent } from "react";
import { ISLEMLER, type GostergeGrubu } from "../../hesap8/kart";
import { hesapla, type IslemKodu } from "../../hesap8/model";
import { L1 } from "../../cpu16/chips/logic";
import { Meter, Section } from "../ui/Shell";
import { hesapKarti } from "./aktif";
import { beklenenGorunum, blokDegerleri, dogruMu, hesapSim, ikili, islemSimgesi, useHesap, type GirisGrubu } from "./hesap";
import { useKart } from "./store";
import "./hesap.css";

// ---------------------------------------------------------------- 7 segment hane (SVG)

/** Segmentlerin yeri: rakamın ortasına göre, y aşağı (a üstte, g ortada, d altta) */
const W = 22;
const H = 40;
const T = 5.2;
const SEG: Record<string, [number, number, boolean]> = {
  a: [0, -H / 2, false], b: [W / 2, -H / 4, true], c: [W / 2, H / 4, true], d: [0, H / 2, false],
  e: [-W / 2, H / 4, true], f: [-W / 2, -H / 4, true], g: [0, 0, false],
};

function segmentYolu(cx: number, cy: number, dikey: boolean): string {
  const L = (dikey ? H / 2 : W) - 2;
  const pts: [number, number][] = [[-L / 2, 0], [-L / 2 + T / 2, -T / 2], [L / 2 - T / 2, -T / 2], [L / 2, 0], [L / 2 - T / 2, T / 2], [-L / 2 + T / 2, T / 2]];
  return pts.map(([a, b]) => (dikey ? [cx + b, cy + a] : [cx + a, cy + b]).map((n) => n.toFixed(2)).join(",")).join(" ");
}

/** Tek hane: yanan segmentler kırmızı; eğik (gerçek göstergedeki gibi) */
function Hane({ yanan, isaret }: { yanan: boolean[]; isaret?: boolean }) {
  return (
    <svg className={`hs-hane${isaret ? " isaret" : ""}`} viewBox="-18 -27 36 54" aria-hidden="true">
      <g transform="skewX(-6)">
        {"abcdefg".split("").map((s, i) => {
          const [x, y, dikey] = SEG[s];
          return <polygon key={s} points={segmentYolu(x, y, dikey)} className={yanan[i] ? "on" : ""} />;
        })}
      </g>
    </svg>
  );
}

/** Bir grubun haneleri, devrenin segment netlerinden (lamba testinde hepsi yanar) */
function grupSegmentleri(g: GostergeGrubu): { isaret: boolean | null; haneler: boolean[][] } {
  const sim = hesapSim();
  const bir = (n: number) => !!sim && sim.sim.get(n) === L1;
  return { isaret: g.isaret ? bir(g.isaret.g) : null, haneler: g.haneler.map((h) => h.seg.map(bir)) };
}

function Gostergeler() {
  useHesap((s) => s.surum);
  const g = useHesap((s) => s.gorunum);
  const kart = hesapKarti();
  const sim = hesapSim();
  const hata = !!sim && sim.sim.get(kart.ic.hata) === L1;
  return (
    <div className="hs-ekran" role="img" aria-label={g ? `Göstergeler: A ${g.a.trim()}, B ${g.b.trim()}, sonuç ${g.sonuc.trim() || "boş"}, kalan ${g.kalan.trim() || "boş"}${g.hata ? ", HATA" : ""}` : "Göstergeler"}>
      {kart.gruplar.map((gr) => {
        const s = grupSegmentleri(gr);
        return (
          <div key={gr.ad} className={`hs-grup hs-${gr.ad}`}>
            <span className="hs-etiket">{gr.baslik}</span>
            <span className="hs-haneler">
              {s.isaret !== null && <Hane yanan={[false, false, false, false, false, false, s.isaret]} isaret />}
              {s.haneler.map((h, i) => <Hane key={i} yanan={h} />)}
            </span>
            {gr.ad === "sonuc" && (
              <span className={`hs-led${hata ? " on" : ""}`} title="HATA LED'i: sıfıra bölme">
                <i />
                HATA
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Altın model: göstergelerde ne görünmeli, devre ile aynı mı */
function Model() {
  const { a, b, op, lamba, gorunum } = useHesap();
  const r = hesapla(a, b, op);
  const e = beklenenGorunum({ a, b, op });
  const ok = dogruMu(gorunum, e);
  const formul = r.hata ? `${a} ÷ 0: tanımsız (HATA)` : `${a} ${islemSimgesi(op)} ${b} = ${r.deger}${r.kalan !== null ? `, kalan ${r.kalan}` : ""}`;
  return (
    <div className="hs-model">
      <span className="hs-model-ad">Altın model</span>
      <code className="hs-formul">{formul}</code>
      {lamba ? (
        <span className="hs-durum bilgi">lamba testi: bütün segmentler yanıyor</span>
      ) : ok ? (
        <span className="hs-durum ok" title="Göstergelerde görünen, hesap8/model.ts'in beklediğiyle aynı">✓ göstergeler aynı</span>
      ) : (
        <span className="hs-durum fark" title={`beklenen: A "${e.a}", B "${e.b}", sonuç "${e.sonuc}", kalan "${e.kalan}"`}>✗ fark var</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- girişler

function Sayi({ grup, ad, deger }: { grup: GirisGrubu; ad: string; deger: number }) {
  const [metin, setMetin] = useState(String(deger));
  useEffect(() => setMetin(String(deger)), [deger]);
  const yaz = (v: string) => {
    setMetin(v);
    const n = Number(v);
    if (v.trim() === "" || !Number.isInteger(n) || n < 0 || n > 255) return;
    const s = useHesap.getState();
    s.ayarla(grup === "a" ? n : s.a, grup === "b" ? n : s.b, s.op);
  };
  return (
    <div className="hs-sayi">
      <div className="hs-sayi-bas">
        <b className="hs-sayi-ad">{ad}</b>
        <span className="hs-sayi-not">soldan sağa {ad}7 … {ad}0</span>
        <input
          className="hs-sayi-gir"
          type="number"
          min={0}
          max={255}
          value={metin}
          onChange={(e) => yaz(e.target.value)}
          onBlur={() => setMetin(String(deger))}
          aria-label={`${ad} sayısı (0–255)`}
        />
      </div>
      <div className="hs-bitler" role="group" aria-label={`${ad} anahtarları`}>
        {[7, 6, 5, 4, 3, 2, 1, 0].map((bit) => {
          const on = ((deger >> bit) & 1) === 1;
          return (
            <button
              key={bit}
              className={on ? "on" : ""}
              aria-pressed={on}
              onClick={() => useHesap.getState().bitDegistir(grup, bit)}
              title={`${ad}${bit} · ${8 - bit}. anahtar · değeri ${1 << bit}`}
            >
              <small>{ad}{bit}</small>
              <b>{on ? 1 : 0}</b>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LambaTesti() {
  const lamba = useHesap((s) => s.lamba);
  const bas = (v: boolean) => useHesap.getState().lambaBas(v);
  const tus = (e: KeyboardEvent<HTMLButtonElement>, v: boolean) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    if (!e.repeat) bas(v);
  };
  return (
    <button
      className={`hs-lamba${lamba ? " on" : ""}`}
      aria-pressed={lamba}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        bas(true);
      }}
      onPointerUp={() => bas(false)}
      onPointerCancel={() => bas(false)}
      onLostPointerCapture={() => bas(false)}
      onKeyDown={(e) => tus(e, true)}
      onKeyUp={(e) => tus(e, false)}
      onBlur={() => bas(false)}
      title="LAMBA TESTİ butonu (SW4): basılı tutunca 74HC4511'lerin ~LT girişi 0 olur, bütün segmentler yanar"
    >
      Lamba testi <span>basılı tut</span>
    </button>
  );
}

function Girisler() {
  const { a, b, op } = useHesap();
  return (
    <>
      <Sayi grup="a" ad="A" deger={a} />
      <Sayi grup="b" ad="B" deger={b} />
      <div className="hs-islem">
        <div className="hs-islem-bas">
          <b>İşlem</b>
          <span className="hs-sayi-not">
            OP1 OP0 = {(op >> 1) & 1}{op & 1}
          </span>
        </div>
        <div className="hs-islemler" role="group" aria-label="İşlem">
          {ISLEMLER.map((x) => (
            <button
              key={x.kod}
              className={op === x.kod ? "on" : ""}
              aria-pressed={op === x.kod}
              onClick={() => useHesap.getState().islemSec(x.kod as IslemKodu)}
              title={`${x.ad}: OP1 OP0 = ${(x.kod >> 1) & 1}${x.kod & 1}`}
            >
              {x.simge}
            </button>
          ))}
        </div>
      </div>
      <LambaTesti />
    </>
  );
}

// ---------------------------------------------------------------- bloklar

function Bloklar() {
  useHesap((s) => s.surum);
  const op = useHesap((s) => s.op);
  const sim = hesapSim();
  if (!sim) return null;
  const satirlar = blokDegerleri(sim, op);
  const git = (blok: string) => useKart.getState().focusBlock(blok);
  return (
    <>
      <ul className="hs-bloklar">
        {satirlar.map((r) => (
          <li key={r.blok} className={r.secili ? "secili" : ""}>
            <div className="hs-blok-bas">
              <button className="link" onClick={() => git(r.blok)} title={`Kamerayı "${r.blok}" bloğuna götür`}>
                {r.baslik}
              </button>
              {r.secili && <span className="hs-rozet">göstergede</span>}
            </div>
            {r.degerler.map((d) => (
              <div key={d.ad} className="hs-deger">
                <code className="hs-deger-ad">{d.ad}</code>
                <span className="hs-deger-ne">{d.ne}</span>
                <b className="hs-deger-onluk">{d.metin ?? d.deger}</b>
                <code className="hs-deger-ikili">{ikili(d.deger, d.bit)}</code>
              </div>
            ))}
          </li>
        ))}
      </ul>
      <p className="hs-not">
        Bütün bloklar aynı anda, sürekli hesaplar (saat yok); işlem anahtarı yalnız sonuç seçicide hangisinin göstergeye gideceğini seçer.
      </p>
    </>
  );
}

// ---------------------------------------------------------------- sekme

export function HesapPanel() {
  const hazir = useHesap((s) => s.hazir);
  const hata = useHesap((s) => s.hata);
  const git = (blok: string | null) => useKart.getState().focusBlock(blok);
  if (hata) return <p className="warn">{hata}</p>;
  if (!hazir) return <p className="muted">Hesap makinesi kuruluyor…</p>;
  return (
    <div className="hs">
      <Section title="Göstergeler" actions={<button className="link" onClick={() => git("Gösterge")}>3D'de göster</button>}>
        <Gostergeler />
        <Model />
      </Section>
      <Section title="Anahtarlar" actions={<button className="link" onClick={() => git("Anahtarlar")}>3D'de göster</button>}>
        <Girisler />
      </Section>
      <Section title="Bloklar şu an" actions={<button className="link" onClick={() => git(null)}>genel bakış</button>}>
        <Bloklar />
      </Section>
    </div>
  );
}

/** Üst çubuk: işlem ve göstergedeki sonuç, devre modelle aynı mı */
export function HesapMeters() {
  const { a, b, op, lamba, gorunum } = useHesap();
  const ok = dogruMu(gorunum, beklenenGorunum({ a, b, op }));
  const sonuc = gorunum ? (gorunum.hata ? "HATA" : gorunum.sonuc.replace(/\s+/g, "") || "-") : "-";
  const kalan = gorunum?.kalan.trim();
  return (
    <>
      <Meter label="Gösterge" title="İşlem ve göstergelerde görünen sonuç (devrenin kapı seviyesi simülasyonundan)">
        {lamba ? "lamba testi" : `${a} ${islemSimgesi(op)} ${b} = ${sonuc}${kalan ? ` k ${kalan}` : ""}`}
      </Meter>
      {!lamba && gorunum && (
        <span className={`bench-status ${ok ? "s-halt" : "s-bad"}`} title="Göstergeler altın modelin (hesap8/model.ts) beklediğiyle aynı mı">
          {ok ? "modelle aynı" : "modelden farklı"}
        </span>
      )}
    </>
  );
}
