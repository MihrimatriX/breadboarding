# CLAUDE.md: hesap8/

8 bit dört işlem hesap makinesi: saat yok, program yok, tamamen birleşimsel 74HC devresi. Kök
[CLAUDE.md](../CLAUDE.md)'deki kurallar burada da geçerli. Dosya dosya içerik: [README.md](README.md#dosyalar);
tasarım: [docs/tasarim.md](docs/tasarim.md).

## Dosyalar

| Dosya | Görevi |
|---|---|
| `kart.ts` | devrenin tanımı (şema = kod): bloklar, çipler, netler, KiCad sayfaları |
| `model.ts` | **altın model**: anahtarlardan göstergelerde ne görünmeli |
| `sim.ts` | kapı seviyesi simülasyon (`cpu16/chips/logic.ts` üstünde) |
| `bcd.ts`, `havuz.ts` | ikiliden onluğa ağ; bir bloğun kapılarını çiplere paketleme |
| `bolum-metin.ts` | bölge ve çip grubu metinleri (3D etiketler, yan panel, kurulum belgesi) |
| `mimari.ts` | blok diyagramının yerleşimi (çizimi `cpu16/mimari/`) |
| `breadboard/yerlesim.ts`, `renk.ts`, `plan.ts`, `belge.ts` | projeye özgü breadboard yerleşimi, renk kodu, plan, belge |
| `breadboard/veri.ts` | **üretilir**: `npm run hesap8 -- breadboard --uret` |
| `arac.ts` | komut satırı (`npm run hesap8 -- <komut>`): `ozet`, `hesapla`, `dogrula [--hepsi]`, `breadboard [--uret]`, `breadboard-belge` |

`breadboard/geometri.ts`, `yonlendirme.ts`, `dogrulama.ts` yalnız yeniden dışa aktarır; asıl motor
`cpu16/board/breadboard/`'da, CPU16 panolarıyla ortak.

## Devre değişince

1. `npm run hesap8 -- dogrula` (örnekler + uç durumlar), büyük değişiklikte `dogrula --hepsi`
   (4 × 256 × 256 = 262 144 durum).
2. `npm run hesap8 -- ozet`: çip sayıları, en uzun yol, ERC.
3. `npm run cpu16 -- board kicad` (KiCad `cpu16/kicad/hesap/`), `npm run cpu16 -- mimari`.
4. `npm run hesap8 -- breadboard --uret`, sonra `npm run hesap8 -- breadboard` (netlistle birebir).
5. `npx vitest run hesap8/tests`; sayılar değiştiyse README, `docs/tasarim.md`,
   `docs/kurulum-rehberi.md`.

Kullanılan çipler CPU16'nın kütüphanesinden (`cpu16/chips/`; 74HC4511 bu proje için eklendi); 7 segment
gösterge ve pasifler `cpu16/board/passives.ts`'te. Ortak motorda (`cpu16/board/breadboard/`) yapılan
bir değişiklikten sonra hem `hesap8/tests` hem `cpu16/tests/breadboard*.test.ts` koşmalı.
