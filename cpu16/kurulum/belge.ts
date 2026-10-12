// Kart başına kurulum belgesi (A4, yazdırılabilir HTML; kurulum/cli.ts PDF'e çevirir):
// kapak ve malzeme, nasıl kullanılır + renk kodu, yerleşim haritası (kart ve blok blok), kurulum
// sırası, besleme, numaralı tel listesi, çip kartları (DIP pin düzeni, her pinin neti ve telleri),
// pasif elemanlar, kenar konnektörü. Bütün veri kurulum/plan.ts'ten gelir.

import { DENEYLER, dosyaAdi } from "../kit/deneyler.ts";
import type { KurulumKarti } from "./kartlar.ts";
import { renkKodu, sutunHarfi, type BlokPlani, type CipKarti, type KurulumPlani, type PinSatiri, type UcSinifi } from "./plan.ts";
import { DEPO_URL, esc, htmlBelge, kutu, renkEtiketi, renkTablosu } from "./stil.ts";

export interface BelgeSecenekleri {
  /** üretim tarihi (YYYY-AA-GG) */
  tarih: string;
  /** belgenin yanındaki KiCad şeması PDF'inin dosya adı */
  semaDosyasi?: string;
}

const deneyBaglantisi = (no: number): string => {
  const d = DENEYLER.find((x) => x.no === no);
  if (!d) return `Deney ${no}`;
  return `<a href="${DEPO_URL}/cpu16/kit/${dosyaAdi(d)}">Deney ${no}</a>`;
};
const deneyAdi = (no: number) => DENEYLER.find((x) => x.no === no)?.baslik ?? "";
const sayi = (n: number) => n.toLocaleString("tr-TR");
const mm = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });

// ---------------------------------------------------------------- harita (SVG)

interface Bolge { x: number; y: number; w: number; h: number }

const PASIF_RENK: Record<string, string> = {
  direnc: "#e6cf9f", kondansator: "#f2bd6b", elektrolitik: "#4f78a6", led: "#e04b3c", dizi: "#e6cf9f", konnektor: "#4a4a4a",
  osilator: "#b9c0c8", buton: "#8f8f8f", anahtar: "#8f8f8f", pot: "#5788b8", modul: "#2c7fb8",
  // CPU kartının çubuk göstergeleri ve önlerindeki DIP-16 direnç dizileri: kara gövde
  cubuk: "#1c1d20", dipdizi: "#2b2e33",
};
const KOYU = new Set(["elektrolitik", "konnektor", "modul", "led", "pot", "cubuk", "dipdizi"]);

