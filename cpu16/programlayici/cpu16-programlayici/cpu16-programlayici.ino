// CPU16 EEPROM programlayıcısı: Arduino Nano + 2 × 74HC595 + 28C256 (ZIF-28 soket).
// BIOS EEPROM'unu ve video kartının karakter ROM'unu seri port üzerinden Intel HEX olarak yazar.
//
// Bağlantılar (şema: cpu16/kicad/prog):
//   D2  → 595 SER (DS)        D3 → 595 SRCLK (SHCP)     D4 → 595 RCLK (STCP)
//   D5..D12 ↔ EEPROM IO0..IO7
//   A1  → EEPROM ~OE          A2 → EEPROM ~WE            A3 → EEPROM ~CE
//   595 #1 (U1) Q0..Q7 → A0..A7, Q7S → 595 #2 (U2) SER; U2 Q0..Q6 → A8..A14
//
// 28C256'ya yazma (veri sayfası):
//   - Sayfa yazma: aynı 64 baytlık sayfadaki (A14..A6 aynı) baytlar art arda yüklenir; her bayt bir
//     öncekinden en geç tBLC = 150 µs sonra gelmeli, yoksa çip yüklemeyi bitirip iç yazma döngüsünü
//     (tWC ≤ 10 ms) başlatır. Silme gerekmez: her bayt doğrudan yeni değerini alır.
//   - Yazma sürerken okunan bayt durumdur: D7 son yazılan baytın D7'sinin tersi (DATA yoklaması),
//     D6 her okumada değişir (toggle biti).
//   - Yazılım veri koruması (SDP): AA→5555, 55→2AAA, A0→5555 dizisinden sonra yüklenen baytlar
//     yazılır ve koruma açık kalır; korumalı çipte dizisiz yazmalar yok sayılır. Bu yazılım her
//     sayfayı dizinin arkasından yazar: çip korumalı da korumasız da olsa yazılır, sonunda korumalıdır.
//     AA 55 80 AA 55 20 dizisi korumayı kapatır.
//   - Bayt başına süre önemli olduğundan pinler AVR'de port register'larıyla sürülür (digitalWrite
//     ≈ 3,5 µs, bu yol ≈ 0,3 µs: bir baytı yüklemek ≈ 20 µs, tBLC'nin çok altında).
//
// Seri protokol (115200 baud, satır sonu \n; her komut "OK ..." ya da "ERR ..." ile biter):
//   SDP                → OK SDP 1 | OK SDP 0    (yazma koruması açık mı)
//   SDP 1 / SDP 0      → OK                     (korumayı aç / kapat)
//   :<Intel HEX satırı> → OK | OK END | ERR …   (00 veri, 01 son, 04 üst adres; 0000–7FFF)
//   READ <adres> <n>   → "aaaa: xx xx …" satırları, sonra OK
//   SUM <adres> <n>    → OK SUM xxxx            (bayt toplamı, 16 bit; doğrulama için)
// Adres ve sayılar onaltılıktır.

const uint8_t PIN_SER = 2;
const uint8_t PIN_SRCLK = 3;
const uint8_t PIN_RCLK = 4;
const uint8_t PIN_D0 = 5;  // D5..D12
const uint8_t PIN_OE = A1;
const uint8_t PIN_WE = A2;
const uint8_t PIN_CE = A3;

const uint16_t EEPROM_SIZE = 0x8000;
const uint8_t PAGE = 64;
const uint32_t WRITE_MS = 20;  // tWC en çok 10 ms; pay

char line[600];
uint16_t lineLen = 0;
uint32_t hexBase = 0;

// ---------------------------------------------------------------- hızlı pin yazma

#ifdef __AVR__
static volatile uint8_t* outReg[18];
static uint8_t outMask[18];
static void fastPin(uint8_t pin) {
  outReg[pin] = portOutputRegister(digitalPinToPort(pin));
  outMask[pin] = digitalPinToBitMask(pin);
}
static inline void pinOut(uint8_t pin, uint8_t v) {
  if (v) *outReg[pin] |= outMask[pin];
  else *outReg[pin] &= ~outMask[pin];
}
#else
static void fastPin(uint8_t) {}
static inline void pinOut(uint8_t pin, uint8_t v) { digitalWrite(pin, v); }
#endif

// ---------------------------------------------------------------- donanım

void setAddress(uint16_t a) {
  for (int8_t i = 15; i >= 0; i--) {  // önce A15 (en uzak çipin Q7'si), en son A0
    pinOut(PIN_SER, (a >> i) & 1);
    pinOut(PIN_SRCLK, HIGH);
    pinOut(PIN_SRCLK, LOW);
  }
  pinOut(PIN_RCLK, HIGH);
  pinOut(PIN_RCLK, LOW);
}

void dataMode(uint8_t mode) {
  for (uint8_t i = 0; i < 8; i++) pinMode(PIN_D0 + i, mode);
}

