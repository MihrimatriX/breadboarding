/* ekran.c — VGA metin ekranına doğrudan yazmak: pencereler, gölgeler, Türkçe harfler, animasyon.
 *
 * Ne gösterir
 *   - Video kartının portları: VADDR (0xFF20, 16 bit) VRAM adresi, VDATA (0xFF22) veri. Her VDATA
 *     erişiminde (okuma da!) adres kendiliğinden bir artar: bir satırı doldurmak için adres bir kez
 *     yazılır, sonra baytlar art arda gönderilir.
 *   - VRAM düzeni: hücre (x, y) → adres (y·80 + x)·2; çift adreste karakter kodu, tek adreste renk
 *     baytı (düşük 4 bit yazı, yüksek 4 bit zemin). 80 × 30 hücre = 4800 bayt.
 *   - Yalnız renk baytını değiştirerek yarı saydam gölge: altındaki karakter kalır, rengi koyulaşır.
 *   - Kod sayfası CP857: çerçeve karakterleri (╔ ═ ╗ ║ ╚ ╝) ve Türkçe harfler. Kaynak dosya UTF-8
 *     olduğu için "ğ" C string'inde iki bayttır (0xC4 0x9F); yaz_tr bunu CP857'deki tek bayta
 *     (0xA7) çevirir: küçük bir UTF-8 çözücü.
 *   - Dikey tarama (vsync) ile eşzamanlı animasyon: VSTAT'ın (0xFF26) bit 1'i her karenin başında
 *     (60 Hz) kurulur, 2 yazınca silinir. Çizimi kare başında yapmak titremeyi önler ve hızı
 *     CPU saatinden bağımsız kılar.
 *
 * CPU16 ile ilgisi
 *   - Bellek eşlemeli G/Ç: 0xFF00–0xFFFF arası RAM değil, kartlardaki register'lardır. C'de
 *     volatile işaretçiyle erişilir; volatile olmasa derleyici "aynı adrese iki kez yazmak
 *     gereksiz" diyip VDATA yazmalarını birleştirebilirdi. G/Ç önbelleğe de girmez.
 *   - CPU VRAM'i doğrudan göremez (kendi adres alanında değil); her erişim bir G/Ç komutudur:
 *     VDATA = c bir SB komutu, VADDR = a bir SW komutu (iki baytı FF20 ve FF21'e).
 *
 * Nasıl çalıştırılır
 *   Uygulamada: CPU16 tezgâhı → Anakart + BIOS → "ekran.c" → Derle ve RAM'e yükle. Animasyon 5 saniye
 *   sürer; ekrana tıklayıp bir tuşa basınca erken biter.
 *   Komut satırında: npm run cpu16 -- cc cpu16/bios/ornekler/ekran.c --hedef bios --run
 *
 * Beklenen çıktı
 *   Mavi zeminde üç pencere: 16 renk, "Türkçe: çğıöşü ÇĞİÖŞÜ" ve içinde seken "CPU16" yazısı;
 *   alt pencerenin kenarında "kare 300 / 300" sayacı (tuşa basılırsa o andaki kare). */

#include <bios.h>
#include <stdio.h>

#define VSTAT (*(volatile unsigned char *)0xFF26) /* bit 0: dikey boşlukta, bit 1: vsync bayrağı */

#define ZEMIN RENK(MAVI, SIYAH)            /* masaüstü deseni */
#define PENCERE RENK(SIYAH, ACIK_GRI)      /* pencere içi: açık gri zemin, siyah yazı */
#define CERCEVE RENK(BEYAZ, ACIK_GRI)
#define GOLGE RENK(KOYU_GRI, SIYAH)

/* VRAM adresini (x, y) hücresine kur; sonraki VDATA erişimleri buradan devam eder */
static void git(int x, int y) {
  VADDR = (unsigned)(y * EKRAN_GEN + x) * 2;
}

/* n hücreyi aynı karakter ve renkle doldur: adres bir kez, sonra karakter, renk, karakter, renk... */
static void doldur(int x, int y, int n, int ch, int renk) {
  git(x, y);
  while (n-- > 0) {
    VDATA = ch;
    VDATA = renk;
  }
}

