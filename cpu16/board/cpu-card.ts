// CPU kartı: docs/mikromimari.md'deki blok şemasının çip çip hali.
// Her blok burada gerçek 74HC çiplerine bağlanır; çıkan devre kapı seviyesinde çalıştırılıp
// saat döngüsü modeliyle (micro/datapath.ts) her döngüde karşılaştırılır.
//
// Kartta ROM yok: mikrokod ve ALU kod çözme tablosu kontrol.ts'de 74HC kapı devresine çevrilir ve
// gerçek çipler olarak yerleşir ("Kontrol birimi", "ALU kod çözücü" blokları). Çözücü çipleri
// boşalan yuvalara (eski ROM'lar U1, U3, U5, U7, U69–U71; adım 0 çözücüsü U10; ALU işlem bit 4
// seçicisi U68), kalanı ve kapıları kartın sonuna: kartın diğer çiplerinin referansları ROM'lu
// sürümdekiyle aynı kalır (deney rehberleri, belgeler).
//
// Zamanlama: kontrol register'ı (CR) saatin DÜŞEN kenarında kontrol biriminin çıkışlarını (MK0..31)
// örnekler; bütün durum register'ları YÜKSELEN kenarda yüklenir. Yükleme sinyalleri CR'den geldiği
// için saat yüksekken sabittir; bu yüzden "kapılı saat" (CLK ∧ yükle) parazitsizdir.
//
// Arka panel (backplane) sinyalleri: CLK, WR_WIN (saat düşükken ortadaki yazma penceresi), ~RESET, IRQ, A0..A15, DE0..DE7 (çift bayt), DO0..DO7
// (tek bayt), ~MRD, ~MWE_E, ~MWE_O, HALTED, FAULT.

import { AD_BIT } from "./alu-kod.ts";
import type { Board, ChipInstance } from "./board.ts";
import { KontrolYerlestirici, kontrolDevresi, type Cikis } from "./kontrol.ts";

