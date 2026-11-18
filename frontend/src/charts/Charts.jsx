import { useTip } from "./Tip.jsx";
import { CTX, KIND_COLOR, KIND_LABEL, S, TRACK, inkOn, pct, ramp } from "./tokens.js";
import { clock, rs } from "../format.js";

/* ------------------------------------------------------------------ tall segmented bar (one whole, <= 6 parts) */
export function SegBar({ parts, fmt = (v) => v, total, label = "share", height = 28 }) {
  const { bind, node } = useTip();
  const sum = total ?? parts.reduce((a, p) => a + p.value, 0);
  return (
    <div role="img" aria-label={parts.map((p) => `${p.name} ${fmt(p.value)}`).join(", ")}>
      <div className="seg-tall" style={{ height }}>
        {parts.filter((p) => p.value > 0).map((p) => {
          const w = pct(p.value, sum);
          return (
            <div key={p.name} style={{ flex: `${p.value} 1 0`, background: p.color, color: p.ink || inkOn(p.color) }}
              {...bind({ title: p.name, rows: [["Amount", fmt(p.value)], ["Share", `${w.toFixed(1)}%`]] })}>
              {w >= 13 ? `${Math.round(w)}%` : ""}
            </div>
          );
        })}
      </div>
      <div className="legend">{parts.map((p) => <span key={p.name}><i style={{ background: p.color }} />{p.name} · {fmt(p.value)}</span>)}</div>
      {node}
    </div>
  );
}

/* ------------------------------------------------------------------ ranked / emphasis horizontal bars */
export function HBars({ items, max, fmt = (v) => v, marker, valueLabel }) {
  const { bind, node } = useTip();
  const top = max ?? (Math.max(...items.map((i) => i.value), marker?.value || 0) * 1.08 || 1);
  return (
    <div className="hb" role="img" aria-label={items.map((i) => `${i.label} ${fmt(i.value)}`).join(", ")}>
      {items.map((it, idx) => (
        <FragmentRow key={it.label} it={it} top={top} fmt={fmt} marker={marker} first={idx === 0} bind={bind} valueLabel={valueLabel} />
      ))}
      {node}
    </div>
  );
}
function FragmentRow({ it, top, fmt, marker, first, bind, valueLabel }) {
  const w = Math.max(0.5, Math.min(100, pct(it.value, top)));
  return (
    <>
      <div className="hb-label" title={it.label} style={{ fontWeight: it.hi ? 600 : 400, color: it.hi ? "var(--text)" : "var(--ink2)" }}>{it.label}</div>
      <div className="hb-track">
        <div className="hb-bar" style={{ width: `${w}%`, background: it.color || (it.hi ? S[0] : CTX) }}
          {...bind({ title: it.label, rows: [[valueLabel || "Value", fmt(it.value)], ...(it.rows || [])] })} />
        {marker && <div className="hb-marker" style={{ left: `${pct(marker.value, top)}%` }}>{first && <span>{marker.label}</span>}</div>}
      </div>
      <div className="hb-val">{fmt(it.value)}</div>
    </>
  );
}
