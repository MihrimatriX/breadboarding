// Belgeler bölümünün markdown ayrıştırıcısı: depodaki belgelerde geçen GFM alt kümesini bir ağaca çevirir.
// Bloklar: ATX başlık (GitHub uyumlu, Türkçe karakterli kimlik), paragraf, iç içe sıralı / sırasız liste
// (sıkı ya da gevşek), çitli kod bloğu (dil etiketi), tablo (hizalama, \| kaçışı), alıntı (tembel devam
// satırıyla), yatay çizgi, <details>/<summary> açılır kutusu. Satır içi: kod, kalın, italik (CommonMark
// ayraç kuralları: kelime içi _ vurgu değildir), bağlantı, görsel, <https://…> otomatik bağlantı, \ kaçışı.
// HTML yorumları atlanır; başka HTML metin olarak kalır (çizim tarafı innerHTML kullanmaz).
// Belgelerde olmayan yapılar yok: setext başlık, girintili kod bloğu, başvuru bağlantısı, dipnot.
// Saf: DOM'a ve React'e dokunmaz; testleri tests/belgeler.test.ts.

export type Inline =
  | { t: "metin"; v: string }
  | { t: "kod"; v: string }
  | { t: "kalin" | "italik"; c: Inline[] }
  | { t: "baglanti"; href: string; c: Inline[] }
  | { t: "gorsel"; src: string; alt: string };

export type Hiza = "left" | "center" | "right" | null;

export type Blok =
  | { t: "baslik"; d: 1 | 2 | 3 | 4 | 5 | 6; id: string; c: Inline[] }
  | { t: "paragraf"; c: Inline[] }
  | { t: "kod"; dil: string; v: string }
  | { t: "liste"; sirali: boolean; bas: number; siki: boolean; ogeler: Blok[][] }
  | { t: "alinti"; c: Blok[] }
  | { t: "tablo"; hiza: Hiza[]; bas: Inline[][]; satirlar: Inline[][][] }
  | { t: "cizgi" }
  | { t: "ayrinti"; ozet: Inline[]; c: Blok[] };

// ---------------------------------------------------------------- başlık kimliği

/** GitHub'ın başlık çapası (github-slugger): küçük harf, harf / rakam / işaret / _ / - / boşluk dışı silinir, boşluk → - */
export function slug(metin: string): string {
  return metin.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
}

/** Aynı başlık ikinci kez geçerse GitHub gibi -1, -2 eki */
function kimlik(sayac: Map<string, number>, metin: string): string {
  const kok = slug(metin);
  let s = kok;
  while (sayac.has(s)) {
    const n = sayac.get(kok)! + 1;
    sayac.set(kok, n);
    s = `${kok}-${n}`;
  }
  sayac.set(s, 0);
  return s;
}

/** Satır içi ağacın düz metni (başlık kimliği, görselin alt metni, içindekiler) */
export function duzMetin(c: Inline[]): string {
  return c.map((x) => (x.t === "metin" || x.t === "kod" ? x.v : x.t === "gorsel" ? x.alt : duzMetin(x.c))).join("");
}

// ---------------------------------------------------------------- bloklar

const BOS = /^\s*$/;
const CIT = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const BASLIK = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const CIZGI = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const ALINTI = /^ {0,3}> ?(.*)$/;
const LISTE = /^( {0,3})([-*+]|(\d{1,9})([.)]))(?:([ \t]+)(.*)|[ \t]*$)/;
const AYRAC_SATIRI = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const YORUM = /^ {0,3}<!--/;
const AYRINTI_AC = /^ {0,3}<details>\s*$/i;
const AYRINTI_KAPA = /^ {0,3}<\/details>\s*$/i;

/** Backtick çiti, bilgi dizesinde backtick taşımaz */
function citMi(s: string): RegExpExecArray | null {
  const m = CIT.exec(s);
  return m && !(m[1][0] === "`" && m[2].includes("`")) ? m : null;
}

