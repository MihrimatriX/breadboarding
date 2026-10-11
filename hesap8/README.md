# 8 bit hesap makinesi (hesap8)

DIP anahtarlarla girilen iki 8 bitlik sayıyı (0–255) toplayan, çıkaran, çarpan ve bölen; sonucu onluk
7 segment göstergelerde gösteren, programsız ve saatsiz bir devre. Yalnız yaygın 74HC çipleri: 216
entegre, 15 hane gösterge (A 3, B 3, sonuç işaret + 5, kalan 3).

CPU16 ile aynı altyapı (şema = kod, `cpu16/board/`): devre bir kez `kart.ts`'te tanımlanır; kapı
seviyesi simülasyon, Silikon3D'deki 3D görünüm, KiCad şeması (`cpu16/kicad/hesap/`), BOM ve kurulum
belgesi aynı tanımdan üretilir.

| Dosya | İçerik |
|---|---|
| `kart.ts` | Devrenin tanımı (bloklar, çipler, netler), KiCad sayfaları |
| `bcd.ts` | İkiliden onluğa çevirme ağı ("3 ekle ve kaydır") |
| `havuz.ts` | Bir bloğun kapılarını kendi çiplerine paketleme |
| `model.ts` | Altın model: göstergelerde ne görünmeli |
| `sim.ts` | Kapı seviyesi simülasyon: anahtarları ayarla, göstergeleri oku |
| `arac.ts` | `npm run hesap8 -- ozet | hesapla | dogrula [--hepsi]` |
| `docs/tasarim.md` | Bloklar, hız, besleme, malzeme |
| `docs/kurulum-rehberi.md` | Fiziksel kurulum: aşamalar, testler, sorun giderme |
| `tests/` | 74HC4511, yapı, uç durumlar, lamba testi, KiCad netlist'i |

```
npm run hesap8 -- hesapla 255 x 7      # A [255]  B [  7]  sonuç [    36]  kalan [  3]
npm run hesap8 -- dogrula --hepsi      # 262 144 durumun hepsi altın modelle aynı
npm run cpu16 -- kurulum hesap -o out  # kurulum belgesi (HTML + PDF) ve şema PDF'i
```
