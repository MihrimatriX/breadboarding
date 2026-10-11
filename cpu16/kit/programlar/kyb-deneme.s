; kyb-deneme.s — Deney 14: kendin yap bellek kartı denemesi (BIOS'suz, EEPROM bank 0'dan çalışır).
;
; Kartın 16 baytı (FF40–FF4F, her bayt bir 74HC574) UART'tan izlenir (Deney 10'daki terminal:
; 1 MHz'de 28 800 baud, 8N1):
;   1. Açılıştaki içerik: "FF40: 3C 00 …" (574'lerin açılış durumu rastgeledir; reset silmez)
;   2. Dört desen. Her biri önce 16 baytın hepsine yazılır, sonra hepsi okunur: bir bayt başka
;      bir baytın üstüne yazıyorsa (adres çözme hatası) okumada yakalanır.
;        d1  bayt bayt yazılır, bayt bayt okunur:  i · 0x11 (00 11 22 … FF)
;        d2  bayt bayt yazılır, kelime okunur:     d1'in tersi
;        d3  kelime yazılır, bayt bayt okunur:     yürüyen bit (çift bayt 1 << k, tek bayt 0x80 >> k)
;        d4  kelime yazılır, kelime okunur:        d3'ün tersi
;      Okunan beklenenden farklıysa "HATA FF4x: okunan YY, beklenen ZZ" yazar (kelimede dört
;      basamak) ve durur.
;   3. Hepsi doğruysa "TAMAM" ve d1'le doldurulmuş içerik. Sonra terminalde yazılan her karakter
;      sırayla bir sonraki bayta yazılır ve içerik yeniden basılır: ASCII kodlar 574'lerde durur.

IOB     = 0xFF20
O_UDATA = -32           ; FF00
O_USTAT = -31           ; FF01 bit0 RX_READY, bit1 TX_EMPTY
KYB     = 0xFF40

        .org 0
        B    main            ; 0x0000 reset
        B    main            ; 0x0002 IRQ (kesmeler kapalı)
        B    main            ; 0x0004 SWI

main:   LI   sp, 0xFF00      ; yığın: pencere 3 (reset'te RAM bank 34)
        LI   r0, baslik
        CALL puts
        CALL dokum           ; açılıştaki içerik
        LI   r4, d1
        CALL yazb
        CALL okub
        LI   r4, d2
        CALL yazb
        CALL okuw
        LI   r4, d3
        CALL yazw
        CALL okub
        LI   r4, d4
        CALL yazw
        CALL okuw
        LI   r0, tamam
        CALL puts
        LI   r4, d1
        CALL yazb
        CALL dokum

; ---- yazılan karakterleri sırayla baytlara yaz (r4 = sıradaki bayt)
        LI   r4, KYB
yanki:  LI   r5, IOB
y_w:    LBU  r0, [r5+O_USTAT]
        SHR  r0, r0          ; C = RX_READY
        BCC  y_w
        LBU  r0, [r5+O_UDATA]  ; okumak RX_READY'yi siler
        SB   r0, [r4]
        ADDI r4, r4, 1
        LI   r0, 15
        AND  r0, r4, r0
        BNE  y_son
        ADDI r4, r4, -16     ; FF4F'den sonra FF40
y_son:  CALL dokum
        B    yanki

; yazb(r4 = tablo): 16 baytı tek tek (SB) yaz (r0, r1, r2 bozulur)
yazb:   LI   r1, KYB
        MOV  r2, r4
yb_lp:  LBU  r0, [r2]
        SB   r0, [r1]
        ADDI r1, r1, 1
        ADDI r2, r2, 1
        LI   r0, 15
        AND  r0, r1, r0
        BNE  yb_lp
        RET

; yazw(r4 = tablo): 8 kelimeyi (SW) yaz: çift ve tek bayt aynı anda yüklenir
yazw:   LI   r1, KYB
        MOV  r2, r4
yw_lp:  LW   r0, [r2]
        SW   r0, [r1]
        ADDI r1, r1, 2
        ADDI r2, r2, 2
        LI   r0, 15
        AND  r0, r1, r0
        BNE  yw_lp
        RET

; okub(r4 = tablo): 16 baytı tek tek (LBU) oku ve karşılaştır; farklıysa hata (dönmez)
okub:   LI   r1, KYB
        MOV  r2, r4
ob_lp:  LBU  r0, [r1]
        LBU  r3, [r2]
        CMP  r0, r3
        BNE  hatab
        ADDI r1, r1, 1
        ADDI r2, r2, 1
        LI   r0, 15
        AND  r0, r1, r0
        BNE  ob_lp
        RET

; okuw(r4 = tablo): 8 kelimeyi (LW) oku ve karşılaştır: iki 574 veriyoluna aynı anda çıkar
okuw:   LI   r1, KYB
        MOV  r2, r4
ow_lp:  LW   r0, [r1]
        LW   r3, [r2]
        CMP  r0, r3
        BNE  hataw
        ADDI r1, r1, 2
        ADDI r2, r2, 2
        LI   r0, 15
        AND  r0, r1, r0
        BNE  ow_lp
        RET

; ---- hata: r1 adres, r0 okunan, r3 beklenen; "HATA FF4x: okunan YY, beklenen ZZ", dur
hatab:  LI   r5, 2
        B    hata
hataw:  LI   r5, 4
hata:   MOV  r4, r0          ; okunan
        PUSH r3              ; beklenen
        PUSH r5              ; basamak sayısı
        LI   r0, m_hata
        CALL puts
        MOV  r2, r1
        LI   r5, 4
        CALL hexn
        LI   r0, m_okunan
        CALL puts
        POP  r5
        PUSH r5
        MOV  r2, r4
        CALL hexn
        LI   r0, m_bekl
        CALL puts
        POP  r5
        POP  r2
        CALL hexn
        LI   r0, crlf
        CALL puts
h_dur:  B    h_dur

; dokum: "FF40: xx xx … xx" satırı (r0, r1, r2, r3, r5 bozulur)
dokum:  PUSH lr
        LI   r0, m_dokum
        CALL puts
        LI   r1, KYB
d_lp:   LI   r0, ' '
        CALL putc
        LBU  r2, [r1]
        LI   r5, 2
        CALL hexn
        ADDI r1, r1, 1
        LI   r0, 15
        AND  r0, r1, r0
        BNE  d_lp
        LI   r0, crlf
        CALL puts
        POP  lr
        RET

; hexn(r2 = değer, r5 = basamak sayısı): en anlamlı basamaktan başlayarak yaz (r0, r3, r5 bozulur)
hexn:   PUSH r1
        PUSH lr
hn_lp:  ADDI r5, r5, -1
        MOV  r0, r2
        MOV  r1, r5          ; 4 × r5 bit sağa kaydır
hn_sh:  CMPI r1, 0
        BEQ  hn_dig
        SHR  r0, r0
        SHR  r0, r0
        SHR  r0, r0
        SHR  r0, r0
        ADDI r1, r1, -1
        B    hn_sh
hn_dig: LI   r1, 15
        AND  r0, r0, r1
        CALL hexdig
        CMPI r5, 0
        BNE  hn_lp
        POP  lr
        POP  r1
        RET

; hexdig(r0 = 0..15): onaltılık basamak yaz
hexdig: CMPI r0, 10
        BLT  hd_num
        ADDI r0, r0, 'A' - '0' - 10
hd_num: LI   r3, '0'
        ADD  r0, r0, r3
        B    putc            ; kuyruk çağrısı: putc'nin RET'i çağırana döner

; putc(r0): TX_EMPTY'yi bekle, gönder (r3 bozulur)
putc:   PUSH r1
        LI   r3, IOB
p_w:    LBU  r1, [r3+O_USTAT]
        SHR  r1, r1
        SHR  r1, r1          ; C = TX_EMPTY
        BCC  p_w
        SB   r0, [r3+O_UDATA]
        POP  r1
        RET

; puts(r0 = metin)
puts:   PUSH r1
        PUSH lr
        MOV  r1, r0
s_lp:   LBU  r0, [r1]
        CMPI r0, 0
        BEQ  s_end
        CALL putc
        ADDI r1, r1, 1
        B    s_lp
s_end:  POP  lr
        POP  r1
        RET

        .align 2
d1:     .byte 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF
d2:     .byte 0xFF, 0xEE, 0xDD, 0xCC, 0xBB, 0xAA, 0x99, 0x88, 0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, 0x00
d3:     .byte 0x01, 0x80, 0x02, 0x40, 0x04, 0x20, 0x08, 0x10, 0x10, 0x08, 0x20, 0x04, 0x40, 0x02, 0x80, 0x01
d4:     .byte 0xFE, 0x7F, 0xFD, 0xBF, 0xFB, 0xDF, 0xF7, 0xEF, 0xEF, 0xF7, 0xDF, 0xFB, 0xBF, 0xFD, 0x7F, 0xFE

baslik:   .asciz "KENDIN YAP BELLEK: FF40-FF4F, 16 x 74HC574\r\n"
tamam:    .asciz "TAMAM\r\n"
m_dokum:  .asciz "FF40:"
m_hata:   .asciz "HATA "
m_okunan: .asciz ": okunan "
m_bekl:   .asciz ", beklenen "
crlf:     .asciz "\r\n"
