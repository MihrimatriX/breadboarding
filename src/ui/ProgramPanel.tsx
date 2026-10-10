import { useState } from "react";
import { useApp } from "../state/store";
import { sim } from "../sim/SimClient";
import { PROGRAMS } from "../sim/programs";
import { assemble } from "../sim/asm6502";

export function ProgramPanel() {
  const programId = useApp((s) => s.programId);
  const [source, setSource] = useState(PROGRAMS.find((p) => p.id === programId)!.source);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = (src: string) => {
    try {
      const { bytes } = assemble(src);
      sim.loadProgram(bytes);
      setMsg({ ok: true, text: `${bytes.length} bayt $0000'a yüklendi, çip sıfırlandı.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <section>
      <h2>Program</h2>
      <div className="row">
        <select
          id="program"
          value={programId}
          onChange={(e) => {
            const p = PROGRAMS.find((x) => x.id === e.target.value)!;
            useApp.getState().setProgramId(p.id);
            setSource(p.source);
            load(p.source);
          }}
        >
          {PROGRAMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => load(source)}>Derle ve yükle</button>
      </div>
      <p className="muted">{PROGRAMS.find((p) => p.id === programId)?.description}</p>
      <textarea id="source" spellCheck={false} value={source} onChange={(e) => setSource(e.target.value)} rows={10} />
      {msg && <p className={msg.ok ? "ok" : "warn"}>{msg.text}</p>}
    </section>
  );
}
