/* yilan.c — VGA ekranda yılan oyunu (Faz 8'in bitiş programı).
 *
 * BIOS üzerinde çalışır:  npm run cpu16 -- cc cpu16/bios/ornekler/yilan.c --hedef bios --run
 * Web IDE'de (CPU16 → Anakart + BIOS → yilan.c) ya da gerçek kartta Web Serial ile yüklenir, monitörden G 4000.
 * Tuşlar: W A S D yön, Q çıkış. Yem yedikçe yılan uzar ve hızlanır.
 *
 * Ekran doğrudan video kartının portlarıyla çizilir (bios.h: ekran_yaz / ekran_oku); zaman BIOS'un
 * 10 ms'lik tık sayacından, tuşlar BIOS'un klavye tamponundan gelir. */

#include <bios.h>
#include <stdio.h>
#include <stdlib.h>

#define SOL 20       /* oyun alanının ekrandaki sol üst köşesi (çerçeve) */
#define UST 3
#define GEN 40       /* oyun alanı (çerçeve içi) */
#define YUK 20
#define MAKS 512     /* yılanın en büyük uzunluğu (halka tampon) */

#define BOS ' '
#define GOVDE 0xDB   /* █ */
#define BAS 0x02     /* ☻ */
#define YEM 0x04     /* ♦ */

static unsigned char gx[MAKS], gy[MAKS];
static int bas, uzunluk, dx, dy, yemx, yemy, skor, rekor;

static void hucre(int x, int y, int ch, int renk) {
  ekran_yaz(SOL + 1 + x, UST + 1 + y, ch, renk);
}

static int hucre_oku(int x, int y) {
  return ekran_oku(SOL + 1 + x, UST + 1 + y);
}

static void cerceve(void) {
  int renk = RENK(ACIK_CAMGOBEGI, SIYAH);
  int x, y;
  for (x = 0; x < GEN + 2; x++) {
    ekran_yaz(SOL + x, UST, 0xCD, renk);            /* ═ */
    ekran_yaz(SOL + x, UST + YUK + 1, 0xCD, renk);
  }
  for (y = 0; y < YUK + 2; y++) {
    ekran_yaz(SOL, UST + y, 0xBA, renk);            /* ║ */
    ekran_yaz(SOL + GEN + 1, UST + y, 0xBA, renk);
  }
  ekran_yaz(SOL, UST, 0xC9, renk);                  /* ╔ ╗ ╚ ╝ */
  ekran_yaz(SOL + GEN + 1, UST, 0xBB, renk);
  ekran_yaz(SOL, UST + YUK + 1, 0xC8, renk);
  ekran_yaz(SOL + GEN + 1, UST + YUK + 1, 0xBC, renk);
}

static void yazi(int x, int y, int renk, const char *s) {
  bios_setcursor(x, y);
  bios_setattr(renk);
  bios_puts(s);
}

static void skor_yaz(void) {
  bios_setcursor(SOL, UST + YUK + 3);
  bios_setattr(RENK(SARI, SIYAH));
  printf("Skor: %d   Rekor: %d   Uzunluk: %d   ", skor, rekor, uzunluk);
}

static void yem_koy(void) {
  do {
    yemx = rand() % GEN;
    yemy = rand() % YUK;
  } while (hucre_oku(yemx, yemy) != BOS);
  hucre(yemx, yemy, YEM, RENK(ACIK_KIRMIZI, SIYAH));
}

/* Bir oyun oynar; çıkmak istenirse 0, yeniden oynamak için 1 döner. */
static int oyna(void) {
  unsigned long son;
  int adim = 12;  /* kaç tıkta bir adım (12 × 10 ms) */
  int i;

  bios_setattr(RENK(ACIK_GRI, SIYAH));
  bios_cls();
  yazi(SOL + 13, 1, RENK(ACIK_YESIL, SIYAH), "CPU16 YILAN");
  yazi(SOL, UST + YUK + 4, RENK(KOYU_GRI, SIYAH), "W A S D: yon   Q: cikis");
  cerceve();

  uzunluk = 3;
  skor = 0;
  dx = 1;
  dy = 0;
  for (i = 0; i < uzunluk; i++) {
    gx[i] = GEN / 2 - uzunluk + 1 + i;
    gy[i] = YUK / 2;
    hucre(gx[i], gy[i], i == uzunluk - 1 ? BAS : GOVDE, RENK(ACIK_YESIL, SIYAH));
  }
  bas = uzunluk - 1;
  yem_koy();
  skor_yaz();

  son = bios_ticks();
  for (;;) {
    int k = bios_trygetc();
    int nx, ny, c;
    if (k == 'q' || k == 'Q') return 0;
    if ((k == 'w' || k == 'W') && dy == 0) { dx = 0; dy = -1; }
    if ((k == 's' || k == 'S') && dy == 0) { dx = 0; dy = 1; }
    if ((k == 'a' || k == 'A') && dx == 0) { dx = -1; dy = 0; }
    if ((k == 'd' || k == 'D') && dx == 0) { dx = 1; dy = 0; }
    if (bios_ticks() - son < (unsigned long)adim) continue;
    son = bios_ticks();

    nx = gx[bas] + dx;
    ny = gy[bas] + dy;
    if (nx < 0 || nx >= GEN || ny < 0 || ny >= YUK) break;   /* duvar */
    c = hucre_oku(nx, ny);
    if (c == GOVDE) break;                                   /* kendine çarptı */
    if (c == YEM) {
      uzunluk++;
      skor += 10;
      if (skor > rekor) rekor = skor;
      if (adim > 3) adim--;
    } else {
      int kuyruk = (bas - uzunluk + 1 + MAKS) % MAKS;
      hucre(gx[kuyruk], gy[kuyruk], BOS, RENK(ACIK_GRI, SIYAH));
    }
    hucre(gx[bas], gy[bas], GOVDE, RENK(ACIK_YESIL, SIYAH));
    bas = (bas + 1) % MAKS;
    gx[bas] = nx;
    gy[bas] = ny;
    hucre(nx, ny, BAS, RENK(SARI, SIYAH));
    if (c == YEM) {
      if (uzunluk >= MAKS - 1) break;
      yem_koy();
      skor_yaz();
    }
  }

  yazi(SOL + 14, UST + YUK / 2 - 3, RENK(BEYAZ, KIRMIZI), " OYUN BITTI ");
  yazi(SOL + 5, UST + YUK / 2 - 1, RENK(BEYAZ, SIYAH), " Yeniden: bir tusa bas  Cikis: Q ");
  for (;;) {
    int k = bios_getc();
    if (k == 'q' || k == 'Q') return 0;
    if (k != 'w' && k != 'a' && k != 's' && k != 'd') return 1;
  }
}

int main(void) {
  srand((unsigned)bios_ticks());
  while (oyna()) {
  }
  bios_setattr(RENK(ACIK_GRI, SIYAH));
  bios_cls();
  printf("Yilan: rekor %d\n", rekor);
  return rekor;
}
