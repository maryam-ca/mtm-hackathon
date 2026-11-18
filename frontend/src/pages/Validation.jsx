import { Card, Empty, Icon, Pill } from "../components/ui.jsx";

export default function Validation({ state }) {
  const { checks, plan, valid } = state;
  if (!plan) return <Empty icon="verified">No plan to validate yet.</Empty>;
  const pass = checks.filter((c) => c.ok).length;
  return (
    <>
      <div className="rowflex spread">
        <div><h1 style={{ margin: 0 }}>Cross-area validation</h1><div className="label">Figures recomputed independently from the plan inputs</div></div>
        <Pill tone={valid ? "ok" : "bad"} dot>{pass}/{checks.length} PASS</Pill>
      </div>
      <div className="checks">
        {checks.map((c) => (
          <div key={c.id} className={`card ${c.ok ? "" : ""}`} style={{ borderColor: c.ok ? "var(--ok-line)" : "var(--bad-line)" }}>
            <div className="rowflex spread"><span className="label">{c.area}</span><Pill tone={c.ok ? "ok" : "bad"} dot>{c.ok ? "PASS" : "FAIL"}</Pill></div>
            <h3 style={{ margin: "8px 0 4px", fontSize: 16 }}>{c.label}</h3>
            <div className="muted">{c.detail}</div>
          </div>))}
      </div>
      {plan.decisions.length > 0 && (
        <Card title="Decisions made by the planner" icon="psychology"><ul className="stack sm" style={{ margin: 0, paddingLeft: 18 }}>{plan.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul></Card>)}
      {plan.notes.length > 0 && (
        <Card title="Other rules noted (not automatically enforced)" icon="info"><ul className="stack sm" style={{ margin: 0, paddingLeft: 18 }}>{plan.notes.map((d, i) => <li key={i}>{d}</li>)}</ul></Card>)}
    </>
  );
}
