/* hayat.c — Conway'in Hayat Oyunu, 80 × 27 hücre, VGA ekranda renkli.
 *
 * Ne gösterir
 *   - Hücresel otomat: canlı hücre 2 ya da 3 canlı komşuyla yaşar, ölü hücre tam 3 canlı komşuyla
 *     doğar, diğerleri ölür. Bütün hücreler aynı anda değişir: önce kararlar toplanır, sonra
 *     uygulanır.
 *   - 4 MHz'lik bir makinede algoritma seçimi: her nesilde her hücrenin 8 komşusunu saymak
 *     (2160 × 8 okuma) bu makinede nesil başına 0,3 s sürer. Burada her hücre baytı kendi canlı
 *     komşu sayısını taşır (bit 0–3) ve durumunu (bit 4); sayılar yalnız bir hücre doğunca ya da
 *     ölünce güncellenir. Taramada boş hücre (bayt 0) tek karşılaştırmayla geçilir: nesil başına
 *     ≈ 0,05 s.
 *   - Satır uzunluğu 128 (2'nin kuvveti): indeks = y · 128 + x bir kaydırmadır, geri çevirmek de
 *     (y = i >> 7, x = i & 127). 82 seçilseydi her dönüşüm bir __mul16 / __udiv16 çağrısı olurdu.
 *   - Kenar dolgusu: dizinin çevresinde hep ölü kalan birer hücre var; komşulara yazarken "dizinin
 *     dışına çıktım mı" diye sormaya gerek kalmaz.
 *   - Yalnız değişen hücreler çizilir; renk = yaş: yeni doğan sarı, genç açık yeşil, yaşlı yeşil.
 *   - Başlangıç: Gosper'in planör tabancası (30 nesilde bir planör fırlatır), R-pentomino ve üç
 *     salınıcı. R tuşu rastgele bir dünya kurar, Q çıkar.
 *
 * CPU16 ile ilgisi
 *   - Komşu sayısı bayt aritmetiğiyle: p[-129] += 1 bir LBU, bir ADDI ve bir SB komutu (ofset
 *     LBU'nun −32..+31 aralığına sığmadığı için adres önce LI + ADD ile hesaplanır).
 *   - Durum satırı ve başlık printf'le değil, sprintf + doğrudan VRAM'e yazılır: printf (BIOS PUTC)
 *     her karakteri UART'a da gönderirdi.
 *   - Nesiller arası bekleme halt() ile: CPU bir sonraki kesmeye (BIOS'un 100 Hz zamanlayıcısı)
 *     kadar uyur, boşuna döngü çevirmez.
 *
 * Nasıl çalıştırılır
 *   Uygulamada: CPU16 tezgâhı → Anakart + BIOS → "hayat.c" → Derle ve RAM'e yükle; ekrana tıklayıp
 *   R (rastgele dünya) ya da Q (çıkış). Saniyede 10 nesil; 100 nesilden sonra kendiliğinden biter
 *   (R sayacı sıfırlar).
 *   Komut satırında: npm run cpu16 -- cc cpu16/bios/ornekler/hayat.c --hedef bios --run
 *
 * Beklenen çıktı
 *   Sol üstte planör tabancası, sağ alta doğru uçan planörler; alt satırda "nesil N  canli M".
 *   Nesil 0'da 58 canlı hücre. */

#include <bios.h>
#include <cpu16.h>
#include <stdio.h>
#include <stdlib.h>

#define G 80        /* oyun alanı: ekranın tam genişliği */
#define Y 27        /* ekran satırları 1..27 */
#define S 128       /* dizide bir satırın uzunluğu (2'nin kuvveti); hücreler x = 1..G, y = 1..Y */
#define NESIL 100

#define CANLI 0x10  /* hücre baytının bit 4'ü; bit 0–3 canlı komşu sayısı (0..8) */
#define KARE 0xFE   /* ■ */

static unsigned char hucre[(Y + 2) * S]; /* 3712 bayt, .bss: başta hepsi 0 */
static unsigned char yas[(Y + 2) * S];   /* kaç nesildir canlı (renk için) */
static unsigned degisen[G * Y];          /* bu nesilde durumu değişecek hücrelerin indeksleri */
static int canli;

static int renk(unsigned char y) {
  return y == 1 ? RENK(SARI, SIYAH) : y < 5 ? RENK(ACIK_YESIL, SIYAH) : RENK(YESIL, SIYAH);
}

/* i. hücreyi ekrana çiz: y = i >> 7, x = i & 127 (çarpma/bölme yok) */
static void ciz(unsigned i) {
  ekran_yaz((i & (S - 1)) - 1, i >> 7, yas[i] ? KARE : ' ', renk(yas[i]));
}

/* 8 komşunun sayacına d (+1 / −1) ekle */
static void komsular(unsigned char *p, int d) {
  p[-S - 1] += d; p[-S] += d; p[-S + 1] += d;
  p[-1] += d;                 p[1] += d;
  p[S - 1] += d;  p[S] += d;  p[S + 1] += d;
}

static void dogur(unsigned i) {
  hucre[i] |= CANLI;
  komsular(&hucre[i], 1);
  yas[i] = 1;
  canli++;
}

static void oldur(unsigned i) {
  hucre[i] &= ~CANLI;
  komsular(&hucre[i], -1);
  yas[i] = 0;
  canli--;
}

