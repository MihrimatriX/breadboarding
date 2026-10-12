/* liste.c — struct, işaretçi ve malloc: bağlı listeyle kelime sayacı.
 *
 * Ne gösterir
 *   - Bir metindeki kelimeler, alfabetik sıralı bir bağlı listeye eklenir; aynı kelime tekrar
 *     gelirse sayacı artar. Sonra bir kez geçen kelimeler listeden silinir (free).
 *   - İşaretçiye işaretçi (struct kelime **): listenin başına, ortasına ya da sonuna eklemeyi ve
 *     silmeyi tek bir döngüyle yapan klasik C deyimi.
 *   - Esnek dizi üyesi (char yazi[]): düğüm ile metni tek malloc bloğunda tutar.
 *   - struct'ın bellekteki düzeni (sizeof, offsetof) ve düğümlerin gerçek adresleri.
 *
 * CPU16 ile ilgisi
 *   - İşaretçi 16 bittir; düğüm adresleri doğrudan bellek adresidir (BIOS hedefinde yığın (heap)
 *     .bss'in bitiminden, 0xA000'ın biraz üstünden başlar). Bunlar fiziksel değil CPU adresidir:
 *     0x4000–0xFEFF arası RAM bank register'larıyla 128 KB'lık RAM'in bank 32–34'üne eşlenmiştir.
 *   - p->adet erişimi tek komuttur: LW r0, [r1+2] (ofsetli yükleme, −64..+62 bayt).
 *   - malloc her bloğun önüne 2 baytlık bir başlık koyar (boyut + "kullanımda" biti); free
 *     sadece bu biti siler, sonraki malloc boş bloğu yeniden kullanır (libc16.c).
 *   - Harfler küçültülürken 'A'..'Z' aralığı tek bir çıkarma ile sınanır: (unsigned)(c - 'A') < 26.
 *
 * Nasıl çalıştırılır
 *   Uygulamada: CPU16 tezgâhı → Anakart + BIOS → "liste.c" → Derle ve RAM'e yükle.
 *   Komut satırında: npm run cpu16 -- cc cpu16/bios/ornekler/liste.c --hedef bios --run
 *
 * Beklenen çıktı
 *   51 kelime, 38 farklı; "bir" 5, "her" 4, "program" 3 kez ... Bir kez geçen 31 kelime silinir,
 *   7 kelime kalır; silinen düğümlerin en düşük adreslisi (0xA02C) yeni malloc'ta yeniden kullanılır. */

#include <bios.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char METIN[] =
  "Bir bilgisayar kapilardan yapilir, kapilar da transistorlerden. "
  "Bu bilgisayar on alti bitlik bir bilgisayardir: her kapisi, her cipi, her teli "
  "ekranda gorulebilir. Bir program once derlenir, sonra bellege yuklenir, sonra calisir. "
  "Program bitince her sey monitore doner ve bir sonraki program bir tusla baslar. "
  "Kapilar, cipler, kartlar: hepsi bu bilgisayarin icinde.";

/* Bir liste düğümü. Esnek dizi üyesi yazi[] struct'ın boyutuna girmez; malloc'la ne kadar yer
 * ayrılırsa o kadar uzundur. */
struct kelime {
  struct kelime *sonraki; /* ofset 0: sonraki düğümün adresi, son düğümde NULL (0) */
  unsigned adet;          /* ofset 2 */
  char yazi[];            /* ofset 4 */
};

static struct kelime *bas; /* listenin başı (boş liste: NULL) */
static unsigned dugum_sayisi, kelime_sayisi;

/* Kelimeyi listede bul ya da alfabetik yerine ekle.
 * p, "düğümü gösteren işaretçinin adresi"dir: başta &bas, sonra &onceki->sonraki. Böylece başa
 * eklemek de araya eklemek de aynı iki satırdır: yeni->sonraki = *p; *p = yeni; */
static void ekle(const char *s) {
  struct kelime **p = &bas;
  struct kelime *yeni;
  int fark = 1;
  while (*p && (fark = strcmp((*p)->yazi, s)) < 0)
    p = &(*p)->sonraki;
  if (*p && fark == 0) { /* zaten var */
    (*p)->adet++;
    return;
  }
  yeni = malloc(sizeof(struct kelime) + strlen(s) + 1); /* + 1: sondaki '\0' */
  if (!yeni) {
    printf("bellek bitti!\n");
    return;
  }
  strcpy(yeni->yazi, s);
  yeni->adet = 1;
  yeni->sonraki = *p;
  *p = yeni;
  dugum_sayisi++;
}

