import { useState } from "react";
import { Card, Empty, Icon, Pill, val } from "../components/ui.jsx";
import ChartCard from "../charts/ChartCard.jsx";
import { HBars, SegBar } from "../charts/Charts.jsx";
import { STATUS_PARTS, countBy } from "../charts/derive.js";

const TONE = { active: "ok", superseded: "warn", rejected: "bad" };
const FILTERS = ["all", "active", "superseded", "rejected"];

export default function Facts({ state, query, openIngest }) {
  const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState(null);
  const { facts } = state;
  if (!facts.length) return <Empty icon="database" action={<button className="btn primary" onClick={openIngest}>Ingest messages</button>}>No facts stored yet.</Empty>;

  const q = query.trim().toLowerCase();
  const shown = facts.filter((f) => (filter === "all" || f.status === filter)
    && (!q || `${f.key} ${f.subject} ${val(f.value)} ${f.evidence} ${f.sender}`.toLowerCase().includes(q)));
  const cur = facts.find((f) => f.id === sel) || shown[0];
  const lineage = cur ? facts.filter((f) => f.key === cur.key && (f.subject || "") === (cur.subject || "")).sort((a, b) => a.id - b.id) : [];
  const n = (s) => facts.filter((f) => f.status === s).length;
  const AREA = { event: "Event rules", venue: "Venue", food: "Food", judge: "Judging", expense: "Spend", proposal: "Proposals", constraint: "Other rules" };
  const byArea = countBy(facts, (f) => AREA[f.key.split(".")[0]] || f.key.split(".")[0]);

  return (
    <>
      <div className="grid g4">
        <div className="tile"><span className="label">Facts stored</span><div className="big">{facts.length}</div><div className="muted">in PostgreSQL</div></div>
        <div className="tile"><span className="label">Active</span><div className="big" style={{ color: "var(--ok)" }}>{n("active")}</div><div className="muted">drive the plan</div></div>
        <div className="tile"><span className="label">Superseded</span><div className="big" style={{ color: "var(--warn)" }}>{n("superseded")}</div><div className="muted">kept as evidence</div></div>
        <div className="tile"><span className="label">Rejected</span><div className="big" style={{ color: "var(--bad)" }}>{n("rejected")}</div><div className="muted">never applied</div></div>
      </div>
      <div className="grid g2">
        <ChartCard title="Facts by area" sub="What the messages told us about" icon="category"
          table={{ cols: ["Area", "Facts"], rows: byArea.map((x) => [x.label, x.value]) }}>
          <HBars items={byArea.map((x, i) => ({ ...x, hi: i === 0 }))} valueLabel="Facts" />
        </ChartCard>
        <ChartCard title="Fact lifecycle" sub="Newest dated message wins; the rest stay as evidence" icon="rule"
          table={{ cols: ["Status", "Facts"], rows: ["active", "superseded", "rejected"].map((s) => [s, n(s)]) }}>
          <SegBar parts={["active", "superseded", "rejected"].map((s) => ({ ...STATUS_PARTS[s], value: n(s) }))} />
        </ChartCard>
      </div>
      <div className="rowflex spread">
        <div className="seg">{FILTERS.map((f) => <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f}</button>)}</div>
        <span className="label">{shown.length} shown{q ? ` · search “${query}”` : ""}</span>
      </div>
      <div className="split">
        <Card className="" title="Fact store" icon="database">
          <div className="tablewrap"><table>
            <thead><tr><th>Msg</th><th>Fact</th><th>Value</th><th>Sender</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>{shown.map((f) => (
              <tr key={f.id} className={`click ${cur?.id === f.id ? "sel" : ""} ${f.status !== "active" ? "struck" : ""}`} onClick={() => setSel(f.id)}>
                <td className="mono">#{f.msg_seq}</td>
                <td><code>{f.key}</code>{f.subject && <div className="dim" style={{ fontSize: 12 }}>{f.subject}</div>}</td>
                <td className="mono" style={{ fontSize: 12, maxWidth: 220, overflowWrap: "anywhere" }}>{val(f.value)}</td>
                <td>{f.sender}</td><td className="mono">{f.sent_on || "—"}</td>
                <td><Pill tone={TONE[f.status]}>{f.status}</Pill></td></tr>))}</tbody></table></div>
        </Card>
        <div className="sticky">{cur && (
          <Card title="Evidence dossier" icon="fingerprint" right={<Pill tone={TONE[cur.status]}>{cur.status}</Pill>}>
            <div className="stack">
              <div><div className="label">Fact</div><code>{cur.key}{cur.subject ? ` [${cur.subject}]` : ""}</code><div className="mono" style={{ marginTop: 6 }}>{val(cur.value)}</div></div>
              <div><div className="label">Verbatim evidence</div><div className="quote">“{cur.evidence}”</div>
                <div style={{ marginTop: 6 }}>{cur.evidence_verified ? <Pill tone="ok" dot>FOUND IN ORIGINAL TEXT</Pill> : <Pill tone="warn" dot>NOT FOUND VERBATIM</Pill>}</div></div>
              <div><div className="label">Source</div><div>{cur.sender} <span className="dim">({cur.role})</span> · msg #{cur.msg_seq} · {cur.sent_on || "undated"}</div></div>
              {cur.reason && <div><div className="label">Decision</div><div className="muted">{cur.reason}</div></div>}
              <div><div className="label">Lineage ({lineage.length})</div>
                <div className="rail" style={{ marginTop: 8 }}>{lineage.map((f) => (
                  <div key={f.id} className={`node ${f.status === "active" ? "ok" : f.status === "superseded" ? "warn" : "bad"}`}>
                    <b className="mono" style={{ fontSize: 12 }}>{val(f.value)}</b> <Pill tone={TONE[f.status]}>{f.status}</Pill>
                    <div className="dim" style={{ fontSize: 12 }}>msg #{f.msg_seq} · {f.sender} · {f.sent_on || "undated"}</div></div>))}</div></div>
            </div>
          </Card>)}</div>
      </div>
    </>
  );
}
