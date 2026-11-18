import { useTip } from "./Tip.jsx";
import { KIND_COLOR, KIND_LABEL, S, TRACK, inkOn, pct, ramp } from "./tokens.js";
import { clock, rs } from "../format.js";

/* ------------------------------------------------------------------ budget waterfall (cumulative build-up vs limit) */
export function Waterfall({ steps, limit, ghost }) {
  const { bind, node } = useTip();
  const W = 720, H = 300, L = 56, R = 70, T = 28, B = 56;
  const total = steps.reduce((a, s) => a + s.value, 0);
  const topV = Math.max(limit, total + (ghost?.value || 0)) * 1.12;
  const y = (v) => T + (1 - v / topV) * (H - T - B);
  const cols = [...steps, { label: "Total", value: total, total: true }];
  if (ghost) cols.push({ label: ghost.label, value: ghost.value, ghost: true });
  const slot = (W - L - R) / cols.length, bw = Math.min(24, slot * 0.5);
  let cum = 0;
  const bars = cols.map((c, i) => {
    let from, to;
    if (c.total) { from = 0; to = total; }
    else if (c.ghost) { from = total; to = total + c.value; }
    else { from = cum; to = cum + c.value; cum = to; }
    return { ...c, from, to, x: L + slot * i + (slot - bw) / 2 };
  });
  const step = Math.max(10000, Math.round(topV / 1.12 / 4 / 10000) * 10000);
  const ticks = []; for (let t = 0; t <= topV / 1.12; t += step) ticks.push(t);
  const over = total > limit;
  return (
    <div role="img" aria-label={`Budget build-up: total ${rs(total)} against limit ${rs(limit)}`}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,.07)" />
            <text x={L - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#898781">{t >= 1000 ? `${t / 1000}K` : t}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#383c52" />
        {bars.map((b, i) => {
          const top = Math.min(y(b.from), y(b.to)), h = Math.abs(y(b.from) - y(b.to));
          const r = Math.min(4, h / 2);
          const fill = b.ghost ? "none" : b.total ? (over ? "#d03b3b" : "#9aa6b8") : b.color;
          return (
            <g key={i} {...bind({ title: b.label, rows: [["Amount", rs(b.value)], ["Running total", rs(b.to)], ...(b.ghost ? [["Status", "proposal, not approved"]] : [])] })}>
              <rect x={b.x - 6} y={T} width={bw + 12} height={H - T - B} fill="transparent" />
              <path d={`M${b.x} ${top + h} V${top + r} Q${b.x} ${top} ${b.x + r} ${top} H${b.x + bw - r} Q${b.x + bw} ${top} ${b.x + bw} ${top + r} V${top + h} Z`}
                fill={fill} stroke={b.ghost ? "#c3c2b7" : "none"} strokeWidth={b.ghost ? 1.5 : 0} />
              {(b.total || b.ghost) && (() => {
                let ly = top - 6;
                if (ly > y(limit) - 14 && ly < y(limit) + 6) ly = y(limit) - 10;   // keep the value clear of the limit line
                return <text x={b.x + bw / 2} y={ly} textAnchor="middle" fontSize="11" fontWeight="600" fill="#dee1f9">{rs(b.to)}</text>;
              })()}
              <text x={b.x + bw / 2} y={H - B + 16} textAnchor="middle" fontSize="10" fill="#c3c2b7">{b.label.length > 12 ? b.label.slice(0, 11) + "…" : b.label}</text>
            </g>
          );
        })}
        <line x1={L} x2={W - R + 8} y1={y(limit)} y2={y(limit)} stroke="#dee1f9" strokeWidth="1.5" />
        <text x={W - R + 12} y={y(limit) - 3} fontSize="10" fontWeight="600" fill="#dee1f9">LIMIT</text>
        <text x={W - R + 12} y={y(limit) + 10} fontSize="10" fill="#c3c2b7">{rs(limit).replace("Rs ", "")}</text>
      </svg>
      {node}
    </div>
  );
}

