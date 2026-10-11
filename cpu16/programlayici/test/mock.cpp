#include "Arduino.h"
#include "../cpu16-programlayici/cpu16-programlayici.ino"

// Zaman modeli: her pin işlemi (P, W, R) 1 µs sürer; bekleme çağrıları "T <µs>" satırı yazar. Karşı
// taraf (Node testi) aynı sayımla EEPROM modelinin saatini ilerletir. Gerçek Nano'da port register'lı
// yazma ≈ 0,3 µs olduğundan bu model yavaş taraftadır: tBLC sınırı modelde sağlanıyorsa kartta da sağlanır.
SerialPort Serial;
static FILE* serialIn = nullptr;
static int peeked = -2;
static unsigned long fakeUs = 0;

static void out(const char* s) { fputs(s, stdout); }

void pinMode(uint8_t pin, uint8_t mode) {
  fakeUs++;
  printf("P %u %u\n", pin, mode);
}
void digitalWrite(uint8_t pin, uint8_t v) {
  fakeUs++;
  printf("W %u %u\n", pin, v ? 1 : 0);
}
int digitalRead(uint8_t pin) {
  fakeUs++;
  printf("R %u\n", pin);
  fflush(stdout);
  char buf[16];
  if (!fgets(buf, sizeof buf, stdin)) exit(2);
  return buf[0] == '1' ? HIGH : LOW;
}
void shiftOut(uint8_t data, uint8_t clock, uint8_t order, uint8_t v) {
  for (int i = 0; i < 8; i++) {
    int bit = order == MSBFIRST ? (v >> (7 - i)) & 1 : (v >> i) & 1;
    digitalWrite(data, bit);
    digitalWrite(clock, HIGH);
    digitalWrite(clock, LOW);
  }
}
void delayMicroseconds(unsigned us) {
  fakeUs += us;
  printf("T %u\n", us);
}
void delay(unsigned long ms) {
  fakeUs += ms * 1000;
  printf("T %lu\n", ms * 1000);
}
unsigned long millis() { return fakeUs / 1000; }

int SerialPort::available() {
  if (peeked == -2) peeked = fgetc(serialIn);
  return peeked == EOF ? 0 : 1;
}
int SerialPort::read() {
  available();
  int c = peeked;
  peeked = -2;
  return c;
}
static void serialText(const char* s) {
  out("S ");
  for (; *s; s++) {
    if (*s == '\n') out("\\n");
    else fputc(*s, stdout);
  }
  out("\n");
}
void SerialPort::print(const char* s) { serialText(s); }
void SerialPort::print(char c) { char b[2] = {c, 0}; serialText(b); }
void SerialPort::println(const char* s) { serialText(s); serialText("\n"); }
void SerialPort::println() { serialText("\n"); }

int main(int argc, char** argv) {
  if (argc < 2 || !(serialIn = fopen(argv[1], "rb"))) return 1;
  setup();
  while (Serial.available()) loop();
  out("X\n");
  return 0;
}
