#!/usr/bin/env python3
"""CPU16 Flash programlayıcısına Intel HEX dosyası yazar (Arduino Nano + SST39SF010A).

Kullanım:
  python3 yaz.py PORT dosya.hex [--sil] [--dogrula]
  python3 yaz.py PORT --id
  python3 yaz.py --kuru dosya.hex [--sil] [--dogrula]   # gönderilecek komutları yazdır, port açma

Örnekler:
  python3 yaz.py /dev/ttyUSB0 ../roms/mikrokod-0.hex --sil --dogrula
  python3 yaz.py COM5 ../roms/alu-1.hex --sil

Gereken: pip install pyserial  (yalnızca gerçek port için)
Protokol: cpu16/programlayici/cpu16-programlayici/cpu16-programlayici.ino başındaki açıklama.
"""

import sys
import time


def read_hex(path):
    """Intel HEX satırları ve (adres, bayt) listesi; 04 kayıtlarıyla 64 KB üstü desteklenir."""
    lines, data, base = [], {}, 0
    with open(path, encoding="ascii") as f:
        for raw in f:
            line = raw.strip()
            if not line:
                continue
            if not line.startswith(":"):
                raise ValueError(f"geçersiz HEX satırı: {line}")
            b = bytes.fromhex(line[1:])
            if sum(b) & 0xFF:
                raise ValueError(f"sağlama toplamı hatalı: {line}")
            n, addr, typ = b[0], (b[1] << 8) | b[2], b[3]
            lines.append(line)
            if typ == 0:
                for i in range(n):
                    data[base + addr + i] = b[4 + i]
            elif typ == 4:
                base = ((b[4] << 8) | b[5]) << 16
            elif typ == 1:
                break
    return lines, data


def ranges(data, limit=4096):
    """Ardışık adresleri (başlangıç, uzunluk) parçalarına böl"""
    out = []
    for a in sorted(data):
        if out and out[-1][0] + out[-1][1] == a and out[-1][1] < limit:
            out[-1][1] += 1
        else:
            out.append([a, 1])
    return out


def commands(path, erase, verify):
    lines, data = read_hex(path)
    cmds = ["ID"]
    if erase:
        cmds.append("ERASE")
    cmds += lines
    if not any(l[7:9] == "01" for l in lines):
        cmds.append(":00000001FF")
    checks = []
    if verify:
        for a, n in ranges(data):
            cmds.append(f"SUM {a:X} {n:X}")
            checks.append(sum(data[a + i] for i in range(n)) & 0xFFFF)
    return cmds, checks


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    flags = {a for a in argv if a.startswith("--")}
    if "--kuru" in flags:
        cmds, _ = commands(args[0], "--sil" in flags, "--dogrula" in flags)
        print("\n".join(cmds))
        return 0
    if len(args) < 1 or (len(args) < 2 and "--id" not in flags):
        print(__doc__)
        return 1
    try:
        import serial  # pyserial
    except ImportError:
        print("pyserial gerekli: pip install pyserial")
        return 1

    port = serial.Serial(args[0], 115200, timeout=5)
    time.sleep(2)  # Arduino port açılınca yeniden başlar
    port.reset_input_buffer()

    def send(cmd):
        port.write((cmd + "\n").encode("ascii"))
        while True:
            reply = port.readline().decode("ascii", "replace").strip()
            if not reply:
                raise TimeoutError(f"yanıt yok: {cmd}")
            if reply.startswith("OK") or reply.startswith("ERR"):
                return reply

    reply = send("ID")
    print("çip:", reply)
    if reply != "OK ID BF B5":
        print("Uyarı: SST39SF010A beklenen kimliği (BF B5) dönmedi. Çip doğru takılı mı?")
    if "--id" in flags:
        return 0
    cmds, checks = commands(args[1], "--sil" in flags, "--dogrula" in flags)
    hex_lines = [c for c in cmds if c.startswith(":")]
    done = 0
    for cmd in cmds[1:]:
        reply = send(cmd)
        if reply.startswith("ERR"):
            print(f"\nhata: {cmd} → {reply}")
            return 2
        if cmd.startswith(":"):
            done += 1
            print(f"\ryazılıyor: {done}/{len(hex_lines)} satır", end="", flush=True)
        elif cmd.startswith("SUM"):
            want = checks.pop(0)
            got = int(reply.split()[-1], 16)
            if got != want:
                print(f"\ndoğrulama hatası: {cmd}: beklenen {want:04X}, okunan {got:04X}")
                return 3
    print("\ntamam" + (", doğrulandı" if "--dogrula" in flags else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
