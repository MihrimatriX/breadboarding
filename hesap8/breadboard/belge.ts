// Hesap makinesinin breadboard kurulum belgesi (yazdırılabilir HTML; PDF'e Chromium ile basılır):
// kapak, nasıl okunur (delik adları, raylar, renk kodu, kesim boyu), board haritası, board board
// yerleşim çizimleri (parçalar ve o board'daki teller), aşama aşama numaralı tel listesi (işaret
// kutulu, delikten deliğe), renk ve boya göre kesim listesi, malzeme listesi.
// npm run hesap8 -- breadboard-belge -o <dizin>

import { PASSIVES } from "../../cpu16/board/passives.ts";
import { esc, htmlBelge, kutu } from "../../cpu16/kurulum/stil.ts";
import { boardaDegiyor, boardCizimi as cizim, BW, type CizimSecenekleri } from "../../cpu16/board/breadboard/cizim.ts";
import { ADIM, BY_ADIM } from "./geometri.ts";
import { bbOlcu, noktaBoardu, ucEtiketi, type BbOlcu, type BbPlani, type BbTel } from "./plan.ts";
import { BB_RENKLERI, renkTanimi } from "./renk.ts";
import type { BbBoard } from "./yerlesim.ts";

const sayi = (n: number, k = 0) => n.toLocaleString("tr-TR", { minimumFractionDigits: k, maximumFractionDigits: k });
const telNo = (t: BbTel) => `T${String(t.no).padStart(4, "0")}`;
const renkKutusu = (t: Pick<BbTel, "renk">, ad = true) => {
  const r = renkTanimi(t.renk);
  return `<span class="sw" style="background:${r.hex}"></span>${ad ? `<span class="rk">${esc(r.ad)}</span>` : ""}`;
};

/** Aşamaların renkleri (haritada) */
const ASAMA_RENGI = ["#f6e7b4", "#d8ecd0", "#d3e3f3", "#f3d9d3", "#e6dcf2", "#d4efec", "#f1e0c8"];

/** Her aşamanın sonundaki test (ayrıntısı kurulum-rehberi.md'de) */
const ASAMA_TESTI: Record<number, string> = {
  1: "Bütün board'ların + rayında 5 V (− rayına göre), ray köprüleri tam. SW1'de yalnız 8. anahtar açık: A0 = 5 V, A1–A7 = 0 V. SW3 her konumda yalnız bir işlem LED'i (TOPLA, ÇIKAR, ÇARP, BÖL). SW4 basılı: LT_N = 0 V.",
  2: "SW1 = 00000000 → A göstergesi \"  0\"; 00000101 → \"  5\"; 00001010 → \" 10\"; 01100100 → \"100\"; 11111111 → \"255\". SW4 basılı: üç hane \"8\".",
  3: "SW2 ile aynı tablo, B göstergesinde.",
  4: "Sonuç henüz gösterilmez: M0–M7, NEG ve T8 şeritlerine geçici LED + 1 kΩ (GND'ye). 12 + 200 → M = 11010100; 200 − 12 → 10111100; 12 − 200 → 10111100 ve NEG = 1.",
  5: "Geçici LED'lerle P0–P15: 15 × 15 → 225; 16 × 16 → 256; 255 × 255 → 65 025.",
  6: "Geçici LED'lerle Q ve K: 255 ÷ 7 → Q = 36, K = 3; 100 ÷ 0 → HATA = 1.",
  7: "Geçici LED'leri sök. 255 + 255 → \"   510\"; 12 − 200 → \"-  188\"; 255 × 255 → \" 65025\"; 255 ÷ 7 → \"    36\" kalan \"  3\"; 100 ÷ 0 → HATA yanar. Lamba testinde 14 hane \"8\", işaret \"−\".",
};

// ---------------------------------------------------------------- çizim (ortak: cpu16/board/breadboard/cizim.ts)

