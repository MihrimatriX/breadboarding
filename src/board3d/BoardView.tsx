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
import {
  AppHeader, Group, Meter, OdakDugmesi, PanelToggle, Section, Splitter, Tabs, TasmaMenusu, YanBolucu, duzenStili, heightShare, useLayout, usePaneller,
  type LayoutPrefs, type Shortcut, type TabDef,
} from "../ui/Shell";
import { Simge } from "../ui/simgeler";
import { HataKutusu, Yukleniyor } from "../ui/Yukleniyor";
import { useYaziTipleri } from "../ui/yaziTipleri";
import { aktifKart, aktifKartiSec, gorunumHazir, type Gorunum, type KartTuru } from "./aktif";
import { BoardScene } from "./BoardScene";
import { installHesapApi, useHesap } from "./hesap";
import { HesapMeters, HesapPanel } from "./HesapPanel";
import { KurulumPanel } from "./KurulumPanel";
import { useKurulum } from "./kurulum";
import { bbPano, bbSeciliTel, telKimligi, useBbKurulum } from "./bbKurulum";
import { useBolum } from "./bolum";
import { BolumEtiketi, BolumIpucuSatiri, BolumPanel, EtiketGrubu, EtiketMenuSecimi } from "./BolumPanel";
import { CmosDiagram } from "./CmosDiagram";
import { InsideDiagram } from "./InsideDiagram";
import { LEVEL_NAME, hex4, levelOf } from "./levels";
import { MemoryInside } from "./MemoryInside";
import { PassiveInfo, PassiveTooltip } from "./PassiveInfo";
import { detectLanguage } from "./program";
import { screenCanvas, updateScreenCanvas } from "./screenCanvas";
import {
  EXAMPLES, SPEEDS, boardLayoutData, boardModel, currentLang, findPart, liveNets, netEnds, startBoardWorker, useKart, type BottomTab, type LangMode, type WireMode,
} from "./store";
import { partLinks, type Endpoint } from "./wires";

const REG_NAMES = ["r0", "r1", "r2", "r3", "r4", "r5", "r6 sp", "r7 lr"];
const WIRE_MODES: { m: WireMode; label: string; title: string }[] = [
  { m: "yok", label: "yok", title: "Tel çizme" },
  { m: "secili", label: "seçili çip", title: "Seçili çipin her pininden aynı netteki bütün pinlere tel" },
  { m: "hepsi", label: "hepsi", title: "Bütün netler: her netin pinleri en kısa yoldan zincirlenir" },
];

const FARE: Shortcut[] = [
  { keys: "Sürükle", what: "Döndür" },
  { keys: "Sağ tık", what: "Kaydır" },
  { keys: "Tekerlek", what: "Yakınlaş / uzaklaş" },
];

const SHORTCUTS: Shortcut[] = [
  { keys: "Boşluk", what: "Çalıştır / duraklat" },
  { keys: ".", what: "1 saat çevrimi" },
  { keys: "N", what: "1 komut" },
  { keys: "Esc", what: "Seçimi kaldır (kapı → net → çip → bölüm)" },
  { keys: "E", what: "Etiketler: kapalı → bölümler → ayrıntılı" },
  { keys: "Ctrl+Enter", what: "Düzenleyicide: derleyip EEPROM'a yazar ve çalıştırır" },
  { keys: "Tıkla", what: "Entegreyi seç: teller, bağlantılar, içi" },
  { keys: "Etikete tıkla", what: "Bölümü seç: görevi, nasıl çalıştığı, çipleri" },
  ...FARE,
];

const HESAP_KISAYOLLARI: Shortcut[] = [
  { keys: "Esc", what: "Seçimi kaldır (kapı → net → çip → bölüm)" },
  { keys: "E", what: "Etiketler: kapalı → bölümler → ayrıntılı" },
  { keys: "Tıkla", what: "Entegreyi seç: teller, bağlantılar, içi" },
  { keys: "Etikete tıkla", what: "Bölümü seç: görevi, nasıl çalıştığı, çipleri" },
  { keys: "Anahtara tıkla", what: "3D'de DIP anahtarın beyaz düğmesi: biti değiştirir (ON = 1)" },
  { keys: "Basılı tut", what: "3D'de sarı LAMBA TESTİ butonu: bütün segmentler yanar" },
  ...FARE,
];

