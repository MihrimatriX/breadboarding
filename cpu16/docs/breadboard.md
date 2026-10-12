# CPU16 — Breadboard'da bütün bilgisayar

CPU16'nın iki fiziksel kurulum yolu var: **PCB** (kartlar KiCad şemalarından, çipler soketlerde;
[kurulum.md](kurulum.md)) ve **breadboard**. Bu belge breadboard yolunu anlatır: anakartın yedi kartı
yedi panoda, her pano bir taban plakasına yapıştırılmış bir grup tam boy breadboard (BB830), kartlar
arası bütün bağlantılar 64 damarlı bir şerit kablodan. Devre aynıdır: aynı çipler, aynı netler, aynı
arka panel; yalnızca fiziksel yerleşim ve teller değişir.

```sh
npm run cpu16 -- breadboard                       # ölçüler, besleme, şerit kablo; bağlantının netlistle doğrulanması
npm run cpu16 -- breadboard --uret [kart,…]       # yerleşimi ve telleri yeniden üret (cpu16/breadboard/veri/)
npm run cpu16 -- breadboard-belge hepsi           # kurulum belgeleri (HTML + PDF) → cpu16/breadboard/cikti/
npm run cpu16 -- breadboard-belge cpu -o dizin    # tek kart, başka bir dizine (--html: yalnız HTML)
```

Uygulamada: Silikon3D → **CPU16 kartı 3D** → araç çubuğunda **Görünüm: PCB | Breadboard**
(varsayılan PCB; seçim tarayıcıda hatırlanır). Breadboard görünümünde **Kurulum** düğmesi tel tel
kurulum modunu açar (aşağıda).

## Kısaca

