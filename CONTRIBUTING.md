# Katkı rehberi

Bu depoya katkıda bulunmak isteyen herkes için: ortamı kurmak, değişikliği PR olarak göndermek, depodaki
kurallar ve sık yapılan işlerin (yeni çip, kart, örnek program) adımları. Projeye yeniysen önce
[README](README.md)'yi ve [belgelerin okuma yolunu](docs/README.md) oku.

## Ortam

**npm ile** (Node 22, `.nvmrc`; `cpu16` ve `hesap8` komutları için en az 22.6):

```bash
git clone https://github.com/MihrimatriX/breadboarding
cd breadboarding
nvm use
npm ci
npm run dev        # http://localhost:5173
npm run check      # tip denetimi + testler
```

**Docker ile** (Node gerekmez):

```bash
docker compose up dev                 # http://localhost:5173, dosyayı kaydedince tarayıcı güncellenir
docker compose run --rm cli check     # tip denetimi + testler
docker compose run --rm cli cpu16 -- board
```

Linux'ta kullanıcı kimliğin 1000 değilse komutların başına `DOCKER_USER="$(id -u):$(id -g)"` ekle.
Ayrıntılar: [README, Docker ile](README.md#docker-ile).

İsteğe bağlı araçlar ek testleri açar (yoksa o testler atlanır): KiCad 7+ (`kicad-cli`: şemaların
netlist'i ve şema PDF'leri), `g++` ve `python3` (EEPROM programlayıcısı), `playwright` + Chromium
(kurulum belgelerinin PDF'i).

## Dal ve PR akışı

1. `main`'den kısa ömürlü bir dal aç: `git switch -c hesap8-bolme-hizi`. Bir dal tek bir konu.
2. Küçük, kendi başına anlamlı commit'ler at. Commit mesajları Türkçe ve depodaki biçimde:
   `Konu: ne değişti` (ör. `Hesap makinesi: çok sayfalı KiCad şeması, komut satırı aracı ve testler`,
   `Zamanlama: bütün anakartın analizi; 74AC ailesi seçeneği`).
3. Göndermeden önce:
   ```bash
   npm run check        # tsc -b + vitest (765 test, ≈ 1 dakika)
   npm run build        # üretim derlemesi
   ```
   Kart, mikrokod ya da deney tanımı değiştiyse önce üretilen dosyaları yenile
   ([aşağıda](#üretilen-dosyalar)); testler eski kalanları yakalar.
4. Dalı gönder, `main`'e PR aç. PR açıklamasına ne değiştiğini ve nasıl denediğini yaz; değişiklik
   ekran görüntüsü gerektiriyorsa görüntüyü de ekle.
5. CI (testler, derleme, Docker imajı) yeşil olmalı. **AFU inceler ve birleştirir**; `main`'e
   doğrudan push yok.

Spec'te ([spec.md](cpu16/docs/spec.md)) bir değişiklik gerekiyorsa önce yalnız spec'i değiştiren bir
PR açılır, kod sonra gelir ([yol haritası](cpu16/docs/roadmap.md), kural 4).

Hatalar ve istekler için GitHub'da **Issues > New issue** altındaki "Hata bildirimi" ve "Özellik
isteği" şablonları var.

## Kurallar

### Şema = kod

Devreler elle çizilmez. `cpu16/board/*.ts` (CPU16) ve `hesap8/kart.ts` (hesap makinesi) çipleri
yerleştirir ve pinlerini netlere bağlar; kapı seviyesi simülasyon, 3D görünüm, KiCad şeması, BOM, deney
rehberlerinin malzeme tabloları ve kurulum belgeleri bu tanımdan üretilir.

- `cpu16/kicad/` altındaki dosyalara elle dokunma: tanımı değiştir, `npm run cpu16 -- board kicad`
  ile yeniden üret. KiCad'de yalnız görsel düzenleme serbest; bağlantı değişikliği koda işlenmezse
  CI kırmızı yanar.
- Yeni bir parça ya da net kartta göründüğü an 3D görünüme, KiCad'e ve kurulum belgesine de girer.
  Elle tutulan bir liste yok.

### Altın model: her katman referans emülatörle aynı

`cpu16/emu/` (komut seviyesi emülatör ve anakart modeli `Machine`) doğrunun tanımıdır. Mikrokod
modeli (`cpu16/micro/`), kapı seviyesi kartlar (`cpu16/board/`) ve gerçek kartlar aynı programları
çalıştırıp emülatörle adım adım (lockstep) aynı sonucu vermek zorunda.

- Davranışı değiştiren bir değişiklik önce emülatörde ve [isa-ayrintilari.md](cpu16/docs/isa-ayrintilari.md)'de
  yapılır, sonra alttaki katmanlar ona uydurulur. Emülatörle belge çelişirse ikisi birlikte düzeltilir.
- Bir hata bulduğunda farkın ilk göründüğü katmanda ara: lockstep testleri bunu söyler.
- hesap8'de altın model `hesap8/model.ts`; devre her durumda onunla aynı olmalı
  (`npm run hesap8 -- dogrula --hepsi`).

### "Bitti" = test

Bir iş testi geçince biter. Yeni davranış yeni bir testle gelir; testler dosyanın konusuna göre
`cpu16/tests/`, `hesap8/tests/` ya da `tests/` (6502) altında. Bazı testler depodaki üretilmiş
dosyaların güncel olduğunu da denetler (KiCad, sembol kütüphanesi, mikrokodun gömülü kopyası, deney
rehberleri).

### Kod biçimi

- **Dil:** yorumlar ve commit mesajları Türkçe. Arayüz metinleri iki dilli: `t("Durdur", "Stop")`
  (`src/ui/ceviri.ts`, ayrıntı `src/CLAUDE.md`). Belgelerin asıl hâli Türkçe, İngilizcesi yanında
  (`spec.md` → `spec.en.md`); Türkçe belgeyi değiştirince İngilizcesini de güncelle. Yeni kodda tanımlayıcılar
  da çoğunlukla Türkçe (`kurulumPlani`, `buildKybCard`'daki `b.block = "Adres çözme"`, `HesapSim`,
  `sinyalSinifi`); eski kısımlarda (6502 tarafı, emülatörün çekirdeği) İngilizce. Değiştirdiğin
  dosyanın diline uy, bir dosyanın içinde dili karıştırma.
- **Dosya başı yorumu:** dosyanın ne yaptığını, onu kimin çağırdığını ve ilgili belgeyi anlatan
  birkaç satır (ör. `cpu16/board/kyb-card.ts`, `cpu16/tools/cli.ts`). Üretilen dosyaların başında
  "elle değiştirme" ve onu üreten komut yazar.
- **TypeScript:** `strict`, kullanılmayan değişken ve parametre yok (`tsc -b` hata verir). Node'da
  çalışan kod (`cpu16/`, `hesap8/`) `.ts` uzantılı import'larla yazılır ve doğrudan
  `node --experimental-strip-types` ile koşar; bu yüzden yalnız tip silmeyle çalışan sözdizimi kullan
  (`enum`, `namespace`, parametre özellikleri yok).
- **Saf fonksiyonlar:** hesap ve çizim mantığı React bileşenlerinin dışında, testli saf fonksiyonlarda
  durur (ör. `src/board3d/wires.ts`, `screen.ts`, `cpu16/kurulum/plan.ts`).
- **Biçim:** 2 boşluk girinti (C ve Python 4), LF, UTF-8; `.editorconfig` bunları editörüne söyler.
  Depoda otomatik biçimlendirici yok, çevredeki kodun biçimini izle.
- **Bağımlılıklar:** `package.json`'da sürümler tam sabit (`^` yok). Yeni bir bağımlılık gerekirse
  PR'da nedenini yaz; `package-lock.json` da commit'e girer.

## Sık yapılan işler

### Yeni bir çip eklemek

[parcalar.md](cpu16/docs/parcalar.md#yeni-çip-eklemek)'den özetle:

1. `cpu16/chips/parts/` altında bir `ChipDef` yaz: pin adları veri sayfası sırasıyla, kapı devresi
   (`build`), veri sayfasının fonksiyon tablosu (`ref`).
2. `cpu16/chips/library.ts` listesine ekle.
3. `npm run cpu16 -- kicad-sym` ile sembol kütüphanesini yenile, sonra
   `npx vitest run cpu16/tests/chips.test.ts` çalıştır: kapı = tablo ve transistör = kapı testleri
   yeni çip için kendiliğinden koşar.

Kütüphaneye yalnız yaygın, birden fazla üreticisi olan parçalar girer (AFU kararı, [spec.md](cpu16/docs/spec.md)).

### Yeni bir kart eklemek (CPU16 anakartı)

1. `cpu16/board/<ad>-card.ts`: `build<Ad>Card(b: Board)`; `b.card = "<ad>"`, bloklar için
   `b.block = "…"`, çipler `b.place("74HC138", { pin: "NET", … })`. Örnek olarak en küçük kart:
   `kyb-card.ts`.
2. Davranış modelini `cpu16/emu/machine.ts`'e (ya da `emu/devices/`) ekle: altın model önce gelir.
3. Kartı `cpu16/board/machine-board.ts` içindeki `FULL_MACHINE_CARDS` listesine ekle. Bütün anakart,
   zamanlama analizi ve 3D görünüm bu listeyi kullanır; kart 3D'de kendiliğinden görünür.
4. KiCad için `cpu16/board/kicad-files.ts` → `KICAD_CARDS`; başlık için `cpu16/board/layout.ts` →
   `CARD_TITLES`; kurulum belgesi için `cpu16/kurulum/kartlar.ts` → `KURULUM_KARTLARI`.
5. Kartı emülatörle karşılaştıran bir test yaz (örnekler: `cpu16/tests/anakart-gc.test.ts`,
   `anakart-bellek.test.ts`).
6. `npm run cpu16 -- board` (çip sayıları ve ERC), `npm run cpu16 -- board kicad`, deneylere girecekse
   `cpu16/kit/deneyler.ts` → `DENEYLER` ve `npm run cpu16 -- kit`. Belgelerde
   ([kartlar.md](cpu16/docs/kartlar.md), [anakart.md](cpu16/docs/anakart.md)) kartı anlat.

### Yeni bir örnek program eklemek

| Nereye | Ne için | Kendiliğinden göründüğü yer | Testi |
|---|---|---|---|
| `cpu16/programs/<ad>.s` | düz 64 KB bellekte çalışan assembly | CPU16 tezgâhı → Düz bellek örnekleri | `cpu16/tests/programs.test.ts` |
| `cpu16/programs/c/<ad>.c` | cc16'nın `rom` hedefi (`cc … --run`) | komut satırı | `cpu16/tests/cc.test.ts`, "örnek programlar" |
| `cpu16/bios/ornekler/<ad>.s` / `.c` | BIOS üzerinde çalışan program (`--hedef bios`, `G 4000`) | CPU16 tezgâhı → Anakart + BIOS örnekleri | `cpu16/tests/bios.test.ts` (asm), `cc-bios.test.ts` (C) |
| `cpu16/kit/programlar/<ad>.s` | BIOS'tan önceki deneylerin EEPROM programları (`machine --rom`) | CPU16 kartı 3D → Program örnekleri | `cpu16/tests/kit.test.ts` |

Programın başına ne yaptığını ve nasıl çalıştırılacağını anlatan bir yorum yaz; çıktısını testte
denetle. Yorumlu C örneklerinin biçimi için: [c-ornekleri.md](cpu16/docs/c-ornekleri.md).

### Bir deney rehberini değiştirmek

`cpu16/kit/deney-*.md` dosyalarında `<!-- otomatik: başla … -->` ile `<!-- otomatik: bitti -->`
arasındaki bölüm (malzeme ve bacak bacak bağlantılar) kart tanımlarından üretilir: oraya elle yazma,
`npm run cpu16 -- kit` çalıştır. İşaretlerin dışındaki metin serbest.

## Üretilen dosyalar

| Dosya | Üreten komut | Ne zaman | Depoda | Güncelliğini denetleyen |
|---|---|---|---|---|
| `cpu16/kicad/**` (şemalar, `cpu16.kicad_sym`, BOM'lar; `hesap/` dahil) | `npm run cpu16 -- board kicad` | `cpu16/board/`, `cpu16/chips/`, `hesap8/kart.ts` değişince | evet | `board.test.ts`, `chips.test.ts`, `hesap.test.ts` |
| `cpu16/kicad/cpu16.kicad_sym` (yalnız sembol kütüphanesi) | `npm run cpu16 -- kicad-sym` | çip ya da pasif eklenince | evet | `chips.test.ts` |
| `cpu16/micro/cpu16-ucode.ts` (mikrokodun gömülü kopyası) | `npm run cpu16 -- kontrol` | `cpu16/micro/cpu16.ucode` değişince | evet | `kontrol.test.ts` |
| `cpu16/kit/deney-*.md` otomatik bölümleri, `cpu16/kit/gorseller/*.svg` | `npm run cpu16 -- kit` | kart tanımı ya da `kit/deneyler.ts` değişince | evet | `kit.test.ts` |
| `cpu16/docs/img/mimari-*.svg`, `hesap8/docs/img/mimari-hesap.svg` (blok diyagramları) | `npm run cpu16 -- mimari` | kart tanımı, diyagram yerleşimi (`cpu16/mimari/`, `hesap8/mimari.ts`) ya da tema renkleri (`src/mimari/mimari.css`, `src/styles.css`) değişince | evet | `cpu16/tests/mimari.test.ts` |
| `cpu16/breadboard/veri/<kart>.ts` (breadboard yerleşimi ve teller, netlistin parmak iziyle) | `npm run cpu16 -- breadboard --uret [kart,…]` (CPU kartı ≈ 2,5 dakika) | kartın netlisti ya da pano tanımı (`cpu16/breadboard/panolar.ts`, `yerlesim.ts`) değişince | evet | `cpu16/tests/breadboard.test.ts` (parmak izi, netlistle birebir bağlantı) |
| `hesap8/breadboard/veri.ts` | `npm run hesap8 -- breadboard --uret` | `hesap8/kart.ts` ya da `hesap8/breadboard/yerlesim.ts` değişince | evet | `hesap8/tests/breadboard.test.ts` |
| `cpu16/breadboard/cikti/`, `hesap8/breadboard/cikti/` (breadboard kurulum belgeleri) | `npm run cpu16 -- breadboard-belge hepsi`, `npm run hesap8 -- breadboard-belge` | istediğinde (yazdırmak için) | hayır (`.gitignore`) | `breadboard.test.ts` (HTML içeriği) |
| `cpu16/kurulum/cikti/` (kurulum belgeleri HTML + PDF, şema PDF'leri) | `npm run cpu16 -- kurulum hepsi`, `… kurulum hesap` | istediğinde (yazdırmak için) | hayır (`.gitignore`) | `kurulum.test.ts` (HTML içeriği) |
| `public/chips/mos6502/chip.json` | `npm run import:6502` | visual6502 verisi ya da dönüştürücü değişince | evet | `tests/mos6502.test.ts` |
| `public/og/*.png` (paylaşım önizlemeleri), `public/icon-*.png`, `public/apple-touch-icon.png` | `npm run dev`, sonra `http://localhost:5173/scripts/og-gorselleri.html` (görselleri tek tek indirir) | `src/seo.ts`'te bir sayfanın başlığı değişince ya da yeni bölüm eklenince | evet | `cpu16/tests/seo.test.ts` (her sayfanın görseli var, boyutlar doğru) |
| `dist/` | `npm run build` (`SITE_URL=…` ile kanonik adresler ve `sitemap.xml`) | yayın | hayır | CI |

Kurulum belgelerinin PDF'i için `playwright` paketi (depoda ya da global) ve Chromium, şema PDF'leri
için `kicad-cli` gerekir; yoksa yalnız HTML yazılır ([kurulum.md](cpu16/docs/kurulum.md)). Docker
kapsayıcısında bu araçlar yok.

## Belgeler

- Kök [CLAUDE.md](CLAUDE.md) ve `cpu16/`, `hesap8/`, `src/` altındaki `CLAUDE.md`'ler kısa dizinlerdir:
  Claude Code her oturumda okur, yeni gelen biri için de en kısa giriş. Yeni bir klasör, komut, üretilen
  dosya ya da kural eklediysen ilgili `CLAUDE.md`'yi de güncelle.
- Yeni bir belge eklediysen [README'deki belgeler haritasına](README.md#belgeler-haritası) ve
  [okuma yoluna](docs/README.md) bağlantı ekle.
- Belgelerdeki sayılar (çip, test, tel sayıları) koddan gelir; değiştirdiğinde ilgili komutla
  (`board`, `chips`, `hesap8 -- ozet`) doğrula.
- Bir faz ya da büyük iş bitince [roadmap.md](cpu16/docs/roadmap.md)'nin en üstündeki "Şu an" satırını
  güncelle.
