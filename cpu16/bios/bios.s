; =============================================================================
; bios.s — CPU16 BIOS v1 (ROM bank 0: EEPROM 0x00000–0x03FFF, CPU 0x0000–0x3FFF)
;
; Vektörler, açılış, atlama tablosu (programlar için BIOS rutinleri), kesme
; işleyici (zamanlayıcı + PS/2 klavye), VGA metin sürücüsü, UART, monitör ve
; Intel HEX önyükleyicisi (RAM'e ya da korumalı sayfa yazmasıyla EEPROM'a).
; Belge: cpu16/docs/bios.md · Donanım: cpu16/docs/anakart.md
;
; Çağrı kuralı (atlama tablosu): argümanlar r0–r2, dönüş r0 (TICKS: r0:r1).
; r3 her çağrıda bozulur; r1, r2, r4, r5 korunur (dönüş değeri olanlar hariç).
; =============================================================================

; ---- G/Ç: taban register'ı IOB = 0xFF20, ofsetler LBU/SB için −32..+31
IOB      = 0xFF20
O_UDATA  = -32          ; FF00 W UART_TX / R UART_RX
O_USTAT  = -31          ; FF01 bit0 RX_READY, bit1 TX_EMPTY
O_KDATA  = -30          ; FF02 klavye tarama kodu (okuyunca READY silinir)
O_KSTAT  = -29          ; FF03 bit0 READY
O_TRELD  = -28          ; FF04/05 zamanlayıcı yeniden yükleme (16 bit, SW)
O_TCTRL  = -26          ; FF06 bit0 EN, bit1 IRQ_EN
O_TSTAT  = -25          ; FF07 bit0 EXPIRED (1 yazınca silinir)
O_IPEND  = -24          ; FF08 bekleyen kesmeler
O_IMASK  = -23          ; FF09 kesme maskesi
O_ISRC   = -22          ; FF0A en öncelikli kaynak (yoksa 0xFF)
O_BANK0  = -16          ; FF10
O_BANK1  = -15          ; FF11
O_BANK2  = -14          ; FF12
O_BANK3  = -13          ; FF13
O_VADDR  = 0            ; FF20/21 VRAM adresi (16 bit, SW)
O_VDATA  = 2            ; FF22 VRAM verisi, adres kendiliğinden artar
O_VCTRL  = 3            ; FF23 bit0 imleç
O_CURX   = 4            ; FF24
O_CURY   = 5            ; FF25
O_VSTAT  = 6            ; FF26 bit0 vblank, bit1 vsync bayrağı
O_CHITS  = 16           ; FF30/31 önbellek isabet (LW)
O_CMISS  = 18           ; FF32/33 önbellek ıskalama (LW)
O_CCTRL  = 20           ; FF34 bit0 önbellek açık

; ---- RAM yerleşimi (pencere 3 = bank 34)
VARS     = 0xF800       ; BIOS değişkenleri (aşağıda)
KBUF     = VARS + 16    ; klavye halka tamponu (16 bayt)
LINEBUF  = 0xF840       ; komut satırı (80 bayt)
ROWBUF   = 0xF8A0       ; kaydırma için satır tamponu (160 bayt)
RECBUF   = 0xF940       ; HEX kaydı verisi (256 bayt)
FLASHRT  = 0xFA40       ; EEPROM yazma rutinlerinin RAM kopyası
STACK    = 0xFF00       ; yığın 0xFEFF'ten aşağı (0xFC00'e kadar)
USER_LO  = 0x4000       ; kullanıcı RAM'i: 0x4000–0xF7FF
USER_END = 0xF800
FLUSH    = 0xC000       ; önbellek boşaltmada okunan 2 KB RAM

; ---- değişkenler: bayt (VARS+0..15), kelime (VARS+32..62)
V_COL    = 0
V_ROW    = 1
V_ATTR   = 2
V_KBRK   = 3            ; F0 alındı (bırakma)
V_KEXT   = 4            ; E0 alındı (genişletilmiş)
V_KSHIFT = 5
V_KCTRL  = 6
V_KCAPS  = 7
V_KHEAD  = 8            ; halka tamponu: ISR yazar
V_KTAIL  = 9            ; okuyan
V_LASTCR = 10           ; önceki satır CR ile bitti
V_MODE   = 11           ; HEX yükleme: 0 RAM, 1 EEPROM
V_CCSAVE = 12           ; önbellek denetiminin eski değeri
V_TLO    = 32           ; 10 ms tık sayacı (32 bit)
V_THI    = 34
V_DUMP   = 36           ; D komutunun kaldığı adres
V_ENTRY  = 38           ; son yüklenen programın giriş adresi (0xFFFF: yok)
V_EXT    = 40           ; HEX genişletilmiş doğrusal adres (üst 16 bit)
V_COUNT  = 42           ; yüklenen bayt
V_RLEN   = 44           ; geçerli kayıt: uzunluk, adres, tür
V_RADDR  = 46
V_RTYPE  = 48
V_UHOOK  = 54           ; kullanıcı IRQ kancası (0: yok)

ATTR_NORMAL = 0x07      ; açık gri / siyah
ATTR_TITLE  = 0x1F      ; beyaz / mavi

; =============================================================================
; Vektörler ve atlama tablosu
; =============================================================================
        .org 0x0000
        B    reset            ; 0x0000 reset
        B    irq              ; 0x0002 IRQ
        B    swi              ; 0x0004 SWI
        .word 0x0100          ; 0x0006 BIOS sürümü 1.0
        .ascii "CPU16 B1"     ; 0x0008 imza

; Atlama tablosu: 0x0010 + 8·n. Her yuva uzak bir atlamadır (r3 bozulur, lr korunur):
;   LI   r3, BIOS_PUTC
;   JALR lr, r3, 0
        .org 0x0010
        LI   r3, monitor      ; 0x0010 MONITOR: monitöre dön (yığın sıfırlanır)
        JALR r3, r3, 0
        .align 8
        LI   r3, putc         ; 0x0018 PUTC(r0): VGA + UART ('\n' → CR LF)
        JALR r3, r3, 0
        .align 8
        LI   r3, getc         ; 0x0020 GETC → r0 (klavye ya da UART, bekler)
        JALR r3, r3, 0
        .align 8
        LI   r3, trygetc      ; 0x0028 TRYGETC → r0 (yoksa 0xFFFF)
        JALR r3, r3, 0
        .align 8
        LI   r3, puts         ; 0x0030 PUTS(r0 = sıfır sonlu metin)
        JALR r3, r3, 0
        .align 8
        LI   r3, puthex4      ; 0x0038 PUTHEX4(r0)
        JALR r3, r3, 0
        .align 8
        LI   r3, puthex2      ; 0x0040 PUTHEX2(r0 düşük bayt)
        JALR r3, r3, 0
        .align 8
        LI   r3, getline      ; 0x0048 GETLINE(r0 = tampon, r1 = en çok) → r0 = uzunluk
        JALR r3, r3, 0
        .align 8
        LI   r3, newline      ; 0x0050 NEWLINE
        JALR r3, r3, 0
        .align 8
        LI   r3, cls          ; 0x0058 CLS
        JALR r3, r3, 0
        .align 8
        LI   r3, setcursor    ; 0x0060 SETCURSOR(r0 = sütun, r1 = satır)
        JALR r3, r3, 0
        .align 8
        LI   r3, setattr      ; 0x0068 SETATTR(r0 = renk: düşük 4 bit yazı, yüksek 4 bit zemin)
        JALR r3, r3, 0
        .align 8
        LI   r3, ticks        ; 0x0070 TICKS → r0:r1 = 10 ms tık sayısı (r1 yüksek)
        JALR r3, r3, 0
        .align 8
        LI   r3, uart_putc    ; 0x0078 UART_PUTC(r0)
        JALR r3, r3, 0
        .align 8
        LI   r3, uart_getc    ; 0x0080 UART_GETC → r0 (bekler)
        JALR r3, r3, 0
        .align 8
        LI   r3, vga_putc     ; 0x0088 VGA_PUTC(r0)
        JALR r3, r3, 0
        .align 8
        LI   r3, setirqhook   ; 0x0090 SETIRQHOOK(r0 = işleyici adresi, 0 = kaldır)
        JALR r3, r3, 0
        .align 8