/** SIP'ler 10 kΩ × 8; işlem LED'leri yeşil, ötekiler kırmızı */
const CIZIM: CizimSecenekleri = {
  sipYazisi: (p) => `${p.ref} 10 kΩ × 8`,
  ledRengi: (p) => (/ISLEM/.test(p.rol) ? "#3fb34f" : "#e0352b"),
};
const boardCizimi = (plan: BbPlani, b: BbBoard, teller: BbTel[]) => cizim(plan.yerlesim, b, teller, (t) => renkTanimi(t.renk).hex, CIZIM);

// ---------------------------------------------------------------- bölümler

function kapak(plan: BbPlani, o: BbOlcu, eskiTel: number | undefined, tarih: string | undefined): string {
  const { board } = plan.kart;
  const olgu = (b: string, s: string) => `<div class="olgu"><b>${b}</b><span>${s}</span></div>`;
  return `<section class="kapak">
<div class="ust">Silikon3D · 8 bit hesap makinesi · breadboard kurulumu</div>
<h1>8 bit hesap makinesi<br>breadboard'da</h1>
<p class="alt">${o.board} tam boy breadboard (BB830), ${board.chips.length} entegre, ${board.passives.length} pasif eleman; her netin bacakları 5 delikli şeritlerde, şeritler arası ${sayi(o.tel)} atlama teliyle. Teller düz yatar, yalnız yatay ve dikey gider, hiçbir çipin ve telin ucunun üstünden geçmez; her tel delikten deliğe, boyu ve rengiyle yazılıdır.</p>
<div class="olgular">
${olgu(String(o.board), "breadboard (5 × 12)")}
${olgu(String(board.chips.length), "entegre (74HC)")}
${olgu(sayi(o.tel), `atlama teli (${o.rayIc + o.rayArasi} ray köprüsü)`)}
${olgu(`${sayi(o.kesimM, 0)} m`, "tel (kesim boyu, uçlar dahil)")}
${olgu(String(plan.asamalar.length), "aşama, her birinin sonunda test")}
${olgu(`${sayi(o.ortalamaMm)} mm`, `ortalama tel (en uzun ${sayi(o.enUzunMm)} mm)`)}
${olgu(String(o.renkler.length), "tel rengi (sinyal grubu başına)")}
${olgu(`≈ ${sayi(Math.ceil((plan.yerlesim.nx * BW + 30) / 10) * 10)} × ${sayi(Math.ceil((plan.yerlesim.ny * BY_ADIM * ADIM + 30) / 10) * 10)} mm`, "taban plakası")}
</div>
<h3>İçindekiler</h3>
<ol class="icindekiler">
<li>Nasıl okunur: delik adları, raylar, renk kodu, kesim boyu</li>
<li>Board haritası</li>
<li>Aşamalar ve testler</li>
<li>Board board yerleşim (${o.board} çizim)</li>
<li>Tel listesi (T0001–T${String(o.tel).padStart(4, "0")}), aşama aşama</li>
<li>Kesim listesi (renk ve boy)</li>
<li>Malzeme listesi</li>
</ol>
<p class="dipnot">Üretildi${tarih ? ` ${esc(tarih)}` : ""}: <code>npm run hesap8 -- breadboard-belge</code> (kaynak <code>hesap8/breadboard/</code>; yerleşim ve teller <code>veri.ts</code>, bağlantısı birleşim-bul ile netlistle doğrulanır: <code>npm run hesap8 -- breadboard</code>). Uygulamada aynı numaralarla: Silikon3D → 8 bit hesap 3D → Breadboard → Kurulum.${eskiTel ? ` PCB'de pinden pine tel listesi ${sayi(eskiTel)} teldir (<code>npm run cpu16 -- kurulum hesap</code>); breadboard'da her bacak bir şeride oturduğundan teller şeritten şeride gider, besleme bacakları da raya birer kısa telle bağlanır.` : ""}</p>
</section>`;
}

