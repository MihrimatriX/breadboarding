; 3-onbellek.s — kart testi 3: önbelleğin doğruluğu, etiket karşılaştırması ve sayaçları.
;
; 1. Etiket: bank 35 ve bank 36'nın aynı ofsetine farklı değerler yazar (aynı önbellek satırına
;    düşerler, etiketleri farklıdır) ve 200 kez sırayla okur: her okuma kendi değerini vermeli.
; 2. Yazma gözetleme: önbellekteki bir kelimeye bayt yazar, kelimeyi yeniden okur.
; 3. Sayaçlar: kesmeler maskelenmişken aynı kelimeyi 500 kez okur; isabet en az 500 olmalı.
;    Önbellek kapalıyken isabet sayacı artmamalı.
; Sayaçların tam değeri, programdan önce önbellekte ne kaldığına bağlıdır (kesmeler o ana kadar
; zamana bağlı çalışır); bu yüzden yalnızca EVET / HAYIR yazılır.

BIOS_PUTS    = 0x0030
BIOS_PUTHEX4 = 0x0038
BIOS_NEWLINE = 0x0050
BANK2        = 0xFF12
IRQ_MASK     = 0xFF09
CACHE        = 0xFF30           ; +0 isabet, +2 ıskalama, +4 denetim
PENCERE      = 0x8000
OFS          = 0x1234

        .org 0x4000
main:   PUSH lr
        PUSH r4
        PUSH r5
        LI   r5, 0              ; hata sayısı
        LI   r1, IRQ_MASK
        LBU  r0, [r1]
        PUSH r0                 ; maskeyi sakla
        LI   r0, 0
        SB   r0, [r1]           ; kesmeler kapalı: sayaçlar yalnızca bu programı sayar

        ; ---- 1. etiket karşılaştırması
        LI   r1, BANK2
        LI   r2, PENCERE + OFS
        LI   r0, 35
        SB   r0, [r1]
        LI   r0, 0xA535
        SW   r0, [r2]
        LI   r0, 36
        SB   r0, [r1]
        LI   r0, 0x5A36
        SW   r0, [r2]
        LI   r4, 200
et1:    LI   r0, 35
        SB   r0, [r1]
        LW   r0, [r2]
        LI   r3, 0xA535
        CMP  r0, r3
        BEQ  et2
        ADDI r5, r5, 1
et2:    LI   r0, 36
        SB   r0, [r1]
        LW   r0, [r2]
        LI   r3, 0x5A36
        CMP  r0, r3
        BEQ  et3
        ADDI r5, r5, 1
et3:    ADDI r4, r4, -1
        BNE  et1
        LI   r0, msg_etiket
        CALL evet_hayir_hata

        ; ---- 2. bayt yazma önbellekteki kelimeyi günceller (bank 36 seçili, kelime önbellekte)
        LI   r5, 0
        LW   r0, [r2]           ; önbelleğe al
        LI   r0, 0x77
        SB   r0, [r2+1]         ; yüksek baytı değiştir
        LW   r0, [r2]
        LI   r3, 0x7736
        CMP  r0, r3
        BEQ  gz1
        ADDI r5, r5, 1
gz1:    LI   r0, msg_gozetle
        CALL evet_hayir_hata

        ; ---- 3. sayaçlar, önbellek açık
        LI   r4, CACHE
        LI   r0, 1
        SB   r0, [r4+4]
        SB   r0, [r4]           ; sayaçları sıfırla
        LI   r3, 500
s1:     LW   r0, [r2]
        ADDI r3, r3, -1
        BNE  s1
        LW   r0, [r4]           ; isabet
        LI   r3, 500
        LI   r5, 0
        CMP  r0, r3
        BCS  s2                 ; isabet >= 500
        ADDI r5, r5, 1
s2:     LI   r0, msg_acik
        CALL evet_hayir_hata

        ; ---- önbellek kapalı: isabet artmaz
        LI   r0, 0
        SB   r0, [r4+4]
        SB   r0, [r4]
        LI   r3, 100
s3:     LW   r0, [r2]
        ADDI r3, r3, -1
        BNE  s3
        LW   r5, [r4]           ; isabet sayısı = hata sayısı (0 olmalı)
        LI   r0, 1
        SB   r0, [r4+4]         ; önbelleği yeniden aç
        LI   r0, msg_kapali
        CALL evet_hayir_hata

        ; ---- toparla
        LI   r1, BANK2
        LI   r0, 33
        SB   r0, [r1]
        POP  r0
        LI   r1, IRQ_MASK
        SB   r0, [r1]
        LI   r0, msg_son
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0
        POP  r5
        POP  r4
        POP  lr
        RET

; evet_hayir_hata: r0 = ileti; r5 = 0 ise "EVET", değilse "HAYIR (r5)"
evet_hayir_hata:
        PUSH lr
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0
        CMPI r5, 0
        BNE  eh1
        LI   r0, msg_evet
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0
        B    eh2
eh1:    LI   r0, msg_hayir
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0
        MOV  r0, r5
        LI   r3, BIOS_PUTHEX4
        JALR lr, r3, 0
eh2:    LI   r3, BIOS_NEWLINE
        JALR lr, r3, 0
        POP  lr
        RET

msg_etiket:  .asciz "ayni satir, farkli etiket dogru okunuyor: "
msg_gozetle: .asciz "bayt yazma onbellegi guncelliyor: "
msg_acik:    .asciz "onbellek acik, 500 okumada isabet >= 500: "
msg_kapali:  .asciz "onbellek kapali, isabet sayaci duruyor: "
msg_evet:    .asciz "EVET"
msg_hayir:   .asciz "HAYIR, hata "
msg_son:     .asciz "ONBELLEK TESTI BITTI\n"
