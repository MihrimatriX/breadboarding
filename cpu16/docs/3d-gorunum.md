# CPU16 kartı 3D (Faz 5)

Silikon3D'de üçüncü bölüm: **CPU16 kartı 3D** (`#kart`). Faz 4'teki kapı seviyesi bilgisayar
(153 entegre, ~1 800 kapı, ~22 000 transistöre karşılık gelir) bir Web Worker'da saat saat çalışır;
ekranda kart → çip → kapı → transistör diye inilir ve her seviyede sinyaller canlıdır.

## Ne görürsün

| Seviye | Nerede | Ne gösterir |
|---|---|---|
| Kart | 3D sahne | CPU kartı + test bellek kartı, arka panel. Entegreler işlev bloklarına göre (Kontrol, Register dosyası, ALU…) yerleşir. Her pinin ve pedin rengi o netin değeridir. Arka paneldeki bakır yollar adres/veri hatlarını canlı gösterir. HALTED ve FAULT LED'leri yanar. |
| Çip | Çipe tıkla | Kamera çipe uçar, üstünde çipin **kalıbı** (die) açılır: kapılar küçük karolar, teller çizgiler, kalıptan çip bacaklarına bağlantı telleri. Alt panelde aynı çipin kapı seviyesi şeması (AND/OR/NAND… sembolleriyle). Yan panelde pinler ve değerleri. |
| Kapı | Kalıpta ya da şemada bir kapıya tıkla | Alt panelde o kapının CMOS transistör şeması: PMOS ağı üstte, NMOS ağı altta. İletimdeki transistörler yeşil, kesimdekiler kesik çizgi. |
| Net | Bir pine ya da tele tıkla | 3D'de o nete bağlı bütün pinler çizgilerle birleşir; yan panelde bağlı pinlerin listesi. |

Renkler her yerde aynı: kırmızı = 1, koyu = 0, mor = Z (kimse sürmüyor), sarı = X (çakışma/tanımsız).

## Kontroller

- Program seçimi (hello, fib, add32, bubble, irq), **1 saat**, **1 komut**, **Çalıştır/Duraklat**,
  **Sıfırla**, **IRQ**. Saat hızı 1 Hz'den "en hızlı"ya (tarayıcıda birkaç bin Hz) kadar.
- Kısayollar: Boşluk çalıştır/duraklat, `.` bir saat döngüsü, `N` bir komut, Esc seçimi kaldırır.
- Konsoldan: `kart.secCip("U72")`, `kart.secKapi(112)`, `kart.secNet("BUS0")`, `kart.durum()`,
  `kart.uart()`, `kart.cipler()`, `kart.kapilar("U11")`.

## Transistör seviyesi nasıl canlı?

Kapı seviyesi simülasyon her saat döngüsünü hesaplar; seçilen kapı ise ayrıca Silikon3D'nin anahtar
seviyesi motorunda (6502'yi çalıştıran motor) transistör transistör çalıştırılır. Ekran kareleri
arasında yüzlerce saat kenarı geçebildiği için flip-flop ve mandallar her karede önce kapı
seviyesindeki değeri yakalatan bir kenarla "doldurulur", sonra gerçek girişler uygulanır; böylece iç
düğümler gerçek çipte olacakları duruma gelir. Testler (`cpu16/tests/view.test.ts`) her kapı türü için
transistör modelinin çıkışını kapı modeliyle rastgele giriş dizilerinde karşılaştırır.

## Dosyalar

- `cpu16/board/layout.ts`: kartların fiziksel yerleşimi (mm), DIP pin konumları.
- `cpu16/board/inside.ts`: çipin kapı şeması yerleşimi, kapının CMOS şeması, `GateProbe`.
- `src/board3d/`: worker (`board.worker.ts`), durum (`store.ts`), sahne (`BoardScene.tsx`),
  şemalar (`InsideDiagram.tsx`, `CmosDiagram.tsx`), bölüm (`BoardView.tsx`).

## Sınırlar

- Bellek çipleri (Flash, SRAM) davranışsal modeldir; içleri kapı olarak çizilmez.
- Transistör şeması mantıksal yerleşimdir (gerçek çip maskesi değil). Maske seviyesinde görünüm,
  kendi çipimizi OpenLane ile ürettiğimizde 6502 görünümüyle aynı şekilde gelecek.
