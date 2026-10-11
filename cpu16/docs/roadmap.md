# CPU16 — Yol Haritası

> **Şu an:** Faz 1 bitti (emülatör + as16, 52 test). **Sıradaki:** Faz 2, mikromimari ve mikrokod. Paralel iz olarak Faz 8 (C derleyicisi) artık başlayabilir.
> Bu satır her faz bittiğinde güncellenir. Kaybolursan önce buraya bak.

## Kaybolmamak için 5 kural

1. **Aynı anda tek ana faz.** Yanında en fazla bir paralel iz (aşağıda ⇄ ile işaretli) yürür.
2. **Her fazın "bitti" ölçütü bir testtir**, his değil. Test geçmeden sonraki faza geçilmez.
3. **Altın model.** Faz 1'deki emülatör doğrunun tanımıdır. Sonraki her katman (mikrokod modeli, kapı seviyesi kart, gerçek kart) aynı test programlarını çalıştırıp emülatörle **adım adım aynı sonucu** vermek zorunda (lockstep karşılaştırma). Böylece hata hep "son eklenen katmanda" aranır.
4. **Spec değişikliği = PR.** `spec.md` dondurulmuş; değişiklik gerekirse önce spec'i değiştiren bir PR, sonra kod.
5. **Her faz bir video.** Faz bittiğinde çekilecek video zaten belli; içerik üretimi kodun gerisinde kalmaz.

## Genel akış

```
Faz 0 Spec ─▶ Faz 1 Emülatör+as16 ─▶ Faz 2 Mikromimari ─▶ Faz 3 74HC kütüphanesi ─▶ Faz 4 KiCad şemaları
                    │                                                                        │
                    └──⇄ Faz 8 C derleyicisi (emülatör hazır olunca paralel başlar)             ▼
                                                     Faz 5 3D görünüm ◀── Faz 4 netlist ─▶ Faz 6 Çevre birimleri
                                                                                             │
                                          Faz 7 BIOS + bootloader + Web IDE ◀────────────────┘
                                                             │
                                                   Faz 9 Gerçek kartlar ─▶ Faz 10 Deney seti paketi
```

## Fazlar

### Faz 0 — Spec ✅
- Çıktı: `docs/spec.md` v1.0 (ISA, formatlar, opcode haritası, bellek haritası, ABI, donanım blokları).
- Bitti ölçütü: AFU onayı. ✅ 2026-10-11

### Faz 1 — Referans emülatör + assembler (altın model) ✅ 2026-10-11
- Çıktı: `cpu16/emu` (TypeScript, komut seviyesi emülatör), `cpu16/asm` (as16: etiketler, direktifler, .bin/.hex çıktısı), ISA test programları.
- Bitti ölçütü: her opcode için en az bir test; bayrak (NZCV) kenar durumları; Fibonacci, bubble sort, 32 bit toplama (ADC) programları emülatörde doğru sonuç verir; CI'da koşar.
- Video: "Kendi komut setimizi tasarladık: ilk programı çalıştırıyoruz".
- Sonuç: `emu/cpu.ts`, `emu/disasm.ts`, `asm/assembler.ts`, `asm/hex.ts`, `tools/cli.ts`, `programs/*.s` (hello, fib, add32 + yazılım çarpma, bubble, irq), `tests/` (52 test, disassembler 65 536 kelimenin hepsinde gidiş-dönüş). Bit bit davranış: `docs/isa-ayrintilari.md`; assembler rehberi: `docs/as16.md`.

### Faz 2 — Mikromimari ve mikrokod
- Çıktı: veriyolu blok şeması, kontrol sinyali listesi (24–32 sinyal), mikrokod kaynak dosyası + mikrokod derleyicisi (Flash imajı üretir), **saat döngüsü seviyesinde** blok modeli (register, ALU, bus, kontrol).
- Bitti ölçütü: Faz 1 test programlarının tamamı blok modelde çalışır ve her komut sonunda emülatörle lockstep aynı durumdadır; komut başına döngü sayısı tablosu çıkar.
- Video: "Mikrokod nedir? CPU'nun içindeki küçük program".

