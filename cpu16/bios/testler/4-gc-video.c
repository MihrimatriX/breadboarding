/* 4-gc-video.c — kart testi 4: zamanlayıcı kesmesi, kesme denetleyicisi ve video belleği.
 *
 * Zamanlayıcı: BIOS'un 10 ms'lik tık sayacı kesmeyle artar; 25 tık beklenir (kesme gelmezse
 * program takılır ve kart testi zaman aşımı verir). Video: ekranın her hücresine karakter ve renk
 * yazılıp geri okunur (VADDR / VDATA, adresin kendiliğinden artması dahil). Ekran sonunda silinir.
 */
#include <stdio.h>
#include <bios.h>

#define IRQ_MASK (*(volatile unsigned char *)0xFF09)
#define TIMER_CTRL (*(volatile unsigned char *)0xFF06)

int main(void) {
  printf("kesme maskesi %02x, zamanlayici denetimi %02x\n", IRQ_MASK, TIMER_CTRL);
  unsigned long t0 = bios_ticks();
  while (bios_ticks() - t0 < 25) {
  }
  printf("zamanlayici: 25 tik gecti\n");

  /* her hücreye (x + 7y) karakteri, (x ^ y) & 0x7F rengi */
  for (int y = 0; y < EKRAN_YUK; y++)
    for (int x = 0; x < EKRAN_GEN; x++) ekran_yaz(x, y, (x + 7 * y) & 0xFF, (x ^ y) & 0x7F);
  int hata = 0, ilk = -1;
  VADDR = 0;
  for (int i = 0; i < EKRAN_GEN * EKRAN_YUK; i++) {
    int x = i % EKRAN_GEN, y = i / EKRAN_GEN;
    int ch = VDATA, renk = VDATA; /* adres her okumada bir artar */
    if (ch != ((x + 7 * y) & 0xFF) || renk != ((x ^ y) & 0x7F)) {
      if (ilk < 0) ilk = i;
      hata++;
    }
  }
  bios_cls();
  if (hata) printf("VRAM: %d hucre hatali, ilki %d\n", hata, ilk);
  else printf("VRAM: 2400 hucre yazildi ve okundu\n");
  printf("GC VE VIDEO TESTI BITTI\n");
  return 0;
}
