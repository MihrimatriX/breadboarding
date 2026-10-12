/* siralama.c — Sıralama algoritmaları yarışıyor: kabarcık, seçmeli, eklemeli, hızlı ve qsort.
 *
 * Ne gösterir
 *   - Aynı 200 rastgele sayıyı beş algoritma sıralar; her biri için karşılaştırma ve taşıma
 *     (eleman yazma) sayısı ile süre ölçülür. n² algoritmalar (kabarcık, seçmeli: 19 900
 *     karşılaştırma) ile n·log n (hızlı sıralama: birkaç bin) arasındaki fark sayılarla görünür.
 *   - Fonksiyon işaretçisi tablosu: algoritmalar bir struct dizisinde, aynı döngüyle çağrılır.
 *   - Özyineleme ve yığın: hızlı sıralamanın ne kadar derine indiği ölçülür.
 *   - Kütüphanenin qsort'u karşılaştırmayı bir fonksiyon işaretçisiyle yapar (void * ile genel).
 *
 * CPU16 ile ilgisi
 *   - a[i] erişimi: adres = a + 2·i (int 2 bayt): bir SHL ve bir ADD, sonra LW. İşaretçiyle
 *     gezmek (*p++) bu hesabı her adımda bir ADDI'ye indirir.
 *   - Sayaçlar unsigned long: 65535'i aşabilirler. Her artırma ADDI + ADC'li iki kelimelik iştir.
 *   - Yığın 0xF800'dan aşağı büyür (BIOS hedefi); her özyinelemeli çağrı dönüş adresi (lr),
 *     korunan r4/r5 ve yerel değişkenler kadar yer tutar. Derinlik denetlenmez: taşarsa veriyi ezer.
 *   - rand() 32 bitlik bir doğrusal eşlik üretecidir (x = x · 1103515245 + 12345): her çağrı
 *     bir __mul32. Aynı tohum (srand) her çalıştırmada aynı diziyi verir.
 *
 * Nasıl çalıştırılır
 *   Uygulamada: CPU16 tezgâhı → Anakart + BIOS → "siralama.c" → Derle ve RAM'e yükle.
 *   Komut satırında: npm run cpu16 -- cc cpu16/bios/ornekler/siralama.c --hedef bios --run
 *
 * Beklenen çıktı (tamamı 4 MHz'te ≈ 3,7 s)
 *   kabarcik ve secmeli 19900 karsilastirma, eklemeli 10708, hizli 1946, qsort 1503; hepsi "evet"
 *   (sıralı). Süreler: kabarcık ≈ 1,5 s, hızlı sıralama ≈ 0,1 s.
 */

#include <bios.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define N 200

static int asil[N];  /* rastgele başlangıç dizisi */
static int dizi[N];  /* her algoritma bunun üzerinde çalışır */

static unsigned long karsilastirma, tasima;
static int derinlik, en_derin;

/* Sayan yardımcılar: makrolar, fonksiyon çağrısı maliyeti olmasın diye */
#define KUCUK(x, y) (karsilastirma++, (x) < (y))
#define YAZ(hedef, deger) (tasima++, (hedef) = (deger))

static void takas(int *a, int *b) {
  int t = *a;
  YAZ(*a, *b);
  YAZ(*b, t);
}

/* Kabarcık: komşuları karşılaştır, büyüğü sağa it. Her turda en büyük sona "kabarır". */
static void kabarcik(int *a, int n) {
  int i, j;
  for (i = n - 1; i > 0; i--)
    for (j = 0; j < i; j++)
      if (KUCUK(a[j + 1], a[j]))
        takas(&a[j], &a[j + 1]);
}

/* Seçmeli: kalanların en küçüğünü bul, başa koy. Karşılaştırma çok, taşıma az (n takas). */
static void secmeli(int *a, int n) {
  int i, j, en;
  for (i = 0; i < n - 1; i++) {
    en = i;
    for (j = i + 1; j < n; j++)
      if (KUCUK(a[j], a[en]))
        en = j;
    if (en != i)
      takas(&a[i], &a[en]);
  }
}

/* Eklemeli: soldaki kısım hep sıralı; yeni elemanı yerine kaydırarak ekle. Neredeyse sıralı
 * veride çok hızlıdır. */
static void eklemeli(int *a, int n) {
  int i, j, x;
  for (i = 1; i < n; i++) {
    x = a[i];
    for (j = i; j > 0 && KUCUK(x, a[j - 1]); j--)
      YAZ(a[j], a[j - 1]);
    YAZ(a[j], x);
  }
}

