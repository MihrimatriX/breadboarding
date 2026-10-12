/* selam.c — BIOS üzerinde ilk C programı (cc --hedef bios).
 * printf ekrana ve UART'a yazar; renkler BIOS_SETATTR ile, zaman BIOS'un 10 ms'lik tıklarıyla.
 *   Uygulamada: CPU16 tezgâhı → Anakart + BIOS → "selam.c" → Derle ve RAM'e yükle.
 *   Komut satırında: npm run cpu16 -- cc cpu16/bios/ornekler/selam.c --hedef bios --run
 * Beklenen çıktı: renkli başlık, 0..15 renkli sayılar, "fib(18) = 2584", geçen süre (≈ 20 × 10 ms).
 * Sonraki örnekler ve önerilen sıra: cpu16/docs/c-ornekleri.md */

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
