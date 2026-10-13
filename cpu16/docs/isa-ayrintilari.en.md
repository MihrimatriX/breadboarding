# CPU16 instruction set details (phase 1)

> The bit-level behavior of the opcode map in `spec.md`. The reference emulator (`cpu16/emu/cpu.ts`) implements this document; if you find a contradiction, both get fixed together.

## Registers and flags

- `r0`–`r7`, 16 bits. By convention `r6` = sp and `r7` = lr. In hardware only PUSH/POP/RETI/SWI/IRQ (`r6`) and JAL (`r7`) know about these roles.
- PC: a byte address, always even. Reset: all registers 0, PC = `0x0000`, flags 0 (interrupts disabled).
- Flag word (the format pushed on the stack): `bit0 V, bit1 C, bit2 Z, bit3 N, bit4 I`.

## Which instructions change the flags

| Instruction | N | Z | C | V |
|---|---|---|---|---|
| ADD ADC SUB SBC CMP NEG ADDI CMPI | ✔ | ✔ | ✔ | ✔ |
| AND OR XOR MOV NOT SXB | ✔ | ✔ | - | - |
| SHL SHR SAR ROL ROR | ✔ | ✔ | bit shifted out | 0 |
| LI LUI LW LBU SW SB branches JAL JALR PUSH POP | - | - | - | - |
| RETI | restored from the stack |

- **In subtraction, C = "no borrow"** (ARM style): after `SUB a, b`, `C = 1` ⇔ `a ≥ b` (unsigned). `SBC`: `a − b − (1 − C)`. A 32-bit subtraction is therefore `SUB` + `SBC`.
- `ROL`/`ROR` rotate **through carry** (17 bits): a 32-bit shift = `SHL low` + `ROL high`.
- `ADDI` updates the flags, which gives the `ADDI r, r, -1` + `BNE` loop pattern.

## Memory access

- Little-endian. `LW`/`SW` **ignore bit 0 of the address** (no unaligned access; in hardware the A0 address line is not used for word accesses).
- Offsets: `LW`/`SW`/`JALR` 6 bits × 2 → −64..+62 bytes; `LBU`/`SB` 6 bits → −32..+31 bytes.
- `0xFF00`: UART data register. In the phase 1 emulator a byte written here goes to the console.

## Branches and calls

- Targets are computed **relative to the next instruction** (PC+2): `target = PC + 2 + offset × 2`.
  `Bcc` reaches ±256 bytes (−128..+127 instructions), `JAL` ±4 KB.
- `JAL`: `lr = PC + 2`. `JALR rd, rs1, ofs`: the target `rs1 + ofs` is read first, then `rd = PC + 2` is written.
- `RET` = `JALR lr, lr, 0`. Far call: `LI r5, func` + `JALR lr, r5, 0`.
- Condition codes (the `cond` field):

| # | Name | Condition | # | Name | Condition |
|---|---|---|---|---|---|
| 0 | EQ | Z | 8 | HI | C ∧ ¬Z (unsigned >) |
| 1 | NE | ¬Z | 9 | LS | ¬C ∨ Z (unsigned ≤) |
| 2 | CS | C (unsigned ≥) | 10 | GE | N = V |
| 3 | CC | ¬C (unsigned <) | 11 | LT | N ≠ V |
| 4 | MI | N | 12 | GT | ¬Z ∧ N = V |
| 5 | PL | ¬N | 13 | LE | Z ∨ N ≠ V |
| 6 | VS | V | 14 | AL | always (`B`) |
| 7 | VC | ¬V | 15 | NV | never (the assembler does not emit it) |

## Stack and interrupts

- The stack **grows downward**, and `sp` points at the last word written: `PUSH` = `sp −= 2; [sp] = r`, `POP` = `r = [sp]; sp += 2`.
- Vectors: `0x0000` reset, `0x0002` IRQ, `0x0004` SWI. Each holds a single `B`/`JAL` instruction.
- **Interrupt entry** (IRQ if `I = 1` at an instruction boundary; SWI always): `PUSH PC`, `PUSH flags`, `I = 0`, `PC = vector`.
- `RETI`: pops the flags, then the PC (I returns to its previous state).
- The IRQ line is **level-triggered**: a device holds the line until the handler acknowledges it.
- `HALT` stops the processor; an IRQ that arrives while `I = 1` wakes it up (waiting for the keyboard costs no power and no cycles).

## Illegal instructions

Opcodes 2 and 15, STACK with `f3 ≥ 2`, SYS with `f3 = 7`. The emulator stops and reports the address in `illegalAt`; in hardware the microcode routes these combinations to the `ILLEGAL` step and the clock stops. (`cond = 15` is legal. It is NV: the condition unit naturally produces "never" for it; see `mikromimari.md`.)
