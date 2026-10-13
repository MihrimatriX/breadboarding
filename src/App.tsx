import { useEffect, useRef } from "react";
import { DieScene } from "./render/DieScene";
import { Meters, Toolbar } from "./ui/Toolbar";
import { RegistersPanel } from "./ui/RegistersPanel";
import { ProbePanel } from "./ui/ProbePanel";
import { SignalSearch } from "./ui/SignalSearch";
import { LayersPanel } from "./ui/LayersPanel";
import { MemoryPanel } from "./ui/MemoryPanel";
import { ProgramPanel } from "./ui/ProgramPanel";
import { LogicAnalyzer } from "./ui/LogicAnalyzer";
import { HoverTooltip } from "./ui/HoverTooltip";
import { HataKutusu, Yukleniyor } from "./ui/Yukleniyor";
import { AppHeader, Splitter, Tabs, YanBolucu, duzenStili, heightShare, useLayout, usePaneller, type Shortcut, type TabDef } from "./ui/Shell";
import { useApp } from "./state/store";
import { sim } from "./sim/SimClient";
import { PROGRAMS } from "./sim/programs";
import type { ChipData } from "./chip/types";
import { ceviri, useDil, useT } from "./ui/ceviri";

const CHIP_URL = `${import.meta.env.BASE_URL}chips/mos6502/chip.json`;
const DEFAULT_WATCH = ["clk0", "sync", "rw", "ab0", "db0"];

const SHORTCUTS: Shortcut[] = [
  { keys: { tr: "Boşluk", en: "Space" }, what: { tr: "Çalıştır / duraklat", en: "Run / pause" } },
  { keys: ".", what: { tr: "Yarım çevrim", en: "Half cycle" } },
  { keys: "N", what: { tr: "Sonraki komut", en: "Next instruction" } },
  { keys: "R", what: { tr: "Sıfırla", en: "Reset" } },
  { keys: "Esc", what: { tr: "Seçimi kaldır", en: "Clear selection" } },
  { keys: { tr: "Tıkla", en: "Click" }, what: { tr: "Die üzerindeki sinyali ölç", en: "Probe the signal on the die" } },
  { keys: { tr: "Sürükle", en: "Drag" }, what: { tr: "Döndür", en: "Rotate" } },
  { keys: { tr: "Sağ tık", en: "Right-drag" }, what: { tr: "Kaydır", en: "Pan" } },
  { keys: { tr: "Tekerlek", en: "Wheel" }, what: { tr: "Yakınlaş / uzaklaş", en: "Zoom in / out" } },
];

type SideTab = "durum" | "bellek" | "program" | "katmanlar";
const SIDE_TABS: TabDef<SideTab>[] = [
  { id: "durum", label: { tr: "Durum", en: "Status" }, title: { tr: "Yazmaçlar, sinyal arama ve ölçülen sinyal", en: "Registers, signal search and the probed signal" } },
  { id: "bellek", label: { tr: "Bellek", en: "Memory" }, title: { tr: "Sayfa 0 ve yığın", en: "Zero page and stack" } },
  { id: "program", label: "Program", title: { tr: "6502 assembly programı", en: "6502 assembly program" } },
  { id: "katmanlar", label: { tr: "Katmanlar", en: "Layers" }, title: { tr: "Die katmanları ve görünüm", en: "Die layers and view" } },
];

