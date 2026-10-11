/* primes.c — Eratosthenes kalburu: 2..N arasındaki asal sayılar. */
#include <stdio.h>
#include <string.h>

#define N 2000

static char composite[N + 1];

int main(void)
{
    int i, j, count = 0, last = 0;
    memset(composite, 0, sizeof composite);
    for (i = 2; i * i <= N; i++)
        if (!composite[i])
            for (j = i * i; j <= N; j += i)
                composite[j] = 1;
    printf("100'den küçük asallar:\n");
    for (i = 2; i <= N; i++) {
        if (composite[i])
            continue;
        count++;
        last = i;
        if (i < 100)
            printf("%3d%s", i, count % 10 == 0 ? "\n" : "");
    }
    printf("\n%d'e kadar %d asal var, en büyüğü %d\n", N, count, last);
    return count;
}
