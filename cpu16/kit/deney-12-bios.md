# Deney 12: BIOS, önyükleyici ve Web Serial

> **Video:** "Kendi BIOS'umuz: ilk açılış ve kablosuz program yükleme" · **Önce:** Deney 8–11 (bellek, önbellek, G/Ç, video) · **Kart:** yeni donanım yok; BIOS Flash'a yazılır, USB-UART bağlanır

Bu deneyin sonunda bilgisayar kendi başına açılır, ekranda ve terminalde monitörün istemi `> `
görünür; programlar artık çip sökmeden, USB kablosundan yüklenir. Deneyin sonunda kartı
simülatörle karşılaştıran **kart testi** 4/4 geçer: bu, gerçek bilgisayarın simülatörle aynı
davrandığının kanıtıdır.

## Ne öğreneceksin

- Reset vektöründen monitör istemine kadar açılış sırası: bank register'ları, yığın, kesmeler, ekran.
- BIOS **atlama tablosu**: programlar BIOS rutinlerini sabit adreslerden çağırır, BIOS değişse de programlar çalışır.
- Kesmeyle çalışan sürücüler: zamanlayıcı tıkı, klavye tamponu, UART.
- **Intel HEX önyükleyicisi**: her satır sağlama toplamıyla gelir, BIOS `.`, `!` ya da `X` ile yanıt verir.
- Web Serial: tarayıcıdan doğrudan karta yazmak.

## Nasıl çalışır

- BIOS (`cpu16/bios/bios.s`) Flash bank 0'dadır ve CPU adresinde `0x0000–0x3FFF` penceresinde görünür.
  Reset vektörü açılış koduna gider; açılış RAM'i, bank register'larını, kesme maskesini, ekranı
  hazırlar ve monitöre geçer. Ayrıntılar: `cpu16/docs/bios.md`.
- Monitör komutları: `D` bellek dökümü, `W` yaz, `G` çalıştır, `B` bank, `L` HEX → RAM, `F` HEX → Flash,
  `I` Flash kimliği, `C` önbellek sayaçları, `T` RAM testi, `?` yardım.
- Program yükleme: `L` komutundan sonra her Intel HEX satırı gönderilir; BIOS sağlamayı denetler,
  baytları RAM'e yazar ve tek karakterle yanıt verir. Web IDE ve `kart-testi` bu protokolü konuşur
  (`cpu16/bios/uploader.ts`).
- UART hızı CPU saatinden bölünür: 1 MHz'de **28 800 baud** (açılış satırındaki "115200" 4 MHz içindir).
  Ayrıntı: `cpu16/docs/uretim.md`, bölüm 2.

## Kurulum adımları

1. BIOS imajını üret ve bellek kartının Flash'ına yaz (Deney 3'teki programlayıcıyla):
   ```
   npm run cpu16 -- bios -o bios.hex
   python3 cpu16/programlayici/yaz.py PORT bios.hex --sil --dogrula
   ```
   Deney 8–11'in deneme programları bu Flash'taydı; artık yerini BIOS alır.
2. USB-UART modülü (CH340, 5 V) Deney 10'daki gibi G/Ç kartının 6 pinli UART yuvasında kalır:
   1 GND, 2 CTS#, 4 TXD, 5 RXD. Yuvanın 3. pini (VCC) boştur: modülün 5 V'u karta **bağlanmaz**
   (kart kendi adaptöründen beslenir).
3. Bilgisayarda bir terminal aç: 28 800 baud, 8N1, akış denetimi RTS/CTS (ör. `screen /dev/ttyUSB0 28800`).
4. RESET'e bas.

## Test: beklenen sonuç

| Adım | Beklenen |
|---|---|
| RESET | ekranda ve terminalde `CPU16 BIOS v1`, bellek / Flash satırı, `Komutlar icin ? yazin.` ve `> ` |
| `I` | `BF B5 (SST39SF010)` |
| `T` | RAM testi bütün bankları geçer |
| `D 0` | BIOS'un ilk baytları: vektörler |
| Web IDE → `merhaba.s` → **Karta gönder (Web Serial)** | ekranda sarı-mavi "Merhaba, CPU16!" ve `1+2+...+10 = 0x0037` |
| `npm run cpu16 -- kart-testi --port /dev/ttyUSB0 --baud 28800` | **4/4 test geçti: kart simülatörle aynı davranıyor** |

Windows'ta kart testi için Web IDE'deki **Kart testi (Web Serial)** düğmesini kullan; "Kartın UART hızı"
seçiminde 28 800'ü seç.

## Simülatörde

- Web IDE → CPU16 → **Anakart + BIOS**: aynı BIOS açılır, terminale komut yazılabilir; "Derle ve RAM'e
  yükle" gerçek karttaki `L` + `G` akışının aynısıdır.
- **Kart testini simülatörde dene** düğmesi dört test programını tezgâhtaki simüle karta karşı çalıştırır.
- `npm run cpu16 -- machine`: BIOS terminalde, UART stdin/stdout'a bağlı (çıkış: Ctrl-]).
- Testler: `cpu16/tests/bios.test.ts`, `cpu16/tests/kart-testi.test.ts`.

## Sorun giderme

| Belirti | Bak |
|---|---|
| Terminalde anlamsız karakterler | baud yanlış: 1 MHz'de 28 800; kristal 8 MHz mi |
| Ekranda istem var, terminal sessiz | TXD/RXD çapraz mı; modülün GND'si bağlı mı |
| Terminalden yazılanlar gitmiyor | RTS/CTS bağlı değilse terminalde akış denetimini kapat |
| HEX yüklemesi `!` ile tekrar ediyor | hat gürültülü ya da baud sapması: kabloyu kısalt, daha düşük hız dene |
| Kart testinde yalnızca bir test kalıyor | `cpu16/docs/uretim.md`, "Kart testi" tablosu: hangi kartın hangi bloğuna bakılacağı |
| Kart testi zaman aşımı veriyor | program takıldı: önce `4-gc-video.c` (zamanlayıcı kesmesi) ve IRQ hattı |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
Bu deneyde yeni donanım kurulmaz; önceki deneylerin kartları kullanılır.
<!-- otomatik: bitti -->
