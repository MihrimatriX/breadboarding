// CPU16 Flash programlayıcısı: Arduino Nano + 2 × 74HC595 + SST39SF010A (ZIF soket).
// Mikrokod, ALU ve BIOS ROM'larını seri port üzerinden Intel HEX olarak yazar.
//
// Bağlantılar (şema: cpu16/kicad/prog):
//   D2  → 595 SER (DS)        D3 → 595 SRCLK (SHCP)     D4 → 595 RCLK (STCP)
//   D5..D12 ↔ Flash DQ0..DQ7  A0 → Flash A16
//   A1  → Flash ~OE           A2 → Flash ~WE             A3 → Flash ~CE
//   595 #1 (U1) Q0..Q7 → A0..A7, Q7S → 595 #2 (U2) SER; U2 Q0..Q7 → A8..A15
//
// Seri protokol (115200 baud, satır sonu \n; her komut "OK ..." ya da "ERR ..." ile biter):
//   ID                 → OK ID BF B5            (üretici ve aygıt kodu)
//   ERASE              → OK                     (bütün çip, ~0,1 s)
//   SECTOR <adres>     → OK                     (4 KB sektör)
//   :<Intel HEX satırı> → OK | OK END | ERR …   (00 veri, 01 son, 04 üst adres)
//   READ <adres> <n>   → "aaaaa: xx xx …" satırları, sonra OK
//   SUM <adres> <n>    → OK SUM xxxx            (bayt toplamı, 16 bit; doğrulama için)
// Adres ve sayılar onaltılıktır.

const uint8_t PIN_SER = 2;
const uint8_t PIN_SRCLK = 3;
const uint8_t PIN_RCLK = 4;
const uint8_t PIN_D0 = 5;  // D5..D12
const uint8_t PIN_A16 = A0;
const uint8_t PIN_OE = A1;
const uint8_t PIN_WE = A2;
const uint8_t PIN_CE = A3;

char line[600];
uint16_t lineLen = 0;
uint32_t hexBase = 0;

// ---------------------------------------------------------------- donanım

void setAddress(uint32_t a) {
  shiftOut(PIN_SER, PIN_SRCLK, MSBFIRST, (a >> 8) & 0xFF);
  shiftOut(PIN_SER, PIN_SRCLK, MSBFIRST, a & 0xFF);
  digitalWrite(PIN_RCLK, HIGH);
  digitalWrite(PIN_RCLK, LOW);
  digitalWrite(PIN_A16, (a >> 16) & 1 ? HIGH : LOW);
}

void dataMode(uint8_t mode) {
  for (uint8_t i = 0; i < 8; i++) pinMode(PIN_D0 + i, mode);
}

void writeBus(uint32_t a, uint8_t d) {
  digitalWrite(PIN_OE, HIGH);
  setAddress(a);
  dataMode(OUTPUT);
  for (uint8_t i = 0; i < 8; i++) digitalWrite(PIN_D0 + i, (d >> i) & 1 ? HIGH : LOW);
  digitalWrite(PIN_CE, LOW);
  digitalWrite(PIN_WE, LOW);   // adres ~WE düşerken alınır
  digitalWrite(PIN_WE, HIGH);  // veri ~WE yükselirken alınır
  digitalWrite(PIN_CE, HIGH);
}

uint8_t readBus(uint32_t a) {
  dataMode(INPUT);
  setAddress(a);
  digitalWrite(PIN_CE, LOW);
  digitalWrite(PIN_OE, LOW);
  delayMicroseconds(1);  // erişim süresi 70 ns; Arduino'nun kendisi zaten yavaş
  uint8_t d = 0;
  for (uint8_t i = 0; i < 8; i++) if (digitalRead(PIN_D0 + i) == HIGH) d |= 1 << i;
  digitalWrite(PIN_OE, HIGH);
  digitalWrite(PIN_CE, HIGH);
  return d;
}

