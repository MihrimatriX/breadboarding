; video-deneme.s — Deney 11: video kartı denemesi (BIOS'suz, Flash bank 0'dan çalışır).
;
; Ekranı mavi zeminle temizler, 2. satıra sarı "Merhaba, CPU16!" yazar, 5. satıra 16 rengin
; zemin çubuğunu, 6. satıra altlarına renk numaralarını (0–F) koyar. Sonra her VSYNC'te
; (kare başına bir kez, 60 Hz) 8. satırdaki kare sayacını artırır: sayaç ilerliyorsa VSTAT ve
; dikey senkron sayacı çalışıyor demektir.
;
; VRAM'e port üzerinden erişilir: VADDR'a (FF20, kelime) hücre adresi yazılır, VDATA'ya (FF22)
; yazılan her bayttan sonra adres kendiliğinden bir artar. Hücre = (satır·80 + sütun)·2:
; önce karakter kodu, sonra renk baytı (düşük 4 bit yazı, yüksek 4 bit zemin).

IOB     = 0xFF20
O_VADDR = 0             ; FF20–21 (SW ile kelime)
O_VDATA = 2             ; FF22
O_VCTRL = 3             ; FF23 bit0 imleç görünür
O_VSTAT = 6             ; FF26 bit1 VSYNC bayrağı (1 yazınca silinir)
ZEMIN   = 0x1F          ; mavi zemin, parlak beyaz yazı
SARI    = 0x1E          ; mavi zemin, sarı yazı

        .org 0
        B    main            ; 0x0000 reset
        B    main            ; 0x0002 IRQ (kesmeler kapalı)
        B    main            ; 0x0004 SWI

main:   LI   sp, 0xFF00      ; yığın: pencere 3 (reset'te RAM bank 34)
        LI   r5, IOB
        LI   r0, 0
        SB   r0, [r5+O_VCTRL]  ; imleç gizli
        SW   r0, [r5+O_VADDR]  ; VADDR = 0
        LI   r1, 2400        ; 80 × 30 hücre
        LI   r2, ' '
        LI   r3, ZEMIN
cls:    SB   r2, [r5+O_VDATA]
        SB   r3, [r5+O_VDATA]
        ADDI r1, r1, -1
        BNE  cls

        LI   r0, (2*80+4)*2  ; başlık: satır 2, sütun 4
        SW   r0, [r5+O_VADDR]
        LI   r1, baslik
        LI   r3, SARI
        CALL yaz

        LI   r0, (5*80+8)*2  ; renk çubuğu: satır 5, her renk 4 hücre
        SW   r0, [r5+O_VADDR]
        LI   r4, 0
        LI   r2, ' '
cubuk:  MOV  r3, r4
        SHL  r3, r3
        SHL  r3, r3
        SHL  r3, r3
        SHL  r3, r3          ; zemin = renk, yazı = 0
        SB   r2, [r5+O_VDATA]
        SB   r3, [r5+O_VDATA]
        SB   r2, [r5+O_VDATA]
        SB   r3, [r5+O_VDATA]
        SB   r2, [r5+O_VDATA]
        SB   r3, [r5+O_VDATA]
        SB   r2, [r5+O_VDATA]
        SB   r3, [r5+O_VDATA]
        ADDI r4, r4, 1
        CMPI r4, 16
        BNE  cubuk

        LI   r0, (6*80+9)*2  ; numaralar: satır 6, her bloğun ikinci hücresi
        LI   r4, 0
numara: SW   r0, [r5+O_VADDR]
        MOV  r2, r4
        CALL hexdig
        LI   r3, ZEMIN
        SB   r2, [r5+O_VDATA]
        SB   r3, [r5+O_VDATA]
        ADDI r0, r0, 8       ; 4 hücre sağa
        ADDI r4, r4, 1
        CMPI r4, 16
        BNE  numara

        LI   r0, (8*80+4)*2  ; "kare: " etiketi
        SW   r0, [r5+O_VADDR]
        LI   r1, etiket
        LI   r3, ZEMIN
        CALL yaz

        LI   r4, 0           ; r4 = kare sayacı
kare:   LBU  r0, [r5+O_VSTAT]
        LI   r2, 2
        AND  r0, r0, r2
        BEQ  kare            ; VSYNC bayrağını bekle
        SB   r2, [r5+O_VSTAT]  ; bayrağı sil (W1C)
        ADDI r4, r4, 1
        LI   r0, (8*80+10)*2
        SW   r0, [r5+O_VADDR]
        LI   r3, ZEMIN
        CALL hex4
        B    kare

; yaz(r1 = metin, r3 = renk): VADDR'dan başlayarak yaz
yaz:    LBU  r2, [r1]
        CMPI r2, 0
        BEQ  y_son
        SB   r2, [r5+O_VDATA]
        SB   r3, [r5+O_VDATA]
        ADDI r1, r1, 1
        B    yaz
y_son:  RET

; hex4(r4, r3 = renk): r4'ü dört onaltılık basamak olarak yaz (r1, r2 bozulur)
hex4:   PUSH lr
        PUSH r4
        LI   r1, 4
h_lp:   MOV  r2, r4          ; en üst dört bit: 12 kez sağa kaydır
        SHR  r2, r2
        SHR  r2, r2
        SHR  r2, r2
        SHR  r2, r2
        SHR  r2, r2
        SHR  r2, r2
        SHR  r2, r2
        SHR  r2, r2
        SHR  r2, r2
        SHR  r2, r2
        SHR  r2, r2
        SHR  r2, r2
        CALL hexdig
        SB   r2, [r5+O_VDATA]
        SB   r3, [r5+O_VDATA]
        SHL  r4, r4          ; sonraki dört bit üste
        SHL  r4, r4
        SHL  r4, r4
        SHL  r4, r4
        ADDI r1, r1, -1
        BNE  h_lp
        POP  r4
        POP  lr
        RET

; hexdig(r2 = 0..15): r2 = ASCII onaltılık basamak
hexdig: CMPI r2, 10
        BLT  hd_num
        ADDI r2, r2, 'A' - '0' - 10
hd_num: ADDI r2, r2, 16
        ADDI r2, r2, 16
        ADDI r2, r2, 16      ; + '0' (48)
        RET

baslik: .asciz "Merhaba, CPU16!"
etiket: .asciz "kare: "
