// Diyagramın devreye uygunluğu: testler (cpu16/tests/mimari.test.ts, hesap8/tests/mimari.test.ts)
// her diyagram için bu denetimlerin boş liste döndürmesini ister.
//
//  1. Bloklar: diyagramın kapsadığı kartların her bloğu (çip ya da pasif taşıyan) tam bir kutuda ya da
//     çerçevede; tanımdaki her blok devrede var; bölmeli kutularda her parça tam bir bölmede.
//  2. Yollar: her net devrede var; her uç (kutu ya da çerçeve) yolun netlerinden en az birine bağlı ve
//     ok yönü pinlerle uyumlu: "çıkış" kutusu netlerden birini sürer, "giriş" kutusu okur ama sürmez,
//     "iki yönlü" ikisini de yapar. Yalnız konnektör taşıyan uçlarda (arka panel) yön pinlerden
//     çıkmaz, bağlı olması yeter. Dış cihaz uçlarında karşı kutuda o netlere bağlı bir konnektör olmalı;
//     konnektörlü kutunun yönü, konnektörün hatlarını kartın sürdüğü / okuduğu pinlerden.
//     Bit sayısı yazılan yolun net sayısı o kadar.
//  3. Sayılar: kutuda yazan parça listesi ve adetleri, "+ N kapı" satırı, çerçeve başlığındaki entegre
//     sayısı devreden bağımsız olarak (Board.chips üzerinden) yeniden sayılanla aynı.
//  4. Yerleşim: sahnenin hata listesi (sığmayan yazı, boşta kalan kol ucu) boş.

import { partValue, type Board, type ChipInstance, type Passive } from "../board/board.ts";
import { ucBloklari, type SMetin } from "./cizim.ts";
import type { KuruluDiyagram } from "./index.ts";
import { Devre, gosterilenPasif, pasifAdi, type BlokKimligi, type Diyagram } from "./model.ts";

const anahtar = (b: BlokKimligi) => `${b.card}/${b.block}`;

/** Diyagramın kapsadığı kartlar: kutularındaki ve çerçevelerindeki blokların kartları */
export function diyagramKartlari(dg: Diyagram): string[] {
  const s = new Set<string>();
  for (const k of dg.kutular) for (const b of k.bloklar) s.add(b.card);
  for (const g of dg.gruplar) for (const b of g.bloklar ?? []) s.add(b.card);
  return [...s];
}

/** 1. Her blok tam bir yerde */
export function blokDenetimi(dg: Diyagram, devre: Devre): string[] {
  const hatalar: string[] = [];
  const yerler = new Map<string, string[]>();
  const ekle = (b: BlokKimligi, yer: string) => {
    const k = anahtar(b);
    yerler.set(k, [...(yerler.get(k) ?? []), yer]);
  };
  for (const k of dg.kutular) for (const b of k.bloklar) ekle(b, k.id);
  for (const g of dg.gruplar) for (const b of g.bloklar ?? []) ekle(b, g.id);
  const var_ = new Set(devre.bloklar.map(anahtar));
  for (const [k, l] of yerler) {
    if (!var_.has(k)) hatalar.push(`devrede olmayan blok: ${k} (${l.join(", ")})`);
    if (l.length > 1) hatalar.push(`blok birden çok yerde: ${k} (${l.join(", ")})`);
  }
  const kartlar = diyagramKartlari(dg);
  for (const b of devre.bloklar) {
    if (kartlar.includes(b.card) && !yerler.has(anahtar(b))) hatalar.push(`blok diyagramda yok: ${anahtar(b)}`);
  }
  // bölmeler: her parça tam bir bölmede (bölmelerin parçaları toplanınca kutunun parçaları, eksiksiz ve tekrarsız)
  for (const k of dg.kutular) {
    if (!k.bolmeler?.length) continue;
    const coklu = (p: ReturnType<Devre["parcalar"]>, m: Map<string, number>) => {
      const ekle = (x: string) => m.set(x, (m.get(x) ?? 0) + 1);
      for (const c of p.cipler) ekle(`${c.ref}`);
      for (const c of p.pasifler) ekle(`${c.ref}`);
      for (const c of p.kapilar) ekle(`${c.ref} kapısı (${c.block}: ${c.role})`);
      return m;
    };
    const kutuda = coklu(devre.parcalar(k.bloklar), new Map());
    const bolmelerde = new Map<string, number>();
    for (const b of k.bolmeler) {
      if (b.bloklar) for (const ad of b.bloklar) if (!k.bloklar.some((x) => x.block === ad)) hatalar.push(`${k.id}/${b.ad}: bölmenin bloğu kutuda yok: ${ad}`);
      const bb = b.bloklar ? k.bloklar.filter((x) => b.bloklar!.includes(x.block)) : k.bloklar;
      coklu(devre.parcalar(bb, b.rol), bolmelerde);
    }
    for (const [x, n] of kutuda) if (bolmelerde.get(x) !== n) hatalar.push(`${k.id}: ${x} kutuda ${n}, bölmelerde ${bolmelerde.get(x) ?? 0} kez`);
    for (const [x, n] of bolmelerde) if (!kutuda.has(x)) hatalar.push(`${k.id}: ${x} bölmelerde ${n} kez, kutuda yok`);
  }
  return hatalar;
}