| | |
|---|---|
| Panolar | 7 (kart başına bir), iki sıra halinde ortadaki koridora bakar; masa ≈ 1 720 × 1 560 mm |
| Breadboard | 149 tam boy BB830 (63 sütun, a–e / f–j, üstte ve altta ikişer ray, raylar kesintisiz); bir modülün board'ları bitişik, modüller arasında ≈ 20 mm boşluk (her modül bir ada) |
| Parçalar | 460 entegre, 678 pasif eleman ve modül (PCB'deki 641 pasif + 37 yalnız breadboard'a özgü besleme girişi ve 100 µF); CPU kartında 39 hata ayıklama LED'i ve 26 çubuk gösterge |
| Teller | 7 868 atlama teli (602'si ray köprüsü), delikten deliğe 852 m, kesim boyu 983 m, ortalama 108 mm |
| Uzun tel | %94,6'sı 300 mm'den kısa; en uzun 1 534 mm (CPU kartı, modül modül dizildiği için: aşağıda) |
| Arka panel | 64 damarlı düz şerit kablo, 7 adet 2 × 32 IDC soketi, kesim ≈ 3 300 mm |
| Besleme | tek 5 V kaynak, ≈ 1,7 A en kötü durumda (veri sayfası değerleriyle, bütün LED'ler yanık); 22 besleme girişi, yıldız bağlantı |
| Doğrulama | bağlantı yalnız fiziksel modelden birleşim-bul ile kurulur: her pano, her aşamanın sonu ve bütün makine netlistle birebir aynı |

## Neden kart başına bir pano

PCB'de her kart ayrı bir karttır ve arka panele takılır; breadboard'da da her kart kendi panosudur.
Böylece:

- kartın devresi, deney sırası ve testleri PCB'dekiyle aynı kalır: bir pano kendi aşamalarıyla
  kurulur, şerit kablo takılmadan sınanır (Deney 1'de saat kartı tek başına çalışır);
- bir panoyu sökmek ya da başka bir masaya taşımak tek bir soketi çıkarmaktır;
- kart içinde tel kısa kalır: her kartın bloklarının yerini yalnız o kartın netleri belirler.

Panoların içinde board'lar veri akışı sırasıyla dizilir: uyarlayıcının (arka panel bağlantısı)
yanında arka panelle en çok konuşan bloklar (adres çözme, veriyolu tamponları), ondan uzakta iç
bloklar. Her board'a en çok 4–5 mantık çipi konur, aralarında tellere yer kalsın diye.

```
arka sıra (uyarlayıcılar ön kenarda):        önbellek 2×6     CPU 5×15     bellek 2×6
───────────────────── koridor (140 mm): 64 damarlı şerit kablo ─────────────────────
ön sıra (uyarlayıcılar arka kenarda):     KYB 1×6  saat 1×5  video 3×7  G/Ç 3×6
                                          (butonlar, VGA, PS/2, USB-seri ön kenarda: sana yakın)
```

| Pano | Board | Taban | Çip | Tel | Kesim | En uzun | > 300 mm | Akım | Giriş | Aşamalar (deney) |
|---|---|---|---|---|---|---|---|---|---|---|
| Saat ve reset (`clk`) | 1 × 5 | 191 × 363 mm | 10 | 146 | 9 m | 284 mm | 0 | 44 mA | 1 | taban; osilatör, reset, butonlar (1); saat üretimi (1) |
| CPU (`cpu`) | 5 × 15 | 871 × 942 mm | 210 | 3 914 | 559 m | 1 534 mm | 343 | 969 mA | 10 | taban; register dosyası (4); ALU (5); PC, MAR, IR (6); kontrol birimi (7) |
| Bellek (`bellek`) | 2 × 6 | 376 × 439 mm | 34 | 670 | 89 m | 617 mm | 19 | 179 mA | 2 | taban; adres çözme (8); EEPROM ve RAM (8) |
| Önbellek (`onbellek`) | 2 × 6 | 356 × 398 mm | 46 | 718 | 68 m | 579 mm | 13 | 162 mA | 2 | taban; G/Ç çözme, bekleme (8); etiket ve veri belleği (9) |
| G/Ç (`gc`) | 3 × 6 | 541 × 439 mm | 65 | 928 | 98 m | 737 mm | 24 | 165 mA | 3 | taban; adres çözme (10); UART (10); zamanlayıcı ve kesme (10); PS/2 (10) |
| Video (`video`) | 3 × 7 | 521 × 475 mm | 73 | 1 080 | 121 m | 660 mm | 16 | 191 mA | 3 | taban; CPU arayüzü ve VRAM (11); piksel saati (11); piksel yolu, DAC (11) |
| Kendin yap bellek (`kyb`) | 1 × 6 | 191 × 398 mm | 22 | 412 | 39 m | 396 mm | 8 | 22 mA | 1 | taban; adres çözme (14); bellek hücreleri (14) |

Tabanlar, modüller arasındaki ≈ 20 mm boşluklarla birlikte ölçülmüştür (bir modülün board'ları
bitişik, ayrı modüller ayrı adalar: hangi board'ların birlikte bir iş yaptığı uzaktan bile görünür).

### CPU panosu: modül modül, ada ada

CPU panosu James Sharman'ın ve Ben Eater'ın breadboard bilgisayarları gibi okunur: her board'un tek
bir işi var, aynı modülün board'ları bitişik, modüller arasında ≈ 20 mm boşluk (her modül taban
plakasında ayrı bir ada). 3D görünümde her adanın altında kendi renginde bir taban ve uzaktan bakınca
üstünde büyük başlığı var: **REGISTER DOSYASI, VERİYOLU KONTROLÜ, SABİT BİRİMİ, ALU, BAYRAKLAR, KONTROL
BİRİMİ, PROGRAM SAYACI, BELLEK ARAYÜZÜ**. Genel bakışta teller soluk çizilir, modüller öne çıksın.
Yaklaşınca her board'un kendi etiketi görünür ("R0", "TOPLAYICI", "R0 GÖSTERGELERİ" …; göstergeli
board'da etiket LED'lerin ve çubukların yanına yazılır, onları örtmez). Hangi board'un ne olduğu
`cpu16/breadboard/panolar.ts`'teki `duzen` tablosunda yazılı; kurulum belgelerinde (harita, board
çizimleri) aynı adlarla. Tek işli board'da çipler referans sırasıyla dizilir (düşük bitler solda); aynı
çipten oluşan diziler (mantık birimi, sonuç seçici, sabit birimi) board'larına sırayla paylaşılır.

```
        1                  2                  3                  4                  5
arka    R0                 R1                 R2                 R3                 reg. çözücüleri, saatleri
        R0 göstergeleri    R1 göstergeleri    R2 göstergeleri    R3 göstergeleri    veriyolu göstergeleri
        R4                 R5                 R6 (SP)            R7 (LR)            register seçimi
        R4 göstergeleri    R5 göstergeleri    R6 göstergeleri    R7 göstergeleri    bus çözücü, çekme
        ─────────────────────────────── sabit birimi ────────────────────────────────────────────
        sabit bit 0–7      sabit bit 0–7      sabit sürücüsü     sabit bit 8–15     sabit bit 8–15
        ───────────────────────────── ALU ─────────────────────────────────────── bayraklar ───
        ALU kontrol kap.   toplayıcı girişi   toplayıcı          taşma, C/V, sürücü bayraklar, koşul ●
        ALU kontrol kap.   toplayıcı girişi   toplayıcı girişi   TA, TB ●           bayrak sürücüsü
        mantık bit 0–7     mantık bit 0–7     mantık bit 8–15    mantık bit 8–15    bayrak girişi, kapıları
        ALU işlem, çözücü  sonuç seçici       sonuç seçici       sonuç göstergeleri sıfır algılama
        ─────────────────────────────── kontrol birimi ──────────────────────────────────────────
        mikrokod kapı ağı  mikrokod kapı ağı  mikrokod kapı ağı  mikrokod kapı ağı  HALT/hata, durum ●
        mikrokod kapı ağı  mikrokod kapı ağı  mikrokod kapı ağı  kontrol register'ı kontrol kapıları
        komut çözücü       mikrokod kapı ağı  mikrokod kapı ağı  mikrokod kapı ağı  adım çözücü, sayacı ●
        adım seçicileri    adım seçicileri    adım seçicileri    IR, saat kapıları  IR göstergeleri
        ─────── program sayacı ─────────────── bellek arayüzü ve MAR ────────────────────────────
        PC göstergeleri    PC sürücüsü        MAR gös., bellek ● MAR                bayt şeritleri
ön      PC                 PC                 bellek kapıları ▲  bellek kapıları    bayt okuma
                                              (▲ şerit kablo uyarlayıcısı; ● LED'leri çiplerin yanında)
```

Bölgeler arkadan öne: register dosyası ve sağında veriyolu kontrolü, sabit birimi, ALU ve sağında
bayraklar, kontrol birimi (IR dahil), program sayacı ve bellek arayüzü / MAR. Her bölge dikdörtgendir;
modüllerin bölge içindeki yeri, tahmini tel boyunu en kısa yapan yerdir.

Bedeli teldir: modül modül dizilimde 16 hatlık veriyolu her register board'una, ALU'nun bit dilimleri
arasında da A, B ve sonuç hatları board'dan board'a gider; göstergeler (26 çubuk, her biri 8 tel ve bir
direnç dizisi) ve modüller arasındaki boşluklar da tel ister. CPU panosu 75 board, 3 914 tel, delikten
deliğe 494 m; 343 teli 300 mm'den uzun (en uzunu `BUS5`, 1 534 mm: register dosyasından ön kenara).
1 MHz hedefinde uzun teller zamanlamaya sorun değildir ("Sınırlar ve riskler").

### Hata ayıklama LED'leri ve çubuk göstergeler

Göstergeler hata ayıklamak için: hangi register okunuyor ya da yazılıyor, veriyolunu kim sürüyor,
bellek ne zaman okunuyor ya da yazılıyor; veriyolunda, register'larda, PC'de, adreste, IR'de ve ALU
sonucunda hangi değer var. Hepsi 74HC çıkışlarından doğrudan sürülür (1 kΩ ile ≈ 3 mA); karmaşık çip
yok. 39 tek LED (aktif düşük sinyallerde LED VCC'den sinyale bağlı, çıkış 0 iken yanar), 26 on
segmentli çubuk gösterge (her biri bir bayt, bit 0 sağda) ve her çubuğun yanında 8'li 1 kΩ direnç
dizisi. Her göstergenin board'u gösterdiği modülün hemen yanında (`duzen`'de `grup+`):

| Gösterge | Board | Renk |
|---|---|---|
| R0–R7'nin değeri (16 çubuk), okuma `~ROE` ve yazma `~WSEL` LED'leri | her register'ın önündeki board | çubuk sarı, okuma yeşil, yazma amber |
| İç veriyolunun değeri (2 çubuk), veriyolunu süren kaynak (`~SRC_REG/ALU/PC/MEM/IMM/FLAGS`) | veriyolu göstergeleri | sarı; kaynak beyaz |
| ALU sonucu (2 çubuk) | sonuç göstergeleri | sarı |
| TA ve TB yükleme | TA, TB board'u | amber |
| N, Z, C, V, I bayrakları | bayraklar board'u | mavi |
| Mikro adım `STEP0–3`; HALTED, FAULT | adım sayacının ve HALT / hata board'unun ucunda | sarı; HALTED amber, FAULT kırmızı |
| IR'nin değeri (2 çubuk), IR yükleme | IR göstergeleri | sarı, amber |
| PC'nin değeri (2 çubuk; bit 0 hep 0), PC yükleme ve artırma | PC göstergeleri | sarı, amber |
| MAR'ın adresi (2 çubuk), MAR yükleme; bellek okuma `MEMRD` ve yazma `MEMW` | MAR göstergeleri ve bellek LED'leri | sarı, amber; okuma yeşil, yazma amber |

Register'ların değeri her an görünsün diye her register'ın iki 74HC574'ünün çıkışı hep açıktır ve
çubuklarını sürer; register'ı veriyoluna iki 74HC541 çıkarır (CPU kartı 194 → 210 çip, zamanlama
değişmedi: [uretim.md](uretim.md)). 3D görünümde LED'ler ve çubukların segmentleri simülasyondan yanar.
Akım en kötü durumda (bütün segmentler yanık) CPU panosunda ≈ 969 mA'dir, gerçekte yaklaşık yarısı;
bu yüzden CPU panosunun en arka sırasında da birer besleme girişi var (aşağıda). Deney 4'te veriyolunu
2,2 kΩ'luk anahtar modülüyle sürerken veriyolu çubuklarının dizilerini (RN3, RN4) çıkar: hat ancak
≈ 2,7 V'a çıkar ([kit/led-ve-direnc.md](../kit/led-ve-direnc.md)).

