/* libc16.c — cc16 standart kütüphanesinin C ile yazılmış kısmı.
 *
 * Her fonksiyon bağlayıcıda ayrı bir parça olduğundan yalnızca kullanılanlar programa girer.
 * Assembly ile yazılanlar (putchar, exit, ei/di/halt, __mul16, __div16 ... ) rt.s'dedir.
 * Kullanıcı aynı isimde bir fonksiyon tanımlarsa kütüphanedeki atılır (ör. irq_handler). */

#include <stdarg.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <cpu16.h>

/* ------------------------------------------------------------------ string.h */

size_t strlen(const char *s)
{
    const char *p = s;
    while (*p)
        p++;
    return p - s;
}

char *strcpy(char *dst, const char *src)
{
    char *d = dst;
    while ((*d++ = *src++) != 0)
        ;
    return dst;
}

char *strncpy(char *dst, const char *src, size_t n)
{
    char *d = dst;
    while (n && *src) {
        *d++ = *src++;
        n--;
    }
    while (n--)
        *d++ = 0;
    return dst;
}

char *strcat(char *dst, const char *src)
{
    strcpy(dst + strlen(dst), src);
    return dst;
}

char *strncat(char *dst, const char *src, size_t n)
{
    char *d = dst + strlen(dst);
    while (n-- && *src)
        *d++ = *src++;
    *d = 0;
    return dst;
}

int strcmp(const char *a, const char *b)
{
    while (*a && *a == *b) {
        a++;
        b++;
    }
    return *a - *b;
}

int strncmp(const char *a, const char *b, size_t n)
{
    for (; n; n--, a++, b++) {
        if (*a != *b)
            return *a - *b;
        if (!*a)
            break;
    }
    return 0;
}

char *strchr(const char *s, int c)
{
    for (;; s++) {
        if (*s == (char)c)
            return (char *)s;
        if (!*s)
            return NULL;
    }
}

char *strrchr(const char *s, int c)
{
    const char *r = NULL;
    for (;; s++) {
        if (*s == (char)c)
            r = s;
        if (!*s)
            return (char *)r;
    }
}

char *strstr(const char *hay, const char *needle)
{
    size_t n = strlen(needle);
    for (; *hay; hay++)
        if (strncmp(hay, needle, n) == 0)
            return (char *)hay;
    return n ? NULL : (char *)hay;
}

void *memcpy(void *dst, const void *src, size_t n)
{
    char *d = dst;
    const char *s = src;
    if ((((unsigned)d | (unsigned)s | n) & 1) == 0) {
        /* hizalı: kelime kelime kopyala */
        unsigned *dw = (unsigned *)d;
        const unsigned *sw = (const unsigned *)s;
        for (n >>= 1; n; n--)
            *dw++ = *sw++;
        return dst;
    }
    while (n--)
        *d++ = *s++;
    return dst;
}

void *memmove(void *dst, const void *src, size_t n)
{
    char *d = dst;
    const char *s = src;
    if (d <= s || d >= s + n)
        return memcpy(dst, src, n);
    d += n;
    s += n;
    while (n--)
        *--d = *--s;
    return dst;
}

void *memset(void *dst, int c, size_t n)
{
    char *d = dst;
    while (n--)
        *d++ = c;
    return dst;
}

int memcmp(const void *a, const void *b, size_t n)
{
    const unsigned char *p = a, *q = b;
    for (; n; n--, p++, q++)
        if (*p != *q)
            return *p - *q;
    return 0;
}

/* ------------------------------------------------------------------ ctype.h */

