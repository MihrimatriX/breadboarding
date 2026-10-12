/* kalbur.c — Eratosthenes kalburu, bit dizisiyle: 65535'e kadar bütün asallar.
 *
 * Ne gösterir
 *   - Bit dizisi: her sayı için bir bayt yerine bir bit. Sadece tek sayıları tutunca 1..65535
 *     için 32768 bit = 4096 bayt yeter (bayt dizisi 64 KB isterdi: CPU16'nın bütün adres alanı!).
 *   - Bit işlemleri: k. bit = bayt k >> 3, bit k & 7. Maskeler tablodan gelir, çünkü 1 << n
 *     CPU16'da n turluk bir SHL döngüsüdür. Bitleri saymak da 16 girişlik bir tabloyla.
 *   - 16 bitlik döngü tuzağı: unsigned m için "m <= 65535" HER ZAMAN doğrudur; m += adim
 *     65535'i geçince sarar ve döngü bitmez. Doğrusu, eklemeden önce sınırı sınamak.
 *
 * CPU16 ile ilgisi
 *   - Global diziler .bss'tedir: BIOS hedefinde 0xA000'dan başlar, crt0 açılışta sıfırlar.
 *     Kod ve sabit tablolar 0x4000'dan başlayan bölgededir (bkz. cc16.md, "BIOS hedefi").
 *   - LBU / SB bayt komutları: bit dizisi bayt bayt okunup yazılır (LW/SW kelime içindir).
 *   - Bir baytın 8 bitine tek AND ile bakılabilir: ikiz asalları sayarken 8 sayı birden sınanır.
 *
 * Nasıl çalıştırılır
 *   Uygulamada: CPU16 tezgâhı → Anakart + BIOS → "kalbur.c" → Derle ve RAM'e yükle.
 *   Komut satırında: npm run cpu16 -- cc cpu16/bios/ornekler/kalbur.c --hedef bios --run
 *
 * Beklenen çıktı
 *   200'den küçük 46 asal, sonra:
 *     pi(10) = 4, pi(100) = 25, pi(1000) = 168, pi(10000) = 1229, pi(65536) = 6542
 *     en büyük 16 bitlik asal: 65521, ikiz asal çifti (p, p + 2): 860
 *   Kalbur 4 MHz'te 1,8 saniye kadar sürer (≈ 48 000 bit işaretlenir, her biri ≈ 25 komut). */

#include <bios.h>
#include <stdio.h>

#define N 65535u   /* 16 bitlik en büyük sayı */
#define BAYT 4096  /* tek sayılar 1, 3, 5 ... 65535: 32768 bit */

/* bit k, 2k + 1 sayısını temsil eder; 1 = bileşik (asal değil). .bss'te: başta hepsi 0 */
static unsigned char bilesik[BAYT];

static const unsigned char BIT[8] = { 1, 2, 4, 8, 16, 32, 64, 128 };

#define BILESIK_MI(k) (bilesik[(k) >> 3] & BIT[(k) & 7])
#define ISARETLE(k) (bilesik[(k) >> 3] |= BIT[(k) & 7])

/* 0..15 arasındaki bir sayıda kaç tane 1 biti var */
static const unsigned char BIRLER[16] = { 0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4 };

static unsigned bir_say(unsigned char b) {
  return BIRLER[b & 15] + BIRLER[b >> 4];
}

static void kalbur(void) {
  unsigned p, k;
  ISARETLE(0); /* 1 asal değildir */
  for (p = 3; p <= 255; p += 2) { /* p * p <= 65535 ⇔ p <= 255 */
    if (BILESIK_MI(p >> 1))
      continue;
    /* p'nin tek katları p², p² + 2p, p² + 4p ... (çift sayılar dizide yok). Sayı m = 2k + 1
     * olduğundan "m += 2p" bit numarasında "k += p" demektir. Son bit 32767 (= 65535).
     * YANLIŞ: for (m = p * p; m <= 65535; m += 2 * p) — unsigned m <= 65535 hep doğru,
     * m sarar ve döngü hiç bitmez. Doğrusu: eklemeden önce sınırı sına. */
    for (k = (p * p) >> 1;; k += p) {
      ISARETLE(k);
      if (k > 32767 - p)
        break; /* bir sonraki kat dizinin dışında */
    }
  }
}

/* 2k + 1 < 2·klim + 1 olan tek asalların sayısı: önce tam baytlar (tabloyla), sonra kalan bitler */
static unsigned say(unsigned klim) {
  unsigned n = 0, i, k;
  for (i = 0; i < klim >> 3; i++)
    n += 8 - bir_say(bilesik[i]); /* 0 bitler asaldır */
  for (k = klim & ~7u; k < klim; k++)
    if (!BILESIK_MI(k))
      n++;
  return n;
}

/* pi(x): x'ten küçük asal sayısı (2 dahil, o yüzden + 1); x ≤ 65536 */
static unsigned pi(unsigned long x) {
  return 1 + say((unsigned)(x / 2));
}

/* İkiz asallar (p, p + 2): bit k ve k + 1 ikisi de asal. asal & (asal >> 1) bir baytın içindeki
 * 7 komşu çifti tek komutta sınar; bayt sınırındaki çift (önceki baytın bit 7'si ile bu baytın
 * bit 0'ı) ayrıca bakılır. */
static unsigned ikizler(void) {
  unsigned n = 0, i;
  unsigned char asal, onceki = 0;
  for (i = 0; i < BAYT; i++) {
    asal = ~bilesik[i]; /* 1 = asal */
    n += bir_say(asal & (asal >> 1));
    if ((onceki & 0x80) && (asal & 1))
      n++;
    onceki = asal;
  }
  return n; /* 2 çift olduğu için hiçbir çiftte yok: (3, 5) ilk çifttir */
}

int main(void) {
  static const unsigned long SINIRLAR[] = { 10, 100, 1000, 10000, 65536L };
  unsigned long t0, t;
  unsigned i, k, adet;

  bios_setattr(RENK(SARI, MAVI));
  printf(" Eratosthenes kalburu: 65535'e kadar, bit dizisiyle \n");
  bios_setattr(RENK(ACIK_GRI, SIYAH));

  t0 = bios_ticks();
  kalbur();
  t = bios_ticks() - t0;

  printf("200'den kucuk asallar:\n%4u", 2);
  adet = 1;
  for (k = 1; k < 100; k++) /* 2k + 1 < 200 */
    if (!BILESIK_MI(k)) {
      printf("%4u", 2 * k + 1);
      if (++adet % 16 == 0)
        putchar('\n');
    }
  printf("\n(%u tane)\n\n", adet);

  bios_setattr(RENK(ACIK_CAMGOBEGI, SIYAH));
  printf("pi(x) = x'ten kucuk asal sayisi:\n");
  for (i = 0; i < 5; i++)
    printf("  pi(%lu) = %u", SINIRLAR[i], pi(SINIRLAR[i]));
  putchar('\n');
  bios_setattr(RENK(ACIK_GRI, SIYAH));

  for (k = BAYT * 8 - 1; BILESIK_MI(k); k--) {
  } /* yukarıdan aşağı ilk asal */
  printf("En buyuk 16 bitlik asal: %u\n", 2 * k + 1);
  printf("65536'dan kucuk ikiz asal cifti (p, p+2): %u\n\n", ikizler());

  printf("Bit dizisi: %u bayt, adres 0x%04X (.bss); bayt dizisi 65536 bayt isterdi.\n",
         (unsigned)sizeof bilesik, (unsigned)bilesik);
  printf("Kalbur %lu tik surdu (1 tik = 10 ms).\n", t);
  return 0;
}
