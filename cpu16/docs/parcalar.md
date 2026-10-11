# CPU16 — Parça Kütüphanesi (Faz 3)

> Bilgisayarda kullanılan her entegrenin pin düzeni, kapı seviyesi içi, CMOS transistör açılımı ve KiCad sembolü **tek kaynaktan** gelir: `cpu16/chips/`.

## Ne var

| Dosya | İçerik |
|---|---|
| `chips/logic.ts` | Kapı seviyesi simülatör: 0/1/Z/X lojiği, çok sürücülü netler (veriyolu), dalga tabanlı zamanlama, DFF / mandal / üç durumlu tampon / davranışsal blok |
| `chips/parts/*.ts` | 35 çipin tanımı: pinler (veri sayfasındaki numaralarla), kapı devresi, veri sayfası fonksiyon tablosu (referans model) |
| `chips/cmos.ts` | Kapı → CMOS transistör açılımı; çıktı Silikon3D'nin anahtar seviyesi motorunun okuduğu biçimde |
| `chips/bench.ts`, `chips/transistor-bench.ts` | Tek çipi kapı veya transistör seviyesinde çalıştıran tezgâhlar |
| `chips/kicad.ts` → `kicad/cpu16.kicad_sym` | KiCad 7+ sembol kütüphanesi (pin numaraları, footprint, açıklama) |

```sh
npm run cpu16 -- chips        # tablo: kapı ve transistör sayıları
npm run cpu16 -- kicad-sym    # cpu16/kicad/cpu16.kicad_sym dosyasını yeniden üret
npx vitest run cpu16/tests/chips.test.ts
```

## Nasıl doğrulanıyor (Faz 3 "bitti" ölçütü)

1. **Kapı modeli = veri sayfası.** Her çipin fonksiyon tablosu kapı devresinden bağımsız olarak koda yazıldı (`ref`). Birleşimsel çiplerde 12 girişe kadar **bütün kombinasyonlar** gri kod sırasıyla, diğerlerinde ve sıralı çiplerde 2 × 3000 rastgele adım (her adımda tek pin değişir) karşılaştırılır.
2. **Transistör modeli = kapı modeli.** Aynı adımlar kapılardan açılan CMOS netlist'i üzerinde Silikon3D'nin `SwitchLevelEngine`'inde (6502'yi çalıştıran motor) koşar; her adımda bütün çıkışlar aynı olmalı.
3. **Pin düzeni**: her kılıfta pinler 1..N, GND N/2'de, VCC N'de (74HC ve JEDEC bellek düzeni); KiCad sembolündeki pin numaraları kütüphaneyle birebir.
4. **Veri sayfası satırları**: 74HC138, 148, 283, 161 (yükle/say/TC), 74 (ikisi birden aktif), 595 (kaydır/mandalla/Z) için tablo satırları ayrıca yazıldı.
5. **Bellekler** davranışsaldır (içleri kapı değil): 62256 ve AS6C4008 okuma/yazma/Z, SST39SF010A komut dizileriyle programlama, kimlik okuma, sektör ve çip silme.

Güç verildiğinde flip-flopların değeri **bilinmiyor (X)** kabul edilir; veri sayfası da öyle der. Testler bu durumda karşılaştırma yapmaz, ilk saat/reset sonrasında yapar.

## Çipler

