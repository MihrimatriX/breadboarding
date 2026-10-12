/* fib.c — Fibonacci: özyinelemeli ve döngülü sürümler.
 * 16 bitlik unsigned int fib(24) = 46368'e kadar taşmadan yeter (fib(25) = 75025 > 65535).
 * Özyinelemeli sürümün her çağrısı yığına lr ve korunan register'ları iter (yığın 0xFF00'dan aşağı).
 *   npm run cpu16 -- cc cpu16/programs/c/fib.c --run
 * Beklenen çıktı: 0 1 1 2 3 5 8 ... 28657 46368, sonra fib_rec(18) = 2584. */
#include <stdio.h>

unsigned fib_rec(unsigned n)
{
    return n < 2 ? n : fib_rec(n - 1) + fib_rec(n - 2);
}

unsigned fib_iter(unsigned n)
{
    unsigned a = 0, b = 1, t;
    while (n--) {
        t = a + b;
        a = b;
        b = t;
    }
    return a;
}

int main(void)
{
    int i;
    for (i = 0; i <= 24; i++)
        printf("%u%c", fib_iter(i), i % 8 == 7 ? '\n' : ' ');
    printf("\nfib_rec(18) = %u\n", fib_rec(18));
    return fib_rec(10) == fib_iter(10) ? 0 : 1;
}