function nasilOkunur(plan: BbPlani, o: BbOlcu): string {
  const renkSatiri = BB_RENKLERI.map((r) => {
    const x = o.renkler.find((q) => q.renk === r.renk);
    return `<tr><td><span class="sw" style="background:${r.hex}"></span><b>${esc(r.ad)}</b></td><td>${esc(r.grup)}</td><td>${esc(r.aciklama)}</td><td class="sag">${x ? sayi(x.sayi) : "—"}</td></tr>`;
  }).join("");
  return `<section class="bolum">
<h2>1. Nasıl okunur</h2>
<h3>Board'lar ve delikler</h3>
<p>Taban plakasında ${plan.yerlesim.nx} sütun × ${plan.yerlesim.ny} sıra board var: <b>BB01</b> sol arka köşe, satır satır soldan sağa, <b>BB${String(plan.yerlesim.boards.length).padStart(2, "0")}</b> sağ ön köşe. Ön kenar (sana yakın) anahtarlar, arka kenar göstergeler. Her board'un adı sol üst köşesine yazılır.</p>
<p>Bir delik <b>board + satır harfi + sütun</b> ile yazılır: <code>BB07 c14</code> = BB07'nin c satırı, 14. sütunu. Her sütunun <b>a–e</b>'si bir şerittir (5 delik, içeriden bağlı), <b>f–j</b>'si ayrı bir şerit; ortadaki kanal (e ile f arası, 7,62 mm) iki yarıyı ayırır. Çipler kanalın üstüne oturur: her bacağın şeridinde 4 boş delik kalır, teller bu deliklere takılır.</p>
<p>Raylar: üstte <code>üst+</code> (dış, kırmızı çizgi) ve <code>üst−</code> (iç, mavi çizgi), altta <code>alt−</code> (iç) ve <code>alt+</code> (dış). Ray delikleri 5'li gruplardır; sütun numarası tam sayı olarak yazılır: <code>BB07 üst+16</code>. Her board'un üst ve alt + rayları, üst ve alt − rayları board'un sağ ucundan ray köprüsüyle bağlıdır; board'lar arası köprüler sıradan sıraya (arka-ön) ve en arka ile en ön sırada yan yana.</p>
<div class="uyari"><b>Varsayım: raylar boydan boya kesintisiz</b> (BB830 türü). Bazı tam boy breadboard'larda her ray ortadan (≈ 30. sütun) bölüktür: öyleyse her rayın iki yarısını ayrıca kısa bir telle köprüle (board başına 4 ek tel, ${plan.yerlesim.boards.length * 4} tel) ya da ray boyunca 5 V'u ölçerek doğrula.</div>
<h3>Teller</h3>
<ul>
<li><b>Numara</b>: T0001 … T${String(o.tel).padStart(4, "0")}, kurulum sırası. Aşama aşama; aşamanın içinde önce ray köprüleri, sonra besleme (kırmızı / siyah), sonra sinyaller, board board soldan sağa. Hiçbir tel başka bir telin ucunun üstünden geçmediği için sıra şart değil, ama bu sırayla eller hep board'un boş yerinde kalır.</li>
<li><b>Nereden → nereye</b>: iki ucun delikleri. Teller yalnız yatay ve dikey gider, köşelerde 90° bükülür; düz yatar, çiplerin ve parçaların üstünden geçmez. Yol, board çizimlerinde gösterilir.</li>
<li><b>mm</b>: delikten deliğe yol boyu. <b>Kes</b>: kesilecek boy = yol + iki uçta 8'er mm (≈ 6 mm soyulmuş uç + 2 mm iniş). Uçları 6 mm soy, 90° bük, deliğe tam bas.</li>
<li><b>Renk</b>: sinyal grubu (aşağıda). Hata ararken telin rengi hangi devreye ait olduğunu söyler.</li>
<li>Teller birbirinin üstünden çoğunlukla dik açıyla geçer (kesişme); aynı çizgide üst üste bindikleri yer toplam yolun %1'inden azdır. Önce takılan tel altta kalır; hiçbir tel bir tel ucunun üstünden geçmediğinden sonradan bir teli söküp yenisini takmak kolaydır.</li>
</ul>
<h3>Renk kodu</h3>
<table class="tablo"><thead><tr><th style="width:26mm">Renk</th><th style="width:24mm">Grup</th><th>Hangi teller</th><th class="sag" style="width:14mm">Tel</th></tr></thead><tbody>${renkSatiri}</tbody></table>
<p class="muted kucuk">Kahverengi LED telleri içindir; bu yerleşimde LED'ler dirençleriyle aynı şeritlere oturduğundan kahverengi tel yoktur.</p>
<h3>Parçalar</h3>
<ul>
<li><b>Çipler</b>: çentik solda, 1. bacak sol altta (f satırında), son bacak sol üstte (e satırında). Her çipin 100 nF'ı üst ray çiftinin arasında, çipin VCC bacağının (sol üst) hemen yanındaki ray sütununda (bir bacağı <code>üst+</code>, öbürü <code>üst−</code>).</li>
<li><b>Göstergeler</b> (ortak katot, 0,56"): 1–5. bacaklar h satırında, 6–10. bacaklar d satırında (15,24 mm); her hanenin solunda 470 Ω dizisi (DIP-16).</li>
<li><b>10 kΩ SIP dizileri</b> (RN1–RN3): d satırında, <b>1. bacak (nokta, ortak uç) sağda</b>; ortak uç GND'ye gider.</li>
<li><b>LED'ler</b>: 330 Ω kanalın üstünden (e → f), LED'in uzun bacağı (anot) j satırında, kısa bacağı (katot) <code>alt−</code> rayında.</li>
<li><b>Besleme</b>: J1 (1. pin +5 V <code>alt+</code>, 2. pin GND <code>alt−</code>) ve 100 µF (+ ucu <code>alt+</code>) BB${String(plan.yerlesim.boards.find((x) => x.rol.startsWith("Giriş: işlem"))!.no + 1).padStart(2, "0")}'de.</li>
</ul>
</section>`;
}

