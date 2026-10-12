// Mimari bölümünün yan paneli: seçim yokken diyagramın özeti ve içindekiler; bir kutu, kart çerçevesi
// ya da yol seçilince ayrıntıları. Parça listeleri ve sayılar devreden (Board) gelir: kutunun
// bloklarındaki entegreler (ref, parça, görev), yapıştırıcı lojikteki kapıları, yolların netleri ve
// netleri gerçekten süren / okuyan entegreler.

import type { ReactNode } from "react";
import { partValue, type ChipInstance } from "../../cpu16/board/board.ts";
import { KUTU_ROLU_ADI, YOL_TURU_ADI, ucBloklari } from "../../cpu16/mimari/cizim.ts";
import type { KuruluDiyagram } from "../../cpu16/mimari/index.ts";
import type { Baglanti, Iliski } from "../../cpu16/mimari/iliski.ts";
import {
  KART_ADLARI, cipSayimi, gosterilenPasif, kutuGorevi, kutuParcalari, netOzeti, pasifSayimi, sayimMetni, yolEtiketMetni,
  type Grup, type Kutu, type Parcalar, type Yol, type Yon,
} from "../../cpu16/mimari/model.ts";
import { Section } from "../ui/Shell";
import type { Hedef } from "./MimariSahne";

const YON_ADI: Record<Yon, string> = { giris: "giriş", cikis: "çıkış", iki: "iki yönlü" };
const YON_IPUCU: Record<Yon, string> = {
  giris: "yoldan kutuya: kutu bu netleri okur",
  cikis: "kutudan yola: kutu bu netleri sürer",
  iki: "iki yönlü: kutu bu netleri hem sürer hem okur",
};

/** Uzun listeler kapalı açılır kutuda (özet satırı görünür) */
const UZUN = 12;

export interface PanelOzellikleri {
  k: KuruluDiyagram;
  il: Iliski;
  secim: Hedef | null;
  sec: (h: Hedef | null) => void;
  ayrintiAc: (id: string) => void;
  /** 3D bölümüne geç, bloğun ilk entegresini seç */
  goster3d: (block: string, card: string) => void;
}

export function MimariPanel(p: PanelOzellikleri) {
  const { k, secim } = p;
  const kutu = secim?.tur === "kutu" ? k.diyagram.kutular.find((x) => x.id === secim.id) : undefined;
  const grup = secim?.tur === "kutu" ? k.diyagram.gruplar.find((x) => x.id === secim.id) : undefined;
  const yol = secim?.tur === "yol" ? k.diyagram.yollar.find((x) => x.id === secim.id) : undefined;
  return (
    <div className="mm-panel" key={secim ? `${secim.tur}:${secim.id}` : "ozet"}>
      {kutu ? <KutuAyrintisi {...p} kutu={kutu} /> : grup ? <GrupAyrintisi {...p} grup={grup} /> : yol ? <YolAyrintisi {...p} yol={yol} /> : <Ozet {...p} />}
    </div>
  );
}

// ---------------------------------------------------------------- ortak parçalar

function KutuRozeti({ rol, cihaz }: { rol: Kutu["rol"]; cihaz?: boolean }) {
  return (
    <span className="mm-rozet">
      <i className={`mm-sw mm-sw-k mm-k-${rol}${cihaz ? " mm-sw-cihaz" : ""}`} aria-hidden="true" />
      {cihaz ? "Dış cihaz" : KUTU_ROLU_ADI[rol]}
    </span>
  );
}

function YolRozeti({ tur }: { tur: Yol["tur"] }) {
  return (
    <span className="mm-rozet">
      <i className={`mm-sw mm-sw-y mm-y-${tur}`} aria-hidden="true" />
      {YOL_TURU_ADI[tur]}
    </span>
  );
}