/** Üst çubuktaki canlı ölçümler */
function Meters() {
  const cycles = useKart((s) => s.cycles);
  const running = useKart((s) => s.running);
  const rate = useKart((s) => s.rate);
  const st = useKart((s) => s.state);
  return (
    <>
      <Meter label="Döngü" ikincil>{cycles.toLocaleString("tr-TR")}</Meter>
      <Meter label="Hız">{running ? `${Math.round(rate).toLocaleString("tr-TR")} Hz` : "durdu"}</Meter>
      <Meter label="PC" mono>{st ? hex4(st.pc) : "-"}</Meter>
      {st?.halted && <span className="bench-status s-halt">{st.fault ? "HATA" : "HALT"}</span>}
    </>
  );
}

/** Bilgisayarın görünümleri (seçim tarayıcıda saklanır) */
const CPU_GORUNUMLERI: { g: Gorunum; label: string; title: string }[] = [
  { g: "pcb", label: "PCB", title: "Anakart ve kartlar: yeşil PCB'ler, pinden pine teller" },
  { g: "breadboard", label: "Breadboard", title: "Her kart kendi breadboard panosunda (7 pano, 134 board), aralarında 64 damarlı şerit kablo: delik delik kurulum" },
];

/** Görünüm seçimi (PCB / breadboard): iki kartta da aynı düğme grubu */
function GorunumGrubu({ secenekler }: { secenekler: { g: Gorunum; label: string; title: string }[] }) {
  const gorunum = useKart((s) => s.gorunum);
  return (
    <Group label="Görünüm">
      <span className="tb-label">Görünüm</span>
      <span className="seg" role="group" aria-label="Görünüm">
        {secenekler.map((x) => (
          <button key={x.g} className={gorunum === x.g ? "on" : ""} aria-pressed={gorunum === x.g} onClick={() => useKart.getState().setGorunum(x.g)} title={x.title}>{x.label}</button>
        ))}
      </span>
    </Group>
  );
}

function Toolbar({ lay, setLay }: { lay: LayoutPrefs; setLay: (p: Partial<LayoutPrefs>) => void }) {
  const s = useKart();
  return (
    <div className="toolbar">
      <GorunumGrubu secenekler={CPU_GORUNUMLERI} />
      <Group label="Çalıştırma">
        <button className="primary" onClick={() => (s.running ? s.pause() : s.run())} disabled={!s.ready} title="Kısayol: Boşluk">
          <Simge ad={s.running ? "duraklat" : "oynat"} />
          {s.running ? "Duraklat" : "Çalıştır"}
        </button>
        <button onClick={() => s.step("instr")} disabled={!s.ready} title="Bir komut · kısayol: N"><Simge ad="adim" />1 komut</button>
        <button onClick={s.reset} disabled={!s.ready} title="RESET butonu: program EEPROM'da kalır"><Simge ad="sifirla" />Sıfırla</button>
      </Group>
      <Group label="Saat hızı">
        <label className="speed">
          <span className="tb-label kisalir">Saat</span>
          <select value={s.hz} onChange={(e) => s.setHz(+e.target.value)} aria-label="Saat hızı">
            {SPEEDS.map((x) => <option key={x.hz} value={x.hz}>{x.label}</option>)}
          </select>
        </label>
      </Group>
      <TellerGrubu />
      <EtiketGrubu />
      <Group label="Diğer">
        <TasmaMenusu title="Diğer: saat çevrimi, besleme telleri">
          <button onClick={() => s.step("cycle")} disabled={!s.ready} title="Bir saat çevrimi · kısayol: ."><Simge ad="yarim" />1 saat çevrimi</button>
          <BeslemeSecimi />
          <EtiketMenuSecimi />
        </TasmaMenusu>
      </Group>
      <PanelGrubu lay={lay} setLay={setLay} />
    </div>
  );
}

/** Tel görünümü: yok / seçili çip / hepsi. Besleme (GND/VCC) telleri ⋯ menüsünde. */
function TellerGrubu() {
  const wires = useKart((s) => s.wires);
  const s = useKart.getState();
  return (
    <Group label="Teller" className="wires-ctl">
      <span className="tb-label">Teller</span>
      <span className="seg" role="group" aria-label="Teller">
        {WIRE_MODES.map((w) => (
          <button key={w.m} className={wires === w.m ? "on" : ""} aria-pressed={wires === w.m} onClick={() => s.setWires(w.m)} title={w.title}>{w.label}</button>
        ))}
      </span>
    </Group>
  );
}

function BeslemeSecimi() {
  const power = useKart((s) => s.power);
  return (
    <label className="chk" title="GND ve VCC tellerini de çiz">
      <input type="checkbox" checked={power} onChange={(e) => useKart.getState().setPower(e.target.checked)} /> GND ve VCC tellerini de çiz
    </label>
  );
}

