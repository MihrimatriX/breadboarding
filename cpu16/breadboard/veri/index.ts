// CPU16 breadboard verileri, kart kart: ÜRETİLİR (npm run cpu16 -- breadboard --uret).

import type { BbVeri } from "../../board/breadboard/plan.ts";
import { VERI as bellek } from "./bellek.ts";
import { VERI as clk } from "./clk.ts";
import { VERI as cpu } from "./cpu.ts";
import { VERI as gc } from "./gc.ts";
import { VERI as kyb } from "./kyb.ts";
import { VERI as onbellek } from "./onbellek.ts";
import { VERI as video } from "./video.ts";

export const BB_VERILERI: Record<string, BbVeri> = { cpu, clk, bellek, onbellek, gc, video, kyb };
