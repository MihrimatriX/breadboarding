; merhaba.s — BIOS üzerinde çalışan ilk program.
; Önyükleyiciyle RAM'e (0x4000) yüklenir, monitörün G komutu onu alt program olarak
; çağırır; RET ile monitöre döner. BIOS rutinleri atlama tablosundan çağrılır:
;   LI   r3, BIOS_xxx
;   JALR lr, r3, 0
; (r3 bozulur; r1, r2, r4, r5 korunur.)

BIOS_PUTC    = 0x0018
BIOS_PUTS    = 0x0030
BIOS_PUTHEX4 = 0x0038
BIOS_SETATTR = 0x0068

        .org 0x4000
main:   PUSH lr
        LI   r0, 0x1E           ; sarı yazı, mavi zemin
        LI   r3, BIOS_SETATTR
        JALR lr, r3, 0
        LI   r0, msg
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0
        LI   r0, 0x07           ; normal renk
        LI   r3, BIOS_SETATTR
        JALR lr, r3, 0
        ; 1'den 10'a kadar topla, sonucu hex yaz
        LI   r1, 10
        LI   r0, 0
loop:   ADD  r0, r0, r1
        ADDI r1, r1, -1
        BNE  loop
        PUSH r0
        LI   r0, msg2
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0
        POP  r0
        LI   r3, BIOS_PUTHEX4
        JALR lr, r3, 0
        LI   r0, 10
        LI   r3, BIOS_PUTC
        JALR lr, r3, 0
        POP  lr
        RET

msg:    .asciz "Merhaba, CPU16! Bu program UART uzerinden yuklendi.\n"
msg2:   .asciz "1+2+...+10 = 0x"
