#include "Arduino.h"
#include "../cpu16-programlayici/cpu16-programlayici.ino"

SerialPort Serial;
static FILE* serialIn = nullptr;
static int peeked = -2;
static unsigned long fakeMs = 0;

static void out(const char* s) { fputs(s, stdout); }

void pinMode(uint8_t pin, uint8_t mode) { printf("P %u %u\n", pin, mode); }
void digitalWrite(uint8_t pin, uint8_t v) { printf("W %u %u\n", pin, v ? 1 : 0); }
int digitalRead(uint8_t pin) {
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
void delayMicroseconds(unsigned) {}
void delay(unsigned long ms) { fakeMs += ms; }
// her okumada zaman ilerlesin: zaman aşımı döngüleri sonsuza gitmesin
unsigned long millis() { return fakeMs++; }

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
