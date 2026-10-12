/* kesme.c — Kesmeler: dikey tarama (vsync) kesmesine bir C fonksiyonu bağlamak.
 *
 * Ne gösterir
 *   - Ana program uzun bir hesap yaparken (e sayısının 100 basamağı) bir kesme işleyicisi
 *     saniyede 60 kez araya girip ekranda dönen bir çubuk ve ilerleme çizgisi çizer. Program
 *     "aynı anda iki iş" yapıyormuş gibi görünür: işlemci tek, işi bölüşen kesmedir.
 *   - volatile: kanca ile ana programın paylaştığı değişkenler. volatile olmasa derleyici
 *     değeri bir register'da tutup kesmenin yaptığı değişikliği hiç görmeyebilirdi.
 *   - Kritik bölge: 32 bitlik bir değişkeni okumak iki LW komutudur. İkisinin arasına kesme
 *     girerse yarısı eski yarısı yeni bir değer okunur. di() ... ei() arası kesilmez.
 *   - Paylaşılan donanım: kanca VADDR'ı (VRAM adresi) değiştirir ve VADDR geri okunamaz. Ana
 *     program o sırada printf ile ekrana yazsaydı yazısı kancanın bıraktığı adrese giderdi. Bu
 *     yüzden hesap sürerken ekrana yalnız kanca yazar.
 *
 * CPU16 ile ilgisi: bir kesmenin yolu
 *   1. Video kartı her karenin başında VSTAT'ın (0xFF26) bit 1'ini kurar.
 *   2. G/Ç kartı: IRQ_PEND (0xFF08) bit 3 = 1; IRQ_MASK (0xFF09) bit 3 de 1 ise IRQ hattı kalkar.
 *   3. CPU, I bayrağı 1 ise komut bitince kesmeye girer: PC ve bayraklar yığına, I = 0,
 *      PC = 0x0002 (IRQ vektörü). Bu, BIOS'un işleyicisidir (EEPROM'da).
 *   4. BIOS r0–r5 ve lr'yi saklar, IRQ_SRC'yi (0xFF0A, öncelik kodlayıcı) okur: 3 = vsync.
 *      Zamanlayıcı (0) ve klavyeyi (1) kendisi işler; 2 ve 3 için kullanıcı kancasını,
 *      burada kanca(3)'ü çağırır.
 *   5. Kanca kaynağı onaylar (VSTAT'a 2 yazar). Onaylamasa hat seviye tetiklemeli olduğu için
 *      kalkık kalır ve işleyici kancayı durmadan yeniden çağırır: program kilitlenir.
 *   6. BIOS register'ları geri yükler, RETI: kesilen komutun ardından devam.
 *
 * Nasıl çalıştırılır
 *   Uygulamada: CPU16 tezgâhı → Anakart + BIOS → "kesme.c" → Derle ve RAM'e yükle.
 *   Komut satırında: npm run cpu16 -- cc cpu16/bios/ornekler/kesme.c --hedef bios --run
 *
 * Beklenen çıktı
 *   e = 2.71828182845904523536028747135266249775724709369995957496696762772407663035354759...
 *   Hesap 4 MHz'te ≈ 1,6 s sürer; o sırada sağ üstte dönen çubuk ve dolan ilerleme çizgisi.
 *   Sonunda kanca ≈ 97 kez (vsync, 60 Hz), zamanlayıcı ≈ 161 kez (100 Hz) çalışmış olur: 0.60. */

#include <bios.h>
#include <cpu16.h>
#include <stdio.h>

#define IRQ_MASK (*(volatile unsigned char *)0xFF09) /* bit 0 zamanlayıcı, 1 klavye, 2 UART, 3 vsync */
#define VSTAT (*(volatile unsigned char *)0xFF26)    /* bit 1: vsync bayrağı (1 yazınca silinir) */
#define VSYNC_BIT 8

#define BASAMAK 100 /* e'nin ondalık basamağı */
#define TERIM 75    /* 75! > 10^101: 100 basamak için yeter */
#define CUBUK_X 15  /* ilerleme çizgisinin yeri (satır 4) */
#define CUBUK_G 50

static volatile unsigned long kare; /* kanca artırır, ana program okur */
static volatile int ilerleme;       /* ana program yazar (basamak sayısı), kanca okur */

/* Kesme kancası. Kesmeler kapalıyken (I = 0) çalışır: kısa tutulmalı, printf gibi uzun ve
 * yeniden girilemez (reentrant olmayan) şeyler çağrılmamalı. */
