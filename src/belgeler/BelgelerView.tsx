// "Belgeler" bölümü: depodaki CPU16 ve hesap8 belgeleri uygulamanın içinde, markdown dosyalarından olduğu
// gibi. Her belge ayrı bir parça (import.meta.glob, ?raw) ve açılınca iner; görseller paketlenmiş
// adresleriyle (?url). Ayrıştırıcı md.ts, dizin / adresler / arama katalog.ts.
//
// Adres: #belgeler (son okunan belge, yoksa okuma yolu), #belgeler/<yol>, #belgeler/<yol>#<çapa>.
// Düzen öbür bölümlerle aynı üst çubuk ve araç çubuğu; altında solda gruplu belge listesi ve arama,
// ortada metin sütunu, geniş ekranda sağda "Bu sayfada". Dar ekranda tek sütun: liste araç çubuğundaki
// düğmeyle açılır, "Bu sayfada" metnin üstünde kapalı bir kutu. Odak modunda (F) yalnız metin kalır.

import "./belgeler.css";
import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { kisayolAlani, useAyar } from "../ui/ayarlar";
import { AppHeader, Group, OdakDugmesi, type Shortcut } from "../ui/Shell";
import { Yukleniyor } from "../ui/Yukleniyor";
import { VARSAYILAN, belgeHash, belgelerdeAra, githubAdresi, gorselCoz, hashCoz, hedefCoz, katalog, katla, komsular } from "./katalog";
import { duzMetin, mdAyristir, type Blok, type Inline } from "./md";

const yolu = (k: string) => k.replace(/^(?:\.\.\/)+/, "");