function harita(plan: BbPlani): string {
  const y = plan.yerlesim;
  const W = 52, H = 17;
  const s: string[] = [];
  for (const b of y.boards) {
    const x = b.bx * (W + 1.5), yy = b.by * (H + 1.5) + 7;
    s.push(`<rect x="${x}" y="${yy}" width="${W}" height="${H}" rx="1" fill="${ASAMA_RENGI[b.asama - 1]}" stroke="#777" stroke-width="0.25"/>`);
    s.push(`<text x="${x + 1.5}" y="${yy + 4}" font-size="3.2" font-weight="700" fill="#333">${b.ad}</text>`);
    const rol = b.rol.replace(/^Gösterge: /, "Gösterge ").replace(/^Onluğa çevirme: /, "Onluk ").replace(/^Sürücüler: /, "Sürücü ");
    s.push(`<text x="${x + 1.5}" y="${yy + 8.5}" font-size="2.4" fill="#333">${esc(rol.length > 34 ? `${rol.slice(0, 33)}…` : rol)}</text>`);
    const cipler = y.parcalar.filter((p) => p.board === b.no && p.cipMi).length;
    const diger = y.parcalar.filter((p) => p.board === b.no && !p.cipMi && p.tur !== "kondansator").length;
    s.push(`<text x="${x + 1.5}" y="${yy + 13}" font-size="2.2" fill="#666">${cipler} çip${diger ? ` · ${diger} parça` : ""} · ${b.asama}. aşama</text>`);
  }
  const w = y.nx * (W + 1.5);
  const h = y.ny * (H + 1.5) + 14;
  s.push(`<text x="${w / 2}" y="4" font-size="3" text-anchor="middle" fill="#555">arka kenar: göstergeler</text>`);
  s.push(`<text x="${w / 2}" y="${h - 2}" font-size="3" text-anchor="middle" fill="#555">ön kenar (sana yakın): anahtarlar</text>`);
  const lejant = plan.asamalar.map((a) => `<span><span class="bk" style="background:${ASAMA_RENGI[a.no - 1]}"></span>${a.no}. ${esc(a.ad)}</span>`).join("");
  return `<section class="bolum">
<h2>2. Board haritası</h2>
<p>Veri akışı önden arkaya: anahtarlar (ön kenar) → toplama, çarpma, bölme → sonuç seçici → ikilikten onluğa çevirme → 74HC4511 sürücüler → göstergeler (arka kenar). A ve B'nin onluk göstergeleri solda, sonucunki ortada, kalanınki sağda. Board başına en çok 5 çip; çiplerin arasında tellere yer kalır.</p>
<div class="lejant">${lejant}</div>
<figure class="harita"><svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 0 ${w + 1} ${h}" width="186mm" font-family="DejaVu Sans, Arial, sans-serif">${s.join("")}</svg>
<figcaption>Board'lar, işleri ve takıldıkları aşama. Üstten bakış; BB01 sol arka köşe.</figcaption></figure>
</section>`;
}

