# CPU16 BIOS v1 (Faz 7)

> Flash bank 0'daki yazılım: vektörler, açılış, programlar için **atlama tablosu**, kesme
> işleyici (zamanlayıcı + klavye), VGA metin sürücüsü, UART, **monitör** ve UART üzerinden
> **Intel HEX önyükleyicisi** (RAM'e ya da SST komut dizileriyle Flash'a).
> Kaynak: `bios/bios.s` (as16). İmaj: `bios/build.ts`. Yükleyici istemcisi: `bios/uploader.ts`.
> Testler: `tests/bios.test.ts`. Donanım: [anakart.md](anakart.md).

## ROM imajını üretmek

```sh
npm run cpu16 -- bios -o bios.bin       # 128 KB SST39SF010 imajı (BIOS bank 0'da, kalanı 0xFF)
npm run cpu16 -- bios -o bios.hex       # sadece BIOS baytları, Intel HEX (ofset 0)
npm run cpu16 -- charrom -o charrom.bin # video kartının 4 KB karakter ROM'u
```

`bios.bin` EEPROM/Flash programlayıcıyla (TL866/T48 ya da deney setinin Arduino + 74HC595
programlayıcısı) anakarttaki SST39SF010'a yazılır. BIOS v1 4345 bayttır (bank 0'ın %27'si).
Komut satırı her iki durumda da atlama tablosunu yazar.

Simülatörde denemek için:

```sh
npm run cpu16 -- machine                          # BIOS açılır; UART terminale bağlı (çıkış: Ctrl-])
npm run cpu16 -- machine program.s                # program önyükleyiciyle RAM'e yüklenir ve G ile çalışır
npm run cpu16 -- machine program.s --flash        # F ile Flash'a yazar (çalıştırmaz)
echo "D 4000" | npm run cpu16 -- machine program.s --cycles 3000000 --screen
                                                  # toplu mod: stdin UART'a, N döngü çalış, VGA ekranını yaz
```

Etkileşimli modda makine gerçek zamanlı (4 MHz) çalışır, stdin UART'a gider, UART çıktısı
stdout'a yazılır (0x80 üstü baytlar CP857 olarak çözülür).

## Açılış

1. Reset: bank register'ları 0/32/33/34, önbellek temiz ve açık, `PC = 0x0000` → `B reset`.
2. `init`: yığın `0xFF00`, kesmeler maskeli, bank register'ları yeniden yazılır, önbellek açılır,
   değişkenler sıfırlanır, Flash rutinleri RAM'e (`0xFA40`) kopyalanır, ekran temizlenir, imleç
   açılır, zamanlayıcı 10 ms'ye (100 Hz) kurulur, maske = zamanlayıcı + klavye.
3. Afiş: ilk satır mavi zemin üzerine beyaz `CPU16 BIOS v1`, ardından donanım özeti.
4. Monitör: `EI`, istem `> `.

