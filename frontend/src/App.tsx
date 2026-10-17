import { useState, useEffect, FormEvent } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { api, setToken } from "./api";

const MENU: Record<string, [string, string][]> = {
  worker: [["/", "Dashboard"], ["/participants", "Participants"], ["/screening", "Screening"], ["/nutrition", "Nutrition"], ["/followups", "Follow-ups"], ["/guide", "Guide"]],
  researcher: [["/", "Dashboard"], ["/lab", "Research Lab"], ["/guide", "Guide"]],
  admin: [["/", "Dashboard"], ["/lab", "Research Lab"], ["/audit", "Audit log"], ["/guide", "Guide"]],
};

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); api(path).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(load, [path]);
  return { data, error, loading, reload: load };
}
const Status = ({ loading, error }: { loading: boolean; error: string }) =>
  loading ? <p role="status">Loading…</p> : error ? <p className="err" role="alert">{error}</p> : null;

function Login({ onLogin }: { onLogin: (role: string) => void }) {
  const [email, setEmail] = useState("worker@demo.local"); const [pw, setPw] = useState(""); const [err, setErr] = useState("");
  const submit = async (e: FormEvent) => { e.preventDefault(); setErr("");
    try { const r = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: pw }) }); setToken(r.token); onLogin(r.role); }
    catch (x: any) { setErr(x.message); } };
  return <main><div className="card"><h1>RuralCare AI</h1>
    <div className="note">Academic research prototype. Demo accounts only (password <code>demo-only</code>). Not a diagnostic device.</div>
    <form onSubmit={submit}><label htmlFor="e">Email</label><input id="e" value={email} onChange={e => setEmail(e.target.value)} />
      <label htmlFor="p">Password</label><input id="p" type="password" value={pw} onChange={e => setPw(e.target.value)} />
      <p className="err" role="alert">{err}</p><button className="btn">Sign in</button></form>
    <p className="muted">Try: worker@demo.local, researcher@demo.local, admin@demo.local</p></div></main>;
}

function Dashboard() {
  const { data, error, loading } = useLoad<any>("/api/analytics/community");
  const tbl = (title: string, rows: any[]) => <div className="card"><h2>{title}</h2><div className="tw"><table><thead><tr><th>Group</th><th>Participants</th></tr></thead>
    <tbody>{rows.map(r => <tr key={r.group}><td>{r.group}</td><td>{r.suppressed ? `Suppressed (<${data.min_group_size})` : r.count}</td></tr>)}</tbody></table></div></div>;
  return <><h1>Community Insights</h1><div className="note">Aggregate counts only. Small groups are hidden. Registered participants in this deployment may be demo entries.</div>
    <Status loading={loading} error={error} />{data && <>{tbl("By community", data.by_community)}{tbl("By age band", data.by_age_band)}</>}</>;
}

function Participants() {
  const { data, error, loading, reload } = useLoad<any[]>("/api/participants");
  const [f, setF] = useState({ age_band: "30-44", community: "C1", consent_given: false }); const [msg, setMsg] = useState("");
  const add = async (e: FormEvent) => { e.preventDefault(); setMsg("");
    try { const r = await api("/api/participants", { method: "POST", body: JSON.stringify(f) }); setMsg("Registered " + r.code); reload(); } catch (x: any) { setMsg(x.message); } };
  return <><h1>Participants</h1><Status loading={loading} error={error} />
    {data && (data.length ? <div className="card tw"><table><thead><tr><th>ID</th><th>Code</th><th>Age band</th><th>Community</th></tr></thead>
      <tbody>{data.map(p => <tr key={p.id}><td>{p.id}</td><td>{p.code}</td><td>{p.age_band}</td><td>{p.community}</td></tr>)}</tbody></table></div>
      : <div className="card">No participants yet. Register the first one below.</div>)}
    <form className="card" onSubmit={add}><h2>Register participant</h2><div className="row">
      <div><label htmlFor="ab">Age band (adults)</label><select id="ab" value={f.age_band} onChange={e => setF({ ...f, age_band: e.target.value })}>{["18-29", "30-44", "45-59", "60+"].map(x => <option key={x}>{x}</option>)}</select></div>
      <div><label htmlFor="cm">Community code</label><input id="cm" value={f.community} onChange={e => setF({ ...f, community: e.target.value })} /></div></div>
      <label><input type="checkbox" checked={f.consent_given} onChange={e => setF({ ...f, consent_given: e.target.checked })} />Participant gave explicit consent for screening and nutrition research</label>
      <p role="alert" className={msg.startsWith("Registered") ? "" : "err"}>{msg}</p><button className="btn">Register</button></form></>;
}

