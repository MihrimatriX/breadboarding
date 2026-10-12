/* strings.c — string işlemleri: string.h, ctype.h, sprintf ve elle yazılmış yardımcılar.
 * char cc16'da işaretsizdir (0..255); string'ler sıfırla biten bayt dizileridir.
 *   npm run cpu16 -- cc cpu16/programs/c/strings.c --run
 * Beklenen çıktı: word = "cpu16", ters / büyük harf, strcmp, strchr, strstr, atoi, printf biçimleri
 * ve snprintf'in kırpması ("uzun bi" istenen 14). */
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void reverse(char *s)
{
    char *e = s + strlen(s) - 1, t;
    while (s < e) {
        t = *s;
        *s++ = *e;
        *e-- = t;
    }
}

static int count_words(const char *s)
{
    int n = 0, in = 0;
    for (; *s; s++) {
        if (isspace(*s))
            in = 0;
        else if (!in) {
            in = 1;
            n++;
        }
    }
    return n;
}

int main(void)
{
    char buf[64];
    char word[16] = "cpu";
    const char *text = "  cc16 ile C, 16 bitlik islemcide  ";
    char *p;
    int i;

    strcat(word, "16");
    printf("word = \"%s\", uzunluk %u\n", word, strlen(word));
    strcpy(buf, "Merhaba");
    reverse(buf);
    printf("ters: %s\n", buf);
    for (i = 0; buf[i]; i++)
        buf[i] = toupper(buf[i]);
    printf("büyük: %s\n", buf);
    printf("strcmp: %d %d %d\n", strcmp("abc", "abd") < 0, strcmp("b", "a") > 0, strcmp("ayni", "ayni"));
    printf("kelime sayısı: %d\n", count_words(text));
    p = strchr(text, 'C');
    printf("strchr: \"%s\"\n", p ? p : "(yok)");
    p = strstr(text, "16 bit");
    printf("strstr ofset: %d\n", p ? (int)(p - text) : -1);
    printf("atoi: %d %d %ld\n", atoi("1234"), atoi("  -56xyz"), strtol("0x7fff", 0, 16) + 1);
    sprintf(buf, "[%5d|%-5d|%05d|%x|%c|%.3s]", 42, -42, 42, 255, 'Z', "abcdef");
    printf("%s (%u karakter)\n", buf, strlen(buf));
    i = snprintf(buf, 8, "%s", "uzun bir metin");
    printf("snprintf: \"%s\" istenen %d\n", buf, i);
    return 0;
}
