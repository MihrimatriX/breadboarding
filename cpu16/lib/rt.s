; rt.s — cc16 çalışma zamanı yardımcıları (derleyici bunları doğrudan çağırır) ve
; assembly ile yazılmış küçük libc fonksiyonları.
;
; Çağrı kuralı: 16 bit işlenenler r0, r1; 32 bit işlenenler r1:r0 ve r3:r2 (r0 / r2 düşük kelime).
; Sonuç r0 (32 bit: r1:r0). Hepsi r0–r3 ve r7'yi bozabilir, r4/r5'i korur.
; CPU16'da donanım çarpma/bölme yok, kaydırmalar 1 bitlik: hepsi kaydır-topla / kaydır-çıkar döngüleri.

UART = 0xFF00

        .text
; ---------------------------------------------------------------- 16 bit
; __mul16: r0 = r0 * r1 (düşük 16 bit; işaretli ve işaretsiz için aynı)
__mul16:
        MOV  r2, r0
        LI   r0, 0
.m16:   SHR  r1, r1              ; çarpanın düşük biti C'ye
        BCC  .m16s
        ADD  r0, r0, r2
.m16s:  SHL  r2, r2
        CMPI r1, 0
        BNE  .m16
        RET

; __udiv16: r0 = r0 / r1, r1 = r0 % r1 (işaretsiz, kaydır-çıkar). Bozar: r2, r3
__udiv16:
        MOV  r2, r1              ; bölen
        LI   r1, 0               ; kalan
        LI   r3, 16
.ud16:  SHL  r0, r0              ; bölünenin üst biti C'ye, bölüm biti için yer
        ROL  r1, r1              ; kalan = kalan*2 + bit (C = 17. bit)
        BCS  .ud16s
        CMP  r1, r2
        BCC  .ud16n
.ud16s: SUB  r1, r1, r2
        ADDI r0, r0, 1
.ud16n: ADDI r3, r3, -1
        BNE  .ud16
        RET

; __umod16: r0 = r0 % r1 (işaretsiz)
__umod16:
        PUSH lr
        CALL __udiv16
        MOV  r0, r1
        POP  lr
        RET

; __div16: r0 = r0 / r1 (işaretli, sıfıra doğru kesme: -7 / 2 = -3)
__div16:
        PUSH lr
        MOV  r2, r0
        XOR  r2, r2, r1          ; bit 15 = sonucun işareti
        PUSH r2
        CMPI r0, 0
        BGE  .d16a
        NEG  r0, r0
.d16a:  CMPI r1, 0
        BGE  .d16b
        NEG  r1, r1
.d16b:  CALL __udiv16
        POP  r2
        CMPI r2, 0
        BGE  .d16c
        NEG  r0, r0
.d16c:  POP  lr
        RET

; __mod16: r0 = r0 % r1 (işaretli; sonucun işareti bölünenin işareti: -7 % 2 = -1)
__mod16:
        PUSH lr
        PUSH r0
        CMPI r0, 0
        BGE  .md16a
        NEG  r0, r0
.md16a: CMPI r1, 0
        BGE  .md16b
        NEG  r1, r1
.md16b: CALL __udiv16
        MOV  r0, r1
        POP  r2
        CMPI r2, 0
        BGE  .md16c
        NEG  r0, r0
.md16c: POP  lr
        RET

; ---------------------------------------------------------------- 32 bit
; __mul32: r1:r0 = r1:r0 * r3:r2 (düşük 32 bit)
__mul32:
        PUSH lr
        PUSH r4
        PUSH r5
        MOV  r4, r0              ; çarpılan r5:r4
        MOV  r5, r1
        LI   r0, 0
        LI   r1, 0
.m32:   OR   r7, r2, r3          ; çarpan sıfırlandı mı?
        BEQ  .m32e
        SHR  r3, r3
        ROR  r2, r2              ; çarpanın düşük biti C'ye
        BCC  .m32s
        ADD  r0, r0, r4
        ADC  r1, r1, r5
.m32s:  SHL  r4, r4
        ROL  r5, r5
        B    .m32
.m32e:  POP  r5
        POP  r4
        POP  lr
        RET

; __udiv32: r1:r0 = r1:r0 / r3:r2, r3:r2 = kalan (işaretsiz)
__udiv32:
        PUSH lr
        OR   r7, r1, r3          ; iki üst kelime de 0 ise 16 bitlik hızlı yol
        BNE  .ud32f
        MOV  r1, r2              ; r0 / r2 (16 bit)
        CALL __udiv16
        MOV  r2, r1
        LI   r1, 0
        LI   r3, 0
        POP  lr
        RET
