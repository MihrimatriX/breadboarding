// Belgeler bölümü: markdown ayrıştırıcısı (src/belgeler/md.ts), dizin, adresler, iki dil ve arama
// (src/belgeler/katalog.ts). Son bölüm depodaki gerçek belgeleri okur (İngilizce .en.md'ler de): dizindeki
// her belge var, her .en.md'nin Türkçe eşi var, ayrıştırma tablo ya da kod çitini paragrafta bırakmıyor,
// belgeler arası her bağlantının çapası bağlandığı dosyadaki bir başlığa denk geliyor.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { duzMetin, mdAyristir, satirIci, slug, type Blok, type Inline } from "../src/belgeler/md.ts";
import {
  DIZIN,
  GITHUB,
  belgeHash,
  belgelerdeAra,
  dosyaSec,
  enYolu,
  gorselCoz,
  hashCoz,
  hedefCoz,
  katalog,
  katla,
  komsular,
  metindeAra,
  trYolu,
  yolBirlestir,
} from "../src/belgeler/katalog.ts";

const kok = new URL("../", import.meta.url);
const oku = (yol: string) => readFileSync(new URL(yol, kok), "utf8");

describe("başlık kimliği (GitHub uyumlu)", () => {
  it("Türkçe karakterler kalır, noktalama silinir, boşluk tire olur", () => {
    expect(slug("Proje yapısı")).toBe("proje-yapısı");
    expect(slug("Yol A: CPU16'yı anlamak")).toBe("yol-a-cpu16yı-anlamak");
    expect(slug("G/Ç haritası (0xFF00–0xFFFF)")).toBe("gç-haritası-0xff000xffff");
    expect(slug("BIOS hedefi: anakartta C (--hedef bios)")).toBe("bios-hedefi-anakartta-c---hedef-bios");
    expect(slug("Faz 0 — Spec ✅")).toBe("faz-0--spec-");
    expect(slug("snake_case")).toBe("snake_case");
  });

  it("satır içi işaretler kimliğe girmez, tekrar eden başlık -1 eki alır", () => {
    const b = mdAyristir("## `yilan.c`: Yılan\n\n## Kurulum\n\n## Kurulum\n\n### [hesap8/](hesap8/README.md) **kalın**");
    expect(b.map((x) => (x.t === "baslik" ? x.id : ""))).toEqual(["yilanc-yılan", "kurulum", "kurulum-1", "hesap8-kalın"]);
  });
});

