; saat.s — ekranı temizler, çerçeve çizer ve BIOS'un 10 ms tık sayacıyla geçen süreyi
; dakika:saniye olarak gösterir. Bir tuşa (klavye ya da UART) basınca monitöre döner.
; Çerçeve karakterleri CP857 kod sayfasından: ╔ C9, ═ CD, ╗ BB, ║ BA, ╚ C8, ╝ BC.

BIOS_PUTC      = 0x0018
BIOS_TRYGETC   = 0x0028
BIOS_PUTS      = 0x0030
BIOS_CLS       = 0x0058
BIOS_SETCURSOR = 0x0060
BIOS_SETATTR   = 0x0068
BIOS_TICKS     = 0x0070

LEFT  = 25              ; çerçevenin sol üst köşesi
TOP   = 11
WIDTH = 30              ; iç genişlik

        .org 0x4000
main:   PUSH lr
        LI   r0, 0x1F
        CALL setattr
        LI   r3, BIOS_CLS
        JALR lr, r3, 0
        ; üst kenar
        LI   r0, LEFT
        LI   r1, TOP
        CALL setcursor
        LI   r0, 0xC9
        CALL putc
        CALL hline
        LI   r0, 0xBB
        CALL putc
        ; orta satırlar
        LI   r1, TOP+1
mid:    LI   r0, LEFT
        CALL setcursor
        LI   r0, 0xBA
        CALL putc
        LI   r2, WIDTH
spc:    LI   r0, ' '
        CALL putc
        ADDI r2, r2, -1
        BNE  spc
        LI   r0, 0xBA
        CALL putc
        ADDI r1, r1, 1
        CMPI r1, TOP+4
        BNE  mid
        ; alt kenar
        LI   r0, LEFT
        CALL setcursor
        LI   r0, 0xC8
        CALL putc
        CALL hline
        LI   r0, 0xBC
        CALL putc
        ; başlık
        LI   r0, LEFT+8
        LI   r1, TOP+1
        CALL setcursor
        LI   r0, title
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0
        LI   r0, LEFT+4
        LI   r1, TOP+3
        CALL setcursor
        LI   r0, hint
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0
        ; ölçüm
        LI   r3, BIOS_TICKS
        JALR lr, r3, 0
        MOV  r4, r0             ; son saniyenin başladığı tık
        LI   r5, 0              ; geçen saniye
        CALL show
wait:   LI   r3, BIOS_TRYGETC
        JALR lr, r3, 0
        CMPI r0, -1
        BNE  done
        LI   r3, BIOS_TICKS
        JALR lr, r3, 0
        SUB  r0, r0, r4
        CMPI r0, 100
        BLT  wait               ; işaretli: 327 saniyeye kadar yeterli
        LI   r0, 100
        ADD  r4, r4, r0
        ADDI r5, r5, 1
        CALL show
        B    wait
done:   LI   r0, 0x07
        CALL setattr
        LI   r3, BIOS_CLS
        JALR lr, r3, 0
        POP  lr
        RET

; show: r5 saniyeyi "dd:ss" olarak yaz (dakika 0–99)
show:   PUSH lr
        LI   r0, LEFT+12
        LI   r1, TOP+2
        CALL setcursor
        MOV  r1, r5
        LI   r2, 0              ; dakika
min:    CMPI r1, 60
        BLT  mdone
        ADDI r1, r1, -30
        ADDI r1, r1, -30
        ADDI r2, r2, 1
        B    min
mdone:  MOV  r0, r2
        CALL dec2
        LI   r0, ':'
        CALL putc
        MOV  r0, r1
        CALL dec2
        POP  lr
        RET

; dec2: r0 (0–99) iki ondalık basamak. Bozar r0, r3.
dec2:   PUSH lr
        PUSH r1
        LI   r1, '0'
tens:   CMPI r0, 10
        BLT  ones
        ADDI r0, r0, -10
        ADDI r1, r1, 1
        B    tens
ones:   PUSH r0
        MOV  r0, r1
        CALL putc
        POP  r0
        LI   r3, '0'
        ADD  r0, r0, r3
        CALL putc
        POP  r1
        POP  lr
        RET

hline:  PUSH lr                 ; WIDTH × ═
        PUSH r2
        LI   r2, WIDTH
hl:     LI   r0, 0xCD
        CALL putc
        ADDI r2, r2, -1
        BNE  hl
        POP  r2
        POP  lr
        RET

; BIOS çağrılarını kısaltan sarmalayıcılar (r3 bozulur)
putc:   LI   r3, BIOS_PUTC
        JALR r3, r3, 0          ; kuyruk çağrısı: BIOS doğrudan çağırana döner
setcursor:
        LI   r3, BIOS_SETCURSOR
        JALR r3, r3, 0
setattr:
        LI   r3, BIOS_SETATTR
        JALR r3, r3, 0

title:  .asciz "CPU16 saati"
hint:   .asciz "cikmak icin bir tusa basin"
