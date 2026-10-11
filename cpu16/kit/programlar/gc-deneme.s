; gc-deneme.s — Deney 10: G/Ç kartı denemesi (BIOS'suz, EEPROM bank 0'dan çalışır).
;
; Açılışta UART'a "G/C KARTI" yazar, sonra her şeyi kesmeyle yapar:
;   - zamanlayıcı: her RELOAD tıkında bir '.' (1 MHz CPU'da 250 tık = 1 s; 4 MHz'de 0,25 s)
;   - UART RX: gelen baytı geri yollar (yankı)
;   - klavye: tarama kodunu köşeli parantezle onaltılık yazar, ör. "[1C]" (A tuşu)
; Ana döngü HALT ile uyur. Terminal: Deney 12'deki gibi (1 MHz'de 28 800 baud, 8N1).

IOB     = 0xFF20
O_UDATA = -32           ; FF00
O_USTAT = -31           ; FF01 bit0 RX_READY, bit1 TX_EMPTY
O_KDATA = -30           ; FF02
O_TRELD = -28           ; FF04/05
O_TCTRL = -26           ; FF06 bit0 EN, bit1 IRQ_EN
O_TSTAT = -25           ; FF07 bit0 EXPIRED (1 yazınca silinir)
O_IMASK = -23           ; FF09
O_ISRC  = -22           ; FF0A
RELOAD  = 250

        .org 0
        B    main            ; 0x0000 reset
        B    isr             ; 0x0002 IRQ
        B    main            ; 0x0004 SWI

main:   LI   sp, 0xFF00      ; yığın: pencere 3 (reset'te RAM bank 34)
        LI   r0, banner
        CALL puts
        LI   r5, IOB
        LI   r0, RELOAD
        SW   r0, [r5+O_TRELD]
        LI   r0, 3           ; EN + IRQ_EN (EN 0→1: sayaç RELOAD ile yüklenir)
        SB   r0, [r5+O_TCTRL]
        LI   r0, 7           ; kaynak 0 zamanlayıcı, 1 klavye, 2 UART RX
        SB   r0, [r5+O_IMASK]
        EI
uyku:   HALT
        B    uyku

; ---- kesme: bekleyen her kaynağı sırayla işle, IRQ_SRC 0xFF olunca dön
isr:    PUSH r0
        PUSH r1
        PUSH r3
        PUSH r5
        PUSH lr
i_lp:   LI   r5, IOB
        LBU  r0, [r5+O_ISRC]
        CMPI r0, 0
        BEQ  i_tmr
        CMPI r0, 1
        BEQ  i_kbd
        CMPI r0, 2
        BEQ  i_uart
        POP  lr              ; 0xFF: bekleyen yok
        POP  r5
        POP  r3
        POP  r1
        POP  r0
        RETI
i_tmr:  LI   r0, 1
        SB   r0, [r5+O_TSTAT]  ; EXPIRED'ı sil
        LI   r0, '.'
        CALL putc
        B    i_lp
i_uart: LBU  r0, [r5+O_UDATA]  ; okumak RX_READY'yi siler
        CALL putc
        B    i_lp
i_kbd:  LBU  r1, [r5+O_KDATA]  ; okumak READY'yi siler
        LI   r0, '['
        CALL putc
        MOV  r0, r1
        SHR  r0, r0
        SHR  r0, r0
        SHR  r0, r0
        SHR  r0, r0
        CALL hexdig
        LI   r0, 15
        AND  r0, r1, r0
        CALL hexdig
        LI   r0, ']'
        CALL putc
        B    i_lp

; hexdig(r0 = 0..15): onaltılık basamak yaz
hexdig: CMPI r0, 10
        BLT  hd_num
        ADDI r0, r0, 'A' - '0' - 10
hd_num: LI   r3, '0'
        ADD  r0, r0, r3
        B    putc            ; kuyruk çağrısı: putc'nin RET'i çağırana döner

; putc(r0): TX_EMPTY'yi bekle, gönder (r3 bozulur)
putc:   PUSH r1
        LI   r3, IOB
p_w:    LBU  r1, [r3+O_USTAT]
        SHR  r1, r1
        SHR  r1, r1          ; C = TX_EMPTY
        BCC  p_w
        SB   r0, [r3+O_UDATA]
        POP  r1
        RET

; puts(r0 = metin)
puts:   PUSH r1
        PUSH lr
        MOV  r1, r0
s_lp:   LBU  r0, [r1]
        CMPI r0, 0
        BEQ  s_end
        CALL putc
        ADDI r1, r1, 1
        B    s_lp
s_end:  POP  lr
        POP  r1
        RET

banner: .asciz "G/C KARTI: nokta = zamanlayici, yazilan = UART yankisi, [kod] = klavye\r\n"
