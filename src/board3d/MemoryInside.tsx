// Davranışsal bellek çipinin (SRAM, Flash, EEPROM) içi: adres → satır kod çözücüsü → hücre dizisi →
// sütun seçici → okuma yükselteçleri / G/Ç tamponları → veri pinleri. Hücre dizisi gerçek içerikten
// örnek bir penceredir (o an adres pinlerindeki adresin çevresi); seçili satır (word line) ve sütun
// canlı vurgulanır. Bir hücreye tıklayınca altında hücrenin transistör şeması açılır: SRAM'de 6T
// hücre, Flash / EEPROM'da yüzer kapılı transistör.

import { useMemo, useState } from "react";
import type { ChipInstance } from "../../cpu16/board/board";
import { LEVEL_VAR, levelOf } from "./levels";
import { colWindow, memGeometry, rowWindow, type MemGeometry } from "./memview";
import { liveMem, liveNets, useKart } from "./store";

const CELL = 11;
const hex = (v: number, n: number) => v.toString(16).toUpperCase().padStart(n, "0");

function PinColumn({ ci, names, x, y, gap = 13, anchor = "end" }: { ci: ChipInstance; names: string[]; x: number; y: number; gap?: number; anchor?: "start" | "end" }) {
  const v = liveNets.values;
  return (
    <g>
      {names.map((n, i) => {
        const net = ci.nets[n];
        const lv = net === undefined ? 2 : levelOf(v, net);
        return (
          <g key={n} className="ipin" onClick={() => net !== undefined && net > 1 && useKart.getState().selectNet(net)}>
            <rect x={x - 4} y={y + i * gap - 4} width={8} height={8} style={{ fill: LEVEL_VAR[lv] }} />
            <text x={anchor === "end" ? x - 8 : x + 8} y={y + i * gap + 4} textAnchor={anchor}>{n}</text>
          </g>
        );
      })}
    </g>
  );
}

/** 6T SRAM hücresi: iki çapraz bağlı evirici (M1–M4) ve iki erişim transistörü (M5, M6) */
function SramCell({ bit, wl }: { bit: number; wl: boolean }) {
  const q = { stroke: bit ? LEVEL_VAR[1] : LEVEL_VAR[0] };
  const qn = { stroke: bit ? LEVEL_VAR[0] : LEVEL_VAR[1] };
  const acc = { stroke: wl ? "var(--sema-acik)" : "var(--sema-kapali)" };
  const wlc = { stroke: wl ? LEVEL_VAR[1] : LEVEL_VAR[0] };
  return (
    <svg className="cell-svg" viewBox="0 0 360 170" width={360} height={170} role="img" aria-label="6T SRAM hücresi">
      <line x1={20} x2={20} y1={10} y2={160} className="sema-cizgi" strokeWidth={2} />
      <text x={24} y={20}>BL</text>
      <line x1={340} x2={340} y1={10} y2={160} className="sema-cizgi" strokeWidth={2} />
      <text x={300} y={20}>BL̅</text>
      <line x1={20} x2={340} y1={150} y2={150} style={wlc} strokeWidth={2} />
      <text x={150} y={165}>WL (word line) = {wl ? 1 : 0}</text>
      {/* erişim transistörleri */}
      <line x1={20} x2={90} y1={90} y2={90} style={acc} strokeWidth={2} strokeDasharray={wl ? undefined : "4 3"} />
      <line x1={270} x2={340} y1={90} y2={90} style={acc} strokeWidth={2} strokeDasharray={wl ? undefined : "4 3"} />
      <line x1={55} x2={55} y1={96} y2={150} style={wlc} />
      <line x1={305} x2={305} y1={96} y2={150} style={wlc} />
      <text x={40} y={84}>M5</text>
      <text x={292} y={84}>M6</text>
      {/* çapraz bağlı eviriciler */}
      <line x1={90} x2={130} y1={90} y2={90} style={q} strokeWidth={3} />
      <line x1={230} x2={270} y1={90} y2={90} style={qn} strokeWidth={3} />
      <path d="M130 60 L170 75 L130 90 Z" className="sema-govde" />
      <circle cx={174} cy={75} r={4} className="sema-govde" />
      <path d="M230 120 L190 105 L230 90 Z" className="sema-govde" />
      <circle cx={186} cy={105} r={4} className="sema-govde" />
      <polyline points="178,75 230,75 230,90" fill="none" style={qn} strokeWidth={2} />
      <polyline points="182,105 130,105 130,90" fill="none" style={q} strokeWidth={2} />
      <text x={100} y={60}>M1/M2</text>
      <text x={196} y={140}>M3/M4</text>
      <text x={96} y={112} className="big">Q={bit}</text>
      <text x={236} y={112} className="big">Q̅={bit ? 0 : 1}</text>
    </svg>
  );
}

