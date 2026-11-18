import { useState } from "react";
import { Card, Empty, Icon, KV, Meter, Pill } from "../components/ui.jsx";
import { clock, rs } from "../format.js";
import ChartCard from "../charts/ChartCard.jsx";
import { HBars, SegBar } from "../charts/Charts.jsx";
import { DayTimeline, JudgeHeatmap, Waterfall } from "../charts/Charts2.jsx";
import { CTX, KIND_COLOR, KIND_LABEL, S } from "../charts/tokens.js";
import { budgetParts, waterfallSteps } from "../charts/derive.js";

function guard(Page) {
  return function Guarded(props) {
    const { plan } = props.state;
    if (!plan) return <Empty icon="psychology" action={<button className="btn primary" onClick={props.openIngest}>Ingest messages</button>}>No plan yet.</Empty>;
    if (plan.missing.length) return <div className="banner warn"><Icon name="warning" />Cannot plan yet — missing: {plan.missing.join(", ")}.</div>;
    return <Page {...props} plan={plan} checks={props.state.checks} />;
  };
}

const status = (checks, area) => {
  const cs = checks.filter((c) => c.area === area);
  return cs.every((c) => c.ok);
};
const Head = ({ title, sub, ok }) => (
  <div className="rowflex spread"><div><h1 style={{ margin: 0 }}>{title}</h1><div className="label">{sub}</div></div>
    <Pill tone={ok ? "ok" : "bad"} dot>{ok ? "VALID" : "CHECK FAILING"}</Pill></div>
);
const Decisions = ({ plan, match }) => {
  const d = plan.decisions.filter((x) => match.test(x));
  return d.length ? <Card title="How this was decided" icon="psychology"><ul style={{ margin: 0, paddingLeft: 18 }} className="stack sm">{d.map((x, i) => <li key={i}>{x}</li>)}</ul></Card> : null;
};
const Checks = ({ checks, area }) => (
  <Card title="Checks" icon="verified">
    <div className="stack sm">{checks.filter((c) => c.area === area).map((c) => (
      <div key={c.id} className={`item ${c.ok ? "ok" : "bad"}`}><b>{c.ok ? "✓" : "✗"} {c.label}</b><div className="muted">{c.detail}</div></div>))}</div>
  </Card>
);

export const Venue = guard(({ plan, checks }) => {
  const v = plan.venue;
  return (
    <>
      <Head title="Venue planning" sub="Cheapest hall that fits everyone" ok={status(checks, "venue")} />
      <div className="grid g2">
        <ChartCard title="Seats vs people on site" sub={`${plan.food.people} people must fit`} icon="event_seat"
          table={{ cols: ["Hall", "Seats", "Needed"], rows: v.options.map((o) => [o.name, o.seats, plan.food.people]) }}>
          <HBars items={v.options.map((o) => ({ label: o.name, value: o.seats, hi: o.name === v.chosen, rows: [["Needed", plan.food.people], ["Fits", o.seats >= plan.food.people ? "yes" : "no"]] }))}
            marker={{ value: plan.food.people, label: `${plan.food.people} NEEDED` }} valueLabel="Seats" />
          <div className="legend"><span><i style={{ background: S[0] }} />chosen hall</span><span><i style={{ background: CTX }} />other options</span><span><i style={{ background: "var(--primary)", height: 10, width: 2, borderRadius: 0 }} />people on site</span></div>
        </ChartCard>
        <ChartCard title="Hire cost per hall" sub="Cheapest fitting hall wins" icon="payments"
          table={{ cols: ["Hall", "Price"], rows: v.options.map((o) => [o.name, rs(o.price)]) }}>
          <HBars items={v.options.map((o) => ({ label: o.name, value: o.price, hi: o.name === v.chosen }))} fmt={rs} valueLabel="Price" />
          <div className="legend"><span><i style={{ background: S[0] }} />chosen hall</span><span><i style={{ background: CTX }} />other options</span></div>
        </ChartCard>
      </div>
      <div className="split">
        <Card title="Options" icon="location_on">
          <div className="tablewrap"><table>
            <thead><tr><th>Hall</th><th className="num">Seats</th><th className="num">Price</th><th>Generator</th><th>Result</th></tr></thead>
            <tbody>{v.options.map((o) => {
              const rej = v.rejected.find((r) => r.name === o.name);
              return <tr key={o.name} className={o.name === v.chosen ? "hl" : ""}>
                <td><b>{o.name}</b></td><td className="num">{o.seats}</td><td className="num">{rs(o.price)}</td><td>{o.generator ? "yes" : "no"}</td>
                <td>{o.name === v.chosen ? <Pill tone="ok">CHOSEN</Pill> : rej ? <span className="dim">Rejected: {rej.reason}</span> : <span className="dim">Fits, costs more</span>}</td></tr>;
            })}</tbody></table></div>
        </Card>
        <div className="stack">
          <Card title={v.chosen} icon="apartment" sub="Selected">
            <KV k="Seats" v={`${v.seats} (need ${plan.food.people})`} /><KV k="Generator" v={v.generator ? "yes" : "no"} /><KV k="Cost" v={rs(v.price)} />
            <Meter pct={(plan.food.people / v.seats) * 100} />
            <div className="label" style={{ marginTop: 6 }}>{Math.round((plan.food.people / v.seats) * 100)}% occupied</div>
          </Card>
          <Checks checks={checks} area="venue" />
        </div>
      </div>
      <Decisions plan={plan} match={/Venue|People on site/} />
    </>
  );
});

