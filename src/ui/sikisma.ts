// Üst çubuğun sıkışması: bölüm adları, canlı ölçümler ve araçlar yan yana sığmazsa kademe kademe yer
// açılır (styles.css, [data-sikisma]):
//   1: seçili olmayan bölümler yalnız simge   2: ikincil ölçümler gizli
//   3: ölçüm etiketleri görünmez (ekran okuyucuda ve ipucunda kalır)   4: marka adı görünmez (logo kalır)
//   5: üst çubuktaki durum rozeti ("modelle aynı", "HALT") yalnız renkli nokta (yazısı ekran okuyucuda)
//   6: seçili bölümün adı da simge (ör. büyük yazıda 960 px'te "8-bit calculator 3D" sığmaz)
// Sabit bir piksel eşiği yerine sığan ilk kademe seçilir: bölüm sayısı, ölçümlerin uzunluğu (hesap
// sonucu, MHz), arayüz dili ve yazı boyutu (normal / büyük) ne olursa olsun ölçümler "…" ile kesilmez. Eksik genişlik:
// taşan ölçüm değerleri, marka ve üst çubuğun kendisi. Üst çubuk boyut değiştirince (pencere, yazı boyutu)
// baştan seçilir; ölçüm değerleri uzarsa saniyede bir bakılıp gerekirse bir kademe daha sıkışır.

import { useLayoutEffect, type RefObject } from "react";

export const SIKISMA_EN_COK = 6;

/** Sığan ilk kademe (eksik ≤ 0); hiçbiri sığmazsa en sonuncusu. eksik(k): k kademesinde eksik kalan piksel. */
export function sigenKademe(eksik: (k: number) => number, enCok = SIKISMA_EN_COK): number {
  for (let k = 0; k < enCok; k++) if (eksik(k) <= 0) return k;
  return enCok;
}

/** k kademesinin işaretleri: "1 2 3" (CSS [data-sikisma~="2"] ile okur) */
export const kademeIsareti = (k: number): string => Array.from({ length: k }, (_, i) => i + 1).join(" ");

function eksikGenislik(el: HTMLElement): number {
  let e = Math.max(0, el.scrollWidth - el.clientWidth);
  el.querySelectorAll<HTMLElement>(".meter b, .brand").forEach((x) => {
    e += Math.max(0, x.scrollWidth - x.clientWidth);
  });
  return e;
}

/** Üst çubuğu izler, sığan kademeyi data-sikisma'ya yazar */
export function useSikisma(ref: RefObject<HTMLElement>): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const sec = () => {
      // her deneme düzeni zorla hesaplatır; boyamadan önce biter, ara kademeler görünmez
      const k = sigenKademe((k) => {
        el.dataset.sikisma = kademeIsareti(k);
        return eksikGenislik(el);
      });
      el.dataset.sikisma = kademeIsareti(k);
    };
    sec();
    const ro = new ResizeObserver(sec);
    ro.observe(el);
    const id = window.setInterval(() => {
      if (eksikGenislik(el) > 0) sec();
    }, 1000);
    return () => {
      ro.disconnect();
      window.clearInterval(id);
    };
  }, [ref]);
}
