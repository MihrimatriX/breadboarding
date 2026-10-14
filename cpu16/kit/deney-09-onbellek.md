# Deney 9: Bekleme durumları ve önbellek

> **Video:** "Önbellek: aynı kod neden daha hızlı çalışır?" · **Önce:** Deney 8 (bellek kartı) · **Kart:** önbellek kartının kalanı (`onbellek`): etiket ve veri belleği, sayaçlar
>
> **Breadboard panosu** (bilgisayarın kalıcı breadboard yolu, [docs/breadboard.md](../docs/breadboard.md)): `onbellek-breadboard.pdf` (Önbellek kartı), 3. aşama.

Bu deneyin sonunda 2 KB'lık doğrudan eşlemeli önbellek çalışır. LED'lerdeki kayan ışık bir turu
önbellek açık, bir turu kapalı atar: bit 7 yanarken ışık gözle görülür biçimde daha hızlı kayar.

## Ne öğreneceksin

- **Doğrudan eşlemeli önbellek**: 1024 satır × 1 kelime. Satır = adresin `A10..A1` bitleri, etiket =
  `A11..A13` + `PA14..PA19` + geçerli biti; etiket 74HC688'lerle karşılaştırılır.
- **İsabet ve ıskalama**: isabette veri SRAM'i veriyolunu doğrudan sürer, bekleme yoktur; ıskalamada
  iki bekleme turu olur, satır aynı erişimde veriyolundan doldurulur.
- **Write-through**: her yazma ana belleğe gider (iki bekleme); RAM'e yazma isabetinde satır
  güncellenir, EEPROM ya da boş bölgeye (`PA19 = 0`) yazma isabetinde satır geçersiz kılınır.
- **Reset'te temizleme**: 1024 satırın geçerli bitini bir sayaç (74HC161 × 3) osilatör hızında siler.
- **Performans sayaçları**: isabet ve ıskalama sayımı (`FF30–FF33`), `CACHE_CTRL` (`FF34`). Her sayaç
  dört 74HC161'den 16 bitlik eşzamanlı bir sayıcıdır (bir basamağın `TC`'si sonrakinin `CET`'ine);
  CPU onu iki 74HC541 tamponla okur.

## Nasıl çalışır

- Okumada etiket SRAM'i (U513, U514) satırın etiketini verir, U517/U518 bunu o anki adresle
  karşılaştırır: eşitse ve geçerliyse `C_HIT` 1 olur. `C_EN` ∧ `C_HIT` ise veri SRAM'leri (U519 çift,
  U520 tek bayt) `~MRD` ile birlikte `DE`/`DO`'yu sürer ve `~WAIT` hiç düşmez.
- Iskalamada (ya da önbellek kapalıyken) Deney 8'deki iki bekleme turu olur; ikinci turun
  `TAGPH` evresinde bellek kartının sürdüğü veri satıra, yeni etiket (U515, U516 üzerinden) etiket
  SRAM'ine yazılır. Yazma her zaman iki tur bekler.
- Sayaçlar CLK↑'de, yalnızca önbellek açıkken sayar; `FF30`'a yazma ikisini de sıfırlar.
  Okuma 74HC541'lerle doğrudan sayıcıdan yapılır: sayaçlar yalnız bellek okumalarının sonunda
  değişir, `FF30–FF33` okunurken (G/Ç erişimi) sabittir. `CACHE_CTRL` bit 0 = `C_EN` (U506, reset'te
  1); geri okuma U533.
- Reset: `~RESET` düşükken U506'nın `CLRS` çıkışı etiket adresini temizleme sayacına (U507–U509)
  geçirir; **`~RESET` en az 1025 osilatör periyodu** düşük kalmalı (RC reset milisaniyeler sürer).
- Ayrıntılı zaman çizimi: `cpu16/docs/anakart-kartlari.md` ("Önbellek kartı", "Bekleme durumlu bir erişim").
- Program (`cpu16/kit/programlar/onbellek-deneme.s`): bekleme döngüsü aynı iki komutu binlerce kez
  çalıştırır. Önbellek kapalıyken her komut EEPROM'dan iki bekleme turuyla gelir (komut başına 5
  yerine 7 döngü); açıkken ilk geçişten sonra hep isabet eder.

