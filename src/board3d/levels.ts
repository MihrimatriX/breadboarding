// Lojik seviye renkleri: 3D görünüm ve şemalar aynı dili konuşur.

export const LEVEL_COLOR = ["#3d4b5e", "#ff2a55", "#9d8cff", "#e6e600"] as const;
/** Şemalarda (SVG) aynı seviyeler temanın renkleriyle: styles.css'teki --lv0..--lv3 (style ile verilir) */
export const LEVEL_VAR = ["var(--lv0)", "var(--lv1)", "var(--lv2)", "var(--lv3)"] as const;
export const LEVEL_NAME = ["0", "1", "Z", "X"] as const;
export const levelOf = (values: Uint8Array | null, net: number): number => (net === 0 ? 0 : net === 1 ? 1 : values ? values[net] ?? 3 : 3);
export const hex4 = (n: number) => (Number.isNaN(n) ? "????" : (n & 0xffff).toString(16).toUpperCase().padStart(4, "0"));