export interface CpuCard {
  regs: ChipInstance[][]; // [r][0 = düşük bayt, 1 = yüksek bayt]
  ir: ChipInstance[];
  ta: ChipInstance[];
  tb: ChipInstance[];
  mar: ChipInstance[];
  pc: ChipInstance[];
  cr: ChipInstance[];
  /** kontrol biriminin MSI çipleri (74HC138, 74HC151; ertelenenler Board.finish()'te eklenir) */
  kontrol: ChipInstance[];
  flags: { nz: ChipInstance; cv: ChipInstance; i: ChipInstance };
  intHalt: ChipInstance;
  faultRun: ChipInstance;
  step: ChipInstance;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Sabit çıkışı (0/1) olan kontrol bitinin neti */
const netOf = (c: Cikis): string => (c === 0 ? "GND" : c === 1 ? "VCC" : c);

export function buildCpuCard(b: Board): CpuCard {
  b.card = "cpu";
  const n = (s: string) => b.n(s);
  const BUS = b.bus("BUS", 16);
  const CW = b.bus("CW", 32);
  const IR = b.bus("IR", 16);
  const TA = b.bus("TA", 16);
  const TB = b.bus("TB", 16);
  const A = b.bus("A", 16);
  b.block = "Register dosyası";
  b.pullDown(BUS, "iç veriyolu: sürülmeyince 0");

  // ---- saat, çalışma izni
  b.block = "Kontrol";
  const nCLK = b.not("CLK", "~CLK", "saat tersi");
  const RUN_R = n("RUN_R");
  const nCLKR = b.nand("CLK", RUN_R, "~CLKR", "kapılı ana saat");
  const CLKR = b.not(nCLKR, "CLKR", "kapılı ana saat");
  const gclk = (sig: number | string, name: string) => b.and(CLKR, sig, `CLK_${name}`, `${name} saati`);

  const END = CW[31], HALT = CW[29], ILLEGAL = CW[30];

  // ---- kontrol birimi (mikrokod: adım, komut, f3, COND, INT → MK0..31; ALU kod çözme: işlem, h,
  // C → AD0..23) ve kontrol register'ı. Kapılar şimdi eklenir, kartın sonunda paketlenir.
  const STEP = b.bus("STEP", 4);
  const COND = n("COND");
  const INT = n("INT");
  const devre = kontrolDevresi();
  const kb = new KontrolYerlestirici(b, devre);
  const cr: ChipInstance[] = [];
  for (let k = 0; k < 4; k++) {
    kb.yerlestir("komut"); // eski mikrokod ROM'u k'nın yuvası
    const c2: Record<string, number | string> = { "~OE": "GND", CP: nCLK };
    range(8).forEach((i) => {
      c2[`D${i}`] = netOf(devre.mk[8 * k + i]);
      c2[`Q${i}`] = CW[8 * k + i];
    });
    cr.push(b.place("74HC574", c2, `kontrol register'ı ${k}`));
  }

  // ---- adım sayacı: END'de 0 yüklenir
  const step = b.place("74HC161", {
    CP: "CLK", "~MR": "~RESET", D0: "GND", D1: "GND", D2: "GND", D3: "GND",
    "~PE": b.nand(END, RUN_R, "~STEP_CLR", "END: adımı sıfırla"),
    CEP: RUN_R, CET: "VCC", Q0: STEP[0], Q1: STEP[1], Q2: STEP[2], Q3: STEP[3],
  }, "mikro adım sayacı");
  kb.yerlestir("adim"); // adım çözücü: ~ADIM0 = adım 0 (kesme girişi aşağıda da kullanır)

  // ---- kesme, HALT, hata
  const IFLAG = n("IFLAG");
  const WAKE = b.and("IRQ", IFLAG, "WAKE", "IRQ ∧ I");
  const STEP0 = b.not("~ADIM0", "ADIM0", "adım 0");
  b.or(b.and(STEP0, WAKE, undefined, "INT seçimi"), b.and("~ADIM0", "INT_HOLD", undefined, "INT seçimi"), INT, "INT seçimi");
  const nWAKE = b.not(WAKE, "~WAKE", "uyanma");
  const intHalt = b.place("74HC74", {
    "1D": INT, "1CLK": "CLK", "~1PRE": "VCC", "~1CLR": "~RESET", "1Q": "INT_HOLD",
    "2D": b.or(b.and("HALTED", nWAKE, undefined, "HALT durumu"), b.and(HALT, RUN_R, undefined, "HALT durumu"), "D_HALTED", "HALT durumu"),
    "2CLK": "CLK", "~2PRE": "VCC", "~2CLR": "~RESET", "2Q": "HALTED", "~2Q": "~HALTED",
  }, "INT mandalı + HALT flip-flopu");
  const faultRun = b.place("74HC74", {
    "1D": b.or("FAULT", b.and(ILLEGAL, RUN_R, undefined, "yasadışı komut"), "D_FAULT", "yasadışı komut"),
    "1CLK": "CLK", "~1PRE": "VCC", "~1CLR": "~RESET", "1Q": "FAULT", "~1Q": "~FAULT",
    "2D": b.and("~FAULT", b.or("~HALTED", WAKE, undefined, "çalışma izni"), "RUN", "çalışma izni"),
    "2CLK": nCLK, "~2PRE": "~RESET", "~2CLR": "VCC", "2Q": RUN_R,
  }, "hata flip-flopu + çalışma izni (düşen kenarda)");

  // ---- veriyolu kaynağı çözücü
  b.place("74HC138", {
    A0: CW[0], A1: CW[1], A2: CW[2], "~E1": "GND", "~E2": "GND", E3: "VCC",
    "~Y1": "~SRC_REG", "~Y2": "~SRC_ALU", "~Y3": "~SRC_PC", "~Y4": "~SRC_MEM", "~Y5": "~SRC_IMM", "~Y6": "~SRC_FLAGS",
  }, "BUS alanı çözücü (veriyolu sürücüsü seçimi)");

  // ---- register dosyası
  b.block = "Register dosyası";
  const RIDX = b.bus("RIDX", 3);
  for (let k = 0; k < 3; k++) {
    b.place("74HC151", {
      S0: CW[3], S1: CW[4], S2: CW[5], "~E": "GND",
      I0: IR[9 + k], I1: IR[6 + k], I2: IR[3 + k], I3: k === 0 ? "GND" : "VCC", I4: "VCC", I5: "GND", I6: "GND", I7: "GND",
      Y: RIDX[k],
    }, `register indeksi bit ${k} (RSEL: RD RS1 RS2 SP LR)`);
  }
  const wsel: Record<string, string> = {};
  const rsel: Record<string, string> = {};
  range(8).forEach((r) => {
    wsel[`~Y${r}`] = `~WSEL${r}`;
    rsel[`~Y${r}`] = `~ROE${r}`;
  });
  b.place("74HC138", { A0: RIDX[0], A1: RIDX[1], A2: RIDX[2], "~E1": "GND", "~E2": "GND", E3: CW[16], ...wsel }, "register yazma çözücü");
  b.place("74HC138", { A0: RIDX[0], A1: RIDX[1], A2: RIDX[2], "~E1": "~SRC_REG", "~E2": "GND", E3: "VCC", ...rsel }, "register okuma çözücü");
  const reg574 = (role: string, d: number[], cp: number | string, oe: number | string, q: number[]) => {
    const conn: Record<string, number | string> = { CP: cp, "~OE": oe };
    range(8).forEach((i) => {
      conn[`D${i}`] = d[i];
      conn[`Q${i}`] = q[i];
    });
    return b.place("74HC574", conn, role);
  };
  const regs = range(8).map((r) => {
    const clk = b.nor(`~WSEL${r}`, nCLKR, `CLK_R${r}`, `r${r} saati`);
    return [
      reg574(`r${r} düşük bayt`, BUS.slice(0, 8), clk, `~ROE${r}`, BUS.slice(0, 8)),
      reg574(`r${r} yüksek bayt`, BUS.slice(8), clk, `~ROE${r}`, BUS.slice(8)),
    ];
  });

  // ---- TA, TB (ALU girişleri), MAR, IR
  b.block = "Geçici register'lar";
  const latch16 = (name: string, sig: number, q: number[]) => {
    const clk = gclk(sig, name);
    return [reg574(`${name} düşük`, BUS.slice(0, 8), clk, "GND", q.slice(0, 8)), reg574(`${name} yüksek`, BUS.slice(8), clk, "GND", q.slice(8))];
  };
  const ta = latch16("TA", CW[17], TA);
  const tb = latch16("TB", CW[18], TB);
  b.block = "MAR ve IR";
  const mar = latch16("MAR", CW[21], A);
  const ir = latch16("IR", CW[23], IR);

  // ---- program sayacı: PC[15:1] sayaç, PC[0] = 0
  b.block = "Program sayacı";
  const PC = ["GND", ...range(15).map((i) => `PC${i + 1}`)];
  const pcInc = b.and(CW[20], RUN_R, "PC_INC_EN", "PC += 2");
  const pcLoad = b.nand(CW[19], RUN_R, "~PC_LOAD", "PC yükle");
  const pc: ChipInstance[] = [];
  for (let k = 0; k < 4; k++) {
    const conn: Record<string, number | string> = {
      CP: "CLK", "~MR": "~RESET", "~PE": pcLoad, CEP: pcInc, CET: k === 0 ? pcInc : `PC_TC${k - 1}`, TC: `PC_TC${k}`,
    };
    range(4).forEach((i) => {
      const bit = 4 * k + i + 1;
      conn[`D${i}`] = bit < 16 ? BUS[bit] : "GND";
      conn[`Q${i}`] = bit < 16 ? `PC${bit}` : "PC16";
    });
    pc.push(b.place("74HC161", conn, `PC bit ${4 * k + 1}..${Math.min(4 * k + 4, 15)}`));
  }
  const buf541 = (role: string, a: (number | string)[], y: number[], oe: number | string) => {
    const conn: Record<string, number | string> = { "~OE1": oe, "~OE2": "GND" };
    range(8).forEach((i) => {
      conn[`A${i}`] = a[i];
      conn[`Y${i}`] = y[i];
    });
    return b.place("74HC541", conn, role);
  };
  buf541("PC → veriyolu düşük", PC.slice(0, 8), BUS.slice(0, 8), "~SRC_PC");
  buf541("PC → veriyolu yüksek", PC.slice(8), BUS.slice(8), "~SRC_PC");

  // ---- sabit birimi: her bit için 8 kaynaktan biri
  b.block = "Sabit birimi";
  const IMMV = b.bus("IMM", 16);
  const ir_ = (i: number) => IR[i];
  for (let i = 0; i < 16; i++) {
    const cand: (number | string)[] = [
      i < 6 ? ir_(i) : ir_(5), // IMM6
      i === 0 ? "GND" : i <= 6 ? ir_(i - 1) : ir_(5), // IMM6×2
      ir_(i % 8), // IMM8: iki bayta kopya
      i < 9 ? ir_(i) : ir_(8), // IMM9
      i === 0 ? "GND" : i <= 8 ? ir_(i - 1) : ir_(7), // OFF8×2
      i === 0 ? "GND" : i <= 12 ? ir_(i - 1) : ir_(11), // OFF12×2
      i === 1 ? "VCC" : "GND", // sabit 2
      i === 2 ? "VCC" : "GND", // sabit 4
    ];
    const conn: Record<string, number | string> = { S0: CW[12], S1: CW[13], S2: CW[14], "~E": "GND", Y: IMMV[i] };
    cand.forEach((x, k) => (conn[`I${k}`] = x));
    b.place("74HC151", conn, `sabit birimi bit ${i}`);
  }
  buf541("sabit → veriyolu düşük", IMMV.slice(0, 8), BUS.slice(0, 8), "~SRC_IMM");
  buf541("sabit → veriyolu yüksek", IMMV.slice(8), BUS.slice(8), "~SRC_IMM");

  // ---- ALU işlem seçimi: ALU_IR = 1 ise {IR.op[0], IR.f3}
  b.block = "ALU";
  const AOP = b.bus("AOP", 5);
  b.place("74HC157", {
    S: CW[11], "~E": "GND",
    "1I0": CW[6], "1I1": IR[0], "1Y": AOP[0], "2I0": CW[7], "2I1": IR[1], "2Y": AOP[1],
    "3I0": CW[8], "3I1": IR[2], "3Y": AOP[2], "4I0": CW[9], "4I1": IR[12], "4Y": AOP[3],
  }, "ALU işlem seçici (bit 0..3)");
  // bit 4: ALU_IR = 1 iken 0 (komuttan gelen işlemler 0..15), değilse CW10. İki kapı kontrol
  // biriminin kapılarıyla paketlenir (eski 74HC157'nin yuvasında kontrol biriminin bir çipi)
  b.flexibleGlue = true;
  b.and(CW[10], b.not(CW[11], "~ALU_IR", "ALU işlem seçici (bit 4)"), AOP[4], "ALU işlem seçici (bit 4)");
  b.flexibleGlue = false;
  kb.yerlestir("adim");

  // ---- ALU kontrol bitleri AD0..AD23: kontrol biriminin ALU kod çözücüsünden (işlem, h, C);
  // işlem çözücüleri eski ALU ROM'larının yuvalarında
  for (let k = 0; k < 3; k++) kb.yerlestir("alu");
  const AD = range(24).map((i) => netOf(devre.ad[i]));
  const ad = (bit: number) => AD[bit];

  // ---- toplayıcı girişleri ve 4 × 74HC283
  const X = range(16).map((i) => b.xor(TA[i], ad(AD_BIT.INVA), `X${i}`, "toplayıcı A girişi (NEG'de ters)"));
  const Y = range(16).map((i) =>
    b.xor(b.and(TB[i], ad(AD_BIT.PASSB), undefined, "toplayıcı B girişi"), ad(AD_BIT.INVB), `Y${i}`, "toplayıcı B girişi (SUB'da ters)"),
  );
  const SUM = b.bus("SUM", 16);
  for (let k = 0; k < 4; k++) {
    const conn: Record<string, number | string> = { CIN: k === 0 ? ad(AD_BIT.CIN) : `CO${k - 1}`, COUT: k === 3 ? "C_ADD" : `CO${k}` };
    range(4).forEach((i) => {
      conn[`A${i + 1}`] = X[4 * k + i];
      conn[`B${i + 1}`] = Y[4 * k + i];
      conn[`S${i + 1}`] = SUM[4 * k + i];
    });
    b.place("74HC283", conn, `toplayıcı bit ${4 * k}..${4 * k + 3}`);
  }
  b.and(b.xor(X[15], SUM[15], undefined, "taşma (V)"), b.xor(Y[15], SUM[15], undefined, "taşma (V)"), "V_ADD", "taşma (V)");

  // ---- mantık birimi: her bit bir 74HC151 doğruluk tablosu (a, b, yüksek baytta a7)
  const LOGIC = b.bus("LOGIC", 16);
  for (let i = 0; i < 16; i++) {
    const hi = i >= 8;
    const conn: Record<string, number | string> = { S0: TA[i], S1: TB[i], S2: hi ? TA[7] : "GND", "~E": "GND", Y: LOGIC[i] };
    range(8).forEach((k) => (conn[`I${k}`] = hi ? AD[AD_BIT.FHI0 + k] : k < 4 ? AD[AD_BIT.FLO0 + k] : "GND"));
    b.place("74HC151", conn, `mantık birimi bit ${i} (doğruluk tablosu)`);
  }

  // ---- kaydırıcı ve sonuç seçici
  const SINH = b.or(ad(AD_BIT.SINHC), b.and(ad(AD_BIT.SAREN), TA[15], undefined, "SAR işaret biti"), "SINH", "sağa kaydırmada giren bit");
  const RES = b.bus("RES", 16);
  for (let j = 0; j < 8; j++) {
    const conn: Record<string, number | string> = { S0: AD[AD_BIT.RS0], S1: AD[AD_BIT.RS1], "~1E": "GND", "~2E": "GND" };
    for (const h of [1, 2]) {
      const i = 2 * j + h - 1;
      conn[`${h}I0`] = SUM[i];
      conn[`${h}I1`] = LOGIC[i];
      conn[`${h}I2`] = i === 0 ? ad(AD_BIT.SINL) : TA[i - 1];
      conn[`${h}I3`] = i === 15 ? SINH : TA[i + 1];
      conn[`${h}Y`] = RES[i];
    }
    b.place("74HC153", conn, `ALU sonuç seçici bit ${2 * j}, ${2 * j + 1} (toplam / mantık / sola / sağa)`);
  }
  b.place("74HC153", {
    S0: AD[AD_BIT.RS0], S1: AD[AD_BIT.RS1], "~1E": "GND", "~2E": "GND",
    "1I0": "C_ADD", "1I1": "GND", "1I2": TA[15], "1I3": TA[0], "1Y": "C_ALU",
    "2I0": "V_ADD", "2I1": "GND", "2I2": "GND", "2I3": "GND", "2Y": "V_ALU",
  }, "ALU C ve V seçici");
  const zConn = (lo: boolean) => {
    const conn: Record<string, number | string> = { "~E": "GND", "~EQ": lo ? "~Z_LO" : "~Z_HI" };
    range(8).forEach((i) => {
      conn[`P${i}`] = RES[(lo ? 0 : 8) + i];
      conn[`Q${i}`] = "GND";
    });
    return conn;
  };
  b.place("74HC688", zConn(true), "sıfır algılama (düşük bayt)");
  b.place("74HC688", zConn(false), "sıfır algılama (yüksek bayt)");
  b.nor("~Z_LO", "~Z_HI", "Z_ALU", "Z bayrağı");
  buf541("ALU → veriyolu düşük", RES.slice(0, 8), BUS.slice(0, 8), "~SRC_ALU");
  buf541("ALU → veriyolu yüksek", RES.slice(8), BUS.slice(8), "~SRC_ALU");

  // ---- bayraklar
  b.block = "Bayraklar ve koşul";
  b.place("74HC157", {
    S: CW[25], "~E": "GND",
    "1I0": RES[15], "1I1": BUS[3], "1Y": "DN", "2I0": "Z_ALU", "2I1": BUS[2], "2Y": "DZ",
    "3I0": "C_NEW", "3I1": BUS[1], "3Y": "DC", "4I0": "V_NEW", "4I1": BUS[0], "4Y": "DV",
  }, "bayrak girişi: ALU ya da veriyolu (RETI)");
  // Dört bayrak aynı kapılı saatle yüklenir; C ve V'yi değiştirmeyen işlemlerde (SETSCV = 0) eski
  // değer geri yazılır (çip, kartın sonunda yerleştirilir: C/V tutma seçicisi). SETSCV saat izninde
  // kullanılmaz: ALU kod çözücünün girişinde CFLAG var ve CFLAG tam bu kenarda değişir; çıkışındaki
  // bir sıçrama kapılı saatte ikinci bir darbe üretebilirdi (docs/uretim.md, zamanlama).
  const clkNZ = gclk(b.or(CW[24], CW[25], "NZ_LD", "N Z yükle"), "NZ");
  const clkCV = clkNZ;
  const nz = b.place("74HC74", {
    "1D": "DN", "1CLK": clkNZ, "~1PRE": "VCC", "~1CLR": "~RESET", "1Q": "NFLAG", "~1Q": "~NFLAG",
    "2D": "DZ", "2CLK": clkNZ, "~2PRE": "VCC", "~2CLR": "~RESET", "2Q": "ZFLAG", "~2Q": "~ZFLAG",
  }, "N ve Z bayrakları");
  const cv = b.place("74HC74", {
    "1D": "DC", "1CLK": clkCV, "~1PRE": "VCC", "~1CLR": "~RESET", "1Q": "CFLAG", "~1Q": "~CFLAG",
    "2D": "DV", "2CLK": clkCV, "~2PRE": "VCC", "~2CLR": "~RESET", "2Q": "VFLAG", "~2Q": "~VFLAG",
  }, "C ve V bayrakları");
  const clkI = gclk(b.or(b.or(CW[26], CW[27], undefined, "I yükle"), CW[25], "I_LD", "I yükle"), "I");
  const iflag = b.place("74HC74", {
    "1D": b.or(CW[26], b.and(CW[25], BUS[4], undefined, "I girişi"), "DI", "I girişi"),
    "1CLK": clkI, "~1PRE": "VCC", "~1CLR": "~RESET", "1Q": IFLAG,
    "2D": "GND", "2CLK": "GND", "~2PRE": "VCC", "~2CLR": "VCC",
  }, "I (kesme izni) bayrağı");
  buf541("bayraklar → veriyolu düşük", ["VFLAG", "CFLAG", "ZFLAG", "NFLAG", IFLAG, "GND", "GND", "GND"], BUS.slice(0, 8), "~SRC_FLAGS");
  buf541("bayraklar → veriyolu yüksek (0)", Array(8).fill("GND"), BUS.slice(8), "~SRC_FLAGS");

  // ---- koşul birimi: cond[3:1] seçer, cond[0] tersler
  const NEQV = b.not(b.xor("NFLAG", "VFLAG", undefined, "N = V"), "N_EQ_V", "N = V");
  b.place("74HC151", {
    S0: IR[9], S1: IR[10], S2: IR[11], "~E": "GND",
    I0: "ZFLAG", I1: "CFLAG", I2: "NFLAG", I3: "VFLAG",
    I4: b.and("CFLAG", "~ZFLAG", undefined, "HI koşulu"), I5: NEQV, I6: b.and("~ZFLAG", NEQV, undefined, "GT koşulu"), I7: "VCC",
    Y: "CONDY",
  }, "koşul birimi");
  b.xor("CONDY", IR[8], COND, "koşul tersleme");

  // ---- bellek arayüzü: 16 bit veriyolu ↔ çift/tek bayt hatları
  b.block = "Bellek arayüzü";
  const BYTE = CW[28];
  const MEMRD = b.not("~SRC_MEM", "MEMRD", "bellek okuma");
  const MEMW = b.and(CW[22], RUN_R, "MEMW", "bellek yazma");
  const ACC = b.or(MEMRD, MEMW, "MEM_ACC", "bellek erişimi");
  const LANE_E = b.nand(BYTE, A[0], "LANE_E", "çift bayt hattı kullanılıyor");
  const nBYTE = b.not(BYTE, "~BYTE", "kelime erişimi");
  const LANE_OB = b.and(BYTE, A[0], "LANE_OB", "tek adresli bayt");
  const xcvr = (role: string, a: number[], bb: string, oe: number) => {
    const conn: Record<string, number | string> = { DIR: MEMW, "~OE": oe };
    range(8).forEach((i) => {
      conn[`A${i}`] = a[i];
      conn[`B${i}`] = `${bb}${i}`;
    });
    return b.place("74HC245", conn, role);
  };
  xcvr("veriyolu düşük ↔ çift bayt", BUS.slice(0, 8), "DE", b.nand(LANE_E, ACC, undefined, "hat seçimi"));
  xcvr("veriyolu yüksek ↔ tek bayt", BUS.slice(8), "DO", b.nand(nBYTE, ACC, undefined, "hat seçimi"));
  xcvr("veriyolu düşük ↔ tek bayt (LBU/SB tek adres)", BUS.slice(0, 8), "DO", b.nand(LANE_OB, ACC, undefined, "hat seçimi"));
  buf541("bayt okumada yüksek bayt = 0", Array(8).fill("GND"), BUS.slice(8), b.nand(BYTE, MEMRD, undefined, "bayt okuma"));
  const weE = b.and(MEMW, LANE_E, "WE_E_EN", "yazma darbesi");
  const weO = b.and(MEMW, b.or(nBYTE, A[0], undefined, "yazma darbesi"), "WE_O_EN", "yazma darbesi");
  // yazma darbesi saat kartının WR_WIN penceresinde: düşen kenardan sonra başlar, yükselen kenardan
  // önce biter; böylece kontrol sinyalleri oturmuştur ve aynı kenarda değişen register'lar
  // (ör. I_CLR ile bayrakları itmek) yazılan veriyi bozmaz
  b.nand(weE, "WR_WIN", "~MWE_E", "çift bayt yazma darbesi");
  b.nand(weO, "WR_WIN", "~MWE_O", "tek bayt yazma darbesi");
  // ~MRD = ~SRC_MEM (bellek çıkış izni) arka panele doğrudan gider
  b.not(MEMRD, "~MRD", "bellek okuma (aktif düşük)");
  b.block = "Kontrol";
  b.led("HALTED", "HALTED");
  b.led("FAULT", "FAULT");

  // C/V tutma seçicisi: SETSCV = 0 ise bayrak flip-flop'larına eski C ve V geri yazılır. Diğer
  // çiplerin referans numaraları değişmesin diye en sonda yerleştirilir.
  b.block = "Bayraklar ve koşul";
  b.place("74HC157", {
    S: ad(AD_BIT.SETSCV), "~E": "GND",
    "1I0": "CFLAG", "1I1": "C_ALU", "1Y": "C_NEW", "2I0": "VFLAG", "2I1": "V_ALU", "2Y": "V_NEW",
    "3I0": "GND", "3I1": "GND", "4I0": "GND", "4I1": "GND",
  }, "C/V tutma seçicisi: ALU C, V'yi değiştirmiyorsa eski değer");

  // kontrol biriminin kalan çipleri (adım seçicileri …) kartın yapıştırıcı çiplerinden sonra
  kb.kalanlariErtele();

  return {
    regs, ir, ta, tb, mar, pc, cr, kontrol: kb.cipler,
    flags: { nz, cv, i: iflag }, intHalt, faultRun, step,
  };
}
