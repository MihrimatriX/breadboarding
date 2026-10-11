; bellek-deneme.s — Deney 8: bellek kartı denemesi (BIOS'suz, EEPROM bank 0'dan çalışır).
;
; RAM'in 8 bankının (128 KB, 4 × 62256) hepsini iki desenle sınar. Sonucu FF00'daki 8 LED
; gösterir (test kartının UART mandalı; G/Ç kartı takılınca aynı adres UART_DATA olur):
;   sınama sırasında : bit 0–5 sınanan bank (32..39), bit 6 desen (0 düz, 1 ters)
;   hata             : bit 7 de yanar, bit 0–6 hatalı bank ve deseni gösterir, program durur
;                      (r1 hatalı CPU adresi, r0 okunan, r2 beklenen: simülatörde register'lardan)
;   boş bölge hatası : 0x88, 0x90, 0xA8 ya da 0xB0: bank 8, 16, 40 ya da 48'de 0xFFFF okunmadı
;                      (veriyolu çekme dirençleri ya da çip seçimi: PA17, PA18; bkz. aşağı)
;   başarı           : önce 0x5A, sonra sonsuza kadar kayan ışık
;
; Desen: her kelimeye kendi adresi XOR bank·0x0101 yazılır (ters desende bunun tersi). Önce 8
; bankın hepsi yazılır, sonra hepsi okunur: bank hatları (PA14–PA16, RAM çipi seçimi) karışık ya
; da kopuksa bir bank ötekinin üstüne yazar ve okumada yakalanır. Program RAM'i başka bir şey için
; kullanmaz (yığın yok, CALL'lar iç içe değil). Önbellek kapatılır: okumalar gerçekten RAM'den
; gelsin. 1 MHz'de iki desen ≈ 12 saniye sürer (bank başına ≈ 0,3 s yazma, ≈ 0,4 s okuma);
; LED'ler bu sürede bank sayar.

IOB     = 0xFF20
O_LED   = -32           ; FF00
O_BANK1 = -15           ; FF11: pencere 1'in bank register'ı
O_CCTRL = 20            ; FF34: bit0 önbellek açık
WIN     = 0x4000        ; pencere 1: 0x4000–0x7FFF

        .org 0
        B    main            ; 0x0000 reset
        B    main            ; 0x0002 IRQ (kesmeler kapalı)
        B    main            ; 0x0004 SWI

main:   LI   r5, IOB
        LI   r0, 0
        SB   r0, [r5+O_CCTRL]  ; önbellek kapalı
        LI   r3, 32          ; r3 = LED değeri: desen << 6 | bank

; ---- yazma geçişi: 8 bankın hepsi
pass:
w_bank: CALL setbank
w_lp:   XOR  r2, r1, r4      ; beklenen = adres ^ anahtar
        SW   r2, [r1]
        ADDI r1, r1, 2
        CMP  r1, r5
        BNE  w_lp
        CALL nextbank
        BNE  w_bank

; ---- okuma geçişi: aynı sırayla geri oku
r_bank: CALL setbank
r_lp:   LW   r0, [r1]
        XOR  r2, r1, r4
        CMP  r0, r2
        BNE  hata
        ADDI r1, r1, 2
        CMP  r1, r5
        BNE  r_lp
        CALL nextbank
        BNE  r_bank

        LI   r2, 64          ; sonraki desen (bit 6)
        ADD  r3, r3, r2
        CMPI r3, 96          ; 32 + 64: ters desen henüz yapılmadı
        BEQ  pass

; ---- boş bölge: bank 2–31 ve 40–63'te bellek yok, veriyolu dirençleri 0xFFFF okutur.
;      Çip seçimi (74HC138) PA17 = PA18 = 0 ister: bank 8 ve 40'ta PA17, 16 ve 48'de PA18 = 1.
;      Bu bitlerden biri seçiciye ulaşmıyorsa orada EEPROM (8, 16) ya da RAM (40, 48) cevap verir.
        LI   r3, 8
        CALL bos
        BNE  b_hata
        LI   r3, 16
        CALL bos
        BNE  b_hata
        LI   r3, 40
        CALL bos
        BNE  b_hata
        LI   r3, 48
        CALL bos
        BEQ  basari
b_hata: LI   r2, 0xFFFF

; ---- hata: LED = 0x80 | desen | bank, dur (r0/r1/r2 korunur)
hata:   LI   r5, IOB
        LI   r4, 0x80
        OR   r4, r3, r4
        SB   r4, [r5+O_LED]
h_dur:  B    h_dur

; ---- başarı: 0x5A (bank kodlarıyla karışmaz), sonra kayan ışık
basari: LI   r0, 0x5A
        SB   r0, [r5+O_LED]
        CALL bekle
        CALL bekle
k_bas:  LI   r0, 1
kay:    SB   r0, [r5+O_LED]
        CALL bekle
        CMPI r0, 128
        BEQ  k_bas
        SHL  r0, r0
        B    kay

; setbank(r3): LED'e yaz, pencere 1'i banka çevir; r4 = anahtar, r1 = WIN, r5 = pencere sonu
setbank:
        LI   r5, IOB
        SB   r3, [r5+O_LED]
        LI   r2, 63
        AND  r4, r3, r2      ; bank
        SB   r4, [r5+O_BANK1]
        MOV  r2, r4
        SHL  r2, r2
        SHL  r2, r2
        SHL  r2, r2
        SHL  r2, r2
        SHL  r2, r2
        SHL  r2, r2
        SHL  r2, r2
        SHL  r2, r2
        OR   r4, r4, r2      ; bank · 0x0101
        LI   r2, 0x40
        AND  r2, r3, r2
        BEQ  sb_duz
        NOT  r4, r4          ; ters desen
sb_duz: LI   r1, WIN
        LI   r5, WIN + 0x4000
        RET

; nextbank: r3'ü bir sonraki banka geçir. Z = 0: devam; Z = 1: 8 bank bitti (r3 yine bank 32)
nextbank:
        ADDI r3, r3, 1
        LI   r2, 63
        AND  r2, r3, r2
        CMPI r2, 40
        BNE  nb_son          ; Z = 0
        ADDI r3, r3, -8
        CMPI r2, 40          ; Z = 1
nb_son: RET

; bos(r3): pencere 1'i r3 bankına çevirip ilk kelimeyi okur; Z = 1: 0xFFFF okundu (r0 okunan).
;          r1 = okunan adres, r5 = IOB
bos:    LI   r5, IOB
        SB   r3, [r5+O_BANK1]
        LI   r1, WIN
        LW   r0, [r1]
        CMPI r0, -1
        RET

; bekle: ≈ 0,15 s (1 MHz)
bekle:  LI   r1, 0x2000
b_lp:   ADDI r1, r1, -1
        BNE  b_lp
        RET