/* ------------------------------------------------------------------ day timeline (axis + blocks) */
export function DayTimeline({ plan, height = 34 }) {
  const { bind, node } = useTip();
  const s = plan.schedule, total = s.total_min;
  const blocks = s.blocks.filter((b) => b.end > b.start);
  const step = total <= 300 ? 30 : 60;
  const ticks = []; for (let m = 0; m <= total; m += step) ticks.push(m);
  const kinds = []; blocks.forEach((b) => { if (!kinds.find((k) => k.label === KIND_LABEL[b.kind])) kinds.push({ label: KIND_LABEL[b.kind], color: KIND_COLOR[b.kind] }); });
  return (
    <div role="img" aria-label={blocks.map((b) => `${b.name} ${b.end - b.start} minutes`).join(", ")}>
      <div className="seg-tall" style={{ height }}>
        {blocks.map((b) => {
          const w = pct(b.end - b.start, total), c = KIND_COLOR[b.kind];
          return (
            <div key={b.name} style={{ flex: `${b.end - b.start} 1 0`, background: c, color: inkOn(c), paddingLeft: 6 }}
              {...bind({ title: b.name, rows: [["Time", `${clock(plan, b.start)} – ${clock(plan, b.end)}`], ["Length", `${b.end - b.start} min`], ["Share", `${w.toFixed(0)}%`]] })}>
              {w >= 11 ? b.name.replace(/ block \d/, "").replace(" & ", "/") : ""}
            </div>
          );
        })}
      </div>
      <div className="axis-ticks">{ticks.map((m, i) => (
        <span key={m} style={{ left: `${pct(m, total)}%`, transform: i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : undefined }}>{clock(plan, m)}</span>
      ))}</div>
      <div className="legend">{kinds.map((k) => <span key={k.label}><i style={{ background: k.color }} />{k.label}</span>)}</div>
      {node}
    </div>
  );
}

/* ------------------------------------------------------------------ judge x slot heatmap */
export function JudgeHeatmap({ plan }) {
  const { bind, node } = useTip();
  const j = plan.judging, n = j.slots;
  return (
    <div role="img" aria-label={`${j.used} judges across ${n} judging slots`}>
      <div className="scroll">
        <div className="heat" style={{ gridTemplateColumns: `60px repeat(${n}, minmax(44px, 1fr))` }}>
          <div />{Array.from({ length: n }, (_, i) => <div key={i} className="hh">Slot {i + 1}</div>)}
          {j.assignments.map((a) => <HeatRow key={a.judge} a={a} n={n} bind={bind} plan={plan} />)}
        </div>
      </div>
      <div className="legend">
        <span><i style={{ background: ramp(0, 3) }} />earlier slot</span><span><i style={{ background: ramp(2, 3) }} />later slot</span>
        <span><i style={{ background: TRACK }} />free</span>{j.late_min > 0 && <span>⏱ judge may arrive {j.late_min} min late</span>}
      </div>
      {node}
    </div>
  );
}
function HeatRow({ a, n, bind, plan }) {
  return (
    <>
      <div className="hl">J{a.judge}{a.late ? " ⏱" : ""}</div>
      {Array.from({ length: n }, (_, i) => a.teams[i]).map((t, i) => t ? (
        <div key={i} className="cell" style={{ background: ramp(i, n) }}
          {...bind({ title: `Judge ${a.judge} → Team ${t.team}`, rows: [["Starts", clock(plan, t.start)], ["Ends", clock(plan, t.end)], ...(a.late ? [["Note", "may arrive late"]] : [])] })}>
          {t.team}
        </div>
      ) : <div key={i} className="cell empty" aria-hidden="true" />)}
    </>
  );
}

/* ------------------------------------------------------------------ stacked in/out token bars */
export function StackBars({ items, names, fmt = (v) => v.toLocaleString() }) {
  const { bind, node } = useTip();
  const max = Math.max(...items.map((i) => i.a + i.b)) * 1.1 || 1;
  return (
    <div>
      <div className="hb" style={{ gridTemplateColumns: "minmax(90px,140px) 1fr auto" }}>
        {items.map((it) => {
          const tip = { title: it.label, rows: [[names[0], fmt(it.a)], [names[1], fmt(it.b)], ["Total", fmt(it.a + it.b)]] };
          return (
            <FragStack key={it.label} it={it} max={max} fmt={fmt} tip={tip} bind={bind} />
          );
        })}
      </div>
      <div className="legend"><span><i style={{ background: S[0] }} />{names[0]}</span><span><i style={{ background: S[1] }} />{names[1]}</span></div>
      {node}
    </div>
  );
}
function FragStack({ it, max, fmt, tip, bind }) {
  return (
    <>
      <div className="hb-label mono" style={{ fontSize: 12 }}>{it.label}</div>
      <div className="hb-track" style={{ display: "flex", gap: 2 }}>
        <div style={{ width: `${pct(it.a, max)}%`, background: S[0], height: 16, marginTop: 1 }} {...bind(tip)} />
        <div style={{ width: `${pct(it.b, max)}%`, background: S[1], height: 16, marginTop: 1, borderRadius: "0 4px 4px 0" }} {...bind(tip)} />
      </div>
      <div className="hb-val">{fmt(it.a + it.b)}</div>
    </>
  );
}
