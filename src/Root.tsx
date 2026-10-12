import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { modeFromHash, type Mode } from "./ui/ModeSwitch";
import { yukle6502, yukleKart, yukleTezgah } from "./bolumler";
import { Baslangic } from "./ui/Baslangic";
import { BolumSiniri, BolumYukleniyor } from "./ui/Yukleniyor";
import { useApp } from "./state/store";
import { sim } from "./sim/SimClient";

// her bölüm kendi parçasında: #hesap açılınca 6502 die'ın kodu ve çip verisi inmez, tersi de öyle
const App = lazy(() => yukle6502().then((m) => ({ default: m.App })));
const Cpu16Bench = lazy(() => yukleTezgah().then((m) => ({ default: m.Cpu16Bench })));
const BoardView = lazy(() => yukleKart().then((m) => ({ default: m.BoardView })));

/** Bölüm: kod inerken iskelet, yüklenemezse açıklama */
function Bolum({ mode, aktif, children }: { mode: Mode; aktif: boolean; children: ReactNode }) {
  return (
    <BolumSiniri mode={mode} aktif={aktif}>
      <Suspense fallback={aktif ? <BolumYukleniyor mode={mode} /> : null}>{children}</Suspense>
    </BolumSiniri>
  );
}

/**
 * 6502 die görünümü, CPU16 tezgâhı, CPU16 kartı ve 8 bit hesap makinesi arasında geçiş. Die görünümü
 * ilk açıldığında yüklenir, sonra bağlı kalır, başka bölüme geçince yalnız durdurulur. İki 3D kart
 * bölümü aynı görünümü kullanır (BoardView), aynı anda yalnız biri açıktır.
 */
export function Root() {
  const [mode, setMode] = useState<Mode>(modeFromHash);
  const [dieAcildi, setDieAcildi] = useState(mode === "6502");
  if (mode === "6502" && !dieAcildi) setDieAcildi(true);
  useEffect(() => {
    const onHash = () => setMode(modeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (mode !== "6502" && useApp.getState().running) {
      sim.pause();
      useApp.setState({ running: false });
    }
  }, [mode]);
  return (
    <>
      {dieAcildi && (
        <Bolum mode="6502" aktif={mode === "6502"}>
          <App active={mode === "6502"} />
        </Bolum>
      )}
      {mode === "cpu16" && (
        <Bolum mode="cpu16" aktif>
          <Cpu16Bench />
        </Bolum>
      )}
      {mode === "kart" && (
        <Bolum key="kart" mode="kart" aktif>
          <BoardView key="cpu16" tur="cpu16" />
        </Bolum>
      )}
      {mode === "hesap" && (
        <Bolum key="hesap" mode="hesap" aktif>
          <BoardView key="hesap" tur="hesap" />
        </Bolum>
      )}
      <Baslangic mode={mode} />
    </>
  );
}