/* Hızlı sıralama (Hoare bölmesi): ortadaki elemanı eksen seç, küçükleri sola, büyükleri sağa
 * topla, iki yarıyı özyinelemeyle sırala. */
static void hizli_parca(int *a, int sol, int sag) {
  int i = sol, j = sag, eksen = a[(sol + sag) / 2];
  if (++derinlik > en_derin)
    en_derin = derinlik;
  while (i <= j) {
    while (KUCUK(a[i], eksen))
      i++;
    while (KUCUK(eksen, a[j]))
      j--;
    if (i <= j) {
      takas(&a[i], &a[j]);
      i++;
      j--;
    }
  }
  if (sol < j)
    hizli_parca(a, sol, j);
  if (i < sag)
    hizli_parca(a, i, sag);
  derinlik--;
}

static void hizli(int *a, int n) {
  hizli_parca(a, 0, n - 1);
}

/* qsort'un istediği karşılaştırıcı: negatif, sıfır ya da pozitif. (x - y yazmak tehlikeli:
 * 16 bitte 30000 - (-30000) taşar!) */
static int karsilastir(const void *p, const void *q) {
  int x = *(const int *)p, y = *(const int *)q;
  karsilastirma++;
  return x < y ? -1 : x > y;
}

static void kutuphane(int *a, int n) {
  qsort(a, n, sizeof a[0], karsilastir); /* taşımaları sayamayız: qsort içeride bayt bayt takas eder */
}

struct algoritma {
  const char *ad;
  void (*sirala)(int *a, int n);
};

static const struct algoritma ALGORITMALAR[] = {
  { "kabarcik", kabarcik },
  { "secmeli ", secmeli },
  { "eklemeli", eklemeli },
  { "hizli   ", hizli },
  { "qsort   ", kutuphane },
};

static int sirali_mi(const int *a, int n) {
  const int *son = a + n - 1;
  for (; a < son; a++) /* işaretçiyle gezme: her adım bir ADDI */
    if (a[1] < a[0])
      return 0;
  return 1;
}

static void ilk_on(const char *baslik, const int *a) {
  int i;
  printf("%s", baslik);
  for (i = 0; i < 10; i++)
    printf("%4d", a[i]);
  printf(" ...\n");
}

int main(void) {
  int i;
  unsigned long t0, t;

  srand(16); /* sabit tohum: her çalıştırmada aynı sayılar */
  for (i = 0; i < N; i++)
    asil[i] = rand() % 1000;

  bios_setattr(RENK(SARI, MAVI));
  printf(" Siralama yarisi: %d rastgele sayi \n", N);
  bios_setattr(RENK(ACIK_GRI, SIYAH));
  ilk_on("once : ", asil);

  bios_setattr(RENK(ACIK_CAMGOBEGI, SIYAH));
  printf("\nalgoritma  karsilastirma  tasima  sure (tik)  sirali\n");
  bios_setattr(RENK(ACIK_GRI, SIYAH));
  for (i = 0; i < (int)(sizeof ALGORITMALAR / sizeof ALGORITMALAR[0]); i++) {
    const struct algoritma *al = &ALGORITMALAR[i];
    memcpy(dizi, asil, sizeof dizi); /* herkes aynı veriyle başlasın */
    karsilastirma = tasima = 0;
    t0 = bios_ticks();
    al->sirala(dizi, N);              /* fonksiyon işaretçisiyle çağrı */
    t = bios_ticks() - t0;
    printf("%s   %12lu  ", al->ad, karsilastirma);
    if (al->sirala == kutuphane)
      printf("     -"); /* fonksiyon işaretçileri karşılaştırılabilir */
    else
      printf("%6lu", tasima);
    printf("  %10lu  %s\n", t, sirali_mi(dizi, N) ? "evet" : "HAYIR");
  }
  ilk_on("\nsonra: ", dizi);
  printf("Hizli siralama en fazla %d kez ic ice cagrildi (yigin: 0xF800'dan asagi).\n", en_derin);
  /* Dikkat: N * N = 40000 int'e sığmaz (16 bitte -25536 olur). unsigned ile hesapla. */
  printf("n(n-1)/2 = %u (kabarcik, secmeli), n*log2(n) ~ %u (hizli)\n", (unsigned)N * (N - 1) / 2, N * 15 / 2);
  return 0;
}