## Arka panel: şerit kablo

PCB'de kartlar arası her sinyal arka panelden geçer (`BACKPLANE`, 2 × 32 kenar konnektörü). Breadboard'da
arka panel, koridorda uzanan **64 damarlı, 1,27 mm adımlı düz şerit kablodur**; üstünde her pano için
bir **2 × 32 dişi IDC soketi** sıkılır. Panonun tarafında kartın kenar konnektörünün (J1, J201, J401 …)
yerinde bir **şerit kablo uyarlayıcısı** durur: T-cobbler benzeri, üstte 2 × 32 erkek IDC başlık, altta
kanalın iki yanına oturan 64 bacak (tek numaralı pinler f, çift numaralılar e satırında, 32 ardışık
sütunda). Düz şerit kabloda n. damar soketin n. pinidir, yani bütün panolar aynı 64 hattı PCB'deki pin
düzeniyle görür.

| Seçenek | Artısı | Eksisi |
|---|---|---|
| **Şerit kablo + uyarlayıcı (seçilen)** | panolar arasında tek tel yok; PCB'deki yapının aynısı; pano tek soketle sökülür; kartlar arası her bağlantı tek ve kısa bir yol | her panoda 64 bacaklık bir uyarlayıcı (hazırı yoksa delikli pertinaksa iki başlıkla yapılır), uyarlayıcının çevresinde yoğun teller, IDC sıkma aleti |
| Panolar arasında tek tek atlama telleri | ek parça yok | yüzlerce uzun tel (arka panelin 52 sinyali ve beslemesi, panodan panoya), sökülemez, hata ararken izlenemez |
| Kart başına ayrı kablo + ortak bir arka panel kartı | kablolar kısa | yeni bir PCB, breadboard yolunun amacına ters |

