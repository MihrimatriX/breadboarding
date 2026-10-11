// SST39SF010 (128 KB, 8 bit) Flash modeli: okuma, bayt programlama, 4 KB sektör silme,
// tüm çipi silme ve yazılımla kimlik (ID) modu. Komut adresleri çipin içindeki adreslerdir
// (A14..A0 karşılaştırılır, A16..A15 önemsiz; datasheet'teki "5555h / 2AAAh").
// Programlama ve silme modelde anında biter (gerçek çipte ~20 µs / ~25 ms; yazılım DQ7
// veri yoklamasıyla bekler, bkz. bios.s).

export const FLASH_SIZE = 0x20000;
export const FLASH_SECTOR = 0x1000;
export const SST_MANUFACTURER_ID = 0xbf;
export const SST39SF010_DEVICE_ID = 0xb5;

// Komut dizisi durumları
const S_IDLE = 0;
const S_UNLOCK1 = 1; // AA@5555 alındı
const S_UNLOCK2 = 2; // 55@2AAA alındı: komut bekleniyor
const S_PROGRAM = 3; // A0: sonraki yazma = adres/veri
const S_ERASE1 = 4; // 80 alındı: ikinci kilit açma AA@5555
const S_ERASE2 = 5; // 55@2AAA
const S_ERASE3 = 6; // 30@sektör veya 10@5555

export class Sst39sf010 {
  readonly data = new Uint8Array(FLASH_SIZE).fill(0xff);
  private state = S_IDLE;
  /** Yazılımla kimlik modu: okumalar üretici/çip kimliğini döndürür. */
  idMode = false;
  /** İstatistik: programlanan bayt, silinen sektör, çip silme sayısı. */
  programs = 0;
  sectorErases = 0;
  chipErases = 0;
  /** Değiştiğinde çağrılır (önbellek / arayüz için): [başlangıç, bitiş) */
  onChange?: (start: number, end: number) => void;

  read(offset: number): number {
    if (this.idMode) return offset & 1 ? SST39SF010_DEVICE_ID : SST_MANUFACTURER_ID;
    return this.data[offset & (FLASH_SIZE - 1)];
  }

  write(offset: number, value: number): void {
    offset &= FLASH_SIZE - 1;
    value &= 0xff;
    const cmd = offset & 0x7fff;
    switch (this.state) {
      case S_IDLE:
        if (cmd === 0x5555 && value === 0xaa) this.state = S_UNLOCK1;
        else if (value === 0xf0) this.idMode = false; // tek döngülü "ID'den çık / oku moduna dön"
        return;
      case S_UNLOCK1:
        this.state = cmd === 0x2aaa && value === 0x55 ? S_UNLOCK2 : S_IDLE;
        return;
      case S_UNLOCK2:
        this.state = S_IDLE;
        if (cmd !== 0x5555) return;
        if (value === 0xa0) this.state = S_PROGRAM;
        else if (value === 0x80) this.state = S_ERASE1;
        else if (value === 0x90) this.idMode = true;
        else if (value === 0xf0) this.idMode = false;
        return;
      case S_PROGRAM:
        // Programlama sadece 1 → 0 yapabilir; 0 → 1 için silmek gerekir.
        this.data[offset] &= value;
        this.programs++;
        this.state = S_IDLE;
        this.onChange?.(offset, offset + 1);
        return;
      case S_ERASE1:
        this.state = cmd === 0x5555 && value === 0xaa ? S_ERASE2 : S_IDLE;
        return;
      case S_ERASE2:
        this.state = cmd === 0x2aaa && value === 0x55 ? S_ERASE3 : S_IDLE;
        return;
      case S_ERASE3:
        this.state = S_IDLE;
        if (value === 0x30) {
          const start = offset & ~(FLASH_SECTOR - 1);
          this.data.fill(0xff, start, start + FLASH_SECTOR);
          this.sectorErases++;
          this.onChange?.(start, start + FLASH_SECTOR);
        } else if (value === 0x10 && cmd === 0x5555) {
          this.data.fill(0xff);
          this.chipErases++;
          this.onChange?.(0, FLASH_SIZE);
        }
        return;
    }
  }

  /** Komut durumunu sıfırlar (oku moduna döner). İçerik korunur. */
  resetState(): void {
    this.state = S_IDLE;
    this.idMode = false;
  }

  /** Programlayıcıyla yazılmış gibi içerik yükler (EEPROM programlayıcı / BIOS imajı). */
  load(image: Uint8Array, offset = 0): void {
    this.data.set(image.subarray(0, FLASH_SIZE - offset), offset);
    this.onChange?.(offset, Math.min(FLASH_SIZE, offset + image.length));
  }
}
