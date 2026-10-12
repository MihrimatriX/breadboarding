import { useEffect, useRef, type CSSProperties } from "react";
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
import { AppHeader, Splitter, Tabs, heightShare, useLayout, type Shortcut, type TabDef } from "./ui/Shell";
import { useApp } from "./state/store";
import { sim } from "./sim/SimClient";
import { PROGRAMS } from "./sim/programs";
import type { ChipData } from "./chip/types";

const CHIP_URL = `${import.meta.env.BASE_URL}chips/mos6502/chip.json`;
const DEFAULT_WATCH = ["clk0", "sync", "rw", "ab0", "db0"];

const SHORTCUTS: Shortcut[] = [
  { keys: "Boşluk", what: "Çalıştır / duraklat" },
  { keys: ".", what: "Yarım çevrim" },
  { keys: "N", what: "Sonraki komut" },
  { keys: "R", what: "Sıfırla" },
  { keys: "Esc", what: "Seçimi kaldır" },
  { keys: "Tıkla", what: "Die üzerindeki sinyali ölç" },
  { keys: "Sürükle", what: "Döndür" },
  { keys: "Sağ tık", what: "Kaydır" },
  { keys: "Tekerlek", what: "Yakınlaş / uzaklaş" },
];

type SideTab = "durum" | "bellek" | "program" | "katmanlar";
const SIDE_TABS: TabDef<SideTab>[] = [
  { id: "durum", label: "Durum", title: "Yazmaçlar, sinyal arama ve ölçülen sinyal" },
  { id: "bellek", label: "Bellek", title: "Sayfa 0 ve yığın" },
  { id: "program", label: "Program", title: "6502 assembly programı" },
  { id: "katmanlar", label: "Katmanlar", title: "Die katmanları ve görünüm" },
];

export function App({ active = true }: { active?: boolean }) {
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const chip = useApp((s) => s.chip);
  const [lay, setLay] = useLayout("6502", { side: true, bottom: true, bottomH: heightShare(0.3, 220, 320), sideTab: "durum" });
  const sideTab = (SIDE_TABS.some((t) => t.id === lay.sideTab) ? lay.sideTab : "durum") as SideTab;
  // çip verisi inerken başka bölüme geçildiyse simülasyon duraklatılmış başlar
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    let cancelled = false;
    fetch(CHIP_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Çip verisi yüklenemedi (HTTP ${r.status})`);
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
      data-side={lay.side ? "open" : "closed"}
      data-bottom={lay.bottom ? "open" : "closed"}
      style={{ "--bottom-h": `${lay.bottomH}px` } as CSSProperties}
    >
      <AppHeader
        mode="6502"
        context={chip ? `${chip.name} · ${chip.transistors.length.toLocaleString("tr-TR")} transistör` : "die verisi yükleniyor"}
        meters={<Meters />}
        shortcuts={SHORTCUTS}
      />
      <Toolbar side={lay.side} bottom={lay.bottom} onSide={() => setLay({ side: !lay.side })} onBottom={() => setLay({ bottom: !lay.bottom })} />
      <div className="workspace">
        <div className="center">
          <main className="stage">
            {status === "ready" && active && <DieScene />}
            {status === "loading" && <Yukleniyor alt="visual6502 çip verisi (~1,6 MB) iniyor, ardından katmanların geometrisi hazırlanır">Die verisi yükleniyor…</Yukleniyor>}
            {status === "error" && <HataKutusu baslik="Die verisi yüklenemedi">{error}</HataKutusu>}
          </main>
          {lay.bottom && (
            <>
              <Splitter value={lay.bottomH} onChange={(h) => setLay({ bottomH: h })} label="Mantık analizörünün yüksekliği" />
              <section className="bottom" aria-label="Mantık analizörü">
                <LogicAnalyzer />
              </section>
            </>
          )}
        </div>
        {lay.side && (
          <aside className="side" aria-label="Ölçüm paneli">
            <Tabs tabs={SIDE_TABS} value={sideTab} onChange={(t) => setLay({ sideTab: t })} label="Yan panel" />
            {/* sekmeler bağlı kalır, yalnız gizlenir: düzenleyicideki program ve bellek seçimi kaybolmaz */}
            <div className="side-body" role="tabpanel" hidden={sideTab !== "durum"}>
              <RegistersPanel visible={active && sideTab === "durum"} />
              <SignalSearch />
              <ProbePanel />
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
            {chip && <footer className="side-foot credit">{chip.license}</footer>}
          </aside>
        )}
      </div>
      <HoverTooltip />
    </div>
  );
}
