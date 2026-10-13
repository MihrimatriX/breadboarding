// CPU16 tezgâhı: iki kip arasında seçim.
//   Anakart + BIOS (Faz 6–7): bank'lı bellek (32 KB EEPROM + 128 KB RAM), VGA, PS/2, UART, BIOS ve önyükleyici.
//   Düz bellek (Faz 1): 64 KB düz RAM'li referans emülatör; Faz 1 örnek programları bunda çalışır.
// Kip seyrek değişir: araç çubuğunda o anki kipi gösteren tek bir açılır düğme.

import { useState } from "react";
import { sec, useDil, useT, type IkiDil } from "../ui/ceviri";
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

const KIPLER: { k: Kind; ad: IkiDil; not: IkiDil }[] = [
  {
    k: "machine",
    ad: { tr: "Anakart + BIOS", en: "Motherboard + BIOS" },
    not: { tr: "BIOS'lu tam makine: VGA, klavye, UART, EEPROM, önbellek", en: "Full machine with BIOS: VGA, keyboard, UART, EEPROM, cache" },
  },
  {
    k: "flat",
    ad: { tr: "Düz bellek", en: "Flat memory" },
    not: { tr: "64 KB düz RAM; Faz 1 örnek programları", en: "64 KB flat RAM; Phase 1 example programs" },
  },
];

export function Cpu16Bench() {
  const t = useT();
  const dil = useDil();
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
    <Menu label={sec(KIPLER.find((x) => x.k === kind)!.ad, dil)} title={t("Makine kipi", "Machine mode")}>
      <p className="menu-baslik">{t("Makine kipi", "Machine mode")}</p>
      <div className="menu-col" role="group" aria-label={t("CPU16 kipi", "CPU16 mode")}>
        {KIPLER.map((x) => (
          <button key={x.k} className={`menu-secenek${kind === x.k ? " on" : ""}`} aria-pressed={kind === x.k} onClick={() => pick(x.k)}>
            <b>{sec(x.ad, dil)}</b>
            <span>{sec(x.not, dil)}</span>
          </button>
        ))}
      </div>
    </Menu>
  );
  return kind === "machine" ? <MachineBench switcher={switcher} /> : <FlatBench switcher={switcher} />;
}
