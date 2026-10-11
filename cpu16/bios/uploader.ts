// BIOS önyükleyicisine Intel HEX gönderen istemci (bios.md, "Önyükleyici protokolü").
// Aynı kod üç yerde çalışır: simülatördeki UART (Web IDE ve testler), Web Serial ile gerçek
// kart ve CLI. Bağlantı soyut: yazma + zaman aşımlı karakter okuma.

import type { AsmResult } from "../asm/assembler.ts";

export interface SerialLink {
  write(text: string): Promise<void>;
  /** Gelen bir sonraki karakter; zaman aşımında null. */
  read(timeoutMs: number): Promise<string | null>;
}

export interface UploadOptions {
  /** "ram": L komutu, "flash": F komutu (SST komut dizisiyle Flash'a). */
  mode: "ram" | "flash";
  /** Yükleme bitince G ile çalıştır. */
  run?: boolean;
  /** Bir karakter için en uzun bekleme (ms). */
  timeoutMs?: number;
  /** Sağlama hatasında ('!') aynı kaydı en çok kaç kez yeniden gönder. */
  retries?: number;
  onProgress?: (done: number, total: number) => void;
  log?: (text: string) => void;
}

export interface UploadResult {
  ok: boolean;
  message: string;
  records: number;
}

// ---------------------------------------------------------------- Intel HEX üretimi

const h2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");

function record(type: number, addr: number, data: ArrayLike<number>): string {
  const bytes = [data.length, (addr >> 8) & 0xff, addr & 0xff, type, ...Array.from(data)];
  const sum = -bytes.reduce((a, b) => a + b, 0) & 0xff;
  return ":" + bytes.map(h2).join("") + h2(sum);
}

export interface HexChunk {
  /** 32 bit hedef adres (Flash için ofset; 64 KB üstü 04 kaydıyla). */
  addr: number;
  data: ArrayLike<number>;
}

/** Parçaları Intel HEX'e çevirir: gerekirse 04 (genişletilmiş doğrusal adres), isteğe bağlı 05 (başlangıç), sonda 01. */
export function intelHex(chunks: HexChunk[], entry?: number, perLine = 16): string {
  const out: string[] = [];
  let upper = 0;
  for (const ch of chunks) {
    for (let i = 0; i < ch.data.length; ) {
      const a = ch.addr + i;
      const up = a >>> 16;
      if (up !== upper) {
        out.push(record(4, 0, [(up >> 8) & 0xff, up & 0xff]));
        upper = up;
      }
      // Kayıt 64 KB sınırını aşmasın
      const n = Math.min(perLine, ch.data.length - i, 0x10000 - (a & 0xffff));
      out.push(record(0, a & 0xffff, Array.from({ length: n }, (_, k) => ch.data[i + k])));
      i += n;
    }
  }
  if (entry !== undefined) out.push(record(5, 0, [(entry >>> 24) & 0xff, (entry >>> 16) & 0xff, (entry >> 8) & 0xff, entry & 0xff]));
  out.push(record(1, 0, []));
  return out.join("\n") + "\n";
}

/** Derlenmiş programın HEX'i. Giriş: `main`/`start` etiketi, yoksa ilk bayt. `base` verilirse
 * adresler o fiziksel / Flash ofsetine kaydırılır (ör. Flash bank 5: 0x14000). */
export function programHex(asm: AsmResult, base?: number): { hex: string; entry: number; size: number } {
  const first = asm.ranges.length ? asm.ranges[0][0] : 0;
  const entry = asm.symbols.get("main") ?? asm.symbols.get("start") ?? first;
  const chunks = asm.ranges.map(([s, e]) => ({
    addr: base === undefined ? s : base + (s - first),
    data: asm.image.subarray(s, e),
  }));
  const size = asm.ranges.reduce((n, [s, e]) => n + e - s, 0);
  return { hex: intelHex(chunks, entry), entry, size };
}

// ---------------------------------------------------------------- protokol

/** Gelen karakterleri `until` sağlanana kadar biriktirir. */
async function expect(link: SerialLink, until: (got: string) => boolean, timeoutMs: number, what: string): Promise<string> {
  let got = "";
  for (;;) {
    const ch = await link.read(timeoutMs);
    if (ch === null) throw new Error(`Zaman aşımı: ${what} bekleniyordu` + (got ? ` (gelen: ${JSON.stringify(got.slice(-60))})` : ""));
    got += ch;
    if (until(got)) return got;
  }
}

/** Monitördeki BIOS'a HEX gönderir: "L"/"F", kayıt başına yanıt ('.', '!', 'X'), sonunda "> ". */
export async function uploadHex(link: SerialLink, hex: string, opts: UploadOptions): Promise<UploadResult> {
  const timeout = opts.timeoutMs ?? 2000;
  const retries = opts.retries ?? 3;
  const log = opts.log ?? (() => {});
  const lines = hex.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith(":"));
  try {
    // Monitörün istemde olduğundan emin ol: boş satır → "> "
    await link.write("\r");
    await expect(link, (g) => g.endsWith("> "), timeout, "monitör istemi (\"> \")");
    await link.write(opts.mode === "flash" ? "F\r" : "L\r");
    await expect(link, (g) => /HEX[^\n]*\n$/.test(g), timeout, "\"HEX bekleniyor\" satırı");
    log(`${lines.length} kayıt gönderiliyor (${opts.mode === "flash" ? "Flash" : "RAM"})…\n`);
    let done = 0;
    for (const line of lines) {
      let reply = "";
      for (let attempt = 0; attempt <= retries; attempt++) {
        await link.write(line + "\r\n");
        const got = await expect(link, (g) => /[.!X]$/.test(g), timeout * 4, "kayıt yanıtı");
        reply = got.slice(-1);
        if (reply !== "!") break;
        log(`sağlama hatası, yeniden: ${line}\n`);
      }
      if (reply === "X") {
        const rest = await expect(link, (g) => g.endsWith("> "), timeout, "hata iletisi");
        const msg = rest.replace(/> $/, "").trim();
        return { ok: false, message: msg || "BIOS kaydı reddetti", records: done };
      }
      if (reply !== ".") return { ok: false, message: `kayıt ${done + 1} tekrar tekrar bozuk geldi`, records: done };
      done++;
      opts.onProgress?.(done, lines.length);
    }
    const tail = await expect(link, (g) => g.endsWith("> "), timeout * 4, "yükleme özeti");
    const summary = tail.replace(/> $/, "").trim();
    log(summary + "\n");
    if (opts.run) await link.write("G\r");
    return { ok: true, message: summary, records: done };
  } catch (e) {
    return { ok: false, message: (e as Error).message, records: 0 };
  }
}
