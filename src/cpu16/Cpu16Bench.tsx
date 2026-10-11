// CPU16 tezgâhı: iki kip arasında seçim.
//   Anakart + BIOS (Faz 6–7): bank'lı 1 MB bellek, Flash, VGA, PS/2, UART, BIOS ve önyükleyici.
//   Düz bellek (Faz 1): 64 KB düz RAM'li referans emülatör; Faz 1 örnek programları bunda çalışır.

import { useState } from "react";
import { FlatBench } from "./FlatBench";
import { MachineBench } from "./MachineBench";

type Kind = "machine" | "flat";
const KEY = "silikon3d.cpu16.kip";

function savedKind(): Kind {
  try {
    return localStorage.getItem(KEY) === "flat" ? "flat" : "machine";
  } catch {
    return "machine";
  }
}

export function Cpu16Bench() {
  const [kind, setKind] = useState<Kind>(savedKind);
  const pick = (k: Kind) => {
    setKind(k);
    try {
      localStorage.setItem(KEY, k);
    } catch {
      // depolama kapalı: seçim sadece bu oturumda geçerli
    }
  };
  const switcher = (
    <div className="seg" role="group" aria-label="CPU16 kipi">
      <button className={kind === "machine" ? "on" : ""} aria-pressed={kind === "machine"} onClick={() => pick("machine")}
        title="BIOS'lu tam makine: VGA, klavye, UART, Flash, önbellek">Anakart + BIOS</button>
      <button className={kind === "flat" ? "on" : ""} aria-pressed={kind === "flat"} onClick={() => pick("flat")}
        title="64 KB düz RAM, Faz 1 örnek programları">Düz bellek</button>
    </div>
  );
  return kind === "machine" ? <MachineBench switcher={switcher} /> : <FlatBench switcher={switcher} />;
}