/** Bir uç bloklarının yol netlerindeki durumu */
export function ucDurumu(devre: Devre, netler: readonly string[], bloklar: readonly BlokKimligi[]) {
  let surer = false;
  let okur = false;
  let pasif = false;
  for (const ad of netler) {
    const n = devre.net(ad);
    if (n === undefined) continue;
    for (const u of devre.netUclari(n)) {
      if (!Devre.blokta(u, bloklar)) continue;
      if (u.dir === "passive") pasif = true;
      else {
        if (u.dir !== "in") surer = true;
        if (u.dir === "in" || u.dir === "bidir") okur = true;
      }
    }
  }
  return { surer, okur, pasif };
}

/** 2. Yolların netleri ve uçlarının yönleri */
export function yolDenetimi(dg: Diyagram, devre: Devre): string[] {
  const hatalar: string[] = [];
  const kutu = (id: string) => dg.kutular.find((k) => k.id === id);
  for (const y of dg.yollar) {
    if (!y.netler.length) hatalar.push(`${y.id}: net yok`);
    for (const ad of y.netler) if (devre.net(ad) === undefined) hatalar.push(`${y.id}: devrede olmayan net ${ad}`);
    if (y.bit !== undefined && y.bit !== y.netler.length) hatalar.push(`${y.id}: ${y.bit} bit yazıyor, ${y.netler.length} net taşıyor`);
    if (y.uclar.length < 2) hatalar.push(`${y.id}: en az iki uç olmalı`);
    if (!y.uclar.some((u) => u.yon !== "giris")) hatalar.push(`${y.id}: süren uç yok`);
    if (!y.uclar.some((u) => u.yon !== "cikis")) hatalar.push(`${y.id}: okuyan uç yok`);
    for (const u of y.uclar) {
      const k = kutu(u.kutu);
      if (!k && !dg.gruplar.some((g) => g.id === u.kutu)) {
        hatalar.push(`${y.id}: uç yok: ${u.kutu}`);
        continue;
      }
      if (k?.cihaz) {
        // dış cihaz: karşı uçlardan birinde bu netlere bağlı konnektör olmalı
        const konnektor = y.uclar.some((v) => {
          if (v === u) return false;
          const bl = ucBloklari(dg, v.kutu);
          return y.netler.some((ad) => {
            const n = devre.net(ad);
            return n !== undefined && devre.netUclari(n).some((x) => x.dir === "passive" && /^CONN/.test(x.part) && Devre.blokta(x, bl));
          });
        });
        if (!konnektor) hatalar.push(`${y.id}: ${u.kutu} cihazına giden netlerde konnektör yok`);
        continue;
      }
      // konnektör taşıyan uç (dış bağlantı): konnektörün hatlarını kartın hangi bloğu sürüyor ya da
      // okuyorsa o (ör. UART RX'i G/Ç kartının Schmitt tetikleyicisi okur)
      let bl = ucBloklari(dg, u.kutu);
      const konnektorlu = y.netler.some((ad) => {
        const n = devre.net(ad);
        return n !== undefined && devre.netUclari(n).some((x) => x.dir === "passive" && /^CONN/.test(x.part) && Devre.blokta(x, bl));
      });
      if (konnektorlu) bl = devre.kartBloklari(bl[0].card);
      const d = ucDurumu(devre, y.netler, bl);
      if (!d.surer && !d.okur) {
        if (!d.pasif) hatalar.push(`${y.id}: ${u.kutu} yolun hiçbir netine bağlı değil`);
        continue;
      }
      if (u.yon === "cikis" && !d.surer) hatalar.push(`${y.id}: ${u.kutu} çıkış ama hiçbir neti sürmüyor`);
      if (u.yon === "giris" && !d.okur) hatalar.push(`${y.id}: ${u.kutu} giriş ama hiçbir neti okumuyor`);
      if (u.yon === "giris" && d.surer) hatalar.push(`${y.id}: ${u.kutu} giriş gösteriliyor ama netlerden birini sürüyor`);
      if (u.yon === "iki" && !(d.surer && d.okur)) hatalar.push(`${y.id}: ${u.kutu} iki yönlü ama ${d.surer ? "okumuyor" : "sürmüyor"}`);
    }
  }
  return hatalar;
}

// ---------------------------------------------------------------- 3. sayılar (devreden bağımsız sayım)