; Vektörlerin B ile ulaşabileceği trambolinler (B ±256 bayt)
reset:  LI   r3, init
        JALR r3, r3, 0
swi:    LI   r3, swi_h
        JALR r3, r3, 0

; =============================================================================
; Kesme işleyici: zamanlayıcı (kaynak 0) ve klavye (kaynak 1). Diğer kaynaklar
; kullanıcı kancasına gider; kanca yoksa maskelenir.
; =============================================================================
irq:    PUSH r0
        PUSH r1
        PUSH r2
        PUSH r3
        PUSH r4
        PUSH r5
        PUSH lr
irq_lp: LI   r5, IOB
        LBU  r0, [r5+O_ISRC]
        CMPI r0, 0
        BEQ  irq_tmr
        CMPI r0, 1
        BEQ  irq_kbd
        CMPI r0, 0xFF
        BEQ  irq_out
        ; kullanıcı kaynağı (UART RX, vsync)
        LI   r4, VARS
        LW   r3, [r4+V_UHOOK]
        CMPI r3, 0
        BEQ  irq_mask
        JALR lr, r3, 0          ; kanca: r0 = kaynak no, kaynağı onaylayıp RET etmeli
        B    irq_lp
irq_mask:                       ; kanca yok: kaynağı maskele (kesme fırtınası olmasın)
        LI   r1, 1
irq_bit: CMPI r0, 0
        BEQ  irq_clr
        SHL  r1, r1
        ADDI r0, r0, -1
        B    irq_bit
irq_clr: NOT  r1, r1
        LBU  r0, [r5+O_IMASK]
        AND  r0, r0, r1
        SB   r0, [r5+O_IMASK]
        B    irq_lp
irq_tmr: LI   r0, 1
        SB   r0, [r5+O_TSTAT]   ; EXPIRED'ı sil
        LI   r4, VARS
        LW   r0, [r4+V_TLO]
        ADDI r0, r0, 1
        SW   r0, [r4+V_TLO]
        BNE  irq_lp
        LW   r0, [r4+V_THI]
        ADDI r0, r0, 1
        SW   r0, [r4+V_THI]
        B    irq_lp
irq_kbd: LBU  r0, [r5+O_KDATA]  ; okumak READY'yi siler
        CALL kbd_byte
        B    irq_lp
irq_out: POP  lr
        POP  r5
        POP  r4
        POP  r3
        POP  r2
        POP  r1
        POP  r0
        RETI

; SWI: kesme noktası. "SWI @ adres" yazar ve monitöre döner (r3 trambolinde bozulur).
swi_h:  LW   r1, [sp+2]         ; yığında: [sp] bayraklar, [sp+2] dönüş adresi
        LI   r0, s_swi
        CALL puts
        ADDI r0, r1, -2
        CALL puthex4
        CALL newline
        B    monitor

; =============================================================================
; Açılış
; =============================================================================
init:   LI   sp, STACK
        LI   r5, IOB
        LI   r0, 0
        SB   r0, [r5+O_IMASK]
        SB   r0, [r5+O_BANK0]   ; pencere 0: ROM bank 0 (BIOS)
        LI   r0, 32
        SB   r0, [r5+O_BANK1]   ; pencere 1–3: RAM bank 32, 33, 34
        LI   r0, 33
        SB   r0, [r5+O_BANK2]
        LI   r0, 34
        SB   r0, [r5+O_BANK3]
        LI   r0, 1
        SB   r0, [r5+O_CCTRL]   ; önbellek açık
        ; değişkenleri sıfırla
        LI   r1, VARS
        LI   r2, 32             ; 64 bayt
        LI   r0, 0
rs_clr: SW   r0, [r1]
        ADDI r1, r1, 2
        ADDI r2, r2, -1
        BNE  rs_clr
        LI   r4, VARS
        LI   r0, ATTR_NORMAL
        SB   r0, [r4+V_ATTR]
        LI   r0, -1
        SW   r0, [r4+V_ENTRY]
        LI   r0, USER_LO
        SW   r0, [r4+V_DUMP]
        ; EEPROM yazma rutinlerini RAM'e kopyala (yazma döngüsünde EEPROM'dan komut okunamaz)
        LI   r1, flashrt
        LI   r2, FLASHRT
        LI   r0, flashrt_end
rs_cpy: LW   r3, [r1]
        SW   r3, [r2]
        ADDI r1, r1, 2
        ADDI r2, r2, 2
        CMP  r1, r0
        BCC  rs_cpy
        ; ekran
        CALL cls
        LI   r0, 1
        SB   r0, [r5+O_VCTRL]   ; imleç açık
        ; zamanlayıcı: 10 ms (1 kHz tık × 10), kesmeli
        LI   r0, 10
        SW   r0, [r5+O_TRELD]
        LI   r0, 3
        SB   r0, [r5+O_TCTRL]
        LI   r0, 3              ; maske: zamanlayıcı + klavye
        SB   r0, [r5+O_IMASK]
        ; afiş
        LI   r0, ATTR_TITLE
        CALL setattr
        LI   r0, s_banner
        CALL puts
        LI   r0, ATTR_NORMAL
        CALL setattr
        LI   r0, s_info
        CALL puts
        ; düşer: monitör

; =============================================================================
; Monitör
; =============================================================================
monitor:
        LI   sp, STACK
        EI
mon_lp: LI   r0, s_prompt
        CALL puts
        LI   r0, LINEBUF
        LI   r1, 78
        CALL getline
        LI   r1, LINEBUF
        CALL skipsp
        LBU  r0, [r1]
        CMPI r0, 0
        BEQ  mon_lp
        ADDI r1, r1, 1
        LI   r3, 0xDF           ; küçük harfi büyüğe (sadece harfler için anlamlı)
        AND  r0, r0, r3
        CMPI r0, 'D'
        BNE  mc_w
        CALL cmd_dump
        B    mon_lp
mc_w:   CMPI r0, 'W'
        BNE  mc_g
        CALL cmd_write
        B    mon_lp
mc_g:   CMPI r0, 'G'
        BNE  mc_b
        CALL cmd_go
        B    mon_lp
mc_b:   CMPI r0, 'B'
        BNE  mc_l
        CALL cmd_bank
        B    mon_lp
mc_l:   CMPI r0, 'L'
        BNE  mc_f
        LI   r0, 0
        CALL cmd_load
        B    mon_lp
mc_f:   CMPI r0, 'F'
        BNE  mc_i
        LI   r0, 1
        CALL cmd_load
        B    mon_lp
mc_i:   CMPI r0, 'I'
        BNE  mc_c
        CALL cmd_id
        B    mon_lp
mc_c:   CMPI r0, 'C'
        BNE  mc_t
        CALL cmd_cache
        B    mon_lp
mc_t:   CMPI r0, 'T'
        BNE  mc_h
        CALL cmd_test
        B    mon_lp
mc_h:   CMPI r0, 'H'
        BEQ  mc_help
        CMPI r0, 0x1F           ; '?' & 0xDF
        BEQ  mc_help
        LI   r0, s_unknown
        CALL puts
        B    mon_lp
mc_help:
        LI   r0, s_help
        CALL puts
        B    mon_lp

; ---- D [adres] [uzunluk]: bellek dökümü (varsayılan 0x80 bayt, kaldığı yerden)
cmd_dump:
        PUSH lr
        LI   r4, VARS
        CALL gethex
        CMPI r2, 0
        BEQ  cd_1
        SW   r0, [r4+V_DUMP]
cd_1:   CALL gethex
        CMPI r2, 0
        BNE  cd_2
        LI   r0, 0x80
cd_2:   MOV  r5, r0             ; kalan bayt
        LW   r1, [r4+V_DUMP]
