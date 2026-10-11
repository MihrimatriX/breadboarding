/* fib.c — Fibonacci: özyinelemeli ve döngülü sürümler.
 * 16 bitlik unsigned int fib(24) = 46368'e kadar taşmadan yeter. */
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
