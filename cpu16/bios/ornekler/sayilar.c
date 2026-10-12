/* sayilar.c — Sayılar, tabanlar ve 16 bitlik int (printf kullanmadan).
 *
 * Ne gösterir
 *   - Bir sayıyı ekrana yazmak aslında ne demek: onluk, onaltılık (hex) ve ikilik tabanda yazan
 *     fonksiyonlar burada putchar'ın üzerine elle yazıldı. printf de içeride aynısını yapar.
 *   - CPU16'da int 16 bittir: -32768..32767 (unsigned: 0..65535). Sınırı aşan işlem hata vermez,
 *     sarar (32767 + 1 = -32768). Negatif sayılar ikiye tümleyendir: -1 = 0xFFFF.
 *   - char 8 bit ve İŞARETSİZDİR (cc16'da): 0..255. signed char -128..127.
 *
 * CPU16 ile ilgisi
 *   - Hex yazmak ucuzdur: her basamak 4 bittir, kaydır (SHR) ve maskele (AND) yeter. CPU16'nın
 *     kaydırıcısı 1 bitliktir; v >> 12 derleyicide 12 tane SHR komutu olur.
 *   - Onluk yazmak pahalıdır: her basamak için % 10 ve / 10 gerekir. CPU16'da bölme komutu yok;
 *     derleyici rt.s'deki __udiv16'yı çağırır (16 adımlı kaydır-çıkar döngüsü, ≈ 130 komut).
 *     Buna karşılık x * 10 gibi sabitle çarpmayı derleyici kaydırma + toplamaya çevirir.
 *   - Taşma bayrağı (V) ve elde (C) donanımda vardır ama C dili onlara bakmaz: sonuç sadece
 *     16 bite kırpılır. NEG komutu -x'i hesaplar; -(-32768) yine -32768'dir.
 *
 * Nasıl çalıştırılır
 *   Uygulamada: CPU16 tezgâhı → Anakart + BIOS → "sayilar.c" → Derle ve RAM'e yükle (Ctrl+Enter).
 *   Komut satırında: npm run cpu16 -- cc cpu16/bios/ornekler/sayilar.c --hedef bios --run
 *
 * Beklenen çıktı (ilk satırlar)
 *     onluk  isaretsiz  hex   ikili
 *         0          0  0000  0000 0000 0000 0000
 *        42         42  002A  0000 0000 0010 1010
 *        -1      65535  FFFF  1111 1111 1111 1111
 *   ve sonra taşma örnekleri: 32767 + 1 = -32768, 1000 * 100 = -31072 ... */

#include <bios.h>
#include <stdio.h>

/* ---- en alt katman: bir karakter, bir metin ---- */

static void yaz(const char *s) {
  while (*s)
    putchar(*s++); /* putchar: BIOS'un PUTC rutini, VGA ekrana ve UART'a */
}

/* n karakterlik alana sağa yaslamak için önce boşluk */
static void bosluk(int n) {
  while (n-- > 0)
    putchar(' ');
}

/* ---- onluk taban ----
 * Basamaklar sağdan sola çıkar (v % 10 en sağdaki basamak), bu yüzden önce bir tampona yazılır
 * sonra ters sırada basılır. 65535 en çok 5 basamaktır. */
static int onluk_metin(unsigned v, char *tampon) {
  char ters[5];
  int n = 0, i = 0;
  do {
    ters[n++] = '0' + v % 10; /* % ve / : __udiv16 çağrısı (CPU16'da bölme komutu yok) */
    v /= 10;
  } while (v != 0);
  while (n > 0)
    tampon[i++] = ters[--n];
  tampon[i] = 0;
  return i; /* basamak sayısı */
}

/* işaretsiz sayıyı `gen` genişliğinde, sağa yaslı yazar */
static void yaz_onluk(unsigned v, int gen) {
  char t[6];
  bosluk(gen - onluk_metin(v, t));
  yaz(t);
}

/* İşaretli sayı. Dikkat: -v her zaman çalışmaz! v = -32768 ise -v = 32768 int'e sığmaz ve yine
 * -32768 olur. Bu yüzden mutlak değeri işaretsiz aritmetikle alıyoruz: 0u - v, 16 bitte doğru
 * sonucu (32768) verir. */
static void yaz_isaretli(int v, int gen) {
  char t[7];
  unsigned m = v < 0 ? 0u - (unsigned)v : (unsigned)v;
  int n = onluk_metin(m, t + 1);
  if (v < 0) {
    t[0] = '-';
    n++;
  }
  bosluk(gen - n);
  yaz(v < 0 ? t : t + 1);
}

/* ---- onaltılık taban ----
 * Her hex basamak tam 4 bit: bölme gerekmez. (v >> 12) & 15 en soldaki basamaktır. */
static const char HEX[] = "0123456789ABCDEF";

