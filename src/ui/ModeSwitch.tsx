export type Mode = "6502" | "cpu16" | "kart";

export function modeFromHash(): Mode {
  if (location.hash === "#cpu16") return "cpu16";
  if (location.hash === "#kart") return "kart";
  return "6502";
}

/** Uygulamanın bölümleri arasında geçiş: 6502 die görünümü, CPU16 tezgâhı ve CPU16 kartı (3D). */
export function ModeSwitch({ mode }: { mode: Mode }) {
  return (
    <nav className="modes" aria-label="Bölüm">
      <a href="#6502" aria-current={mode === "6502" ? "page" : undefined}>6502 die</a>
      <a href="#cpu16" aria-current={mode === "cpu16" ? "page" : undefined}>CPU16 tezgâhı</a>
      <a href="#kart" aria-current={mode === "kart" ? "page" : undefined}>CPU16 kartı 3D</a>
    </nav>
  );
}
