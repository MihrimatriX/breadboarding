// Mimari diyagramından 3D bölümüne geçiş: "3D'de göster" düğmesi. Bölüm değişir (#kart ya da #hesap),
// 3D görünüm kartını seçince bloğun bölümü (etiketli çerçevesi) seçilir: kamera ona uçar, çipleri öne
// çıkar, yan panelde görevi, nasıl çalıştığı ve parçaları açılır. Blok bölüm kataloğunda yoksa ilk
// entegresi seçilir. 3D bölümünün kodu (store, aktif kart) yalnız burada, istenince yüklenir: Mimari bölümünün
// parçası onları içermez.
//
// Tek giriş noktası bolumuGoster(): 3D tarafı bölümleri başka bir yolla (ör. blok etiketleriyle)
// göstermeye başlarsa yalnız bu dosya değişir.

export type KartTuru = "cpu16" | "hesap";

const HASH: Record<KartTuru, string> = { cpu16: "#kart", hesap: "#hesap" };

const kare = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * 3D bölümüne geç ve bloğu göster: `block` bloğunun (`card` verilirse o karttaki) bölümü, yoksa ilk entegresi seçilir.
 * Seçildiyse true; 3D bölümü 15 saniyede açılmazsa ya da blokta entegre yoksa false.
 */
export async function bolumuGoster(kart: KartTuru, block: string, card?: string): Promise<boolean> {
  location.hash = HASH[kart];
  const [{ useKart }, aktif, bolum, { bolumKimligi }] = await Promise.all([
    import("../board3d/store"),
    import("../board3d/aktif"),
    import("../board3d/bolum"),
    import("../../cpu16/board/bolum-bilgi"),
  ]);
  // 3D görünüm kartını ilk çiziminden önce seçer (seçim değişince eski seçim silinir): o bitene dek bekle
  const bas = performance.now();
  while (aktif.aktifKart() !== kart) {
    // bu arada başka bölüme geçildiyse vazgeç
    if (performance.now() - bas > 15000 || location.hash !== HASH[kart]) return false;
    await kare();
  }
  await kare();
  const ci = aktif.kartModeli(kart).board.chips.find((c) => c.block === block && (!card || c.card === card));
  if (!ci) return false;
  const id = bolumKimligi.blok(ci.card, block);
  if (bolum.katalog(kart).bolumler.has(id)) bolum.useBolum.getState().sec(id, true);
  else useKart.getState().selectChip(ci.ref);
  return true;
}
