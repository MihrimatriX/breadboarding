// Hesap makinesinin breadboard görünümü: ortak motorun (cpu16/board/breadboard/gorunum.ts) tek panolu
// kullanımı. 3D sahne parçaları deliklerine oturmuş olarak çizer, board'ları ve telleri ayrıca.

import { bbBoardLayout as panoYerlesimi, boardDikdortgeni, plakaBoyu } from "../../cpu16/board/breadboard/gorunum.ts";
import type { BoardLayout } from "../../cpu16/board/layout.ts";
import type { BbPlani } from "./plan.ts";

export { boardDikdortgeni, plakaBoyu };

/** Hesap makinesinin breadboard yerleşimi (mm) */
export const bbBoardLayout = (plan: BbPlani): BoardLayout => panoYerlesimi(plan.kart.board, plan.yerlesim, "hesap");
