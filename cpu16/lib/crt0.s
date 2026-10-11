; crt0.s — cc16 başlangıç kodu (her C programına bağlanır, ROM'un başına, 0x0000'a yerleşir)
;
;  1. Vektörler: 0x0000 reset, 0x0002 IRQ, 0x0004 SWI (her biri tek komut)
;  2. SP = __stack_top (0xFF00), yığın aşağı doğru büyür
;  3. .data'nın ilk değer imajını ROM'dan RAM'e kopyala (__data_load → __data_start..__data_end)
;  4. .bss'i sıfırla (__bss_start..__bss_end)
;  5. main(0, 0) çağır, dönüş değeri r0'da kalarak HALT
;
; Bağlayıcı sembolleri (__data_load, __data_start ...) linker.ts tarafından tanımlanır.
; Yalnızca __reset globaldir; diğer etiketler '.' ile başlar (dosyaya özel), böylece crt0 tek parça kalır.

        .text
__reset:
        B    .start              ; 0x0000 reset
        B    .irq                ; 0x0002 IRQ
        B    .swi                ; 0x0004 SWI
.start:
        LI   sp, __stack_top
        LI   r0, __data_start
        LI   r1, __data_load
        LI   r2, __data_end
.copy:  CMP  r0, r2              ; r0 >= __data_end ise bitti
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
.halt:  HALT                     ; çıkış kodu r0'da
        B    .halt

; Kesme girişi: CPU PC ve bayrakları zaten yığına attı. C işleyicisi r0–r3 ve r7'yi bozabilir.
.irq:   PUSH r0
        PUSH r1
        PUSH r2
        PUSH r3
        PUSH r7
        CALL _irq_handler
        POP  r7
        POP  r3
        POP  r2
        POP  r1
        POP  r0
        RETI

.swi:   PUSH r0
        PUSH r1
        PUSH r2
        PUSH r3
        PUSH r7
        CALL _swi_handler
        POP  r7
        POP  r3
        POP  r2
        POP  r1
        POP  r0
        RETI
