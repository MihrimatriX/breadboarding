// "CPU16 kartı 3D" bölümü: bütün bilgisayar tek sahnede (anakartın bütün kartları, kapı seviyesinde).
// Kart → çip → kapı → transistör; çipten çipe teller; VGA monitörü; assembly / C program düzenleyicisi.
// "8 bit hesap 3D" bölümü aynı görünümü kullanır: sahne, inceleme, çipin içi ve kurulum ortak; program,
// saat, VGA ve UART yerine hesap makinesinin ön paneli ("Hesap" sekmesi) gelir.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gateCmos } from "../../cpu16/board/inside";
import { cardTitle } from "../../cpu16/board/layout";
import { PASSIVES } from "../../cpu16/board/passives";
import type { Gate } from "../../cpu16/chips/logic";
import { breakCodes, makeCodes, textToScancodes } from "../../cpu16/emu/devices/keyboard";
import { disassemble } from "../../cpu16/emu/disasm";
import { useAyar } from "../ui/ayarlar";
import { ceviri, useDil, useT, type Cevir } from "../ui/ceviri";
import {
  AppHeader, Bayrak, Group, Meter, OdakDugmesi, PanelToggle, Section, Splitter, Tabs, TasmaMenusu, YanBolucu, duzenStili, heightShare, useLayout, usePaneller,
  type LayoutPrefs, type Shortcut, type TabDef,
} from "../ui/Shell";
import { Simge, type SimgeAdi } from "../ui/simgeler";
import { HataKutusu, Yukleniyor } from "../ui/Yukleniyor";
import { useYaziTipleri } from "../ui/yaziTipleri";
import { blokAdi, kartBasligi, parcaBasligi } from "./adlar";
import { aktifKart, aktifKartiSec, bbSahnesi, gorunumHazir, kartYerlesimi, type Gorunum, type KartTuru } from "./aktif";
import { kartOzeti } from "./ozet";
import { TelKarti } from "./BbKurulumPanel";
import { BoardScene } from "./BoardScene";
import { installHesapApi, useHesap } from "./hesap";
import { HesapMeters, HesapPanel } from "./HesapPanel";
import { KurulumPanel } from "./KurulumPanel";
import { useKurulum } from "./kurulum";
import { bbPano, bbSeciliTel, telKimligi, useBbKurulum } from "./bbKurulum";
import { useBolum } from "./bolum";
import { BolumEtiketi, BolumIpucuSatiri, BolumPanel, EtiketGrubu, EtiketMenuSecimi, parcaGrubu } from "./BolumPanel";
import { AnlatimPanel } from "./AnlatimPanel";
import { PinDiyagrami } from "./PinDiyagrami";
import { bolumMetni } from "../../cpu16/board/bolum-bilgi";
import { KodAlani } from "../cpu16/KodAlani";
import { CmosDiagram } from "./CmosDiagram";
import { InsideDiagram } from "./InsideDiagram";
import { LEVEL_NAME, hex4, levelOf, sayi } from "./levels";
import { MemoryInside } from "./MemoryInside";
import { PassiveInfo, PassiveTooltip } from "./PassiveInfo";
import { detectLanguage } from "./program";
import { screenCanvas, updateScreenCanvas } from "./screenCanvas";
import {
  EXAMPLES, SPEEDS, boardLayoutData, boardModel, currentLang, findPart, liveNets, netEnds, speedLabel, startBoardWorker, useKart, type LangMode, type WireMode,
} from "./store";
import { sinyalinDamarlari } from "./serit";
import { kartlaraGore, partLinks, type Endpoint } from "./wires";

const REG_NAMES = ["r0", "r1", "r2", "r3", "r4", "r5", "r6 sp", "r7 lr"];
const wireModes = (t: Cevir): { m: WireMode; label: string; title: string }[] => [
  { m: "yok", label: t("yok", "none"), title: t("Tel çizme", "Draw no wires") },
  { m: "secili", label: t("seçili çip", "selected chip"), title: t("Seçili çipin her pininden aynı netteki bütün pinlere tel", "A wire from each pin of the selected chip to every pin on the same net") },
  { m: "hepsi", label: t("hepsi", "all"), title: t("Bütün netler: her netin pinleri en kısa yoldan zincirlenir", "All nets: the pins of each net are chained along the shortest path") },
];

const fare = (t: Cevir): Shortcut[] => [
  { keys: t("Sürükle", "Drag"), what: t("Döndür", "Rotate") },
  { keys: t("Sağ tık", "Right-drag"), what: t("Kaydır", "Pan") },
  { keys: t("Tekerlek", "Wheel"), what: t("Yakınlaş / uzaklaş", "Zoom in / out") },
];

const ortakKisayollar = (t: Cevir): Shortcut[] => [
  { keys: "Esc", what: t("Seçimi kaldır (kapı → net → çip → bölüm)", "Clear the selection (gate → net → chip → region)") },
  { keys: "E", what: t("Etiketler: kapalı → bölümler → ayrıntılı", "Labels: off → regions → detailed") },
];

const tiklaKisayollari = (t: Cevir): Shortcut[] => [
  { keys: t("Tıkla", "Click"), what: t("Entegreyi seç: teller, bağlantılar, içi", "Select a chip: wires, connections, inside") },
  { keys: t("Etikete tıkla", "Click a label"), what: t("Bölümü seç: görevi, nasıl çalıştığı, çipleri", "Select a region: its job, how it works, its chips") },
];

const kisayollar = (t: Cevir): Shortcut[] => [
  { keys: t("Boşluk", "Space"), what: t("Çalıştır / duraklat", "Run / pause") },
  { keys: ".", what: t("1 saat çevrimi", "1 clock cycle") },
  { keys: "N", what: t("1 komut", "1 instruction") },
  ...ortakKisayollar(t),
  { keys: "Ctrl+Enter", what: t("Düzenleyicide: derleyip EEPROM'a yazar ve çalıştırır", "In the editor: compiles, writes to the EEPROM and runs") },
  ...tiklaKisayollari(t),
  ...fare(t),
];

const hesapKisayollari = (t: Cevir): Shortcut[] => [
  ...ortakKisayollar(t),
  ...tiklaKisayollari(t),
  { keys: t("Anahtara tıkla", "Click a switch"), what: t("3D'de DIP anahtarın beyaz düğmesi: biti değiştirir (ON = 1)", "The white knob of a DIP switch in 3D: flips the bit (ON = 1)") },
  { keys: t("Basılı tut", "Hold"), what: t("3D'de sarı LAMBA TESTİ butonu: bütün segmentler yanar", "The yellow LAMP TEST button in 3D: all segments light up") },
  ...fare(t),
];

/** Durum çubuğundaki canlı ölçümler */
function Meters() {
  const t = useT();
  const dil = useDil();
  const cycles = useKart((s) => s.cycles);
  const running = useKart((s) => s.running);
  const rate = useKart((s) => s.rate);
  const st = useKart((s) => s.state);
  return (
    <>
      <Meter label={t("Döngü", "Cycles")} ikincil>{sayi(cycles, dil)}</Meter>
      <Meter label={t("Hız", "Speed")}>{running ? `${sayi(Math.round(rate), dil)} Hz` : t("durdu", "stopped")}</Meter>
      <Meter label="PC" mono>{st ? hex4(st.pc) : "-"}</Meter>
      {st?.halted && <span className="bench-status s-halt">{st.fault ? t("HATA", "FAULT") : "HALT"}</span>}
    </>
  );
}

type GorunumSecenegi = { g: Gorunum; label: string; title: string };

/** Bilgisayarın görünümleri (seçim tarayıcıda saklanır) */
const cpuGorunumleri = (t: Cevir): GorunumSecenegi[] => [
  { g: "pcb", label: "PCB", title: t("Anakart ve kartlar: yeşil PCB'ler, pinden pine teller", "Motherboard and boards: green PCBs, pin-to-pin wires") },
  {
    g: "breadboard", label: "Breadboard",
    title: t(
      "Her kart kendi breadboard panosunda (7 pano, 149 board), aralarında 64 damarlı şerit kablo: delik delik kurulum",
      "Each board on its own breadboard panel (7 panels, 149 breadboards), joined by a 64-wire ribbon cable: built hole by hole",
    ),
  },
];

