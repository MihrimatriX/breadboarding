// CPU16'nın breadboard kurulum belgeleri (yazdırılabilir HTML; PDF'e Chromium ile basılır). Kart
// başına bir belge: kapak, nasıl okunur (delik adları, raylar, renk kodu, kesim boyu, uyarlayıcı),
// panonun haritası (bölge çerçeveleri), bölümler (her bölgenin ve çip grubunun görevi; metinler
// cpu16/board/bolum-bilgi.ts) ve makinedeki yeri, besleme, aşamalar ve testler, board board yerleşim
// çizimleri (üstlerinde çip grupları), aşama aşama numaralı tel listesi (işaret kutulu, delikten
// deliğe; her aşamanın sonunda test), renk ve boya göre kesim listesi, malzeme listesi. Bir de dizin:
// bütün makine, şerit kablo (soketlerin kablodaki yeri, damar → sinyal), besleme, kartların belgeleri.
// npm run cpu16 -- breadboard-belge [kart|hepsi] -o <dizin>

import type { Board } from "../board/board.ts";
import { BOLUM_STIL, boardGruplari, bolumlerHtml, grupEtiketleri, HARITA, haritaBolgeleri, haritaBoyu, haritaX, haritaY, katalogu } from "../board/breadboard/bolum-belge.ts";
import { boardaDegiyor, boardCizimi, type CizimSecenekleri } from "../board/breadboard/cizim.ts";
import { ADIM, BOSLUK } from "../board/breadboard/geometri.ts";
import { plakaBoyu } from "../board/breadboard/gorunum.ts";
import { DAGILIM_SINIRLARI, noktaBoardu, ucEtiketi, type BbOlcu, type BbTel } from "../board/breadboard/plan.ts";
import type { BbParca } from "../board/breadboard/yerlesim.ts";
import { BACKPLANE, ledRengi, PASSIVES } from "../board/passives.ts";
import { esc, htmlBelge, kutu } from "../kurulum/stil.ts";
import { beslemeButcesi, KOPRU_OHM, type BeslemeButcesi } from "./besleme.ts";
import { KART_SIRASI, MAKINE_SIRALARI } from "./panolar.ts";
import { EN_UZUN_TEL, KORIDOR, kartOlcu, PANO_ARASI, type KartBbPlani, type MakineBbPlani } from "./plan.ts";
import { CPU_BB_RENKLERI, cpuRenkTanimi } from "./renk.ts";
import { mimariBolumu } from "../mimari/belge.ts";

const sayi = (n: number, k = 0) => n.toLocaleString("tr-TR", { minimumFractionDigits: k, maximumFractionDigits: k });
const telNo = (t: BbTel) => `T${String(t.no).padStart(4, "0")}`;
const renkHex = (t: Pick<BbTel, "renk">) => cpuRenkTanimi(t.renk).hex;
const renkKutusu = (t: Pick<BbTel, "renk">, ad = true) => {
  const r = cpuRenkTanimi(t.renk);
  return `<span class="sw" style="background:${r.hex}"></span>${ad ? `<span class="rk">${esc(r.ad)}</span>` : ""}`;
};

/** Aşamaların renkleri (haritada) */
const ASAMA_RENGI = ["#f6e7b4", "#d8ecd0", "#d3e3f3", "#f3d9d3", "#e6dcf2", "#d4efec", "#f1e0c8"];

/** LED'ler kendi renklerinde (cpu16/board/passives.ts ledRengi) */
const LED_HEX: Record<string, string> = { kirmizi: "#e0352b", yesil: "#3fb34f", sari: "#e8c21a", mavi: "#2f6fd6", beyaz: "#f2f2f2" };
const CIZIM: CizimSecenekleri = {
  sipYazisi: (p) => `${p.ref} ${p.part === "RN_10K_8" ? "10 kΩ × 8" : p.part}`,
  ledRengi: (p) => LED_HEX[ledRengi(p.rol)] ?? "#e0352b",
};

/** Kartın parmak izi gibi kısa adı: "CPU kartı (cpu)" */
const kartAdi = (p: KartBbPlani) => `${p.tanim.baslik} (${p.kart})`;

/** Telin uçları başka bir telin yolunun üstünde mi: önce takılan telin ucunun üstünden geçen teller (sıra şart) */
export function sirasiOnemliTeller(p: Pick<KartBbPlani, "teller">): Map<number, number[]> {
  const uc = new Map<string, number>();
  for (const t of p.teller) {
    const n = t.yol.length;
    uc.set(`${t.yol[0]},${t.yol[1]}`, t.no);
    uc.set(`${t.yol[n - 2]},${t.yol[n - 1]}`, t.no);
  }
  const out = new Map<number, number[]>();
  for (const t of p.teller) {
    const alt = new Set<number>();
    const n = t.yol.length / 2;
    for (let j = 1; j < n; j++) {
      let X = t.yol[2 * j - 2], Y = t.yol[2 * j - 1];
      const x1 = t.yol[2 * j], y1 = t.yol[2 * j + 1];
      const dx = Math.sign(x1 - X), dy = Math.sign(y1 - Y);
      while (X !== x1 || Y !== y1) {
        X += dx; Y += dy;
        if (j === n - 1 && X === x1 && Y === y1) break;
        const u = uc.get(`${X},${Y}`);
        if (u !== undefined && u !== t.no) alt.add(u);
      }
    }
    if (alt.size) out.set(t.no, [...alt].sort((a, b) => a - b));
  }
  return out;
}

// ---------------------------------------------------------------- makine haritası (SVG)

/** Bütün makine üstten: panolar, koridor, şerit kablo, soketler; `vurgu` panosu koyu */
function makineHaritasi(m: MakineBbPlani, vurgu?: string, genislik = 186): string {
  const s: string[] = [];
  /** yazının yaklaşık genişliği (DejaVu Sans, ortalama harf ≈ 0,58 em) */
  const sigdir = (metin: string, boy: number, en: number) => Math.min(boy, en / (0.58 * metin.length));
  for (const y of m.yerler) {
    const p = m.kartlar.find((x) => x.kart === y.kart)!;
    const v = y.kart === vurgu;
    s.push(`<rect x="${y.x}" y="${y.y}" width="${y.w}" height="${y.h}" rx="6" fill="${v ? "#c9d8ea" : "#ecebe6"}" stroke="${v ? "#1f4e79" : "#888"}" stroke-width="${v ? 4 : 2}"/>`);
    // ön sıranın uyarlayıcısı arka kenarda (haritada üstte): adı alt kenara yazılır
    const en = y.w - 28;
    const ad = 0.58 * 34 * p.tanim.baslik.length <= en ? p.tanim.baslik : p.tanim.kisa;
    const satirlar = [`${p.yerlesim.nx} × ${p.yerlesim.ny} board`, `${Math.round(y.w)} × ${Math.round(y.h)} mm`];
    const alt = satirlar.join(" · ");
    const tek = sigdir(alt, 26, en) >= 20;
    const boy = tek ? sigdir(alt, 26, en) : sigdir(satirlar[0].length > satirlar[1].length ? satirlar[0] : satirlar[1], 26, en);
    const yazi = tek ? [alt] : satirlar;
    const y0 = p.tanim.sira === "on" ? y.y + y.h - 22 - (yazi.length * boy * 1.25) - 40 : y.y + 14;
    s.push(`<text x="${y.x + 14}" y="${y0 + 34}" font-size="${sigdir(ad, 34, en).toFixed(1)}" font-weight="700" fill="#222">${esc(ad)}</text>`);
    yazi.forEach((t, i) => s.push(`<text x="${y.x + 14}" y="${(y0 + 34 + 12 + (i + 1) * boy * 1.25).toFixed(1)}" font-size="${boy.toFixed(1)}" fill="#444">${esc(t)}</text>`));
  }
  const ser = m.serit;
  const xs = ser.soketler.map((q) => q.x).sort((a, b) => a - b);
  const x0 = xs[0] - 41, x1 = xs[xs.length - 1] + 41;
  s.push(`<rect x="${x0}" y="${ser.koridorY - 41}" width="${x1 - x0}" height="82" fill="#b9bdc4" stroke="#777" stroke-width="2"/>`);
  for (const q of ser.soketler) {
    s.push(`<rect x="${q.x - 41}" y="${Math.min(q.y, ser.koridorY)}" width="82" height="${Math.abs(q.y - ser.koridorY)}" fill="#b9bdc4" stroke="#777" stroke-width="2"/>`);
    s.push(`<rect x="${q.x - 44}" y="${q.y - 8}" width="88" height="16" fill="#222"/>`);
    s.push(`<text x="${q.x + 50}" y="${q.y + (q.y < ser.koridorY ? -14 : 30)}" font-size="22" fill="#222">${esc(q.ref)}</text>`);
  }
  // kablonun adı soketler arasındaki en geniş boşluğa
  let bosluk = { a: x0, b: x0 };
  for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] - 82 > bosluk.b - bosluk.a) bosluk = { a: xs[i - 1] + 41, b: xs[i] - 41 };
  const kablo = `64 damarlı şerit kablo · ≈ ${sayi(ser.boyMm / 1000, 2)} m`;
  s.push(`<text x="${(bosluk.a + bosluk.b) / 2}" y="${ser.koridorY + 9}" font-size="${sigdir(kablo, 24, bosluk.b - bosluk.a - 16).toFixed(1)}" text-anchor="middle" fill="#333">${esc(kablo)}</text>`);
  s.push(`<text x="${m.w / 2}" y="${m.h + 46}" font-size="26" text-anchor="middle" fill="#555">ön kenar (sana yakın): butonlar, VGA, PS/2, USB-seri</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 ${m.w + 90} ${m.h + 70}" width="${genislik}mm" font-family="DejaVu Sans, Arial, sans-serif">${s.join("")}</svg>`;
}

