import { Card, Empty, Icon, Pill } from "../components/ui.jsx";

export default function Conflicts({ state }) {
  const { events, runs } = state;
  const conflicts = events.filter((e) => e.kind === "conflict");
  const rejections = events.filter((e) => e.kind === "rejection");
  const warnings = events.filter((e) => e.kind === "warning");
  const runOf = (id) => runs.find((r) => r.id === id);
  if (!events.length) return <Empty icon="warning">No conflicts yet — run the message pack first.</Empty>;

  const Row = ({ e, tone }) => (
    <div className={`item ${tone}`}>
      <div className="rowflex spread"><span className="label" style={{ color: `var(--${tone === "bad" ? "bad" : "warn"})` }}>{e.kind}</span>
        <span className="dim mono" style={{ fontSize: 11 }}>run {e.run_id} · {runOf(e.run_id)?.kind}</span></div>
      <div style={{ marginTop: 4 }}>{e.text}</div>
    </div>
  );

  return (
    <>
      <div className="rowflex spread"><div><h1 style={{ margin: 0 }}>Conflict detection</h1><div className="label">Resolved by code: newest dated message wins, authority is enforced</div></div></div>
      <div className="grid g3">
        <div className="tile"><span className="label">Conflicts resolved</span><div className="big" style={{ color: "var(--warn)" }}>{conflicts.length}</div><div className="muted">older value superseded</div></div>
        <div className="tile"><span className="label">Rejections</span><div className="big" style={{ color: "var(--bad)" }}>{rejections.length}</div><div className="muted">plan kept valid</div></div>
        <div className="tile"><span className="label">Warnings</span><div className="big">{warnings.length}</div><div className="muted">model/evidence issues</div></div>
      </div>
      <div className="grid g2">
        <Card title="Resolved conflicts" icon="flaky">
          <div className="stack sm">{conflicts.length ? conflicts.map((e) => <Row key={e.id} e={e} tone="warn" />) : <div className="muted">None.</div>}</div>
        </Card>
        <Card title="Rejections & warnings" icon="gpp_maybe">
          <div className="stack sm">{rejections.length + warnings.length ? [...rejections.map((e) => <Row key={e.id} e={e} tone="bad" />), ...warnings.map((e) => <Row key={e.id} e={e} tone="warn" />)] : <div className="muted">None.</div>}</div>
        </Card>
      </div>
    </>
  );
}
