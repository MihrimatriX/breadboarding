/* cpu16.h — CPU16'ya özgü G/Ç ve kesme yardımcıları */
#ifndef _CPU16_H
#define _CPU16_H

/* Bellek eşlemeli G/Ç (spec §2e): 0xFF00 UART veri register'ı */
#define IO_BASE 0xFF00
#define UART_DATA (*(volatile unsigned char *)0xFF00)

/* Kesmeler: crt0 IRQ/SWI vektörlerinden bu fonksiyonları çağırır.
 * Kütüphanede boş varsayılanları var; kendi tanımınız onların yerine geçer. */
void irq_handler(void);
void swi_handler(void);

void ei(void);   /* kesmeleri aç */
void di(void);   /* kesmeleri kapat */
void halt(void); /* kesmeye kadar bekle */

#endif