/* zaten CP857 olan metni yaz */
static void yaz(int x, int y, const char *s, int renk) {
  git(x, y);
  while (*s) {
    VDATA = *s++;
    VDATA = renk;
  }
}

/* UTF-8 → CP857: Türkçe harfler. Hepsi UTF-8'de iki bayttır: 110xxxxx 10yyyyyy → xxxxxyyyyyy */
static const struct {
  unsigned kod;       /* Unicode */
  unsigned char cp;   /* CP857 */
} TURKCE[] = {
  { 0xE7, 0x87 }, { 0xC7, 0x80 },   /* ç Ç */
  { 0x11F, 0xA7 }, { 0x11E, 0xA6 }, /* ğ Ğ */
  { 0x131, 0x8D }, { 0x130, 0x98 }, /* ı İ */
  { 0xF6, 0x94 }, { 0xD6, 0x99 },   /* ö Ö */
  { 0x15F, 0x9F }, { 0x15E, 0x9E }, /* ş Ş */
  { 0xFC, 0x81 }, { 0xDC, 0x9A },   /* ü Ü */
};

static void yaz_tr(int x, int y, const char *s, int renk) {
  git(x, y);
  while (*s) {
    unsigned c = (unsigned char)*s++;
    if ((c & 0xE0) == 0xC0 && *s) { /* iki baytlık UTF-8 dizisi */
      unsigned kod = ((c & 0x1F) << 6) | ((unsigned char)*s++ & 0x3F);
      int i;
      c = '?';
      for (i = 0; i < (int)(sizeof TURKCE / sizeof TURKCE[0]); i++)
        if (TURKCE[i].kod == kod)
          c = TURKCE[i].cp;
    }
    VDATA = c;
    VDATA = renk;
  }
}

/* Gölge: yalnız renk baytları. Karakter baytını okuyup atlıyoruz (okuma da adresi artırır). */
static void golge(int x, int y, int n) {
  git(x, y);
  while (n-- > 0) {
    (void)VDATA;   /* karakter: dokunma */
    VDATA = GOLGE; /* renk */
  }
}

/* Çift çizgili çerçeveli, gölgeli pencere; başlık üst kenarın ortasında */
static void pencere(int x, int y, int g, int h, const char *baslik) {
  int i, n = 0;
  doldur(x, y, 1, 0xC9, CERCEVE);           /* ╔ */
  doldur(x + 1, y, g - 2, 0xCD, CERCEVE);   /* ═ */
  doldur(x + g - 1, y, 1, 0xBB, CERCEVE);   /* ╗ */
  for (i = 1; i < h - 1; i++) {
    doldur(x, y + i, 1, 0xBA, CERCEVE);     /* ║ */
    doldur(x + 1, y + i, g - 2, ' ', PENCERE);
    doldur(x + g - 1, y + i, 1, 0xBA, CERCEVE);
    golge(x + g, y + i, 2);
  }
  doldur(x, y + h - 1, 1, 0xC8, CERCEVE);   /* ╚ */
  doldur(x + 1, y + h - 1, g - 2, 0xCD, CERCEVE);
  doldur(x + g - 1, y + h - 1, 1, 0xBC, CERCEVE); /* ╝ */
  golge(x + g, y + h - 1, 2);
  golge(x + 2, y + h, g);
  while (baslik[n])
    n++;
  yaz(x + (g - n - 2) / 2, y, " ", CERCEVE);
  yaz(x + (g - n) / 2, y, baslik, RENK(SARI, ACIK_GRI));
  yaz(x + (g + n) / 2, y, " ", CERCEVE);
}

static void renkler(void) {
  static const char *ADLAR[16] = {
    "siyah", "mavi", "yesil", "camgobegi", "kirmizi", "mor", "kahve", "acik gri",
    "koyu gri", "acik mavi", "acik yesil", "a.camgobegi", "acik kirmizi", "pembe", "sari", "beyaz",
  };
  int i;
  pencere(2, 2, 38, 12, "16 renk");
  for (i = 0; i < 16; i++) {
    int x = 4 + (i / 8) * 17, y = 4 + i % 8;
    doldur(x, y, 2, 0xDB, RENK(i, ACIK_GRI)); /* █ bu renkte */
    yaz(x + 3, y, ADLAR[i], PENCERE);
  }
}

