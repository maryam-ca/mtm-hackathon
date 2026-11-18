import { Icon } from "./ui.jsx";

export const NAV = [
  { group: "Core", items: [
    { id: "overview", label: "Overview", icon: "grid_view" },
    { id: "messages", label: "Messages & Inbox", icon: "inbox", count: "messages" },
    { id: "facts", label: "Fact Store & Evidence", icon: "database" },
    { id: "conflicts", label: "Conflict Detection", icon: "warning", count: "conflicts", bad: true },
  ] },
  { group: "Planning Modules", items: [
    { id: "venue", label: "Venue Planning", icon: "location_on" },
    { id: "schedule", label: "Schedule Planning", icon: "calendar_month" },
    { id: "food", label: "Food Planning", icon: "restaurant" },
    { id: "judging", label: "Judging Planning", icon: "gavel" },
    { id: "budget", label: "Budget Planning", icon: "payments" },
  ] },
  { group: "Governance & AI", items: [
    { id: "validation", label: "Cross-Area Validation", icon: "verified", count: "failing", bad: true },
    { id: "trace", label: "AI Model Trace", icon: "hub", count: "tokens" },
    { id: "rejected", label: "Rejected Messages", icon: "unsubscribe", count: "rejected", bad: true },
    { id: "reports", label: "Reports & Exports", icon: "analytics" },
  ] },
];

export default function Sidebar({ page, onNav, counts, state }) {
  const run = state?.runs?.[state.runs.length - 1];
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo"><Icon name="hub" /></div>
        <div><b>MINDSYNC</b><span className="label">Event Synthesis</span></div>
      </div>
      {NAV.map((g) => (
        <nav className="navgroup" key={g.group} aria-label={g.group}>
          <div className="label">{g.group}</div>
          {g.items.map((i) => {
            const c = i.count ? counts[i.count] : null;
            return (
              <button key={i.id} className={`nav ${page === i.id ? "active" : ""}`} aria-current={page === i.id ? "page" : undefined} onClick={() => onNav(i.id)}>
                <Icon name={i.icon} />
                <span className="grow">{i.label}</span>
                {c ? <span className={`count ${i.bad ? "bad" : ""}`}>{c}</span> : null}
              </button>
            );
          })}
        </nav>
      ))}
      <div className="sidefoot">
        <div className="status">
          <span className="rowflex"><span className={`dot ${run ? (run.outcome === "failed" ? "bad" : "live") : "warn"}`} />
            <span className="label" style={{ color: "var(--primary)" }}>{run ? `RUN ${run.id} · ${run.outcome}` : "NO RUNS YET"}</span></span>
        </div>
      </div>
    </aside>
  );
}
