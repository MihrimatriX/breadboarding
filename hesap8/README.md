# 8 bit hesap makinesi (hesap8)

DIP anahtarlarla girilen iki 8 bitlik sayıyı (0–255) toplayan, çıkaran, çarpan ve bölen; sonucu onluk
7 segment göstergelerde gösteren, programsız ve saatsiz bir devre. Yalnız yaygın 74HC çipleri: 216
entegre, 15 hane gösterge (A 3, B 3, sonuç işaret + 5, kalan 3). Anahtar çevrilince sonuç yalnızca
kapı gecikmeleri kadar sonra (en kötü ≈ 2 µs) göstergeye gelir.

CPU16 ile aynı altyapı (şema = kod, `cpu16/board/`): devre bir kez `kart.ts`'te tanımlanır; kapı
seviyesi simülasyon, Silikon3D'deki 3D görünüm (**8 bit hesap 3D** bölümü, `#hesap`), KiCad şeması
(`cpu16/kicad/hesap/`, 11 sayfa), BOM ve kurulum belgesi aynı tanımdan üretilir. Bütün
4 × 256 × 256 = 262 144 durum kapı seviyesinde denenmiş ve altın modelle (`model.ts`) aynı çıkmıştır.

## Kullanım

| Anahtar | Görev |
|---|---|
| SW1, SW2 (8'li) | A ve B sayıları; soldan sağa bit 7 … bit 0, açık (ON) = 1 |
| SW3 (2'li) | işlem (OP1 OP0): 00 toplama, 01 çıkarma, 10 çarpma, 11 bölme |
| SW4 (buton) | lamba testi: bütün segmentler yanar |

Sonuç: toplama 0 … 510, çıkarma −255 … 255, çarpma 0 … 65 025, bölmede bölüm ve kalan; B = 0 iken
HATA LED'i yanar. Ayrıntı: [docs/tasarim.md](docs/tasarim.md#kullanım).

## Komutlar

```sh
npm run hesap8 -- ozet [--yol]          # blok blok çipler, pasifler, en uzun yol (--yol: çip çip), ERC
npm run hesap8 -- hesapla 255 x 7       # A [255]  B [  7]  sonuç [  1785]  kalan [   ]
npm run hesap8 -- hesapla 255 / 7       # A [255]  B [  7]  sonuç [    36]  kalan [  3]
npm run hesap8 -- hesapla 12 - 200      # A [ 12]  B [200]  sonuç [-  188]  kalan [   ]
npm run hesap8 -- dogrula               # 3 024 durum (uç değerler + 2 000 örnek), birkaç saniye
npm run hesap8 -- dogrula --hepsi       # 262 144 durumun hepsi (iş parçacıklarına bölünür, 4 çekirdekte ≈ 75 s)
npm run cpu16 -- board kicad            # KiCad dosyalarını yeniden üret (cpu16/kicad/hesap/)
npm run cpu16 -- kurulum hesap -o out   # PCB kurulum belgesi (HTML + PDF) ve şema PDF'i
npm run hesap8 -- breadboard            # 60 board, 2 784 tel; bağlantı netlistle birebir aynı mı
npm run hesap8 -- breadboard --uret     # yerleşimi ve telleri yeniden üret (breadboard/veri.ts)
npm run hesap8 -- breadboard-belge -o out   # breadboard kurulum belgesi (HTML + PDF)
npm run cpu16 -- mimari hesap           # blok diyagramı SVG (docs/img/mimari-hesap.svg)
npx vitest run hesap8                   # testler
```

`hesapla` işlemleri: `+ - x /` (çarpma için `x`; kabuk `*`'ı dosya adlarına açar). Her sonuç ayrıca
altın modelle karşılaştırılır ("altın modelle aynı"). Docker'da: `docker compose run --rm cli hesap8 -- …`.

## Dosyalar

Fiziksel kurulum iki yoldan: **breadboard** (60 tam boy breadboard, 5 × 12; her tel delikten deliğe,
düz, dik açılı, renk kodlu ve kesim boyuyla; 2.784 atlama teli) ya da **PCB**. Breadboard yerleşimi ve
telleri `breadboard/`'dadır; bağlantısı yalnız fiziksel modelden (şeritler, raylar, teller)
birleşim-bul ile kurulup netlistle karşılaştırılır. Silikon3D → 8 bit hesap 3D varsayılan olarak
breadboard'u gösterir (PCB'ye geçilebilir); Kurulum modu teli 3D'de vurgulayıp delikten deliğe yazar.
Bölgeler ve çip grupları 3D'de etiketlidir (**Etiketler**, kısayol `E`; bir etikete tıklayınca görevi
ve nasıl çalıştığı yan panelde); metinleri `bolum-metin.ts`'te, kurulum belgesinin "Bölümler"
kısmı da onlardan.

| Dosya | İçerik |
|---|---|
| `kart.ts` | Devrenin tanımı (bloklar, çipler, netler), KiCad sayfaları |
| `bcd.ts` | İkiliden onluğa çevirme ağı ("3 ekle ve kaydır") |
| `havuz.ts` | Bir bloğun kapılarını kendi çiplerine paketleme |
| `model.ts` | Altın model: göstergelerde ne görünmeli |
| `sim.ts` | Kapı seviyesi simülasyon: anahtarları ayarla, göstergeleri oku |
| `arac.ts` | komut satırı: `ozet`, `hesapla`, `dogrula [--hepsi]`, `breadboard [--uret]`, `breadboard-belge` |
| `breadboard/renk.ts` | Tel renk kodu: her rengin hesap makinesindeki sinyal grubu |
| `breadboard/yerlesim.ts` | Breadboard yerleşimi: board ızgarası, hangi blok hangi board'da, pasifler, raylar |
| `breadboard/plan.ts`, `veri.ts` | Kurulum planı (aşamalar, tel sırası, renk, kesim boyu); üretilmiş yerleşim ve teller |
| `breadboard/gorunum.ts` | Breadboard planından 3D yerleşim (Silikon3D, `src/board3d/Breadboard3D.tsx`) |
| `breadboard/belge.ts` | Yazdırılabilir breadboard kurulum belgesi (board haritası ve bölümler, çizimler, tel ve kesim listesi, malzeme) |
| `bolum-metin.ts` | Bölgelerin ve çip gruplarının etiketi, görevi ve "nasıl çalışır" metni (3D etiketler, yan panel, kurulum belgesi; `cpu16/board/bolum-bilgi.ts`) |
| `cpu16/board/breadboard/` | Ortak breadboard motoru (CPU16'nın breadboard panolarıyla ortak): BB830 geometrisi, çipleri board'lara dağıtan tavlama, tel yönlendirme (dik açılı, düz, çip gövdesinin üstünden geçmeyen yollar; A*, sökme ve yeniden döşeme), fiziksel modelden birleşim-bul doğrulaması, board çizimleri. `breadboard/geometri.ts`, `yonlendirme.ts`, `dogrulama.ts` eski içe aktarmalar için yeniden dışa aktarır |
| `mimari.ts` | Mimari (blok) diyagramının yerleşimi: kutular, yollar (içerik devreden; `cpu16/mimari/`). Silikon3D → Mimari |
| `docs/tasarim.md` | Bloklar (blok diyagramı `docs/img/mimari-hesap.svg`), hız, besleme, malzeme |
| `docs/kurulum-rehberi.md` | Fiziksel kurulum: aşamalar, testler, sorun giderme |
| `tests/` | 74HC4511, yapı, uç durumlar, lamba testi, KiCad netlist'i, breadboard bağlantısı ve 3D görünümü |

Kullanılan çipler CPU16'nın parça kütüphanesinden gelir (`cpu16/chips/`; 74HC4511 bu proje için
eklendi), 7 segment gösterge ve öteki pasifler `cpu16/board/passives.ts`'te. Devre değişince `npm run cpu16 -- board kicad` ile KiCad dosyalarını
yenile; testler depodaki dosyaların güncel olduğunu denetler.