describe("bloklar", () => {
  it("başlık düzeyleri, kapanış diyezleri, # yanında boşluk yoksa paragraf", () => {
    const b = mdAyristir("# Bir\n### Üç ###\n#etiket");
    expect(b[0]).toMatchObject({ t: "baslik", d: 1 });
    expect(b[1]).toMatchObject({ t: "baslik", d: 3, id: "üç" });
    expect(b[2]).toEqual({ t: "paragraf", c: [{ t: "metin", v: "#etiket" }] });
  });

  it("paragraf satırları birleşir, boş satır ayırır", () => {
    const b = mdAyristir("bir\niki\n\nüç");
    expect(b).toEqual([
      { t: "paragraf", c: [{ t: "metin", v: "bir iki" }] },
      { t: "paragraf", c: [{ t: "metin", v: "üç" }] },
    ]);
  });

  it("çitli kod bloğu: dil etiketi, içerik olduğu gibi, girinti silinir, içinde markdown işlenmez", () => {
    const b = mdAyristir("```bash\nnpm run dev   # **değil**\n\n| a | b |\n```\n~~~\nx\n~~~");
    expect(b[0]).toEqual({ t: "kod", dil: "bash", v: "npm run dev   # **değil**\n\n| a | b |" });
    expect(b[1]).toEqual({ t: "kod", dil: "", v: "x" });
    const l = mdAyristir("3. Göndermeden önce:\n   ```sh\n   npx tsc -b\n     girintili\n   ```\n4. sonra");
    expect(l[0]).toMatchObject({ t: "liste", sirali: true, bas: 3 });
    const og = (l[0] as Extract<Blok, { t: "liste" }>).ogeler;
    expect(og[0][1]).toEqual({ t: "kod", dil: "sh", v: "npx tsc -b\n  girintili" });
    expect(og).toHaveLength(2);
  });

  it("iç içe liste, sıkı ve gevşek liste, tembel devam satırı", () => {
    const b = mdAyristir("- bir\n  devam\nsürüyor\n- iki\n  - alt 1\n  - alt 2\n- üç");
    expect(b).toHaveLength(1);
    const l = b[0] as Extract<Blok, { t: "liste" }>;
    expect(l.siki).toBe(true);
    expect(l.ogeler[0]).toEqual([{ t: "paragraf", c: [{ t: "metin", v: "bir devam sürüyor" }] }]);
    expect(l.ogeler[1][1]).toMatchObject({ t: "liste", sirali: false, ogeler: [[{ t: "paragraf" }], [{ t: "paragraf" }]] });
    const g = mdAyristir("1. bir\n\n2. iki\n\nsonra")
    expect(g[0]).toMatchObject({ t: "liste", siki: false });
    expect(g[1]).toMatchObject({ t: "paragraf" });
  });

  it("liste paragrafı keser; sıralı liste yalnız 1 ile başlıyorsa", () => {
    const b = mdAyristir("Sürümler:\n  1. C alt kümesi\n  2. struct");
    expect(b.map((x) => x.t)).toEqual(["paragraf", "liste"]);
    expect((b[1] as Extract<Blok, { t: "liste" }>).ogeler).toHaveLength(2);
    expect(mdAyristir("yıl\n1990. değil").map((x) => x.t)).toEqual(["paragraf"]);
    expect(mdAyristir("Çıktı:\n- bir").map((x) => x.t)).toEqual(["paragraf", "liste"]);
  });

  it("liste içinde tablo", () => {
    const b = mdAyristir("3. Deneyler:\n\n   | # | Deney |\n   |---|---|\n   | 1 | Saat |\n4. Son");
    const l = b[0] as Extract<Blok, { t: "liste" }>;
    expect(l.ogeler[0][1]).toMatchObject({ t: "tablo", satirlar: [[[{ v: "1" }], [{ v: "Saat" }]]] });
    expect(l.ogeler).toHaveLength(2);
  });

  it("tablo: hizalama, boş hücre, eksik hücre, \\| kaçışı (kod içinde de)", () => {
    const b = mdAyristir("| Ad | Sayı | Orta | Not |\n|---|---:|:---:|:--|\n| `a \\| b` | 3 |  |\n| x |");
    expect(b[0]).toMatchObject({ t: "tablo", hiza: [null, "right", "center", "left"] });
    const t = b[0] as Extract<Blok, { t: "tablo" }>;
    expect(t.satirlar[0][0]).toEqual([{ t: "kod", v: "a | b" }]);
    expect(t.satirlar[0][2]).toEqual([]);
    expect(t.satirlar[1]).toHaveLength(4);
    expect(mdAyristir("a | b\nsadece metin")[0].t).toBe("paragraf");
  });

  it("alıntı: > satırları, boş > satırı paragraf ayırır, tembel devam", () => {
    const b = mdAyristir("> **Video:** bir\n>\n> iki\nüç\n\nsonra");
    expect(b[0]).toMatchObject({ t: "alinti", c: [{ t: "paragraf" }, { t: "paragraf", c: [{ t: "metin", v: "iki üç" }] }] });
    expect(b[1]).toMatchObject({ t: "paragraf" });
  });

  it("yatay çizgi; HTML yorumu atlanır; <details> açılır kutu olur; başka HTML metin kalır", () => {
    const b = mdAyristir("---\n<!-- otomatik: başla\nçok satır -->\n#### Malzeme\n<details>\n<summary>Ayrıntılar ve **kısayollar**</summary>\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n</details>\n<br> <b>kalın değil</b>");
    expect(b.map((x) => x.t)).toEqual(["cizgi", "baslik", "ayrinti", "paragraf"]);
    expect(b[2]).toMatchObject({ t: "ayrinti", ozet: [{ t: "metin", v: "Ayrıntılar ve " }, { t: "kalin" }], c: [{ t: "tablo" }] });
    expect(b[3]).toEqual({ t: "paragraf", c: [{ t: "metin", v: "<br> <b>kalın değil</b>" }] });
  });
});

