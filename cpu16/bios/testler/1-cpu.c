/* 1-cpu.c — kart testi 1: ALU, bayraklar, dallanmalar, yığın ve C çalışma zamanı.
 *
 * Sözde rastgele sayılarla her ALU işlemini binlerce kez çalıştırıp sağlama toplamlarını yazar.
 * Gerçek kart, simülatörle bayt bayt aynı çıktıyı vermeli (npm run cpu16 -- kart-testi).
 * Bir işlemin toplamı farklıysa hata o işlemin yolundadır (ALU ROM'u, toplayıcı, kaydırıcı …).
 */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

static unsigned tohum = 12345;
static unsigned rnd(void) {
  tohum = tohum * 25173u + 13849u;
  return tohum;
}

/* toplama, sırayla döndürülerek (bit konumu da önemli olsun) */
static unsigned kat(unsigned s, unsigned v) { return ((s << 1) | (s >> 15)) ^ v; }

static int fib(int n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }

int main(void) {
  unsigned add = 0, sub = 0, and_ = 0, or_ = 0, xor_ = 0, shl = 0, shr = 0, sar = 0, mul = 0, div = 0, mod = 0, cmp = 0;
  unsigned long lsum = 0;
  for (int i = 0; i < 1500; i++) {
    unsigned a = rnd(), b = rnd();
    int sa = (int)a, sb = (int)b;
    unsigned n = b & 15;
    add = kat(add, a + b + (a < b)); /* ADD, taşma bayrağıyla karşılaştırma */
    sub = kat(sub, a - b);
    and_ = kat(and_, a & b);
    or_ = kat(or_, a | b);
    xor_ = kat(xor_, a ^ b);
    shl = kat(shl, a << n);
    shr = kat(shr, a >> n);
    sar = kat(sar, (unsigned)(sa >> n));
    mul = kat(mul, a * b);
    if (b) {
      div = kat(div, a / b);
      mod = kat(mod, a % b);
    }
    cmp = kat(cmp, (sa < sb) | (sa > sb) << 1 | (a < b) << 2 | (a == b) << 3 | (sa <= sb) << 4 | (a >= b) << 5);
    lsum += (unsigned long)a * b;
  }
  printf("ADD %04x  SUB %04x  AND %04x  OR  %04x\n", add, sub, and_, or_);
  printf("XOR %04x  SHL %04x  SHR %04x  SAR %04x\n", xor_, shl, shr, sar);
  printf("MUL %04x  DIV %04x  MOD %04x  CMP %04x\n", mul, div, mod, cmp);
  printf("long toplam %08lx\n", lsum);

  /* yığın ve özyineleme */
  printf("fib(20) = %d\n", fib(20));

  /* malloc + string */
  char *p = malloc(200);
  char *q = malloc(100);
  strcpy(p, "CPU16 ");
  for (int i = 0; i < 5; i++) strcat(p, "kart ");
  memset(q, 'x', 99);
  q[99] = 0;
  printf("strlen %d %d  strcmp %d\n", (int)strlen(p), (int)strlen(q), strcmp(p, "CPU16") > 0);
  free(q);
  free(p);
  printf("CPU TESTI BITTI\n");
  return 0;
}
