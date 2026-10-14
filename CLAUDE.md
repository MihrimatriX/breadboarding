# CLAUDE.md: breadboarding

Claude Code bu dosyayı her oturumun başında okur; alt klasörlerdeki `CLAUDE.md`'ler o klasörde
çalışırken eklenir ([cpu16/](cpu16/CLAUDE.md), [hesap8/](hesap8/CLAUDE.md), [src/](src/CLAUDE.md)).
Burası kısa bir dizin: nerede ne var, nasıl doğrulanır, hangi kurallar çiğnenmez. Ayrıntı belgelerde.
Yeni bir klasör, komut ya da kural eklenince bu dosyayı da güncelle; kısa kalsın.

## Depo ne

- **Silikon3D** (`src/`): Vite + React 18 + react-three-fiber + zustand web uygulaması. Altı bölüm:
  6502 die (`#6502`), CPU16 tezgâhı (`#cpu16`), CPU16 kartı 3D (`#kart`), 8 bit hesap 3D (`#hesap`),
  Mimari (`#mimari`), Belgeler (`#belgeler`: depodaki markdown belgeleri uygulamanın içinde).
- **CPU16** (`cpu16/`): yaygın 74HC entegrelerinden kurulan kendi 16 bit bilgisayarımız, baştan sona kod
  olarak: komut seti, emülatör, mikrokod, kapı seviyesi kartlar, KiCad, C derleyicisi, BIOS, deney seti,
  PCB ve breadboard kurulum belgeleri.
- **hesap8** (`hesap8/`): 74HC'den 8 bit dört işlem hesap makinesi; CPU16'nın parça kütüphanesini ve
  breadboard motorunu kullanır.
- Sahibi AFU: PR'ları o inceler ve birleştirir. Yorumlar ve commit'ler Türkçe. Arayüz iki dilli
  (Türkçe + İngilizce, `L` kısayolu; metinler `src/ui/ceviri.ts` ile çift yazılır). Belgelerin asıl hâli
  Türkçe, İngilizcesi yanında (`spec.md` → `spec.en.md`); Türkçe belge değişince İngilizcesi de güncellenir.
- Şu an nerede olduğumuz: [roadmap.md](cpu16/docs/roadmap.md)'nin en üstündeki "Şu an" satırı.

## Klasör haritası

| Klasör | İçerik |
|---|---|
| `src/` | Silikon3D: `board3d/` kartların 3D'si, `cpu16/` tezgâh ve Web IDE, `mimari/` blok diyagramları, `belgeler/` uygulama içi belgeler, `chip/ sim/ render/` 6502 die, `ui/ state/` kabuk ve depo |
| `cpu16/emu/` | **altın model**: referans emülatör (`cpu.ts`) ve bütün bilgisayar (`machine.ts`) |
| `cpu16/micro/`, `chips/`, `board/` | mikrokod; 74HC parça kütüphanesi; kartlar kod olarak (şema = kod), ERC, zamanlama |
| `cpu16/breadboard/`, `board/breadboard/` | CPU16 panoları ve üretilmiş verileri (`veri/`); ortak breadboard motoru |
| `cpu16/kicad/` | üretilen KiCad şemaları ve BOM'lar (elle düzenlenmez) |
| `cpu16/asm/ cc/ lib/ bios/ programs/` | as16, cc16 C derleyicisi, libc16, BIOS, örnek programlar |
| `cpu16/kit/ kurulum/ mimari/` | 14 deneylik deney seti; kurulum belgesi üreteci; mimari diyagramları |
| `cpu16/tools/cli.ts` | `npm run cpu16 -- <komut>`: bütün komutlar dosyanın başında |
| `hesap8/` | hesap makinesi: `kart.ts` devre, `model.ts` altın model, `arac.ts` komutlar, `breadboard/` |
| `tests/`, `cpu16/tests/`, `hesap8/tests/` | vitest testleri (6502, CPU16, hesap8) |
| `scripts/` | `import-visual6502.mjs`, `kontrast.mjs` (tema renklerinin WCAG denetimi) |

