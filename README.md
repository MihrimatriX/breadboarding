# Silikon3D

Tarayıcıda çalışan, **transistör seviyesinde** ve **3D** bir CPU die simülatörü.
[visual6502.org](http://www.visual6502.org/JSSim/expert.html)'un yaptığını yapar
(gerçek çip yerleşimi, canlı akan sinyaller, tıklayıp ölçme), ama katmanları
üç boyutta, ayrılabilir ve gezilebilir şekilde gösterir.

İlk çip MOS 6502 (gerçek die verisi). Hedef, aynı altyapıya kendi 16-bit
işlemcimizi koymak (bkz. [Yol haritası](#yol-haritası)).

## Çalıştırma

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # simülasyon + assembler testleri
npm run build      # dist/ altına statik site
```

Node 20+ gerekir. `public/chips/mos6502/chip.json` depoda hazır gelir;
yeniden üretmek için `npm run import:6502`.

## Neler var

| Özellik | Açıklama |
| --- | --- |
| 3D die | Metal, polisilikon ve 4 difüzyon türü ayrı katmanlar. 8.233 poligon tek tek üçgenlenip kalınlık verilir. |
| Canlı sinyaller | 1.725 düğümün durumu her karede GPU'ya tek doku olarak yüklenir; yüksek (1) olan teller kırmızı yanar. |
| Ölçüm | Herhangi bir tele tıkla: adı, 0/1 durumu, sürdüğü ve bağlı olduğu transistörler. Bağlantılara tıklayarak devrede gezin. |
| Sinyal bul | `clk0`, `ab5`, `alucin`, `#1234` gibi isim ya da numara yaz, kamera oraya uçar. |
| Katmanları ayır | Kaydırıcıyla katmanları dikeyde aç, altındaki difüzyonu gör. |
| Transistörler | 3.510 transistör kapı bölgesinde blok olarak; iletimdekiler yeşil. |
| Mantık analizörü | Seçtiğin sinyallerin dalga formu + visual6502 tarzı iz tablosu (ab, db, rw, sync, pc, a, x, y, s, p, komut). |
| Saat kontrolü | Yarım çevrim, tam çevrim, sonraki komut, 1 Hz – 4 kHz arası sürekli çalışma. |
| Pinler | RDY, RES, IRQ, NMI pinlerini elle sür. |
| Bellek ve program | Sayfa 0 ve yığın sayfası canlı; hücreye tıklayıp değer yaz. Dahili 6502 assembler ile kendi programını derle. |

Kısayollar: `Boşluk` çalıştır/duraklat, `.` yarım çevrim, `N` sonraki komut, `R` sıfırla, `Esc` seçimi kaldır.

## Mimari

```
src/
  chip/            Ortak çip veri biçimi (ChipData) ve türetilmiş indeksler
  sim/
    SwitchLevelEngine.ts   Anahtar seviyesi netlist simülatörü (NMOS + PMOS)
    machines/mos6502.ts    Die'ı bellek, saat ve yollara bağlayan makine
    sim.worker.ts          Simülasyon ayrı iş parçacığında koşar
    SimClient.ts           Worker <-> React köprüsü
    asm6502.ts             Assembler / disassembler
  render/
    dieGeometry.ts         Poligon -> 3D katman geometrisi (earcut)
    geometry.worker.ts     Üçgenleme ayrı iş parçacığında
    DieModel.tsx           Katman mesh'leri, shader, BVH ile fare altı seçim
    shaders.ts             Düğüm durumunu veri dokusundan okuyan shader
    Transistors.tsx        InstancedMesh ile 3.510 transistör
    CameraRig.tsx          Seçilen sinyale kamera uçuşu
  state/           zustand deposu + her kare değişen büyük diziler (live.ts)
  ui/              Paneller
scripts/import-visual6502.mjs   visual6502 verisini ChipData'ya çevirir
tests/                          Vitest testleri
```

**Veri akışı:** Worker her ~16 ms'de bütçesi kadar yarım çevrim koşar, düğüm ve
transistör durumlarını `Uint8Array` olarak (kopyasız transfer) gönderir.
`SimClient` bunları `live` nesnesine koyar; React'e yalnızca yazmaçlar, pinler ve
iz satırları gider. 3D tarafı `useFrame` içinde `live.version` değiştiyse dokuyu
günceller. Böylece React her düğüm değişiminde yeniden çizim yapmaz.

**Neden bu yığın:**

| Seçim | Neden | Alternatif |
| --- | --- | --- |
| React + react-three-fiber | Panel UI ile 3D sahne aynı bileşen modelinde | Saf Three.js (daha az soyutlama, ama UI elle) |
| Web Worker | 4 kHz'de simülasyon 3D'yi takılmadan çalışır | WASM (Rust) motor: 5-10 kat hız, 16-bit çipte gerekebilir |
| Veri dokusu + shader | 1.700 düğüm tek doku güncellemesi | Düğüm başına materyal (binlerce draw call) |
| three-mesh-bvh | Milyon üçgende anlık fare altı seçim | GPU picking (renk kodlu ikinci render) |
| zustand | Seçici bazlı abonelik, gereksiz render yok | Redux Toolkit (bu ölçekte fazla) |

## Doğrulama

`tests/mos6502.test.ts`, motorumuzu visual6502'nin orijinal `chipsim.js`'inden
kaydedilmiş 600 yarım çevrimlik iz ile karşılaştırır (adres yolu, veri yolu,
R/W, SYNC). Ayrıca 1..10 toplamının 55 çıktığını ve reset sonrası SP=$FD
olduğunu kontrol eder. Motor Node'da saniyede yaklaşık 12.000 yarım çevrim koşar.

## Yol haritası

1. **Kendi 16-bit çipimiz.** CPU Verilog ile yazılır (Hack/Nand2Tetris ISA ya da
   kendi ISA'mız). Yosys ile sentez, OpenLane/OpenROAD ile Sky130 açık PDK
   üzerinde yerleşim yapılır.
2. **GDS içe aktarıcı.** KLayout Python API ile GDS katmanları (diff, poly,
   li1, met1..met5) ve SPICE netlist'ten çıkarılan transistörler `ChipData`
   biçimine dönüştürülür. Motor PMOS'u zaten destekliyor (CMOS için gerekli).
3. **Çok katmanlı metal.** Sky130'da 5 metal katmanı var; `level` alanı buna
   hazır. Via'lar ayrı küçük silindirler olarak çizilir.
4. **Kapı seviyesine yakınlaşma.** Seçilen bölgedeki transistörleri NAND/NOR
   kapılarına gruplayıp şematik görünüm.
5. **Performans.** Büyük çiplerde motoru Rust + WASM'a taşı, geometriyi LOD ile böl.
6. **Video modu.** Kamera yolu kaydı ve sabit FPS ile kare kare dışa aktarma
   (kanal için 21:9 çekimler).

## Lisans notu

Kod MIT. `public/chips/mos6502/` altındaki die verisi visual6502 projesine aittir
ve **CC BY-NC-SA 3.0** ile dağıtılır (ticari kullanım yok, atıf zorunlu). Para
kazanan videolarda 6502 görüntüleri kullanılacaksa bu lisans dikkate alınmalı.
Kendi çipimizin verisi bu kısıtlamaya tabi olmayacak.
