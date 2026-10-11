// ALU kod çözme ROM'unun içeriği. Adres: [4:0] ALU işlemi, [5] h (IR bit 8), [6] C bayrağı.
// Rastgele kapılarla kod çözmek yerine 3 küçük Flash kullanılır (mikrokodla aynı fikir):
//   ROM 0: INVA PASSB INVB CIN SETSCV SINL SINHC SAREN
//   ROM 1: FLO0..3 (düşük bayt doğruluk tablosu), RS0 RS1 (sonuç seçimi)
//   ROM 2: FHI0..7 (yüksek bayt doğruluk tablosu; giriş 4..7 = a7 = 1 iken)

import { ALUOP } from "../micro/control.ts";

/** Mantık biriminin 4 girişli doğruluk tabloları: indeks = a + 2·b */
export const LUT = { ZERO: 0, AND: 0b1000, OR: 0b1110, XOR: 0b0110, PASSA: 0b1010, NOTA: 0b0101, PASSB: 0b1100 } as const;
/** Sonuç seçici */
export const RS = { SUM: 0, LOGIC: 1, SHL: 2, SHR: 3 } as const;

const rep = (code: number) => code | (code << 4);

export interface AluControl {
  invA: boolean; passB: boolean; invB: boolean; cin: boolean; setsCV: boolean;
  sinL: boolean; sinHC: boolean; sarEn: boolean;
  fLo: number; fHi: number; rs: number;
}

export function aluControl(op: number, h: boolean, c: boolean): AluControl {
  const k: AluControl = {
    invA: false, passB: true, invB: false, cin: false, setsCV: false,
    sinL: false, sinHC: false, sarEn: false, fLo: LUT.ZERO, fHi: LUT.ZERO, rs: RS.LOGIC,
  };
  const arith = (invB: boolean, cin: boolean) => Object.assign(k, { rs: RS.SUM, invB, cin, setsCV: true });
  const logic = (code: number) => Object.assign(k, { rs: RS.LOGIC, fLo: code, fHi: rep(code) });
  switch (op) {
    case ALUOP.ADD: arith(false, false); break;
    case ALUOP.ADC: arith(false, c); break;
    case ALUOP.SUB: case ALUOP.CMP: arith(true, true); break;
    case ALUOP.SBC: arith(true, c); break;
    case ALUOP.NEG: Object.assign(k, { rs: RS.SUM, invA: true, passB: false, cin: true, setsCV: true }); break;
    case ALUOP.AND: logic(LUT.AND); break;
    case ALUOP.OR: logic(LUT.OR); break;
    case ALUOP.XOR: logic(LUT.XOR); break;
    case ALUOP.MOV: logic(LUT.PASSA); break;
    case ALUOP.NOT: logic(LUT.NOTA); break;
    case ALUOP.SHL: Object.assign(k, { rs: RS.SHL, setsCV: true }); break;
    case ALUOP.ROL: Object.assign(k, { rs: RS.SHL, setsCV: true, sinL: c }); break;
    case ALUOP.SHR: Object.assign(k, { rs: RS.SHR, setsCV: true }); break;
    case ALUOP.SAR: Object.assign(k, { rs: RS.SHR, setsCV: true, sarEn: true }); break;
    case ALUOP.ROR: Object.assign(k, { rs: RS.SHR, setsCV: true, sinHC: c }); break;
    case ALUOP.SXB: Object.assign(k, { rs: RS.LOGIC, fLo: LUT.PASSA, fHi: 0xf0 }); break;
    case ALUOP.MERGE: Object.assign(k, { rs: RS.LOGIC, fLo: h ? LUT.PASSA : LUT.PASSB, fHi: h ? rep(LUT.PASSB) : LUT.ZERO }); break;
  }
  return k;
}

/** 3 ROM imajı (her biri 128 bayt anlamlı; Flash'ın geri kalanı 0xFF) */
export function aluRomImages(): Uint8Array[] {
  const roms = [0, 1, 2].map(() => new Uint8Array(128));
  for (let addr = 0; addr < 128; addr++) {
    const k = aluControl(addr & 31, ((addr >> 5) & 1) === 1, ((addr >> 6) & 1) === 1);
    const bit = (v: boolean, i: number) => (v ? 1 << i : 0);
    roms[0][addr] = bit(k.invA, 0) | bit(k.passB, 1) | bit(k.invB, 2) | bit(k.cin, 3) | bit(k.setsCV, 4) | bit(k.sinL, 5) | bit(k.sinHC, 6) | bit(k.sarEn, 7);
    roms[1][addr] = k.fLo | (k.rs << 4);
    roms[2][addr] = k.fHi;
  }
  return roms;
}
