# CPU16 ROM imajları

`npm run cpu16 -- roms` ile üretilir; elle düzenlemeyin.

| Dosya | Çip | Boyut |
|---|---|---|
| mikrokod-0.hex / .bin | CPU kartı, mikrokod ROM 0 (kontrol bitleri 0..7) | 8192 bayt |
| mikrokod-1.hex / .bin | CPU kartı, mikrokod ROM 1 (kontrol bitleri 8..15) | 8192 bayt |
| mikrokod-2.hex / .bin | CPU kartı, mikrokod ROM 2 (kontrol bitleri 16..23) | 8192 bayt |
| mikrokod-3.hex / .bin | CPU kartı, mikrokod ROM 3 (kontrol bitleri 24..31) | 8192 bayt |
| alu-0.hex / .bin | CPU kartı, ALU kod çözme ROM'u 0 | 128 bayt |
| alu-1.hex / .bin | CPU kartı, ALU kod çözme ROM'u 1 | 128 bayt |
| alu-2.hex / .bin | CPU kartı, ALU kod çözme ROM'u 2 | 128 bayt |

Yazmak için: `python3 cpu16/programlayici/yaz.py PORT cpu16/roms/<dosya>.hex --sil --dogrula`
