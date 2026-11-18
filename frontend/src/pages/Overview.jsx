import { Card, Empty, Icon, KV, Meter, Pill, Ring } from "../components/ui.jsx";
import { clock, rs } from "../format.js";
import ChartCard from "../charts/ChartCard.jsx";
import { SegBar } from "../charts/Charts.jsx";
import { DayTimeline, StackBars } from "../charts/Charts2.jsx";
import { budgetParts } from "../charts/derive.js";

function Hero({ state, plan, ready, valid }) {
  const I = plan?.inputs || {};
  return (
    <div className="hero">
      <div className="hero-row">
        <div style={{ maxWidth: 720 }}>
          <div className="rowflex">
            <Pill dot tone={valid ? "ok" : "warn"}>MISSION DIRECTIVE</Pill>
            <span className="label">SESSION #{state.session} · {state.runs.length} RUN(S)</span>
          </div>
          <h1>Mind to Machine Hackathon</h1>
          <div className="pillrow" style={{ marginTop: 0 }}>
            {I.duration_hours && <Pill><Icon name="schedule" size="sm" />{I.duration_hours}-hour event</Pill>}
            {I.students && <Pill><Icon name="groups" size="sm" />{I.students} students · {I.teams} teams</Pill>}
            {plan?.venue && <Pill><Icon name="location_on" size="sm" />{plan.venue.chosen}</Pill>}
            {I.start_time && <Pill><Icon name="calendar_month" size="sm" />starts {I.start_time}</Pill>}
          </div>
        </div>
        <div className="rowflex" style={{ gap: 16, background: "rgba(26,31,48,.7)", padding: 14, borderRadius: 12 }}>
          <Ring pct={ready} color={valid ? "#38bdf8" : "#fbbf24"} />
          <div>
            <Pill tone={valid ? "ok" : "bad"} dot>{valid ? "PLAN VALIDATED" : "CHECKS FAILING"}</Pill>
            <div className="mono" style={{ fontSize: 12, marginTop: 6 }}>{state.checks.filter((c) => c.ok).length}/{state.checks.length} checks pass</div>
            <div className="label" style={{ marginTop: 4 }}>Recomputed by code, not the model</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModuleCard({ icon, title, tag, rows, go, to, ok }) {
  return (
    <div className="card hover" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="rowflex spread">
        <div className="ico-box"><Icon name={icon} /></div>
        <Pill tone={ok ? "ok" : "bad"} dot>{ok ? "OK" : "CHECK"}</Pill>
      </div>
      <div><h3>{title}</h3><div className="label" style={{ marginTop: 2 }}>{tag}</div></div>
      <div>{rows.map(([k, v]) => <KV key={k} k={k} v={v} />)}</div>
      <button className="btn sm" style={{ marginTop: "auto", justifyContent: "center" }} onClick={() => go(to)}>Open <Icon name="arrow_forward" size="sm" /></button>
    </div>
  );
}

function GetStarted({ samples, runSample, busy, openIngest, health }) {
  const pack = samples.filter((s) => s.kind === "pack"), updates = samples.filter((s) => s.kind === "update");
  return (
    <>
      <div className="hero">
        <div className="hero-row">
          <div style={{ maxWidth: 680 }}>
            <Pill dot tone="warn">NO PLAN YET</Pill>
            <h1>Plan the hackathon from a message pack</h1>
            <p className="muted" style={{ margin: 0 }}>
              Read the messages, resolve conflicts (newest wins), reject anything that breaks the plan, then plan venue, schedule, food, judging and budget — every step traced and saved in PostgreSQL.
            </p>
          </div>
          <button className="btn primary" onClick={openIngest}><Icon name="add_circle" size="sm" />Paste your own messages</button>
        </div>
      </div>

      <div className="grid g3">
        {[["1", "Ingest the pack", "Run the 8-message sample pack (or your own). A full plan is built in a second.", "inbox"],
          ["2", "Send a change", "The printing bill changes: only the budget is recomputed.", "update"],
          ["3", "Send a wrong message", "“Order rounded down to 100 boxes” is rejected and the plan stays valid.", "gpp_maybe"]].map(([n, t, d, ic]) => (
          <div className="card" key={n}><div className="rowflex"><div className="ico-box"><Icon name={ic} /></div><span className="label">STEP {n}</span></div>
            <h3 style={{ margin: "10px 0 4px" }}>{t}</h3><div className="muted">{d}</div></div>))}
      </div>

      <Card title="Sample message files" icon="folder_open" sub="From the project's data/ folder — one click runs the real pipeline">
        {samples.length === 0 && <div className="muted">No sample files found in data/.</div>}
        <div className="stack sm">
          {[...pack, ...updates].map((s) => (
            <div className="item click" key={s.name} onClick={() => !busy && runSample(s.name)}>
              <div className="rowflex spread">
                <div className="rowflex"><b className="mono" style={{ fontSize: 13 }}>{s.name}</b>
                  <Pill tone={s.kind === "pack" ? "" : "warn"}>{s.kind === "pack" ? `PACK · ${s.messages} msgs` : "UPDATE"}</Pill></div>
                <button className="btn sm primary" disabled={busy} onClick={(e) => { e.stopPropagation(); runSample(s.name); }}>
                  <Icon name={busy ? "progress_activity" : "play_arrow"} size="sm" />{s.kind === "pack" ? "Run pack" : "Send update"}</button>
              </div>
              <div className="quote">{s.preview}…</div>
            </div>))}
        </div>
        {health && <div className="label" style={{ marginTop: 12 }}>
          Reading engine: {health.engine.uses_llm ? health.engine.model : "rules engine (offline, no LLM, 0 tokens)"} · stored in {health.database.driver} “{health.database.name}”</div>}
      </Card>
    </>
  );
}

export default function Overview({ state, go, openIngest, samples = [], runSample, busy, health }) {
  const { plan, checks, valid } = state;
  if (!plan) return <GetStarted samples={samples} runSample={runSample} busy={busy} openIngest={openIngest} health={health} />;
  const ok = (area) => checks.filter((c) => c.area === area).every((c) => c.ok);
  const ready = checks.length ? (checks.filter((c) => c.ok).length / checks.length) * 100 : 0;
  const I = plan.inputs;
  const full = !plan.missing.length;
  const b = plan.budget, v = plan.venue, f = plan.food, j = plan.judging, s = plan.schedule;
  const conflicts = state.events.filter((e) => e.kind === "conflict");
  const rejected = state.messages.filter((m) => m.status === "rejected");
  const recent = [...state.messages].slice(-4).reverse();
  const feed = [...state.events].filter((e) => ["conflict", "rejection", "warning"].includes(e.kind)).slice(-4).reverse();
  const modelCalls = state.calls;

  return (
    <>
      <Hero state={state} plan={plan} ready={ready} valid={valid} />

      <div className="grid g4">
        <div className="tile"><span className="label">Participants</span>
          <div className="big">{I.students ?? "—"}</div><div className="muted">{I.teams ?? "—"} teams · team size {I.team_size ?? "—"}</div>
          {full && <div className="muted">{f.people} people on site (incl. staff + judges)</div>}</div>
        <div className="tile"><span className="label">Budget</span>
          <div className="big">{full ? rs(b.total) : "—"}</div>
          {full && <><div className="muted">of {rs(b.limit)} · remaining {rs(b.remaining)}</div><Meter pct={(b.total / b.limit) * 100} over={b.total > b.limit} /></>}</div>
        <div className="tile"><span className="label">Judging panel</span>
          <div className="big">{full ? j.used : "—"}</div>{full && <div className="muted">{j.confirmed} confirmed · {j.needed} needed · {j.spare} spare</div>}</div>
        <div className="tile"><span className="label">Extraction</span>
          <div className="big">{state.facts.length}</div>
          <div className="muted">{state.messages.length} messages · {conflicts.length} conflicts · {rejected.length} rejected</div></div>
      </div>

      {full ? (
        <div className="grid g5">
          <ModuleCard icon="location_on" title={v.chosen} tag="Venue" go={go} to="venue" ok={ok("venue")}
            rows={[["Seats", `${v.seats} / ${f.people} needed`], ["Generator", v.generator ? "yes" : "no"], ["Cost", rs(v.price)]]} />
          <ModuleCard icon="calendar_month" title={`${I.duration_hours}h schedule`} tag="Schedule" go={go} to="schedule" ok={ok("schedule")}
            rows={[["Hacking", `${s.hack_min} min`], ["Judging", `${s.judging_end - s.judging_start} min`], ["Prayer", I.prayer_min ? `${I.prayer_min} min` : "none"]]} />
          <ModuleCard icon="restaurant" title={`${f.qty} × ${f.type}`} tag="Food" go={go} to="food" ok={ok("food")}
            rows={[["Per head", rs(f.unit_price)], ["Delivery", f.delivery ? rs(f.delivery) : "free"], ["Total", rs(f.cost)]]} />
          <ModuleCard icon="gavel" title={`${j.used} judges`} tag="Judging" go={go} to="judging" ok={ok("judging")}
            rows={[["Per team", `${j.per_team_min} min`], ["Max teams each", j.max_teams], ["Honorarium", rs(j.cost)]]} />
          <ModuleCard icon="payments" title={rs(b.total)} tag="Budget" go={go} to="budget" ok={ok("budget")}
            rows={[["Limit", rs(b.limit)], ["Remaining", rs(b.remaining)], ["Pending", b.proposals.length ? `${b.proposals.length} proposal(s)` : "none"]]} />
        </div>
      ) : (
        <div className="banner warn"><Icon name="warning" />Missing information: {plan.missing.join(", ")}. Add the missing messages to complete the plan.</div>
      )}

      {full && (
        <div className="grid g2">
          <ChartCard title="Where the budget goes" sub={`${rs(b.total)} planned of ${rs(b.limit)}`} icon="donut_small"
            table={{ cols: ["Part", "Amount"], rows: budgetParts(plan).map((p) => [p.name, rs(p.value)]) }}>
            <SegBar parts={budgetParts(plan)} fmt={rs} />
          </ChartCard>
          <ChartCard title="The day at a glance" sub={`${I.duration_hours}-hour event`} icon="calendar_month"
            table={{ cols: ["Time", "Block", "Minutes"], rows: s.blocks.map((x) => [`${clock(plan, x.start)} – ${clock(plan, x.end)}`, x.name, x.end - x.start]) }}>
            <DayTimeline plan={plan} />
          </ChartCard>
        </div>
      )}

      <div className="split" style={{ gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr) minmax(0,.9fr)" }}>
        <Card title="Ingestion stream" icon="sync_alt" sub="Latest messages"
          right={<button className="btn sm" onClick={() => go("messages")}>All</button>}>
          <div className="stack sm">
            {recent.map((m) => (
              <div key={m.id} className={`item ${m.status === "accepted" ? "ok" : m.status === "rejected" ? "bad" : "neutral"}`}>
                <div className="item-head"><b>#{m.seq} · {m.sender}</b><span className="dim mono" style={{ fontSize: 11 }}>{m.sent_on || "undated"}</span>
                  <Pill tone={m.status === "accepted" ? "ok" : m.status === "rejected" ? "bad" : "neutral"}>{m.status}</Pill></div>
                <div className="quote">“{m.quote}…”</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Constraint arbiter" icon="flaky" sub="Conflicts, rejections, warnings"
          right={<Pill tone={rejected.length ? "bad" : "ok"}>{rejected.length} REJECTED</Pill>}>
          <div className="stack sm">
            {feed.length === 0 && <div className="muted">No conflicts or rejections so far.</div>}
            {feed.map((e) => (
              <div key={e.id} className={`item ${e.kind === "rejection" ? "bad" : "warn"}`}>
                <div className="label" style={{ color: e.kind === "rejection" ? "var(--bad)" : "var(--warn)" }}>{e.kind}</div>
                <div style={{ marginTop: 4 }}>{e.text}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Model telemetry" icon="hub" sub="Real token counts as reported">
          <div className="stack sm">
            {modelCalls.length === 0 && <div className="muted">No model calls yet.</div>}
            {modelCalls.length > 0 && (
              <div className="viz">
                <StackBars names={["Input tokens", "Output tokens"]} items={modelCalls.slice(-4).map((c) => ({ label: `#${c.n} ${c.area}`, a: c.tokens_in, b: c.tokens_out }))} />
                <div className="mono dim" style={{ fontSize: 11, marginTop: 6 }}>{[...new Set(modelCalls.map((c) => c.model))].join(", ")}</div>
              </div>
            )}
            <div className="tile"><span className="label">Total tokens</span>
              <div className="big sm">{(state.totals.tokens_in + state.totals.tokens_out).toLocaleString()}</div>
              <div className="muted mono" style={{ fontSize: 11 }}>{state.totals.calls} call(s)</div></div>
          </div>
        </Card>
      </div>
    </>
  );
}