static void yaz_hex(unsigned v, int basamak) {
  int kay;
  for (kay = (basamak - 1) * 4; kay >= 0; kay -= 4)
    putchar(HEX[(v >> kay) & 15]); /* değişken kaydırma: SHR'li küçük bir döngü */
}

/* ---- ikilik taban ----
 * En üst biti (0x8000) sına, sonra sayıyı 1 sola kaydır: her adım tek bir SHL komutu.
 * Okunsun diye 4 bitte bir boşluk. */
static void yaz_ikili(unsigned v) {
  int i;
  for (i = 0; i < 16; i++) {
    putchar(v & 0x8000 ? '1' : '0');
    v <<= 1;
    if (i % 4 == 3 && i != 15)
      putchar(' ');
  }
}

/* bir tablo satırı: aynı 16 bit, dört gösterim */
static void satir(unsigned v) {
  yaz_isaretli((int)v, 6);
  yaz_onluk(v, 11);
  yaz("  ");
  yaz_hex(v, 4);
  yaz("  ");
  yaz_ikili(v);
  putchar('\n');
}

/* "metin = sayı" satırı */
static void sonuc(const char *metin, int v) {
  yaz(metin);
  yaz_isaretli(v, 0);
  putchar('\n');
}

static const unsigned ORNEKLER[] = { 0, 1, 42, 255, 256, 1000, 32767, 32768u, 40000u, 65535u };

/* Bağlayıcının tanımladığı sembol: kod ve sabitlerin bittiği, .data imajının başladığı adres.
 * C'deki _data_load adı assembly'de __data_load'dur (cc16 her C adının önüne _ ekler). */
extern char _data_load[];

int main(void) {
  int i, a;
  unsigned u = 0;
  char c = 200;       /* cc16'da char işaretsiz: 200 olduğu gibi kalır */
  signed char sc = (signed char)200;

  bios_setattr(RENK(SARI, MAVI));
  yaz(" Sayilar ve tabanlar: CPU16'da int 16 bit \n");
  bios_setattr(RENK(ACIK_CAMGOBEGI, SIYAH));
  yaz(" onluk  isaretsiz  hex   ikili\n");
  bios_setattr(RENK(ACIK_GRI, SIYAH));
  /* Aynı 16 bit, int olarak okununca (sol sütun) 32767'den sonra negatife döner */
  for (i = 0; i < (int)(sizeof ORNEKLER / sizeof ORNEKLER[0]); i++)
    satir(ORNEKLER[i]);

  bios_setattr(RENK(ACIK_CAMGOBEGI, SIYAH));
  yaz("\nTasma: sonuc 16 bite kirpilir, hata olmaz\n");
  bios_setattr(RENK(ACIK_GRI, SIYAH));
  a = 32767;
  a = a + 1;          /* 0x7FFF + 1 = 0x8000: ADD komutu V bayrağını kurar ama C ona bakmaz */
  sonuc("  32767 + 1        = ", a);
  sonuc("  -32768 - 1       = ", a - 1);
  a = -a;             /* NEG 0x8000 = 0x8000: en küçük int'in tersi yoktur */
  sonuc("  -(-32768)        = ", a);
  u = u - 1;          /* 0 - 1 = 0xFFFF; işaretsiz okununca 65535 */
  yaz("  0u - 1           = ");
  yaz_onluk(u, 0);
  putchar('\n');
  a = 1000;
  a = a * 100;        /* 100000 mod 65536 = 34464 = 0x86A0, int olarak -31072 */
  sonuc("  1000 * 100       = ", a);
  sonuc("  char 200 + 100   = ", c + 100); /* işlemden önce int'e terfi: 300 */
  c = c + 100;        /* char'a geri yazınca 300 mod 256 = 44 */
  sonuc("  char'a yazinca   = ", c);
  sonuc("  (signed char)200 = ", sc);     /* aynı bayt 0xC8, işaretli okununca -56 */

  bios_setattr(RENK(ACIK_CAMGOBEGI, SIYAH));
  yaz("\nBoyutlar (bayt): ");
  bios_setattr(RENK(ACIK_GRI, SIYAH));
  yaz("char ");
  yaz_onluk(sizeof(char), 0);
  yaz("  int ");
  yaz_onluk(sizeof(int), 0);
  yaz("  long ");
  yaz_onluk(sizeof(long), 0);
  yaz("  isaretci ");
  yaz_onluk(sizeof(char *), 0);
  putchar('\n');
  /* printf'siz program küçüktür: printf ve biçim çözücüsü (libc16.c) tek başına ≈ 1,6 KB tutar */
  yaz("printf kullanilmadi; kod ve sabitler ");
  yaz_onluk((unsigned)_data_load - 0x4000, 0);
  yaz(" bayt (0x4000-0x");
  yaz_hex((unsigned)_data_load, 4);
  yaz(")\n");
  return 0;
}
