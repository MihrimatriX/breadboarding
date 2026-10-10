import { assemble } from "./asm6502";

/** Hazır 6502 programları. $0000'dan yüklenir; reset vektörü ($FFFC) 0 olduğu için oradan başlar. */
export interface Program {
  id: string;
  name: string;
  description: string;
  source: string;
  bytes: number[];
}

const make = (id: string, name: string, description: string, source: string): Program => ({
  id, name, description, source, bytes: assemble(source).bytes,
});

export const PROGRAMS: Program[] = [
  make("counter", "Sayaç", "X'i sürekli artırır; $10 = X, $11 = X + 2", `; X yazmacını sayaç olarak kullan
        LDX #$00
loop:   INX
        STX $10        ; $10 = X
        TXA
        CLC
        ADC #$02
        STA $11        ; $11 = X + 2
        JMP loop`),
  make("sum", "Toplam 1..10", "1'den 10'a kadar toplar, sonucu $20'ye yazar (55 = $37)", `        LDA #$00
        LDX #10
loop:   STX $21
        CLC
        ADC $21        ; A += X
        DEX
        BNE loop
        STA $20        ; sonuç
done:   JMP done`),
  make("stack", "Yığın (JSR/RTS)", "Alt program çağırır; dönüş adresi yığın sayfasına ($01FC-$01FD) yazılır", `        LDX #$00
loop:   JSR sub
        INX
        JMP loop
sub:    INC $30
        RTS`),
];