/** Görünüm seçimi (PCB / breadboard): iki kartta da aynı düğme grubu */
function GorunumGrubu({ secenekler }: { secenekler: GorunumSecenegi[] }) {
  const t = useT();
  const gorunum = useKart((s) => s.gorunum);
  return (
    <Group label={t("Görünüm", "View")}>
      <span className="tb-label">{t("Görünüm", "View")}</span>
      <span className="seg" role="group" aria-label={t("Görünüm", "View")}>
        {secenekler.map((x) => (
          <button key={x.g} className={gorunum === x.g ? "on" : ""} aria-pressed={gorunum === x.g} onClick={() => useKart.getState().setGorunum(x.g)} title={x.title}>{x.label}</button>
        ))}
      </span>
    </Group>
  );
}

function Toolbar() {
  const t = useT();
  const dil = useDil();
  // yalnız gereken alanlar: bütün depoyu seçmek araç çubuğunu her fare hareketinde (hover) ve saniyede
  // ~10 kez (tick) yeniden çizerdi
  const ready = useKart((x) => x.ready);
  const running = useKart((x) => x.running);
  const hz = useKart((x) => x.hz);
  const s = useKart.getState();
  return (
    <div className="toolbar">
      <GorunumGrubu secenekler={cpuGorunumleri(t)} />
      <Group label={t("Çalıştırma", "Run")}>
        <button className="primary" onClick={() => (running ? s.pause() : s.run())} disabled={!ready} title={t("Kısayol: Boşluk", "Shortcut: Space")}>
          <Simge ad={running ? "duraklat" : "oynat"} />
          {running ? t("Duraklat", "Pause") : t("Çalıştır", "Run")}
        </button>
        <button onClick={() => s.step("instr")} disabled={!ready} title={t("Bir komut · kısayol: N", "One instruction · shortcut: N")}><Simge ad="adim" />{t("1 komut", "1 instruction")}</button>
        <button onClick={s.reset} disabled={!ready} title={t("RESET butonu: program EEPROM'da kalır", "RESET button: the program stays in the EEPROM")}><Simge ad="sifirla" />{t("Sıfırla", "Reset")}</button>
      </Group>
      <Group label={t("Saat hızı", "Clock speed")}>
        <label className="speed">
          <span className="tb-label kisalir">{t("Saat", "Clock")}</span>
          <select value={hz} onChange={(e) => s.setHz(+e.target.value)} aria-label={t("Saat hızı", "Clock speed")}>
            {SPEEDS.map((x) => <option key={x} value={x}>{speedLabel(x, dil)}</option>)}
          </select>
        </label>
      </Group>
      <TellerGrubu />
      <EtiketGrubu />
      <Group label={t("Diğer", "More")}>
        <TasmaMenusu title={t("Diğer: saat çevrimi, besleme telleri", "More: clock cycle, power wires")}>
          <button onClick={() => s.step("cycle")} disabled={!ready} title={t("Bir saat çevrimi · kısayol: .", "One clock cycle · shortcut: .")}><Simge ad="yarim" />{t("1 saat çevrimi", "1 clock cycle")}</button>
          <BeslemeSecimi />
          <EtiketMenuSecimi />
        </TasmaMenusu>
      </Group>
    </div>
  );
}

/** Tel görünümü: yok / seçili çip / hepsi. Besleme (GND/VCC) telleri ⋯ menüsünde. */
function TellerGrubu() {
  const t = useT();
  const wires = useKart((s) => s.wires);
  const s = useKart.getState();
  return (
    <Group label={t("Teller", "Wires")} className="wires-ctl">
      <span className="tb-label">{t("Teller", "Wires")}</span>
      <span className="seg" role="group" aria-label={t("Teller", "Wires")}>
        {wireModes(t).map((w) => (
          <button key={w.m} className={wires === w.m ? "on" : ""} aria-pressed={wires === w.m} onClick={() => s.setWires(w.m)} title={w.title}>{w.label}</button>
        ))}
      </span>
    </Group>
  );
}

function BeslemeSecimi() {
  const t = useT();
  const power = useKart((s) => s.power);
  const metin = t("GND ve VCC tellerini de çiz", "Also draw the GND and VCC wires");
  return (
    <label className="chk" title={metin}>
      <input type="checkbox" checked={power} onChange={(e) => useKart.getState().setPower(e.target.checked)} /> {metin}
    </label>
  );
}

/** Hesap makinesinde kameranın gidebileceği yerler (yerleşimdeki blok adları) */
const kameraYerleri = (t: Cevir): { blok: string | null; label: string; title: string }[] => [
  { blok: null, label: t("Genel bakış", "Overview"), title: t("Bütün kart", "The whole board") },
  { blok: "Anahtarlar", label: t("Anahtarlar", "Switches"), title: t("A, B ve işlem DIP anahtarları, lamba testi butonu", "A, B and operation DIP switches, lamp test button") },
  { blok: "Gösterge", label: t("Göstergeler", "Displays"), title: t("15 hane: sürücüler, direnç dizileri ve göstergeler", "15 digits: drivers, resistor arrays and displays") },
];

/** Hesap makinesinin görünümleri */
const hesapGorunumleri = (t: Cevir): GorunumSecenegi[] => [
  { g: "breadboard", label: "Breadboard", title: t("60 breadboard, atlama telleri: gerçek kurulum (delik delik)", "60 breadboards, jumper wires: the real build (hole by hole)") },
  { g: "pcb", label: "PCB", title: t("Tek uzun yeşil kart, pinden pine teller", "One long green board, pin-to-pin wires") },
];

/** Hesap makinesinin araç çubuğu: saat ve program yok (devre birleşimsel) */
function HesapToolbar() {
  const t = useT();
  const odak = useKart((s) => s.odak?.blok);
  return (
    <div className="toolbar">
      <GorunumGrubu secenekler={hesapGorunumleri(t)} />
      <Group label={t("Kamera", "Camera")}>
        <span className="tb-label kisalir">{t("Kamera", "Camera")}</span>
        <span className="seg" role="group" aria-label={t("Kamera", "Camera")}>
          {kameraYerleri(t).map((k) => (
            <button key={k.blok ?? "genel"} className={odak === k.blok ? "on" : ""} aria-pressed={odak === k.blok} onClick={() => useKart.getState().focusBlock(k.blok)} title={k.title}>{k.label}</button>
          ))}
        </span>
      </Group>
      <TellerGrubu />
      <EtiketGrubu />
      <Group label={t("Diğer", "More")}>
        <TasmaMenusu title={t("Diğer: besleme telleri", "More: power wires")}>
          <BeslemeSecimi />
        </TasmaMenusu>
      </Group>
    </div>
  );
}

// ---------------------------------------------------------------- VGA monitörü

