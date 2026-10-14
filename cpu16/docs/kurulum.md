# CPU16 — Kurulum belgeleri

Kartları fiziksel olarak kurarken "hangi bacak nereye" sorusunun cevabı: kart başına yazdırılabilir
bir kurulum belgesi (A4, HTML + PDF), yanında KiCad şemasının PDF'i ve genel bir kurulum el kitabı.
Hepsi kart tanımlarından (`cpu16/board/*.ts`) üretilir; şema değişirse belgeler de değişir.

Bilgisayarın iki kurulum yolu var. Bu belgedeki tel listeleri **pinden pine**dir: PCB'de bip testi,
deneylerde breadboard'da takılacak teller. Bütün bilgisayarı **breadboard'da** kurmak için ayrı,
**delikten deliğe** belgeler vardır: her kart kendi panosunda (bir grup BB830), board board yerleşim
çizimleri, aşama aşama numaralı tel listesi, kesim listesi; kartlar arası 64 damarlı şerit kablo
(`npm run cpu16 -- breadboard-belge hepsi`, [breadboard.md](breadboard.md)).

```sh
npm run cpu16 -- kurulum hepsi            # bilgisayarın bütün kartları + el kitabı → cpu16/kurulum/cikti/
npm run cpu16 -- kurulum cpu              # tek kart
npm run cpu16 -- kurulum hepsi -o dizin   # başka bir dizine
npm run cpu16 -- kurulum hepsi --html     # yalnız HTML (PDF ve şema PDF'i yok)
npm run cpu16 -- kurulum hesap            # 8 bit hesap makinesi (bağımsız alet, "hepsi"ye girmez; rehberi hesap8/docs/)
```

Çıktı (depoya girmez, `.gitignore`):

```
cikti/README.md                     dizin: kartlar, sayfa ve tel sayıları
cikti/kurulum-el-kitabi.pdf|html    genel el kitabı
cikti/<kart>/<kart>-kurulum.pdf|html  kart belgesi
cikti/<kart>/<kart>-sema.pdf        KiCad şeması (kicad-cli sch export pdf)
```

PDF'ler Chromium ile basılır (`playwright` paketi depoda ya da global kurulu olmalı); bulunamazsa
yalnızca HTML yazılır, HTML tarayıcıda açılıp "Yazdır → PDF" ile basılabilir. Şema PDF'i için
`kicad-cli` (KiCad 7) gerekir.

## Kartlar ve yollar

Deneyler (1–8) breadboard'da kurulur; tam bilgisayar PCB'de (kartlar KiCad şemalarından, çipler
soketlerde) ya da breadboard panolarında ([breadboard.md](breadboard.md): yedi pano, 149 board, şerit
kablo). Bu belgelerin tel listesi pinden pinedir: deneylerin breadboard'unda takılacak teller, PCB'de
bip testi listesi. Breadboard panolarının delikten deliğe tel listesi breadboard belgelerindedir.

| Kart | Deney | Kaynak tanım | Yol |
|---|---|---|---|
| `clk` saat ve reset | 1 | test bilgisayarı | breadboard → PCB ya da breadboard panosu |
| `prog` EEPROM programlayıcı | 3 | programlayıcı | breadboard |
| `cpu` CPU | 4–7 | test bilgisayarı | breadboard → PCB ya da breadboard panosu |
| `mem` test bellek kartı (yalnız FF00 mandalı) | 8 | test bilgisayarı | breadboard |
| `bellek` | 8 | anakart | breadboard → PCB ya da breadboard panosu |
| `onbellek` | 8, 9 | anakart | breadboard → PCB ya da breadboard panosu |
| `gc`, `video`, `kyb` | 10, 11, 14 | anakart | PCB ya da breadboard panosu |

Kaynak tanım KiCad şemasınınkiyle aynıdır (`board/kicad-files.ts`), böylece adsız netlerin adları
(N123) belgede ve şemada aynıdır. CPU ve saat kartının çipleri ve telleri test bilgisayarında ve
anakartta aynıdır (test bunu denetler). Test bellek kartının RAM bloğu yalnızca simülasyondadır
(`kit/deneyler.ts`, `SADECE_SIM`) ve belgeye girmez.

## Kart belgesinin bölümleri

1. **Kapak**: kartın işi, entegre / pasif / tel / besleme ucu sayıları, deneyler, kurulum yolu.
2. **Malzeme**: entegreler (74AC ailesi ayrı değerle), pasifler, PCB için soketler, besleme bütçesi.
3. **Nasıl kullanılır** ve **tel renk kodu**.
4. **Yerleşim haritası**: önerilen yerleşim (3D görünümle aynı, `board/layout.ts`), bloklar renkli,
   20 mm'lik ızgara (çiplerin "yer"i, ör. C4). Çentik solda, 1. pin sol altta.
