import { useState } from "react";
import { Card, Empty, Icon, Pill, val } from "../components/ui.jsx";
import ChartCard from "../charts/ChartCard.jsx";
import { HBars, SegBar } from "../charts/Charts.jsx";
import { STATUS_PARTS, countBy } from "../charts/derive.js";

const TONE = { accepted: "ok", rejected: "bad", irrelevant: "neutral" };
const FILTERS = ["all", "accepted", "rejected", "irrelevant"];

export default function Messages({ state, query, openIngest }) {
  const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState(null);
  const { messages, facts } = state;
  if (!messages.length) return <Empty icon="inbox" action={<button className="btn primary" onClick={openIngest}>Ingest messages</button>}>No messages yet.</Empty>;

  const byRole = countBy(messages, (m) => m.role);
  const q = query.trim().toLowerCase();
  const shown = messages.filter((m) => (filter === "all" || m.status === filter)
    && (!q || `${m.sender} ${m.quote} ${m.reason} ${m.role}`.toLowerCase().includes(q)));
  const cur = messages.find((m) => m.seq === sel) || shown[0];
  const curFacts = cur ? facts.filter((f) => f.msg_seq === cur.seq) : [];

  return (
    <>
      <div className="rowflex spread">
        <div><h1 style={{ margin: 0 }}>Messages & inbox</h1><div className="label">{messages.length} messages read by the model, in order</div></div>
        <div className="seg" role="tablist">{FILTERS.map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {f} ({f === "all" ? messages.length : messages.filter((m) => m.status === f).length})</button>))}</div>
      </div>
      <div className="grid g2">
        <ChartCard title="Who is talking" sub="Messages by sender role" icon="groups"
          table={{ cols: ["Role", "Messages"], rows: byRole.map((x) => [x.label, x.value]) }}>
          <HBars items={byRole.map((x, i) => ({ ...x, hi: i === 0 }))} valueLabel="Messages" />
        </ChartCard>
        <ChartCard title="What happened to them" sub="Accepted, rejected or ignored" icon="fact_check"
          table={{ cols: ["Status", "Messages"], rows: ["accepted", "rejected", "irrelevant"].map((s) => [s, messages.filter((m) => m.status === s).length]) }}>
          <SegBar parts={["accepted", "rejected", "irrelevant"].map((s) => ({ ...STATUS_PARTS[s], value: messages.filter((m) => m.status === s).length }))} />
        </ChartCard>
      </div>
      <div className="split">
        <div className="stack sm">
          {shown.length === 0 && <div className="muted">No messages match.</div>}
          {shown.map((m) => (
            <div key={m.id} className={`item click ${TONE[m.status]} ${cur?.seq === m.seq ? "sel" : ""}`} onClick={() => setSel(m.seq)}>
              <div className="item-head">
                <div className="ico-box"><Icon name={m.role === "vendor" ? "storefront" : m.role === "finance" ? "account_balance" : m.role === "organizer" ? "shield" : m.role === "judge" || m.role === "coordinator" ? "gavel" : "chat"} /></div>
                <div style={{ flex: 1, minWidth: 0 }}><b>#{m.seq} · {m.sender}</b>
                  <div className="dim mono" style={{ fontSize: 11 }}>{m.role} · {m.sent_on || "undated"}</div></div>
                <Pill tone={TONE[m.status]}>{m.status}</Pill>
              </div>
              <div className="quote">“{m.quote}…”</div>
              {m.reason && <div className={m.status === "rejected" ? "" : "muted"} style={{ marginTop: 6, color: m.status === "rejected" ? "var(--bad)" : undefined }}><b>Why:</b> {m.reason}</div>}
            </div>
          ))}
        </div>

        <div className="sticky">
          {cur && (
            <Card title="Extraction inspector" icon="document_scanner" right={<Pill>MSG #{cur.seq}</Pill>}>
              <div className="stack">
                <div><div className="label">Sender</div><div>{cur.sender} <span className="dim">({cur.role})</span></div></div>
                <div><div className="label">Date</div><div className="mono">{cur.sent_on || "undated"}</div></div>
                <div><div className="label">Status</div><Pill tone={TONE[cur.status]}>{cur.status}</Pill></div>
                <div><div className="label">Facts extracted ({curFacts.length})</div>
                  {curFacts.length === 0 && <div className="muted">None — this message carried no planning fact.</div>}
                  <div className="stack sm" style={{ marginTop: 6 }}>{curFacts.map((f) => (
                    <div key={f.id} className="item" style={{ padding: 10 }}>
                      <div className="rowflex spread"><code>{f.key}{f.subject ? ` [${f.subject}]` : ""}</code>
                        <Pill tone={f.status === "active" ? "ok" : f.status === "superseded" ? "warn" : "bad"}>{f.status}</Pill></div>
                      <div className="mono" style={{ marginTop: 6 }}>{val(f.value)}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>evidence: “{f.evidence}” {!f.evidence_verified && <Pill tone="warn">not verbatim</Pill>}</div>
                      {f.reason && <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>{f.reason}</div>}
                    </div>))}</div></div>
                <div><div className="label">JSON payload</div><pre>{JSON.stringify(curFacts.map((f) => ({ key: f.key, subject: f.subject, value: f.value, status: f.status })), null, 2)}</pre></div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
