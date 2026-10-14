// PCB görünümünün bakır yollarını kazıyan worker (pcbYol.ts kazi): bütün bilgisayarda ~4 700 yol, ~10 s.
// Ana iş parçacığı takılmasın diye burada; sonuçlar ~100 ms'lik partiler hâlinde gelir, yollar kazındıkça
// görünür (pcbKazi.ts).

import type { BoardLayout } from "../../cpu16/board/layout";
import { kazi, type Kazinti } from "./pcbYol";
import type { WireEdge } from "./wires";

export interface KaziIstegi {
  lay: Pick<BoardLayout, "cards" | "chips" | "passives">;
  edges: WireEdge[];
}

export type KaziYaniti = { tip: "parti"; kazintilar: Kazinti[] } | { tip: "bitti" };

self.onmessage = (e: MessageEvent<KaziIstegi>) => {
  let parti: Kazinti[] = [];
  let t0 = performance.now();
  for (const k of kazi(e.data.lay, e.data.edges)) {
    parti.push(k);
    if (performance.now() - t0 > 100) {
      postMessage({ tip: "parti", kazintilar: parti } satisfies KaziYaniti);
      parti = [];
      t0 = performance.now();
    }
  }
  postMessage({ tip: "parti", kazintilar: parti } satisfies KaziYaniti);
  postMessage({ tip: "bitti" } satisfies KaziYaniti);
};
