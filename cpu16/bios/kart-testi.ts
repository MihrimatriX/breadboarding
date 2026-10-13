// Kart testi (Faz 9): gerçek kartın simülatörle aynı davrandığını UART üzerinden gösterir.
//
// Her test programı (cpu16/bios/testler/) monitöre Intel HEX olarak yüklenir, G ile çalışır ve
// sonuçlarını UART'a yazar. Aynı program önce simülatörde (anakart modeli + aynı BIOS) çalıştırılıp
// beklenen çıktı alınır; gerçek kartın çıktısı bununla bayt bayt karşılaştırılır. Fark varsa ilk
// farklı satır gösterilir: hangi testin hangi satırı, sorunun hangi kartta olduğunu söyler.
//
// Bağlantı soyut (SerialLink): tarayıcıda Web Serial, komut satırında seri port aygıtı, testlerde
// simülatördeki UART. Programlar zamana bağlı değer yazdırmaz (süre, tık sayısı yok); böylece
// sonuç saat hızından bağımsızdır.

import { assemble } from "../asm/assembler.ts";
import { buildProgram, formatErrors, type LibSources } from "../cc/index.ts";
import { Machine } from "../emu/machine.ts";
import { MachineLink } from "./simlink.ts";
import { intelHex, programHex, uploadHex, type SerialLink } from "./uploader.ts";

type Dil = "tr" | "en";
const cevirici = (dil: Dil) => (tr: string, en: string): string => (dil === "en" ? en : tr);

export interface KartTestProgrami {
  /** dosya adı, ör. "1-cpu.c" */
  ad: string;
  /** kaynağın ilk açıklama satırından */
  aciklama: string;
  hex: string;
  /** program sessiz kalabileceği en uzun süre (ms) */
  zamanAsimiMs: number;
}

export interface KartTestSonucu {
  ad: string;
  ok: boolean;
  beklenen: string;
  gelen: string;
  /** ilk farklı satır ya da hata iletisi */
  mesaj: string;
}