/** Bir yazma: adres ~WE düşerken, veri ~WE yükselirken alınır. Veri pinleri çıkış olmalı, ~OE yüksek. */
void busWrite(uint16_t a, uint8_t d) {
  setAddress(a);
  for (uint8_t i = 0; i < 8; i++) pinOut(PIN_D0 + i, (d >> i) & 1);
  pinOut(PIN_CE, LOW);
  pinOut(PIN_WE, LOW);
  pinOut(PIN_WE, HIGH);
  pinOut(PIN_CE, HIGH);
}

uint8_t readBus(uint16_t a) {
  setAddress(a);
  pinOut(PIN_CE, LOW);
  pinOut(PIN_OE, LOW);
  delayMicroseconds(1);  // erişim süresi 150 ns
  uint8_t d = 0;
  for (uint8_t i = 0; i < 8; i++) if (digitalRead(PIN_D0 + i) == HIGH) d |= 1 << i;
  pinOut(PIN_OE, HIGH);
  pinOut(PIN_CE, HIGH);
  return d;
}

/** DATA yoklaması: yazma sürerken D7 son baytın D7'sinin tersidir; bitince bayt kendisi okunur */
bool waitData(uint16_t a, uint8_t want) {
  uint32_t start = millis();
  while ((readBus(a) & 0x80) != (want & 0x80)) {
    if (millis() - start > WRITE_MS) return false;
  }
  return readBus(a) == want;
}

/** Toggle biti: D6 iki okuma arasında değişmeyene kadar bekle (yazma döngüsü bitti) */
bool waitIdle() {
  uint32_t start = millis();
  while (((readBus(EEPROM_SIZE - 1) ^ readBus(EEPROM_SIZE - 1)) & 0x40) != 0) {
    if (millis() - start > WRITE_MS) return false;
  }
  return true;
}

/** Korumalı sayfa yazması: AA 55 A0 dizisi ve aynı sayfadaki n bayt, sonra DATA yoklaması */
bool writePage(uint16_t a, const uint8_t* d, uint8_t n) {
  dataMode(OUTPUT);
  busWrite(0x5555, 0xAA);
  busWrite(0x2AAA, 0x55);
  busWrite(0x5555, 0xA0);
  for (uint8_t i = 0; i < n; i++) busWrite(a + i, d[i]);
  dataMode(INPUT);
  return waitData(a + n - 1, d[n - 1]);
}

/** Koruma açık mı: son bayta kendi değeri dizisiz yazılır; korumasızken bu bir yazma döngüsü başlatır */
bool sdpOn() {
  uint8_t v = readBus(EEPROM_SIZE - 1);
  dataMode(OUTPUT);
  busWrite(EEPROM_SIZE - 1, v);
  dataMode(INPUT);
  delayMicroseconds(200);  // tBLC geçsin: korumasızsa iç yazma döngüsü başladı
  bool toggling = ((readBus(EEPROM_SIZE - 1) ^ readBus(EEPROM_SIZE - 1)) & 0x40) != 0;
  if (toggling) waitIdle();
  return !toggling;
}

bool setSdp(bool on) {
  dataMode(OUTPUT);
  busWrite(0x5555, 0xAA);
  busWrite(0x2AAA, 0x55);
  if (on) {
    busWrite(0x5555, 0xA0);
  } else {
    busWrite(0x5555, 0x80);
    busWrite(0x5555, 0xAA);
    busWrite(0x2AAA, 0x55);
    busWrite(0x5555, 0x20);
  }
  dataMode(INPUT);
  delayMicroseconds(200);
  return waitIdle();
}

// ---------------------------------------------------------------- yardımcılar

void printHex(uint32_t v, uint8_t digits) {
  for (int8_t i = digits - 1; i >= 0; i--) Serial.print("0123456789ABCDEF"[(v >> (4 * i)) & 0xF]);
}

int8_t hexDigit(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  return -1;
}

/** "7F00 20" gibi onaltılık sayıları sırayla okur */
bool parseHex(const char*& p, uint32_t& out) {
  while (*p == ' ') p++;
  int8_t d = hexDigit(*p);
  if (d < 0) return false;
  out = 0;
  while ((d = hexDigit(*p)) >= 0) {
    out = (out << 4) | (uint32_t)d;
    p++;
  }
  return true;
}

bool startsWith(const char* s, const char* prefix) {
  while (*prefix) if (*s++ != *prefix++) return false;
  return *s == 0 || *s == ' ';
}

// ---------------------------------------------------------------- komutlar

