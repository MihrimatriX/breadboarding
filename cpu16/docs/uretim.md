# CPU16 — Üretim ve devreye alma (Faz 9)

> Simülasyonda doğrulanmış CPU16'yı gerçek kartlarda kurmak için: hangi hızda çalışmasını
> beklemeliyiz, hangi sırayla kurarız, her adımı nasıl sınarız, sonunda kartın simülatörle aynı
> davrandığını nasıl kanıtlarız. Adım adım kurulum deney rehberlerindedir (`cpu16/kit/`); bu belge
> o sıranın gerekçesi ve mühendislik notlarıdır.

## Kısaca

- **İlk hedef 1 MHz CPU saati** (8 MHz kristal osilatör). Şemadan yapılan zamanlama analizi en
  kötü durumda 1,21 MHz, tipik değerlerle 2,7 MHz veriyor (anakartta 1,05 / 2,23 MHz); plandaki 4 MHz bu tasarımla 74HC
  ailesinde garanti edilemez. Neden ve 4 MHz'e giden yol aşağıda.
- **UART hızı CPU saatine bağlı**: 1 MHz'de kart 28 800 baud konuşur (4 MHz'de 115 200).
- **Kurulum sırası** deney sırasıdır: saat → programlayıcı → CPU blokları → bellek → önbellek →
  G/Ç → video → BIOS → C. Kurulan blok kendi testini geçmeden sonrakine geçilmez.
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
| CPU saati (CLK) | en kısa periyot 824 ns → **1,21 MHz** | 369 ns → **2,71 MHz** |
| Osilatör (saat kartı, ADIM kipi) | 248 ns → 4,0 MHz | 102 ns → 9,8 MHz |

ROM'lu ilk şemada CPU saati 860 ns (1,16 MHz) ve 470 ns (2,13 MHz) idi: mikrokod ve ALU kod
çözme Flash'larının yerine gelen kapı devresi (mikromimari.md, "Kapı seviyesinde kontrol birimi")
ALU yolundaki 70 ns'lik Flash erişimini üç-dört kapı gecikmesine indirdi.

Kritik yol, yarım periyoda sığmak zorunda olan ALU yoludur:

```
U4    74HC574      kontrol register'ı, saatin DÜŞEN kenarı  CP → Q    +33 ns
U178  74HC04       ~ALU_IR                                   A → Y     +17
U163  74HC08       ALU işlem seçici, bit 4 (AOP4)            B → Y     +18
U69   74HC138      ALU işlem çözücü (~AIS3)                  ~E2 → ~Y  +36
U162, U169, U192   ALU kod çözücünün VEYA ağı → AD3 (CIN)    08/32/20  +58
U72–U75 74HC283 ×4 elde zinciri (dalgalı)                              +148
U144, U124         taşma (V): 74HC86, 74HC08                           +42
U100  74HC153      C ve V seçici                                       +34
U116, U105 74HC157 C/V tutma, bayrak girişi (→ U107)                   +48
                   + kurulum, − yakalayan saatin gecikmesi   ≈ 412 ns ≤ T/2
```

### Sonuç: bütün anakart

```
npm run cpu16 -- zamanlama --anakart [--tip]   # CPU + saat + bellek + önbellek + G/Ç + video + kendin yap bellek, 6 saat kökü
```

| Saat alanı | En kötü (maks) | Tipik | Gereken |
|---|---|---|---|
| CPU saati (CLK) | 956 ns → **1,05 MHz** | 448 ns → 2,23 MHz | 1 MHz |
| TCLK (bekleme turları, önbellek ve G/Ç kartları) | 758 ns → 1,32 MHz | 338 ns → 2,96 MHz | 1 MHz |
| Osilatör (OSC, önbellek temizleme sayacı) | 87 ns → 11,5 MHz | 37 ns → 27 MHz | 8 MHz |
| PS/2 saati (klavye) | 150 ns → 6,7 MHz | 60 ns → 16,7 MHz | 16,7 kHz |
| Piksel saati (VID_OSC: 74AC161, 74AC74, 74HC166) | 31 ns → **32,8 MHz** | 17 ns → 59,5 MHz | 25,175 MHz |
| Karakter saati (piksel / 8, video kartının kalanı) | 262 ns → 3,82 MHz | 170 ns → 5,88 MHz | 3,15 MHz |

