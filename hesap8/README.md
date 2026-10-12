# 8 bit hesap makinesi (hesap8)

DIP anahtarlarla girilen iki 8 bitlik sayıyı (0–255) toplayan, çıkaran, çarpan ve bölen; sonucu onluk
7 segment göstergelerde gösteren, programsız ve saatsiz bir devre. Yalnız yaygın 74HC çipleri: 216
entegre, 15 hane gösterge (A 3, B 3, sonuç işaret + 5, kalan 3).

CPU16 ile aynı altyapı (şema = kod, `cpu16/board/`): devre bir kez `kart.ts`'te tanımlanır; kapı
seviyesi simülasyon, Silikon3D'deki 3D görünüm, KiCad şeması (`cpu16/kicad/hesap/`), BOM ve kurulum
belgesi aynı tanımdan üretilir.

Fiziksel kurulum iki yoldan: **breadboard** (60 tam boy breadboard, 5 × 12; her tel delikten deliğe,
düz, dik açılı, renk kodlu ve kesim boyuyla; 2.784 atlama teli) ya da **PCB**. Breadboard yerleşimi ve
telleri `breadboard/`'dadır; bağlantısı yalnız fiziksel modelden (şeritler, raylar, teller)
birleşim-bul ile kurulup netlistle karşılaştırılır. Silikon3D → 8 bit hesap 3D varsayılan olarak
breadboard'u gösterir (PCB'ye geçilebilir); Kurulum modu teli 3D'de vurgulayıp delikten deliğe yazar.

| Dosya | İçerik |
|---|---|
| `kart.ts` | Devrenin tanımı (bloklar, çipler, netler), KiCad sayfaları |
| `bcd.ts` | İkiliden onluğa çevirme ağı ("3 ekle ve kaydır") |
| `havuz.ts` | Bir bloğun kapılarını kendi çiplerine paketleme |
| `model.ts` | Altın model: göstergelerde ne görünmeli |
| `sim.ts` | Kapı seviyesi simülasyon: anahtarları ayarla, göstergeleri oku |
| `arac.ts` | `npm run hesap8 -- ozet | hesapla | dogrula [--hepsi] | breadboard [--uret] | breadboard-belge` |
| `breadboard/geometri.ts`, `renk.ts` | BB830 geometrisi (delikler, şeritler, raylar, 2,54 mm ızgara); tel renk kodu |
| `breadboard/yerlesim.ts` | Breadboard yerleşimi: board ızgarası, çiplerin board ve sütunu (tavlama), pasifler, raylar |
| `breadboard/yonlendirme.ts` | Tel yönlendirme: dik açılı, düz, çip gövdesi ve tel ucu üstünden geçmeyen yollar (A*, sökme ve yeniden döşeme) |
| `breadboard/plan.ts`, `veri.ts` | Kurulum planı (aşamalar, tel sırası, renk, kesim boyu); üretilmiş yerleşim ve teller |
| `breadboard/dogrulama.ts` | Fiziksel modelden birleşim-bul: açık / kısa devre, delik çakışması, gövde üstünden tel |
| `breadboard/gorunum.ts` | Breadboard planından 3D yerleşim (Silikon3D, `src/board3d/Breadboard3D.tsx`) |
| `breadboard/belge.ts` | Yazdırılabilir breadboard kurulum belgesi (board haritası, çizimler, tel ve kesim listesi, malzeme) |
| `docs/tasarim.md` | Bloklar, hız, besleme, malzeme |
| `docs/kurulum-rehberi.md` | Fiziksel kurulum: aşamalar, testler, sorun giderme |
| `tests/` | 74HC4511, yapı, uç durumlar, lamba testi, KiCad netlist'i, breadboard bağlantısı ve 3D görünümü |

```
npm run hesap8 -- hesapla 255 x 7      # A [255]  B [  7]  sonuç [    36]  kalan [  3]
npm run hesap8 -- dogrula --hepsi      # 262 144 durumun hepsi altın modelle aynı
npm run hesap8 -- breadboard           # 60 board, 2784 tel; bağlantı netlistle birebir aynı
npm run hesap8 -- breadboard-belge -o out  # breadboard kurulum belgesi (HTML + PDF)
npm run hesap8 -- breadboard --uret    # yerleşimi ve telleri yeniden üret (breadboard/veri.ts)
npm run cpu16 -- kurulum hesap -o out  # PCB kurulum belgesi (HTML + PDF) ve şema PDF'i
```