5. **Kurulum sırası** ve **blok haritaları**: bloklar deney sırasıyla; her bloğun çipleri, kapısı
   kullanılan yapıştırıcı çipleri, pasifleri ve tel aralığı.
6. **Besleme**: her çipin VCC / GND pini, dekuplajı, sabit 0 / sabit 1 girişleri; pasiflerin besleme uçları.
7. **Tel listesi**: işaret kutusu, tel numarası, renk (kutucuk + adı), nereden → nereye, net, ≈ mm.
8. **Çip kartları**: DIP pin düzeni (çentik yukarıda), her pinin neti, rengi, arka panel pini ve telleri.
9. **Pasif elemanlar**, **kenar konnektörü** (2 × 32 arka panel; bu kartın sürdüğü / okuduğu pinler), **şema**.

## Tel listesi nasıl üretilir

`kurulum/plan.ts`, `kurulumPlani(board, kart)`:

- Her sinyal netinin (VCC / GND hariç) karttaki uçları (çip pinleri, pasif uçları, kenar konnektörü)
  bir ağaçla bağlanır: tel sayısı = uç sayısı − 1, farklı netler arasında tel yok.
- Ağaç **blok blok** büyür. Bloklar kurulum sırasındadır: önce besleme ve kenar konnektörü, sonra
  deney sırası (`kit/deneyler.ts`), aynı deneyde tanım sırası; yapıştırıcı çipinin pini kapısının
  bloğundadır. Bir bloğun uçları kendi aralarında en yakın komşu zinciriyle (2-opt ile kısaltılmış)
  dizilir ve önceki blokların ağacına en yakın noktadan (tercihen zincirin ucundan) bağlanır. Böylece
  her blok bitince o ana kadar kurulan blokların bütün bağlantıları tamamdır ve test edilebilir.
- Uzaklık önerilen yerleşimde pinler arası dik açılı yoldur; bir uca en çok üç tel gelir
  (breadboard sütununda dört boş delik var; wire-wrap pini üç sarım taşır).
- Teller blok, sınıf (renk) ve net adı sırasıyla numaralanır: `T0001` … Numara kart içindedir ve
  şema değişirse kayabilir; belgenin tarihi kapakta yazılıdır.

## Tel renk kodu

Sınıf net adından çıkarılır (`sinyalSinifi`; kart önekleri `GC_`, `V_`, `C_`, `M_`, `K_` ve `~` yok sayılır).

| Renk | Sınıf | Hatlar |
|---|---|---|
| kırmızı | besleme +5 V | VCC, sabit 1 girişleri |
| siyah | toprak | GND, sabit 0 girişleri |
| sarı | adres | A0..A15, PA14..PA19, bellek ve VRAM adresleri, bank register'ları |
| mavi | veri | DE / DO, BUS, register, ALU ve bellek veri hatları |
| turuncu | seçim ve yetki | ~CE, ~CS, ~OE, ~WE, ~MRD, ~MWE_E/O, seçici çıkışları, sürücü izinleri |
| yeşil | kontrol | mikrokod kelimesi, bayraklar, diğer lojik |
| beyaz | saat | CLK, OSC, TCLK, piksel / karakter saati, kaydırma ve mandal saatleri |
| mor | reset ve kesme | ~RESET, ~RST, IRQ, ~INT, VSYNC_REQ |
| kahverengi | dış bağlantı | LED, buton, RC, VGA, PS/2, UART konnektör hatları |

Belgelerde rengin adı her kutucuğun yanında yazılıdır: siyah-beyaz baskıda da okunur.

## El kitabı

`kurulum/el-kitabi.ts`: belgeler ve iki yol (breadboard, PCB), araçlar ve malzeme, tel renk standardı,
listelerin okunuşu (gerçek bir çip kartı örneğiyle), besleme dağıtımı ve dekuplaj, çip yönü,
blok blok kurma ve test (deney rehberleri, `kart-testi`), breadboard ve PCB montajı (soketler, lehim
sırası, çıplak kart ve bip testi), sık yapılan hatalar, ekte wire-wrap.

## Testler

`tests/kurulum.test.ts`, beklenen uçları plandan bağımsız olarak kart tanımından hesaplar:

- her kartın tel listesi her sinyal netinin uçlarını tam bağlar (yayılan ağaç: bağlı ve tel sayısı
  Σ(uç − 1)), farklı netler arasında tel yok, aynı tel iki kez yok;
- numaralar benzersiz ve sıralı, plan her seferinde aynı; CPU ve saat kartı iki bilgisayar tanımında
  aynı teller; bir uca en çok üç tel;
- blok blok her ara durumda kurulan blokların bütün bağlantıları tamam;
- her çipin besleme pinleri, sabit girişleri ve dekuplajı listeli; pin tablolarında her tel iki
  ucuyla; kenar konnektörü arka panel düzeninde; net adları KiCad şemasındaki etiketlerle aynı;
- anakartın bütün kartlarında tel ve besleme ucu toplamları.
