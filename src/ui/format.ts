export const h2 = (v: number) => v.toString(16).toUpperCase().padStart(2, "0");
export const h4 = (v: number) => v.toString(16).toUpperCase().padStart(4, "0");
export const flags = (p: number) =>
  "NV-BDIZC".split("").map((f, i) => ((p >> (7 - i)) & 1 ? f : f.toLowerCase())).join("");
export const hzLabel = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`);
