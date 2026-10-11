// ALU kod çözme tablosu: 7 bitlik adres → 24 ALU kontrol biti (AD0..AD23). Adres: [4:0] ALU işlemi
// (AOP), [5] h (IR bit 8), [6] C bayrağı. Donanımda ROM yok: kontrol.ts bu tablodan kapı devresi üretir
// (74HC138 kod çözücüler + VE/VEYA ağı) ve testler devrenin 128 adresin hepsinde tabloyla aynı
// olduğunu denetler. Bit düzeni:
//   bit 0..7  : INVA PASSB INVB CIN SETSCV SINL SINHC SAREN
//   bit 8..15 : FLO0..3 (düşük bayt doğruluk tablosu), RS0 RS1 (sonuç seçimi), 14 ve 15 her zaman 0
//   bit 16..23: FHI0..7 (yüksek bayt doğruluk tablosu; giriş 4..7 = a7 = 1 iken)

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

/** ALU kontrol bitlerinin konumları (CPU kartında AD<n> netleri) */
export const AD_BIT = {
  INVA: 0, PASSB: 1, INVB: 2, CIN: 3, SETSCV: 4, SINL: 5, SINHC: 6, SAREN: 7,
  FLO0: 8, RS0: 12, RS1: 13,
  FHI0: 16,
} as const;

/** Tablonun adres sayısı (5 bit işlem + h + C) */
export const ALU_ADRES = 128;

/** Bir adresin 24 bitlik kontrol kelimesi (bit düzeni dosyanın başında) */
export function aluKelimesi(addr: number): number {
  const k = aluControl(addr & 31, ((addr >> 5) & 1) === 1, ((addr >> 6) & 1) === 1);
  const bit = (v: boolean, i: number) => (v ? 1 << i : 0);
  const lo = bit(k.invA, 0) | bit(k.passB, 1) | bit(k.invB, 2) | bit(k.cin, 3) | bit(k.setsCV, 4) | bit(k.sinL, 5) | bit(k.sinHC, 6) | bit(k.sarEn, 7);
  return lo | ((k.fLo | (k.rs << 4)) << 8) | (k.fHi << 16);
}

/** Bütün tablo: 128 adres × 24 bit */
export function aluKodTablosu(): Uint32Array {
  return Uint32Array.from({ length: ALU_ADRES }, (_, a) => aluKelimesi(a));
}
