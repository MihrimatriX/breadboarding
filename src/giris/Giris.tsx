// Açılış sayfası: sitenin kökü ve #giris. Uygulamaya girmeden projeyi anlatır: başlık ve iki eylem
// (tezgâh, 6502), dört seviyelik yolculuk (transistör → kapı → kart → bilgisayar), altı bölümün önizlemeli
// kartları, projenin kuralları. Bölümlerin adı, tanıtımı ve simgesi BOLUMLER'den (ModeSwitch.tsx),
// önizlemeler paylaşım görsellerinden (seo.ts, public/og/); metinler icerik.ts'te. Bölümlere bağlantılar
// adres (#cpu16, …) değiştirir; sayfa içi geçişler (Bölümler) düğme: adres değişseydi uygulama bir bölüme
// geçerdi. Üstüne gelince bölümün kodu önceden istenir (bolumler.ts).

import { useRef } from "react";
import { BOLUMLER, bolum } from "../ui/ModeSwitch";
import { DEPO, SAYFALAR } from "../seo";
import { onYukle } from "../bolumler";
import { sec, useDil, useT } from "../ui/ceviri";
import { DilDugmesi, Logo, TemaDugmesi } from "../ui/Shell";
import { Simge } from "../ui/simgeler";
import { GIRIS_HASH, ILKELER, KAHRAMAN, YOLCULUK } from "./icerik";
import "./giris.css";

/** Bölümün paylaşım görseli (public/ altında, 1200 × 630) */
const gorsel = (hash: string): string => SAYFALAR.find((s) => s.hash === hash)?.gorsel ?? SAYFALAR[0].gorsel;

