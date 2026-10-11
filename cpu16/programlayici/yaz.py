#!/usr/bin/env python3
"""CPU16 EEPROM programlayıcısına Intel HEX dosyası yazar (Arduino Nano + 28C256).

Kullanım:
  python3 yaz.py PORT dosya.hex [--dogrula] [--koruma-kapat]
  python3 yaz.py PORT --koruma           # yazma koruması (SDP) açık mı
  python3 yaz.py PORT --koruma-ac        # korumayı aç
  python3 yaz.py PORT --koruma-kapat     # korumayı kapat
  python3 yaz.py --kuru dosya.hex [--dogrula] [--koruma-kapat]   # gönderilecek komutları yazdır

Örnekler:
  python3 yaz.py /dev/ttyUSB0 bellek.hex --dogrula
  python3 yaz.py COM5 bios.hex --dogrula

28C256 silme istemez: her bayt doğrudan yeni değerini alır (--sil yok sayılır). Programlayıcı her
sayfayı yazılım korumalı yazar (AA 55 A0 dizisi), çip korumalı da olsa korumasız da olsa yazılır ve
sonunda korumalı kalır: bilgisayarda yanlışlıkla yapılan bir yazma BIOS'u bozamaz. --koruma-kapat
yazmadan sonra korumayı kapatır (çipi korumasız bekleyen başka bir programlayıcıda kullanmak için).

Gereken: pip install pyserial  (yalnızca gerçek port için)
Protokol: cpu16/programlayici/cpu16-programlayici/cpu16-programlayici.ino başındaki açıklama.
"""

import sys
import time

EEPROM_SIZE = 0x8000


def read_hex(path):
    """Intel HEX satırları ve (adres, bayt) listesi; 04 kayıtları da okunur."""
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


def commands(path, verify, unprotect=False):
    lines, data = read_hex(path)
    outside = [a for a in data if a >= EEPROM_SIZE]
    if outside:
        raise ValueError(f"{path}: 0x{min(outside):05X} adresi 28C256'nın dışında (32 KB: 0000–7FFF)")
    cmds = ["SDP"] + lines
    if not any(l[7:9] == "01" for l in lines):
        cmds.append(":00000001FF")
    checks = []
    if verify:
        for a, n in ranges(data):
            cmds.append(f"SUM {a:X} {n:X}")
            checks.append(sum(data[a + i] for i in range(n)) & 0xFFFF)
    if unprotect:
        cmds.append("SDP 0")
    return cmds, checks


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    flags = {a for a in argv if a.startswith("--")}
    if "--sil" in flags:
        print("Not: 28C256 silme gerektirmez, --sil yok sayıldı.", file=sys.stderr)
    if "--id" in flags:
        print("Not: 28C256'nın kimliği yazılımla okunamaz (A9'a 12 V ister); --koruma ile çipin yanıt verdiğini görebilirsin.", file=sys.stderr)
        flags.add("--koruma")
    verify = "--dogrula" in flags
    unprotect = "--koruma-kapat" in flags
    if "--kuru" in flags:
        cmds, _ = commands(args[0], verify, unprotect)
        print("\n".join(cmds))
        return 0
    only_sdp = len(args) == 1 and flags & {"--koruma", "--koruma-ac", "--koruma-kapat"}
    if len(args) < 2 and not only_sdp:
        print(__doc__)
        return 1
    if only_sdp:
        cmds, checks = ["SDP"], []
        if "--koruma-ac" in flags:
            cmds.append("SDP 1")
        elif "--koruma-kapat" in flags:
            cmds.append("SDP 0")
    else:
        cmds, checks = commands(args[1], verify, unprotect)
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

    hex_lines = [c for c in cmds if c.startswith(":")]
    done = 0
    for cmd in cmds:
        reply = send(cmd)
        if reply.startswith("ERR"):
            print(f"\nhata: {cmd} → {reply}")
            return 2
        if cmd == "SDP":
            print("yazma koruması:", "açık" if reply == "OK SDP 1" else "kapalı")
        elif cmd.startswith("SDP "):
            print("yazma koruması", "açıldı" if cmd.endswith("1") else "kapatıldı")
        elif cmd.startswith(":"):
            done += 1
            print(f"\ryazılıyor: {done}/{len(hex_lines)} satır", end="", flush=True)
        elif cmd.startswith("SUM"):
            want = checks.pop(0)
            got = int(reply.split()[-1], 16)
            if got != want:
                print(f"\ndoğrulama hatası: {cmd}: beklenen {want:04X}, okunan {got:04X}")
                return 3
    if hex_lines:
        print("\ntamam" + (", doğrulandı" if verify else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
