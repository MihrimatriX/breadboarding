# CPU16

Tamamen 74HC entegrelerinden kurulan, kendi komut seti, kendi C derleyicisi ve 3D'de transistörüne kadar incelenebilen bir 16 bit bilgisayar. Aynı zamanda bir eğitim ve deney seti.

- Yol haritası ve şu anki aşama: [docs/roadmap.md](docs/roadmap.md)
- Deney seti (13 deney, saat kartından yılan oyununa): [kit/README.md](kit/README.md)

## Belgeler

| Konu | Belge |
|---|---|
| Tasarım, komut seti, bellek haritası | [spec.md](docs/spec.md), [isa-ayrintilari.md](docs/isa-ayrintilari.md) |
| Assembler | [as16.md](docs/as16.md) |
| Mikromimari ve mikrokod | [mikromimari.md](docs/mikromimari.md) |
| 74HC parça kütüphanesi | [parcalar.md](docs/parcalar.md) |
| Kartlar (şema = kod, KiCad, ERC) | [kartlar.md](docs/kartlar.md) |
| 3D kart görünümü | [3d-gorunum.md](docs/3d-gorunum.md) |
| Anakart: bellek, önbellek, G/Ç, video (model ve register haritası) | [anakart.md](docs/anakart.md) |
| Anakart kartları kapı seviyesinde | [anakart-kartlari.md](docs/anakart-kartlari.md) (saat, bellek, önbellek), [anakart-gc-video.md](docs/anakart-gc-video.md) (G/Ç, video) |
| BIOS, monitör, önyükleyici | [bios.md](docs/bios.md) |
| C derleyicisi | [cc16.md](docs/cc16.md) |
| Üretim, zamanlama, kart testi | [uretim.md](docs/uretim.md) |

## Komutlar

```sh
npm run cpu16 -- run cpu16/programs/hello.s          # Merhaba, CPU16! (referans emülatör)
npm run cpu16 -- machine                             # anakart + BIOS, UART terminale bağlı (çıkış: Ctrl-])
npm run cpu16 -- cc --hedef bios cpu16/bios/ornekler/yilan.c -o yilan.s   # C → assembly
npm run cpu16 -- machine cpu16/kit/programlar/bellek-deneme.s --rom --led # BIOS'suz deneme programı, FF00 LED'leri
npm run cpu16 -- kontrol                             # mikrokod değişince: kontrol birimini (74HC kapıları) yeniden üret ve denetle
npm run cpu16 -- zamanlama --anakart                 # şemadan statik zamanlama analizi
npm run cpu16 -- board kicad                         # KiCad şemalarını ve BOM'ları yeniden üret
npm run cpu16 -- kit                                 # deney rehberlerinin otomatik bölümlerini üret
npx vitest run cpu16                                 # testler
```
