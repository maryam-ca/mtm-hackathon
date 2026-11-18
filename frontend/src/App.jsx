import { useCallback, useEffect, useMemo, useState } from "react";
import { getState, ingest, getExport, getHealth, getSamples, ingestSample } from "./api.js";
import Sidebar from "./components/Sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import IngestModal from "./components/IngestModal.jsx";
import { Icon } from "./components/ui.jsx";
import Overview from "./pages/Overview.jsx";
import Messages from "./pages/Messages.jsx";
import Facts from "./pages/Facts.jsx";
import Conflicts from "./pages/Conflicts.jsx";
import { Venue, Schedule, Food, Judging, Budget } from "./pages/Planning.jsx";
import Validation from "./pages/Validation.jsx";
import Trace from "./pages/Trace.jsx";
import Rejected from "./pages/Rejected.jsx";
import Reports from "./pages/Reports.jsx";

const PLANNING = { venue: Venue, schedule: Schedule, food: Food, judging: Judging, budget: Budget };

export default function App() {
  const [state, setState] = useState(null);
  const [page, setPage] = useState(() => window.location.hash.slice(1) || "overview");
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState(null);
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    try { setState(await getState()); setError(""); } catch (e) { setError(e.message); }
  }, []);
  const [health, setHealth] = useState(null);
  const [samples, setSamples] = useState([]);
  useEffect(() => {
    refresh();
    getHealth().then(setHealth).catch(() => {});
    getSamples().then(setSamples).catch(() => {});
  }, [refresh]);

  const finish = ({ result, state }) => {
    setState(state); setLast(result); setModal(false);
    setPage(result.outcome === "rejected" ? "rejected" : "overview");
    window.location.hash = result.outcome === "rejected" ? "rejected" : "overview";
  };
  const submit = async (text, name, mode) => {
    setBusy(true); setError("");
    try { finish(await ingest(text, name, mode)); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const runSample = async (name) => {
    setBusy(true); setError("");
    try { finish(await ingestSample(name)); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const download = async () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([await getExport()], { type: "text/plain" }));
    a.download = "final_plan_and_trace.txt"; a.click();
  };

  const onQuery = (q) => { setQuery(q); if (q && !["facts", "messages"].includes(page)) setPage("facts"); };
  const nav = (p) => { setPage(p); window.location.hash = p; };

  const counts = useMemo(() => {
    if (!state) return {};
    return {
      messages: state.messages.length || null,
      conflicts: state.events.filter((e) => e.kind === "conflict").length || null,
      failing: state.checks.filter((c) => !c.ok).length || null,
      tokens: state.totals.tokens_in + state.totals.tokens_out || null,
      rejected: state.messages.filter((m) => m.status === "rejected").length || null,
    };
  }, [state]);

  const props = { state, query, go: nav, openIngest: () => setModal(true), download, samples, runSample, busy, health };
  const Planning = PLANNING[page];

  return (
    <div className="shell">
      <Sidebar page={page} onNav={nav} counts={counts} state={state} />
      <div style={{ minWidth: 0 }}>
        <Topbar query={query} onQuery={onQuery} state={state} health={health} onIngest={() => setModal(true)} />
        <main>
          {error && <div className="banner bad" role="alert"><Icon name="error" />{error}<button className="x" onClick={() => setError("")}><Icon name="close" size="sm" /></button></div>}
          {last && (
            <div className={`banner ${["rejected", "failed"].includes(last.outcome) ? "bad" : last.outcome === "invalid" ? "warn" : "ok"}`}>
              <Icon name={last.outcome === "committed" ? "check_circle" : "warning"} />
              <span><b>{last.kind === "full" ? "Full run" : "Update"} · {last.outcome}</b> — {last.summary} ({(last.duration_ms / 1000).toFixed(1)}s)</span>
              <button className="x" onClick={() => setLast(null)} aria-label="Dismiss"><Icon name="close" size="sm" /></button>
            </div>
          )}
          {!state ? <div className="muted">Loading…</div>
            : page === "overview" ? <Overview {...props} />
            : page === "messages" ? <Messages {...props} />
            : page === "facts" ? <Facts {...props} />
            : page === "conflicts" ? <Conflicts {...props} />
            : Planning ? <Planning {...props} />
            : page === "validation" ? <Validation {...props} />
            : page === "trace" ? <Trace {...props} />
            : page === "rejected" ? <Rejected {...props} />
            : <Reports {...props} />}
        </main>
      </div>
      <IngestModal open={modal} busy={busy} hasPlan={!!state?.plan} samples={samples} onClose={() => setModal(false)} onSubmit={submit} />
    </div>
  );
}