/** Kartın (ya da bir bölgesinin) üstten görünüşü. olcek: kâğıtta mm / kart mm'si. */
function haritaSvg(p: KurulumPlani, b: Bolge, olcek: number, o: { ayrinti: boolean; vurgu?: string }): string {
  const f = (kagitMm: number) => kagitMm / olcek;
  const n = (v: number) => v.toFixed(2);
  const out: string[] = [];
  out.push(`<rect x="0" y="0" width="${n(p.olcu.w)}" height="${n(p.olcu.h)}" rx="3" fill="#f6f6f1" stroke="#555" stroke-width="${n(f(0.35))}"/>`);
  // ızgara: sütunlar harf, satırlar sayı (çip yerleri "C4" diye yazılır)
  const g = p.izgara;
  for (let x = g; x < p.olcu.w; x += g) if (x > b.x && x < b.x + b.w) out.push(`<line x1="${n(x)}" y1="0" x2="${n(x)}" y2="${n(p.olcu.h)}" stroke="#d6d6cf" stroke-width="${n(f(0.15))}"/>`);
  for (let y = g; y < p.olcu.h; y += g) if (y > b.y && y < b.y + b.h) out.push(`<line x1="0" y1="${n(y)}" x2="${n(p.olcu.w)}" y2="${n(y)}" stroke="#d6d6cf" stroke-width="${n(f(0.15))}"/>`);
  const etiketFs = f(2.1);
  for (let c = 0; c * g < p.olcu.w; c++) {
    const cx = c * g + g / 2;
    if (cx < b.x || cx > b.x + b.w) continue;
    const ly = b.y < 0 ? -f(0.9) : b.y + etiketFs * 1.05;
    out.push(`<text x="${n(cx)}" y="${n(ly)}" font-size="${n(etiketFs)}" fill="#777" text-anchor="middle">${sutunHarfi(c)}</text>`);
  }
  for (let r = 0; r * g < p.olcu.h; r++) {
    const cy = r * g + g / 2;
    if (cy < b.y || cy > b.y + b.h) continue;
    const lx = b.x < 0 ? -f(1) : b.x + f(0.6);
    out.push(`<text x="${n(lx)}" y="${n(cy + etiketFs / 3)}" font-size="${n(etiketFs)}" fill="#777" text-anchor="${b.x < 0 ? "end" : "start"}">${r + 1}</text>`);
  }
  // yalnızca bölgeyle kesişenler çizilir (blok haritaları küçük kalsın)
  const icinde = (r: { x: number; y: number; w: number; h: number }) => r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y;
  const blok = new Map(p.bloklar.map((x) => [x.ad, x]));
  for (const bl of p.blokYerleri.filter(icinde)) {
    const op = o.vurgu && o.vurgu !== bl.ad ? 0.3 : 1;
    const bp = blok.get(bl.ad);
    out.push(`<g opacity="${op}"><rect x="${n(bl.x)}" y="${n(bl.y)}" width="${n(bl.w)}" height="${n(bl.h)}" rx="1.5" fill="${bp?.renk ?? "#eee"}" stroke="#8a8a80" stroke-width="${n(f(0.25))}"/>`);
    const fs = Math.min(f(o.ayrinti ? 2.6 : 2.4), 4.5);
    out.push(`<text x="${n(bl.x + 1.2)}" y="${n(bl.y + fs * 1.05)}" font-size="${n(fs)}" font-weight="700" fill="#333">${bp ? `${bp.sira}. ` : ""}${esc(bl.ad)}</text></g>`);
  }
  for (const ps of p.pasifler.filter(icinde)) {
    const op = o.vurgu && o.vurgu !== ps.blok && !ps.kenar ? 0.3 : 1;
    const fill = PASIF_RENK[ps.tur] ?? "#ccc";
    out.push(`<g opacity="${op}"><rect x="${n(ps.x)}" y="${n(ps.y)}" width="${n(ps.w)}" height="${n(ps.h)}" rx="${ps.tur === "elektrolitik" || ps.tur === "led" ? n(Math.min(ps.w, ps.h) / 2) : "0.5"}" fill="${fill}" stroke="#333" stroke-width="${n(f(0.18))}"/>`);
    if (o.ayrinti) {
      for (const q of ps.pins) out.push(`<circle cx="${n(q.x)}" cy="${n(q.y)}" r="0.35" fill="#555"/>`);
    }
    // etiket: kenar konnektöründe gövdenin üstüne, diğerlerinde sığıyorsa gövdeye; dekuplaj kondansatörleri çip kartında yazılı
    const label = ps.kenar ? `${ps.ref} · arka panel konnektörü (kart kenarı)` : ps.ref;
    if (ps.kenar) {
      const fs = f(2.4);
      out.push(`<text x="${n(ps.x + ps.w / 2)}" y="${n(ps.y - fs * 0.45)}" font-size="${n(fs)}" font-weight="700" text-anchor="middle" fill="#222">${esc(label)}</text>`);
    } else if (o.ayrinti && !ps.cip) {
      const fs = Math.min(ps.dikey ? ps.w * 0.8 : ps.h * 0.75, (ps.dikey ? ps.h : ps.w) / (label.length * 0.62), 2.6);
      if (fs * olcek >= 1.15) {
        const cx = ps.x + ps.w / 2;
        const cy = ps.y + ps.h / 2;
        const rot = ps.dikey ? ` transform="rotate(-90 ${n(cx)} ${n(cy)})"` : "";
        out.push(`<text x="${n(cx)}" y="${n(cy + fs * 0.35)}" font-size="${n(fs)}" font-weight="600" text-anchor="middle" fill="${KOYU.has(ps.tur) ? "#fff" : "#222"}"${rot}>${esc(label)}</text>`);
      }
    }
    out.push("</g>");
  }
  for (const c of p.cipler.filter(icinde)) {
    const op = o.vurgu && o.vurgu !== c.blok && !c.kapilar?.some((k) => k.blok === o.vurgu) ? 0.3 : 1;
    out.push(`<g opacity="${op}">`);
    if (o.ayrinti) {
      for (const q of c.pins) {
        out.push(q.num === 1
          ? `<rect x="${n(q.x - 0.55)}" y="${n(q.y - 0.55)}" width="1.1" height="1.1" fill="#222"/>`
          : `<circle cx="${n(q.x)}" cy="${n(q.y)}" r="0.5" fill="#8a8a8a"/>`);
      }
    }
    out.push(`<rect x="${n(c.x)}" y="${n(c.y)}" width="${n(c.w)}" height="${n(c.h)}" rx="0.5" fill="#fff" stroke="#222" stroke-width="${n(f(0.25))}"/>`);
    // çentik (solda) ve 1. pin noktası (sol alt)
    const r = Math.min(c.h * 0.2, 1.3);
    const cy = c.y + c.h / 2;
    out.push(`<path d="M ${n(c.x)} ${n(cy - r)} A ${n(r)} ${n(r)} 0 0 1 ${n(c.x)} ${n(cy + r)} Z" fill="#9a9a9a"/>`);
    out.push(`<circle cx="${n(c.x + 1.5)}" cy="${n(c.y + c.h - 1.3)}" r="0.6" fill="#222"/>`);
    const cx = c.x + c.w / 2 + 0.6;
    if (o.ayrinti) {
      const fsRef = Math.min(c.h * 0.36, 3.8, (c.w - 3) / (c.ref.length * 0.66));
      const fsVal = Math.min(c.h * 0.27, 2.9, (c.w - 3) / (c.deger.length * 0.6));
      out.push(`<text x="${n(cx)}" y="${n(cy - 0.15)}" font-size="${n(fsRef)}" font-weight="700" text-anchor="middle" fill="#111">${esc(c.ref)}</text>`);
      out.push(`<text x="${n(cx)}" y="${n(cy + fsVal * 1.05)}" font-size="${n(fsVal)}" text-anchor="middle" fill="#333">${esc(c.deger)}</text>`);
    } else {
      const fs = Math.min(c.h * 0.5, (c.w - 2.5) / (c.ref.length * 0.64));
      if (fs * olcek >= 1.05) out.push(`<text x="${n(cx)}" y="${n(cy + fs * 0.36)}" font-size="${n(fs)}" font-weight="700" text-anchor="middle" fill="#111">${esc(c.ref)}</text>`);
    }
    out.push("</g>");
  }
  const vb = `${n(b.x)} ${n(b.y)} ${n(b.w)} ${n(b.h)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${(b.w * olcek).toFixed(1)}mm" height="${(b.h * olcek).toFixed(1)}mm" font-family="Inter, 'DejaVu Sans', Arial, sans-serif">${out.join("")}</svg>`;
}

/** Bölgeyi sayfaya sığdıran ölçek ve yön (dikey A4: 186 mm × en, yatay A4: 272 × 158 mm); maks: en büyük büyütme */
function sigdir(b: Bolge, en: number, maks = 2.2): { olcek: number; yatay: boolean } {
  const dikey = Math.min(186 / b.w, en / b.h, maks);
  const yatay = Math.min(272 / b.w, 158 / b.h, maks);
  return yatay > dikey * 1.12 ? { olcek: yatay, yatay: true } : { olcek: dikey, yatay: false };
}

// ---------------------------------------------------------------- bölümler

