; fib.s — ilk 20 Fibonacci sayısını 0x4000'den itibaren belleğe yazar.
OUT = 0x4000
N   = 20

        .org 0
        B    main
        B    main
        B    main

main:   LI   r1, OUT         ; yazma işaretçisi
        LI   r2, 0           ; a = 0
        LI   r3, 1           ; b = 1
        LI   r4, N           ; sayaç
loop:   SW   r2, [r1]
        ADDI r1, r1, 2
        ADD  r5, r2, r3      ; t = a + b
        MOV  r2, r3          ; a = b
        MOV  r3, r5          ; b = t
        ADDI r4, r4, -1
        BNE  loop
        HALT