function Baslik({ rozet, ad, alt, kapat }: { rozet: ReactNode; ad: string; alt?: ReactNode; kapat: () => void }) {
  return (
    <div className="mm-bas">
      <div className="mm-bas-ust">
        {rozet}
        <button className="link" onClick={kapat} title="Seçimi kaldır (Esc)">kapat</button>
      </div>
      <h2 className="mm-ad">{ad}</h2>
      {alt && <p className="mm-gorev">{alt}</p>}
    </div>
  );
}

function OkSimgesi() {
  return (
    <svg className="simge" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 10h11M11 5.5l4.5 4.5-4.5 4.5" />
    </svg>
  );
}

/** Bir parça öbeğinin entegreleri: ref, parça, görev */
function CipListesi({ cipler }: { cipler: readonly ChipInstance[] }) {
  return (
    <ul className="mm-cipler">
      {cipler.map((c) => (
        <li key={c.ref}>
          <span className="mm-ref">{c.ref}</span>
          <span className="mm-parca">{partValue(c)}</span>
          <span className="mm-gorevi">{c.role}</span>
        </li>
      ))}
    </ul>
  );
}

function KapiListesi({ kapilar }: { kapilar: Parcalar["kapilar"] }) {
  return (
    <ul className="mm-cipler">
      {kapilar.map((g, i) => (
        <li key={`${g.ref}-${i}`}>
          <span className="mm-ref">{g.ref}</span>
          <span className="mm-parca">{g.part}</span>
          <span className="mm-gorevi">{g.role}</span>
        </li>
      ))}
    </ul>
  );
}

/** Bir öbeğin (bölme ya da blok) parçaları; uzunsa açılır kutuda */
function ParcaObegi({ ad, gorev, p }: { ad: string; gorev?: string; p: Parcalar }) {
  const ozet = cipSayimi(p.cipler).map(sayimMetni).join(", ");
  const pasif = pasifSayimi(p.pasifler).map(sayimMetni).join(", ");
  const diger = p.pasifler.filter((x) => !gosterilenPasif(x.part)).length;
  const bos = !p.cipler.length && !p.kapilar.length && !pasif && !diger;
  const govde = (
    <>
      {p.cipler.length > 0 && <CipListesi cipler={p.cipler} />}
      {pasif && <p className="mm-not">Pasif: {pasif}</p>}
      {diger > 0 && <p className="mm-not">ve {diger} direnç / kondansatör</p>}
      {p.kapilar.length > 0 && (
        <details className="mm-acilir">
          <summary>Yapıştırıcı lojikte {p.kapilar.length} kapı</summary>
          <KapiListesi kapilar={p.kapilar} />
        </details>
      )}
      {bos && <p className="mm-not">Parça yok.</p>}
    </>
  );
  return (
    <div className="mm-obek">
      <h3 className="mm-obek-ad">
        <span>{ad}</span>
        <span className="mm-sayi">{p.cipler.length ? `${p.cipler.length} entegre` : ""}</span>
      </h3>
      {gorev && <p className="mm-not">{gorev}</p>}
      {p.cipler.length > UZUN ? (
        <details className="mm-acilir">
          <summary>{ozet}</summary>
          {govde}
        </details>
      ) : (
        govde
      )}
    </div>
  );
}