## Kurulum adımları

1. Deney 8'de `C_EN` ve `C_HIT`'i GND'ye çeken 10 kΩ dirençleri çıkar.
2. Etiket belleği bloğu: U506 (`CLRS`, `EN`), temizleme sayacı (U507–U509), etiket adresi
   seçicileri (U510–U512), etiket SRAM'leri (U513, U514), yeni etiket sürücüleri (U515, U516),
   karşılaştırıcılar (U517, U518).
3. Veri belleği: U519, U520.
4. Sayaçlar: isabet U521–U524, ıskalama U525–U528 (düşük basamak önce), geri okuma tamponları
   U529–U532; `CACHE_CTRL` geri okuma (U533) ve tablodaki kalan yapıştırıcı kapılar.
5. Önce Deney 8'in programını yeniden çalıştır: önbellek kartı tamamken de `0x5A` vermeli
   (program önbelleği kapatır; kart yine de her yazmayı izler).
6. Deneme programını EEPROM'a yaz ve U420'ye tak:
   ```
   npm run cpu16 -- asm cpu16/kit/programlar/onbellek-deneme.s -o onbellek.hex
   python3 cpu16/programlayici/yaz.py PORT onbellek.hex --dogrula
   ```

## Test: beklenen sonuç

| LED'ler | Beklenen (1 MHz) |
|---|---|
| bit 7 yanık: `0x81`, `0x82` … `0xC0` | önbellek açık: her adım ≈ 0,16 s |
| bit 7 sönük: `0x01` … `0x40` | önbellek kapalı: her adım ≈ 0,23 s (≈ 1,4 kat yavaş) |
| her 7 adımda | bit 7 değişir, ışık baştan başlar |

Bir tur kronometreyle: açıkken ≈ 1,15 s, kapalıyken ≈ 1,6 s. Mantık analizörüyle `~WAIT`'e bak:
önbellek açıkken bekleme döngüsünde hiç düşmez, kapalıyken her komut çekmede iki tur düşük kalır.

## Simülatörde

- `npm run cpu16 -- machine cpu16/kit/programlar/onbellek-deneme.s --rom --led`: LED satırlarını 1 MHz
  zamanıyla basar; adımlar arasındaki süre farkı doğrudan okunur.
- Kapı seviyesi: `cpu16/tests/anakart-bellek.test.ts` önbellek kartını her erişimde `Machine`'in
  önbellek modeliyle karşılaştırır (etiketler, satır verisi, isabet ve ıskalama sayaçları);
  `cpu16/tests/anakart-sistem.test.ts` CPU ile bütün kartları birlikte çalıştırır.
- Deney 12'den sonra BIOS monitöründe `C` komutu sayaçları ve isabet oranını yazar;
  `cpu16/bios/ornekler/onbellek.s` aynı döngüyü önbellek açıkken ve kapalıyken ölçer.

## Sorun giderme

