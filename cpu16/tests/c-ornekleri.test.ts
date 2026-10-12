// C örnekleri (cpu16/bios/ornekler/*.c, belge: docs/c-ornekleri.md): her program cc16 ile BIOS hedefine
// derlenir ve Web IDE'nin "Anakart + BIOS" kipindeki modelde (Machine + BIOS v1) çalıştırılır. Çıktı
// UART'tan ve VGA belleğinden (VRAM) okunup, mümkün olan yerde JavaScript'te bağımsız olarak hesaplanan
// değerlerle karşılaştırılır.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildBios } from "../bios/build.ts";
import { MachineLink } from "../bios/simlink.ts";
import { intelHex, uploadHex } from "../bios/uploader.ts";
import { buildProgram, formatErrors, type BuildResult } from "../cc/index.ts";
import { loadLib } from "../cc/node.ts";
import { Machine } from "../emu/machine.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const bios = buildBios(read("../bios/bios.s"));
const LIB = loadLib();
const kaynak = (ad: string) => read(`../bios/ornekler/${ad}`);

function derle(ad: string): BuildResult {
  const b = buildProgram({ [ad]: kaynak(ad) }, [ad], { lib: LIB, target: "bios" });
  if (b.errors.length) throw new Error(formatErrors(b.errors));
  return b;
}

function ac(): Machine {
  const m = new Machine();
  m.loadFlash(bios.flash);
  m.reset();
  expect(m.runUntil(() => m.uartOutput.endsWith("> "), 2_000_000)).toBe(true);
  return m;
}

/** Programı RAM'e koyup monitörden G 4000 ile başlatır (UART önyükleyicisinin yaptığının kısa yolu). */
function baslat(ad: string, girdi = ""): Machine {
  const m = ac();
  const b = derle(ad);
  for (const [s, e] of b.ranges) m.pokeCpu(s, b.image.subarray(s, e));
  m.uartSend("G 4000\r" + girdi);
  // program başladı: yığın göstergesi programın yığınında (0xF800 altı)
  expect(m.runUntil(() => m.cpu.regs[6] < 0xf800, 200_000, 200)).toBe(true);
  return m;
}

/** Program main'den döndü, monitör istemde: SP yine BIOS yığınında (0xF800 üstü). */
const bitti = (m: Machine) => m.uartOutput.endsWith("> ") && m.cpu.regs[6] > 0xf800;

function calistir(ad: string, enCok: number, girdi = ""): { m: Machine; uart: string } {
  const m = baslat(ad, girdi);
  expect(m.runUntil(() => bitti(m), enCok), `${ad} ${enCok} döngüde bitmedi`).toBe(true);
  return { m, uart: uartMetni(m) };
}

/** UART çıktısı, G komutundan sonrası; BIOS '\n'i CR LF gönderir */
const uartMetni = (m: Machine) => m.uartOutput.slice(m.uartOutput.lastIndexOf("G 4000")).replace(/\r\n/g, "\n");
const satir = (m: Machine, y: number) => m.video.line(y);
const karakter = (m: Machine, x: number, y: number) => m.video.vram[(y * 80 + x) * 2];
const renk = (m: Machine, x: number, y: number) => m.video.vram[(y * 80 + x) * 2 + 1];

