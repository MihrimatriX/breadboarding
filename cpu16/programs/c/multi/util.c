/* util.c — multi/ örneği, ikinci çeviri birimi. */
#include "util.h"

int call_count;
const char version[] = "util 1.0";

/* static: yalnızca bu dosyada görünür; main.c'deki aynı adlı değişkenle çakışmaz */
static int counter = 100;

static int clamp_abs(int v)
{
    return v < 0 ? -v : v;
}

void stats_add(struct stats *s, int value)
{
    call_count++;
    if (s->count == 0 || value < s->min)
        s->min = value;
    if (s->count == 0 || value > s->max)
        s->max = value;
    s->sum += value;
    s->count++;
}

int stats_avg(const struct stats *s)
{
    call_count++;
    return s->count ? (int)(s->sum / s->count) : 0;
}

int gcd(int a, int b)
{
    call_count++;
    a = clamp_abs(a);
    b = clamp_abs(b);
    while (b) {
        int t = a % b;
        a = b;
        b = t;
    }
    return a;
}

int next_id(void)
{
    return counter++;
}
