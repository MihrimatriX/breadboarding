import { assemble } from "./asm6502";
import type { IkiDil } from "../ui/ceviri";

/** Hazır 6502 programları. $0000'dan yüklenir; reset vektörü ($FFFC) 0 olduğu için oradan başlar. */
export interface Program {
  id: string;
  name: IkiDil;
  description: IkiDil;
  /** iki dilde yalnız yorumlar farklı; baytlar aynı */
  source: IkiDil;
  bytes: number[];
}

const make = (id: string, name: IkiDil, description: IkiDil, source: IkiDil): Program => ({
  id, name, description, source, bytes: assemble(source.tr).bytes,
});

const SAYAC = (yorum: string) => `; ${yorum}
        LDX #$00
loop:   INX
        STX $10        ; $10 = X
        TXA
        CLC
        ADC #$02
        STA $11        ; $11 = X + 2
        JMP loop`;

const TOPLAM = (yorum: string) => `        LDA #$00
        LDX #10
loop:   STX $21
        CLC
        ADC $21        ; A += X
        DEX
        BNE loop
        STA $20        ; ${yorum}
done:   JMP done`;

const YIGIN = `        LDX #$00
loop:   JSR sub
        INX
        JMP loop
sub:    INC $30
        RTS`;

export const PROGRAMS: Program[] = [
  make(
    "counter",
    { tr: "Sayaç", en: "Counter" },
    { tr: "X'i sürekli artırır; $10 = X, $11 = X + 2", en: "Keeps incrementing X; $10 = X, $11 = X + 2" },
    { tr: SAYAC("X yazmacını sayaç olarak kullan"), en: SAYAC("use the X register as a counter") },
  ),
  make(
    "sum",
    { tr: "Toplam 1..10", en: "Sum 1..10" },
    { tr: "1'den 10'a kadar toplar, sonucu $20'ye yazar (55 = $37)", en: "Adds 1 through 10 and writes the result to $20 (55 = $37)" },
    { tr: TOPLAM("sonuç"), en: TOPLAM("result") },
  ),
  make(
    "stack",
    { tr: "Yığın (JSR/RTS)", en: "Stack (JSR/RTS)" },
    { tr: "Alt program çağırır; dönüş adresi yığın sayfasına ($01FC-$01FD) yazılır", en: "Calls a subroutine; the return address is written to the stack page ($01FC-$01FD)" },
    { tr: YIGIN, en: YIGIN },
  ),
];
