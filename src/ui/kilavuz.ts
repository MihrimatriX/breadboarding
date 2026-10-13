// Başlangıç panelinin (uygulama içi kılavuz) metinleri: giriş, her bölümün ilk adımları ve ortak
// ipuçları, Türkçe ve İngilizce. Adımlar o bölümde gerçekten olan düğme ve kısayollara dayanır: bir
// düğmenin adı ya da kısayolu değişirse buradaki adım da değişir. Ters tırnak içi (`N`) tuş olarak
// (<kbd>) çizilir; parcala() metni düz yazı ve tuş parçalarına ayırır. Testi: tests/ceviri-kabuk.test.ts.

import type { IkiDil } from "./ceviri";
import type { Mode } from "./ModeSwitch";

export const GIRIS: IkiDil = {
  tr: "Silikon3D bir bilgisayarı transistörden karta kadar tarayıcıda, canlı sinyallerle çalıştırır. Altı bölüm var; üst çubuktan istediğin an geçebilirsin, her bölüm kaldığı yerden devam eder.",
  en: "Silikon3D runs a computer in your browser, from single transistors up to whole boards, with live signals. Switch between its six sections from the top bar at any time; each one picks up where you left off.",
};

export const ILK_ADIMLAR: Record<Mode, IkiDil[]> = {
  "6502": [
    {
      tr: "Die açılınca örnek program (sayaç) çalışmaya başlar. `Boşluk` ile duraklat, sonra `N` ile komut komut, `.` ile yarım çevrim yarım çevrim ilerle.",
      en: "The example program (a counter) starts when the die opens. Pause with `Space`, then step one instruction with `N` or half a cycle with `.`.",
    },
    {
      tr: "Die üzerinde bir tele tıkla: adı ve seviyesi sağdaki Durum sekmesinde açılır. Sinyali adıyla da bulabilirsin (ör. clk0).",
      en: "Click a wire on the die to probe it; its name and level open in the Status tab on the right. You can also find a signal by name (e.g. clk0).",
    },
    {
      tr: "Analizöre ekle düğmesi sinyali alttaki mantık analizörüne alır. Dalga formu her yarım çevrimde ilerler; İz tablosu sekmesi yazmaçları satır satır yazar.",
      en: "Add to analyzer sends the signal to the logic analyzer below. The waveform advances every half cycle; the Trace table tab lists the registers row by row.",
    },
    {
      tr: "Program sekmesinde bir örnek seç ya da kendi 6502 kodunu yaz, sonra Derle ve yükle'ye bas.",
      en: "In the Program tab, pick an example or write your own 6502 code, then press Compile and load.",
    },
  ],
  cpu16: [
    {
      tr: "Alttaki düzenleyicide bir örnek program seç: assembly ya da C.",
      en: "Pick an example program in the editor below, in assembly or C.",
    },
    {
      tr: "Derle ve RAM'e yükle (`Ctrl+Enter`) programı derler, RAM'e yükler ve çalıştırır.",
      en: "Compile and load into RAM (`Ctrl+Enter`) compiles the program, loads it into RAM and runs it.",
    },
    {
      tr: "VGA ekranına tıkla: klavyen PS/2 olarak karta gider (ABD düzeni). Terminale tıklarsan tuşlar UART'tan monitöre gider.",
      en: "Click the VGA screen and your keyboard goes to the board as PS/2 (US layout). Click the terminal instead and your keys go to the monitor over UART.",
    },
    {
      tr: "Araç çubuğundan duraklat, adım at, sıfırla ya da saat hızını değiştir. Makine kipi menüsündeki Düz bellek, 64 KB düz RAM'li emülatörü açar.",
      en: "Use the toolbar to pause, step, reset or change the clock speed. Flat memory in the Machine mode menu switches to the emulator with 64 KB of flat RAM.",
    },
  ],
  kart: [
    {
      tr: "Sahneyi sürükleyerek döndür, sağ tuşla sürükleyerek kaydır, tekerlekle yakınlaş.",
      en: "Drag to rotate the scene, right-drag to pan, and use the wheel to zoom.",
    },
    {
      tr: "Bir çipe tıkla: telleri, bağlantıları ve içindeki kapılar açılır. `Esc` seçimi adım adım kaldırır.",
      en: "Click a chip to see its wires, its connections and the gates inside. `Esc` clears the selection one step at a time.",
    },
    {
      tr: "`E` etiketleri açar: önce bölümler, sonra ayrıntılı. Bir etikete tıklarsan o bölümün görevi ve çipleri yan panelde açılır.",
      en: "`E` turns on the labels: first the regions, then the details. Click a label to see that region's job and chips in the side panel.",
    },
    {
      tr: "`Boşluk` bilgisayarı çalıştırır ya da duraklatır. Alt paneldeki Program sekmesinde Yükle ve çalıştır, programı EEPROM'a yazıp baştan başlatır.",
      en: "`Space` runs or pauses the computer. Load and run, in the Program tab of the bottom panel, writes the program to the EEPROM and restarts it.",
    },
  ],
  hesap: [
    {
      tr: "Sağdaki Hesap sekmesinde A ve B sayılarını yaz ya da bitlerine tıkla.",
      en: "In the Calculator tab on the right, type the numbers A and B or click their bits.",
    },
    {
      tr: "Bir işlem seç: sonuç (bölmede kalanla birlikte) göstergelerde belirir.",
      en: "Pick an operation. The result (with the remainder, for division) shows on the displays.",
    },
    {
      tr: "3D'de bir DIP anahtarın beyaz düğmesine tıklayınca o bit değişir. Sarı LAMBA TESTİ butonunu basılı tutarsan bütün segmentler yanar.",
      en: "In 3D, click the white knob of a DIP switch to flip that bit. Hold down the yellow lamp test button to light every segment.",
    },
    {
      tr: "Araç çubuğundaki Genel bakış, Anahtarlar ve Göstergeler kamerayı o bloğa götürür. Bir çipe tıklarsan içindeki kapıları görürsün.",
      en: "Overview, Switches and Displays in the toolbar move the camera to that block. Click a chip to see the gates inside.",
    },
  ],
  mimari: [
    {
      tr: "Araç çubuğundan bir diyagram seç ya da `1` `2` `3` tuşlarına bas: CPU kartı, bütün bilgisayar, hesap makinesi.",
      en: "Pick a diagram in the toolbar or press `1` `2` `3`: the CPU board, the whole computer, the calculator.",
    },
    {
      tr: "Tekerlek imlecin olduğu yere yakınlaşır, sürüklemek kaydırır; `0` diyagramı sahneye sığdırır.",
      en: "The wheel zooms in where the cursor is and dragging pans. `0` fits the diagram to the view.",
    },
    {
      tr: "Bir kutuya tıkla: parçaları ve yolları yan panelde açılır. Klavyede `Tab` ile kutular arasında gezip `Enter`'a basabilirsin.",
      en: "Click a box to open its parts and buses in the side panel. With the keyboard, move between boxes with `Tab` and press `Enter`.",
    },
    {
      tr: "Yan paneldeki 3D'de göster, o bloğu kart bölümünde 3D olarak açar.",
      en: "Show in 3D in the side panel opens that block in the 3D board section.",
    },
  ],
  belgeler: [
    {
      tr: "Soldaki listeden bir belge seç ya da `/` ile arama kutusuna geç: başlıklarda ve metinde arar, `Esc` aramayı temizler.",
      en: "Pick a document from the list on the left, or press `/` to jump to the search box. It searches titles and text; `Esc` clears the search.",
    },
    {
      tr: "Bu sayfada listesi belgenin başlıklarına götürür.",
      en: "The On this page list takes you to the document's headings.",
    },
    {
      tr: "Belgenin sonundaki Önceki ve Sonraki bağlantıları okuma sırasını izler.",
      en: "The Previous and Next links at the end of a document follow the reading order.",
    },
    {
      tr: "GitHub'da aç, belgenin kaynağını yeni sekmede gösterir.",
      en: "Open on GitHub shows the document's source in a new tab.",
    },
  ],
};