function asamalar(plan: BbPlani): string {
  const rows = plan.asamalar.map((a) => {
    const t = plan.teller.filter((x) => x.asama === a.no);
    const boards = plan.yerlesim.boards.filter((b) => b.asama === a.no).map((b) => b.ad);
    const parca = plan.yerlesim.parcalar.filter((p) => p.asama === a.no);
    return `<tr><td><b>${a.no}. ${esc(a.ad)}</b><br><span class="pa">${esc(a.bloklar.join(", "))}</span></td>
<td class="mono kucuk">${boards.join(" ")}</td>
<td class="sag">${parca.filter((p) => p.cipMi).length}<br><span class="pa">${parca.filter((p) => !p.cipMi).length} pasif</span></td>
<td class="mono">${telNo(t[0])}–${telNo(t[t.length - 1])}<br><span class="pa">${sayi(t.length)} tel</span></td>
<td class="kucuk">${esc(ASAMA_TESTI[a.no] ?? "")}</td></tr>`;
  }).join("");
  return `<section class="bolum">
<h2>3. Aşamalar ve testler</h2>
<p>Her aşamada o aşamanın board'larına parçaları tak (çipler, 100 nF'lar, pasifler), sonra tellerini listedeki sırayla tak, sonra testi yap. Her aşamanın sonunda o ana kadar takılan her netin bütün bacakları bağlıdır (doğrulanmıştır): test, yalnız o aşamanın devresini dener. Ayrıntılı test tabloları ve sorun giderme: <code>hesap8/docs/kurulum-rehberi.md</code>.</p>
<div class="not">Besleme vermeden önce her aşamada: çiplerin yönü (çentik solda), VCC–GND arasında kısa devre yok (multimetre, ohm), raylarda 5 V. İlk açılışta akımı ölç: anahtarlar dururken &lt; 0,4 A.</div>
<table class="tablo"><thead><tr><th style="width:44mm">Aşama</th><th style="width:40mm">Board'lar</th><th class="sag" style="width:13mm">Çip</th><th style="width:26mm">Teller</th><th>Test</th></tr></thead><tbody>${rows}</tbody></table>
</section>`;
}

