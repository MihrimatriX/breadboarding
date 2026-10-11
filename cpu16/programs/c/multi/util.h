/* util.h — multi/ örneği: iki çeviri biriminin paylaştığı bildirimler. */
#ifndef UTIL_H
#define UTIL_H

#define MAX_HISTORY 8

struct stats {
    int count;
    int min, max;
    long sum;
};

extern int call_count;          /* util.c'de tanımlı */
extern const char version[];

void stats_add(struct stats *s, int value);
int stats_avg(const struct stats *s);
int gcd(int a, int b);
int next_id(void);

#endif
