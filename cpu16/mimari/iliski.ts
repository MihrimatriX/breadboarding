// Diyagramda kim kime bağlı: uygulamada üstüne gelinen ya da seçilen kutunun yollarını, yolun
// uçlarını vurgulamak ve yan panelde listelemek için. Yolun ucu bir çerçeveyse (makinede bir kart),
// çerçevenin içindeki kutulardan yolun netlerine gerçekten değenler de uç sayılır; yönleri devreden
// (sürüyor mu, okuyor mu) bulunur. Böylece makinede "CPU kartı → adres yolu" bağlantısı, CPU
// kartının içinde adresi süren MAR kutusuna iner.

import { ucBloklari } from "./cizim.ts";
import { ucDurumu } from "./denetim.ts";
import type { Devre, Diyagram, Yon } from "./model.ts";

export interface Baglanti {
  /** kutu ya da çerçeve kimliği */
  kutu: string;
  yol: string;
  yon: Yon;
  /** çerçevenin içinden bulunan uç (yolda doğrudan yazılı değil) */
  dolayli: boolean;
}

export interface Iliski {
  /** kutu / çerçeve → bağlı olduğu yollar (diyagramdaki sırasıyla) */
  yollari: Map<string, Baglanti[]>;
  /** yol → uçları (doğrudan yazılanlar önce) */
  uclari: Map<string, Baglanti[]>;
  /** kutu → içinde durduğu çerçeve */
  cercevesi: Map<string, string>;
  /** çerçeve → içindeki kutular */
  icindekiler: Map<string, string[]>;
}

const ekle = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const l = m.get(k);
  if (l) l.push(v);
  else m.set(k, [v]);
};

/** Uç durumundan yön: hem sürüp hem okuyorsa iki yönlü (yalnız pasif bağlantı da iki yönlü sayılır) */
const durumdanYon = (d: { surer: boolean; okur: boolean }): Yon => (d.surer && d.okur ? "iki" : d.surer ? "cikis" : d.okur ? "giris" : "iki");

export function iliskiKur(dg: Diyagram, devre: Devre): Iliski {
  const il: Iliski = { yollari: new Map(), uclari: new Map(), cercevesi: new Map(), icindekiler: new Map() };
  for (const g of dg.gruplar) {
    il.icindekiler.set(g.id, [...g.kutular]);
    for (const k of g.kutular) il.cercevesi.set(k, g.id);
  }
  for (const y of dg.yollar) {
    const dogrudan = new Set(y.uclar.map((u) => u.kutu));
    for (const u of y.uclar) {
      const b: Baglanti = { kutu: u.kutu, yol: y.id, yon: u.yon, dolayli: false };
      ekle(il.uclari, y.id, b);
      ekle(il.yollari, u.kutu, b);
    }
    for (const u of y.uclar) {
      for (const k of il.icindekiler.get(u.kutu) ?? []) {
        if (dogrudan.has(k)) continue;
        const d = ucDurumu(devre, y.netler, ucBloklari(dg, k));
        if (!d.surer && !d.okur && !d.pasif) continue;
        const b: Baglanti = { kutu: k, yol: y.id, yon: durumdanYon(d), dolayli: true };
        ekle(il.uclari, y.id, b);
        ekle(il.yollari, k, b);
      }
    }
  }
  return il;
}

/** Vurgulanacaklar: bir kutu / çerçeve ya da yol ve onunla bağlantılı olanlar */
export interface Vurgu {
  kutular: Set<string>;
  yollar: Set<string>;
}

export function vurgula(il: Iliski, hedef: { tur: "kutu" | "yol"; id: string }): Vurgu {
  const kutular = new Set<string>();
  const yollar = new Set<string>();
  const kutuEkle = (id: string) => {
    kutular.add(id);
    const c = il.cercevesi.get(id);
    if (c) kutular.add(c);
  };
  if (hedef.tur === "yol") {
    yollar.add(hedef.id);
    for (const b of il.uclari.get(hedef.id) ?? []) kutuEkle(b.kutu);
    return { kutular, yollar };
  }
  kutuEkle(hedef.id);
  // çerçeve: içindeki kutular da
  for (const k of il.icindekiler.get(hedef.id) ?? []) kutular.add(k);
  for (const b of il.yollari.get(hedef.id) ?? []) {
    yollar.add(b.yol);
    // yolun öbür uçları: yalnız yolda yazılı olanlar (makinede kart çerçeveleri; içlerindeki kutular
    // soluk kalır, yoksa bir veri yolu bütün diyagramı aydınlatırdı)
    for (const u of il.uclari.get(b.yol) ?? []) if (!u.dolayli) kutuEkle(u.kutu);
  }
  return { kutular, yollar };
}
