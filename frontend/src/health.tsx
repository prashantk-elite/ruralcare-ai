import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, fmtDate, fmtDateTime, qs } from "./api";
import { Icon } from "./icons";
import { DEFAULT_RANGE, Range, RangePicker, TrendChart, rangeQuery } from "./charts";
import { Confirm, Empty, ErrorBox, Modal, Pager, Skeleton, useApi, useToast } from "./ui2";

export const KINDS = [
  { id: "bp", label: "Blood pressure", icon: "heart", unit: "mmHg" },
  { id: "heart_rate", label: "Heart rate", icon: "pulse", unit: "bpm" },
  { id: "steps", label: "Daily steps", icon: "steps", unit: "steps" },
  { id: "bmi", label: "BMI", icon: "scale", unit: "kg/m²" },
  { id: "weight", label: "Weight", icon: "scale", unit: "kg" },
  { id: "sleep", label: "Sleep", icon: "moon", unit: "hours" },
  { id: "water", label: "Water intake", icon: "drop", unit: "ml" },
  { id: "glucose", label: "Blood glucose", icon: "drop", unit: "mg/dL" },
];
export const KIND: Record<string, (typeof KINDS)[number]> = Object.fromEntries(KINDS.map(k => [k.id, k]));
const BARS = ["steps", "sleep", "water"];
const EMPTY_TEXT = "Your health journey starts here. Add your first health record to see your progress.";
const SRC = "Entered by you";
const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
const toLocalInput = (t?: number) => { const d = t ? new Date(t * 1000) : new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const bmiCat = (b: number) => (b < 18.5 ? "Underweight range" : b < 25 ? "Normal weight range" : b < 30 ? "Overweight range" : "Obesity range");

/* ---------- Add / edit record ---------- */
export function RecordModal({ kind, record, onClose, onSaved }: { kind?: string; record?: any; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [k, setK] = useState<string>(record?.kind || kind || "bp");
  const r = record || {};
  const [f, setF] = useState<any>(() => ({
    systolic: r.systolic ?? "", diastolic: r.diastolic ?? "", value: r.value ?? "", unit: "", height: r.height_cm ?? "", height_unit: "cm", weight: r.weight_kg ?? "", weight_unit: "kg",
    context: r.context || "", note: r.note || "", when: toLocalInput(r.recorded_at),
  }));
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (key: string) => (e: any) => setF({ ...f, [key]: e.target.value });
  const editing = !!record;
  const cm = num(String(f.height)) * (f.height_unit === "in" ? 2.54 : 1), kg = num(String(f.weight)) * (f.weight_unit === "lb" ? 0.45359237 : 1);
  const bmi = k === "bmi" && cm >= 100 && cm <= 230 && kg >= 20 && kg <= 350 ? kg / (cm / 100) ** 2 : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr("");
    const need = (v: any, name: string) => { if (!Number.isFinite(num(String(v)))) throw new Error(`Enter a number for ${name}`); return num(String(v)); };
    try {
      const body: any = { kind: k, recorded_at: new Date(f.when).getTime() / 1000, note: f.note || null };
      if (!Number.isFinite(body.recorded_at)) throw new Error("Choose the date and time");
      if (k === "bp") { body.systolic = need(f.systolic, "systolic pressure"); body.diastolic = need(f.diastolic, "diastolic pressure"); }
      else if (k === "bmi") { body.height = need(f.height, "height"); body.height_unit = f.height_unit; body.weight = need(f.weight, "weight"); body.weight_unit = f.weight_unit; }
      else {
        body.value = need(f.value, KIND[k].label.toLowerCase());
        if (k === "weight") body.unit = f.unit || "kg";
        if (k === "water") body.unit = f.unit || "ml";
        if (k === "glucose") { body.unit = f.unit || "mg/dL"; if (!f.context) throw new Error("Say when it was measured"); body.context = f.context; }
      }
      setBusy(true);
      await api(editing ? `/api/health-records/${record.id}` : "/api/health-records", { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) });
      toast(editing ? "Record updated" : "Record saved"); onSaved(); onClose();
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const field = (id: string, label: string, props: any = {}) => <div><label htmlFor={"rm-" + id}>{label}</label><input id={"rm-" + id} inputMode="decimal" value={f[id]} onChange={set(id)} {...props} /></div>;
  const unitSel = (id: string, opts: string[]) => <select aria-label="Unit" value={f[id] || opts[0]} onChange={set(id)}>{opts.map(o => <option key={o}>{o}</option>)}</select>;
  return <Modal title={editing ? "Edit health record" : "Add health record"} onClose={onClose}>
    <form onSubmit={submit} noValidate>
      <label htmlFor="rm-kind">Measurement type</label>
      <select id="rm-kind" value={k} disabled={editing} onChange={e => { setK(e.target.value); setErr(""); }}>{KINDS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
      {k === "bp" && <div className="row">{field("systolic", "Systolic, the top number (mmHg)")}{field("diastolic", "Diastolic, the bottom number (mmHg)")}</div>}
      {k === "heart_rate" && field("value", "Heart rate (beats per minute)")}
      {k === "steps" && <>{field("value", "Steps for the day or period", { inputMode: "numeric" })}<p className="muted">Steps are typed in by you. RuralCare AI does not connect to a pedometer or phone, so it cannot import them.</p></>}
      {k === "weight" && <div><label htmlFor="rm-value">Weight</label><div className="inline">{<input id="rm-value" inputMode="decimal" value={f.value} onChange={set("value")} />}{unitSel("unit", ["kg", "lb"])}</div></div>}
      {k === "bmi" && <>
        <div><label htmlFor="rm-height">Height</label><div className="inline"><input id="rm-height" inputMode="decimal" value={f.height} onChange={set("height")} />{unitSel("height_unit", ["cm", "in"])}</div></div>
        <div><label htmlFor="rm-weight">Weight</label><div className="inline"><input id="rm-weight" inputMode="decimal" value={f.weight} onChange={set("weight")} />{unitSel("weight_unit", ["kg", "lb"])}</div></div>
        <div className="note" aria-live="polite">{bmi ? <><b>BMI {bmi.toFixed(1)}</b>: {bmiCat(bmi)}. This is a screening number for adults, not a diagnosis.</> : "Enter height and weight to see your BMI."}</div></>}
      {k === "sleep" && field("value", "Hours slept")}
      {k === "water" && <div><label htmlFor="rm-value">Water drunk</label><div className="inline"><input id="rm-value" inputMode="decimal" value={f.value} onChange={set("value")} />{unitSel("unit", ["ml", "l"])}</div></div>}
      {k === "glucose" && <><div><label htmlFor="rm-value">Glucose</label><div className="inline"><input id="rm-value" inputMode="decimal" value={f.value} onChange={set("value")} />{unitSel("unit", ["mg/dL", "mmol/L"])}</div></div>
        <label htmlFor="rm-ctx">When was it measured?</label><select id="rm-ctx" value={f.context} onChange={set("context")}><option value="">Choose…</option><option value="fasting">Fasting (no food for 8 hours)</option><option value="random">Random (any time)</option><option value="post-meal">After a meal</option><option value="bedtime">At bedtime</option></select></>}
      <label htmlFor="rm-when">Date and time</label><input id="rm-when" type="datetime-local" value={f.when} max={toLocalInput()} onChange={set("when")} />
      <label htmlFor="rm-note">Notes (optional)</label><input id="rm-note" maxLength={300} value={f.note} onChange={set("note")} placeholder="For example: after a walk" />
      <p className="muted"><span className="tag">{SRC}</span> Every record is saved to your account only.</p>
      <p className="err" role="alert">{err}</p>
      <div className="actions"><button type="button" className="btn sec" onClick={onClose}>Cancel</button><button className="btn" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Save record"}</button></div>
    </form></Modal>;
}

/* ---------- Dashboard ---------- */
function StatCard({ id, s, onAdd }: { id: string; s: any; onAdd: (k: string) => void }) {
  const m = KIND[id], L = s.latest[id] || (id === "weight" && s.latest_weight ? { value: s.latest_weight.kg, recorded_at: s.latest_weight.recorded_at } : null);
  const goal = id === "steps" ? s.goals.steps : id === "water" ? s.goals.water_ml : null;
  const today = id === "steps" ? s.today.steps : id === "water" ? s.today.water_ml : null;
  let big = "No data yet", sub = "", pct: number | null = null;
  if (id === "steps" || id === "water") {
    const unit = id === "steps" ? "steps" : "ml";
    if (today !== null && today !== undefined) { big = `${Number(today).toLocaleString()} ${unit}`; sub = `of ${goal.toLocaleString()} ${unit} goal today`; pct = Math.min(100, Math.round((today / goal) * 100)); }
    else if (L) { big = "None today"; sub = `Last entry ${fmtDate(L.recorded_at)}: ${L.display}`; }
  } else if (id === "sleep") {
    if (L) { big = `${L.value} h`; sub = s.week_avg_sleep !== null ? `7-day average ${s.week_avg_sleep} h (${s.week_sleep_days} ${s.week_sleep_days === 1 ? "night" : "nights"} recorded)` : "Last entry"; }
  } else if (id === "bmi") { if (L) { big = `BMI ${Number(L.bmi).toFixed(1)}`; sub = L.category; } }
  else if (id === "weight") { if (L) { big = `${Number(L.value ?? L.kg).toFixed(1)} kg`; sub = "Latest weight"; } }
  else if (id === "bp") { if (L) { big = `${L.systolic}/${L.diastolic}`; sub = "mmHg"; } }
  else if (id === "glucose") { if (L) { big = `${L.value} mg/dL`; sub = `Measured: ${L.context}`; } }
  else if (id === "heart_rate") { if (L) { big = `${L.value} bpm`; sub = "Heart rate"; } }
  return <div className="stat">
    <Link to={`/health/${id}`} className="stat-main" aria-label={`${m.label}: ${big}. Open history`}>
      <div className="stat-h"><span className="ico"><Icon name={m.icon} size={18} /></span><b>{m.label}</b></div>
      <div className="stat-v">{big}</div>{sub && <div className="muted">{sub}</div>}
      {pct !== null && <div className="bar-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${m.label} progress`}><div className="bar-fill" style={{ width: pct + "%" }} /></div>}
      <div className="muted small">{L ? <>{fmtDateTime(L.recorded_at)} · <span className="tag">{SRC}</span></> : "Not recorded yet"}</div>
    </Link>
    <button className="btn sec sm add" onClick={() => onAdd(id)} aria-label={`Add ${m.label.toLowerCase()} record`}><Icon name="plus" size={14} /> Add</button></div>;
}

export function HealthDashboard() {
  const sum = useApi<any>("/api/health-records/summary"); const prof = useApi<any>("/api/profile"); const ann = useApi<any>("/api/announcements");
  const [modal, setModal] = useState<string | null>(null); const [pick, setPick] = useState(false);
  const [kind, setKind] = useState("bp"); const [range, setRange] = useState<Range>(DEFAULT_RANGE);
  const s = sum.data; const tracked: string[] = s?.tracked || [];
  const order = KINDS.map(k => k.id).filter(k => tracked.includes(k));
  const tabs = order.length ? order : KINDS.map(k => k.id);
  useEffect(() => { if (s && !tabs.includes(kind)) setKind(tabs[0]); }, [s]); // eslint-disable-line
  const now = new Date();
  const reload = () => { sum.reload(); };
  return <>
    <div className="greet"><div><h1>Hello, {prof.data?.display_name || "there"}</h1><p className="muted">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}{s?.last_updated ? ` · Last updated ${fmtDateTime(s.last_updated)}` : ""}</p></div>
      <div className="quick"><button className="btn" onClick={() => setModal("")}><Icon name="plus" size={16} /> Add health record</button><Link className="btn sec" to="/symptoms"><Icon name="search" size={16} /> Check symptoms</Link></div></div>
    {ann.data?.items?.map((a: any) => <div key={a.id} className={"note" + (a.level === "important" ? " alert" : "")} role="note"><b>{a.title}</b> {a.body}</div>)}
    <ErrorBox error={sum.error} retry={sum.reload} />
    {sum.loading && !s && <Skeleton h={110} n={3} />}
    {s && <>
      <div className="note small">{s.data_note}</div>
      {s.total_records === 0 ? <div className="card"><Empty title={EMPTY_TEXT}><button className="btn" onClick={() => setModal("")}>Add your first health record</button></Empty></div> : null}
      <div className="card"><div className="sec-h"><h2>Today</h2><button className="btn sec sm" onClick={() => setPick(true)}><Icon name="sliders" size={14} /> Choose what to track</button></div>
        <p>Tracking today: <b>{s.completion.done.length} of {s.completion.total}</b> measures recorded{s.completion.total ? "" : ". Choose what you want to track."}</p>
        <div className="chips">{tracked.map(k => <span key={k} className={"chip" + (s.completion.done.includes(k) ? " on" : "")}>{s.completion.done.includes(k) ? "✓ " : ""}{KIND[k]?.label}</span>)}</div></div>
      <div className="stats">{order.map(k => <StatCard key={k} id={k} s={s} onAdd={setModal} />)}</div>
      {!order.length && <div className="card"><Empty title="You are not tracking any measures yet" text="Pick the ones that matter to you. You do not need to track everything."><button className="btn" onClick={() => setPick(true)}>Choose what to track</button></Empty></div>}
      <div className="card"><div className="sec-h"><h2>Trends</h2></div>
        <div className="tabs" role="tablist" aria-label="Measure">{tabs.map(k => <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? "btn sm" : "btn sec sm"} onClick={() => setKind(k)}>{KIND[k].label}</button>)}</div>
        <RangePicker value={range} onChange={setRange} />
        <SeriesChart kind={kind} range={range} refresh={s.total_records} onAdd={() => setModal(kind)} /></div>
      <div className="card"><div className="sec-h"><h2>Recent records</h2><Link to="/records">See all</Link></div>
        {s.recent.length ? <ul className="plain">{s.recent.map((r: any) => <li key={r.id}><span><b>{KIND[r.kind]?.label}</b>: {r.display}</span><span className="muted">{fmtDateTime(r.recorded_at)} · <span className="tag">{SRC}</span></span></li>)}</ul> : <p className="muted">Nothing recorded yet.</p>}</div>
      <p className="muted small">{s.bmi_note}</p></>}
    {modal !== null && <RecordModal kind={modal || undefined} onClose={() => setModal(null)} onSaved={reload} />}
    {pick && s && <TrackPicker current={tracked} onClose={() => setPick(false)} onSaved={reload} />}
  </>;
}

function TrackPicker({ current, onClose, onSaved }: { current: string[]; onClose: () => void; onSaved: () => void }) {
  const [sel, setSel] = useState<string[]>(current); const toast = useToast(); const [err, setErr] = useState("");
  const save = async () => { try { await api("/api/profile", { method: "PATCH", body: JSON.stringify({ tracked: sel }) }); toast("Your choices were saved"); onSaved(); onClose(); } catch (x: any) { setErr(x.message); } };
  return <Modal title="Choose what to track" onClose={onClose}><p className="muted">You do not need every measure. Pick only what is useful for you; you can change this any time.</p>
    <fieldset className="plainfs"><legend className="sr">Measures to track</legend>{KINDS.map(k => <label key={k.id} className="chk"><input type="checkbox" checked={sel.includes(k.id)} onChange={e => setSel(e.target.checked ? [...sel, k.id] : sel.filter(x => x !== k.id))} />{k.label}</label>)}</fieldset>
    <p className="err" role="alert">{err}</p><div className="actions"><button className="btn sec" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></div></Modal>;
}

function SeriesChart({ kind, range, refresh, onAdd }: { kind: string; range: Range; refresh?: any; onAdd: () => void }) {
  const q = `/api/health-records/series${qs({ kind, ...rangeQuery(range) })}`;
  const { data, error, loading } = useApi<any>(q, [refresh]);
  const m = KIND[kind];
  if (loading && !data) return <Skeleton h={220} />;
  if (error) return <ErrorBox error={error} />;
  if (!data || !data.points.length) return <Empty title={`No ${m.label.toLowerCase()} records in this period`} text="Charts show only what you have saved. Add a record, or try a longer date range."><button className="btn sec" onClick={onAdd}>Add a record</button></Empty>;
  const bars = BARS.includes(kind);
  return <TrendChart title={`${m.label} trend`} unit={data.unit} points={data.points} mode={bars ? "bars" : "line"} goal={data.goal} fmt={kind === "steps" || kind === "water" ? (v: number) => Math.round(v).toLocaleString() : undefined}
    label1={kind === "bp" ? "Systolic" : undefined} label2={kind === "bp" ? "Diastolic" : undefined} />;
}

/* ---------- One measure in detail ---------- */
export function HealthDetail() {
  const { kind = "" } = useParams(); const m = KIND[kind];
  const [range, setRange] = useState<Range>(DEFAULT_RANGE); const [offset, setOffset] = useState(0);
  const [modal, setModal] = useState<any>(null); const [del, setDel] = useState<any>(null); const toast = useToast();
  const list = useApi<any>(m ? `/api/health-records${qs({ kind, limit: 10, offset, ...(range.custom ? { start: range.start, end: range.end } : { start: Math.floor(Date.now() / 1000) - range.days * 86400 }) })}` : null);
  const [tick, setTick] = useState(0);
  if (!m) return <Navigate to="/health" replace />;
  const refresh = () => { list.reload(); setTick(t => t + 1); };
  return <>
    <p><Link to="/health">← Health dashboard</Link></p>
    <div className="greet"><h1><Icon name={m.icon} size={26} /> {m.label}</h1><button className="btn" onClick={() => setModal({})}><Icon name="plus" size={16} /> Add {m.label.toLowerCase()} record</button></div>
    <div className="card"><RangePicker value={range} onChange={r => { setRange(r); setOffset(0); }} /><SeriesChart kind={kind} range={range} refresh={tick} onAdd={() => setModal({})} /></div>
    <div className="card tw"><h2>History</h2><ErrorBox error={list.error} retry={list.reload} />
      {list.loading && !list.data ? <Skeleton h={40} n={3} /> : list.data?.items.length ? <><table><thead><tr><th>When</th><th>Value</th><th>Source</th><th>Notes</th><th><span className="sr">Actions</span></th></tr></thead>
        <tbody>{list.data.items.map((r: any) => <tr key={r.id}><td>{fmtDateTime(r.recorded_at)}</td><td>{r.display}{r.context ? ` (${r.context})` : ""}{r.category ? ` · ${r.category}` : ""}</td><td><span className="tag">{SRC}</span></td><td>{r.note}</td>
          <td className="nowrap"><button className="btn sec sm" onClick={() => setModal(r)} aria-label="Edit record"><Icon name="edit" size={14} /></button> <button className="btn sec sm" onClick={() => setDel(r)} aria-label="Delete record"><Icon name="trash" size={14} /></button></td></tr>)}</tbody></table>
        <Pager total={list.data.total} limit={10} offset={offset} onPage={setOffset} /></> : <Empty title="No records in this period" text={EMPTY_TEXT} />}</div>
    {m.id === "bmi" && <p className="muted small">Adult BMI is a screening number, not a diagnosis. It may not suit children, pregnancy or very muscular people.</p>}
    {modal && <RecordModal kind={kind} record={modal.id ? modal : undefined} onClose={() => setModal(null)} onSaved={refresh} />}
    {del && <Confirm title="Delete this record?" body={<p>{del.display} on {fmtDateTime(del.recorded_at)} will be removed from your account. This cannot be undone.</p>} label="Delete" danger onNo={() => setDel(null)}
      onYes={async () => { try { await api(`/api/health-records/${del.id}`, { method: "DELETE" }); toast("Record deleted"); setDel(null); refresh(); } catch (x: any) { toast(x.message, "err"); } }} />}
  </>;
}

/* ---------- All records ---------- */
export function HealthRecords() {
  const [kind, setKind] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [offset, setOffset] = useState(0);
  const [modal, setModal] = useState<any>(null); const [del, setDel] = useState<any>(null); const toast = useToast();
  const start = from ? new Date(from + "T00:00:00").getTime() / 1000 : undefined, end = to ? new Date(to + "T23:59:59").getTime() / 1000 : undefined;
  const bad = !!(from && to && from > to);
  const list = useApi<any>(bad ? null : `/api/health-records${qs({ kind, start, end, limit: 15, offset })}`);
  return <>
    <div className="greet"><h1>Health Records</h1><button className="btn" onClick={() => setModal({})}><Icon name="plus" size={16} /> Add health record</button></div>
    <p className="sub">Everything here was entered by you and is visible only to you.</p>
    <div className="card filters"><div><label htmlFor="fk">Measurement type</label><select id="fk" value={kind} onChange={e => { setKind(e.target.value); setOffset(0); }}><option value="">All types</option>{KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select></div>
      <div><label htmlFor="ff">From</label><input id="ff" type="date" value={from} onChange={e => { setFrom(e.target.value); setOffset(0); }} /></div>
      <div><label htmlFor="ft">To</label><input id="ft" type="date" value={to} onChange={e => { setTo(e.target.value); setOffset(0); }} /></div>
      <div className="end"><button className="btn sec" onClick={() => { setKind(""); setFrom(""); setTo(""); setOffset(0); }}>Clear filters</button></div></div>
    {bad && <p className="err" role="alert">The start date must be before the end date.</p>}
    <ErrorBox error={list.error} retry={list.reload} />
    <div className="card tw">{list.loading && !list.data ? <Skeleton h={40} n={4} /> : list.data?.items.length ? <><table className="stack"><thead><tr><th>When</th><th>Type</th><th>Value</th><th>Source</th><th>Notes</th><th><span className="sr">Actions</span></th></tr></thead>
      <tbody>{list.data.items.map((r: any) => <tr key={r.id}><td data-l="When">{fmtDateTime(r.recorded_at)}</td><td data-l="Type"><Link to={`/health/${r.kind}`}>{KIND[r.kind]?.label}</Link></td><td data-l="Value">{r.display}{r.context ? ` (${r.context})` : ""}</td><td data-l="Source"><span className="tag">{SRC}</span></td><td data-l="Notes">{r.note}</td>
        <td className="nowrap act"><button className="btn sec sm" onClick={() => setModal(r)} aria-label="Edit record"><Icon name="edit" size={14} /></button> <button className="btn sec sm" onClick={() => setDel(r)} aria-label="Delete record"><Icon name="trash" size={14} /></button></td></tr>)}</tbody></table>
      <Pager total={list.data.total} limit={15} offset={offset} onPage={setOffset} /></> : !list.loading ? <Empty title={kind || from || to ? "No records match these filters" : EMPTY_TEXT}>{!(kind || from || to) && <button className="btn" onClick={() => setModal({})}>Add your first health record</button>}</Empty> : null}</div>
    {modal && <RecordModal record={modal.id ? modal : undefined} onClose={() => setModal(null)} onSaved={list.reload} />}
    {del && <Confirm title="Delete this record?" body={<p>{KIND[del.kind]?.label}: {del.display} on {fmtDateTime(del.recorded_at)} will be removed. This cannot be undone.</p>} label="Delete" danger onNo={() => setDel(null)}
      onYes={async () => { try { await api(`/api/health-records/${del.id}`, { method: "DELETE" }); toast("Record deleted"); setDel(null); list.reload(); } catch (x: any) { toast(x.message, "err"); } }} />}
  </>;
}

/* ---------- Combined history ---------- */
export function HealthHistory({ onOpenAssessment }: { onOpenAssessment?: (id: number) => void }) {
  const hist = useApi<any>("/api/history?limit=60"); const plans = useApi<any>("/api/wellness/history?limit=10");
  const [filter, setFilter] = useState("all"); const [ask, setAsk] = useState<"records" | "symptoms" | null>(null); const [view, setView] = useState<any>(null); const toast = useToast();
  const nav = useNavigate();
  const items = (hist.data?.items || []).filter((i: any) => filter === "all" || i.type === filter);
  const lvl = ["", "Level 1: self-care information", "Level 2: consultation recommended", "Level 3: urgent attention"];
  const openAssessment = async (id: number) => { try { setView(await api(`/api/symptoms/history/${id}`)); } catch (x: any) { toast(x.message, "err"); } };
  return <>
    <h1>Health History</h1><p className="sub">Your own measurements, symptom assessments, saved wellness plans and sign-ins in one place. Only you can see this.</p>
    <div className="note small">Symptoms change. An earlier result is not a substitute for a current medical evaluation.</div>
    <div className="tabs" role="tablist" aria-label="Filter history">{[["all", "Everything"], ["record", "Measurements"], ["assessment", "Symptom assessments"], ["wellness", "Wellness plans"], ["activity", "Sign-ins"]].map(([k, l]) => <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? "btn sm" : "btn sec sm"} onClick={() => setFilter(k)}>{l}</button>)}</div>
    <ErrorBox error={hist.error} retry={hist.reload} />
    <div className="card">{hist.loading && !hist.data ? <Skeleton h={44} n={4} /> : items.length ? <ul className="timeline">{items.map((i: any, n: number) => <li key={n}><span className="dotl" aria-hidden /><div><b>{i.type === "record" ? KIND[i.kind]?.label : i.title}</b>
      {i.type === "record" && <> · {i.summary} <span className="tag">{SRC}</span></>}
      {i.type === "assessment" && <> · {lvl[i.level]}<div className="muted">{i.summary}</div> <button className="btn sec sm" onClick={() => openAssessment(i.id)}>View result</button></>}
      <div className="muted small">{fmtDateTime(i.ts)}</div></div></li>)}</ul> : <Empty title="Nothing here yet" text={EMPTY_TEXT}><Link className="btn" to="/health">Go to Health Dashboard</Link></Empty>}</div>
    <div className="card"><h2>Saved wellness plans</h2>{plans.data?.items?.length ? <ul className="plain">{plans.data.items.map((p: any) => <li key={p.id}><span><b>{p.title}</b> <span className="muted">{fmtDate(p.created_at)}</span></span><span><button className="btn sec sm" onClick={() => nav("/wellness")}>Open Diet and Wellness</button> <button className="btn sec sm" aria-label="Delete plan" onClick={async () => { try { await api(`/api/wellness/history/${p.id}`, { method: "DELETE" }); toast("Plan deleted"); plans.reload(); hist.reload(); } catch (x: any) { toast(x.message, "err"); } }}><Icon name="trash" size={14} /></button></span></li>)}</ul> : <p className="muted">No saved plans. You can save one from Diet and Wellness.</p>}</div>
    <div className="card"><h2>Delete my history</h2><p className="muted">You control your data. These actions remove it from the server and cannot be undone.</p>
      <div className="actions left"><button className="btn sec" onClick={() => setAsk("records")}><Icon name="trash" size={14} /> Delete all my health records</button><button className="btn sec" onClick={() => setAsk("symptoms")}><Icon name="trash" size={14} /> Delete all my symptom assessments</button></div></div>
    {ask && <Confirm title={ask === "records" ? "Delete all health records?" : "Delete all symptom assessments?"} body={<p>{ask === "records" ? "Every measurement you entered will be permanently removed." : "Every saved symptom assessment will be permanently removed."} This cannot be undone.</p>} label="Delete everything" danger onNo={() => setAsk(null)}
      onYes={async () => { try { const r = await api(ask === "records" ? "/api/health-records?confirm=yes" : "/api/symptoms/history?confirm=yes", { method: "DELETE" }); toast(`${r.deleted} deleted`); setAsk(null); hist.reload(); } catch (x: any) { toast(x.message, "err"); } }} />}
    {view && <Modal title="Saved symptom assessment" onClose={() => setView(null)} wide><p className="muted">{fmtDateTime(view.created_at)} · {lvl[view.result.level]}</p><p>{view.result.summary}</p>
      <p><b>Recommended next step:</b> {view.result.recommended_next_step?.en}</p><p><b>Reason:</b> {view.result.reason}</p><p className="muted">{view.result.not_a_diagnosis?.en}</p>
      <div className="actions"><button className="btn sec" onClick={async () => { try { await api(`/api/symptoms/history/${view.id}`, { method: "DELETE" }); toast("Assessment deleted"); setView(null); hist.reload(); } catch (x: any) { toast(x.message, "err"); } }}>Delete this assessment</button><button className="btn" onClick={() => setView(null)}>Close</button></div></Modal>}
  </>;
}
