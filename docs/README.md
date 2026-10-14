# Belgeler: okuma yolu

Depoda kırka yakın belge var. Bu sayfa onları yeni başlayan biri için sıraya koyuyor. Hepsini okumak
gerekmiyor: önce "Önce dene" bölümünü yap, sonra amacına uyan yolu seç.

| Amacın | Yol |
|---|---|
| Uygulamayı açıp gezmek | [Önce dene](#önce-dene) |
| CPU16'nın nasıl çalıştığını anlamak | [Yol A: CPU16'yı anlamak](#yol-a-cpu16yı-anlamak) |
| Breadboard'da kurmak | [Yol B: Deney seti ile kurmak](#yol-b-deney-seti-ile-kurmak) |
| Daha küçük bir donanım projesi | [Yol C: Hesap makinesi](#yol-c-hesap-makinesi) |
| Koda katkıda bulunmak | [Yol D: Koda katkı](#yol-d-koda-katkı) |
| Belli bir sorunun cevabı | [Hangi soru hangi belgede](#hangi-soru-hangi-belgede) |

## Önce dene

1. [README](../README.md#hızlı-başlangıç): `npm run dev` ya da `docker compose up -d`, sonra tarayıcıda
   altı bölümü sırayla aç: 6502 die, CPU16 tezgâhı, CPU16 kartı 3D, 8 bit hesap 3D, Mimari, Belgeler. Kartlarda
   kaybolursan Mimari bölümündeki blok diyagramlarına dön: hangi kutu ne iş yapar, hangi yolla bağlı.
2. Komut satırında ilk CPU16 programı: `npm run cpu16 -- run cpu16/programs/hello.s`. Kaynağı
   ([hello.s](../cpu16/programs/hello.s)) aç: yirmi satırlık, yorumlu bir program.
3. CPU16 tezgâhında "Anakart + BIOS" kipinde örnek listesinden `yilan.c`'yi seç, derleyip çalıştır,
   ekrana tıklayıp W A S D ile oyna. Bu, bütün yolculuğun vardığı yer.

## Yol A: CPU16'yı anlamak

Tasarımdan başlayıp kapılara, oradan kartlara ve yazılıma iner. Her belge bir öncekinin üstüne kurulur.

| # | Belge | Ne öğrenirsin |
|---|---|---|
| 1 | [cpu16/README.md](../cpu16/README.md) | CPU16'ya genel bakış, komutlar, belge tablosu |
| 1b | [mimari.md](../cpu16/docs/mimari.md) | blok diyagramları: CPU kartı ve bütün bilgisayar kutu kutu, yollar ve görevleri (uygulamada: Mimari bölümü) |
| 2 | [roadmap.md](../cpu16/docs/roadmap.md) | fazlar, şu anki aşama ve projenin beş kuralı (altın model, "bitti" = test, spec değişikliği = PR). Kaybolursan önce buraya dön. |
| 3 | [spec.md](../cpu16/docs/spec.md) | vizyon, donanım blokları, bellek haritası, komut formatları, opcode haritası, ABI. Dondurulmuş belge; içindeki ilk deney listesi plandır, güncel sıra [kit/README.md](../cpu16/kit/README.md)'de. |
| 4 | [isa-ayrintilari.md](../cpu16/docs/isa-ayrintilari.md) | her komutun bit bit davranışı; referans emülatör (`cpu16/emu/cpu.ts`) bunu uygular |
| 5 | [as16.md](../cpu16/docs/as16.md) | assembler sözdizimi; burada ilk programını yaz ve `npm run cpu16 -- run` ile çalıştır |
| 6 | [mikromimari.md](../cpu16/docs/mikromimari.md) | iç veriyolu, 32 bitlik kontrol kelimesi, mikrokod, komut başına döngü; mikrokodun 74HC kapılarına çevrilmesi |
| 7 | [parcalar.md](../cpu16/docs/parcalar.md) | 74HC parça kütüphanesi: her çip veri sayfası tablosu, kapı devresi ve CMOS transistör açılımıyla |
| 8 | [kartlar.md](../cpu16/docs/kartlar.md) | şema = kod: kartlar TypeScript'te, KiCad şemaları ve BOM bunlardan üretilir; CPU kartı çip çip |
| 9 | [anakart.md](../cpu16/docs/anakart.md) | anakartın davranış modeli: bank'lı bellek, önbellek, G/Ç haritası, kesmeler, video, UART, PS/2 |
| 10 | [anakart-kartlari.md](../cpu16/docs/anakart-kartlari.md), [anakart-gc-video.md](../cpu16/docs/anakart-gc-video.md) | aynı anakart kapı seviyesinde: saat, bellek, önbellek, G/Ç ve video kartları |
| 11 | [3d-gorunum.md](../cpu16/docs/3d-gorunum.md) | bütün bunları Silikon3D'de görmek: kart → çip → kapı → transistör, VGA ekranı, konsol |
| 12 | [bios.md](../cpu16/docs/bios.md) | BIOS: açılış, atlama tablosu, monitör komutları, Intel HEX önyükleyicisi |
| 13 | [cc16.md](../cpu16/docs/cc16.md) | C derleyicisi: desteklenen C, bellek yerleşimi, çağrı kuralı, BIOS hedefi |
| 14 | [c-ornekleri.md](../cpu16/docs/c-ornekleri.md) | yorumlu C örnekleri (`cpu16/programs/c/`, `cpu16/bios/ornekler/`) |
| 15 | [uretim.md](../cpu16/docs/uretim.md) | simülasyondan gerçek karta: zamanlama analizi, hız hedefi, kurulum sırası, kart testi |

## Yol B: Deney seti ile kurmak

Bilgisayarı breadboard'da, blok blok kurmak için. Her deney bir video, simülatörde bir sahne ve gerçek
kartta bir modül; her deney dosyasının sonundaki malzeme ve bağlantı tabloları kart tanımlarından
üretilir.

1. [kit/README.md](../cpu16/kit/README.md): gereken araçlar, genel kurallar, sorun giderme.
2. [LED, direnç ve kondansatör](../cpu16/kit/led-ve-direnc.md): renk kodu, LED'in kutbu, çekme
   dirençleri, dekuplaj. İlk deneyden önce bir kez oku.
3. Deneyler:

   | # | Deney | Sonunda |
   |---|---|---|
   | 1 | [Saat ve reset kartı](../cpu16/kit/deney-01-saat.md) | LED'de saat, ADIM butonuyla tek döngü |
   | 2 | [Kapılar ve CMOS transistörler](../cpu16/kit/deney-02-kapilar.md) | NAND doğruluk tablosu, NAND'ın içi |
   | 3 | [EEPROM programlayıcı](../cpu16/kit/deney-03-programlayici.md) | 28C256 programlanır ve doğrulanır |
   | 4 | [Register dosyası ve veriyolu](../cpu16/kit/deney-04-register.md) | anahtarlardaki değer register'a yazılır, geri okunur |
   | 5 | [ALU ve bayraklar](../cpu16/kit/deney-05-alu.md) | toplama, çıkarma, mantık, kaydırma; NZCV |
   | 6 | [Program sayacı ve komut çekme](../cpu16/kit/deney-06-komut-cekme.md) | PC yürür, komut IR'ye çekilir |
   | 7 | [Mikrokod ve kontrol birimi](../cpu16/kit/deney-07-mikrokod.md) | CPU çalışır: NOP döngüsü, HALT |
   | 8 | [Bellek kartı ve ilk program](../cpu16/kit/deney-08-bellek.md) | ilk program EEPROM'dan RAM'i sınar |
   | 9 | [Bekleme durumları ve önbellek](../cpu16/kit/deney-09-onbellek.md) | önbellek açıkken kayan ışık hızlanır |
   | 10 | [G/Ç kartı](../cpu16/kit/deney-10-gc.md) | bilgisayarla seri haberleşme, klavye |
   | 11 | [Video kartı](../cpu16/kit/deney-11-video.md) | VGA ekranda "Merhaba", 16 renk |
   | 12 | [BIOS, önyükleyici ve Web Serial](../cpu16/kit/deney-12-bios.md) | tarayıcıdan karta program yükleme |
   | 13 | [C derleyicisi: yılan oyunu](../cpu16/kit/deney-13-c.md) | C ile yazılmış oyun ekranda |
   | 14 | [Kendin yap bellek](../cpu16/kit/deney-14-kendin-yap-bellek.md) | isteğe bağlı: 16 baytlık RAM, her bayt bir 74HC574 |

4. [kurulum.md](../cpu16/docs/kurulum.md): kart başına yazdırılabilir kurulum belgesi (yerleşim
   haritası, numaralı tel listesi, çip kartları) nasıl üretilir ve nasıl okunur. PCB yerine bütün
   bilgisayarı breadboard'da kurmak için: [breadboard.md](../cpu16/docs/breadboard.md) (kart başına
   bir pano, kartlar arası şerit kablo, delikten deliğe tel listeleri).
5. [uretim.md](../cpu16/docs/uretim.md): kurulum sırasının gerekçesi, besleme, arıza bulma, kart testi.

## Yol C: Hesap makinesi

216 entegrelik, saatsiz ve programsız bir devre: CPU16'dan küçük, sonucu anahtarı çevirir çevirmez
görünür. Breadboard'da ilk dört aşaması ≈ 22 entegre ve 6–7 breadboard tutar.

1. [hesap8/README.md](../hesap8/README.md): dosyalar ve komutlar.
2. [tasarim.md](../hesap8/docs/tasarim.md): kullanım, bloklar (toplama, çarpma, bölme, onluğa çevirme,
   göstergeler), hız, besleme, malzeme. Blok diyagramı başta; etkileşimli hâli uygulamanın Mimari
   bölümünde.
3. [kurulum-rehberi.md](../hesap8/docs/kurulum-rehberi.md): aşama aşama fiziksel kurulum ve testler.

## Yol D: Koda katkı

1. [CONTRIBUTING.md](../CONTRIBUTING.md): kurulum, dal ve PR akışı, kurallar, yeni çip / kart / örnek
   program ekleme, üretilen dosyalar.
2. [CLAUDE.md](../CLAUDE.md): tek sayfalık dizin (klasör haritası, push'tan önceki denetimler, üretilen
   dosyalar, değişmez kurallar, bilinen tuzaklar); `cpu16/`, `hesap8/`, `src/` altında birer tane daha.
3. [README: proje yapısı](../README.md#proje-yapısı) ve [Silikon3D mimarisi](../README.md#silikon3d-mimarisi).
4. Dokunacağın yerin belgesi: derleyici için [cc16.md](../cpu16/docs/cc16.md) (dosya tablosu), yeni
   çip için [parcalar.md](../cpu16/docs/parcalar.md) (sonundaki "Yeni çip eklemek"), 3D görünüm için
   [3d-gorunum.md](../cpu16/docs/3d-gorunum.md) (sonundaki "Dosyalar"), kartlar için
   [kartlar.md](../cpu16/docs/kartlar.md).

## Hangi soru hangi belgede

| Soru | Belge |
|---|---|
| Bir komut bayrakları nasıl değiştirir? | [isa-ayrintilari.md](../cpu16/docs/isa-ayrintilari.md) |
| Bir komut kaç saat döngüsü sürer? | [mikromimari.md](../cpu16/docs/mikromimari.md) |
| G/Ç adresleri, bank register'ları? | [anakart.md](../cpu16/docs/anakart.md) |
| BIOS çağrıları, monitör komutları? | [bios.md](../cpu16/docs/bios.md) |
| C'de neler yok, `int` kaç bit, argümanlar hangi register'da? | [cc16.md](../cpu16/docs/cc16.md) |
| Hangi çipin kaç kapısı ve transistörü var? | [parcalar.md](../cpu16/docs/parcalar.md), `npm run cpu16 -- chips` |
| Hangi kartta kaç entegre var? | [kartlar.md](../cpu16/docs/kartlar.md), `npm run cpu16 -- board` |
| Hangi blok ne iş yapar, hangi yolla bağlı? | [mimari.md](../cpu16/docs/mimari.md), uygulamada Mimari bölümü, `npm run cpu16 -- mimari` |
| Hangi bacak nereye, tel hangi renk? | [kurulum.md](../cpu16/docs/kurulum.md), `npm run cpu16 -- kurulum <kart>` |
| Breadboard'da hangi delikten hangi deliğe? | [breadboard.md](../cpu16/docs/breadboard.md), `npm run cpu16 -- breadboard-belge <kart>` |
| Gerçek kart kaç MHz'te çalışır? | [uretim.md](../cpu16/docs/uretim.md), `npm run cpu16 -- zamanlama` |
| Dirençlerin renk kodu, LED'in yönü? | [led-ve-direnc.md](../cpu16/kit/led-ve-direnc.md) |
| 3D görünümü konsoldan nasıl sürerim? | [3d-gorunum.md](../cpu16/docs/3d-gorunum.md#konsol) |
| Docker ile nasıl çalıştırırım? | [README: Docker ile](../README.md#docker-ile) |
