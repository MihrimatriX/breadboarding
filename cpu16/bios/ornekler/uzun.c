/* uzun.c — 32 bitlik long ve yazılımla çarpma / bölme: ne kadar tutar?
 *
 * Ne gösterir
 *   - 16 bit nerede biter: 8! = 40320 unsigned'a sığar, 9! sığmaz; Fibonacci'de fib(24) = 46368
 *     son 16 bitlik sayıdır. long (32 bit) 12!'ye ve fib(47)'ye kadar yeter.
 *   - C'de taşma nasıl yakalanır: işaretsiz toplamda (a + b < a) eldenin (C bayrağının) C'deki
 *     karşılığıdır; çarpmada sonucu geri bölmek (f * n / n != f) taşmayı ele verir.
 *   - Her işlemin CPU16'da kaç döngü sürdüğü, BIOS'un 10 ms'lik tık sayacıyla ölçülür.
 *
 * CPU16 ile ilgisi
 *   - long iki kelimedir (düşük kelime önce). Toplama iki komuttur: ADD düşük kelimeleri toplar
 *     ve eldeyi C bayrağına koyar, ADC yüksek kelimeleri elde ile toplar. Çıkarma SUB + SBC.
 *   - CPU16'da çarpma ve bölme komutu YOK (74HC ile bir çarpıcı onlarca çip tutardı, spec.md).
 *     Derleyici rt.s'deki yardımcıları çağırır: __mul16 / __mul32 kaydır-topla, __udiv16 /
 *     __udiv32 kaydır-çıkar döngüleridir. Kaydırıcı da 1 bitlik olduğu için her adım bir SHL/ROL.
 *   - Çarpmanın süresi çarpanın büyüklüğüne bağlıdır (döngü çarpan sıfırlanınca biter);
 *     32 bitlik bölme iki üst kelime de 0 ise 16 bitlik hızlı yola girer.
 *   - Sabitle çarpmayı (a * 10) derleyici kaydırma ve toplamaya çevirir: çağrı yok.
 *
 * Nasıl çalıştırılır
 *   Uygulamada: CPU16 tezgâhı → Anakart + BIOS → "uzun.c" → Derle ve RAM'e yükle.
 *   Komut satırında: npm run cpu16 -- cc cpu16/bios/ornekler/uzun.c --hedef bios --run
 *
 * Beklenen çıktı (özet; ölçüm satırları ±1 tık oynayabilir, 4 MHz'te)
 *    9! 16 bitte 35200 (TASTI), 32 bitte 362880 ... 13! 32 bitte de taşar: 1932053504
 *    16 bit: fib(24) = 46368    32 bit: fib(47) = 2971215073
 *    a + b (16 bit) ≈ 55 döngü, a * b (16 bit) 185–445, a / b (32 bit) ≈ 1900 döngü */

#include <bios.h>
#include <stdio.h>

/* ---- 1. Faktöriyel: 16 bit ve 32 bit yan yana ---- */
static void faktoriyel(void) {
  unsigned f16 = 1;
  unsigned long f32 = 1, onceki;
  unsigned n;
  printf(" n   unsigned (16 bit)   unsigned long (32 bit)\n");
  for (n = 1; n <= 13; n++) {
    onceki = f32;
    f16 = f16 * n;   /* __mul16: sonuç 65536'ya göre kalan (mod 2^16) */
    f32 = f32 * n;   /* __mul32: n önce unsigned long'a genişletilir */
    if (n < 7)
      continue;      /* küçükler ekranı doldurmasın */
    printf("%2u   %10u %s", n, f16, f16 != f32 ? "TASTI" : "     ");
    /* 32 bitte taşma: sonucu geri bölünce eski değer çıkmıyorsa bitler kaybolmuştur */
    printf("   %10lu %s\n", f32, f32 / n != onceki ? "TASTI (dogrusu 6227020800)" : "");
  }
}

/* ---- 2. Fibonacci: her genişlikte en büyük terim ----
 * İşaretsiz toplamda taşma = sonuç terimlerden küçük çıkar (a + b < a). Donanımdaki C (elde)
 * bayrağının C dilindeki karşılığı budur. */
static void fibonacci(void) {
  unsigned a = 0, b = 1, t;
  unsigned long la = 0, lb = 1, lt;
  int n = 1;
  while ((t = a + b) >= b) { /* toplam sardıysa dur */
    a = b;
    b = t;
    n++;
  }
  printf("16 bit: fib(%d) = %u, fib(%d) sigmaz\n", n, b, n + 1);
  n = 1;
  while ((lt = la + lb) >= lb) { /* ADD + ADC; sararsa toplam küçülür */
    la = lb;
    lb = lt;
    n++;
  }
  printf("32 bit: fib(%d) = %lu, fib(%d) sigmaz\n", n, lb, n + 1);
}

