# CPU16 bilgisayarı 3D

Silikon3D'de üçüncü bölüm: **CPU16 kartı 3D** (`#kart`). Bütün bilgisayar tek sahnede: CPU kartı,
saat ve reset kartı, bellek kartı, önbellek kartı, G/Ç kartı, video kartı ve kendin yap bellek kartı,
arka panelleriyle birlikte. Bugünkü anakartta 460 entegre, 641 pasif eleman, ~5 000 kapı. Hepsi kapı seviyesinde bir
Web Worker'da saat saat çalışır. Ekranda bilgisayar → kart → çip → kapı → transistör diye
inilir ve her seviyede sinyaller canlıdır. Kartlar elle yazılmış bir listeden gelmez: görünüm
`board.chips` ve `board.passives` içinde ne varsa onu yerleştirir. Yeni bir kart takılınca (ör.
74HC574'lerle kendin yap RAM kartı) kendiliğinden görünür.

## Ne görürsün

| Seviye | Nerede | Ne gösterir |
|---|---|---|
| Bilgisayar | 3D sahne (açılış) | Kartlar sıralar hâlinde. Her sıranın altında arka panel şeridi var, şeritteki 64 bakır yol canlı. Her kartın kenar konnektörüne bir IDC soketi takılı, kısa bir şerit kablo onu arka paneldeki soketine bağlar; soketlerin üstünde kartın adı yazar. Sıralar soldaki şerit kabloyla birbirine bağlı. Arkada VGA monitörü, ekranında programın görüntüsü. |
| Kart | 3D sahne | Entegreler işlev bloklarına göre (ALU, Register dosyası, VRAM, Piksel yolu…) yerleşir. Çok çipli bloklar kareye yakın ızgara olur. Dekuplaj kondansatörleri çiplerinin yanında durur, kenar konnektörü kartın alt kenarında. Öteki pasifler bloklarının altında sıralanır. |
| Pasifler | 3D sahne | Direnç, kondansatör, elektrolitik, LED, direnç dizisi, konnektör, osilatör, buton, anahtar, pot, modül ve CPU kartının 10 segmentli çubuk göstergeleri. Biçimlerini KiCad ayak izi belirler. LED'ler sürüldükleri net 1 olunca yanar; aktif düşük LED'ler (VCC → direnç → LED → sinyal, ör. `~ROE0`) net 0 olunca. Çubuk göstergenin her segmenti dizinin öbür ucundaki sinyal 1 iken yanar: bir bayt soldan sağa bit 0 … 7. Pasiflerin pinleri de tellere katılır. |
| Teller | Araç çubuğu: **Teller** | Pinden pine atlama telleri. Renkleri canlı: mavi 0, kırmızı 1, mor Z, sarı X. Kipler aşağıda. |
| Tel | Breadboard'da bir tele tıkla | Tel baştan sona kalın ve parlak çizilir, uçlarında nabız halkası; öbür teller soluklaşır. Yan panelde telin numarası, rengi, boyu, neti ve **nereden → nereye** (board, delik, o şeritteki bacaklar). Kurulum modunda tıklanan tel odağa gelir. Esc ya da boşluğa tıklamak bırakır. |
| Damar | Şerit kablonun ya da arka panelin bir damarına tıkla | O damarın sinyali seçilir: damar baştan sona, her şeyin üstünde parlayan bir izle çizilir (kablo dik açıyla dönerken 45° katlanır, iz kesintisiz döner; PCB'de kablodan arka panelin yoluna iner), öbür damarlar soluklaşır, bütün kartlarda o netin telleri canlı renkte. Sinyalin uçları olan kartların soketleri çerçevelenir, etiketlerinde o karttaki uç sayısı yazar. Yan panelde arka panelin kaçıncı damarı olduğu, sinyalin hangi kartta kaç uca gittiği ve bütün uçlar. GND ve VCC damarları seçilmez. |
| Çip | Çipe tıkla | Kamera çip ile tellerinin öbür uçlarını birlikte görecek şekilde uçar. Çipin üstünde **kalıbı** (die) açılır. Yan panelde **Bağlantılar**: pin no + ad → net → öbür uçlar (çip.pin). Alt panelde **Çipin içi**: kapı seviyesi şema ya da bellek dizisi. |
| Kapı | Kalıpta ya da şemada bir kapıya tıkla | O kapının CMOS transistör şeması. İletimdeki transistörler yeşil. |
| Net | Bir pine, bir uca ya da bir net adına tıkla | Netin bütün uçları kalın bir telle, öteki her şeyin üstünde birleşir. Yan panelde netin uçları listelenir. |
| Bölüm | Araç çubuğu: **Etiketler**; bir etikete tıkla | Kartın bölgeleri, blokları ve çip grupları işaretli ve adlı. Tıklanan bölümün görevi, nasıl çalıştığı ve çipleri yan panelde. Ayrıntı aşağıda. |

### Görünüm: PCB ve breadboard

Araç çubuğundaki **Görünüm: PCB | Breadboard** aynı bilgisayarın iki fiziksel yapısını gösterir
(varsayılan PCB; seçim tarayıcıda hatırlanır). Devre, simülasyon, çip seçimi, VGA ekranı ve program
düzenleyicisi ikisinde de aynıdır; değişen yalnız yerleşimdir.

- **PCB**: yukarıdaki kartlar, arka panel şeritleri, tel kipleri.
- **Breadboard**: yedi pano masada (kart başına bir taban plakası, 149 BB830; her modül ayrı bir ada), aradaki koridorda
  64 damarlı şerit kablo ve IDC soketleri. Her parça bacaklarıyla deliklerine oturur; 7 868 atlama
  teli kurulumdaki yollarıyla (düz, dik açılı, köşelerde yuvarlak dirsekli tek parça boru) ve
  yalıtımının renginde (renk kodu) çizilir; seçili çipin ya da netin telleri, **hepsi** kipinde bütün
  teller ve şerit kablonun damarları canlı seviyenin renginde. Şerit kablo her sokete koridordan dik
  açıyla ayrılır, panonun kenarında yükselip soketin kapağının altına girer. Breadboard verisi ayrı bir
  parçadır: yalnız bu görünüm ilk açılınca yüklenir.
- **Kurulum** (breadboard görünümünde): pano ve aşama seçilir, teller numara sırasıyla gezilir;
  sıradaki tel 3D'de vurgulanır ve tarifi yazılır (`CPU · BB07 c14 → BB08 h3, 42 mm, sarı`).
  İşaretlenenler pano başına hatırlanır. Ayrıntı: [breadboard.md](breadboard.md).

### Bölüm etiketleri

Araç çubuğundaki **Etiketler: kapalı | bölümler | ayrıntılı** (kısayol `E`; varsayılan
ayrıntılı, seçim tarayıcıda hatırlanır) kartın hangi kısmının ne iş yaptığını sahnenin üstüne yazar.
Metinler tek kaynaktan gelir: `cpu16/board/bolum-bilgi.ts` (hiyerarşi kart → bölge → blok → çip
grubu; metinleri `cpu16/board/bolum-metin.ts`, hesap makinesininki `hesap8/bolum-metin.ts`).

- **Genel bakışta**: breadboard'da her bölge (aynı işi yapan board'lar, ör. "Register dosyası")
  renkli bir çerçeveyle sarılır, ortasına uzaktan okunan bir başlık plakası konur; kartın adı
  panonun dışında. PCB'de her işlev bloğu bir çerçeve ve plaka. Komşu çerçeveler ayrı renkte;
  kırmızı yok (arayüzde kırmızı yalnız hata ve lojik 1). Plakalar ekranda belli bir boydan büyümez,
  çok küçülünce gizlenir.
- **Yaklaşınca** (ayrıntılı kipte): plakalar söner; ekranın iki yanında çip gruplarının etiketleri
  (R0, ALU SONUÇ SEÇİCİ, PROGRAM SAYACI…) hedeflerinin yüksekliğine göre sıralı, üst üste binmeden
  dizilir; her etiketten grubun en yakın çipine bir çizgi gider, grubun ekrandaki öbür parçaları ince
  bir çerçeveyle işaretlenir. **bölümler** kipinde yalnız çerçeveler ve plakalar var.
- **Üstüne gelince**: ipucunda bölümün görevi. Çipin ipucunda ve inceleme panelinde de grubunun
  etiketi (tıklanınca grup seçilir).
- **Tıklayınca**: bölüm seçilir, kamera ona gider; bölümün çipleri vurgulanır, ötekiler söner.
  **İnceleme** sekmesinde başlık, yeri (kart › bölge › blok), görev, aşama ve deney, **Nasıl
  çalışır**, kurulum aşamaları, dışarıyla bağlantıları (sinyaller), alt bölümleri ve parçaları
  (tıklanınca çip seçilir). Esc seçimi kaldırır (önce kapı, net, çip, sonra bölüm).

Bütün plakalar tek bir ağda, çerçeveler kalın çizgi olarak çizilir: genel bakışta bir çizim çağrısı
fazlası. Breadboard kurulum belgelerinin pano haritası aynı bölgeleri aynı renklerle çizer
([breadboard.md](breadboard.md)).

### Teller

- **yok**: tel çizilmez.
- **seçili çip** (varsayılan): seçilen çipin (ya da pasifin) netleri kartın yüzeyinde **bakır yol**
  olarak çizilir: dik açılı, köşeleri 45° pahlı, gövdelerin ve başka netlerin pedlerinin çevresinden
  dolanan, canlı seviyenin renginde yollar (`src/board3d/pcbYol.ts`: kartın 2,54 mm'lik ızgarasında A*;
  yollar kare başına birkaç milisaniyede döşenir). Kartlar arası kısım konnektörden konnektöre, arka
  panel boyunca çizgidir. Seçili bir netin yolları daha kalın ve açık. GND ve VCC yol olarak döşenmez
  (gerçek kartta düzlem). Yan paneldeki **Bağlantılar** aynı uçları sayar. Bir uca tıklayınca o eleman
  seçilir, net adına tıklayınca net seçilir.
- **hepsi**: bütün bilgisayarın kablolaması. Kart içinde her net en kısa yayılan ağaçla birleşir
  (gerçek bir atlama teli zinciri gibi). Kartlar birbirine yalnızca kenar konnektörlerinden
  bağlanır: kartlar arası teller arka panel şeridi boyunca, sıralar arasında soldaki kablodan
  gider. Yaklaşık 3 500 tel ve 40 000 parça var. Hepsi tek bir çizim çağrısıdır ve yalnızca
  netlerin değeri değişince yeniden renklenir. Bir çip seçiliyken "hepsi" soluklaşır, seçili
  çipin telleri öne çıkar.
- **GND/VCC**: besleme telleri varsayılan olarak çizilmez (her kartta yüzlerce ucu var). Kutu
  işaretlenince çizilir.

**Hepsi** kipinin telleri ince çizgidir: kısa teller alçak, uzun teller yüksek kavis çizer (binlerce
bağlantıyı yönlendirmek her seçimde kasardı). Çizimin geometrisi `src/board3d/wires.ts` ve
`src/board3d/pcbYol.ts` içinde saf fonksiyonlardır (testli).

### VGA ekranı

Sahnenin sağ üstünde **VGA** paneli, sahnede de aynı görüntüyü gösteren 3D monitör var.

- **Metin kipi** (varsayılan): 80 × 30 karakter, 16 renk, imleç. Görüntü kapı seviyesindeki video
  kartının kendi bellek çiplerinden okunur: VRAM'in karakter ve renk şeritleri (iki 62256) ve
  karakter ROM'u. Ekran saniyede 10 kez, yalnızca değiştiyse yenilenir. Kaynak tek bir
  uyarlayıcıdadır (`src/board3d/screen-source.ts`, `findScreenSource`). Video kartı değişirse (ör.
  başka bir VRAM düzeni ya da piksel tamponu) yalnızca bu dosya değişir, çizim (`screen.ts`) aynı
  kalır.
- **Işın modu**: monitörün gördüğü gibi. Her piksel saatinde VGA konnektörünün hatları okunur:
  HSYNC, VSYNC ve renk pinleri. Renk pinlerinin gerilimi DAC dirençleri (R_680, R_1K3) ve
  75 Ω'luk monitör girişinden hesaplanır. Bir kare 800 × 525 piksel saati sürer, yani kapı
  seviyesinde ~20 saniye. Işının yeri küçük bir artıyla gösterilir.
- **büyük / küçük**: paneli büyütür. **gizle**: paneli kapatır (sahnedeki monitör kalır).
- **Klavye**: ekrana tıklayıp yaz. Tuşlar PS/2 tarama kodu olarak G/Ç kartının PS/2
  konnektörüne gider (saat ve veri hatları, 11 bitlik çerçeve). `gc-deneme.s` kodları
  `[1C]` diye yazar.
- **UART**: yan paneldeki kutu UART'a giden baytları gösterir. Altındaki alana yazılanlar CH340
  köprüsünün TX hattından kartın RX'ine 8N1 olarak gider. Köprü, kartın ~CTS hattı 1 iken
  bekler.

### Bellek çipinin içi

Bir bellek çipine (62256 SRAM, 28C256 EEPROM) tıklayınca alt panelde dizisi
açılır:

- satır adresi pinleri → **satır çözücü** (ör. 9 → 512) → word line'lar;
- hücre dizisinden adresin çevresinde 16 satır × 4 bayt bir pencere, gerçek içerikle (1 kırmızı);
- **sütun seçici** (64 : 1, bit başına), **okuma yükselteçleri / yazma sürücüleri** ve G/Ç tamponu;
- veri pinleri ve kontrol pinleri (~CE, ~OE, ~WE), o anki kip: OKUMA, YAZMA, seçili değil…

Etkin satır ve sütun canlı vurgulanır. Bir hücreye tıklayınca transistör şeması açılır. SRAM'de
6 transistörlü hücre çizilir: çapraz bağlı iki evirici, M5/M6 erişim transistörleri, BL/BL̅.
EEPROM ve Flash'ta yüzer kapılı transistör çizilir: programlanmışsa 0, silinmişse 1. Düzen pin
adlarından ve boyundan çıkar (`src/board3d/memview.ts`): adres pinleri `A0…`, veri pinleri
çift yönlü olanlar, gerisi kontrol. Çip adı ya da başlığı Flash/EEPROM/ROM diyorsa hücre yüzer
kapılıdır.

### Program düzenleyicisi

Alt paneldeki **Program** sekmesi:

- **Örnekler**: kit programları (video-deneme, gc-deneme, bellek-deneme, onbellek-deneme),
  `hello.s` ve `merhaba-vga.c`. Bu C örneği printf ile UART'a yazar, VGA'ya da doğrudan yazar.
- **Dil**: Otomatik (C ya da assembly, kaynaktaki izlerden), Assembly ya da C.
- **Derle**: yalnızca derler. Hatalar satır numarasıyla listelenir ve satır kenarında işaretlenir.
  Hataya tıklayınca o satıra gidilir.
- **Yükle ve çalıştır** (Ctrl+Enter): derler, imajı bellek kartının EEPROM'una (28C256, bank 0, CPU adresi
  0x0000–0x3FFF) programlayıcıyla yazılmış gibi yazar, RESET verir ve çalıştırır. Kart yeniden
  kurulmaz: VRAM ve RAM'in içeriği, gerçek kartta olduğu gibi, RESET'ten sonra da kalır.