Kablo boyu ≈ 3,28 m (koridor boyunca soketten sokete, her sokette panoya çıkıp dönen yol; %10 payla).
Soketler kablonun başından şu uzaklıklara sıkılır (dizin belgesinde de var):

| Sıra | Pano | Uyarlayıcı | Kablonun başından |
|---|---|---|---|
| 1 | Kendin yap bellek | J801 | 120 mm |
| 2 | Önbellek | J501 | 500 mm |
| 3 | Saat ve reset | J201 | 880 mm |
| 4 | Video | J702 | 1 570 mm |
| 5 | CPU | J1 | 1 860 mm |
| 6 | G/Ç | J603 | 2 510 mm |
| 7 | Bellek | J401 | 3 160 mm |

Bedeli zamanlamadadır: kablo arka panel hatlarına ≈ 15–20 ns gecikme ve damarlar arası kuplaj ekler
(CLK 5. damarda, iki yanında VCC ve WR_WIN; araya GND damarı girmez). İlk hedef olan 1 MHz CPU
saatinde ([uretim.md](uretim.md): şemadan en kötü durum 1,21 MHz) bu pay önemsizdir. Kabloyu
katlamadan, gergin olmadan döşe; her sokette kırmızı çizgili 1. damar uyarlayıcının 1. pinine (▲)
gelmeli. 1., 2., 62. ve 64. damarlar GND, 3., 4. ve 63. damarlar VCC: sıkınca uçtan uca bip testi.