describe("satır içi", () => {
  const m = (v: string): Inline => ({ t: "metin", v });

  it("kod: ters tırnak dizisi, kenar boşlukları, içinde işaret işlenmez", () => {
    expect(satirIci("`a*b*`")).toEqual([{ t: "kod", v: "a*b*" }]);
    expect(satirIci("`` `x` ``")).toEqual([{ t: "kod", v: "`x`" }]);
    expect(satirIci("tek ` tırnak")).toEqual([m("tek ` tırnak")]);
  });

  it("kalın, italik, iç içe; kelime içi _ vurgu değil; boşluklu * vurgu değil", () => {
    expect(satirIci("**kalın** ve *italik* ve _alt_")).toEqual([
      { t: "kalin", c: [m("kalın")] },
      m(" ve "),
      { t: "italik", c: [m("italik")] },
      m(" ve "),
      { t: "italik", c: [m("alt")] },
    ]);
    expect(satirIci("***ikisi***")).toEqual([{ t: "italik", c: [{ t: "kalin", c: [m("ikisi")] }] }]);
    expect(satirIci("**dış *iç* dış**")).toEqual([{ t: "kalin", c: [m("dış "), { t: "italik", c: [m("iç")] }, m(" dış")] }]);
    expect(satirIci("FULL_MACHINE_CARDS ve a * b * c")).toEqual([m("FULL_MACHINE_CARDS ve a * b * c")]);
    expect(satirIci("*\"Public domain font.\"* (kamu)")).toEqual([{ t: "italik", c: [m('"Public domain font."')] }, m(" (kamu)")]);
  });

  it("bağlantı: göreli, çapalı, parantezli hedef, içinde kod ve kalın; başlık yok sayılır", () => {
    expect(satirIci("[spec](spec.md)")).toEqual([{ t: "baglanti", href: "spec.md", c: [m("spec")] }]);
    expect(satirIci("[`kart.*`](../README.md#x \"başlık\")")).toEqual([{ t: "baglanti", href: "../README.md#x", c: [{ t: "kod", v: "kart.*" }] }]);
    expect(satirIci("[w](https://tr.wikipedia.org/wiki/A_(b))")).toEqual([{ t: "baglanti", href: "https://tr.wikipedia.org/wiki/A_(b)", c: [m("w")] }]);
    expect(satirIci("**[kalın](a.md)**")).toEqual([{ t: "kalin", c: [{ t: "baglanti", href: "a.md", c: [m("kalın")] }] }]);
  });

  it("köşeli parantez bağlantı değilse metin kalır; görsel; otomatik bağlantı; kaçış", () => {
    expect(satirIci("pp[i][j] = A[j]")).toEqual([m("pp[i][j] = A[j]")]);
    expect(satirIci("![CI](https://x/badge.svg)")).toEqual([{ t: "gorsel", src: "https://x/badge.svg", alt: "CI" }]);
    expect(satirIci("[![CI](b.svg)](https://x)")).toEqual([{ t: "baglanti", href: "https://x", c: [{ t: "gorsel", src: "b.svg", alt: "CI" }] }]);
    expect(satirIci("İndirme: <https://www.cl.cam.ac.uk/~mgk25/ucs-fonts.html> ya da")).toEqual([
      m("İndirme: "),
      { t: "baglanti", href: "https://www.cl.cam.ac.uk/~mgk25/ucs-fonts.html", c: [m("https://www.cl.cam.ac.uk/~mgk25/ucs-fonts.html")] },
      m(" ya da"),
    ]);
    expect(satirIci("\\*yıldız\\* ve <stdio.h> ve \\d")).toEqual([m("*yıldız* ve <stdio.h> ve \\d")]);
  });

  it("düz metin: kod, görsel alt metni, iç içe", () => {
    expect(duzMetin(satirIci("**a** `b` ![c](d) [e](f)"))).toBe("a b c e");
  });
});

