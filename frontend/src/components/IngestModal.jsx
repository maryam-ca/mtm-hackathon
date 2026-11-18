import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui.jsx";

export default function IngestModal({ open, busy, hasPlan, samples = [], onClose, onSubmit }) {
  const [text, setText] = useState("");
  const [name, setName] = useState("pasted");
  const [mode, setMode] = useState("auto");
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  if (!open) return null;

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setText(await f.text()); setName(f.name); e.target.value = "";
  };
  const run = async () => {
    if (!text.trim() || busy) return;
    await onSubmit(text, name, mode);
    setText("");
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Ingest messages">
        <div className="card-head" style={{ margin: 0 }}>
          <div className="title-row"><div className="ico-box"><Icon name="add_comment" /></div><h3>Ingest messages</h3></div>
          <button className="btn sm" onClick={onClose} aria-label="Close"><Icon name="close" size="sm" /></button>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          One input, one flow. A pack of 4+ messages starts a new plan; fewer messages update the current plan.
          The model only <b>reads</b>; planning and validation are plain code.
        </p>
        <textarea rows={10} autoFocus placeholder="Paste messages here (English / Roman Urdu), or load a .txt file…" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="rowflex spread">
          <div className="rowflex">
            <input ref={fileRef} type="file" accept=".txt,text/plain" hidden onChange={onFile} />
            <button className="btn" onClick={() => fileRef.current.click()}><Icon name="upload_file" size="sm" /> Load .txt</button>
            {samples.length > 0 && (
              <select value="" aria-label="Load a sample" onChange={(e) => { const s = samples.find((x) => x.name === e.target.value); if (s) { setText(s.text); setName(s.name); } }}>
                <option value="">Load sample…</option>
                {samples.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.messages} msg)</option>)}
              </select>
            )}
            <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Treatment">
              <option value="auto">Auto-detect</option>
              <option value="full">Force new plan</option>
              <option value="update" disabled={!hasPlan}>Force update</option>
            </select>
          </div>
          <span className="dim mono" style={{ fontSize: 11 }}>{text ? `${name} · ${text.length} chars` : ""}</span>
        </div>
        <button className="btn primary" style={{ justifyContent: "center", padding: 12 }} disabled={busy || !text.trim()} onClick={run}>
          <Icon name={busy ? "progress_activity" : "psychology"} />{busy ? "Reading with model…" : "Process messages (run AI)"}
        </button>
      </div>
    </div>
  );
}
