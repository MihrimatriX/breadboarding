# CPU16 — Üretim ve devreye alma (Faz 9)

> Simülasyonda doğrulanmış CPU16'yı gerçek kartlarda kurmak için: hangi hızda çalışmasını
> beklemeliyiz, hangi sırayla kurarız, her adımı nasıl sınarız, sonunda kartın simülatörle aynı
> davrandığını nasıl kanıtlarız. Adım adım kurulum deney rehberlerindedir (`cpu16/kit/`); bu belge
> o sıranın gerekçesi ve mühendislik notlarıdır.

## Kısaca

- **İlk hedef 1 MHz CPU saati** (8 MHz kristal osilatör). Şemadan yapılan zamanlama analizi en
  kötü durumda 1,16 MHz, tipik değerlerle 2,1 MHz veriyor; plandaki 4 MHz bu tasarımla 74HC
  ailesinde garanti edilemez. Neden ve 4 MHz'e giden yol aşağıda.
- **UART hızı CPU saatine bağlı**: 1 MHz'de kart 28 800 baud konuşur (4 MHz'de 115 200).
- **Kurulum sırası** deney sırasıdır: saat → programlayıcı → CPU blokları → bellek → önbellek →
  G/Ç → video → BIOS → C. Her blok kurulunca kendi testi geçmeden sonrakine geçilmez.
- **Bitti ölçütü**: `npm run cpu16 -- kart-testi --port …` 4/4 geçer, yani gerçek kart dört test
  programında simülatörle bayt bayt aynı çıktıyı verir.

## 1. Saat hızı: şemadan zamanlama analizi

```
npm run cpu16 -- zamanlama            # en kötü durum (veri sayfası maks, 4,5 V, 25 °C)
npm run cpu16 -- zamanlama --tip      # tipik değerler
npm run cpu16 -- zamanlama --yol 10   # en uzun 10 yol
```

Araç (`board/zamanlama.ts`) şemanın kendisini okur: her çipin pinden pine gecikmesini veri
sayfasından alır, saat ağacını kurar (hangi flip-flop saatin hangi kenarında, ne kadar gecikmeyle
tetikleniyor), flip-flop'tan flip-flop'a en uzun yolları bulur. Şema değişince sonuç da değişir;
`tests/zamanlama.test.ts` 1 MHz'in sığmaya devam ettiğini denetler.

### Sonuç (CPU + saat kartı)

| | En kötü (maks) | Tipik |
|---|---|---|
| CPU saati (CLK) | en kısa periyot 860 ns → **1,16 MHz** | 470 ns → **2,13 MHz** |
| Osilatör (saat kartı, ADIM kipi) | 208 ns → 4,8 MHz | 86 ns → 11,6 MHz |

Kritik yol, yarım periyoda sığmak zorunda olan ALU yoludur:

```
U4    74HC574      kontrol register'ı, saatin DÜŞEN kenarı  CP → Q    +33 ns
U68   74HC157      ALU işlem seçici                          S → Y     +30
U69   SST39SF010A  ALU kod çözme ROM'u (70 ns)               A → DQ    +75
U140  74HC86       toplayıcı B girişi (çıkarmada ters)                 +24
U72–U75 74HC283 ×4 elde zinciri (dalgalı)                              +148
U98   74HC153      sonuç seçici                                        +34
U104  74HC541      ALU → veriyolu                                      +33
                   + kurulum, − yakalayan saatin gecikmesi   ≈ 430 ns ≤ T/2
```

**Neden yarım periyot?** Kontrol register'ı (CR) mikrokodu saatin düşen kenarında alır, durum
register'ları yükselen kenarda yüklenir (mikromimari.md). Bir mikro adımın kontrol kelimesi düşen
kenarda gelir, sonucu yarım periyot sonra yükselen kenarda yazılır: ALU'nun bütün yolu T/2'ye
sığmalı. Bunun karşılığı basitliktir: mikrokod adresi (adım sayacı + IR) ile sonuç aynı döngüde
çözülür, ayrıca bir boru hattı (pipeline) gerekmez.

**Neden 1 MHz?** En kötü durum değerleri 25 °C içindir; -40..85 °C için yaklaşık 1,25 ile çarpılır
ve çok yüklü netler (iç veriyolu 25+ pin) için araç bir yük düzeltmesi ekler. 1 MHz'de yol 500 ns
pencerede 430 ns sürer: %15 pay. İlk kurulumda hata kaynağı olarak zamanlamayı tamamen dışarıda
bırakmak istiyoruz; kart 1 MHz'de testleri geçtikten sonra kristal değiştirilerek 2 MHz denenebilir
(tipik değerlerle sığar; kart testi bunu doğrudan söyler).

