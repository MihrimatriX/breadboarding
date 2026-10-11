/* merhaba-vga.c — C ile CPU16: printf UART'a gider, VGA ekranına da doğrudan yazılır.
 *
 * cc16'nın "rom" hedefi: program Flash bank 0'a (0x0000) yazılır ve RESET'ten çalışır, BIOS yok.
 * Değişkenler RAM'de (0x4000'dan), yığın 0xFF00'ın altında.
 *
 * printf her karakteri UART_DATA'ya (FF00) yazar: G/Ç kartının UART'ı gönderir, yan paneldeki
 * UART kutusunda görünür. Ekran için video kartının VRAM'i port üzerinden yazılır: VADDR'a (FF20)
 * hücre adresi, VDATA'ya (FF22) önce karakter kodu, sonra renk baytı; adres her yazmada
 * kendiliğinden bir artar. Hücre adresi = (satır · 80 + sütun) · 2.
 */
#include <stdio.h>

#define VADDR (*(volatile unsigned *)0xFF20)
#define VDATA (*(volatile unsigned char *)0xFF22)

/* renk baytı: düşük 4 bit yazı rengi, yüksek 4 bit zemin rengi (16 renk CGA paleti) */
#define RENK(yazi, zemin) (((zemin) << 4) | (yazi))
#define MAVI 1
#define ACIK_YESIL 10
#define SARI 14
#define BEYAZ 15

/* (x, y) hücresinden başlayarak metni yaz */
static void yaz(int x, int y, const char *s, int renk) {
  VADDR = (unsigned)(y * 80 + x) * 2;
  while (*s) {
    VDATA = *s++;
    VDATA = renk;
  }
}

/* ilk n satırı boşlukla doldur (VRAM reset'te silinmez: önceki programın yazıları kalır).
 * Döngü 8 hücrede bir döner: kapı seviyesinde her komut sayılır. */
#define BOS VDATA = ' '; VDATA = renk;
static void temizle(int n, int renk) {
  int i;
  VADDR = 0;
  for (i = n * 10; i > 0; i--) {
    BOS BOS BOS BOS BOS BOS BOS BOS
  }
}

static int fib(int n) {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

int main(void) {
  char satir[32];
  int i;
  printf("Merhaba, C! 6 * 7 = %d\n", 6 * 7);
  temizle(30, RENK(BEYAZ, 0));
  yaz(2, 1, " Merhaba, C! Bu satiri cc16 derledi. ", RENK(SARI, MAVI));
  for (i = 1; i <= 7; i++) {
    sprintf(satir, "fib(%d) = %d", i, fib(i));
    puts(satir); /* puts: metin + satır sonu, UART'a */
    yaz(4, 2 + i, satir, RENK(8 + i, 0));
  }
  yaz(2, 11, "Bitti: main dondu, CPU HALT ile durdu.", RENK(ACIK_YESIL, 0));
  printf("Bitti.\n");
  return 0;
}
