import { Card, Empty, Pill, val } from "../components/ui.jsx";

export default function Rejected({ state }) {
  const { messages, facts, events } = state;
  const rejected = messages.filter((m) => m.status === "rejected");
  const ignored = messages.filter((m) => m.status === "irrelevant");
  const rejFacts = facts.filter((f) => f.status === "rejected");
  if (!messages.length) return <Empty icon="unsubscribe">Nothing yet.</Empty>;
  return (
    <>
      <div className="rowflex spread"><div><h1 style={{ margin: 0 }}>Rejected messages</h1>
        <div className="label">Why a message was not applied — the plan stays valid</div></div>
        <Pill tone={rejected.length ? "bad" : "ok"}>{rejected.length} REJECTED · {ignored.length} IGNORED</Pill></div>

      {rejected.length === 0 && <div className="banner ok">No message has been rejected.</div>}
      {rejected.map((m) => (
        <Card key={m.id} title={`#${m.seq} · ${m.sender}`} icon="block" sub={`${m.role} · ${m.sent_on || "undated"}`} right={<Pill tone="bad">REJECTED</Pill>}>
          <div className="quote">“{m.quote}…”</div>
          <div className="item bad" style={{ marginTop: 10 }}><div className="label" style={{ color: "var(--bad)" }}>Reason in trace</div><div style={{ marginTop: 4 }}>{m.reason}</div></div>
          <div className="stack sm" style={{ marginTop: 10 }}>{rejFacts.filter((f) => f.msg_seq === m.seq).map((f) => (
            <div key={f.id} className="item" style={{ padding: 10 }}><code>{f.key}{f.subject ? ` [${f.subject}]` : ""}</code> = <span className="mono">{val(f.value)}</span>
              <div className="muted" style={{ fontSize: 12 }}>evidence: “{f.evidence}”</div></div>))}</div>
        </Card>))}

      {ignored.length > 0 && (
        <Card title="Ignored as irrelevant" icon="visibility_off">
          <div className="stack sm">{ignored.map((m) => (
            <div key={m.id} className="item neutral"><b>#{m.seq} · {m.sender}</b> <span className="dim mono" style={{ fontSize: 11 }}>{m.sent_on}</span>
              <div className="quote">“{m.quote}…”</div><div className="muted" style={{ marginTop: 6 }}>{m.reason}</div></div>))}</div>
        </Card>)}
    </>
  );
}