## Pano içi: kurallar

Yerleşim ve teller ortak breadboard motorunda üretilir (`cpu16/board/breadboard/`; 8 bit hesap
makinesiyle aynı motor, aynı kurallar):

- **Yerleşim.** Mantık çipleri bölge bölge (aşamanın blokları) benzetilmiş tavlamayla board'lara
  dağıtılır (tohumlu: her çalışmada aynı sonuç), board'da sütunlara eşit aralıkla dizilir; hiçbir
  board boş kalmaz. CPU panosunda tavlama her çipi yalnız kendi modülünün board'larına koyabilir
  (`duzen`, yukarıda). Geniş DIP'ler (62256, 28C256; 15,24 mm) d ve h satırlarına oturur. Her çipin
  100 nF'ı çipin hemen üstünde, üst ray çiftinin arasında. Elle yerleşen parçalar (direnç dizileri,
  LED'ler, butonlar, anahtarlar, osilatörler, modüller) board'un bir ucunda kendi sütunlarında.
- **Teller.** Düz yatar, yalnız yatay ve dikey gider (90° kıvrım), çip ve parça gövdelerinin üstünden
  geçmez; bir delikte tek uç. Her net, pinlerinin 5 delikli şeritleri ve bunları bağlayan tellerle
  kurulur (A*, söküp yeniden döşeme turları, üst üste binme yasak). Besleme bacakları ve sabit
  girişler en yakın raya.
- **Raylar.** Her board'un üst ve alt + rayları, üst ve alt − rayları board'un sağ ucundan ray
  köprüsüyle bağlıdır; board'lar arası köprüler sıradan sıraya (arka-ön, sol uçta) ve en arka ile en ön
  sırada yan yana; sütunları kayık board'lar arasında köprü modüller arasındaki boşluktan dolanır.
  602 ray köprüsü. Raylar boydan boya kesintisiz varsayılır (BB830); ortadan bölük
  raylı board'larda her rayın iki yarısı ayrıca köprülenir (belgelerde uyarı var).