function boardBolumu(plan: BbPlani): string {
  const y = plan.yerlesim;
  const out: string[] = [];
  for (const b of y.boards) {
    const teller = plan.teller.filter((t) => boardaDegiyor(t, b));
    const parcalar = y.parcalar.filter((p) => p.board === b.no && p.tur !== "kondansator").sort((p, q) => p.sutun - q.sutun);
    const satir = parcalar.map((p) => {
      const x = p.cipMi ? plan.kart.board.chips.find((c) => c.ref === p.ref) : undefined;
      const baslik = x ? `${x.def.part} · ${x.def.title}` : `${PASSIVES[p.part]?.title ?? p.part}`;
      const b1 = p.bacaklar.find((k) => k.pin === 1) ?? p.bacaklar[0];
      return `<tr><td class="ref">${esc(p.ref)}</td><td>${esc(baslik)}</td><td class="mono">${esc(ucEtiketi(y, b1.X, b1.Y).split(" ")[1])}</td><td class="pa">${esc(p.rol)}</td></tr>`;
    }).join("");
    const kendi = plan.teller.filter((t) => noktaBoardu(y, t.yol[0], t.yol[1]) === b.no || noktaBoardu(y, t.yol[t.yol.length - 2], t.yol[t.yol.length - 1]) === b.no).length;
    out.push(`<article class="board">
<h3>${b.ad} · ${esc(b.rol)} <span class="muted kucuk">(${b.asama}. aşama · ${y.parcalar.filter((p) => p.board === b.no && p.cipMi).length} çip · bu board'da ucu olan ${kendi} tel)</span></h3>
<figure class="harita">${boardCizimi(plan, b, teller)}</figure>
${satir ? `<table class="tablo kucuk"><thead><tr><th style="width:14mm">Parça</th><th>Ne</th><th style="width:16mm">1. bacak</th><th>Görevi</th></tr></thead><tbody>${satir}</tbody></table>` : `<p class="muted kucuk">Bu board'da parça yok: rayları (ray köprüleriyle) ve yanından geçen telleri taşır; taban dikdörtgen kalsın, teller board'ların üstünde yatsın diye yerinde.</p>`}
</article>`);
  }
  return `<section class="bolum">
<h2>4. Board board yerleşim</h2>
<p>Her board üstten, ön kenar aşağıda. Çipler koyu (çentik solda, nokta 1. bacak), DIP anahtarlar mavi, 470 Ω diziler gri, göstergeler büyük koyu kutular; 100 nF'lar üst rayların arasında turuncu. Teller kendi renginde (beyaz teller ince koyu kenarlı), uçları yuvarlak; board dışına çıkan teller kenarda kesilir. Tablo: parçalar soldan sağa, 1. bacağının deliği.</p>
${out.join("\n")}
</section>`;
}

function telListesi(plan: BbPlani): string {
  const y = plan.yerlesim;
  const rows: string[] = [];
  for (const a of plan.asamalar) {
    const t = plan.teller.filter((x) => x.asama === a.no);
    rows.push(`<tr class="blokbas"><td colspan="8">${a.no}. aşama · ${esc(a.ad)} · ${telNo(t[0])}–${telNo(t[t.length - 1])} · ${sayi(t.length)} tel</td></tr>`);
    for (const x of t) {
      const n = x.yol.length;
      rows.push(`<tr><td>${kutu}</td><td class="id">${telNo(x)}</td><td class="ucn mono">${esc(ucEtiketi(y, x.yol[0], x.yol[1]))}</td><td class="ucn mono">${esc(ucEtiketi(y, x.yol[n - 2], x.yol[n - 1]))}</td><td class="sag">${Math.round(x.uzunluk)}</td><td class="sag">${x.kesim}</td><td>${renkKutusu(x)}</td><td class="net">${x.ray ? "ray köprüsü" : esc(x.ad)}</td></tr>`);
    }
    rows.push(`<tr><td colspan="8" class="kucuk"><b>Aşama ${a.no} testi:</b> ${esc(ASAMA_TESTI[a.no] ?? "")}</td></tr>`);
  }
  return `<section class="bolum">
<h2>5. Tel listesi</h2>
<p>Kutuyu tel takılınca işaretle. Nereden / nereye: delik (board, satır, sütun; raylar üst+ / üst− / alt− / alt+). mm: delikten deliğe; kes: kesilecek boy. Net: telin taşıdığı sinyal (simülatörde, şemada ve uygulamada aynı ad).</p>
<table class="tablo teller"><thead><tr><th style="width:5mm"></th><th style="width:12mm">No</th><th style="width:26mm">Nereden</th><th style="width:26mm">Nereye</th><th class="sag" style="width:10mm">mm</th><th class="sag" style="width:10mm">kes</th><th style="width:22mm">Renk</th><th>Net</th></tr></thead><tbody>${rows.join("\n")}</tbody></table>
</section>`;
}

/** Kesim boyları 5 mm'ye yuvarlanır (yukarı) */
const kesimSinifi = (mm: number) => Math.ceil(mm / 5) * 5;