| Belirti | Bak |
|---|---|
| Bit 7 hiç yanmıyor | `CACHE_CTRL` geri okuma (U533); `EN` flip-flop'u (U506) reset'te 1 olmalı |
| İki tur aynı hızda | `C_HIT` hiç 1 olmuyor: U517/U518 karşılaştırıcıları, geçerli biti (U514), etiket yazma darbesi (`TAGPH` evresi) |
| Önbellek açıkken LED'ler saçmalıyor | İsabette yanlış veri: veri SRAM'lerinin adresi (`A10..A1`) ve `~WE`'si; ya da etiket yanlış karşılaştırılıyor (bir `PA` hattı) |
| Yalnız RESET'ten hemen sonra saçma | Satırlar temizlenmedi: `~RESET` yeterince uzun mu (≥ 1025 OSC), temizleme sayacı U507–U509 |
| Kapatınca da hızlı | `C_EN`'in bekleme isteğine (`NEED`) girdiği kapılar |
| Deney 8 programı artık hata veriyor | Write-through yolu: yazmada önbellek kartı `~WAIT`'i yine iki tur tutmalı; U504 yazma bayrakları |
| BIOS'un `C` komutunda sayaçlar 16'da bir sıçrıyor ya da takılıyor | Sayıcı zinciri: her 74HC161'in `CET`'i bir öncekinin `TC`'sine, ilkininki VCC'ye; `CEP`'ler sayım iznine |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
#### Malzeme (32 entegre, 32 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 74HC02 | 1 | U544 | 4 × 2 girişli NOR | GND 7, VCC 14 |
| 74HC04 | 1 | U546 | 6 × NOT (evirici) | GND 7, VCC 14 |
| 74HC08 | 1 | U539 | 4 × 2 girişli AND | GND 7, VCC 14 |
| 74HC32 | 1 | U541 | 4 × 2 girişli OR | GND 7, VCC 14 |
| 74HC74 | 1 | U506 | 2 × D flip-flop (asenkron preset ve clear) | GND 7, VCC 14 |
| 74HC157 | 3 | U510 U511 U512 | 4 × (2'den 1'e seçici) | GND 8, VCC 16 |
| 74HC161 | 11 | U507 U508 U509 U521 U522 U523 U524 U525 U526 U527 U528 | 4 bit senkron ikili sayıcı (asenkron reset) | GND 8, VCC 16 |
| 74HC541 | 7 | U515 U516 U529 U530 U531 U532 U533 | 8 bit üç durumlu tampon (iki aktif düşük OE) | GND 10, VCC 20 |
| 74HC688 | 2 | U517 U518 | 8 bit eşitlik karşılaştırıcı | GND 10, VCC 20 |
| 62256 | 4 | U513 U514 U519 U520 | 32 KB statik RAM (32K × 8) | GND 14, VCC 28 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| C_100N | 32 | C507 C508 C509 C510 C511 C512 C513 C514 C515 C516 C517 C518 C519 C520 C521 C522 C523 C524 C525 C526 C527 C528 C529 C530 C531 C532 C533 C534 C540 C542 C545 C547 | 100 nF seramik kondansatör (dekuplaj) |

Yapıştırıcı lojik çiplerinin kapıları bloklara dağılmıştır; bu deneyde kullanılan kapılar:

