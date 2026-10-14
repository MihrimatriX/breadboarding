// Atlama telinin borusunun ekseni: köşe noktalarından yuvarlak dirsekli, sık noktalı bir yol. Her iç
// köşede tel küçük bir çember yayıyla kıvrılır; noktalar yalnız dirseklerde sıklaşır, düz
// parçalar tek aralık kalır. Bir de tıklanan teli bulan ışın testi (isinTeli). Saf fonksiyonlar (three'den
// ve React'ten bağımsız); 3D sahne ve testler kullanır.

/** Dirseğin köşeden istenen uzaklığı (mm): yalıtımın yarıçapının (0,68 mm) ~1,75 katı */
export const DIRSEK = 1.2;

/**
 * Köşe noktaları [x, y, z, …] (mm) → yuvarlak dirsekli yol. İlk ve son nokta korunur; her iç köşenin
 * yerine köşeden dᵢ önce başlayıp dᵢ sonra biten bir yay gelir (açıya ve yayın boyuna göre aralık). Doğrusal
 * köşe atlanır. d: bütün köşelerde aynı ya da köşe başına (i. nokta için d[i]).
 */
export function yuvarlakYol(p: readonly number[], d: number | readonly number[] = DIRSEK): number[] {
  const k = p.length / 3;
  const out = p.slice(0, 3);
  /** j. parçanın (j → j+1) boyu */
  const boy = (j: number) => Math.hypot(p[3 * j + 3] - p[3 * j], p[3 * j + 4] - p[3 * j + 1], p[3 * j + 5] - p[3 * j + 2]);
  for (let i = 1; i + 1 < k; i++) {
    const lu = boy(i - 1);
    const lv = boy(i);
    if (!lu || !lv) continue;
    const [vx, vy, vz] = [p[3 * i], p[3 * i + 1], p[3 * i + 2]];
    // gelen ve giden yön (birim)
    const ux = (vx - p[3 * i - 3]) / lu, uy = (vy - p[3 * i - 2]) / lu, uz = (vz - p[3 * i - 1]) / lu;
    const wx = (p[3 * i + 3] - vx) / lv, wy = (p[3 * i + 4] - vy) / lv, wz = (p[3 * i + 5] - vz) / lv;
    const aci = Math.acos(Math.min(1, Math.max(-1, ux * wx + uy * wy + uz * wz)));
    if (aci < 1e-3) continue;
    // dirsek komşu parçayı öbür ucundaki dirsekle istedikleri uzaklıklar oranında paylaşır (eşitse yarı yarıya);
    // yolun ucuna giden parçada (deliğe inen kısa bacak) dirsek yok: neredeyse tamamı, sıfır boylu adım kalmasın
    const dd = (j: number) => (typeof d === "number" ? d : d[j]);
    const pay = (l: number, j: number) => (j === 0 || j === k - 1 ? 0.9 * l : (l * dd(i)) / (dd(i) + dd(j)));
    const di = Math.min(dd(i), pay(lu, i - 1), pay(lv, i + 1));
    // geniş yaylar daha sık örneklenir (yayın boyu boyunca ~4 birimde bir)
    const m = Math.max(2, Math.ceil(aci / (Math.PI / 8)), Math.ceil((aci * di) / 4));
    // çember yayı: köşeden di önce (A = V − u·di) başlar, di sonra biter; yarıçap r = di / tan(açı / 2),
    // merkez A'dan dönüş yanına (n: w'nin u'ya dik bileşeni) r uzakta
    const r = di / Math.tan(aci / 2);
    const dot = ux * wx + uy * wy + uz * wz;
    let nx = wx - dot * ux, ny = wy - dot * uy, nz = wz - dot * uz;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const ax = vx - ux * di, ay = vy - uy * di, az = vz - uz * di;
    for (let s = 0; s <= m; s++) {
      const f = (aci * s) / m;
      const cu = Math.sin(f) * r, cn = (1 - Math.cos(f)) * r;
      out.push(ax + ux * cu + nx * cn, ay + uy * cu + ny * cn, az + uz * cu + nz * cn);
    }
  }
  out.push(p[3 * k - 3], p[3 * k - 2], p[3 * k - 1]);
  return out;
}

/**
 * Tıklama: ışının (o + t·d, d birim vektör) değdiği en yakın tel. Her tel eksen noktalarıyla
 * ([x, y, z, …]) kalın bir çizgi (kapsül, yarıçap r) sayılır; üçgen taramasından çok ucuz (tekerlek ve
 * her tıklamada bütün teller). Değen yoksa null; varsa telin sırası ve ışın boyunca uzaklığı.
 */
export function isinTeli(o: readonly number[], d: readonly number[], yollar: readonly (readonly number[])[], r: number): { tel: number; t: number } | null {
  let en: { tel: number; t: number } | null = null;
  const r2 = r * r;
  for (let g = 0; g < yollar.length; g++) {
    const p = yollar[g];
    for (let j = 0; j + 5 < p.length; j += 3) {
      // ışın ile parçanın (p0 + s·u, s ∈ [0, 1]) en yakın noktaları
      const ux = p[j + 3] - p[j], uy = p[j + 4] - p[j + 1], uz = p[j + 5] - p[j + 2];
      const wx = o[0] - p[j], wy = o[1] - p[j + 1], wz = o[2] - p[j + 2];
      const b = d[0] * ux + d[1] * uy + d[2] * uz;
      const c = ux * ux + uy * uy + uz * uz;
      const dd = d[0] * wx + d[1] * wy + d[2] * wz;
      const e = ux * wx + uy * wy + uz * wz;
      const pay = c - b * b;
      let s = pay > 1e-12 ? Math.min(1, Math.max(0, (e - b * dd) / pay)) : 0;
      let t = s * b - dd;
      if (t < 0) {
        t = 0;
        s = c > 0 ? Math.min(1, Math.max(0, e / c)) : 0;
      }
      const qx = wx + t * d[0] - s * ux, qy = wy + t * d[1] - s * uy, qz = wz + t * d[2] - s * uz;
      if (qx * qx + qy * qy + qz * qz <= r2 && (!en || t < en.t)) en = { tel: g, t };
    }
  }
  return en;
}