C, cc16'nın **rom** hedefiyle derlenir. Program 0x0000'dan başlar, BIOS yoktur. Değişkenler
0x4000'dan itibaren RAM'dedir, yığın 0xFF00'ın altındadır. `printf`, `puts` ve `putchar`
karakterleri UART_DATA'ya (0xFF00) yazar. VRAM'e port üzerinden yazılır: VADDR (0xFF20) hücre
adresi, VDATA (0xFF22) önce karakter kodu, sonra renk baytı.

### Konsol

Tarayıcı konsolunda `kart`:

| Komut | Ne yapar |
|---|---|
| `kart.durum()`, `kart.uart()`, `kart.ekran()`, `kart.olc()` | CPU durumu, UART çıktısı, ekrandaki metin, ölçülen hız (Hz) ve döngü |
| `kart.calistir()`, `kart.duraklat()`, `kart.sifirla()`, `kart.adim("cycle" \| "instr")`, `kart.hiz(hz)` | saat |
| `kart.ornekler()`, `kart.ornek("merhaba-vga.c")` | örneği yükle ve çalıştır |
| `kart.yukle(kaynak?, "asm" \| "c")` | kaynağı (verilmezse düzenleyicidekini) derle, EEPROM'a yaz, çalıştır. Hataları döndürür |
| `kart.teller("yok" \| "secili" \| "hepsi")`, `kart.besleme(true)` | tel kipi, GND/VCC telleri |
| `kart.isin(true)` | ışın modu |
| `kart.gorunum("breadboard" \| "pcb")` | görünüm (verilmezse şimdiki) |
| `kart.bbKurulum("cpu", 3)` | breadboard kurulum modu: pano ve aşama seçer; sıradaki teli ve sayıları döndürür |
| `kart.tus("dir\n")`, `kart.uartGonder("merhaba")` | PS/2 klavye ve UART girişi |
| `kart.secCip("U72")`, `kart.secKapi(112)`, `kart.secNet("BUS0")` | seçim |
| `kart.cipler()`, `kart.pasifler()`, `kart.kartlar()`, `kart.baglantilar("U72")`, `kart.kapilar("U11")` | listeler |
| `kart.etiketler("kapali" \| "bolumler" \| "ayrintili")` | bölüm etiketlerinin kipi (verilmezse şimdiki) |
| `kart.bolumler("bolge" \| "blok" \| "grup" \| "kart")`, `kart.bolum("grup:cpu:komut-cozucu")` | bölümlerin kimlikleri ve etiketleri; bölümü seç (`null` kaldırır), seçiliyi döndür |
| `kart.plakaEkranda(id)`, `kart.kenarEtiketleri()` | plakanın ekrandaki yeri, ekrandaki kenar etiketleri (testler için) |