### Analizin bulduğu ve düzeltilen sorun

İlk şemada C ve V bayraklarının kapılı saati, ALU ROM'unun `SETSCV` çıkışından geliyordu. ROM'un
adresinde `CFLAG` var ve CFLAG tam da bayrakların yüklendiği kenarda değişiyor; o anda ROM
çıkışında bir sıçrama (glitch) olursa bayrak saatine ikinci bir darbe gider ve C bayrağı yanlış
yüklenirdi. Simülasyon bunu göremez (kapı modeli sıçrama üretmez), gerçek kartta ise ara sıra
bozulan bir ADC/SBC olarak, bulunması çok zor bir hata olurdu. Düzeltme: dört bayrak aynı kapılı
saatle yüklenir; `SETSCV = 0` iken bir 74HC157 eski C ve V'yi geri yazar.

### Bilinen paylar ve kurallar

- **Kapılı saatlerin tutma payı tipik 8 ns.** Kapılı saatin izni CR'den gelir ve düşen kenarda
  değişir; saat girişi o kenarda iki kapı gecikmesiyle kapanır, CR çıkışı ise bir evirici + 574
  gecikmesiyle değişir. Bu yüzden kapılı saat kapıları (74HC08/02) ve CR (74HC574) **aynı aileden**
  olmalı: buraya 74HCT ya da 74AC karıştırma, CLK ve ~CLK hatlarını kısa tut.
- **Register yazma seçimi**: `~WSEL`, IR'deki register alanlarından çözülür ve IR yükselen kenarda
  değişir. Mikrokod IR'yi yüklediği adımda register yazmaz; bunu `tests/zamanlama.test.ts` mikrokod
  ROM'unun her kelimesinde denetler. Mikrokod değişirse bu kural korunmalı.
- **ADIM kipi**: tek döngü adımlamasını yöneten GO flip-flop'u osilatörün düşen kenarında çalışır,
  yolu yarım osilatör periyoduna sığmalıdır. 8 MHz kristalde tipik değerlerle sığar (43 ns ≤
  62,5 ns), en kötü durumda sığmaz (104 ns). OTOMATİK kipte bu yol etkisizdir. Adımlama ara sıra
  bir döngü fazla/eksik yaparsa ADIM kipinde YAVAŞ osilatörü seç.

### 4 MHz'e giden yol

1. **Daha hızlı parçalar**, aynı pin dizilişiyle: ALU yolunda 74AC/74AHC aileleri (gecikmeler
   kabaca üçte bir), 55 ns (varsa 45 ns) Flash. Analizi değiştirip (`GECIKME` tablosu) yeniden
   çalıştırarak etkisi önceden görülür.
2. **Saat kartı**: 4 MHz CPU için 32 MHz osilatör gerekir; 74HC175 Johnson sayacı en kötü
   durumda ≈24 MHz'e kadar garanti (analizde 42 ns'lik yol). Burada da 74AC175 gerekir.
3. **Tam periyot ALU**: CR'yi yükselen kenara alıp mikrokod adresini bir adım önceden hesaplamak
   (bir sonraki adımın kelimesini önceden okumak). ALU yolu T/2 yerine T'ye sığar; 74HC ile
   tipik ≈4 MHz. Mikrokod ve kart değişikliği gerektirir; ileride bir faz olarak.

## 2. UART ve zamanlayıcı CPU saatinden beslenir

G/Ç kartının zaman tabanı TCLK'dir (saat kartı: osilatör / 8, CPU saatiyle aynı hız). UART bit
süresi ve zamanlayıcının 1 kHz ön bölücüsü TCLK döngüsü sayar. Bu yüzden:

| CPU saati | Kristal | UART | Zamanlayıcı tabanı | BIOS tıkı (`TICKS`) |
|---|---|---|---|---|
| 4 MHz (simülatör) | 32 MHz | 115 200 baud | 1 kHz | 10 ms |
| 2 MHz | 16 MHz | 57 600 baud | 500 Hz | 20 ms |
| **1 MHz (ilk kurulum)** | **8 MHz** | **28 800 baud** | 250 Hz | 40 ms |