function kesimListesi(plan: BbPlani, o: BbOlcu): string {
  const bloklar = o.renkler.map((r) => {
    const boy = new Map<number, number>();
    for (const t of plan.teller) if (t.renk === r.renk) boy.set(kesimSinifi(t.kesim), (boy.get(kesimSinifi(t.kesim)) ?? 0) + 1);
    const hucre = [...boy].sort((a, b) => a[0] - b[0]).map(([mm, n]) => `<span class="kesim"><b>${mm}</b> × ${n}</span>`).join(" ");
    const tn = renkTanimi(r.renk);
    return `<tr><td><span class="sw" style="background:${tn.hex}"></span><b>${esc(tn.ad)}</b><br><span class="pa">${sayi(r.sayi)} tel · ${sayi(r.kesimM, 1)} m</span></td><td class="kesimler">${hucre}</td></tr>`;
  }).join("");
  return `<section class="bolum">
<h2>6. Kesim listesi</h2>
<p>Renk renk, kesim boyu (mm, 5 mm'ye yukarı yuvarlanmış) × adet. Önce bir rengin bütün tellerini kesip soy, boylarına göre ayrı kaplara koy; tel listesindeki "kes" sütunu her telin tam boyudur. Kesim boyu = delikten deliğe yol + 16 mm.</p>
<table class="tablo"><thead><tr><th style="width:30mm">Renk</th><th>Boy (mm) × adet</th></tr></thead><tbody>${bloklar}</tbody></table>
<h3>Boy dağılımı</h3>
<table class="tablo"><thead><tr>${o.dagilim.map(([s], i) => `<th class="sag">${i ? o.dagilim[i - 1][0] : 0}–${s === Infinity ? "" : s} mm</th>`).join("")}</tr></thead>
<tbody><tr>${o.dagilim.map(([, n]) => `<td class="sag">${sayi(n)}</td>`).join("")}</tr></tbody></table>
</section>`;
}