Açılış ≈ 126 000 döngü (4 MHz'te 32 ms) sürer; çoğu ekran temizleme.

## Bellek yerleşimi

| CPU adresi | Kullanım |
|---|---|
| `0x0000–0x0005` | vektörler: `B reset`, `B irq`, `B swi` |
| `0x0006` | BIOS sürümü (`0x0100` = 1.0) |
| `0x0008–0x000F` | imza `"CPU16 B1"` |
| `0x0010–0x0097` | atlama tablosu (aşağıda) |
| `0x0098–0x10F8` | BIOS kodu ve metinleri (pencere 0 = Flash bank 0) |
| `0x4000–0xF7FF` | **kullanıcı RAM'i** (pencere 1–3 = RAM bank 32–34); `L` sadece buraya yükler |
| `0xC000–0xC7FF` | önbellek boşaltmada okunur (içerik değişmez) |
| `0xF800–0xF83F` | BIOS değişkenleri (`0xF820`: 32 bit tık sayacı, düşük kelime önce) |
| `0xF810–0xF81F` | klavye halka tamponu (16 bayt) |
| `0xF840–0xF89F` | komut satırı tamponu |
| `0xF8A0–0xF93F` | kaydırma satır tamponu |
| `0xF940–0xFA3F` | HEX kaydı tamponu |
| `0xFA40–…` | Flash komut rutinlerinin RAM kopyası |
| `…–0xFEFF` | yığın (`0xFF00`'dan aşağı) |
| `0xFF00–0xFFFF` | G/Ç |

## Atlama tablosu (programlar için BIOS çağrıları)

Her giriş `0x0010 + 8·n` adresinde, 8 baytlık bir uzak atlamadır (`LI r3, rutin` +
`JALR r3, r3, 0`). BIOS'un iç adresleri sürümden sürüme değişebilir; **tablo adresleri
değişmez**. Çağırmak için:

```asm
BIOS_PUTS = 0x0030
        LI   r0, mesaj
        LI   r3, BIOS_PUTS
        JALR lr, r3, 0          ; dönüşte lr'yi kaybettiğin için çağıran PUSH lr / POP lr yapmalı
```

Kuyruk çağrısı (alt programın son işi bir BIOS rutiniyse): `LI r3, BIOS_X` + `JALR r3, r3, 0`
(lr değişmez, rutin doğrudan çağırana döner).

**Çağrı kuralı**: argümanlar `r0`, `r1`, `r2`; dönüş `r0` (`TICKS`: `r0:r1`). `r3` her çağrıda
bozulur. `r1`, `r2`, `r4`, `r5` korunur (dönüş değeri olanlar hariç), `sp` dengelenir, `lr`
yuvadan geçerken değişmez. Bu kural cc16 ABI'siyle uyumludur (r0–r3 çağıran-korumalı, r4–r5
çağrılan-korumalı); C'den çağırırken en çok üç argüman kullanılır.

| Adres | Ad | Girdi | Çıktı / not |
|---|---|---|---|
| `0x0010` | MONITOR | – | monitöre döner (yığın `0xFF00`'a sıfırlanır), geri dönmez |
| `0x0018` | PUTC | r0 = karakter | VGA'ya ve UART'a; `'\n'` UART'a CR LF olarak gider |
| `0x0020` | GETC | – | r0 = karakter (klavye tamponu ya da UART); gelene kadar bekler |
| `0x0028` | TRYGETC | – | r0 = karakter, yoksa `0xFFFF` (beklemez) |
| `0x0030` | PUTS | r0 = sıfır sonlu metin | PUTC ile yazar |
| `0x0038` | PUTHEX4 | r0 | 4 hex basamak |
| `0x0040` | PUTHEX2 | r0 (düşük bayt) | 2 hex basamak |
| `0x0048` | GETLINE | r0 = tampon, r1 = en çok karakter | r0 = uzunluk; tampon sıfır sonlu. Yankılar; Backspace / DEL siler; CR, LF ya da CR LF bitirir |
| `0x0050` | NEWLINE | – | `'\n'` yazar |
| `0x0058` | CLS | – | ekranı geçerli renkle temizler, imleç (0,0) |
| `0x0060` | SETCURSOR | r0 = sütun, r1 = satır | VGA yazma konumu ve donanım imleci |
| `0x0068` | SETATTR | r0 = renk baytı | sonraki VGA karakterlerinin rengi (düşük 4 bit yazı, yüksek 4 bit zemin) |
| `0x0070` | TICKS | – | r0:r1 = açılıştan beri 10 ms'lik tık sayısı (r1 yüksek kelime) |
| `0x0078` | UART_PUTC | r0 | sadece UART (TX_EMPTY'yi bekler, çeviri yok) |
| `0x0080` | UART_GETC | – | r0 = UART baytı (bekler; klavyeye bakmaz) |
| `0x0088` | VGA_PUTC | r0 | sadece VGA: CR satır başı, LF yeni satır, BS geri; satır sonunda kaydırır |
| `0x0090` | SETIRQHOOK | r0 = işleyici adresi (0: kaldır) | kullanıcı kesme kancası, aşağıda |

VGA sürücüsü kontrol karakterlerini (CR, LF, BS) yorumlar; diğer tüm baytlar (`0x01–0x1F`,
`0x80–0xFF` dahil) karakter ROM'undaki glif olarak basılır: CP857 Türkçe harfler ve çerçeve
karakterleri doğrudan kullanılabilir (ör. `╔` = `0xC9`). Ekranın sonunda yazı yukarı kayar.

Örnekler: `bios/ornekler/merhaba.s` (renkli metin, toplam), `saat.s` (SETCURSOR, çerçeve,
TICKS, tuşla çıkış), `renkler.s` (16×16 renk tablosu), `onbellek.s` (önbellek açık/kapalı
süre ve sayaçlar). Hepsi `0x4000`'e derlenir ve RET ile monitöre döner. C ile yazılmış
örnekler: `selam.c` (printf, renkler, `fib`) ve `yilan.c` (VGA ekranda klavyeyle oynanan yılan
oyunu); `npm run cpu16 -- cc --hedef bios dosya.c` ile derlenir, ayrıntılar
[cc16.md](cc16.md#bios-hedefi-anakartta-c---hedef-bios).

## Kesmeler

BIOS'un IRQ işleyicisi bütün register'ları saklar ve `IRQ_SRC` `0xFF` olana kadar döner:

- **0 zamanlayıcı**: `EXPIRED`'ı siler, 32 bit tık sayacını artırır (`TICKS`, 100 Hz).
- **1 klavye**: tarama kodunu okur ve çevirir (aşağıda), karakteri 16 baytlık halka tampona koyar
  (tampon doluysa karakter atılır).
- **2 UART RX, 3 vsync**: BIOS bunları kendisi kullanmaz (UART'ı yoklamayla okur). Kullanıcı
  `SETIRQHOOK` ile bir kanca kurup `IRQ_MASK`'ta (`0xFF09`) ilgili biti açarsa kanca
  `r0 = kaynak no` ile çağrılır. Kanca kaynağı onaylamalı (UART için `UART_DATA`'yı okumak,
  vsync için `VSTAT`'a 2 yazmak) ve `RET` ile dönmelidir; r0–r5 serbesttir, kesmeler kapalıdır
  (I = 0). Kanca yoksa BIOS o kaynağın maskesini kapatır (kesme fırtınası olmasın).

**SWI**: kesme noktası. `SWI` çalışınca BIOS `SWI @ adres` yazar ve monitöre döner (yığın
sıfırlanır). Program içinde hata ayıklamak için `SWI` koyup `D` ile belleğe bakılabilir.

## Klavye

Set 2 tarama kodları ABD düzenine çevrilir: harfler, rakamlar, noktalama, Space, Enter (13),
Backspace (8), Tab (9), Esc (27), sayısal tuş takımı (NumLock açık gibi), sayısal Enter ve `/`,
Delete (127), ISO `<`/`>` tuşu. Shift (sol/sağ), Caps Lock (harfler) ve Ctrl (Ctrl + harf → 1–26)
izlenir. Oklar, F tuşları ve diğer genişletilmiş tuşlar yok sayılır. Türkçe Q klavyede tuşlar
fiziksel yerlerine göre gelir (ör. `ı` tuşu `i` verir).

`GETC`/`TRYGETC` önce klavye tamponuna, sonra UART'a bakar: monitör ve programlar klavye + ekran
ile de, sadece UART terminaliyle de kullanılabilir. Çıktı (PUTC) hep ikisine birden gider.

## Monitör komutları

Sayılar hex; küçük harf de olur; argümanlar boşlukla ayrılır.

| Komut | Anlamı |
|---|---|
| `D [adres] [uzunluk]` | bellek dökümü (hex + ASCII), varsayılan uzunluk `80`; argümansız `D` kaldığı yerden devam eder. Açılışta `4000` |
| `W adres bayt ...` | baytları sırayla belleğe yazar (`W 4000 A6 46 01`) |
| `G [adres]` | adresi alt program olarak çağırır (`JALR lr`); program `RET` ile monitöre döner. Adres verilmezse son yüklenen programın girişi |
| `B` / `B pencere bank` | bank register'larını gösterir / pencere 1 ya da 2'yi banka eşler (`B 1 01` → pencere 1 = Flash bank 1). Pencere 0 (BIOS) ve 3 (yığın) değiştirilemez |
| `L` | Intel HEX yükle: UART → RAM (`0x4000–0xF7FF`) |
| `F` | Intel HEX yükle: UART → Flash (bank 0 hariç) |
| `I` | Flash kimliği: `BF B5 (SST39SF010)` |
| `C [0\|1]` | önbellek isabet / ıskalama sayaçlarını ve denetim register'ını yazar, sonra sayaçları sıfırlar; `C 0` önbelleği kapatır, `C 1` açar |
| `T` | RAM testi: bank 32–63 (34 hariç: BIOS değişkenleri ve yığın) pencere 2 üzerinden; önce hepsine banka özgü desen yazar, sonra hepsini doğrular (adres hatlarının karışmasını da yakalar). 4 MHz'te ≈ 4 s. Sonunda pencere 2 eski bankına döner |
| `?` / `H` | yardım |

`D` G/Ç alanını (`FF00–FFFF`) da okur; bazı register'ları okumanın yan etkisi vardır (UART ve
klavye verisi).

## Önyükleyici protokolü (UART, 115200 8N1)

Programlar çip sökmeden UART'tan yüklenir. Aynı istemci kodu (`bios/uploader.ts`, `uploadHex`)
Web IDE'de simülatöre, Web Serial ile gerçek karta ve CLI'da kullanılır.

```
ana makine                         BIOS
──────────                         ────
"\r"                         ──▶   (boş satır)            ◀── "\r\n> "      monitör istemde mi?
"L\r"  (ya da "F\r")         ──▶                          ◀── "L\r\nHEX bekleniyor (RAM), iptal: ESC\r\n"
":10400000…\r\n"             ──▶   kaydı işler            ◀── "."           tamam
":10401000…\r\n"             ──▶                          ◀── "."
   …
":0400000500004000B7\r\n"    ──▶   başlangıç adresi       ◀── "."
":00000001FF\r\n"            ──▶   dosya sonu             ◀── ".\r\nYuklendi: 007F bayt, giris 4000\r\n> "
"G\r"                        ──▶   programı çalıştırır (isteğe bağlı)
```

Kurallar:

- Ana makine her komuttan sonra beklenen metni görmeden devam etmez: önce `"> "`, `L`/`F`'den
  sonra sonu `\n` olan `HEX…` satırı, her kayıttan sonra tek karakterlik yanıt.
- Yanıtlar: **`.`** kayıt kabul edildi · **`!`** sağlama toplamı ya da hex hatası: kayıt aynen
  yeniden gönderilebilir (istemci 3 kez dener) · **`X`** reddedildi: yükleme biter, BIOS bir
  satır hata iletisi ve `"> "` yazar (`Hata: adres izinli degil`, `Hata: Flash yazilamadi`).
- Kayıtlar `:` ile başlar; araya giren diğer karakterler (CR, LF, boşluk) yok sayılır. Kayıt
  sonu için ayrıca bir karakter beklenmez; istemci yine de `\r\n` ekler.
- `ESC` (27) ya da `Ctrl-C` (3), kayıtlar arasında yüklemeyi iptal eder (`Iptal`).
- Kayıt türleri: `00` veri · `01` dosya sonu · `04` genişletilmiş doğrusal adres (sadece Flash:
  ofsetin 16. biti, `0000` ya da `0001`) · `05` / `03` başlangıç adresi (son 16 bit, `G`'nin
  varsayılanı). Başlangıç kaydı yoksa giriş = ilk veri kaydının adresi.
- Kayıt verisi en çok 255 bayt; istemci 16'şar bayt gönderir.
- BIOS bir kayıt boyunca yankı yapmaz ve karakter başına ≈ 120 döngü harcar (bayt süresi 347
  döngü): ana makine bir kaydın karakterlerini arka arkaya gönderebilir. Yanıt önce ekrana,
  en son UART'a yazılır; yanıt geldiğinde BIOS bir sonraki kayda hazırdır.

**RAM (`L`)**: adresler CPU adresidir, `0x4000–0xF7FF` dışı reddedilir (`X`): BIOS'un değişken ve
yığın alanı ile ROM korunur. Özet satırındaki sayılar hex'tir.

**Flash (`F`)**: adresler **Flash ofsetidir** (`04` kaydıyla 17 bit, 0–128 KB). Bank 0
(`0x0000–0x3FFF`, BIOS) reddedilir. Bir 4 KB sektöre bu yüklemede ilk kez yazılırken sektör
önce silinir (aynı yüklemedeki diğer kayıtlar silinmez); yazılmayan sektörler korunur. Yükleme
boyunca önbellek kapalıdır, sonunda önbellek boşaltılıp eski durumuna getirilir. `F` programı
çalıştırmaz.

Flash'taki programı çalıştırmak: `0x4000`'e derlenmiş bir program `F` ile Flash ofseti
`0x4000`'e (bank 1) yazılır; sonra monitörde `B 1 1` (pencere 1 = Flash bank 1) ve `G 4000`.
Program bu durumda kendi bölgesine yazamaz (Flash); değişkenleri pencere 2/3'teki RAM'de
tutmalıdır. Reset bank'ları yeniden RAM'e döndürür, Flash içeriği kalır.

### İstemciler

- **Web IDE** (`#cpu16`, "Anakart + BIOS" kipi): "Derle ve RAM'e yükle" gerçek karttaki akışı
  yapar: reset → BIOS açılır → `L` → kayıtlar → `G`. "Flash'a yaz" `F` ile yazar ve
  "Flash'tan çalıştır" düğmesi `B 1 1` + `G 4000` gönderir.
- **Web Serial** ("Karta gönder (Web Serial)", Chrome / Edge masaüstü, https ya da localhost):
  tarayıcı kartın CH340 seri portunu 115200 8N1 açar ve tam olarak yukarıdaki diziyi gönderir:
  `"\r"`, `"L\r"`, her kayıt + `"\r\n"`, en sonda `"G\r"`; port sonra kapatılır. Kartın
  çıktısı IDE'de "Kart (Web Serial)" bölümünde görünür. Tarayıcıda `navigator.serial` yoksa
  düğme açıklamasıyla devre dışıdır.
- **CLI**: `npm run cpu16 -- machine program.s` aynı istemciyi simülatörün UART'ına bağlar.
- Elle: herhangi bir seri terminalde `L` yazıp `.hex` dosyasını metin olarak yapıştırmak da
  çalışır (akış denetimi açık olmalı ya da terminal satır başına gecikme eklemeli).

## Flash'a yazma (BIOS içi)

SST39SF010 programlanırken ve kimlik modundayken okunamaz; BIOS'un kendisi de Flash'ta
olduğundan komut dizilerini Flash'tan çalıştıramaz. Bu yüzden `flashrt` rutinleri açılışta
RAM'e (`0xFA40`) kopyalanır ve oradan çağrılır (sadece göreli dallanma kullanırlar). Komut
adresleri pencerelerle üretilir:

- `5555h`: pencere 1 geçici olarak Flash bank 1'e eşlenir, CPU `0x5555` (çip adresi `0x5555`).
- `2AAAh`: pencere 0 (bank 0), CPU `0x2AAA`.
- hedef bayt: pencere 2 hedef banka eşlenir (`fl_map`), CPU `0x8000 + (ofset & 0x3FFF)`.

İş bitince DQ7 veri yoklamasıyla beklenir (zaman aşımında hata). Bu sırada önbellek kapalıdır:
yoklama okumaları önbellekten değil Flash'tan gelmeli. Sonrasında pencereler ve önbellek eski
haline döner.

## Bilinen sınırlar (v1)

- Monitör metinleri ASCII'dir (Türkçe harfsiz): UART terminallerinde kod sayfası sorunu olmasın.
- `G` ile çağrılan program BIOS yığınını kullanır; `MONITOR` (`0x0010`) yığını sıfırlar.
- Klavye düzeni ABD; oklar ve F tuşları BIOS'ta karşılıksız.
- `T` bank 34 dışındaki bütün RAM'in içeriğini bozar (`0x4000–0xBFFF`'teki yüklü program dahil).
