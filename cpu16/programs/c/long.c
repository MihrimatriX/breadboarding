/* long.c — 32 bitlik aritmetik: faktöriyel, Fibonacci, bölme ve kaydırma.
 * long/unsigned long iki kelimedir (düşük kelime önce); toplama ADC/SBC ile,
 * çarpma/bölme __mul32/__div32 yardımcılarıyla yapılır (CPU16'da çarpma/bölme komutu yok).
 *   npm run cpu16 -- cc cpu16/programs/c/long.c --run
 * Beklenen çıktı: 1! ... 12! = 479001600 doğru, 13! 32 bite sığmaz (1932053504 = mod 2^32).
 * Aynı konunun BIOS'lu, işlemlerin döngü sayısını da ölçen sürümü: cpu16/bios/ornekler/uzun.c */
#include <stdio.h>

unsigned long factorial(unsigned n)
{
    return n <= 1 ? 1 : n * factorial(n - 1);
}

int digits(unsigned long v)
{
    int n = 1;
    while (v >= 10) {
        v /= 10;
        n++;
    }
    return n;
}

int main(void)
{
    unsigned long a = 0, b = 1, t;
    long s;
    int i;

    for (i = 1; i <= 13; i++)
        printf("%2d! = %lu\n", i, factorial(i));
    printf("(13! 32 bite sığmaz: gerçek değer 6227020800, mod 2^32 = %lu)\n", factorial(13));

    for (i = 0; i < 47; i++) {
        t = a + b;
        a = b;
        b = t;
    }
    printf("fib(47) = %lu (%d basamak), hex %lx\n", a, digits(a), a);

    s = -2000000000L;
    printf("%ld / 7 = %ld, %% 7 = %ld\n", s, s / 7, s % 7);
    printf("%ld >> 4 = %ld, << 1 = %ld\n", s, s >> 4, s << 1);
    printf("0x%08lx\n", 0xDEADBEEFUL ^ 0xFFFF0000UL);
    return digits(a);
}