function malzeme(plan: BbPlani, o: BbOlcu): string {
  const { board } = plan.kart;
  const say = <T,>(xs: T[], k: (x: T) => string) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(k(x), (m.get(k(x)) ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  };
  const cipler = say(board.chips, (c) => c.def.part).map(([p, n]) => `<tr><td class="ref">${esc(p)}</td><td>${esc(board.chips.find((c) => c.def.part === p)!.def.title)}</td><td class="sag">${n}</td></tr>`).join("");
  const pasifler = say(board.passives, (p) => p.part).map(([p, n]) => `<tr><td class="ref">${esc(p)}</td><td>${esc(PASSIVES[p]?.title ?? p)}</td><td class="sag">${n}</td></tr>`).join("");
  const teller = o.renkler.map((r) => {
    const tn = renkTanimi(r.renk);
    return `<tr><td><span class="sw" style="background:${tn.hex}"></span>${esc(tn.ad)}</td><td>${esc(tn.grup)}</td><td class="sag">${sayi(r.sayi)}</td><td class="sag">${sayi(r.kesimM, 1)} m</td><td class="sag"><b>${Math.ceil(r.kesimM * 1.15)} m</b></td></tr>`;
  }).join("");
  const plakaW = Math.ceil((plan.yerlesim.nx * BW + 30) / 10) * 10;
  const plakaH = Math.ceil((plan.yerlesim.ny * BY_ADIM * ADIM + 30) / 10) * 10;
  return `<section class="bolum">
<h2>7. Malzeme listesi</h2>
<h3>Breadboard ve taban</h3>
<table class="tablo"><thead><tr><th>Ne</th><th class="sag" style="width:20mm">Adet</th></tr></thead><tbody>
<tr><td><b>Tam boy breadboard, 830 delik</b> (BB830 türü: 63 sütun, a–e / f–j, üstte ve altta ikişer ray, <b>raylar kesintisiz</b>; arkası yapışkanlı)</td><td class="sag">${o.board}</td></tr>
<tr><td>Taban plakası ≈ ${plakaW} × ${plakaH} mm (10 mm kontrplak ya da MDF): board'lar ${plan.yerlesim.nx} × ${plan.yerlesim.ny}, yan yana bitişik, sıralar arasında ≈ 1,3 mm</td><td class="sag">1</td></tr>
<tr><td>Ray köprüleri (tel listesinde, kırmızı / siyah): board içi (üst ↔ alt ray çifti) ${o.rayIc}, board'lar arası ${o.rayArasi}</td><td class="sag">${o.rayIc + o.rayArasi}</td></tr>
<tr><td>5 V, en az 2 A adaptör (lamba testinde ≈ 0,6 A) ve J1'e uyan 2 pinli başlık / klemens</td><td class="sag">1</td></tr>
</tbody></table>
<h3>Atlama teli (22 AWG, 0,64 mm tek damarlı)</h3>
<table class="tablo"><thead><tr><th style="width:26mm">Renk</th><th>Grup</th><th class="sag" style="width:14mm">Tel</th><th class="sag" style="width:20mm">Kesim</th><th class="sag" style="width:24mm">Al (+%15)</th></tr></thead><tbody>${teller}
<tr><td colspan="2"><b>Toplam</b></td><td class="sag"><b>${sayi(o.tel)}</b></td><td class="sag"><b>${sayi(o.kesimM, 1)} m</b></td><td class="sag"><b>${o.renkler.reduce((a, r) => a + Math.ceil(r.kesimM * 1.15), 0)} m</b></td></tr></tbody></table>
<h3>Entegreler</h3>
<table class="tablo"><thead><tr><th style="width:24mm">Parça</th><th>Ne</th><th class="sag" style="width:14mm">Adet</th></tr></thead><tbody>${cipler}
<tr><td colspan="2"><b>Toplam</b> (${board.chips.filter((c) => c.def.pins.length === 14).length} × DIP-14, ${board.chips.filter((c) => c.def.pins.length === 16).length} × DIP-16)</td><td class="sag"><b>${board.chips.length}</b></td></tr></tbody></table>
<h3>Pasif elemanlar, anahtarlar, göstergeler</h3>
<table class="tablo"><thead><tr><th style="width:24mm">Parça</th><th>Ne</th><th class="sag" style="width:14mm">Adet</th></tr></thead><tbody>${pasifler}</tbody></table>
<h3>Aletler</h3>
<p>Tel sıyırıcı (22 AWG), yan keski, ince uçlu pense (telleri 90° bükmek ve yatırmak için), multimetre (süreklilik ve gerilim), cetvel ya da kesim şablonu (5 mm adımlı).</p>
</section>`;
}

const EK_STIL = `
article.board { break-inside: avoid; margin: 0 0 5mm; }
article.board h3 { margin-top: 2mm; }
.kesimler { line-height: 1.9; }
.kesim { display: inline-block; border: 0.25mm solid var(--line); border-radius: 0.8mm; padding: 0 1.2mm; margin: 0 0.6mm 0.6mm 0; font-family: var(--mono); font-size: 7.6pt; white-space: nowrap; }
`;

export interface BelgeSecenekleri {
  /** PCB'deki pinden pine tel sayısı (karşılaştırma için kapakta) */
  eskiTel?: number;
  /** üretim tarihi (kapakta) */
  tarih?: string;
}

/** Breadboard kurulum belgesi (tek HTML) */
export function bbBelgesi(plan: BbPlani, o: BelgeSecenekleri = {}): string {
  const olcu = bbOlcu(plan);
  const govde = [kapak(plan, olcu, o.eskiTel, o.tarih), nasilOkunur(plan, olcu), harita(plan), asamalar(plan), boardBolumu(plan), telListesi(plan), kesimListesi(plan, olcu), malzeme(plan, olcu)].join("\n");
  return htmlBelge("8 bit hesap makinesi · breadboard kurulumu", govde, "60 breadboard, atlama telleri delikten deliğe, aşama aşama").replace("</style>", `${EK_STIL}</style>`);
}