// ---------------------------------------------------------------- kart belgesinin bölümleri

function kapak(p: KartBbPlani, o: BbOlcu, b: BeslemeButcesi, tarih?: string): string {
  const y = p.yerlesim;
  const plaka = plakaBoyu(p);
  const cip = y.parcalar.filter((q) => q.cipMi).length;
  const pasif = y.parcalar.length - cip;
  const asan = p.teller.filter((t) => t.uzunluk > EN_UZUN_TEL).length;
  const olgu = (x: string, s: string) => `<div class="olgu"><b>${x}</b><span>${s}</span></div>`;
  return `<section class="kapak">
<div class="ust">Silikon3D · CPU16 · breadboard kurulumu</div>
<h1>${esc(p.tanim.baslik)}<br>breadboard'da</h1>
<p class="alt">${y.nx} × ${y.ny} = ${o.board} tam boy breadboard (BB830) tek bir taban plakasında; ${cip} entegre, ${pasif} pasif eleman ve modül. Her netin bacakları 5 delikli şeritlerde, şeritler arası ${sayi(o.tel)} atlama teliyle. Öbür kartlara giden her sinyal panonun <b>şerit kablo uyarlayıcısından</b> (PCB'deki 2 × 32 kenar konnektörünün yerinde) 64 damarlı şerit kabloyla gider: bütün makine için dizin belgesine bak. Teller düz yatar, yalnız yatay ve dikey gider, hiçbir çipin üstünden geçmez; her tel delikten deliğe, boyu ve rengiyle yazılıdır.</p>
<div class="olgular">
${olgu(String(o.board), `breadboard (${y.nx} × ${y.ny})`)}
${olgu(String(cip), "entegre (74HC, bellekler)")}
${olgu(sayi(o.tel), `atlama teli (${o.rayIc + o.rayArasi} ray köprüsü)`)}
${olgu(`${sayi(o.kesimM, 0)} m`, "tel (kesim boyu, uçlar dahil)")}
${olgu(String(p.asamalar.length), "aşama, her birinin sonunda test")}
${olgu(`${sayi(o.ortalamaMm)} mm`, `ortalama tel (en uzun ${sayi(o.enUzunMm)} mm; ${asan} tel ${EN_UZUN_TEL} mm'den uzun)`)}
${olgu(`≈ ${sayi(b.toplamMa)} mA`, `5 V, ${b.giris} besleme girişi`)}
${olgu(`≈ ${sayi(Math.ceil(plaka.w / 10) * 10)} × ${sayi(Math.ceil(plaka.h / 10) * 10)} mm`, "taban plakası")}
</div>
<h3>İçindekiler</h3>
<ol class="icindekiler">
<li>Nasıl okunur: delik adları, raylar, renk kodu, kesim boyu, uyarlayıcı</li>
<li>Panonun haritası, bölümleri (her bölgenin ve çip grubunun görevi) ve makinedeki yeri</li>
<li>Besleme</li>
<li>Aşamalar ve testler</li>
<li>Board board yerleşim (${o.board} çizim)</li>
<li>Tel listesi (T0001–T${String(o.tel).padStart(4, "0")}), aşama aşama</li>
<li>Kesim listesi (renk ve boy)</li>
<li>Malzeme listesi</li>
</ol>
<p class="dipnot">Üretildi${tarih ? ` ${esc(tarih)}` : ""}: <code>npm run cpu16 -- breadboard-belge ${esc(p.kart)}</code> (kaynak <code>cpu16/breadboard/</code>; yerleşim ve teller <code>veri/${esc(p.kart)}.ts</code>). Bağlantı yalnız bu fiziksel modelden (board'lar, bacakların delikleri, teller, şerit kablo) birleşim-bul ile yeniden kurulur ve netlistle karşılaştırılır, her aşamanın sonunda da: <code>npm run cpu16 -- breadboard</code>. Uygulamada aynı numaralarla: Silikon3D → CPU16 kartı 3D → Görünüm: Breadboard → Kurulum → Pano: ${esc(p.tanim.baslik)}. PCB'de bu kartın pinden pine tel listesi ayrı belgededir (<code>npm run cpu16 -- kurulum ${esc(p.kart)}</code>).</p>
</section>`;
}

function nasilOkunur(p: KartBbPlani, o: BbOlcu, sirali: Map<number, number[]>): string {
  const y = p.yerlesim;
  const t = p.tanim;
  const renkSatiri = CPU_BB_RENKLERI.map((r) => {
    const x = o.renkler.find((q) => q.renk === r.renk);
    return `<tr><td><span class="sw" style="background:${r.hex}"></span><b>${esc(r.ad)}</b></td><td>${esc(r.grup)}</td><td>${esc(r.aciklama)}</td><td class="sag">${x ? sayi(x.sayi) : "—"}</td></tr>`;
  }).join("");
  const koridor = t.sira === "arka" ? "ön kenarında (sana yakın)" : "arka kenarında";
  const ub = y.boards.find((b) => b.bx === t.uyarlayici.bx && b.by === t.uyarlayici.by)!;
  const genis = y.parcalar.filter((q) => q.tur === "genis");
  const asan = p.teller.filter((x) => x.uzunluk > EN_UZUN_TEL);
  return `<section class="bolum">
<h2>1. Nasıl okunur</h2>
<h3>Board'lar ve delikler</h3>
<p>Taban plakasında ${y.nx} sütun × ${y.ny} sıra board var: <b>BB01</b> sol arka köşe, satır satır soldan sağa, <b>BB${String(y.boards.length).padStart(2, "0")}</b> sağ ön köşe. Panonun şerit kablo uyarlayıcısı ${koridor}, ${ub.ad}'de: panolar makinede iki sıra halinde ortadaki koridora bakar, şerit kablo koridorda uzanır (2. bölüm). Her board'un adı sol üst köşesine yazılır.</p>
<p>Bir delik <b>board + satır harfi + sütun</b> ile yazılır: <code>BB07 c14</code> = BB07'nin c satırı, 14. sütunu. Her sütunun <b>a–e</b>'si bir şerittir (5 delik, içeriden bağlı), <b>f–j</b>'si ayrı bir şerit; ortadaki kanal (e ile f arası, 7,62 mm) iki yarıyı ayırır. Çipler kanalın üstüne oturur.</p>
<p>Raylar: üstte <code>üst+</code> (dış, kırmızı çizgi) ve <code>üst−</code> (iç, mavi çizgi), altta <code>alt−</code> (iç) ve <code>alt+</code> (dış). Ray delikleri 5'li gruplardır: <code>BB07 üst+16</code>. Her board'un üst ve alt + rayları, üst ve alt − rayları board'un sağ ucundan ray köprüsüyle bağlıdır; board'lar arası köprüler sıradan sıraya (arka-ön, sol uçta) ve en arka ile en ön sırada yan yana.</p>
<div class="uyari"><b>Varsayım: raylar boydan boya kesintisiz</b> (BB830 türü). Bazı tam boy breadboard'larda her ray ortadan bölüktür: öyleyse her rayın iki yarısını ayrıca kısa bir telle köprüle (board başına 4 ek tel, ${y.boards.length * 4} tel) ya da ray boyunca 5 V'u ölçerek doğrula.</div>
<h3>Teller</h3>
<ul>
<li><b>Numara</b>: T0001 … T${String(o.tel).padStart(4, "0")}, kurulum sırası. Aşama aşama; aşamanın içinde önce ray köprüleri, sonra besleme (kırmızı / siyah), sonra sinyaller, board board soldan sağa.</li>
<li><b>Sıra</b>: ${sirali.size ? `bu panoda <b>${sayi(sirali.size)} tel</b> (listede <b>↥</b> işaretli) daha önce takılan bir telin ucunun üstünden geçer (çoğu geniş çiplerin ve uyarlayıcının yanında, delik az olan yerlerde): bu teller altlarındaki telden <b>sonra</b> takılır. Listedeki sıraya uyarsan kendiliğinden doğru olur; bir teli sonradan söküp yenisini takarken üstünden geçen ↥ telleri de sökmen gerekebilir.` : "hiçbir tel başka bir telin ucunun üstünden geçmez: sıra şart değil, ama bu sırayla eller hep board'un boş yerinde kalır."}</li>
<li><b>Nereden → nereye</b>: iki ucun delikleri. Teller yalnız yatay ve dikey gider, köşelerde 90° bükülür; düz yatar, çiplerin ve parçaların üstünden geçmez. Yol, board çizimlerinde gösterilir.</li>
<li><b>mm</b>: delikten deliğe yol boyu. <b>Kes</b>: kesilecek boy = yol + iki uçta 8'er mm (≈ 6 mm soyulmuş uç + 2 mm iniş). Uçları 6 mm soy, 90° bük, deliğe tam bas.</li>
<li><b>En uzun tel</b>: ${EN_UZUN_TEL} mm kuralı. Daha uzun bağlantılar boş bir şeritte (yalnız tellerin uğradığı <i>aktarma şeridi</i>; çizimlerde ve uygulamada "boş şerit") ikiye bölünür. Bu panoda ${asan.length ? `${asan.length} tel hâlâ ${EN_UZUN_TEL} mm'den uzun (en uzunu ${sayi(Math.max(...asan.map((x) => x.uzunluk)))} mm; yolu boyunca boş şerit kalmamış): bunları ötekilerin üstünden geçen gergin olmayan bir yolla tak.` : `bütün teller ${EN_UZUN_TEL} mm'den kısa.`}</li>
<li><b>Renk</b>: sinyal sınıfı (aşağıda; PCB kurulum belgelerindeki ve wire-wrap tellerindeki kodun aynısı). Hata ararken telin rengi hangi hatta ait olduğunu söyler.</li>
<li>Teller birbirinin üstünden çoğunlukla dik açıyla geçer; çok yoğun yerlerde aynı çizgide üst üste de biner (önce takılan altta kalır).</li>
</ul>
<h3>Renk kodu</h3>
<table class="tablo"><thead><tr><th style="width:26mm">Renk</th><th style="width:30mm">Sınıf</th><th>Hangi hatlar</th><th class="sag" style="width:14mm">Tel</th></tr></thead><tbody>${renkSatiri}</tbody></table>
<h3>Parçalar</h3>
<ul>
<li><b>Çipler</b>: çentik solda, 1. bacak sol altta (f satırında), son bacak sol üstte (e satırında). Her çipin 100 nF'ı üst ray çiftinin arasında, çipin hemen yanındaki ray sütununda (bir bacağı <code>üst+</code>, öbürü <code>üst−</code>).</li>
${genis.length ? `<li><b>Geniş çipler</b> (${[...new Set(genis.map((q) => q.part))].join(", ")}; 15,24 mm): bacakları d ve h satırlarında; şeritlerinde yalnız 3 (üstte) ve 2 (altta) boş delik kalır: o bacakların telleri bu yüzden sık ve sıralıdır.</li>` : ""}
<li><b>Şerit kablo uyarlayıcısı</b> (${esc(y.parcalar.find((q) => q.tur === "uyarlayici")!.ref)}, T-cobbler benzeri): üstte 2 × 32 erkek IDC başlık, altta kanalın iki yanına oturan 64 bacak; tek numaralı pinler f, çift numaralılar e satırında, 1–2. pinler ${t.uyarlayici.c0}. sütunda. 1. pin işaretli (▲): şerit kablonun kırmızı çizgili damarı bu pine gelir. Hazırı yoksa delikli pertinaksa 2 × 32 başlık + iki sıra 1 × 32 uzun bacaklı pin başlığı (sıralar arası 7,62 mm).</li>
<li><b>Besleme girişleri</b> (JB…): uyarlayıcının board sırasında her board sütununa bir 2 pinli başlık ya da klemens, + rayına ve − rayına; yanında 100 µF (C… / CB…). Her girişe 5 V kaynağın dağıtım bloğundan ayrı bir kablo çifti gelir (3. bölüm).</li>
${y.parcalar.some((q) => q.tur === "sip") ? "<li><b>10 kΩ SIP dizileri</b>: 1. bacak (nokta, ortak uç) işaretli; ortak uç çizimdeki rayda.</li>" : ""}
${y.parcalar.some((q) => q.tur === "osilator") ? "<li><b>Kristal osilatör</b> (DIP-14 kılıf): yalnız 1, 7, 8, 14. bacaklar; nokta / sivri köşe 1. bacak, kanalın üstünde.</li>" : ""}
${y.parcalar.some((q) => q.tur === "modul") ? "<li><b>Modüller</b> (USB-seri CH340, PS/2 soketi, VGA soketi): tek sıra pin başlıklarıyla, çizimdeki satırda; kabloları ön kenardan çıkar.</li>" : ""}
</ul>
</section>`;
}

function harita(m: MakineBbPlani, p: KartBbPlani): string {
  const y = p.yerlesim;
  const { W, H } = HARITA;
  const k = katalogu("cpu16", m.board);
  const s: string[] = [];
  const ub = p.tanim.uyarlayici;
  for (const b of y.boards) {
    const x = haritaX(b.bx), yy = haritaY(b.by);
    s.push(`<rect x="${x}" y="${yy}" width="${W}" height="${H}" rx="1" fill="${ASAMA_RENGI[b.asama - 1]}" stroke="#777" stroke-width="0.25"/>`);
    s.push(`<text x="${x + 1.5}" y="${yy + 4}" font-size="3.2" font-weight="700" fill="#333">${b.ad}</text>`);
    const gruplar = boardGruplari(p.kart, b.no, y, k, W - 3, 2.2);
    (gruplar.length ? gruplar : [b.rol.length > 34 ? `${b.rol.slice(0, 33)}…` : b.rol]).forEach((t, i) => s.push(`<text x="${x + 1.5}" y="${yy + 7.7 + 2.9 * i}" font-size="2.2" fill="#333">${esc(t)}</text>`));
    const parcalar = y.parcalar.filter((q) => q.board === b.no);
    const cipler = parcalar.filter((q) => q.cipMi).length;
    const ek = [parcalar.some((q) => q.tur === "uyarlayici") ? "uyarlayıcı" : "", parcalar.some((q) => q.part === "CONN_5V") ? "5 V girişi" : ""].filter(Boolean).join(" · ");
    s.push(`<text x="${x + 1.5}" y="${yy + 14.6}" font-size="2.1" fill="#666">${cipler} çip · ${b.asama}. aşama${ek ? ` · ${ek}` : ""}</text>`);
    if (b.bx === ub.bx && b.by === ub.by) s.push(`<rect x="${x + 14}" y="${yy + (p.tanim.sira === "arka" ? H - 1.7 : 0.2)}" width="${W - 28}" height="1.5" fill="#2d3a2f"/>`);
  }
  const bolgeler = haritaBolgeleri(p.kart, y.boards, k);
  s.push(bolgeler.svg);
  const { w, h } = haritaBoyu(y.nx, y.ny);
  const arka = p.tanim.sira === "arka";
  s.push(`<text x="${w / 2}" y="4" font-size="3" text-anchor="middle" fill="#555">${arka ? "arka kenar" : "arka kenar: koridor, şerit kablo"}</text>`);
  s.push(`<text x="${w / 2}" y="${h - 2}" font-size="3" text-anchor="middle" fill="#555">${arka ? "ön kenar: koridor, şerit kablo" : "ön kenar (sana yakın)"}</text>`);
  const lejant = p.asamalar.map((a) => `<span><span class="bk" style="background:${ASAMA_RENGI[a.no - 1]}"></span>${a.no}. ${esc(a.ad)}</span>`).join("");
  return `<section class="bolum akar">
<h2>2. Panonun haritası ve bölümleri</h2>
<p>Bölgeler veri akışı sırasıyla: uyarlayıcının yanında arka panele en çok bağlanan bloklar, ondan uzakta iç bloklar. Mantık çipleri bölgelerinin board'larına tel boyu en kısa olacak biçimde dağıtılmıştır; board başına en çok ${p.tanim.yuva} çip (çiplerin arasında tellere yer kalır). Her bölge renkli bir çerçeveyle sarılı, etiketi sol üst köşesinde; board'ların ikinci satırı üstündeki çip grupları.</p>
<div class="lejant">${lejant}</div>
<figure class="harita"><svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 0 ${w + 4} ${h}" width="${Math.min(186, 40 * y.nx + 20)}mm" font-family="DejaVu Sans, Arial, sans-serif">${s.join("")}</svg>
<figcaption>Board'lar, çip grupları ve takıldıkları aşama (zemin rengi); renkli çerçeve: bölge; koyu şerit: şerit kablo uyarlayıcısı. Üstten bakış; BB01 sol arka köşe.</figcaption></figure>
${bolumlerHtml(p.kart, y, k, "Bölümler: her bölgenin görevi ve çip grupları", "5. bölüm")}
<h3>Makinedeki yeri</h3>
<figure class="harita">${makineHaritasi(m, p.kart, 150)}<figcaption>Yedi pano iki sıra halinde koridora bakar; şerit kablo koridorda uzanır, her panonun uyarlayıcısına bir IDC soketiyle iner.</figcaption></figure>
</section>`;
}

function besleme(p: KartBbPlani, b: BeslemeButcesi, board: Board): string {
  const y = p.yerlesim;
  const ub = p.tanim.uyarlayici;
  const girisler = y.parcalar.filter((q) => q.part === "CONN_5V").sort((a, c) => y.boards[a.board].bx - y.boards[c.board].bx);
  const satir = girisler.map((g) => {
    const gb = y.boards[g.board];
    const sutun = y.boards.filter((x) => x.bx === gb.bx).sort((a, c) => Math.abs(a.by - ub.by) - Math.abs(c.by - ub.by));
    const tampon = y.parcalar.find((q) => q.board === g.board && q.part === "C_100U");
    const nesne = new Map<string, string>(board.chips.map((c) => [c.ref, c.def.part] as const));
    const cipler = y.parcalar.filter((q) => q.cipMi && sutun.some((x) => x.no === q.board)).map((q) => nesne.get(q.ref) ?? q.part);
    return `<tr><td class="ref">${esc(g.ref)}</td><td class="mono">${esc(ucEtiketi(y, g.bacaklar[0].X, g.bacaklar[0].Y))} / ${esc(ucEtiketi(y, g.bacaklar[1].X, g.bacaklar[1].Y))}</td><td>${tampon ? esc(tampon.ref) : "—"}</td><td class="mono kucuk">${sutun.map((x) => x.ad).join(" ")}</td><td class="sag">${cipler.length}</td></tr>`;
  }).join("");
  return `<section class="bolum akar">
<h2>3. Besleme</h2>
<p>Tek bir 5 V kaynak (bütün makine için en az 2 A, dizin belgesine bak) bir dağıtım bloğuna (klemens ya da bara) bağlanır; her besleme girişine oradan <b>ayrı</b> bir kablo çifti gider (yıldız bağlantı, 0,5 mm² ya da 20 AWG). Böylece akım board'lar arası ray köprülerinden değil kendi kablosundan gelir. Girişler uyarlayıcının board sırasında, her board sütununa bir tane; sütunun öbür board'ları arka-ön ray köprüleriyle beslenir.</p>
<table class="tablo"><thead><tr><th style="width:14mm">Giriş</th><th style="width:42mm">+ / − delik</th><th style="width:18mm">100 µF</th><th>Beslediği board'lar</th><th class="sag" style="width:14mm">Çip</th></tr></thead><tbody>${satir}</tbody></table>
<p>Akım (parçaların veri sayfası değerleriyle, PCB kurulum belgelerindeki bütçeyle aynı tablo): <b>≈ ${sayi(b.toplamMa)} mA</b>; en yüklü giriş ≈ ${sayi(b.enCokGirisMa)} mA. Ray + köprü başına ≈ ${sayi(KOPRU_OHM * 1000)} mΩ ile girişten en uzak board'da + ve − raylarında toplam ≈ ${sayi(b.dusumMv)} mV düşüm (74HC için 4,5–5,5 V aralığında rahat). Her çipin 100 nF'ı kendi yanında, her girişin 100 µF'ı girişin yanında.</p>
<div class="not">İlk açılışta (çipler takılı değilken) her board'un dört rayında ölç: + raylar 4,9–5,1 V, − raylar 0 V; uyarlayıcının 3, 4 ve 63. pinleri 5 V, 1, 2, 62 ve 64. pinleri 0 V. Şerit kabloyu ancak her pano kendi testlerini geçince tak.</div>
</section>`;
}

function asamalar(p: KartBbPlani): string {
  const rows = p.tanim.asamalar.map((a) => {
    const t = p.teller.filter((x) => x.asama === a.no);
    const boards = p.yerlesim.boards.filter((b) => b.asama === a.no).map((b) => b.ad);
    const parca = p.yerlesim.parcalar.filter((q) => q.asama === a.no);
    return `<tr><td><b>${a.no}. ${esc(a.ad)}</b><br><span class="pa">${esc(a.bloklar.join(", "))}</span></td>
<td class="mono kucuk">${boards.join(" ") || "—"}</td>
<td class="sag">${parca.filter((q) => q.cipMi).length}<br><span class="pa">${parca.filter((q) => !q.cipMi).length} pasif</span></td>
<td class="mono">${t.length ? `${telNo(t[0])}–${telNo(t[t.length - 1])}` : "—"}<br><span class="pa">${sayi(t.length)} tel</span></td>
<td class="kucuk">${esc(a.test)}${a.deney ? `<br><span class="pa">cpu16/kit/deney-${String(a.deney).padStart(2, "0")}-*.md</span>` : ""}</td></tr>`;
  }).join("");
  return `<section class="bolum akar">
<h2>4. Aşamalar ve testler</h2>
<p>Her aşamada o aşamanın parçalarını tak (çipler, 100 nF'lar, pasifler), sonra tellerini listedeki sırayla tak, sonra testi yap. Her aşamanın sonunda o ana kadar takılan her netin bütün bacakları bağlıdır (doğrulanmıştır): test, yalnız o aşamanın devresini dener. Board'lar sütunu: en çok parçası o aşamada takılan board'lar (bir board'un parçaları birkaç aşamaya yayılabilir; parçanın aşaması 5. bölümdeki tablolarda).</p>
<div class="not">Besleme vermeden önce her aşamada: çiplerin yönü (çentik solda), VCC–GND arasında kısa devre yok (multimetre, ohm), raylarda 5 V.</div>
<table class="tablo"><thead><tr><th style="width:44mm">Aşama</th><th style="width:34mm">Board'lar</th><th class="sag" style="width:13mm">Çip</th><th style="width:26mm">Teller</th><th>Test</th></tr></thead><tbody>${rows}</tbody></table>
</section>`;
}

function parcaBasligi(board: Board, q: BbParca): string {
  const x = q.cipMi ? board.chips.find((c) => c.ref === q.ref) : undefined;
  if (x) return `${x.def.part} · ${x.def.title}`;
  if (q.ek) return q.rol;
  return PASSIVES[q.part]?.title ?? q.part;
}

function boardBolumu(board: Board, p: KartBbPlani): string {
  const y = p.yerlesim;
  const cizim: CizimSecenekleri = { ...CIZIM, grup: grupEtiketleri(p.kart, y, katalogu("cpu16", board)) };
  const out: string[] = [];
  for (const b of y.boards) {
    const teller = p.teller.filter((t) => boardaDegiyor(t, b));
    const parcalar = y.parcalar.filter((q) => q.board === b.no && q.tur !== "kondansator").sort((a, c) => a.sutun - c.sutun);
    const satir = parcalar.map((q) => {
      const b1 = q.bacaklar.find((k) => k.pin === 1) ?? q.bacaklar[0];
      return `<tr><td class="ref">${esc(q.ref)}</td><td>${esc(parcaBasligi(board, q))}</td><td class="mono">${esc(ucEtiketi(y, b1.X, b1.Y).split(" ")[1])}</td><td class="sag">${q.asama}</td><td class="pa">${esc(q.ek ? "" : q.rol)}</td></tr>`;
    }).join("");
    const dekuplaj = y.parcalar.filter((q) => q.board === b.no && q.tur === "kondansator").length;
    const kendi = p.teller.filter((t) => noktaBoardu(y, t.yol[0], t.yol[1]) === b.no || noktaBoardu(y, t.yol[t.yol.length - 2], t.yol[t.yol.length - 1]) === b.no).length;
    out.push(`<article class="board">
<h3>${b.ad} · ${esc(b.rol)} <span class="muted kucuk">(${b.asama}. aşama · ${y.parcalar.filter((q) => q.board === b.no && q.cipMi).length} çip · ${dekuplaj} kondansatör üst raylarda · bu board'da ucu olan ${kendi} tel)</span></h3>
<figure class="harita">${boardCizimi(y, b, teller, renkHex, cizim)}</figure>
${satir ? `<table class="tablo kucuk"><thead><tr><th style="width:14mm">Parça</th><th>Ne</th><th style="width:16mm">1. bacak</th><th class="sag" style="width:10mm">Aşama</th><th>Görevi</th></tr></thead><tbody>${satir}</tbody></table>` : ""}
</article>`);
  }
  return `<section class="bolum">
<h2>5. Board board yerleşim</h2>
<p>Her board üstten, ön kenar aşağıda; üstünde çip grupları (köşeli çizgi grubun sütunlarını kapsar, rengi bölgenin rengi; 2. bölümdeki "Bölümler"de görevleriyle). Çipler koyu (çentik solda, nokta 1. bacak), geniş çipler d–h satırlarında, osilatör gri, uyarlayıcı koyu yeşil (kırmızı işaret 1. pin), 100 nF'lar üst rayların arasında turuncu, 100 µF'lar mavi daire, besleme girişleri siyah. Teller kendi renginde, uçları yuvarlak; board dışına çıkan teller kenarda kesilir. Tablo: parçalar soldan sağa, 1. bacağının deliği ve takıldığı aşama.</p>
${out.join("\n")}
</section>`;
}

function telListesi(p: KartBbPlani, sirali: Map<number, number[]>): string {
  const y = p.yerlesim;
  const rows: string[] = [];
  for (const a of p.tanim.asamalar) {
    const t = p.teller.filter((x) => x.asama === a.no);
    if (!t.length) continue;
    rows.push(`<tr class="blokbas"><td colspan="8">${a.no}. aşama · ${esc(a.ad)} · ${telNo(t[0])}–${telNo(t[t.length - 1])} · ${sayi(t.length)} tel</td></tr>`);
    for (const x of t) {
      const n = x.yol.length;
      const alt = sirali.get(x.no);
      rows.push(`<tr><td>${kutu}</td><td class="id">${telNo(x)}${alt ? `<span title="önce ${alt.map((k) => `T${String(k).padStart(4, "0")}`).join(", ")}"> ↥</span>` : ""}</td><td class="ucn mono">${esc(ucEtiketi(y, x.yol[0], x.yol[1]))}</td><td class="ucn mono">${esc(ucEtiketi(y, x.yol[n - 2], x.yol[n - 1]))}</td><td class="sag">${Math.round(x.uzunluk)}</td><td class="sag">${x.kesim}</td><td>${renkKutusu(x)}</td><td class="net">${x.ray ? "ray köprüsü" : esc(x.ad)}</td></tr>`);
    }
    rows.push(`<tr><td colspan="8" class="kucuk"><b>Aşama ${a.no} testi:</b> ${esc(a.test)}</td></tr>`);
  }
  return `<section class="bolum">
<h2>6. Tel listesi</h2>
<p>Kutuyu tel takılınca işaretle. Nereden / nereye: delik (board, satır, sütun; raylar üst+ / üst− / alt− / alt+). mm: delikten deliğe; kes: kesilecek boy. ↥: daha önce takılan bir telin ucunun üstünden geçer, ondan sonra tak. Net: telin taşıdığı sinyal (simülatörde, şemada ve uygulamada aynı ad).</p>
<table class="tablo teller"><thead><tr><th style="width:5mm"></th><th style="width:14mm">No</th><th style="width:26mm">Nereden</th><th style="width:26mm">Nereye</th><th class="sag" style="width:10mm">mm</th><th class="sag" style="width:10mm">kes</th><th style="width:22mm">Renk</th><th>Net</th></tr></thead><tbody>${rows.join("\n")}</tbody></table>
</section>`;
}

/** Kesim boyları 5 mm'ye yuvarlanır (yukarı) */
const kesimSinifi = (mm: number) => Math.ceil(mm / 5) * 5;

function kesimListesi(teller: BbTel[], o: Pick<BbOlcu, "renkler" | "dagilim">, no: string): string {
  const bloklar = o.renkler.map((r) => {
    const boy = new Map<number, number>();
    for (const t of teller) if (t.renk === r.renk) boy.set(kesimSinifi(t.kesim), (boy.get(kesimSinifi(t.kesim)) ?? 0) + 1);
    const hucre = [...boy].sort((a, b) => a[0] - b[0]).map(([mm, n]) => `<span class="kesim"><b>${mm}</b> × ${n}</span>`).join(" ");
    const tn = cpuRenkTanimi(r.renk);
    return `<tr><td><span class="sw" style="background:${tn.hex}"></span><b>${esc(tn.ad)}</b><br><span class="pa">${sayi(r.sayi)} tel · ${sayi(r.kesimM, 1)} m</span></td><td class="kesimler">${hucre}</td></tr>`;
  }).join("");
  return `<section class="bolum">
<h2>${no}. Kesim listesi</h2>
<p>Renk renk, kesim boyu (mm, 5 mm'ye yukarı yuvarlanmış) × adet. Önce bir rengin bütün tellerini kesip soy, boylarına göre ayrı kaplara koy; tel listesindeki "kes" sütunu her telin tam boyudur. Kesim boyu = delikten deliğe yol + 16 mm.</p>
<table class="tablo"><thead><tr><th style="width:30mm">Renk</th><th>Boy (mm) × adet</th></tr></thead><tbody>${bloklar}</tbody></table>
<h3>Boy dağılımı</h3>
<table class="tablo"><thead><tr>${o.dagilim.map(([s], i) => `<th class="sag">${i ? o.dagilim[i - 1][0] : 0}–${s === Infinity ? "" : s} mm</th>`).join("")}</tr></thead>
<tbody><tr>${o.dagilim.map(([, n]) => `<td class="sag">${sayi(n)}</td>`).join("")}</tr></tbody></table>
</section>`;
}

function say<T>(xs: T[], k: (x: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const x of xs) m.set(k(x), (m.get(k(x)) ?? 0) + 1);
  return [...m].sort((a, b) => a[0].localeCompare(b[0]));
}

function malzeme(board: Board, p: KartBbPlani, o: BbOlcu, b: BeslemeButcesi): string {
  const y = p.yerlesim;
  const cipler = board.chips.filter((c) => c.card === p.kart);
  const pasifler = board.passives.filter((q) => q.card === p.kart && q.part !== "BACKPLANE_2x32");
  const ek = y.parcalar.filter((q) => q.ek);
  const cipSatiri = say(cipler, (c) => c.def.part).map(([x, n]) => `<tr><td class="ref">${esc(x)}</td><td>${esc(cipler.find((c) => c.def.part === x)!.def.title)}</td><td class="sag">${n}</td></tr>`).join("");
  const pasifSatiri = say(pasifler, (q) => q.part).map(([x, n]) => `<tr><td class="ref">${esc(x)}</td><td>${esc(PASSIVES[x]?.title ?? x)}</td><td class="sag">${n}</td></tr>`).join("");
  const teller = o.renkler.map((r) => {
    const tn = cpuRenkTanimi(r.renk);
    return `<tr><td><span class="sw" style="background:${tn.hex}"></span>${esc(tn.ad)}</td><td>${esc(tn.grup)}</td><td class="sag">${sayi(r.sayi)}</td><td class="sag">${sayi(r.kesimM, 1)} m</td><td class="sag"><b>${Math.ceil(r.kesimM * 1.15)} m</b></td></tr>`;
  }).join("");
  const plaka = plakaBoyu(p);
  const genis = cipler.filter((c) => c.def.footprint.includes("W15.24")).length;
  return `<section class="bolum akar">
<h2>8. Malzeme listesi</h2>
<h3>Breadboard, taban, uyarlayıcı, besleme</h3>
<table class="tablo"><thead><tr><th>Ne</th><th class="sag" style="width:20mm">Adet</th></tr></thead><tbody>
<tr><td><b>Tam boy breadboard, 830 delik</b> (BB830 türü: 63 sütun, a–e / f–j, üstte ve altta ikişer ray, <b>raylar kesintisiz</b>; arkası yapışkanlı)</td><td class="sag">${o.board}</td></tr>
<tr><td>Taban plakası ≈ ${sayi(Math.ceil(plaka.w / 10) * 10)} × ${sayi(Math.ceil(plaka.h / 10) * 10)} mm (10 mm kontrplak ya da MDF): board'lar ${y.nx} × ${y.ny}; bir modülün board'ları bitişik, modüller arasında ≈ ${sayi(BOSLUK * ADIM, 0)} mm boşluk (her modül ayrı bir ada); kenarlarda tellerin dolandığı ≈ 10 mm pay</td><td class="sag">1</td></tr>
<tr><td>Şerit kablo uyarlayıcısı 2 × 32 (T-cobbler benzeri: üstte 2 × 32 erkek IDC başlık, altta kanalın iki yanına 64 bacak)</td><td class="sag">1</td></tr>
<tr><td>2 × 32 dişi IDC soketi (2,54 mm), makinenin 64 damarlı şerit kablosu üstünde (kablo ve soketler: dizin belgesi)</td><td class="sag">1</td></tr>
<tr><td>Besleme girişi: 2 pinli başlık ya da 5,08 mm klemens (+ ve − rayına), kaynağın dağıtım bloğundan ayrı kablo çiftiyle</td><td class="sag">${ek.filter((q) => q.part === "CONN_5V").length}</td></tr>
<tr><td>100 µF / 10 V elektrolitik (her girişin yanında; birincisi kartın netlistindeki C…, ötekiler CB…)</td><td class="sag">${b.giris}</td></tr>
<tr><td>Ray köprüleri (tel listesinde, kırmızı / siyah): board içi ${o.rayIc}, board'lar arası ${o.rayArasi}</td><td class="sag">${o.rayIc + o.rayArasi}</td></tr>
</tbody></table>
<h3>Atlama teli (22 AWG, 0,64 mm tek damarlı)</h3>
<table class="tablo"><thead><tr><th style="width:26mm">Renk</th><th>Sınıf</th><th class="sag" style="width:14mm">Tel</th><th class="sag" style="width:20mm">Kesim</th><th class="sag" style="width:24mm">Al (+%15)</th></tr></thead><tbody>${teller}
<tr><td colspan="2"><b>Toplam</b></td><td class="sag"><b>${sayi(o.tel)}</b></td><td class="sag"><b>${sayi(o.kesimM, 1)} m</b></td><td class="sag"><b>${o.renkler.reduce((a, r) => a + Math.ceil(r.kesimM * 1.15), 0)} m</b></td></tr></tbody></table>
<h3>Entegreler</h3>
<table class="tablo"><thead><tr><th style="width:24mm">Parça</th><th>Ne</th><th class="sag" style="width:14mm">Adet</th></tr></thead><tbody>${cipSatiri}
<tr><td colspan="2"><b>Toplam</b>${genis ? ` (${genis} geniş DIP-28)` : ""}</td><td class="sag"><b>${cipler.length}</b></td></tr></tbody></table>
<h3>Pasif elemanlar, osilatör, butonlar, modüller (kartın netlistinden)</h3>
<table class="tablo"><thead><tr><th style="width:24mm">Parça</th><th>Ne</th><th class="sag" style="width:14mm">Adet</th></tr></thead><tbody>${pasifSatiri}</tbody></table>
<h3>Aletler</h3>
<p>Tel sıyırıcı (22 AWG), yan keski, ince uçlu pense (telleri 90° bükmek ve yatırmak için), multimetre (süreklilik ve gerilim), cetvel ya da kesim şablonu (5 mm adımlı), IDC sıkma aleti (ya da mengene).</p>
</section>`;
}

const EK_STIL = `
section.bolum.akar { break-before: auto; margin-top: 7mm; }
article.board { break-inside: avoid; margin: 0 0 5mm; }
article.board h3 { margin-top: 2mm; }
.kesimler { line-height: 1.9; }
.kesim { display: inline-block; border: 0.25mm solid var(--line); border-radius: 0.8mm; padding: 0 1.2mm; margin: 0 0.6mm 0.6mm 0; font-family: var(--mono); font-size: 7.6pt; white-space: nowrap; }
`;

export interface BelgeSecenekleri {
  /** üretim tarihi (kapakta) */
  tarih?: string;
}

/** Bir kartın breadboard kurulum belgesi (tek HTML) */
export function kartBbBelgesi(m: MakineBbPlani, p: KartBbPlani, o: BelgeSecenekleri = {}): string {
  const olcu = kartOlcu(p);
  const b = beslemeButcesi(m.board, p);
  const sirali = sirasiOnemliTeller(p);
  const govde = [
    kapak(p, olcu, b, o.tarih), nasilOkunur(p, olcu, sirali), harita(m, p), besleme(p, b, m.board), asamalar(p), boardBolumu(m.board, p),
    telListesi(p, sirali), kesimListesi(p.teller, olcu, "7"), malzeme(m.board, p, olcu, b),
  ].join("\n");
  return htmlBelge(`CPU16 · ${p.tanim.baslik} · breadboard kurulumu`, govde, `${kartAdi(p)}: ${olcu.board} breadboard, ${olcu.tel} atlama teli delikten deliğe, aşama aşama`).replace("</style>", `${EK_STIL}${BOLUM_STIL}</style>`);
}

// ---------------------------------------------------------------- dizin: bütün makine

export interface UretilenBelge {
  kart: string;
  html: string;
  pdf?: string;
  sayfa?: number;
}

/** Şerit kabloda soketlerin yeri (mm, kablonun başından; %10 payla, 10 mm'ye yuvarlanmış) */
export function soketYerleri(m: MakineBbPlani): { kart: string; ref: string; mm: number }[] {
  const s = m.serit;
  const ky = s.koridorY;
  let yol = 1.1 * Math.abs(s.soketler[0].y - ky);
  return s.soketler.map((q, i) => {
    if (i) {
      const o = s.soketler[i - 1];
      yol += 1.1 * (Math.abs(o.y - ky) + Math.abs(q.x - o.x) + Math.abs(q.y - ky));
    }
    return { kart: q.kart, ref: q.ref, mm: Math.round(yol / 10) * 10 };
  });
}

/** Şerit kabloda CLK damarı ve iki komşusu (düz kabloda araya GND damarı girmez) */
function saatKomsulari(): string {
  const d = Object.entries(BACKPLANE).find(([, x]) => x === "CLK");
  if (!d) return "CLK arka panelde yok";
  const n = Number(d[0]);
  const ad = (k: number) => BACKPLANE[k] ?? "boş";
  return `CLK ${n}. damarda, iki yanında ${ad(n - 1)} ve ${ad(n + 1)}${[ad(n - 1), ad(n + 1)].includes("GND") ? "" : ", araya GND damarı yok"}`;
}

/** Dizin belgesi: bütün makine, şerit kablo, besleme, kartların belgeleri */
export function dizinBelgesi(m: MakineBbPlani, belgeler: UretilenBelge[], o: BelgeSecenekleri = {}): string {
  const kartlar = KART_SIRASI.map((k) => m.kartlar.find((x) => x.kart === k)!);
  const olculer = new Map(kartlar.map((p) => [p.kart, kartOlcu(p)]));
  const butce = new Map(kartlar.map((p) => [p.kart, beslemeButcesi(m.board, p)]));
  const tel = kartlar.flatMap((p) => p.teller);
  const toplamMa = [...butce.values()].reduce((s, b) => s + b.toplamMa, 0);
  const board = kartlar.reduce((s, p) => s + p.yerlesim.boards.length, 0);
  const cip = kartlar.reduce((s, p) => s + p.yerlesim.parcalar.filter((q) => q.cipMi).length, 0);
  const kesimM = tel.reduce((s, t) => s + t.kesim, 0) / 1000;
  const asan = tel.filter((t) => t.uzunluk > EN_UZUN_TEL).length;
  const ray = tel.filter((t) => t.ray).length;
  const olgu = (x: string, s: string) => `<div class="olgu"><b>${x}</b><span>${s}</span></div>`;
  const satir = kartlar.map((p) => {
    const ol = olculer.get(p.kart)!;
    const b = butce.get(p.kart)!;
    const bg = belgeler.find((x) => x.kart === p.kart);
    const deney = [...new Set(p.tanim.asamalar.map((a) => a.deney).filter((d): d is number => d !== undefined))].join(", ");
    const link = bg ? `<a href="${esc(bg.pdf ?? bg.html)}">${esc(bg.pdf ?? bg.html)}</a>${bg.sayfa ? ` (${bg.sayfa} sayfa)` : ""}` : "—";
    return `<tr><td><b>${esc(p.tanim.baslik)}</b><br><span class="pa">${esc(p.kart)} · Deney ${deney || "—"}</span></td><td class="sag">${p.yerlesim.nx} × ${p.yerlesim.ny}<br><span class="pa">${ol.board} board</span></td><td class="sag">${p.yerlesim.parcalar.filter((q) => q.cipMi).length}</td><td class="sag">${sayi(ol.tel)}<br><span class="pa">${ol.rayIc + ol.rayArasi} ray</span></td><td class="sag">${sayi(ol.kesimM, 0)} m<br><span class="pa">ort. ${sayi(ol.ortalamaMm)} · en uzun ${sayi(ol.enUzunMm)} mm</span></td><td class="sag">${sayi(b.toplamMa)} mA<br><span class="pa">${b.giris} giriş</span></td><td class="kucuk">${link}</td></tr>`;
  }).join("");
  const yerler = soketYerleri(m);
  const soketSatiri = yerler.map((y, i) => `<tr><td class="sag">${i + 1}</td><td>${esc(m.kartlar.find((k) => k.kart === y.kart)!.tanim.baslik)}</td><td class="ref">${esc(y.ref)}</td><td class="sag">${sayi(y.mm)} mm</td></tr>`).join("");
  const damarlar = Array.from({ length: 64 }, (_, i) => i + 1);
  const damarSatiri = (a: number) => `<td class="sag">${a}</td><td class="mono">${esc(BACKPLANE[a] ?? "boş")}</td>`;
  const damarTablosu = damarlar.slice(0, 32).map((a) => `<tr>${damarSatiri(a)}${damarSatiri(a + 32)}</tr>`).join("");
  const dag = DAGILIM_SINIRLARI.map((s) => [s, 0] as [number, number]);
  for (const t of tel) dag.find(([s]) => t.kesim <= s)![1]++;
  const renkler = CPU_BB_RENKLERI.map((r) => ({ renk: r.renk, sayi: tel.filter((t) => t.renk === r.renk).length, kesimM: tel.filter((t) => t.renk === r.renk).reduce((s, t) => s + t.kesim, 0) / 1000 })).filter((r) => r.sayi);
  const govde = `<section class="kapak">
<div class="ust">Silikon3D · CPU16 · breadboard kurulumu</div>
<h1>CPU16 bilgisayarı<br>breadboard'da</h1>
<p class="alt">Her kart kendi panosunda: bir taban plakasında bir grup tam boy breadboard (BB830). Yedi pano iki sıra halinde ortadaki koridora bakar; anakartın arka paneli koridorda uzanan 64 damarlı bir şerit kablodur, her panoya bir IDC soketiyle iner. Kartın PCB'deki 2 × 32 kenar konnektörü breadboard'da bir şerit kablo uyarlayıcısıdır: kartlar arası her bağlantı arka paneldeki gibi tek bir yoldan geçer, panolar arasında atlama teli yoktur.</p>
<div class="olgular">
${olgu("7", "pano (kart başına bir)")}
${olgu(String(board), "breadboard (BB830)")}
${olgu(String(cip), "entegre")}
${olgu(sayi(tel.length), `atlama teli (${ray} ray köprüsü)`)}
${olgu(`${sayi(kesimM, 0)} m`, "tel (kesim boyu)")}
${olgu(`%${sayi((100 * (tel.length - asan)) / tel.length, 1)}`, `tel ${EN_UZUN_TEL} mm'den kısa`)}
${olgu(`≈ ${sayi(toplamMa / 1000, 2)} A`, "5 V (bütün makine)")}
${olgu(`≈ ${sayi(Math.ceil(m.w / 10) * 10)} × ${sayi(Math.ceil(m.h / 10) * 10)} mm`, "masa")}
</div>
<p class="dipnot">Üretildi${o.tarih ? ` ${esc(o.tarih)}` : ""}: <code>npm run cpu16 -- breadboard-belge hepsi</code> (kaynak <code>cpu16/breadboard/</code>; açıklama <code>cpu16/docs/breadboard.md</code>). Bağlantı yalnız fiziksel modelden (board'lar, bacakların delikleri, teller, şerit kablo) birleşim-bul ile yeniden kurulur ve anakartın netlistiyle karşılaştırılır: <code>npm run cpu16 -- breadboard</code>. Uygulamada: Silikon3D → CPU16 kartı 3D → Görünüm: Breadboard.</p>
</section>
${mimariBolumu("makine")}
${mimariBolumu("cpu")}
<section class="bolum">
<h2>1. Makine</h2>
<figure class="harita">${makineHaritasi(m)}<figcaption>Üstten bakış (mm). Arka sıra: ${MAKINE_SIRALARI.arka.map((k) => esc(m.kartlar.find((x) => x.kart === k)!.tanim.baslik)).join(", ")} (uyarlayıcılar ön kenarda); ön sıra: ${MAKINE_SIRALARI.on.map((k) => esc(m.kartlar.find((x) => x.kart === k)!.tanim.baslik)).join(", ")} (uyarlayıcılar arka kenarda; butonlar, VGA, PS/2 ve USB-seri önde). Panolar arası ${PANO_ARASI} mm, koridor ${KORIDOR} mm.</figcaption></figure>
<h3>Neden şerit kablo (arka panel)</h3>
<ul>
<li>PCB'de kartlar arası her sinyal arka panelden geçer; breadboard'da da öyle: bütün kartlar aynı 64 hattı aynı pin düzeniyle görür (PCB'deki kenar konnektörüyle birebir), kartın kendi devresi değişmez.</li>
<li>Panolar arasında atlama teli yok: kartlar arası en uzun yol bile kablonun bir damarıdır; bir panoyu sökmek tek bir soketi çıkarmaktır; her pano kendi başına kurulup test edilir (soket takılmadan).</li>
<li>Bedeli: her panoda 64 bacaklık bir uyarlayıcı (iki board şeridinin 32 sütunu) ve uyarlayıcının çevresinde yoğun teller; kablonun boyu (≈ ${sayi(m.serit.boyMm / 1000, 2)} m) yüzünden arka panel hatlarında ≈ 15–20 ns ek gecikme ve damarlar arası kuplaj (${saatKomsulari()}): CPU16'nın ilk hedefi olan 1 MHz CPU saatinde (zamanlama analizi en kötü durumda 1,21 MHz veriyor; cpu16/docs/uretim.md) bu pay önemsiz. Kabloyu katlamadan, gergin olmadan döşe; soketleri sırayla tak.</li>
<li>Seçenekler: (a) panolar arasında tek tek atlama telleri (yüzlerce uzun tel, sökülemez); (b) her kart için ayrı kablo ve ortak bir arka panel PCB'si (yeni bir kart). Şerit kablo ikisinden de basit ve PCB'deki yapının aynısı.</li>
</ul>
</section>
<section class="bolum akar">
<h2>2. Kurulum sırası ve kartların belgeleri</h2>
<p>Kartlar deney sırasıyla (cpu16/kit): önce saat kartı, sonra CPU, bellek ve önbellek, G/Ç, video, kendin yap bellek. Her pano kendi belgesindeki aşamalarla kurulur, her aşamanın sonunda test; şerit kablo ancak pano kendi testlerini geçince takılır.</p>
<table class="tablo"><thead><tr><th style="width:36mm">Kart</th><th class="sag" style="width:16mm">Board</th><th class="sag" style="width:10mm">Çip</th><th class="sag" style="width:15mm">Tel</th><th class="sag" style="width:28mm">Tel boyu</th><th class="sag" style="width:16mm">Akım</th><th>Kurulum belgesi</th></tr></thead><tbody>${satir}
<tr><td><b>Toplam</b></td><td class="sag"><b>${board}</b></td><td class="sag"><b>${cip}</b></td><td class="sag"><b>${sayi(tel.length)}</b></td><td class="sag"><b>${sayi(kesimM, 0)} m</b></td><td class="sag"><b>${sayi(toplamMa)} mA</b></td><td></td></tr></tbody></table>
</section>
<section class="bolum">
<h2>3. Şerit kablo</h2>
<p>64 damarlı, 1,27 mm adımlı düz şerit kablo; üstünde ${m.serit.soketler.length} adet 2 × 32 dişi IDC soketi (2,54 mm). Kablo koridorda yatar, her sokette panonun uyarlayıcısına çıkar ve geri döner (45° katlanır). Kesim boyu ≈ <b>${sayi(m.serit.boyMm)} mm</b> (yol + %10 pay). Soketleri aşağıdaki yerlere sık; <b>her sokette kırmızı çizgili 1. damar uyarlayıcının 1. pinine</b> (▲) gelmeli. Sıktıktan sonra her damarı uçtan uca bip testiyle dene (1. ve 64. damar en kolay ölçülen: ikisi de GND).</p>
<table class="tablo"><thead><tr><th class="sag" style="width:10mm">Sıra</th><th>Pano</th><th style="width:20mm">Uyarlayıcı</th><th class="sag" style="width:30mm">Kablonun başından</th></tr></thead><tbody>${soketSatiri}</tbody></table>
<h3>Damar → sinyal (her uyarlayıcıda aynı; PCB'deki kenar konnektörünün pin düzeni)</h3>
<table class="tablo kucuk"><thead><tr><th class="sag" style="width:10mm">Damar</th><th>Sinyal</th><th class="sag" style="width:10mm">Damar</th><th>Sinyal</th></tr></thead><tbody>${damarTablosu}</tbody></table>
</section>
<section class="bolum akar">
<h2>4. Besleme</h2>
<p>Tek bir 5 V kaynak: bütün makine ≈ <b>${sayi(toplamMa)} mA</b> (parçaların veri sayfası değerleriyle); en az 2 A, tercihen 3 A'lik regüleli bir adaptör. Kaynağın çıkışı bir dağıtım bloğuna gider, her panonun her besleme girişine oradan ayrı bir kablo çifti (yıldız bağlantı). Şerit kablonun VCC ve GND damarları (1–4, 62–64) panoları birbirine de bağlar; asıl akım kendi kablolarından gelir.</p>
<table class="tablo"><thead><tr><th>Pano</th><th class="sag" style="width:18mm">Giriş</th><th class="sag" style="width:24mm">Akım</th><th class="sag" style="width:30mm">En yüklü giriş</th><th class="sag" style="width:30mm">En uzak board'da düşüm</th></tr></thead><tbody>${kartlar.map((p) => {
    const b = butce.get(p.kart)!;
    return `<tr><td>${esc(p.tanim.baslik)}</td><td class="sag">${b.giris}</td><td class="sag">${sayi(b.toplamMa)} mA</td><td class="sag">${sayi(b.enCokGirisMa)} mA</td><td class="sag">≈ ${sayi(b.dusumMv)} mV</td></tr>`;
  }).join("")}</tbody></table>
</section>
${kesimListesi(tel, { renkler, dagilim: dag }, "5").replace("<h2>5. Kesim listesi</h2>", "<h2>5. Bütün makinenin telleri</h2>")}`;
  return htmlBelge("CPU16 · breadboard kurulumu · dizin", govde, `7 pano, ${board} breadboard, ${tel.length} atlama teli, 64 damarlı şerit kablo`).replace("</style>", `${EK_STIL}</style>`);
}