describe("C örnekleri: BIOS üzerinde, Web IDE'deki anakart modeliyle", () => {
  it("hepsi derlenir ve BIOS hedefinin bölgelerine sığar (kod 0x4000–0x9FFF, veri 0xA000–0xF7FF)", () => {
    for (const ad of ["sayilar.c", "uzun.c", "kalbur.c", "siralama.c", "liste.c", "hesap.c", "sabit.c", "ekran.c", "hayat.c", "kesme.c"]) {
      const b = derle(ad);
      expect(b.symbols.get("__reset"), ad).toBe(0x4000);
      for (const [s, e] of b.ranges) expect(s >= 0x4000 && e <= 0xf800, ad).toBe(true);
      expect(b.romSize, ad).toBeLessThan(0x2000); // her biri 8 KB'tan küçük: UART'tan birkaç saniyede yüklenir
    }
  });

  it("sayilar.c: onluk / hex / ikilik tablo ve 16 bit taşmaları", () => {
    const { m, uart } = calistir("sayilar.c", 3_000_000);
    expect(uart).toContain(
      "     0          0  0000  0000 0000 0000 0000\n" +
        "     1          1  0001  0000 0000 0000 0001\n" +
        "    42         42  002A  0000 0000 0010 1010\n",
    );
    expect(uart).toContain(" 32767      32767  7FFF  0111 1111 1111 1111\n-32768      32768  8000  1000 0000 0000 0000\n");
    expect(uart).toContain("-25536      40000  9C40  1001 1100 0100 0000\n    -1      65535  FFFF  1111 1111 1111 1111\n");
    for (const s of [
      "32767 + 1        = -32768",
      "-32768 - 1       = 32767",
      "-(-32768)        = -32768",
      "0u - 1           = 65535",
      "1000 * 100       = -31072",
      "char 200 + 100   = 300",
      "char'a yazinca   = 44",
      "(signed char)200 = -56",
      "char 1  int 2  long 4  isaretci 2",
    ])
      expect(uart).toContain(s);
    const b = derle("sayilar.c");
    const son = b.symbols.get("__data_load")!;
    expect(uart).toContain(`kod ve sabitler ${son - 0x4000} bayt (0x4000-0x${son.toString(16).toUpperCase()})`);
    expect(m.renderText()).toContain("-32768      32768  8000");
  });

  it("uzun.c: 16 / 32 bit faktöriyel ve Fibonacci, yazılım çarpma / bölmenin maliyeti", () => {
    const { uart } = calistir("uzun.c", 20_000_000);
    // n! mod 2^16 ve mod 2^32, JavaScript BigInt ile
    let f = 1n;
    for (let n = 1n; n <= 13n; n++) {
      f *= n;
      if (n < 7n) continue;
      const f16 = f % 65536n;
      const f32 = f % 4294967296n;
      const re = new RegExp(`^${String(n).padStart(2)}\\s+${f16}\\s+${f16 === f ? "" : "TASTI"}\\s+${f32}`, "m");
      expect(uart, `${n}!`).toMatch(re);
    }
    expect(uart).toMatch(/^13 .*1932053504 TASTI \(dogrusu 6227020800\)$/m);
    expect(uart).toContain("16 bit: fib(24) = 46368, fib(25) sigmaz");
    expect(uart).toContain("32 bit: fib(47) = 2971215073, fib(48) sigmaz");
    // ölçümler: kabaca beklenen aralıklar ve sıralama (çarpanı büyük çarpma daha uzun, bölme en uzun)
    const dongu = (ad: string) => {
      const r = new RegExp(`${ad.replace(/[*+/]/g, "\\$&")}\\s+(\\d+) dongu`).exec(uart);
      expect(r, ad).not.toBeNull();
      return Number(r![1]);
    };
    const add16 = dongu("a + b    16 bit");
    const add32 = dongu("a + b    32 bit");
    const mul10 = dongu("a * 10   16 bit, sabit");
    const mulK = dongu("a * b    16 bit, b=10");
    const mulB = dongu("a * b    16 bit, b=30000");
    const mul32 = dongu("a * b    32 bit, b=891");
    const div16 = dongu("a / b    16 bit");
    const div32 = dongu("a / b    32 bit");
    expect(add16).toBeGreaterThan(20);
    expect(add16).toBeLessThan(100);
    expect(add32).toBeGreaterThan(add16);
    expect(mul10).toBeLessThan(mulK);
    expect(mulB).toBeGreaterThan(mulK * 2);
    expect(mul32).toBeGreaterThan(mulB);
    expect(div16).toBeGreaterThan(400);
    expect(div32).toBeGreaterThan(div16 * 2);
    expect(div32).toBeLessThan(3000);
  });

  it("kalbur.c: 65535'e kadar asallar; sayılar JavaScript'teki kalburla aynı", () => {
    const { m, uart } = calistir("kalbur.c", 20_000_000);
    const N = 65536;
    const bilesik = new Uint8Array(N);
    bilesik[0] = bilesik[1] = 1;
    for (let p = 2; p * p < N; p++) if (!bilesik[p]) for (let k = p * p; k < N; k += p) bilesik[k] = 1;
    const pi = (x: number) => bilesik.subarray(0, x).reduce((n, c) => n + (c ? 0 : 1), 0);
    const asallar200 = [...Array(200).keys()].filter((i) => !bilesik[i]);
    let ikiz = 0;
    for (let p = 3; p + 2 < N; p++) if (!bilesik[p] && !bilesik[p + 2]) ikiz++;
    let enBuyuk = N - 1;
    while (bilesik[enBuyuk]) enBuyuk--;

    const liste = uart.slice(uart.indexOf("asallar:") + 9, uart.indexOf("(")).trim().split(/\s+/).map(Number);
    expect(liste).toEqual(asallar200);
    expect(uart).toContain(`(${asallar200.length} tane)`);
    for (const x of [10, 100, 1000, 10000, 65536]) expect(uart).toContain(`pi(${x}) = ${pi(x)}`);
    expect(uart).toContain(`En buyuk 16 bitlik asal: ${enBuyuk}`);
    expect(uart).toContain(`ikiz asal cifti (p, p+2): ${ikiz}`);
    expect(uart).toContain("Bit dizisi: 4096 bayt, adres 0xA000 (.bss)");
    const tik = Number(/Kalbur (\d+) tik/.exec(uart)![1]);
    expect(tik).toBeGreaterThan(100);
    expect(tik).toBeLessThan(250);
    expect(m.renderText()).toContain("pi(65536) = 6542");
  });

  it("siralama.c: karşılaştırma ve taşıma sayıları JavaScript'teki aynı algoritmalarla aynı", () => {
    const { uart } = calistir("siralama.c", 30_000_000);
    // libc16'nın rand'ı: x = x * 1103515245 + 12345 (32 bit), sonuç (x >> 16) & 0x7FFF; srand(16)
    let x = 16;
    const rand = () => {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      return (x >>> 16) & 0x7fff;
    };
    const asil = Array.from({ length: 200 }, () => rand() % 1000);
    type Say = { k: number; t: number };
    const kabarcik = (a: number[], s: Say) => {
      for (let i = a.length - 1; i > 0; i--)
        for (let j = 0; j < i; j++) {
          s.k++;
          if (a[j + 1] < a[j]) {
            [a[j], a[j + 1]] = [a[j + 1], a[j]];
            s.t += 2;
          }
        }
    };
    const secmeli = (a: number[], s: Say) => {
      for (let i = 0; i < a.length - 1; i++) {
        let en = i;
        for (let j = i + 1; j < a.length; j++) {
          s.k++;
          if (a[j] < a[en]) en = j;
        }
        if (en !== i) {
          [a[i], a[en]] = [a[en], a[i]];
          s.t += 2;
        }
      }
    };
    const eklemeli = (a: number[], s: Say) => {
      for (let i = 1; i < a.length; i++) {
        const v = a[i];
        let j = i;
        for (; j > 0 && (s.k++, v < a[j - 1]); j--) {
          a[j] = a[j - 1];
          s.t++;
        }
        a[j] = v;
        s.t++;
      }
    };
    let derin = 0;
    const hizli = (a: number[], s: Say) => {
      let d = 0;
      const parca = (sol: number, sag: number) => {
        let i = sol;
        let j = sag;
        const eksen = a[Math.trunc((sol + sag) / 2)];
        derin = Math.max(derin, ++d);
        while (i <= j) {
          while ((s.k++, a[i] < eksen)) i++;
          while ((s.k++, eksen < a[j])) j--;
          if (i <= j) {
            [a[i], a[j]] = [a[j], a[i]];
            s.t += 2;
            i++;
            j--;
          }
        }
        if (sol < j) parca(sol, j);
        if (i < sag) parca(i, sag);
        d--;
      };
      parca(0, a.length - 1);
    };
    // libc16.c qsort: ortadaki eleman başa, Lomuto bölmesi, küçük yarıya özyineleme
    const qsortLibc = (a: number[], s: Say) => {
      const q = (b: number, n: number) => {
        while (n > 1) {
          const sw = (i: number, j: number) => ([a[b + i], a[b + j]] = [a[b + j], a[b + i]]);
          sw(0, n >> 1);
          let last = 0;
          for (let i = 1; i < n; i++) if ((s.k++, a[b + i] < a[b])) sw(++last, i);
          sw(0, last);
          if (last < n - last - 1) {
            q(b, last);
            b += last + 1;
            n -= last + 1;
          } else {
            q(b + last + 1, n - last - 1);
            n = last;
          }
        }
      };
      q(0, a.length);
    };
    const bekle: [string, (a: number[], s: Say) => void][] = [
      ["kabarcik", kabarcik],
      ["secmeli ", secmeli],
      ["eklemeli", eklemeli],
      ["hizli   ", hizli],
      ["qsort   ", qsortLibc],
    ];
    expect(uart).toContain(`once : ${asil.slice(0, 10).map((v) => String(v).padStart(4)).join("")} ...`);
    for (const [ad, f] of bekle) {
      const a = [...asil];
      const s = { k: 0, t: 0 };
      f(a, s);
      const tasima = ad.startsWith("qsort") ? "     -" : String(s.t).padStart(6);
      expect(uart, ad).toMatch(new RegExp(`${ad}   ${String(s.k).padStart(12)}  ${tasima}  +\\d+  evet`));
    }
    const sirali = [...asil].sort((p, q) => p - q);
    expect(uart).toContain(`sonra: ${sirali.slice(0, 10).map((v) => String(v).padStart(4)).join("")} ...`);
    expect(uart).toContain(`Hizli siralama en fazla ${derin} kez ic ice`);
    expect(uart).toContain("n(n-1)/2 = 19900");
  });

  it("liste.c: bağlı listeyle kelime sayımı, silme ve malloc'un boşalan yeri yeniden vermesi", () => {
    const { uart } = calistir("liste.c", 5_000_000);
    // METIN'i kaynaktan al (bitişik string sabitleri) ve kelimeleri JavaScript'te say
    const src = kaynak("liste.c");
    const govde = /METIN\[\] =([\s\S]*?);\n/.exec(src)![1];
    const metin = [...govde.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((r) => r[1]).join("");
    const kelimeler = metin.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    const adet = new Map<string, number>();
    for (const k of kelimeler) adet.set(k, (adet.get(k) ?? 0) + 1);
    const alfabetik = [...adet.keys()].sort();
    expect(uart).toContain(`${kelimeler.length} kelime, ${adet.size} farkli`);
    expect(uart).toContain("sizeof(struct kelime) = 4; ofsetler: sonraki 0, adet 2, yazi 4");
    const tablo = (adlar: string[]) =>
      adlar.map((k, i) => `${k.padEnd(16)}${String(adet.get(k)).padStart(2)}${(i + 1) % 4 ? "  " : "\n"}`).join("");
    expect(uart).toContain(tablo(alfabetik));
    const kalan = alfabetik.filter((k) => adet.get(k)! >= 2);
    expect(uart).toContain(`Bir kez gecenler silindi (free), ${kalan.length} kelime kaldi:\n${tablo(kalan)}`);
    const enSik = alfabetik.reduce((a, k) => (adet.get(k)! > adet.get(a)! ? k : a));
    expect(uart).toContain(`En sik: "${enSik}" (${adet.get(enSik)} kez)`);
    expect(uart).toMatch(/Silinenlerin en dusuk adreslisi 0x(A[0-9A-F]{3}); yeni malloc\(4\) = 0x\1: ayni yer/);
  });

  it("hesap.c: UART önyükleyicisiyle yüklenir (Web IDE'deki gibi); UART ve PS/2 klavyeden ifade okur", async () => {
    const m = ac();
    const link = new MachineLink(m, true);
    m.uartOnOutput = (b) => link.push(b);
    const b = derle("hesap.c");
    const hex = intelHex(b.ranges.map(([s, e]) => ({ addr: s, data: b.image.subarray(s, e) })), 0x4000);
    const r = await uploadHex(link, hex, { mode: "ram", run: true });
    expect(r.ok, r.message).toBe(true);
    const yaz = (satirlar: string, bekle: string) => {
      const once = m.uartOutput.length;
      m.uartSend(satirlar);
      expect(m.runUntil(() => m.uartOutput.slice(once).replace(/\r\n/g, "\n").includes(bekle), 4_000_000), bekle).toBe(true);
    };
    expect(m.runUntil(() => m.uartOutput.endsWith("ifade: "), 2_000_000)).toBe(true);
    yaz("2+3*4\r", "  = 14  (0x0000000E, ikilik 1110)\n");
    yaz("(1+2)*(3+4)\r", "  = 21  (0x00000015");
    yaz("-7/2\r", "  = -3  (0xFFFFFFFD");
    yaz("-7%2\r", "  = -1  (0xFFFFFFFF");
    yaz("100000*3\r", "  = 300000  (0x000493E0");
    yaz("0x10 + 0b101\r", "  = 21");
    yaz("2147483647+1\r", "  = -2147483648  (0x80000000");
    yaz("--5\r", "  = 5  (0x00000005, ikilik 101)");
    yaz("1/0\r", "ifade: 1/0\n        ^ hata: sifira bolme\n");
    yaz("2*(3\r", "           ^ hata: ')' eksik\n");
    yaz("7 7\r", "         ^ hata: fazla karakter\n");
    yaz("2+\r", "^ hata: sayi bekleniyordu");
    // Backspace: "12\b3" = 13
    yaz("12\b3+1\r", "  = 14");
    // PS/2 klavyeden: IRQ 1 → BIOS tarama kodunu çevirir → halka tampon → GETLINE
    m.typeText("6*7\n");
    expect(m.runUntil(() => m.uartOutput.includes("= 42"), 4_000_000)).toBe(true);
    expect(m.renderText()).toContain("ifade: 6*7");
    yaz("q\r", "Gule gule!");
    expect(m.runUntil(() => bitti(m), 2_000_000)).toBe(true);
  });

  it("sabit.c: Q4.12 sonuçları ve ekrandaki sinüs eğrisi gerçek sinüsle (±1 satır) aynı", () => {
    const { m, uart } = calistir("sabit.c", 6_000_000);
    expect(uart).toContain("pi = 12868/4096 = 3.1416    1/3 = 1365/4096 = 0.3333");
    expect(uart).toContain("pi * (1/3) = 1.0469 ama pi / 3 = 1.0471");
    expect(uart).toContain("kok(2) = 1.4141  kok(5) = 2.2358");
    expect(uart).toContain("sin  0: 0.0000  sin 30: 0.5000  sin 45: 0.7070  sin 60: 0.8660  sin 90: 1.0000");
    const ORTA = 17;
    for (let x = 0; x < 80; x++) {
      const beklenen = ORTA - Math.round(9 * Math.sin((2 * Math.PI * x) / 80));
      let bulunan = -1;
      for (let y = ORTA - 10; y <= ORTA + 10; y++) if (karakter(m, x, y) === 0x2a) bulunan = y; // '*'
      expect(Math.abs(bulunan - beklenen), `sütun ${x}`).toBeLessThanOrEqual(1);
      expect(renk(m, x, bulunan)).toBe(0x0e); // sarı / siyah
    }
    expect(karakter(m, 40, ORTA)).toBe(0x2a); // sin(pi) = 0: eksenin üstünde
    expect(m.renderText()).toContain("* sin x   o cos x");
  });

  it("ekran.c: VRAM'e doğrudan pencereler, gölge, CP857 Türkçe harfler; vsync'le animasyon, tuşla durur", () => {
    const m = baslat("ekran.c");
    expect(m.runUntil(() => satir(m, 15).includes("kare  30 / 300"), 4_000_000)).toBe(true);
    expect(satir(m, 0)).toContain("CPU16 VGA metin modu: 80 x 30 hucre");
    expect(m.renderText()).toContain("║ Türkçe: çğıöşü ÇĞİÖŞÜ");
    expect(m.renderText()).toContain("Şu kısa cümle ekranda doğru");
    expect(satir(m, 2)).toContain("╔═════════════ 16 renk ══════════════╗");
    // 16 renk: (4, 4+i) ve (21, 4+i) hücrelerinde █, yazı rengi = renk numarası
    for (let i = 0; i < 16; i++) {
      const [x, y] = [4 + (i >> 3) * 17, 4 + (i & 7)];
      expect(karakter(m, x, y)).toBe(0xdb);
      expect(renk(m, x, y)).toBe(0x70 | i);
    }
    // gölge: pencerenin sağındaki iki sütunda karakter (░) kalır, yalnız renk koyu gri
    expect([karakter(m, 40, 5), renk(m, 40, 5)]).toEqual([0xb0, 0x08]);
    expect([karakter(m, 0, 5), renk(m, 0, 5)]).toEqual([0xb0, 0x01]);
    // CPU16 yazısı alt pencerede ve hareket ediyor; kare sayacı 60 Hz'le artıyor
    const yer = () => {
      for (let y = 16; y < 26; y++) {
        const x = satir(m, y).indexOf("CPU16");
        if (x >= 0) return [x, y];
      }
      return null;
    };
    const ilk = yer();
    expect(ilk).not.toBeNull();
    const c0 = m.cycles;
    expect(m.runUntil(() => satir(m, 15).includes("kare  60 / 300"), 4_000_000)).toBe(true);
    expect((m.cycles - c0) / 66_667).toBeCloseTo(30, 0); // 30 kare = 30 × 66 667 döngü
    expect(yer()).not.toEqual(ilk);
    m.typeText(" ");
    expect(m.runUntil(() => bitti(m), 1_000_000)).toBe(true);
    expect(m.video.cursorY).toBe(29); // istem en altta, ekran kaymadı
    expect(satir(m, 0)).toContain("CPU16 VGA metin modu");
  });

  it("hayat.c: ekrandaki nesiller JavaScript'teki Hayat Oyunu ile hücresi hücresine aynı; R ve Q tuşları", () => {
    const m = baslat("hayat.c");
    const G = 80;
    const Y = 27;
    const izgara = () => Array.from({ length: Y }, (_, y) => Array.from({ length: G }, (_, x) => karakter(m, x, y + 1) === 0xfe));
    const adim = (g: boolean[][]) =>
      g.map((sat, y) =>
        sat.map((canli, x) => {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && g[y + dy]?.[x + dx]) n++; // kenarların dışı ölü
          return n === 3 || (n === 2 && canli);
        }),
      );
    const say = (g: boolean[][]) => g.flat().filter(Boolean).length;
    /** n. neslin durum satırını bekler, canlı sayısını döndürür. Satır soldan sağa yazılırken
     * "nesil n" görünür ama sayı henüz eskidir: satırın bitmesi için biraz daha çalıştırılır
     * (program sonra bir sonraki tıka kadar uyur). */
    const nesil = (n: number, enCok: number) => {
      const re = new RegExp(`nesil +${n}  canli +(\\d+)`);
      expect(m.runUntil(() => re.test(satir(m, 28)), enCok), `nesil ${n}`).toBe(true);
      m.run(50_000);
      return Number(re.exec(satir(m, 28))![1]);
    };

    expect(nesil(0, 3_000_000)).toBe(58);
    let g = izgara();
    expect(say(g)).toBe(58);
    let onceki = g;
    for (let n = 1; n <= 30; n++) {
      onceki = g;
      g = adim(g);
    }
    expect(nesil(30, 30 * 500_000)).toBe(say(g));
    expect(izgara()).toEqual(g);
    // renk = yaş: bu nesilde doğanlar sarı (0x0E)
    for (let y = 0; y < Y; y++)
      for (let x = 0; x < G; x++) if (g[y][x] && !onceki[y][x]) expect(renk(m, x, y + 1), `${x},${y}`).toBe(0x0e);

    m.typeText("r"); // rastgele dünya: sayaç sıfırlanır, hücrelerin dörtte biri kadar canlı
    const ilk = nesil(0, 3_000_000);
    g = izgara();
    expect(say(g)).toBe(ilk);
    expect(ilk).toBeGreaterThan(400);
    expect(ilk).toBeLessThan(700);
    g = adim(g);
    expect(nesil(1, 4_000_000)).toBe(say(g));
    expect(izgara()).toEqual(g);

    m.typeText("q");
    expect(m.runUntil(() => bitti(m), 1_000_000)).toBe(true);
    expect(satir(m, 0)).toContain("Conway'in Hayat Oyunu");
  }, 30_000);

  it("kesme.c: vsync kesmesi C kancasını 60 Hz'le çağırır; e'nin 100 basamağı; kanca sonunda kaldırılır", () => {
    const { m, uart } = calistir("kesme.c", 12_000_000);
    const e =
      "71828182845904523536028747135266249775724709369995" + "95749669676277240766303535475945713821785251664274";
    expect(uart).toContain(`e = 2.${e.slice(0, 50)}\n      ${e.slice(50)}\n`);
    const kanca = Number(/kanca \(vsync, IRQ 3\) +: (\d+) kez/.exec(uart)![1]);
    const tik = Number(/BIOS tiki \(zamanlayici, IRQ 0\): (\d+) kez/.exec(uart)![1]);
    expect(kanca).toBeGreaterThan(50);
    expect(kanca / tik).toBeGreaterThan(0.58);
    expect(kanca / tik).toBeLessThan(0.62);
    expect(uart).toMatch(/oran: \d+ \/ \d+ = 0\.(59|60|61)/);
    // kancanın çizdikleri: dolu ilerleme çizgisi (satır 4, 50 hücre) ve sağ üstte dönen çubuk
    for (let x = 15; x < 65; x++) expect(karakter(m, x, 4), `x=${x}`).toBe(0xdb);
    expect("|/-\\").toContain(String.fromCharCode(karakter(m, 77, 0)));
    // program vsync kesmesini kapattı ve kancayı kaldırdı (BIOS değişkeni V_UHOOK = 0xF800 + 54)
    expect(m.irqMask & 8).toBe(0);
    expect(m.peek16(0xf800 + 54)).toBe(0);
    // monitör çalışmaya devam ediyor
    const n = m.uartOutput.length;
    m.uartSend("\r");
    expect(m.runUntil(() => m.uartOutput.length > n && m.uartOutput.endsWith("> "), 1_000_000)).toBe(true);
  });
});