function PanelGrubu({ lay, setLay }: { lay: LayoutPrefs; setLay: (p: Partial<LayoutPrefs>) => void }) {
  return (
    <Group label="Paneller" className="tb-end">
      <PanelToggle which="bottom" open={lay.bottom} onToggle={() => setLay({ bottom: !lay.bottom })} ad={aktifKart() === "hesap" ? "Çipin içi" : "Program ve çipin içi"} />
      <PanelToggle which="side" open={lay.side} onToggle={() => setLay({ side: !lay.side })} />
      <OdakDugmesi />
    </Group>
  );
}

/** Hesap makinesinde kameranın gidebileceği yerler (yerleşimdeki blok adları) */
const KAMERA_YERLERI: { blok: string | null; label: string; title: string }[] = [
  { blok: null, label: "Genel bakış", title: "Bütün kart" },
  { blok: "Anahtarlar", label: "Anahtarlar", title: "A, B ve işlem DIP anahtarları, lamba testi butonu" },
  { blok: "Gösterge", label: "Göstergeler", title: "15 hane: sürücüler, direnç dizileri ve göstergeler" },
];

/** Hesap makinesinin görünümleri */
const GORUNUMLER: { g: Gorunum; label: string; title: string }[] = [
  { g: "breadboard", label: "Breadboard", title: "60 breadboard, atlama telleri: gerçek kurulum (delik delik)" },
  { g: "pcb", label: "PCB", title: "Tek uzun yeşil kart, pinden pine teller" },
];

/** Hesap makinesinin araç çubuğu: saat ve program yok (devre birleşimsel) */
function HesapToolbar({ lay, setLay }: { lay: LayoutPrefs; setLay: (p: Partial<LayoutPrefs>) => void }) {
  const odak = useKart((s) => s.odak?.blok);
  return (
    <div className="toolbar">
      <GorunumGrubu secenekler={GORUNUMLER} />
      <Group label="Kamera">
        <span className="tb-label kisalir">Kamera</span>
        <span className="seg" role="group" aria-label="Kamera">
          {KAMERA_YERLERI.map((k) => (
            <button key={k.label} className={odak === k.blok ? "on" : ""} onClick={() => useKart.getState().focusBlock(k.blok)} title={k.title}>{k.label}</button>
          ))}
        </span>
      </Group>
      <TellerGrubu />
      <EtiketGrubu />
      <Group label="Diğer">
        <TasmaMenusu title="Diğer: besleme telleri">
          <BeslemeSecimi />
        </TasmaMenusu>
      </Group>
      <PanelGrubu lay={lay} setLay={setLay} />
    </div>
  );
}

// ---------------------------------------------------------------- VGA monitörü