function kapak(p: KurulumPlani, kk: KurulumKarti, o: BelgeSecenekleri): string {
  const olgu = (deger: string | number, ad: string) => `<div class="olgu"><b>${esc(deger)}</b><span>${esc(ad)}</span></div>`;
  const deneyler = p.deneyler.map((d) => `${deneyBaglantisi(d)} (${esc(deneyAdi(d))})`).join(", ");
  const haric = p.haric.length
    ? `<div class="not">Bu kartın <b>${esc(p.haric.join(", "))}</b> bloğu yalnızca simülasyonda vardır, gerçek kartta kurulmaz; bu belgede yer almaz.</div>`
    : "";
  return `<section class="kapak" id="kapak">
<div class="ust">${esc(kk.urun ?? "CPU16")} · Kurulum belgesi · kart <span class="mono">${esc(p.kart)}</span></div>
<h1>${esc(p.baslik)}</h1>
<p class="alt">${esc(kk.aciklama)}</p>
<div class="olgular">
${olgu(p.cipler.length, "entegre")}${olgu(p.pasifler.length, "pasif eleman")}${olgu(sayi(p.teller.length), "sinyal teli (bağlantı)")}${olgu(sayi(p.beslemePinleri), "besleme pini (VCC / GND)")}
${olgu(p.bloklar.filter((b) => b.cipler.length || b.telSayisi).length, "işlev bloğu")}${olgu(`${mm(p.olcu.w)} × ${mm(p.olcu.h)}`, "önerilen yerleşim (mm)")}${olgu(`≈ ${sayi(p.gucButcesi.toplam)} mA`, "besleme (5 V, kaba hesap)")}${olgu(kk.yol, "kurulum yolu")}
</div>
${kk.rehber
    ? `<p><b>Kurulum rehberi:</b> <span class="mono">${esc(kk.rehber)}</span> (PDF hali bu belgenin yanında). Rehber kurma sırasını ve her aşamanın testini anlatır; bu belge hangi bacağın nereye gittiğini.</p>`
    : `<p><b>Deney:</b> ${deneyler || "—"}. Deney rehberi ne yapılacağını ve nasıl test edileceğini anlatır; bu belge hangi bacağın nereye gittiğini.</p>`}
${haric}
<h3>Bu belgede</h3>
<ol class="icindekiler">
<li><a href="#malzeme">Malzeme listesi ve besleme bütçesi</a></li>
<li><a href="#kullanim">Bu belge nasıl kullanılır, tel renk kodu</a></li>
<li><a href="#yerlesim">Yerleşim haritası</a></li>
<li><a href="#bloklar">Kurulum sırası</a> ve <a href="#blokharitalari">blok haritaları</a></li>
<li><a href="#besleme">Besleme ve dekuplaj</a></li>
<li><a href="#teller">Tel listesi (${sayi(p.teller.length)} tel)</a></li>
<li><a href="#cipler">Çip kartları (${p.cipler.length} entegre)</a></li>
<li><a href="#pasifler">Pasif elemanlar</a></li>
<li><a href="#kenar">Kenar konnektörü (arka panel)</a></li>
<li><a href="#sema">Şema</a></li>
</ol>
<p class="dipnot">Bu belge kart tanımından (<span class="mono">cpu16/board/*.ts</span>) üretildi: <span class="mono">npm run cpu16 -- kurulum ${esc(p.kart)}</span> · ${esc(o.tarih)}.
Şema değişirse belgeyi yeniden üret; tel numaraları da değişebilir. Net adları KiCad şemasındakilerle aynıdır.</p>
</section>`;
}

function malzemeBolumu(p: KurulumPlani): string {
  const cipSatir = p.malzeme.cipler.map((m) => `<tr><td class="ref">${esc(m.deger)}</td><td>${esc(m.baslik)}</td><td>${esc(m.kilif)}</td><td class="sag"><b>${m.adet}</b></td><td class="mono kucuk">${esc(m.refs.join(" "))}</td></tr>`).join("");
  const pasSatir = p.malzeme.pasifler.map((m) => `<tr><td class="ref">${esc(m.deger)}</td><td>${esc(m.baslik)}</td><td class="sag"><b>${m.adet}</b></td><td class="mono kucuk">${esc(m.refs.join(" "))}</td></tr>`).join("");
  const soket = p.malzeme.soketler.map((s) => `<tr><td>${esc(s.kilif)}</td><td class="sag"><b>${s.adet}</b></td></tr>`).join("");
  const butce = p.gucButcesi.satirlar.map((r) => `<tr><td>${esc(r.kalem)}</td><td class="sag">${r.adet}</td><td class="sag">${r.birim}</td><td class="sag">${sayi(r.toplam)}</td></tr>`).join("");
  return `<section class="bolum" id="malzeme">
<h2>Malzeme listesi</h2>
<h3>Entegreler (${p.cipler.length})</h3>
<table class="tablo"><thead><tr><th style="width:20mm">Değer</th><th>Açıklama</th><th style="width:15mm">Kılıf</th><th class="sag" style="width:10mm">Adet</th><th style="width:62mm">Referanslar</th></tr></thead><tbody>${cipSatir}</tbody></table>
<p class="kucuk muted">74AC yazan çipler aynı bacak düzenli hızlı aileden olmalıdır (74HC değil): bu yollar zamanlama analizinde 74AC gecikmeleriyle hesaplandı. 74HCT ya da LS kullanma.</p>
<h3>Pasif elemanlar ve konnektörler (${p.pasifler.length})</h3>
<table class="tablo"><thead><tr><th style="width:28mm">Parça</th><th>Açıklama</th><th class="sag" style="width:10mm">Adet</th><th style="width:62mm">Referanslar</th></tr></thead><tbody>${pasSatir}</tbody></table>
<h3>Soketler (PCB için)</h3>
<table class="tablo" style="width:120mm"><thead><tr><th>Soket</th><th class="sag" style="width:14mm">Adet</th></tr></thead><tbody>${soket}</tbody></table>
<p class="kucuk muted">Her entegre sokete takılır: arızalı çip lehim sökmeden değişir, bip testi çipler takılmadan yapılır. Breadboard'da soket gerekmez.</p>
<h3>Besleme bütçesi (5 V, kaba hesap)</h3>
<table class="tablo" style="width:150mm"><thead><tr><th>Tüketici</th><th class="sag">Adet</th><th class="sag">mA / adet</th><th class="sag">mA</th></tr></thead><tbody>${butce}
<tr><td><b>Toplam</b></td><td></td><td></td><td class="sag"><b>≈ ${sayi(p.gucButcesi.toplam)}</b></td></tr></tbody></table>
<p class="kucuk muted">Bellekler yalnız seçiliyken bu akımı çeker, LED'ler yalnız yanarken; gerçek ortalama daha düşüktür. Kaynak: <span class="mono">cpu16/docs/uretim.md</span> "Besleme". İlk açılışta akım sınırlı kaynak kullan (ör. tahminin 1,5 katı).</p>
</section>`;
}

