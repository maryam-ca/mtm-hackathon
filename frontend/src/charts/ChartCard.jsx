import { useState } from "react";
import { Card, Icon } from "../components/ui.jsx";

/** Card with a chart/table toggle. `table` = { cols: [...], rows: [[...]] } holds the same data as the chart. */
export default function ChartCard({ title, sub, icon = "monitoring", legend, table, children, className = "" }) {
  const [view, setView] = useState("chart");
  return (
    <Card title={title} sub={sub} icon={icon} className={`viz ${className}`}
      right={table && <button className="btn sm viewtoggle" onClick={() => setView(view === "chart" ? "table" : "chart")} aria-pressed={view === "table"}>
        <Icon name={view === "chart" ? "table_rows" : "bar_chart"} size="sm" />{view === "chart" ? "Table" : "Chart"}</button>}>
      {view === "table" && table ? (
        <div className="tablewrap"><table>
          <thead><tr>{table.cols.map((c, i) => <th key={c} className={i ? "num" : ""}>{c}</th>)}</tr></thead>
          <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={j ? "num" : ""}>{v}</td>)}</tr>)}</tbody></table></div>
      ) : (
        <>{children}{legend && <div className="legend">{legend.map((l) => <span key={l.name}><i style={{ background: l.color }} />{l.name}</span>)}</div>}</>
      )}
    </Card>
  );
}
