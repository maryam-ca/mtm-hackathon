import { Icon } from "./ui.jsx";

export default function Topbar({ query, onQuery, state, health, onIngest }) {
  const run = state?.runs?.[state.runs.length - 1];
  const valid = state?.valid;
  return (
    <header className="topbar">
      <div className="search">
        <Icon name="search" />
        <input value={query} onChange={(e) => onQuery(e.target.value)} aria-label="Search facts and messages"
          placeholder="Search facts, evidence, senders, messages…" />
      </div>
      <div className="top-right">
        {health && (
          <span className="chip hide-sm" title={`Reading engine: ${health.engine.model}. Data saved in ${health.database.driver} database “${health.database.name}”.`}>
            <Icon name={health.engine.uses_llm ? "psychology" : "rule"} size="sm" />
            {health.engine.uses_llm ? health.engine.model : "RULES ENGINE · 0 TOKENS"}
            <span className="dim">·</span><Icon name="database" size="sm" />{health.database.name}
          </span>
        )}
        {state?.plan && (
          <span className="chip hide-sm"><span className={`dot ${valid ? "ok" : "bad"}`} />{valid ? "PLAN VALID" : "CHECKS FAILING"}</span>
        )}
        {run && <span className="chip hide-sm"><Icon name="update" size="sm" />Run {run.id} · {run.kind}</span>}
        <button className="btn primary" onClick={onIngest}><Icon name="add_circle" size="sm" />Ingest messages</button>
      </div>
    </header>
  );
}
