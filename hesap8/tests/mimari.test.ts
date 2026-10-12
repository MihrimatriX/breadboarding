// 8 bit hesap makinesinin mimari diyagramı (hesap8/mimari.ts): kutular blokları, yollar gerçek
// netleri taşıyor, sayılar devreyle aynı. Denetimler cpu16/mimari/denetim.ts'te.

import { describe, expect, it } from "vitest";
import { blokDenetimi, sayiDenetimi, yolDenetimi } from "../../cpu16/mimari/denetim.ts";
import { diyagramKur } from "../../cpu16/mimari/index.ts";

describe("hesap makinesinin mimari diyagramı", () => {
  const k = diyagramKur("hesap");

  it("yerleşim hatasız", () => {
    expect(k.sahne.hatalar).toEqual([]);
  });

  it("her blok tam bir kutuda; anahtarların her parçası tam bir bölmede", () => {
    expect(blokDenetimi(k.diyagram, k.devre)).toEqual([]);
    expect(k.devre.bloklar.length).toBe(k.diyagram.kutular.length);
  });

  it("her yol gerçek netlere bağlı, okların yönü pinlere uyuyor", () => {
    expect(yolDenetimi(k.diyagram, k.devre)).toEqual([]);
  });

  it("kutulardaki parça sayıları devreyle aynı (216 entegre)", () => {
    expect(sayiDenetimi(k)).toEqual([]);
    expect(k.devre.board.chips.length).toBe(216);
    const toplam = k.sahne.kutular
      .flatMap((x) => x.metinler.filter((m) => m.s === "parca").map((m) => m.m.replace(/,$/, "")))
      .join(", ")
      .split(", ")
      .map((s) => s.trim())
      .filter(Boolean)
      .reduce((s, x) => s + Number(/×(\d+)$/.exec(x)?.[1] ?? 1), 0);
    expect(toplam).toBe(216);
  });

  it("veri akışı: anahtarlar → işlem birimleri → seçici → onluğa çevirme → göstergeler", () => {
    const yol = (kaynak: string, hedef: string) =>
      k.diyagram.yollar.some((y) => y.uclar.some((u) => u.kutu === kaynak && u.yon !== "giris") && y.uclar.some((u) => u.kutu === hedef && u.yon !== "cikis"));
    for (const [a, b] of [
      ["anahtar", "toplama"], ["anahtar", "carpma"], ["anahtar", "bolme"], ["anahtar", "secici"],
      ["toplama", "secici"], ["carpma", "secici"], ["bolme", "secici"], ["bolme", "onluk-kalan"],
      ["secici", "onluk-sonuc"], ["onluk-a", "gosterge-a"], ["onluk-b", "gosterge-b"], ["onluk-sonuc", "gosterge-sonuc"], ["onluk-kalan", "gosterge-kalan"],
      ["bolme", "gosterge-sonuc"], ["anahtar", "gosterge-kalan"],
    ]) expect(yol(a, b), `${a} → ${b}`).toBe(true);
    // çarpım 16 bit, sonuç 16 bit
    expect(k.diyagram.yollar.find((y) => y.id === "carpim")!.netler).toHaveLength(16);
    expect(k.diyagram.yollar.find((y) => y.id === "sonuc")!.netler).toHaveLength(16);
  });
});
