# CPU16 — Komut Seti Ayrıntıları (Faz 1)

> `spec.md`'deki opcode haritasının bit bit davranışı. Referans emülatör (`cpu16/emu/cpu.ts`) bu belgeyi uygular; bir çelişki görürsen ikisi birlikte düzeltilir.

## Register'lar ve bayraklar

- `r0`–`r7`, 16 bit. Gelenek: `r6` = **sp**, `r7` = **lr**. Donanımda bunları sadece PUSH/POP/RETI/SWI/IRQ (`r6`) ve JAL (`r7`) bilir.
- PC: byte adresi, her zaman çift. Reset: tüm register'lar 0, PC = `0x0000`, bayraklar 0 (kesmeler kapalı).
- Bayrak kelimesi (yığına atılan biçim): `bit0 V, bit1 C, bit2 Z, bit3 N, bit4 I`.

## Bayrakları kim değiştirir

| Komut | N | Z | C | V |
|---|---|---|---|---|
| ADD ADC SUB SBC CMP NEG ADDI CMPI | ✔ | ✔ | ✔ | ✔ |
| AND OR XOR MOV NOT SXB | ✔ | ✔ | — | — |
| SHL SHR SAR ROL ROR | ✔ | ✔ | çıkan bit | 0 |
| LI LUI LW LBU SW SB dallanmalar JAL JALR PUSH POP | — | — | — | — |
| RETI | yığından geri yüklenir |

- **Çıkarmada C = "borç yok"** (ARM tarzı): `SUB a, b` sonrası `C = 1` ⇔ `a ≥ b` (işaretsiz). `SBC`: `a − b − (1 − C)`. Böylece 32 bit çıkarma `SUB` + `SBC` ile yapılır.
- `ROL`/`ROR` **elde üzerinden** döner (17 bit): 32 bit kaydırma = `SHL düşük` + `ROL yüksek`.
- `ADDI` bayrak günceller: `ADDI r, r, -1` + `BNE` döngü kalıbı.

## Bellek erişimi

- Little-endian. `LW`/`SW` adresin **bit 0'ını yok sayar** (hizasız erişim yok; donanımda adres hattı A0 kelime erişiminde kullanılmaz).
- Ofsetler: `LW`/`SW`/`JALR` 6 bit × 2 → −64..+62 bayt; `LBU`/`SB` 6 bit → −32..+31 bayt.
- `0xFF00`: UART veri register'ı. Faz 1 emülatöründe yazılan bayt konsola gider.

## Dallanma ve çağrı

- Hedefler **bir sonraki komuta göre** (PC+2) hesaplanır: `hedef = PC + 2 + ofset × 2`.
  `Bcc` ±256 bayt (−128..+127 komut), `JAL` ±4 KB.
- `JAL`: `lr = PC + 2`. `JALR rd, rs1, ofs`: önce hedef `rs1 + ofs` okunur, sonra `rd = PC + 2` yazılır.
- `RET` = `JALR lr, lr, 0`. Uzak çağrı: `LI r5, fonk` + `JALR lr, r5, 0`.
- Koşul kodları (`cond` alanı):

| # | Ad | Koşul | # | Ad | Koşul |
|---|---|---|---|---|---|
| 0 | EQ | Z | 8 | HI | C ∧ ¬Z (işaretsiz >) |
| 1 | NE | ¬Z | 9 | LS | ¬C ∨ Z (işaretsiz ≤) |
| 2 | CS | C (işaretsiz ≥) | 10 | GE | N = V |
| 3 | CC | ¬C (işaretsiz <) | 11 | LT | N ≠ V |
| 4 | MI | N | 12 | GT | ¬Z ∧ N = V |
| 5 | PL | ¬N | 13 | LE | Z ∨ N ≠ V |
| 6 | VS | V | 14 | AL | her zaman (`B`) |
| 7 | VC | ¬V | 15 | — | yasadışı |

## Yığın ve kesmeler

- Yığın **aşağı doğru büyür**, `sp` son yazılan kelimeyi gösterir: `PUSH` = `sp −= 2; [sp] = r`, `POP` = `r = [sp]; sp += 2`.
- Vektörler: `0x0000` reset, `0x0002` IRQ, `0x0004` SWI. Her biri tek bir `B`/`JAL` komutudur.
- **Kesmeye giriş** (IRQ, komut sınırında `I = 1` ise; SWI her zaman): `PUSH PC`, `PUSH bayraklar`, `I = 0`, `PC = vektör`.
- `RETI`: bayrakları, sonra PC'yi yığından alır (I eski haline döner).
- IRQ hattı **seviye tetiklemeli**: cihaz, işleyici onu onaylayana kadar hattı tutar.
- `HALT` işlemciyi durdurur; `I = 1` iken gelen IRQ onu uyandırır (klavye beklerken güç ve döngü harcamaz).

## Yasadışı komutlar

Opcode 2 ve 15, `cond = 15`, STACK `f3 ≥ 2`, SYS `f3 = 7`. Emülatör durur ve adresi `illegalAt`'te bildirir. (Donanımdaki davranış Faz 2'de mikrokodla belirlenecek; hedef: aynı şekilde durmak.)