cd_line:
        MOV  r0, r1
        CALL puthex4
        LI   r0, ':'
        CALL putc
        LI   r2, 0
cd_hex: LI   r0, ' '
        CALL putc
        ADD  r3, r1, r2
        LBU  r0, [r3]
        CALL puthex2
        ADDI r2, r2, 1
        CMPI r2, 16
        BNE  cd_hex
        LI   r0, ' '
        CALL putc
        CALL putc
        LI   r2, 0
cd_asc: ADD  r3, r1, r2
        LBU  r0, [r3]
        CMPI r0, 32
        BLT  cd_dot
        CMPI r0, 126
        BLE  cd_chr
cd_dot: LI   r0, '.'
cd_chr: CALL putc
        ADDI r2, r2, 1
        CMPI r2, 16
        BNE  cd_asc
        CALL newline
        ADDI r1, r1, 16
        ADDI r5, r5, -16
        BGT  cd_line
        SW   r1, [r4+V_DUMP]
        POP  lr
        RET

; ---- W adres bayt...: belleğe yaz
cmd_write:
        PUSH lr
        CALL gethex
        CMPI r2, 0
        BEQ  cw_err
        MOV  r4, r0
        LI   r5, 0
cw_lp:  CALL gethex
        CMPI r2, 0
        BEQ  cw_end
        SB   r0, [r4]
        ADDI r4, r4, 1
        ADDI r5, r5, 1
        B    cw_lp
cw_end: CMPI r5, 0
        BNE  cw_ret
cw_err: LI   r0, s_syntax
        CALL puts
cw_ret: POP  lr
        RET

; ---- G [adres]: alt program olarak çağır (program RET ile monitöre döner)
cmd_go: PUSH lr
        CALL gethex
        CMPI r2, 0
        BNE  cg_go
        LI   r4, VARS
        LW   r0, [r4+V_ENTRY]
        CMPI r0, -1
        BNE  cg_go
        LI   r0, s_noentry
        CALL puts
        B    cg_ret
cg_go:  MOV  r3, r0
        JALR lr, r3, 0
        CALL crlf_if
cg_ret: POP  lr
        RET

; ---- B [pencere bank]: bank register'larını göster / değiştir (pencere 1–2)
cmd_bank:
        PUSH lr
        CALL gethex
        CMPI r2, 0
        BEQ  cb_show
        MOV  r4, r0
        CALL gethex
        CMPI r2, 0
        BEQ  cb_err
        CMPI r4, 1
        BLT  cb_err
        CMPI r4, 2
        BGT  cb_err
        CMPI r0, 63
        BHI  cb_err
        LI   r3, IOB
        ADD  r3, r3, r4
        SB   r0, [r3+O_BANK0]
cb_show:
        LI   r4, 0
cb_lp:  LI   r0, 'B'
        CALL putc
        LI   r0, '0'
        ADD  r0, r0, r4
        CALL putc
        LI   r0, '='
        CALL putc
        LI   r3, IOB
        ADD  r3, r3, r4
        LBU  r0, [r3+O_BANK0]
        CALL puthex2
        LI   r0, ' '
        CALL putc
        ADDI r4, r4, 1
        CMPI r4, 4
        BNE  cb_lp
        CALL newline
        POP  lr
        RET
cb_err: LI   r0, s_bankerr
        CALL puts
        POP  lr
        RET

; ---- C [0|1]: önbellek sayaçlarını yaz ve sıfırla; 0/1 kapatır/açar
cmd_cache:
        PUSH lr
        CALL gethex
        LI   r5, IOB
        CMPI r2, 0
        BEQ  cc_show
        SB   r0, [r5+O_CCTRL]
cc_show:
        LI   r0, s_cache1
        CALL puts
        LW   r0, [r5+O_CHITS]
        CALL puthex4
        LI   r0, s_cache2
        CALL puts
        LW   r0, [r5+O_CMISS]
        CALL puthex4
        LI   r0, s_cache3
        CALL puts
        LBU  r0, [r5+O_CCTRL]
        CALL puthex2
        CALL newline
        SB   r0, [r5+O_CHITS]   ; herhangi bir yazma sayaçları sıfırlar
        POP  lr
        RET