describe("adresler ve bağlantılar", () => {
  const var_ = (y: string) => ["README.md", "docs/README.md", "cpu16/docs/spec.md", "cpu16/README.md", "hesap8/docs/tasarim.md"].includes(y);

  it("hash biçimi: gidiş dönüş, tarayıcının yüzde kodlaması, çapasız, boş", () => {
    expect(belgeHash("cpu16/docs/spec.md")).toBe("#belgeler/cpu16/docs/spec.md");
    expect(belgeHash("README.md", "proje-yapısı")).toBe("#belgeler/README.md#proje-yapısı");
    expect(hashCoz("#belgeler/README.md#proje-yap%C4%B1s%C4%B1")).toEqual({ yol: "README.md", capa: "proje-yapısı" });
    expect(hashCoz("#belgeler/cpu16/docs/spec.md")).toEqual({ yol: "cpu16/docs/spec.md", capa: null });
    expect(hashCoz("#belgeler")).toEqual({ yol: null, capa: null });
    expect(hashCoz("#mimari/cpu")).toEqual({ yol: null, capa: null });
    expect(hashCoz("#belgeler/a.md#%E0%A4")).toEqual({ yol: "a.md", capa: "%E0%A4" });
  });

  it("göreli yollar", () => {
    expect(yolBirlestir("cpu16/docs/spec.md", "isa-ayrintilari.md")).toBe("cpu16/docs/isa-ayrintilari.md");
    expect(yolBirlestir("cpu16/docs/spec.md", "../../README.md")).toBe("README.md");
    expect(yolBirlestir("cpu16/kit/deney-01-saat.md", "./gorseller/x.svg")).toBe("cpu16/kit/gorseller/x.svg");
    expect(yolBirlestir("README.md", "cpu16/")).toBe("cpu16/");
    expect(yolBirlestir("README.md", "../dis.md")).toBeNull();
  });

  it("belgeye giden bağlantı uygulamada, kaynak dosyası GitHub'da, dış adres olduğu gibi", () => {
    expect(hedefCoz("cpu16/docs/mimari.md", "spec.md", var_)).toEqual({ tur: "belge", yol: "cpu16/docs/spec.md", capa: null });
    expect(hedefCoz("cpu16/docs/spec.md", "../../README.md#proje-yapısı", var_)).toEqual({ tur: "belge", yol: "README.md", capa: "proje-yapısı" });
    expect(hedefCoz("hesap8/README.md", "docs/tasarim.md#kullan%C4%B1m", var_)).toEqual({ tur: "belge", yol: "hesap8/docs/tasarim.md", capa: "kullanım" });
    expect(hedefCoz("README.md", "#lisans", var_)).toEqual({ tur: "belge", yol: "README.md", capa: "lisans" });
    expect(hedefCoz("README.md", "cpu16/", var_)).toEqual({ tur: "belge", yol: "cpu16/README.md", capa: null });
    expect(hedefCoz("docs/README.md", "../cpu16/programs/hello.s", var_)).toEqual({ tur: "dis", url: `${GITHUB}/blob/main/cpu16/programs/hello.s` });
    expect(hedefCoz("README.md", "src/", var_)).toEqual({ tur: "dis", url: `${GITHUB}/tree/main/src/` });
    expect(hedefCoz("README.md", "https://example.com/a", var_)).toEqual({ tur: "dis", url: "https://example.com/a" });
    // tehlikeli şema dış adres sayılmaz: depoda bir yol olarak GitHub'a gider
    expect(hedefCoz("README.md", "javascript:alert(1)", var_)).toMatchObject({ tur: "dis", url: expect.stringMatching(/^https:\/\/github\.com\//) });
  });

  it("görsel yolları paketlenmiş adrese çevrilir", () => {
    const adresler = { "hesap8/docs/img/mimari-hesap.svg": "/assets/mimari-hesap-abc.svg" };
    expect(gorselCoz("cpu16/docs/mimari.md", "../../hesap8/docs/img/mimari-hesap.svg", adresler)).toBe("/assets/mimari-hesap-abc.svg");
    expect(gorselCoz("hesap8/docs/tasarim.md", "img/mimari-hesap.svg", adresler)).toBe("/assets/mimari-hesap-abc.svg");
    expect(gorselCoz("README.md", "https://x/badge.svg", adresler)).toBe("https://x/badge.svg");
    expect(gorselCoz("README.md", "yok.png", adresler)).toBeNull();
  });
});

describe("dizin ve arama", () => {
  it("dizinde olmayan belge Diğer'e düşer, dosyası olmayan atlanır; komşular okuma sırasında", () => {
    const g = katalog(["docs/README.md", "README.md", "yeni/belge.md"]);
    expect(g.map((x) => x.ad)).toEqual(["Başlangıç", "Diğer"]);
    expect(g[1].belgeler).toEqual([{ yol: "yeni/belge.md", ad: "belge" }]);
    expect(komsular(g, "README.md")).toEqual({ onceki: { yol: "docs/README.md", ad: "Okuma yolu" }, sonraki: { yol: "yeni/belge.md", ad: "belge" } });
    expect(komsular(g, "yok.md")).toEqual({});
  });

  it("Türkçe katlama: I / İ / ı ve işaretler fark etmez", () => {
    expect(katla("ISA İşlemci ÇEKME ğüşöç")).toBe("isa islemci cekme gusoc");
    expect(metindeAra("Komut seti\nISA ayrıntıları, isa ve İsa", "isa")).toEqual({ sayi: 3, ornek: "ISA ayrıntıları, isa ve İsa" });
    expect(metindeAra("| `cekme` | [çekme](a.md) dirençleri |", "ÇEKME")?.ornek).toBe("cekme · çekme dirençleri ·");
    expect(metindeAra("yok", "var")).toBeNull();
  });

  it("arama adda ve inmiş metinde bakar", () => {
    const g = katalog(["docs/README.md", "cpu16/docs/spec.md", "cpu16/docs/bios.md"]);
    const metin = (y: string) => (y === "cpu16/docs/bios.md" ? "monitör komutları" : undefined);
    expect(belgelerdeAra(g, "monitör", metin).flatMap((x) => x.belgeler.map((b) => b.yol))).toEqual(["cpu16/docs/bios.md"]);
    expect(belgelerdeAra(g, "spesifikasyon", metin).flatMap((x) => x.belgeler.map((b) => [b.yol, b.eslesme]))).toEqual([["cpu16/docs/spec.md", null]]);
  });
});

describe("iki dil", () => {
  const dosyalar = ["docs/README.md", "cpu16/docs/spec.md", "cpu16/docs/spec.en.md", "cpu16/kit/deney-01-saat.md", "yeni/belge.md", "yetim.en.md"];
  const dosyaVar = (y: string) => dosyalar.includes(y);

  it("İngilizce dosya adı ve Türkçe eşi", () => {
    expect(enYolu("cpu16/docs/spec.md")).toBe("cpu16/docs/spec.en.md");
    expect(trYolu("cpu16/docs/spec.en.md")).toBe("cpu16/docs/spec.md");
    expect(trYolu("cpu16/docs/spec.md")).toBeNull();
  });

  it("katalog: .en.md listede ayrı belge değil; adlar seçili dilde, adres Türkçe dosyanın yolu", () => {
    const tr = katalog(dosyalar);
    const en = katalog(dosyalar, "en");
    const yollar = (g: typeof tr) => g.flatMap((x) => x.belgeler.map((b) => b.yol));
    expect(yollar(tr)).toEqual(["docs/README.md", "cpu16/docs/spec.md", "cpu16/kit/deney-01-saat.md", "yeni/belge.md"]);
    expect(yollar(en)).toEqual(yollar(tr));
    expect(en.map((x) => x.ad)).toEqual(["Getting started", "CPU16: design", "Experiment kit", "Other"]);
    expect(en.flatMap((x) => x.belgeler.map((b) => b.ad))).toEqual(["Reading guide", "Design specification", "1. Clock and reset board", "belge"]);
    expect(komsular(en, "cpu16/docs/spec.md").sonraki).toEqual({ yol: "cpu16/kit/deney-01-saat.md", ad: "1. Clock and reset board" });
  });

  it("dizindeki her belgenin iki dilde de adı var", () => {
    for (const g of DIZIN) for (const x of [g, ...g.belgeler]) expect(x.ad.tr && x.ad.en, JSON.stringify(x.ad)).toBeTruthy();
  });

  it("gösterilen dosya: İngilizcede .en.md varsa o, yoksa Türkçesi; Türkçede hep Türkçesi", () => {
    expect(dosyaSec("cpu16/docs/spec.md", "en", dosyaVar)).toBe("cpu16/docs/spec.en.md");
    expect(dosyaSec("cpu16/docs/spec.md", "tr", dosyaVar)).toBe("cpu16/docs/spec.md");
    expect(dosyaSec("cpu16/kit/deney-01-saat.md", "en", dosyaVar)).toBe("cpu16/kit/deney-01-saat.md");
  });

  it("adres dilden bağımsız: .en.md adresi Türkçe eşine çözülür", () => {
    expect(hashCoz("#belgeler/cpu16/docs/spec.en.md#instruction-formats")).toEqual({ yol: "cpu16/docs/spec.md", capa: "instruction-formats" });
  });

  it("x.en.md bağlantısı x.md belgesine gider; İngilizcesi olmayan belgeye Türkçe adıyla", () => {
    // uygulamada belge = Türkçe dosya; göreli yollar Türkçe yoldan çözülür (.en.md aynı klasörde)
    const belgeVar = (y: string) => dosyaVar(y) && trYolu(y) === null;
    expect(hedefCoz("cpu16/docs/spec.md", "spec.en.md#instruction-formats", belgeVar)).toEqual({ tur: "belge", yol: "cpu16/docs/spec.md", capa: "instruction-formats" });
    expect(hedefCoz("cpu16/docs/spec.md", "../kit/deney-01-saat.md#malzeme", belgeVar)).toEqual({ tur: "belge", yol: "cpu16/kit/deney-01-saat.md", capa: "malzeme" });
    expect(hedefCoz("cpu16/docs/spec.md", "../../docs/README.en.md", belgeVar)).toEqual({ tur: "belge", yol: "docs/README.md", capa: null });
    // Türkçe eşi olmayan .en.md belge değil
    expect(hedefCoz("docs/README.md", "../yetim.en.md", belgeVar)).toEqual({ tur: "dis", url: `${GITHUB}/blob/main/yetim.en.md` });
    // .en.md'yi ayrı dosya olarak tanıyan denetim (depo testi) bağlantının adını olduğu gibi alır
    expect(hedefCoz("cpu16/docs/spec.en.md", "#instruction-formats", dosyaVar)).toEqual({ tur: "belge", yol: "cpu16/docs/spec.en.md", capa: "instruction-formats" });
  });

  it("İngilizce görseller (.en.svg) paketlenmiş adresiyle", () => {
    const adresler = { "cpu16/docs/img/mimari-cpu.en.svg": "/assets/mimari-cpu.en-abc.svg" };
    expect(gorselCoz("cpu16/docs/mimari.md", "img/mimari-cpu.en.svg", adresler)).toBe("/assets/mimari-cpu.en-abc.svg");
  });

  it("Türkçe katlamalı arama İngilizce metinde de çalışır", () => {
    expect(katla("Instruction FORMATS, Interrupt")).toBe("instruction formats, interrupt");
    expect(metindeAra("## Instruction formats\nINSTRUCTION set and `instructions`", "Instruction")).toEqual({ sayi: 3, ornek: "Instruction formats" });
    const en = katalog(dosyalar, "en");
    const metin = (y: string) => (y === "cpu16/docs/spec.md" ? "The INSTRUCTION set" : undefined);
    expect(belgelerdeAra(en, "instruction", metin).flatMap((x) => x.belgeler.map((b) => b.yol))).toEqual(["cpu16/docs/spec.md"]);
    // ad da seçili dilde aranır
    expect(belgelerdeAra(en, "specification", metin).flatMap((x) => x.belgeler.map((b) => b.yol))).toEqual(["cpu16/docs/spec.md"]);
  });
});

describe("depodaki belgeler", () => {
  const dizindekiler = DIZIN.flatMap((g) => g.belgeler.map((b) => b.yol));
  const md = (k: string) => readdirSync(new URL(k, kok)).filter((f) => f.endsWith(".md")).map((f) => k + f);
  // BelgelerView.tsx'teki import.meta.glob ile aynı küme: tek dosyalar ve varsa İngilizceleri, klasörlerdeki
  // bütün .md'ler (.en.md'ler de)
  const tekler = ["README.md", "CONTRIBUTING.md", "docs/README.md", "cpu16/README.md", "hesap8/README.md"].flatMap((y) => [y, enYolu(y)]);
  const hepsi = [...tekler.filter((y) => existsSync(new URL(y, kok))), ...md("cpu16/docs/"), ...md("cpu16/kit/"), ...md("hesap8/docs/")];
  const agac = new Map(hepsi.map((y) => [y, mdAyristir(oku(y))]));
  const ingilizceler = hepsi.filter((y) => trYolu(y) !== null);

  it("dizindeki her belgenin dosyası var", () => {
    for (const y of dizindekiler) expect(existsSync(new URL(y, kok)), y).toBe(true);
  });

  it("her .en.md'nin Türkçe eşi var", () => {
    for (const y of ingilizceler) expect(agac.has(trYolu(y)!), `${y}: Türkçe eşi ${trYolu(y)} yok`).toBe(true);
  });

  /** ağaçtaki bütün bloklar (liste, alıntı, açılır kutu içleri de) */
  const gez = function* (b: Blok[]): Generator<Blok> {
    for (const x of b) {
      yield x;
      if (x.t === "liste") for (const o of x.ogeler) yield* gez(o);
      if (x.t === "alinti" || x.t === "ayrinti") yield* gez(x.c);
    }
  };
  const satirIcleri = function* (b: Blok): Generator<Inline> {
    const dal = function* (c: Inline[]): Generator<Inline> {
      for (const x of c) {
        yield x;
        if (x.t === "kalin" || x.t === "italik" || x.t === "baglanti") yield* dal(x.c);
      }
    };
    if (b.t === "paragraf" || b.t === "baslik") yield* dal(b.c);
    if (b.t === "tablo") for (const h of [...b.bas, ...b.satirlar.flat()]) yield* dal(h);
    if (b.t === "ayrinti") yield* dal(b.ozet);
  };

  it("tablo, kod çiti ve başlık paragrafta kalmıyor", () => {
    for (const [y, b] of agac) {
      for (const x of gez(b)) {
        if (x.t !== "paragraf") continue;
        const ilk = x.c[0];
        if (ilk?.t !== "metin") continue;
        expect(ilk.v, `${y}: ${ilk.v.slice(0, 60)}`).not.toMatch(/^(\||```|~~~|#{1,6} |<!--|<\/?details)/);
      }
    }
  });

  // .en.md'ler de ayrı dosya: çapa bağlantının adını taşıyan dosyada aranır (İngilizce başlığın slug'ı)
  it("belgeler arası her bağlantı bir belgeye, çapası bir başlığa denk geliyor", () => {
    const kimlikler = new Map([...agac].map(([y, b]) => [y, new Set([...gez(b)].flatMap((x) => (x.t === "baslik" ? [x.id] : [])))]));
    let sayi = 0;
    for (const [y, b] of agac) {
      const ingilizce = trYolu(y) !== null;
      for (const x of gez(b)) {
        for (const s of satirIcleri(x)) {
          if (s.t !== "baglanti" || /^(?:https?|mailto):/i.test(s.href)) continue;
          const dosya = s.href.split("#")[0];
          // .en.md bağlantısının dosyası var (çapasız bağlantıda da)
          if (dosya.endsWith(".en.md")) expect(agac.has(yolBirlestir(y, dosya) ?? ""), `${y}: ${s.href}: dosya yok`).toBe(true);
          const h = hedefCoz(y, s.href, (z) => agac.has(z));
          if (h.tur !== "belge") continue;
          // İngilizce belge, İngilizcesi olan belgeye .en.md adıyla bağlanır (klasör bağlantısı serbest)
          if (ingilizce && dosya && !dosya.endsWith("/") && trYolu(h.yol) === null) expect(agac.has(enYolu(h.yol)), `${y}: ${s.href}: ${enYolu(h.yol)} var, ona bağlan`).toBe(false);
          if (!h.capa) continue;
          sayi++;
          expect(kimlikler.get(h.yol)?.has(h.capa), `${y}: ${s.href}`).toBe(true);
        }
      }
    }
    expect(sayi).toBeGreaterThan(50);
  });

  it("depodaki görseller var, paketleniyor ve tarayıcıda açılabilir", () => {
    for (const [y, b] of agac) {
      for (const x of gez(b)) {
        for (const s of satirIcleri(x)) {
          if (s.t !== "gorsel" || /^https?:/.test(s.src)) continue;
          const yol = yolBirlestir(y, s.src);
          expect(yol && existsSync(new URL(yol, kok)), `${y}: ${s.src}`).toBe(true);
          expect(yol, `${y}: ${s.src}: BelgelerView.tsx'teki görsel kalıplarından biri`).toMatch(/^(cpu16\/docs\/img|hesap8\/docs\/img|cpu16\/kit\/gorseller)\//);
          // <img> SVG'yi katı XML olarak okur: yorumda "--" varsa görsel hiç açılmaz (cpu16/mimari/belge.ts)
          for (const m of oku(yol!).matchAll(/<!--([\s\S]*?)-->/g)) expect(m[1], `${yol}: XML yorumunda "--"`).not.toContain("--");
        }
      }
    }
  });
});