void hexRecord() {
  uint8_t bytes[300];
  uint16_t n = 0;
  uint8_t sum = 0;
  for (uint16_t i = 1; i + 1 < lineLen; i += 2) {
    int8_t h = hexDigit(line[i]), l = hexDigit(line[i + 1]);
    if (h < 0 || l < 0 || n >= sizeof(bytes)) {
      Serial.println("ERR HEX karakteri");
      return;
    }
    bytes[n] = (uint8_t)((h << 4) | l);
    sum += bytes[n++];
  }
  if (n < 5 || n != (uint16_t)bytes[0] + 5) {
    Serial.println("ERR HEX uzunluk");
    return;
  }
  if (sum != 0) {
    Serial.println("ERR HEX saglama toplami");
    return;
  }
  uint8_t len = bytes[0], type = bytes[3];
  uint32_t addr = hexBase + (((uint32_t)bytes[1] << 8) | bytes[2]);
  if (type == 1) {
    Serial.println("OK END");
    return;
  }
  if (type == 4) {
    hexBase = (((uint32_t)bytes[4] << 8) | bytes[5]) << 16;
    Serial.println("OK");
    return;
  }
  if (type != 0) {
    Serial.println("OK");  // diğer kayıt türleri yok sayılır
    return;
  }
  if (addr + len > EEPROM_SIZE) {
    Serial.print("ERR ");
    printHex(addr, 5);
    Serial.println(" 28C256 disinda (0000-7FFF)");
    return;
  }
  // kayıt sayfa sınırlarında bölünür; her parça tek yazma döngüsü. Aynı olan parça yazılmaz.
  for (uint8_t i = 0; i < len;) {
    uint16_t a = (uint16_t)(addr + i);
    uint8_t k = PAGE - (a & (PAGE - 1));
    if (k > len - i) k = len - i;
    const uint8_t* want = bytes + 4 + i;
    bool same = true;
    for (uint8_t j = 0; j < k && same; j++) same = readBus(a + j) == want[j];
    bool ok = same || writePage(a, want, k);
    for (uint8_t j = 0; j < k && ok; j++) {
      uint8_t have = readBus(a + j);
      if (have == want[j]) continue;
      Serial.print("ERR ");
      printHex(a + j, 4);
      Serial.print(" istenen ");
      printHex(want[j], 2);
      Serial.print(" okunan ");
      printHex(have, 2);
      Serial.println(" (yazilamadi)");
      return;
    }
    if (!ok) {
      Serial.print("ERR ");
      printHex(a, 4);
      Serial.println(" yazma zaman asimi");
      return;
    }
    i += k;
  }
  Serial.println("OK");
}

void command() {
  line[lineLen] = 0;
  const char* p = line;
  uint32_t a, n;
  if (line[0] == ':') {
    hexRecord();
  } else if (startsWith(line, "SDP")) {
    p += 3;
    if (!parseHex(p, a)) {
      Serial.println(sdpOn() ? "OK SDP 1" : "OK SDP 0");
    } else if (a > 1) {
      Serial.println("ERR SDP [0|1]");
    } else {
      hexBase = 0;
      Serial.println(setSdp(a == 1) ? "OK" : "ERR zaman asimi");
    }
  } else if (startsWith(line, "READ")) {
    p += 4;
    if (!parseHex(p, a) || !parseHex(p, n)) {
      Serial.println("ERR READ <adres> <sayi>");
      return;
    }
    for (uint32_t i = 0; i < n; i++) {
      if (i % 16 == 0) {
        if (i) Serial.println();
        printHex((a + i) & (EEPROM_SIZE - 1), 4);
        Serial.print(":");
      }
      Serial.print(" ");
      printHex(readBus((a + i) & (EEPROM_SIZE - 1)), 2);
    }
    if (n) Serial.println();
    Serial.println("OK");
  } else if (startsWith(line, "SUM")) {
    p += 3;
    if (!parseHex(p, a) || !parseHex(p, n)) {
      Serial.println("ERR SUM <adres> <sayi>");
      return;
    }
    uint16_t s = 0;
    for (uint32_t i = 0; i < n; i++) s += readBus((a + i) & (EEPROM_SIZE - 1));
    Serial.print("OK SUM ");
    printHex(s, 4);
    Serial.println();
  } else if (lineLen > 0) {
    Serial.println("ERR bilinmeyen komut");
  }
}

void setup() {
  pinMode(PIN_SER, OUTPUT);
  pinMode(PIN_SRCLK, OUTPUT);
  pinMode(PIN_RCLK, OUTPUT);
  digitalWrite(PIN_OE, HIGH);
  digitalWrite(PIN_WE, HIGH);
  digitalWrite(PIN_CE, HIGH);
  pinMode(PIN_OE, OUTPUT);
  pinMode(PIN_WE, OUTPUT);
  pinMode(PIN_CE, OUTPUT);
  const uint8_t outs[] = {PIN_SER, PIN_SRCLK, PIN_RCLK, PIN_OE, PIN_WE, PIN_CE};
  for (uint8_t i = 0; i < sizeof(outs); i++) fastPin(outs[i]);
  for (uint8_t i = 0; i < 8; i++) fastPin(PIN_D0 + i);
  dataMode(INPUT);
  Serial.begin(115200);
  Serial.println("CPU16 programlayici v2 (28C256) hazir");
}

void loop() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      command();
      lineLen = 0;
    } else if (lineLen < sizeof(line) - 1) {
      line[lineLen++] = c;
    }
  }
}
