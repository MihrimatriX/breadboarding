/* sort.c — fonksiyon işaretçileriyle sıralama: kütüphanenin qsort'u ve elle yazılmış
 * eklemeli sıralama, sayılar ve string'ler için. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef int (*cmp_fn)(const void *, const void *);

static int asc(const void *a, const void *b)
{
    int x = *(const int *)a, y = *(const int *)b;
    return x < y ? -1 : x > y;
}

static int desc(const void *a, const void *b)
{
    return asc(b, a);
}

static int by_name(const void *a, const void *b)
{
    return strcmp(*(char *const *)a, *(char *const *)b);
}

/* Genel eklemeli sıralama: eleman boyutu ve karşılaştırıcı parametre. */
static void insertion_sort(void *base, int n, int size, cmp_fn cmp)
{
    char *b = base;
    char tmp[16];
    int i, j;
    for (i = 1; i < n; i++) {
        memcpy(tmp, b + i * size, size);
        for (j = i; j > 0 && cmp(b + (j - 1) * size, tmp) > 0; j--)
            memcpy(b + j * size, b + (j - 1) * size, size);
        memcpy(b + j * size, tmp, size);
    }
}

static void print_ints(const char *title, int *a, int n)
{
    int i;
    printf("%-8s:", title);
    for (i = 0; i < n; i++)
        printf(" %d", a[i]);
    putchar('\n');
}

int main(void)
{
    int data[] = {42, -7, 1000, 0, -32768, 32767, 5, 5, -1, 99, 12, -300};
    int n = sizeof data / sizeof data[0];
    int copy[12];
    char *names[] = {"zeynep", "ali", "mehmet", "ayse", "can", "berk"};
    cmp_fn order[2];
    int i, k;

    order[0] = asc;
    order[1] = desc;
    for (k = 0; k < 2; k++) {
        memcpy(copy, data, sizeof data);
        qsort(copy, n, sizeof copy[0], order[k]);
        print_ints(k ? "qsort >" : "qsort <", copy, n);
    }
    memcpy(copy, data, sizeof data);
    insertion_sort(copy, n, sizeof(int), asc);
    print_ints("ekleme", copy, n);

    qsort(names, 6, sizeof(char *), by_name);
    printf("isimler :");
    for (i = 0; i < 6; i++)
        printf(" %s", names[i]);
    putchar('\n');

    /* rastgele sayılarla doğrulama */
    srand(2024);
    for (i = 0; i < 12; i++)
        copy[i] = rand() - 16384;
    qsort(copy, 12, sizeof(int), asc);
    for (i = 1; i < 12; i++)
        if (copy[i - 1] > copy[i]) {
            printf("HATA\n");
            return 1;
        }
    printf("rastgele: sıralı\n");
    return 0;
}
