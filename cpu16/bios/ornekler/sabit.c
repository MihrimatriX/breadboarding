/* sabit.c — Kayan nokta olmadan kesirli sayılar: sabit noktalı (fixed-point) aritmetik.
 *
 * Ne gösterir
 *   - cc16'da float/double yok (CPU16'da kayan nokta birimi de yok). Kesirli sayılar bunun yerine
 *     ölçeklenmiş tam sayılarla tutulur. Burada Q4.12 biçimi: 16 bitin üst 4'ü tam kısım (işaretle
 *     birlikte), alt 12'si kesir. 1.0 = 4096, pi = 12868, aralık -8 .. +7.9997, adım 1/4096.
 *   - Toplama ve çıkarma olduğu gibi çalışır; çarpmada sonuç 2^12 kat büyük çıkar ve geri
 *     kaydırılır: (a * b) >> 12. Ara sonuç 16 bite sığmaz, 32 bitte (long) hesaplanmalı.
 *     Bölmede tersi: (a << 12) / b.
 *   - Newton yöntemiyle karekök ve Taylor serisiyle (Horner biçiminde) sinüs; sonra sinüs ve
 *     kosinüs eğrileri VGA ekranına doğrudan çizilir.
 *
 * CPU16 ile ilgisi
 *   - Her sabit noktalı çarpma bir __mul32 çağrısı ve 12 bitlik bir kaydırmadır (32 bitlik
 *     kaydırma her bit için SHR + ROR: iki kelime). Bir sinüs ≈ 5 çarpma.
 *   - Ekran: VRAM'e doğrudan yazılır (bios.h: ekran_yaz). Hücre adresi (satır·80 + sütun)·2,
 *     çift bayt karakter, tek bayt renk. CP857 kod sayfası: 0xC4 ─, 0xB3 │, 0xC5 ┼.
 *
 * Nasıl çalıştırılır
 *   Uygulamada: CPU16 tezgâhı → Anakart + BIOS → "sabit.c" → Derle ve RAM'e yükle.
 *   Komut satırında: npm run cpu16 -- cc cpu16/bios/ornekler/sabit.c --hedef bios --run
 *
 * Beklenen çıktı
 *   pi = 3.1416, 1/3 = 0.3333, pi * (1/3) = 1.0469 ama pi / 3 = 1.0471, kok(2) = 1.4141,
 *   sin 30: 0.5000, sin 45: 0.7070, sin 90: 1.0000; altında 0..2pi aralığında sarı sinüs (*) ve
 *   camgöbeği kosinüs (o) eğrileri (ekranın ortası x = pi). */

#include <bios.h>
#include <stdio.h>

typedef int q12;      /* Q4.12 sabit noktalı sayı: değer = q / 4096 */
#define BIR 4096      /* 1.0 */
#define PI 12868      /* 3.14160 (gerçek 3.14159...) */
#define IKI_PI 25736
#define YARIM_PI 6434

/* çarpma: 32 bitlik ara sonuç, sonra 12 bit sağa (aritmetik kaydırma: negatifler de doğru) */
static q12 carp(q12 a, q12 b) {
  return (q12)(((long)a * b) >> 12);
}

/* bölme: bölüneni önce 12 bit sola kaydır ki sonuç da Q4.12 olsun */
static q12 bol(q12 a, q12 b) {
  return (q12)(((long)a << 12) / b);
}

/* Q4.12 sayıyı 4 ondalıkla yaz: kesir · 10000 / 4096, yuvarlayarak */
static void yaz(q12 v) {
  unsigned m = v < 0 ? 0u - (unsigned)v : (unsigned)v;
  unsigned long kesir = ((m & 4095) * 10000UL + 2048) >> 12;
  unsigned tam = m >> 12;
  if (kesir == 10000) { /* 0.99995 yukarı yuvarlandı */
    tam++;
    kesir = 0;
  }
  printf("%s%u.%04lu", v < 0 ? "-" : "", tam, kesir);
}

/* Newton yöntemi: x ← (x + a/x) / 2. Her adımda doğru basamak sayısı kabaca ikiye katlanır. */
static q12 karekok(q12 a) {
  q12 x = a, onceki;
  int adim = 0;
  if (a <= 0)
    return 0;
  do {
    onceki = x;
    x = (x + bol(a, x)) >> 1; /* / 2 yerine 1 bit sağa kaydırma: tek SAR komutu */
    adim++;
  } while (x != onceki && adim < 10);
  return x;
}

/* sin x, 0 <= x <= pi/2 için Taylor serisi, Horner biçiminde (az çarpma):
 *   sin x = x · (1 − x²/6 · (1 − x²/20 · (1 − x²/42 · (1 − x²/72)))) */
