# CLAUDE.md: src/ (Silikon3D)

Vite + React 18 + react-three-fiber + drei + zustand. Kök [CLAUDE.md](../CLAUDE.md)'deki kurallar burada
da geçerli. Mimari ayrıntısı: [README, Silikon3D mimarisi](../README.md#silikon3d-mimarisi); 3D görünüm ve
konsol API'si: [cpu16/docs/3d-gorunum.md](../cpu16/docs/3d-gorunum.md).

## Bölümler

| Bölüm | Adres | Giriş bileşeni | Klasör |
|---|---|---|---|
| Açılış sayfası | kök, `#giris` | `giris/Giris.tsx` | `giris/`: `icerik.ts` (adres kararı `girisMi`, iki dilli metinler); bölüm kodu inmez |
| 6502 die | `#6502` | `App.tsx` | `chip/`, `sim/` (anahtar seviyesi motor, worker), `render/` |
| CPU16 tezgâhı | `#cpu16` | `cpu16/Cpu16Bench.tsx` | `cpu16/`: `MachineBench.tsx` (IDE + BIOS + VGA), `FlatBench.tsx` (düz bellek); editör `KodAlani.tsx` (saydam textarea + renkli `<pre>`, parçalar `renklendir.ts`, testi `arayuz.test.ts`) |
| CPU16 kartı 3D | `#kart` | `board3d/BoardView.tsx` | `board3d/` |
| 8 bit hesap 3D | `#hesap` | `board3d/BoardView.tsx` (hesap modu) | `board3d/hesap.ts`, `HesapPanel.tsx` |
| Mimari | `#mimari` | `mimari/MimariView.tsx` | `mimari/` |
| Belgeler | `#belgeler/<yol>#<çapa>` | `belgeler/BelgelerView.tsx` | `belgeler/`: `md.ts` (GFM alt kümesi ayrıştırıcı), `katalog.ts` (gruplar, adresler, arama); testi `tests/belgeler.test.ts` |

Her bölüm kendi kod parçasında, ilk açılınca yüklenir (`bolumler.ts`, `Root.tsx`'te `React.lazy`).
Bölüm geçişi `ui/ModeSwitch.tsx`; ortak iskelet `ui/Shell.tsx`; renk ve boyut belirteçleri
`styles.css`; tema, yazı boyutu, odak modu (paneller ve durum çubuğu gizli) ve dil `ui/ayarlar.ts`
(kısayollar T, Y, F, L). Üst çubuk yalnız sol üstteki başlatıcı düğmesi (`AppHeader`): bölümler
(`BolumListesi`), görünüm ayarları, kısayollar, Başlangıç ve ana sayfa onun kutusunda. Araç çubuğu olan
bölümlerde düğme araç çubuğunun satırının solunda durur (`--baslatici-w` kadar yer açılır; 1680 px'in
altında yalnız logo), ekranın kalanı bölümün işine kalır; araç çubuğuna öğe eklersen 1100–1680 px'te
iki dilde ve iki yazı boyutunda tek satır kaldığına bak. Canlı ölçümler ve bölümün kısa açıklaması en
alttaki durum çubuğunda (`.statusbar` `order` ile sütunun sonuna iner). 900 px'in altında (telefon)
başlatıcı kendi satırında, bölüm geçişi ayrıca ekranın altında sabit sekme çubuğu (`ModeSwitch`: simge + `kisa` ad, testi `cpu16/tests/arayuz.test.ts`),
araç çubuğu yana kayar ve açılır menüler alttan açılan sayfa olur; 1240 px'in altında araç çubuğundaki
sınıfsız (sakin) düğmeler yalnız simge. Başlangıç paneli uygulamanın kılavuzu: bölüm başına
tanıtım ve "İlk adımlar" `ui/kilavuz.ts`'te (testi `tests/ceviri-kabuk.test.ts`); bir bölümün düğmesi
ya da kısayolu değişince oradaki adımı da güncelle.

## board3d/ (kartların 3D'si)

- `BoardView.tsx`: arayüz ve konsol API'si (`window.kart`, hesap modunda `window.hesap`).
- `board.worker.ts`: bütün bilgisayar kapı seviyesinde bir Web Worker'da (`cpu16/board/machine-board.ts`);
  `store.ts` worker istemcisi, seçimler ve canlı değerler. Hesap makinesi ana iş parçacığında (`hesap.ts`).
- `BoardScene.tsx` (PCB görünümü), `Breadboard3D.tsx` (breadboard panoları, teller), `Passives3D.tsx`.
- Bölge çerçeveleri ve etiketleri: `bolumSahne.ts` (saf geometri, testli), `Bolumler3D.tsx`,
  `BolumPanel.tsx`; metinler `cpu16/board/bolum-bilgi.ts`'ten. Etiketler `E` ile açılıp kapanır.
- Kurulum modu: `kurulum.ts` + `KurulumPanel.tsx` (PCB), `bbKurulum.ts` + `BbKurulumPanel.tsx` (breadboard).
  Aşama haritası (`asamaDilimleri`) ve breadboard delik haritası (`bbPencere`) saf, testi `arayuz.test.ts`.
- Düzen VS Code gibi (`Iskelet`): en solda aktivite çubuğu (`EtkinlikCubugu`; tepesinde başlatıcı, dipte
  alt panel ve odak düğmeleri), yanında sol panel, sağda tam yükseklik sahne; araç çubuğu sahnenin üstünde
  yüzen kapsüller, VGA paneli sağ altta, çipin içi sahnenin altında. Sol paneller `SIDE_TABS` ve
  `panelBilgisi`'nde (yeni panel: iki yere birer satır): Program (varsayılan; düzenleyici `KodAlani`,
  çip seçmek paneli değiştirmez), İnceleme (seçili çipte grubunun anlatımı ve `PinDiyagrami.tsx`),
  Anlatım (`AnlatimPanel.tsx`, adımlar `anlatim.ts`'te; bölüm seçmek turun adımıdır), CPU ve UART,
  Kurulum. Açık panelin simgesine yeniden basmak paneli kapatır (sahne tam).

## Dil (Türkçe + İngilizce)

- Kullanıcıya görünen her metin iki dilli ve kullanıldığı yerde çift: bileşende `const t = useT();`
  sonra `t("Durdur", "Stop")`; bileşen dışında `ceviri(tr, en)` (`ui/ceviri.ts`). Seçim `ui/ayarlar.ts`
  deposunda (`dil`, `L` kısayolu, `<html lang>`).
- Modül düzeyindeki tablolarda `ceviri()` çağırma (dil değişince güncellenmez): `{ tr, en }` (`IkiDil`)
  tut, çizerken `sec(m, dil)`. Saf fonksiyonlar `dil: Dil = "tr"` alır; varsayılan Türkçe testleri korur.
- `cpu16/` ve `hesap8/` veri tablolarında Türkçe alanlar belge üreteçlerine gider, değişmez; İngilizce
  yanlarına eklenir. Kart, blok, çip ve pasif adlarının İngilizcesi `board3d/adlar.ts`'te (eksik ad testte yakalanır).
- Terimler: kart → board, pano → panel, tek BB830 → breadboard, kurulum → build, tezgâh → workbench.
- Derleyici ve assembler hata iletileri ile örnek programların çıktıları Türkçe kalır.

## Kurallar ve tuzaklar

- Hesap ve geometri bileşenin dışında, saf ve testli fonksiyonlarda (`wires.ts`, `screen.ts`,
  `bolumSahne.ts`); testleri `cpu16/tests/` altında (`view`, `bolum-3d`, `breadboard-3d`, `hesap-3d`).
- Ağır simülasyon worker'da; ana iş parçacığı yalnız kopyaları alır.
- 3D tuvaller isteğe bağlı çizilir (`frameloop="demand"`, kurallar `render/cizimDongusu.ts`, bağlantı
  `render/TuvalCizimi.tsx`): kendiliğinden kare gelmez. Canlı değeri (`live`, `liveNets`, `liveScreen`)
  yazan yer `cizimIste()` der; `useFrame`'deki süren animasyon bitene dek `state.invalidate()` ister (ilk
  karenin dt'si boşluğun süresidir: `kareSuresi`); sahne kartın deposundan yeni bir alan okursa onu
  `KART_SAHNE_DISI`'ndan (`store.ts`) çıkar, `cizim-dongusu.test.ts` denetler. Ölçmek: `kart.cizim()`.
- Arayüz: AFU "ferah, okunaklı, konforlu" ister: 15 px gövde yazısı, geniş aralıklar, sakin mavi vurgu;
  kırmızı yalnız hata ve lojik 1 için. Yazı ölçeği, aralıklar ve renk kuralları `styles.css`'in başındaki
  yorumda; yeni bileşen bu belirteçleri kullanır. Renk değişince `npm run kontrast`; mimari
  diyagramlarının rengi değişince `npm run cpu16 -- mimari`.
- Bütün bölümler hep bağlı kalır (gizlenenler de): Playwright'ta `:visible` seçici kullan.
- Tarayıcıda deneme: `npm run build && npx vite preview --port <port> --strictPort`; başsız Chromium'da
  WebGL yavaş (swiftshader), ekran görüntüsü için uzun bekle; sunucuyu PID'iyle durdur.
- Konsolda "R3F: Hooks can only be used within the Canvas" görürsen react-three-fiber iki kez
  paketlenmiştir: `node_modules` içinde bir bağlantı ya da kopya ara.
