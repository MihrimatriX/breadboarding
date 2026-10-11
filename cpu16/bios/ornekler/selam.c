/* selam.c — BIOS üzerinde ilk C programı (cc --hedef bios).
 * printf ekrana ve UART'a yazar; renkler BIOS_SETATTR ile, zaman BIOS'un 10 ms'lik tıklarıyla. */

#include <bios.h>
#include <stdio.h>

static int fib(int n) {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

int main(void) {
  unsigned long t0 = bios_ticks();
  int i;
  bios_setattr(RENK(SARI, MAVI));
  printf("Merhaba, CPU16! Bu program C ile yazildi.\n");
  bios_setattr(RENK(ACIK_GRI, SIYAH));
  for (i = 0; i < 16; i++) {
    bios_setattr(RENK(i == 0 ? ACIK_GRI : i, SIYAH));
    printf("%2d ", i);
  }
  bios_setattr(RENK(ACIK_GRI, SIYAH));
  printf("\nfib(18) = %d\n", fib(18));
  printf("Gecen sure: %lu x 10 ms\n", bios_ticks() - t0);
  return 0;
}
