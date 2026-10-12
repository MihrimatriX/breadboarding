# Deney 1: Saat ve reset kartı

> **Video:** "Bilgisayarın kalbi: saat, reset ve tek adım" · **Önce:** yok · **Kart:** saat kartı (`clk`, 9 entegre)
>
> **Breadboard panosu** (bilgisayarın kalıcı breadboard yolu, [docs/breadboard.md](../docs/breadboard.md)): `clk-breadboard.pdf` (Saat ve reset kartı), 2–3. aşamalar (önce 1. aşama: taban, besleme, uyarlayıcı).

Pasif elemanları (renk kodu, LED'in kutbu, 100 nF dekuplaj, elektrolitiğin şeridi) ilk kez takıyorsan
önce [LED, direnç ve kondansatör](led-ve-direnc.md) rehberine bak: bu kartta hepsi var.

## Ne öğreneceksin

- Bir bilgisayarda her şeyin neden bir saat kenarında olduğunu; yükselen ve düşen kenarın ayrı işleri.
- Johnson sayacıyla parazitsiz (glitch'siz) saat ve yazma penceresi üretmeyi.
- Buton sıçramasını (bounce) Schmitt tetikleyiciyle süzmeyi ve asenkron bir butonu saate eşzamanlamayı.
- Açılış reseti (RC gecikmesi) ve tek döngü adımlama: CPU'yu istediğin kadar yavaş izleyebilmek.

## Nasıl çalışır

Osilatör CPU saatinin 8 katında çalışır. 74HC175 (U203) dört flip-flopluk bir **Johnson sayacıdır**:
son çıkışın tersi ilk girişe döner, sayaç 8 durumu sırayla gezer ve her adımda yalnızca bir bit değişir.

```
durum  Q0Q1Q2Q3   CLK = ~Q3   WR_WIN = ~Q0 ∧ Q2
s0     0 0 0 0       1           0
s1     1 0 0 0       1           0
s2     1 1 0 0       1           0
s3     1 1 1 0       1           0
s4     1 1 1 1       0           0     ← CLK düşer: kontrol register'ı mikrokodu örnekler
s5     0 1 1 1       0           1     ← bellek yazma penceresi açılır
s6     0 0 1 1       0           1
s7     0 0 0 1       0           0     ← pencere kapanır
s0                   1           0     ← CLK yükselir: register'lar yüklenir
```

İki komşu bitten çözülen sinyal tek bitlik değişimle değiştiği için kod çözücü çıkışında parazit oluşmaz.
Bellek yazma darbesi bu yüzden adres ve veri oturduktan sonra başlar, register'lar değişmeden önce biter.

**Adım kipi.** OTOMATİK/ADIM anahtarı (SW203) ADIM'dayken osilatör sayaca yalnızca GO = 1 iken ulaşır.
ADIM butonu (SW202) 74HC14 ile süzülür, osilatörün düşen kenarında iki flip-flopla (U204) eşzamanlanır;
basış anı GO'yu (U205) kurar, sayaç tekrar s0'a gelince GO düşer: bir basış = tam bir CPU döngüsü.

**Reset.** R201 (10 kΩ) ve C201 (10 µF) açılışta ≈ 0,1 s'lik bir reset üretir; RESET butonu (SW201)
kondansatörü boşaltır. 74HC14'ün iki kademesi temiz `RESET` ve `~RST` verir; `~RST` Johnson sayacını
s0'a (CLK = 1) çeker.

**Yavaş osilatör.** 74HC14'ün bir kapısı, trimpot (RV201 + R203) ve C203 ile RC osilatördür:
yaklaşık 12 Hz – 1 kHz, yani CPU saati ≈ 1,5 – 150 Hz. LED'lerle izlemek için idealdir. YAVAŞ/HIZLI
anahtarı (SW204) 74HC157 (U202) ile kaynağı seçer.

## Kurulum adımları

1. Besleme rayları: 5 V'u akım sınırlı (≈ 200 mA) kaynaktan ver, raylara C204 (100 µF, şeritli bacak
   GND rayına). Her entegrenin yanına bir 100 nF ("104").
2. U201 (74HC14) + reset devresi (R201, C201, SW201). `~RST` ve `RESET`'i lojik probla ölç: butona
   basınca `~RST` = 0.
3. Yavaş osilatör: RV201, R203, C203 ve U201'in 4. kapısı. `OSC_SLOW`'da kare dalga görmelisin
   (LED gösterge modülüyle yanıp söner).
4. U202 (74HC157) ve SW204: `OSC_SRC` = YAVAŞ'ta `OSC_SLOW`, HIZLI'da kristal (`OSC_XTAL`).
5. Kristal osilatör X201: ilk kurulumda **8 MHz** tak (CPU 1 MHz); tasarım hedefi 32 MHz (CPU 4 MHz) için
   `cpu16/docs/uretim.md` "Saat hızı" bölümüne bak.
6. Johnson sayacı U203 (74HC175) ve U209 (74HC04). Q0..Q3'e gösterge modülünü bağla, YAVAŞ ve OTOMATİK'te
   yukarıdaki diziyi gör.
7. Adım mantığı: U204, U205 (74HC74), U207 (74HC08), U208 (74HC32), SW202 ve SW203.
8. U206 (74HC541) çıkış sürücüsü ve CLK LED'i (D201, R205): `CLK` → R205 (330 Ω, turuncu – turuncu –
   kahverengi) → LED'in uzun bacağı; kısa bacak GND'ye. Mavi LED ≈ 5,8 mA çeker
   ([seri direnç hesabı](led-ve-direnc.md#seri-direnç-ledi-her-zaman-bir-dirençle-sür)). R204 (10 kΩ)
   `~WAIT`'in çekme direncidir: bekleme isteyen kart yokken CPU beklemez.

## Test: beklenen sonuç

| Ayar | Beklenen |
|---|---|
| YAVAŞ + OTOMATİK | CLK LED'i düzenli yanıp söner; trimpotla hız değişir |
| YAVAŞ + ADIM | CLK LED'i yanık (s0) durur; her ADIM basışında bir kez söner ve yanar |
| RESET basılı | `~RESET` = 0, CLK = 1; bırakınca sayaç s0'dan başlar |
| Lojik analizör, HIZLI | CLK periyodu = 8 × osilatör periyodu, %50 görev oranı; WR_WIN yalnızca CLK = 0 iken, s5–s6'da 1 |

## Simülatörde

- Kapı seviyesi test: `npx vitest run cpu16/tests/board.test.ts -t "saat kartı"` (ADIM kipinde her basışın
  tam bir döngü ilerlettiği doğrulanır).
- 3D: Silikon3D → "CPU16 kartı 3D" → saat kartı; konsolda `kart.secCip("U203")` Johnson sayacının içini,
  bir flip-flopa tıklamak transistörlerini gösterir. `kart.hiz(2)` ile yavaşlat, `kart.secNet("CLK")`.
  `kart.yakinlas("D201")` mavi CLK LED'ine yaklaşır: CLK 1 olunca yanar. D201'e, R205'e ya da C201'e
  tıklayınca sağ panel değeri, renk bantlarını, akımı ve RC süresini anlatır.
- Şema: `cpu16/kicad/clk/clk.kicad_sch` (KiCad 7).

## Sorun giderme

| Belirti | Bak |
|---|---|
| ADIM'da bir basış birden çok döngü ilerletiyor | C202 (1 µF) ve U201'in 3. kapısı; buton doğrudan 74HC74'e gidiyor olabilir |
| Sayaç 0101 gibi Johnson dizisinde olmayan bir durumda dönüyor | açılışta reset gelmedi: `~MR`'ye `~RST` bağlı mı, C201 yönü |
| HIZLI'da CLK düzensiz | osilatör modülünün 8. bacağı `OSC_XTAL`, 7 GND, 14 VCC; dekuplaj |
| CLK hiç değişmiyor | ADIM kipinde misin (SW203), `OSC_G` = `OSC_SRC` ∧ (`AUTO` ∨ `GO`) |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
#### Malzeme (10 entegre, 26 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 74HC04 | 1 | U210 | 6 × NOT (evirici) | GND 7, VCC 14 |
| 74HC08 | 2 | U207 U208 | 4 × 2 girişli AND | GND 7, VCC 14 |
| 74HC14 | 1 | U201 | 6 × Schmitt tetiklemeli NOT | GND 7, VCC 14 |
| 74HC32 | 1 | U209 | 4 × 2 girişli OR | GND 7, VCC 14 |
| 74HC74 | 2 | U204 U205 | 2 × D flip-flop (asenkron preset ve clear) | GND 7, VCC 14 |
| 74HC157 | 1 | U202 | 4 × (2'den 1'e seçici) | GND 8, VCC 16 |
| 74HC175 | 1 | U203 | 4 × D flip-flop (ortak saat, asenkron reset) | GND 8, VCC 16 |
| 74HC541 | 1 | U206 | 8 bit üç durumlu tampon (iki aktif düşük OE) | GND 10, VCC 20 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| C_1U | 2 | C202 C203 | 1 µF kondansatör |
| C_10U | 1 | C201 | 10 µF elektrolitik kondansatör |
| C_100N | 10 | C205 C206 C207 C208 C209 C210 C211 C212 C213 C214 | 100 nF seramik kondansatör (dekuplaj) |
| C_100U | 1 | C204 | 100 µF elektrolitik kondansatör (kart girişi) |
| LED | 1 | D201 | 3 mm LED |
| OSC_CAN | 1 | X201 | Kristal osilatör modülü (DIP-14 kılıf, 5 V) |
| POT_100K | 1 | RV201 | 100 kΩ trimpot |
| R_1K | 1 | R203 | 1 kΩ direnç |
| R_10K | 3 | R201 R202 R204 | 10 kΩ direnç |
| R_330 | 1 | R205 | 330 Ω direnç (LED akımı) |
| SW_PUSH | 2 | SW201 SW202 | Basmalı buton (6 mm) |
| SW_SPDT | 2 | SW203 SW204 | Sürgülü anahtar (1 kutup, 2 konum) |

Yapıştırıcı lojik çiplerinin kapıları bloklara dağılmıştır; bu deneyde kullanılan kapılar:

- **U207** (74HC08, bu deneyde takılır): 1. kapı (yazma penceresi (s5, s6)); 2. kapı (basış anı (bir osilatör periyodu)); 3. kapı (GO tut); 4. kapı (sayaç s7'de)
- **U208** (74HC08, bu deneyde takılır): 1. kapı (~WAIT örnekleme kenarı: s7'nin ortası); 2. kapı (beklemede CLK düşük kalır); 3. kapı (beklemede yazma penceresi açılmaz); 4. kapı (kapılı osilatör)
- **U209** (74HC32, bu deneyde takılır): 1. kapı (sayaç s0'da değil); 2. kapı (GO tut (s0 değil ya da bekleme turu)); 3. kapı (GO sonraki); 4. kapı (saat izni)
- **U210** (74HC04, bu deneyde takılır): 1. kapı (osilatör tersi (eşzamanlama)); 2. kapı (bekleme isteği)

#### Bağlantılar (43 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **GND** | U201-11 5A, U201-13 6A, U202-5 2I0, U202-6 2I1, U202-10 3I1, U202-11 3I0, U202-13 4I1, U202-14 4I0, U202-15 ~E, U206-1 ~OE1, U206-7 A5, U206-8 A6, U206-9 A7, U206-19 ~OE2, U210-5 3A, U210-9 4A, U210-11 5A, U210-13 6A | sabit seviye |
| **VCC** | U204-4 ~1PRE, U204-10 ~2PRE, U205-4 ~1PRE, U205-10 ~2PRE | sabit seviye |
| `~BTN_P` | U204-8 ~2Q, U207-5 2B |  |
| `~IS_S0` | U209-3 1Y, U209-4 2A |  |
| `~JQ0` | U203-3 ~Q0, U207-1 1A |  |
| `~JQ2` | U203-11 ~Q2, U207-12 4A |  |
| `~OSC_SRC` | U204-3 1CLK, U204-11 2CLK, U205-3 1CLK, U208-1 1A, U210-2 1Y |  |
| `~RESET` | U206-16 Y2 | arka panel 7 · ◀ LED'le izlenebilir |
| `~RST` | U201-4 2Y, U203-1 ~MR, U204-1 ~1CLR, U204-13 ~2CLR, U205-1 ~1CLR, U205-13 ~2CLR, U206-4 A2 |  |
| `~WAIT` | R204.2, U210-3 2A | arka panel 46 · çekme direnci |
| `~WST` | U205-8 ~2Q, U208-5 2B, U208-10 3B |  |
| `AUTO` | SW203.2, U209-12 4A |  |
| `BTN_S` | U204-5 1Q, U204-12 2D, U207-4 2A |  |
| `CLK` | R205.1, U206-18 Y0 | arka panel 5 · ◀ LED'le izlenebilir |
| `CLK_G` | U206-2 A0, U208-6 2Y |  |
| `GO` | U205-5 1Q, U207-9 3A, U209-13 4B |  |
| `GO_HOLD` | U207-10 3B, U209-6 2Y |  |
| `GO_NEXT` | U205-2 1D, U209-8 3Y |  |
| `JCLK` | U203-4 D0, U203-14 ~Q3, U208-4 2A |  |
| `JQ0` | U203-2 Q0, U203-5 D1, U209-1 1A |  |
| `JQ1` | U203-7 Q1, U203-12 D2, U206-5 A3 |  |
| `JQ2` | U203-10 Q2, U203-13 D3, U207-2 1B |  |
| `JQ3` | U203-15 Q3, U207-13 4B, U209-2 1B |  |
| `JS7` | U207-11 4Y, U208-2 1B |  |
| `JWR` | U207-3 1Y, U208-9 3A |  |
| `LED_CLK` | D201.1, R205.2 |  |
| (adsız) | U207-8 3Y, U209-10 3B |  |
| `OSC_G` | U203-9 CP, U208-11 4Y |  |
| `OSC_RUN` | U208-13 4B, U209-11 4Y |  |
| `OSC_SLOW` | RV201.1, U201-8 4Y, U202-3 1I1 |  |
| `OSC_SRC` | U202-4 1Y, U206-6 A4, U208-12 4A, U210-1 1A |  |
| `OSC_XTAL` | U202-2 1I0, X201.8 |  |
| `PRESS` | U207-6 2Y, U209-9 3A |  |
| `RESET` | U201-2 1Y, U201-3 2A |  |
| `RST_RC` | C201.1, R201.2, SW201.1, U201-1 1A |  |
| `SLOW_FB` | R203.1, RV201.2, RV201.3 |  |
| `SLOW_RC` | C203.1, R203.2, U201-9 4A |  |
| `SLOW_SEL` | SW204.2, U202-1 S |  |
| `STEP_BTN` | U201-6 3Y, U204-2 1D |  |
| `STEP_RC` | C202.1, R202.2, SW202.1, U201-5 3A |  |
| `WAIT_CK` | U205-11 2CLK, U208-3 1Y |  |
| `WAITREQ` | U205-12 2D, U210-4 2Y |  |
| `WR_G` | U206-3 A1, U208-8 3Y |  |
| `WR_WIN` | U206-17 Y1 | arka panel 6 · ◀ LED'le izlenebilir |
| `WST` | U205-9 2Q, U209-5 2B |  |

**Boşta kalan çıkışlar (bağlanmaz):** U201-10 5Y, U201-12 6Y, U202-7 2Y, U202-9 3Y, U202-12 4Y, U203-6 ~Q1, U204-6 ~1Q, U204-9 2Q, U205-6 ~1Q, U206-11 Y7, U206-12 Y6, U206-13 Y5, U206-14 Y4, U206-15 Y3, U210-6 3Y, U210-8 4Y, U210-10 5Y, U210-12 6Y

**İzlenebilecek çıkışlar (3):** `~RESET`, `CLK`, `WR_WIN`
<!-- otomatik: bitti -->