Kısayollar: Boşluk çalıştır/duraklat, `.` bir saat döngüsü, `N` bir komut, `E` etiket kipi, Esc seçimi kaldırır.
Düzenleyicide ve VGA ekranında yazarken kısayollar devre dışıdır.

## Hız

Bütün bilgisayar kapı seviyesinde, tarayıcıda (Chromium, yazılım GL) saniyede ~3 000–4 000 saat döngüsü
olarak ölçüldü. Bu, 4 MHz'lik gerçek kartın ~1/1 000'i. Birkaç örnek:

- `video-deneme.s`: ilk kare sayacı ~20 s'de görünür;
- `gc-deneme.s`: açılış yazısı ~1 s, UART yankısı ve klavye kodu birkaç saniyede;
- `merhaba-vga.c`: ~180 000 döngü (ekranı silmek dahil), ~50 s.

Saat seçicisinden 1 Hz ile 1 kHz arası sabit hızlar da seçilebilir.

## Dosyalar

- `cpu16/board/layout.ts`: kartların, blokların, çiplerin ve pasiflerin fiziksel yerleşimi (mm).
  Kart sıraları ve arka panel şeritleri buradadır. Kart başlıkları `CARD_TITLES` içindedir;
  tabloda olmayan kart "<Ad> kartı" olur.