; ---- I: EEPROM bilgisi: yazma koruması (SDP) açık mı (28C256'nın yazılımla okunan kimliği yok)
cmd_id: PUSH lr
        CALL cache_off
        LI   r3, FLASHRT + fr_sdp - flashrt
        JALR lr, r3, 0          ; r0 = 1 korumalı
        CALL cache_restore
        MOV  r4, r0
        LI   r0, s_eeprom
        CALL puts
        LI   r0, s_sdpoff
        CMPI r4, 0
        BEQ  ci_p
        LI   r0, s_sdpon
ci_p:   CALL puts
        POP  lr
        RET

; ---- T: RAM testi. Bank 32–39 (34 hariç: BIOS ve yığın) pencere 2 üzerinden;
; önce hepsine yazar, sonra hepsini doğrular (bankların birbirine karışmasını da yakalar).
cmd_test:
        PUSH lr
        LI   r0, s_test
        CALL puts
        LI   r3, IOB
        LBU  r0, [r3+O_BANK2]
        PUSH r0
        LI   r4, 32
ct_wb:  CALL ct_map             ; r5 = desen tabanı, pencere 2 = bank r4
        CMPI r4, 34
        BEQ  ct_wn
        LI   r1, 0x8000
        LI   r2, 8192
ct_w:   ADD  r0, r1, r5
        SW   r0, [r1]
        ADDI r1, r1, 2
        ADDI r2, r2, -1
        BNE  ct_w
ct_wn:  ADDI r4, r4, 1
        CMPI r4, 40
        BNE  ct_wb
        LI   r4, 32
ct_rb:  CALL ct_map
        CMPI r4, 34
        BEQ  ct_rn
        LI   r1, 0x8000
        LI   r2, 8192
ct_r:   LW   r0, [r1]
        ADD  r3, r1, r5
        CMP  r0, r3
        BNE  ct_bad
        ADDI r1, r1, 2
        ADDI r2, r2, -1
        BNE  ct_r
        LI   r0, '.'
        CALL putc
ct_rn:  ADDI r4, r4, 1
        CMPI r4, 40
        BNE  ct_rb
        LI   r0, s_testok
        CALL puts
        B    ct_end
ct_bad: LI   r0, s_testbad
        CALL puts
        MOV  r0, r4
        CALL puthex2
        LI   r0, ':'
        CALL putc
        MOV  r0, r1
        CALL puthex4
        CALL newline
ct_end: POP  r0
        LI   r3, IOB
        SB   r0, [r3+O_BANK2]
        POP  lr
        RET
ct_map: LI   r3, IOB            ; pencere 2 = bank r4; r5 = r4 · 0x0101
        SB   r4, [r3+O_BANK2]
        MOV  r5, r4
        SHL  r5, r5
        SHL  r5, r5
        SHL  r5, r5
        SHL  r5, r5
        SHL  r5, r5
        SHL  r5, r5
        SHL  r5, r5
        SHL  r5, r5
        OR   r5, r5, r4
        RET

; =============================================================================
; Intel HEX önyükleyici (UART). Protokol (bios.md):
;   ana makine "L\r" (RAM) ya da "F\r" (EEPROM) gönderir, "HEX ..." satırını bekler;
;   her kayıttan sonra BIOS tek karakter yanıt verir: '.' tamam, '!' sağlama
;   hatası (kayıt yeniden gönderilebilir), 'X' reddedildi (yükleme biter).
;   01 (EOF) kaydından sonra özet satırı ve "> " istemi gelir. ESC / Ctrl-C iptal.
; Kayıt türleri: 00 veri, 01 son, 04 genişletilmiş doğrusal adres (EEPROM'da
; yalnız 0), 05 / 03 başlangıç adresi (G'nin varsayılanı).
; =============================================================================
cmd_load:
        PUSH lr
        LI   r4, VARS
        SB   r0, [r4+V_MODE]
        LI   r1, 0
        SW   r1, [r4+V_EXT]
        SW   r1, [r4+V_COUNT]
        LI   r1, -1
        SW   r1, [r4+V_ENTRY]
        CMPI r0, 0
        BEQ  hl_ram
        CALL cache_off          ; EEPROM'a yazarken önbellek kapalı (yoklama okumaları EEPROM'a gitmeli)
        LI   r0, s_hexflash
        B    hl_msg
hl_ram: LI   r0, s_hexram
hl_msg: CALL puts               ; bu satırın '\n'i ana makine için "hazırım" demek
hl_wait:
        CALL uart_getc
        CMPI r0, ':'
        BEQ  hl_rec
        CMPI r0, 0x1B
        BEQ  hl_abort
        CMPI r0, 3
        BEQ  hl_abort
        B    hl_wait
hl_rec: LI   r5, 0              ; sağlama toplamı
        LI   r4, VARS
        CALL hl_byte
        CMPI r0, 0
        BLT  hl_bad
        SW   r0, [r4+V_RLEN]
        CALL hl_byte
        CMPI r0, 0
        BLT  hl_bad
        MOV  r1, r0
        SHL  r1, r1
        SHL  r1, r1
        SHL  r1, r1
        SHL  r1, r1
        SHL  r1, r1
        SHL  r1, r1
        SHL  r1, r1
        SHL  r1, r1
        CALL hl_byte
        CMPI r0, 0
        BLT  hl_bad
        OR   r1, r1, r0
        SW   r1, [r4+V_RADDR]
        CALL hl_byte
        CMPI r0, 0
        BLT  hl_bad
        SW   r0, [r4+V_RTYPE]
        LW   r2, [r4+V_RLEN]
        LI   r1, RECBUF
hl_dat: CMPI r2, 0
        BEQ  hl_sum
        CALL hl_byte
        CMPI r0, 0
        BLT  hl_bad
        SB   r0, [r1]
        ADDI r1, r1, 1
        ADDI r2, r2, -1
        B    hl_dat
hl_sum: CALL hl_byte
        CMPI r0, 0
        BLT  hl_bad
        LI   r3, 0xFF
        AND  r5, r5, r3
        BNE  hl_bad
        LW   r0, [r4+V_RTYPE]
        CMPI r0, 0
        BEQ  hl_data
        CMPI r0, 1
        BEQ  hl_eof
        CMPI r0, 4
        BEQ  hl_ext
        CMPI r0, 5
        BEQ  hl_start
        CMPI r0, 3
        BEQ  hl_start
hl_ack: LI   r0, '.'
        CALL putc               ; önce VGA, en son UART: yanıt gidince BIOS hazır
        B    hl_wait
hl_bad: LI   r0, '!'
        CALL putc
        B    hl_wait
hl_abort:
        LI   r0, s_abort
        CALL puts
        B    hl_end
hl_ext: LBU  r0, [r1-1]         ; 2 bayt veri, büyük uçlu: düşük bayt son yazılan
        LBU  r1, [r1-2]
        SHL  r1, r1
        SHL  r1, r1
        SHL  r1, r1
        SHL  r1, r1
        SHL  r1, r1
        SHL  r1, r1
        SHL  r1, r1
        SHL  r1, r1
        OR   r0, r0, r1
        SW   r0, [r4+V_EXT]
        B    hl_ack
hl_start:                       ; 4 bayt: giriş = son iki bayt (büyük uçlu)
        LBU  r0, [r1-1]
        LBU  r2, [r1-2]
        SHL  r2, r2
        SHL  r2, r2
        SHL  r2, r2
        SHL  r2, r2
        SHL  r2, r2
        SHL  r2, r2
        SHL  r2, r2
        SHL  r2, r2
        OR   r0, r0, r2
        SW   r0, [r4+V_ENTRY]
        B    hl_ack
hl_eof: LI   r0, '.'
        CALL putc
        CALL newline
        LI   r0, s_loaded
        CALL puts
        LW   r0, [r4+V_COUNT]
        CALL puthex4
        LI   r0, s_entry
        CALL puts
        LW   r0, [r4+V_ENTRY]
        CALL puthex4
        CALL newline
hl_end: LI   r4, VARS
        LBU  r0, [r4+V_MODE]
        CMPI r0, 0
        BEQ  hl_ret
        CALL cache_restore
hl_ret: POP  lr
        RET
hl_reject:                      ; r0 = hata metni
        PUSH r0
        LI   r0, 'X'
        CALL putc
        CALL newline
        POP  r0
        CALL puts
        B    hl_end

; Veri kaydı: RECBUF'taki V_RLEN baytı V_RADDR'a (RAM) ya da EEPROM'a yaz.
hl_data:
        LW   r2, [r4+V_RLEN]
        LBU  r0, [r4+V_MODE]
        CMPI r0, 0
        BNE  hl_fdata
        LW   r1, [r4+V_RADDR]
        LI   r3, USER_LO
        CMP  r1, r3
        BCC  hl_range           ; adres < 0x4000: ROM
        ADD  r3, r1, r2
        BCS  hl_range
        LI   r0, USER_END
        CMP  r0, r3
        BCC  hl_range           ; son > 0xF800: BIOS alanı / G/Ç
        LI   r0, RECBUF
hl_cp:  CMPI r2, 0
        BEQ  hl_dok
        LBU  r3, [r0]
        SB   r3, [r1]
        ADDI r0, r0, 1
        ADDI r1, r1, 1
        ADDI r2, r2, -1
        B    hl_cp
hl_range:
        LI   r0, s_range
        B    hl_reject
hl_dok: LW   r0, [r4+V_ENTRY]   ; ilk veri kaydının adresi varsayılan giriş
        CMPI r0, -1
        BNE  hl_cnt
        LW   r0, [r4+V_RADDR]
        SW   r0, [r4+V_ENTRY]
hl_cnt: LW   r0, [r4+V_COUNT]
        LW   r1, [r4+V_RLEN]
        ADD  r0, r0, r1
        SW   r0, [r4+V_COUNT]
        B    hl_ack

; EEPROM: ofset = V_RADDR (V_EXT = 0); yalnızca bank 1 (0x4000–0x7FFF), bank 0 (BIOS) korunur.
; Pencere 1 yazma sırasında bank 1'e eşlendiğinden ofset aynı zamanda CPU adresidir. Kayıt 64 baytlık
; sayfa sınırlarında parçalanır; her parça bir korumalı sayfa yazmasıdır (~10 ms).
hl_fdata:
        LW   r1, [r4+V_EXT]
        CMPI r1, 0
        BNE  hl_range           ; EEPROM 32 KB: 64 KB üstü yok
        LW   r0, [r4+V_RADDR]
        CMPI r2, 0
        BEQ  hl_dok
        LI   r3, 0x4000
        CMP  r0, r3
        BCC  hl_range           ; bank 0: BIOS'un üstüne yazılmaz
        ADD  r3, r0, r2
        LI   r1, 0x8000
        CMP  r1, r3
        BCC  hl_range           ; son > 0x8000: EEPROM'un dışında
        LI   r1, RECBUF
hf_lp:  LI   r3, 63             ; r0 = hedef, r1 = kaynak, r2 = kalan
        AND  r3, r3, r0
        LI   r5, 64
        SUB  r5, r5, r3         ; sayfada kalan yer
        CMP  r2, r5
        BCS  hf_n               ; kalan ≥ yer: bu parça sayfanın sonuna kadar
        MOV  r5, r2
hf_n:   PUSH r0
        PUSH r1
        PUSH r2
        MOV  r2, r5
        LI   r3, FLASHRT + fr_page - flashrt
        JALR lr, r3, 0          ; r0 = 0 tamam
        MOV  r3, r0
        POP  r2
        POP  r1
        POP  r0
        CMPI r3, 0
        BNE  hf_fail
        ADD  r0, r0, r5
        ADD  r1, r1, r5
        SUB  r2, r2, r5
        BNE  hf_lp
        B    hl_dok
hf_fail:
        LI   r0, s_flfail
        B    hl_reject

; UART'tan iki hex karakter → r0 = bayt (geçersizse −1); r5'e eklenir. Korur: r1, r2, r4.
hl_byte:
        PUSH r1
        PUSH lr
        CALL uart_getc
        CALL hexval
        CMPI r0, 0
        BLT  hb_ret
        MOV  r1, r0
        SHL  r1, r1
        SHL  r1, r1
        SHL  r1, r1
        SHL  r1, r1
        CALL uart_getc
        CALL hexval
        CMPI r0, 0
        BLT  hb_ret
        OR   r0, r0, r1
        ADD  r5, r5, r0
hb_ret: POP  lr
        POP  r1
        RET

; =============================================================================
; EEPROM (28C256) yazma rutinleri. RAM'e (FLASHRT) kopyalanıp orada çalışır: yazma
; döngüsü sürerken (~10 ms) EEPROM'dan okunan her bayt durum baytıdır, BIOS'tan komut
; okunamaz. Bu yüzden kesmeler de kapalıdır (IRQ vektörü EEPROM'da). Sadece göreli
; dallanma kullanır. Ön koşul: önbellek kapalı (yoklama okumaları EEPROM'a gitmeli),
; BANK0 = 0 (2AAAh). 5555h için pencere 1 geçici olarak EEPROM bank 1'e eşlenir.
; =============================================================================
flashrt:
; fr_page: r0 = hedef CPU adresi (pencere 1 = bank 1), r1 = kaynak, r2 = bayt sayısı (1..64,
; hepsi aynı 64 baytlık sayfada) → r0 = 0 tamam, 1 hata. Korumalı sayfa yazması (AA 55 A0 +
; baytlar, aralarında ≤ 150 µs), D7 veri yoklaması, sonra baytlar tek tek doğrulanır. Bozar r1, r3.
fr_page:
        PUSH lr
        PUSH r2
        PUSH r4
        DI
        CALL fr_unlock          ; JAL göreli: RAM'de de çalışır. r3 = 0x5555
        LI   r4, 0xA0
        SB   r4, [r3]           ; korumalı yazma: sonraki baytlar sayfa tamponuna
        LW   r2, [sp+4]         ; bayt sayısı ([sp] eski BANK1, [sp+2] r4, [sp+4] r2)
        PUSH r0
        PUSH r1
fpg_ld: LBU  r4, [r1]
        SB   r4, [r0]
        ADDI r0, r0, 1
        ADDI r1, r1, 1
        ADDI r2, r2, -1
        BNE  fpg_ld
        ADDI r0, r0, -1         ; son yazılan bayt (r4): yoklama adresi
        LI   r2, 0              ; zaman aşımı: 65536 tur ≈ 0,8 s
fpg_poll:
        LBU  r3, [r0]           ; yazma sürerken D7 = yazılan D7'nin tersi
        XOR  r3, r3, r4
        LI   r1, 0x80
        AND  r3, r3, r1
        BEQ  fpg_vfy
        ADDI r2, r2, -1
        BNE  fpg_poll
fpg_vfy:
        POP  r1                 ; kaynak başı
        POP  r0                 ; hedef başı
        LW   r2, [sp+4]
fpg_cmp:
        LBU  r3, [r0]
        LBU  r4, [r1]
        CMP  r3, r4
        BNE  fpg_bad
        ADDI r0, r0, 1
        ADDI r1, r1, 1
        ADDI r2, r2, -1
        BNE  fpg_cmp
        LI   r0, 0
        B    fpg_out
fpg_bad:
        LI   r0, 1
fpg_out:
        EI
fr_out: POP  r3                 ; fr_unlock'ın yığına bıraktığı eski BANK1
        LI   r2, IOB
        SB   r3, [r2+O_BANK1]
        POP  r4
        POP  r2
        POP  lr
        RET
; fr_sdp: yazma koruması açık mı? EEPROM'un son baytı (bank 1, 0x7FFF) komut dizisi olmadan
; kendi değeriyle yeniden yazılır: korumalıysa yok sayılır; değilse yazma döngüsü başlar ve
; D7 ters okunur (içerik değişmez, döngünün bitmesi beklenir). → r0 = 1 korumalı, 0 değil.
; Bozar r1, r3.
fr_sdp: PUSH lr
        PUSH r2
        PUSH r4
        DI
        LI   r4, IOB
        LBU  r2, [r4+O_BANK1]
        PUSH r2                 ; fr_out geri alır
        LI   r2, 1
        SB   r2, [r4+O_BANK1]
        LI   r3, 0x7FFF
        LBU  r1, [r3]
        SB   r1, [r3]           ; komutsuz yazma
        LI   r2, 100            ; ≥ 150 µs: yükleme penceresi kapansın
fs_dly: ADDI r2, r2, -1
        BNE  fs_dly
        LBU  r2, [r3]
        XOR  r2, r2, r1
        LI   r0, 0x80
        AND  r2, r2, r0
        LI   r0, 1
        BEQ  fs_out             ; D7 doğru: yazma başlamadı, korumalı
        LI   r2, 0
fs_poll: LBU  r0, [r3]
        XOR  r0, r0, r1
        LI   r4, 0x80
        AND  r0, r0, r4
        BEQ  fs_done
        ADDI r2, r2, -1
        BNE  fs_poll
fs_done: LI   r0, 0
fs_out: EI
        B    fr_out
; fr_unlock: BANK1 = 1 yapar (eskisini yığına iter, fr_out geri alır), AA→5555, 55→2AAA.
; Çıkışta r3 = 0x5555. Bozar r2, r4.
fr_unlock:
        LI   r4, IOB
        LBU  r2, [r4+O_BANK1]
        PUSH r2
        LI   r2, 1
        SB   r2, [r4+O_BANK1]
        LI   r3, 0x5555
        LI   r2, 0xAA
        SB   r2, [r3]
        LI   r3, 0x2AAA
        LI   r2, 0x55
        SB   r2, [r3]
        LI   r3, 0x5555
        RET
flashrt_end:

; Önbelleği kapat (eski değer V_CCSAVE'e). Bozar r3.
cache_off:
        PUSH r0
        LI   r3, IOB
        LBU  r0, [r3+O_CCTRL]
        LI   r3, VARS
        SB   r0, [r3+V_CCSAVE]
        LI   r3, IOB
        LI   r0, 0
        SB   r0, [r3+O_CCTRL]
        POP  r0
        RET

; Önbelleği yazılımla boşalt ve eski durumuna getir: açıkken 2 KB'lık bitişik
; RAM okunur, her satır taze bir RAM satırıyla değişir (EEPROM'un bayat kopyaları gider).
cache_restore:
        PUSH r0
        PUSH r1
        LI   r3, IOB
        LI   r0, 1
        SB   r0, [r3+O_CCTRL]
        LI   r1, FLUSH
        LI   r0, 1024
cr_lp:  LW   r3, [r1]
        ADDI r1, r1, 2
        ADDI r0, r0, -1
        BNE  cr_lp
        LI   r3, VARS
        LBU  r0, [r3+V_CCSAVE]
        LI   r3, IOB
        SB   r0, [r3+O_CCTRL]
        POP  r1
        POP  r0
        RET

; =============================================================================
; Klavye: set 2 tarama kodu → ASCII (ABD düzeni), halka tampona. ISR'den çağrılır.
; r0 = tarama kodu. Bozar r0–r4.
; =============================================================================
kbd_byte:
        PUSH lr
        LI   r4, VARS
        CMPI r0, 0xF0
        BNE  kb_1
        LI   r1, 1
        SB   r1, [r4+V_KBRK]
        B    kb_ret
kb_1:   CMPI r0, 0xE0
        BNE  kb_2
        LI   r1, 1
        SB   r1, [r4+V_KEXT]
        B    kb_ret
kb_2:   LBU  r2, [r4+V_KEXT]
        LI   r1, 0
        SB   r1, [r4+V_KEXT]
        LBU  r3, [r4+V_KBRK]
        SB   r1, [r4+V_KBRK]
        CMPI r3, 0
        BEQ  kb_make
        ; bırakma: sadece değiştirici tuşlar ilgilendirir (r1 = 0)
        CMPI r0, 0x12
        BEQ  kb_shup
        CMPI r0, 0x59
        BEQ  kb_shup
        CMPI r0, 0x14           ; sol Ctrl ya da E0 14 sağ Ctrl
        BNE  kb_ret
        SB   r1, [r4+V_KCTRL]
        B    kb_ret
kb_shup: SB  r1, [r4+V_KSHIFT]
kb_ret: POP  lr
        RET
kb_make:
        LI   r1, 1
        CMPI r0, 0x14
        BNE  kb_3
        SB   r1, [r4+V_KCTRL]
        B    kb_ret
kb_3:   CMPI r2, 0
        BEQ  kb_norm
        LI   r1, 13             ; genişletilmiş: sayısal tuş takımı Enter
        CMPI r0, 0x5A
        BEQ  kb_put
        LI   r1, '/'
        CMPI r0, 0x4A
        BEQ  kb_put
        LI   r1, 0x7F           ; Delete
        CMPI r0, 0x71
        BEQ  kb_put
        B    kb_ret             ; oklar vb.: yok say
kb_norm:
        CMPI r0, 0x12
        BEQ  kb_shdn
        CMPI r0, 0x59
        BEQ  kb_shdn
        CMPI r0, 0x58
        BEQ  kb_caps
        CMPI r0, 0x80
        BCS  kb_ret             ; F7 (0x83) vb.
        LBU  r1, [r4+V_KSHIFT]
        LI   r2, kmap
        CMPI r1, 0
        BEQ  kb_t
        LI   r2, kmap_shift
kb_t:   ADD  r2, r2, r0
        LBU  r1, [r2]
        CMPI r1, 0
        BEQ  kb_ret
        ; Caps Lock harflerin büyüklüğünü çevirir
        LBU  r2, [r4+V_KCAPS]
        CMPI r2, 0
        BEQ  kb_ctl
        CALL kb_isalpha
        BNE  kb_ctl
        LI   r3, 0x20
        XOR  r1, r1, r3
kb_ctl: LBU  r2, [r4+V_KCTRL]
        CMPI r2, 0
        BEQ  kb_put
        CALL kb_isalpha
        BNE  kb_put
        LI   r3, 0x1F           ; Ctrl + harf → 1..26
        AND  r1, r1, r3
kb_put: LBU  r2, [r4+V_KHEAD]
        ADDI r3, r2, 1
        LI   r0, 15
        AND  r3, r3, r0
        LBU  r0, [r4+V_KTAIL]
        CMP  r3, r0
        BEQ  kb_ret             ; dolu: at
        ADD  r2, r2, r4
        SB   r1, [r2+16]        ; KBUF = VARS + 16
        SB   r3, [r4+V_KHEAD]
        B    kb_ret
kb_shdn: LI  r1, 1
        SB   r1, [r4+V_KSHIFT]
        B    kb_ret
kb_caps: LBU r1, [r4+V_KCAPS]
        LI   r2, 1
        XOR  r1, r1, r2
        SB   r1, [r4+V_KCAPS]
        B    kb_ret
; r1 harf mi? Z = 1 ise evet. Bozar r3.
kb_isalpha:
        LI   r3, 0x20
        OR   r3, r1, r3         ; küçük harfe
        CMPI r3, 'a'
        BLT  ka_no
        CMPI r3, 'z'
        BGT  ka_no
        CMP  r3, r3             ; Z = 1
        RET
ka_no:  CMPI r3, -1             ; r3 ≠ 0xFFFF → Z = 0
        RET

; =============================================================================
; Karakter G/Ç
; =============================================================================
; putc(r0): VGA'ya ve UART'a. '\n' UART'a CR LF olarak gider.
putc:   PUSH lr
        CALL vga_putc
        CMPI r0, 10
        BNE  pc_1
        PUSH r0
        LI   r0, 13
        CALL uart_putc
        POP  r0
pc_1:   CALL uart_putc
        POP  lr
        RET

newline:
        PUSH r0
        PUSH lr
        LI   r0, 10
        CALL putc
        POP  lr
        POP  r0
        RET

; İmleç satır başında değilse yeni satır.
crlf_if:
        LI   r3, VARS
        LBU  r3, [r3+V_COL]
        CMPI r3, 0
        BNE  newline
        RET

uart_putc:                      ; TX_EMPTY'yi bekle, gönder
        PUSH r1
        LI   r3, IOB
up_w:   LBU  r1, [r3+O_USTAT]
        SHR  r1, r1
        SHR  r1, r1             ; C = TX_EMPTY
        BCC  up_w
        SB   r0, [r3+O_UDATA]
        POP  r1
        RET

uart_getc:                      ; RX_READY'yi bekle → r0
        PUSH r1
        LI   r3, IOB
ug_w:   LBU  r1, [r3+O_USTAT]
        SHR  r1, r1             ; C = RX_READY
        BCC  ug_w
        LBU  r0, [r3+O_UDATA]
        POP  r1
        RET

; trygetc → r0 = karakter (önce klavye tamponu, sonra UART), yoksa 0xFFFF.
trygetc:
        PUSH r1
        PUSH r2
        LI   r3, VARS
        LBU  r1, [r3+V_KTAIL]
        LBU  r2, [r3+V_KHEAD]
        CMP  r1, r2
        BEQ  tg_uart
        ADD  r2, r3, r1
        LBU  r0, [r2+16]
        ADDI r1, r1, 1
        LI   r2, 15
        AND  r1, r1, r2
        SB   r1, [r3+V_KTAIL]
        B    tg_ret
tg_uart:
        LI   r3, IOB
        LBU  r1, [r3+O_USTAT]
        SHR  r1, r1
        BCC  tg_none
        LBU  r0, [r3+O_UDATA]
        B    tg_ret
tg_none:
        LI   r0, -1
tg_ret: POP  r2
        POP  r1
        RET

getc:   PUSH lr
gc_lp:  CALL trygetc
        CMPI r0, -1
        BEQ  gc_lp
        POP  lr
        RET

; puts(r0 = metin)
puts:   PUSH r0
        PUSH r1
        PUSH lr
        MOV  r1, r0
ps_lp:  LBU  r0, [r1]
        CMPI r0, 0
        BEQ  ps_end
        CALL putc
        ADDI r1, r1, 1
        B    ps_lp
ps_end: POP  lr
        POP  r1
        POP  r0
        RET

; puthex4(r0) / puthex2(r0): 4 / 2 hex basamak
puthex4:
        PUSH r2
        LI   r2, 4
        B    phx
puthex2:
        PUSH r2
        LI   r2, 2
phx:    PUSH r0
        PUSH r1
        PUSH lr
        MOV  r1, r0
        LI   r0, -1
        PUSH r0                 ; işaret: basamaklar bunun üstünde
phx_lp: MOV  r0, r1             ; basamakları düşükten yükseğe yığına it
        LI   r3, 15
        AND  r0, r0, r3
        PUSH r0
        SHR  r1, r1
        SHR  r1, r1
        SHR  r1, r1
        SHR  r1, r1
        ADDI r2, r2, -1
        BNE  phx_lp
phx_pr: POP  r0                 ; en yüksek basamak en üstte
        CMPI r0, -1
        BEQ  phx_end
        CMPI r0, 10
        BLT  phx_d
        ADDI r0, r0, 7          ; 'A' − '0' − 10
phx_d:  LI   r3, '0'
        ADD  r0, r0, r3
        CALL putc
        B    phx_pr
phx_end:
        POP  lr
        POP  r1
        POP  r0
        POP  r2
        RET

; getline(r0 = tampon, r1 = en çok karakter) → r0 = uzunluk. Yankılar, ←/DEL siler.
; CR, LF ya da CR LF satır sonudur.
getline:
        PUSH r1
        PUSH r2
        PUSH r4
        PUSH r5
        PUSH lr
        MOV  r4, r0
        MOV  r5, r1
        LI   r1, 0
gl_lp:  CALL getc
        LI   r3, VARS
        LBU  r2, [r3+V_LASTCR]
        PUSH r2
        LI   r2, 0
        SB   r2, [r3+V_LASTCR]
        POP  r2
        CMPI r0, 10
        BNE  gl_1
        CMPI r2, 0
        BEQ  gl_end
        CMPI r1, 0
        BEQ  gl_lp              ; CR'nin hemen ardından gelen LF: yok say
        B    gl_end
gl_1:   CMPI r0, 13
        BNE  gl_2
        LI   r2, 1
        SB   r2, [r3+V_LASTCR]
        B    gl_end
gl_2:   CMPI r0, 8
        BEQ  gl_bs
        CMPI r0, 0x7F
        BEQ  gl_bs
        CMPI r0, 32
        BLT  gl_lp              ; diğer kontrol karakterleri
        CMP  r1, r5
        BCS  gl_lp              ; tampon dolu
        ADD  r2, r4, r1
        SB   r0, [r2]
        ADDI r1, r1, 1
        CALL putc
        B    gl_lp
gl_bs:  CMPI r1, 0
        BEQ  gl_lp
        ADDI r1, r1, -1
        LI   r0, 8
        CALL putc
        LI   r0, ' '
        CALL putc
        LI   r0, 8
        CALL putc
        B    gl_lp
gl_end: ADD  r2, r4, r1
        LI   r0, 0
        SB   r0, [r2]
        CALL newline
        MOV  r0, r1
        POP  lr
        POP  r5
        POP  r4
        POP  r2
        POP  r1
        RET

; skipsp: r1'i boşlukların ötesine ilerletir. Bozar r3.
skipsp: LBU  r3, [r1]
        CMPI r3, ' '
        BNE  ss_end
        ADDI r1, r1, 1
        B    skipsp
ss_end: RET

; hexval: r0 = karakter → r0 = 0..15, hex değilse −1. Bozar r3.
hexval: CMPI r0, '0'
        BLT  hv_bad
        CMPI r0, '9'
        BGT  hv_alpha
        LI   r3, '0'
        SUB  r0, r0, r3
        RET
hv_alpha:
        LI   r3, 0x20
        OR   r0, r0, r3
        CMPI r0, 'a'
        BLT  hv_bad
        CMPI r0, 'f'
        BGT  hv_bad
        LI   r3, 'a' - 10
        SUB  r0, r0, r3
        RET
hv_bad: LI   r0, -1
        RET

; gethex: r1 = metin → r0 = değer, r2 = basamak sayısı (0: sayı yok); r1 ilerler. Bozar r3.
gethex: PUSH r4
        PUSH lr
        CALL skipsp
        LI   r4, 0
        LI   r2, 0
gh_lp:  LBU  r0, [r1]
        CALL hexval
        CMPI r0, 0
        BLT  gh_end
        SHL  r4, r4
        SHL  r4, r4
        SHL  r4, r4
        SHL  r4, r4
        OR   r4, r4, r0
        ADDI r1, r1, 1
        ADDI r2, r2, 1
        B    gh_lp
gh_end: MOV  r0, r4
        POP  lr
        POP  r4
        RET

; ticks → r0:r1 (r1 yüksek). Kesme arada artırırsa yeniden okur.
ticks:  LI   r3, VARS
tk_lp:  LW   r1, [r3+V_THI]
        LW   r0, [r3+V_TLO]
        PUSH r2
        LW   r2, [r3+V_THI]
        CMP  r1, r2
        POP  r2
        BNE  tk_lp
        RET

setirqhook:
        LI   r3, VARS
        SW   r0, [r3+V_UHOOK]
        RET

setattr:
        LI   r3, VARS
        SB   r0, [r3+V_ATTR]
        RET

; =============================================================================
; VGA metin sürücüsü (80×30). Hücre (satır·80 + sütun)·2: karakter, renk.
; =============================================================================
; setcursor(r0 = sütun, r1 = satır)
setcursor:
        LI   r3, VARS
        SB   r0, [r3+V_COL]
        SB   r1, [r3+V_ROW]
        LI   r3, IOB
        SB   r0, [r3+O_CURX]
        SB   r1, [r3+O_CURY]
        RET

cls:    PUSH r0
        PUSH r1
        PUSH r2
        LI   r3, IOB
        LI   r0, 0
        SW   r0, [r3+O_VADDR]
        SB   r0, [r3+O_CURX]
        SB   r0, [r3+O_CURY]
        LI   r2, VARS
        SB   r0, [r2+V_COL]
        SB   r0, [r2+V_ROW]
        LBU  r1, [r2+V_ATTR]
        LI   r0, ' '
        LI   r2, 2400
cl_lp:  SB   r0, [r3+O_VDATA]
        SB   r1, [r3+O_VDATA]
        ADDI r2, r2, -1
        BNE  cl_lp
        POP  r2
        POP  r1
        POP  r0
        RET

; vga_putc(r0): CR, LF (satır başı + alt satır), BS (sola), diğerleri yazılır.
vga_putc:
        PUSH r1
        PUSH r2
        PUSH r4
        PUSH lr
        LI   r4, VARS
        LBU  r1, [r4+V_COL]
        LBU  r2, [r4+V_ROW]
        CMPI r0, 13
        BEQ  vp_cr
        CMPI r0, 10
        BEQ  vp_nl
        CMPI r0, 8
        BEQ  vp_bs
        CALL vga_setaddr
        LI   r3, IOB
        SB   r0, [r3+O_VDATA]
        LBU  r4, [r4+V_ATTR]
        SB   r4, [r3+O_VDATA]
        LI   r4, VARS
        ADDI r1, r1, 1
        CMPI r1, 80
        BLT  vp_st
vp_nl:  LI   r1, 0
        ADDI r2, r2, 1
        CMPI r2, 30
        BLT  vp_st
        CALL vga_scroll
        LI   r2, 29
        B    vp_st
vp_cr:  LI   r1, 0
        B    vp_st
vp_bs:  CMPI r1, 0
        BEQ  vp_st
        ADDI r1, r1, -1
vp_st:  SB   r1, [r4+V_COL]
        SB   r2, [r4+V_ROW]
        LI   r3, IOB
        SB   r1, [r3+O_CURX]
        SB   r2, [r3+O_CURY]
        POP  lr
        POP  r4
        POP  r2
        POP  r1
        RET

; VADDR = (r2·80 + r1)·2. Bozar r3.
vga_setaddr:
        PUSH r0
        LI   r3, rowtab
        ADD  r3, r3, r2
        ADD  r3, r3, r2
        LW   r3, [r3]
        ADD  r3, r3, r1
        ADD  r3, r3, r1
        LI   r0, IOB
        SW   r3, [r0+O_VADDR]
        POP  r0
        RET

; Ekranı bir satır yukarı kaydır, son satırı temizle. Bozar r3.
vga_scroll:
        PUSH r0
        PUSH r1
        PUSH r2
        PUSH r4
        PUSH r5
        LI   r5, IOB
        LI   r4, 160            ; kaynak satırın VRAM adresi
        LI   r2, 29
vs_row: SW   r4, [r5+O_VADDR]
        LI   r1, ROWBUF
        LI   r0, 20
vs_rd:  LBU  r3, [r5+O_VDATA]   ; 8 bayt açılmış döngü
        SB   r3, [r1]
        LBU  r3, [r5+O_VDATA]
        SB   r3, [r1+1]
        LBU  r3, [r5+O_VDATA]
        SB   r3, [r1+2]
        LBU  r3, [r5+O_VDATA]
        SB   r3, [r1+3]
        LBU  r3, [r5+O_VDATA]
        SB   r3, [r1+4]
        LBU  r3, [r5+O_VDATA]
        SB   r3, [r1+5]
        LBU  r3, [r5+O_VDATA]
        SB   r3, [r1+6]
        LBU  r3, [r5+O_VDATA]
        SB   r3, [r1+7]
        ADDI r1, r1, 8
        ADDI r0, r0, -1
        BNE  vs_rd
        LI   r3, 160
        SUB  r3, r4, r3
        SW   r3, [r5+O_VADDR]   ; hedef: bir üst satır
        LI   r1, ROWBUF
        LI   r0, 20
vs_wr:  LBU  r3, [r1]
        SB   r3, [r5+O_VDATA]
        LBU  r3, [r1+1]
        SB   r3, [r5+O_VDATA]
        LBU  r3, [r1+2]
        SB   r3, [r5+O_VDATA]
        LBU  r3, [r1+3]
        SB   r3, [r5+O_VDATA]
        LBU  r3, [r1+4]
        SB   r3, [r5+O_VDATA]
        LBU  r3, [r1+5]
        SB   r3, [r5+O_VDATA]
        LBU  r3, [r1+6]
        SB   r3, [r5+O_VDATA]
        LBU  r3, [r1+7]
        SB   r3, [r5+O_VDATA]
        ADDI r1, r1, 8
        ADDI r0, r0, -1
        BNE  vs_wr
        LI   r3, 160
        ADD  r4, r4, r3
        ADDI r2, r2, -1
        BNE  vs_row
        ; VADDR şimdi son satırın başında: temizle
        LI   r4, VARS
        LBU  r1, [r4+V_ATTR]
        LI   r2, ' '
        LI   r0, 80
vs_clr: SB   r2, [r5+O_VDATA]
        SB   r1, [r5+O_VDATA]
        ADDI r0, r0, -1
        BNE  vs_clr
        POP  r5
        POP  r4
        POP  r2
        POP  r1
        POP  r0
        RET

        .align 2
rowtab: .word 0, 160, 320, 480, 640, 800, 960, 1120, 1280, 1440
        .word 1600, 1760, 1920, 2080, 2240, 2400, 2560, 2720, 2880, 3040
        .word 3200, 3360, 3520, 3680, 3840, 4000, 4160, 4320, 4480, 4640

; ---- set 2 → ASCII (ABD düzeni; sayısal tuş takımı NumLock açık gibi)
kmap:
        .byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x09, 0x60, 0x00   ; 00–0F
        .byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x71, 0x31, 0x00, 0x00, 0x00, 0x7a, 0x73, 0x61, 0x77, 0x32, 0x00   ; 10–1F
        .byte 0x00, 0x63, 0x78, 0x64, 0x65, 0x34, 0x33, 0x00, 0x00, 0x20, 0x76, 0x66, 0x74, 0x72, 0x35, 0x00   ; 20–2F
        .byte 0x00, 0x6e, 0x62, 0x68, 0x67, 0x79, 0x36, 0x00, 0x00, 0x00, 0x6d, 0x6a, 0x75, 0x37, 0x38, 0x00   ; 30–3F
        .byte 0x00, 0x2c, 0x6b, 0x69, 0x6f, 0x30, 0x39, 0x00, 0x00, 0x2e, 0x2f, 0x6c, 0x3b, 0x70, 0x2d, 0x00   ; 40–4F
        .byte 0x00, 0x00, 0x27, 0x00, 0x5b, 0x3d, 0x00, 0x00, 0x00, 0x00, 0x0d, 0x5d, 0x00, 0x5c, 0x00, 0x00   ; 50–5F
        .byte 0x00, 0x3c, 0x00, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x31, 0x00, 0x34, 0x37, 0x00, 0x00, 0x00   ; 60–6F
        .byte 0x30, 0x2e, 0x32, 0x35, 0x36, 0x38, 0x1b, 0x00, 0x00, 0x2b, 0x33, 0x2d, 0x2a, 0x39, 0x00, 0x00   ; 70–7F
kmap_shift:
        .byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x09, 0x7e, 0x00   ; 00–0F
        .byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x51, 0x21, 0x00, 0x00, 0x00, 0x5a, 0x53, 0x41, 0x57, 0x40, 0x00   ; 10–1F
        .byte 0x00, 0x43, 0x58, 0x44, 0x45, 0x24, 0x23, 0x00, 0x00, 0x20, 0x56, 0x46, 0x54, 0x52, 0x25, 0x00   ; 20–2F
        .byte 0x00, 0x4e, 0x42, 0x48, 0x47, 0x59, 0x5e, 0x00, 0x00, 0x00, 0x4d, 0x4a, 0x55, 0x26, 0x2a, 0x00   ; 30–3F
        .byte 0x00, 0x3c, 0x4b, 0x49, 0x4f, 0x29, 0x28, 0x00, 0x00, 0x3e, 0x3f, 0x4c, 0x3a, 0x50, 0x5f, 0x00   ; 40–4F
        .byte 0x00, 0x00, 0x22, 0x00, 0x7b, 0x2b, 0x00, 0x00, 0x00, 0x00, 0x0d, 0x7d, 0x00, 0x7c, 0x00, 0x00   ; 50–5F
        .byte 0x00, 0x3e, 0x00, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x31, 0x00, 0x34, 0x37, 0x00, 0x00, 0x00   ; 60–6F
        .byte 0x30, 0x2e, 0x32, 0x35, 0x36, 0x38, 0x1b, 0x00, 0x00, 0x2b, 0x33, 0x2d, 0x2a, 0x39, 0x00, 0x00   ; 70–7F

; ---- metinler (ASCII; Türkçe harfler UART terminallerinde sorun çıkarmasın diye yok)
s_banner:  .asciz " CPU16 BIOS v1                                                                  \n"
s_info:    .asciz "128 KB RAM, 32 KB EEPROM, VGA 80x30, PS/2 klavye, UART 115200\nKomutlar icin ? yazin.\n"
s_prompt:  .asciz "> "
s_unknown: .asciz "? Bilinmeyen komut (yardim: ?)\n"
s_syntax:  .asciz "? Sozdizimi\n"
s_noentry: .asciz "? Adres yok\n"
s_bankerr: .asciz "? B pencere(1-2) bank(00-3F)\n"
s_swi:     .asciz "\nSWI @ "
s_cache1:  .asciz "Onbellek: isabet "
s_cache2:  .asciz ", iskalama "
s_cache3:  .asciz ", denetim "
s_eeprom:  .asciz "EEPROM 28C256, yazma korumasi: "
s_sdpon:   .asciz "acik\n"
s_sdpoff:  .asciz "kapali (F ilk yazmada acar)\n"
s_test:    .asciz "RAM testi (bank 20-27, 22 haric) "
s_testok:  .asciz " Tamam\n"
s_testbad: .asciz "\nHata: bank "
s_hexram:  .asciz "HEX bekleniyor (RAM), iptal: ESC\n"
s_hexflash: .asciz "HEX bekleniyor (EEPROM), iptal: ESC\n"
s_abort:   .asciz "\nIptal\n"
s_loaded:  .asciz "Yuklendi: "
s_entry:   .asciz " bayt, giris "
s_range:   .asciz "Hata: adres izinli degil\n"
s_flfail:  .asciz "Hata: EEPROM yazilamadi\n"
s_help:    .ascii "Komutlar (sayilar hex):\n"
           .ascii " D [adres] [uzunluk]  bellegi goster\n"
           .ascii " W adres bayt ...     bellege yaz\n"
           .ascii " G [adres]            calistir (RET ile doner)\n"
           .ascii " B [pencere bank]     bank goster / sec (pencere 1-2)\n"
           .ascii " L                    Intel HEX yukle: UART -> RAM\n"
           .ascii " F                    Intel HEX yukle: UART -> EEPROM (bank 1)\n"
           .ascii " I                    EEPROM yazma korumasi\n"
           .ascii " C [0|1]              onbellek sayaclari / kapat-ac\n"
           .asciz " T                    RAM testi\n"
bios_end:
