# C örnekleri: CPU16'da C ile programlama

CPU16 için yazılmış C programlarının rehberli turu. Örnekler kolaydan zengine sıralıdır; her biri hem
C'nin bir konusunu hem de CPU16'nın bir özelliğini (16 bitlik int, yazılımla çarpma / bölme, bellek
eşlemeli G/Ç, VGA, kesmeler) öğretir. Her dosyanın başındaki açıklama ne gösterdiğini, nasıl
çalıştırıldığını ve beklenen çıktıyı yazar; satır içi yorumlar da CPU16'da neler olduğunu anlatır.

Derleyicinin kendisi (desteklenen C, ABI, bağlayıcı): [cc16.md](cc16.md). BIOS çağrıları ve monitör:
[bios.md](bios.md). G/Ç register'ları: [anakart.md](anakart.md#gç-haritası-0xff000xffff).

## İki tür örnek

| | BIOS örnekleri | Düz bellek örnekleri |
|---|---|---|
| Yer | `cpu16/bios/ornekler/*.c` | `cpu16/programs/c/*.c`, `cpu16/programs/merhaba.c` |
| Makine | anakart + BIOS: VGA ekran, PS/2 klavye, UART, zamanlayıcı | 64 KB düz RAM'li referans emülatör |
| Derleme hedefi | `--hedef bios`: RAM'e `0x4000`'dan yüklenir, monitörden `G 4000` | varsayılan `rom`: `0x0000`'dan, kendi vektörleriyle |
| `printf` nereye | VGA ekrana ve UART'a (BIOS `PUTC`) | UART'a (`0xFF00`) |
| Uygulamada | CPU16 tezgâhı → **Anakart + BIOS** → örnek listesinin "C" grubu | yalnız `merhaba.c`: CPU16 tezgâhı → **Düz bellek** |
| Gerçek kartta | Web Serial ya da monitörün `L` komutuyla yüklenir | EEPROM'a yazılır |

## Nasıl çalıştırılır

**Uygulamada:** CPU16 tezgâhı → Anakart + BIOS → örnek listesinden bir C programı seç →
**Derle ve RAM'e yükle** (Ctrl+Enter). Uygulama gerçek karttaki akışı izler: makineyi resetler, BIOS
açılır, program UART önyükleyicisiyle Intel HEX olarak yüklenir ve `G 4000` ile başlar. Kaynak
düzenlenebilir; değişiklikler tarayıcıda saklanır, "örneğe dön" aslına döndürür. Klavye isteyen
programlarda (hesap, hayat, yılan) önce ekrana tıkla: tuşlar PS/2 klavyeden gider. UART terminaline
tıklayıp yazmak da olur: BIOS ikisini de okur.

**Komut satırında** (depo kökünde; komutlar hep bu dizinden):

```sh
npm run cpu16 -- cc cpu16/bios/ornekler/kalbur.c --hedef bios --run      # anakart modelinde çalıştır, sonra ekranı yaz
printf '2+3*4\n\n' | npm run cpu16 -- cc cpu16/bios/ornekler/hesap.c --hedef bios --run   # girdi borudan
npm run cpu16 -- machine cpu16/bios/ornekler/hesap.c                     # etkileşimli, gerçek zamanlı (çıkış: Ctrl-])
npm run cpu16 -- cc cpu16/bios/ornekler/hayat.c --hedef bios -o hayat.hex   # gerçek kart için Intel HEX
npm run cpu16 -- cc cpu16/bios/ornekler/sayilar.c --hedef bios -o sayilar.s # üretilen assembly'yi incele
npm run cpu16 -- cc cpu16/programs/c/fib.c --run                         # düz bellek örneği
```

- `--run` ile BIOS örneği: BIOS açılır, program RAM'e konur, `G 4000` gönderilir; UART çıktısı
  terminale akar, program monitöre dönünce (en çok `--max` döngü, varsayılan 50 milyon = 12,5 s)
  VGA ekranının son hali yazılır. stdin bir boru ya da dosyaysa içeriği programa UART'tan klavye
  girdisi gibi gider; terminalden çalıştırırken beklememesi için `< /dev/null` verilebilir.
- `machine dosya.c` programı derler, önyükleyiciyle yükler ve çalıştırır; makine 4 MHz'te gerçek
  zamanlı çalışır, terminal UART'a bağlıdır. Toplu kip: `--cycles N --screen`.