/** Yüzer kapılı hücre (Flash / EEPROM): yüzer kapıda yük var = programlanmış = 0 */
function FlashCell({ bit, wl }: { bit: number; wl: boolean }) {
  const charged = bit === 0;
  const conducts = wl && !charged;
  return (
    <svg className="cell-svg" viewBox="0 0 360 170" width={360} height={170} role="img" aria-label="Yüzer kapılı bellek hücresi">
      <line x1={40} x2={320} y1={130} y2={130} style={{ stroke: "var(--sema-soluk)" }} strokeWidth={10} />
      <text x={44} y={155}>kaynak (n+)</text>
      <text x={250} y={155}>akaç (n+) → BL</text>
      <rect x={110} y={84} width={140} height={14} className="sema-cizgi" style={{ fill: charged ? "#ffcc33" : "var(--sema-bos)" }} />
      <text x={258} y={95}>yüzer kapı</text>
      <rect x={110} y={50} width={140} height={14} className="sema-cizgi" style={{ fill: wl ? LEVEL_VAR[1] : LEVEL_VAR[0] }} />
      <text x={258} y={61}>kontrol kapısı = WL ({wl ? 1 : 0})</text>
      {charged && Array.from({ length: 7 }, (_, i) => <circle key={i} cx={122 + i * 19} cy={91} r={3} fill="#1b1f25" />)}
      <line x1={110} x2={250} y1={118} y2={118} style={{ stroke: conducts ? "var(--sema-acik)" : "var(--sema-kapali)" }} strokeWidth={3} strokeDasharray={conducts ? undefined : "5 4"} />
      <text x={20} y={24} className="big">{charged ? "programlanmış: yüzer kapıda elektron var → eşik yüksek → 0" : "silinmiş: yüzer kapı boş → okumada iletir → 1"}</text>
    </svg>
  );
}

