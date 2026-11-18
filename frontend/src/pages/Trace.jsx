import { useState } from "react";
import { Card, Empty, Icon, Pill } from "../components/ui.jsx";
import ChartCard from "../charts/ChartCard.jsx";
import { HBars } from "../charts/Charts.jsx";
import { StackBars } from "../charts/Charts2.jsx";

function Call({ c }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="call-head" onClick={() => setOpen(!open)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(!open)}>
        <b>Model call #{c.n}</b><Pill>{c.area}</Pill>
        <span className="mono muted" style={{ fontSize: 12 }}>{c.model}</span>
        <span className="mono dim" style={{ fontSize: 12 }}>in {c.tokens_in} · out {c.tokens_out} · {c.duration_ms} ms</span>
        <Icon name={open ? "expand_less" : "expand_more"} className="sm" />
      </div>
      {open && <div className="stack sm" style={{ padding: "10px 4px" }}>
        <div className="label">Input</div><pre>{c.input}</pre><div className="label">Output</div><pre>{c.output}</pre></div>}
    </div>
  );
}

export default function Trace({ state }) {
  const { runs, calls, events, totals } = state;
  if (!runs.length) return <Empty icon="hub">The trace appears after the first run.</Empty>;
  const kindTone = { rejection: "bad", conflict: "warn", warning: "warn", decision: "", info: "neutral" };
  return (
    <>
      <div className="grid g4">
        <div className="tile"><span className="label">Total tokens</span><div className="big">{(totals.tokens_in + totals.tokens_out).toLocaleString()}</div><div className="muted">as the model reported</div></div>
        <div className="tile"><span className="label">Input / output</span><div className="big sm">{totals.tokens_in.toLocaleString()} / {totals.tokens_out.toLocaleString()}</div></div>
        <div className="tile"><span className="label">Model calls</span><div className="big">{totals.calls}</div><div className="muted">all tagged “reading”</div></div>
        <div className="tile"><span className="label">Runs</span><div className="big">{runs.length}</div></div>
      </div>
      {calls.length > 0 && (
        <div className="grid g2">
          <ChartCard title="Tokens per model call" sub="Input vs output, as the model reported" icon="data_usage"
            table={{ cols: ["Call", "Model", "Input", "Output"], rows: calls.map((c) => [`#${c.n} ${c.area}`, c.model, c.tokens_in, c.tokens_out]) }}>
            <StackBars names={["Input tokens", "Output tokens"]} items={calls.map((c) => ({ label: `#${c.n} ${c.area}`, a: c.tokens_in, b: c.tokens_out }))} />
          </ChartCard>
          <ChartCard title="Latency per model call" sub="Milliseconds" icon="speed"
            table={{ cols: ["Call", "ms"], rows: calls.map((c) => [`#${c.n} ${c.area}`, c.duration_ms]) }}>
            <HBars items={calls.map((c) => ({ label: `#${c.n} ${c.area}`, value: c.duration_ms, hi: c.duration_ms === Math.max(...calls.map((x) => x.duration_ms)) }))} fmt={(v) => `${v} ms`} valueLabel="Latency" />
          </ChartCard>
        </div>
      )}
      {runs.map((r) => {
        const rc = calls.filter((c) => c.run_id === r.id);
        return (
          <Card key={r.id} title={`Run ${r.id} · ${r.kind}`} icon="hub" sub={`${r.input_name} · ${r.duration_ms} ms`}
            right={<Pill tone={r.outcome === "committed" ? "ok" : r.outcome === "invalid" ? "warn" : "bad"}>{r.outcome}</Pill>}>
            <div className="muted" style={{ marginBottom: 10 }}>{r.summary}</div>
            {rc.map((c) => <Call key={c.id} c={c} />)}
            {rc.length === 0 && <div className="dim" style={{ marginBottom: 8 }}>No model call was made.</div>}
            <div className="stack sm">{events.filter((e) => e.run_id === r.id).map((e) => (
              <div key={e.id} className={`item ${kindTone[e.kind] === "bad" ? "bad" : kindTone[e.kind] === "warn" ? "warn" : "neutral"}`} style={{ padding: 10 }}>
                <span className="label">{e.kind}</span> <span style={{ marginLeft: 6 }}>{e.text}</span></div>))}</div>
          </Card>
        );
      })}
      <div className="card mono" style={{ fontSize: 13 }}>TOTAL TOKENS: in={totals.tokens_in} out={totals.tokens_out} total={totals.tokens_in + totals.tokens_out} across {totals.calls} model call(s)</div>
    </>
  );
}