function VgaPanel() {
  const t = useT();
  const has = useKart((s) => s.has);
  const info = useKart((s) => s.screenInfo);
  const beam = useKart((s) => s.beam);
  const beamFrames = useKart((s) => s.beamFrames);
  const [open, setOpen] = useState(true);
  const [big, setBig] = useState(false);
  const [focused, setFocused] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !holder.current) return;
    const c = screenCanvas();
    holder.current.appendChild(c);
    let raf = 0;
    const loop = () => {
      updateScreenCanvas();
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      c.remove();
    };
  }, [open]);
  if (!open) {
    return <button className="vga-open" onClick={() => setOpen(true)}><Simge ad="genislet" />{t("VGA ekranını göster", "Show the VGA screen")}</button>;
  }
  const onKey = (e: React.KeyboardEvent, down: boolean) => {
    if (e.key === "Tab" || e.key === "F5" || e.key === "F12") return;
    e.preventDefault();
    e.stopPropagation();
    useKart.getState().sendKeys(down ? makeCodes(e.code) : breakCodes(e.code));
  };
  return (
    <div className={`vga-panel${focused ? " focused" : ""}${big ? " big" : ""}`}>
      <div className="vga-head">
        <h2>{t("VGA ekranı", "VGA screen")} <span className="hint-text">640 × 480</span></h2>
        <span className="vga-actions">
          <button className="link" onClick={() => setBig(!big)} title={big ? t("Ekranı küçült", "Make the screen smaller") : t("Ekranı büyüt", "Make the screen larger")}>
            {big ? t("küçük", "small") : t("büyük", "large")}
          </button>
          <button className="link" onClick={() => setOpen(false)} title={t("Ekranı gizle (sahnedeki monitör çalışmaya devam eder)", "Hide the screen (the monitor in the scene keeps running)")}>
            {t("gizle", "hide")}
          </button>
        </span>
      </div>
      <div
        ref={holder}
        className="vga-screen"
        tabIndex={0}
        role="img"
        aria-label={t("VGA ekranı. Tıklayıp yazınca tuşlar PS/2 klavyeden karta gider.", "VGA screen. Click it and type: the keys reach the board through the PS/2 keyboard.")}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => onKey(e, true)}
        onKeyUp={(e) => onKey(e, false)}
      />
      <div className="vga-foot">
        {has.beam && (
          <label
            className="chk"
            title={t(
              "Piksel saatinde VGA konnektörünün R, G, B, HSYNC ve VSYNC hatlarını örnekle: ışın ekranı yavaşça çizer",
              "Sample the R, G, B, HSYNC and VSYNC lines of the VGA connector at the pixel clock: the beam draws the screen slowly",
            )}
          >
            <input type="checkbox" checked={beam} onChange={(e) => useKart.getState().setBeam(e.target.checked)} /> {t("Işın modu", "Beam mode")}
          </label>
        )}
        {has.keyboard && (
          <span className={`kbd-state${focused ? " on" : ""}`}>
            {focused ? t("Klavye bağlı: yazdıkların PS/2'den gidiyor.", "Keyboard connected: what you type goes out over PS/2.") : t("Yazmak için ekrana tıkla.", "Click the screen to type.")}
          </span>
        )}
      </div>
      <p className="vga-note">
        {beam
          ? t(
            `Işın modu: ${beamFrames} kare. Görüntü VGA konnektörünün hatlarından (DAC dirençleri dahil) örnekleniyor.`,
            `Beam mode: ${beamFrames} frames. The image is sampled from the VGA connector lines (DAC resistors included).`,
          )
          : `${info || t("video kartı", "video board")} · ${t("VRAM ve karakter ROM'u kartın kendi bellek çiplerinden.", "VRAM and character ROM come from the board's own memory chips.")}`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- yan panel

function StatePanel() {
  const t = useT();
  const st = useKart((s) => s.state);
  const loaded = useKart((s) => s.loaded);
  if (!st) return null;
  return (
    <Section title={t("CPU durumu", "CPU state")} actions={<span className="hint-text">EEPROM: {loaded || "-"}</span>}>
      <div className="kahraman">
        <span className="k-ad">PC</span>
        <span className="k-deger">{hex4(st.pc)}</span>
        <span className="k-ek">{Number.isNaN(st.ir) ? t("IR tanımsız", "IR undefined") : disassemble(st.ir, (st.pc - 2) & 0xffff)}</span>
      </div>
      <div className="degerler" style={{ "--sutun": 4 } as React.CSSProperties}>
        {st.regs.map((v, i) => (
          <div key={i} className="deger"><span>{REG_NAMES[i]}</span><b>{hex4(v)}</b></div>
        ))}
        <div className="deger"><span>IR</span><b>{hex4(st.ir)}</b></div>
        <div className="deger"><span>{t("Adım", "Step")}</span><b>{st.step}</b></div>
      </div>
      <div className="pins" aria-label={t("Bayraklar", "Flags")}>
        {(["n", "z", "c", "v", "i"] as const).map((f) => <Bayrak key={f} ad={f} on={st[f]} />)}
      </div>
    </Section>
  );
}

function UartPanel() {
  const t = useT();
  const uart = useKart((s) => s.uart);
  const has = useKart((s) => s.has);
  const [line, setLine] = useState("");
  const pre = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (pre.current) pre.current.scrollTop = pre.current.scrollHeight;
  }, [uart]);
  return (
    <Section title="UART">
      <pre ref={pre} className="bench-uart kart-uart">
        {uart || (
          <span className="uart-bos">
            {t("Program UART_DATA'ya (0xFF00) yazınca karakterler burada görünür (printf de buraya).", "When the program writes to UART_DATA (0xFF00), the characters appear here (printf output too).")}
          </span>
        )}
      </pre>
      {has.uart && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            useKart.getState().sendUart(`${line}\r`);
            setLine("");
          }}
        >
          <input
            className="mono"
            value={line}
            onChange={(e) => setLine(e.target.value)}
            placeholder={t("karta gönder (CH340 → UART RX)", "send to the board (CH340 → UART RX)")}
            aria-label={t("UART'a gönderilecek metin", "Text to send to the UART")}
          />
          <button type="submit">{t("Gönder", "Send")}</button>
        </form>
      )}
    </Section>
  );
}

const endLabel = (e: Endpoint) => (e.kind === "chip" ? `${e.ref}.${e.name}` : `${e.ref}.${e.num}`);

