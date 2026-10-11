// Test için en küçük Arduino çekirdeği: pin işlemleri satır satır stdout'a yazılır, okumalar
// stdin'den yanıtlanır. Karşı tarafta Node testi programlayıcı kartını kapı seviyesinde çalıştırır
// (74HC595 × 2 + 28C256 modeli). Seri giriş bir dosyadan okunur.
#pragma once
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define MSBFIRST 1
#define LSBFIRST 0
#define A0 14
#define A1 15
#define A2 16
#define A3 17

void pinMode(uint8_t pin, uint8_t mode);
void digitalWrite(uint8_t pin, uint8_t v);
int digitalRead(uint8_t pin);
void shiftOut(uint8_t data, uint8_t clock, uint8_t order, uint8_t v);
void delayMicroseconds(unsigned us);
void delay(unsigned long ms);
unsigned long millis();

struct SerialPort {
  void begin(long) {}
  int available();
  int read();
  void print(const char* s);
  void print(char c);
  void println(const char* s);
  void println();
};
extern SerialPort Serial;