- **En uzun tel 300 mm.** Daha uzun bağlantılar yolları üstündeki boş bir şeritte (yalnız tellerin
  uğradığı **aktarma şeridi**) ikiye bölünür. Bütün makinede tellerin %94,6'sı kısa kalır; kalan 423
  tel (343'ü CPU kartında, modül modül dizilmiş 5 × 15 board'luk panoda board'lar arası) yolu boyunca
  boş şerit kalmadığı için uzundur: 212'si veri, 130'u kontrol, 29'u seçim, 28'i adres, 13'ü saat,
  10'u reset ve kesme hattı, 1'i dış bağlantı (saat telleri aşağıda, "Sınırlar ve riskler").
- **Kurulum sırası.** Aşama aşama (aşama = deney rehberindeki blok); aşamanın içinde önce ray
  köprüleri, sonra besleme (kırmızı / siyah), sonra sinyaller, board board soldan sağa. Her aşamanın
  sonunda o ana dek takılan parçaların bütün netleri tamdır, aşamanın testi yapılabilir.
- **Sırası önemli teller (↥).** Çok sıkışık yerlerde (geniş çiplerin yanı) yönlendirici bir teli daha
  önce takılan bir telin ucunun üstünden geçirebilir: bellek kartında 26, video kartında 6 tel. Liste
  bunları altlarındaki telden sonraya koyar; belgede ↥ ile işaretlidir.
- **Renk kodu** PCB kurulum belgelerindeki ve wire-wrap tellerindeki kodun aynısıdır
  ([kurulum.md](kurulum.md#tel-renk-kodu)): kırmızı +5 V, siyah GND, sarı adres, mavi veri, turuncu
  seçim ve yetki, yeşil kontrol, beyaz saat, mor reset ve kesme, kahverengi dış bağlantı.
- **Kesim boyu** = delikten deliğe yol + iki uçta 8'er mm (≈ 6 mm soyulmuş uç + 2 mm iniş). Kesim
  listesi renk renk, 5 mm'ye yuvarlanmış boylarla; 22 AWG (0,64 mm) tek damarlı tel.

## Besleme

Tek bir 5 V regüleli kaynak (en az 2 A, tercihen 3 A) bir dağıtım bloğuna; her panonun her besleme
girişine oradan ayrı bir kablo çifti (yıldız bağlantı). Girişler uyarlayıcının board sırasında, her
board sütununa birer tane (2 pinli başlık ya da klemens, + ve − rayına), yanında 100 µF: kartın kendi
100 µF'ı (C1, C204 …) ilk girişte, öteki girişlerdekiler yalnız breadboard'a özgü ek parça (CB…).
CPU panosu uzun (15 sıra) ve LED'leri çok akım çeker: en arka sırasında da beş giriş var (JB6–JB10,
pano tanımında `ekBesleme`), her board en yakın girişten beslenir.
Şerit kablonun VCC ve GND damarları panoları birbirine de bağlar, ama asıl akım kendi kablolarından gelir.

Akım parçaların veri sayfası değerleriyle hesaplanır (PCB kurulum belgelerindeki bütçeyle aynı tablo,
`kurulum/plan.ts` `akim`): girişten uzaklaşan her board'un akımı aradaki ray ve köprülerden geçer
(köprü başına ≈ 50 mΩ: ray şeridi, iki temas ve 22 AWG köprü; + ve − rayında ayrı ayrı) ve düşüm
verir. En kötü pano önbellek kartı: iki girişin yüklüsü
≈ 139 mA, en uzak board'da ≈ 59 mV düşüm (74HC için 4,5–5,5 V aralığında rahat). CPU panosunun akımı
LED'lerin en kötü durumudur (bütün segmentler yanık).

| Pano | Giriş | Akım | En yüklü giriş | En uzak board'da düşüm |
|---|---|---|---|---|
| Saat ve reset | 1 | 44 mA | 44 mA | ≈ 13 mV |
| CPU | 10 | 969 mA | 135 mA | ≈ 35 mV |
| Bellek | 2 | 179 mA | 134 mA | ≈ 56 mV |
| Önbellek | 2 | 162 mA | 139 mA | ≈ 59 mV |
| G/Ç | 3 | 165 mA | 117 mA | ≈ 54 mV |
| Video | 3 | 191 mA | 116 mA | ≈ 35 mV |
| Kendin yap bellek | 1 | 22 mA | 22 mA | ≈ 6 mV |
| **Toplam** | **22** | **≈ 1 732 mA** | | |

## Doğrulama

`cpu16/board/breadboard/dogrulama.ts` yönlendiricinin iç durumuna hiç bakmaz: bağlantıyı yalnız
fiziksel modelden kurar (board'ların 5 delikli şeritleri ve rayları, ray köprüleri, atlama telleri,
deliklerdeki bacaklar, panolar arasında şerit kablonun damarları) ve birleşim-bul (union-find) ile
çıkan iletken parçaları netlistle karşılaştırır. Denetimler: her parça bir kez ve her bacağı bir
delikte; delik gerçekten var; hiçbir delikte iki şey yok; teller yalnız yatay / dikey; hiçbir tel bir
gövdenin, bir bacağın ya da (sırası önemli teller dışında) bir tel ucunun üstünden geçmiyor; açık devre
yok, kısa devre yok.

- **Kart kart**: her pano tek başına (öteki kartlara giden netler uyarlayıcıda biter), ayrıca her
  aşamanın sonunda o ana dek takılanlarla.
- **Bütün makine**: 7 pano + şerit kablo = anakartın netlisti: 2 054 net, 10 401 bacak, 7 868 tel.
- **Bozuk kopyalar**: doğrulayıcının hata bulduğu da sınanır: eksik tel, başka şeride kayan uç, gövde
  üstünden geçen tel, aynı delikte iki uç, takılmamış soket.
- Saklanan veri (`breadboard/veri/*.ts`) netlistin parmak izini taşır: devre değişirse plan kurulmaz,
  test `npm run cpu16 -- breadboard --uret`'i söyler.

Testler: `cpu16/tests/breadboard.test.ts` (bağlantı, kurallar, renkler, boylar, besleme, yerleşim,
belgeler), `cpu16/tests/breadboard-3d.test.ts` (3D görünüm ve kurulum modu).

## Kurulum belgeleri

`npm run cpu16 -- breadboard-belge hepsi` kart başına bir belge ve bir dizin üretir (A4, HTML + PDF):

```
cikti/README.md                       dizin: kartlar, board, tel ve sayfa sayıları
cikti/breadboard-dizin.pdf|html       bütün makine: panoların yeri, şerit kablo (soketlerin yeri,
                                      damar → sinyal), besleme, bütün tellerin kesim listesi
cikti/<kart>-breadboard.pdf|html      kartın panosu
```

Kart belgesinin bölümleri: kapak (ölçüler, içindekiler); nasıl okunur (delik adları, raylar, renk
kodu, parçalar, uyarlayıcı); panonun haritası (board'lar, üstlerindeki çip grupları, aşamaları; her
bölge 3D görünümdekiyle aynı renkte bir çerçeve ve etiketle) ve **Bölümler** (her bölgenin görevi ve
nasıl çalıştığı, altında çip gruplarının görevi, parçaları ve board'ları; metinler
`cpu16/board/bolum-bilgi.ts`) ve makinedeki yeri; besleme (girişler, 100 µF'lar, bütçe, ilk açılış
ölçümü); aşamalar ve testler (her aşamanın board'ları, çipleri, tel aralığı, deney rehberi); board
board yerleşim çizimleri (çipler, pasifler, teller kendi renginde, board dışına çıkan teller kenarda
kesik; üstünde çip gruplarının etiketleri, altında parça tablosu); numaralı tel listesi
(işaret kutusu, T0001 …, nereden → nereye delik delik, mm, kesim, renk, net; her aşamanın sonunda
test satırı); kesim listesi (renk ve boy); malzeme listesi (breadboard, taban plakası, uyarlayıcı,
IDC soketi, besleme girişleri, renk renk tel metrajı, entegreler, pasifler, aletler).

Sayfa sayıları (bütün belgeler, 2026-10): saat 14, CPU 130, bellek 27, önbellek 28, G/Ç 38, video 41,
kendin yap bellek 19, dizin 10.

Delik adları: `BB07 c14` = BB07'nin c satırı, 14. sütunu; raylar `BB07 üst+16`, `üst−`, `alt−`,
`alt+`. BB01 panonun sol arka köşesi, satır satır soldan sağa.

## 3D: Görünüm ve kurulum modu

- **Görünüm: PCB | Breadboard** (araç çubuğu, `kart.gorunum("breadboard")`): breadboard'da bütün
  panolar masada, koridorda şerit kablo (damarları canlı seviyenin renginde). Teller yalıtımlarının
  renginde (renk kodu); bir çip ya da net seçilince o netlerin telleri, **Teller: hepsi** kipinde
  bütün teller canlı seviyenin renginde (0 mavi, 1 kırmızı). Çipe tıklamak, VGA ekranı, program düzenleyicisi, saat
  ve konsol PCB görünümündeki gibi çalışır. Breadboard verisi ayrı bir parçadır, yalnız bu görünüm
  açılınca yüklenir. Seçim `localStorage`'da hatırlanır (`cpu16.kart.gorunum`); yoksa PCB.
- **Modüller**: her panonun her modülü (bölge) kendi renginde bir taban üstünde ayrı bir ada; uzaktan
  bakınca büyük başlığı, yaklaşınca board'ların etiketleri. Genel bakışta teller soluk, modüller ve
  göstergeler öne çıkar. CPU kartının LED'leri ve çubuk göstergeleri simülasyondan yanar: program
  çalışırken hangi register'ın okunup yazıldığı, belleğe ne zaman erişildiği ve değerler izlenir.
- **Kurulum** (breadboard görünümünde; konsolda `kart.bbKurulum("cpu", 3)`): pano ve aşama seçilir; tel tel
  gezilir, sıradaki tel 3D'de vurgulanır ve tarifi yazılır: `CPU · BB07 c14 → BB08 h3, 42 mm, sarı`.
  İşaretlenen teller pano başına tarayıcıda hatırlanır; aşama açılınca o aşamanın testi gösterilir.
- **Hız** (Chromium, yazılım GL, GPU'suz sanal makine): PCB görünümü ≈ 106 çizim çağrısı, 233 bin
  üçgen; breadboard genel bakışı ≈ 173 çizim çağrısı, 525 bin üçgen (karenin süresi yazılım GL'de
  PCB'nin ≈ 1,5 katı); yakın plan ≈ 72 çizim çağrısı. Teller panonun board sırası başına birleştirilmiş
  parçalardır; tüpler kameranın baktığı yerin yakınında, kare başına süre sınırıyla tembel kurulur.
  GPU'lu bir tarayıcıda akıcıdır.

## Sınırlar ve riskler

- **Hız.** Breadboard şeritleri ve uzun teller her hatta pikofaradlar ekler; ilk hedef 1 MHz CPU
  saatidir (PCB'deki gibi). En riskli yer video kartının piksel saatidir (25,175 MHz, 74AC161 /
  74AC74): `VID_OSC`'nin telleri 53–198 mm, `V_PIX`'inki 241 mm. Ekran titrerse önce osilatörün ve
  74AC'lerin dekuplajına, lojik analizörle piksel saatinin kenarlarına bak.
- **Uzun saat telleri.** Yönlendirici saat netlerini öteki netlerden ayırmaz: 13 saat teli 300 mm'den
  uzun. CPU kartında register saatleri (`CLK_R0`, `CLK_R1`, `CLK_R2`, `CLK_R4`, `CLK_R5`, `CLK_R6`: saat
  kapılarının board'undan R0–R7 board'larına) 424–1 128 mm, `CLKR` 381–610 mm, `CLK_TA` 528 mm,
  `CLK_TB` 724 mm, `CLK` 566 mm; bellek kartında `TCLK` 475 mm, video kartında `V_H2` 310 mm. Bir metre tel ≈ 5 ns gecikme ekler
  (1 MHz'de periyodun ‰5'i), ama uzun tel çınlamaya ve kuplaja açıktır: bu telleri öteki tellerden
  ayrı, düz döşe ve ilk açılışta saat kenarlarını lojik analizörle ölç.
- **Uzun teller.** 423 tel 300 mm'den uzun (en uzun 1 534 mm, CPU kartında board'lar arası). Bunları
  ötekilerin üstünden, gergin olmadan döşe.
- **Uyarlayıcı** hazır bir ürün değildir: delikli pertinaksa 2 × 32 başlık ve iki sıra 1 × 32 uzun
  bacaklı pin başlığıyla (sıralar arası 7,62 mm) yapılır.
- **Akım** veri sayfası tipik değerleridir, LED'ler en kötü durumla (bütün segmentler yanık); ilk
  açılışta kaynağın akım sınırını ≈ 300 mA'e koy, pano pano artır.
- Yerleşim ve teller üretilmiştir (`breadboard/veri/`, elle değiştirilmez); devre değişince
  `npm run cpu16 -- breadboard --uret` hepsini yeniden üretir (kart başına saniyeler – bir dakika) ve
  tel numaraları değişebilir: belgeleri yeniden bas.

## Dosyalar

| Dosya | İçerik |
|---|---|
| `cpu16/board/breadboard/` | ortak motor (hesap makinesiyle ortak): BB830 geometrisi, parça kalıpları ve tavlama (`yerlesim.ts`), tel yönlendirme (`yonlendirme.ts`), plan ve kurulum sırası (`plan.ts`), doğrulama (`dogrulama.ts`), 3D yerleşim (`gorunum.ts`), board çizimleri (`cizim.ts`), belgelerin bölüm işaretleri (`bolum-belge.ts`: harita çerçeveleri, Bölümler, çizimlerin grup etiketleri), tel renkleri (`renk.ts`) |
| `cpu16/breadboard/panolar.ts` | panoların tanımı: board ızgarası, bölgeler, aşamalar ve testleri, makinedeki sıra |
| `cpu16/breadboard/yerlesim.ts` | CPU16 kartlarının yerleşimi: uyarlayıcı, besleme girişleri, elle yerleşen parçalar, tavlama |
| `cpu16/breadboard/plan.ts` | kartın ve bütün makinenin planı, panoların masadaki yeri, şerit kablo, doğrulama, 3D yerleşim |
| `cpu16/breadboard/besleme.ts`, `renk.ts` | besleme bütçesi; renk kodu (PCB belgeleriyle aynı) |
| `cpu16/breadboard/veri/` | üretilmiş yerleşim ve teller (kart başına), netlistin parmak iziyle |
| `cpu16/breadboard/cli.ts`, `belge.ts`, `belge-cli.ts` | `breadboard` ve `breadboard-belge` komutları, belge üreteci |
| `src/board3d/aktif.ts`, `Breadboard3D.tsx`, `bbKurulum.ts`, `BbKurulumPanel.tsx` | 3D görünüm seçimi, panolar ve şerit kablo, kurulum modu |
| `cpu16/board/bolum-bilgi.ts`, `bolum-metin.ts`, `bolum-cizim.ts` | bölümler (kart → bölge → blok → çip grubu) ve metinleri; bölge çerçevelerinin geometrisi ve renkleri (3D ve belgeler ortak) |