const sayimMetinleri = (parcalar: string[]): string[] => {
  const m = new Map<string, number>();
  for (const p of parcalar) m.set(p, (m.get(p) ?? 0) + 1);
  return [...m].map(([p, n]) => (n > 1 ? `${p} ×${n}` : p)).sort();
};

/** Kutudaki "parca" satırlarından parça → adet */
function yazilanParcalar(metinler: SMetin[], sinif: SMetin["s"]): string[] {
  return metinler
    .filter((m) => m.s === sinif)
    .map((m) => m.m.replace(/,$/, ""))
    .join(", ")
    .split(", ")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Yazılan "a ×3", "b" listelerini birleştir (bölmeler arası): parça → toplam adet */
function topla(liste: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of liste) {
    const r = /^(.*?)(?: ×(\d+))?$/.exec(x)!;
    m.set(r[1], (m.get(r[1]) ?? 0) + Number(r[2] ?? 1));
  }
  return m;
}

const esit = (a: Map<string, number>, b: Map<string, number>) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
const yaz = (m: Map<string, number>) => [...m].sort().map(([k, v]) => `${k} ×${v}`).join(", ");

/** 3. Kutularda ve çerçevelerde yazan sayılar */
export function sayiDenetimi(k: KuruluDiyagram): string[] {
  const { diyagram: dg, sahne, devre } = k;
  const board: Board = devre.board;
  const hatalar: string[] = [];
  const blokta = (card: string, block: string, bl: readonly BlokKimligi[]) => bl.some((b) => b.card === card && b.block === block);
  for (const kt of dg.kutular) {
    if (kt.cihaz) continue;
    const sk = sahne.kutular.find((x) => x.id === kt.id)!;
    // entegreler: Board.chips doğrudan
    const cipler: ChipInstance[] = board.chips.filter((c) => blokta(c.card, c.block, kt.bloklar));
    const beklenen = topla(sayimMetinleri(cipler.map((c) => partValue(c))));
    const yazilan = topla(yazilanParcalar(sk.metinler, "parca"));
    if (!esit(beklenen, yazilan)) hatalar.push(`${kt.id}: yazan parçalar [${yaz(yazilan)}], devrede [${yaz(beklenen)}]`);
    // gösterilen pasifler
    const pasifler: Passive[] = board.passives.filter((p) => blokta(p.card, p.block, kt.bloklar) && gosterilenPasif(p.part));
    const bp = topla(sayimMetinleri(pasifler.map((p) => pasifAdi(p.part))));
    const yp = topla(yazilanParcalar(sk.metinler, "pasif"));
    if (!esit(bp, yp)) hatalar.push(`${kt.id}: yazan pasifler [${yaz(yp)}], devrede [${yaz(bp)}]`);
    // yapıştırıcı kapıları
    if (kt.rol !== "not") {
      let kapi = 0;
      for (const c of board.chips) for (const u of c.glueUnits ?? []) if (blokta(c.card, u.block, kt.bloklar)) kapi++;
      const yazan = sk.metinler.filter((m) => m.s === "kapi").reduce((s, m) => s + Number(/^\+ (\d+) kapı/.exec(m.m)?.[1] ?? NaN), 0);
      if (kapi !== yazan) hatalar.push(`${kt.id}: ${yazan} kapı yazıyor, devrede ${kapi}`);
    }
  }
  for (const g of dg.gruplar) {
    const sg = sahne.gruplar.find((x) => x.id === g.id)!;
    const ek = sg.metinler.find((m) => m.s === "grup-ek")?.m ?? "";
    if (g.ek) continue;
    const bl = ucBloklari(dg, g.id);
    const toplam = board.chips.filter((c) => blokta(c.card, c.block, bl)).length;
    const kendi = board.chips.filter((c) => blokta(c.card, c.block, g.bloklar ?? [])).length;
    if (!ek.startsWith(`${toplam} entegre`)) hatalar.push(`${g.id}: başlıkta "${ek}", devrede ${toplam} entegre`);
    if (kendi && !ek.includes(`· ${kendi} `)) hatalar.push(`${g.id}: başlıkta "${ek}", kendi bloklarında ${kendi} entegre`);
    // kart çerçevesi bütün kartı kapsıyorsa sayı kartın bütün entegreleri
    const kartlar = new Set(bl.map((b) => b.card));
    if (kartlar.size === 1) {
      const card = [...kartlar][0];
      const kartToplam = board.chips.filter((c) => c.card === card).length;
      if (toplam !== kartToplam) hatalar.push(`${g.id}: çerçevede ${toplam} entegre, kartta ${kartToplam}`);
    }
  }
  return hatalar;
}

/** Bütün denetimler */
export function diyagramiDenetle(k: KuruluDiyagram): string[] {
  return [...k.sahne.hatalar, ...blokDenetimi(k.diyagram, k.devre), ...yolDenetimi(k.diyagram, k.devre), ...sayiDenetimi(k)];
}