/** Bu satır bir paragrafı keser mi (yeni blok başlar): sıralı liste yalnız 1 ile başlıyorsa keser */
function paragrafiKeser(s: string): boolean {
  if (citMi(s) || BASLIK.test(s) || CIZGI.test(s) || ALINTI.test(s) || YORUM.test(s) || AYRINTI_AC.test(s)) return true;
  const m = LISTE.exec(s);
  return !!m && m[6] !== undefined && m[6].trim() !== "" && (m[3] === undefined || m[3] === "1");
}

const girinti = (s: string) => s.length - s.trimStart().length;

/** Satırın başından en fazla n boşluk sil (çitli kod bloğunun girintisi) */
function girintiSil(s: string, n: number): string {
  let k = 0;
  while (k < n && s[k] === " ") k++;
  return s.slice(k);
}

/** Tablo satırını hücrelere böl: baştaki / sondaki | atılır, \| hücre içinde | olur */
function hucreler(s: string): string[] {
  let t = s.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1);
  const out: string[] = [];
  let h = "";
  for (let k = 0; k < t.length; k++) {
    if (t[k] === "\\" && t[k + 1] === "|") {
      h += "|";
      k++;
    } else if (t[k] === "|") {
      out.push(h.trim());
      h = "";
    } else h += t[k];
  }
  out.push(h.trim());
  return out;
}

function tabloBaslar(L: string[], i: number): boolean {
  const b = L[i];
  const a = L[i + 1];
  return b.includes("|") && a !== undefined && a.includes("|") && AYRAC_SATIRI.test(a) && hucreler(b).length === hucreler(a).length;
}

function hizasi(h: string): Hiza {
  const sol = h.startsWith(":");
  const sag = h.endsWith(":");
  return sol && sag ? "center" : sag ? "right" : sol ? "left" : null;
}

interface Baglam {
  sayac: Map<string, number>;
}

/** Satırları bloklara çevirir; ikinci değer: üst düzeyde iki blok arasında boş satır var mı (liste gevşekliği) */
function bloklar(L: string[], bg: Baglam): [Blok[], boolean] {
  const out: Blok[] = [];
  let bosGecti = false;
  let aradaBos = false;
  const ekle = (b: Blok) => {
    if (bosGecti && out.length) aradaBos = true;
    bosGecti = false;
    out.push(b);
  };
  let i = 0;
  while (i < L.length) {
    const s = L[i];
    if (BOS.test(s)) {
      bosGecti = true;
      i++;
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = citMi(s))) {
      const g = girinti(s);
      const kapanis = new RegExp(`^ {0,3}${m[1][0] === "`" ? "`" : "~"}{${m[1].length},}[ \\t]*$`);
      const icerik: string[] = [];
      i++;
      while (i < L.length && !kapanis.test(L[i])) icerik.push(girintiSil(L[i++], g));
      i++;
      ekle({ t: "kod", dil: m[2].trim().split(/\s+/)[0], v: icerik.join("\n") });
      continue;
    }
    if (YORUM.test(s)) {
      while (i < L.length && !L[i].includes("-->")) i++;
      i++;
      continue;
    }
    if (AYRINTI_AC.test(s)) {
      let derinlik = 1;
      let j = i + 1;
      for (; j < L.length; j++) {
        if (AYRINTI_AC.test(L[j])) derinlik++;
        else if (AYRINTI_KAPA.test(L[j]) && --derinlik === 0) break;
      }
      const ic = L.slice(i + 1, j);
      const k = ic.findIndex((x) => !BOS.test(x));
      const sm = k >= 0 ? /^\s*<summary>(.*?)<\/summary>\s*$/i.exec(ic[k]) : null;
      if (sm) ic.splice(0, k + 1);
      ekle({ t: "ayrinti", ozet: satirIci(sm ? sm[1].trim() : "Ayrıntılar"), c: bloklar(ic, bg)[0] });
      i = j + 1;
      continue;
    }
    if ((m = BASLIK.exec(s))) {
      const c = satirIci((m[2] ?? "").trim());
      ekle({ t: "baslik", d: m[1].length as 1 | 2 | 3 | 4 | 5 | 6, id: kimlik(bg.sayac, duzMetin(c)), c });
      i++;
      continue;
    }
    if (CIZGI.test(s)) {
      ekle({ t: "cizgi" });
      i++;
      continue;
    }
    if (ALINTI.test(s)) {
      const ic: string[] = [];
      for (; i < L.length; i++) {
        const a = ALINTI.exec(L[i]);
        if (a) ic.push(a[1]);
        // tembel devam: ">" olmadan süren paragraf satırı
        else if (!BOS.test(L[i]) && !BOS.test(ic[ic.length - 1]) && !paragrafiKeser(L[i])) ic.push(L[i]);
        else break;
      }
      ekle({ t: "alinti", c: bloklar(ic, bg)[0] });
      continue;
    }
    if (tabloBaslar(L, i)) {
      const bas = hucreler(s);
      const hiza = hucreler(L[i + 1]).map(hizasi);
      const satirlar: Inline[][][] = [];
      for (i += 2; i < L.length && !BOS.test(L[i]) && L[i].includes("|"); i++) {
        const h = hucreler(L[i]);
        satirlar.push(bas.map((_, k) => satirIci(h[k] ?? "")));
      }
      ekle({ t: "tablo", hiza, bas: bas.map(satirIci), satirlar });
      continue;
    }
    if (LISTE.test(s)) {
      const [b, j] = liste(L, i, bg);
      ekle(b);
      i = j;
      continue;
    }
    const p = [s.trim()];
    for (i++; i < L.length && !BOS.test(L[i]) && !paragrafiKeser(L[i]); i++) p.push(L[i].trim());
    ekle({ t: "paragraf", c: satirIci(p.join("\n")) });
  }
  return [out, aradaBos];
}

