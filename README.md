# breadboarding

[![CI](https://github.com/MihrimatriX/breadboarding/actions/workflows/ci.yml/badge.svg)](https://github.com/MihrimatriX/breadboarding/actions/workflows/ci.yml)

Bu depo bir bilgisayarın içini en alttan en üste kadar gösteriyor. **Silikon3D** tarayıcıda çalışan
bir 3D simülatör: gerçek bir MOS 6502'nin kalıbını transistör transistör çalıştırıyor, sinyalleri
canlı gösteriyor. Aynı uygulamada iki devre projemiz de var. **CPU16**, tamamen 74HC entegrelerinden
kurulan, kendi komut seti, BIOS'u ve C derleyicisi olan 16 bitlik bir bilgisayar. **hesap8**,
programsız ve saatsiz çalışan 8 bitlik dört işlemli bir hesap makinesi. İki devrede de **şema = kod**
kuralı geçerli: devre TypeScript ile bir kez tanımlanıyor; kapı seviyesi simülasyon, 3D görünüm,
KiCad şeması, malzeme listesi ve kurulum belgesi hep bu tanımdan üretiliyor. Her katman testlerle
referans modele bağlı.

- [Neler var](#neler-var)
- [Hızlı başlangıç](#hızlı-başlangıç): [npm ile](#npm-ile), [Docker ile](#docker-ile)
- [Komutlar](#komutlar): [npm betikleri](#npm-betikleri), [CPU16 ve hesap8 komut satırı](#cpu16-ve-hesap8-komut-satırı)
- [Proje yapısı](#proje-yapısı)
- [Belgeler haritası](#belgeler-haritası), [kurulum rehberleri](#kurulum-rehberleri)
- [Testler ve doğrulama](#testler-ve-doğrulama)
- [Silikon3D mimarisi](#silikon3d-mimarisi)
- [Katkı](#katkı), [Lisans](#lisans)

## Neler var

### Silikon3D: dört bölüm

Uygulamanın üst çubuğunda dört bölüm var. Adres çubuğundaki `#...` açık olan bölümü gösterir; bu
adresleri yer imi olarak kaydedebilirsin.

| Bölüm | Adres | Ne görürsün |
|---|---|---|
| **6502 die** | `#6502` | Gerçek MOS 6502 kalıbı (visual6502 verisi). Metal, polisilikon ve difüzyon üç boyutta ayrı katmanlar. 3.510 transistör ve 1.725 düğüm anahtar seviyesinde çalışıyor; 1 olan teller kırmızı yanıyor. Bir tele tıklayıp ölçebilir, mantık analizörüne ekleyebilir, kendi 6502 programını derleyip yükleyebilirsin. |
| **CPU16 tezgâhı** | `#cpu16` | CPU16 için küçük bir geliştirme ortamı (Web IDE). Assembly ya da C yazıp derliyorsun, programı BIOS'lu anakartta (VGA ekran, PS/2 klavye, UART terminali) ya da düz 64 KB bellekte çalıştırıyorsun. Gerçek kart bağlıysa Web Serial ile programı karta da gönderiyorsun. |
| **CPU16 kartı 3D** | `#kart` | Bütün bilgisayar tek sahnede: 7 kart, 444 entegre, 495 pasif eleman, ~5 000 kapı. Hepsi bir Web Worker'da kapı seviyesinde, saat saat çalışıyor. Bilgisayardan karta, karttan çipe, çipten kapıya, kapıdan transistöre iniyorsun; her seviyede sinyaller canlı. Monitörde programın görüntüsü var, klavyeyle yazabiliyorsun. |
| **8 bit hesap 3D** | `#hesap` | Hesap makinesinin kartı: 216 entegre, 15 hane 7 segment gösterge. Anahtarları çeviriyorsun, sonuç kapı gecikmeleriyle göstergelere geliyor; her bloğun o an ne hesapladığı yan panelde. |

<details>
<summary>6502 die bölümünün ayrıntıları ve kısayollar</summary>

| Özellik | Açıklama |
| --- | --- |
| 3D die | Metal, polisilikon ve 4 difüzyon türü ayrı katmanlar. 8.233 poligon tek tek üçgenlenip kalınlık verilir. |
| Canlı sinyaller | 1.725 düğümün durumu her karede GPU'ya tek doku olarak yüklenir; yüksek (1) olan teller kırmızı yanar. |
| Ölçüm | Herhangi bir tele tıkla: adı, 0/1 durumu, sürdüğü ve bağlı olduğu transistörler. Bağlantılara tıklayarak devrede gezin. |
| Sinyal bul | `clk0`, `ab5`, `alucin`, `#1234` gibi isim ya da numara yaz, kamera oraya uçar. |
| Katmanları ayır | Kaydırıcıyla katmanları dikeyde aç, altındaki difüzyonu gör. |
| Transistörler | 3.510 transistör kapı bölgesinde blok olarak; iletimdekiler yeşil. |
| Mantık analizörü | Seçtiğin sinyallerin dalga formu + visual6502 tarzı iz tablosu (ab, db, rw, sync, pc, a, x, y, s, p, komut). |
| Saat kontrolü | Yarım çevrim, tam çevrim, sonraki komut, 1 Hz – 4 kHz arası sürekli çalışma. |
| Pinler | RDY, RES, IRQ, NMI pinlerini elle sür. |
| Bellek ve program | Sayfa 0 ve yığın sayfası canlı; hücreye tıklayıp değer yaz. Dahili 6502 assembler ile kendi programını derle. |

Kısayollar: `Boşluk` çalıştır/duraklat, `.` yarım çevrim, `N` sonraki komut, `R` sıfırla, `Esc` seçimi
kaldır. CPU16 kartı 3D bölümünün kısayolları ve tarayıcı konsolundaki `kart.*` komutları:
[3d-gorunum.md](cpu16/docs/3d-gorunum.md#konsol).

</details>

### CPU16: 74HC entegrelerinden bir 16 bit bilgisayar ([cpu16/](cpu16/README.md))

Ben Eater'ın 8 bitlik bilgisayarı ve Gigatron ailesinden bir proje; farkı 16 bit olması ve her
katmanının açılabilmesi.

- **İşlemci:** 8 register, sabit 16 bit komutlar, NZCV bayrakları, 64 KB adres alanı, `0xFF00`'da
  bellek eşlemeli G/Ç. Komutlar mikrokodla çalışır; mikrokod ROM'da değil, 74HC kapılarıyla kurulu
  (CPU kartı 194 entegre). Bir komut ortalama 5 saat döngüsü sürer.
- **Anakart:** bank'lı bellek (32 KB EEPROM + 128 KB RAM), 2 KB önbellek, UART, PS/2 klavye,
  zamanlayıcı, kesme denetleyicisi, VGA 80 × 30 metin kartı ve 16 baytlık bir "kendin yap bellek"
  eğitim kartı. Hepsi yaygın 7400 serisi çiplerle ve iki bellek çipiyle (62256, 28C256) kuruluyor.
- **Yazılım:** as16 assembler, cc16 C derleyicisi (struct, union, switch, long, göstergeler, libc16),
  BIOS + monitör + UART önyükleyici. Son deneyde C ile yazılmış yılan oyunu VGA ekranda oynanıyor.
  Satır satır yorumlu C örnekleri: [c-ornekleri.md](cpu16/docs/c-ornekleri.md).
- **Kurmak için:** KiCad şemaları, 14 deneylik bir deney seti (saat kartından yılan oyununa), kart
  başına numaralı tel listesi ve çip kartları içeren kurulum belgeleri, Arduino ile EEPROM
  programlayıcı, gerçek kartı UART üzerinden simülatörle karşılaştıran kart testi.
- **Altın model:** komut seviyesindeki referans emülatör doğrunun tanımı. Mikrokod modeli, kapı
  seviyesindeki kartlar ve (sırası gelince) gerçek kartlar aynı programları çalıştırıp emülatörle
  adım adım aynı sonucu vermek zorunda.

Şu anki aşama: simülasyon tarafı bitti, sıradaki iş gerçek kartlar ([yol haritası](cpu16/docs/roadmap.md)).

### hesap8: 8 bit dört işlem hesap makinesi ([hesap8/](hesap8/README.md))

İki 8 bitlik sayı (0–255) DIP anahtarlardan giriliyor. Hesap makinesi toplama, çıkarma, çarpma ve
bölme yapıyor, sonucu onluk 7 segment göstergelerde gösteriyor (bölmede kalanı da). Program,
mikrodenetleyici, ROM ve saat yok: 216 yaygın 74HC entegresinden oluşan, tamamen birleşimsel bir
devre. 4 × 256 × 256 = 262 144 durumun hepsi kapı seviyesinde denenmiş ve altın modelle aynı çıkmış.

## Hızlı başlangıç

### npm ile

**Node 22** gerekir (`.nvmrc`). `cpu16` ve `hesap8` komutları Node'un yerleşik TypeScript desteğini
(`--experimental-strip-types`) kullandığı için sürüm en az 22.6 olmalı.

```bash
git clone https://github.com/MihrimatriX/breadboarding
cd breadboarding
nvm use              # .nvmrc: Node 22 (nvm yoksa Node 22'yi kendin kur)
npm ci               # package-lock.json'daki sürümlerle kurulum
npm run dev          # http://localhost:5173
```

Sonra komut satırından bir şeyler çalıştır:

```bash
npm run cpu16 -- run cpu16/programs/hello.s            # Merhaba, CPU16! (referans emülatör)
npm run cpu16 -- cc cpu16/programs/c/hello.c --run     # C derle, emülatörde çalıştır
npm run hesap8 -- hesapla 255 / 7                      # A [255]  B [  7]  sonuç [    36]  kalan [  3]
npm run check                                          # tip denetimi + bütün testler
```

`public/chips/mos6502/chip.json` depoda hazır gelir. Yeniden üretmek için `npm run import:6502`
(visual6502 deposundan indirir).

### Docker ile

Bilgisayarında Node kurulu olmasa da olur; Docker ve Docker Compose v2 yeter.

```bash
docker compose up -d          # üretim derlemesi nginx'te: http://localhost:8080
docker compose up dev         # geliştirme sunucusu (Vite + HMR): http://localhost:5173
docker compose run --rm cli cpu16 -- run cpu16/programs/hello.s
docker compose run --rm cli hesap8 -- hesapla 255 x 7
docker compose run --rm cli check                       # tip denetimi + testler
docker compose run --rm cli cpu16 -- machine            # BIOS'lu anakart, UART terminalde (çıkış: Ctrl-])
docker compose down           # durdur
```

| Servis / hedef | Ne yapar |
|---|---|
| `web` | `npm run build` çıktısını root olmayan nginx ile 8080'de sunar. Adında içerik özeti olan dosyalar (`assets/*`) bir yıl önbellekte kalır, `index.html` her açılışta yeniden doğrulanır, metinler gzip'li gider. Sağlık denetimi: `/healthz`. Düz `docker compose up` yalnız bunu başlatır. |
| `dev` | Vite geliştirme sunucusu. Kaynak klasörü kapsayıcıya bağlıdır, dosyayı kaydedince tarayıcı kendiliğinden güncellenir. `node_modules` konaktaki klasörün üstüne binen isimli bir birimde durur; kapsayıcı konağa bağımlılık yazmaz. |
| `cli` | `npm run <betik>` çalıştırır: `cpu16`, `hesap8`, `check`, `test` … Ürettiği dosyalar (ör. `kurulum` belgeleri) konaktaki kaynak klasörüne yazılır. |
| `docker build --target test .` | Tip denetimi ve bütün testler imaj kurulurken koşar (`npm run docker:test`). |

İnce ayarlar:

- **Portlar:** `WEB_PORT=8000 docker compose up -d`, `DEV_PORT=5174 docker compose up dev`.
- **Linux'ta dosya sahipliği:** `dev` ve `cli` kapsayıcıda uid 1000 ile çalışır (çoğu Linux
  kurulumunda ilk kullanıcı). Kullanıcı kimliğin farklıysa:
  `DOCKER_USER="$(id -u):$(id -g)" docker compose up dev`.
- **HMR dosya değişikliğini kaçırıyorsa** (Docker Desktop, WSL'de Windows klasörü):
  `CHOKIDAR_USEPOLLING=true docker compose up dev`.
- **`package.json` değişince** bağımlılık birimini yenile:
  `docker compose down -v && docker compose up --build dev`.
- **Web Serial** (CPU16 tezgâhından gerçek karta yükleme) yalnız güvenli bağlamda çalışır:
  `localhost` ya da HTTPS. Sunucuyu başka bir makineden `http://ip:8080` diye açarsan simülatör
  çalışır, karta gönderme çalışmaz.
- **TLS denetleyen bir kurum ağındaysan** `npm ci` sertifika hatası verir. Kök sertifikayı gizli
  olarak ver, imaja girmez: `docker build --secret id=npm_ca,src=kok-sertifika.pem .`
- Kapsayıcıda `kicad-cli` ve Chromium yok: `npm run cpu16 -- kurulum` orada yalnız HTML üretir.
  PDF'ler için komutu konakta çalıştır ([kurulum.md](cpu16/docs/kurulum.md)).

Ayrıntılar `Dockerfile`, `docker-compose.yml` ve `docker/nginx/default.conf` içindeki yorumlarda.

## Komutlar

### npm betikleri

| Betik | Ne yapar |
|---|---|
| `npm run dev` | Vite geliştirme sunucusu, http://localhost:5173 |
| `npm run build` | tip denetimi (`tsc -b`) + üretim derlemesi `dist/` altına |
| `npm run preview` | `dist/`'i yerelde sun (http://localhost:4173) |
| `npm test` | bütün vitest testleri (6502, CPU16, hesap8; 1–2 dakika) |
| `npm run typecheck` | yalnız tip denetimi |
| `npm run check` | tip denetimi + testler: PR açmadan önce bunu çalıştır |
| `npm run cpu16 -- <komut>` | CPU16 komut satırı (aşağıda) |
| `npm run hesap8 -- <komut>` | hesap makinesi komut satırı (aşağıda) |
| `npm run import:6502` | 6502 die verisini visual6502'den indirip `public/chips/mos6502/chip.json`'a çevir |
| `npm run docker:build` | üretim imajını kur (`docker compose build web`) |
| `npm run docker:up` / `docker:down` | `web`'i arka planda başlat (http://localhost:8080) / durdur |
| `npm run docker:dev` | geliştirme sunucusu Docker'da |
| `npm run docker:test` | testleri Docker imajı içinde koş |

### CPU16 ve hesap8 komut satırı

Docker'da aynı komutlar `npm run` yerine `docker compose run --rm cli` ile başlar.

| Komut | Ne yapar |
|---|---|
| `npm run cpu16 -- run cpu16/programs/fib.s [--trace]` | assembly programını derle, referans emülatörde çalıştır |
| `npm run cpu16 -- asm program.s [-o x.hex\|x.bin] [--list]` | as16 ile derle (Intel HEX ya da ham ikili) |
| `npm run cpu16 -- dis x.bin` | ikili dosyayı geri çevir |
| `npm run cpu16 -- cc program.c --run` | cc16 ile C derle, emülatörde çalıştır |
| `npm run cpu16 -- cc cpu16/bios/ornekler/selam.c --hedef bios --run` | C programını BIOS'lu anakart modelinde çalıştır |
| `npm run cpu16 -- machine [program.s]` | anakart + BIOS; UART terminale bağlı (çıkış: Ctrl-]) |
| `npm run cpu16 -- machine cpu16/kit/programlar/bellek-deneme.s --rom --led` | BIOS'suz deney programı, FF00 LED'leri |
| `npm run cpu16 -- bios -o bios.bin` / `charrom -o charrom.bin` | EEPROM imajları (28C256) |
| `npm run cpu16 -- chips` | parça kütüphanesi: kapı ve transistör sayıları |
| `npm run cpu16 -- board` | kartların çip sayıları ve elektriksel kural denetimi (ERC) |
| `npm run cpu16 -- board kicad` | KiCad şemalarını ve BOM'ları yeniden üret (`cpu16/kicad/`) |
| `npm run cpu16 -- kontrol` | mikrokod değişince kontrol birimini (74HC kapıları) yeniden üret ve denetle |
| `npm run cpu16 -- zamanlama [--anakart]` | şemadan statik zamanlama analizi |
| `npm run cpu16 -- kit` | deney rehberlerinin otomatik bölümlerini yeniden üret |
| `npm run cpu16 -- kurulum hepsi` | kurulum belgeleri (tel listesi, çip kartları, el kitabı) |
| `npm run cpu16 -- kart-testi --port /dev/ttyUSB0` | gerçek kartı UART üzerinden simülatörle karşılaştır |
| `npm run hesap8 -- ozet [--yol]` | hesap makinesi: blok blok çipler, en uzun yol, ERC |
| `npm run hesap8 -- hesapla 255 x 7` | kapı seviyesi devreyi çalıştır, göstergeleri yaz (`+ - x /`) |
| `npm run hesap8 -- dogrula [--hepsi]` | altın modelle karşılaştır (`--hepsi`: 262 144 durum) |

Bütün seçenekler: `cpu16/tools/cli.ts` dosyasının başı ve [cpu16/README.md](cpu16/README.md#komutlar).

## Proje yapısı

```
breadboarding/
├── src/                    Silikon3D web uygulaması (React 18 + react-three-fiber + Vite)
│   ├── chip/ sim/ render/  6502 die: çip veri biçimi, anahtar seviyesi motor, 3D katmanlar
│   ├── ui/ state/          paneller, bölüm geçişi, zustand deposu
│   ├── cpu16/              CPU16 tezgâhı: Web IDE, anakart + BIOS, Web Serial
│   └── board3d/            CPU16 ve hesap makinesi kartlarının 3D görünümü (kapı seviyesi, Web Worker)
├── cpu16/                  CPU16 bilgisayarı (ayrıntı: cpu16/README.md)
│   ├── docs/               tasarım belgeleri: spec, mikromimari, kartlar, anakart, BIOS, cc16, üretim
│   ├── emu/ asm/ micro/    referans emülatör (altın model), as16 assembler, mikrokod
│   ├── chips/              74HC parça kütüphanesi: kapı modeli, CMOS transistör açılımı, KiCad sembolü
│   ├── board/              kartlar kod olarak (şema = kod), ERC, zamanlama analizi, KiCad çıktısı
│   ├── kicad/              üretilen KiCad şemaları ve BOM'lar (elle düzenlenmez)
│   ├── bios/ cc/ lib/      BIOS ve örnekleri, cc16 C derleyicisi, crt0 ve libc16
│   ├── programs/           örnek assembly ve C programları
│   ├── kit/                deney seti: 14 deney rehberi, deneme programları
│   ├── kurulum/            kurulum belgesi üreteci (HTML + PDF)
│   ├── programlayici/      Arduino EEPROM programlayıcısı ve yaz.py
│   ├── tools/              npm run cpu16 komutları
│   └── tests/              vitest testleri
├── hesap8/                 8 bit hesap makinesi: devre, simülasyon, komut satırı, belgeler, testler
├── public/chips/mos6502/   6502 die verisi (visual6502, CC BY-NC-SA 3.0)
├── scripts/                import-visual6502.mjs
├── tests/                  6502 testleri (visual6502'nin kaydedilmiş izine karşı)
├── docs/                   belgelerin okuma yolu
├── docker/nginx/           üretim imajının nginx ayarı
├── Dockerfile, docker-compose.yml, .dockerignore
└── .github/                CI (testler, derleme, Docker imajı) ve issue şablonları
```

## Belgeler haritası

Yeni başlıyorsan belgeleri sırayla okuman için bir yol: **[docs/README.md](docs/README.md)**.

| Konu | Belge |
|---|---|
| Katkı: kurulum, dal ve PR akışı, kurallar | [CONTRIBUTING.md](CONTRIBUTING.md) |
| CPU16'ya genel bakış ve komutlar | [cpu16/README.md](cpu16/README.md) |
| Yol haritası, fazlar, şu anki aşama | [roadmap.md](cpu16/docs/roadmap.md) |
| Tasarım, komut seti, bellek haritası | [spec.md](cpu16/docs/spec.md), [isa-ayrintilari.md](cpu16/docs/isa-ayrintilari.md) |
| Assembler (as16) | [as16.md](cpu16/docs/as16.md) |
| Mikromimari, mikrokod, kapılarla kontrol birimi | [mikromimari.md](cpu16/docs/mikromimari.md) |
| 74HC parça kütüphanesi | [parcalar.md](cpu16/docs/parcalar.md) |
| Kartlar: şema = kod, KiCad, ERC | [kartlar.md](cpu16/docs/kartlar.md) |
| Anakart: bellek, önbellek, G/Ç, video | [anakart.md](cpu16/docs/anakart.md), [anakart-kartlari.md](cpu16/docs/anakart-kartlari.md), [anakart-gc-video.md](cpu16/docs/anakart-gc-video.md) |
| 3D kart görünümü ve konsol API'si | [3d-gorunum.md](cpu16/docs/3d-gorunum.md) |
| BIOS, monitör, önyükleyici | [bios.md](cpu16/docs/bios.md) |
| C derleyicisi (cc16) | [cc16.md](cpu16/docs/cc16.md) |
| Yorumlu C örnekleri | [c-ornekleri.md](cpu16/docs/c-ornekleri.md) |
| Üretim: saat hızı, kurulum sırası, kart testi | [uretim.md](cpu16/docs/uretim.md) |
| Kurulum belgeleri: tel listesi, çip kartları, el kitabı | [kurulum.md](cpu16/docs/kurulum.md) |
| Deney seti (14 deney) | [kit/README.md](cpu16/kit/README.md), önce [led-ve-direnc.md](cpu16/kit/led-ve-direnc.md) |
| Hesap makinesi | [hesap8/README.md](hesap8/README.md), [tasarim.md](hesap8/docs/tasarim.md), [kurulum-rehberi.md](hesap8/docs/kurulum-rehberi.md) |
| 6502 verisinin lisansı | [NOTICE.md](public/chips/mos6502/NOTICE.md) |

### Kurulum rehberleri

Gerçek çiplerle kurmak isteyenler için sıra:

1. [LED, direnç ve kondansatör](cpu16/kit/led-ve-direnc.md): ilk deneyden önce bir kez oku.
2. [Deney seti](cpu16/kit/README.md): [Deney 1: saat kartı](cpu16/kit/deney-01-saat.md) → …
   → [Deney 13: yılan oyunu](cpu16/kit/deney-13-c.md); isteğe bağlı
   [Deney 14: kendin yap bellek](cpu16/kit/deney-14-kendin-yap-bellek.md).
3. [Kurulum belgeleri](cpu16/docs/kurulum.md): kart başına yerleşim, numaralı tel listesi, çip
   kartları (`npm run cpu16 -- kurulum hepsi`).
4. [Üretim ve devreye alma](cpu16/docs/uretim.md): hız hedefi, kurulum sırası, kart testi.
5. Hesap makinesi: [fiziksel kurulum rehberi](hesap8/docs/kurulum-rehberi.md)
   (`npm run cpu16 -- kurulum hesap`).

## Testler ve doğrulama

```bash
npm test                                                  # bütün testler (569 test, 1–2 dakika)
npm run check                                             # tip denetimi + testler
npx vitest run cpu16/tests/emu.test.ts                    # tek dosya
npx vitest run cpu16/tests/cc-bios.test.ts -t "yılan"     # bir dosyada adı eşleşen testler
```

Bir katman testleri geçince "bitti" sayılır:

- **6502:** `tests/mos6502.test.ts` motorumuzu visual6502'nin orijinal `chipsim.js`'inden kaydedilmiş
  600 yarım çevrimlik izle karşılaştırır (adres yolu, veri yolu, R/W, SYNC). Ayrıca 1..10 toplamının 55
  çıktığını ve reset sonrası SP=$FD olduğunu denetler. Motor Node'da saniyede ≈ 12 000 yarım çevrim koşar.
- **CPU16:** her opcode ve bayrak kenar durumu; mikrokod modeli, kapı seviyesi CPU ve bütün anakart
  emülatörle komut komut aynı (BIOS açılışı ve zamanlayıcı kesmesi dahil); her çip veri sayfası
  tablosunu kapı ve transistör seviyesinde geçer; KiCad dosyaları ve deney rehberleri koddan yeniden
  üretilmiş halleriyle birebir aynı (elle düzeltilip koda işlenmemiş bir şema CI'da kırmızı yanar);
  C derleyicisi, BIOS, yılan oyunu, kurulum belgeleri, zamanlama.
- **hesap8:** 74HC4511, devrenin yapısı, uç durumlar, lamba testi, KiCad netlist'i; bütün durumlar için
  `npm run hesap8 -- dogrula --hepsi`.

Bazı testler araç bulursa ek denetim yapar, bulamazsa atlanır: `kicad-cli` (KiCad 7+, şemaların
netlist'i), `g++` ve `python3` (EEPROM programlayıcısının yazılımı). Docker'daki test hedefinde bu
araçlar yok, orada 16 test atlanır.

GitHub Actions her push ve PR'da testleri ve derlemeyi koşar, ayrıca Docker imajını kurup
kapsayıcının sayfayı doğru başlıklarla sunduğunu dener (`.github/workflows/ci.yml`).

## Silikon3D mimarisi

```
src/
  chip/            Ortak çip veri biçimi (ChipData) ve türetilmiş indeksler
  sim/
    SwitchLevelEngine.ts   Anahtar seviyesi netlist simülatörü (NMOS + PMOS)
    machines/mos6502.ts    Die'ı bellek, saat ve yollara bağlayan makine
    sim.worker.ts          Simülasyon ayrı iş parçacığında koşar
    SimClient.ts           Worker <-> React köprüsü
    asm6502.ts             Assembler / disassembler
  render/
    dieGeometry.ts         Poligon -> 3D katman geometrisi (earcut)
    geometry.worker.ts     Üçgenleme ayrı iş parçacığında
    DieModel.tsx           Katman mesh'leri, shader, BVH ile fare altı seçim
    shaders.ts             Düğüm durumunu veri dokusundan okuyan shader
    Transistors.tsx        InstancedMesh ile 3.510 transistör
    CameraRig.tsx          Seçilen sinyale kamera uçuşu
  state/           zustand deposu + her kare değişen büyük diziler (live.ts)
  ui/              Paneller, bölüm geçişi
  cpu16/           CPU16 tezgâhı (cpu16/ altındaki emülatörü ve derleyiciyi doğrudan kullanır)
  board3d/         Kart 3D görünümü; board.worker.ts kapı seviyesi makineyi çalıştırır
```

**Veri akışı (6502):** Worker her ~16 ms'de bütçesi kadar yarım çevrim koşar, düğüm ve transistör
durumlarını `Uint8Array` olarak (kopyasız transfer) gönderir. `SimClient` bunları `live` nesnesine koyar;
React'e yalnızca yazmaçlar, pinler ve iz satırları gider. 3D tarafı `useFrame` içinde `live.version`
değiştiyse dokuyu günceller. Böylece React her düğüm değişiminde yeniden çizim yapmaz.

**Neden bu yığın:**

| Seçim | Neden | Alternatif |
| --- | --- | --- |
| React + react-three-fiber | Panel UI ile 3D sahne aynı bileşen modelinde | Saf Three.js (daha az soyutlama, ama UI elle) |
| Web Worker | 4 kHz'de simülasyon 3D'yi takılmadan çalışır | WASM (Rust) motor: 5-10 kat hız, büyük çiplerde gerekebilir |
| Veri dokusu + shader | 1.700 düğüm tek doku güncellemesi | Düğüm başına materyal (binlerce draw call) |
| three-mesh-bvh | Milyon üçgende anlık fare altı seçim | GPU picking (renk kodlu ikinci render) |
| zustand | Seçici bazlı abonelik, gereksiz render yok | Redux Toolkit (bu ölçekte fazla) |

**Silikon3D'nin ileriki adımları:** kendi çipimizin kalıbı (Verilog → Yosys → OpenLane/OpenROAD ile
Sky130 açık PDK; GDS içe aktarıcı, çok katmanlı metal ve via'lar), seçilen bölgedeki transistörleri
kapılara gruplayan şematik görünüm, büyük çipler için Rust + WASM motoru ve LOD, video için kamera
yolu kaydı ve kare kare dışa aktarma. CPU16'nın kendi yol haritası:
[roadmap.md](cpu16/docs/roadmap.md).

## Katkı

Kurulum, dal ve PR akışı, kod kuralları ve yeni çip / kart / örnek program ekleme:
**[CONTRIBUTING.md](CONTRIBUTING.md)**. Yeni özellik ya da hata için GitHub'da **Issues > New issue**
altındaki "Özellik isteği" veya "Hata bildirimi" şablonunu kullan.

## Lisans

Kod MIT ([LICENSE](LICENSE)). `public/chips/mos6502/` altındaki die verisi visual6502 projesine aittir
ve **CC BY-NC-SA 3.0** ile dağıtılır (ticari kullanım yok, atıf zorunlu;
[NOTICE.md](public/chips/mos6502/NOTICE.md)). Para kazanan videolarda 6502 görüntüleri kullanılacaksa
bu lisans dikkate alınmalı. CPU16'nın ve hesap makinesinin verisi bu kısıtlamaya tabi değil.
