// Rehberin görselleri: cpu16/kit/gorseller/*.svg. cizim.ts'in açık paletli çizimleri; LED'ler, seri
// dirençleri ve sürücüleri bilgisayarın şemasından okunur, şema değişince görseller de değişir.
// npm run cpu16 -- kit hepsini yeniden üretir; testler depodakilerin güncel olduğunu denetler.

import { buildFullMachineBoard } from "../board/machine-board.ts";
import { LED_RENKLERI, ledRengi, type LedRenk } from "../board/passives.ts";
import { direncBantlari, ohmMetni, pasifDegeri } from "../board/pasif-bilgi.ts";
import {
  ACIK, breadboardCizimi, cekmeCizimi, dekuplajCizimi, dekuplajDalgaCizimi, diziCizimi, direncCizimi, elektrolitikCizimi, ledCizimi,
  ledDevreCizimi, ledRenkTablosu, osilatorCizimi, renkKoduTablosu, seramikCizimi, svgBelge, yerlestir, yuzenGirisCizimi, type CekmeCizim,
  type DekuplajCizim, type Parca,
} from "./cizim.ts";
import { KIT_DIR } from "./rehber.ts";

export const GORSEL_DIR = `${KIT_DIR}/gorseller`;

const pal = ACIK;

/** Parçaları yan yana / alt alta dizer */
function izgara(satirlar: Parca[][], ara = 28): Parca {
  let g = "";
  let y = 0;
  let w = 0;
  for (const satir of satirlar) {
    let x = 0;
    let h = 0;
    for (const p of satir) {
      g += yerlestir(p, x, y);
      x += p.w + ara;
      h = Math.max(h, p.h);
    }
    w = Math.max(w, x - ara);
    y += h + ara;
  }
  return { w, h: y - ara, g };
}

const baslik = (s: string, alt?: string): Parca => ({
  w: 0,
  h: alt ? 40 : 24,
  g: `<text x="0" y="17" font-size="17" font-weight="700" fill="${pal.yazi}">${s}</text>` + (alt ? `<text x="0" y="36" font-size="12" fill="${pal.soluk}">${alt}</text>` : ""),
});

/** Bilgisayardaki LED'ler: rengi, seri direnci, sürücüsü */
interface KartLed {
  ref: string;
  role: string;
  renk: LedRenk;
  direnc: string;
  ohm: number;
  sinyal: string;
  surucu: string;
}

let tahtaOnbellek: ReturnType<typeof buildFullMachineBoard>["board"] | null = null;
const tahta = () => (tahtaOnbellek ??= buildFullMachineBoard().board);

function kartLedleri(): KartLed[] {
  const board = tahta();
  const out: KartLed[] = [];
  for (const p of board.passives) {
    if (p.part !== "LED") continue;
    const anot = p.pins["1"];
    const r = board.passives.find((q) => q !== p && q.part.startsWith("R_") && Object.values(q.pins).includes(anot));
    if (!r) continue;
    const sinyal = Object.values(r.pins).find((x) => x !== anot)!;
    // sürücü: o nete çıkışı bağlı çip pini
    let surucu = board.netName(sinyal);
    for (const ch of board.chips) {
      const pin = Object.entries(ch.nets).find(([ad, v]) => v === sinyal && /out|tri|bidir/.test(ch.def.pins.find((q) => q.name === ad)?.dir ?? ""));
      if (pin) {
        surucu = `${ch.ref}.${pin[0]}`;
        break;
      }
    }
    const d = pasifDegeri(r.part);
    out.push({
      ref: p.ref, role: p.role, renk: ledRengi(p.role), direnc: r.ref, ohm: d?.tur === "direnc" ? d.ohm : 330,
      sinyal: board.netName(sinyal), surucu,
    });
  }
  return out;
}

/** Bir hattın çekme direnci ve alıcısı (şemadan) */
function cekme(hat: string): CekmeCizim {
  const board = tahta();
  const net = board.n(hat);
  const r = board.passives.find((p) => p.part.startsWith("R_") && Object.values(p.pins).includes(net) && Object.values(p.pins).some((x) => x === 0 || x === 1));
  const d = r ? pasifDegeri(r.part) : null;
  const yukari = r ? Object.values(r.pins).includes(1) : true;
  let alici: string | undefined;
  for (const ch of board.chips) {
    const pin = Object.entries(ch.nets).find(([ad, v]) => v === net && ch.def.pins.find((q) => q.name === ad)?.dir === "in");
    if (pin) {
      alici = `${ch.ref}.${pin[0]}`;
      break;
    }
  }
  return { yon: yukari ? "yukari" : "asagi", ohm: d?.tur === "direnc" ? d.ohm : 10000, ref: r?.ref ?? "R", hat, alici };
}

/** Bir çipin dekuplaj kondansatörü (şemadan) */
function dekuplaj(ref: string): DekuplajCizim {
  const board = tahta();
  const ch = board.chips.find((x) => x.ref === ref)!;
  const pinNo = (ad: string) => ch.def.pins.find((q) => q.name === ad)?.num ?? 0;
  const c = board.passives.find((p) => p.part === "C_100N" && p.role === `${ref} dekuplaj`);
  return { cip: ref, part: ch.def.part, pinSayisi: ch.def.pins.length, vcc: pinNo("VCC"), gnd: pinNo("GND"), ref: c?.ref ?? "C", kod: "104" };
}