Anakartta CPU'nun kritik yolu ALU değil, önbellek isabetidir: kontrol register'ı → `~MRD` →
etiket karşılaştırması (74HC688) → `C_HIT` → veri SRAM'i `DE`/`DO`'yu sürer → CPU veriyolu, yine
yarım periyotta (478 ns). 1 MHz'de pay %4'tür: en kötü durum değerleri 25 °C içindir ve bu yol
mantıksal olarak her döngüde koşulmaz (araç kapıların koşullarını değil, en uzun bağlantıyı sayar),
ama ilk kurulumda 1 MHz'in üstüne çıkmadan önce kart testi koşulmalı.

Bellek çipleri 28C256 (EEPROM, 150 ns) ve 62256 (70 ns) olunca en kötü durum neredeyse değişmedi
(CLK 950 → 951 ns, TCLK ve karakter saati aynı); tipik değerlerde TCLK'yi artık EEPROM okuması
belirler (bayt seçimi `BSEL` → 28C256 A0 → `MD`, 150 ns), karakter saatini de karakter ROM'u
(28C256) → font register'ı yolu. İkisi de gereken hızın çok üstünde. Video kartında 28C256'nın
yavaşlığı bir boru hattı aşamasıyla (font register'ı, bir karakter süresi) karşılanır; bu olmasaydı
font yolu yarım karakter süresine (158,9 ns) sığmazdı ([anakart-gc-video.md](anakart-gc-video.md)).
Kendin yap bellek kartının (Deney 14) 574'leri veriyoluna doğrudan bağlansaydı her hatta 16 bacak
eklenir ve CPU yolu 972 ns olurdu; iki 74HC245 tamponla her hatta bir bacak kalır: 956 ns.

Video kartında piksel saatiyle yalnızca üç çip çalışır: faz sayacı (74AC161), karakter saatini
üreten 74AC74 ve kaydırma register'ı (74HC166); kartın geri kalanı piksel / 8 karakter saatindedir.
İki AC çipi zorunludur: HC161 ile yol 49 ns (piksel periyodu 39,7 ns), HC74 ile iki saat arasındaki
ön okuma geçişinin payı eksiye düşer. İki saat alanı arasındaki geçişlerin elle hesabı:
[anakart-gc-video.md](anakart-gc-video.md) ("Statik zamanlama").

Araç, veriyolu üzerinden giden yanlış yolları (bir kartın okuma sürücüsünden başka bir kartın
yazma girişine: aynı döngüde okuma ve yazma olmaz) ve G/Ç kartının zamanlayıcı yükleme
darbesindeki bir yayı adlı istisnalarla analiz dışı bırakır; rapor her istisnayı sayısıyla yazar.
Kapılı saatlerin izinlerinden saat açıkken değişebilenler test edilir ve listelenir:
`~WSEL` ve `C_MEMACC` (CLK), `C_CB`, `C_INVL`, `C_RAMHIT` (TCLK), `V_OPW` (karakter saati: yalnızca
VRAM'in `~OE`/`~WE`'sini kapılar). Bunlar mantıksal olarak güvenlidir:
`~WSEL` aşağıdaki mikrokod kuralıyla; `C_MEMACC`'ın kapıladığı bekleme isteği saat değildir,
yalnızca s7'nin ortasında örneklenir; TCLK tarafındakiler yazma evresi boyunca sabittir ya da
değiştikleri kenarda kapı zaten kapalıdır (gerekçeleri `tests/zamanlama.test.ts`'te). Test listeyi sabit
tutar; yeni bir giriş eklenirse kırılır.

**Neden yarım periyot?** Kontrol register'ı (CR) mikrokodu saatin düşen kenarında alır, durum
register'ları yükselen kenarda yüklenir (mikromimari.md). Bir mikro adımın kontrol kelimesi düşen
kenarda gelir, sonucu yarım periyot sonra yükselen kenarda yazılır: ALU'nun bütün yolu T/2'ye
sığmalı. Bunun karşılığı basitliktir: mikrokod adresi (adım sayacı + IR) ile sonuç aynı döngüde
çözülür, ayrıca bir boru hattı (pipeline) gerekmez.

**Neden 1 MHz?** En kötü durum değerleri 25 °C içindir; -40..85 °C için yaklaşık 1,25 ile çarpılır
ve çok yüklü netler (iç veriyolu 25+ pin) için araç bir yük düzeltmesi ekler. 1 MHz'de yol 500 ns
pencerede 412 ns sürer: %18 pay (anakartta önbellek yolu 475 ns: %5). İlk kurulumda hata kaynağı olarak zamanlamayı tamamen dışarıda
bırakmak istiyoruz; kart 1 MHz'de testleri geçtikten sonra kristal değiştirilerek 2 MHz denenebilir
(tipik değerlerle sığar; kart testi bunu doğrudan söyler).

### Analizin bulduğu ve düzeltilen sorun

İlk şemada C ve V bayraklarının kapılı saati, ALU kod çözme ROM'unun `SETSCV` çıkışından geliyordu.
ROM'un adresinde `CFLAG` vardı ve CFLAG tam da bayrakların yüklendiği kenarda değişir; o anda ROM
çıkışında bir sıçrama (glitch) olsaydı bayrak saatine ikinci bir darbe giderdi ve C bayrağı yanlış
yüklenirdi. Simülasyon bunu göremez (kapı modeli sıçrama üretmez); gerçek kartta ise bu, ara sıra
bozulan bir ADC/SBC olarak görünen, bulunması çok zor bir hata olurdu. Düzeltme: dört bayrak aynı kapılı
saatle yüklenir; `SETSCV = 0` iken bir 74HC157 eski C ve V'yi geri yazar. Bugünkü kapı seviyesindeki
kod çözücü de C'ye bağlı bitlerinde aynı sıçramayı üretebilir: kural aynen geçerli, kod çözücünün hiçbir
çıkışı bir saat kapısına gitmez.

### Bilinen paylar ve kurallar

- **Kapılı saatlerin tutma payı tipik 8 ns.** Kapılı saatin izni CR'den gelir ve düşen kenarda
  değişir; saat girişi o kenarda iki kapı gecikmesiyle kapanır, CR çıkışı ise bir evirici + 574
  gecikmesiyle değişir. Bu yüzden kapılı saat kapıları (74HC08/02) ve CR (74HC574) **aynı aileden**
  olmalı: buraya 74HCT ya da 74AC karıştırma, CLK ve ~CLK hatlarını kısa tut.
- **Register yazma seçimi**: `~WSEL`, IR'deki register alanlarından çözülür ve IR yükselen kenarda
  değişir. Mikrokod IR'yi yüklediği adımda register yazmaz; bunu `tests/zamanlama.test.ts` mikrokod
  tablosunun her kelimesinde denetler. Mikrokod değişirse bu kural korunmalı.
- **ADIM kipi**: tek döngü adımlamasını yöneten GO flip-flop'u osilatörün düşen kenarında çalışır,
  yolu yarım osilatör periyoduna sığmalıdır. 8 MHz kristalde tipik değerlerle sığar (43 ns ≤
  62,5 ns), en kötü durumda sığmaz (104 ns). OTOMATİK kipte bu yol etkisizdir. Adımlama ara sıra
  bir döngü fazla/eksik yaparsa ADIM kipinde YAVAŞ osilatörü seç.

### 4 MHz'e giden yol

1. **Daha hızlı parçalar**, aynı pin dizilişiyle: ALU yolunda ve ALU kod çözücüde 74AC/74AHC
   aileleri (gecikmeler kabaca üçte bir). Analizde `GECIKME` tablosunu değiştirip yeniden
   çalıştırırsan etkisini önceden görürsün.
2. **Saat kartı**: 4 MHz CPU için 32 MHz osilatör gerekir; 74HC175 Johnson sayacı en kötü
   durumda ≈24 MHz'e kadar garanti (analizde 42 ns'lik yol). Burada da 74AC175 gerekir.
3. **Tam periyot ALU**: CR'yi yükselen kenara alıp mikrokod adresini bir adım önceden hesaplamak
   (bir sonraki adımın kelimesini önceden üretmek). ALU yolu T/2 yerine T'ye sığar; 74HC ile
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
- EEPROM programlayıcı (Arduino) bundan bağımsızdır, kendi hızıyla çalışır.

## 3. Programlanacak çipler

| Çip | Dosya | Nasıl üretilir |
|---|---|---|
| BIOS EEPROM (bellek kartı, U420) | `bios.hex` | `npm run cpu16 -- bios -o bios.hex` |
| Karakter ROM'u (video kartı) | `charrom.hex` | `npm run cpu16 -- charrom -o charrom.hex` |

İkisi de 28C256'dır ve deney setinin programlayıcısıyla yazılır (Deney 3). Programlayıcı yazılım
veri korumasını (SDP) kullanır: her sayfa korumalı yazılır, çip korumalı kalır.

```
python3 cpu16/programlayici/yaz.py PORT --koruma                    # yazma koruması: açık / kapalı
python3 cpu16/programlayici/yaz.py PORT bios.hex --dogrula          # sil komutu gerekmez
python3 cpu16/programlayici/yaz.py PORT --koruma-kapat              # gerekirse (başka programlayıcı için)
```

CPU kartında programlanacak çip yok: mikrokod ve ALU kod çözme tablosu 74HC kapılarıyla kurulu
(mikromimari.md). Mikrokod değişirse kart da değişir (`npm run cpu16 -- kontrol`, sonra
`npm run cpu16 -- board kicad`); bir EEPROM'u yeniden yazmak yetmez.

Programlanmış iki çipi etiketle (BIOS, karakter ROM'u): aynı kılıftalar, yer değiştirirlerse
bilgisayar açılışta ekrana anlamsız karakterler basar ya da hiç açılmaz.

## 4. Besleme

Kaba hesap (5 V):

| Tüketici | Adet | Akım |
|---|---|---|
| 74HC çipleri (1 MHz'de dinamik akım) | ≈446 | ≈1 mA her biri → 0,45 A |
| Bellek, önbellek ve video SRAM / EEPROM (yalnız seçili olan akım çeker) | ≈12 | ≤30 mA → 0,2 A |
| Durum LED'leri (330 Ω: HALTED, FAULT, CLK) | 3 | ≈9 mA → 0,03 A |
| CPU kartının hata ayıklama LED'leri (1 kΩ) | 39 | ≈3 mA → 0,12 A |
| CPU kartının çubuk göstergeleri (8 segment × 1 kΩ, bütün bitler 1 iken) | 26 | ≤24 mA → 0,62 A |
| **Toplam** | | **≈1,4 A** |

LED'ler en kötü duruma göre sayıldı: hepsi birden yanmaz (okuma ve yazma LED'lerinden birer tanesi,
veriyolu sürücülerinden en çok biri yanar; değerlerin bitlerinin yarısı 0'dır). CPU kartının
kurulum belgesindeki bütçe (`npm run cpu16 -- kurulum cpu`) LED'lerle ≈ 0,97 A'dir (göstergeler ve
hata ayıklama LED'leri olmadan ≈ 0,23 A); bunun ≈ 0,4 A'i register içeriğinin 16 göstergesidir.

5 V 3 A'lik regüleli bir adaptör yeterli payı bırakır. Şemada her kartın girişinde 100 µF, her
entegrenin yanında 100 nF var; breadboard'da da bunları atlama: dekuplajsız 74HC kartlar
osilatörün kenarlarında rastgele hatalar yapar. Uzun breadboard dizilerinde beslemeyi iki uçtan ver.

## 5. Kurulum sırası ve her adımın testi

Hangi bacağın nereye gideceği kart başına kurulum belgelerindedir (`npm run cpu16 -- kurulum hepsi`,
[kurulum.md](kurulum.md)): blok blok numaralı tel listesi, besleme tablosu, çip kartları; PCB'de
aynı liste bip testi listesidir.

| Adım | Kurulan | Test | Geçti sayılır |
|---|---|---|---|
| Deney 1 | Saat ve reset kartı | LED, osiloskop / mantık analizörü | YAVAŞ'ta LED yanıp söner; ADIM'da her basışta tek CPU döngüsü; CLK %50 görev oranlı ve osilatör / 8 |
| Deney 2 | (kapılar, tek çip) | doğruluk tablosu | 74HC00'ün dört kapısı tabloya uyar |
| Deney 3 | EEPROM programlayıcı | `yaz.py --koruma`, `--dogrula` | yeni çipte koruma kapalı, yazınca açık; yazılan imaj geri okunduğunda aynı |
| Deney 4–7 | CPU kartı, blok blok | rehberdeki elle adımlar (DIP anahtar + LED) | her blok rehberdeki tabloyu verir; Deney 7 sonunda CPU, sahte bellekle komut çeker |
| Deney 8 | Bellek kartı | `kit/programlar/bellek-deneme.s` EEPROM'da, FF00 mandalında 8 LED | LED'ler bank 32–39'u dört kez sayar, boş bölgeler `0xFF` okunur, ≈ 11,5 s sonra `0x5A` ve kayan ışık |
| Deney 9 | Önbellek kartı | `kit/programlar/onbellek-deneme.s` | bit 7 yanıkken (önbellek açık) kayan ışığın adımı ≈ 0,16 s, sönükken ≈ 0,23 s |
| Deney 10 | G/Ç kartı | `kit/programlar/gc-deneme.s` EEPROM'da, USB-UART (CH340, 28 800 baud), PS/2 klavye | terminalde başlık, saniyede bir nokta, yazılanların yankısı, tuşların tarama kodu |
| Deney 11 | Video kartı | `kit/programlar/video-deneme.s`, VGA monitör | mavi zeminde "Merhaba, CPU16!", 16 renk çubuğu, saniyede 60 artan kare sayacı |
| Deney 12 | BIOS + önyükleyici | **`kart-testi`** | **4/4 geçti** |
| Deney 13 | C | `yilan.c` | ekranda oyun |
| Deney 14 | Kendin yap bellek kartı (isteğe bağlı) | `kit/programlar/kyb-deneme.s` EEPROM'da, terminal | dört desen geçer, `TAMAM` ve `FF40:` dökümü; yazılan karakterler kartta görünür |

### Kart testi

```
npm run cpu16 -- kart-testi --port /dev/ttyUSB0 --baud 28800     # Linux
npm run cpu16 -- kart-testi --port /dev/cu.usbserial-110 --baud 28800   # macOS
npm run cpu16 -- kart-testi                                        # karşı taraf simülatör
```

Windows'ta Web IDE'deki **Kart testi (Web Serial)** düğmesi aynı işi yapar (Chrome / Edge).

Dört program (`cpu16/bios/testler/`) önce simülatörde çalıştırılır ve beklenen çıktı alınır; sonra
aynı yoldan (monitör, Intel HEX, `G`) karta yüklenir ve çıktılar karşılaştırılır:

| Test | Sınadığı | Kalırsa önce bak |
|---|---|---|
| `1-cpu.c` | her ALU işlemi binlerce kez (sağlama toplamı), dallanma, yığın, C çalışma zamanı | CPU kartı: farklı satırdaki işlemin yolu (ör. yalnızca `SHL` farklıysa sonuç seçicinin kaydırma girişleri) |
| `2-bellek.s` | 29 bank × 16 KB RAM, bank register'ları, çift / tek bayt hatları | bellek kartı: hatalı bankın numarası hangi bank bitinin, adres hangi adres hattının sorunlu olduğunu söyler |
| `3-onbellek.s` | etiket karşılaştırması, yazma gözetleme, isabet sayacı | önbellek kartı: etiket SRAM'i ve 74HC688 karşılaştırıcılar |
| `4-gc-video.c` | zamanlayıcı kesmesi, kesme denetleyicisi, VRAM yaz / oku | takılırsa (zaman aşımı) zamanlayıcı veya IRQ hattı; VRAM satırı farklıysa video kartının veri hatları |

Test ilk farklı satırı gösterir. Araç kendi kendini de sınar: `tests/kart-testi.test.ts`, VRAM'in
bir veri hattı kopuk olan simüle bir kartta yalnızca video testinin kaldığını denetler.

## 6. Arıza bulma

- **Simülatörle yan yana.** KiCad şemasındaki net adları, simülatördeki adlarla aynıdır. Gerçek
  kartı ADIM kipinde yürütürken Web IDE'de aynı programı adım adım çalıştır; register'lar, komut
  izi ve bellek her adımda karşılaştırılabilir. Fark çıkan ilk adım, hatanın hangi blokta
  olduğunu söyler.
- **Önce besleme ve saat**: her entegrenin VCC / GND bacağı, CLK'nin her kartta aynı şekilde
  göründüğü (yansıma, çınlama), ~RESET'in açılışta yeterince uzun düşük kaldığı.
- **Boşta giriş**: CMOS girişi asla boşta bırakılmaz; şema bunu denetler (ERC), breadboard'da
  unutulan bir tel rastgele davranışa yol açar.
- **Veriyolu çakışması**: iki sürücü aynı anda veriyoluna yazarsa çipler ısınır ve değerler
  karışır. Şemada her sürücünün ~OE'si tek bir çözücü çıkışından gelir; breadboard'da bu hatları
  ilk kurulumda LED'le izle.
- **Zamanlama şüphesi**: hata hıza bağlıysa (YAVAŞ'ta yok, kristalde var) önce kristali
  yarıya indir. Analiz hangi yolun sınırda olduğunu `--yol 10` ile listeler.

## 7. PCB notları

Şemalar KiCad'de hazır (`cpu16/kicad/<kart>/`), her kart için netlist ve BOM üretiliyor; yerleşim
ve yönlendirme henüz yapılmadı. Plan:

- Önce **breadboard**: deney setinin amacı zaten blok blok kurmak. PCB, breadboard'da 4/4 geçen
  tasarımın kopyası olur.
- Kartlar arka panele 2 × 32 konnektörle oturur (pin listesi `board/passives.ts`, `BACKPLANE`).
- **CPU kartı büyük** (≈150 entegre): tek PCB yerine işlev bloklarına göre iki ya da üç karta
  bölmek ve aralarını kısa bir şeritle bağlamak daha ucuz, onarımı da daha kolay. Bölme yerleri,
  iç veriyolu (BUS0..15) ve kontrol kelimesi (CW0..31) dışında az sinyal geçen yerlerdir.
- 4 katman (iç katmanlar GND ve VCC düzlemi) saat kenarlarındaki gürültüyü belirgin azaltır; 2
  katmanda geniş GND dökümü ve her entegrenin dekuplajı bacağın dibinde olmalı.
