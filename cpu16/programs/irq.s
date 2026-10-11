; irq.s — kesme örneği: ana döngü HALT ile bekler, her IRQ'da sayaç artar.
; Test, cpu.irq hattını kaldırıp indirerek dış bir cihazı taklit eder.
COUNT = 0x4000
ACK   = 0x4002              ; kesme işleyici buraya 1 yazar (cihaz onayı yerine)

        .org 0
        B    main            ; reset
        B    isr             ; IRQ
        B    main            ; SWI

main:   LI   sp, 0xFF00
        LI   r1, COUNT
        LI   r0, 0
        SW   r0, [r1]
        EI
wait:   HALT                 ; kesmeye kadar uyu
        B    wait

isr:    PUSH r0
        PUSH r1
        LI   r1, COUNT
        LW   r0, [r1]
        ADDI r0, r0, 1
        SW   r0, [r1]
        LI   r0, 1
        SW   r0, [r1+2]      ; ACK
        POP  r1
        POP  r0
        RETI