export function Giris() {
  const dil = useDil();
  const t = useT();
  const bolumler = useRef<HTMLElement>(null);
  const bolumlereGit = () => bolumler.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="giris">
      <header className="gr-ust">
        <div className="gr-ic gr-ust-ic">
          <a className="brand" href={GIRIS_HASH} aria-label={t("Silikon3D ana sayfası", "Silikon3D home page")}>
            <Logo />
            <span className="gr-marka">
              Silikon<em>3D</em>
            </span>
          </a>
          <nav className="gr-nav" aria-label={t("Sayfa", "Page")}>
            <button className="gr-nav-a" onClick={bolumlereGit}>{t("Bölümler", "Sections")}</button>
            <a className="gr-nav-a" href="#belgeler" onPointerEnter={() => onYukle("belgeler")}>{t("Belgeler", "Docs")}</a>
            <a className="gr-nav-a" href={DEPO} target="_blank" rel="noopener noreferrer">GitHub</a>
          </nav>
          <div className="gr-araclar">
            <DilDugmesi />
            <TemaDugmesi />
            <a className="gr-dugme birincil kucuk" href="#cpu16" onPointerEnter={() => onYukle("cpu16")}>
              {t("Uygulamayı aç", "Open the app")}
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="gr-ic gr-kahraman">
          <div className="gr-kahraman-metin">
            <p className="gr-ust-yazi">
              <span className="gr-nokta" aria-hidden="true" />
              {sec(KAHRAMAN.ust, dil)}
            </p>
            <h1>{sec(KAHRAMAN.baslik, dil)}</h1>
            <p className="gr-giris">{sec(KAHRAMAN.giris, dil)}</p>
            <div className="gr-eylemler">
              <a className="gr-dugme birincil" href="#cpu16" onPointerEnter={() => onYukle("cpu16")}>
                {t("CPU16 tezgâhını aç", "Open the CPU16 workbench")}
                <Simge ad="ok" />
              </a>
              <a className="gr-dugme" href="#6502" onPointerEnter={() => onYukle("6502")}>
                {t("6502 kalıbını gör", "See the 6502 die")}
              </a>
            </div>
            <ul className="gr-rozetler">
              <li>{t("Türkçe ve English", "Turkish and English")}</li>
              <li>{t("Koyu ve açık tema", "Dark and light theme")}</li>
              <li>{t("Telefonda da çalışır", "Works on phones too")}</li>
            </ul>
          </div>
          <div className="gr-gorsel" aria-hidden="true">
            <div className="gr-pencere">
              <div className="gr-pencere-bas">
                <i />
                <i />
                <i />
                <span>{sec(bolum("kart").ad, dil)}</span>
              </div>
              <img src={gorsel("#kart")} alt="" width={1200} height={630} />
            </div>
            <img className="gr-kucuk gr-kucuk-1" src={gorsel("#6502")} alt="" width={1200} height={630} />
            <img className="gr-kucuk gr-kucuk-2" src={gorsel("#cpu16")} alt="" width={1200} height={630} />
          </div>
        </section>

        <section className="gr-ic gr-blok" aria-labelledby="gr-yolculuk">
          <div className="gr-bas">
            <p className="gr-ust-yazi">{t("Yolculuk", "The journey")}</p>
            <h2 id="gr-yolculuk">{t("Dört seviye, tek bilgisayar", "Four levels, one computer")}</h2>
          </div>
          <ol className="gr-yolculuk">
            {YOLCULUK.map((a, i) => {
              const b = bolum(a.mode);
              return (
                <li key={a.mode}>
                  <a href={b.hash} onPointerEnter={() => onYukle(a.mode)}>
                    <span className="gr-adim-no">{String(i + 1).padStart(2, "0")}</span>
                    <h3>{sec(a.seviye, dil)}</h3>
                    <p>{sec(a.metin, dil)}</p>
                    <span className="gr-adim-ac">
                      {b.simge}
                      {sec(b.ad, dil)}
                      <Simge ad="ok" />
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="gr-ic gr-blok" aria-labelledby="gr-bolumler" ref={bolumler}>
          <div className="gr-bas">
            <p className="gr-ust-yazi">{t("Bölümler", "Sections")}</p>
            <h2 id="gr-bolumler">{t("Altı bölüm, her biri kaldığı yerden devam eder", "Six sections, each picks up where you left off")}</h2>
          </div>
          <div className="gr-kartlar">
            {BOLUMLER.map((b) => (
              <a key={b.mode} className="gr-kart" href={b.hash} onPointerEnter={() => onYukle(b.mode)}>
                <div className="gr-kart-gorsel">
                  <img src={gorsel(b.hash)} alt="" width={1200} height={630} loading="lazy" decoding="async" />
                </div>
                <div className="gr-kart-govde">
                  <h3>
                    <span className="gr-kart-simge">{b.simge}</span>
                    {sec(b.ad, dil)}
                  </h3>
                  <p>{sec(b.tanitim, dil)}</p>
                  <span className="gr-kart-ac">
                    {t("Aç", "Open")}
                    <Simge ad="ok" />
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section className="gr-ic gr-blok" aria-labelledby="gr-ilkeler">
          <div className="gr-bas">
            <p className="gr-ust-yazi">{t("Nasıl kuruldu", "How it is built")}</p>
            <h2 id="gr-ilkeler">{t("Dört kural", "Four rules")}</h2>
          </div>
          <ul className="gr-ilkeler">
            {ILKELER.map((k, i) => (
              <li key={i}>
                <span className="gr-ilke-no">{String(i + 1).padStart(2, "0")}</span>
                <h3>{sec(k.baslik, dil)}</h3>
                <p>{sec(k.metin, dil)}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="gr-alt">
        <div className="gr-ic gr-alt-ic">
          <span className="gr-alt-marka">
            <Logo boyut={22} /> Silikon3D
          </span>
          <span>
            {t("Açık kaynak", "Open source")} ·{" "}
            <a href={DEPO} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </span>
          <span className="gr-alt-not">{t("6502 kalıp verisi: visual6502.org, CC BY-NC-SA 3.0", "6502 die data: visual6502.org, CC BY-NC-SA 3.0")}</span>
        </div>
      </footer>
    </div>
  );
}
