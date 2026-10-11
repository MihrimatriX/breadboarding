# Deney 1: Saat ve reset kartı

> **Video:** "Bilgisayarın kalbi: saat, reset ve tek adım" · **Önce:** yok · **Kart:** saat kartı (`clk`, 9 entegre)

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

1. Besleme rayları: 5 V'u akım sınırlı (≈ 200 mA) kaynaktan ver, raylara C204 (100 µF).
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
8. U206 (74HC541) çıkış sürücüsü ve CLK LED'i (D201, R204).

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
<!-- otomatik: bitti -->
