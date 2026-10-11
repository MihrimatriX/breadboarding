// Intel HEX çıktısı: EEPROM programlayıcıları (TL866/T48, kendi Arduino programlayıcımız) bu biçimi okur.

const h2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");

function record(type: number, addr: number, data: number[]): string {
  const bytes = [data.length, (addr >> 8) & 0xff, addr & 0xff, type, ...data];
  const sum = (-bytes.reduce((a, b) => a + b, 0)) & 0xff;
  return ":" + bytes.map(h2).join("") + h2(sum);
}

export function toIntelHex(image: Uint8Array, ranges: [number, number][], perLine = 16): string {
  const out: string[] = [];
  for (const [start, end] of ranges) {
    for (let a = start; a < end; a += perLine) {
      out.push(record(0, a, Array.from(image.subarray(a, Math.min(end, a + perLine)))));
    }
  }
  out.push(record(1, 0, []));
  return out.join("\n") + "\n";
}

export function fromIntelHex(text: string): Uint8Array {
  const image = new Uint8Array(0x10000);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.startsWith(":")) throw new Error(`Geçersiz HEX satırı: ${line}`);
    const bytes = line.slice(1).match(/../g)!.map((b) => parseInt(b, 16));
    if (bytes.reduce((a, b) => a + b, 0) & 0xff) throw new Error(`HEX sağlama toplamı hatalı: ${line}`);
    const [len, hi, lo, type] = bytes;
    if (type === 1) break;
    if (type === 0) image.set(bytes.slice(4, 4 + len), (hi << 8) | lo);
  }
  return image;
}