export function App({ active = true }: { active?: boolean }) {
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const chip = useApp((s) => s.chip);
  const dil = useDil();
  const t = useT();
  // mantık analizörü (alt panel) ilk açılışta kapalı: sahne ferah kalsın; "Analizöre ekle" ya da araç
  // çubuğundaki düğme açar
  const [lay, setLay] = useLayout("6502", { side: true, bottom: false, bottomH: heightShare(0.3, 240, 340), sideTab: "durum" });
  const panel = usePaneller(lay);
  const sideTab = (SIDE_TABS.some((t) => t.id === lay.sideTab) ? lay.sideTab : "durum") as SideTab;
  // çip verisi inerken başka bölüme geçildiyse simülasyon duraklatılmış başlar
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    let cancelled = false;
    fetch(CHIP_URL)
      .then((r) => {
        if (!r.ok) throw new Error(ceviri(`Çip verisi yüklenemedi (HTTP ${r.status})`, `Could not load the chip data (HTTP ${r.status})`));
        return r.json() as Promise<ChipData>;
      })
      .then((data) => {
        if (cancelled) return;
        const app = useApp.getState();
        app.setChip(data);
        DEFAULT_WATCH.forEach((n) => app.toggleWatch(data.nodeNames[n]));
        useApp.setState({ running: activeRef.current });
        sim.start(new URL(CHIP_URL, location.href).href, PROGRAMS[0].bytes);
      })
      .catch((e) => useApp.getState().setError(String(e.message ?? e)));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!active) return;
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === " ") { e.preventDefault(); useApp.getState().running ? sim.pause() : sim.run(); }
      else if (e.key === ".") sim.halfStep(1);
      else if (e.key === "n" || e.key === "N") sim.stepInstruction();
      else if (e.key === "r" || e.key === "R") sim.reset();
      else if (e.key === "Escape") useApp.getState().select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // ölçmek için die'a tıklanınca sinyal sekmesi öne gelir
  const selected = useApp((s) => s.selectedNode);
  useEffect(() => {
    if (selected !== null) setLay({ sideTab: "durum" });
  }, [selected, setLay]);

  return (
    <div
      className="app shell"
      hidden={!active}
      data-side={panel.side ? "open" : "closed"}
      data-bottom={panel.bottom ? "open" : "closed"}
      style={duzenStili(lay)}
    >
      <AppHeader
        mode="6502"
        context={
          chip
            ? `${chip.name} · ${chip.transistors.length.toLocaleString(dil === "en" ? "en-US" : "tr-TR")} ${t("transistör", "transistors")}`
            : t("die verisi yükleniyor", "loading die data")
        }
        meters={<Meters />}
        shortcuts={SHORTCUTS}
      />
      <Toolbar side={lay.side} bottom={lay.bottom} onSide={() => setLay({ side: !lay.side })} onBottom={() => setLay({ bottom: !lay.bottom })} />
      <div className="workspace">
        <div className="center">
          <main className="stage">
            {status === "ready" && active && <DieScene />}
            {status === "loading" && (
              <Yukleniyor alt={t("visual6502 çip verisi (~1,6 MB) iniyor, ardından katmanların geometrisi hazırlanır", "Downloading the visual6502 chip data (~1.6 MB), then building the layer geometry")}>
                {t("Die verisi yükleniyor…", "Loading die data…")}
              </Yukleniyor>
            )}
            {status === "error" && <HataKutusu baslik={t("Die verisi yüklenemedi", "Could not load the die data")}>{error}</HataKutusu>}
          </main>
          {panel.bottom && (
            <>
              <Splitter value={lay.bottomH} onChange={(h) => setLay({ bottomH: h })} label={t("Mantık analizörünün yüksekliği", "Logic analyzer height")} />
              <section className="bottom" aria-label={t("Mantık analizörü", "Logic analyzer")}>
                <LogicAnalyzer />
              </section>
            </>
          )}
        </div>
        {panel.side && <YanBolucu lay={lay} setLay={setLay} />}
        {panel.side && (
          <aside className="side" aria-label={t("Ölçüm paneli", "Probe panel")}>
            <Tabs tabs={SIDE_TABS} value={sideTab} onChange={(id) => setLay({ sideTab: id })} label={t("Yan panel", "Side panel")} />
            {/* sekmeler bağlı kalır, yalnız gizlenir: düzenleyicideki program ve bellek seçimi kaybolmaz */}
            <div className="side-body" role="tabpanel" hidden={sideTab !== "durum"}>
              <RegistersPanel visible={active && sideTab === "durum"} />
              <SignalSearch />
              <ProbePanel onAnalizor={() => setLay({ bottom: true })} />
            </div>
            <div className="side-body" role="tabpanel" hidden={sideTab !== "bellek"}>
              <MemoryPanel visible={active && sideTab === "bellek"} />
            </div>
            <div className="side-body" role="tabpanel" hidden={sideTab !== "program"}>
              <ProgramPanel />
            </div>
            <div className="side-body" role="tabpanel" hidden={sideTab !== "katmanlar"}>
              <LayersPanel />
            </div>
            {chip && <footer className="side-foot credit">{t(chip.license, chip.license.replace("Die verisi", "Die data"))}</footer>}
          </aside>
        )}
      </div>
      <HoverTooltip />
    </div>
  );
}
