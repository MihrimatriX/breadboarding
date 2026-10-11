export type Mode = "6502" | "cpu16" | "kart" | "hesap";

export function modeFromHash(): Mode {
  if (location.hash === "#cpu16") return "cpu16";
  if (location.hash === "#kart") return "kart";
  if (location.hash === "#hesap") return "hesap";
  return "6502";
}

/** Uygulamanın bölümleri arasında geçiş: 6502 die görünümü, CPU16 tezgâhı, CPU16 kartı (3D) ve 8 bit hesap makinesi (3D). */
export function ModeSwitch({ mode }: { mode: Mode }) {
  return (
    <nav className="modes" aria-label="Bölüm">
      <a href="#6502" aria-current={mode === "6502" ? "page" : undefined}>6502 die</a>
      <a href="#cpu16" aria-current={mode === "cpu16" ? "page" : undefined}>CPU16 tezgâhı</a>
      <a href="#kart" aria-current={mode === "kart" ? "page" : undefined}>CPU16 kartı 3D</a>
      <a href="#hesap" aria-current={mode === "hesap" ? "page" : undefined}>8 bit hesap 3D</a>
    </nav>
  );
}
