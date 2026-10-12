/* switch.c — switch/case: sıkışık durumlar atlama tablosuna, seyrek olanlar karşılaştırma
 * zincirine derlenir. Ayrıca düşme (fallthrough), default ve goto. Hangisinin seçildiğini görmek
 * için: npm run cpu16 -- cc cpu16/programs/c/switch.c -o switch.s
 *   npm run cpu16 -- cc cpu16/programs/c/switch.c --run
 * Beklenen çıktı: gün adları, HTTP kodları, "MCMXCIV=1994 XLII=42 MMXXIV=2024 ABC=-1". */
#include <stdio.h>

static const char *day_name(int d)
{
    switch (d) { /* 0..6: atlama tablosu */
    case 0: return "pazar";
    case 1: return "pazartesi";
    case 2: return "salı";
    case 3: return "çarşamba";
    case 4: return "perşembe";
    case 5: return "cuma";
    case 6: return "cumartesi";
    default: return "?";
    }
}

static int http_class(int code)
{
    switch (code) { /* seyrek: karşılaştırma zinciri */
    case 200:
    case 201:
    case 204:
        return 2;
    case 301:
    case 302:
        return 3;
    case 404:
    case -1:
        return 4;
    case 500:
        return 5;
    }
    return 0;
}

/* Roma rakamlarını çevir: char üzerinde switch, düşme ile */
static int roman(const char *s)
{
    int total = 0, prev = 0, v;
    const char *p = s;
    while (*p)
        p++;
    while (p != s) {
        switch (*--p) {
        case 'I': v = 1; break;
        case 'V': v = 5; break;
        case 'X': v = 10; break;
        case 'L': v = 50; break;
        case 'C': v = 100; break;
        case 'D': v = 500; break;
        case 'M': v = 1000; break;
        default: goto bad;
        }
        if (v < prev)
            total -= v;
        else {
            total += v;
            prev = v;
        }
    }
    return total;
bad:
    return -1;
}

/* Duff benzeri düşme: n'yi 4'e bölümünden kalanla başlayarak say */
static int fallthrough(int n)
{
    int count = 0;
    switch (n % 4) {
    case 3: count++;
    case 2: count++;
    case 1: count++;
    case 0: count += 10;
    }
    return count;
}

int main(void)
{
    int i;
    static const int codes[] = {200, 204, 302, 404, -1, 500, 418};
    for (i = -1; i <= 7; i++)
        printf("%s ", day_name(i));
    putchar('\n');
    for (i = 0; i < 7; i++)
        printf("%d:%d ", codes[i], http_class(codes[i]));
    putchar('\n');
    printf("MCMXCIV=%d XLII=%d MMXXIV=%d ABC=%d\n", roman("MCMXCIV"), roman("XLII"), roman("MMXXIV"), roman("ABC"));
    for (i = 0; i < 8; i++)
        printf("%d ", fallthrough(i));
    putchar('\n');
    return 0;
}
