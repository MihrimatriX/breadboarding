// 28C256 (AT28C256, 32 KB paralel EEPROM, 8 bit) modeli. Emülatör (Machine) ve kapı seviyesi kartlardaki
// davranışsal çip (chips/parts/memory.ts) aynı sınıfı kullanır; iki model aynı zaman damgalarıyla aynı
// sonucu verir.
//
// Veri sayfasındaki davranış:
//   - Okuma: 150 ns erişim. Yazma döngüsü sürerken okunan bayt "durum"dur: D7 son yazılan baytın D7'sinin
//     tersi (DATA yoklaması), D6 her okumada değişir (toggle biti). Döngü bitince gerçek veri okunur.
//   - Bayt/sayfa yazma: ~WE (ya da ~CE) yükselirken bayt sayfa tamponuna alınır. Bir sonraki bayt
//     tBLC = 150 µs içinde gelirse aynı sayfaya (A14..A6) eklenir; gelmezse iç yazma döngüsü başlar
//     (tWC ≤ 10 ms). Sayfada yüklenmeyen baytlar eski değerini korur; silme gerekmez.
//   - Yazılım veri koruması (SDP): AA→5555, 55→2AAA, A0→5555 dizisi korumayı açar; korumalıyken yalnızca
//     bu diziden hemen sonra yüklenen baytlar yazılır, diğer yazmalar yok sayılır. AA 55 80 AA 55 20
//     dizisi korumayı kapatır. Çip fabrikadan korumasız gelir; bu projenin programlayıcısı her sayfayı
//     korumalı yazar (load() korumayı açık bırakır).
//   - Yazma döngüsünde gelen yazmalar yok sayılır. Kimlik (ID) okuma yazılımla yapılamaz (A9 = 12 V ister).
//
// Model kararları:
//   - Zaman nanosaniye cinsinden dışarıdan verilir. Emülatörde ve kapı seviyesi kartlarda erişimin ait
//     olduğu komutun başladığı CPU döngüsüdür (× 250 ns): iki model aynı saati görür.
//   - Komut dizisi baytları (5555/2AAA'ya yazılan AA, 55, A0, 80, 20) korumasızken de veri olarak
//     yazılmaz (dizi tamamlanınca tampondan çıkarılır).
//   - Sayfa yüklenirken yapılan okuma da durum döndürür (yükleme bitmiş sayılmaz).
//   - Durumdaki diğer bitler (D5..D0) son yazılan baytınkilerdir.

export const EEPROM_SIZE = 0x8000;
/** Emülatörde EEPROM'un fiziksel alanı: 0x00000–0x07FFF (bank 0 ve 1) */
export const FLASH_SIZE = EEPROM_SIZE;
export const EEPROM_PAGE = 64;
/** Bayt yükleme penceresi (tBLC): sonraki bayt bu süre içinde gelmezse yazma döngüsü başlar */
export const TBLC_NS = 150_000;
/** Yazma döngüsü (tWC, veri sayfası en çok 10 ms) */
export const TWC_NS = 10_000_000;

const SEQ_IDLE = 0;
const SEQ_AA = 1; // AA@5555
const SEQ_55 = 2; // 55@2AAA: komut bekleniyor
const SEQ_80 = 3; // 80@5555: ikinci AA bekleniyor
const SEQ_80AA = 4;
const SEQ_8055 = 5;
const DONE_PROTECT = 6; // AA 55 A0: koruma aç / korumalı yazma
const DONE_UNPROTECT = 7; // AA 55 80 AA 55 20: koruma kapat

function nextSeq(s: number, a: number, v: number): number {
  const start = a === 0x5555 && v === 0xaa ? SEQ_AA : SEQ_IDLE;
  switch (s) {
    case SEQ_AA: return a === 0x2aaa && v === 0x55 ? SEQ_55 : start;
    case SEQ_55:
      if (a === 0x5555 && v === 0xa0) return DONE_PROTECT;
      if (a === 0x5555 && v === 0x80) return SEQ_80;
      return start;
    case SEQ_80: return start === SEQ_AA ? SEQ_80AA : SEQ_IDLE;
    case SEQ_80AA: return a === 0x2aaa && v === 0x55 ? SEQ_8055 : start;
    case SEQ_8055: return a === 0x5555 && v === 0x20 ? DONE_UNPROTECT : start;
    default: return start;
  }
}

/** Kopyalanabilir iç durum (kapı seviyesi kartlara bir izin ortasından başlamak için) */
interface EepromState {
  sdp: boolean;
  seq: number;
  loading: boolean;
  lastLoad: number;
  page: number;
  buf: Int16Array;
  cmdSlots: number[];
  busyUntil: number;
  last: number;
  toggle: number;
}

export class At28c256 {
  readonly data = new Uint8Array(EEPROM_SIZE).fill(0xff);
  /** Yazılım veri koruması açık mı */
  sdp = false;
  /** Yazma döngüsü süresi (ns); testler kısaltabilir */
  writeCycleNs = TWC_NS;
  /** İstatistik: başlayan yazma döngüleri ve yazılan baytlar */
  writeCycles = 0;
  bytesWritten = 0;
  /** İçerik değiştiğinde (yazma döngüsü başında): [başlangıç, bitiş) */
  onChange?: (start: number, end: number) => void;

  private seq = SEQ_IDLE;
  private loading = false;
  private lastLoad = 0;
  private page = 0;
  private readonly buf = new Int16Array(EEPROM_PAGE).fill(-1);
  /** korumasızken tampona veri olarak giren komut baytlarının yerleri (dizi tamamlanınca çıkarılır) */
  private cmdSlots: number[] = [];
  private busyUntil = -1;
  private last = 0xff;
  private toggle = 0;