/** L[i]'de başlayan liste; ikinci değer listeden sonraki satır (sondaki boş satırlar listeye dahil değil) */
function liste(L: string[], i: number, bg: Baglam): [Blok, number] {
  const ilk = LISTE.exec(L[i])!;
  const sirali = ilk[3] !== undefined;
  const tur = sirali ? ilk[4] : ilk[2];
  const ogeler: Blok[][] = [];
  let gevsek = false;
  const ayniListe = (m: RegExpExecArray | null) => !!m && (m[3] !== undefined) === sirali && (sirali ? m[4] : m[2]) === tur;
  while (i < L.length && !CIZGI.test(L[i])) {
    const m = LISTE.exec(L[i]);
    if (!ayniListe(m)) break;
    const isaretSonu = m!.index + m![1].length + m![2].length;
    const bosluk = m![5] === undefined || m![5].length > 4 ? 1 : m![5].length;
    const ofset = isaretSonu + bosluk;
    const ic = [m![5] === undefined ? "" : L[i].slice(ofset)];
    for (i++; i < L.length; i++) {
      const s = L[i];
      if (BOS.test(s)) ic.push("");
      else if (girinti(s) >= ofset) ic.push(s.slice(ofset));
      else if (LISTE.test(s) && !CIZGI.test(s)) break;
      // tembel devam: öğenin son paragrafı girintisiz satırla sürüyor
      else if (paragrafAcik(ic) && !paragrafiKeser(s)) ic.push(s.trim());
      else break;
    }
    let sondaBos = 0;
    while (ic.length > 1 && BOS.test(ic[ic.length - 1])) {
      ic.pop();
      sondaBos++;
    }
    const [c, aradaBos] = bloklar(ic, bg);
    ogeler.push(c);
    if (aradaBos || (sondaBos && i < L.length && ayniListe(LISTE.exec(L[i])))) gevsek = true;
  }
  while (BOS.test(L[i - 1])) i--;
  return [{ t: "liste", sirali, bas: sirali ? Number(ilk[3]) : 1, siki: !gevsek, ogeler }, i];
}

/** Öğenin içi bir paragrafla mı bitiyor (açık kod bloğu, tablo ya da boş satırla değil) */
function paragrafAcik(ic: string[]): boolean {
  const son = ic[ic.length - 1];
  if (BOS.test(son) || citMi(son) || son.trimStart().startsWith("|")) return false;
  return ic.filter((x) => citMi(x)).length % 2 === 0;
}

