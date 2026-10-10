import { useEffect, useRef } from "react";
import { useApp } from "../state/store";
import { live } from "../state/live";

/** Farenin altındaki düğümün adını ve durumunu gösterir */
export function HoverTooltip() {
  const ref = useRef<HTMLDivElement>(null);
  const node = useApp((s) => s.hoveredNode);
  const index = useApp((s) => s.index);
  useApp((s) => s.snapshot); // durum değiştikçe yeniden çiz

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      el.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);

  const high = node !== null && live.nodeState?.[node] === 1;
  const name = node !== null ? index?.namesByNode.get(node)?.[0] ?? `düğüm #${node}` : "";
  return (
    <div ref={ref} className="tooltip" hidden={node === null}>
      <b>{name}</b> <span className={high ? "on" : ""}>{high ? "1" : "0"}</span>
    </div>
  );
}