describe("komut satırı: C örnekleri", () => {
  const [maj, min] = process.versions.node.split(".").map(Number);
  const ok = maj > 22 || (maj === 22 && min >= 6);
  const cli = fileURLToPath(new URL("../tools/cli.ts", import.meta.url));
  const ornek = (n: string) => fileURLToPath(new URL(`../bios/ornekler/${n}`, import.meta.url));
  const calis = (girdi: string, ...args: string[]) =>
    execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", cli, ...args], {
      encoding: "utf8",
      input: girdi,
      stdio: ["pipe", "pipe", "pipe"],
    });

  it.skipIf(!ok)("cc --hedef bios --run: borudan gelen girdi programa UART'tan gider; CP857 çözülür", () => {
    const out = calis("2+3*4\n(1+2)*(3+4)\n\n", "cc", ornek("hesap.c"), "--hedef", "bios", "--run");
    expect(out).toContain("ifade: 2+3*4\r\n  = 14  (0x0000000E");
    expect(out).toContain("  = 21  (0x00000015");
    expect(out).toContain("Gule gule!");
    // çıktısında "> " geçen program erken bitmiş sayılmaz (kesme.c: "... -> RETI"); ░ CP857'den çözülür
    const k = calis("", "cc", ornek("kesme.c"), "--hedef", "bios", "--run");
    expect(k).toContain("-> RETI");
    expect(k).toContain("ilerleme:      ░░░░");
    expect(k).toContain("e = 2.71828182845904523536");
  });

  it.skipIf(!ok)("machine dosya.c: C programını derleyip UART önyükleyicisiyle yükler ve çalıştırır", () => {
    const out = calis("", "machine", ornek("sayilar.c"), "--cycles", "6000000", "--screen");
    expect(out).toContain("Yuklendi:");
    expect(out).toContain("1000 * 100       = -31072");
    expect(out).toContain("----- VGA ekranı -----");
  });
});
