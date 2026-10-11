/* stdlib.h — cc16 */
#ifndef _STDLIB_H
#define _STDLIB_H

#include <stddef.h>

#define EXIT_SUCCESS 0
#define EXIT_FAILURE 1
#define RAND_MAX 32767

void *malloc(size_t size);
void *calloc(size_t n, size_t size);
void *realloc(void *ptr, size_t size);
void free(void *ptr);

int abs(int x);
long labs(long x);
int atoi(const char *s);
long atol(const char *s);
long strtol(const char *s, char **end, int base);

int rand(void);
void srand(unsigned int seed);

void exit(int code);
void abort(void);

void qsort(void *base, size_t n, size_t size, int (*cmp)(const void *, const void *));

#endif
