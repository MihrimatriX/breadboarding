# CLAUDE.md: src/ (Silikon3D)

Vite + React 18 + react-three-fiber + drei + zustand. Kök [CLAUDE.md](../CLAUDE.md)'deki kurallar burada
da geçerli. Mimari ayrıntısı: [README, Silikon3D mimarisi](../README.md#silikon3d-mimarisi); 3D görünüm ve
konsol API'si: [cpu16/docs/3d-gorunum.md](../cpu16/docs/3d-gorunum.md).

## Bölümler

| Bölüm | Adres | Giriş bileşeni | Klasör |
|---|---|---|---|
| 6502 die | `#6502` | `App.tsx` | `chip/`, `sim/` (anahtar seviyesi motor, worker), `render/` |
| CPU16 tezgâhı | `#cpu16` | `cpu16/Cpu16Bench.tsx` | `cpu16/`: `MachineBench.tsx` (IDE + BIOS + VGA), `FlatBench.tsx` (düz bellek) |
| CPU16 kartı 3D | `#kart` | `board3d/BoardView.tsx` | `board3d/` |
| 8 bit hesap 3D | `#hesap` | `board3d/BoardView.tsx` (hesap modu) | `board3d/hesap.ts`, `HesapPanel.tsx` |
| Mimari | `#mimari` | `mimari/MimariView.tsx` | `mimari/` |
| Belgeler | `#belgeler/<yol>#<çapa>` | `belgeler/BelgelerView.tsx` | `belgeler/`: `md.ts` (GFM alt kümesi ayrıştırıcı), `katalog.ts` (gruplar, adresler, arama); testi `tests/belgeler.test.ts` |

Her bölüm kendi kod parçasında, ilk açılınca yüklenir (`bolumler.ts`, `Root.tsx`'te `React.lazy`).
Bölüm geçişi `ui/ModeSwitch.tsx`; ortak iskelet `ui/Shell.tsx`; renk ve boyut belirteçleri
`styles.css`; tema, yazı boyutu ve odak modu `ui/ayarlar.ts` (kısayollar T, Y, F).

## board3d/ (kartların 3D'si)

- `BoardView.tsx`: arayüz ve konsol API'si (`window.kart`, hesap modunda `window.hesap`).
- `board.worker.ts`: bütün bilgisayar kapı seviyesinde bir Web Worker'da (`cpu16/board/machine-board.ts`);
  `store.ts` worker istemcisi, seçimler ve canlı değerler. Hesap makinesi ana iş parçacığında (`hesap.ts`).
- `BoardScene.tsx` (PCB görünümü), `Breadboard3D.tsx` (breadboard panoları, teller), `Passives3D.tsx`.
- Bölge çerçeveleri ve etiketleri: `bolumSahne.ts` (saf geometri, testli), `Bolumler3D.tsx`,
  `BolumPanel.tsx`; metinler `cpu16/board/bolum-bilgi.ts`'ten. Etiketler `E` ile açılıp kapanır.
- Kurulum modu: `kurulum.ts` + `KurulumPanel.tsx` (PCB), `bbKurulum.ts` + `BbKurulumPanel.tsx` (breadboard).

## Kurallar ve tuzaklar

- Hesap ve geometri bileşenin dışında, saf ve testli fonksiyonlarda (`wires.ts`, `screen.ts`,
  `bolumSahne.ts`); testleri `cpu16/tests/` altında (`view`, `bolum-3d`, `breadboard-3d`, `hesap-3d`).
- Ağır simülasyon worker'da; ana iş parçacığı yalnız kopyaları alır.
- Arayüz: AFU "ferah, okunaklı, konforlu" ister: 15 px gövde yazısı, geniş aralıklar, sakin mavi vurgu;
  kırmızı yalnız hata ve lojik 1 için. Yazı ölçeği, aralıklar ve renk kuralları `styles.css`'in başındaki
  yorumda; yeni bileşen bu belirteçleri kullanır. Renk değişince `npm run kontrast`; mimari
  diyagramlarının rengi değişince `npm run cpu16 -- mimari`.
- Bütün bölümler hep bağlı kalır (gizlenenler de): Playwright'ta `:visible` seçici kullan.
- Tarayıcıda deneme: `npm run build && npx vite preview --port <port> --strictPort`; başsız Chromium'da
  WebGL yavaş (swiftshader), ekran görüntüsü için uzun bekle; sunucuyu PID'iyle durdur.
- Konsolda "R3F: Hooks can only be used within the Canvas" görürsen react-three-fiber iki kez
  paketlenmiştir: `node_modules` içinde bir bağlantı ya da kopya ara.