static void kanca(int kaynak) {
  static const char DONEN[4] = { '|', '/', '-', '\\' };
  static int cizilen; /* kaç hücre boyandı */
  int hedef;
  if (kaynak != 3) {
    if (kaynak == 2)
      (void)UART_DATA; /* UART RX'i açmadık ama gelirse okuyarak onayla */
    return;
  }
  VSTAT = 2; /* onay: bayrağı sil (W1C) */
  kare++;    /* 32 bitlik artırma: ADDI + ADC; kesme içinde, bölünmez */
  ekran_yaz(77, 0, DONEN[(unsigned)kare >> 3 & 3], RENK(SARI, MAVI)); /* 8 karede bir döner */
  hedef = ilerleme * CUBUK_G / BASAMAK;
  while (cizilen < hedef) /* yalnız yeni hücreler: kare başına birkaç G/Ç yazması */
    ekran_yaz(CUBUK_X + cizilen++, 4, 0xDB, RENK(ACIK_YESIL, SIYAH));
}

/* 32 bitlik paylaşılan değişkeni tutarlı oku: iki LW arasına kesme girmesin */
static unsigned long kare_oku(void) {
  unsigned long k;
  di();
  k = kare;
  ei();
  return k;
}

/* e sayısı, "musluk" (spigot) algoritmasıyla, yalnız 16 bitlik tam sayılarla.
 * e = 2 + 1/2! + 1/3! + ... = 2 + 1/2 (1 + 1/3 (1 + 1/4 (1 + ...))). a[i] karışık tabanlı
 * basamaklardır (i. basamağın tabanı i); hepsi 1 ile başlar. Her turda bütün basamaklar 10 ile
 * çarpılır, elde sağdan sola taşınır; en sola ulaşan elde bir ondalık basamaktır. */
static char e_basamak[BASAMAK + 1];
static unsigned char a[TERIM + 1];

static void e_hesapla(void) {
  int i, j;
  unsigned x, elde, q;
  for (i = 2; i <= TERIM; i++)
    a[i] = 1;
  for (j = 0; j < BASAMAK; j++) {
    elde = 0;
    for (i = TERIM; i >= 2; i--) {
      x = a[i] * 10 + elde;  /* * 10: SHL'ler ve ADD, çağrı yok */
      q = x / i;             /* __udiv16: 16 turluk kaydır-çıkar */
      a[i] = x - q * i;      /* kalan: x % i ikinci bir bölme olurdu; çarpma daha ucuz */
      elde = q;
    }
    e_basamak[j] = '0' + elde;
    ilerleme = j + 1;        /* kancanın ilerleme çizgisi için */
  }
}

int main(void) {
  unsigned long t0, t1, k0, k1;
  int i;

  bios_setattr(RENK(ACIK_GRI, SIYAH));
  bios_cls();
  bios_setattr(RENK(SARI, MAVI));
  printf(" Kesmeler: vsync kesmesine C fonksiyonu baglamak                               \n");
  bios_setattr(RENK(ACIK_GRI, SIYAH));
  printf("vsync (60 Hz) -> IRQ 3 -> BIOS isleyicisi -> kanca(3) -> VSTAT'a 2 yaz -> RETI\n");
  printf("Ana program e'yi hesaplarken ekrana yalniz kanca yaziyor:\n\n");
  printf("ilerleme:      ");
  for (i = 0; i < CUBUK_G; i++)
    putchar(0xB0); /* ░ : boş çubuk; kanca bunları █ ile boyar */
  putchar('\n');

  VSTAT = 2;               /* eski bayrağı sil: ilk kesme yeni bir karede gelsin */
  bios_setirqhook(kanca);  /* BIOS'a kancanın adresini ver (fonksiyon işaretçisi) */
  di();                    /* IRQ_MASK'ı BIOS'un işleyicisi de değiştirebilir: oku-değiştir-yaz */
  IRQ_MASK |= VSYNC_BIT;   /* kesilmeden yapılmalı */
  ei();

  t0 = bios_ticks();
  k0 = kare_oku();
  e_hesapla();             /* ≈ 1,6 saniye; bu sürede kanca ≈ 100 kez çalışır */
  k1 = kare_oku();
  t1 = bios_ticks();
  while (kare_oku() == k1) /* bir kare daha bekle: kanca son ilerlemeyi de çizsin */
    halt();                /* HALT: bir sonraki kesmeye kadar uyu */

  di();
  IRQ_MASK &= ~VSYNC_BIT;  /* önce kaynağı kapat ... */
  ei();
  bios_setirqhook(0);      /* ... sonra kancayı kaldır. Program bitince bu bellek başka
                            * programa verilir: kanca kalırsa BIOS çöp koda atlar. */

  bios_setcursor(0, 6);
  printf("e = 2.");
  for (i = 0; i < BASAMAK; i++) {
    putchar(e_basamak[i]);
    if (i == 49)
      printf("\n      ");
  }
  printf("\n\nkanca (vsync, IRQ 3)          : %lu kez\n", k1 - k0);
  printf("BIOS tiki (zamanlayici, IRQ 0): %lu kez\n", t1 - t0);
  printf("oran: %lu / %lu = 0.%02lu  (60 Hz / 100 Hz = 0.60)\n", k1 - k0, t1 - t0,
         (k1 - k0) * 100 / (t1 - t0));
  return 0;
}