Daha uzun harita: [README, Proje yapısı](README.md#proje-yapısı), [cpu16/README.md](cpu16/README.md#klasörler).

## Komutlar

```bash
npm ci && npm run dev                          # http://localhost:5173
npx tsc -b                                     # tip denetimi (kullanılmayan değişken de hata)
npx vitest run                                 # bütün testler: 760 test, ≈ 1 dakika
npx vitest run cpu16/tests/emu.test.ts -t "ad" # tek dosya, adı eşleşen testler
npm run build                                  # üretim derlemesi (CI de koşar); SITE_URL=https://… ile
                                               # kanonik adresler ve sitemap.xml (src/seo.ts)
npm run kontrast                               # tema renk karşıtlığı (arayüz rengi değişince)
npm run cpu16 -- board                         # çip sayıları ve ERC ("ERC: sorun yok")
npm run cpu16 -- zamanlama --anakart [--tip]   # statik zamanlama, hedef 1 MHz
npm run cpu16 -- breadboard                    # panolar, besleme, netlistle birebir doğrulama
npm run hesap8 -- dogrula [--hepsi]            # hesap makinesi altın modelle (--hepsi: 262 144 durum)
npm run cpu16 -- machine x.s --cycles N < /dev/null   # bütün bilgisayar komut satırında
```

## Push'tan önce

1. `npx tsc -b`, `npx vitest run`, `npm run build` temiz.
2. Kart, çip, mikrokod ya da deney tanımı değiştiyse aşağıdaki üretilen dosyaları yenile; testler eski
   kalanı yakalar. `npm run cpu16 -- board` ERC temiz; zamanlama değiştiyse
   [uretim.md](cpu16/docs/uretim.md)'deki tabloyu güncelle.
3. Arayüz değiştiyse `npm run kontrast` çalıştır, tarayıcıda bak (Playwright, aşağıdaki tuzaklar).
4. Belgelerdeki sayılar (çip, tel, board, test) koddan gelir: komutun çıktısıyla güncelle.

## Üretilen dosyalar: elle değiştirme, komutla yenile

| Değişen | Komut | Yenilenen |
|---|---|---|
| kart tanımı (`cpu16/board/`, `cpu16/chips/`, `hesap8/kart.ts`) | `npm run cpu16 -- board kicad` | `cpu16/kicad/**` |
| yeni çip ya da pasif | `npm run cpu16 -- kicad-sym` | `cpu16/kicad/cpu16.kicad_sym` |
| `cpu16/micro/cpu16.ucode` | `npm run cpu16 -- kontrol` | `cpu16/micro/cpu16-ucode.ts` |
| kart tanımı, `cpu16/kit/deneyler.ts` | `npm run cpu16 -- kit` | `cpu16/kit/deney-*.md` otomatik bölümleri, `kit/gorseller/` |
| kart tanımı, diyagram yerleşimi, tema renkleri | `npm run cpu16 -- mimari` | `cpu16/docs/img/mimari-*.svg`, `hesap8/docs/img/mimari-hesap.svg` (İngilizceleri `*.en.svg`) |
| bir CPU16 kartının netlisti ya da pano tanımı | `npm run cpu16 -- breadboard --uret <kart>` (CPU ≈ 2,5 dakika) | `cpu16/breadboard/veri/<kart>.ts` |
| hesap8 netlisti ya da yerleşimi | `npm run hesap8 -- breadboard --uret` | `hesap8/breadboard/veri.ts` |
| `src/seo.ts` sayfa başlığı, yeni bölüm | `npm run dev` → `/scripts/og-gorselleri.html` | `public/og/*.png`, simgeler |

Breadboard verisi netlistin parmak izini taşır: devre değişip veri eskirse plan kurulmaz ve
`breadboard.test.ts` kırmızı yanar. Kurulum ve breadboard belgelerinin HTML/PDF çıktıları depoya girmez
(`kurulum/cikti/`, `breadboard/cikti/`). Tam tablo: [CONTRIBUTING.md](CONTRIBUTING.md#üretilen-dosyalar).

## Çiğnenmeyen kurallar

1. **Yalnız yaygın, basit 74HC mantık çipleri.** Tek istisna bellek (62256 RAM, 28C256 EEPROM).
   Karmaşık çip yok, CPU kartında ROM yok: kontrol birimi kapılarla kurulur (AFU kararı). Yeni çip
   birden fazla üreticisi olan yaygın bir parça olmalı ([parcalar.md](cpu16/docs/parcalar.md)).
2. **Şema = kod.** Devreler `cpu16/board/*.ts` ve `hesap8/kart.ts`'te; 3D, KiCad, BOM, deney rehberleri,
   kurulum ve breadboard belgeleri bunlardan üretilir. Elle tutulan liste yok.
3. **Altın model.** Davranış önce `cpu16/emu/` ve [isa-ayrintilari.md](cpu16/docs/isa-ayrintilari.md)'de
   değişir; mikrokod, kapı seviyesi kartlar ve gerçek kart emülatörle adım adım (lockstep) aynı kalır.
   hesap8'de altın model `hesap8/model.ts`. Spec değişikliği önce ayrı bir PR'dır.
4. **Referanslar sabit kalır.** Yeni parça ve netler sona eklenir: deney rehberleri, numaralı kurulum
   telleri, 3D ve breadboard verisi U/R/C numaralarına dayanır. Kartın aralığı dolarsa `CARD_REF_TASMA`;
   öbür kartlara dokunmaması gereken eklemeler `Board.sonaErtele()` ile (`cpu16/board/board.ts`).
5. **"Bitti" = test geçti.** Yeni davranış yeni bir testle gelir.
6. **Kod biçimi:** `strict` TypeScript; `cpu16/` ve `hesap8/` Node'da `--experimental-strip-types` ile
   koşar, `.ts` uzantılı import ve yalnız tip silen sözdizimi (`enum`, `namespace`, parametre özelliği
   yok). Hesap ve çizim mantığı bileşen dışında, testli saf fonksiyonlarda. Dosya başında ne yaptığını
   anlatan yorum. Bağımlılık sürümleri tam sabit (`^` yok). Değiştirdiğin dosyanın diline uy.

## Dal ve PR akışı

- `main`'e doğrudan push yok. Bir iş bir dal, sonunda tek PR; AFU işi tek seferde bitmiş ve tam testli
  ister, ara aşamalarda onay beklenmez. Gerçek bir tasarım çatalı varsa sorulur.
- Commit: Türkçe, `Konu: ne değişti`. PR açıklaması Türkçe: **Önce / Sonra / Nasıl / Doğrulama**.
- Birleştirilmiş PR'ın dalına yeni iş eklenmez: dalı `origin/main`'den yeniden başlat, yeni PR aç.
  PR'ları üst üste yığma (alttaki birleşince üstteki silinmiş dala düşer).
- CI (`.github/workflows/ci.yml`): `npm ci`, `npm test`, `npm run build` ve Docker imajı.

## Bilinen tuzaklar

- `npm run cpu16 -- machine` stdin'i bekler: komutun sonuna `< /dev/null` ekle.
- `node_modules` içine hiçbir şey yazma. İç içe bir `node_modules/node_modules` bağlantısı
  react-three-fiber'ı iki kez paketler; 3D görünüm "R3F: Hooks can only be used within the Canvas"
  hatasıyla boş kalır.
- Bütün bölümler hep bağlı (gizlenenler de): Playwright'ta `:visible` seçici kullan, yoksa gizli
  bölümdeki eş öğe eşleşir.
- Başsız tarayıcıda WebGL yavaş (swiftshader); 3D'deki kapı seviyesi simülasyon saniyede birkaç bin
  çevrim koşar, UART ve VGA çıktısını beklerken bol zaman ver. `vite preview` sunucusunu PID'iyle durdur.
- `kicad-cli`, `g++`, `python3`, `playwright` yoksa bazı testler atlanır (Docker'da 16 test).
- 6502 die verisi (visual6502) CC BY-NC-SA 3.0: ticari olmayan kullanım.

## Nereden okumalı

[README.md](README.md) (genel bakış, komutlar) · [docs/README.md](docs/README.md) (okuma yolu, "hangi soru
hangi belgede") · [CONTRIBUTING.md](CONTRIBUTING.md) (kurallar, sık yapılan işler: yeni çip, kart,
program) · [cpu16/README.md](cpu16/README.md) · [spec.md](cpu16/docs/spec.md) ·
[breadboard.md](cpu16/docs/breadboard.md) · [3d-gorunum.md](cpu16/docs/3d-gorunum.md) (konsol API'si) ·
[hesap8/README.md](hesap8/README.md)
