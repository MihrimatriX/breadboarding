; hello.s — UART'a (0xFF00) "Merhaba, CPU16!" yazar.
UART = 0xFF00

        .org 0x0000
reset:  B    main            ; 0x0000 reset vektörü
        B    main            ; 0x0002 IRQ (kullanılmıyor)
        B    main            ; 0x0004 SWI (kullanılmıyor)

main:   LI   sp, 0xFF00      ; yığın G/Ç alanının hemen altından başlar
        LI   r1, msg         ; r1 = mesajın adresi
        LI   r2, UART        ; r2 = UART veri register'ı
loop:   LBU  r0, [r1]        ; bir bayt oku
        CMPI r0, 0
        BEQ  done            ; 0 ise bitti
        SB   r0, [r2]        ; UART'a gönder
        ADDI r1, r1, 1
        B    loop
done:   HALT

msg:    .asciz "Merhaba, CPU16!\n"