function kullanimBolumu(p: KurulumPlani, kk: KurulumKarti): string {
  const ornek = p.teller[0];
  const ornekMetin = ornek
    ? `Örnek: <span class="id">${ornek.id}</span> ${renkEtiketi(ornek.sinif)} <span class="ref">${esc(ornek.from.ref)}</span>-${ornek.from.pin} → <span class="ref">${esc(ornek.to.ref)}</span>${ornek.to.pasif ? "." : "-"}${ornek.to.pin}, net <span class="net">${esc(ornek.net)}</span>, ≈ ${ornek.uzunluk} mm.`
    : "";
  return `<section class="bolum" id="kullanim">
<h2>Bu belge nasıl kullanılır</h2>
<ol>
<li><b>Malzemeyi topla</b> (malzeme listesi). Her entegreyi referansıyla etiketle (U12 …): PCB'de serigrafide yazılı, breadboard'da çipin sırtına küçük bir etiket yapıştır.</li>
<li><b>Yerleşim haritası</b> çiplerin önerilen yerini gösterir. Her çipin <b>çentiği solda</b>, <b>1. pini sol altta</b>dır (haritada nokta ve kare ped). Haritanın kenarındaki harf + sayı (ör. <b>C4</b>) çipin bulunduğu 20 mm'lik hücredir; tablolarda "yer" sütunu bunu yazar.</li>
<li><b>Besleme önce</b>: her entegrenin VCC / GND bacağı ve dekuplaj kondansatörü, sonra sabit 0 / sabit 1 girişleri (Besleme bölümü). Sinyal tellerinden önce besleme ölçülür.</li>
<li><b>Blok blok kur</b> (Kurulum sırası). Tel listesi bloklara bölünmüştür: bir bloğun telleri o bloğun kendi bağlantıları ve önceki bloklara giden bağlantılarıdır. Bir blok bitince o ana kadar kurulan blokların bütün bağlantıları tamamdır; deney rehberindeki testi yap, sonra sonraki bloğa geç.</li>
<li><b>Tel listesi</b>: her satır iki bacak arasında tek bir teldir. Aynı netteki uçlar kısa bir zincir halinde dizilmiştir (A → B → C), böylece teller kısa kalır ve bir bacağa en çok üç tel gelir. Takıp ya da denetleyip kutuyu işaretle.</li>
<li><b>Çip kartları</b>: çip çip çalışmak için. Her pinin neti, rengi, telleri ve telin öbür ucu yazılıdır. Kart, çentik yukarıda (veri sayfasındaki gibi) çizilmiştir: kâğıdı 90° sola çevirince karttaki duruşla (çentik solda) aynı olur.</li>
</ol>
<h3>Gösterim</h3>
<table class="tablo"><tbody>
<tr><td style="width:36mm"><span class="ref">U12</span>-3</td><td>U12 entegresinin 3. bacağı. Pin adı yanında küçük yazılır (ör. <span class="mono">D0</span>, <span class="mono">~OE</span>).</td></tr>
<tr><td><span class="ref">R205</span>.2, <span class="ref">J201</span>.25</td><td>Pasif elemanın ya da konnektörün 2. / 25. ucu (deney rehberleriyle aynı yazım).</td></tr>
<tr><td><span class="id">T0042</span></td><td>Tel numarası, bu kart içinde. Belge yeniden üretilirse (şema değiştiyse) numaralar değişebilir: belgenin tarihine bak.</td></tr>
<tr><td><span class="net">~MRD</span>, <span class="net">N123</span></td><td>Net adı. "~" aktif düşük demektir (şemada üst çizgi). Adsız netler KiCad şemasındaki gibi N + sayı.</td></tr>
<tr><td>≈ mm</td><td>Önerilen yerleşimde iki bacak arası dik açılı yol. Kendi yerleşiminde farklıdır; teli kesmeden önce yerinde ölç, iki uca soyma payı ekle.</td></tr>
<tr><td>${kutu}</td><td>İşaret kutusu: takıldı (breadboard), sarıldı (wire-wrap) ya da bip testi geçti (PCB).</td></tr>
</tbody></table>
<p>${ornekMetin}</p>
<h3>Yönteme göre</h3>
<table class="tablo"><tbody>
<tr><td style="width:30mm"><b>Breadboard</b></td><td>Tel listesini sırayla tak, rengi renk koduna göre seç. Önerilen yerleşim breadboard dizilişiyle birebir değildir: çipleri aynı bloklar halinde, aynı sırayla (çentik solda) diz; tel uzunluğunu yerinde ölç.${kk.yol.startsWith("breadboard") ? ` <b>Bu kart deneyde (${p.deneyler.map((d) => `Deney ${d}`).join(", ")}) breadboard'da kurulur.</b>` : ""}</td></tr>
<tr><td><b>PCB</b></td><td>Kart KiCad şemasından (yanındaki şema PDF'i) çizilir; teller yerine bakır yollar vardır. Lehimden sonra, çipler takılmadan, tel listesini <b>bip testi</b> listesi olarak kullan: multimetre süreklilik kipinde, uçları "Nereden" ve "Nereye" soket pinlerine değdir, bip sesini duyunca kutuyu işaretle. Ayrıca her çipin VCC ve GND pinini Besleme tablosundan denetle.${kk.yol.endsWith("PCB") ? " <b>Tam bilgisayarda bu kart PCB olarak kurulur (çipler soketlerde).</b>" : ""}</td></tr>
<tr><td><b>Wire-wrap</b></td><td>Her satır bir sarımdır; zincir yapısı sayesinde bir pine en çok üç tel gelir. Renk kodunu koru, aynı netin tellerini aynı renkte sar.</td></tr>
</tbody></table>
<h3>Tel renk kodu</h3>
${renkTablosu()}
<p class="kucuk muted">Renk adları her tabloda kutucuğun yanında yazılıdır; belge siyah-beyaz basılsa da okunur. Saat hatları beyaz: kısa tut, mümkünse toprak teliyle yan yana götür.</p>
</section>`;
}

function yerlesimBolumu(p: KurulumPlani): string {
  const pad = 7;
  const b: Bolge = { x: -pad, y: -pad, w: p.olcu.w + pad + 2, h: p.olcu.h + pad + 2 };
  const { olcek, yatay } = sigdir(b, 225, 1.6);
  const lejant = p.bloklar
    .filter((x) => x.cipler.length || x.pasifler.length)
    .map((x) => `<span><span class="bk" style="background:${x.renk}"></span>${x.sira}. ${esc(x.ad)}${x.deney ? ` <span class="muted">(Deney ${x.deney})</span>` : ""}</span>`)
    .join("");
  return `<section class="bolum${yatay ? " yatay" : ""}" id="yerlesim">
<h2>Yerleşim haritası</h2>
<p class="kucuk">Önerilen yerleşim (3D görünümle aynı), üstten. Çentik solda, 1. pin sol altta (●). Ölçek ≈ 1 : ${mm(1 / olcek)}${olcek > 1 ? ` (${olcek.toFixed(1)} kat büyütülmüş)` : ""}; ızgara 20 mm. Blok blok ayrıntılı haritalar "Kurulum sırası" bölümündedir.</p>
<figure class="harita"><div>${haritaSvg(p, b, olcek, { ayrinti: false })}</div></figure>
<div class="lejant">${lejant}</div>
</section>`;
}

function blokSirasiBolumu(p: KurulumPlani): string {
  const satir = (x: BlokPlani) => {
    const yap = x.yapistirici.map((y) => `${y.ref} (${y.kapilar.join(", ")}. kapı)`).join(", ");
    const tel = x.telSayisi ? `${x.ilkTel}–${x.sonTel} <span class="muted">(${x.telSayisi})</span>` : "—";
    const deney = x.deney ? deneyBaglantisi(x.deney) : "—";
    return `<tr><td class="sag"><b>${x.sira}</b></td><td><span class="sw" style="background:${x.renk}"></span><b>${esc(x.ad)}</b></td><td>${deney}</td><td class="mono kucuk">${esc(x.cipler.join(" ")) || "—"}</td><td class="mono kucuk">${esc(yap) || "—"}</td><td class="mono kucuk">${esc(x.pasifler.join(" ")) || "—"}</td><td class="mono kucuk">${tel}</td></tr>`;
  };
  const haritalar = p.blokYerleri.map((bl) => {
    const bp = p.bloklar.find((x) => x.ad === bl.ad);
    const pad = 6;
    const b: Bolge = { x: Math.max(-4, bl.x - pad), y: Math.max(-4, bl.y - pad), w: bl.w + 2 * pad, h: bl.h + 2 * pad };
    const { olcek, yatay } = sigdir(b, 120, 2.4);
    const cipSay = p.cipler.filter((c) => c.blok === bl.ad).length;
    return `<figure class="harita${yatay ? " yatay" : ""}"><h3>${bp ? `${bp.sira}. ` : ""}${esc(bl.ad)}${bp?.deney ? ` <span class="muted kucuk">Deney ${bp.deney}</span>` : ""}</h3><div>${haritaSvg(p, b, olcek, { ayrinti: true, vurgu: bl.ad })}</div><figcaption>${cipSay} entegre${bp?.yapistirici.length ? `; bu blokta kapısı kullanılan yapıştırıcı çipleri: ${esc(bp.yapistirici.map((y) => y.ref).join(", "))}` : ""}. Kare ped = 1. pin.</figcaption></figure>`;
  });
  return `<section class="bolum" id="bloklar">
<h2>Kurulum sırası</h2>
<p>Bloklar kurulum sırasıyladır (deney sırası). Önce kartın beslemesi ve kenar konnektörü, sonra bloklar. Her bloğun telleri bir aralıktır; o aralık bitince bloğu test et.
Yapıştırıcı lojik çipleri (74HC00, 08, 32 … kapıları birden çok bloğa dağılmış) <b>kapısı kullanılan ilk blokla birlikte</b> takılır; kullanılmayan kapıların girişleri GND'ye bağlıdır (Besleme bölümü).</p>
<table class="tablo"><thead><tr><th class="sag" style="width:7mm">#</th><th style="width:38mm">Blok</th><th style="width:15mm">Deney</th><th>Takılacak çipler</th><th style="width:34mm">Yapıştırıcı kapıları</th><th style="width:28mm">Pasifler</th><th style="width:26mm">Teller</th></tr></thead>
<tbody>${p.bloklar.map(satir).join("")}</tbody></table>
<div class="not">Testler: her deney rehberinin "Test: beklenen sonuç" bölümü (<span class="mono">cpu16/kit/</span>). Bütün kartlar takılıp BIOS çalışınca <span class="mono">npm run cpu16 -- kart-testi</span> gerçek kartı simülatörle karşılaştırır (<span class="mono">cpu16/docs/uretim.md</span>).</div>
</section>
<section class="bolum" id="blokharitalari">
<h2>Blok haritaları</h2>
<p class="kucuk">Her blok, çevresi soluk olarak; ref + değer, ● ve kare ped = 1. pin, çentik solda. Yapıştırıcı çipleri kendi bloklarında ("Yapıştırıcı lojik") durur.</p>
${haritalar.join("\n")}
</section>`;
}

function beslemeBolumu(p: KurulumPlani): string {
  const pinler = (l: { pin: number; ad: string }[]) => l.map((x) => `${x.pin} <span class="pa">${esc(x.ad)}</span>`).join(", ");
  const rows = p.guc.map((g) => {
    const c = p.cipler.find((x) => x.ref === g.ref)!;
    return `<tr><td>${kutu}</td><td class="ref">${esc(g.ref)}</td><td>${esc(g.deger)}</td><td>${esc(c.hucre)}</td><td class="orta">${renkEtiketi("vcc", false)}<b>${g.vcc.join(", ")}</b></td><td class="orta">${renkEtiketi("gnd", false)}<b>${g.gnd.join(", ")}</b></td><td class="mono kucuk">${esc(g.dekuplaj.join(" ")) || "—"}</td><td class="kucuk">${pinler(g.sabit1) || "—"}</td><td class="kucuk">${pinler(g.sabit0) || "—"}</td></tr>`;
  });
  const dekuplaj = new Set(p.pasifler.filter((x) => x.cip).map((x) => x.ref));
  const pas = p.pasifGuc.filter((x) => !dekuplaj.has(x.ref)).map((x) => `<tr><td>${kutu}</td><td class="ref">${esc(x.ref)}</td><td>${esc(x.part)}</td><td>${esc(x.gorev)}</td><td class="kucuk">${x.vcc.join(", ") || "—"}</td><td class="kucuk">${x.gnd.join(", ") || "—"}</td></tr>`);
  const giris = p.pasifler.find((x) => x.part === "C_100U");
  return `<section class="bolum" id="besleme">
<h2>Besleme ve dekuplaj</h2>
<p>Kartta ${sayi(p.beslemePinleri)} besleme ucu var (çiplerin VCC / GND bacakları, sabit girişler ve pasiflerin besleme uçları). Bunlar tel listesinde yoktur: breadboard'da besleme rayına kısa kırmızı / siyah tellerle, PCB'de VCC ve GND yollarıyla (düzlemleriyle) bağlanır.</p>
<ul>
<li><b>Besleme girişi:</b> ${giris ? `<span class="ref">${esc(giris.ref)}</span> (100 µF, + ucu VCC'ye; elektrolitikte bacak yönü önemlidir)` : "—"}${p.kenar ? `; kenar konnektörü <span class="ref">${esc(p.kenar.ref)}</span>: VCC pinleri ${p.kenar.pinler.filter((x) => x.sinif === "vcc").map((x) => x.pin).join(", ")}, GND pinleri ${p.kenar.pinler.filter((x) => x.sinif === "gnd").map((x) => x.pin).join(", ")}` : ""}.</li>
<li><b>Dekuplaj:</b> her entegrenin yanında bir 100 nF; VCC ve GND bacaklarına olabildiğince yakın (breadboard'da çipin hemen yanında raydan raya, PCB'de soketin dibinde).</li>
<li><b>Sabit girişler:</b> CMOS girişi asla boşta kalmaz. "Sabit 1" sütunundaki bacaklar VCC'ye, "Sabit 0" sütunundakiler GND'ye bağlanır (yapıştırıcı çiplerin kullanılmayan kapıları dahil).</li>
<li><b>Ölç:</b> çipler takılmadan önce her soketin VCC – GND arası ≈ 5 V; VCC ile GND arasında kısa devre yok (direnç ölçümünde birkaç yüz ohm'un altına düşmemeli; kondansatörler dolarken değer yükselir).</li>
</ul>
<table class="tablo"><thead><tr><th style="width:5mm"></th><th style="width:13mm">Çip</th><th style="width:18mm">Değer</th><th style="width:9mm">Yer</th><th class="orta" style="width:14mm">VCC</th><th class="orta" style="width:14mm">GND</th><th style="width:15mm">Dekuplaj</th><th>Sabit 1 (VCC'ye)</th><th>Sabit 0 (GND'ye)</th></tr></thead><tbody>${rows.join("")}</tbody></table>
${pas.length ? `<h3>Pasif elemanların besleme uçları</h3><p class="kucuk muted">Dekuplaj kondansatörleri (${dekuplaj.size} × 100 nF: 1. uç VCC, 2. uç GND) yukarıdaki tabloda çipleriyle birlikte.</p><table class="tablo"><thead><tr><th style="width:5mm"></th><th style="width:16mm">Ref</th><th style="width:30mm">Parça</th><th>Görev</th><th style="width:28mm">VCC'ye giden uç</th><th style="width:28mm">GND'ye giden uç</th></tr></thead><tbody>${pas.join("")}</tbody></table>` : ""}
</section>`;
}

const ucHucre = (u: { ref: string; pin: number; ad: string; pasif: boolean }) =>
  `<span class="ref">${esc(u.ref)}</span>${u.pasif ? "." : "-"}${u.pin}${u.ad !== String(u.pin) ? ` <span class="pa">${esc(u.ad)}</span>` : ""}`;

function telBolumu(p: KurulumPlani): string {
  const parcalar: string[] = [];
  for (const b of p.bloklar) {
    const t = p.teller.filter((x) => x.blok === b.ad);
    if (!t.length) continue;
    const rows = t.map((x) => `<tr><td>${kutu}</td><td class="id">${x.id}</td><td>${renkEtiketi(x.sinif)}</td><td class="ucn">${ucHucre(x.from)}</td><td class="ucn">${ucHucre(x.to)}</td><td class="net">${esc(x.net)}</td><td class="sag">${x.uzunluk}</td></tr>`).join("");
    const yap = b.yapistirici.length ? ` · yapıştırıcı: ${esc(b.yapistirici.map((y) => y.ref).join(", "))}` : "";
    parcalar.push(`<h3>${b.sira}. ${esc(b.ad)} <span class="muted kucuk">${b.deney ? `Deney ${b.deney} · ` : ""}${t.length} tel, ${t[0].id}–${t[t.length - 1].id}${yap}</span></h3>
<table class="tablo teller"><thead><tr><th style="width:5mm"></th><th style="width:13mm">Tel</th><th style="width:22mm">Renk</th><th>Nereden</th><th>Nereye</th><th style="width:30mm">Net</th><th class="sag" style="width:11mm">≈ mm</th></tr></thead><tbody>${rows}</tbody></table>`);
  }
  const toplam = p.teller.reduce((s, x) => s + x.uzunluk, 0);
  return `<section class="bolum" id="teller">
<h2>Tel listesi</h2>
<p>${sayi(p.teller.length)} tel, önerilen yerleşimde toplam ≈ ${sayi(Math.round(toplam / 1000))} m. Bloklar kurulum sırasıyla; blok içinde renk (sınıf) ve net sırasıyla. Aynı netin telleri art arda gelir ve bir zincir oluşturur.</p>
${parcalar.join("\n")}
</section>`;
}

function pinBilgi(r: PinSatiri): string {
  if (r.net === null) return `<span class="gri">— ${esc(r.not ?? "")}</span>`;
  if (r.sinif === "vcc" || r.sinif === "gnd") return `${renkEtiketi(r.sinif, false)}<b class="net">${esc(r.net)}</b> <span class="pa">${esc(r.not ?? "")}</span>`;
  if (!r.teller.length && r.netUclari <= 1) {
    // kartta başka ucu yok: kendiliğinden adlanan netlerin (U201.6Y) adı gösterilmez
    const ad = /^[A-Z]+\d+\./.test(r.net) ? "" : `${esc(r.net)} · `;
    return `<span class="gri">${ad}${esc(r.not ?? "")}${r.kenar ? ` · arka panel ${r.kenar}` : ""}</span>`;
  }
  const s = r.sinif as UcSinifi;
  const kenar = r.kenar ? ` <span class="pa">· arka panel ${r.kenar}</span>` : "";
  const bas = `${renkEtiketi(s, false)}<b class="net">${esc(r.net)}</b> <span class="rk">${esc(renkKodu(s).renk)}</span>${kenar}`;
  if (!r.teller.length) return `${bas} <span class="gri">${esc(r.not ?? "")}</span>`;
  const teller = r.teller.map((t) => `<span class="tel"><b>${t.id}</b>→${esc(t.karsi)}</span>`).join(" ");
  const ek = r.netUclari > r.teller.length + 1 ? ` <span class="pa">(nette ${r.netUclari} uç)</span>` : "";
  return `${bas}${ek}<br>${teller}`;
}

/** Bir çip kartı (DIP pin düzeni + her pinin neti ve telleri); el kitabındaki örnek de bunu kullanır */
export function cipKarti(c: CipKarti, gorunen: string): string {
  const n = c.pinSayisi;
  const half = n / 2;
  const pin = (num: number) => c.pinler.find((x) => x.pin === num)!;
  const rows: string[] = [];
  for (let i = 1; i <= half; i++) {
    const l = pin(i);
    const r = pin(n + 1 - i);
    rows.push(`<tr><td class="bilgi bilgi-sol">${pinBilgi(l)}</td><td class="no">${l.pin}</td><td class="govde"><div class="adlar"><span>${i === 1 ? '<span class="p1"></span>' : ""}${esc(l.ad)}</span><span>${esc(r.ad)}</span></div></td><td class="no">${r.pin}</td><td class="bilgi">${pinBilgi(r)}</td></tr>`);
  }
  const vcc = c.pinler.filter((x) => x.yon === "power" && x.net === "VCC").map((x) => x.pin).join(", ");
  const gnd = c.pinler.filter((x) => x.yon === "power" && x.net === "GND").map((x) => x.pin).join(", ");
  const kapilar = c.kapilar
    ? `<div class="kapi"><b>Kapılar:</b> ${c.kapilar.map((k) => `${k.no}. → ${esc(k.blok)}${k.gorev ? ` (${esc(k.gorev)})` : ""}`).join("; ")}. Kullanılmayan kapıların girişleri GND'de.</div>`
    : "";
  return `<article class="cip">
<div class="cip-bas">${kutu}<span class="ref">${esc(c.ref)}</span><span class="deger">${esc(c.deger)}</span><span class="baslik">${esc(c.baslik)} · ${esc(c.kilif)}${c.genis ? " geniş" : ""}</span></div>
<div class="cip-alt">Blok <b>${esc(gorunen)}</b> · ${esc(c.gorev || "—")} · yer <b>${esc(c.hucre)}</b> · VCC <b>${vcc}</b>, GND <b>${gnd}</b> · dekuplaj <b>${esc(c.dekuplaj.join(", ") || "—")}</b></div>
<table class="dip${c.genis ? " genis" : ""}"><tbody>${rows.join("")}</tbody></table>
${kapilar}
</article>`;
}

function cipBolumu(p: KurulumPlani): string {
  const sira = new Map(p.bloklar.map((b) => [b.ad, b.sira]));
  // yapıştırıcı çipi kapısının kullanıldığı ilk blokta gösterilir
  const yer = new Map<string, string>();
  for (const c of p.cipKartlari) {
    if (!c.kapilar?.length) {
      yer.set(c.ref, c.blok);
      continue;
    }
    yer.set(c.ref, [...c.kapilar].sort((a, b) => sira.get(a.blok)! - sira.get(b.blok)!)[0].blok);
  }
  const parcalar: string[] = [];
  for (const b of p.bloklar) {
    const list = p.cipKartlari.filter((c) => yer.get(c.ref) === b.ad);
    if (!list.length) continue;
    const kendi = list.filter((c) => !c.kapilar);
    const yap = list.filter((c) => c.kapilar);
    parcalar.push(`<h3>${b.sira}. ${esc(b.ad)} <span class="muted kucuk">${b.deney ? `Deney ${b.deney} · ` : ""}${kendi.length} çip${yap.length ? ` + ${yap.length} yapıştırıcı çipi` : ""}</span></h3>`);
    for (const c of [...kendi, ...yap]) parcalar.push(cipKarti(c, c.blok));
  }
  return `<section class="bolum" id="cipler">
<h2>Çip kartları</h2>
<p>Her çip, veri sayfasındaki gibi <b>çentik yukarıda</b> çizilmiştir (● = 1. pin). Kartta çentik soldadır: kâğıdı 90° sola çevir. Pin kutusunun yanında: net, tel rengi, arka panel pini ve bu pine gelen teller (<span class="mono">T0042→U40-7</span> = T0042 teli U40'ın 7. bacağına gider). Uzun netlerde pine yalnızca zincirdeki komşuları bağlanır; netin öbür uçları başka tellerle gelir.</p>
${parcalar.join("\n")}
</section>`;
}

function pasifBolumu(p: KurulumPlani): string {
  const dekuplaj = new Set(p.pasifler.filter((x) => x.cip).map((x) => x.ref));
  const dek = p.pasifler.filter((x) => x.cip).map((x) => `<span class="ref">${esc(x.ref)}</span>→${esc(x.cip!)}`).join(", ");
  const rows = p.pasifKartlari
    .filter((x) => x.part !== "BACKPLANE_2x32" && !dekuplaj.has(x.ref))
    .map((x) => {
      const pins = x.pinler.map((r) => `<div>${r.pin}${r.ad !== String(r.pin) ? ` <span class="pa">${esc(r.ad)}</span>` : ""}: ${pinBilgi(r)}</div>`).join("");
      return `<tr><td>${kutu}</td><td class="ref">${esc(x.ref)}</td><td>${esc(x.part)}<div class="pa">${esc(x.baslik)}</div></td><td class="kucuk">${esc(x.gorev)}<div class="pa">${esc(x.blok)} · yer ${esc(x.hucre)}</div></td><td class="kucuk bilgi">${pins}</td></tr>`;
    });
  return `<section class="bolum" id="pasifler">
<h2>Pasif elemanlar</h2>
<p>Dirençler, kondansatörler, LED'ler, butonlar, konnektörler. Kutuplu elemanlar: elektrolitik kondansatörde + ucu (1) VCC / sinyal tarafına, LED'de A (anot, uzun bacak) dirence, K (katot, düz kenar) GND'ye. Direnç dizisinde (SIP) 1. pin (nokta) ortak uçtur.${p.pasifler.some((x) => x.part === "RN_470_ISO_8") ? " Yalıtılmış direnç dizisinde (DIP-16) ortak uç yoktur: her direnç karşılıklı iki bacak arasındadır (1–16, 2–15 … 8–9), 1. pin çentiğin solunda." : ""}${p.pasifler.some((x) => x.part === "DISP_7SEG_CC") ? " 7 segment göstergede nokta (DP, 5. pin) kullanılmaz; iki ortak katot pini (3 ve 8) GND'ye; ondalık nokta altta, 1. pin sol altta." : ""}</p>
${rows.length ? `<table class="tablo"><thead><tr><th style="width:5mm"></th><th style="width:14mm">Ref</th><th style="width:36mm">Parça</th><th style="width:42mm">Görev</th><th>Uçlar: net ve teller</th></tr></thead><tbody>${rows.join("")}</tbody></table>` : ""}
${dek ? `<h3>Dekuplaj kondansatörleri (100 nF, 1. uç VCC, 2. uç GND)</h3><p class="kucuk">${dek}</p>` : ""}
<p class="kucuk muted">Kenar konnektörü: "Kenar konnektörü" bölümü.</p>
</section>`;
}

function kenarBolumu(p: KurulumPlani): string {
  if (!p.kenar) {
    const not = p.kart === "prog" ? " (Arduino Nano USB'den beslenir ve bilgisayarla USB seri üzerinden konuşur)"
      : p.pasifler.some((x) => x.part === "CONN_5V") ? " (5 V, 2 pinli besleme girişinden beslenir; 1. pin +5 V, 2. pin GND)" : "";
    return `<section class="bolum" id="kenar"><h2>Kenar konnektörü</h2><p>Bu kartın arka panel konnektörü yok: tek başına çalışan bir alettir${not}.</p></section>`;
  }
  const k = p.kenar;
  const hucre = (num: number) => {
    const x = k.pinler.find((q) => q.pin === num)!;
    const sinyal = x.sinyal
      ? `${x.sinif !== "bos" ? renkEtiketi(x.sinif as UcSinifi, false) : ""}<b class="net">${esc(x.sinyal)}</b>`
      : '<span class="gri">boş</span>';
    const yon = (!x.bagli && x.sinyal) || x.yon === "kullanılmaz" ? '<span class="gri">kartta kullanılmaz</span>' : x.yon === "boş" ? '<span class="gri">—</span>' : esc(x.yon);
    const teller = x.teller.map((t) => `<span class="tel"><b>${t.id}</b>→${esc(t.karsi)}</span>`).join(" ");
    return `<td class="pin">${num}</td><td>${sinyal}</td><td class="kucuk">${yon}</td><td class="bilgi kucuk">${teller}</td>`;
  };
  const rows: string[] = [];
  for (let i = 0; i < 32; i++) rows.push(`<tr>${hucre(2 * i + 1)}${hucre(2 * i + 2)}</tr>`);
  const kullanilan = k.pinler.filter((x) => x.yon !== "kullanılmaz" && x.yon !== "boş" && x.bagli).length;
  return `<section class="bolum" id="kenar">
<h2>Kenar konnektörü (arka panel)</h2>
<p><span class="ref">${esc(k.ref)}</span>: 2 × 32 pin başlık, 2,54 mm. Pin düzeni bütün kartlarda aynıdır (<span class="mono">cpu16/docs/kartlar.md</span>, "Arka panel"). Bu kartta ${kullanilan} pin kullanılır; kalanlar arka panelden geçer, kartta bir yere bağlanmaz.
Önerilen yerleşimde tek numaralı pinler kart kenarına yakın sıradadır, 1. pin solda. "Yön" bu kartın açısındandır: <b>çıkış</b> = bu kart sürer, <b>giriş</b> = bu kart okur.</p>
<table class="tablo kenar"><thead><tr><th>Pin</th><th>Sinyal</th><th>Yön</th><th>Teller</th><th>Pin</th><th>Sinyal</th><th>Yön</th><th>Teller</th></tr></thead><tbody>${rows.join("")}</tbody></table>
</section>`;
}

function semaBolumu(p: KurulumPlani, kk: KurulumKarti, o: BelgeSecenekleri): string {
  const cokSayfa = kk.kaynak === "hesap";
  return `<section class="bolum" id="sema">
<h2>Şema</h2>
<p>KiCad şeması: <span class="mono">cpu16/kicad/${esc(p.kart)}/${esc(p.kart)}.kicad_sch</span>${cokSayfa ? " (çok sayfalı: kök sayfada her blok bir kutu, blokların çipleri kendi sayfalarında; sayfalar arası bağlantılar global etiketlerle)" : ""}${o.semaDosyasi ? `; PDF hali bu belgenin yanında: <b class="mono">${esc(o.semaDosyasi)}</b>` : ""}. Şemada bağlantılar tel yerine net etiketleriyle yapılmıştır: aynı adlı etiketler aynı nettir; adlar bu belgedeki net adlarıyla aynıdır.</p>
<p>Bir bağlantıdan şüphelenirsen: net adını şema PDF'inde ara (Ctrl+F), aynı netin bütün uçlarını gör; tel listesinde aynı net adının tellerini işaretle. ${cokSayfa ? "Simülatörde de aynı devre çalışır (Silikon3D → 8 bit hesap makinesi): anahtarları çevir, bir çipe tıklayıp pinlerinin netlerini ve değerlerini gör." : `Simülatörde de aynı ad seçilebilir (Silikon3D → "CPU16 kartı 3D", <span class="mono">kart.secNet("…")</span>).`}</p>
</section>`;
}

/** Kartın kurulum belgesi (tam HTML) */
export function kartBelgesi(p: KurulumPlani, kk: KurulumKarti, o: BelgeSecenekleri): string {
  const govde = [
    kapak(p, kk, o), malzemeBolumu(p), kullanimBolumu(p, kk), yerlesimBolumu(p), blokSirasiBolumu(p), beslemeBolumu(p),
    telBolumu(p), cipBolumu(p), pasifBolumu(p), kenarBolumu(p), semaBolumu(p, kk, o),
  ].join("\n");
  return htmlBelge(`${p.baslik} kurulumu`, govde, `${kk.urun ? "" : "CPU16 "}${p.baslik}: yerleşim, besleme, numaralı tel listesi ve çip kartları`);
}