/* adet'i en'den küçük olan düğümleri sil; silinenlerin en düşük adreslisini döndür */
static struct kelime *seyrekleri_sil(unsigned en) {
  struct kelime **p = &bas;
  struct kelime *dusuk = NULL;
  while (*p) {
    struct kelime *d = *p;
    if (d->adet < en) {
      *p = d->sonraki; /* d'yi zincirden çıkar: önceki artık d'nin sonrakini gösterir */
      if (!dusuk || d < dusuk) /* işaretçi karşılaştırması: işaretsiz 16 bit adresler */
        dusuk = d;
      free(d);         /* free'den sonra d'ye dokunulmaz! */
      dugum_sayisi--;
    } else
      p = &d->sonraki;
  }
  return dusuk;
}

/* METIN'i kelimelere böl: harf olmayan her karakter ayırıcıdır */
static void kelimelere_bol(void) {
  char k[24];
  const char *s = METIN;
  int n = 0;
  for (;;) {
    unsigned c = (unsigned char)*s++;
    if ((unsigned)(c - 'A') < 26) /* tek karşılaştırmayla 'A' <= c <= 'Z' */
      c += 'a' - 'A';
    if ((unsigned)(c - 'a') < 26) {
      if (n < (int)sizeof k - 1)
        k[n++] = c;
    } else {
      if (n > 0) {
        k[n] = 0;
        ekle(k);
        kelime_sayisi++;
        n = 0;
      }
      if (c == 0)
        break;
    }
  }
}

/* listeyi dört sütunda yaz: kelime ve adet */
static void yaz(void) {
  struct kelime *d;
  int i = 0;
  for (d = bas; d; d = d->sonraki)
    printf("%-16s%2u%s", d->yazi, d->adet, ++i % 4 ? "  " : "\n");
  if (i % 4)
    putchar('\n');
}

int main(void) {
  struct kelime *d, *en = NULL, *bosalan;
  void *tekrar;

  bios_setattr(RENK(SARI, MAVI));
  printf(" Bagli liste: kelime sayaci \n");
  bios_setattr(RENK(ACIK_GRI, SIYAH));
  printf("sizeof(struct kelime) = %u; ofsetler: sonraki %u, adet %u, yazi %u\n",
         (unsigned)sizeof(struct kelime), (unsigned)offsetof(struct kelime, sonraki),
         (unsigned)offsetof(struct kelime, adet), (unsigned)offsetof(struct kelime, yazi));

  kelimelere_bol();
  printf("%u kelime, %u farkli. Alfabetik liste:\n", kelime_sayisi, dugum_sayisi);
  bios_setattr(RENK(ACIK_CAMGOBEGI, SIYAH));
  yaz();
  bios_setattr(RENK(ACIK_GRI, SIYAH));

  for (d = bas; d; d = d->sonraki) /* en sık geçen (eşitse alfabede önce gelen) */
    if (!en || d->adet > en->adet)
      en = d;
  printf("En sik: \"%s\" (%u kez), dugum adresi 0x%04X, sonraki 0x%04X\n", en->yazi, en->adet,
         (unsigned)en, (unsigned)en->sonraki);
  printf("Ilk dugum (bas) 0x%04X; her dugum = 2 bayt malloc basligi + 4 + metin + 1\n", (unsigned)bas);

  bosalan = seyrekleri_sil(2);
  printf("\nBir kez gecenler silindi (free), %u kelime kaldi:\n", dugum_sayisi);
  bios_setattr(RENK(ACIK_YESIL, SIYAH));
  yaz();
  bios_setattr(RENK(ACIK_GRI, SIYAH));

  /* malloc "ilk uyan" (first-fit) arar: yığının başından itibaren yeterince büyük ilk boş blok.
   * Bu, silinen düğümlerin en düşük adreslisidir. */
  tekrar = malloc(4);
  printf("Silinenlerin en dusuk adreslisi 0x%04X; yeni malloc(4) = 0x%04X: %s\n", (unsigned)bosalan,
         (unsigned)tekrar, (void *)tekrar == (void *)bosalan ? "ayni yer (ilk uyan blok)" : "baska yer");
  return 0;
}
