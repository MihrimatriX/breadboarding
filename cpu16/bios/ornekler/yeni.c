/* yeni.c — kendi C programın buradan başlar. Ctrl+Enter: derle ve RAM'e yükle.
 * printf hem VGA ekrana hem UART'a yazar. Renkler ve ekrana doğrudan yazma için bios.h,
 * dilin neleri desteklediği için cpu16/docs/cc16.md. main dönünce BIOS monitörüne geri dönülür. */

#include <bios.h>
#include <stdio.h>

int kare(int n) {
  return n * n;
}

int main(void) {
  int i;
  bios_setattr(RENK(SARI, MAVI));
  printf("Merhaba! Bu benim ilk C programim.\n");
  bios_setattr(RENK(ACIK_GRI, SIYAH));
  for (i = 1; i <= 10; i++)
    printf("%2d x %2d = %3d\n", i, i, kare(i));

  /* ekranın sağ üst köşesine renkli bir yıldız: (x, y, karakter, renk) */
  ekran_yaz(78, 0, '*', RENK(ACIK_KIRMIZI, SIYAH));
  return 0;
}