.ud32f: PUSH r4
        PUSH r5
        LI   r4, 0               ; kalan r5:r4
        LI   r5, 0
        LI   r7, 32
.ud32:  SHL  r0, r0
        ROL  r1, r1
        ROL  r4, r4
        ROL  r5, r5              ; C = kalanın 33. biti
        BCS  .ud32s
        CMP  r5, r3
        BCC  .ud32n              ; kalan.yüksek < bölen.yüksek
        BNE  .ud32s              ; kalan.yüksek > bölen.yüksek
        CMP  r4, r2
        BCC  .ud32n
.ud32s: SUB  r4, r4, r2
        SBC  r5, r5, r3
        ADDI r0, r0, 1
.ud32n: ADDI r7, r7, -1
        BNE  .ud32
        MOV  r2, r4
        MOV  r3, r5
        POP  r5
        POP  r4
        POP  lr
        RET

; __umod32: r1:r0 = r1:r0 % r3:r2
__umod32:
        PUSH lr
        CALL __udiv32
        MOV  r0, r2
        MOV  r1, r3
        POP  lr
        RET

; __div32: işaretli 32 bit bölme (sıfıra doğru kesme)
__div32:
        PUSH lr
        MOV  r7, r1
        XOR  r7, r7, r3
        PUSH r7                  ; sonucun işareti
        CMPI r1, 0
        BGE  .d32a
        LI   r7, 0
        SUB  r0, r7, r0
        SBC  r1, r7, r1
.d32a:  CMPI r3, 0
        BGE  .d32b
        LI   r7, 0
        SUB  r2, r7, r2
        SBC  r3, r7, r3
.d32b:  CALL __udiv32
        POP  r7
        CMPI r7, 0
        BGE  .d32c
        LI   r7, 0
        SUB  r0, r7, r0
        SBC  r1, r7, r1
.d32c:  POP  lr
        RET

; __mod32: işaretli 32 bit kalan (işaret bölünenden)
__mod32:
        PUSH lr
        PUSH r1
        CMPI r1, 0
        BGE  .md32a
        LI   r7, 0
        SUB  r0, r7, r0
        SBC  r1, r7, r1
.md32a: CMPI r3, 0
        BGE  .md32b
        LI   r7, 0
        SUB  r2, r7, r2
        SBC  r3, r7, r3
.md32b: CALL __udiv32
        MOV  r0, r2
        MOV  r1, r3
        POP  r7
        CMPI r7, 0
        BGE  .md32c
        LI   r7, 0
        SUB  r0, r7, r0
        SBC  r1, r7, r1
.md32c: POP  lr
        RET

; ---------------------------------------------------------------- bellek
; __copyw: r0 = hedef, r1 = kaynak, r2 = bayt (çift, > 0). r0 korunur. (struct kopyalama)
__copyw:
        PUSH r0
.cw:    LW   r3, [r1]
        SW   r3, [r0]
        ADDI r0, r0, 2
        ADDI r1, r1, 2
        ADDI r2, r2, -2
        BNE  .cw
        POP  r0
        RET

; __copyb: r0 = hedef, r1 = kaynak, r2 = bayt (>= 0). r0 korunur.
__copyb:
        PUSH r0
        CMPI r2, 0
        BEQ  .cbe
.cb:    LBU  r3, [r1]
        SB   r3, [r0]
        ADDI r0, r0, 1
        ADDI r1, r1, 1
        ADDI r2, r2, -1
        BNE  .cb
.cbe:   POP  r0
        RET

; __zerow: r0 = adres, r1 = bayt (çift, > 0)
__zerow:
        LI   r2, 0
.zw:    SW   r2, [r0]
        ADDI r0, r0, 2
        ADDI r1, r1, -2
        BNE  .zw
        RET

; ---------------------------------------------------------------- libc (assembly)
; int putchar(int c): UART veri register'ına yaz
_putchar:
        LI   r1, UART
        SB   r0, [r1]
        LI   r1, 255
        AND  r0, r0, r1
        RET

; void exit(int code): r0'daki kodla dur
_exit:  HALT
        B    _exit

; void ei(void), di(void), halt(void): kesme kontrolü
_ei:    EI
        RET
_di:    DI
        RET
_halt:  HALT
        RET