/** Panelin altındaki ortak ipuçları (sırasıyla kısayollar, dil) */
export const ORTAK_IPUCLARI: IkiDil[] = [
  {
    tr: "`T` tema · `Y` yazı boyutu · `F` odak modu · `?` bu panel. Bütün kısayollar sağ üstteki listede.",
    en: "`T` theme · `Y` text size · `F` focus mode · `?` this panel. Every shortcut is in the list at the top right.",
  },
  {
    tr: "`L` dil: Türkçe / English. Üst çubuktaki EN düğmesi de dili değiştirir.",
    en: "`L` language: English / Türkçe. The TR button in the top bar switches it too.",
  },
];

export const PANEL_IPUCU: IkiDil = {
  tr: "Paneller araç çubuğunun sağındaki düğmelerle gizlenir, kenarlarından sürüklenerek büyür; boyutları hatırlanır.",
  en: "Hide the panels with the buttons at the right end of the toolbar and drag their edges to resize them. Their sizes are remembered.",
};

/** Ters tırnaklı metni parçalar, tırnak içleri tuş: "`N` ile ilerle" → [N (tuş), " ile ilerle"] */
export function parcala(metin: string): { yazi: string; tus: boolean }[] {
  return metin.split("`").map((yazi, i) => ({ yazi, tus: i % 2 === 1 })).filter((p) => p.yazi !== "");
}