function ArrayView({ ci, g }: { ci: ChipInstance; g: MemGeometry }) {
  useKart((s) => s.tick);
  const [cell, setCell] = useState<{ addr: number; bit: number } | null>(null);
  const win = liveMem.window && liveMem.window.ref === ci.ref ? liveMem.window : null;
  const v = liveNets.values;
  const addr = win ? (win.addr >= 0 ? win.addr : -1) : -1;
  const shown = addr >= 0 ? addr : win ? win.first * g.bytesPerRow : 0;
  const rw = rowWindow(shown, g);
  const cw = colWindow(shown, g);
  const byteAt = (row: number, col: number) => {
    if (!win || row < win.first || row >= win.first + win.rows) return null;
    return win.bytes[(row - win.first) * g.bytesPerRow + col];
  };
  const ce = ci.nets["~CE"];
  const oe = ci.nets["~OE"];
  const we = ci.nets["~WE"];
  const lvl = (n: number | undefined) => (n === undefined ? 0 : levelOf(v, n));
  const selected = ce !== undefined && lvl(ce) === 0;
  const writing = selected && lvl(we) === 0;
  const reading = selected && !writing && lvl(oe) === 0;
  const mode = writing ? "YAZMA" : reading ? "OKUMA" : selected ? "seçili, çıkış kapalı" : "seçili değil (~CE = 1)";

  const rowAddrPins = g.addrPins.slice(g.colBits);
  const colAddrPins = g.addrPins.slice(0, g.colBits);
  // yerleşim
  const x0 = 70;
  const decX = x0 + 30;
  const arrX = decX + 120;
  const arrY = 30;
  const bitsW = cw.count * 8;
  const width = arrX + bitsW * CELL + 200;
  const height = Math.max(arrY + rw.count * CELL + 130, 30 + g.addrPins.length * 13);
  const activeRow = addr >= 0 ? addr >> g.colBits : -1;
  const activeCol = addr >= 0 ? addr & (g.bytesPerRow - 1) : -1;
  const sel = cell ? { row: cell.addr >> g.colBits, col: cell.addr & (g.bytesPerRow - 1) } : null;
  const selByte = sel ? byteAt(sel.row, sel.col) : null;

  return (
    <div className="mem-inside">
      <p className="muted small">
        {ci.def.part}: {g.size.toLocaleString("tr-TR")} × {g.dataPins.length} bit · dizi {g.rows.toLocaleString("tr-TR")} satır × {g.bytesPerRow * 8} sütun
        ({g.rowBits} satır adres biti, {g.colBits} sütun adres biti) · şu an: <b>{mode}</b>
        {addr >= 0 ? <> · adres <b>{hex(addr, Math.ceil(g.addrBits / 4))}</b> (satır {activeRow}, bayt {activeCol})</> : " · adres pinlerinde X/Z"}
        {" "}· pencere: {rw.count} satır × {cw.count} bayt
      </p>
      <div className="row wrap" style={{ alignItems: "flex-start" }}>
        <svg className="inside-svg mem-svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`${ci.ref} bellek dizisi`}>
          <text x={4} y={14} className="sel">satır adresi</text>
          <PinColumn ci={ci} names={rowAddrPins} x={x0} y={26} />
          <text x={4} y={34 + rowAddrPins.length * 13} className="sel">sütun adresi</text>
          <PinColumn ci={ci} names={colAddrPins} x={x0} y={46 + rowAddrPins.length * 13} />
          {/* satır kod çözücüsü */}
          <rect x={decX} y={arrY - 6} width={70} height={rw.count * CELL + 12} className="sema-govde" />
          <text x={decX + 35} y={arrY - 12} textAnchor="middle">satır çözücü</text>
          <text x={decX + 35} y={arrY + (rw.count * CELL) / 2} textAnchor="middle" className="glabel">{g.rowBits} → {g.rows}</text>
          {Array.from({ length: rw.count }, (_, i) => {
            const row = rw.first + i;
            const on = row === activeRow && selected;
            const y = arrY + i * CELL + CELL / 2;
            return (
              <g key={row}>
                <line x1={decX + 70} x2={arrX + bitsW * CELL} y1={y} y2={y} style={{ stroke: on ? LEVEL_VAR[1] : "var(--sema-bos)" }} strokeWidth={on ? 2 : 1} pointerEvents="none" />
                <text x={arrX - 4} y={y + 3} textAnchor="end" className={on ? "sel" : ""}>{hex(row, Math.ceil(g.rowBits / 4))}</text>
              </g>
            );
          })}
          {/* hücreler */}
          {Array.from({ length: rw.count }, (_, i) => {
            const row = rw.first + i;
            return Array.from({ length: cw.count }, (_, j) => {
              const col = cw.first + j;
              const b = byteAt(row, col);
              return Array.from({ length: 8 }, (_, k) => {
                const bit = b === null ? -1 : (b >> (7 - k)) & 1;
                const x = arrX + (j * 8 + k) * CELL;
                const y = arrY + i * CELL;
                const hot = row === activeRow && col === activeCol;
                const picked = sel && sel.row === row && sel.col === col && cell?.bit === 7 - k;
                return (
                  <rect
                    key={`${row}.${col}.${k}`}
                    x={x + 1}
                    y={y + 1}
                    width={CELL - 2}
                    height={CELL - 2}
                    style={{
                      fill: bit < 0 ? "var(--sema-bos)" : bit ? "var(--lv1)" : "var(--lv0)",
                      fillOpacity: bit > 0 ? 0.85 : 1,
                      stroke: picked ? "var(--sema-secili)" : hot ? "var(--lv3)" : "none",
                    }}
                    strokeWidth={picked ? 1.6 : 1}
                    className="cell"
                    onClick={() => setCell({ addr: (row << g.colBits) | col, bit: 7 - k })}
                  >
                    <title>{`satır ${row}, bayt ${col}, bit ${7 - k} = ${bit < 0 ? "?" : bit} (adres ${hex((row << g.colBits) | col, Math.ceil(g.addrBits / 4))})`}</title>
                  </rect>
                );
              });
            });
          })}
          {Array.from({ length: cw.count }, (_, j) => (
            <text key={j} x={arrX + (j * 8 + 4) * CELL} y={arrY - 6} textAnchor="middle" className={cw.first + j === activeCol ? "sel" : ""}>
              bayt {cw.first + j}
            </text>
          ))}
          {/* sütun seçici, okuma yükselteçleri, G/Ç */}
          {(() => {
            const yMux = arrY + rw.count * CELL + 14;
            const w = bitsW * CELL;
            const colOn = activeCol >= cw.first && activeCol < cw.first + cw.count;
            return (
              <g>
                {colOn && Array.from({ length: 8 }, (_, k) => {
                  const x = arrX + ((activeCol - cw.first) * 8 + k) * CELL + CELL / 2;
                  // hücrelerin üstünden geçer: tıklamayı hücreye bıraksın
                  return <line key={k} x1={x} x2={x} y1={arrY} y2={yMux} style={{ stroke: LEVEL_VAR[1] }} strokeOpacity={selected ? 0.8 : 0.25} pointerEvents="none" />;
                })}
                <rect x={arrX} y={yMux} width={w} height={20} className="sema-govde" />
                <text x={arrX + w / 2} y={yMux + 14} textAnchor="middle">sütun seçici {g.bytesPerRow} : 1 (bit başına)</text>
                <rect x={arrX} y={yMux + 30} width={w} height={20} className="sema-govde" />
                <text x={arrX + w / 2} y={yMux + 44} textAnchor="middle">{writing ? "yazma sürücüleri" : "okuma yükselteçleri (sense amp)"} · G/Ç tamponu</text>
                {g.dataPins.map((n, i) => {
                  const net = ci.nets[n];
                  const lv = net === undefined ? 2 : levelOf(v, net);
                  const x = arrX + 10 + i * Math.max(28, w / g.dataPins.length);
                  return (
                    <g key={n} className="ipin" onClick={() => net !== undefined && net > 1 && useKart.getState().selectNet(net)}>
                      <rect x={x - 4} y={yMux + 58} width={8} height={8} style={{ fill: LEVEL_VAR[lv] }} />
                      <text x={x} y={yMux + 78} textAnchor="middle">{n}</text>
                    </g>
                  );
                })}
              </g>
            );
          })()}
          {/* kontrol */}
          {(() => {
            const cx = arrX + bitsW * CELL + 30;
            return (
              <g>
                <rect x={cx} y={arrY - 6} width={150} height={20 + g.ctrlPins.length * 14} className="sema-govde" />
                <text x={cx + 75} y={arrY - 12} textAnchor="middle">kontrol</text>
                <PinColumn ci={ci} names={g.ctrlPins} x={cx + 14} y={arrY + 8} gap={14} anchor="start" />
                <text x={cx} y={arrY + 34 + g.ctrlPins.length * 14} className="sel">{mode}</text>
              </g>
            );
          })()}
        </svg>
        {cell && (
          <div className="cell-box">
            <p className="small">
              Hücre: satır {cell.addr >> g.colBits}, bayt {cell.addr & (g.bytesPerRow - 1)}, bit {cell.bit} ={" "}
              <b>{selByte === null ? "?" : (selByte >> cell.bit) & 1}</b>{" "}
              <button className="link" onClick={() => setCell(null)}>kapat</button>
            </p>
            {g.cell === "sram" ? (
              <SramCell bit={selByte === null ? 0 : (selByte >> cell.bit) & 1} wl={selected && (cell.addr >> g.colBits) === activeRow} />
            ) : (
              <FlashCell bit={selByte === null ? 1 : (selByte >> cell.bit) & 1} wl={selected && (cell.addr >> g.colBits) === activeRow} />
            )}
            <p className="muted small">
              {g.cell === "sram"
                ? "6 transistör: iki çapraz bağlı evirici biti tutar (Q, Q̅), word line 1 olunca M5/M6 hücreyi bit hatlarına (BL, BL̅) bağlar."
                : "Yüzer kapılı transistör: programlamada yüzer kapıya elektron itilir, eşik yükselir ve okumada hücre iletmez (0). Silme yükü boşaltır (1)."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function MemoryInside({ ci }: { ci: ChipInstance }) {
  const g = useMemo(() => memGeometry(ci.def), [ci]);
  if (!g) return <p className="muted pad">Bu çipin içi davranışsal modeldir.</p>;
  return <ArrayView ci={ci} g={g} />;
}
