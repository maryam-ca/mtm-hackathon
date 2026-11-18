import { Card, Empty, Icon, Pill, outcomeTone } from "../components/ui.jsx";

export default function Reports({ state, download }) {
  const { runs, plan } = state;
  const json = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ plan: state.plan, checks: state.checks, facts: state.facts, messages: state.messages, calls: state.calls, events: state.events, totals: state.totals }, null, 2)], { type: "application/json" }));
    a.download = "plan_state.json"; a.click();
  };
  return (
    <>
      <div><h1 style={{ margin: 0 }}>Reports & exports</h1><div className="label">Final plan + full trace, saved from PostgreSQL</div></div>
      <div className="grid g2">
        <Card title="Plan + trace (text)" icon="description"><p className="muted">Plan, checks, rejected messages and the numbered model-call trace ending with total tokens. This is the file to upload after the test run.</p>
          <button className="btn primary" disabled={!plan} onClick={download}><Icon name="download" size="sm" />Download .txt</button></Card>
        <Card title="Full state (JSON)" icon="data_object"><p className="muted">Plan, checks, facts, messages, model calls and events as structured data.</p>
          <button className="btn" disabled={!plan} onClick={json}><Icon name="download" size="sm" />Download .json</button></Card>
      </div>
      <Card title="Run history" icon="history">
        {runs.length === 0 ? <div className="muted">No runs yet.</div> : (
          <div className="tablewrap"><table>
            <thead><tr><th>Run</th><th>Kind</th><th>Input</th><th>Outcome</th><th className="num">Tokens</th><th className="num">Time</th><th>Areas changed</th></tr></thead>
            <tbody>{runs.map((r) => <tr key={r.id}><td className="mono">{r.id}</td><td>{r.kind}</td><td>{r.input_name}</td>
              <td><Pill tone={outcomeTone(r.outcome)}>{r.outcome}</Pill></td>
              <td className="num">{r.tokens_in + r.tokens_out}</td><td className="num">{(r.duration_ms / 1000).toFixed(1)}s</td>
              <td className="mono" style={{ fontSize: 12 }}>{(r.affected_areas || []).join(", ") || "—"}</td></tr>)}</tbody></table></div>)}
      </Card>
    </>
  );
}