- Gerçek kart: `.hex` dosyası Web IDE'nin "Karta gönder (Web Serial)" düğmesiyle ya da monitörün `L`
  komutuna bir seri terminalden gönderilir ([bios.md](bios.md#önyükleyici-protokolü-uart-115200-8n1)).

## Önerilen sıra

| # | Program | C konusu | CPU16 tarafı | Süre (4 MHz) |
|---|---|---|---|---|
| 1 | [`yeni.c`](#yenic-ve-selamc) | boş şablon: `printf`, döngü, fonksiyon | `ekran_yaz` ile tek hücre | anlık |
| 2 | [`selam.c`](#yenic-ve-selamc) | `printf`, özyineleme | renkler, BIOS tıkıyla süre ölçümü | 0,3 s |
| 3 | [`sayilar.c`](#sayilarc-sayılar-ve-tabanlar) | onluk / hex / ikilik yazmak, taşma, `char` | 16 bitlik int, ikiye tümleyen, bölme yok | 0,25 s |
| 4 | [`uzun.c`](#uzunc-32-bit-ve-işlemlerin-maliyeti) | `long`, taşmayı yakalamak, fonksiyon işaretçisi tablosu | ADD + ADC, `__mul32` / `__div32`, döngü sayımı | 2 s |
| 5 | [`kalbur.c`](#kalburc-bit-dizisiyle-eratosthenes) | bit dizisi, bit işlemleri, 16 bitlik döngü tuzağı | `.bss`, LBU / SB, tablo ile maske | 2,6 s |
| 6 | [`siralama.c`](#siralamac-sıralama-yarışı) | algoritma karmaşıklığı, `qsort`, işaretçiler | dizi indeksleme maliyeti, yığın derinliği | 3,7 s |
| 7 | [`liste.c`](#listec-bağlı-liste-ve-malloc) | `struct`, `malloc` / `free`, işaretçiye işaretçi | 16 bitlik adresler, malloc başlığı, `offsetof` | 0,4 s |
| 8 | [`hesap.c`](#hesapc-hesap-makinesi) | satır okuma, özyinelemeli iniş ayrıştırıcısı | klavye kesmesi → BIOS halka tamponu | etkileşimli |
| 9 | [`sabit.c`](#sabitc-sabit-noktalı-sayılar) | `float` olmadan kesir: Q4.12 | 32 bitlik ara sonuç, VRAM'e çizim | 0,5 s |
| 10 | [`ekran.c`](#ekranc-vgaya-doğrudan-yazmak) | `volatile`, UTF-8 çözme, `sprintf` | VADDR / VDATA portları, CP857, vsync | 5 s |
| 11 | [`kesme.c`](#kesmec-kesmeler) | kesme işleyicisi, kritik bölge (`di` / `ei`) | IRQ yolu, BIOS kancası, `HALT` | 1,8 s |
| 12 | [`hayat.c`](#hayatc-hayat-oyunu) | algoritma seçimi, 2'nin kuvveti boyutlar | yalnız değişeni çiz, `halt()` ile bekle | 10 s |
| 13 | [`yilan.c`](#yilanc) | oyun döngüsü, halka tampon | klavye, zamanlayıcı, VRAM | etkileşimli |

Programların hepsi 1,5–4 KB kod tutar; UART'tan (115 200 baud) bir iki saniyede yüklenir. Süreler
simülatörün 4 MHz'i içindir; 1 MHz'te çalışan gerçek kartta 4 kat uzar
([Deney 13](../kit/deney-13-c.md#sonra-diğer-c-örnekleri)).

### yeni.c ve selam.c

`yeni.c` kendi programın için başlangıç şablonudur: `printf` ile çarpım tablosu ve ekranın sağ üst
köşesine `ekran_yaz` ile bir yıldız. `selam.c` renkleri (`bios_setattr(RENK(SARI, MAVI))`), özyinelemeli
`fib(18) = 2584`'ü ve geçen süreyi BIOS'un 10 ms'lik tık sayacıyla (`bios_ticks`) gösterir.

### sayilar.c: sayılar ve tabanlar

`printf` kullanmadan sayı yazmak: onluk (`% 10` ve `/ 10`), onaltılık (4 bitlik kaydır ve maskele) ve
ikilik (en üst biti sına, 1 sola kaydır). Aynı 16 bitin `int` ve `unsigned` olarak iki okunuşu yan
yana; ardından taşmalar:

```
 32767      32767  7FFF  0111 1111 1111 1111
-32768      32768  8000  1000 0000 0000 0000
  32767 + 1        = -32768
  1000 * 100       = -31072
  char 200 + 100   = 300        (işlemden önce int'e terfi)
  char'a yazinca   = 44
```

Öğrenilecek: CPU16'da bölme komutu yok, `v / 10` bir `__udiv16` çağrısıdır (16 turluk döngü); hex
yazmak bu yüzden onluktan çok daha ucuzdur. `-(-32768)` yine `-32768`'dir: işaretli yazmada mutlak
değer işaretsiz aritmetikle alınır. Program `printf`'i bağlamadığı için 1,5 KB'tır (`printf` tek başına
≈ 1,6 KB); kod boyunu bağlayıcının `__data_load` sembolünden okur.

Dene: `ORNEKLER` dizisine kendi sayılarını ekle; `yaz_hex`'i 2 basamakla çağırıp bayt yaz.

### uzun.c: 32 bit ve işlemlerin maliyeti

Faktöriyel 16 ve 32 bitte yan yana (`9!` 16 bitte taşar, `13!` 32 bitte), Fibonacci'nin her genişlikteki
en büyük terimi (`fib(24) = 46368`, `fib(47) = 2971215073`) ve C'de taşmayı yakalamanın iki yolu
(`a + b < a`, `f * n / n != f`). Sonra her işlemin süresi ölçülür:

```
  a + b    16 bit              55 dongu    13 us
  a + b    32 bit              80 dongu    20 us
  a * 10   16 bit, sabit       55 dongu    13 us
  a * b    16 bit, b=10       185 dongu    46 us
  a * b    16 bit, b=30000    445 dongu   111 us
  a * b    32 bit, b=891      565 dongu   141 us
  a / b    16 bit             685 dongu   171 us
  a / b    32 bit            1885 dongu   471 us
```

(Değerler `volatile` değişkenlerin bellekten okunup yazılmasını da içerir.) Çarpma süresi çarpanın bit
sayısına bağlıdır: `__mul16` çarpan sıfırlanınca durur. Sabitle çarpmayı derleyici kaydırma ve
toplamaya çevirir (`a * 10` = `(a << 1) + (a << 3)`), sabit solda olsa da (`10 * a`). Ölçüm
`0xF820`'deki BIOS tık sayacını doğrudan okur: kesmenin değiştirdiği bir değişken, `volatile`.

Dene: `b16`'yı 1 ya da 0x7FFF yap, çarpma süresi nasıl değişiyor? `a32`'yi 65535'ten küçük yap: 32
bitlik bölme 16 bitlik hızlı yola girer.

### kalbur.c: bit dizisiyle Eratosthenes

65535'e kadar bütün asallar 4096 baytlık bir bit dizisinde (yalnız tek sayılar, sayı başına bir bit).
Bayt başına bir sayı 64 KB isterdi, yani CPU16'nın bütün adres alanını. Sonuç:
`pi(65536) = 6542`, en büyük 16 bitlik asal `65521`, `860` ikiz asal çifti.

Öğrenilecek: bit numarası `k` → bayt `k >> 3`, bit `k & 7`; maske `BIT[]` tablosundan, çünkü
`1 << n` CPU16'da n turluk bir döngüdür. Bitleri saymak 16 girişlik tabloyla, ikiz asalları bulmak
`asal & (asal >> 1)` ile (8 sayı birden). Ve 16 bitin tuzağı: `unsigned m` için `m <= 65535` hep
doğrudur, `for (m = p * p; m <= 65535; m += 2 * p)` hiç bitmez; kod sınırı eklemeden önce sınar.

Dene: `ISARETLE`'yi `bilesik[(k) >> 3] |= 1 << ((k) & 7)` yap ve süreyi karşılaştır.

### siralama.c: sıralama yarışı

Aynı 200 rastgele sayıyı kabarcık, seçmeli, eklemeli, hızlı sıralama ve kütüphanenin `qsort`'u
sıralar; karşılaştırma ve taşıma sayıları ile süre bir tabloda:

```
algoritma  karsilastirma  tasima  sure (tik)  sirali
kabarcik          19900   21028         153  evet
secmeli           19900     388          80  evet
eklemeli          10708   10713          65  evet
hizli              1946     804          11  evet
qsort              1503       -          28  evet
```

Algoritmalar bir fonksiyon işaretçisi tablosundan çağrılır. Hızlı sıralamanın özyineleme derinliği
ölçülür (yığın `0xF800`'dan aşağı büyür ve taşması denetlenmez). Karşılaştırıcıda `x - y` yerine
`x < y ? -1 : x > y`: 16 bitte `30000 - (-30000)` taşar. Programın kendisinde de bir 16 bit dersi var:
`N * N` (40000) `int`'e sığmaz, `(unsigned)N * (N - 1) / 2` yazılır.

Dene: `N`'yi 400 yap (kabarcık 4 kat yavaşlar, hızlı sıralama ≈ 2 kat), ya da `asil[i] = i` ile sıralı
veri ver: eklemeli sıralama en iyi durumuna (n − 1 karşılaştırma) düşer.

### liste.c: bağlı liste ve malloc

Bir metindeki kelimeler alfabetik sıralı bir bağlı listeye eklenir (`51 kelime, 38 farkli`), sonra
bir kez geçenler silinir (`free`) ve 7 kelime kalır. Düğüm `struct kelime { struct kelime *sonraki;
unsigned adet; char yazi[]; }`: esnek dizi üyesi metni düğümle aynı `malloc` bloğunda tutar.

Öğrenilecek: işaretçiye işaretçi (`struct kelime **p`) ile başa, araya ve sona eklemeyi / silmeyi tek
döngüyle yapmak; `sizeof` ve `offsetof` (`sonraki 0, adet 2, yazi 4`); düğümlerin gerçek adresleri
(`0xA0..`, BIOS hedefinde veri ve yığın (heap) `0xA000`'dan başlar). `malloc` ilk uyan bloğu verir:
silinen düğümlerin en düşük adreslisi bir sonraki `malloc`'ta yeniden kullanılır.

Dene: `METIN`'i değiştir; `yaz()`'ı en sık geçenden başlayacak şekilde yeniden yaz.

### hesap.c: hesap makinesi

Klavyeden (ya da UART terminalinden) satır okuyan bir hesap makinesi: `+ - * / %`, parantez, tekli
eksi, `0x1F` ve `0b101` yazımı, 32 bitlik sonuç onluk, hex ve ikilik. Hatalı yerin altına `^` koyar.

```
ifade: 2+3*4
  = 14  (0x0000000E, ikilik 1110)
ifade: 1/0
        ^ hata: sifira bolme
```

Öğrenilecek: özyinelemeli iniş ayrıştırıcısı; her öncelik seviyesi bir fonksiyon (`ifade` → `terim`
→ `carpan`), parantez `ifade`'yi yeniden çağırır. Tuşun yolu: PS/2 klavye → IRQ 1 → BIOS tarama kodunu
ASCII'ye çevirir → `0xF810`'daki 16 baytlık halka tampon → `bios_getline`. Boş satır ya da `q` çıkar.

Dene: `&`, `|` ve `<<` için yeni bir öncelik seviyesi (yeni bir fonksiyon) ekle.

### sabit.c: sabit noktalı sayılar

cc16'da `float` yok. Kesirli sayılar Q4.12 biçiminde: 1.0 = 4096, pi = 12868. Çarpma
`((long)a * b) >> 12` (ara sonuç 32 bit), bölme `((long)a << 12) / b`. Newton yöntemiyle karekök
(`kok(2) = 1.4141`), Taylor serisiyle sinüs (`sin 30: 0.5000`) ve ekranın altında `0..2pi` aralığında
sinüs (`*`) ve kosinüs (`o`) eğrileri. `pi * (1/3) = 1.0469 ama pi / 3 = 1.0471`: yuvarlanmış bir
sabitle çarpmak hatayı büyütür.

Dene: `GENLIK` ve `ORTA`'yı değiştir; `sin_cekirdek`'ten son terimi (`x2 / 72`) çıkar ve eğrinin
kenarlarda nasıl bozulduğuna bak.

### ekran.c: VGA'ya doğrudan yazmak

BIOS'u kullanmadan ekran: video kartının VADDR (`0xFF20`) ve VDATA (`0xFF22`) portları. Mavi desenli
zemin, gölgeli çift çizgili pencereler, 16 renk, Türkçe harfler (kaynak UTF-8, ekran CP857: küçük bir
UTF-8 çözücü) ve dikey taramayla (VSTAT, `0xFF26`) eşzamanlı seken bir "CPU16" yazısı. 5 saniye sonra
ya da bir tuşla biter; resim ekranda kalır.

Öğrenilecek: VRAM düzeni (hücre `(y·80 + x)·2`, çift adres karakter, tek adres renk), VDATA'nın her
erişimde adresi kendiliğinden artırması (okumada da: gölge yalnız renk baytını değiştirir),
`volatile`'ın neden şart olduğu, vsync beklemenin animasyonu CPU hızından bağımsız kılması.

Dene: `vsync_bekle()` çağrısını kaldır: yazı ne kadar hızlanır? `ZEMIN`'deki `0xB0`'ı `0xB1` ya da
`0xB2` yap.

### kesme.c: kesmeler

Ana program e sayısının 100 basamağını hesaplarken (`e = 2.71828182845904523536...`) dikey tarama
kesmesine bağlanmış bir C fonksiyonu saniyede 60 kez araya girip sağ üstte dönen bir çubuk ve dolan bir
ilerleme çizgisi çizer. Sonunda kanca ≈ 97, BIOS'un zamanlayıcısı ≈ 160 kez çalışmıştır: oran 0.60
(60 Hz / 100 Hz).

Öğrenilecek: kesmenin donanımdan C'ye yolu (VSTAT → IRQ_PEND / IRQ_MASK → CPU, vektör `0x0002` →
BIOS → `bios_setirqhook` ile kurulan kanca); kancanın kaynağı onaylaması (seviye tetiklemeli hat);
`volatile` paylaşılan değişkenler; 32 bitlik bir değişkeni `di()` / `ei()` arasında okumak; VADDR gibi
paylaşılan bir donanımı aynı anda iki yerden kullanmamak; program bitmeden kancayı kaldırmak;
`halt()` ile bir sonraki kesmeye kadar uyumak.

Dene: kancadaki `VSTAT = 2;` satırını kaldır. Kesme hiç onaylanmadığı için işleyici kancayı durmadan
çağırır, ana program bir daha çalışmaz (uygulamada "Reset" ile kurtul).

### hayat.c: Hayat Oyunu

Conway'in Hayat Oyunu, ekranın tamamında (80 × 27): Gosper'in planör tabancası, R-pentomino ve üç
salınıcı; renk hücrenin yaşı. Saniyede 10 nesil, 100 nesil sonra biter. R rastgele bir dünya kurar,
Q çıkar.

Öğrenilecek: 4 MHz'te algoritma seçimi. Her hücrenin 8 komşusunu her nesilde saymak bu makinede nesil
başına 0,3 s sürer; burada her hücre baytı kendi komşu sayısını taşır ve sayılar yalnız bir hücre doğup
ölünce güncellenir (boş hücre tek karşılaştırmayla geçilir). Satır uzunluğu 128 seçildi: indeks
`y * 128 + x` bir kaydırmadır, 82 olsaydı her seferinde `__mul16`. Ekrana yalnız değişen hücreler
yazılır; durum satırı `printf` yerine `sprintf` + VRAM (UART'a gitmesin). Nesiller arasında `halt()`.

Dene: kuralı HighLife'a çevir (ölü hücre 3 ya da 6 komşuyla doğar: `v == 3 || v == 6`).

### yilan.c

Faz 8'in bitiş programı: VGA ekranda W A S D ile oynanan yılan; zaman BIOS tıklarından, tuşlar
klavye tamponundan, ekran `ekran_yaz` / `ekran_oku` ile. Kurulum ve oyun: [Deney 13](../kit/deney-13-c.md).

## Düz bellek örnekleri (`cpu16/programs/c/`)

BIOS'suz, 64 KB düz RAM'li referans emülatörde çalışırlar (ROM hedefi: kod `0x0000`'dan, `printf`
doğrudan UART'a, `main` dönünce `HALT`). UART çıktısı terminale olduğu gibi gittiği için Türkçe harfler
(UTF-8) doğru görünür.

| Program | Ne gösterir | Çalıştırma |
|---|---|---|
| `hello.c` | ilk program | `npm run cpu16 -- cc cpu16/programs/c/hello.c --run` |
| `fib.c` | özyinelemeli ve döngülü Fibonacci, 16 bitin sınırı | `... cc cpu16/programs/c/fib.c --run` |
| `primes.c` | bayt dizisiyle Eratosthenes (2000'e kadar) | `... cc cpu16/programs/c/primes.c --run` |
| `sort.c` | `qsort`, fonksiyon işaretçileri, string sıralama | `... cc cpu16/programs/c/sort.c --run` |
| `structs.c` | `struct`, `union`, `enum`, `malloc` ile bağlı liste | `... cc cpu16/programs/c/structs.c --run` |
| `long.c` | 32 bit faktöriyel, Fibonacci, bölme, kaydırma | `... cc cpu16/programs/c/long.c --run` |
| `strings.c` | `string.h`, `ctype.h`, `sprintf`, `snprintf` | `... cc cpu16/programs/c/strings.c --run` |
| `switch.c` | atlama tablosu, düşme, `goto`, Roma rakamları | `... cc cpu16/programs/c/switch.c --run` |
| `multi/` | iki çeviri birimi, `static`, `extern` | `... cc cpu16/programs/c/multi/main.c cpu16/programs/c/multi/util.c --run` |
| `../merhaba.c` | düz bellek tezgâhının C örneği | uygulamada CPU16 tezgâhı → Düz bellek; ya da `... cc cpu16/programs/merhaba.c --run` |

`--run` sonunda çıkış kodunu (`main`'in dönüş değeri, `r0`) ve çalışan komut sayısını yazar.

## CPU16'da C yazarken bilmen gerekenler

### Bellek haritası (BIOS hedefi)

```
0x0000 ┌───────────────────────────┐ BIOS (EEPROM bank 0): vektörler, atlama tablosu 0x0010–0x0097
0x4000 ├───────────────────────────┤ programın kodu ve sabitleri (const, string'ler)  ← G 4000
0xA000 ├───────────────────────────┤ .data, .bss (crt0 sıfırlar), malloc yığını (heap) ↑
       │            ...            │
       │       yığın (stack) ↓     │ SP başta 0xF800
0xF800 ├───────────────────────────┤ BIOS değişkenleri (0xF820: 32 bit tık sayacı), BIOS yığını
0xFF00 ├───────────────────────────┤ G/Ç register'ları
0xFFFF └───────────────────────────┘
```

Kod ve sabitler en çok 24 KB, veri + yığın 22 KB. Bu adresler CPU'nun gördüğü 64 KB'tır; arkada bank
register'ları 16 KB'lık pencereleri 1 MB'lık fiziksel alana eşler (BIOS açılışta RAM bank 32–34'ü
koyar). ROM hedefinin yerleşimi farklıdır: kod `0x0000–0x3FFF`, veri `0x4000`'dan, yığın `0xFF00`'dan
([cc16.md](cc16.md#bellek-yerleşimi)).

### G/Ç adresleri

C'den `volatile` işaretçiyle erişilir: `#define VSTAT (*(volatile unsigned char *)0xFF26)`.

| Adres | Register | Örnek |
|---|---|---|
| `FF00` | UART veri (okuma: gelen bayt, yazma: gönder) | `cpu16.h`: `UART_DATA` |
| `FF01` | UART durumu: bit 0 bayt geldi, bit 1 gönderici boş | |
| `FF02` / `FF03` | PS/2 tarama kodu / durumu (BIOS kesmesi okur) | |
| `FF04–FF07` | zamanlayıcı: yeniden yükleme, denetim, durum (BIOS 100 Hz'e kurar) | |
| `FF08` / `FF09` / `FF0A` | IRQ bekleyen / maske / en öncelikli kaynak (0 zamanlayıcı, 1 klavye, 2 UART, 3 vsync) | `kesme.c` |
| `FF10–FF13` | bank register'ları (pencere 0–3) | |
| `FF20–FF21` | VADDR: VRAM adresi | `bios.h`: `VADDR`, `ekran.c` |
| `FF22` | VDATA: VRAM verisi, her erişimde VADDR + 1 | `bios.h`: `VDATA` |
| `FF23–FF25` | imleç aç/kapa, imleç sütunu / satırı | |
| `FF26` | VSTAT: bit 0 dikey boşluk, bit 1 vsync bayrağı (2 yazınca silinir) | `ekran.c`, `kesme.c` |
| `FF30–FF34` | önbellek isabet / ıskalama sayaçları, önbellek aç/kapa | `onbellek.s` |

Tam tablo: [anakart.md](anakart.md#gç-haritası-0xff000xffff).

### Tipler ve taşma

- `int` ve `short` **16 bit** (−32768..32767), `unsigned` 0..65535; `long` 32 bit; işaretçi 16 bit.
- `char` 8 bit ve **işaretsiz** (0..255); işaretli bayt için `signed char`.
- Taşma hata vermez, sonuç 16 bite kırpılır: `32767 + 1 == -32768`, `1000 * 100 == -31072`. Büyük
  ara sonuçlar için bir işleneni `long`'a çevir: `(long)a * b`.
- Sabitler: `32768` `int`'e sığmadığı için `long`'dur, `0xFFFF` ise `unsigned`. `INT_MIN` `(-32767 - 1)`.
- İşlemlerden önce `char` ve `short` `int`'e terfi eder (`char c = 200; c + 100 == 300`).
- `float` / `double` yok: kesirler için sabit nokta ([sabit.c](#sabitc-sabit-noktalı-sayılar)).

### İşlemlerin maliyeti

CPU16'da çarpma ve bölme komutu yok, kaydırıcı 1 bitlik; toplama, mantık işlemleri ve
karşılaştırmalar tek komuttur. 4 MHz'te bir komut 4–6 döngü (+ bellek bekleme):

| İşlem | Nasıl yapılır | Yaklaşık döngü |
|---|---|---|
| `a + b`, `a & b`, `a < b` (16 bit) | tek komut | 5 |
| `a + b` (32 bit) | ADD + ADC | 10 |
| `x << 3`, `x >> 3` (sabit) | 3 × SHL / SHR | 15 |
| `x << n` (değişken) | n turluk döngü | 15 · n |
| `a * 10` (sabit) | kaydır ve topla (derleyici) | 30 |
| `a * b` (16 bit) | `__mul16`: çarpanın her biti için bir tur | 130–400 |
| `a / b`, `a % b` (16 bit) | `__udiv16`: 16 tur | ≈ 650 |
| `a * b` (32 bit) | `__mul32` | 500–1500 |
| `a / b`, `a % b` (32 bit) | `__udiv32`: 32 tur (üst kelimeler 0 ise 16 bitlik yol) | ≈ 1850 |

(`uzun.c` bunları gerçekten ölçer.) Pratik sonuçlar: dizi boyutlarını ve satır uzunluklarını 2'nin
kuvveti seç (`y * 128` bir kaydırmadır); döngü içinde `/` ve `%`'den kaçın; aynı sayıyı hem `/` hem
`%` ile bölmek iki bölmedir, kalanı `x - q * b` ile bul; `1 << n` yerine tablo kullan; sabit çarpanlar
ucuzdur.

### Yığın ve özyineleme

Yığın aşağı büyür (BIOS hedefinde `0xF800`'dan) ve **taşması denetlenmez**: derin özyineleme ya da
büyük yerel diziler önce `malloc` yığınını, sonra global verileri ezer. Her çağrı en az dönüş adresi
(2 bayt) + korunan register'lar + yerel değişkenler kadar yer tutar. Büyük dizileri `static` ya da
global yap (`.bss`'e gider).

### Kesmeler ve volatile

- G/Ç register'ları ve kesmeyle paylaşılan değişkenler `volatile` olmalı.
- BIOS kesmeleri açık bırakır (zamanlayıcı ve klavye). UART RX ve vsync için `bios_setirqhook` ile
  bir C fonksiyonu bağlanır; kanca kısa olmalı, kaynağı onaylamalı, `printf` gibi yeniden girilemez
  fonksiyonları çağırmamalıdır. `IRQ_MASK`'ı oku-değiştir-yaz `di()` / `ei()` arasında yapılır.
- `halt()` CPU'yu bir sonraki kesmeye kadar uyutur (bekleme döngüleri için).

### libc16 ve BIOS çağrıları

| Başlık | İçerik |
|---|---|
| `<stdio.h>` | `putchar`, `puts`, `printf`, `sprintf`, `snprintf`, `vprintf` ... (`%f` yok) |
| `<stdlib.h>` | `malloc`, `calloc`, `realloc`, `free`, `atoi`, `strtol`, `rand`, `srand`, `qsort`, `abs`, `exit` |
| `<string.h>` | `strlen`, `strcpy`, `strcmp`, `strchr`, `strstr`, `memcpy`, `memset`, `memcmp` ... |
| `<ctype.h>` | `isdigit`, `isalpha`, `isspace`, `toupper`, `tolower` ... |
| `<stdint.h>`, `<limits.h>`, `<stddef.h>`, `<stdbool.h>`, `<stdarg.h>`, `<assert.h>` | standart tanımlar |
| `<cpu16.h>` | `UART_DATA`, `ei()`, `di()`, `halt()` |
| `<bios.h>` (yalnız `--hedef bios`) | aşağıda |

`<bios.h>`: `bios_getc()` (tuş bekler), `bios_trygetc()` (tuş yoksa −1), `bios_getline(tampon, en_cok)`
(yankılı satır okuma), `bios_puts`, `bios_puthex4`, `bios_cls`, `bios_setcursor(x, y)`,
`bios_setattr(renk)`, `bios_ticks()` (10 ms'lik tıklar, 32 bit), `bios_setirqhook(kanca)`; renkler
(`SIYAH` … `BEYAZ`, `RENK(yazi, zemin)`), `EKRAN_GEN` / `EKRAN_YUK` (80 / 30), `ekran_yaz(x, y, karakter,
renk)`, `ekran_oku(x, y)`, `VADDR`, `VDATA`.

Ayrıntılar: [cc16.md](cc16.md#çalışma-zamanı-kütüphanesi), [bios.md](bios.md#atlama-tablosu-programlar-için-bios-çağrıları).

### Ekran ve metin

- `printf` BIOS'un `PUTC`'si üzerinden hem VGA'ya hem UART'a yazar; VGA 80 sütunda satır kaydırır,
  ekranın sonunda bütün ekranı bir satır yukarı kaydırır.
- Ekranın kod sayfası CP857'dir: ASCII'nin üstünde çerçeve karakterleri (`0xC9` ╔, `0xCD` ═, `0xDB` █)
  ve Türkçe harfler (`0x87` ç, `0xA7` ğ, `0x8D` ı, `0x94` ö, `0x9F` ş, `0x81` ü, büyükleri `0x80`
  `0xA6` `0x98` `0x99` `0x9E` `0x9A`). Kaynak dosya UTF-8 olduğundan string'lere Türkçe harf yazmak
  ekranda bozuk görünür; ya ASCII yaz ya `"\x87"` gibi kaçışlar ya da `ekran.c`'deki çevirici.
- Ekrana çizen bir program bitmeden imleci en alt satırın başına koymalı (`bios_setcursor(0, 29)`):
  monitör `> ` istemini oraya yazar, ekran kaymaz.

### cc16'nın sınırları

`float` / `double`, bit alanları, değişken uzunluklu diziler (VLA) ve `long long`'un 64 biti yok
(`long long` 32 bittir). `struct`'ların boyu çift sayıya yuvarlanır. Uygulamanın düzenleyicisi tek
dosya derler; birden çok `.c` dosyası komut satırında bağlanır. Tam liste:
[cc16.md](cc16.md#bilinen-sınırlamalar).

### Hata ayıklama

- `-o program.s` ile üretilen assembly'ye bak: hangi satır hangi komutlara dönüştü, nerede
  `__mul16` / `__udiv16` çağrılıyor. `--map` sembollerin adreslerini yazar.
- Uygulamanın yan panelinde register'lar, komut izi ve bellek görünümü var; program çalışırken
  monitöre dönülmüşse `D A000` ile verilerine bakılabilir.
- Kodun içine `__asm` konamaz ama assembly ile yazılmış bir `SWI` fonksiyonu bağlanabilir: BIOS
  `SWI @ adres` yazar ve monitöre döner ([bios.md](bios.md#kesmeler)).

## Testler

`cpu16/tests/c-ornekleri.test.ts` her BIOS örneğini Web IDE'deki modelde (`Machine` + BIOS v1)
çalıştırır ve çıktısını denetler: UART metni, VRAM'deki karakter ve renkler. Mümkün olan yerde
sonuç JavaScript'te bağımsız olarak hesaplanır: kalburun bütün sayıları, sıralama algoritmalarının
karşılaştırma ve taşıma sayıları (aynı `rand` ile), kelime sayımı, sinüs eğrisinin her sütunu, Hayat
Oyunu'nun her hücresi. `hesap.c` gerçek UART önyükleyicisiyle yüklenir ve hem UART'tan hem PS/2
klavyeden yazılır. Düz bellek örnekleri `cc.test.ts`'te, `selam.c` ve `yilan.c` `cc-bios.test.ts`'te.

```sh
npx vitest run cpu16/tests/c-ornekleri.test.ts
```
