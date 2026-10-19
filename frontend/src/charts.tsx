import { useState } from "react";
import { fmtDateTime } from "./api";

export type Pt = { t: number; v: number; v2?: number; day?: string; context?: string };
const dshort = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const nice = (lo: number, hi: number) => {
  if (hi === lo) { hi = lo + 1; lo = Math.max(0, lo - 1); }
  const span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / 4))), m = span / 4 / step;
  const s = (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * step;
  const a = Math.floor(lo / s) * s, b = Math.ceil(hi / s) * s, ticks: number[] = [];
  for (let v = a; v <= b + s / 2; v += s) ticks.push(+v.toFixed(6));
  return { a, b, ticks };
};

/** Accessible SVG chart drawn from real saved points. Hover or keyboard-focus a point to read its exact value.
 *  mode="line": readings over time (optionally a second series, e.g. diastolic). mode="bars": one bar per day, with an optional goal line. */
export function TrendChart({ title, unit, points, mode = "line", label1, label2, goal, fmt }: {
  title: string; unit: string; points: Pt[]; mode?: "line" | "bars"; label1?: string; label2?: string; goal?: number | null; fmt?: (v: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const f = fmt || ((v: number) => String(Math.round(v * 10) / 10));
  const W = 600, H = 240, L = 46, R = 14, T = 14, B = 34;
  const vals = points.flatMap(p => [p.v, ...(p.v2 !== undefined ? [p.v2] : [])]).concat(goal ? [goal] : []);
  const { a, b, ticks } = nice(mode === "bars" ? 0 : Math.min(...vals), Math.max(...vals));
  const y = (v: number) => T + (1 - (v - a) / (b - a || 1)) * (H - T - B);
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const x = (i: number, t: number) => mode === "bars" ? L + ((i + 0.5) / points.length) * (W - L - R) : points.length === 1 ? (L + W - R) / 2 : L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
  const bw = Math.max(4, Math.min(34, ((W - L - R) / points.length) * 0.7));
  const path = (key: "v" | "v2") => points.filter(p => p[key] !== undefined).map((p, i) => `${i ? "L" : "M"}${x(points.indexOf(p), p.t).toFixed(1)},${y(p[key] as number).toFixed(1)}`).join(" ");
  const sel = active !== null ? points[active] : points[points.length - 1];
  const summary = `${title}. ${points.length} ${points.length === 1 ? "entry" : "entries"} from ${dshort(t0)} to ${dshort(t1)}. Latest: ${sel.v2 !== undefined ? f(sel.v) + " over " + f(sel.v2) : f(sel.v)} ${unit}.`;
  const labelIdx = points.length <= 6 ? points.map((_, i) => i) : [0, Math.floor(points.length / 2), points.length - 1];
  return <figure className="trend">
    <div className="readout" aria-live="polite"><b>{sel.v2 !== undefined ? `${f(sel.v)}/${f(sel.v2)}` : f(sel.v)} {unit}</b><span className="muted"> {mode === "bars" ? (sel.day || fmtDateTime(sel.t)) : fmtDateTime(sel.t)}{sel.context ? ` (${sel.context})` : ""}</span></div>
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={summary} onMouseLeave={() => setActive(null)}>
      {ticks.map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="axis">{f(v)}</text></g>)}
      {goal ? <g><line x1={L} x2={W - R} y1={y(goal)} y2={y(goal)} className="goal" /><text x={W - R} y={y(goal) - 5} textAnchor="end" className="axis">Goal {f(goal)}</text></g> : null}
      {mode === "bars"
        ? points.map((p, i) => <rect key={i} x={x(i, p.t) - bw / 2} y={y(p.v)} width={bw} height={Math.max(1, y(a) - y(p.v))} rx="4" className={"bar" + (active === i ? " on" : "")} tabIndex={0}
            role="img" aria-label={`${p.day || dshort(p.t)}: ${f(p.v)} ${unit}`} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} />)
        : <>{points.length > 1 && <path d={path("v")} className="line s1" fill="none" />}
          {points.some(p => p.v2 !== undefined) && points.length > 1 && <path d={path("v2")} className="line s2" fill="none" />}
          {points.map((p, i) => <g key={i}>
            <circle cx={x(i, p.t)} cy={y(p.v)} r={active === i ? 6 : 4} className="dot s1" tabIndex={0} role="img" aria-label={`${dshort(p.t)}: ${f(p.v)}${p.v2 !== undefined ? "/" + f(p.v2) : ""} ${unit}`}
              onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} />
            {p.v2 !== undefined && <circle cx={x(i, p.t)} cy={y(p.v2)} r={active === i ? 6 : 4} className="dot s2" onMouseEnter={() => setActive(i)} />}</g>)}</>}
      {labelIdx.map(i => <text key={i} x={x(i, points[i].t)} y={H - 10} textAnchor="middle" className="axis">{dshort(points[i].t)}</text>)}
    </svg>
    {(label1 || label2) && <figcaption className="legend">{label1 && <span><i className="sw s1" />{label1}</span>}{label2 && <span><i className="sw s2" />{label2}</span>}</figcaption>}
  </figure>;
}

export type Range = { days: number; start?: number; end?: number; custom: boolean };
export const DEFAULT_RANGE: Range = { days: 30, custom: false };
/** 7 / 30 / 90 days or a custom date range. */
export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const apply = (a: string, b: string) => {
    if (!a || !b || a > b) return;
    onChange({ days: 30, custom: true, start: new Date(a + "T00:00:00").getTime() / 1000, end: new Date(b + "T23:59:59").getTime() / 1000 });
  };
  return <div className="range" role="group" aria-label="Date range">
    {[7, 30, 90].map(d => <button key={d} className={!value.custom && value.days === d ? "btn sm" : "btn sec sm"} aria-pressed={!value.custom && value.days === d} onClick={() => onChange({ days: d, custom: false })}>Last {d} days</button>)}
    <button className={value.custom ? "btn sm" : "btn sec sm"} aria-pressed={value.custom} onClick={() => { const b = today, a = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10); setFrom(a); setTo(b); apply(a, b); }}>Custom</button>
    {value.custom && <span className="custom"><label className="sr" htmlFor="rf">From</label><input id="rf" type="date" value={from} max={today} onChange={e => { setFrom(e.target.value); apply(e.target.value, to); }} />
      <label className="sr" htmlFor="rt">To</label><input id="rt" type="date" value={to} max={today} onChange={e => { setTo(e.target.value); apply(from, e.target.value); }} /></span>}
  </div>;
}
export const rangeQuery = (r: Range) => r.custom ? { start: r.start, end: r.end } : { days: r.days };
