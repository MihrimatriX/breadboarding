# 8 bit hesap makinesi: tasarım

İki 8 bitlik sayı (A ve B, 0–255) DIP anahtarlarla girilir, işlem 2'li bir DIP anahtarla seçilir:
toplama, çıkarma, çarpma, bölme. Sayılar ve sonuç onluk 7 segment göstergelerde görünür. Program,
mikrodenetleyici, ROM ve saat yoktur: bütün iş yaygın 74HC çiplerinde, tamamen **birleşimsel**
(combinational) devreyle yapılır. Anahtar çevrilince sonuç yalnızca kapı gecikmeleri kadar sonra
(en kötü ≈ 2 µs) göstergeye gelir.

Şema = kod: devre `hesap8/kart.ts`'te tanımlıdır. Aynı tanımdan kapı seviyesi simülasyon, 3D
görünüm (Silikon3D → "8 bit hesap makinesi"), KiCad şeması (`cpu16/kicad/hesap/`), BOM ve kurulum
belgesi üretilir. Bütün 4 × 256 × 256 = 262 144 durum kapı seviyesinde denenmiş ve altın modelle
(`hesap8/model.ts`) aynı çıkmıştır: `npm run hesap8 -- dogrula --hepsi`.

## Kullanım

| Anahtar | Görev |
|---|---|
| SW1 (8'li) | A sayısı. Soldan sağa A7 … A0; anahtar açık (ON) = 1 |
| SW2 (8'li) | B sayısı, aynı düzen |
| SW3 (2'li) | İşlem: 1. anahtar OP1, 2. anahtar OP0 |
| SW4 (buton) | Lamba testi: basılıyken 14 sürülen hanenin bütün segmentleri yanar ("8") |

| OP1 OP0 | İşlem | Sonuç göstergesi | Kalan göstergesi |
|---|---|---|---|
| 0 0 | A + B | 0 … 510 | sönük |
| 0 1 | A − B | −255 … 255 (eksiyse işaret hanesinde "−") | sönük |
| 1 0 | A × B | 0 … 65 025 | sönük |
| 1 1 | A ÷ B | bölüm 0 … 255 | kalan 0 … 254; B = 0 ise HATA LED'i yanar, sonuç ve kalan söner |

Göstergeler (15 hane): A 3, B 3, sonuç işaret + 5, kalan 3. Baştaki sıfırlar söner, en sağdaki
hane hiç sönmez (sıfır "0" görünür). İşlem LED'leri (yeşil) hangi işlemin seçili olduğunu gösterir.

## Bloklar

Sayılar 216 entegre, hepsi yaygın 74HC: 74HC00, 02, 04, 08, 30, 32, 86 (kapılar), 74HC283 (4 bit
toplayıcı), 74HC157 ve 153 (seçiciler), 74HC4511 (gösterge sürücüsü).

| Blok | Entegre | Ne yapar |
|---|---|---|
| Anahtarlar | 3 | DIP anahtarlar 10 kΩ dizilerle aşağı çekilir; işlem kodu 4 sinyale çözülür (TOPLA, ÇIKAR, ÇARP, BÖL) ve LED'lere gider |
| Toplama ve çıkarma | 10 | A + B ya da A − B; eksiyse işaret ve mutlak değer |
| Çarpma | 30 | 8 × 8 dizi çarpıcı → 16 bit |
| Bölme | 39 | 8 basamaklı geri yüklemeli bölücü → bölüm ve kalan, sıfıra bölme algılama |
| Sonuç seçici | 8 | İşlem anahtarı 4 sonuçtan birini seçer (16 bit) |
| Onluğa çevirme | 12 + 12 + 58 + 12 | İkiliden BCD'ye: A, B, sonuç (16 bit → 5 hane), kalan |
| Göstergeler | 7 + 7 + 11 + 7 | Her hane bir 74HC4511 + 470 Ω dizi + ortak katotlu gösterge; baştaki sıfırları söndürme |

### Toplama ve çıkarma

Çıkarma toplamaya çevrilir: A − B = A + ~B + 1 (ikiye tümleyen). B'nin her biti bir XOR'dan geçer:
OP0 = 1 (çıkarma) iken ters çevrilir, elde girişi de OP0'dır. İki 74HC283 A + BX + OP0'ı toplar
(S, 8 bit, elde çıkışı C8).

- Toplamada C8 sonucun 9. bitidir (T8 = C8 · TOPLA; 255 + 255 = 510 için gerekli).
- Çıkarmada C8 = 0 ise A < B'dir, sonuç eksidir: NEG = ÇIKAR · ~C8. Eksi sayıyı göstermek için
  mutlak değeri lazım: |A − B| = ~S + 1. S bir XOR katmanından NEG ile geçer (NEG = 1 ise ters),
  iki 74HC283 daha NEG'i ekler. NEG = 0 iken bu katman S'yi olduğu gibi bırakır (M = S).
- NEG ayrıca işaret hanesinin g segmentini (330 Ω üzerinden) yakar.

Örnek: 12 − 200. BX = ~200 = 55, S = 12 + 55 + 1 = 68, C8 = 0 → NEG = 1. M = ~68 + 1 = 188.
Göstergede "−  188".

### Çarpma

Elle çarpmanın aynısı, ikilikte. B'nin her biti A'yı ya geçirir ya sıfırlar: kısmi çarpım
pp[i][j] = A[j] · B[i], 64 AND kapısı (16 × 74HC08). Satırlar sırayla toplanır: her satırda bir
önceki toplamın bir bit sağa kaymışı ile yeni kısmi çarpım (2 × 74HC283, 7 satır); sağa düşen bit
çarpımın bir biti olur. Son satırın 8 biti ve eldesi çarpımın üst yarısıdır. 30 çip, 16 bit sonuç
(en çok 255 × 255 = 65 025).

### Bölme

Okulda öğrenilen uzun bölmenin ikilik hali, geri yüklemeli (restoring). 8 aynı basamak, A7'den
A0'a: kalan bir bit sola kayar, A'nın sıradaki biti sağdan girer; kalan ≥ B ise B çıkarılır ve
bölümün o biti 1 olur, değilse kalan olduğu gibi kalır.

- Her basamakta "kalan − B" iki 74HC283 ile (kalan + ~B + 1); ~B 8 inverterden.
- Kalan 9 bit olabilir; 9. bit 1 ise kalan kesinlikle ≥ B'dir: q = R7 + elde (bir OR).
- Yeni kalan iki 74HC157 seçiciyle: q = 1 ise fark, değilse eski kalan ("geri yükleme").
- 8 basamak × (2 toplayıcı + 2 seçici) = 32 çip; artı ~B, B = 0 algılama (74HC30, 8 girişli NAND)
  ve basamakların OR'ları.
- B = 0 ise HATA = BÖL · (B = 0): HATA LED'i yanar, sonuç ve kalan göstergeleri söner. Kalan
  göstergesi yalnız bölmede ve B ≠ 0 iken yanar.

### Sonuç seçici

Sekiz 74HC153 (çift 4'ten 1'e seçici), seçim girişleri doğrudan OP1 OP0. Her sonuç biti için 4
kaynak: toplama/çıkarma (M), aynısı, çarpım (P), bölüm (Q). 8. bit toplamada T8, çarpmada P8; 9–15
bitler yalnız çarpmada.

### Onluğa çevirme ("3 ekle ve kaydır")

Göstergeler onluk, sayılar ikilik. Dönüşüm double dabble algoritmasının birleşimsel hali: ikilik
sayı en anlamlı bitten başlayarak onluk hanelere bit bit kaydırılır; her kaydırmadan önce 5 ya da
daha büyük olan her haneye 3 eklenir (kaydırınca 2 × 5 + 6 = 16, yani onluk taşma doğru olur).

Donanımda her "≥ 5 ise 3 ekle" bir modüldür: ≥ 5 algılama (d3 + d2 · (d1 + d0), 3 kapı) ve bir
74HC283 (B1 = B2 = ≥ 5, yani +3 ya da +0). Bir modül yalnızca hanenin o noktada gerçekten 5'e
ulaşabildiği yerlere konur (bütün girişler denenerek bulunur, `hesap8/bcd.ts`):

| Sayı | Bit | Hane | Modül |
|---|---|---|---|
| A, B, kalan | 8 | 3 | 7'şer |
| Sonuç | 16 | 5 | 33 |

### Göstergeler

Her hane: 74HC4511 (BCD → 7 segment, mandal hep geçirgen: LE = GND) → 8 × 470 Ω yalıtılmış direnç
dizisi (DIP-16) → 0,56" ortak katotlu gösterge (ör. 5161AS). 4511'in 6 ve 9'u "kuyruksuz"dur (6'da
üst, 9'da alt çizgi yok): veri sayfasındaki desen budur, hata değil.

Baştaki sıfırları söndürme: her hane için "bu hane 0" (NOR / NOT) ve "soldaki bütün haneler de 0"
(AND zinciri); sonuç ~BI'ya gider. Grup söndürme (sonuçta HATA, kalanda "bölme değil ya da B = 0")
aynı kapıya NOR ile girer. Lamba testi (~LT) 4511'de ~BI'dan üstündür: söndürülmüş haneler de yanar.

## Hız

Saat yok; soru "anahtarı çevirdikten ne kadar sonra göstergeler doğru?". Statik analiz
(`npm run hesap8 -- ozet --yol`, gecikmeler 74HC veri sayfalarından, 4,5 V, 25 °C):

- En uzun yol: Çarpma → Sonuç seçici → Onluğa çevirme (sonuç) → Gösterge. 74 çip geçer.
- Tipik 887 ns, en kötü 2,05 µs. Göz hiçbir geçişi göremez; anahtar sıçraması (bounce) bile
  devreden yavaştır.

Uzun yolun büyük kısmı 16 bitlik onluğa çevirmedir (zincirleme 13 modül). Daha hızlı olması
gerekmez; bir hesap makinesinde 2 µs anlıktır.

## Besleme

5 V, 2 pinli giriş (J1: 1 = +5 V, 2 = GND), 100 µF giriş kondansatörü, her entegreye 100 nF.

- 74HC çiplerinin durgun akımı ihmal edilebilir (µA). Akımın neredeyse hepsi LED'lerden.
- Segment akımı ≈ (5 − 2 − 0,3) V / 470 Ω ≈ 6 mA; bir hane en çok 7 segment ≈ 42 mA
  (74HC4511'in toplam VCC / GND sınırı 50 mA).
- Tipik (≈ 9 hane yanık, ortalama 5 segment) ≈ 0,3 A; lamba testinde (14 hane × 7 segment)
  ≈ 0,6 A. **5 V 2 A adaptör** yeterli ve paylıdır.

## Malzeme

| Parça | Adet |
|---|---|
| 74HC283 | 88 |
| 74HC08 | 38 |
| 74HC32 | 32 |
| 74HC157 | 16 |
| 74HC4511 | 14 |
| 74HC04 | 8 |
| 74HC153 | 8 |
| 74HC02 | 6 |
| 74HC86 | 4 |
| 74HC00, 74HC30 | 1'er |
| 7 segment gösterge, ortak katot, 0,56" | 15 |
| 8 × 470 Ω yalıtılmış direnç dizisi (DIP-16) | 14 |
| 8 × 10 kΩ direnç dizisi (SIP-9) | 3 |
| 8'li DIP anahtar, 2'li DIP anahtar, buton | 2, 1, 1 |
| LED (4 yeşil işlem, 1 kırmızı HATA), 330 Ω | 5, 6 |
| 100 nF, 100 µF, 10 kΩ, 2 pin başlık | 216, 1, 1, 1 |

Tam liste ve referanslar: `cpu16/kicad/hesap/bom.csv`. Soketler: 90 × DIP-14, 126 × DIP-16.

## Araçlar

```
npm run hesap8 -- ozet [--yol]          blok blok çipler, pasifler, en uzun yol, ERC
npm run hesap8 -- hesapla 255 x 7       devreyi çalıştır, göstergeleri yaz (+ - x /)
npm run hesap8 -- dogrula [--hepsi]     altın modelle karşılaştır (--hepsi: 262 144 durum)
npm run cpu16 -- board kicad            KiCad dosyaları (cpu16/kicad/hesap/)
npm run cpu16 -- kurulum hesap -o dizin kurulum belgesi (HTML + PDF) ve şema PDF'i
```

Fiziksel kurulum: [kurulum-rehberi.md](kurulum-rehberi.md).
