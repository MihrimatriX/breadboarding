# Deney 13: C derleyicisi: yılan oyunu

> **Video:** "Kendi C derleyicimizle kendi bilgisayarımızda yılan oyunu" · **Önce:** Deney 12 · **Kart:** yeni donanım yok

Son deney yazılımdır: C ile yazılmış bir oyunu kendi derleyicimiz cc16 ile derleyip USB'den
yüklüyor, kendi ekran kartımızda kendi klavye arayüzümüzle oynuyoruz. Zincirin her halkası bu
setin içinde: transistör → kapı → 74HC çip → CPU → BIOS → derleyici → oyun.

## Ne öğreneceksin

- Bir C derleyicisinin aşamaları: önişlemci, sözdizimi ağacı, kod üretimi, assembler, bağlayıcı (cc16 → as16 → ld16).
- Çağrı kuralı (ABI): argümanlar r0–r3'te, dönüş r0'da, r4–r5 korunur, r6 yığın, r7 dönüş adresi.
- **BIOS hedefi**: program RAM'e `0x4000`'dan yüklenir, `putchar`/`printf` BIOS'un ekran ve UART
  rutinlerine gider, `main` dönünce monitöre dönülür.
- Donanıma C'den doğrudan erişim: `volatile` işaretçiyle video portları (`bios.h`: `ekran_yaz`).

## Nasıl çalışır

- `yilan.c` (`cpu16/bios/ornekler/`): 40 × 20 oyun alanı, CP857 çerçeve karakterleri, W A S D ile yön,
  Q ile çıkış. Zaman BIOS'un tık sayacından (`bios_ticks`), tuşlar BIOS'un klavye tamponundan
  (`bios_trygetc`) gelir; ekran doğrudan video kartının portlarıyla çizilir.
- Derleme: `npm run cpu16 -- cc cpu16/bios/ornekler/yilan.c --hedef bios -o yilan.hex`.
  Çıktı, monitörün `L` komutunun beklediği Intel HEX'tir. Ayrıntı: `cpu16/docs/cc16.md`, "BIOS hedefi".
- Oyunun hızı tık sayısıyla ayarlanır; 1 MHz'de tık 40 ms olduğu için oyun simülatöre göre yavaştır
  (`cpu16/docs/uretim.md`, bölüm 2). `yilan.c`'deki `adim` değerini küçülterek hızlandırabilirsin.

## Kurulum adımları

1. Kart Deney 12'deki gibi açık, terminal ya da Web IDE bağlı.
2. PS/2 klavyeyi video / G/Ç kartının klavye konnektörüne tak, VGA monitörü bağla.
3. Web IDE → CPU16 → Anakart + BIOS → program listesinden **yilan.c** → **Karta gönder (Web Serial)**.
   Ya da komut satırından derleyip HEX'i bir terminal programıyla `L` komutuna gönder.

## Test: beklenen sonuç

| Adım | Beklenen |
|---|---|
| Yükleme | terminalde `Yuklendi: …` ve oyun başlar |
| Ekran | çerçeve, `CPU16 YILAN` başlığı, `Skor: 0   Rekor: 0   Uzunluk: 3` |
| D, S, A, W | yılan döner; yemi yiyince skor 10 artar, yılan uzar ve hızlanır |
| Duvara çarpma | `OYUN BITTI`; bir tuş yeni oyun, Q monitöre döner: `Yilan: rekor …` |

Önce `selam.c` ile dene: `printf`, renkler ve `fib(18) = 2584` bütün zinciri daha kısa bir
programla sınar.

## Simülatörde

- Web IDE → CPU16 → Anakart + BIOS → **yilan.c** → "Derle ve RAM'e yükle", ekrana tıkla, W A S D.
  Kaynak düzenlenebilir: değiştir, Ctrl+Enter ile yeniden derle.
- `npm run cpu16 -- cc cpu16/bios/ornekler/selam.c --hedef bios --run`: anakart modelinde çalıştırır.
- Testler: `cpu16/tests/cc-bios.test.ts` yılanı otomatik pilotla oynatır (yem, skor, uzunluk, çarpma).

## Sorun giderme

| Belirti | Bak |
|---|---|
| Derleme hatası | hata `dosya:satır:sütun` ile gelir; Web IDE satırı gösterir |
| Ekranda çöp karakterler | video kartı Deney 11 testini geçiyor mu; `4-gc-video.c` kart testi |
| Tuşlar çalışmıyor | klavye ABD düzeni, PS/2; terminalden W A S D göndermek de çalışır (BIOS iki kaynağa da bakar) |
| Oyun çok yavaş / hızlı | CPU saati: tık süresi saat hızıyla ölçeklenir |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
Bu deneyde yeni donanım kurulmaz; önceki deneylerin kartları kullanılır.
<!-- otomatik: bitti -->