int isdigit(int c) { return c >= '0' && c <= '9'; }
int isupper(int c) { return c >= 'A' && c <= 'Z'; }
int islower(int c) { return c >= 'a' && c <= 'z'; }
int isalpha(int c) { return isupper(c) || islower(c); }
int isalnum(int c) { return isalpha(c) || isdigit(c); }
int isspace(int c) { return c == ' ' || (c >= '\t' && c <= '\r'); }
int isxdigit(int c) { return isdigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'); }
int isprint(int c) { return c >= 32 && c < 127; }
int ispunct(int c) { return isprint(c) && c != ' ' && !isalnum(c); }
int toupper(int c) { return islower(c) ? c - 32 : c; }
int tolower(int c) { return isupper(c) ? c + 32 : c; }

/* ------------------------------------------------------------------ stdlib.h */

int abs(int x) { return x < 0 ? -x : x; }
long labs(long x) { return x < 0 ? -x : x; }

long strtol(const char *s, char **end, int base)
{
    const char *p = s;
    unsigned long v = 0;
    int neg = 0, any = 0, d;
    while (isspace(*p))
        p++;
    if (*p == '-' || *p == '+')
        neg = *p++ == '-';
    if ((base == 0 || base == 16) && p[0] == '0' && (p[1] == 'x' || p[1] == 'X') && isxdigit(p[2])) {
        p += 2;
        base = 16;
    } else if (base == 0) {
        base = *p == '0' ? 8 : 10;
    }
    for (;; p++) {
        if (isdigit(*p))
            d = *p - '0';
        else if (isalpha(*p))
            d = tolower(*p) - 'a' + 10;
        else
            break;
        if (d >= base)
            break;
        v = v * base + d;
        any = 1;
    }
    if (end)
        *end = (char *)(any ? p : s);
    return neg ? -(long)v : (long)v;
}

int atoi(const char *s) { return (int)strtol(s, NULL, 10); }
long atol(const char *s) { return strtol(s, NULL, 10); }

static unsigned long rand_next = 1;

int rand(void)
{
    rand_next = rand_next * 1103515245UL + 12345;
    return (unsigned)(rand_next >> 16) & 0x7FFF;
}

void srand(unsigned int seed) { rand_next = seed; }

void abort(void)
{
    puts("abort");
    exit(134);
}

void __assert_fail(const char *expr, const char *file, int line)
{
    printf("Assertion failed: %s (%s:%d)\n", expr, file, line);
    exit(134);
}

static void swap_bytes(char *a, char *b, size_t n)
{
    char t;
    while (n--) {
        t = *a;
        *a++ = *b;
        *b++ = t;
    }
}

/* Hızlı sıralama; küçük yarıya özyineleme, büyük yarıda döngü (yığın derinliği log n). */
void qsort(void *base, size_t n, size_t size, int (*cmp)(const void *, const void *))
{
    char *b = base;
    size_t i, last;
    while (n > 1) {
        swap_bytes(b, b + (n >> 1) * size, size); /* ortadaki eleman pivot */
        last = 0;
        for (i = 1; i < n; i++)
            if (cmp(b + i * size, b) < 0)
                swap_bytes(b + ++last * size, b + i * size, size);
        swap_bytes(b, b + last * size, size);
        if (last < n - last - 1) {
            qsort(b, last, size, cmp);
            b += (last + 1) * size;
            n -= last + 1;
        } else {
            qsort(b + (last + 1) * size, n - last - 1, size, cmp);
            n = last;
        }
    }
}

/* ------------------------------------------------------------------ malloc / free
 *
 * Yığın (heap) .bss'in hemen ardından (__heap_start) başlar, yukarı doğru büyür.
 * Her bloğun başında 2 baytlık başlık: blok boyutu (başlık dahil, çift) | kullanımda biti (bit 0).
 * malloc ilk uyan boş bloğu kullanır, yanyana boş blokları birleştirir; uyan yoksa yığının
 * sonundan (heap_top) yeni blok keser. Sınır: __heap_end ile yığın işaretçisinin 256 bayt altı. */

extern char _heap_start[];
extern char _heap_end[];
static unsigned *heap_top;

#define BLK_NEXT(p) ((unsigned *)((char *)(p) + (*(p) & ~1u)))

void *malloc(size_t n)
{
    unsigned *p, *q;
    unsigned need;
    char *lim;
    if (n == 0 || n > 0x7FF0)
        return NULL;
    need = (n + 3) & ~1u;
    if (!heap_top)
        heap_top = (unsigned *)_heap_start;
    for (p = (unsigned *)_heap_start; p < heap_top; p = BLK_NEXT(p)) {
        if (*p & 1)
            continue;
        for (;;) { /* sonraki boş blokları birleştir */
            q = BLK_NEXT(p);
            if (q >= heap_top || (*q & 1))
                break;
            *p += *q;
        }
        if (*p >= need) {
            if (*p - need >= 4) {
                *(unsigned *)((char *)p + need) = *p - need;
                *p = need;
            }
            *p |= 1;
            return p + 1;
        }
        if (BLK_NEXT(p) >= heap_top) { /* sondaki boş blok: yığın sonuna geri ver */
            heap_top = p;
            break;
        }
    }
    lim = (char *)&need - 256;
    if (lim > _heap_end)
        lim = _heap_end;
    if ((char *)heap_top > lim || need > (unsigned)(lim - (char *)heap_top))
        return NULL;
    p = heap_top;
    *p = need | 1;
    heap_top = (unsigned *)((char *)p + need);
    return p + 1;
}

void free(void *ptr)
{
    if (ptr)
        ((unsigned *)ptr)[-1] &= ~1u;
}

void *calloc(size_t n, size_t size)
{
    void *p;
    if (size && n > 0xFFFFu / size)
        return NULL;
    p = malloc(n * size);
    if (p)
        memset(p, 0, n * size);
    return p;
}

void *realloc(void *ptr, size_t n)
{
    void *q;
    size_t old;
    if (!ptr)
        return malloc(n);
    if (n == 0) {
        free(ptr);
        return NULL;
    }
    old = (((unsigned *)ptr)[-1] & ~1u) - 2;
    if (old >= n)
        return ptr;
    q = malloc(n);
    if (q) {
        memcpy(q, ptr, old);
        free(ptr);
    }
    return q;
}

/* ------------------------------------------------------------------ stdio.h */

int puts(const char *s)
{
    while (*s)
        putchar(*s++);
    putchar('\n');
    return 0;
}

/* printf ailesinin ortak biçimlendiricisi. Çıktı fmt_buf'a (sprintf) ya da UART'a gider. */
static char *fmt_buf;     /* NULL ise UART */
static size_t fmt_left;   /* tampona sığacak bayt (sonlandırıcı hariç) */
static int fmt_count;     /* üretilen toplam karakter */

static void fmt_out(int c)
{
    fmt_count++;
    if (!fmt_buf)
        putchar(c);
    else if (fmt_left) {
        *fmt_buf++ = c;
        fmt_left--;
    }
}

static void fmt_pad(int c, int n)
{
    while (n-- > 0)
        fmt_out(c);
}

/* Desteklenen: %d %i %u %x %X %o %c %s %p %% ; bayraklar - 0 + boşluk #; genişlik (* dahil);
 * hassasiyet (.n, .*); boyut l (ll = l), h ve z yok sayılır. */
static int fmt_core(const char *fmt, va_list ap)
{
    char digits[12];
    fmt_count = 0;
    for (; *fmt; fmt++) {
        int left = 0, zero = 0, plus = 0, space = 0, alt = 0, lng = 0;
        int width = 0, prec = -1, len, nd;
        char c = *fmt;
        if (c != '%') {
            fmt_out(c);
            continue;
        }
        for (;;) {
            c = *++fmt;
            if (c == '-')
                left = 1;
            else if (c == '0')
                zero = 1;
            else if (c == '+')
                plus = 1;
            else if (c == ' ')
                space = 1;
            else if (c == '#')
                alt = 1;
            else
                break;
        }
        if (c == '*') {
            width = va_arg(ap, int);
            if (width < 0) {
                left = 1;
                width = -width;
            }
            c = *++fmt;
        } else {
            while (isdigit(c)) {
                width = width * 10 + c - '0';
                c = *++fmt;
            }
        }
        if (c == '.') {
            prec = 0;
            c = *++fmt;
            if (c == '*') {
                prec = va_arg(ap, int);
                c = *++fmt;
            } else {
                while (isdigit(c)) {
                    prec = prec * 10 + c - '0';
                    c = *++fmt;
                }
            }
        }
        while (c == 'l' || c == 'h' || c == 'z') {
            if (c == 'l')
                lng = 1;
            c = *++fmt;
        }
        switch (c) {
        case 'd':
        case 'i':
        case 'u':
        case 'x':
        case 'X':
        case 'o':
        case 'p': {
            unsigned long v;
            unsigned base = c == 'x' || c == 'X' || c == 'p' ? 16 : c == 'o' ? 8 : 10;
            const char *hexd = c == 'X' ? "0123456789ABCDEF" : "0123456789abcdef";
            char sign = 0;
            const char *pre = "";
            if (c == 'd' || c == 'i') {
                long s = lng ? va_arg(ap, long) : (long)va_arg(ap, int);
                if (s < 0) {
                    sign = '-';
                    v = 0UL - (unsigned long)s;
                } else {
                    v = s;
                    sign = plus ? '+' : space ? ' ' : 0;
                }
            } else {
                v = lng ? va_arg(ap, unsigned long) : (unsigned long)va_arg(ap, unsigned);
            }
            if (c == 'p') {
                pre = "0x";
                if (prec < 0)
                    prec = 4;
            } else if (alt && v) {
                pre = base == 16 ? (c == 'X' ? "0X" : "0x") : base == 8 ? "0" : "";
            }
            nd = 0;
            if (v >> 16) {
                do {
                    digits[nd++] = hexd[(unsigned)(v % base)];
                    v /= base;
                } while (v >> 16);
            }
            {
                unsigned w = (unsigned)v; /* 16 bitlik hızlı yol */
                while (w || (nd == 0 && prec != 0)) {
                    digits[nd++] = hexd[w % base];
                    w /= base;
                    if (!w)
                        break;
                }
            }
            len = (prec > nd ? prec : nd) + (sign != 0) + strlen(pre);
            if (!left && !(zero && prec < 0))
                fmt_pad(' ', width - len);
            if (sign)
                fmt_out(sign);
            while (*pre)
                fmt_out(*pre++);
            if (!left && zero && prec < 0)
                fmt_pad('0', width - len);
            fmt_pad('0', prec - nd);
            while (nd)
                fmt_out(digits[--nd]);
            if (left)
                fmt_pad(' ', width - len);
            break;
        }
        case 'c':
            if (!left)
                fmt_pad(' ', width - 1);
            fmt_out(va_arg(ap, int));
            if (left)
                fmt_pad(' ', width - 1);
            break;
        case 's': {
            const char *s = va_arg(ap, const char *);
            if (!s)
                s = "(null)";
            for (len = 0; s[len] && (prec < 0 || len < prec); len++)
                ;
            if (!left)
                fmt_pad(' ', width - len);
            for (nd = 0; nd < len; nd++)
                fmt_out(s[nd]);
            if (left)
                fmt_pad(' ', width - len);
            break;
        }
        case 0:
            fmt--; /* biçim dizisi '%' ile bitti */
            break;
        default: /* %% ve bilinmeyenler olduğu gibi */
            fmt_out(c);
            break;
        }
    }
    return fmt_count;
}

int vprintf(const char *fmt, va_list ap)
{
    fmt_buf = NULL;
    return fmt_core(fmt, ap);
}

int printf(const char *fmt, ...)
{
    va_list ap;
    int n;
    va_start(ap, fmt);
    n = vprintf(fmt, ap);
    va_end(ap);
    return n;
}

int vsnprintf(char *buf, size_t size, const char *fmt, va_list ap)
{
    int n;
    fmt_buf = buf;
    fmt_left = size ? size - 1 : 0;
    n = fmt_core(fmt, ap);
    if (size)
        *fmt_buf = 0;
    fmt_buf = NULL;
    return n;
}

int vsprintf(char *buf, const char *fmt, va_list ap)
{
    return vsnprintf(buf, 0x7FFF, fmt, ap);
}

int sprintf(char *buf, const char *fmt, ...)
{
    va_list ap;
    int n;
    va_start(ap, fmt);
    n = vsnprintf(buf, 0x7FFF, fmt, ap);
    va_end(ap);
    return n;
}

int snprintf(char *buf, size_t size, const char *fmt, ...)
{
    va_list ap;
    int n;
    va_start(ap, fmt);
    n = vsnprintf(buf, size, fmt, ap);
    va_end(ap);
    return n;
}

/* ------------------------------------------------------------------ kesmeler (varsayılanlar) */

void irq_handler(void) {}
void swi_handler(void) {}