static void turkce(void) {
  pencere(42, 2, 36, 12, "CP857");
  yaz_tr(44, 4, "Türkçe: çğıöşü ÇĞİÖŞÜ", PENCERE);
  yaz_tr(44, 6, "Şu kısa cümle ekranda doğru", PENCERE);
  yaz_tr(44, 7, "görünür: UTF-8'den tek bayta.", PENCERE);
  yaz(44, 9, "\xDA\xC4\xC2\xC4\xBF \xC9\xCD\xCB\xCD\xBB \xB0\xB1\xB2\xDB \x03\x04\x05\x06", RENK(MAVI, ACIK_GRI));
  yaz(44, 10, "\xC0\xC4\xC1\xC4\xD9 \xC8\xCD\xCA\xCD\xBC  \x18\x19\x1A\x1B \x01\x02", RENK(MAVI, ACIK_GRI));
}

/* bir sonraki karenin başını bekle (60 Hz) */
static void vsync_bekle(void) {
  VSTAT = 2;               /* bayrağı sil (W1C: 1 yazılan bit silinir) */
  while (!(VSTAT & 2)) {
  }                        /* video kartı yeni karenin başında yeniden kurar */
}

#define AX0 4    /* animasyon alanı: alt pencerenin içi */
#define AX1 74
#define AY0 17
#define AY1 24
#define KARE 300 /* 5 saniye */

static void animasyon(void) {
  static const int RENKLER[] = { KIRMIZI, MAVI, YESIL, MOR, KAHVE, ACIK_KIRMIZI };
  char metin[24];
  int x = AX0, y = AY0, dx = 1, dy = 1, r = 0;
  unsigned kare;
  for (kare = 1; kare <= KARE; kare++) {
    vsync_bekle();
    if (kare % 3)
      continue;  /* her 3 karede bir adım: saniyede 20 hücre */
    yaz(x, y, "     ", PENCERE); /* eski yeri sil */
    if (x + dx < AX0 || x + dx + 5 > AX1) {
      dx = -dx;
      r = (r + 1) % 6; /* duvara çarpınca renk değişsin */
    }
    if (y + dy < AY0 || y + dy > AY1) {
      dy = -dy;
      r = (r + 1) % 6;
    }
    x += dx;
    y += dy;
    yaz(x, y, "CPU16", RENK(RENKLER[r], ACIK_GRI));
    sprintf(metin, " kare %3u / %u ", kare, KARE); /* sprintf: printf gibi ama tampona */
    yaz(59, 15, metin, RENK(SARI, ACIK_GRI));        /* pencerenin üst kenarında sayaç */
    if (bios_trygetc() >= 0)
      break; /* tuşa basıldı (klavye ya da UART) */
  }
}

int main(void) {
  int y;

  for (y = 0; y < EKRAN_YUK; y++)
    doldur(0, y, EKRAN_GEN, 0xB0, ZEMIN); /* ░ masaüstü deseni: 30 × 80 hücre */
  doldur(0, 0, EKRAN_GEN, ' ', RENK(SARI, MAVI));
  yaz(1, 0, "CPU16 VGA metin modu: 80 x 30 hucre, 16 renk, CP857 karakter ROM'u", RENK(SARI, MAVI));
  renkler();
  turkce();
  pencere(2, 15, 76, 12, "vsync ile animasyon (tus: dur)");
  doldur(0, 28, EKRAN_GEN, ' ', RENK(SIYAH, ACIK_CAMGOBEGI));
  yaz(1, 28, "VADDR FF20  VDATA FF22  VSTAT FF26   adres = (y*80 + x)*2: karakter, +1: renk",
      RENK(SIYAH, ACIK_CAMGOBEGI));
  doldur(0, 29, EKRAN_GEN, ' ', RENK(ACIK_GRI, SIYAH)); /* son satır monitör istemine */

  animasyon();
  /* İmleç en alt satırın başına: monitörün "> " istemi oraya yazılır. İmleç satır başında
   * olmasaydı monitör önce satır atlardı ve ekran bir satır yukarı kayardı. */
  bios_setcursor(0, 29);
  bios_setattr(RENK(ACIK_GRI, SIYAH));
  return 0;
}
