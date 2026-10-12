// Breadboard planından 3D görünümün yerleşimi (BoardLayout, mm): çipler, pasifler ve bloklar
// deliklerine oturmuş olarak. 3D sahne PCB'deki gibi aynı parçaları çizer (gövde, bacaklar, canlı
// seviyeler, seçim); board'ları ve atlama tellerini ayrıca çizer (src/board3d/Breadboard3D.tsx).
// Birden çok pano (CPU16'nın kartları) aynı yerleşimde, her biri kendi kaydırmasıyla durur.

import type { Board, ChipInstance, Passive } from "../board.ts";
import { packageSize, passiveShape, type BlockPlace, type BoardLayout, type ChipPlace, type PassivePlace, type PinPlace } from "../layout.ts";
import { ledRengi, PASSIVES } from "../passives.ts";
import { ADIM, BX_ADIM, KENAR_ALT, KENAR_SAG, KENAR_SOL, KENAR_UST, mmX, mmY, PAY, type BbKonum } from "./geometri.ts";
import { izgaraSiniri } from "./yonlendirme.ts";
import type { BbYerlesim } from "./yerlesim.ts";

/** Board'un mm cinsinden dikdörtgeni (taban plakasında) */
export function boardDikdortgeni(b: Pick<BbKonum, "x0" | "y0">): { x: number; y: number; w: number; h: number } {
  const x = mmX(b.x0 + KENAR_SOL);
  const y = mmY(b.y0 + KENAR_UST);
  return { x, y, w: (KENAR_SAG - KENAR_SOL) * ADIM, h: (KENAR_ALT - KENAR_UST) * ADIM };
}

/** Taban plakasının boyu (mm): board'lar + her yanda pay (kenardan dolanan teller dahil) */
export function plakaBoyu(p: { yerlesim: Pick<BbYerlesim, "boards"> }): { w: number; h: number } {
  const s = izgaraSiniri(p.yerlesim);
  const xs = Math.max(...p.yerlesim.boards.map((b) => b.x0));
  const ys = Math.max(...p.yerlesim.boards.map((b) => b.y0));
  return { w: Math.max(mmX(s.x1 + 0.5), mmX(xs + BX_ADIM + KENAR_SOL)) + PAY / 2, h: Math.max(mmY(s.y1 + 0.5), mmY(ys + KENAR_ALT)) + PAY / 2 };
}

export interface PanoYerlesimSecenekleri {
  /** parçaların kartı (3D'de seçim ve bilgi paneli) */
  kart: string;
  /** panonun taban plakasının sol üst köşesi (mm) */
  ox?: number;
  oy?: number;
}

/** Bir panonun parçaları ve blokları (mm, kaydırılmış) */
export function panoParcalari(board: Board, y: BbYerlesim, o: PanoYerlesimSecenekleri): Pick<BoardLayout, "blocks" | "chips" | "passives"> {
  const ox = o.ox ?? 0;
  const oy = o.oy ?? 0;
  const X = (gx: number) => ox + mmX(gx);
  const Y = (gy: number) => oy + mmY(gy);
  const cipler = new Map<string, ChipInstance>(board.chips.map((c) => [c.ref, c]));
  const pasifler = new Map<string, Passive>(board.passives.map((p) => [p.ref, p]));
  const chips: ChipPlace[] = [];
  const passives: PassivePlace[] = [];
  const kart = o.kart;
  const pinYeri = (gx: number, gy: number) => ({ x: X(gx), y: Y(gy) });
  for (const p of y.parcalar) {
    const xs = p.bacaklar.map((b) => X(b.X));
    const ys = p.bacaklar.map((b) => Y(b.Y));
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    if (p.cipMi) {
      const ci = cipler.get(p.ref)!;
      const s = packageSize(ci);
      const pins: PinPlace[] = ci.def.pins.map((q) => {
        const b = p.bacaklar.find((x) => x.pin === q.num)!;
        return { num: q.num, name: q.name, net: ci.nets[q.name] ?? -1, ...pinYeri(b.X, b.Y) };
      });
      chips.push({ ref: p.ref, part: ci.def.part, card: kart, block: ci.block, role: ci.role, x: cx - s.w / 2, y: cy - s.h / 2, w: s.w, h: s.h, pins });
      continue;
    }
    // netlistteki pasif ya da yalnız fiziksel parça (ek: netleri kendi tablosunda)
    const x: Passive = pasifler.get(p.ref) ?? { ref: p.ref, card: kart, part: p.part, pins: Object.fromEntries(Object.entries(p.ek ?? {}).map(([k, v]) => [k, v])), role: p.rol, block: p.blok };
    const adlar = new Map((PASSIVES[x.part]?.pins ?? []).map((q) => [q.num, q.name]));
    const s = passiveShape(x.part, new Set(p.bacaklar.map((b) => b.pin)).size);
    // iki bacaklılar ve SIP: bacaklar y yönünde diziliyse dikey
    const dikey = p.bacaklar.length >= 2 && p.tur !== "dip" && p.tur !== "gosterge" && p.tur !== "buton" && Math.max(...xs) === Math.min(...xs);
    const w = dikey ? s.h : s.w;
    const h = dikey ? s.w : s.h;
    passives.push({
      ref: p.ref, part: x.part, card: kart, block: x.block, role: x.role, kind: s.kind,
      x: cx - w / 2, y: cy - h / 2, w, h, height: s.height, vertical: dikey,
      ...(p.ters ? { ters: true } : {}),
      ...(p.bagliCip ? { chip: p.bagliCip } : {}),
      ...(s.kind === "led" || s.kind === "cubuk" ? { led: ledRengi(x.role) } : {}),
      pins: p.bacaklar.map((b) => ({ num: b.pin, name: adlar.get(b.pin) ?? String(b.pin), net: x.pins[String(b.pin)] ?? -1, ...pinYeri(b.X, b.Y) })),
    });
  }
  // bloklar: parçalarının kapladığı dikdörtgen (kamera bir bloğa giderken)
  const kutular = new Map<string, [number, number, number, number]>();
  for (const q of [...chips, ...passives]) {
    const k = kutular.get(q.block);
    const b: [number, number, number, number] = [q.x, q.y, q.x + q.w, q.y + q.h];
    kutular.set(q.block, k ? [Math.min(k[0], b[0]), Math.min(k[1], b[1]), Math.max(k[2], b[2]), Math.max(k[3], b[3])] : b);
  }
  const blocks: BlockPlace[] = [...kutular].map(([name, [x0, y0, x1, y1]]) => ({ card: kart, name, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }));
  return { blocks, chips, passives };
}

/** Tek panonun yerleşimi (hesap makinesi) */
export function bbBoardLayout(board: Board, y: BbYerlesim, kart: string): BoardLayout {
  const { blocks, chips, passives } = panoParcalari(board, y, { kart });
  const { w, h } = plakaBoyu({ yerlesim: y });
  return { cards: [], rows: [], blocks, chips, passives, width: w, height: h };
}
