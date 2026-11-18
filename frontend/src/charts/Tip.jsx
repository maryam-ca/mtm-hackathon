import { useState } from "react";

export function useTip() {
  const [tip, setTip] = useState(null);
  const bind = (content) => ({
    tabIndex: 0,
    onMouseEnter: (e) => setTip({ x: e.clientX, y: e.clientY, content }),
    onMouseMove: (e) => setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t)),
    onMouseLeave: () => setTip(null),
    onFocus: (e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.left + r.width / 2, y: r.top, content }); },
    onBlur: () => setTip(null),
  });
  const node = tip ? (
    <div className="tipbox" role="tooltip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 300), top: Math.max(8, tip.y - 14) }}>
      <b>{tip.content.title}</b>
      {(tip.content.rows || []).map(([k, v]) => <div className="r" key={k}><span>{k}</span><span>{v}</span></div>)}
    </div>
  ) : null;
  return { bind, node };
}
