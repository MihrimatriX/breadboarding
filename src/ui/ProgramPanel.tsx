import { useEffect, useState } from "react";
import { useApp } from "../state/store";
import { sim } from "../sim/SimClient";
import { PROGRAMS } from "../sim/programs";
import { assemble } from "../sim/asm6502";
import { Section } from "./Shell";
import { sec, useDil, useT } from "./ceviri";

export function ProgramPanel() {
  const programId = useApp((s) => s.programId);
  const dil = useDil();
  const t = useT();
  const program = PROGRAMS.find((p) => p.id === programId)!;
  const [source, setSource] = useState(() => sec(program.source, dil));
  // başarı iletisi bayt sayısı olarak saklanır (dil değişince yeni dilde yazılır); derleyici hatası
  // derlendiği andaki dilde kalır
  const [msg, setMsg] = useState<{ ok: true; bytes: number } | { ok: false; text: string } | null>(null);
  // dil değişince örnek elle değiştirilmemişse yorumları yeni dilde olanıyla değişir
  useEffect(() => {
    setSource((s) => (s === program.source.tr || s === program.source.en ? sec(program.source, dil) : s));
  }, [dil, program]);
  const load = (src: string) => {
    try {
      const { bytes } = assemble(src, dil);
      sim.loadProgram(bytes);
      setMsg({ ok: true, bytes: bytes.length });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <Section title="Program" className="grow">
      <div className="row">
        <select
          id="program"
          aria-label={t("Örnek program", "Example program")}
          value={programId}
          onChange={(e) => {
            const p = PROGRAMS.find((x) => x.id === e.target.value)!;
            useApp.getState().setProgramId(p.id);
            setSource(sec(p.source, dil));
            load(sec(p.source, dil));
          }}
        >
          {PROGRAMS.map((p) => <option key={p.id} value={p.id}>{sec(p.name, dil)}</option>)}
        </select>
        <button className="primary" onClick={() => load(source)}>{t("Derle ve yükle", "Compile and load")}</button>
      </div>
      <p className="muted">{sec(program.description, dil)}</p>
      <textarea id="source" spellCheck={false} value={source} onChange={(e) => setSource(e.target.value)} rows={16} aria-label={t("6502 assembly kaynağı", "6502 assembly source")} />
      {msg && <p className={msg.ok ? "ok" : "warn"}>{msg.ok ? t(`${msg.bytes} bayt $0000'a yüklendi, çip sıfırlandı.`, `${msg.bytes} bytes loaded at $0000, chip reset.`) : msg.text}</p>}
    </Section>
  );
}
