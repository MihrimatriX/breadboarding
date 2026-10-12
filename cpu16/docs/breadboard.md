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
| Panolar | 7 (kart başına bir), iki sıra halinde ortadaki koridora bakar; masa ≈ 1 690 × 1 200 mm |
| Breadboard | 129 tam boy BB830 (63 sütun, a–e / f–j, üstte ve altta ikişer ray, raylar kesintisiz) |
| Parçalar | 444 entegre, 522 pasif eleman ve modül (PCB'deki 495 pasif + 27 yalnız breadboard'a özgü besleme girişi ve 100 µF) |
| Teller | 6 793 atlama teli (522'si ray köprüsü), delikten deliğe 621 m, kesim boyu 734 m, ortalama 91 mm |
| Uzun tel | %97,2'si 300 mm'den kısa; en uzun 1 034 mm (CPU kartı) |
| Arka panel | 64 damarlı düz şerit kablo, 7 adet 2 × 32 IDC soketi, kesim ≈ 3 280 mm |
| Besleme | tek 5 V kaynak, ≈ 975 mA (veri sayfası değerleriyle); 17 besleme girişi, yıldız bağlantı |
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
arka sıra (uyarlayıcılar ön kenarda):        önbellek 2×6     CPU 5×11     bellek 2×6
───────────────────── koridor (140 mm): 64 damarlı şerit kablo ─────────────────────
ön sıra (uyarlayıcılar arka kenarda):     KYB 1×6  saat 1×5  video 3×7  G/Ç 3×6
                                          (butonlar, VGA, PS/2, USB-seri ön kenarda: sana yakın)
```

| Pano | Board | Taban | Çip | Tel | Kesim | En uzun | > 300 mm | Akım | Giriş | Aşamalar (deney) |
|---|---|---|---|---|---|---|---|---|---|---|
| Saat ve reset (`clk`) | 1 × 5 | 191 × 302 mm | 10 | 146 | 8 m | 224 mm | 0 | 44 mA | 1 | taban; osilatör, reset, butonlar (1); saat üretimi (1) |
| CPU (`cpu`) | 5 × 11 | 851 × 637 mm | 194 | 2 896 | 336 m | 1 034 mm | 125 | 212 mA | 5 | taban; register dosyası (4); ALU (5); PC, MAR, IR (6); kontrol birimi (7) |
| Bellek (`bellek`) | 2 × 6 | 356 × 358 mm | 34 | 659 | 84 m | 607 mm | 22 | 179 mA | 2 | taban; adres çözme (8); EEPROM ve RAM (8) |
| Önbellek (`onbellek`) | 2 × 6 | 356 × 358 mm | 46 | 718 | 67 m | 815 mm | 10 | 162 mA | 2 | taban; G/Ç çözme, bekleme (8); etiket ve veri belleği (9) |
| G/Ç (`gc`) | 3 × 6 | 521 × 358 mm | 65 | 902 | 87 m | 599 mm | 14 | 165 mA | 3 | taban; adres çözme (10); UART (10); zamanlayıcı ve kesme (10); PS/2 (10) |
| Video (`video`) | 3 × 7 | 521 × 414 mm | 73 | 1 063 | 116 m | 747 mm | 20 | 191 mA | 3 | taban; CPU arayüzü ve VRAM (11); piksel saati (11); piksel yolu, DAC (11) |
| Kendin yap bellek (`kyb`) | 1 × 6 | 191 × 358 mm | 22 | 409 | 36 m | 310 mm | 1 | 22 mA | 1 | taban; adres çözme (14); bellek hücreleri (14) |

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
  board boş kalmaz. Geniş DIP'ler (62256, 28C256; 15,24 mm) d ve h satırlarına oturur. Her çipin
  100 nF'ı çipin hemen üstünde, üst ray çiftinin arasında. Elle yerleşen parçalar (direnç dizileri,
  LED'ler, butonlar, anahtarlar, osilatörler, modüller) board'un bir ucunda kendi sütunlarında.
- **Teller.** Düz yatar, yalnız yatay ve dikey gider (90° kıvrım), çip ve parça gövdelerinin üstünden
  geçmez; bir delikte tek uç. Her net, pinlerinin 5 delikli şeritleri ve bunları bağlayan tellerle
  kurulur (A*, söküp yeniden döşeme turları, üst üste binme yasak). Besleme bacakları ve sabit
  girişler en yakın raya.
- **Raylar.** Her board'un üst ve alt + rayları, üst ve alt − rayları board'un sağ ucundan ray
  köprüsüyle bağlıdır; board'lar arası köprüler sıradan sıraya (arka-ön, sol uçta) ve en arka ile en ön
  sırada yan yana. 522 ray köprüsü. Raylar boydan boya kesintisiz varsayılır (BB830); ortadan bölük
  raylı board'larda her rayın iki yarısı ayrıca köprülenir (belgelerde uyarı var).
- **En uzun tel 300 mm.** Daha uzun bağlantılar yolları üstündeki boş bir şeritte (yalnız tellerin
  uğradığı **aktarma şeridi**) ikiye bölünür. Bütün makinede tellerin %97,2'si kısa kalır; kalan 192
  tel (125'i CPU kartında, 5 × 11 board'luk panoda board'lar arası) yolu boyunca boş şerit kalmadığı
  için uzundur: 78'i veri, 60'ı kontrol, 26'sı adres, 16'sı seçim, 6'sı saat, 5'i reset ve kesme
  hattı (saat telleri aşağıda, "Sınırlar ve riskler").
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
Şerit kablonun VCC ve GND damarları panoları birbirine de bağlar, ama asıl akım kendi kablolarından gelir.

Akım parçaların veri sayfası değerleriyle hesaplanır (PCB kurulum belgelerindeki bütçeyle aynı tablo,
`kurulum/plan.ts` `akim`): girişten uzaklaşan her board'un akımı aradaki ray ve köprülerden geçer
(köprü başına ≈ 50 mΩ: ray şeridi, iki temas ve 22 AWG köprü; + ve − rayında ayrı ayrı) ve düşüm
verir. En kötü pano bellek kartı: iki girişin yüklüsü
≈ 137 mA, en uzak board'da ≈ 57 mV düşüm (74HC için 4,5–5,5 V aralığında rahat).

| Pano | Giriş | Akım | En yüklü giriş | En uzak board'da düşüm |
|---|---|---|---|---|
| Saat ve reset | 1 | 44 mA | 44 mA | ≈ 13 mV |
| CPU | 5 | 212 mA | 51 mA | ≈ 26 mV |
| Bellek | 2 | 179 mA | 137 mA | ≈ 57 mV |
| Önbellek | 2 | 162 mA | 82 mA | ≈ 33 mV |
| G/Ç | 3 | 165 mA | 120 mA | ≈ 54 mV |
| Video | 3 | 191 mA | 110 mA | ≈ 27 mV |
| Kendin yap bellek | 1 | 22 mA | 22 mA | ≈ 6 mV |
| **Toplam** | **17** | **≈ 975 mA** | | |

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
- **Bütün makine**: 7 pano + şerit kablo = anakartın netlisti: 1 680 net, 8 937 bacak, 6 793 tel.
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
kodu, parçalar, uyarlayıcı); panonun haritası (board'lar, görevleri, aşamaları) ve makinedeki yeri;
besleme (girişler, 100 µF'lar, bütçe, ilk açılış ölçümü); aşamalar ve testler (her aşamanın board'ları,
çipleri, tel aralığı, deney rehberi); board board yerleşim çizimleri (çipler, pasifler, teller kendi
renginde, board dışına çıkan teller kenarda kesik; altında parça tablosu); numaralı tel listesi
(işaret kutusu, T0001 …, nereden → nereye delik delik, mm, kesim, renk, net; her aşamanın sonunda
test satırı); kesim listesi (renk ve boy); malzeme listesi (breadboard, taban plakası, uyarlayıcı,
IDC soketi, besleme girişleri, renk renk tel metrajı, entegreler, pasifler, aletler).

Sayfa sayıları (bütün belgeler, 2026-10): saat 13, CPU 89, bellek 26, önbellek 27, G/Ç 35, video 39,
kendin yap bellek 18, dizin 7.

Delik adları: `BB07 c14` = BB07'nin c satırı, 14. sütunu; raylar `BB07 üst+16`, `üst−`, `alt−`,
`alt+`. BB01 panonun sol arka köşesi, satır satır soldan sağa.

## 3D: Görünüm ve kurulum modu

- **Görünüm: PCB | Breadboard** (araç çubuğu, `kart.gorunum("breadboard")`): breadboard'da bütün
  panolar masada, koridorda şerit kablo (damarları canlı seviyenin renginde). Teller yalıtımlarının
  renginde (renk kodu); bir çip ya da net seçilince o netlerin telleri, **Teller: hepsi** kipinde
  bütün teller canlı seviyenin renginde (0 mavi, 1 kırmızı). Çipe tıklamak, VGA ekranı, program düzenleyicisi, saat
  ve konsol PCB görünümündeki gibi çalışır. Breadboard verisi ayrı bir parçadır, yalnız bu görünüm
  açılınca yüklenir. Seçim `localStorage`'da hatırlanır (`cpu16.kart.gorunum`); yoksa PCB.
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
  74AC74): `VID_OSC`'nin telleri 18–287 mm, `V_PIX`'inki 259 mm. Ekran titrerse önce osilatörün ve
  74AC'lerin dekuplajına, lojik analizörle piksel saatinin kenarlarına bak.
- **Uzun saat telleri.** Yönlendirici saat netlerini öteki netlerden ayırmaz: 6 saat teli 300 mm'den
  uzun. CPU kartında `CLK_TB` (geçici register TB'nin saati) 607 ve 1 034 mm'lik iki telle, `CLK` 361
  ve 574 mm, `CLK_IR` 333 mm; bellek kartında `TCLK` 538 mm. Bir metre tel ≈ 5 ns gecikme ekler
  (1 MHz'de periyodun ‰5'i), ama uzun tel çınlamaya ve kuplaja açıktır: bu telleri öteki tellerden
  ayrı, düz döşe ve ilk açılışta saat kenarlarını lojik analizörle ölç.
- **Uzun teller.** 192 tel 300 mm'den uzun (en uzun 1 034 mm, CPU kartında board'lar arası). Bunları
  ötekilerin üstünden, gergin olmadan döşe.
- **Uyarlayıcı** hazır bir ürün değildir: delikli pertinaksa 2 × 32 başlık ve iki sıra 1 × 32 uzun
  bacaklı pin başlığıyla (sıralar arası 7,62 mm) yapılır.
- **Akım** veri sayfası tipik değerleridir; ilk açılışta kaynağın akım sınırını ≈ 300 mA'e koy, pano
  pano artır.
- Yerleşim ve teller üretilmiştir (`breadboard/veri/`, elle değiştirilmez); devre değişince
  `npm run cpu16 -- breadboard --uret` hepsini yeniden üretir (kart başına saniyeler – bir dakika) ve
  tel numaraları değişebilir: belgeleri yeniden bas.

## Dosyalar

| Dosya | İçerik |
|---|---|
| `cpu16/board/breadboard/` | ortak motor (hesap makinesiyle ortak): BB830 geometrisi, parça kalıpları ve tavlama (`yerlesim.ts`), tel yönlendirme (`yonlendirme.ts`), plan ve kurulum sırası (`plan.ts`), doğrulama (`dogrulama.ts`), 3D yerleşim (`gorunum.ts`), board çizimleri (`cizim.ts`), tel renkleri (`renk.ts`) |
| `cpu16/breadboard/panolar.ts` | panoların tanımı: board ızgarası, bölgeler, aşamalar ve testleri, makinedeki sıra |
| `cpu16/breadboard/yerlesim.ts` | CPU16 kartlarının yerleşimi: uyarlayıcı, besleme girişleri, elle yerleşen parçalar, tavlama |
| `cpu16/breadboard/plan.ts` | kartın ve bütün makinenin planı, panoların masadaki yeri, şerit kablo, doğrulama, 3D yerleşim |
| `cpu16/breadboard/besleme.ts`, `renk.ts` | besleme bütçesi; renk kodu (PCB belgeleriyle aynı) |
| `cpu16/breadboard/veri/` | üretilmiş yerleşim ve teller (kart başına), netlistin parmak iziyle |
| `cpu16/breadboard/cli.ts`, `belge.ts`, `belge-cli.ts` | `breadboard` ve `breadboard-belge` komutları, belge üreteci |
| `src/board3d/aktif.ts`, `Breadboard3D.tsx`, `bbKurulum.ts`, `BbKurulumPanel.tsx` | 3D görünüm seçimi, panolar ve şerit kablo, kurulum modu |
