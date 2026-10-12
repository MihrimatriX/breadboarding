/* hesap.c — Klavyeden ifade okuyan hesap makinesi (özyinelemeli iniş ayrıştırıcısı).
 *
 * Ne gösterir
 *   - Bir satır okumak: bios_getline yazılanı ekrana yansıtır, Backspace ile silmeye izin verir.
 *   - Özyinelemeli iniş (recursive descent): her öncelik seviyesi bir fonksiyondur.
 *       ifade  = terim  { (+ | -) terim }
 *       terim  = carpan { (* | / | %) carpan }
 *       carpan = - carpan | ( ifade ) | sayi
 *     "2+3*4" için ifade → terim(2) ve terim(3*4) çağrılır; çarpma daha derinde olduğu için önce
 *     yapılır. Parantez ifade'yi yeniden çağırır: iç içe parantez = iç içe fonksiyon çağrısı.
 *   - Hata bildirmek: hatalı yerin altına ^ işareti, sıfıra bölme denetimi.
 *   - Sayılar onluk, 0x ile onaltılık ya da 0b ile ikilik yazılabilir; hesap 32 bitle (long) yapılır.
 *
 * CPU16 ile ilgisi
 *   - Tuşun yolu: PS/2 klavye → G/Ç kartı → IRQ 1 → BIOS kesme işleyicisi tarama kodunu ASCII'ye
 *     çevirip 0xF810'daki 16 baytlık halka tampona koyar → GETC oradan alır. UART'tan gelen
 *     baytlar da (terminal) aynı GETC'ye düşer: program ikisini ayırt etmez.
 *   - Her çağrı yığında yer tutar (dönüş adresi lr, korunan r4/r5, yereller): (((((1))))) gibi
 *     derin bir ifade yığını derinleştirir. Yığın 0xF800'dan aşağı büyür.
 *   - long çarpma ve bölme rt.s'deki __mul32 / __div32 ile yazılımda yapılır.
 *
 * Nasıl çalıştırılır
 *   Uygulamada: CPU16 tezgâhı → Anakart + BIOS → "hesap.c" → Derle ve RAM'e yükle; sonra ekrana tıklayıp
 *   klavyeyle (ya da UART terminalinden) ifade yaz, Enter. Boş satır ya da q: çıkış.
 *   Komut satırında, girdiyi borudan vererek:
 *     printf '2+3*4\n(1+2)*(3+4)\n\n' | npm run cpu16 -- cc cpu16/bios/ornekler/hesap.c --hedef bios --run
 *   Etkileşimli: npm run cpu16 -- machine cpu16/bios/ornekler/hesap.c   (çıkış: Ctrl-])
 *
 * Beklenen çıktı
 *   ifade: 2+3*4             →  = 14  (0x0000000E)
 *   ifade: (1+2)*(3+4)       →  = 21
 *   ifade: -7/2              →  = -3   (C'de bölme sıfıra doğru keser)
 *   ifade: 1/0               →  hata: sifira bolme */

#include <bios.h>
#include <stdio.h>

static const char *p;      /* ayrıştırıcının satırdaki konumu */
static const char *satir;  /* satırın başı (hata sütunu için) */
static const char *hata;   /* ilk hata iletisi; NULL = hata yok */
static const char *hata_yeri;

static long ifade(void);

static void hata_ver(const char *ileti) {
  if (!hata) { /* ilk hata kalsın: sonrakiler onun sonucudur */
    hata = ileti;
    hata_yeri = p;
  }
}

static void bosluk_atla(void) {
  while (*p == ' ')
    p++;
}

/* Rakamın değeri (taban 16'ya kadar), rakam değilse -1 */
static int rakam(char c) {
  if (c >= '0' && c <= '9')
    return c - '0';
  if (c >= 'a' && c <= 'f')
    return c - 'a' + 10;
  if (c >= 'A' && c <= 'F')
    return c - 'A' + 10;
  return -1;
}