/** Bir kutunun ya da çerçevenin bağlı olduğu yollar */
function YolListesi({ k, baglantilar, sec }: { k: KuruluDiyagram; baglantilar: readonly Baglanti[]; sec: (h: Hedef) => void }) {
  if (!baglantilar.length) return <p className="mm-not">Bu kutu diyagramdaki yollara bağlı değil.</p>;
  return (
    <ul className="mm-liste">
      {baglantilar.map((b) => {
        const y = k.diyagram.yollar.find((x) => x.id === b.yol)!;
        return (
          <li key={b.yol}>
            <button className="mm-satir" onClick={() => sec({ tur: "yol", id: y.id })}>
              <i className={`mm-sw mm-sw-y mm-y-${y.tur}`} aria-hidden="true" />
              <span className="mm-satir-ad">
                <b>{yolEtiketMetni(y)}</b>
                <span className="mm-netler">{netOzeti(y.netler)}</span>
              </span>
              <span className="mm-yon" title={YON_IPUCU[b.yon]}>{YON_ADI[b.yon]}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function UcDugmesi({ k, id, sec }: { k: KuruluDiyagram; id: string; sec: (h: Hedef) => void }) {
  const kt = k.diyagram.kutular.find((x) => x.id === id);
  const g = k.diyagram.gruplar.find((x) => x.id === id);
  return (
    <button className="mm-satir" onClick={() => sec({ tur: "kutu", id })}>
      {kt ? <i className={`mm-sw mm-sw-k mm-k-${kt.rol}${kt.cihaz ? " mm-sw-cihaz" : ""}`} aria-hidden="true" /> : <i className="mm-sw mm-sw-kart" aria-hidden="true" />}
      <span className="mm-satir-ad">
        <b>{kt ? kt.ad : g ? g.ad : id}</b>
        {kt && kutuGorevi(kt) && <span className="mm-alt">{kutuGorevi(kt)}</span>}
      </span>
    </button>
  );
}

/** 3D bölümünde gösterilecek blok: kutunun entegresi olan ilk bloğu */
function ilkBlok(k: KuruluDiyagram, bloklar: readonly { card: string; block: string }[]) {
  for (const b of bloklar) {
    const c = k.devre.parcalar([b]).cipler[0];
    if (c) return { ...b, ref: c.ref };
  }
  return null;
}

function Goster3d({ k, bloklar, goster3d }: { k: KuruluDiyagram; bloklar: readonly { card: string; block: string }[]; goster3d: PanelOzellikleri["goster3d"] }) {
  const b = ilkBlok(k, bloklar);
  if (!b) return null;
  const bolum = k.kayit.kart === "hesap" ? "8 bit hesap 3D" : "CPU16 kartı 3D";
  return (
    <div className="mm-eylem">
      <button className="primary" onClick={() => goster3d(b.block, b.card)}>
        3D'de göster <OkSimgesi />
      </button>
      <span className="hint-text">{bolum} bölümünde {b.ref} seçilir</span>
    </div>
  );
}

function AyrintiDugmesi({ id, ac }: { id: string | undefined; ac: (id: string) => void }) {
  if (!id) return null;
  return (
    <button onClick={() => ac(id)}>
      Ayrıntılı diyagram <OkSimgesi />
    </button>
  );
}

// ---------------------------------------------------------------- seçim yok: özet

function Ozet({ k, il, sec }: PanelOzellikleri) {
  const dg = k.diyagram;
  const kartlar = new Set(dg.kutular.flatMap((x) => x.bloklar.map((b) => b.card)));
  const cipler = k.devre.board.chips.filter((c) => kartlar.has(c.card)).length;
  const kutular = dg.kutular.filter((x) => x.rol !== "not");
  const grupsuz = kutular.filter((x) => !il.cercevesi.has(x.id));
  return (
    <>
      <section className="psec">
        <h2 className="mm-ad">{k.kayit.ad}</h2>
        <p className="mm-aciklama">{dg.aciklama}</p>
        <p className="mm-ozet-sayi">
          <span><b>{kutular.length}</b> kutu</span>
          <span><b>{dg.yollar.length}</b> yol</span>
          <span><b>{cipler}</b> entegre</span>
        </p>
      </section>
      <Section title="Nasıl okunur">
        <ul className="mm-okuma">
          <li>Kutular işlev bloklarıdır: adı, görevi ve içindeki entegreler (sayıları devreden). Rengi türünü gösterir (lejant).</li>
          <li>Kalın çizgiler çok bitli yollardır; ok, verinin aktığı yönü gösterir. Nokta dallanma, etiketli uç aynı adlı uçla bağlıdır.</li>
          <li>Bir kutunun üstüne gel: yolları ve bağlı olduğu kutular öne çıkar. Tıkla: entegreler, kapılar, yollar burada.</li>
        </ul>
      </Section>
      <Section title="Kutular">
        <ul className="mm-liste">
          {dg.gruplar.map((g) => (
            <li key={g.id} className="mm-liste-grup">
              <UcDugmesi k={k} id={g.id} sec={sec} />
              <ul className="mm-liste">
                {g.kutular.map((id) => (
                  <li key={id}>
                    <UcDugmesi k={k} id={id} sec={sec} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {grupsuz.map((x) => (
            <li key={x.id}>
              <UcDugmesi k={k} id={x.id} sec={sec} />
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Yollar">
        <ul className="mm-liste">
          {dg.yollar.map((y) => (
            <li key={y.id}>
              <button className="mm-satir" onClick={() => sec({ tur: "yol", id: y.id })}>
                <i className={`mm-sw mm-sw-y mm-y-${y.tur}`} aria-hidden="true" />
                <span className="mm-satir-ad">
                  <b>{yolEtiketMetni(y)}</b>
                  <span className="mm-netler">{netOzeti(y.netler)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- kutu

function KutuAyrintisi({ k, il, sec, ayrintiAc, goster3d, kutu }: PanelOzellikleri & { kutu: Kutu }) {
  const cerceve = il.cercevesi.get(kutu.id);
  const kartAdi = cerceve ? k.diyagram.gruplar.find((g) => g.id === cerceve)?.ad : undefined;
  const p = k.devre.parcalar(kutu.bloklar);
  const obekler: { ad: string; gorev?: string; p: Parcalar }[] = kutu.bolmeler?.length
    ? kutu.bolmeler.map((b) => ({ ad: b.ad, gorev: b.gorev, p: kutuParcalari(k.devre, kutu, b) }))
    : kutu.bloklar.map((b) => ({ ad: b.block, p: k.devre.parcalar([b]) }));
  return (
    <>
      <Baslik rozet={<KutuRozeti rol={kutu.rol} cihaz={kutu.cihaz} />} ad={kutu.ad} alt={kutuGorevi(kutu)} kapat={() => sec(null)} />
      <section className="psec">
        <p className="mm-aciklama">{kutu.aciklama}</p>
        {!kutu.cihaz && (
          <p className="mm-ozet-sayi">
            {kartAdi && <span>{kartAdi}</span>}
            <span><b>{p.cipler.length}</b> entegre</span>
            {p.kapilar.length > 0 && <span><b>{p.kapilar.length}</b> kapı</span>}
            <span><b>{kutu.bloklar.length}</b> blok</span>
          </p>
        )}
        <div className="mm-eylemler">
          <Goster3d k={k} bloklar={kutu.bloklar} goster3d={goster3d} />
          <AyrintiDugmesi id={kutu.ayrinti} ac={ayrintiAc} />
        </div>
      </section>
      <Section title="Yollar">
        <YolListesi k={k} baglantilar={il.yollari.get(kutu.id) ?? []} sec={sec} />
      </Section>
      {!kutu.cihaz && (
        <Section title={kutu.bolmeler?.length ? "Bölmeler ve parçalar" : "Bloklar ve parçalar"}>
          {obekler.map((o) => (
            <ParcaObegi key={o.ad} ad={o.ad} gorev={o.gorev} p={o.p} />
          ))}
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------- kart çerçevesi

function GrupAyrintisi({ k, il, sec, ayrintiAc, goster3d, grup }: PanelOzellikleri & { grup: Grup }) {
  const bloklar = ucBloklari(k.diyagram, grup.id);
  const hepsi = k.devre.parcalar(bloklar);
  const kendi = grup.bloklar ?? [];
  return (
    <>
      <Baslik rozet={<span className="mm-rozet"><i className="mm-sw mm-sw-kart" aria-hidden="true" />{KART_ADLARI[grup.id] ? "Kart" : "Çerçeve"}</span>} ad={grup.ad} kapat={() => sec(null)} />
      <section className="psec">
        {grup.aciklama && <p className="mm-aciklama">{grup.aciklama}</p>}
        <p className="mm-ozet-sayi">
          <span><b>{hepsi.cipler.length}</b> entegre</span>
          <span><b>{grup.kutular.length}</b> kutu</span>
        </p>
        <div className="mm-eylemler">
          <Goster3d k={k} bloklar={[...bloklar.filter((b) => !kendi.includes(b)), ...kendi]} goster3d={goster3d} />
          <AyrintiDugmesi id={grup.ayrinti} ac={ayrintiAc} />
        </div>
      </section>
      {grup.kutular.length > 0 && (
        <Section title="Kutular">
          <ul className="mm-liste">
            {grup.kutular.map((id) => (
              <li key={id}>
                <UcDugmesi k={k} id={id} sec={sec} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Yollar">
        <YolListesi k={k} baglantilar={il.yollari.get(grup.id) ?? []} sec={sec} />
      </Section>
      {kendi.length > 0 && (
        <Section title="Kartın kendi parçaları">
          {kendi.map((b) => (
            <ParcaObegi key={b.block} ad={b.block} p={k.devre.parcalar([b])} />
          ))}
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------- yol

const YON_SIRASI: Record<Yon, number> = { cikis: 0, iki: 1, giris: 2 };

function YolAyrintisi({ k, il, sec, yol }: PanelOzellikleri & { yol: Yol }) {
  // önce sürenler, sonra iki yönlüler, en son okuyanlar
  const uclar = [...(il.uclari.get(yol.id) ?? [])].sort((a, b) => YON_SIRASI[a.yon] - YON_SIRASI[b.yon]);
  /** ucun bu yolun netlerine değen entegreleri (çerçevede yalnız kendi blokları: içindeki kutular ayrı satırda) */
  const ucParcalari = (u: Baglanti) => {
    const g = k.diyagram.gruplar.find((x) => x.id === u.kutu);
    const bloklar = g ? g.bloklar ?? [] : ucBloklari(k.diyagram, u.kutu);
    const { suren, okuyan } = k.devre.yolUclari(yol.netler, bloklar);
    const refler = [...new Set([...suren, ...okuyan].map((x) => x.ref))];
    return refler.sort((a, b) => a.localeCompare(b, "tr", { numeric: true }));
  };
  const ucSatiri = (u: Baglanti) => {
    const refler = ucParcalari(u);
    return (
      <li key={u.kutu}>
        <div className="mm-uc">
          <UcDugmesi k={k} id={u.kutu} sec={sec} />
          <span className="mm-yon" title={YON_IPUCU[u.yon]}>{YON_ADI[u.yon]}</span>
        </div>
        {refler.length > 0 && (
          <p className="mm-refler">
            {refler.slice(0, 14).join(", ")}
            {refler.length > 14 ? ` ve ${refler.length - 14} parça daha` : ""}
          </p>
        )}
      </li>
    );
  };
  return (
    <>
      <Baslik rozet={<YolRozeti tur={yol.tur} />} ad={yolEtiketMetni(yol)} kapat={() => sec(null)} />
      <section className="psec">
        <p className="mm-aciklama">{yol.aciklama}</p>
        <p className="mm-ozet-sayi">
          <span><b>{yol.netler.length}</b> hat</span>
          <span><b>{uclar.length}</b> uç</span>
        </p>
      </section>
      <Section title="Netler">
        <p className="mm-net-liste">{netOzeti(yol.netler)}</p>
      </Section>
      <Section title="Uçlar">
        <p className="mm-not">Yön ve parçalar devreden: bu netlere pinleri bağlı entegreler.</p>
        <ul className="mm-liste">{uclar.map(ucSatiri)}</ul>
      </Section>
    </>
  );
}
