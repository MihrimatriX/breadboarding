; add32.s — 32 bit toplama (ADC) ve yazılımla 16x16=32 çarpma (kaydır-topla).
; Sonuçlar: 0x4000 = 0x0001_2345 + 0x0002_FFFF (32 bit)
;           0x4004 = 1234 * 5678 (32 bit)

        .org 0
        B    main
        B    main
        B    main

main:   LI   sp, 0xFF00
        ; --- 32 bit toplama: (r1:r0) + (r3:r2), r1/r3 yüksek kelime
        LI   r0, 0x2345
        LI   r1, 0x0001
        LI   r2, 0xFFFF
        LI   r3, 0x0002
        ADD  r0, r0, r2      ; düşük kelimeler, C taşıma
        ADC  r1, r1, r3      ; yüksek kelimeler + C
        LI   r4, 0x4000
        SW   r0, [r4]
        SW   r1, [r4+2]

        ; --- çarpma
        LI   r0, 1234
        LI   r1, 5678
        CALL mul16
        LI   r4, 0x4004
        SW   r0, [r4]
        SW   r1, [r4+2]
        HALT

; mul16: r1:r0 = r0 * r1 (işaretsiz). Bozar: r2, r3, r4, r5
; Kaydır-topla: çarpanın her bitine bak, 1 ise çarpılanı (32 bit) topla.
mul16:  MOV  r2, r0          ; r3:r2 = çarpılan (32 bit)
        LI   r3, 0
        MOV  r4, r1          ; r4 = çarpan
        LI   r0, 0           ; r1:r0 = sonuç
        LI   r1, 0
        LI   r5, 16          ; 16 bit
.bit:   SHR  r4, r4          ; en düşük bit C'ye
        BCC  .skip
        ADD  r0, r0, r2
        ADC  r1, r1, r3
.skip:  SHL  r2, r2          ; çarpılan <<= 1 (32 bit: SHL + ROL)
        ROL  r3, r3
        ADDI r5, r5, -1
        BNE  .bit
        RET