- `cpu16/board/machine-board.ts`: `FULL_MACHINE_CARDS`, bütün bilgisayarın ek kartları. Görünüm
  ve `buildFullMachineBoard` aynı listeyi kullanır.
- `cpu16/board/inside.ts`: çipin kapı şeması yerleşimi, kapının CMOS şeması, `GateProbe`.
- `src/board3d/`:
  - `board.worker.ts`: `GateMachine`, piksel saati, PS/2 ve UART hatları, ekran ve ışın;
  - `store.ts`: durum, örnekler ve derleme;
  - `BoardScene.tsx`: sahne, teller, pasifler ve monitör;
  - `BoardView.tsx`: bölüm, paneller, düzenleyici ve konsol;
  - `MemoryInside.tsx`: bellek dizisi;
  - bölüm etiketleri: `bolum.ts` (durum: kip, seçili bölüm), `bolumSahne.ts` (çerçeve, plaka ve
    kenar etiketi geometrisi; saf), `Bolumler3D.tsx` (sahnedeki çerçeveler, plakalar, vurgu,
    kamera), `BolumKatmani.tsx` (kenar etiketleri ve çizgileri, ipucu), `BolumPanel.tsx` (araç
    çubuğu seçimi, yan panel); testler `cpu16/tests/bolum-bilgi.test.ts`, `bolum-3d.test.ts`,
    `bolum-belge.test.ts`;
  - saf yardımcılar: `wires.ts`, `screen.ts`, `screen-source.ts`, `beam.ts`, `serial-in.ts`,
    `program.ts`, `memview.ts`.