### Faz 3 — 74HC parça kütüphanesi
- Çıktı: kullanılan her çip (≈25 tip: 74HC00/04/08/32/86/74/138/148/157/161/175/245/283/574/595/688, SRAM, Flash…) için kapı seviyesi model + doğruluk tablosu testleri; her kapı için CMOS transistör açılımı; KiCad sembol/footprint eşlemesi.
- Bitti ölçütü: her çip modeli datasheet doğruluk tablosunu geçer; transistör açılımı Silikon3D motorunda kapıyla aynı sonucu verir.
- Video: "74HC283'ün içine giriyoruz: toplayıcıdan transistöre".

### Faz 4 — KiCad şemaları (kart kart)
- Sıra: saat/reset → CPU (register, ALU, PC, IR, bayraklar, mikrokod) → bellek + bank → backplane.
- Çıktı: her kart için `.kicad_sch`, netlist → simülatör içe aktarıcı.
- Bitti ölçütü: şemadan üretilen **kapı seviyesi** bilgisayar Faz 1 test programlarını emülatörle lockstep çalıştırır. (Şema değişirse simülasyon da kendiliğinden değişir.)
- Video: kart başına bir bölüm.

### Faz 5 — 3D görünüm (Silikon3D ile birlikte)
- Çıktı: kart → çip → kapı → transistör yakınlaştırma; tıklanan çipin içi açılır; canlı sinyaller.
- Not: Silikon3D kodu "3D 16-bit CPU simülasyonu" konuşmasının sorumluluğunda; bu faz orada koordineli yürür.
- Bitti ölçütü: çalışan programda bir çipe tıklanıp transistör seviyesine kadar canlı sinyal izlenebilir.

### Faz 6 — Çevre birimleri ve anakart
- Çıktı: VGA metin kartı, PS/2 klavye, UART, zamanlayıcı, kesme denetleyicisi (74HC148), cache kartı (+ hit/miss sayaçları), bank register'ları. Hepsi şema + simülasyon.
- Bitti ölçütü: simülasyonda klavyeden basılan tuş ekranda görünür; cache hit oranı ölçülür; 1 MB bellek testi geçer.

### Faz 7 — Yazılım tabanı ve Web IDE
- Çıktı: BIOS/monitör (bellek göster/düzenle, programı çalıştır), UART bootloader, Web IDE (editör + derle + simülatörde çalıştır + Web Serial ile karta gönder).
- Bitti ölçütü: tarayıcıda yazılan program tek tuşla simülatörde ve (Faz 9 sonrası) gerçek kartta çalışır.

### Faz 8 — C derleyicisi cc16 ⇄ (Faz 1'den sonra paralel)
- Aşamalar: (1) int/char/pointer/dizi/kontrol akışı/fonksiyon → (2) struct/union/enum/string/switch → (3) typedef + önişlemci + linker (ld16) → (4) long, register ayırma, optimizasyon → (5) soft-float, self-host denemesi.
- Çıktı: `cpu16/cc`, `cpu16/libc` (crt0, printf, malloc, soft MUL/DIV, string).
- Bitti ölçütü (her aşama): o aşamanın C test paketi emülatörde geçer. Final: C ile yazılmış yılan oyunu ekranda oynanır.

### Faz 9 — Gerçek kartlar
- Sıra Faz 4 ile aynı; her kart önce breadboard, sonra PCB. Kendi EEPROM programlayıcımız (Arduino + 74HC595) ilk iş.
- Bitti ölçütü: gerçek kart, simülasyonun geçtiği aynı test programlarını geçer (UART üzerinden sonuç karşılaştırması).

### Faz 10 — Deney seti paketi
- Çıktı: deney başına rehber (malzeme listesi, şema, adımlar, beklenen sonuç, simülatör sahnesi), BOM, sorun giderme.
- Bitti ölçütü: biri sıfırdan rehberi takip edip 1. deneyden yılan oyununa ulaşabilir.

## Depo düzeni

```
cpu16/
  docs/       spec.md, roadmap.md, kararlar
  emu/        referans emülatör (Faz 1)
  asm/        as16 (Faz 1)
  microcode/  mikrokod kaynakları + derleyici (Faz 2)
  parts/      74HC kapı/transistör modelleri (Faz 3)
  hw/         KiCad projeleri, kart başına klasör (Faz 4, 6, 9)
  firmware/   BIOS, bootloader (Faz 7)
  cc/ libc/   C derleyicisi ve kütüphane (Faz 8)
  kit/        deney rehberleri (Faz 10)
```

Silikon3D uygulama kodu (`src/`) bu klasörden ayrıdır; 3D entegrasyonu Faz 5'te yapılır.