/* ---- 3. Ölçüm ----
 * Her işlem küçük bir fonksiyondur; volatile değişkenler her seferinde bellekten okunup yazılır,
 * böylece derleyici hesabı döngüden çıkaramaz. Boş fonksiyonun süresi (çağrı + döngü) çıkarılır. */
static volatile int a16 = 12345, b16 = 10, c16 = 30000, r16;
static volatile long a32 = 1234567L, b32 = 891, r32;

static void t_bos(void) {}
static void t_add16(void) { r16 = a16 + b16; }      /* LW, LW, ADD, SW */
static void t_add32(void) { r32 = a32 + b32; }      /* ADD + ADC: iki kat iş */
static void t_mul10(void) { r16 = a16 * 10; }       /* sabit: (a << 1) + (a << 3), çağrı yok */
static void t_mul16k(void) { r16 = a16 * b16; }     /* __mul16, çarpan 10: 4 tur */
static void t_mul16b(void) { r16 = a16 * c16; }     /* __mul16, çarpan 30000: 15 tur */
static void t_mul32(void) { r32 = a32 * b32; }      /* __mul32, çarpan 891: 10 tur, her tur ADD+ADC */
static void t_div16(void) { r16 = a16 / b16; }      /* __div16 → __udiv16: 16 tur */
static void t_div32(void) { r32 = a32 / b32; }      /* __div32 → __udiv32: 32 tur */

struct olcum {
  const char *ad;
  void (*f)(void);   /* fonksiyon işaretçisi: JALR ile çağrılır */
  unsigned kez;      /* ucuz işlemler daha çok tekrarlanır ki 10 ms'lik tık yetsin */
};

static const struct olcum OLCUMLER[] = {
  { "a + b    16 bit         ", t_add16, 8000 },
  { "a + b    32 bit         ", t_add32, 8000 },
  { "a * 10   16 bit, sabit  ", t_mul10, 8000 },
  { "a * b    16 bit, b=10   ", t_mul16k, 4000 },
  { "a * b    16 bit, b=30000", t_mul16b, 2000 },
  { "a * b    32 bit, b=891  ", t_mul32, 1000 },
  { "a / b    16 bit         ", t_div16, 1000 },
  { "a / b    32 bit         ", t_div32, 500 },
};

/* BIOS'un tık sayacı RAM'de, 0xF820'de 32 bitlik bir değişkendir; zamanlayıcı kesmesi onu
 * saniyede 100 kez artırır. Düşük kelimesini doğrudan okumak bios_ticks() çağrısından ucuzdur.
 * volatile: değer programın dışından (kesmeden) değişir, her okuma gerçekten belleğe gitmeli. */
#define TIK (*(volatile unsigned *)0xF820)

/* f'yi kez kere çağırır, geçen tık sayısını döndürür */
static unsigned sure(void (*f)(void), unsigned kez) {
  unsigned t0, i;
  t0 = TIK;
  while (TIK == t0) {
  } /* bir tık sınırına hizalan: ölçüm tık başında başlasın */
  t0 = TIK;
  for (i = 0; i < kez; i++)
    f();
  return TIK - t0; /* 16 bitlik fark, sayaç sarsa da doğru (mod 2^16) */
}

/* tık → işlem başına CPU döngüsü: 1 tık = 10 ms = 40 000 döngü (4 MHz) */
static unsigned long dongu(unsigned tik, unsigned kez) {
  return (unsigned long)tik * 40000UL / kez;
}

static void olcum(void) {
  unsigned long bos = dongu(sure(t_bos, 8000), 8000); /* çağrı + döngü payı */
  int i;
  printf("islem (volatile degiskenlerle)  islem basina, yaklasik\n");
  for (i = 0; i < (int)(sizeof OLCUMLER / sizeof OLCUMLER[0]); i++) {
    const struct olcum *o = &OLCUMLER[i];
    unsigned long d = dongu(sure(o->f, o->kez), o->kez);
    d = d > bos ? d - bos : 0;
    printf("  %s  %5lu dongu  %4lu us\n", o->ad, d, d / 4); /* 4 döngü = 1 us */
  }
}

int main(void) {
  bios_setattr(RENK(SARI, MAVI));
  printf(" long: 32 bit, yazilimla carpma ve bolme \n");
  bios_setattr(RENK(ACIK_GRI, SIYAH));
  faktoriyel();
  putchar('\n');
  fibonacci();
  putchar('\n');
  bios_setattr(RENK(ACIK_CAMGOBEGI, SIYAH));
  olcum();
  bios_setattr(RENK(ACIK_GRI, SIYAH));
  printf("(10 ms'lik tikla olculdu; donanim carpma/bolme yok, rt.s'deki dongulerle)\n");
  return 0;
}
