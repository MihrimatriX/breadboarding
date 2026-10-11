// Önbellek (L1) modeli: 2 KB, doğrudan eşlemeli, satır = 1 kelime (2 bayt) → 1024 satır.
// Fiziksel adres (20 bit): [19:11] etiket (9 bit) · [10:1] satır indeksi (10 bit) · [0] bayt seçimi.
// Yazma: write-through, yazma-ayırmasız (no-write-allocate). RAM'e yazmada isabet eden satır
// güncellenir; EEPROM / boş bölgeye (A19 = 0) yazmada satır geçersiz kılınır, çünkü EEPROM'a yapılan
// yazma bir komut baytıdır, içerik değil.
// Ayrıntı: cpu16/docs/anakart.md, "Önbellek kartı".

export const CACHE_LINES = 1024;

export class Cache {
  /** CACHE_CTRL bit0. Kapalıyken okumalar önbelleğe bakmaz ve doldurmaz (etiket karşılaştırıcısı yazmalarda yine çalışır). */
  enabled = true;
  /** Satır etiketleri; -1 = geçersiz. */
  readonly tags = new Int32Array(CACHE_LINES).fill(-1);
  readonly data = new Uint16Array(CACHE_LINES);
  /** G/Ç'den okunan 16 bit sayaçlar (taşınca sarar). */
  hits = 0;
  misses = 0;
  /** Arayüz için taşmayan toplamlar. */
  totalHits = 0;
  totalMisses = 0;

  static index(phys: number): number {
    return (phys >> 1) & (CACHE_LINES - 1);
  }

  static tag(phys: number): number {
    return phys >>> 11;
  }

  /** İsabet varsa satırdaki kelimeyi, yoksa -1 döndürür. Sayaçlara dokunmaz. */
  probe(phys: number): number {
    const i = Cache.index(phys);
    return this.tags[i] === Cache.tag(phys) ? this.data[i] : -1;
  }

  fill(phys: number, word: number): void {
    const i = Cache.index(phys);
    this.tags[i] = Cache.tag(phys);
    this.data[i] = word & 0xffff;
  }

  countHit(): void {
    this.hits = (this.hits + 1) & 0xffff;
    this.totalHits++;
  }

  countMiss(): void {
    this.misses = (this.misses + 1) & 0xffff;
    this.totalMisses++;
  }

  /** Yazma gözetleme: isabet varsa RAM'de satırı güncelle, EEPROM / boş bölgede geçersiz kıl. */
  snoopWrite(phys: number, value: number, isRam: boolean): void {
    const i = Cache.index(phys);
    if (this.tags[i] !== Cache.tag(phys)) return;
    if (!isRam) {
      this.tags[i] = -1;
      return;
    }
    const w = this.data[i];
    this.data[i] = phys & 1 ? (w & 0x00ff) | ((value & 0xff) << 8) : (w & 0xff00) | (value & 0xff);
  }

  invalidateAll(): void {
    this.tags.fill(-1);
  }

  resetCounters(): void {
    this.hits = 0;
    this.misses = 0;
  }
}