export function gorselDosyalari(): { path: string; content: string }[] {
  const ledler = kartLedleri();
  const kartta: Partial<Record<LedRenk, string>> = {};
  for (const l of ledler) kartta[l.renk] = [kartta[l.renk], `${l.ref} ${l.sinyal}`].filter(Boolean).join(", ");
  const saat = ledler.find((l) => l.renk === "mavi") ?? ledler[0];
  const dosyalar: [string, string, Parca][] = [];

  // renk kodu
  const ornek = (ohm: number, tol: number, id: string) => {
    const b = direncBantlari(ohm, tol);
    return direncCizimi(ohm, tol, pal, { id, etiket: true, baslik: `${ohmMetni(ohm)} ± %${tol}: ${b.map((x) => x.ad).join(" – ")}` });
  };
  dosyalar.push(["renk-kodu", "Direnç renk kodu", izgara([
    [baslik("Direnç renk kodu (IEC 60062)", "4 bant: 2 rakam + çarpan + tolerans (%5, karbon film, bej) · 5 bant: 3 rakam (%1, metal film, mavi)")],
    [renkKoduTablosu(pal), izgara([[ornek(330, 5, "r1")], [ornek(10000, 5, "r2")], [ornek(680, 1, "r3")]], 18)],
  ], 20)]);

  // LED anatomisi
  dosyalar.push(["led-anatomi", "LED'in anatomisi ve kutbu", izgara([
    [baslik("LED: anatomi ve kutup", "anot (+) uzun bacak · katot (−) kısa bacak, flanşın düz kenarı, içerideki büyük örs")],
    [ledCizimi("kirmizi", pal, { id: "l1" }), ledCizimi(saat?.renk ?? "mavi", pal, { id: "l2", yanik: true, sembol: false })],
    [ledRenkTablosu(pal, kartta)],
  ], 20)]);

  // seri direnç
  const devre = (l: KartLed | undefined, seviye: number): Parca =>
    ledDevreCizimi(l ? { surucu: l.surucu, sinyal: l.sinyal, direnc: l.direnc, ohm: l.ohm, led: l.ref, renk: l.renk, seviye } : { surucu: "74HC", sinyal: "X", direnc: "R", ohm: 330, led: "D", renk: "kirmizi", seviye }, pal);
  const kirmizi = ledler.find((l) => l.renk === "kirmizi");
  dosyalar.push(["seri-direnc", "LED'in seri direnci", izgara([
    [baslik("LED'in seri direnci", "R = (5 V − Vf) / I · LED'i her zaman bir dirençle sür; akımı direnç belirler")],
    [devre(saat, 1), devre(kirmizi, 0)],
  ], 20)]);

  // çekme dirençleri
  dosyalar.push(["cekme-direnci", "Çekme dirençleri", izgara([
    [baslik("Çekme direnci: boşta kalan girişe bir varsayılan seviye", "yukarı çekme (pull-up): VCC'ye 10 kΩ · aşağı çekme (pull-down): GND'ye 10 kΩ")],
    [yuzenGirisCizimi(pal), cekmeCizimi({ ...cekme("~WAIT"), seviye: 1 }, pal)],
    [cekmeCizimi({ yon: "asagi", ohm: 10000, ref: "RN1 (8 hat)", hat: "veriyolu", alici: "74HC girişi", seviye: 0, surucu: "üç durumlu çıkış: 1'e sürer" }, pal),
      diziCizimi("A103J", 9, pal, { ortak: "COM → GND ya da VCC", ohm: 10000 })],
  ], 20)]);

  // dekuplaj
  dosyalar.push(["dekuplaj", "Dekuplaj kondansatörü", izgara([
    [baslik("Dekuplaj: her entegrenin yanında 100 nF", "çıkışlar değişirken çekilen nanosaniyelik akımı uzun besleme kablosu veremez, yanındaki kondansatör verir")],
    [dekuplajCizimi(dekuplaj("U201"), pal), dekuplajDalgaCizimi(pal)],
  ], 20)]);

  // kondansatör okuma
  dosyalar.push(["kondansator-okuma", "Kondansatör yazılarını okuma", izgara([
    [baslik("Kondansatör yazılarını okuma", "seramik: 3 haneli kod, pF · elektrolitik: değer ve gerilim açıkça yazar, şerit eksi bacak")],
    [izgara([[seramikCizimi("104", pal)], [seramikCizimi("105", pal)]], 12), elektrolitikCizimi("100µF", 16, pal)],
    [osilatorCizimi("8.000", pal)],
  ], 20)]);

  // direnç dizisi
  dosyalar.push(["direnc-dizisi", "Direnç dizisi (SIP-9)", izgara([
    [baslik("Direnç dizisi (SIP-9): sekiz çekme direnci tek parçada", "noktalı 1. bacak ortak uç: VCC'ye takılırsa yukarı, GND'ye takılırsa aşağı çeker")],
    [diziCizimi("A103J", 9, pal, { ortak: "COM", ohm: 10000 }), cekmeCizimi({ yon: "yukari", ohm: 10000, ref: "RN401 (8 hat)", hat: "D0..D7", alici: "74HC girişi", surucu: "üç durumlu çıkış: 0'a sürer" }, pal)],
  ], 20)]);

  // breadboard
  dosyalar.push(["breadboard-yerlesim", "Breadboard yerleşimi", izgara([
    [baslik("Breadboard'da yerleşim", "LED + seri direnç · dekuplaj · çekme direnci ve buton")],
    [breadboardCizimi(pal)],
  ], 20)]);

  return dosyalar.map(([ad, t, p]) => ({ path: `${GORSEL_DIR}/${ad}.svg`, content: `${svgBelge(p, pal, t, { genislik: true })}\n` }));
}

/** LED renk eşlemesi (rehberdeki tablo için) */
export function ledRenkSatirlari(): { ref: string; role: string; renk: string; vf: number; direnc: string; ohm: number }[] {
  return kartLedleri().map((l) => ({ ref: l.ref, role: l.role, renk: LED_RENKLERI[l.renk].ad, vf: LED_RENKLERI[l.renk].vf, direnc: l.direnc, ohm: l.ohm }));
}