| Parça | Kılıf | Kapı | Transistör | Açıklama |
|---|---|---|---|---|
| 74HC00 | DIP-14 | 4 | 16 | 4 × 2 girişli NAND |
| 74HC02 | DIP-14 | 4 | 16 | 4 × 2 girişli NOR |
| 74HC04 | DIP-14 | 6 | 12 | 6 × NOT (evirici) |
| 74HC05 | DIP-14 | 6 | 48 | 6 × NOT, açık-akaçlı (open-drain) çıkış |
| 74HC08 | DIP-14 | 4 | 24 | 4 × 2 girişli AND |
| 74HC10 | DIP-14 | 3 | 18 | 3 × 3 girişli NAND |
| 74HC14 | DIP-14 | 6 | 12 | 6 × Schmitt tetiklemeli NOT |
| 74HC32 | DIP-14 | 4 | 24 | 4 × 2 girişli OR |
| 74HC86 | DIP-14 | 4 | 48 | 4 × 2 girişli XOR |
| 74HC125 | DIP-14 | 8 | 40 | 4 × üç durumlu tampon (aktif düşük OE) |
| 74HC138 | DIP-16 | 14 | 82 | 3'ten 8'e kod çözücü (aktif düşük çıkış) |
| 74HC139 | DIP-16 | 14 | 60 | 2 × (2'den 4'e kod çözücü) |
| 74HC148 | DIP-16 | 24 | 128 | 8'den 3'e öncelikli kodlayıcı |
| 74HC151 | DIP-16 | 14 | 124 | 8'den 1'e seçici (multiplexer) |
| 74HC153 | DIP-16 | 14 | 108 | 2 × (4'ten 1'e seçici) |
| 74HC157 | DIP-16 | 14 | 92 | 4 × (2'den 1'e seçici) |
| 74HC283 | DIP-16 | 30 | 260 | 4 bit ikili tam toplayıcı (ileri bakışlı elde) |
| 74HC688 | DIP-20 | 10 | 116 | 8 bit eşitlik karşılaştırıcı |
| 74HC74 | DIP-14 | 2 | 72 | 2 × D flip-flop (asenkron preset ve clear) |
| 74HC161 | DIP-16 | 26 | 309 | 4 bit senkron ikili sayıcı (asenkron reset) |
| 74HC193 | DIP-16 | 36 | 310 | 4 bit senkron ileri/geri ikili sayıcı (asenkron yükleme ve temizleme) |
| 74HC393 | DIP-14 | 12 | 297 | 2 × 4 bit dalgalı (ripple) ikili sayıcı (düşen kenar, asenkron temizleme) |
| 74HC165 | DIP-16 | 34 | 376 | 8 bit paralel giriş / seri çıkış kaydırmalı register |
| 74HC166 | DIP-16 | 34 | 441 | 8 bit paralel giriş / seri çıkış kaydırmalı register (eşzamanlı yükleme) |
| 74HC175 | DIP-16 | 4 | 145 | 4 × D flip-flop (ortak saat, asenkron reset) |
| 74HC573 | DIP-20 | 17 | 210 | 8 bit şeffaf mandal (üç durumlu çıkış) |
| 74HC574 | DIP-20 | 17 | 355 | 8 bit D flip-flop register (üç durumlu çıkış) |
| 74HC273 | DIP-20 | 8 | 289 | 8 bit D flip-flop register (ortak asenkron reset) — bank register'ları |
| 74HC590 | DIP-16 | 42 | 841 | 8 bit ikili sayıcı + çıkış register'ı (üç durumlu çıkış) — önbellek sayaçları |
| 74HC595 | DIP-16 | 25 | 643 | 8 bit seri giriş / paralel çıkış kaydırmalı register (çıkış mandallı) |
| 74HC245 | DIP-20 | 20 | 144 | 8 bit çift yönlü veriyolu alıcı-vericisi |
| 74HC541 | DIP-20 | 9 | 68 | 8 bit üç durumlu tampon (iki aktif düşük OE) |
| 62256 | DIP-28 | - | - | 32 KB statik RAM (32K × 8) |
| AS6C4008 | DIP-32 | - | - | 512 KB statik RAM (512K × 8) |
| SST39SF010A | DIP-32 | - | - | 128 KB Flash (128K × 8, 5 V, komutla programlanır) |
"Kapı" sayısında flip-flop ve mandal tek eleman sayılır; transistör sayısı onların açılmış halini içerir. Gerçek 74HC çiplerinde giriş koruma diyotları ve tamponlanmış çıkış katları da vardır, mantığı değiştirmedikleri için modellenmez; bu yüzden gerçek transistör sayısı biraz daha yüksektir.

CPU16'da her çipin nerede kullanıldığı `usage` alanında ve KiCad sembolünün `CPU16_Kullanim` özelliğinde yazılı.

## Transistör açılımı kuralları

| Kapı | Devre | Transistör |
|---|---|---|
| NOT | 1 PMOS (VCC→Y) + 1 NMOS (Y→GND) | 2 |
| NAND (k giriş) | k paralel PMOS + k seri NMOS | 2k |
| NOR (k giriş) | k seri PMOS + k paralel NMOS | 2k |
| AND / OR | NAND / NOR + NOT | 2k + 2 |
| XOR | 2 evirici + AOI22: Y = ¬(a·b + ā·b̄) | 12 |
| Üç durumlu tampon | evirici + üç durumlu evirici (P-P ve N-N seri yığın) | 8 |
| D flip-flop | 7474 yapısı: 6 adet 3 girişli NAND (kenar tetiklemeli) | 36 |
| D mandalı | 4 NAND + 1 NOT | 18 |

VCC'ye bağlı girişler bir "tie-high" hücresinden beslenir (kapısı GND'de bir PMOS): anahtar seviyesi motor güç raylarını yeniden hesaplamaz, gerçek çiplerde de sabit girişler böyle bağlanır.

## Kütüphanede olmayan parçalar (BOM'da var, simülasyonda ideal)

Saat osilatörü (4 MHz kristal osilatör kutusu), 555 (adım saati), reset butonu RC'si, dekuplaj kondansatörleri, LED ve dirençler, VGA konnektörü ve renk direnç DAC'ı, PS/2 konnektörü, USB-UART modülü (CH340). Simülasyonda bunlar ideal sinyal kaynağı olarak modellenir; listesi Faz 9 BOM'unda.

## Yeni çip eklemek

1. `chips/parts/` altında `ChipDef` yaz: `pinsOf("…veri sayfası sırasıyla pin adları…", { out, tri, bidir })`, `build(c, p)` ile kapılar, `ref` ile fonksiyon tablosu.
2. `chips/library.ts` listesine ekle.
3. `npm run cpu16 -- kicad-sym` ile sembol kütüphanesini yenile, `npx vitest run cpu16/tests/chips.test.ts` çalıştır: kapı = tablo ve transistör = kapı testleri kendiliğinden eklenir.
