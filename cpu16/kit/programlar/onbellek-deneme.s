; onbellek-deneme.s — Deney 9: önbellek denemesi (BIOS'suz, Flash bank 0'dan çalışır).
;
; FF00'daki 8 LED'de bit 0–6 arasında kayan ışık. Işık bir turu önbellek açıkken, bir sonraki
; turu kapalıyken atar; bit 7 önbelleğin o anki durumudur (CACHE_CTRL geri okunarak yakılır).
; Bekleme döngüsü her adımda aynı iki komutu binlerce kez çalıştırır: önbellek kapalıyken her
; komut Flash'tan iki bekleme turuyla okunur, açıkken ilk turdan sonra hep isabet eder. Bit 7
; yanarken ışık gözle görülür biçimde daha hızlı kayar: 1 MHz'de bir adım ≈ 0,16 s, önbellek
; kapalıyken ≈ 0,23 s (döngü komut başına 5 yerine 7 döngü sürer, ≈ 1,4 kat).

IOB     = 0xFF20
O_LED   = -32           ; FF00
O_CCTRL = 20            ; FF34: bit0 önbellek açık

        .org 0
        B    main            ; 0x0000 reset
        B    main            ; 0x0002 IRQ (kesmeler kapalı)
        B    main            ; 0x0004 SWI

main:   LI   r5, IOB
        LI   r4, 1           ; r4 = istenen önbellek durumu
tur:    SB   r4, [r5+O_CCTRL]
        LI   r3, 1           ; kayan bit
adim:   LBU  r0, [r5+O_CCTRL]  ; geri oku: register'ın okuma yolu da sınanır
        LI   r2, 1
        AND  r0, r0, r2
        LI   r2, 0
        BEQ  a_led
        LI   r2, 0x80
a_led:  OR   r2, r2, r3
        SB   r2, [r5+O_LED]
        CALL bekle
        SHL  r3, r3
        CMPI r3, 0x80
        BNE  adim
        LI   r2, 1           ; tur bitti: önbelleği aç/kapa
        XOR  r4, r4, r2
        B    tur

; bekle: aynı iki komut 0x4000 kez
bekle:  LI   r1, 0x4000
b_lp:   ADDI r1, r1, -1
        BNE  b_lp
        RET
