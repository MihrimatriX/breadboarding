; bubble.s — 0x4000'deki 8 işaretli sayıyı küçükten büyüğe sıralar (bubble sort).
ARR = 0x4000
LEN = 8

        .org 0
        B    main
        B    main
        B    main

main:   LI   sp, 0xFF00
        ; diziyi veriden ARR'a kopyala
        LI   r1, data
        LI   r2, ARR
        LI   r3, LEN
copy:   LW   r0, [r1]
        SW   r0, [r2]
        ADDI r1, r1, 2
        ADDI r2, r2, 2
        ADDI r3, r3, -1
        BNE  copy

        LI   r5, LEN-1       ; dış döngü: LEN-1 tur
outer:  LI   r1, ARR
        MOV  r4, r5          ; iç döngü sayacı
inner:  LW   r2, [r1]
        LW   r3, [r1+2]
        CMP  r2, r3
        BLE  noswap          ; işaretli karşılaştırma
        SW   r3, [r1]
        SW   r2, [r1+2]
noswap: ADDI r1, r1, 2
        ADDI r4, r4, -1
        BNE  inner
        ADDI r5, r5, -1
        BNE  outer
        HALT

data:   .word 5, -3, 1000, 0, -32768, 42, 7, 32767