/** Markdown metnini blok ağacına çevirir */
export function mdAyristir(kaynak: string): Blok[] {
  return bloklar(kaynak.split(/\r?\n/), { sayac: new Map() })[0];
}

// ---------------------------------------------------------------- satır içi

const ASCII_NOKTALAMA = /[!-/:-@[-`{-~]/;
const NOKTALAMA = /[\p{P}\p{S}]/u;
const BOSLUK = /\s/;

interface Ayrac {
  t: "ayrac";
  ch: "*" | "_";
  /** kalan ayraç sayısı */
  n: number;
  /** ilk sayı (üçlü kuralı) */
  ilk: number;
  ac: boolean;
  kapa: boolean;
}
type Ara = Inline | Ayrac;

/** k'dan sonra tam n uzunlukta backtick dizisinin başı; yoksa -1 */
function kodSonu(s: string, k: number, n: number): number {
  while (k < s.length) {
    if (s[k] !== "`") {
      k++;
      continue;
    }
    let m = 1;
    while (s[k + m] === "`") m++;
    if (m === n) return k;
    k += m;
  }
  return -1;
}

/** s[i] === "(": bağlantı hedefi (ve yok sayılan başlık), kapanan parantezden sonraki konum */
function hedef(s: string, i: number): { href: string; son: number } | null {
  const bosAt = (j: number) => {
    while (j < s.length && /[ \t\n]/.test(s[j])) j++;
    return j;
  };
  let j = bosAt(i + 1);
  let href: string;
  if (s[j] === "<") {
    const k = s.indexOf(">", j);
    if (k < 0 || s.slice(j, k).includes("\n")) return null;
    href = s.slice(j + 1, k);
    j = k + 1;
  } else {
    const bas = j;
    let derinlik = 0;
    for (; j < s.length; j++) {
      const c = s[j];
      if (c === "\\" && ASCII_NOKTALAMA.test(s[j + 1] ?? "")) j++;
      else if (BOSLUK.test(c)) break;
      else if (c === "(") derinlik++;
      else if (c === ")" && derinlik-- === 0) break;
    }
    href = s.slice(bas, j).replace(/\\([!-/:-@[-`{-~])/g, "$1");
  }
  j = bosAt(j);
  const t = s[j];
  if (t === '"' || t === "'" || t === "(") {
    const kapa = t === "(" ? ")" : t;
    let k = j + 1;
    while (k < s.length && s[k] !== kapa) k += s[k] === "\\" ? 2 : 1;
    if (k >= s.length) return null;
    j = bosAt(k + 1);
  }
  return s[j] === ")" ? { href, son: j + 1 } : null;
}

/** Kalan ayraçları metne çevirir, bitişik metinleri birleştirir */
function duzle(d: Ara[]): Inline[] {
  const out: Inline[] = [];
  for (const x of d) {
    const y: Inline | null = x.t === "ayrac" ? (x.n ? { t: "metin", v: x.ch.repeat(x.n) } : null) : x;
    if (!y) continue;
    const son = out[out.length - 1];
    if (y.t === "metin" && son?.t === "metin") out[out.length - 1] = { t: "metin", v: son.v + y.v };
    else out.push(y);
  }
  return out;
}

/** CommonMark "vurguyu işle": her kapanan ayraç için geriye doğru en yakın uygun açan */
function vurgula(d: Ara[]): void {
  let k = 0;
  while (k < d.length) {
    const kap = d[k];
    if (kap.t !== "ayrac" || !kap.kapa || kap.n === 0) {
      k++;
      continue;
    }
    let a = k - 1;
    for (; a >= 0; a--) {
      const x = d[a];
      if (x.t !== "ayrac" || x.ch !== kap.ch || !x.ac || x.n === 0) continue;
      if ((x.kapa || kap.ac) && (x.ilk + kap.ilk) % 3 === 0 && !(x.ilk % 3 === 0 && kap.ilk % 3 === 0)) continue;
      break;
    }
    if (a < 0) {
      kap.kapa = false;
      k++;
      continue;
    }
    const ac = d[a] as Ayrac;
    const kac = ac.n >= 2 && kap.n >= 2 ? 2 : 1;
    ac.n -= kac;
    kap.n -= kac;
    const ic = d.splice(a + 1, k - a - 1);
    d.splice(a + 1, 0, { t: kac === 2 ? "kalin" : "italik", c: duzle(ic) });
    k = a + 2;
    if (ac.n === 0) {
      d.splice(a, 1);
      k--;
    }
    if (kap.n === 0) d.splice(k, 1);
  }
}

/** Satır içi markdown → ağaç (paragrafın satır sonları boşluk olur) */
export function satirIci(s: string): Inline[] {
  const d: Ara[] = [];
  const parantez: { i: number; gorsel: boolean; etkin: boolean }[] = [];
  let metin = "";
  const yaz = () => {
    if (metin) d.push({ t: "metin", v: metin });
    metin = "";
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\" && ASCII_NOKTALAMA.test(s[i + 1] ?? "")) {
      metin += s[i + 1];
      i += 2;
    } else if (c === "`") {
      let n = 1;
      while (s[i + n] === "`") n++;
      const son = kodSonu(s, i + n, n);
      if (son < 0) {
        metin += "`".repeat(n);
        i += n;
        continue;
      }
      yaz();
      let v = s.slice(i + n, son).replace(/\n/g, " ");
      if (v.length > 1 && v.startsWith(" ") && v.endsWith(" ") && v.trim()) v = v.slice(1, -1);
      d.push({ t: "kod", v });
      i = son + n;
    } else if (c === "<" && /^<[a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s<>]*>/.test(s.slice(i))) {
      const url = /^<([^>]*)>/.exec(s.slice(i))![1];
      yaz();
      d.push({ t: "baglanti", href: url, c: [{ t: "metin", v: url }] });
      i += url.length + 2;
    } else if (c === "[" || (c === "!" && s[i + 1] === "[")) {
      yaz();
      parantez.push({ i: d.length, gorsel: c === "!", etkin: true });
      d.push({ t: "metin", v: c === "!" ? "![" : "[" });
      i += c === "!" ? 2 : 1;
    } else if (c === "]") {
      const p = parantez.pop();
      const h = p && p.etkin && s[i + 1] === "(" ? hedef(s, i + 1) : null;
      if (!p || !h) {
        metin += "]";
        i++;
        continue;
      }
      yaz();
      const ic = d.splice(p.i).slice(1);
      vurgula(ic);
      const icerik = duzle(ic);
      if (p.gorsel) d.push({ t: "gorsel", src: h.href, alt: duzMetin(icerik) });
      else {
        d.push({ t: "baglanti", href: h.href, c: icerik });
        // bağlantı içinde bağlantı olmaz
        for (const q of parantez) if (!q.gorsel) q.etkin = false;
      }
      i = h.son;
    } else if (c === "*" || c === "_") {
      let n = 1;
      while (s[i + n] === c) n++;
      const once = i > 0 ? s[i - 1] : " ";
      const sonra = s[i + n] ?? " ";
      const solYan = !BOSLUK.test(sonra) && (!NOKTALAMA.test(sonra) || BOSLUK.test(once) || NOKTALAMA.test(once));
      const sagYan = !BOSLUK.test(once) && (!NOKTALAMA.test(once) || BOSLUK.test(sonra) || NOKTALAMA.test(sonra));
      yaz();
      d.push({
        t: "ayrac",
        ch: c,
        n,
        ilk: n,
        ac: c === "*" ? solYan : solYan && (!sagYan || NOKTALAMA.test(once)),
        kapa: c === "*" ? sagYan : sagYan && (!solYan || NOKTALAMA.test(sonra)),
      });
      i += n;
    } else {
      metin += c === "\n" ? " " : c;
      i++;
    }
  }
  yaz();
  vurgula(d);
  return duzle(d);
}