static long sayi(void) {
  long v = 0;
  int taban = 10, d, n = 0;
  if (p[0] == '0' && (p[1] == 'x' || p[1] == 'X')) {
    taban = 16;
    p += 2;
  } else if (p[0] == '0' && (p[1] == 'b' || p[1] == 'B')) {
    taban = 2;
    p += 2;
  }
  while ((d = rakam(*p)) >= 0 && d < taban) {
    v = v * taban + d; /* taban 2/10/16: __mul32 (çarpan küçük, birkaç tur) */
    p++;
    n++;
  }
  if (n == 0)
    hata_ver("sayi bekleniyordu");
  return v;
}

static long carpan(void) {
  long v;
  bosluk_atla();
  if (*p == '-') { /* tekli eksi: kendini çağırır, --5 = 5 */
    p++;
    return -carpan();
  }
  if (*p == '(') {
    p++;
    v = ifade(); /* parantezin içi yeniden en düşük öncelikten başlar */
    bosluk_atla();
    if (*p == ')')
      p++;
    else
      hata_ver("')' eksik");
    return v;
  }
  return sayi();
}

static long terim(void) {
  long v = carpan(), b;
  const char *opp;
  char op;
  for (;;) {
    bosluk_atla();
    op = *p;
    if (op != '*' && op != '/' && op != '%')
      return v;
    opp = p++;
    b = carpan();
    if (op == '*')
      v = v * b;       /* __mul32 */
    else if (b == 0) {
      p = opp;         /* hatayı bölme işaretinin altında göster */
      hata_ver("sifira bolme");
      return 0;
    } else if (op == '/')
      v = v / b;       /* __div32: sıfıra doğru keser, -7 / 2 = -3 */
    else
      v = v % b;       /* __mod32: kalanın işareti bölünenden */
  }
}

static long ifade(void) {
  long v = terim();
  char op;
  for (;;) {
    bosluk_atla();
    op = *p;
    if (op != '+' && op != '-')
      return v;
    p++;
    if (op == '+')
      v = v + terim(); /* ADD + ADC */
    else
      v = v - terim(); /* SUB + SBC */
  }
}

/* sayıyı 32 bit ikilik yazar, baştaki sıfırları atlayarak */
static void ikilik(unsigned long v) {
  int i = 31;
  while (i > 0 && !(v >> i & 1))
    i--;
  for (; i >= 0; i--)
    putchar(v >> i & 1 ? '1' : '0');
}

int main(void) {
  char tampon[61];
  int n, i;
  long v;

  bios_setattr(RENK(SARI, MAVI));
  printf(" CPU16 hesap makinesi \n");
  bios_setattr(RENK(KOYU_GRI, SIYAH));
  printf("+ - * / %% ( ), 0x1F onaltilik, 0b101 ikilik; 32 bit. Bos satir ya da q: cikis\n");
  for (;;) {
    bios_setattr(RENK(ACIK_CAMGOBEGI, SIYAH));
    printf("ifade: ");
    bios_setattr(RENK(BEYAZ, SIYAH));
    n = bios_getline(tampon, 60); /* Enter'a kadar bekler; satır sonu tampona girmez */
    if (n == 0 || (tampon[0] == 'q' && tampon[1] == 0))
      break;
    satir = p = tampon;
    hata = NULL;
    v = ifade();
    bosluk_atla();
    if (!hata && *p)
      hata_ver("fazla karakter");
    if (hata) {
      bios_setattr(RENK(ACIK_KIRMIZI, SIYAH));
      for (i = 0; i < 7 + (int)(hata_yeri - satir); i++) /* "ifade: " 7 karakter */
        putchar(' ');
      printf("^ hata: %s\n", hata);
      continue;
    }
    bios_setattr(RENK(ACIK_YESIL, SIYAH));
    printf("  = %ld  (0x%08lX, ikilik ", v, v);
    ikilik(v);
    printf(")\n");
  }
  bios_setattr(RENK(ACIK_GRI, SIYAH));
  printf("Gule gule!\n");
  return 0;
}