/* metinle tarif edilen deseni (x0, y0)'a koy: 'O' canlı, '.' ölü, '/' satır sonu */
static void desen(int x0, int y0, const char *s) {
  int x = x0, y = y0;
  for (; *s; s++) {
    if (*s == '/') {
      x = x0;
      y++;
      continue;
    }
    if (*s == 'O' && x >= 1 && x <= G && y >= 1 && y <= Y && !(hucre[y * S + x] & CANLI))
      dogur(y * S + x); /* y * S: 7 kez SHL */
    x++;
  }
}

static void bosalt(void) {
  unsigned i;
  for (i = 0; i < sizeof hucre; i++)
    hucre[i] = yas[i] = 0;
  canli = 0;
}

static void baslangic(void) {
  bosalt();
  /* Gosper'in planör tabancası (36 × 9) */
  desen(2, 2, "........................O/"
              "......................O.O/"
              "............OO......OO............OO/"
              "...........O...O....OO............OO/"
              "OO........O.....O...OO/"
              "OO........O...O.OO....O.O/"
              "..........O.....O.......O/"
              "...........O...O/"
              "............OO");
  desen(62, 5, ".OO/OO./.O.");         /* R-pentomino: 1103 nesil boyunca karışır */
  desen(50, 23, "OOO");                /* yanıp sönen (blinker), periyot 2 */
  desen(66, 21, ".OOO/OOO.");          /* kurbağa (toad), periyot 2 */
  desen(5, 21, "OO../OO../..OO/..OO"); /* fener (beacon), periyot 2 */
}

/* Hücrelerin dörtte biri canlı. rand() her çağrıda bir 32 bit çarpma (__mul32, 31 tur) yapar ve
 * 15 rastgele bit verir: her hücre için çağırmak yerine bitleri ikişer ikişer harcıyoruz. */
static void rastgele(void) {
  int x, y, kalan = 0;
  unsigned bitler = 0;
  bosalt();
  for (y = 1; y <= Y; y++)
    for (x = 1; x <= G; x++) {
      if (kalan < 2) {
        bitler = rand();
        kalan = 15;
      }
      if ((bitler & 3) == 0)
        dogur(y * S + x);
      bitler >>= 2;
      kalan -= 2;
    }
}

static void hepsini_ciz(void) {
  int x, y;
  for (y = 1; y <= Y; y++)
    for (x = 1; x <= G; x++)
      ciz(y * S + x);
}

/* Bir nesil. 1) Tara: kimin doğacağını / öleceğini topla (dizi henüz değişmez).
 * 2) Uygula: komşu sayılarını güncelle, değişenleri çiz. */
static void nesil(void) {
  unsigned n = 0, i, y;
  unsigned char *p, *son, v;
  for (y = 1; y <= Y; y++) {
    p = &hucre[y * S + 1];
    for (son = p + G; p < son; p++) {
      v = *p;
      if (v == 0)
        continue; /* ölü ve komşusuz: en sık durum, en hızlı yol */
      if (v & CANLI) {
        if (v != (CANLI | 2) && v != (CANLI | 3))
          degisen[n++] = p - hucre; /* ölecek (yalnızlık ya da kalabalık) */
        else {
          i = p - hucre;
          if (yas[i] < 255 && (++yas[i] == 2 || yas[i] == 5))
            ciz(i); /* yaşadı; rengi değişiyorsa çiz */
        }
      } else if (v == 3)
        degisen[n++] = p - hucre; /* doğacak */
    }
  }
  for (i = 0; i < n; i++) {
    unsigned k = degisen[i];
    if (hucre[k] & CANLI)
      oldur(k);
    else
      dogur(k);
    ciz(k);
  }
}

/* VRAM'e doğrudan metin (UART'a gitmez) */
static void satir_yaz(int y, const char *s, int r) {
  int x;
  for (x = 0; x < EKRAN_GEN; x++)
    ekran_yaz(x, y, *s ? *s++ : ' ', r);
}

int main(void) {
  char metin[81];
  int n = 0, k;
  unsigned long son;

  bios_setattr(RENK(ACIK_GRI, SIYAH));
  bios_cls();
  satir_yaz(0, " Conway'in Hayat Oyunu: 2 ya da 3 komsu yasatir, 3 komsu dogurur", RENK(SARI, MAVI));
  baslangic();
  hepsini_ciz();
  son = bios_ticks();
  for (;;) {
    sprintf(metin, " nesil %3d  canli %4d     R: rastgele dunya   Q: cikis", n, canli);
    satir_yaz(28, metin, RENK(SIYAH, ACIK_CAMGOBEGI));
    if (n >= NESIL)
      break;
    k = bios_trygetc();
    if (k == 'q' || k == 'Q')
      break;
    if (k == 'r' || k == 'R') {
      srand((unsigned)bios_ticks()); /* tohum: zaman, her seferinde başka dünya */
      rastgele();
      hepsini_ciz();
      n = 0;
      continue;
    }
    while (bios_ticks() - son < 10)
      halt(); /* en çok 10 nesil/saniye: bir sonraki kesmeye kadar uyu */
    son = bios_ticks();
    nesil();
    n++;
  }
  bios_setcursor(0, 29); /* monitör istemi en alt satıra, ekran kaymasın */
  return 0;
}
