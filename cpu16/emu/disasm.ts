// CPU16 disassembler: 16 bitlik komut kelimesini as16 sözdizimine çevirir.

import { OP, ALU_F3, ALU2_F3, CONDS, f } from "./isa.ts";

const R = (n: number) => `r${n}`;
const hex = (n: number) => "0x" + (n & 0xffff).toString(16).toUpperCase().padStart(4, "0");
const off = (n: number) => (n < 0 ? `-${-n}` : `+${n}`);

/** `pc`: komutun adresi (dallanma hedeflerini mutlak göstermek için). */
export function disassemble(w: number, pc = 0): string {
  const rd = f.rd(w), rs1 = f.rs1(w), rs2 = f.rs2(w), f3 = f.f3(w);
  const next = (pc + 2) & 0xffff;
  switch (f.op(w)) {
    case OP.ALU:
      return f3 === 7 ? `CMP ${R(rs1)}, ${R(rs2)}` : `${ALU_F3[f3]} ${R(rd)}, ${R(rs1)}, ${R(rs2)}`;
    case OP.ALU2:
      return `${ALU2_F3[f3]} ${R(rd)}, ${R(rs1)}`;
    case OP.ADDI:
      return `ADDI ${R(rd)}, ${R(rs1)}, ${f.imm6(w)}`;
    case OP.LI:
      return `${f.h(w) ? "LUI" : "LI"} ${R(rd)}, 0x${f.imm8(w).toString(16).toUpperCase()}`;
    case OP.LW:
      return `LW ${R(rd)}, [${R(rs1)}${off(f.imm6(w) * 2)}]`;
    case OP.SW:
      return `SW ${R(rd)}, [${R(rs1)}${off(f.imm6(w) * 2)}]`;
    case OP.LBU:
      return `LBU ${R(rd)}, [${R(rs1)}${off(f.imm6(w))}]`;
    case OP.SB:
      return `SB ${R(rd)}, [${R(rs1)}${off(f.imm6(w))}]`;
    case OP.BCC: {
      const c = f.cond(w);
      if (c > 14) return `.word ${hex(w)}`;
      return `B${c === 14 ? "" : CONDS[c]} ${hex(next + f.off8(w) * 2)}`;
    }
    case OP.JAL:
      return `JAL ${hex(next + f.off12(w) * 2)}`;
    case OP.JALR:
      if (rd === 7 && rs1 === 7 && f.imm6(w) === 0) return "RET";
      return `JALR ${R(rd)}, ${R(rs1)}, ${f.imm6(w) * 2}`;
    case OP.CMPI:
      return `CMPI ${R((w >> 9) & 7)}, ${f.imm9(w)}`;
    case OP.STACK:
      if (f3 === 0) return `PUSH ${R(rs1)}`;
      if (f3 === 1) return `POP ${R(rd)}`;
      return `.word ${hex(w)}`;
    case OP.SYS:
      switch (f3) {
        case 0: return "NOP";
        case 1: return "HALT";
        case 2: return "EI";
        case 3: return "DI";
        case 4: return "RETI";
        case 5: return "SWI";
        case 6: return `SXB ${R(rd)}, ${R(rs1)}`;
        default: return `.word ${hex(w)}`;
      }
    default:
      return `.word ${hex(w)}`;
  }
}