function VgaPanel() {
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
    return <button className="vga-open" onClick={() => setOpen(true)}><Simge ad="genislet" />VGA ekranını göster</button>;
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
        <h2>VGA ekranı <span className="hint-text">640 × 480</span></h2>
        <span className="vga-actions">
          <button className="link" onClick={() => setBig(!big)} title={big ? "Ekranı küçült" : "Ekranı büyüt"}>{big ? "küçük" : "büyük"}</button>
          <button className="link" onClick={() => setOpen(false)} title="Ekranı gizle (sahnedeki monitör çalışmaya devam eder)">gizle</button>
        </span>
      </div>
      <div
        ref={holder}
        className="vga-screen"
        tabIndex={0}
        role="img"
        aria-label="VGA ekranı. Tıklayıp yazınca tuşlar PS/2 klavyeden karta gider."
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => onKey(e, true)}
        onKeyUp={(e) => onKey(e, false)}
      />
      <div className="vga-foot">
        {has.beam && (
          <label className="chk" title="Piksel saatinde VGA konnektörünün R, G, B, HSYNC ve VSYNC hatlarını örnekle: ışın ekranı yavaşça çizer">
            <input type="checkbox" checked={beam} onChange={(e) => useKart.getState().setBeam(e.target.checked)} /> Işın modu
          </label>
        )}
        {has.keyboard && <span className={`kbd-state${focused ? " on" : ""}`}>{focused ? "Klavye bağlı: yazdıkların PS/2'den gidiyor." : "Yazmak için ekrana tıkla."}</span>}
      </div>
      <p className="vga-note">
        {beam
          ? `Işın modu: ${beamFrames} kare. Görüntü VGA konnektörünün hatlarından (DAC dirençleri dahil) örnekleniyor.`
          : `${info || "video kartı"} · VRAM ve karakter ROM'u kartın kendi bellek çiplerinden.`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- yan panel

function StatePanel() {
  const st = useKart((s) => s.state);
  const loaded = useKart((s) => s.loaded);
  if (!st) return null;
  return (
    <Section title="CPU durumu" actions={<span className="hint-text">EEPROM: {loaded || "-"}</span>}>
      <div className="kahraman">
        <span className="k-ad">PC</span>
        <span className="k-deger">{hex4(st.pc)}</span>
        <span className="k-ek">{Number.isNaN(st.ir) ? "IR tanımsız" : disassemble(st.ir, (st.pc - 2) & 0xffff)}</span>
      </div>
      <div className="degerler" style={{ "--sutun": 4 } as React.CSSProperties}>
        {st.regs.map((v, i) => (
          <div key={i} className="deger"><span>{REG_NAMES[i]}</span><b>{hex4(v)}</b></div>
        ))}
        <div className="deger"><span>IR</span><b>{hex4(st.ir)}</b></div>
        <div className="deger"><span>Adım</span><b>{st.step}</b></div>
      </div>
      <div className="pins" aria-label="Bayraklar">
        {(["n", "z", "c", "v", "i"] as const).map((f) => <span key={f} className={`pin ${st[f] ? "on" : ""}`}>{f.toUpperCase()}</span>)}
      </div>
    </Section>
  );
}

function UartPanel() {
  const uart = useKart((s) => s.uart);
  const has = useKart((s) => s.has);
  const [line, setLine] = useState("");
  const pre = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (pre.current) pre.current.scrollTop = pre.current.scrollHeight;
  }, [uart]);
  return (
    <Section title="UART">
      <pre ref={pre} className="bench-uart kart-uart">{uart || <span className="uart-bos">Program UART_DATA'ya (0xFF00) yazınca karakterler burada görünür (printf de buraya).</span>}</pre>
      {has.uart && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            useKart.getState().sendUart(`${line}\r`);
            setLine("");
          }}
        >
          <input className="mono" value={line} onChange={(e) => setLine(e.target.value)} placeholder="karta gönder (CH340 → UART RX)" aria-label="UART'a gönderilecek metin" />
          <button type="submit">Gönder</button>
        </form>
      )}
    </Section>
  );
}

const endLabel = (e: Endpoint) => (e.kind === "chip" ? `${e.ref}.${e.name}` : `${e.ref}.${e.num}`);

/** Bir pinin satırı: numara, pin adı, seviye, net (tıklanır) ve uç sayısı; altında öbür uçlar düz yazı bağlantılar olarak */
function LinkRow({ num, name, net, others, self }: { num: number; name: string; net: number; others: Endpoint[]; self: string }) {
  const [open, setOpen] = useState(false);
  const selNet = useKart((s) => s.net);
  const { board } = boardModel();
  const lv = net < 0 ? 2 : levelOf(liveNets.values, net);
  const limit = open ? others.length : 6;
  // aynı elemandaki başka bir pin (ör. birleşik girişler) de listede kalır
  return (
    <li className={`link-row${net === selNet && net >= 0 ? " sel" : ""}`}>
      <div className="link-head">
        <i>{num}</i>
        <span className="pname">{name}</span>
        <b className={`lv l${lv}`} title={`Seviye: ${LEVEL_NAME[lv]}`}>{LEVEL_NAME[lv]}</b>
        {net < 0 ? (
          <span className="hint-text">bağlı değil</span>
        ) : (
          <button className="link netname" onClick={() => useKart.getState().selectNet(net > 1 ? net : null)} title="Neti seç: 3D'de bütün pinleri birleşir">
            {board.netName(net)}
          </button>
        )}
        {net >= 0 ? <span className="uc-sayi">{others.length.toLocaleString("tr-TR")} uç</span> : <span />}
      </div>
      {others.length > 0 && (
        <div className="link-ends">
          {others.slice(0, limit).map((e, i) => (
            <button key={i} className={`end ${e.kind}`} onClick={() => e.ref !== self && useKart.getState().selectChip(e.ref)} title={`${e.part} · ${e.card} kartı`}>
              {endLabel(e)}
            </button>
          ))}
          {others.length > 6 && (
            <button className="link" onClick={() => setOpen(!open)}>{open ? "daha az" : `+${(others.length - 6).toLocaleString("tr-TR")} daha`}</button>
          )}
        </div>
      )}
    </li>
  );
}

