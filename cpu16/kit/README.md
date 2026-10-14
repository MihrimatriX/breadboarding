# CPU16 deney seti

Tamamen 74HC entegrelerinden, breadboard üzerinde, adım adım bir 16 bit bilgisayar. Her deney bir
video, simülatörde bir sahne ve gerçek kartta bir modüldür. Sonunda kendi C derleyicimizle yazılmış
yılan oyunu VGA ekranda oynanır.

Her deney dosyasının sonundaki **Malzeme ve bağlantılar** bölümü kart tanımlarından (`cpu16/board/*.ts`)
otomatik üretilir: hangi entegre takılır, hangi bacak hangi nete gider, hangi sinyaller henüz kurulmamış
bloklardan geleceği için o deneyde elle sürülür. Şema değişirse rehber de değişir
(`npm run cpu16 -- kit`); testler depodaki rehberlerin güncel olduğunu denetler. Aynı netler KiCad
şemalarında (`cpu16/kicad/<kart>/`) ve 3D görünümde (Silikon3D → "CPU16 kartı 3D") aynı adlarla durur.

Fiziksel kurulum için her kartın ayrıca bir **kurulum belgesi** vardır (`npm run cpu16 -- kurulum hepsi`,
[docs/kurulum.md](../docs/kurulum.md)): yerleşim haritası, her çipin besleme pinleri ve dekuplajı,
blok blok numaralı tel listesi (renk kodu, nereden → nereye; PCB'de bip testi listesi), çip çip pin
kartları ve kenar konnektörü; yanında KiCad şemasının PDF'i ve bir kurulum el kitabı (breadboard,
PCB montajı, wire-wrap).

## İki yol: PCB ya da breadboard panoları

Deneyler bitince bilgisayarın kartları iki yoldan kalıcı hâle gelir:

- **PCB**: kartlar KiCad şemalarından üretilir, çipler soketlere takılır; kurulum belgelerindeki tel
  listesi bip testi listesidir ([docs/kurulum.md](../docs/kurulum.md)).
