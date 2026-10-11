; renkler.s — 16 yazı × 16 zemin rengini (CGA paleti) bir tablo olarak çizer.
; Renk baytı: düşük 4 bit yazı rengi, yüksek 4 bit zemin rengi.

BIOS_PUTC    = 0x0018
BIOS_PUTS    = 0x0030
BIOS_PUTHEX2 = 0x0040
BIOS_SETATTR = 0x0068

        .org 0x4000
main:   PUSH lr
        LI   r0, title
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0
        LI   r1, 0              ; zemin
row:    LI   r2, 0              ; yazı
cell:   MOV  r0, r1
        SHL  r0, r0
        SHL  r0, r0
        SHL  r0, r0
        SHL  r0, r0
        OR   r0, r0, r2
        LI   r3, BIOS_SETATTR
        JALR lr, r3, 0
        LI   r3, BIOS_PUTHEX2   ; renk baytının kendisini yaz
        JALR lr, r3, 0
        LI   r0, 0xFE           ; ■
        LI   r3, BIOS_PUTC
        JALR lr, r3, 0
        LI   r0, ' '
        LI   r3, BIOS_PUTC
        JALR lr, r3, 0
        ADDI r2, r2, 1
        CMPI r2, 16
        BNE  cell
        LI   r0, 0x07
        LI   r3, BIOS_SETATTR
        JALR lr, r3, 0
        LI   r0, 10
        LI   r3, BIOS_PUTC
        JALR lr, r3, 0
        ADDI r1, r1, 1
        CMPI r1, 16
        BNE  row
        POP  lr
        RET

title:  .asciz "CPU16 renk paleti (yazi + zemin):\n"