function PartPanel() {
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
        <h2>Bir entegreye tıkla</h2>
        <p>Sahnede bir çip ya da pasif eleman seç: telleri çizilir, bağlantıları burada ve içindeki kapılar alt panelde açılır.</p>
        <p className="hint-text">
          Araç çubuğundaki <b>Teller: hepsi</b> bütün {aktifKart() === "hesap" ? "hesap makinesinin" : "bilgisayarın"} kablolamasını gösterir.
        </p>
      </section>
    );
  }
  const lay = boardLayoutData();
  // breadboard'da kart çerçevesi yok: bilgisayarda kartın adı (panosu)
  const kartAdi = lay.cards.find((c) => c.name === place.card)?.title ?? (aktifKart() === "cpu16" ? cardTitle(place.card) : place.card);
  const title = ci ? ci.def.title : PASSIVES[place.part]?.title ?? place.part;
  return (
    <section>
      <div className="parca-bas">
        <div className="parca-ad">
          <h2>{place.ref}</h2>
          <span className="parca-no">{ci ? ci.def.part : place.part}</span>
        </div>
        <button className="link" onClick={() => useKart.getState().selectChip(null)} title="Kısayol: Esc">kapat</button>
      </div>
      <p className="parca-baslik">{title}</p>
      {place.role && <p className="parca-gorev">{place.role}</p>}
      <div className="etiketler">
        <BolumEtiketi refName={place.ref} />
        <span className="etiket">{place.block || "Diğer"}</span>
        <span className="etiket">{kartAdi}</span>
        {ci && <span className="etiket">{ci.def.pkg}</span>}
        {ci && <span className="etiket">{transistors ? `${transistors.toLocaleString("tr-TR")} transistör` : "davranışsal bellek modeli"}</span>}
      </div>
      {part?.passive && <PassiveInfo p={part.passive} />}
      <div className="links-title">
        <h3>Bağlantılar</h3>
        <span className="hint-text">pin · seviye · net · öbür uçlar</span>
      </div>
      <ul className="links">
        {links.map((l) => <LinkRow key={l.num} {...l} self={place.ref} />)}
      </ul>
    </section>
  );
}

