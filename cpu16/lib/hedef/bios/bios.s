; BIOS hedefi (cc --hedef bios): BIOS atlama tablosu çağrıları ve BIOS üzerinden putchar/exit.
; Çağrı kuralı cc16 ABI'siyle aynı (docs/bios.md): argümanlar r0–r2, dönüş r0 (TICKS r0:r1),
; r3 bozulur, r4–r5 korunur. Son işi BIOS çağrısı olanlar kuyruk çağrısıdır (lr değişmez).
; Bu dosyadaki tanımlar kütüphanedekilerin (rt.s: putchar, exit) yerine geçer.

BIOS_MONITOR   = 0x0010
BIOS_PUTC      = 0x0018
BIOS_GETC      = 0x0020
BIOS_TRYGETC   = 0x0028
BIOS_PUTS      = 0x0030
BIOS_PUTHEX4   = 0x0038
BIOS_NEWLINE   = 0x0050
BIOS_CLS       = 0x0058
BIOS_SETCURSOR = 0x0060
BIOS_SETATTR   = 0x0068
BIOS_TICKS     = 0x0070

        .text
; int putchar(int c): VGA'ya ve UART'a; c & 0xFF döner
_putchar:
        PUSH lr
        PUSH r0
        LI   r3, BIOS_PUTC
        JALR lr, r3, 0
        POP  r0
        LI   r1, 255
        AND  r0, r0, r1
        POP  lr
        RET

; void exit(int code): monitöre döner (BIOS yığını sıfırlanır)
_exit:
        LI   r3, BIOS_MONITOR
        JALR r3, r3, 0

; int bios_getc(void): tuş gelene kadar bekler (klavye ya da UART)
_bios_getc:
        LI   r3, BIOS_GETC
        JALR r3, r3, 0

; int bios_trygetc(void): tuş yoksa -1
_bios_trygetc:
        LI   r3, BIOS_TRYGETC
        JALR r3, r3, 0

; void bios_puts(const char *s): satır sonu eklemez
_bios_puts:
        LI   r3, BIOS_PUTS
        JALR r3, r3, 0

; void bios_puthex4(unsigned v)
_bios_puthex4:
        LI   r3, BIOS_PUTHEX4
        JALR r3, r3, 0

; void bios_cls(void)
_bios_cls:
        LI   r3, BIOS_CLS
        JALR r3, r3, 0

; void bios_setcursor(int x, int y)
_bios_setcursor:
        LI   r3, BIOS_SETCURSOR
        JALR r3, r3, 0

; void bios_setattr(int attr): düşük 4 bit yazı, yüksek 4 bit zemin rengi
_bios_setattr:
        LI   r3, BIOS_SETATTR
        JALR r3, r3, 0

; unsigned long bios_ticks(void): açılıştan beri 10 ms'lik tıklar
_bios_ticks:
        LI   r3, BIOS_TICKS
        JALR r3, r3, 0