const timeSplit = (s) => {
  const m = {};
  s.blocks.forEach((b) => {
    const k = KIND_LABEL[b.kind];
    if (b.end > b.start) m[k] = { label: k, value: (m[k]?.value || 0) + b.end - b.start, color: KIND_COLOR[b.kind] };
  });
  return Object.values(m).sort((a, b) => b.value - a.value);
};

export const Schedule = guard(({ plan, checks }) => {
  const s = plan.schedule;
  return (
    <>
      <Head title="Schedule planning" sub={`${plan.inputs.duration_hours}-hour event · ${s.total_min} minutes`} ok={status(checks, "schedule")} />
      <ChartCard title="The day, minute by minute" sub={`${s.total_min} minutes · bars are proportional to time`} icon="calendar_month"
        table={{ cols: ["Time", "Block", "Minutes"], rows: s.blocks.map((b) => [`${clock(plan, b.start)} – ${clock(plan, b.end)}`, b.name, b.end - b.start]) }}>
        <DayTimeline plan={plan} />
      </ChartCard>
      <div className="grid g2">
        <ChartCard title="Where the time goes" sub="Minutes per activity, largest first" icon="hourglass_top"
          table={{ cols: ["Activity", "Minutes"], rows: timeSplit(s).map((x) => [x.label, x.value]) }}>
          <HBars items={timeSplit(s)} fmt={(v) => `${v} min`} valueLabel="Minutes" />
        </ChartCard>
        <Checks checks={checks} area="schedule" />
        <Card title="Rules applied" icon="rule"><ul className="stack sm" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Prayer break: {plan.inputs.prayer_min ? `${plan.inputs.prayer_min} min (from the messages)` : "none required"}</li>
          <li>Judging window = slots × {plan.judging.per_team_min} min{plan.inputs.judge_late ? ` + ${plan.inputs.judge_late} min late-judge buffer` : ""}</li>
          <li>Opening, lunch and closing lengths are planner policy, not event facts.</li></ul></Card>
      </div>
    </>
  );
});

export const Food = guard(({ plan, checks }) => {
  const f = plan.food;
  return (
    <>
      <Head title="Food planning" sub="Meals for every person on site" ok={status(checks, "food")} />
      <ChartCard title="Total cost per menu option" sub={`${f.qty} meals · chosen option highlighted`} icon="restaurant"
        table={{ cols: ["Option", "Per head", "Delivery", "Total"], rows: f.options.map((o) => [o.type, rs(o.price), o.delivery ? rs(o.delivery) : "free", rs(f.qty * o.price + o.delivery)]) }}>
        <HBars items={f.options.map((o) => ({ label: o.type, value: f.qty * o.price + o.delivery, hi: o.type === f.type, rows: [["Per head", rs(o.price)], ["Delivery", o.delivery ? rs(o.delivery) : "free"]] }))}
          fmt={rs} valueLabel="Total" marker={{ value: plan.budget.limit - (plan.budget.total - f.cost), label: "MAX AFFORDABLE" }} />
        <div className="legend"><span><i style={{ background: S[0] }} />chosen</span><span><i style={{ background: CTX }} />other options</span><span><i style={{ background: "var(--primary)", height: 10, width: 2, borderRadius: 0 }} />most the budget allows for food after other spend</span></div>
      </ChartCard>
      <div className="split">
        <Card title="Menu options" icon="restaurant">
          <div className="tablewrap"><table>
            <thead><tr><th>Type</th><th className="num">Per head</th><th className="num">Delivery</th><th>Result</th></tr></thead>
            <tbody>{f.options.map((o) => <tr key={o.type} className={o.type === f.type ? "hl" : ""}><td><b>{o.type}</b></td><td className="num">{rs(o.price)}</td>
              <td className="num">{o.delivery ? rs(o.delivery) : "free"}</td><td>{o.type === f.type ? <Pill tone="ok">CHOSEN</Pill> : <span className="dim">not chosen</span>}</td></tr>)}</tbody></table></div>
        </Card>
        <Card title={`${f.qty} × ${f.type}`} icon="lunch_dining" sub="Order">
          <KV k="People on site" v={f.people} /><KV k="Boxes planned" v={f.qty} />
          <KV k="Caterer order (if stated)" v={f.order_qty ?? "—"} /><KV k="Per head" v={rs(f.unit_price)} /><KV k="Total" v={rs(f.cost)} />
        </Card>
      </div>
      <div className="grid g2"><Checks checks={checks} area="food" /><Decisions plan={plan} match={/Food|People on site/} /></div>
    </>
  );
});