function NetPanel() {
  const net = useKart((s) => s.net);
  useKart((s) => s.tick);
  const { board } = boardModel();
  if (net === null) return null;
  const ends = netEnds().get(net) ?? [];
  const lv = levelOf(liveNets.values, net);
  return (
    <section>
      <div className="parca-bas">
        <div className="parca-ad">
          <span className="hint-text">Net</span>
          <h2 className="mono">{board.netName(net)}</h2>
          <b className={`lv l${lv}`}>{LEVEL_NAME[lv]}</b>
        </div>
        <button className="link" onClick={() => useKart.getState().selectNet(null)}>kapat</button>
      </div>
      <p className="parca-baslik">{ends.length.toLocaleString("tr-TR")} uca bağlı; 3D'de bu pinler kalın tellerle birleşir.</p>
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

// ---------------------------------------------------------------- alt panel: program ve çipin içi

const LANG_MODES: { m: LangMode; label: string }[] = [
  { m: "otomatik", label: "Otomatik" },
  { m: "asm", label: "Assembly" },
  { m: "c", label: "C" },
];

function Editor() {
  const s = useKart();
  const ta = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLPreElement>(null);
  const lang = currentLang(s);
  const detected = useMemo(() => detectLanguage(s.source), [s.source]);
  const lines = useMemo(() => s.source.split("\n").length, [s.source]);
  const bad = useMemo(() => new Set(s.errors.map((e) => e.line)), [s.errors]);
  const gotoLine = (line: number) => {
    const t = ta.current;
    if (!t || line < 1) return;
    const parts = t.value.split("\n");
    const start = parts.slice(0, line - 1).reduce((a, l) => a + l.length + 1, 0);
    t.focus();
    t.setSelectionRange(start, start + (parts[line - 1]?.length ?? 0));
    const lh = parseFloat(getComputedStyle(t).lineHeight) || 18;
    t.scrollTop = Math.max(0, (line - 4) * lh);
  };
  return (
    <div className="editor">
      <div className="row wrap editor-bar">
        <select value={s.example} onChange={(e) => s.loadExample(e.target.value)} aria-label="Örnek program">
          {!EXAMPLES.some((x) => x.name === s.example) && <option value={s.example}>{s.example || "örnek seç"}</option>}
          {EXAMPLES.map((x) => <option key={x.name} value={x.name}>{x.label}</option>)}
        </select>
        <span className="seg" role="group" aria-label="Dil">
          {LANG_MODES.map((x) => (
            <button key={x.m} className={s.langMode === x.m ? "on" : ""} onClick={() => s.setLangMode(x.m)}>
              {x.m === "otomatik" ? `Otomatik (${detected === "c" ? "C" : "asm"})` : x.label}
            </button>
          ))}
        </span>
        <button onClick={() => s.check()} title={lang === "c" ? "cc16 (rom hedefi) ile derle" : "as16 ile derle"}>Derle</button>
        <button className="primary" onClick={() => s.compileAndLoad(true)} disabled={!s.ready} title="Derle, EEPROM bank 0'a yaz, RESET ve çalıştır">
          Yükle ve çalıştır
        </button>
      </div>
      <div className="editor-body">
        <pre ref={gutter} className="gutter" aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => (
            <span key={i} className={bad.has(i + 1) ? "bad" : ""}>{i + 1}{"\n"}</span>
          ))}
        </pre>
        <textarea
          ref={ta}
          value={s.source}
          spellCheck={false}
          onChange={(e) => s.setSource(e.target.value)}
          onScroll={(e) => {
            if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
          }}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              const t = e.currentTarget;
              const a = t.selectionStart;
              const v = t.value;
              s.setSource(v.slice(0, a) + "  " + v.slice(t.selectionEnd));
              requestAnimationFrame(() => t.setSelectionRange(a + 2, a + 2));
            } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              s.compileAndLoad(true);
            }
          }}
          aria-label={`Program kaynağı (${lang === "c" ? "C" : "assembly"})`}
        />
        {s.errors.length > 0 && (
          <ul className="errors">
            {s.errors.map((e, i) => (
              <li key={i}>
                <button className="link" onClick={() => gotoLine(e.line)} disabled={!e.line}>
                  {e.file ? `${e.file}: ` : e.line ? `${e.line}. satır: ` : ""}
                </button>{" "}
                {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className={`editor-status${s.errors.length ? " err" : ""}`} title={s.info} role="status">
        {s.info || "Ctrl+Enter: yükle ve çalıştır · Tab: iki boşluk"}
      </p>
    </div>
  );
}

function Inside() {
  const chip = useKart((s) => s.chip);
  const gate = useKart((s) => s.gate);
  const [tab, setTab] = useState<"gates" | "fets">("gates");
  useEffect(() => setTab(gate !== null ? "fets" : "gates"), [gate]);
  const { board } = boardModel();
  const part = findPart(chip);
  if (!chip || !part) return <p className="muted pad">Sahnede bir entegreye tıkla; içi burada açılır: kapılar, transistörler ya da bellek hücreleri.</p>;
  if (!part.chip) {
    const p = part.passive!;
    return (
      <p className="muted pad">
        {p.ref} pasif bir elemandır ({PASSIVES[p.part]?.title ?? p.part}): simülasyonda karşılığı yok, bağlantıları yan panelde.
        {PASSIVES[p.part]?.usage ? ` Kullanım: ${PASSIVES[p.part]!.usage}.` : ""}
      </p>
    );
  }
  const ci = board.instance(chip);
  const behavioral = !!ci.def.behavioral;
  return (
    <div className="analyzer">
      <div className="row between">
        <div className="seg">
          <button className={tab === "gates" ? "on" : ""} onClick={() => setTab("gates")}>{behavioral ? "Bellek dizisi" : "Kapılar"} · {chip}</button>
          {!behavioral && (
            <button className={tab === "fets" ? "on" : ""} onClick={() => setTab("fets")} disabled={gate === null}>
              Transistörler{gate !== null ? ` · ${board.c.gates[gate].kind}` : ""}
            </button>
          )}
        </div>
        <span className="muted small">
          {behavioral ? (
            "Davranışsal bellek: hücreler gerçek içerikten örnek pencere. Hücreye tıkla: transistör şeması."
          ) : (
            <>
              <b className="lv l1">1</b> <b className="lv l0">0</b> <b className="lv l2">Z</b> <b className="lv l3">X</b> · kapıya tıkla: transistörleri
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

/** Alt panel: sekmeler bir diziden gelir; yeni bir alt sekme (ör. "Kurulum") için diziye bir öğe eklenir. */
function Bottom() {
  const secili = useKart((s) => s.bottom);
  const chip = useKart((s) => s.chip);
  // hesap makinesinde program yok: yalnız çipin içi
  const program = aktifKart() === "cpu16";
  const tab: BottomTab = program ? secili : "ic";
  const tabs: TabDef<BottomTab>[] = [
    ...(program ? [{ id: "program" as const, label: "Program", title: "Assembly / C düzenleyicisi" }] : []),
    { id: "ic", label: `Çipin içi${chip ? ` · ${chip}` : ""}`, title: "Seçili entegrenin kapıları, transistörleri ya da bellek hücreleri" },
  ];
  return (
    <div className="bottom-tabs">
      <Tabs tabs={tabs} value={tab} onChange={(t) => useKart.getState().setBottom(t)} label="Alt panel" />
      <div className="bottom-body" role="tabpanel">{tab === "program" ? <Editor /> : <Inside />}</div>
    </div>
  );
}

// ---------------------------------------------------------------- yan panel: sekmeler

type SideTab = "inceleme" | "cpu" | "kurulum" | "hesap";
/** Her kart türünün yan sekmeleri; ilki varsayılan */
const SIDE_TABS: Record<KartTuru, SideTab[]> = { cpu16: ["inceleme", "cpu", "kurulum"], hesap: ["hesap", "inceleme", "kurulum"] };

/**
 * Denetçi (inspector): seçili parçanın (entegre ya da pasif) veya netin ayrıntıları. Yeni ayrıntı
 * panelleri (ör. pasif eleman bilgisi) bu bölgeye eklenir.
 */
function Inspector() {
  const chip = useKart((s) => s.chip);
  const net = useKart((s) => s.net);
  const bolum = useBolum((s) => s.secili);
  return (
    <div className="inspector">
      {chip && <PartPanel />}
      {!chip && bolum && <BolumPanel key={bolum} />}
      {net !== null && <NetPanel />}
      {!chip && !bolum && net === null && <PartPanel />}
    </div>
  );
}

function SidePanel({ tab, onTab }: { tab: SideTab; onTab: (t: SideTab) => void }) {
  const chip = useKart((s) => s.chip);
  const net = useKart((s) => s.net);
  const bolum = useBolum((s) => s.secili);
  // bir parça, net ya da bölüm seçilince ayrıntıları öne gelir
  useEffect(() => {
    if (chip || net !== null || bolum) onTab("inceleme");
  }, [chip, net, bolum]); // onTab her çizimde yeni; yalnız seçim değişince çalışsın
  // Yeni yan panel sekmeleri (ör. "Kurulum") bu listeye ve SIDE_TABS'a eklenir.
  const tumu: Record<SideTab, TabDef<SideTab>> = {
    hesap: { id: "hesap", label: "Hesap", title: "Göstergeler, anahtarlar, işlem ve blokların şu an hesapladığı" },
    inceleme: { id: "inceleme", label: chip ? `İnceleme · ${chip}` : "İnceleme", title: "Seçili parça ya da net: bağlantılar" },
    cpu: { id: "cpu", label: "CPU ve UART", title: "Register'lar, bayraklar, UART terminali" },
    kurulum: { id: "kurulum", label: "Kurulum", title: "Kartı gerçekte kurarken tel tel ilerle (yazdırılan kurulum belgesiyle aynı numaralar)" },
  };
  const tabs = SIDE_TABS[aktifKart()].map((t) => tumu[t]);
  return (
    <aside className="side" aria-label="Yan panel">
      <Tabs tabs={tabs} value={tab} onChange={onTab} label="Yan panel" />
      <div className="side-body" role="tabpanel">
        {tab === "hesap" && <HesapPanel />}
        {tab === "inceleme" && <Inspector />}
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

/** Esc: seçimi geri al (kapı → net → çip → bölüm) */
function secimiGeriAl() {
  const s = useKart.getState();
  if (s.gate !== null) s.selectGate(null);
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

/** Bölümün iskeleti: üst çubuk, araç çubuğu, sahne, alt panel (çipin içi), yan panel */
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
  const panel = usePaneller(lay);
  return (
    <div
      className={`app kart shell${className ? ` ${className}` : ""}`}
      data-side={panel.side ? "open" : "closed"}
      data-bottom={panel.bottom ? "open" : "closed"}
      style={duzenStili(lay)}
    >
      {header}
      {toolbar}
      <div className="workspace">
        <div className="center">
          <main className="stage">{stage}</main>
          {panel.bottom && (
            <>
              <Splitter value={lay.bottomH} onChange={(h) => setLay({ bottomH: h })} min={160} label="Alt panelin yüksekliği" />
              <section className="bottom" aria-label={bottomLabel}>
                <Bottom />
              </section>
            </>
          )}
        </div>
        {panel.side && <YanBolucu lay={lay} setLay={setLay} />}
        {panel.side && <SidePanel tab={sideTab} onTab={(t) => setLay({ sideTab: t })} />}
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
  // çip yazıları dokuya bir kez çizilir: sahne yazı tipleri hazır olunca açılır
  const yazi = useYaziTipleri();
  const hazir = useHesap((s) => s.hazir);
  const hata = useHesap((s) => s.hata);
  const chip = useKart((s) => s.chip);
  const [lay, setLay] = useLayout("hesap", { side: true, bottom: false, bottomH: heightShare(0.34, 240, 380), sideTab: "hesap" });
  const sideTab = yanSekme("hesap", lay.sideTab);
  const { board } = boardModel();
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
  return (
    <Iskelet
      className="hesap"
      lay={lay}
      setLay={setLay}
      sideTab={sideTab}
      bottomLabel="Çipin içi"
      header={
        <AppHeader
          mode="hesap"
          context={`8 bit hesap · ${board.chips.length} entegre · ${board.passives.length} pasif`}
          meters={<HesapMeters />}
          shortcuts={HESAP_KISAYOLLARI}
        />
      }
      toolbar={<HesapToolbar lay={lay} setLay={setLay} />}
      stage={
        <>
          {yazi && <BoardScene />}
          {hata ? (
            <HataKutusu baslik="Hesap makinesi kurulamadı">{hata}</HataKutusu>
          ) : !hazir ? (
            <Yukleniyor alt="kapı seviyesinde devre kuruluyor">Hesap makinesi kuruluyor…</Yukleniyor>
          ) : (
            !yazi && <Yukleniyor>3D sahne hazırlanıyor…</Yukleniyor>
          )}
        </>
      }
    />
  );
}

/** "CPU16 kartı 3D": bütün bilgisayar; simülasyon worker'da */
function MakineGorunumu() {
  const yazi = useYaziTipleri();
  const ready = useKart((s) => s.ready);
  const error = useKart((s) => s.error);
  // breadboard görünümünün verisi ayrı parça: seçili görünüm breadboard'sa sahne veri gelince kurulur
  const gorunumYukleniyor = useKart((s) => s.gorunumYukleniyor);
  useKart((s) => s.gorunum);
  const sahneHazir = !gorunumYukleniyor && gorunumHazir();
  // alt panel (program ve çipin içi) ilk açılışta kapalı: bir entegre seçilince açılır
  const [lay, setLay] = useLayout("kart", { side: true, bottom: false, bottomH: heightShare(0.34, 240, 380), sideTab: "inceleme" });
  const sideTab = yanSekme("cpu16", lay.sideTab);
  const { board } = boardModel();
  const chip = useKart((s) => s.chip);
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
  return (
    <Iskelet
      className=""
      lay={lay}
      setLay={setLay}
      sideTab={sideTab}
      bottomLabel="Program ve çipin içi"
      header={
        <AppHeader
          mode="kart"
          context={`CPU16 bilgisayarı · ${board.chips.length} entegre · ${board.passives.length} pasif`}
          meters={<Meters />}
          shortcuts={SHORTCUTS}
        />
      }
      toolbar={<Toolbar lay={lay} setLay={setLay} />}
      stage={
        <>
          {yazi && sahneHazir && <BoardScene />}
          <VgaPanel />
          {error ? (
            <HataKutusu baslik="Simülasyon başlatılamadı">{error}</HataKutusu>
          ) : !ready ? (
            <Yukleniyor alt="kartlar kapı seviyesinde kuruluyor, örnek program EEPROM'a yazılıyor">Bilgisayar kuruluyor…</Yukleniyor>
          ) : gorunumYukleniyor ? (
            <Yukleniyor alt="7 pano, 134 board, atlama telleri">Breadboard panoları yükleniyor…</Yukleniyor>
          ) : (
            !yazi && <Yukleniyor>3D sahne hazırlanıyor…</Yukleniyor>
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
    kartlar: () => boardLayoutData().cards.map((c) => `${c.name}: ${c.title}`),
    /** bir elemanın pin pin bağlantıları */
    baglantilar: (ref: string) => {
      const part = findPart(ref);
      const place = part?.chip ?? part?.passive;
      if (!place) return [];
      const { board } = boardModel();
      return partLinks(ref, place.pins, netEnds()).map((l) => `${l.num} ${l.name} → ${l.net < 0 ? "bağlı değil" : board.netName(l.net)} → ${l.others.map(endLabel).join(", ")}`);
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
