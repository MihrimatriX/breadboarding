export type Mode = "6502" | "cpu16";

export function modeFromHash(): Mode {
  return location.hash === "#cpu16" ? "cpu16" : "6502";
}

/** Uygulamanın iki bölümü arasında geçiş: 6502 die görünümü ve CPU16 tezgâhı. */
export function ModeSwitch({ mode }: { mode: Mode }) {
  return (
    <nav className="modes" aria-label="Bölüm">
      <a href="#6502" aria-current={mode === "6502" ? "page" : undefined}>6502 die</a>
      <a href="#cpu16" aria-current={mode === "cpu16" ? "page" : undefined}>CPU16 tezgâhı</a>
    </nav>
  );
}
