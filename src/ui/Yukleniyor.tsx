// Yükleme ve hata durumları: bir bölümün kodu inerken iskeletin aynısı (üst çubuk, araç çubuğu,
// sahne, yan panel) boş olarak çizilir, ortada dönen bir halka ve ne yüklendiği yazar. Kısa
// yüklemelerde göz kırpmasın diye yazı ve halka biraz gecikmeyle belirir (styles.css: .yukleniyor).

import { Component, type ReactNode } from "react";
import { AppHeader } from "./Shell";
import { bolum, type Mode } from "./ModeSwitch";

/** Sahnenin ortasında: dönen halka, başlık, isteğe bağlı açıklama. Sınıf adı "overlay": eski testler bunu bekler. */
export function Yukleniyor({ children, alt, hemen = false }: { children: ReactNode; alt?: ReactNode; hemen?: boolean }) {
  return (
    <div className={`overlay yukleniyor${hemen ? " hemen" : ""}`} role="status" aria-live="polite">
      <div className="yk-kutu">
        <span className="yk-halka" aria-hidden="true" />
        <span className="yk-yazi">{children}</span>
        {alt && <span className="yk-alt">{alt}</span>}
      </div>
    </div>
  );
}

/** Sahnenin ortasında hata kutusu */
export function HataKutusu({ baslik, children, eylem }: { baslik: string; children: ReactNode; eylem?: ReactNode }) {
  return (
    <div className="overlay hata-kutusu" role="alert">
      <div className="yk-kutu">
        <span className="hk-isaret" aria-hidden="true">!</span>
        <span className="yk-yazi">{baslik}</span>
        <span className="yk-alt">{children}</span>
        {eylem}
      </div>
    </div>
  );
}

/** Bölümün kodu inerken: bölümün iskeleti, üst çubukta bölüm seçili */
export function BolumYukleniyor({ mode }: { mode: Mode }) {
  const b = bolum(mode);
  return (
    <div className="shell iskelet" aria-busy="true">
      <AppHeader mode={mode} context="yükleniyor…" />
      <div className="toolbar">
        <span className="isk-blok" style={{ width: 180 }} />
        <span className="isk-blok" style={{ width: 120 }} />
        <span className="isk-blok" style={{ width: 220 }} />
      </div>
      <div className="workspace">
        <div className="center">
          <main className="stage">
            <Yukleniyor alt={b.ipucu}>{b.ad} yükleniyor…</Yukleniyor>
          </main>
        </div>
        <aside className="side" aria-hidden="true">
          <div className="tabbar">
            <span className="isk-blok" style={{ width: 70, alignSelf: "center" }} />
            <span className="isk-blok" style={{ width: 90, alignSelf: "center" }} />
          </div>
          <div className="side-body">
            <span className="isk-blok" style={{ width: "40%" }} />
            <span className="isk-blok uzun" />
            <span className="isk-blok uzun" style={{ width: "85%" }} />
            <span className="isk-blok uzun" style={{ width: "70%" }} />
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Bir bölümün kodu yüklenemezse (ör. bağlantı koptu, sürüm değişti) boş ekran yerine açıklama ve
 * yeniden yükleme düğmesi.
 */
export class BolumSiniri extends Component<{ mode: Mode; aktif: boolean; children: ReactNode }, { hata: string | null }> {
  state = { hata: null as string | null };

  static getDerivedStateFromError(e: unknown) {
    return { hata: e instanceof Error ? e.message : String(e) };
  }

  render() {
    if (!this.state.hata) return this.props.children;
    if (!this.props.aktif) return null;
    const b = bolum(this.props.mode);
    return (
      <div className="shell">
        <AppHeader mode={this.props.mode} />
        <div className="workspace">
          <main className="stage">
            <HataKutusu baslik={`${b.ad} açılamadı`} eylem={<button className="primary" onClick={() => location.reload()}>Sayfayı yenile</button>}>
              {this.state.hata}
            </HataKutusu>
          </main>
        </div>
      </div>
    );
  }
}