- `src/board3d/ornekler/`: düzenleyicinin kendi örnekleri (`merhaba-vga.c`).
- Breadboard görünümü: `src/board3d/aktif.ts` (görünüm seçimi, panolar), `Breadboard3D.tsx`
  (board'lar, teller, şerit kablo), `telYolu.ts` (tel borusunun ekseni, tıklanan tel), `Serit3D.tsx`
  ve `serit.ts` (şerit kablo, arka panel yolları, IDC soketleri, tıklanan damar), `bbKurulum.ts` ve
  `BbKurulumPanel.tsx` (kurulum modu); plan
  `cpu16/breadboard/` ([breadboard.md](breadboard.md)). Testler: `cpu16/tests/breadboard-3d.test.ts`.
- Testler: `cpu16/tests/view.test.ts`. Kapsadığı yerler:
  - bütün bilgisayarın yerleşimi ve pin-net eşleşmesi;
  - tel geometrisi, ağaçlar ve arka panel yolları;
  - VRAM → ekran ve ekran kaynağı;
  - VGA konnektörü ve DAC;
  - PS/2 ve UART çerçeveleri;
  - dil tanıma ve EEPROM imajı (`romImage()` ile bayt bayt aynı);
  - C örneğinin derlenip çalışması;
  - 62256, 28C256 ve SST39SF010A bellek düzeni.

## Sınırlar

- Bellek çipleri (SRAM, EEPROM, Flash) davranışsal modeldir. İçleri bir örnek pencereyle
  çizilir, kapı olarak değil.
- Piksel saati CPU döngüleri arasında toplu işlenir (CPU döngüsü başına ~6,3 piksel saati).
  Işın modunda bir kare ~20 s sürer.
- cc16'nın rom hedefinde `putchar` TX_EMPTY'yi beklemez. UART kutusu, CPU'nun UART_DATA'ya
  yazdığı her baytı gösterir; G/Ç kartının gerçek TX hattındaki çerçevelerin hepsi bu hızda
  çıkmayabilir.
- Yazılım GL ile (sanal makine, GPU'suz) sahne birkaç kare/s çizilir; GPU'lu tarayıcıda akıcıdır.
  Breadboard genel bakışı PCB'nin ≈ 1,5 katı sürer (≈ 174 çizim çağrısı, 527 bin üçgen; PCB ≈ 108,
  235 bin).
- Transistör şeması mantıksal yerleşimdir, gerçek çip maskesi değildir.
- Önceki 153 entegrelik CPU + test belleği görünümü yerini bütün bilgisayara bıraktı (CPU16
  tezgâhı bölümü durur).