- **U538** (74HC08, Deney 8'de takıldı): 2. kapı (yazılan satır geçerli mi (doldurmada 1)); 3. kapı (sayaçları sıfırla (FF30 yazma, reset)); 4. kapı (ıskalama). Diğerleri: 1. kapı → Deney 8
- **U539** (74HC08, bu deneyde takılır): 1. kapı (ıskalama sayımı)
- **U541** (74HC32, bu deneyde takılır): 1. kapı (CACHE_CTRL yazma kenarı); 2. kapı (FF30 yazma); 3. kapı (FF30/31 okuma); 4. kapı (FF32/33 okuma)
- **U543** (74HC02, Deney 8'de takıldı): 3. kapı (temizleme yazma darbesi (OSC düşükken)); 4. kapı (etiket belleği ~WE). Diğerleri: 1. kapı → Deney 8, 2. kapı → Deney 8
- **U544** (74HC02, bu deneyde takılır): 1. kapı (isabet)
- **U546** (74HC04, bu deneyde takılır): 1. kapı (isabet sayımı)

#### Bağlantılar (142 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **GND** | U506-2 1D, U507-3 D0, U507-4 D1, U507-5 D2, U507-6 D3, U508-3 D0, U508-4 D1, U508-5 D2, U508-6 D3, U509-3 D0, U509-4 D1, U509-5 D2, U509-6 D3, U510-15 ~E, U511-15 ~E, U512-10 3I1, U512-11 3I0, U512-13 4I1, U512-14 4I0, U512-15 ~E, U513-1 A14, U513-2 A12, U513-20 ~CE, U513-21 A10, U513-22 ~OE, U513-23 A11, U513-26 A13, U514-1 A14, U514-2 A12, U514-20 ~CE, U514-21 A10, U514-22 ~OE, U514-23 A11, U514-26 A13, U515-19 ~OE2, U516-4 A2, U516-5 A3, U516-6 A4, U516-7 A5, U516-8 A6, U516-9 A7, U516-19 ~OE2, U517-1 ~E, U518-7 Q2, U518-9 Q3, U518-12 Q4, U518-14 Q5, U518-16 Q6, U518-18 Q7, U519-1 A14, U519-2 A12, U519-20 ~CE, U519-21 A10, U519-23 A11, U519-26 A13, U520-1 A14, U520-2 A12, U520-20 ~CE, U520-21 A10, U520-23 A11, U520-26 A13, U521-3 D0, U521-4 D1, U521-5 D2, U521-6 D3, U522-3 D0, U522-4 D1, U522-5 D2, U522-6 D3, U523-3 D0, U523-4 D1, U523-5 D2, U523-6 D3, U524-3 D0, U524-4 D1, U524-5 D2, U524-6 D3, U525-3 D0, U525-4 D1, U525-5 D2, U525-6 D3, U526-3 D0, U526-4 D1, U526-5 D2, U526-6 D3, U527-3 D0, U527-4 D1, U527-5 D2, U527-6 D3, U528-3 D0, U528-4 D1, U528-5 D2, U528-6 D3, U529-19 ~OE2, U530-19 ~OE2, U531-19 ~OE2, U532-19 ~OE2, U533-3 A1, U533-4 A2, U533-5 A3, U533-6 A4, U533-7 A5, U533-8 A6, U533-9 A7, U539-4 2A, U539-5 2B, U539-9 3A, U539-10 3B, U539-12 4A, U539-13 4B, U544-5 2A, U544-6 2B, U544-8 3A, U544-9 3B, U544-11 4A, U544-12 4B, U546-3 2A, U546-5 3A, U546-9 4A, U546-11 5A, U546-13 6A | sabit seviye |
| **VCC** | U506-1 ~1CLR, U506-13 ~2CLR, U507-7 CEP, U507-9 ~PE, U507-10 CET, U508-7 CEP, U508-9 ~PE, U509-7 CEP, U509-9 ~PE, U518-5 Q1, U521-9 ~PE, U521-10 CET, U522-9 ~PE, U523-9 ~PE, U524-9 ~PE, U525-9 ~PE, U525-10 CET, U526-9 ~PE, U527-9 ~PE, U528-9 ~PE | sabit seviye |
| `~C_CLRS` | U506-6 ~1Q, U538-5 2B, U543-9 3B |  |
| `~C_CNTCLR` | U521-1 ~MR, U522-1 ~MR, U523-1 ~MR, U524-1 ~MR, U525-1 ~MR, U526-1 ~MR, U527-1 ~MR, U528-1 ~MR, U538-8 3Y |  |
| `~C_CWE_E` | U519-27 ~WE | önceki: Deney 8 |
| `~C_CWE_O` | U520-27 ~WE | önceki: Deney 8 |
| `~C_HITRD` | U519-22 ~OE, U520-22 ~OE, U546-1 1A | önceki: Deney 8 |
| `~C_OE_HITS` | U529-1 ~OE1, U530-1 ~OE1, U541-8 3Y |  |
| `~C_OE_MISS` | U531-1 ~OE1, U532-1 ~OE1, U541-11 4Y |  |
| `~C_TEQ_HI` | U518-19 ~EQ, U544-3 1B |  |
| `~C_TEQ_LO` | U517-19 ~EQ, U544-2 1A |  |
| `~C_TWE` | U513-27 ~WE, U514-27 ~WE, U515-1 ~OE1, U516-1 ~OE1, U543-13 4Y |  |
| `~CS_CTRL` | U533-19 ~OE2, U541-2 1B | önceki: Deney 8 |
| `~CS_HITS` | U541-5 2B, U541-10 3B | önceki: Deney 8 |
| `~CS_MISS` | U541-13 4B | önceki: Deney 8 |
| `~MRD` | U533-1 ~OE1, U541-9 3A, U541-12 4A | arka panel 41 · önceki: Deney 6, 8 |
| `~MWE_E` | U541-1 1A, U541-4 2A | arka panel 42 · önceki: Deney 6, 8 |
| `~RESET` | U506-4 ~1PRE, U506-10 ~2PRE, U538-9 3A | arka panel 7 · önceki: Deney 1, 5, 6, 7, 8 |
| `A1` | U510-2 1I0, U519-10 A0, U520-10 A0 | arka panel 10 · önceki: Deney 6, 8 |
| `A2` | U510-5 2I0, U519-9 A1, U520-9 A1 | arka panel 11 · önceki: Deney 6, 8 |
| `A3` | U510-11 3I0, U519-8 A2, U520-8 A2 | arka panel 12 · önceki: Deney 6, 8 |
| `A4` | U510-14 4I0, U519-7 A3, U520-7 A3 | arka panel 13 · önceki: Deney 6, 8 |
| `A5` | U511-2 1I0, U519-6 A4, U520-6 A4 | arka panel 14 · önceki: Deney 6, 8 |
| `A6` | U511-5 2I0, U519-5 A5, U520-5 A5 | arka panel 15 · önceki: Deney 6, 8 |
| `A7` | U511-11 3I0, U519-4 A6, U520-4 A6 | arka panel 16 · önceki: Deney 6, 8 |
| `A8` | U511-14 4I0, U519-3 A7, U520-3 A7 | arka panel 17 · önceki: Deney 6, 8 |
| `A9` | U512-2 1I0, U519-25 A8, U520-25 A8 | arka panel 18 · önceki: Deney 6, 8 |
| `A10` | U512-5 2I0, U519-24 A9, U520-24 A9 | arka panel 19 · önceki: Deney 6, 8 |
| `A11` | U515-2 A0, U517-3 Q0 | arka panel 20 · önceki: Deney 6, 8 |
| `A12` | U515-3 A1, U517-5 Q1 | arka panel 21 · önceki: Deney 6, 8 |
| `A13` | U515-4 A2, U517-7 Q2 | arka panel 22 · önceki: Deney 6, 8 |
| `C_CA` | U538-13 4B | önceki: Deney 8 |
| `C_CC0` | U507-14 Q0, U510-3 1I1 |  |
| `C_CC1` | U507-13 Q1, U510-6 2I1 |  |
| `C_CC2` | U507-12 Q2, U510-10 3I1 |  |
| `C_CC3` | U507-11 Q3, U510-13 4I1 |  |
| `C_CC4` | U508-14 Q0, U511-3 1I1 |  |
| `C_CC5` | U508-13 Q1, U511-6 2I1 |  |
| `C_CC6` | U508-12 Q2, U511-10 3I1 |  |
| `C_CC7` | U508-11 Q3, U511-13 4I1 |  |
| `C_CC8` | U509-14 Q0, U512-3 1I1 |  |
| `C_CC9` | U509-13 Q1, U512-6 2I1 |  |
| `C_CLRS` | U506-5 1Q, U507-1 ~MR, U508-1 ~MR, U509-1 ~MR, U510-1 S, U511-1 S, U512-1 S, U518-1 ~E |  |
| `C_CLRWE` | U543-10 3Y, U543-12 4B |  |
| `C_EN` | U506-9 2Q, U533-2 A0, U538-12 4A | önceki: Deney 8 |
| `C_ENCK` | U506-11 2CLK, U541-3 1Y |  |
| `C_HC_TC0` | U521-15 TC, U522-10 CET |  |
| `C_HC_TC1` | U522-15 TC, U523-10 CET |  |
| `C_HC_TC2` | U523-15 TC, U524-10 CET |  |
| `C_HC0` | U521-14 Q0, U529-2 A0 |  |
| `C_HC1` | U521-13 Q1, U529-3 A1 |  |
| `C_HC2` | U521-12 Q2, U529-4 A2 |  |
| `C_HC3` | U521-11 Q3, U529-5 A3 |  |
| `C_HC4` | U522-14 Q0, U529-6 A4 |  |
| `C_HC5` | U522-13 Q1, U529-7 A5 |  |
| `C_HC6` | U522-12 Q2, U529-8 A6 |  |
| `C_HC7` | U522-11 Q3, U529-9 A7 |  |
| `C_HC8` | U523-14 Q0, U530-2 A0 |  |
| `C_HC9` | U523-13 Q1, U530-3 A1 |  |
| `C_HC10` | U523-12 Q2, U530-4 A2 |  |
| `C_HC11` | U523-11 Q3, U530-5 A3 |  |
| `C_HC12` | U524-14 Q0, U530-6 A4 |  |
| `C_HC13` | U524-13 Q1, U530-7 A5 |  |
| `C_HC14` | U524-12 Q2, U530-8 A6 |  |
| `C_HC15` | U524-11 Q3, U530-9 A7 |  |
| `C_HIT` | U544-1 1Y | önceki: Deney 8 |
| `C_HITCNT` | U521-7 CEP, U522-7 CEP, U523-7 CEP, U524-7 CEP, U546-2 1Y |  |
| `C_MC_TC0` | U525-15 TC, U526-10 CET |  |
| `C_MC_TC1` | U526-15 TC, U527-10 CET |  |
| `C_MC_TC2` | U527-15 TC, U528-10 CET |  |
| `C_MC0` | U525-14 Q0, U531-2 A0 |  |
| `C_MC1` | U525-13 Q1, U531-3 A1 |  |
| `C_MC2` | U525-12 Q2, U531-4 A2 |  |
| `C_MC3` | U525-11 Q3, U531-5 A3 |  |
| `C_MC4` | U526-14 Q0, U531-6 A4 |  |
| `C_MC5` | U526-13 Q1, U531-7 A5 |  |
| `C_MC6` | U526-12 Q2, U531-8 A6 |  |
| `C_MC7` | U526-11 Q3, U531-9 A7 |  |
| `C_MC8` | U527-14 Q0, U532-2 A0 |  |
| `C_MC9` | U527-13 Q1, U532-3 A1 |  |
| `C_MC10` | U527-12 Q2, U532-4 A2 |  |
| `C_MC11` | U527-11 Q3, U532-5 A3 |  |
| `C_MC12` | U528-14 Q0, U532-6 A4 |  |
| `C_MC13` | U528-13 Q1, U532-7 A5 |  |
| `C_MC14` | U528-12 Q2, U532-8 A6 |  |
| `C_MC15` | U528-11 Q3, U532-9 A7 |  |
| `C_MISSCNT` | U525-7 CEP, U526-7 CEP, U527-7 CEP, U528-7 CEP, U539-3 1Y |  |
| `C_MRD` | U538-4 2A, U539-1 1A | önceki: Deney 8 |
| `C_TA0` | U510-4 1Y, U513-10 A0, U514-10 A0 |  |
| `C_TA1` | U510-7 2Y, U513-9 A1, U514-9 A1 |  |
| `C_TA2` | U510-9 3Y, U513-8 A2, U514-8 A2 |  |
| `C_TA3` | U510-12 4Y, U513-7 A3, U514-7 A3 |  |
| `C_TA4` | U511-4 1Y, U513-6 A4, U514-6 A4 |  |
| `C_TA5` | U511-7 2Y, U513-5 A5, U514-5 A5 |  |
| `C_TA6` | U511-9 3Y, U513-4 A6, U514-4 A6 |  |
| `C_TA7` | U511-12 4Y, U513-3 A7, U514-3 A7 |  |
| `C_TA8` | U512-4 1Y, U513-25 A8, U514-25 A8 |  |
| `C_TA9` | U512-7 2Y, U513-24 A9, U514-24 A9 |  |
| `C_TAGWR` | U543-11 4A | önceki: Deney 8 |
| `C_TC0` | U507-15 TC, U508-10 CET |  |
| `C_TC1` | U508-15 TC, U509-10 CET |  |
| `C_TD0` | U513-11 IO0, U515-18 Y0, U517-2 P0 |  |
| `C_TD1` | U513-12 IO1, U515-17 Y1, U517-4 P1 |  |
| `C_TD2` | U513-13 IO2, U515-16 Y2, U517-6 P2 |  |
| `C_TD3` | U513-15 IO3, U515-15 Y3, U517-8 P3 |  |
| `C_TD4` | U513-16 IO4, U515-14 Y4, U517-11 P4 |  |
| `C_TD5` | U513-17 IO5, U515-13 Y5, U517-13 P5 |  |
| `C_TD6` | U513-18 IO6, U515-12 Y6, U517-15 P6 |  |
| `C_TD7` | U513-19 IO7, U515-11 Y7, U517-17 P7 |  |
| `C_TD8` | U514-11 IO0, U516-18 Y0, U518-2 P0 |  |
| `C_TD9` | U514-12 IO1, U516-17 Y1, U518-4 P1 |  |
| `C_TD10` | U514-13 IO2, U516-16 Y2, U518-6 P2 |  |
| `C_TD11` | U514-15 IO3, U516-15 Y3, U518-8 P3 |  |
| `C_TD12` | U514-16 IO4, U516-14 Y4, U518-11 P4 |  |
| `C_TD13` | U514-17 IO5, U516-13 Y5, U518-13 P5 |  |
| `C_TD14` | U514-18 IO6, U516-12 Y6, U518-15 P6 |  |
| `C_TD15` | U514-19 IO7, U516-11 Y7, U518-17 P7 |  |
| `C_VNEW` | U516-3 A1, U538-6 2Y |  |
| `CLK` | U521-2 CP, U522-2 CP, U523-2 CP, U524-2 CP, U525-2 CP, U526-2 CP, U527-2 CP, U528-2 CP | arka panel 5 · önceki: Deney 1, 6, 7, 8 |
| `DE0` | U506-12 2D, U519-11 IO0, U529-18 Y0, U531-18 Y0, U533-18 Y0 | arka panel 25 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8 |
| `DE1` | U519-12 IO1, U529-17 Y1, U531-17 Y1, U533-17 Y1 | arka panel 26 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8 |
| `DE2` | U519-13 IO2, U529-16 Y2, U531-16 Y2, U533-16 Y2 | arka panel 27 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8 |
| `DE3` | U519-15 IO3, U529-15 Y3, U531-15 Y3, U533-15 Y3 | arka panel 28 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8 |
| `DE4` | U519-16 IO4, U529-14 Y4, U531-14 Y4, U533-14 Y4 | arka panel 29 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8 |
| `DE5` | U519-17 IO5, U529-13 Y5, U531-13 Y5, U533-13 Y5 | arka panel 30 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8 |
| `DE6` | U519-18 IO6, U529-12 Y6, U531-12 Y6, U533-12 Y6 | arka panel 31 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8 |
| `DE7` | U519-19 IO7, U529-11 Y7, U531-11 Y7, U533-11 Y7 | arka panel 32 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8 |
| `DO0` | U520-11 IO0, U530-18 Y0, U532-18 Y0 | arka panel 33 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8 |
| `DO1` | U520-12 IO1, U530-17 Y1, U532-17 Y1 | arka panel 34 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8 |
| `DO2` | U520-13 IO2, U530-16 Y2, U532-16 Y2 | arka panel 35 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8 |
| `DO3` | U520-15 IO3, U530-15 Y3, U532-15 Y3 | arka panel 36 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8 |
| `DO4` | U520-16 IO4, U530-14 Y4, U532-14 Y4 | arka panel 37 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8 |
| `DO5` | U520-17 IO5, U530-13 Y5, U532-13 Y5 | arka panel 38 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8 |
| `DO6` | U520-18 IO6, U530-12 Y6, U532-12 Y6 | arka panel 39 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8 |
| `DO7` | U520-19 IO7, U530-11 Y7, U532-11 Y7 | arka panel 40 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8 |
| (adsız) | U538-10 3B, U541-6 2Y |  |
| (adsız) | U538-11 4Y, U539-2 1B |  |
| `OSC` | U506-3 1CLK, U507-2 CP, U508-2 CP, U509-2 CP, U543-8 3A | arka panel 49 · önceki: Deney 1 |
| `PA14` | U515-5 A3, U517-9 Q3 | arka panel 50 · önceki: Deney 8 |
| `PA15` | U515-6 A4, U517-12 Q4 | arka panel 51 · önceki: Deney 8 |
| `PA16` | U515-7 A5, U517-14 Q5 | arka panel 52 · önceki: Deney 8 |
| `PA17` | U515-8 A6, U517-16 Q6 | arka panel 53 · önceki: Deney 8 |
| `PA18` | U515-9 A7, U517-18 Q7 | arka panel 54 · önceki: Deney 8 |
| `PA19` | U516-2 A0, U518-3 Q0 | arka panel 55 · önceki: Deney 8 |

**Boşta kalan çıkışlar (bağlanmaz):** U506-8 ~2Q, U509-11 Q3, U509-12 Q2, U509-15 TC, U512-9 3Y, U512-12 4Y, U524-15 TC, U528-15 TC, U539-6 2Y, U539-8 3Y, U539-11 4Y, U544-4 2Y, U544-10 3Y, U544-13 4Y, U546-4 2Y, U546-6 3Y, U546-8 4Y, U546-10 5Y, U546-12 6Y
<!-- otomatik: bitti -->
