/* stdarg.h — cc16
 * Argümanlar bellekte kelime dizisi olarak durur (ilk 4 kelime r0–r3'ten yığına "ev alanı"na yazılır),
 * bu yüzden va_list basit bir char işaretçisidir. char/short argümanlar int'e terfi eder. */
#ifndef _STDARG_H
#define _STDARG_H

typedef char *va_list;

#define __va_size(type) ((sizeof(type) + 1) & ~1)
#define va_start(ap, last) ((ap) = __builtin_va_start(last))
#define va_arg(ap, type) (*(type *)(((ap) += __va_size(type)) - __va_size(type)))
#define va_end(ap) ((void)0)
#define va_copy(dst, src) ((dst) = (src))

#endif
