// Işın kipi (worker'da): VGA konnektörünün pinlerinden monitörün gördüğü görüntü. Senkron hatları
// çipler sürer; renk hatları direnç DAC'ının çıkışıdır (simülasyonda pasiflerin değeri yoktur), bu
// yüzden her renk pini için ona bağlı dirençler bulunur ve öbür uçlarındaki lojik seviyelerden
// 75 Ω monitör girişindeki gerilim hesaplanır. Monitör gibi senkronlara kilitlenir: HSYNC bitince
// 48 piksel arka sundurma, VSYNC bitince 33 satır arka sundurma, sonra görünür alan.

import type { Board } from "../../cpu16/board/board";

/** Direnç değeri parça adından: R_680 → 680, R_1K3 → 1300, R_10K → 10 000 */
export function resistance(part: string): number | null {
  const m = /^R_(\d+)(?:([KM])(\d*))?$/.exec(part);
  if (!m) return null;
  const mul = m[2] === "K" ? 1e3 : m[2] === "M" ? 1e6 : 1;
  return Number(`${m[1]}${m[2] && m[3] ? `.${m[3]}` : ""}`) * mul;
}

export interface DacInput {
  net: number;
  ohms: number;
}

export interface VgaOutput {
  hsync: number;
  vsync: number;
  /** kırmızı, yeşil, mavi: her biri dirençli girişler */
  channels: DacInput[][];
}

/** VGA konnektörünü (RED, GREEN, BLUE, HSYNC, VSYNC pinleri olan pasif) ve DAC dirençlerini bulur */
export function findVgaOutput(board: Board, pinNames: (part: string) => string[] | null): VgaOutput | null {
  for (const p of board.passives) {
    const names = pinNames(p.part);
    if (!names) continue;
    const netOf = (name: string) => {
      const i = names.indexOf(name);
      return i >= 0 ? p.pins[String(i + 1)] : undefined;
    };
    const [r, g, b, hs, vs] = ["RED", "GREEN", "BLUE", "HSYNC", "VSYNC"].map(netOf);
    if (r === undefined || g === undefined || b === undefined || hs === undefined || vs === undefined) continue;
    const dac = (net: number): DacInput[] =>
      board.passives.flatMap((q) => {
        const ohms = resistance(q.part);
        const nets = Object.values(q.pins);
        if (ohms === null || nets.length !== 2 || !nets.includes(net)) return [];
        const other = nets[0] === net ? nets[1] : nets[0];
        return other > 1 ? [{ net: other, ohms }] : [];
      });
    return { hsync: hs, vsync: vs, channels: [dac(r), dac(g), dac(b)] };
  }
  return null;
}

/** 75 Ω'luk monitör girişinde gerilim (V): 1 olan girişler 5 V */
export function dacVolts(inputs: readonly DacInput[], level: (net: number) => number): number {
  let g = 1 / 75;
  let i = 0;
  for (const x of inputs) {
    g += 1 / x.ohms;
    if (level(x.net) === 1) i += 5 / x.ohms;
  }
  return i / g;
}

export const VGA_W = 640;
export const VGA_H = 480;

export class Beam {
  readonly rgba = new Uint8ClampedArray(VGA_W * VGA_H * 4);
  x = 0;
  y = -1000;
  frames = 0;
  private lastH = 1;
  private lastV = 1;

  constructor(private readonly out: VgaOutput) {
    for (let i = 3; i < this.rgba.length; i += 4) this.rgba[i] = 255;
  }

  /** Piksel saatinin yükselen kenarından sonra çağrılır */
  sample(level: (net: number) => number): void {
    const h = level(this.out.hsync);
    const v = level(this.out.vsync);
    if (this.lastH === 0 && h === 1) {
      this.x = -48;
      this.y++;
    }
    if (this.lastV === 0 && v === 1) {
      this.y = -33;
      this.frames++;
    }
    this.lastH = h;
    this.lastV = v;
    const { x, y } = this;
    if (x >= 0 && x < VGA_W && y >= 0 && y < VGA_H) {
      const k = 4 * (y * VGA_W + x);
      for (let c = 0; c < 3; c++) this.rgba[k + c] = Math.min(255, Math.round((dacVolts(this.out.channels[c], level) / 0.7) * 255));
    }
    this.x++;
  }
}