- **Breadboard panoları**: her kart kendi panosunda (bir taban plakasında bir grup BB830; saat kartı
  5, CPU 55, bellek ve önbellek 12'şer, G/Ç 18, video 21, kendin yap bellek 6 board), kartlar arası
  bütün bağlantılar 64 damarlı bir şerit kablodan geçer (arka panel). Her panonun belgesi delikten deliğe
  yazılmıştır: board board yerleşim çizimleri, aşama aşama numaralı tel listesi (her aşama bir
  deneyin bloğu, sonunda testi), kesim listesi, malzeme
  (`npm run cpu16 -- breadboard-belge hepsi`, [docs/breadboard.md](../docs/breadboard.md)).
  Uygulamada aynı teller: Silikon3D → CPU16 kartı 3D → Görünüm: Breadboard → Kurulum.

Deneylerdeki "Malzeme ve bağlantılar" tabloları iki yolda da aynıdır (hangi bacak hangi nete gider);
breadboard panolarında bu bağlantıların hangi delikten hangi deliğe takılacağı panonun belgesindedir.

## Deneyler

**Başlamadan önce:** [LED, direnç ve kondansatör](led-ve-direnc.md): renk kodunu okuma, LED'in kutbu ve
seri direnci, çekme dirençleri, SIP direnç dizileri, 100 nF dekuplaj ve breadboard yerleşimi, çizimlerle.
Deney 1'den önce bir kez oku; her deneyde aynı parçalar tekrar karşına çıkar.

| # | Deney | Kurulan | Sonuç |
|---|---|---|---|
| 1 | [Saat ve reset kartı](deney-01-saat.md) | saat kartı (9 entegre) | LED'de saat, ADIM butonuyla tek döngü |
| 2 | [Kapılar ve CMOS transistörler](deney-02-kapilar.md) | 74HC00, isteğe bağlı 4 MOSFET | NAND doğruluk tablosu, NAND'ın içi |
| 3 | [EEPROM programlayıcı](deney-03-programlayici.md) | Arduino Nano + 2 × 74HC595 + ZIF | 28C256 programlanır ve doğrulanır |
| 4 | [Register dosyası ve veriyolu](deney-04-register.md) | 8 × 16 bit register | anahtarlardaki değer register'a yazılır, geri okunur |
| 5 | [ALU ve bayraklar](deney-05-alu.md) | TA, TB, ALU, ALU kod çözücü, bayraklar | toplama, çıkarma, mantık, kaydırma; NZCV |
| 6 | [Program sayacı ve komut çekme](deney-06-komut-cekme.md) | PC, MAR, IR, bellek arayüzü | PC yürür, komut IR'ye çekilir |
| 7 | [Mikrokod ve kontrol birimi](deney-07-mikrokod.md) | kapılarla kurulu kontrol birimi, sabit birimi | CPU çalışır: NOP döngüsü, HALT |
| 8 | [Bellek kartı ve ilk program](deney-08-bellek.md) | bank'lı bellek: 32 KB EEPROM + 128 KB RAM, FF00 LED mandalı | ilk program EEPROM'dan 128 KB RAM'i sınar, LED'lerde `0x5A` |
| 9 | [Bekleme durumları ve önbellek](deney-09-onbellek.md) | önbellek kartı | önbellek açıkken kayan ışık ≈ 1,4 kat hızlı |
| 10 | [G/Ç kartı](deney-10-gc.md) | UART, zamanlayıcı, kesmeler, PS/2 | bilgisayarla seri haberleşme, klavye |
| 11 | [Video kartı](deney-11-video.md) | VGA 80 × 30 metin | ekranda "Merhaba", 16 renk, kare sayacı |
| 12 | [BIOS, önyükleyici ve Web Serial](deney-12-bios.md) | yazılım | tarayıcıdan karta program yükleme |
| 13 | [C derleyicisi: yılan oyunu](deney-13-c.md) | yazılım | C ile yazılmış oyun ekranda |
| 14 | [Kendin yap bellek](deney-14-kendin-yap-bellek.md) | 16 bayt RAM: 16 × 74HC574 | bir 62256'nın içi açıkta; terminalde baytlar |

Sıra donanımın bağımlılığına göredir: saat ve programlayıcı her şeyden önce gelir (programlar ve
karakter ROM'u 28C256'ya yazılır), CPU blok blok kurulur, sonra anakart kartları eklenir. CPU kartında
ROM yok: mikrokod ve ALU kod çözme 74HC kapılarıyla kurulu (Deney 5 ve 7). Deney 14 bir eğitim
kartıdır: bilgisayarın çalışması için gerekmez, 13 deneyin bilgisayarına sonradan takılır.

## Gereken araçlar

| Araç | Neden |
|---|---|
| 5 V, en az 2 A ayarlı/akım sınırlı güç kaynağı | Tam bilgisayar ≈ 400 entegre; ilk açılışta akım sınırı kısa devreyi yakalar |
| Breadboard (830 delik) × 25–35, tek göbekli 0,5 mm kablo | CPU kartı tek başına ≈ 195 entegre. Bütün bilgisayar breadboard panolarında: 134 board, ≈ 820 m 22 AWG tel ([docs/breadboard.md](../docs/breadboard.md)) |
| Multimetre | besleme ve seviye ölçümü |
| Lojik prob ya da 8 kanallı USB lojik analizör (sigrok / PulseView) | saat, UART, PS/2, VGA zamanlaması |
| Arduino Nano (klon olur) + ZIF-28 soket | EEPROM programlayıcı (Deney 3) |
| Yardımcı modül: 16 LED gösterge | 2 × 74HC541 + 16 LED + 16 × 1 kΩ: bir veriyolunu yüklemeden izler |
| Yardımcı modül: 16 bit anahtar girişi | 2 × 8'li DIP anahtar + 16 × 2,2 kΩ: veriyolunu "zayıf" sürer, çıkışlar ezer |

LED'leri veriyoluna doğrudan bağlama: hattı yükler, seviye 1 sayılmayabilir. Gösterge modülünün
74HC541'i hattı yüklemeden LED'i sürer. Anahtar girişi 2,2 kΩ ile sürdüğü için, bir register veriyolunu
sürdüğünde onu ezmez (veriyolundaki 10 kΩ çekme direnciyle birlikte 1 seviyesi ≈ 4 V). CPU kartının
kendi veriyolu çubuk göstergeleri (DS1, DS2, 1 kΩ'luk segmentler) takılıyken anahtar girişi hattı
1'e çıkaramaz (≈ 2,7 V): anahtarla sürerken RN3 ve RN4'ü yuvasından çıkar ([LED ve direnç](led-ve-direnc.md#cpu-kartının-hata-ayıklama-ledleri)).

## Genel kurallar

- Her entegrenin VCC/GND bacağı besleme hattına, yanına 100 nF. Her breadboard'un besleme rayına 100 µF
  ([neden](led-ve-direnc.md#dekuplaj-her-entegrenin-yanında-100-nf)).
- CMOS girişi asla boşta bırakılmaz: tabloda **GND** ve **VCC** satırları sabit bağlanan girişleri,
  "▶ elle sür" notu henüz kurulmamış bir bloktan gelecek girişleri gösterir. O girişleri bir anahtar ve
  10 kΩ çekme direnciyle sür; blok kurulunca anahtarı çıkar.
- Önce simülatörde dene: her deneyin "Simülatörde" bölümü aynı devreyi kapı seviyesinde çalıştırır.
  Gerçek kart farklı davranıyorsa aynı net adını simülatörde seç ve seviyeleri karşılaştır.
- Kartlar arası bağlantı arka panel sinyalleriyle yapılır (`cpu16/docs/kartlar.md`, "Arka panel").
  Breadboard panolarında bu, koridorda uzanan 64 damarlı şerit kablodur: her panoda kartın kenar
  konnektörünün yerinde bir şerit kablo uyarlayıcısı, kablonun üstünde her pano için bir IDC soketi
  ([docs/breadboard.md](../docs/breadboard.md#arka-panel-şerit-kablo)). Deneylerde henüz bir kart
  yokken o karttan gelecek sinyaller elle sürülür (tablolardaki "▶ elle sür").

## Sorun giderme (genel)

| Belirti | Olası sebep |
|---|---|
| Entegre ısınıyor | iki çıkış aynı nette (üç durumlu çıkışın ~OE'si yanlış), ters takılmış entegre |
| Davranış dokunmayla değişiyor | boşta kalmış giriş; tablodaki GND/VCC satırlarını kontrol et ([çekme dirençleri](led-ve-direnc.md#çekme-dirençleri-pull-up-pull-down)) |
| LED yanmıyor, sönük ya da çip ısınıyor | LED'in kutbu, seri direncin değeri ([LED ve seri direnç](led-ve-direnc.md#seri-direnç-ledi-her-zaman-bir-dirençle-sür)) |
| Saat hızlanınca bozuluyor | dekuplaj eksik, uzun saat kabloları; ADIM kipinde doğru çalışıyorsa zamanlama sorunu |
| EEPROM'dan yanlış veri | çip doğru sokette mi (etiket), programlayıcıda SUM doğrulaması |
| Simülatörle farklı | aynı programı simülatörde ADIM kipinde yürüt, ilk farklı netin sürücüsünü bul |
