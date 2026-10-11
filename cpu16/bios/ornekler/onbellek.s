; onbellek.s — aynı döngüyü önbellek açıkken ve kapalıyken çalıştırıp süreleri (10 ms tık)
; ve önbelleğin isabet / ıskalama sayaçlarını yazar (deney 10: cache + bekleme durumu).
; Iskalama ana bellek veriyolunda 2 bekleme durumu ekler; önbellek kapalıyken her erişim öyle.

BIOS_PUTS    = 0x0030
BIOS_PUTHEX4 = 0x0038
BIOS_NEWLINE = 0x0050
BIOS_TICKS   = 0x0070
CACHE        = 0xFF30           ; +0 isabet, +2 ıskalama, +4 denetim

        .org 0x4000
main:   PUSH lr
        LI   r0, 1
        CALL bench
        LI   r0, 0
        CALL bench
        LI   r5, CACHE
        LI   r0, 1
        SB   r0, [r5+4]         ; önbelleği yeniden aç
        POP  lr
        RET

; bench: r0 = önbellek denetimi (1 açık, 0 kapalı). Döngüyü çalıştırır, sonuçları yazar.
bench:  PUSH lr
        LI   r5, CACHE
        SB   r0, [r5+4]
        LI   r4, msg_on
        CMPI r0, 0
        BNE  b1
        LI   r4, msg_off
b1:     SB   r0, [r5]           ; sayaçları sıfırla
        LI   r3, BIOS_TICKS
        JALR lr, r3, 0
        PUSH r0
        ; iş yükü: 10 × 1000 tur, her turda bir kelime okunup yazılır
        LI   r2, 10
outer:  LI   r1, 1000
        LI   r0, buf
inner:  LW   r3, [r0]
        ADDI r3, r3, 1
        SW   r3, [r0]
        ADDI r1, r1, -1
        BNE  inner
        ADDI r2, r2, -1
        BNE  outer
        LW   r1, [r5]           ; isabet (16 bit sayaç)
        LW   r2, [r5+2]         ; ıskalama
        PUSH r1
        PUSH r2
        LI   r3, BIOS_TICKS
        JALR lr, r3, 0          ; r0:r1
        POP  r2
        POP  r1
        POP  r3                 ; başlangıç tıkı
        SUB  r3, r0, r3         ; geçen tık
        MOV  r0, r4
        MOV  r4, r3
        CALL puts
        MOV  r0, r4
        CALL hex4
        LI   r0, msg_hit
        CALL puts
        MOV  r0, r1
        CALL hex4
        LI   r0, msg_miss
        CALL puts
        MOV  r0, r2
        CALL hex4
        LI   r3, BIOS_NEWLINE
        JALR lr, r3, 0
        POP  lr
        RET

puts:   LI   r3, BIOS_PUTS
        JALR r3, r3, 0
hex4:   LI   r3, BIOS_PUTHEX4
        JALR r3, r3, 0

msg_on:   .asciz "Onbellek acik:  sure 0x"
msg_off:  .asciz "Onbellek kapali: sure 0x"
msg_hit:  .asciz " x10ms, isabet 0x"
msg_miss: .asciz ", iskalama 0x"
        .align 2
buf:    .word 0
