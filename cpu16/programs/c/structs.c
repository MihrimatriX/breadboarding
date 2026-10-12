/* structs.c — struct, union, enum ve malloc ile bağlı liste.
 * union'daki 16 bitlik sayının düşük baytı önce gelir: CPU16 küçük uçludur (little-endian).
 *   npm run cpu16 -- cc cpu16/programs/c/structs.c --run
 * Beklenen çıktı: "union: düşük bayt 34, yüksek bayt 12", liste ileri ve geri, "4 düğüm silindi; yeni
 * blok ilk düğümün yerinde: evet". Esnek dizi üyeli kelime listesi: cpu16/bios/ornekler/liste.c */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum color { RED, GREEN = 5, BLUE };

struct point {
    int x, y;
};

struct node {
    int value;
    char name[6];
    struct node *next;
};

union word {
    unsigned w;
    unsigned char b[2];
};

static struct point add(struct point a, struct point b)
{
    struct point r;
    r.x = a.x + b.x;
    r.y = a.y + b.y;
    return r;
}

static struct node *push_sorted(struct node *head, int value, const char *name)
{
    struct node *n = malloc(sizeof *n), **pp = &head;
    n->value = value;
    strcpy(n->name, name);
    while (*pp && (*pp)->value < value)
        pp = &(*pp)->next;
    n->next = *pp;
    *pp = n;
    return head;
}

static struct node *reverse(struct node *head)
{
    struct node *prev = NULL, *next;
    while (head) {
        next = head->next;
        head->next = prev;
        prev = head;
        head = next;
    }
    return prev;
}

static void print_list(struct node *n)
{
    for (; n; n = n->next)
        printf("%s=%d%s", n->name, n->value, n->next ? " -> " : "\n");
}

int main(void)
{
    struct point p = {3, 4}, q = {10, -20}, r;
    struct node *list = NULL, *n, *first;
    union word u;
    int count = 0;

    r = add(p, q);
    printf("add: (%d, %d)\n", r.x, r.y);
    q = r; /* struct ataması */
    q.x++;
    printf("kopya: (%d, %d) asıl: (%d, %d)\n", q.x, q.y, r.x, r.y);
    printf("renkler: %d %d %d, sizeof(struct node) = %u\n", RED, GREEN, BLUE, sizeof(struct node));

    u.w = 0x1234;
    printf("union: düşük bayt %x, yüksek bayt %x\n", u.b[0], u.b[1]);

    list = push_sorted(list, 30, "otuz");
    first = list;
    list = push_sorted(list, 10, "on");
    list = push_sorted(list, 20, "yirmi");
    list = push_sorted(list, 5, "bes");
    print_list(list);
    list = reverse(list);
    print_list(list);
    while (list) {
        n = list->next;
        free(list);
        list = n;
        count++;
    }
    /* serbest bırakılan bellek yeniden kullanılır */
    n = malloc(sizeof *n);
    printf("%d düğüm silindi; yeni blok ilk düğümün yerinde: %s\n", count, n == first ? "evet" : "hayır");
    return 0;
}