- Web IDE'de **Kartın UART hızı** seçimini, komut satırında `--baud 28800` seçeneğini kullan.
- Tık sayan programlar (yılan oyunu, saat örneği) gerçek zamanda 4 kat yavaş çalışır; davranış
  değişmez. Kart testi programları süre yazdırmaz, her hızda aynı çıktıyı verir.
- Flash programlayıcı (Arduino) bundan bağımsızdır, kendi hızıyla çalışır.

## 3. Programlanacak çipler

| Çip | Dosya | Nasıl üretilir |
|---|---|---|
| Mikrokod ROM 0–3 (CPU kartı U1, U3, U5, U7) | `cpu16/roms/mikrokod-0..3.hex` | `npm run cpu16 -- roms` |
| ALU kod çözme ROM 0–2 (CPU kartı U69–U71) | `cpu16/roms/alu-0..2.hex` | `npm run cpu16 -- roms` |
| BIOS Flash (bellek kartı) | `bios.bin` (128 KB imaj) | `npm run cpu16 -- bios -o bios.bin` |
| Karakter ROM'u (video kartı) | `charrom.bin` | `npm run cpu16 -- charrom -o charrom.bin` |

Hepsi SST39SF010A'dır ve deney setinin programlayıcısıyla yazılır (Deney 3):

```
python3 cpu16/programlayici/yaz.py PORT --id                                    # OK ID BF B5
python3 cpu16/programlayici/yaz.py PORT cpu16/roms/mikrokod-0.hex --sil --dogrula
```

Programlanmış çipleri etiketle: aynı kılıftaki yedi CPU ROM'unun karışması, en zor bulunan
hatalardandır. Kart testi sırasında bir ROM'u yanlış yuvaya takmak genellikle hemen ilk testi
(1-cpu.c) bozar.

## 4. Besleme

Kaba hesap (5 V):

