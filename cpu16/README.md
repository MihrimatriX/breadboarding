# CPU16

Tamamen 74HC entegrelerinden kurulan, kendi komut seti, kendi C derleyicisi ve 3D'de transistörüne
kadar incelenebilen bir 16 bit bilgisayar. Aynı zamanda bir eğitim ve deney seti: 14 deneyde, saat
kartından başlayıp C ile yazılmış yılan oyununa kadar breadboard'da kurulur. Bitmiş bilgisayarın iki
yolu var: PCB'li (kartlar KiCad'den) ya da bütünüyle breadboard'lı (kart başına bir pano, 149 board,
kartlar arası şerit kablo; [docs/breadboard.md](docs/breadboard.md)).

- **Şu anki aşama:** simülasyon tarafı bitti, sıradaki iş gerçek kartlar. Ayrıntı: [docs/roadmap.md](docs/roadmap.md).
- **Deney seti:** [kit/README.md](kit/README.md) (13 deney yılan oyununa gider, 14. isteğe bağlı
  kendin yap bellek kartı).
- **Belgeleri sırayla okumak için:** [okuma yolu](../docs/README.md#yol-a-cpu16yı-anlamak).

## Bir bakışta

| | |
|---|---|
| İşlemci | 16 bit, 8 register (`r6` = SP, `r7` = LR), sabit 16 bit komutlar, NZCV bayrakları, byte adresli 64 KB, `0xFF00–0xFFFF` bellek eşlemeli G/Ç. Donanım çarpma/bölme ve barrel shifter yok (yazılımda). |
| Kontrol | Mikrokod (`micro/cpu16.ucode`, 32 bitlik kontrol kelimesi), ROM'da değil 74HC kapılarıyla kurulu (`board/kontrol.ts` üretir). Komut başına ortalama ≈ 5 saat döngüsü. |
| CPU kartı | 210 entegre: register dosyası, ALU (4 × 74HC283), PC, MAR, IR, bayraklar, kontrol birimi; hata ayıklama için 39 LED ve 26 çubuk gösterge, register'ların içeriği dahil ([kartlar.md](docs/kartlar.md)) |
| Anakart | CPU + 6 kart, toplam 460 entegre: saat ve reset (10), bellek (34: 32 KB EEPROM + 128 KB RAM, bank register'ları), önbellek (46: 2 KB, bekleme durumları, sayaçlar), G/Ç (65: UART, PS/2, zamanlayıcı, kesmeler), video (73: VGA 640 × 480, 80 × 30 metin, 16 renk), kendin yap bellek (22: 16 bayt, eğitim kartı) |
| Parçalar | yalnız yaygın 7400 serisi lojik ve iki bellek çipi (62256 SRAM, 28C256 EEPROM) |
| Yazılım | as16 assembler, cc16 C derleyicisi ve libc16, BIOS (monitör, Intel HEX önyükleyici), Web IDE |
| Hız | ilk gerçek kart hedefi 1 MHz (8 MHz osilatör); simülasyonda anakart modeli 4 MHz sayar |

**Altın model:** `emu/` altındaki emülatör doğrunun tanımı. Mikrokod modeli, kapı seviyesindeki
kartlar ve gerçek kartlar aynı programları çalıştırıp emülatörle adım adım aynı sonucu vermek zorunda;
testler bunu her komutta denetler.

**Şema = kod:** kartlar `board/*.ts`'te kodla tanımlı. Kapı seviyesi simülasyon, Silikon3D'deki 3D
görünüm, KiCad şemaları (`kicad/`), BOM, deney rehberlerinin bağlantı tabloları ve kurulum belgeleri
bu tanımdan üretilir.

## Belgeler

| Konu | Belge |
|---|---|
| Yol haritası, fazlar, projenin kuralları | [roadmap.md](docs/roadmap.md) |
| Tasarım, komut seti, bellek haritası | [spec.md](docs/spec.md), [isa-ayrintilari.md](docs/isa-ayrintilari.md) |
| Assembler | [as16.md](docs/as16.md) |
| Mikromimari ve mikrokod | [mikromimari.md](docs/mikromimari.md) |
| 74HC parça kütüphanesi | [parcalar.md](docs/parcalar.md) |
| Kartlar (şema = kod, KiCad, ERC) | [kartlar.md](docs/kartlar.md) |
| Mimari (blok) diyagramları: CPU kartı, bütün bilgisayar | [mimari.md](docs/mimari.md) |
| 3D kart görünümü | [3d-gorunum.md](docs/3d-gorunum.md) |
| Anakart: bellek, önbellek, G/Ç, video (model ve register haritası) | [anakart.md](docs/anakart.md) |
| Anakart kartları kapı seviyesinde | [anakart-kartlari.md](docs/anakart-kartlari.md) (saat, bellek, önbellek), [anakart-gc-video.md](docs/anakart-gc-video.md) (G/Ç, video) |
| BIOS, monitör, önyükleyici | [bios.md](docs/bios.md) |
| C derleyicisi | [cc16.md](docs/cc16.md) |
| C örnekleri: rehberli tur, CPU16'da C yazarken bilinmesi gerekenler | [c-ornekleri.md](docs/c-ornekleri.md) |
| Üretim, zamanlama, kart testi | [uretim.md](docs/uretim.md) |
| Kurulum belgeleri: tel listesi, çip kartları, el kitabı | [kurulum.md](docs/kurulum.md) |
| Bütün bilgisayar breadboard'da: panolar, şerit kablo, delikten deliğe teller | [breadboard.md](docs/breadboard.md) |
| Deney seti | [kit/README.md](kit/README.md), [LED, direnç ve kondansatör](kit/led-ve-direnc.md) |

## Komutlar

Hepsi depo kökünden çalışır (Docker'da `npm run` yerine `docker compose run --rm cli`).

```sh
# programlar
npm run cpu16 -- run cpu16/programs/hello.s          # derle, referans emülatörde çalıştır (--trace: komut komut)
npm run cpu16 -- asm cpu16/programs/fib.s -o fib.bin --list   # as16: .bin ya da Intel HEX (.hex), listeleme
npm run cpu16 -- dis fib.bin                         # ikili dosyayı geri çevir
npm run cpu16 -- cc cpu16/programs/c/hello.c --run   # C derle, emülatörde çalıştır
npm run cpu16 -- cc --hedef bios cpu16/bios/ornekler/yilan.c -o yilan.s   # C → BIOS üzerinde çalışan assembly
npm run cpu16 -- cc cpu16/bios/ornekler/selam.c --hedef bios --run        # anakart modelinde: BIOS + G 4000

# anakart ve EEPROM imajları
npm run cpu16 -- machine                             # anakart + BIOS, UART terminale bağlı (çıkış: Ctrl-])
npm run cpu16 -- machine program.s                   # programı önyükleyiciyle RAM'e yükle ve çalıştır (.c de olur)
npm run cpu16 -- cc --hedef bios cpu16/bios/ornekler/kalbur.c --run        # C örneği anakart + BIOS'ta
npm run cpu16 -- machine cpu16/kit/programlar/bellek-deneme.s --rom --led # BIOS'suz deneme programı, FF00 LED'leri
npm run cpu16 -- bios -o bios.bin                    # 32 KB 28C256 imajı (bios.hex: yalnız BIOS baytları)
npm run cpu16 -- charrom -o charrom.bin              # video kartının karakter ROM'u

# donanım
npm run cpu16 -- chips                               # parça kütüphanesi: kapı ve transistör sayıları
npm run cpu16 -- board                               # kartların çip sayıları ve ERC
npm run cpu16 -- board kicad                         # KiCad şemalarını, sembolleri ve BOM'ları yeniden üret
npm run cpu16 -- ucode cpu16/micro/cpu16.ucode       # mikrokodu derle, yordamların döngü sayıları
npm run cpu16 -- kontrol                             # mikrokod değişince: kontrol birimini (74HC kapıları) yeniden üret ve denetle
npm run cpu16 -- zamanlama --anakart                 # şemadan statik zamanlama analizi

# deney seti, kurulum, gerçek kart
npm run cpu16 -- kit                                 # deney rehberlerinin otomatik bölümlerini üret
npm run cpu16 -- kurulum hepsi                       # kurulum belgeleri (HTML + PDF): tel listesi, çip kartları, el kitabı
npm run cpu16 -- breadboard                          # breadboard panoları: ölçüler, besleme, bağlantının netlistle doğrulanması
npm run cpu16 -- breadboard-belge hepsi              # breadboard kurulum belgeleri (HTML + PDF): kart başına pano + dizin
npm run cpu16 -- mimari [cpu|makine|hesap|hepsi] [-o dizin]   # blok diyagramları SVG (dizinsiz: docs/img/ ve hesap8/docs/img/)
npm run cpu16 -- kart-testi --port /dev/ttyUSB0      # gerçek kartı UART üzerinden simülatörle karşılaştır

npx vitest run cpu16                                 # CPU16 testleri
```

Komutların bütün seçenekleri `tools/cli.ts`, `tools/cc.ts`, `tools/hw.ts` ve `tools/machine-cli.ts`
dosyalarının başındaki yorumlarda.

## Klasörler

| Klasör | İçerik |
|---|---|
| `docs/` | tasarım belgeleri (yukarıdaki tablo) |
| `emu/` | referans emülatör (`cpu.ts`, altın model), disassembler, anakart modeli `Machine` ve aygıtları |
| `asm/` | as16 assembler, Intel HEX |
| `micro/` | mikrokod kaynağı (`cpu16.ucode`), mikrokod derleyicisi, saat döngüsü modeli; `cpu16-ucode.ts` üretilir |
| `chips/` | 74HC parça kütüphanesi: kapı modeli, veri sayfası tablosu, CMOS transistör açılımı, KiCad sembolü; kapı seviyesi simülatör `logic.ts` |
| `board/` | kartlar kod olarak: CPU, saat, bellek, önbellek, G/Ç, video, kendin yap bellek, programlayıcı; ERC, zamanlama analizi, yerleşim, KiCad çıktısı |
| `kicad/` | üretilen KiCad projeleri ve BOM'lar, kart başına klasör (`hesap/`: 8 bit hesap makinesi); elle düzenlenmez |
| `bios/` | BIOS (`bios.s`), imaj, önyükleyici istemcisi, kart testi; `ornekler/` BIOS üzerinde çalışan programlar, `testler/` kart testi programları |
| `cc/`, `lib/` | cc16 C derleyicisi; crt0, rt, libc16 ve başlıklar (`lib/include/`), BIOS hedefi (`lib/hedef/bios/`) |
| `programs/` | düz bellekte çalışan örnekler: assembly (hello, fib, add32, bubble, irq), `merhaba.c`; `c/` altında cc16 örnekleri |
| `kit/` | deney rehberleri, görseller, BIOS'tan önceki deneylerin programları (`programlar/`) |
| `kurulum/` | kurulum belgesi üreteci; çıktı `kurulum/cikti/` (depoya girmez) |
| `mimari/` | mimari (blok) diyagramları: yerleşim (`cpu.ts`, `makine.ts`; hesap makinesi `hesap8/mimari.ts`), devreden içerik ve netlist denetimi (`model.ts`, `denetim.ts`), çizim (`cizim.ts`, `agac.ts`), SVG ve belge sayfası |
| `breadboard/` | breadboard panoları (yerleşim, teller, şerit kablo, besleme), üretilmiş veri (`veri/`), belge üreteci; çıktı `breadboard/cikti/` (depoya girmez). Ortak motor `board/breadboard/` |
| `programlayici/` | Arduino Nano + 2 × 74HC595 EEPROM programlayıcısı (`.ino`) ve `yaz.py` |
| `video/` | karakter ROM'u (8 × 16 font) |
| `tools/` | `npm run cpu16` komutları |
| `tests/` | vitest testleri |

Silikon3D içindeki CPU16 bölümleri `src/cpu16/` (tezgâh, Web IDE, Web Serial), `src/board3d/`
(kart 3D görünümü) ve `src/mimari/` (blok diyagramları) altında; hepsi bu klasördeki kodu doğrudan
kullanır.