void unlock() {
  writeBus(0x5555, 0xAA);
  writeBus(0x2AAA, 0x55);
}

/** DQ7 sorgulaması: işlem sürerken DQ7 hedef değerin tersidir */
bool waitDq7(uint32_t a, uint8_t want, uint32_t maxMs) {
  uint32_t start = millis();
  for (;;) {
    if ((readBus(a) & 0x80) == (want & 0x80)) return true;
    if (millis() - start > maxMs) return false;
  }
}

bool programByte(uint32_t a, uint8_t d) {
  unlock();
  writeBus(0x5555, 0xA0);
  writeBus(a, d);
  return waitDq7(a, d, 2) && readBus(a) == d;
}

bool chipErase() {
  unlock();
  writeBus(0x5555, 0x80);
  unlock();
  writeBus(0x5555, 0x10);
  return waitDq7(0, 0xFF, 500);
}

bool sectorErase(uint32_t a) {
  unlock();
  writeBus(0x5555, 0x80);
  unlock();
  writeBus(a & 0x1F000, 0x30);
  return waitDq7(a & 0x1F000, 0xFF, 100);
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

/** "1F000 20" gibi onaltılık sayıları sırayla okur */
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
  for (uint8_t i = 0; i < len; i++) {
    uint32_t a = (addr + i) & 0x1FFFF;
    uint8_t want = bytes[4 + i];
    uint8_t have = readBus(a);
    if (have == want) continue;
    // Flash yalnızca 1 → 0 yazar: istenen bit 1 ama hücrede 0 varsa önce silmek gerekir
    if ((want & ~have) != 0 || !programByte(a, want)) {
      Serial.print("ERR ");
      printHex(a, 5);
      Serial.print(" istenen ");
      printHex(want, 2);
      Serial.print(" okunan ");
      printHex(readBus(a), 2);
      Serial.println((want & ~have) != 0 ? " (once silin)" : " (yazilamadi)");
      return;
    }
  }
  Serial.println("OK");
}

void command() {
  line[lineLen] = 0;
  const char* p = line;
  uint32_t a, n;
  if (line[0] == ':') {
    hexRecord();
  } else if (startsWith(line, "ID")) {
    unlock();
    writeBus(0x5555, 0x90);
    uint8_t maker = readBus(0), device = readBus(1);
    writeBus(0, 0xF0);
    Serial.print("OK ID ");
    printHex(maker, 2);
    Serial.print(" ");
    printHex(device, 2);
    Serial.println();
  } else if (startsWith(line, "ERASE")) {
    hexBase = 0;
    Serial.println(chipErase() ? "OK" : "ERR silme zaman asimi");
  } else if (startsWith(line, "SECTOR")) {
    p += 6;
    if (!parseHex(p, a)) Serial.println("ERR adres");
    else Serial.println(sectorErase(a) ? "OK" : "ERR silme zaman asimi");
  } else if (startsWith(line, "READ")) {
    p += 4;
    if (!parseHex(p, a) || !parseHex(p, n)) {
      Serial.println("ERR READ <adres> <sayi>");
      return;
    }
    for (uint32_t i = 0; i < n; i++) {
      if (i % 16 == 0) {
        if (i) Serial.println();
        printHex(a + i, 5);
        Serial.print(":");
      }
      Serial.print(" ");
      printHex(readBus((a + i) & 0x1FFFF), 2);
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
    for (uint32_t i = 0; i < n; i++) s += readBus((a + i) & 0x1FFFF);
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
  pinMode(PIN_A16, OUTPUT);
  digitalWrite(PIN_OE, HIGH);
  digitalWrite(PIN_WE, HIGH);
  digitalWrite(PIN_CE, HIGH);
  pinMode(PIN_OE, OUTPUT);
  pinMode(PIN_WE, OUTPUT);
  pinMode(PIN_CE, OUTPUT);
  dataMode(INPUT);
  Serial.begin(115200);
  Serial.println("CPU16 programlayici v1 hazir");
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