| Tüketici | Adet | Akım |
|---|---|---|
| 74HC çipleri (1 MHz'de dinamik akım) | ≈200 | ≈1 mA her biri → 0,2 A |
| SST39SF010A (hep seçili: mikrokod, ALU ROM'ları) | 7 | ≤30 mA → 0,2 A |
| Bellek, önbellek ve video SRAM / Flash | ≈6 | ≤30 mA → 0,2 A |
| LED'ler (330 Ω, durum ve veriyolu göstergeleri) | ≈40 | ≈8 mA → 0,3 A |
| **Toplam** | | **≈1 A** |

5 V 3 A'lik düzenli bir adaptör yeterli payı bırakır. Şemada her kartın girişinde 100 µF, her
entegrenin yanında 100 nF var; breadboard'da da bunları atlama: dekuplajsız 74HC kartlar
osilatörün kenarlarında rastgele hatalar yapar. Uzun breadboard dizilerinde beslemeyi iki uçtan ver.

## 5. Kurulum sırası ve her adımın testi

| Adım | Kurulan | Test | Geçti sayılır |
|---|---|---|---|
| Deney 1 | Saat ve reset kartı | LED, osiloskop / mantık analizörü | YAVAŞ'ta LED yanıp söner; ADIM'da her basışta tek CPU döngüsü; CLK %50 görev oranlı ve osilatör / 8 |
| Deney 2 | (kapılar, tek çip) | doğruluk tablosu | 74HC00'ün dört kapısı tabloya uyar |
| Deney 3 | Flash programlayıcı | `yaz.py --id`, `--dogrula` | kimlik BF B5; yazılan imaj geri okunduğunda aynı |
| Deney 4–7 | CPU kartı, blok blok | rehberdeki elle adımlar (DIP anahtar + LED) | her blok rehberdeki tabloyu verir; Deney 7 sonunda CPU, sahte bellekle komut çeker |
| Deney 8 | Bellek kartı | ilk program: Flash'tan çalışıp FF00 çıkış mandalına yazar | LED'lerde beklenen sayı |
| Deney 9 | Önbellek kartı | `onbellek.s` | önbellek açıkken aynı döngü belirgin hızlı, sayaçlar artıyor |
| Deney 10 | G/Ç kartı | USB-UART (CH340, 28 800 baud) | terminalde BIOS istemi `> `; `?` komut listesi |
| Deney 11 | Video kartı | VGA monitör | açılış ekranı ve renkler |
| Deney 12 | BIOS + önyükleyici | **`kart-testi`** | **4/4 geçti** |
| Deney 13 | C | `yilan.c` | ekranda oyun |

### Kart testi

```
npm run cpu16 -- kart-testi --port /dev/ttyUSB0 --baud 28800     # Linux
npm run cpu16 -- kart-testi --port /dev/cu.usbserial-110 --baud 28800   # macOS
npm run cpu16 -- kart-testi                                        # karşı taraf simülatör
```

Windows'ta Web IDE'deki **Kart testi (Web Serial)** düğmesi aynı işi yapar (Chrome / Edge).

Dört program (`cpu16/bios/testler/`) önce simülatörde çalıştırılıp beklenen çıktı alınır, sonra
aynı yoldan (monitör, Intel HEX, `G`) karta yüklenip çıktılar karşılaştırılır:

| Test | Sınadığı | Kalırsa önce bak |
|---|---|---|
| `1-cpu.c` | her ALU işlemi binlerce kez (sağlama toplamı), dallanma, yığın, C çalışma zamanı | CPU kartı: farklı satırdaki işlemin yolu (ör. yalnızca `SHL` farklıysa sonuç seçicinin kaydırma girişleri) |
| `2-bellek.s` | 29 bank × 16 KB RAM, bank register'ları, çift / tek bayt hatları | bellek kartı: hatalı bankın numarası hangi bank bitinin, adres hangi adres hattının sorunlu olduğunu söyler |
| `3-onbellek.s` | etiket karşılaştırması, yazma gözetleme, isabet sayacı | önbellek kartı: etiket SRAM'i ve 74HC688 karşılaştırıcılar |
| `4-gc-video.c` | zamanlayıcı kesmesi, kesme denetleyicisi, VRAM yaz / oku | takılırsa (zaman aşımı) zamanlayıcı veya IRQ hattı; VRAM satırı farklıysa video kartının veri hatları |

Test ilk farklı satırı gösterir. Araç kendi kendini de sınar: VRAM'in bir veri hattı kopuk bir
simüle kartta yalnızca video testinin kaldığı `tests/kart-testi.test.ts`'de denetlenir.

## 6. Arıza bulma

- **Simülatörle yan yana.** KiCad şemasındaki net adları, simülatördeki adlarla aynıdır. Gerçek
  kartı ADIM kipinde yürütürken Web IDE'de aynı programı adım adım çalıştır; register'lar, komut
  izi ve bellek her adımda karşılaştırılabilir. Fark çıkan ilk adım, hatanın hangi blokta
  olduğunu söyler.
- **Önce besleme ve saat**: her entegrenin VCC / GND bacağı, CLK'nin her kartta aynı şekilde
  göründüğü (yansıma, çınlama), ~RESET'in açılışta yeterince uzun düşük kaldığı.
- **Boşta giriş**: CMOS girişi asla boşta bırakılmaz; şema bunu denetler (ERC), breadboard'da
  unutulan bir tel rastgele davranış yapar.
- **Veriyolu çakışması**: iki sürücü aynı anda veriyoluna yazarsa çipler ısınır ve değerler
  karışır. Şemada her sürücünün ~OE'si tek bir çözücü çıkışından gelir; breadboard'da bu hatları
  ilk kurulumda LED'le izle.
- **Zamanlama şüphesi**: hata hızla değişiyorsa (YAVAŞ'ta yok, kristalde var) önce kristali
  yarıya indir. Analiz hangi yolun sınırda olduğunu `--yol 10` ile listeler.

## 7. PCB notları

Şemalar KiCad'de hazır (`cpu16/kicad/<kart>/`), her kart için netlist ve BOM üretiliyor; yerleşim
ve yönlendirme henüz yapılmadı. Plan:

- Önce **breadboard**: deney setinin amacı zaten blok blok kurmak. PCB, breadboard'da 4/4 geçen
  tasarımın kopyası olur.
- Kartlar arka panele 2 × 32 konnektörle oturur (pin listesi `board/passives.ts`, `BACKPLANE`).
- **CPU kartı büyük** (≈150 entegre): tek PCB yerine işlev bloklarına göre iki ya da üç karta
  bölmek ve aralarını kısa bir şeritle bağlamak daha ucuz ve onarılabilir. Bölme yeri, iç veriyolu
  (BUS0..15) ve kontrol kelimesi (CW0..31) dışında az sinyal geçen yerlerdir.
- 4 katman (iç katmanlar GND ve VCC düzlemi) saat kenarlarındaki gürültüyü belirgin azaltır; 2
  katmanda geniş GND dökümü ve her entegrenin dekuplajı bacağın dibinde olmalı.
