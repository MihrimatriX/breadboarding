# CLAUDE.md: cpu16/

Kök [CLAUDE.md](../CLAUDE.md)'deki kurallar burada da geçerli (74HC kuralı, şema = kod, altın model,
referanslar sabit). Bu dosya CPU16'nın katmanlarını ve bir değişikliğin hangi dosyalara dokunduğunu
söyler. Genel bakış: [README.md](README.md); yol haritası ve "Şu an": [docs/roadmap.md](docs/roadmap.md).

## Katmanlar (üstten alta)

1. **Tasarım:** [docs/spec.md](docs/spec.md) (karar), [docs/isa-ayrintilari.md](docs/isa-ayrintilari.md)
   (her komutun ayrıntısı).
2. **Altın model:** `emu/cpu.ts` (komut seviyesi), `emu/machine.ts` (bütün bilgisayar: bellek haritası,
   bank'lar, G/Ç), `emu/devices/` (EEPROM, önbellek, video, UART …).
3. **Mikrokod:** `micro/cpu16.ucode` (tek kaynak), `microasm.ts`, `datapath.ts` (saat döngüsü modeli).
4. **Parçalar:** `chips/parts/*.ts` (kapı devresi + veri sayfası tablosu), `chips/library.ts`,
   `chips/logic.ts` (kapı seviyesi simülatör), `chips/cmos.ts` (transistör açılımı).
5. **Kartlar:** `board/<ad>-card.ts`, `Board` API'si `board/board.ts`. Kontrol birimi
   `board/kontrol.ts`'te mikrokoddan 74HC devresine çevrilir (ROM yok). Bütün bilgisayar
   `board/machine-board.ts`; zamanlama `board/zamanlama.ts`; bölüm metinleri `board/bolum-metin.ts`
   (okuyan: `bolum-bilgi.ts`).
6. **Çıktılar:** `kicad/` (üretilir), `kit/` (deney rehberleri), `kurulum/` (PCB kurulum belgeleri),
   `breadboard/` (panolar), `mimari/` (blok diyagramları). Hepsi kart tanımından okur.

Yazılım tarafı: `asm/` (as16), `cc/` + `lib/` (cc16, libc16), `bios/`, `programs/`, `video/` (karakter
ROM'u), `programlayici/` (Arduino EEPROM programlayıcısı), `tools/` (komut satırı).

## Ne değişirse nereye dokunulur

| Değişiklik | Önce | Sonra çalıştır |
|---|---|---|
| bir komutun davranışı | `emu/cpu.ts` + `isa-ayrintilari.md`, sonra `micro/cpu16.ucode` | `cpu16 -- kontrol`, `board kicad`, `kit`, lockstep testleri (`micro`, `machine`, `board`) |
| bir kartın devresi | `board/<ad>-card.ts` | `board` (ERC), `board kicad`, `kit`, `mimari`, `breadboard --uret <kart>`, `zamanlama --anakart` |
| yeni çip | `chips/parts/<ad>.ts`, `chips/library.ts` | `kicad-sym`, `npx vitest run cpu16/tests/chips.test.ts` |
| yeni kart | [CONTRIBUTING.md](../CONTRIBUTING.md#yeni-bir-kart-eklemek-cpu16-anakartı) adımları: `FULL_MACHINE_CARDS`, `KICAD_CARDS`, `CARD_TITLES`, `KURULUM_KARTLARI`, `CARD_REF_BASE` | yukarıdakiler + emülatörle karşılaştıran test |
| breadboard pano düzeni | `breadboard/panolar.ts` (`PANOLAR`: ızgara, `duzen`, bölgeler, aşamalar, `ekBesleme`), `breadboard/yerlesim.ts` | `breadboard --uret <kart>`, `breadboard`, belgelerdeki sayılar |
| bölge ya da grup metni | `board/bolum-metin.ts` | `bolum-bilgi`, `bolum-belge` testleri |
| örnek program | CONTRIBUTING'deki tablo (`programs/`, `bios/ornekler/`, `kit/programlar/`) | ilgili test |

Komutların hepsi `npm run cpu16 -- …`; tam liste `tools/cli.ts`'in başında.

## Bilmen gerekenler

- **Referans numaraları:** her kartın bir aralığı var (`CARD_REF_BASE`: CPU U1–U199, saat U201 …).
  CPU'nun aralığı doldu, taşanlar U901'den (`CARD_REF_TASMA`). Hata ayıklama LED'leri ve çubuk
  göstergeler `cpu-card.ts`'te `b.sonaErtele(...)` içinde en sona eklenir; böylece öbür kartların
  netleri ve breadboard verileri değişmez. Yeni gösterge: `b.led(net, ad, { aktifDusuk, direnc, gorev })`,
  `b.cubuk(sinyaller, ad, gorev)`.
- **Breadboard boru hattı:** netlist → `breadboard/yerlesim.ts` (projeye özgü; tavlama ortak motorda) →
  `board/breadboard/yonlendirme.ts` (A*, dik açılı teller) → `breadboard/veri/<kart>.ts` (parmak izli)
  → `breadboard/plan.ts` → `board/breadboard/dogrulama.ts` (yalnız fiziksel modelden union-find,
  netlistle birebir). Ortak motor `board/breadboard/` hesap8 ile paylaşılır: oradaki bir değişiklik
  hesap8'in testlerini de koşturmalı.
- **Pano düzeni:** `duzen` her board'a tek bir iş verir; `grup+` belirteci o grubun göstergelerini
  taşıyan board'u gösterir. Board'lar modül adaları halinde, aralarında boşluk var (`kafesKonumu`).
- **Zamanlama:** gerçek hedef 1 MHz; `zamanlama --anakart` ve `--tip` sonuçları
  [docs/uretim.md](docs/uretim.md)'de tabloda.
- **Belgelerdeki sayılar** (çip, tel, board, akım) komut çıktısından: `board`, `breadboard`,
  `kurulum hepsi`. [docs/breadboard.md](docs/breadboard.md) ve [docs/kartlar.md](docs/kartlar.md) bunları
  tablolarda tutar.
- Kurulum ve breadboard belgelerinin PDF'i için `playwright` + Chromium, şema PDF'leri için `kicad-cli`
  gerekir; yoksa yalnız HTML yazılır.
