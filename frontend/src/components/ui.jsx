export const Icon = ({ name, size, className = "" }) => (
  <span className={`icon ${size || ""} ${className}`} aria-hidden="true">{name}</span>
);

export const Pill = ({ tone = "", dot, children, title }) => (
  <span className={`pill ${tone}`} title={title}>
    {dot && <span className={`dot ${tone}`} style={{ width: 6, height: 6 }} />}
    {children}
  </span>
);

export const Card = ({ title, icon, right, children, className = "", sub }) => (
  <section className={`card ${className}`}>
    {(title || right) && (
      <div className="card-head">
        <div className="title-row">
          {icon && <div className="ico-box"><Icon name={icon} /></div>}
          <div>
            <h3>{title}</h3>
            {sub && <div className="label" style={{ marginTop: 2 }}>{sub}</div>}
          </div>
        </div>
        {right}
      </div>
    )}
    {children}
  </section>
);

export const Empty = ({ icon = "inbox", children, action }) => (
  <div className="card empty">
    <Icon name={icon} className="lg" />
    <div>{children}</div>
    {action}
  </div>
);

export const KV = ({ k, v }) => (
  <div className="kv"><span>{k}</span><span>{v}</span></div>
);

export const Meter = ({ pct, over }) => (
  <div className="meter"><div className={over ? "over" : ""} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
);

export function Ring({ pct, color = "#38bdf8" }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} fill="none" stroke="#25293a" strokeWidth="6" />
        <circle cx="42" cy="42" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <div className="num">{Math.round(pct)}<span className="dim" style={{ fontSize: 11 }}>%</span></div>
    </div>
  );
}

export const val = (v) => (v !== null && typeof v === "object" ? JSON.stringify(v) : String(v));
