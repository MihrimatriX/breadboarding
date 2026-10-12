# CPU16 — Yol Haritası

> **Şu an:** Fazların simülasyon tarafı bitti (2026-10-11): altı kartlı anakart kapı seviyesinde BIOS'u açıyor ve emülatörle komut komut aynı; KiCad şemaları, zamanlama analizi, C derleyicisi ve 14 deneyin rehberi hazır. **Sıradaki:** gerçek kartlar, Deney 1'den başlayarak (Faz 9'un bitti ölçütü kart testi). Açık soru: işlemcinin kalıcı adı.
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

### Faz 2 — Mikromimari ve mikrokod ✅ 2026-10-11
- Çıktı: veriyolu blok şeması, kontrol sinyali listesi (24–32 sinyal), mikrokod kaynak dosyası + mikrokod derleyicisi (kontrol tablosu üretir), **saat döngüsü seviyesinde** blok modeli (register, ALU, bus, kontrol).
- Bitti ölçütü: Faz 1 test programlarının tamamı blok modelde çalışır ve her komut sonunda emülatörle lockstep aynı durumdadır; komut başına döngü sayısı tablosu çıkar.
- Video: "Mikrokod nedir? CPU'nun içindeki küçük program".
- Sonuç: `micro/control.ts` (32 bit kontrol kelimesi), `micro/cpu16.ucode` + `micro/microasm.ts` (8192 kelimelik kontrol tablosu: `npm run cpu16 -- ucode`), `micro/datapath.ts` (tablonun bitlerini çalıştıran saat döngüsü modeli). Lockstep: 5 program + 60 000 rastgele komut. Ortalama ≈5 döngü/komut. Ayrıntı: `docs/mikromimari.md`. Spec değişikliği: `cond = 15` artık NV (asla), yasadışı değil.

### Faz 3 — 74HC parça kütüphanesi ✅ 2026-10-11
- Çıktı: kullanılan her çip (≈25 tip: 74HC00/04/08/32/86/74/138/148/157/161/175/245/283/574/595/688, SRAM, Flash…) için kapı seviyesi model + doğruluk tablosu testleri; her kapı için CMOS transistör açılımı; KiCad sembol/footprint eşlemesi.
- Bitti ölçütü: her çip modeli datasheet doğruluk tablosunu geçer; transistör açılımı Silikon3D motorunda kapıyla aynı sonucu verir.
- Video: "74HC283'ün içine giriyoruz: toplayıcıdan transistöre".
- Sonuç: `chips/` (35 çip: kapı modeli + veri sayfası tablosu + CMOS transistör açılımı + KiCad sembolü), `chips/logic.ts` kapı seviyesi simülatörü (0/1/Z/X, gecikmeli), `kicad/cpu16.kicad_sym`. Her çip tablosunu kapı ve transistör seviyesinde geçer. Ayrıntı: `docs/parcalar.md`.

### Faz 4 — KiCad şemaları (kart kart) ✅ 2026-10-11
- Sıra: saat/reset → CPU (register, ALU, PC, IR, bayraklar, mikrokod) → bellek + bank → backplane.
- Çıktı: her kart için `.kicad_sch`, netlist → simülatör içe aktarıcı.
- Bitti ölçütü: şemadan üretilen **kapı seviyesi** bilgisayar Faz 1 test programlarını emülatörle lockstep çalıştırır. (Şema değişirse simülasyon da kendiliğinden değişir.)
- Video: kart başına bir bölüm.
- Sonuç: şema = kod (`board/*.ts`): CPU kartı, saat kartı, test bellek kartı; aynı tanımdan kapı seviyesi simülasyon, KiCad 7 şemaları (`kicad/<kart>/`), BOM ve ERC. Kapı seviyesi bilgisayar 5 programı her saat döngüsünde mikrokod modeliyle aynı çalıştırır. CPU kartında ROM yok: mikrokod ve ALU kod çözme tablosu `board/kontrol.ts`'nin ürettiği 74HC kapı devresidir (194 entegre; LogicSim ile 8192 + 128 adreste tabloyla birebir). Ayrıntı: `docs/kartlar.md`, `docs/mikromimari.md`.

### Faz 5 — 3D görünüm (Silikon3D ile birlikte) ✅ 2026-10-11
- Çıktı: kart → çip → kapı → transistör yakınlaştırma; tıklanan çipin içi açılır; canlı sinyaller.
- Not: Silikon3D kodu "3D 16-bit CPU simülasyonu" konuşmasının sorumluluğunda; bu faz orada koordineli yürür.
- Bitti ölçütü: çalışan programda bir çipe tıklanıp transistör seviyesine kadar canlı sinyal izlenebilir.
- Sonuç: Silikon3D'de **CPU16 kartı 3D** bölümü (`#kart`): kapı seviyesi bilgisayar bir Web Worker'da çalışır; kart → çip (kalıp ve kapı şeması) → transistör yakınlaştırması, her seviyede canlı sinyaller, konsoldan `kart.*` API'si. Ayrıntı: `docs/3d-gorunum.md`.

### Faz 6 — Çevre birimleri ve anakart ✅ 2026-10-11
- Çıktı: VGA metin kartı, PS/2 klavye, UART, zamanlayıcı, kesme denetleyicisi (öncelik kodlayıcı kapılarla), cache kartı (+ hit/miss sayaçları), bank register'ları. Hepsi şema + simülasyon.
- Bitti ölçütü: simülasyonda klavyeden basılan tuş ekranda görünür; cache hit oranı ölçülür; 1 MB bellek testi geçer.
- Sonuç: davranış modeli `emu/machine.ts` (bank'lı 1 MB bellek, önbellek, UART, PS/2, zamanlayıcı, kesmeler, VGA metin) ve aynı anakartın kapı seviyesi kartları: saat (bekleme durumlu), bellek, önbellek, G/Ç, video, kendin yap bellek (16 × 74HC574, eğitim kartı). Anakart yalnız yaygın 7400 serisi lojikle ve iki bellek çipiyle (62256, 28C256) kurulur: 32 KB EEPROM + 128 KB RAM. CPU + beş kart birlikte BIOS'u reset'ten monitör istemine kadar açar ve `Machine` ile komut komut, zamanlayıcı kesmesi dahil aynıdır. Bütün anakart KiCad'de. Ayrıntı: `docs/anakart.md`, `docs/anakart-kartlari.md`, `docs/anakart-gc-video.md`.

### Faz 7 — Yazılım tabanı ve Web IDE ✅ 2026-10-11
- Çıktı: BIOS/monitör (bellek göster/düzenle, programı çalıştır), UART bootloader, Web IDE (editör + derle + simülatörde çalıştır + Web Serial ile karta gönder).
- Bitti ölçütü: tarayıcıda yazılan program tek tuşla simülatörde ve (Faz 9 sonrası) gerçek kartta çalışır.
- Sonuç: `bios/bios.s` (atlama tablosu, kesme işleyici, VGA ve UART sürücüleri, monitör, RAM'e ve EEPROM'a Intel HEX önyükleyici), Silikon3D'de CPU16 Web IDE'si (editör, C ve assembly, simülatörde çalıştır, Web Serial ile karta yükle). Ayrıntı: `docs/bios.md`.

### Faz 8 — C derleyicisi cc16 ⇄ (Faz 1'den sonra paralel) ✅ 2026-10-11
- Aşamalar: (1) int/char/pointer/dizi/kontrol akışı/fonksiyon → (2) struct/union/enum/string/switch → (3) typedef + önişlemci + linker (ld16) → (4) long, register ayırma, optimizasyon → (5) soft-float, self-host denemesi.
- Çıktı: `cpu16/cc`, `cpu16/libc` (crt0, printf, malloc, soft MUL/DIV, string).
- Bitti ölçütü (her aşama): o aşamanın C test paketi emülatörde geçer. Final: C ile yazılmış yılan oyunu ekranda oynanır.
- Sonuç: `cc/` (önişlemci, tipli ayrıştırıcı, kod üreteci, bağlayıcı; struct, union, enum, switch, long, göstergeler), `lib/` (crt0, rt, libc16: printf, malloc, string, yazılım çarpma/bölme). `cc --hedef bios` ile BIOS üzerinde çalışan programlar; `yilan.c` VGA ekranda klavyeyle oynanır. Soft-float ve self-host yok. Ayrıntı: `docs/cc16.md`.

### Faz 9 — Gerçek kartlar 🔧 araçlar hazır, kartlar kurulacak
- Sıra Faz 4 ile aynı; her kart önce breadboard, sonra PCB. Kendi EEPROM programlayıcımız (Arduino + 74HC595) ilk iş.
- Bitti ölçütü: gerçek kart, simülasyonun geçtiği aynı test programlarını geçer (UART üzerinden sonuç karşılaştırması).
- Sonuç: EEPROM programlayıcı (Arduino Nano + 2 × 74HC595, 28C256: korumalı sayfa yazma, `programlayici/`, `yaz.py`; BIOS EEPROM'u ve karakter ROM'u için), şemadan statik zamanlama analizi (`npm run cpu16 -- zamanlama [--anakart]`: ilk hedef **1 MHz CPU**, 8 MHz osilatör, UART 28 800 baud; video kartının piksel yolunda birkaç 74AC), kart testi (`npm run cpu16 -- kart-testi`: gerçek kart UART üzerinden simülatörle karşılaştırılır), kurulum belgeleri (`npm run cpu16 -- kurulum`: kart başına yerleşim, besleme, blok blok numaralı tel listesi ve çip kartları, PDF; el kitabı: breadboard, PCB montajı ve bip testi; `docs/kurulum.md`). Bitti ölçütü kartlar kurulup kart testi geçince sağlanır. Ayrıntı: `docs/uretim.md`.

### Faz 10 — Deney seti paketi ✅ 2026-10-11 (rehberler)
- Çıktı: deney başına rehber (malzeme listesi, şema, adımlar, beklenen sonuç, simülatör sahnesi), BOM, sorun giderme.
- Bitti ölçütü: biri sıfırdan rehberi takip edip 1. deneyden yılan oyununa ulaşabilir.
- Sonuç: `kit/` 14 deney rehberi (13'ü yılana giden yol, 14. isteğe bağlı kendin yap bellek kartı); malzeme ve bacak bacak bağlantı tabloları kart tanımlarından üretilir (`npm run cpu16 -- kit`, testler güncelliğini denetler). BIOS'tan önceki deneylerin deneme programları (`kit/programlar/`) EEPROM'dan çalışır ve simülatörde `machine --rom [--led]` ile denenir. Bitti ölçütünün ikinci yarısı (biri sıfırdan kurup yılana ulaşır) gerçek kurulumla sınanacak.

## Depo düzeni

```
cpu16/
  docs/          spec, yol haritası, mikromimari, parçalar, kartlar, anakart, BIOS, cc16, üretim
  emu/           referans emülatör (Faz 1) ve anakart modeli Machine (Faz 6)
  asm/           as16 assembler (Faz 1)
  micro/         mikrokod kaynağı, mikrokod derleyicisi, saat döngüsü modeli (Faz 2)
  chips/         74HC parça kütüphanesi: kapı modeli, transistör açılımı, KiCad sembolü (Faz 3)
  board/         kartlar kod olarak: CPU, saat, bellek, önbellek, G/Ç, video, kendin yap bellek, programlayıcı;
                 ERC, zamanlama analizi, KiCad çıktısı (Faz 4, 6, 9)
  kicad/         üretilen KiCad şemaları ve BOM'lar, kart başına klasör
  bios/          BIOS, önyükleyici, kart testi, örnek programlar (Faz 7)
  video/         karakter ROM'u (8 × 16 font)
  cc/ lib/       cc16 C derleyicisi; crt0, rt, libc16 (Faz 8)
  programlayici/ Arduino EEPROM (28C256) programlayıcısı ve yaz.py (Faz 9)
  kit/           deney rehberleri ve deneme programları (Faz 10)
  kurulum/       kurulum belgeleri: tel listesi, çip kartları, el kitabı (HTML + PDF, Faz 9)
  programs/      örnek assembly programları
  tools/         npm run cpu16 komutları
  tests/         vitest testleri
src/cpu16/       Silikon3D içindeki CPU16 bölümleri: tezgâh, Web IDE (anakart + BIOS), Web Serial
```

Silikon3D'nin 3D kart görünümü `src/board3d/` altındadır; CPU16 kodunu (`cpu16/`) doğrudan kullanır.