/** Kaynağın ilk satırındaki "ad — açıklama" kısmı */
function aciklamaOf(src: string): string {
  const first = src.split("\n").find((l) => l.trim()) ?? "";
  const m = /—\s*(.*?)\s*(\*\/)?$/.exec(first);
  return (m ? m[1] : first).replace(/^[;/*\s]+/, "").replace(/\.$/, "");
}

/** Test kaynaklarını derler (ad sırasıyla). .c dosyaları cc16 --hedef bios, .s dosyaları as16 ile. */
export function kartTestProgramlari(kaynaklar: Record<string, string>, lib: LibSources): KartTestProgrami[] {
  return Object.keys(kaynaklar)
    .sort((a, b) => a.localeCompare(b, "tr", { numeric: true }))
    .map((ad) => {
      const src = kaynaklar[ad];
      let hex: string;
      if (ad.endsWith(".c")) {
        const b = buildProgram({ [`/${ad}`]: src }, [`/${ad}`], { lib, target: "bios" });
        if (b.errors.length) throw new Error(`${ad}: ${formatErrors(b.errors)}`);
        hex = intelHex(b.ranges.map(([s, e]) => ({ addr: s, data: b.image.subarray(s, e) })), 0x4000);
      } else {
        const r = assemble(src);
        if (r.errors.length) throw new Error(`${ad}: ${r.errors.map((e) => `satır ${e.line}: ${e.message}`).join("; ")}`);
        hex = programHex(r).hex;
      }
      return { ad, aciklama: aciklamaOf(src), hex, zamanAsimiMs: 20000 };
    });
}

/** Program çıktısı ("G" yankısından sonrası): CR'ler atılır, sondaki istem ve boşluklar kırpılır. */
export function ciktiyiAyikla(ham: string): string {
  return ham.replace(/\r/g, "").replace(/>\s*$/, "").replace(/\s+$/, "");
}

/** Programı yükler, çalıştırır ve monitör istemine dönene kadar çıktısını toplar. */
export async function programiCalistir(link: SerialLink, p: KartTestProgrami, onIlerleme?: (s: string) => void, dil: Dil = "tr"): Promise<{ ok: boolean; cikti: string; mesaj: string }> {
  const t = cevirici(dil);
  const up = await uploadHex(link, p.hex, { mode: "ram", run: true, timeoutMs: 3000, dil, onProgress: (d, n) => onIlerleme?.(`${p.ad}: ${t("yükleniyor", "loading")} ${d}/${n}`) });
  if (!up.ok) return { ok: false, cikti: "", mesaj: `${t("yükleme başarısız", "upload failed")}: ${up.message}` };
  onIlerleme?.(`${p.ad}: ${t("çalışıyor", "running")}`);
  // yükleme özetinden sonra monitör yeni istem yazar, G'yi yankılar; program çıktısı ondan sonra başlar
  let got = "";
  let bas = -1;
  for (;;) {
    const ch = await link.read(p.zamanAsimiMs);
    if (ch === null) {
      const msg = bas < 0
        ? t("monitör G komutunu yankılamadı", "the monitor did not echo the G command")
        : t(`program ${p.zamanAsimiMs} ms sessiz kaldı (takıldı mı?)`, `the program was silent for ${p.zamanAsimiMs} ms (stuck?)`);
      return { ok: false, cikti: ciktiyiAyikla(bas < 0 ? "" : got.slice(bas)), mesaj: msg };
    }
    got += ch;
    if (bas < 0) {
      const m = /> G\r?\n$/.exec(got);
      if (m) bas = got.length;
      continue;
    }
    // program bitti: monitör yeni satırda istem yazar
    if (got.endsWith("\n> ")) return { ok: true, cikti: ciktiyiAyikla(got.slice(bas)), mesaj: "" };
  }
}

/** BIOS açılmış, istemde bekleyen bir simülasyon makinesi */
export function simMakinesi(biosFlash: Uint8Array): Machine {
  const m = new Machine();
  m.loadFlash(biosFlash);
  m.reset();
  if (!m.runUntil(() => m.uartOutput.endsWith("> "), 4_000_000)) throw new Error("BIOS simülasyonda açılmadı");
  return m;
}

/** Her programın simülatördeki çıktısı (beklenen sonuç) */
export async function beklenenCiktilar(programlar: KartTestProgrami[], biosFlash: Uint8Array, dil: Dil = "tr"): Promise<string[]> {
  const t = cevirici(dil);
  const out: string[] = [];
  for (const p of programlar) {
    const m = simMakinesi(biosFlash);
    const link = new MachineLink(m, true);
    m.uartOnOutput = (b) => link.push(b);
    const r = await programiCalistir(link, p, undefined, dil);
    if (!r.ok) throw new Error(t(`${p.ad} simülatörde çalışmadı: ${r.mesaj}`, `${p.ad} did not run in the simulator: ${r.mesaj}`));
    out.push(r.cikti);
  }
  return out;
}

/** İki çıktının ilk farklı satırı */
export function ilkFark(beklenen: string, gelen: string, dil: Dil = "tr"): string {
  const t = cevirici(dil);
  const a = beklenen.split("\n"), b = gelen.split("\n");
  const yok = t("(yok)", "(none)");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    const be = JSON.stringify(a[i] ?? yok), ge = JSON.stringify(b[i] ?? yok);
    return t(`satır ${i + 1}: beklenen ${be}, gelen ${ge}`, `line ${i + 1}: expected ${be}, got ${ge}`);
  }
  return "";
}

/** Bütün testleri bağlantı üzerinden çalıştırır ve beklenenle karşılaştırır. */
export async function kartTesti(
  link: SerialLink,
  programlar: KartTestProgrami[],
  beklenen: string[],
  onIlerleme?: (s: string) => void,
  dil: Dil = "tr",
): Promise<KartTestSonucu[]> {
  const sonuc: KartTestSonucu[] = [];
  for (let i = 0; i < programlar.length; i++) {
    const p = programlar[i];
    const r = await programiCalistir(link, p, onIlerleme, dil);
    const fark = r.ok ? ilkFark(beklenen[i], r.cikti, dil) : r.mesaj;
    sonuc.push({ ad: p.ad, ok: r.ok && !fark, beklenen: beklenen[i], gelen: r.cikti, mesaj: fark });
  }
  return sonuc;
}

/** Sonuçların düz metin özeti */
export function sonucMetni(programlar: KartTestProgrami[], sonuc: KartTestSonucu[], dil: Dil = "tr"): string {
  const t = cevirici(dil);
  const L = sonuc.map((s, i) => `${s.ok ? t("GEÇTİ ", "PASS  ") : t("KALDI ", "FAIL  ")} ${s.ad.padEnd(16)} ${programlar[i].aciklama}${s.ok ? "" : `\n        ${s.mesaj}`}`);
  const ok = sonuc.filter((s) => s.ok).length;
  const hepsi = ok === sonuc.length;
  L.push(t(`${ok}/${sonuc.length} test geçti${hepsi ? ": kart simülatörle aynı davranıyor" : ""}`, `${ok}/${sonuc.length} tests passed${hepsi ? ": the board behaves like the simulator" : ""}`));
  return L.join("\n");
}
