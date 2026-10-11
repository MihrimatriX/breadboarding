// Kurulum el kitabı: kart belgelerinin nasıl kullanılacağı ve fiziksel kurulumun genel kuralları.
// İki ana yol: deneyler (1–8) breadboard'da, tam bilgisayar PCB'de (çipler soketlerde); wire-wrap ekte.
// Sayılar (çip, tel, besleme) kart tanımlarından gelir; metin elle yazılmıştır.

import { DENEYLER, dosyaAdi } from "../kit/deneyler.ts";
import { cipKarti } from "./belge.ts";
import type { KurulumKarti } from "./kartlar.ts";
import type { KurulumPlani } from "./plan.ts";
import { DEPO_URL, esc, htmlBelge, kutu, renkEtiketi, renkTablosu } from "./stil.ts";

const sayi = (n: number) => n.toLocaleString("tr-TR");

export function elKitabi(planlar: { kk: KurulumKarti; plan: KurulumPlani }[], o: { tarih: string }): string {
  const top = (f: (p: KurulumPlani) => number) => planlar.reduce((s, x) => s + f(x.plan), 0);
  const kartSatir = planlar.map(({ kk, plan }) =>
    `<tr><td><b>${esc(plan.baslik)}</b> <span class="mono muted">${esc(kk.kart)}</span></td><td>${plan.deneyler.map((d) => `<a href="${DEPO_URL}/cpu16/kit/${dosyaAdi(DENEYLER.find((x) => x.no === d)!)}">${d}</a>`).join(", ")}</td><td class="sag">${plan.cipler.length}</td><td class="sag">${plan.pasifler.length}</td><td class="sag">${sayi(plan.teller.length)}</td><td class="sag">≈ ${sayi(plan.gucButcesi.toplam)}</td><td>${esc(kk.yol)}</td><td class="mono kucuk">${esc(kk.kart)}/${esc(kk.kart)}-kurulum.pdf<br>${esc(kk.kart)}/${esc(kk.kart)}-sema.pdf</td></tr>`).join("");

  // örnek: saat kartının Johnson sayacı (Deney 1)
  const clk = planlar.find((x) => x.kk.kart === "clk")?.plan;
  const ornekCip = clk?.cipKartlari.find((c) => c.deger === "74HC175") ?? clk?.cipKartlari[0];
  const ornekTeller = clk ? clk.teller.slice(12, 16) : [];
  const ornekSatir = ornekTeller.map((t) => `<tr><td>${kutu}</td><td class="id">${t.id}</td><td>${renkEtiketi(t.sinif)}</td><td><span class="ref">${esc(t.from.ref)}</span>${t.from.pasif ? "." : "-"}${t.from.pin} <span class="pa">${esc(t.from.ad)}</span></td><td><span class="ref">${esc(t.to.ref)}</span>${t.to.pasif ? "." : "-"}${t.to.pin} <span class="pa">${esc(t.to.ad)}</span></td><td class="net">${esc(t.net)}</td><td class="sag">${t.uzunluk}</td></tr>`).join("");

  const govde = `
<section class="kapak">
<div class="ust">CPU16 · Kurulum el kitabı</div>
<h1>Kurulum el kitabı</h1>
<p class="alt">CPU16'yı masada kurmak için: hangi bacağın nereye gideceği kart belgelerinde, nasıl kurulacağı burada. Deneyler (1–8) breadboard'da, tam bilgisayar PCB'de.</p>
<div class="olgular">
<div class="olgu"><b>${planlar.length}</b><span>kart belgesi</span></div>
<div class="olgu"><b>${top((p) => p.cipler.length)}</b><span>entegre</span></div>
<div class="olgu"><b>${sayi(top((p) => p.teller.length))}</b><span>sinyal teli (bağlantı)</span></div>
<div class="olgu"><b>${sayi(top((p) => p.beslemePinleri))}</b><span>besleme ucu</span></div>
</div>
<h3>İçindekiler</h3>
<ol class="icindekiler">
<li><a href="#belgeler">Belgeler ve iki yol</a></li>
<li><a href="#araclar">Araçlar ve malzeme</a></li>
<li><a href="#renk">Tel renk standardı</a></li>
<li><a href="#okuma">Listeler nasıl okunur</a></li>
<li><a href="#besleme">Besleme dağıtımı ve dekuplaj</a></li>
<li><a href="#yon">Çip yönü ve takma</a></li>
<li><a href="#blok">Blok blok kurma ve test</a></li>
<li><a href="#breadboard">Yol A: breadboard (Deney 1–8)</a></li>
<li><a href="#pcb">Yol B: PCB montajı (tam bilgisayar)</a></li>
<li><a href="#hatalar">Sık yapılan hatalar</a></li>
<li><a href="#wirewrap">Ek A: wire-wrap</a></li>
<li><a href="#komutlar">Ek B: dosyalar ve komutlar</a></li>
</ol>
<p class="dipnot">Kart tanımlarından üretildi: <span class="mono">npm run cpu16 -- kurulum hepsi</span> · ${esc(o.tarih)}. Kaynak: <span class="mono">cpu16/kurulum/</span>, açıklama: <span class="mono">cpu16/docs/kurulum.md</span>.</p>
</section>

<section class="bolum" id="belgeler">
<h2>1. Belgeler ve iki yol</h2>
<p>Her kartın üç belgesi var:</p>
<ul>
<li><b>Deney rehberi</b> (<span class="mono">cpu16/kit/deney-NN-*.md</span>): kartın ne yaptığı, kurulum adımları, testin beklenen sonucu, sorun giderme.</li>
<li><b>Kurulum belgesi</b> (<span class="mono">&lt;kart&gt;-kurulum.pdf</span>): malzeme, yerleşim haritası, besleme tablosu, numaralı tel listesi, çip kartları, kenar konnektörü. Hangi bacak nereye: buradan.</li>
<li><b>Şema</b> (<span class="mono">&lt;kart&gt;-sema.pdf</span>, KiCad): bağlantılar net etiketleriyle; adlar kurulum belgesindekiyle aynı.</li>
</ul>
<h3>İki yol</h3>
<table class="tablo"><tbody>
<tr><td style="width:42mm"><b>Yol A — breadboard</b><br><span class="muted kucuk">Deney 1–8</span></td><td>Öğrenme deneyleri: saat kartı, programlayıcı, CPU kartı blok blok, bellek kartı ve ilk program. Bir blok kurulur, test edilir, sonraki bloğa geçilir. Hata bulmak kolay, değiştirmek serbest.</td></tr>
<tr><td><b>Yol B — PCB</b><br><span class="muted kucuk">tam bilgisayar</span></td><td>Bütün kartlar KiCad şemalarından PCB olarak yapılır, çipler soketlere takılır, kartlar arka panele oturur. Tel listesi burada <b>bip testi listesidir</b>: lehimden sonra her bağlantı multimetreyle denetlenir. CPU kartı ileride arka panelde 4–5 küçük karta bölünecek; bölününce belgeler yeniden üretilir.</td></tr>
<tr><td><b>Ek — wire-wrap</b></td><td>PCB yerine tek seferlik kart: aynı tel listesi, sarım sarım (Ek A).</td></tr>
</tbody></table>
<h3>Kartlar</h3>
<table class="tablo"><thead><tr><th>Kart</th><th style="width:15mm">Deney</th><th class="sag" style="width:13mm">Entegre</th><th class="sag" style="width:10mm">Pasif</th><th class="sag" style="width:12mm">Tel</th><th class="sag" style="width:14mm">mA</th><th style="width:22mm">Yol</th><th style="width:56mm">Dosyalar</th></tr></thead>
<tbody>${kartSatir}
<tr><td><b>Toplam</b></td><td></td><td class="sag"><b>${top((p) => p.cipler.length)}</b></td><td class="sag"><b>${top((p) => p.pasifler.length)}</b></td><td class="sag"><b>${sayi(top((p) => p.teller.length))}</b></td><td class="sag"><b>≈ ${sayi(top((p) => p.gucButcesi.toplam))}</b></td><td></td><td></td></tr></tbody></table>
<p class="kucuk muted">"Tel" = kartın sinyal bağlantıları (her netin karttaki uç sayısı − 1); besleme hariç. mA = kaba besleme hesabı (bellekler seçiliyken, LED'ler yanarken). Test bellek kartının yalnızca FF00 çıkış mandalı kurulur; RAM bloğu simülasyondadır.</p>
</section>

<section class="bolum" id="araclar">
<h2>2. Araçlar ve malzeme</h2>
<h3>Her iki yolda</h3>
<table class="tablo"><tbody>
<tr><td style="width:56mm"><b>Ayarlı, akım sınırlı 5 V kaynak</b></td><td>İlk açılışta akım sınırı kısa devreyi çip yanmadan yakalar. Tam bilgisayar ≈ 1 A çeker; 3 A'lik düzenli adaptör son kullanımda yeterli.</td></tr>
<tr><td><b>Multimetre (bip sesli süreklilik)</b></td><td>Besleme ölçümü ve PCB'de bip testi. İnce uçlu (iğne) problar soket pinlerine rahat değer.</td></tr>
<tr><td><b>Lojik prob ya da 8 kanallı USB lojik analizör</b></td><td>Saat, UART, PS/2, VGA zamanlaması (sigrok / PulseView).</td></tr>
<tr><td><b>Çip sökme maşası, pin düzeltici</b></td><td>Çipi düz çekmek için; yeni çiplerin bacakları hafif açıktır, masaya bastırarak paralel yap.</td></tr>
<tr><td><b>Etiketler, ince uçlu kalem</b></td><td>Çiplerin sırtına referans (U12), programlanmış EEPROM'lara içerik (BIOS / karakter ROM'u).</td></tr>
<tr><td><b>Yardımcı modüller</b></td><td>16 LED gösterge (2 × 74HC541) ve 16 bit anahtar girişi: <span class="mono">cpu16/kit/README.md</span>, "Gereken araçlar".</td></tr>
</tbody></table>
<h3>Yol A: breadboard</h3>
<ul>
<li>830 delikli breadboard: CPU kartı tek başına ${sayi(planlar.find((x) => x.kk.kart === "cpu")?.plan.cipler.length ?? 0)} entegre; deneyler için toplam 25–35 adet. Aynı marka al: raylar ve kenar kilitleri uyuşsun.</li>
<li>Tek damarlı (som) 0,5–0,6 mm (22–24 AWG) tel, renk koduna göre en az 9 renk; hazır kesilmiş "jumper kit" kısa bağlantılar için. Esnek uçlu jumper kabloları kullanma: temas zayıf, karışık.</li>
<li>Tel sıyırıcı (0,5 mm ayarlı), yan keski, düz uçlu pense.</li>
</ul>
<h3>Yol B: PCB</h3>
<ul>
<li>Sıcaklık ayarlı havya (≈ 330 °C kurşunlu, ≈ 360 °C kurşunsuz), 0,5–0,8 mm lehim, flux kalemi, lehim pompası ve fitil, izopropil alkol + fırça.</li>
<li>Soketler: kurulum belgesinin malzeme listesindeki "Soketler" tablosu (DIP-14 / 16 / 20, geniş DIP-28; EEPROM'lar için ZIF önerilir). Kaliteli (işlenmiş, yuvarlak pinli) soket arıza bulmayı kolaylaştırır.</li>
<li>2 × 32 pin başlıklar (kenar konnektörü ve arka panel), elektrolitik ve seramik kondansatörler, direnç dizileri: malzeme listesinden.</li>
<li>Büyüteç ya da USB mikroskop: lehim köprüsü aramak için.</li>
</ul>
</section>

<section class="bolum" id="renk">
<h2>3. Tel renk standardı</h2>
<p>Renk, telin ne taşıdığını söyler: arıza ararken "sarı tel bir adres hattıdır" diye bakarsın. Kurulum belgelerinde her telin rengi yazılıdır; sınıf net adından çıkarılır.</p>
${renkTablosu()}
<ul>
<li>Aynı netin bütün telleri aynı renktir. Rengi bitince en yakın sınıfın rengini kullan ve tel listesine not düş; ama kırmızı ve siyahı asla sinyal için kullanma.</li>
<li>Beyaz (saat) telleri en kısa yoldan götür; uzun saat hatlarının yanına bir siyah (GND) tel koy.</li>
<li>Renkler yalnızca breadboard ve wire-wrap için anlamlıdır. PCB'de teller yoktur; aynı renk kutucukları orada bip testi listesinde sınıfı gösterir.</li>
</ul>
</section>

<section class="bolum" id="okuma">
<h2>4. Listeler nasıl okunur</h2>
<h3>Tel listesi</h3>
<p>Her satır <b>iki bacak arasında tek bir teldir</b>. Bir netin karttaki bütün uçları, en yakın komşu sırasıyla bir zincir oluşturur (A → B → C …): teller kısa kalır, bir bacağa en çok üç tel gelir. Liste bloklara bölünmüştür ve bloklar kurulum sırasıyladır: bir blok bitince o ana kadar kurulan blokların bütün bağlantıları tamamdır.</p>
${ornekSatir ? `<table class="tablo teller"><thead><tr><th style="width:5mm"></th><th style="width:13mm">Tel</th><th style="width:22mm">Renk</th><th>Nereden</th><th>Nereye</th><th style="width:30mm">Net</th><th class="sag" style="width:11mm">≈ mm</th></tr></thead><tbody>${ornekSatir}</tbody></table><p class="kucuk muted">Saat kartı belgesinden dört satır.</p>` : ""}
<table class="tablo"><tbody>
<tr><td style="width:36mm"><span class="ref">U203</span>-9 <span class="pa">CP</span></td><td>U203'ün 9. bacağı; küçük yazı pinin adıdır (veri sayfasındaki ad, burada saat girişi CP).</td></tr>
<tr><td><span class="ref">R201</span>.2, <span class="ref">J201</span>.25</td><td>Pasif elemanın / konnektörün 2. / 25. ucu (deney rehberleriyle aynı yazım).</td></tr>
<tr><td><span class="id">T0042</span></td><td>Tel numarası; kart içinde. Belge şemadan üretildiği için şema değişince numaralar kayabilir: belgenin tarihini not et, eski çıktıyla yeni kartı karıştırma.</td></tr>
<tr><td><span class="net">~MRD</span>, <span class="net">N123</span></td><td>Net adı ("~" = aktif düşük). Adsız netler KiCad şemasındaki gibi N + sayı.</td></tr>
<tr><td>≈ mm</td><td>Önerilen yerleşimde dik açılı yol uzunluğu. Breadboard'da yerleşim farklıdır: yerinde ölç, iki uca 7–8 mm soyma payı ekle.</td></tr>
<tr><td>${kutu}</td><td>İşaret kutusu: takıldı (breadboard), sarıldı (wire-wrap), bip testi geçti (PCB). Kurşun kalemle işaretle; bir tel sökülürse sil.</td></tr>
</tbody></table>
<h3>Çip kartı</h3>
<p>Çip çip çalışmak için: her pinin neti, rengi, arka panel pini ve o pine gelen teller. Çip veri sayfasındaki gibi <b>çentik yukarıda</b> çizilir; kartta çentik soldadır, kâğıdı 90° sola çevirince aynı görünür. <span class="mono">T0042→U40-7</span>: T0042 teli bu pinden U40'ın 7. bacağına gider. "nette 9 uç" yazıyorsa bu pine yalnızca zincirdeki komşuları bağlanır; öbür uçlar başka tellerle birbirine bağlanır.</p>
${ornekCip ? cipKarti(ornekCip, ornekCip.blok) : ""}
<h3>Diğer bölümler</h3>
<ul>
<li><b>Yerleşim haritası</b>: kartın üstten görünüşü, bloklar renkli; kenardaki harf + sayı (C4) 20 mm'lik hücredir, tablolardaki "yer" sütunu bunu yazar. Blok haritalarında ref + değer, kare ped = 1. pin.</li>
<li><b>Kurulum sırası</b>: blokların sırası, deneyi, takılacak çipleri, yapıştırıcı kapıları ve tel aralığı (ör. T0001–T0315).</li>
<li><b>Besleme</b>: her çipin VCC / GND bacağı, dekuplaj kondansatörü, sabit 0 / sabit 1 girişleri.</li>
<li><b>Kenar konnektörü</b>: 2 × 32 arka panel pinleri, bu kartın hangisini sürdüğü / okuduğu, konnektöre giden teller.</li>
</ul>
</section>

<section class="bolum" id="besleme">
<h2>5. Besleme dağıtımı ve dekuplaj</h2>
<ul>
<li><b>Her entegre</b>: VCC ve GND bacağı (14 pinlide 14 / 7, 16 pinlide 16 / 8, 20 pinlide 20 / 10, 62256 ve 28C256'da 28 / 14) besleme hattına. Kurulum belgesinin Besleme tablosu her çip için yazar. Ters takılmış bir çip VCC'yi GND'ye bağlar: ısınır.</li>
<li><b>Dekuplaj</b>: her entegrenin yanında 100 nF seramik, VCC ve GND bacaklarına en kısa yoldan. Her kartın (her breadboard'un) girişinde 100 µF elektrolitik. Dekuplajsız 74HC kartlar osilatör kenarlarında rastgele hata yapar.</li>
<li><b>Sabit girişler</b>: CMOS girişi asla boşta kalmaz. Yapıştırıcı çiplerin kullanılmayan kapılarının girişleri GND'ye bağlıdır; ~OE, ~MR gibi sabit girişler tabloda "sabit 0 / sabit 1" sütunundadır.</li>
<li><b>Breadboard</b>: her breadboard'un iki rayına da besleme ver; uzun breadboard'larda raylar ortadan bölünmüştür, köprü tel koy. Bir sıra breadboard'u besleme iki uçtan beslensin (yalnız bir uçtan beslenen 6–8 breadboard'da gerilim düşer).</li>
<li><b>PCB</b>: geniş VCC / GND yolları ya da düzlemler (4 katmanda iç katmanlar GND ve VCC). Arka panel her karta VCC'yi 3 pin, GND'yi 4 pin üzerinden verir.</li>
</ul>
<h3>İlk açılış (her kartta, her yeni blokta)</h3>
<ol>
<li>Çipler takılmadan (PCB) ya da yeni blok kablolanmadan önce: VCC – GND arası kısa devre yok (direnç ölçümü; kondansatörler dolarken değer yükselir).</li>
<li>Kaynağın akım sınırını kartın tahmini akımının ≈ 1,5 katına ayarla (kart belgesinin kapağında "besleme"), sonra aç.</li>
<li>Her soketin / çipin VCC ve GND bacağında ≈ 5 V (4,75–5,25 V) ölç. Akım tahminin çok üstündeyse kapat: ters çip, kısa devre, iki çıkış aynı nette.</li>
<li>Çipleri (PCB) blok blok tak: her bloktan sonra akım ve sıcaklığa bak (parmak ucuyla: hiçbir 74HC çipi ısınmamalı).</li>
</ol>
</section>

<section class="bolum" id="yon">
<h2>6. Çip yönü ve takma</h2>
<ul>
<li><b>1. pin</b>: çipin bir ucundaki çentik (yarım ay) ya da köşedeki nokta. Üstten bakınca çentik yukarıdayken 1. pin sol üsttedir, numaralar saat yönünün tersine artar: sol sıra aşağı (1 … n/2), sağ sıra yukarı (n/2 + 1 … n).</li>
<li><b>Kartta çentik solda</b>: bütün çipler aynı yönde, çentik sola; 1. pin sol altta. Haritalar ve önerilen yerleşim böyledir. Hepsi aynı yöndeyse ters takılmış çip bir bakışta görünür.</li>
<li><b>Breadboard</b>: çip ortadaki oluğun üstüne oturur (iki sıra bacak iki yanda). Bacakları önce bir yana hafifçe yerleştir, sonra düz bastır.</li>
<li><b>PCB</b>: serigrafideki çentik ve <b>kare ped</b> 1. pindir. Önce soketi, çentiği serigrafiyle aynı yönde lehimle; çipi soketin çentiğine göre tak.</li>
<li><b>Geniş kılıflar</b>: 62256 (SRAM) ve 28C256 (EEPROM) 15,24 mm aralıklı DIP-28'dir; breadboard'da oluğun iki yanında daha geniş yer kaplar.</li>
<li><b>Aile</b>: belgede 74HC yazıyorsa 74HC, 74AC yazıyorsa 74AC (video kartının piksel yolu). 74HCT ve 74LS bacak düzeni aynı ama seviyeleri ve gecikmeleri farklıdır: karıştırma.</li>
<li><b>Programlanmış çipler</b>: BIOS EEPROM'u (bellek kartı) ve karakter ROM'u (video kartı) aynı kılıfta 28C256'dır: etiketle, yer değiştirirlerse bilgisayar açılmaz.</li>
<li><b>Statik elektrik</b>: çiplere dokunmadan önce topraklı bir metale dokun; CMOS girişleri hassastır.</li>
</ul>
</section>

<section class="bolum" id="blok">
<h2>7. Blok blok kurma ve test</h2>
<p>Bir kartı bir seferde kurma. Kurulum belgesinin "Kurulum sırası" tablosu kartı bloklara böler; bloklar deney sırasıyladır. Her blok için aynı döngü:</p>
<ol>
<li><b>Yerleştir</b>: bloğun çiplerini ve kapısı bu blokta kullanılan yapıştırıcı çiplerini (ilk kez gerekiyorsa) tak, pasiflerini yerleştir.</li>
<li><b>Besle</b>: bu çiplerin VCC / GND bacakları, dekuplajları, sabit girişleri (Besleme tablosu). Ölç.</li>
<li><b>Bağla</b>: bloğun tel aralığını sırayla tak (PCB'de: bip testiyle denetle), kutuları işaretle.</li>
<li><b>Gözle denetle</b>: çip kartındaki her pinin tel sayısı kadar tel var mı; boş kalması gereken bacaklar ("boş çıkış") boş mu.</li>
<li><b>Test et</b>: deney rehberinin "Test: beklenen sonuç" bölümü. Henüz kurulmamış bloklardan gelecek girişleri ("▶ elle sür") anahtar + 10 kΩ ile sür, çıkışları LED gösterge modülüyle izle.</li>
<li>Geçtiyse sonraki bloğa geç. Geçmediyse simülatörde aynı devreyi aynı girişlerle çalıştır, aynı net adına bak (Silikon3D → "CPU16 kartı 3D", <span class="mono">kart.secNet("…")</span>).</li>
</ol>
<h3>Deneyler ve testleri</h3>
<table class="tablo"><thead><tr><th style="width:11mm">Deney</th><th>Kurulan</th><th>Geçti sayılır</th></tr></thead><tbody>
<tr><td>1</td><td>Saat ve reset kartı</td><td>YAVAŞ'ta CLK LED'i yanıp söner; ADIM'da her basışta tek CPU döngüsü</td></tr>
<tr><td>3</td><td>EEPROM programlayıcı</td><td>yazılan imaj geri okunduğunda aynı (<span class="mono">yaz.py --dogrula</span>)</td></tr>
<tr><td>4–7</td><td>CPU kartı, blok blok</td><td>her blok rehberdeki tabloyu verir; Deney 7 sonunda CPU komut çeker, NOP döngüsü, HALT</td></tr>
<tr><td>8</td><td>Bellek kartı + FF00 mandalı + önbellek kartının iki bloğu</td><td>ilk program EEPROM'dan RAM'i sınar, LED'lerde <span class="mono">0x5A</span></td></tr>
<tr><td>9–11</td><td>Önbellek, G/Ç, video kartları</td><td>kayan ışık hızlanır; terminalde başlık ve yankı; ekranda "Merhaba, CPU16!"</td></tr>
<tr><td>12</td><td>BIOS</td><td><span class="mono">npm run cpu16 -- kart-testi --port …</span>: <b>4/4 geçti</b></td></tr>
</tbody></table>
<p class="kucuk muted">Ayrıntı: <span class="mono">cpu16/docs/uretim.md</span> "Kurulum sırası ve her adımın testi". Kart testi gerçek kartı UART üzerinden simülatörle karşılaştırır; kalırsa hangi kartın hangi bloğuna bakılacağını söyler.</p>
</section>

<section class="bolum" id="breadboard">
<h2>8. Yol A: breadboard (Deney 1–8)</h2>
<ul>
<li><b>Düzen</b>: breadboard'ları blok sırasıyla diz; blok haritasındaki komşuluğu koru (aynı bloğun çipleri yan yana). Veri ve adres yolları için breadboard'ların arasında boşluk bırakma: uzun teller yerine kısa köprüler.</li>
<li><b>Tel</b>: listedeki sırayla, rengine göre. Teli breadboard'un yüzeyine yatık, çiplerin üstünden değil yanından götür (çip değiştirebilmelisin). Soyma ≈ 7–8 mm; çıplak uç deliğe tam girmeli, dışarıda çıplak bakır kalmamalı.</li>
<li><b>Zincir</b>: bir netin telleri pinden pine zincir gibidir; bir bacağın sütununda 4 boş delik var, en çok 3 tel gelir.</li>
<li><b>Yarım bloklar</b>: deney rehberindeki "▶ elle sür" girişleri anahtar + 10 kΩ çekme direnciyle sür; bu teller listede yoktur, blok kurulunca sök.</li>
<li><b>Kartlar arası</b>: arka panel sinyalleri (A0..A15, DE0..7, CLK, ~RESET …) breadboard'lar arasında aynı adlı netleri birleştiren uzun tellerdir. Kurulum belgesinde bunlar kenar konnektörüne (J…) giden tellerdir: konnektör yerine bir başlık (pin header) ya da breadboard'un kenar sütunu kullan, adını etiketle.</li>
<li><b>Saat</b>: CLK ve OSC tellerini kısa tut; hızlanınca bozulan devre çoğu zaman uzun saat teli ya da eksik dekuplajdır. İlk kurulum 8 MHz osilatör / 1 MHz CPU (Deney 1).</li>
<li><b>Bitince</b>: kartın tamamı Deney 8'e kadar breadboard'da çalışır. Tam bilgisayarın PCB'si bu çalışan devrenin kopyasıdır: önce breadboard'da 4/4, sonra PCB.</li>
</ul>
</section>

<section class="bolum" id="pcb">
<h2>9. Yol B: PCB montajı (tam bilgisayar)</h2>
<p>Kartlar KiCad şemalarından (<span class="mono">cpu16/kicad/&lt;kart&gt;/</span>) çizilir. Şemanın netlisti kart tanımıyla birebir aynıdır (testler <span class="mono">kicad-cli</span> ile denetler); kurulum belgesindeki tel listesi de aynı tanımdan gelir.</p>
<h3>Çıplak kart testi (lehimden önce)</h3>
<ol>
<li>Gözle: kopuk yol, iki yol arasında bakır köprüsü, delinmemiş delik.</li>
<li>VCC – GND arası kısa devre yok (multimetre, direnç). PCB üreticisinin elektrik testi (E-test) varsa iste.</li>
<li>Rastgele 20–30 tel: tel listesinden seç, iki ucu arasında bip. Bir tanesi bile çalmıyorsa PCB şemadan farklıdır: siparişi ve dosyayı denetle.</li>
</ol>
<h3>Lehim sırası (alçaktan yükseğe)</h3>
<ol>
<li>Dirençler ve diyotlar (yatık).</li>
<li><b>Soketler</b>: çentik serigrafiyle aynı yönde. Önce iki karşı köşe pinini lehimle, soketin karta tam oturduğunu ve düz olduğunu gör, sonra kalan pinler.</li>
<li>Seramik kondansatörler (100 nF dekuplaj), direnç dizileri (SIP: 1. pin noktası ortak uç).</li>
<li>LED'ler (uzun bacak anot), butonlar, anahtarlar, trimpot.</li>
<li>Pin başlıkları ve konnektörler (kenar konnektörü, VGA, PS/2, USB-seri yuvası), osilatör modülleri.</li>
<li>Elektrolitik kondansatörler (− işaretli bacak GND'ye) en son.</li>
<li>Flux artığını izopropil alkolle temizle; büyüteçle lehim köprüsü ara (özellikle komşu soket pinleri arasında).</li>
</ol>
<h3>Bip testi (çipler takılmadan)</h3>
<ol>
<li><b>Besleme</b>: her soketin VCC pininden VCC'ye, GND pininden GND'ye bip (Besleme tablosu). Sabit 0 / sabit 1 girişleri de. VCC ile GND arasında kondansatörler dolarken kısa bir bip normaldir; sürekli bip kısa devredir.</li>
<li><b>Tel listesi</b>: her satır için problar "Nereden" ve "Nereye" soket pinlerine; bip → kutuyu işaretle. Bir bloğun listesini bitirmeden sonrakine geçme.</li>
<li><b>Kısa devre</b>: her soketin komşu pinleri arasında bip olmamalı — çip kartında aynı neti göstermiyorlarsa. Bip duyarsan lehim köprüsü ya da yol hatası.</li>
<li>Kenar konnektörü: kenar konnektörü tablosundaki her kullanılan pinden karttaki ilk uca bip.</li>
</ol>
<h3>İlk çalıştırma</h3>
<ol>
<li>Çipsiz besleme: akım sınırı 100 mA, her sokette ≈ 5 V.</li>
<li>Çipleri blok blok tak (kurulum sırası), her bloktan sonra akım ve sıcaklık; blok testi deney rehberinden.</li>
<li>Kart arka panele: önce saat kartı + CPU + bellek (Deney 8 programı), sonra önbellek, G/Ç, video. En sonda BIOS ve <span class="mono">kart-testi</span>.</li>
</ol>
<div class="not">CPU kartı ileride arka panelde 4–5 küçük karta bölünecek. Bu belgeler bugünkü tek CPU kartına göredir; bölme yapılınca kart tanımı değişir ve belgeler yeniden üretilir (<span class="mono">npm run cpu16 -- kurulum cpu</span>).</div>
</section>

<section class="bolum" id="hatalar">
<h2>10. Sık yapılan hatalar</h2>
<table class="tablo"><thead><tr><th style="width:52mm">Hata</th><th style="width:58mm">Belirti</th><th>Önlem</th></tr></thead><tbody>
<tr><td>Ters takılmış çip</td><td>çip ısınır, akım sınırına dayanır</td><td>bütün çipler çentik solda; açmadan önce bir sıra çipe bak</td></tr>
<tr><td>Bir bacak dışarıda / katlanmış</td><td>bir bit hep yanlış, dokununca değişir</td><td>çip kartındaki pinleri tek tek say; bacakları takmadan önce düzelt</td></tr>
<tr><td>Boşta giriş (CMOS)</td><td>davranış elle / zamanla değişir</td><td>Besleme tablosundaki sabit girişler; "▶ elle sür" girişleri</td></tr>
<tr><td>Bir sıra kaymış tel</td><td>komşu bit ya da komşu sinyal yanlış</td><td>tel listesinde iki ucu da pin numarasıyla say; breadboard'da çipin 1. pinini referans al</td></tr>
<tr><td>Bölünmüş besleme rayı</td><td>breadboard'un yarısı çalışmaz</td><td>rayları köprüle, her çipte 5 V ölç</td></tr>
<tr><td>Eksik dekuplaj, uzun saat teli</td><td>ADIM'da doğru, hızlıda bozuk</td><td>her çipe 100 nF; saat tellerini kısalt, yanına GND</td></tr>
<tr><td>İki çıkış aynı nette</td><td>çipler ısınır, değerler karışık</td><td>üç durumlu sürücülerin ~OE tellerini (turuncu) denetle</td></tr>
<tr><td>74HC yerine 74HCT / LS / AC</td><td>zamanlama ya da seviye sorunları</td><td>malzeme listesindeki değer; 74AC yalnız belirtilen yerde</td></tr>
<tr><td>EEPROM'lar karışmış</td><td>açılmıyor ya da ekranda anlamsız karakter</td><td>BIOS / karakter ROM'u etiketle</td></tr>
<tr><td>Eski belgeyle kurulum</td><td>tel numaraları şemayla uyuşmaz</td><td>belgenin tarihi; şema değişince yeniden üret</td></tr>
<tr><td>Lehim köprüsü (PCB)</td><td>komşu pinler arasında bip</td><td>büyüteç; komşu pin bip testi</td></tr>
<tr><td>Elektrolitik / LED ters</td><td>LED yanmaz; kondansatör ısınır</td><td>+ / uzun bacak; − şeridi GND'ye</td></tr>
</tbody></table>
</section>

<section class="bolum" id="wirewrap">
<h2>Ek A: wire-wrap</h2>
<p>PCB yaptırmadan kalıcı bir kart için. Delikli plakete uzun pinli wire-wrap soketleri; bağlantılar 30 AWG (Kynar) telin pine sarılmasıyla.</p>
<ul>
<li>Araç: wire-wrap aleti (sarma / sökme), 30 AWG tel renk koduna göre, uzun pinli soketler ve başlıklar.</li>
<li>Besleme: önce, daha kalın telle ya da lehimli bir besleme ızgarasıyla; dekuplaj kondansatörleri soket pinlerine lehimlenir.</li>
<li>Tel listesi aynıdır: her satır bir sarım. Zincir yapısı sayesinde bir pine en çok üç tel gelir (pin boyu genellikle üç sarıma yeter). İlk sarım pinin dibine, sonrakiler üstüne.</li>
<li>Kart arkadan bakılır: pin numaraları ters yöndedir (aynalanmış). Soketlerin arkasına pin 1'i işaretle.</li>
<li>Bir blok bitince bip testi ve deney testi, PCB'deki gibi.</li>
</ul>
</section>

<section class="bolum" id="komutlar">
<h2>Ek B: dosyalar ve komutlar</h2>
<table class="tablo"><tbody>
<tr><td style="width:78mm" class="mono">npm run cpu16 -- kurulum hepsi</td><td>bütün kurulum belgeleri, şema PDF'leri ve bu el kitabı (<span class="mono">cpu16/kurulum/cikti/</span>)</td></tr>
<tr><td class="mono">npm run cpu16 -- kurulum cpu [-o dizin]</td><td>tek kartın belgesi</td></tr>
<tr><td class="mono">npm run cpu16 -- kit</td><td>deney rehberlerinin malzeme ve bağlantı tabloları</td></tr>
<tr><td class="mono">npm run cpu16 -- board kicad</td><td>KiCad şemaları ve BOM'lar (<span class="mono">cpu16/kicad/</span>)</td></tr>
<tr><td class="mono">npm run cpu16 -- zamanlama [--anakart]</td><td>şemadan statik zamanlama analizi</td></tr>
<tr><td class="mono">npm run cpu16 -- kart-testi --port …</td><td>gerçek kartı simülatörle karşılaştır (BIOS gerekir)</td></tr>
</tbody></table>
<p>Belgeler: <span class="mono">cpu16/kit/README.md</span> (deney seti), <span class="mono">cpu16/docs/kartlar.md</span> (arka panel), <span class="mono">cpu16/docs/uretim.md</span> (saat hızı, besleme, kurulum sırası, arıza bulma), <span class="mono">cpu16/docs/kurulum.md</span> (bu belgelerin üreteci).</p>
</section>
`;
  return htmlBelge("Kurulum el kitabı", govde, "CPU16'yı breadboard ve PCB üzerinde kurmak için genel kurallar ve kart belgelerinin kullanımı");
}
