// Uygulamadaki kurulum modu (src/board3d/kurulum.ts): ekrandaki tel numaraları yazdırılan belgeyle
// aynı olmalı; takılan teller işaretlenince odak sıradaki açık tele geçer.

import { describe, expect, it } from "vitest";
import { KurulumVerisi } from "../kurulum/kartlar.ts";
import { kartPlani, sahnedeVar, siradakiAcik, ucKonumu, useKurulum } from "../../src/board3d/kurulum.ts";

const veri = new KurulumVerisi();
const imza = (kart: string, plan = veri.plan(kart)) => plan.teller.map((t) => `${t.id} ${t.from.ref}-${t.from.pin} ${t.to.ref}-${t.to.pin} ${t.net} ${t.renk}`);

describe("kurulum modu", () => {
  it.each(["kyb", "clk"])("%s: uygulamadaki tel listesi belgedekiyle aynı (numara, uçlar, net, renk)", (kart) => {
    expect(imza(kart, kartPlani(kart))).toEqual(imza(kart));
  });

  it("tellerin uçları 3D sahnede bulunur (sahnedeki kartlar)", () => {
    for (const kart of ["kyb", "clk"]) {
      expect(sahnedeVar(kart)).toBe(true);
      for (const t of kartPlani(kart).teller) {
        expect(ucKonumu(t.from.ref, t.from.pin), `${t.id} ${t.from.ref}-${t.from.pin}`).not.toBeNull();
        expect(ucKonumu(t.to.ref, t.to.pin), `${t.id} ${t.to.ref}-${t.to.pin}`).not.toBeNull();
      }
    }
    expect(sahnedeVar("prog")).toBe(false);
    expect(sahnedeVar("mem")).toBe(false);
  });

  it("siradakiAcik: verilen telden sonraki takılmamış tel, sonda baştan", () => {
    const t = kartPlani("kyb").teller.slice(0, 4);
    const yapilan = new Set([t[1].id, t[2].id]);
    expect(siradakiAcik(t, yapilan, t[0].id)?.id).toBe(t[3].id);
    expect(siradakiAcik(t, yapilan, t[3].id)?.id).toBe(t[0].id);
    expect(siradakiAcik(t, new Set(t.map((x) => x.id)))).toBeNull();
  });

  it("işaretleyince odak sıradaki açık tele geçer; git() gezinir; sıfırla hepsini siler", async () => {
    const s = useKurulum.getState();
    await s.kartSec("kyb");
    const { plan } = useKurulum.getState();
    expect(plan?.kart).toBe("kyb");
    const t = plan!.teller;
    expect(useKurulum.getState().secili).toBe(t[0].id);
    useKurulum.getState().isaretle(t[0].id);
    expect(useKurulum.getState().yapilan.has(t[0].id)).toBe(true);
    expect(useKurulum.getState().secili).toBe(t[1].id);
    useKurulum.getState().git(-1);
    expect(useKurulum.getState().secili).toBe(t[0].id);
    useKurulum.getState().git(1, true);
    expect(useKurulum.getState().secili).toBe(t[1].id);
    useKurulum.getState().isaretle(t[0].id, false);
    expect(useKurulum.getState().yapilan.size).toBe(0);
    useKurulum.getState().isaretle(t[2].id);
    useKurulum.getState().sifirla();
    expect(useKurulum.getState().yapilan.size).toBe(0);
    expect(useKurulum.getState().secili).toBe(t[0].id);
  });
});
