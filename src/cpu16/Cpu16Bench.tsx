// CPU16 tezgâhı: iki kip arasında seçim.
//   Anakart + BIOS (Faz 6–7): bank'lı bellek (32 KB EEPROM + 128 KB RAM), VGA, PS/2, UART, BIOS ve önyükleyici.
//   Düz bellek (Faz 1): 64 KB düz RAM'li referans emülatör; Faz 1 örnek programları bunda çalışır.
// Kip seyrek değişir: araç çubuğunda o anki kipi gösteren tek bir açılır düğme.

import { useState } from "react";
import { Menu } from "../ui/Shell";
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

const KIPLER: { k: Kind; ad: string; not: string }[] = [
  { k: "machine", ad: "Anakart + BIOS", not: "BIOS'lu tam makine: VGA, klavye, UART, EEPROM, önbellek" },
  { k: "flat", ad: "Düz bellek", not: "64 KB düz RAM; Faz 1 örnek programları" },
];

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
    <Menu label={KIPLER.find((x) => x.k === kind)!.ad} title="Makine kipi">
      <p className="menu-baslik">Makine kipi</p>
      <div className="menu-col" role="group" aria-label="CPU16 kipi">
        {KIPLER.map((x) => (
          <button key={x.k} className={`menu-secenek${kind === x.k ? " on" : ""}`} aria-pressed={kind === x.k} onClick={() => pick(x.k)}>
            <b>{x.ad}</b>
            <span>{x.not}</span>
          </button>
        ))}
      </div>
    </Menu>
  );
  return kind === "machine" ? <MachineBench switcher={switcher} /> : <FlatBench switcher={switcher} />;
}