/** Bir pinin satırı: numara, pin adı, seviye, net (tıklanır) ve uç sayısı; altında öbür uçlar düz yazı bağlantılar olarak */
function LinkRow({ num, name, net, others, self }: { num: number; name: string; net: number; others: Endpoint[]; self: string }) {
  const t = useT();
  const dil = useDil();
  const [open, setOpen] = useState(false);
  const selNet = useKart((s) => s.net);
  const { board } = boardModel();
  const lv = net < 0 ? 2 : levelOf(liveNets.values, net);
  // besleme bacaklarının öbür uçları (yüzlerce çip) liste olmaz: yalnız sayısı
  const besleme = net === 0 || net === 1;
  const limit = open ? others.length : 6;
  // aynı elemandaki başka bir pin (ör. birleşik girişler) de listede kalır
  return (
    <li className={`link-row${net === selNet && net >= 0 ? " sel" : ""}${besleme ? " besleme" : ""}`}>
      <div className="link-head">
        <i>{num}</i>
        <span className="pname">{name}</span>
        <b className={`lv l${lv}`} title={`${t("Seviye", "Level")}: ${LEVEL_NAME[lv]}`}>{LEVEL_NAME[lv]}</b>
        {net < 0 ? (
          <span className="hint-text">{t("bağlı değil", "not connected")}</span>
        ) : (
          <button className="link netname" onClick={() => useKart.getState().selectNet(net > 1 ? net : null)} title={t("Neti seç: 3D'de bütün pinleri birleşir", "Select the net: all its pins join up in 3D")}>
            {board.netName(net)}
          </button>
        )}
        {besleme ? (
          <span className="uc-sayi">{t("besleme", "power")}</span>
        ) : net >= 0 ? (
          <span className="uc-sayi">{t(`${sayi(others.length, dil)} uç`, `${sayi(others.length, dil)} ${others.length === 1 ? "end" : "ends"}`)}</span>
        ) : (
          <span />
        )}
      </div>
      {others.length > 0 && !besleme && (
        <div className="link-ends">
          {others.slice(0, limit).map((e, i) => (
            <button key={i} className={`end ${e.kind}`} onClick={() => e.ref !== self && useKart.getState().selectChip(e.ref)} title={t(`${e.part} · ${e.card} kartı`, `${e.part} · ${e.card} board`)}>
              {endLabel(e)}
            </button>
          ))}
          {others.length > 6 && (
            <button className="link" onClick={() => setOpen(!open)}>{open ? t("daha az", "show less") : t(`+${sayi(others.length - 6, dil)} daha`, `+${sayi(others.length - 6, dil)} more`)}</button>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Hiçbir parça seçili değilken: bilgisayarda kart kart, hesap makinesinde blok blok entegre ve pasif
 * sayıları (ozet.ts). Satıra tıklayınca kamera oraya gider; kartlar yalnız PCB görünümünde var.
 */
function KartGenelBakis() {
  const t = useT();
  const dil = useDil();
  const gorunum = useKart((s) => s.gorunum);
  const tur = aktifKart();
  const hesap = tur === "hesap";
  const ozet = useMemo(() => kartOzeti(kartYerlesimi(tur, "pcb"), hesap ? "blok" : "kart"), [tur, hesap]);
  const enCok = Math.max(1, ...ozet.satirlar.map((s) => s.entegre));
  const gidilir = hesap || gorunum === "pcb";
  const git = (ad: string) => (hesap ? useKart.getState().focusBlock(ad) : useKart.getState().focusBlock(null, ad));
  const entegre = (n: number) => t(`${sayi(n, dil)} entegre`, `${sayi(n, dil)} ${n === 1 ? "chip" : "chips"}`);
  const pasif = (n: number) => t(`${sayi(n, dil)} pasif`, `${sayi(n, dil)} ${n === 1 ? "passive" : "passives"}`);
  return (
    <div className="genel-bakis">
      <h3>{hesap ? t("Hesap makinesine genel bakış", "The calculator at a glance") : t("Bilgisayara genel bakış", "The computer at a glance")}</h3>
      <div className="degerler">
        <div className="deger">
          <span>{hesap ? t("Blok", "Blocks") : t("Kart", "Boards")}</span>
          <b>{sayi(ozet.satirlar.length, dil)}</b>
        </div>
        <div className="deger">
          <span>{t("Entegre", "Chips")}</span>
          <b>{sayi(ozet.entegre, dil)}</b>
        </div>
        <div className="deger">
          <span>{t("Pasif eleman", "Passives")}</span>
          <b>{sayi(ozet.pasif, dil)}</b>
        </div>
      </div>
      <ul className="ozet-liste">
        {ozet.satirlar.map((s) => {
          const ad = hesap ? blokAdi(s.ad, dil) : kartBasligi(s.ad, s.baslik, dil);
          const icerik = (
            <>
              <span className="ozet-ad">{ad}</span>
              <span className="ozet-sayi">
                {entegre(s.entegre)} · {pasif(s.pasif)}
              </span>
              <span className="ozet-cubuk" aria-hidden="true">
                <i style={{ width: `${(s.entegre / enCok) * 100}%` }} />
              </span>
            </>
          );
          return (
            <li key={s.ad}>
              {gidilir ? (
                <button className="ozet-satir" onClick={() => git(s.ad)} title={t("Kamerayı oraya götür", "Move the camera there")}>
                  {icerik}
                </button>
              ) : (
                <div className="ozet-satir">{icerik}</div>
              )}
            </li>
          );
        })}
      </ul>
      {!gidilir && <p className="hint-text">{t("Kartlara gitmek için PCB görünümüne geç.", "Switch to the PCB view to jump to a board.")}</p>}
    </div>
  );
}

function PartPanel() {
  const t = useT();
  const dil = useDil();
  const ref = useKart((s) => s.chip);
  useKart((s) => s.tick);
  const { board } = boardModel();
  const part = findPart(ref);
  const ci = part?.chip ? board.instance(part.chip.ref) : null;
  const transistors = useMemo(() => {
    if (!ci || ci.def.behavioral) return 0;
    let n = 0;
    for (let g = ci.gates[0]; g < ci.gates[1]; g++) n += gateCmos(board.c.gates[g] as Gate, (x) => board.netName(x)).transistors.length;
    return n;
  }, [ci, board]);
  const place = part?.chip ?? part?.passive ?? null;
  const links = useMemo(() => (place ? partLinks(place.ref, place.pins, netEnds()) : []), [place]);
  if (!place || !ref) {
    return (
      <section className="bos-durum">
        <span className="bos-simge" aria-hidden="true"><Simge ad="imlec" boyut={24} /></span>
        <h2>{t("Bir entegreye tıkla", "Click a chip")}</h2>
        <p>
          {t(
            "Sahnede bir çip ya da pasif eleman seç: telleri çizilir, bağlantıları burada ve içindeki kapılar alt panelde açılır.",
            "Pick a chip or a passive component in the scene: its wires are drawn, its connections open here and its gates open in the bottom panel.",
          )}
        </p>
        <p className="hint-text">
          {dil === "en" ? (
            <><b>Wires: all</b> in the toolbar shows the wiring of the whole {aktifKart() === "hesap" ? "calculator" : "computer"}.</>
          ) : (
            <>Araç çubuğundaki <b>Teller: hepsi</b> bütün {aktifKart() === "hesap" ? "hesap makinesinin" : "bilgisayarın"} kablolamasını gösterir.</>
          )}
        </p>
        <KartGenelBakis />
      </section>
    );
  }
  const lay = boardLayoutData();
  // breadboard'da kart çerçevesi yok: bilgisayarda kartın adı (panosu)
  const kartTr = lay.cards.find((c) => c.name === place.card)?.title ?? (aktifKart() === "cpu16" ? cardTitle(place.card) : place.card);
  const kartAdi = kartBasligi(place.card, kartTr, dil);
  const title = parcaBasligi(place.part, ci ? ci.def.title : PASSIVES[place.part]?.title ?? place.part, dil);
  // parçanın devredeki görevi: grubunun anlatımı (bolum-bilgi.ts); 100 nF'ların grubu yok
  const grup = parcaGrubu(place.ref);
  const grupMetni = grup && bolumMetni(grup, dil);
  return (
    <section>
      <div className="parca-bas">
        <div className="parca-ad">
          <h2>{place.ref}</h2>
          <span className="parca-no">{ci ? ci.def.part : place.part}</span>
        </div>
        <button className="link" onClick={() => useKart.getState().selectChip(null)} title={t("Kısayol: Esc", "Shortcut: Esc")}>{t("kapat", "close")}</button>
      </div>
      <p className="parca-baslik">{title}</p>
      {place.role && <p className="parca-gorev">{place.role}</p>}
      <div className="etiketler">
        <BolumEtiketi refName={place.ref} />
        <span className="etiket">{place.block ? blokAdi(place.block, dil) : t("Diğer", "Other")}</span>
        <span className="etiket">{kartAdi}</span>
        {ci && <span className="etiket">{ci.def.pkg}</span>}
        {ci && (
          <span className="etiket">
            {transistors ? t(`${sayi(transistors, dil)} transistör`, `${sayi(transistors, dil)} transistors`) : t("davranışsal bellek modeli", "behavioral memory model")}
          </span>
        )}
      </div>
      {grup && grupMetni && (
        <div className="bolum-blok parca-anlatim">
          <h3>{t("Devredeki görevi", "Its job in the circuit")}</h3>
          <p>
            <b>{grupMetni.baslik}.</b> {grupMetni.gorev}
          </p>
          <p className="bolum-nasil">{grupMetni.nasil}</p>
          <button className="link" onClick={() => useBolum.getState().sec(grup.id, true)}>
            {t("Grubun tamamını göster →", "Show the whole group →")}
          </button>
        </div>
      )}
      {ci && (
        <div className="bolum-blok">
          <h3>
            {t("Bacak düzeni", "Pinout")} <span className="hint-text">{t("üstten · bacağa tıkla: neti seç", "top view · click a pin to select its net")}</span>
          </h3>
          <PinDiyagrami refName={place.ref} part={ci.def.part} pins={place.pins} />
        </div>
      )}
      {part?.passive && <PassiveInfo p={part.passive} />}
      <div className="links-title">
        <h3>{t("Bağlantılar", "Connections")}</h3>
        <span className="hint-text">{t("pin · seviye · net · öbür uçlar", "pin · level · net · other ends")}</span>
      </div>
      <ul className="links">
        {links.map((l) => <LinkRow key={l.num} {...l} self={place.ref} />)}
      </ul>
    </section>
  );
}

function NetPanel() {
  const t = useT();
  const dil = useDil();
  const net = useKart((s) => s.net);
  useKart((s) => s.tick);
  const { board } = boardModel();
  if (net === null) return null;
  const ends = netEnds().get(net) ?? [];
  const lv = levelOf(liveNets.values, net);
  const n = sayi(ends.length, dil);
  // arka panel sinyaliyse: şerit kablonun (arka panelin) hangi damarı ve hangi kartlara gittiği
  const damarlar = aktifKart() === "cpu16" ? sinyalinDamarlari(board.netName(net)) : [];
  const kartlar = kartlaraGore(ends);
  return (
    <section>
      <div className="parca-bas">
        <div className="parca-ad">
          <span className="hint-text">Net</span>
          <h2 className="mono">{board.netName(net)}</h2>
          <b className={`lv l${lv}`}>{LEVEL_NAME[lv]}</b>
        </div>
        <button className="link" onClick={() => useKart.getState().selectNet(null)}>{t("kapat", "close")}</button>
      </div>
      <p className="parca-baslik">
        {t(`${n} uca bağlı; 3D'de bu pinler kalın tellerle birleşir.`, `Connected to ${n} ${ends.length === 1 ? "end" : "ends"}; in 3D thick wires join these pins.`)}
      </p>
      {damarlar.length > 0 && (
        <p className="parca-baslik">
          {t(`Arka panelin ${damarlar.join(", ")}. damarı (şerit kablo, 2 × 32 konnektör).`, `Backplane wire ${damarlar.join(", ")} (ribbon cable, 2 × 32 connector).`)}
        </p>
      )}
      {kartlar.length > 1 && (
        <p className="parca-baslik">
          {t("Kartlar: ", "Boards: ")}
          {kartlar.map((k, i) => (
            <span key={k.card}>
              {i > 0 && " · "}
              <b>{kartBasligi(k.card, cardTitle(k.card), dil)}</b> {sayi(k.n, dil)}
            </span>
          ))}
        </p>
      )}
      <ul className="tlist net-uclar">
        {ends.map((p, i) => (
          <li key={i}>
            <button className="link" onClick={() => useKart.getState().selectChip(p.ref)}>{p.ref}</button>
            <span>{p.kind === "chip" ? p.name : `pin ${p.num}`}</span>
            <code>{p.part}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Breadboard'da tıklanan tel: nereden → nereye (kurulum panelinin tel kartı) */
function TelPanel() {
  const t = useT();
  const tel = useKart((s) => s.tel);
  const p = tel && bbSahnesi().panolar.find((x) => x.kart === tel.kart);
  // tellerin no'su kurulum sırası: no = sıra + 1
  const bt = p && p.plan.teller[tel.no - 1];
  if (!bt) return null;
  return (
    <section>
      <div className="parca-bas">
        <div className="parca-ad">
          <span className="hint-text">{t("Tel", "Wire")}</span>
          <h2 className="mono">{telKimligi(bt.no)}</h2>
        </div>
        <button className="link" onClick={() => useKart.getState().selectTel(null)} title={t("Kısayol: Esc", "Shortcut: Esc")}>{t("kapat", "close")}</button>
      </div>
      <TelKarti p={p} t={bt} takildi={false} />
    </section>
  );
}

// ---------------------------------------------------------------- alt panel: program ve çipin içi

const LANG_MODES: LangMode[] = ["otomatik", "asm", "c"];

/** Düzenleyicinin denetimleri (örnek, dil, Derle, Yükle): alt panelin sekme satırında, sağda */
function EditorBar() {
  const t = useT();
  const dil = useDil();
  const example = useKart((x) => x.example);
  const source = useKart((x) => x.source);
  const langMode = useKart((x) => x.langMode);
  const ready = useKart((x) => x.ready);
  const s = useKart.getState();
  const lang = currentLang({ langMode, source });
  const detected = useMemo(() => detectLanguage(source), [source]);
  const modAdi = (m: LangMode) => (m === "otomatik" ? `${t("Otomatik", "Auto")} (${detected === "c" ? "C" : "asm"})` : m === "asm" ? "Assembly" : "C");
  return (
    <div className="editor-bar">
      <select value={example} onChange={(e) => s.loadExample(e.target.value)} aria-label={t("Örnek program", "Example program")}>
        {!EXAMPLES.some((x) => x.name === example) && <option value={example}>{example || t("örnek seç", "pick an example")}</option>}
        {EXAMPLES.map((x) => <option key={x.name} value={x.name}>{x.label[dil]}</option>)}
      </select>
      <span className="seg" role="group" aria-label={t("Dil", "Language")}>
        {LANG_MODES.map((m) => (
          <button key={m} className={langMode === m ? "on" : ""} aria-pressed={langMode === m} onClick={() => s.setLangMode(m)}>
            {modAdi(m)}
          </button>
        ))}
      </span>
      <button onClick={() => s.check()} title={lang === "c" ? t("cc16 (rom hedefi) ile derle", "Compile with cc16 (rom target)") : t("as16 ile derle", "Assemble with as16")}>{t("Derle", "Compile")}</button>
      <button className="primary" onClick={() => s.compileAndLoad(true)} disabled={!ready} title={t("Derle, EEPROM bank 0'a yaz, RESET ve çalıştır", "Compile, write to EEPROM bank 0, RESET and run")}>
        {t("Yükle ve çalıştır", "Load and run")}
      </button>
    </div>
  );
}

function Editor() {
  const t = useT();
  // yalnız düzenleyicinin alanları: bütün depo düzenleyiciyi her hover ve tick'te yeniden çizdirirdi
  const source = useKart((x) => x.source);
  const langMode = useKart((x) => x.langMode);
  const errors = useKart((x) => x.errors);
  const info = useKart((x) => x.info);
  const s = useKart.getState();
  const ta = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLPreElement>(null);
  const lang = currentLang({ langMode, source });
  const lines = useMemo(() => source.split("\n").length, [source]);
  const bad = useMemo(() => new Set(errors.map((e) => e.line)), [errors]);
  const gotoLine = (line: number) => {
    const ta0 = ta.current;
    if (!ta0 || line < 1) return;
    const parts = ta0.value.split("\n");
    const start = parts.slice(0, line - 1).reduce((a, l) => a + l.length + 1, 0);
    ta0.focus();
    ta0.setSelectionRange(start, start + (parts[line - 1]?.length ?? 0));
    const lh = parseFloat(getComputedStyle(ta0).lineHeight) || 18;
    ta0.scrollTop = Math.max(0, (line - 4) * lh);
  };
  return (
    <div className="editor">
      <div className="editor-body">
        <pre ref={gutter} className="gutter" aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => (
            <span key={i} className={bad.has(i + 1) ? "bad" : ""}>{i + 1}{"\n"}</span>
          ))}
        </pre>
        <KodAlani
          ref={ta}
          value={source}
          dil={lang}
          hataliSatirlar={errors.map((e) => e.line)}
          onChange={(e) => s.setSource(e.target.value)}
          onScroll={(e) => {
            if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
          }}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              const el = e.currentTarget;
              const a = el.selectionStart;
              const v = el.value;
              s.setSource(v.slice(0, a) + "  " + v.slice(el.selectionEnd));
              requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
            } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              s.compileAndLoad(true);
            }
          }}
          aria-label={`${t("Program kaynağı", "Program source")} (${lang === "c" ? "C" : "assembly"})`}
        />
        {errors.length > 0 && (
          <ul className="errors">
            {errors.map((e, i) => (
              <li key={i}>
                <button className="link" onClick={() => gotoLine(e.line)} disabled={!e.line}>
                  {e.file ? `${e.file}: ` : e.line ? t(`${e.line}. satır: `, `line ${e.line}: `) : ""}
                </button>{" "}
                {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className={`editor-status${errors.length ? " err" : ""}`} title={info} role="status">
        {info || t("Ctrl+Enter: yükle ve çalıştır · Tab: iki boşluk", "Ctrl+Enter: load and run · Tab: two spaces")}
      </p>
    </div>
  );
}

function Inside() {
  const t = useT();
  const chip = useKart((s) => s.chip);
  const gate = useKart((s) => s.gate);
  const [tab, setTab] = useState<"gates" | "fets">("gates");
  useEffect(() => setTab(gate !== null ? "fets" : "gates"), [gate]);
  const { board } = boardModel();
  const part = findPart(chip);
  if (!chip || !part) {
    return <p className="muted pad">{t("Sahnede bir entegreye tıkla; içi burada açılır: kapılar, transistörler ya da bellek hücreleri.", "Click a chip in the scene to open its inside here: gates, transistors or memory cells.")}</p>;
  }
  if (!part.chip) {
    const p = part.passive!;
    const ad = PASSIVES[p.part]?.title ?? p.part;
    const kullanim = PASSIVES[p.part]?.usage;
    return (
      <p className="muted pad">
        {t(
          `${p.ref} pasif bir elemandır (${ad}): simülasyonda karşılığı yok, bağlantıları yan panelde.`,
          `${p.ref} is a passive component (${ad}): it has no counterpart in the simulation; its connections are in the side panel.`,
        )}
        {kullanim ? ` ${t("Kullanım", "Use")}: ${kullanim}.` : ""}
      </p>
    );
  }
  const ci = board.instance(chip);
  const behavioral = !!ci.def.behavioral;
  return (
    <div className="analyzer">
      <div className="row between">
        <div className="seg" role="group" aria-label={t("Şema", "Diagram")}>
          <button className={tab === "gates" ? "on" : ""} aria-pressed={tab === "gates"} onClick={() => setTab("gates")}>
            {behavioral ? t("Bellek dizisi", "Memory array") : t("Kapılar", "Gates")} · {chip}
          </button>
          {!behavioral && (
            <button className={tab === "fets" ? "on" : ""} aria-pressed={tab === "fets"} onClick={() => setTab("fets")} disabled={gate === null}>
              {t("Transistörler", "Transistors")}{gate !== null ? ` · ${board.c.gates[gate].kind}` : ""}
            </button>
          )}
        </div>
        <span className="muted small">
          {behavioral ? (
            t("Davranışsal bellek: hücreler gerçek içerikten örnek pencere. Hücreye tıkla: transistör şeması.", "Behavioral memory: the cells are a sample window of the real contents. Click a cell for its transistor diagram.")
          ) : (
            <>
              <b className="lv l1">1</b> <b className="lv l0">0</b> <b className="lv l2">Z</b> <b className="lv l3">X</b> · {t("kapıya tıkla: transistörleri", "click a gate: its transistors")}
            </>
          )}
        </span>
      </div>
      <div className="inside-wrap">
        {behavioral ? <MemoryInside ci={ci} /> : tab === "gates" ? <InsideDiagram refName={chip} /> : gate !== null ? <CmosDiagram gate={gate} /> : null}
      </div>
    </div>
  );
}

/** Alt panel (sahnenin altında): seçili entegrenin içi. Program sol panelde. */
function Bottom() {
  const t = useT();
  const chip = useKart((s) => s.chip);
  const tabs: TabDef<"ic">[] = [
    {
      id: "ic",
      label: `${t("Çipin içi", "Inside the chip")}${chip ? ` · ${chip}` : ""}`,
      title: t("Seçili entegrenin kapıları, transistörleri ya da bellek hücreleri", "Gates, transistors or memory cells of the selected chip"),
    },
  ];
  return (
    <div className="bottom-tabs">
      <Tabs tabs={tabs} value="ic" onChange={() => {}} label={t("Alt panel", "Bottom panel")} />
      <div className="bottom-body" role="tabpanel"><Inside /></div>
    </div>
  );
}

// ---------------------------------------------------------------- yan panel: sekmeler

type SideTab = "program" | "inceleme" | "anlatim" | "cpu" | "kurulum" | "hesap";
/** Her kart türünün sol panelleri (aktivite çubuğunda bu sırayla); ilki varsayılan */
const SIDE_TABS: Record<KartTuru, SideTab[]> = { cpu16: ["program", "inceleme", "anlatim", "cpu", "kurulum"], hesap: ["hesap", "inceleme", "anlatim", "kurulum"] };

/** Sol panellerin adı, ipucu ve aktivite çubuğundaki simgesi. Yeni panel: buraya ve SIDE_TABS'a bir satır. */
const panelBilgisi = (t: Cevir): Record<SideTab, { ad: string; ipucu: string; simge: SimgeAdi }> => ({
  program: { ad: "Program", ipucu: t("Program: assembly / C yaz, derle, EEPROM'a yükle ve çalıştır", "Program: write assembly / C, compile, load into the EEPROM and run"), simge: "derle" },
  hesap: { ad: t("Hesap", "Calculator"), ipucu: t("Hesap: göstergeler, anahtarlar, işlem ve blokların şu an hesapladığı", "Calculator: displays, switches, operation and what each block computes right now"), simge: "hesap" },
  inceleme: { ad: t("İnceleme", "Inspect"), ipucu: t("İnceleme: seçili parça ya da net, görevi, bacak düzeni, bağlantılar", "Inspect: the selected part or net, its job, pinout, connections"), simge: "buyutec" },
  anlatim: { ad: t("Anlatım", "Tour"), ipucu: t("Anlatım: blok blok tur, her bloğun ne işe yaradığı (← →)", "Tour: block by block, what each block is for (← →)"), simge: "kitap" },
  cpu: { ad: t("CPU ve UART", "CPU and UART"), ipucu: t("CPU ve UART: register'lar, bayraklar, UART terminali", "CPU and UART: registers, flags, UART terminal"), simge: "cip" },
  kurulum: {
    ad: t("Kurulum", "Build"),
    ipucu: t("Kurulum: kartı gerçekte kurarken tel tel ilerle (kurulum belgesiyle aynı numaralar)", "Build: go wire by wire as you build the real board (same numbers as the build guide)"),
    simge: "kurulum",
  },
});

/**
 * VS Code'daki gibi aktivite çubuğu (en solda): her sol panelin simgesi. Simgeye basınca sol panel o
 * içeriğe döner; açık panelin simgesine yeniden basınca panel kapanır ve sahne bütün alanı alır. Dipte
 * alt panel (çipin içi) ve odak modu düğmeleri.
 */
function EtkinlikCubugu({ tab, acik, onSec, lay, setLay }: { tab: SideTab; acik: boolean; onSec: (x: SideTab) => void; lay: LayoutPrefs; setLay: (p: Partial<LayoutPrefs>) => void }) {
  const t = useT();
  const bilgi = panelBilgisi(t);
  return (
    <nav className="etkinlik" aria-label={t("Paneller", "Panels")}>
      {SIDE_TABS[aktifKart()].map((x) => (
        <button key={x} className="icon-btn" aria-pressed={acik && tab === x} aria-label={bilgi[x].ad} data-tip={bilgi[x].ipucu} onClick={() => onSec(x)}>
          <Simge ad={bilgi[x].simge} boyut={22} />
        </button>
      ))}
      <div className="etkinlik-alt">
        <PanelToggle which="bottom" open={lay.bottom} onToggle={() => setLay({ bottom: !lay.bottom })} ad={t("Çipin içi", "Inside the chip")} />
        <OdakDugmesi />
      </div>
    </nav>
  );
}

/**
 * Denetçi (inspector): seçili parçanın (entegre ya da pasif) veya netin ayrıntıları. Yeni ayrıntı
 * panelleri (ör. pasif eleman bilgisi) bu bölgeye eklenir.
 */
function Inspector() {
  const chip = useKart((s) => s.chip);
  const net = useKart((s) => s.net);
  const tel = useKart((s) => s.tel);
  const bolum = useBolum((s) => s.secili);
  return (
    <div className="inspector">
      {tel && <TelPanel />}
      {chip && <PartPanel />}
      {!chip && bolum && <BolumPanel key={bolum} />}
      {net !== null && <NetPanel />}
      {!tel && !chip && !bolum && net === null && <PartPanel />}
    </div>
  );
}

/** Sol panel: aktivite çubuğunda seçili içerik (program düzenleyicisi, inceleme, anlatım …) */
function SidePanel({ tab, onTab }: { tab: SideTab; onTab: (t: SideTab) => void }) {
  const t = useT();
  const chip = useKart((s) => s.chip);
  const net = useKart((s) => s.net);
  const tel = useKart((s) => s.tel);
  const bolum = useBolum((s) => s.secili);
  // bir parça, net, tel ya da bölüm seçilince ayrıntıları öne gelir; kod yazarken (Program) panel
  // değişmez (seçilen çipin içi alt panelde açılır), Anlatım'da bölüm seçmek turun adımıdır
  const sekme = useRef(tab);
  sekme.current = tab;
  useEffect(() => {
    if ((chip || net !== null || tel) && sekme.current !== "program") onTab("inceleme");
  }, [chip, net, tel]); // onTab her çizimde yeni; yalnız seçim değişince çalışsın
  useEffect(() => {
    if (bolum && sekme.current !== "anlatim" && sekme.current !== "program") onTab("inceleme");
  }, [bolum]);
  const bilgi = panelBilgisi(t)[tab];
  if (tab === "program") {
    return (
      <aside className="side sol" aria-label={bilgi.ad}>
        <div className="side-head">
          <h2>{bilgi.ad}</h2>
          <EditorBar />
        </div>
        <Editor />
      </aside>
    );
  }
  return (
    <aside className="side sol" aria-label={bilgi.ad}>
      <div className="side-head">
        <h2>{bilgi.ad}</h2>
      </div>
      <div className="side-body">
        {tab === "hesap" && <HesapPanel />}
        {tab === "inceleme" && <Inspector />}
        {tab === "anlatim" && <AnlatimPanel />}
        {tab === "cpu" && (
          <>
            <StatePanel />
            <UartPanel />
          </>
        )}
        {tab === "kurulum" && <KurulumPanel />}
      </div>
    </aside>
  );
}

function Tooltip() {
  const hover = useKart((s) => s.hover);
  if (!hover) return null;
  const part = findPart(hover.ref);
  if (!part) return null;
  const c = part.chip;
  const p = part.passive;
  return (
    <div className="tooltip" style={{ transform: `translate(${hover.x + 14}px, ${hover.y + 14}px)` }}>
      <b>{hover.ref}</b> {c ? c.part : p!.part} {c ? <span>{c.role}</span> : <PassiveTooltip p={p!} />}
      {hover.ek && <div className="tt-ek">{hover.ek}</div>}
      <BolumIpucuSatiri refName={hover.ref} />
    </div>
  );
}

/** Esc: seçimi geri al (kapı → tel → net → çip → bölüm) */
function secimiGeriAl() {
  const s = useKart.getState();
  if (s.gate !== null) s.selectGate(null);
  else if (s.tel !== null) s.selectTel(null);
  else if (s.net !== null) s.selectNet(null);
  else if (s.chip !== null || !useBolum.getState().secili) s.selectChip(null);
  else useBolum.getState().sec(null);
}

/**
 * 3D kart bölümü. Sahnedeki kart (bilgisayar ya da hesap makinesi) ilk çizimden önce seçilir: kart
 * türü modül düzeyinde tutulur (aktif.ts), store.ts'teki boardModel, findPart, liveNets vb. onu okur.
 * Seçim bir layout effect'te yapılır (çizim sırasında başka bileşenin durumu değişmesin diye); seçim
 * bitmeden hiçbir şey çizilmez, böylece sahne hiçbir zaman öbür kartın yapısıyla açılmaz.
 */
export function BoardView({ tur = "cpu16" }: { tur?: KartTuru }) {
  const [hazir, setHazir] = useState(() => aktifKart() === tur);
  useLayoutEffect(() => {
    aktifKartiSec(tur);
    setHazir(true);
  }, [tur]);
  if (!hazir || aktifKart() !== tur) return null;
  return tur === "hesap" ? <HesapGorunumu /> : <MakineGorunumu />;
}

/**
 * Bölümün iskeleti, VS Code gibi: en solda aktivite çubuğu (üstünde başlatıcı düğmesi), yanında sol
 * panel (bilgisayarda varsayılanı program düzenleyicisi), sağda bütün yüksekliğiyle sahne. Sahnenin
 * denetimleri (çalıştır, görünüm, teller …) sahnenin üstünde yüzer; seçili çipin içi sahnenin altında.
 */
function Iskelet({
  className, lay, setLay, header, toolbar, stage, bottomLabel, sideTab,
}: {
  className: string;
  lay: LayoutPrefs;
  setLay: (p: Partial<LayoutPrefs>) => void;
  header: React.ReactNode;
  toolbar: React.ReactNode;
  stage: React.ReactNode;
  bottomLabel: string;
  sideTab: SideTab;
}) {
  const t = useT();
  const panel = usePaneller(lay);
  const sec = (x: SideTab) => {
    // odak modunda basılan simge odak modundan çıkar ve o paneli açar
    if (useAyar.getState().odak) {
      useAyar.getState().odakSec(false);
      setLay({ side: true, sideTab: x });
    } else setLay(lay.side && x === sideTab ? { side: false } : { side: true, sideTab: x });
  };
  return (
    <div
      className={`app kart shell${className ? ` ${className}` : ""}`}
      data-side={panel.side ? "open" : "closed"}
      data-bottom={panel.bottom ? "open" : "closed"}
      style={duzenStili(lay)}
    >
      {header}
      <div className="workspace">
        <EtkinlikCubugu tab={sideTab} acik={panel.side} onSec={sec} lay={lay} setLay={setLay} />
        {panel.side && <SidePanel tab={sideTab} onTab={(x) => setLay({ sideTab: x })} />}
        {panel.side && <YanBolucu lay={lay} setLay={setLay} taraf="sol" />}
        <div className="center">
          <main className="stage">
            {toolbar}
            {stage}
          </main>
          {panel.bottom && (
            <>
              <Splitter value={lay.bottomH} onChange={(h) => setLay({ bottomH: h })} min={160} label={t("Alt panelin yüksekliği", "Height of the bottom panel")} />
              <section className="bottom" aria-label={bottomLabel}>
                <Bottom />
              </section>
            </>
          )}
        </div>
      </div>
      <Tooltip />
    </div>
  );
}

/** Yan sekme: kayıtlı sekme bu kart türünde yoksa varsayılan */
function yanSekme(tur: KartTuru, kayitli: string | undefined): SideTab {
  const liste = SIDE_TABS[tur];
  return liste.includes(kayitli as SideTab) ? (kayitli as SideTab) : liste[0];
}

/** "8 bit hesap 3D": hesap makinesi kartı; simülasyon ana iş parçacığında (hesap.ts) */
function HesapGorunumu() {
  const t = useT();
  const dil = useDil();
  // çip yazıları dokuya bir kez çizilir: sahne yazı tipleri hazır olunca açılır
  const yazi = useYaziTipleri();
  const hazir = useHesap((s) => s.hazir);
  const hata = useHesap((s) => s.hata);
  const chip = useKart((s) => s.chip);
  const [lay, setLay] = useLayout("hesap", { side: true, bottom: false, bottomH: heightShare(0.34, 240, 380), sideTab: "hesap" });
  const sideTab = yanSekme("hesap", lay.sideTab);
  const { board } = boardModel();
  const kisayolListesi = useMemo(() => hesapKisayollari(t), [t]);
  useEffect(() => {
    useHesap.getState().baslat();
    installHesapApi();
  }, []);
  // bir entegre seçilince alt panel (çipin içi) açılır
  useEffect(() => {
    if (chip && findPart(chip)?.chip && !lay.bottom) setLay({ bottom: true });
  }, [chip]); // yalnız seçim değişince
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === "Escape") secimiGeriAl();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const cipler = sayi(board.chips.length, dil);
  const pasifler = sayi(board.passives.length, dil);
  return (
    <Iskelet
      className="hesap"
      lay={lay}
      setLay={setLay}
      sideTab={sideTab}
      bottomLabel={t("Çipin içi", "Inside the chip")}
      header={
        <AppHeader
          mode="hesap"
          context={t(`8 bit hesap · ${cipler} entegre · ${pasifler} pasif`, `8-bit calculator · ${cipler} chips · ${pasifler} passives`)}
          meters={<HesapMeters />}
          shortcuts={kisayolListesi}
        />
      }
      toolbar={<HesapToolbar />}
      stage={
        <>
          {yazi && <BoardScene />}
          {hata ? (
            <HataKutusu baslik={t("Hesap makinesi kurulamadı", "Could not build the calculator")}>{hata}</HataKutusu>
          ) : !hazir ? (
            <Yukleniyor alt={t("kapı seviyesinde devre kuruluyor", "building the gate-level circuit")}>{t("Hesap makinesi kuruluyor…", "Building the calculator…")}</Yukleniyor>
          ) : (
            !yazi && <Yukleniyor>{t("3D sahne hazırlanıyor…", "Preparing the 3D scene…")}</Yukleniyor>
          )}
        </>
      }
    />
  );
}

/** "CPU16 kartı 3D": bütün bilgisayar; simülasyon worker'da */
function MakineGorunumu() {
  const t = useT();
  const dil = useDil();
  const yazi = useYaziTipleri();
  const ready = useKart((s) => s.ready);
  const error = useKart((s) => s.error);
  // breadboard görünümünün verisi ayrı parça: seçili görünüm breadboard'sa sahne veri gelince kurulur
  const gorunumYukleniyor = useKart((s) => s.gorunumYukleniyor);
  useKart((s) => s.gorunum);
  const sahneHazir = !gorunumYukleniyor && gorunumHazir();
  // sol panelde program düzenleyicisi açık; alt panel (çipin içi) kapalı, bir entegre seçilince açılır.
  // Anahtar yeni: eski düzende program alt paneldeydi, yan panel sağdaydı
  const [lay, setLay] = useLayout("kart-ide", { side: true, bottom: false, bottomH: heightShare(0.34, 240, 380), sideTab: "program" });
  const sideTab = yanSekme("cpu16", lay.sideTab);
  const { board } = boardModel();
  const chip = useKart((s) => s.chip);
  const kisayolListesi = useMemo(() => kisayollar(t), [t]);
  useEffect(() => {
    if (chip && findPart(chip)?.chip && !lay.bottom) setLay({ bottom: true });
  }, [chip]); // yalnız seçim değişince
  useEffect(() => {
    if (!gorunumHazir()) void useKart.getState().bbVerisiniYukle();
    startBoardWorker();
    installKartApi();
    // bölümden çıkınca simülasyon durur (worker ve kart durumu korunur)
    return () => useKart.getState().pause();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, .vga-screen")) return;
      const s = useKart.getState();
      if (e.key === " ") { e.preventDefault(); s.running ? s.pause() : s.run(); }
      else if (e.key === ".") s.step("cycle");
      else if (e.key === "n" || e.key === "N") s.step("instr");
      else if (e.key === "Escape") secimiGeriAl();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const cipler = sayi(board.chips.length, dil);
  const pasifler = sayi(board.passives.length, dil);
  return (
    <Iskelet
      className=""
      lay={lay}
      setLay={setLay}
      sideTab={sideTab}
      bottomLabel={t("Çipin içi", "Inside the chip")}
      header={
        <AppHeader
          mode="kart"
          context={t(`CPU16 bilgisayarı · ${cipler} entegre · ${pasifler} pasif`, `CPU16 computer · ${cipler} chips · ${pasifler} passives`)}
          meters={<Meters />}
          shortcuts={kisayolListesi}
        />
      }
      toolbar={<Toolbar />}
      stage={
        <>
          {yazi && sahneHazir && <BoardScene />}
          <VgaPanel />
          {error ? (
            <HataKutusu baslik={t("Simülasyon başlatılamadı", "The simulation could not start")}>{error}</HataKutusu>
          ) : !ready ? (
            <Yukleniyor alt={t("kartlar kapı seviyesinde kuruluyor, örnek program EEPROM'a yazılıyor", "building the boards at gate level, writing the example program to the EEPROM")}>
              {t("Bilgisayar kuruluyor…", "Building the computer…")}
            </Yukleniyor>
          ) : gorunumYukleniyor ? (
            <Yukleniyor alt={t("7 pano, 149 board, atlama telleri", "7 panels, 149 breadboards, jumper wires")}>{t("Breadboard panoları yükleniyor…", "Loading the breadboard panels…")}</Yukleniyor>
          ) : (
            !yazi && <Yukleniyor>{t("3D sahne hazırlanıyor…", "Preparing the 3D scene…")}</Yukleniyor>
          )}
        </>
      }
    />
  );
}

/** Tarayıcı konsolundan ve otomatik testlerden kullanım: kart.secCip("U12"), kart.yukle(kaynak) vb. */
function installKartApi() {
  const st = () => useKart.getState();
  const api = {
    durum: () => st().state,
    uart: () => st().uart,
    ekran: () => st().screenText,
    calistir: () => st().run(),
    duraklat: () => st().pause(),
    sifirla: () => st().reset(),
    adim: (mode: "cycle" | "instr" = "instr") => st().step(mode),
    hiz: (hz: number) => st().setHz(hz),
    /** ölçülen saat hızı (döngü/sn) ve döngü sayısı */
    olc: () => ({ hz: Math.round(st().rate), dongu: st().cycles }),
    ornekler: () => EXAMPLES.map((e) => e.name),
    /** örneği düzenleyiciye al, derle, EEPROM'a yaz ve çalıştır */
    ornek: (ad: string) => {
      st().loadExample(ad);
      return api.yukle();
    },
    program: (ad: string) => api.ornek(ad),
    /** kaynağı (verilmezse düzenleyicidekini) derle, EEPROM bank 0'a yaz, RESET ve çalıştır */
    yukle: (kaynak?: string, dil?: "asm" | "c") => {
      if (kaynak !== undefined) useKart.setState({ source: kaynak, example: "", langMode: dil ?? "otomatik" });
      const ok = st().compileAndLoad(true);
      return { ok, bilgi: st().info, hatalar: st().errors.map((e) => `${e.line}: ${e.message}`) };
    },
    teller: (mod: WireMode) => st().setWires(mod),
    besleme: (on: boolean) => st().setPower(on),
    isin: (on: boolean) => st().setBeam(on),
    /** klavyeden yaz (PS/2, ABD düzeni) */
    tus: (metin: string) => st().sendKeys(textToScancodes(metin)),
    uartGonder: (metin: string) => st().sendUart(metin),
    secCip: (ref: string | null) => st().selectChip(ref),
    secKapi: (g: number | null) => st().selectGate(g),
    secNet: (name: string | null) => st().selectNet(name === null ? null : boardModel().board.n(name)),
    cipler: () => boardModel().board.chips.map((c) => `${c.ref} ${c.def.part} · ${c.card} · ${c.role}`),
    pasifler: () => boardModel().board.passives.map((p) => `${p.ref} ${p.part} · ${p.card} · ${p.role}`),
    kartlar: () => boardLayoutData().cards.map((c) => `${c.name}: ${kartBasligi(c.name, c.title, useAyar.getState().dil)}`),
    /** bir elemanın pin pin bağlantıları */
    baglantilar: (ref: string) => {
      const part = findPart(ref);
      const place = part?.chip ?? part?.passive;
      if (!place) return [];
      const { board } = boardModel();
      const bagliDegil = ceviri("bağlı değil", "not connected");
      return partLinks(ref, place.pins, netEnds()).map((l) => `${l.num} ${l.name} → ${l.net < 0 ? bagliDegil : board.netName(l.net)} → ${l.others.map(endLabel).join(", ")}`);
    },
    /** kurulum modu: kart, odaktaki tel, takılan / toplam tel */
    kurulum: () => {
      const k = useKurulum.getState();
      return { kart: k.kart, acik: k.acik, secili: k.secili, takilan: k.yapilan.size, toplam: k.plan?.teller.length ?? 0 };
    },
    /** görünüm: "pcb" (varsayılan) ya da "breadboard"; verilmezse yalnız okur */
    gorunum: (g?: Gorunum) => {
      if (g) st().setGorunum(g);
      return st().gorunum;
    },
    /** breadboard kurulum modu: pano (verilirse seçilir), odaktaki tel (delikten deliğe), takılan / toplam */
    bbKurulum: (pano?: string, asama?: number | null) => {
      const k = useBbKurulum.getState();
      if (pano) k.panoSec(pano);
      if (asama !== undefined) useBbKurulum.getState().asamaSec(asama);
      const s = useBbKurulum.getState();
      const t = bbSeciliTel(s);
      const p = bbPano(s.pano);
      return { acik: s.acik, pano: s.pano, asama: s.asama, secili: t ? `${telKimligi(t.no)} ${p.tarif(t)}` : null, takilan: s.yapilan.size, toplam: p.plan.teller.length };
    },
    kapilar: (ref: string) => {
      const ci = boardModel().board.instance(ref);
      return Array.from({ length: ci.gates[1] - ci.gates[0] }, (_, i) => `${ci.gates[0] + i} ${boardModel().board.c.gates[ci.gates[0] + i].kind}`);
    },
  };
  (window as unknown as { kart: typeof api }).kart = api;
}
