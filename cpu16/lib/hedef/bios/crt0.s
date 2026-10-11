; crt0 (BIOS hedefi, cc --hedef bios): program BIOS'un önyükleyicisiyle RAM'e, 0x4000'dan
; yüklenir; monitörün G komutu onu alt program olarak çağırır (G 4000).
;
;  1. lr ve BIOS'un yığın göstergesini sakla, SP = __stack_top (0xF800: BIOS değişkenlerinin altı)
;  2. .data'nın ilk değer imajını yerine kopyala, .bss'i sıfırla (crt0.s ile aynı)
;  3. main(0, 0) çağır
;  4. BIOS yığınına dön, RET ile monitöre (çıkış kodu r0'da)
;
; Vektörler BIOS'undur (kesmeleri BIOS işler; kullanıcı kancası için BIOS_SETIRQHOOK).
; Bu dosya kütüphanenin crt0.s'inin yerine geçer: __reset burada tanımlı olduğu için onunki bağlanmaz.

        .text
__reset:
        PUSH lr
        LI   r0, .biossp
        SW   sp, [r0]
        LI   sp, __stack_top
        LI   r0, __data_start
        LI   r1, __data_load
        LI   r2, __data_end
.copy:  CMP  r0, r2
        BCS  .copied
        LW   r3, [r1]
        SW   r3, [r0]
        ADDI r0, r0, 2
        ADDI r1, r1, 2
        B    .copy
.copied:
        LI   r0, __bss_start
        LI   r2, __bss_end
        LI   r3, 0
.zero:  CMP  r0, r2
        BCS  .zeroed
        SW   r3, [r0]
        ADDI r0, r0, 2
        B    .zero
.zeroed:
        LI   r0, 0               ; argc
        LI   r1, 0               ; argv
        CALL _main
        LI   r1, .biossp
        LW   sp, [r1]
        POP  lr
        RET

.biossp: .word 0