export const Judging = guard(({ plan, checks }) => {
  const j = plan.judging;
  return (
    <>
      <Head title="Judging planning" sub="Every team seen, no judge overloaded" ok={status(checks, "judging")} />
      <div className="grid g4">
        <div className="tile"><span className="label">Judges used</span><div className="big">{j.used}</div><div className="muted">of {j.confirmed} confirmed</div></div>
        <div className="tile"><span className="label">Needed</span><div className="big">{j.needed}</div><div className="muted">max {j.max_teams} teams each</div></div>
        <div className="tile"><span className="label">Spare</span><div className="big">{j.spare}</div><div className="muted">contingency</div></div>
        <div className="tile"><span className="label">Honorarium</span><div className="big sm">{rs(j.cost)}</div><div className="muted">{rs(j.fee)} each</div></div>
      </div>
      {j.late_min > 0 && <div className="banner warn"><Icon name="schedule" />Judge 1 may be {j.late_min} min late — their slots are shifted and a spare judge is the contingency.</div>}
      <div className="grid g2">
        <ChartCard title="Judge × slot assignment" sub={`${plan.inputs.teams} teams, ${j.per_team_min} min each`} icon="gavel"
          table={{ cols: ["Judge", "Teams (start)"], rows: j.assignments.map((a) => [`J${a.judge}${a.late ? " (late)" : ""}`, a.teams.map((t) => `T${t.team} ${clock(plan, t.start)}`).join(", ")]) }}>
          <JudgeHeatmap plan={plan} />
        </ChartCard>
        <ChartCard title="Teams per judge" sub={`Limit: ${j.max_teams} teams each`} icon="balance"
          table={{ cols: ["Judge", "Teams", "Limit"], rows: j.assignments.map((a) => [`J${a.judge}`, a.teams.length, j.max_teams]) }}>
          <div className="scroll"><HBars items={j.assignments.map((a) => ({ label: `Judge ${a.judge}${a.late ? " ⏱" : ""}`, value: a.teams.length, color: a.teams.length > j.max_teams ? "#d03b3b" : S[0] }))}
            max={j.max_teams * 1.25} marker={{ value: j.max_teams, label: `MAX ${j.max_teams}` }} valueLabel="Teams" /></div>
        </ChartCard>
      </div>
      <div className="grid g2"><Checks checks={checks} area="judging" /><Decisions plan={plan} match={/Judge/} /></div>
    </>
  );
});

export const Budget = guard(({ plan, checks }) => {
  const b = plan.budget;
  return (
    <>
      <Head title="Budget planning" sub="Approved limit vs planned spend" ok={status(checks, "budget") && b.total <= b.limit} />
      <ChartCard title="Budget build-up" sub={`Each ledger line stacks up to the total, measured against the limit of ${rs(b.limit)}`} icon="stacked_bar_chart"
        table={{ cols: ["Line", "Amount"], rows: b.lines.map((l) => [l.item, rs(l.amount)]) }}>
        <Waterfall steps={waterfallSteps(plan)} limit={b.limit} ghost={b.proposals[0] ? { label: b.proposals[0].item, value: b.proposals[0].amount } : null} />
        {b.proposals[0] && <div className="legend"><span>Outlined bar = proposal “{b.proposals[0].item}” (not approved, not counted): {b.proposals[0].affordable ? "would still fit" : "would exceed the limit"}.</span></div>}
      </ChartCard>
      <ChartCard title="Where the money goes" sub="Share of the approved limit" icon="donut_small"
        table={{ cols: ["Part", "Amount"], rows: budgetParts(plan).map((p) => [p.name, rs(p.value)]) }}>
        <SegBar parts={budgetParts(plan)} fmt={rs} />
      </ChartCard>
      <div className="split">
        <Card title="Ledger" icon="payments">
          <div className="big">{rs(b.total)} <span className="muted" style={{ fontSize: 16 }}>of {rs(b.limit)}</span></div>
          <Meter pct={(b.total / b.limit) * 100} over={b.total > b.limit} />
          <div className="muted" style={{ margin: "6px 0 12px" }}>Remaining {rs(b.remaining)}</div>
          <div className="tablewrap"><table><tbody>
            {b.lines.map((l) => <tr key={l.item}><td>{l.item}</td><td className="num">{rs(l.amount)}</td></tr>)}
            <tr className="total"><td>Total</td><td className="num">{rs(b.total)}</td></tr></tbody></table></div>
        </Card>
        <div className="stack">
          <Card title="Pending proposals" icon="hourglass_top" sub="Never counted until approved">
            {b.proposals.length === 0 ? <div className="muted">None.</div> : b.proposals.map((p) => (
              <div key={p.item} className="item warn"><div className="rowflex spread"><b>{p.item}</b><span className="mono">{rs(p.amount)}</span></div>
                <div className="muted">Not approved — excluded. {p.affordable ? "Would fit in the remaining budget." : "Would NOT fit in the remaining budget."}</div></div>))}
          </Card>
          <Checks checks={checks} area="budget" />
        </div>
      </div>
    </>
  );
});