  /** t anına kadar geçen zamanı işler: yükleme penceresi kapandıysa yazma döngüsü, bittiyse boşta */
  settle(t: number): void {
    if (this.loading && t >= this.lastLoad + TBLC_NS) this.startWrite(this.lastLoad + TBLC_NS);
    if (this.busyUntil >= 0 && t >= this.busyUntil) this.busyUntil = -1;
  }

  /** Yazma sürüyor mu (sayfa yükleniyor ya da iç yazma döngüsü) */
  busy(t: number): boolean {
    this.settle(t);
    return this.loading || this.busyUntil >= 0;
  }

  /** Bir okuma döngüsünün başı (~CE ve ~OE düşük): yazma sürüyorsa toggle biti değişir */
  readCycle(t: number): void {
    if (this.busy(t)) this.toggle ^= 1;
  }

  /** Okuma döngüsü sırasında çıkıştaki bayt (son readCycle'dan bu yana zaman ilerlememiştir) */
  output(offset: number): number {
    if (this.loading || this.busyUntil >= 0) return (~this.last & 0x80) | (this.toggle << 6) | (this.last & 0x3f);
    return this.data[offset & (EEPROM_SIZE - 1)];
  }

  /** Yan etkisiz okuma (arayüz): t anındaki çıkış */
  peek(offset: number, t: number): number {
    this.settle(t);
    return this.output(offset);
  }

  /** Bir yazma kenarı (~WE ya da ~CE yükselirken alınan adres ve veri) */
  write(offset: number, value: number, t: number): void {
    this.settle(t);
    if (this.busyUntil >= 0) return; // iç yazma döngüsünde yok sayılır
    offset &= EEPROM_SIZE - 1;
    value &= 0xff;
    const seq = nextSeq(this.seq, offset, value);
    this.seq = seq === DONE_PROTECT || seq === DONE_UNPROTECT ? SEQ_IDLE : seq;
    if (this.sdp) {
      if (this.loading) {
        // korumalı yazma penceresi açık: veri baytı (komut dizisi aranmaz)
        this.seq = SEQ_IDLE;
        this.loadByte(offset, value, t);
      } else if (seq === DONE_PROTECT) {
        this.openLoad(t);
      } else if (seq === DONE_UNPROTECT) {
        this.sdp = false;
        this.startWrite(t);
      }
      return; // korumalıyken komut dizisi dışındaki yazmalar yok sayılır
    }
    this.loadByte(offset, value, t);
    const slot = offset & (EEPROM_PAGE - 1);
    if (seq === SEQ_IDLE) this.cmdSlots = [];
    else if (seq === SEQ_AA) this.cmdSlots = [slot];
    else this.cmdSlots.push(slot);
    if (seq === DONE_PROTECT || seq === DONE_UNPROTECT) {
      for (const k of this.cmdSlots) this.buf[k] = -1;
      this.cmdSlots = [];
      if (seq === DONE_PROTECT) this.sdp = true;
    }
  }

  private openLoad(t: number): void {
    this.loading = true;
    this.buf.fill(-1);
    this.lastLoad = t;
  }

  private loadByte(offset: number, value: number, t: number): void {
    if (!this.loading) this.openLoad(t);
    this.page = offset >> 6;
    this.buf[offset & (EEPROM_PAGE - 1)] = value;
    this.last = value;
    this.lastLoad = t;
  }

  private startWrite(at: number): void {
    this.loading = false;
    this.cmdSlots = [];
    const base = this.page * EEPROM_PAGE;
    let n = 0;
    for (let i = 0; i < EEPROM_PAGE; i++) {
      if (this.buf[i] < 0) continue;
      this.data[base + i] = this.buf[i];
      n++;
    }
    this.buf.fill(-1);
    this.busyUntil = at + this.writeCycleNs;
    this.writeCycles++;
    this.bytesWritten += n;
    if (n) this.onChange?.(base, base + EEPROM_PAGE);
  }

  /** Programlayıcıyla yazılmış gibi içerik yükler (her sayfa korumalı yazılır: SDP açık kalır) */
  load(image: Uint8Array, offset = 0): void {
    this.data.set(image.subarray(0, EEPROM_SIZE - offset), offset);
    this.sdp = true;
    this.seq = SEQ_IDLE;
    this.loading = false;
    this.cmdSlots = [];
    this.buf.fill(-1);
    this.busyUntil = -1;
    this.onChange?.(offset, Math.min(EEPROM_SIZE, offset + image.length));
  }

  /** İç durum (içerik hariç) */
  state(): EepromState {
    return {
      sdp: this.sdp, seq: this.seq, loading: this.loading, lastLoad: this.lastLoad, page: this.page,
      buf: this.buf.slice(), cmdSlots: [...this.cmdSlots], busyUntil: this.busyUntil, last: this.last, toggle: this.toggle,
    };
  }

  /** Başka bir çipin içeriğini ve iç durumunu kopyalar */
  copyFrom(o: At28c256): void {
    this.data.set(o.data);
    const s = o.state();
    this.sdp = s.sdp;
    this.seq = s.seq;
    this.loading = s.loading;
    this.lastLoad = s.lastLoad;
    this.page = s.page;
    this.buf.set(s.buf);
    this.cmdSlots = s.cmdSlots;
    this.busyUntil = s.busyUntil;
    this.last = s.last;
    this.toggle = s.toggle;
    this.writeCycleNs = o.writeCycleNs;
  }
}