function Screening() {
  const { data: ps } = useLoad<any[]>("/api/participants");
  const [f, setF] = useState<any>({ participant_id: "", age: "", height_cm: "", weight_kg: "", systolic: "", diastolic: "", glucose_mgdl: "", glucose_type: "", urgent_symptoms: false });
  const [err, setErr] = useState(""); const [res, setRes] = useState<any>(null); const [as, setAs] = useState<any>(null);
  const num = (v: string) => v === "" ? null : Number(v);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const submit = async (e: FormEvent) => { e.preventDefault(); setErr(""); setRes(null); setAs(null);
    const body = { participant_id: Number(f.participant_id), age: num(f.age), height_cm: num(f.height_cm), weight_kg: num(f.weight_kg), systolic: num(f.systolic), diastolic: num(f.diastolic), glucose_mgdl: num(f.glucose_mgdl), glucose_type: f.glucose_type || null, urgent_symptoms: f.urgent_symptoms };
    try { setRes(await api("/api/screenings", { method: "POST", body: JSON.stringify(body) })); } catch (x: any) { setErr(x.message); } };
  const assess = async () => { try { setAs(await api(`/api/screenings/${res.id}/assess`, { method: "POST" })); } catch (x: any) { setErr(x.message); } };
  const field = (k: string, label: string, type = "number") => <div><label htmlFor={k}>{label}</label><input id={k} type={type} value={f[k]} onChange={set(k)} /></div>;
  return <><h1>Health Screening</h1><div className="note">Leave optional fields empty if not measured. Empty is never stored as zero.</div>
    <form className="card" onSubmit={submit}><label htmlFor="pid">Participant</label>
      <select id="pid" value={f.participant_id} onChange={set("participant_id")}><option value="">Select…</option>{ps?.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}</select>
      <div className="row">{field("age", "Age (years)")}{field("height_cm", "Height (cm)")}{field("weight_kg", "Weight (kg)")}{field("systolic", "Systolic BP (mmHg), optional")}{field("diastolic", "Diastolic BP (mmHg), optional")}{field("glucose_mgdl", "Glucose (mg/dL), optional")}</div>
      <label htmlFor="gt">Glucose measurement type</label><select id="gt" value={f.glucose_type} onChange={set("glucose_type")}><option value="">Not measured</option><option>fasting</option><option>random</option><option>post-meal</option></select>
      <label><input type="checkbox" checked={f.urgent_symptoms} onChange={set("urgent_symptoms")} />Urgent symptoms reported (chest pain, severe breathlessness, fainting, confusion)</label>
      <p className="err" role="alert">{err}</p><button className="btn">Save screening</button></form>
    {res && <div className="card">{res.alert && <div className="note alert" role="alert"><b>{res.alert}</b></div>}
      <h2>Saved screening #{res.id}</h2><p>BMI (screening measure, not a diagnosis): <b>{res.bmi}</b></p><button className="btn sec" onClick={assess}>Run research assessment</button></div>}
    {as && <div className="card"><h2>Assessment</h2>{as.status === "research_output" ? <>
      <p>Target: {as.target}. Model {as.model_version}. Uncalibrated score: <b>{as.score}</b></p><p className="muted">{as.score_note}</p><ul>{as.limitations.map((l: string) => <li key={l}>{l}</li>)}</ul></>
      : <div className="note"><b>{as.message || as.status}</b>{as.reason && <p>{as.reason}</p>}{as.required && <p>Required: {as.required.join(", ")}</p>}</div>}</div>}</>;
}

function Nutrition() {
  const [diet, setDiet] = useState("veg"); const [budget, setBudget] = useState(2); const [al, setAl] = useState<string[]>([]); const [plan, setPlan] = useState<any>(null); const [err, setErr] = useState("");
  const gen = async () => { setErr(""); try { setPlan(await api("/api/nutrition/recommendations", { method: "POST", body: JSON.stringify({ diet, budget_tier: budget, allergies: al }) })); } catch (x: any) { setErr(x.message); } };
  return <><h1>Nutrition Planner</h1><div className="card noprint"><div className="row"><div><label htmlFor="d">Dietary preference</label><select id="d" value={diet} onChange={e => setDiet(e.target.value)}><option value="veg">Vegetarian</option><option value="egg">Egg-inclusive vegetarian</option><option value="non">Non-vegetarian</option></select></div>
    <div><label htmlFor="b">Budget tier (relative)</label><select id="b" value={budget} onChange={e => setBudget(+e.target.value)}><option value={1}>Low</option><option value={2}>Medium</option><option value={3}>Higher</option></select></div></div>
    <fieldset style={{ border: 0, padding: 0 }}><legend>Allergies</legend>{["milk", "egg", "peanut", "gluten", "fish"].map(a => <label key={a}><input type="checkbox" checked={al.includes(a)} onChange={e => setAl(e.target.checked ? [...al, a] : al.filter(x => x !== a))} />{a}</label>)}</fieldset>
    <div className="note">Conditions needing specialised diets need a qualified professional. Nutrient values and prices are not invented.</div>
    <p className="err" role="alert">{err}</p><button className="btn" onClick={gen}>Generate plan</button> <button className="btn sec" onClick={() => window.print()}>Print</button></div>
    {plan && <>{plan.plan.map((m: any) => <div className="card" key={m.meal}><h2>{m.meal}</h2><ul>{m.items.map((i: any, k: number) => <li key={k}>{i.food ? <><b>{i.food}</b> <span className="tag">{i.group}</span><span className="tag">Cost tier {i.cost_tier}</span><span className="tag">{i.nutrient_data}</span><br /><span className="muted">{i.reason}{i.alternatives.length ? ". Alternatives: " + i.alternatives.join(", ") : ""}</span></> : <span className="muted">{i.note}</span>}</li>)}</ul></div>)}<p className="muted">{plan.disclaimer}</p></>}</>;
}

function Followups() {
  const { data, error, loading, reload } = useLoad<any[]>("/api/followups"); const [pid, setPid] = useState(""); const [d, setD] = useState(""); const [err, setErr] = useState("");
  const add = async (e: FormEvent) => { e.preventDefault(); setErr(""); try { await api("/api/followups", { method: "POST", body: JSON.stringify({ participant_id: +pid, due_at: new Date(d).getTime() / 1000 }) }); reload(); } catch (x: any) { setErr(x.message); } };
  const done = async (id: number) => { await api(`/api/followups/${id}/complete`, { method: "PATCH" }); reload(); };
  return <><h1>Follow-ups</h1><Status loading={loading} error={error} />{data && <div className="card tw">{data.length ? <table><thead><tr><th>Participant</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>{data.map(f => <tr key={f.id}><td>{f.participant_code}</td><td>{new Date(f.due_at * 1000).toLocaleDateString()}</td><td>{f.status}</td><td>{f.status !== "completed" && <button className="btn sec" onClick={() => done(f.id)}>Mark completed</button>}</td></tr>)}</tbody></table> : "No follow-ups scheduled."}</div>}
    <form className="card" onSubmit={add}><h2>Schedule</h2><label htmlFor="fp">Participant ID (number)</label><input id="fp" value={pid} onChange={e => setPid(e.target.value)} /><label htmlFor="fd">Due date</label><input id="fd" type="date" value={d} onChange={e => setD(e.target.value)} /><p className="err" role="alert">{err}</p><button className="btn">Add</button></form></>;
}

const FAQ: [RegExp, string, string][] = [
  [/bmi/i, "BMI is weight (kg) divided by height (m) squared. For adults it is a screening measure only, not a diagnosis.", "General adult screening education (verify against WHO / national guidance)"],
  [/screening|diagnos/i, "Screening looks for possible signs in many people and does not confirm a condition. Diagnosis needs a qualified health professional.", "General public-health education"],
  [/balanced|meal|diet|plate/i, "A balanced plate usually combines a cereal or millet, a pulse or protein food, vegetables including leafy greens and, when available, fruit.", "WHO healthy diet fact sheet; ICMR-NIN Dietary Guidelines for Indians (verify wording at source)"],
];
function Guide() {
  const [log, setLog] = useState<{ w: string; t: string; s?: string }[]>([]); const [q, setQ] = useState("");
  const ask = (e: FormEvent) => { e.preventDefault(); if (!q.trim()) return; let a = { w: "Guide", t: "I do not have an approved answer for that. Please ask a qualified health professional.", s: "" };
    if (/chest pain|breath|faint|unconscious|seizure|stroke|bleeding|suicid|poison/i.test(q)) a.t = "This may be urgent. Contact local emergency services or go to the nearest health facility now. This tool cannot help with emergencies.";
    else if (/medicine|medication|tablet|dose|insulin|prescri/i.test(q)) a.t = "I cannot advise on medicines or doses. Please ask your doctor or pharmacist.";
    else { const m = FAQ.find(f => f[0].test(q)); if (m) { a.t = m[1]; a.s = m[2]; } }
    setLog([...log, { w: "You", t: q }, a]); setQ(""); };
  return <><h1>RuralCare Guide</h1><div className="note">Educational only. Answers come from a small approved list. No personal records are used and no AI model is connected.</div>
    <div className="card" aria-live="polite">{log.map((m, i) => <p key={i}><b>{m.w}:</b> {m.t}{m.s && <><br /><span className="tag">Source: {m.s}</span></>}</p>)}</div>
    <form className="card" onSubmit={ask}><label htmlFor="q">Your question</label><input id="q" value={q} onChange={e => setQ(e.target.value)} /><button className="btn">Send</button></form></>;
}

function Lab() {
  const { data, error, loading } = useLoad<any>("/api/research/models"); const p = (x: any) => typeof x === "number" ? x.toFixed(3) : "n/a";
  return <><h1>Research Lab</h1><Status loading={loading} error={error} />
    {data && (data.status ? <div className="card">{data.status}. Run <code>python ml/train.py --data diabetes.csv</code>.</div> : <>
      {data.synthetic && <div className="note alert" role="alert"><b>SYNTHETIC DATA:</b> metrics cannot indicate real-world performance.</div>}
      <div className="card tw"><p>Version {data.version}. Best on validation: <b>{data.best_model}</b>. Rows: {data.dataset.rows}.</p>
        <table><thead><tr><th>Model</th><th>Test ROC-AUC</th><th>PR-AUC</th><th>Recall</th><th>Specificity</th><th>F1</th></tr></thead><tbody>{Object.entries<any>(data.all_models).map(([k, v]) => <tr key={k}><td>{k}</td><td>{p(v.test.roc_auc)}</td><td>{p(v.test.pr_auc)}</td><td>{p(v.test.recall_sensitivity)}</td><td>{p(v.test.specificity)}</td><td>{p(v.test.f1)}</td></tr>)}</tbody></table>
        <p>Test n={data.test_metrics.n}. Confusion matrix [[TN, FP],[FN, TP]]: {JSON.stringify(data.test_metrics.confusion_matrix)}</p></div>
      <div className="card"><h2>Limitations</h2><ul>{data.limitations.map((l: string) => <li key={l}>{l}</li>)}</ul></div></>)}</>;
}

function Audit() {
  const { data, error, loading } = useLoad<any[]>("/api/audit");
  return <><h1>Audit log</h1><Status loading={loading} error={error} />{data && <div className="card tw"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th></tr></thead><tbody>{data.map((a, i) => <tr key={i}><td>{new Date(a.ts * 1000).toLocaleString()}</td><td>{a.actor_id}</td><td>{a.action}</td><td>{a.resource} {a.resource_id}</td></tr>)}</tbody></table></div>}</>;
}

export default function App() {
  const [role, setRole] = useState<string | null>(null);
  if (!role) return <Login onLogin={setRole} />;
  const items = MENU[role] || MENU.worker;
  return <><header><b>RuralCare AI</b>{items.map(([to, l]) => <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => isActive ? "active" : ""}>{l}</NavLink>)}
    <button onClick={() => { setToken(""); setRole(null); }}>Sign out</button></header>
    <main><Routes><Route path="/" element={<Dashboard />} />
      {role === "worker" && <><Route path="/participants" element={<Participants />} /><Route path="/screening" element={<Screening />} /><Route path="/nutrition" element={<Nutrition />} /><Route path="/followups" element={<Followups />} /></>}
      {role !== "worker" && <Route path="/lab" element={<Lab />} />}{role === "admin" && <Route path="/audit" element={<Audit />} />}
      <Route path="/guide" element={<Guide />} /><Route path="*" element={<Navigate to="/" />} /></Routes></main>
    <footer style={{ textAlign: "center", padding: 16 }} className="muted">Academic research prototype. Not a diagnostic device. Demo data only.</footer></>;
}
