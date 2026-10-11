/* merhaba.c — düz bellekte C (cc16, varsayılan ROM hedefi): program 0x0000'dan kendi vektörleriyle
 * başlar, printf UART'a (0xFF00) yazar, main dönünce CPU durur (HALT). */

#include <stdio.h>

int fib(int n) {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

int main(void) {
  int i;
  printf("Merhaba, CPU16! Bu program C ile yazildi.\n");
  for (i = 0; i <= 10; i++)
    printf("fib(%d) = %d\n", i, fib(i));
  return 0;
}