static q12 sin_cekirdek(q12 x) {
  q12 x2 = carp(x, x);
  q12 t = BIR - x2 / 72;
  t = BIR - carp(x2 / 42, t);
  t = BIR - carp(x2 / 20, t);
  t = BIR - carp(x2 / 6, t);
  return carp(x, t);
}

/* her açı için: önce simetriyle 0..pi/2 aralığına indir */
static q12 sinus(q12 x) {
  while (x < 0)
    x += IKI_PI;
  while (x >= IKI_PI)
    x -= IKI_PI;
  if (x > PI)
    return -sinus(x - PI); /* sin(x) = −sin(x − pi) */
  if (x > YARIM_PI)
    x = PI - x;            /* sin(x) = sin(pi − x) */
  return sin_cekirdek(x);
}

static q12 kosinus(q12 x) {
  return sinus(x + YARIM_PI);
}

/* ---- çizim: eğriler ekranın alt kısmında ---- */
#define ORTA 17  /* x ekseninin satırı */
#define GENLIK 9 /* +1 → satır ORTA − 9, −1 → satır ORTA + 9 */

/* Q4.12 değeri (−1..1) ekran satırına çevir. GENLIK · s 16 bite sığmayabilir (9 · 4096 > 32767):
 * çarpım long'da yapılır, yarım ekleyip kaydırarak yuvarlanır. */
static int satir(q12 s) {
  return ORTA - (int)(((long)s * GENLIK + 2048) >> 12);
}

static void eksenler(void) {
  int x, y;
  int renk = RENK(KOYU_GRI, SIYAH);
  for (x = 0; x < EKRAN_GEN; x++)
    ekran_yaz(x, ORTA, 0xC4, renk);        /* ─ */
  for (y = ORTA - GENLIK; y <= ORTA + GENLIK; y++)
    ekran_yaz(0, y, 0xB3, renk);           /* │ */
  ekran_yaz(0, ORTA, 0xC5, renk);          /* ┼ */
}

static void egriler(void) {
  int x;
  for (x = 0; x < EKRAN_GEN; x++) {
    q12 aci = (q12)((long)x * IKI_PI / EKRAN_GEN); /* sütun → 0..2pi */
    ekran_yaz(x, satir(kosinus(aci)), 'o', RENK(ACIK_CAMGOBEGI, SIYAH));
    ekran_yaz(x, satir(sinus(aci)), '*', RENK(SARI, SIYAH)); /* kesişimde sinüs üstte */
  }
}

int main(void) {
  static const int DERECELER[] = { 0, 30, 45, 60, 90 };
  int i;
  q12 ucte_bir = bol(BIR, 3 * BIR);

  bios_setattr(RENK(ACIK_GRI, SIYAH));
  bios_cls();
  bios_setattr(RENK(SARI, MAVI));
  printf(" Sabit noktali sayilar: Q4.12 (16 bit, 1.0 = 4096) \n");
  bios_setattr(RENK(ACIK_GRI, SIYAH));
  printf("pi = %d/4096 = ", PI);
  yaz(PI);
  printf("    1/3 = %d/4096 = ", ucte_bir);
  yaz(ucte_bir);
  printf("\npi * (1/3) = ");
  yaz(carp(PI, ucte_bir));
  printf(" ama pi / 3 = ");
  yaz(bol(PI, 3 * BIR));
  printf(": yuvarlanmis 1/3 hatayi buyutur\n");
  printf("kok(2) = ");
  yaz(karekok(2 * BIR));
  printf("  kok(5) = ");
  yaz(karekok(5 * BIR));
  printf("   (Newton: x = (x + a/x) / 2)\n");
  for (i = 0; i < 5; i++) {
    printf("sin %2d: ", DERECELER[i]);
    yaz(sinus((q12)(((long)DERECELER[i] * PI + 90) / 180))); /* derece → radyan, yuvarlayarak */
    printf(i < 4 ? "  " : "\n");
  }

  eksenler();
  egriler();
  bios_setcursor(0, ORTA + GENLIK + 2);
  bios_setattr(RENK(SARI, SIYAH));
  printf("* sin x   ");
  bios_setattr(RENK(ACIK_CAMGOBEGI, SIYAH));
  printf("o cos x   ");
  bios_setattr(RENK(ACIK_GRI, SIYAH));
  printf("x: 0 .. 2pi (80 sutun), y: -1 .. 1\n"); /* imleç bir alt satırda: monitör istemi oraya */
  return 0;
}
