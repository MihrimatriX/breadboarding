// Bölümlerin kodu ayrı parçalarda: bir bölüm ilk açıldığında yüklenir (Root.tsx'te React.lazy).
// 6502 die, three ve postprocessing'i; kart bölümleri three'yi ve devre modellerini; CPU16 tezgâhı
// yalnız emülatörü ve derleyiciyi getirir. Üst çubukta bir bölümün üstüne gelince kodu önceden
// istenir: tıklayınca çoğu zaman hazırdır.

import type { Mode } from "./ui/ModeSwitch";

export const yukle6502 = () => import("./App");
export const yukleTezgah = () => import("./cpu16/Cpu16Bench");
export const yukleKart = () => import("./board3d/BoardView");

const YUKLEYICI: Record<Mode, () => Promise<unknown>> = {
  "6502": yukle6502,
  cpu16: yukleTezgah,
  kart: yukleKart,
  hesap: yukleKart,
};

/** Bölümün kodunu arka planda iste (hata olursa bölüm açılırken yeniden denenir) */
export function onYukle(mode: Mode): void {
  YUKLEYICI[mode]().catch(() => {});
}
