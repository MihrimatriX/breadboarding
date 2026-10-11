# CPU16 deney seti

Tamamen 74HC entegrelerinden, breadboard üzerinde, adım adım bir 16 bit bilgisayar. Her deney bir
video, simülatörde bir sahne ve gerçek kartta bir modüldür. Sonunda kendi C derleyicimizle yazılmış
yılan oyunu VGA ekranda oynanır.

Her deney dosyasının sonundaki **Malzeme ve bağlantılar** bölümü kart tanımlarından (`cpu16/board/*.ts`)
otomatik üretilir: hangi entegre takılır, hangi bacak hangi nete gider, hangi sinyaller henüz kurulmamış
bloklardan geleceği için o deneyde elle sürülür. Şema değişirse rehber de değişir
(`npm run cpu16 -- kit`); testler depodaki rehberlerin güncel olduğunu denetler. Aynı netler KiCad
şemalarında (`cpu16/kicad/<kart>/`) ve 3D görünümde (Silikon3D → "CPU16 kartı 3D") aynı adlarla durur.

## Deneyler

| # | Deney | Kurulan | Sonuç |
|---|---|---|---|
| 1 | [Saat ve reset kartı](deney-01-saat.md) | saat kartı (9 entegre) | LED'de saat, ADIM butonuyla tek döngü |
| 2 | [Kapılar ve CMOS transistörler](deney-02-kapilar.md) | 74HC00, isteğe bağlı 4 MOSFET | NAND doğruluk tablosu, NAND'ın içi |
| 3 | [Flash programlayıcı](deney-03-programlayici.md) | Arduino Nano + 2 × 74HC595 + ZIF | ROM'lar programlanır ve doğrulanır |
| 4 | [Register dosyası ve veriyolu](deney-04-register.md) | 8 × 16 bit register | anahtarlardaki değer register'a yazılır, geri okunur |
| 5 | [ALU ve bayraklar](deney-05-alu.md) | TA, TB, ALU, bayraklar | toplama, çıkarma, mantık, kaydırma; NZCV |
| 6 | [Program sayacı ve komut çekme](deney-06-komut-cekme.md) | PC, MAR, IR, bellek arayüzü | PC yürür, komut IR'ye çekilir |
| 7 | [Mikrokod ve kontrol birimi](deney-07-mikrokod.md) | kontrol birimi, sabit birimi | CPU çalışır: NOP döngüsü, HALT |
| 8 | [Bellek kartı ve ilk program](deney-08-bellek.md) | bank'lı 1 MB bellek, Flash, FF00 LED mandalı | ilk program Flash'tan 512 KB RAM'i sınar, LED'lerde `0xA5` |
| 9 | [Bekleme durumları ve önbellek](deney-09-onbellek.md) | önbellek kartı | önbellek açıkken kayan ışık ≈ 1,4 kat hızlı |
| 10 | [G/Ç kartı](deney-10-gc.md) | UART, zamanlayıcı, kesmeler, PS/2 | bilgisayarla seri haberleşme, klavye |
| 11 | [Video kartı](deney-11-video.md) | VGA 80 × 30 metin | ekranda "Merhaba", 16 renk, kare sayacı |
| 12 | [BIOS, önyükleyici ve Web Serial](deney-12-bios.md) | yazılım | tarayıcıdan karta program yükleme |
| 13 | [C derleyicisi: yılan oyunu](deney-13-c.md) | yazılım | C ile yazılmış oyun ekranda |

Sıra donanımın bağımlılığına göredir: saat ve programlayıcı her şeyden önce gelir (ALU ve mikrokod
ROM'ları programlanmadan CPU çalışmaz), CPU blok blok kurulur, sonra anakart kartları eklenir.

## Gereken araçlar

| Araç | Neden |
|---|---|
| 5 V, en az 2 A ayarlı/akım sınırlı güç kaynağı | Tam bilgisayar ≈ 300 entegre; ilk açılışta akım sınırı kısa devreyi yakalar |
| Breadboard (830 delik) × 20–30, tek göbekli 0,5 mm kablo | CPU kartı tek başına ≈ 150 entegre |
| Multimetre | besleme ve seviye ölçümü |
| Lojik prob ya da 8 kanallı USB lojik analizör (sigrok / PulseView) | saat, UART, PS/2, VGA zamanlaması |
| Arduino Nano (klon olur) + ZIF-32 soket | Flash programlayıcı (Deney 3) |
| Yardımcı modül: 16 LED gösterge | 2 × 74HC541 + 16 LED + 16 × 1 kΩ: bir veriyolunu yüklemeden izler |
| Yardımcı modül: 16 bit anahtar girişi | 2 × 8'li DIP anahtar + 16 × 2,2 kΩ: veriyolunu "zayıf" sürer, çıkışlar ezer |

LED'leri veriyoluna doğrudan bağlama: hattı yükler, seviye 1 sayılmayabilir. Gösterge modülünün
74HC541'i hattı yüklemeden LED'i sürer. Anahtar girişi 2,2 kΩ ile sürdüğü için bir register veriyolunu
sürdüğünde onu ezmez (veriyolundaki 10 kΩ çekme direnciyle birlikte 1 seviyesi ≈ 4 V).

## Genel kurallar

- Her entegrenin VCC/GND bacağı besleme hattına, yanına 100 nF. Her breadboard'un besleme rayına 100 µF.
- CMOS girişi asla boşta bırakılmaz: tabloda **GND** ve **VCC** satırları sabit bağlanan girişleri,
  "▶ elle sür" notu henüz kurulmamış bir bloktan gelecek girişleri gösterir. O girişleri bir anahtar ve
  10 kΩ çekme direnciyle sür; blok kurulunca anahtarı çıkar.
- Önce simülatörde dene: her deneyin "Simülatörde" bölümü aynı devreyi kapı seviyesinde çalıştırır.
  Gerçek kart farklı davranıyorsa aynı net adını simülatörde seç ve seviyeleri karşılaştır.
- Kartlar arası bağlantı arka panel sinyalleriyle yapılır (`cpu16/docs/kartlar.md`, "Arka panel").
  Breadboard'da bu, kartlar arasında aynı adlı netleri birleştiren uzun kablolardır.

## Sorun giderme (genel)

| Belirti | Olası sebep |
|---|---|
| Entegre ısınıyor | iki çıkış aynı nette (üç durumlu çıkışın ~OE'si yanlış), ters takılmış entegre |
| Davranış dokunmayla değişiyor | boşta kalmış giriş; tablodaki GND/VCC satırlarını kontrol et |
| Saat hızlanınca bozuluyor | dekuplaj eksik, uzun saat kabloları; ADIM kipinde doğru çalışıyorsa zamanlama sorunu |
| Flash'tan yanlış veri | çip doğru soketde mi (etiket), programlayıcıda SUM doğrulaması |
| Simülatörle farklı | aynı programı simülatörde ADIM kipinde yürüt, ilk farklı netin sürücüsünü bul |
