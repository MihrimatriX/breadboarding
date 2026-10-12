/* bios.h — BIOS üzerinde çalışan programlar için (cc --hedef bios). Bkz. docs/bios.md, docs/anakart.md
 *
 * Program RAM'e 0x4000'dan yüklenir ve monitörün G 4000 komutuyla çalışır; main'den dönünce
 * monitöre döner. putchar/printf VGA ekrana ve UART'a yazar. */
#ifndef _BIOS_H
#define _BIOS_H

int bios_getc(void);          /* tuş gelene kadar bekler (PS/2 klavye ya da UART) */
int bios_trygetc(void);       /* tuş yoksa -1 */
int bios_getline(char *buf, int max); /* satır okur (yankılı, Backspace siler); buf en az max + 1 bayt.
                                       * Okunan karakter sayısı döner, sonuna 0 eklenir */
void bios_puts(const char *s);
void bios_puthex4(unsigned v);
void bios_cls(void);
void bios_setcursor(int x, int y);
void bios_setattr(int attr);  /* düşük 4 bit yazı, yüksek 4 bit zemin rengi */
unsigned long bios_ticks(void); /* 10 ms'lik tıklar */
/* UART RX (2) ve vsync (3) kesmeleri için kullanıcı kancası; 0 kaldırır. Kanca kesmeler kapalıyken
 * kaynak numarasıyla çağrılır ve kaynağı onaylamalıdır (vsync: VSTAT'a 2 yaz). Ayrıca IRQ_MASK'ta
 * (0xFF09) kaynağın biti açılmalıdır. Program bitmeden kanca kaldırılmalı (bkz. kesme.c). */
void bios_setirqhook(void (*kanca)(int kaynak));

/* Renkler (CGA paleti) */
enum {
  SIYAH, MAVI, YESIL, CAMGOBEGI, KIRMIZI, MOR, KAHVE, ACIK_GRI,
  KOYU_GRI, ACIK_MAVI, ACIK_YESIL, ACIK_CAMGOBEGI, ACIK_KIRMIZI, PEMBE, SARI, BEYAZ
};
#define RENK(yazi, zemin) (((zemin) << 4) | (yazi))

/* VGA metin belleğine doğrudan erişim (port: VADDR FF20/FF21, VDATA FF22; her erişimde adres artar) */
#define EKRAN_GEN 80
#define EKRAN_YUK 30
#define VADDR (*(volatile unsigned *)0xFF20)
#define VDATA (*(volatile unsigned char *)0xFF22)

/* (x, y) hücresine karakter ve renk yazar */
static void ekran_yaz(int x, int y, int ch, int renk) {
  VADDR = (unsigned)(y * EKRAN_GEN + x) * 2;
  VDATA = ch;
  VDATA = renk;
}

/* (x, y) hücresindeki karakter */
static int ekran_oku(int x, int y) {
  VADDR = (unsigned)(y * EKRAN_GEN + x) * 2;
  return VDATA;
}

#endif