// tests/belgeler.test.ts aynı kümeyi okur
const KAYNAK = import.meta.glob(
  ["../../README.md", "../../CONTRIBUTING.md", "../../docs/README.md", "../../cpu16/README.md", "../../cpu16/docs/*.md", "../../cpu16/kit/*.md", "../../hesap8/README.md", "../../hesap8/docs/*.md"],
  { query: "?raw", import: "default" },
) as Record<string, () => Promise<string>>;
const GORSEL = import.meta.glob(["../../cpu16/docs/img/*.svg", "../../hesap8/docs/img/*.svg", "../../cpu16/kit/gorseller/*.svg"], {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

const YUKLE = new Map(Object.entries(KAYNAK).map(([k, f]) => [yolu(k), f]));
const ADRES: Record<string, string> = Object.fromEntries(Object.entries(GORSEL).map(([k, u]) => [yolu(k), u]));
const GRUPLAR = katalog(YUKLE.keys());
const belgeVar = (yol: string) => YUKLE.has(yol);

/** inen metinler ve ağaçları: bölümden çıkıp dönünce yeniden inmez */
const METIN = new Map<string, string>();
const AGAC = new Map<string, Blok[]>();
async function metinYukle(yol: string): Promise<string> {
  const m = METIN.get(yol) ?? (await YUKLE.get(yol)!());
  METIN.set(yol, m);
  return m;
}
function agac(yol: string, metin: string): Blok[] {
  const a = AGAC.get(yol) ?? mdAyristir(metin);
  AGAC.set(yol, a);
  return a;
}

/** #belgeler yalnızken açılan: bu oturumda son okunan belge */
let sonYol: string | null = null;

const KISAYOLLAR: Shortcut[] = [
  { keys: "/", what: "Belgelerde ara" },
  { keys: "Esc", what: "Aramayı temizle" },
];

/** Geniş ekranda "Bu sayfada" sağ sütunda hep açık; daha darda metnin üstünde kapalı kutu */
function useGenis(sorgu: string): boolean {
  const [g, setG] = useState(() => matchMedia(sorgu).matches);
  useEffect(() => {
    const m = matchMedia(sorgu);
    const f = () => setG(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [sorgu]);
  return g;
}

type Yuklenen = { yol: string; bloklar: Blok[] } | { yol: string; hata: string };

export function BelgelerView() {
  const [konum, setKonum] = useState(() => hashCoz(location.hash));
  // aynı adrese yeniden tıklanınca da kaydırılsın
  const [tik, setTik] = useState(0);
  const [belge, setBelge] = useState<Yuklenen | null>(null);
  const [sorgu, setSorgu] = useState("");
  const [hepsiIndi, setHepsiIndi] = useState(false);
  const [listeAcik, setListeAcik] = useState(false);
  const odak = useAyar((s) => s.odak);
  const genis = useGenis("(min-width: 1280px)");
  const ana = useRef<HTMLElement>(null);
  const makale = useRef<HTMLElement>(null);
  const arama = useRef<HTMLInputElement>(null);
  const sonKaydirma = useRef("");

  const yol = konum.yol ?? sonYol ?? VARSAYILAN;
  const var_ = belgeVar(yol);

  useEffect(() => {
    const f = () => setKonum(hashCoz(location.hash));
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);

  // yalnız "#belgeler" ise adres açılan belgeyi göstersin (geçmişe yeni kayıt eklemeden)
  useEffect(() => {
    if (var_) sonYol = yol;
    if (!konum.yol && var_) history.replaceState(null, "", belgeHash(yol));
  }, [konum.yol, yol, var_]);

  useEffect(() => {
    if (!var_) return;
    let iptal = false;
    metinYukle(yol).then(
      (m) => !iptal && setBelge({ yol, bloklar: agac(yol, m) }),
      (e: unknown) => !iptal && setBelge({ yol, hata: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      iptal = true;
    };
  }, [yol, var_]);

  // arama metinlere de bakar: ilk aramada bütün belgeler (ayrı parçalar) iner
  const ertelenen = useDeferredValue(sorgu);
  const araniyor = ertelenen.trim() !== "";
  useEffect(() => {
    if (!araniyor || hepsiIndi) return;
    let iptal = false;
    Promise.all([...YUKLE.keys()].map(metinYukle)).then(
      () => !iptal && setHepsiIndi(true),
      () => {},
    );
    return () => {
      iptal = true;
    };
  }, [araniyor, hepsiIndi]);
  const sonuc = useMemo(() => (araniyor ? belgelerdeAra(GRUPLAR, ertelenen, (y) => METIN.get(y)) : null), [araniyor, ertelenen, hepsiIndi]);

  const hazir = belge && belge.yol === yol && "bloklar" in belge ? belge : null;

  // belge değişince başa ya da çapaya, aramadan gelindiyse ilk eşleşmeye kaydır
  useEffect(() => {
    if (!hazir) return;
    const anahtar = `${yol}#${konum.capa ?? ""}#${tik}`;
    if (sonKaydirma.current === anahtar) return;
    const yeniBelge = !sonKaydirma.current.startsWith(`${yol}#`);
    sonKaydirma.current = anahtar;
    const hedef = konum.capa ? document.getElementById(`bl-${konum.capa}`) : yeniBelge && sorgu.trim() ? ilkEslesme(makale.current, sorgu) : null;
    if (hedef) hedef.scrollIntoView({ block: "start" });
    else if (yeniBelge) {
      ana.current?.scrollTo(0, 0);
      if (ana.current && ana.current.getBoundingClientRect().top < 0) ana.current.scrollIntoView();
    }
  });

  // "/" aramaya gider (arama kutusunda Esc temizler)
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === "/" && kisayolAlani(e)) {
        e.preventDefault();
        setListeAcik(true);
        requestAnimationFrame(() => arama.current?.focus());
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  /** Bulunulan adrese yeniden tıklanınca hashchange gelmez: kaydırmayı elle iste */
  const ayniAdres = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (e.currentTarget.hash === location.hash) {
      e.preventDefault();
      setTik((t) => t + 1);
    }
  };
  const listedenSec = (e: MouseEvent<HTMLAnchorElement>) => {
    ayniAdres(e);
    setListeAcik(false);
  };

  const kayit = GRUPLAR.flatMap((g) => g.belgeler.map((b) => ({ ...b, grup: g.ad }))).find((b) => b.yol === yol);
  const { onceki, sonraki } = komsular(GRUPLAR, yol);
  const icindekiler = useMemo(
    () => (hazir ? hazir.bloklar.flatMap((b) => (b.t === "baslik" && (b.d === 2 || b.d === 3) ? [{ id: b.id, d: b.d, metin: duzMetin(b.c) }] : [])) : []),
    [hazir],
  );
  // belgenin başlığı ayrı: orta ve dar ekranda "Bu sayfada" kutusu başlıkla metnin arasına girer
  const ilk = hazir?.bloklar[0];
  const bas = ilk?.t === "baslik" && ilk.d === 1 ? ilk : null;
  const govde = hazir ? hazir.bloklar.slice(bas ? 1 : 0) : [];
  const baglam: Baglam = { yol, ayniAdres };
  const listeGruplari = sonuc ?? GRUPLAR.map((g) => ({ ad: g.ad, belgeler: g.belgeler.map((b) => ({ ...b, eslesme: null })) }));

  return (
    <div className="app belgeler shell" data-odak={odak ? "" : undefined} data-liste={listeAcik ? "acik" : undefined}>
      <AppHeader mode="belgeler" context="Belgeler · CPU16 ve hesap8" shortcuts={KISAYOLLAR} />
      <div className="toolbar">
        <Group label="Belge" className="bl-konum">
          <button className="bl-liste-dugme" aria-expanded={listeAcik} aria-controls="bl-liste" onClick={() => setListeAcik(!listeAcik)}>
            <svg className="simge" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M4 6h12M4 10h12M4 14h12" />
            </svg>
            Belge listesi
          </button>
          <span className="bl-yol">
            {kayit && <span className="bl-yol-grup">{kayit.grup}</span>}
            <b>{kayit?.ad ?? yol}</b>
          </span>
        </Group>
        <Group label="Kaynak" className="tb-end">
          {var_ && (
            <a className="bl-dugme" href={githubAdresi(yol)} target="_blank" rel="noopener noreferrer" aria-label="GitHub'da aç (yeni sekmede)" data-tip="Bu belgenin kaynağı GitHub'da (yeni sekmede)" data-tip-hiza="son">
              <span className="bl-kisalir">GitHub'da aç</span>
              <svg className="simge" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 4H4.5v11.5H16V12M11 4h5v5M16 4l-7 7" />
              </svg>
            </a>
          )}
          <OdakDugmesi />
        </Group>
      </div>
      <div className="workspace bl-alan">
        <nav id="bl-liste" className="bl-liste" aria-label="Belgeler">
          <div className="bl-ara" role="search">
            <input
              ref={arama}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              value={sorgu}
              onChange={(e) => setSorgu(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && sorgu) {
                  e.stopPropagation();
                  setSorgu("");
                }
              }}
              placeholder="Belgelerde ara (/)"
              aria-label="Belgelerde ara: başlık ve metin"
              aria-describedby="bl-ara-durum"
            />
            <span id="bl-ara-durum" className="bl-ara-durum" aria-live="polite">
              {sonuc && (!hepsiIndi ? "metinler taranıyor…" : sonuc.length ? `${sonuc.reduce((n, g) => n + g.belgeler.length, 0)} belge` : "eşleşen belge yok")}
            </span>
          </div>
          <div className="bl-gruplar">
            {listeGruplari.map((g, gi) => (
              <section key={g.ad} className="bl-grup" aria-labelledby={`blg-${gi}`}>
                <h2 id={`blg-${gi}`}>{g.ad}</h2>
                <ul>
                  {g.belgeler.map((b) => (
                    <li key={b.yol}>
                      <a href={belgeHash(b.yol)} aria-current={b.yol === yol ? "page" : undefined} onClick={listedenSec}>
                        <span className="bl-ad">{b.ad}</span>
                        {b.eslesme && (
                          <>
                            <span className="bl-sayi">{b.eslesme.sayi} yerde</span>
                            <span className="bl-ornek">{b.eslesme.ornek}</span>
                          </>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </nav>
        <main className="bl-ana" ref={ana}>
          {!var_ ? (
            <article className="md bl-metin">
              <h1>Belge bulunamadı</h1>
              <p>
                <code>{yol}</code> diye bir belge yok. <a href={belgeHash(VARSAYILAN)}>Okuma yoluna dön</a> ya da soldaki listeden bir belge seç.
              </p>
            </article>
          ) : belge && "hata" in belge && belge.yol === yol ? (
            <article className="md bl-metin">
              <h1>Belge yüklenemedi</h1>
              <p>{belge.hata}</p>
              <p>
                <button className="primary" onClick={() => location.reload()}>Sayfayı yenile</button>
              </p>
            </article>
          ) : (
            <article className="bl-izgara" ref={makale} aria-busy={!hazir}>
              {bas && (
                <header className="md bl-bas">
                  <BlokGoster b={bas} k={baglam} siki={false} />
                </header>
              )}
              {icindekiler.length > 1 && (
                <nav className="bl-toc" aria-label="Bu sayfada">
                  <details key={genis ? "genis" : "dar"} open={genis || undefined}>
                    <summary>Bu sayfada</summary>
                    <ol>
                      {icindekiler.map((h) => (
                        <li key={h.id} className={h.d === 3 ? "alt" : undefined}>
                          <a href={belgeHash(yol, h.id)} aria-current={konum.capa === h.id && konum.yol === yol ? "location" : undefined} onClick={ayniAdres}>
                            {h.metin}
                          </a>
                        </li>
                      ))}
                    </ol>
                  </details>
                </nav>
              )}
              <div className="md bl-metin">
                {hazir ? <Bloklar b={govde} k={baglam} /> : <Yukleniyor alt={kayit?.ad}>Belge yükleniyor…</Yukleniyor>}
                {hazir && (onceki || sonraki) && (
                  <nav className="bl-komsu" aria-label="Okuma sırası">
                    {onceki && (
                      <a href={belgeHash(onceki.yol)} rel="prev">
                        <span>Önceki</span>
                        <b>{onceki.ad}</b>
                      </a>
                    )}
                    {sonraki && (
                      <a href={belgeHash(sonraki.yol)} rel="next" className="sonraki">
                        <span>Sonraki</span>
                        <b>{sonraki.ad}</b>
                      </a>
                    )}
                  </nav>
                )}
              </div>
            </article>
          )}
        </main>
      </div>
    </div>
  );
}

/** Metinde sorgunun geçtiği ilk blok (aramadan açılan belgede oraya kaydırılır) */
function ilkEslesme(kok: HTMLElement | null, sorgu: string): HTMLElement | null {
  const q = katla(sorgu.trim());
  if (!kok || !q) return null;
  for (const el of kok.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, p, li, td, th, pre, summary")) {
    if (katla(el.textContent ?? "").includes(q)) return el;
  }
  return null;
}

// ---------------------------------------------------------------- markdown → React

interface Baglam {
  /** göreli bağlantı ve görsellerin çözüldüğü belge */
  yol: string;
  ayniAdres: (e: MouseEvent<HTMLAnchorElement>) => void;
}

function Bloklar({ b, k, siki = false }: { b: Blok[]; k: Baglam; siki?: boolean }) {
  return (
    <>
      {b.map((x, i) => (
        <BlokGoster key={i} b={x} k={k} siki={siki} />
      ))}
    </>
  );
}

function BlokGoster({ b, k, siki }: { b: Blok; k: Baglam; siki: boolean }) {
  switch (b.t) {
    case "baslik": {
      const H = `h${b.d}` as const;
      return (
        <H id={`bl-${b.id}`}>
          <Satir c={b.c} k={k} />
        </H>
      );
    }
    case "paragraf":
      // sıkı listede öğenin metni <p> olmadan
      return siki ? <Satir c={b.c} k={k} /> : <p><Satir c={b.c} k={k} /></p>;
    case "kod":
      return (
        <pre tabIndex={0} data-dil={b.dil || undefined}>
          <code>{b.v}</code>
        </pre>
      );
    case "liste": {
      const L = b.sirali ? "ol" : "ul";
      return (
        <L start={b.sirali && b.bas !== 1 ? b.bas : undefined}>
          {b.ogeler.map((o, i) => (
            <li key={i}>
              <Bloklar b={o} k={k} siki={b.siki} />
            </li>
          ))}
        </L>
      );
    }
    case "alinti":
      return (
        <blockquote>
          <Bloklar b={b.c} k={k} />
        </blockquote>
      );
    case "tablo":
      return (
        <div className="md-tablo" tabIndex={0} role="region" aria-label={`Tablo: ${b.bas.map(duzMetin).filter(Boolean).slice(0, 3).join(", ")}`}>
          <table>
            <thead>
              <tr>
                {b.bas.map((h, i) => (
                  <th key={i} scope="col" style={b.hiza[i] ? { textAlign: b.hiza[i]! } : undefined}>
                    <Satir c={h} k={k} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.satirlar.map((s, i) => (
                <tr key={i}>
                  {s.map((h, j) => (
                    <td key={j} style={b.hiza[j] ? { textAlign: b.hiza[j]! } : undefined}>
                      <Satir c={h} k={k} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "cizgi":
      return <hr />;
    case "ayrinti":
      return (
        <details>
          <summary>
            <Satir c={b.ozet} k={k} />
          </summary>
          <Bloklar b={b.c} k={k} />
        </details>
      );
  }
}

/** baglantida: bağlantının içinde (görsel ayrıca bağlantıya sarılmaz) */
function Satir({ c, k, baglantida = false }: { c: Inline[]; k: Baglam; baglantida?: boolean }) {
  return (
    <>
      {c.map((x, i) => {
        switch (x.t) {
          case "metin":
            return <Fragment key={i}>{x.v}</Fragment>;
          case "kod":
            return <code key={i}>{x.v}</code>;
          case "kalin":
            return <strong key={i}><Satir c={x.c} k={k} baglantida={baglantida} /></strong>;
          case "italik":
            return <em key={i}><Satir c={x.c} k={k} baglantida={baglantida} /></em>;
          case "gorsel": {
            const src = gorselCoz(k.yol, x.src, ADRES);
            if (!src) return <span key={i} className="md-gorsel-yok">[{x.alt}]</span>;
            const img = <img src={src} alt={x.alt} loading="lazy" decoding="async" />;
            // depodaki çizimler (mimari diyagramları geniş) tam boyuyla yeni sekmede açılabilsin
            return baglantida || /^https?:/i.test(src) ? (
              <Fragment key={i}>{img}</Fragment>
            ) : (
              <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="md-gorsel" data-tip="Tam boyu yeni sekmede">
                {img}
                <span className="sr-only"> (tam boyu yeni sekmede açılır)</span>
              </a>
            );
          }
          case "baglanti": {
            const h = hedefCoz(k.yol, x.href, belgeVar);
            if (h.tur === "belge") {
              return (
                <a key={i} href={belgeHash(h.yol, h.capa)} onClick={k.ayniAdres}>
                  <Satir c={x.c} k={k} baglantida />
                </a>
              );
            }
            return (
              <a key={i} href={h.url} target="_blank" rel="noopener noreferrer" className="md-dis">
                <Satir c={x.c} k={k} baglantida />
                <span className="sr-only"> (yeni sekmede açılır)</span>
              </a>
            );
          }
        }
      })}
    </>
  );
}
