; 2-bellek.s — kart testi 2: ana bellek, bank register'ları ve bayt hatları.
;
; Pencere 2'yi (0x8000–0xBFFF) sırayla RAM bankı 35..63'e eşler; her bankı adres ve bank
; numarasından üretilen bir desenle doldurup geri okur, ardından tersini yazıp yine okur. Böylece
; her veri biti iki değeri de görür ve iki bankın aynı yeri göstermesi (adres hattı kısa devresi,
; kopuk bank biti) yakalanır. Son olarak tek / çift baytlara ayrı ayrı yazar (DE/DO hatları).
; Program pencere 1'de (0x4000), yığın pencere 3'te çalıştığı için pencere 2 serbesttir.
; Sonunda pencere 2 yeniden bank 33'e döner.

BIOS_PUTS    = 0x0030
BIOS_PUTHEX4 = 0x0038
BIOS_PUTHEX2 = 0x0040
BIOS_NEWLINE = 0x0050
BANK2        = 0xFF12
PENCERE      = 0x8000

        .org 0x4000
main:   PUSH lr
        PUSH r4
        PUSH r5
        LI   r0, msg_bas
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0
        LI   r5, 0              ; toplam hata
        LI   r4, 35             ; bank
bank:   LI   r1, BANK2
        SB   r4, [r1]
        ; 1. geçiş: desen = adres ^ (bank · 0x101)
        CALL desen
        CALL doldur
        CALL denetle
        ADD  r5, r5, r0
        ; 2. geçiş: tersi
        CALL desen
        NOT  r2, r2
        CALL doldur
        CALL denetle
        ADD  r5, r5, r0
        ; ilerleme: her 4 bankta bir nokta
        LI   r0, 3
        AND  r0, r4, r0
        BNE  ilerle
        LI   r0, msg_nokta
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0
ilerle: ADDI r4, r4, 1
        CMPI r4, 64
        BNE  bank
        ; bayt hatları: pencere 2 bank 35'te; çift / tek adreslere ayrı yaz, kelime olarak oku
        LI   r1, BANK2
        LI   r0, 35
        SB   r0, [r1]
        LI   r1, PENCERE
        LI   r0, 0
        SW   r0, [r1]
        LI   r0, 0x5A
        SB   r0, [r1]           ; çift bayt (düşük)
        LI   r0, 0xC3
        SB   r0, [r1+1]         ; tek bayt (yüksek)
        LW   r0, [r1]
        LI   r2, 0xC35A
        CMP  r0, r2
        BEQ  bayt_ok
        ADDI r5, r5, 1
        PUSH r0
        LI   r0, msg_bayt
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0
        POP  r0
        LI   r3, BIOS_PUTHEX4
        JALR lr, r3, 0
        LI   r3, BIOS_NEWLINE
        JALR lr, r3, 0
bayt_ok:
        LBU  r0, [r1+1]         ; tek bayt okuma + işaret genişletme: 0xC3 → 0xFFC3
        SXB  r0, r0
        LI   r2, 0xFFC3
        CMP  r0, r2
        BEQ  lb_ok
        ADDI r5, r5, 1
        LI   r0, msg_lb
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0
lb_ok:  LI   r1, BANK2
        LI   r0, 33
        SB   r0, [r1]           ; pencere 2'yi geri ver
        LI   r3, BIOS_NEWLINE
        JALR lr, r3, 0
        LI   r0, msg_hata
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0
        MOV  r0, r5
        LI   r3, BIOS_PUTHEX4
        JALR lr, r3, 0
        LI   r3, BIOS_NEWLINE
        JALR lr, r3, 0
        CMPI r5, 0
        BNE  son
        LI   r0, msg_ok
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0
son:    POP  r5
        POP  r4
        POP  lr
        RET

; desen: r2 = r4 · 0x101 (bank numarası iki bayta)
desen:  MOV  r2, r4
        LI   r0, 8
ds1:    SHL  r2, r2
        ADDI r0, r0, -1
        BNE  ds1
        OR   r2, r2, r4
        RET

; doldur: pencereyi (8192 kelime) desen r2 ^ adres ile doldurur
doldur: LI   r1, PENCERE
d1:     XOR  r0, r1, r2
        SW   r0, [r1]
        ADDI r1, r1, 2
        LI   r0, PENCERE + 0x4000
        CMP  r1, r0
        BNE  d1
        RET

; denetle: aynı deseni okur; r0 = hatalı kelime sayısı (ilk hatanın bankı ve adresi yazılır)
denetle:
        PUSH lr
        LI   r1, PENCERE
        LI   r3, 0
k1:     LW   r0, [r1]
        PUSH r3
        XOR  r3, r1, r2
        CMP  r0, r3
        POP  r3
        BEQ  k2
        CMPI r3, 0
        BNE  k3
        PUSH r1
        PUSH r2
        PUSH r3
        PUSH r1
        LI   r0, msg_yer
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0
        MOV  r0, r4
        LI   r3, BIOS_PUTHEX2
        JALR lr, r3, 0
        LI   r0, msg_adr
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0
        POP  r0
        LI   r3, BIOS_PUTHEX4
        JALR lr, r3, 0
        LI   r3, BIOS_NEWLINE
        JALR lr, r3, 0
        POP  r3
        POP  r2
        POP  r1
k3:     ADDI r3, r3, 1
k2:     ADDI r1, r1, 2
        LI   r0, PENCERE + 0x4000
        CMP  r1, r0
        BNE  k1
        MOV  r0, r3
        POP  lr
        RET

msg_bas:   .asciz "Bellek testi: bank 35..63 (464 KB) "
msg_nokta: .asciz "."
msg_yer:   .asciz "\nHATA bank "
msg_adr:   .asciz " adres "
msg_bayt:  .asciz "HATA bayt hatlari: "
msg_lb:    .asciz "HATA isaretli bayt okuma\n"
msg_hata:  .asciz "hatali kelime: "
msg_ok:    .asciz "BELLEK OK\n"
