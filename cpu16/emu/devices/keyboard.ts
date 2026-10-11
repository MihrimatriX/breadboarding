// PS/2 klavye: tarama kodu kümesi 2 (set 2). Gerçek kartta klavyenin seri verisi bir 74HC595
// kaydırma register'ına girer; 11 bit (başlangıç, 8 veri, eşlik, bitiş) tamamlanınca READY olur.
// READY varken kart klavyenin saat hattını aşağı çeker (PS/2 "inhibit"): klavye sonraki baytı
// tamponda tutar. Model bunu bir kuyrukla yapar: bayt okunmadan yenisi gelmez.
//
// Ana makine tarafı: tarayıcının KeyboardEvent.code adlarından set 2 kodları üretir
// (bırakmada F0 öneki, genişletilmiş tuşlarda E0 öneki).

/** KeyboardEvent.code → set 2 basma kodu (E0 önekliler iki bayt). */
export const SET2: Record<string, number[]> = {
  Escape: [0x76], F1: [0x05], F2: [0x06], F3: [0x04], F4: [0x0c], F5: [0x03], F6: [0x0b],
  F7: [0x83], F8: [0x0a], F9: [0x01], F10: [0x09], F11: [0x78], F12: [0x07],
  Backquote: [0x0e], Digit1: [0x16], Digit2: [0x1e], Digit3: [0x26], Digit4: [0x25], Digit5: [0x2e],
  Digit6: [0x36], Digit7: [0x3d], Digit8: [0x3e], Digit9: [0x46], Digit0: [0x45], Minus: [0x4e],
  Equal: [0x55], Backspace: [0x66],
  Tab: [0x0d], KeyQ: [0x15], KeyW: [0x1d], KeyE: [0x24], KeyR: [0x2d], KeyT: [0x2c], KeyY: [0x35],
  KeyU: [0x3c], KeyI: [0x43], KeyO: [0x44], KeyP: [0x4d], BracketLeft: [0x54], BracketRight: [0x5b],
  Backslash: [0x5d],
  CapsLock: [0x58], KeyA: [0x1c], KeyS: [0x1b], KeyD: [0x23], KeyF: [0x2b], KeyG: [0x34], KeyH: [0x33],
  KeyJ: [0x3b], KeyK: [0x42], KeyL: [0x4b], Semicolon: [0x4c], Quote: [0x52], Enter: [0x5a],
  ShiftLeft: [0x12], IntlBackslash: [0x61], KeyZ: [0x1a], KeyX: [0x22], KeyC: [0x21], KeyV: [0x2a],
  KeyB: [0x32], KeyN: [0x31], KeyM: [0x3a], Comma: [0x41], Period: [0x49], Slash: [0x4a],
  ShiftRight: [0x59],
  ControlLeft: [0x14], MetaLeft: [0xe0, 0x1f], AltLeft: [0x11], Space: [0x29], AltRight: [0xe0, 0x11],
  MetaRight: [0xe0, 0x27], ContextMenu: [0xe0, 0x2f], ControlRight: [0xe0, 0x14],
  Insert: [0xe0, 0x70], Home: [0xe0, 0x6c], PageUp: [0xe0, 0x7d], Delete: [0xe0, 0x71],
  End: [0xe0, 0x69], PageDown: [0xe0, 0x7a],
  ArrowUp: [0xe0, 0x75], ArrowLeft: [0xe0, 0x6b], ArrowDown: [0xe0, 0x72], ArrowRight: [0xe0, 0x74],
  NumLock: [0x77], NumpadDivide: [0xe0, 0x4a], NumpadMultiply: [0x7c], NumpadSubtract: [0x7b],
  NumpadAdd: [0x79], NumpadEnter: [0xe0, 0x5a], NumpadDecimal: [0x71],
  Numpad0: [0x70], Numpad1: [0x69], Numpad2: [0x72], Numpad3: [0x7a], Numpad4: [0x6b],
  Numpad5: [0x73], Numpad6: [0x74], Numpad7: [0x6c], Numpad8: [0x75], Numpad9: [0x7d],
  ScrollLock: [0x7e],
};

/** Basma kodları. Bilinmeyen tuşta boş dizi. */
export function makeCodes(code: string): number[] {
  return SET2[code] ? [...SET2[code]] : [];
}

/** Bırakma kodları: F0 + kod (genişletilmişte E0 F0 kod). */
export function breakCodes(code: string): number[] {
  const m = SET2[code];
  if (!m) return [];
  return m.length === 2 ? [0xe0, 0xf0, m[1]] : [0xf0, m[0]];
}

// ABD düzeni: hangi karakter hangi tuş, Shift gerekir mi
const US_PLAIN = "`1234567890-=qwertyuiop[]\\asdfghjkl;'zxcvbnm,./";
const US_SHIFT = "~!@#$%^&*()_+QWERTYUIOP{}|ASDFGHJKL:\"ZXCVBNM<>?";
const US_KEYS = [
  "Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal",
  "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight", "Backslash",
  "KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote",
  "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash",
];

/** Karakteri (ABD düzeninde) tuşa çevirir: [KeyboardEvent.code, shift]. */
export function keyForChar(ch: string): [string, boolean] | undefined {
  const special: Record<string, string> = { " ": "Space", "\n": "Enter", "\r": "Enter", "\b": "Backspace", "\t": "Tab", "\x1b": "Escape" };
  if (special[ch]) return [special[ch], false];
  let i = US_PLAIN.indexOf(ch);
  if (i >= 0) return [US_KEYS[i], false];
  i = US_SHIFT.indexOf(ch);
  if (i >= 0) return [US_KEYS[i], true];
  return undefined;
}

/** Metni klavyeden yazılmış gibi tarama kodu dizisine çevirir (Shift basılıp bırakılır). */
export function textToScancodes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const k = keyForChar(ch);
    if (!k) continue;
    const [code, shift] = k;
    if (shift) out.push(...makeCodes("ShiftLeft"));
    out.push(...makeCodes(code), ...breakCodes(code));
    if (shift) out.push(...breakCodes("ShiftLeft"));
  }
  return out;
}

export class Ps2Keyboard {
  /** Kaydırma register'ındaki son bayt (KBD_DATA). */
  data = 0;
  /** KBD_STAT bit0. */
  ready = false;
  /** Klavyenin göndermeyi beklettiği baytlar. */
  readonly queue: number[] = [];
  /** Sonraki bayt en erken bu döngüde tamamlanır. */
  nextAt = 0;

  reset(): void {
    this.data = 0;
    this.ready = false;
    this.queue.length = 0;
    this.nextAt = 0;
  }
}
