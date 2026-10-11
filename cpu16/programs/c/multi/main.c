/* main.c — multi/ örneği: birden fazla dosyanın bağlanması.
 *   npm run cpu16 -- cc cpu16/programs/c/multi/main.c cpu16/programs/c/multi/util.c --run */
#include <stdio.h>
#include "util.h"

/* util.c'deki "static int counter" ile aynı ad: her dosyanın kendi kopyası */
static int counter;

static int history[MAX_HISTORY];

int main(void)
{
    struct stats st = {0};
    int values[] = {12, -7, 30000, 45, -32000, 8};
    int i, a, b, c;

    for (i = 0; i < 6; i++) {
        stats_add(&st, values[i]);
        history[counter++ % MAX_HISTORY] = values[i];
    }
    printf("%s: adet=%d min=%d max=%d toplam=%ld ort=%d\n", version, st.count, st.min, st.max, st.sum, stats_avg(&st));
    printf("gcd(84, -36)=%d gcd(17, 5)=%d\n", gcd(84, -36), gcd(17, 5));
    a = next_id();
    b = next_id();
    c = next_id();
    printf("id: %d %d %d, yerel sayaç %d\n", a, b, c, counter);
    printf("util çağrıları: %d, history[5]=%d\n", call_count, history[5]);
    return 0;
}
