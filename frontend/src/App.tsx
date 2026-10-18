import { useState, useEffect, FormEvent } from "react";
import { Routes, Route, Navigate, Link, useSearchParams } from "react-router-dom";
import { api, setToken } from "./api";
import { Landing, Shell, BarChart, Donut, AuthArt, Icon, Lang } from "./ui";
import { Wizard, LabTabs, Help, Notifications, Settings } from "./pages2";
import { Profile, Nutrition2 } from "./pages3";
import { AdminPage } from "./pages4";
import { Followups2, NutritionInsights, PublicHome } from "./pages5";
import { useAutoTranslate } from "./i18n";

const MENU: Record<string, [string, string][]> = {
  worker: [["/", "Dashboard"], ["/participants", "Participants"], ["/screening", "Screening"], ["/nutrition", "Nutrition"], ["/followups", "Follow-ups"], ["/nutrition-insights", "Nutrition insights"], ["/guide", "Guide"], ["/help", "Help"], ["/notifications", "Notifications"], ["/settings", "Settings"]],
  participant: [["/", "Home"], ["/nutrition", "Nutrition"], ["/guide", "Guide"], ["/help", "Help"], ["/notifications", "Notifications"], ["/settings", "Settings"]],
  researcher: [["/", "Dashboard"], ["/lab", "Research Lab"], ["/nutrition-insights", "Nutrition insights"], ["/guide", "Guide"], ["/help", "Help"], ["/notifications", "Notifications"], ["/settings", "Settings"]],
  admin: [["/", "Dashboard"], ["/lab", "Research Lab"], ["/audit", "Audit log"], ["/admin", "Admin"], ["/nutrition-insights", "Nutrition insights"], ["/guide", "Guide"], ["/help", "Help"], ["/notifications", "Notifications"], ["/settings", "Settings"]],
};

function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const load = () => { if (!path) { setLoading(false); return; } setLoading(true); api(path).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(load, [path]);
  return { data, error, loading, reload: load };
}
const Status = ({ loading, error }: { loading: boolean; error: string }) =>
  loading ? <p role="status">Loading…</p> : error ? <p className="err" role="alert">{error}</p> : null;

function Login({ onLogin, onBack }: { onLogin: (role: string) => void; onBack: () => void }) {
  const [mode, setMode] = useState<"in" | "up">("in"); const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [ack, setAck] = useState(false); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [show, setShow] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setErr("");
    if (!email.trim()) return setErr("Enter your email address."); if (!pw) return setErr("Enter your password.");
    if (mode === "up") { if (pw.length < 10) return setErr("Password must be at least 10 characters."); if (pw !== pw2) return setErr("Passwords do not match."); if (!ack) return setErr("Please confirm the notice above."); }
    setBusy(true);
    try { if (mode === "up") await api("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password: pw }) });
      const r = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: pw }) }); setToken(r.token); onLogin(r.role); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); } };
  const swap = (m: "in" | "up") => { setMode(m); setErr(""); };
  return <div className="light-scope au">
    <div className="au-left"><AuthArt /><div><h2>Welcome back</h2><p>Screening, follow-ups and community insights, built for health workers in the field.</p></div></div>
    <div className="au-right"><div className="au-card">
      <div className="au-brand"><span className="logo" aria-hidden><Icon n="heart" /></span>RuralCare AI</div>
      <h1>{mode === "in" ? "Sign in to your account" : "Create your account"}</h1>
      <p className="au-sub">{mode === "in" ? "Don't have an account? " : "Already have an account? "}<button type="button" className="link" onClick={() => swap(mode === "in" ? "up" : "in")}>{mode === "in" ? "Sign up for free" : "Sign in"}</button></p>
      <form onSubmit={submit} noValidate>
        <label htmlFor="e">Email address</label><input id="e" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!err} />
        <label htmlFor="p">Password</label><div className="pwbox"><input id="p" type={show ? "text" : "password"} autoComplete={mode === "up" ? "new-password" : "current-password"} value={pw} onChange={e => setPw(e.target.value)} />
          <button type="button" onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? "Hide password" : "Show password"}><Icon n={show ? "eyeoff" : "eye"} /></button></div>
        {mode === "up" && <><label htmlFor="p2">Confirm password</label><input id="p2" type={show ? "text" : "password"} autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} />
          <label style={{ fontWeight: 400, marginTop: 14 }}><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />I understand this is an academic project, not a medical service, and I will not enter real patient records</label>
          <p className="muted">New accounts get access to the nutrition planner, guide and help. Health-worker features need administrator approval. Your email is not verified or used to send messages.</p></>}
        <p className="err" role="alert">{err}</p>
        <button className="btn" style={{ width: "100%", minHeight: 50 }} disabled={busy}>{busy ? <><span className="spin" aria-hidden /> Please wait…</> : mode === "up" ? "Create account" : "Sign in"}</button>
        {mode === "in" && <p className="muted" style={{ marginTop: 14 }}>Forgot your password? Password reset is not available in this prototype yet. Please ask your administrator.</p>}
      </form>
      <div className="note"><b>Secure access.</b> Academic research prototype, not a medical service. Please use sample values, not real patient records.</div>
      <button type="button" className="link" style={{ marginTop: 10 }} onClick={onBack}>← Back to home</button>
    </div></div></div>;
}

const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const Kpi = ({ icon, label, value, hint }: { icon: string; label: string; value: string | number; hint?: string }) =>
  <article className="card kpi rich"><div className="h"><span className="ic"><Icon n={icon} /></span>{label}</div><b>{value}</b>{hint && <small>{hint}</small>}</article>;

function ModelPanel() {
  const { data, loading, error } = useLoad<any>("/api/research/models");
  const none = data && data.status; const synth = data && !data.status && data.synthetic;
  return <div className="card"><div className="chead"><div><h2>Research model status</h2><div className="cap">Availability and validation, shown honestly</div></div><Link className="link" to="/lab">Open Research Lab</Link></div>
    {loading ? <p role="status">Loading…</p> : error ? <p className="err" role="alert">{error}</p> : none ? <div className="note"><b>No trained model found.</b><br />Run <code>python ml/train.py --data diabetes.csv</code> and restart the API.</div>
      : data && <><div className="note"><b>{synth ? "Research model not yet validated" : "Research use only"}</b><br />{synth ? "Trained on synthetic data only. Scores are for classroom demonstration and are never a diagnosis or a probability of disease." : "Trained on a public dataset. Not clinically validated, and never a diagnosis."}</div>
        <div className="tw"><table><tbody><tr><td>Model version</td><td>{data.version}</td></tr><tr><td>Selected model</td><td>{data.best_model}</td></tr><tr><td>Dataset source</td><td>{data.dataset?.source}</td></tr><tr><td>Validation</td><td>{synth ? "Not validated (synthetic data)" : "Not clinically validated"}</td></tr></tbody></table></div></>}</div>;
}

function Dashboard({ role }: { role: string }) {
  const isW = role === "worker";
  const { data, error, loading } = useLoad<any>("/api/analytics/community");
  const ps = useLoad<any[]>(isW ? "/api/participants" : null); const fu = useLoad<any[]>(isW ? "/api/followups" : null);
  const shown = data ? data.by_community.reduce((n: number, g: any) => n + (g.count || 0), 0) : 0;
  const hidden = data ? data.by_community.filter((g: any) => g.suppressed).length : 0;
  const cnt = (s: string) => (fu.data || []).filter(r => r.status === s).length;
  const queue = (fu.data || []).filter(r => r.status !== "completed").sort((a, b) => a.due_at - b.due_at).slice(0, 6);
  const label = (s: string) => s[0].toUpperCase() + s.slice(1);
  const wait = (v: number, l: boolean) => l ? "…" : v;
  return <><section className="banner" aria-label="Welcome"><div><h1>{greet()}</h1><p>{isW ? "See who needs a visit next and how screening coverage looks across your communities." : "Community-level counts and research model status, with small groups hidden to protect privacy."}</p>
      <div className="acts">{isW ? <><Link className="btn dark" to="/screening"><Icon n="plus" />New screening</Link><Link className="btn glass" to="/participants">Register participant</Link></> : <Link className="btn dark" to="/lab">Open Research Lab</Link>}</div></div>
      <svg className="deco" viewBox="0 0 180 120" aria-hidden="true"><circle cx="120" cy="60" r="52" fill="rgba(255,255,255,.25)" /><circle cx="120" cy="60" r="34" fill="rgba(255,255,255,.3)" /><path d="M120 40v40M100 60h40" stroke="#04251D" strokeWidth="9" strokeLinecap="round" /><path d="M8 100c20-30 40 10 60-18s30-20 40-32" fill="none" stroke="#04251D" strokeWidth="3" strokeLinecap="round" opacity=".5" /></svg></section>
    <div className="note"><b>Aggregate view:</b> counts only. Groups under {data?.min_group_size ?? 5} are hidden to protect privacy. Screening categories are not diagnoses.</div>
    <Status loading={loading} error={error} />{isW && (ps.error || fu.error) && <p className="err" role="alert">{ps.error || fu.error}</p>}
    {data && <><div className="kpis" style={{ marginTop: 14 }}>{isW ? <>
        <Kpi icon="users" label="Registered participants" value={wait(ps.data?.length ?? 0, ps.loading)} hint="In your assigned records" />
        <Kpi icon="cal" label="Follow-ups overdue" value={wait(cnt("overdue"), fu.loading)} hint="Visits needing attention" />
        <Kpi icon="cal" label="Follow-ups upcoming" value={wait(cnt("upcoming"), fu.loading)} hint="Scheduled, not yet due" />
        <Kpi icon="chart" label="Communities represented" value={data.by_community.length} hint={hidden ? `${hidden} small group${hidden > 1 ? "s" : ""} hidden` : undefined} /></> : <>
        <Kpi icon="chart" label="Communities represented" value={data.by_community.length} />
        <Kpi icon="users" label="Participants in visible groups" value={shown} />
        <Kpi icon="shield" label="Groups hidden (small)" value={hidden} hint={`Below ${data.min_group_size ?? 5} participants`} /></>}</div>
      <div className="cols"><div className="card"><h2>By community</h2><BarChart title="Participants by community" rows={data.by_community.map((g: any) => ({ label: String(g.group), value: g.count }))} /></div>
        <div className="card"><h2>By age band</h2><BarChart title="Participants by age band" rows={data.by_age_band.map((g: any) => ({ label: String(g.group), value: g.count }))} /></div></div>
      {!data.by_community.length && <div className="card">No participants yet. A health worker can register the first one under Participants.</div>}</>}
    {isW ? <div className="cols"><div className="card"><div className="chead"><div><h2>Follow-up queue</h2><div className="cap">Soonest due first. Simple date order, not a prediction.</div></div><Link className="link" to="/followups">View all</Link></div>
        {fu.loading ? <p role="status">Loading…</p> : queue.length ? <div className="tw"><table><thead><tr><th>Participant</th><th>Due</th><th>Status</th></tr></thead><tbody>{queue.map(r => <tr key={r.id}><td><b>{r.participant_code}</b></td><td>{new Date(r.due_at * 1000).toLocaleDateString()}</td><td><span className={"st " + r.status}>{label(r.status)}</span></td></tr>)}</tbody></table></div>
          : <p className="muted">No open follow-ups. Schedule one under Follow-ups.</p>}</div>
      <div className="card"><h2>Follow-up status</h2><div className="cap muted">All scheduled visits</div>{fu.loading ? <p role="status">Loading…</p> : <Donut title="Follow-up status" parts={[{ label: "Completed", value: cnt("completed"), color: "var(--pri)" }, { label: "Upcoming", value: cnt("upcoming"), color: "var(--info)" }, { label: "Overdue", value: cnt("overdue"), color: "var(--warn)" }]} />}</div></div>
      : <div className="cols" style={{ gridTemplateColumns: "1fr" }}><ModelPanel /></div>}</>;
}

function Participants() {
  const { data, error, loading, reload } = useLoad<any[]>("/api/participants"); const [sp, setSp] = useSearchParams(); const q = (sp.get("q") || "").trim().toLowerCase(); const rows = data ? data.filter(p => !q || String(p.code).toLowerCase().includes(q)) : [];
  const [f, setF] = useState({ age_band: "30-44", community: "C1", consent_given: false }); const [msg, setMsg] = useState("");
  const add = async (e: FormEvent) => { e.preventDefault(); setMsg("");
    try { const r = await api("/api/participants", { method: "POST", body: JSON.stringify(f) }); setMsg("Registered " + r.code); reload(); } catch (x: any) { setMsg(x.message); } };
  return <><h1>Participants</h1><Status loading={loading} error={error} />
    {q && <p className="muted">Showing participants matching “{sp.get("q")}”. <button type="button" className="link" onClick={() => setSp({})}>Clear search</button></p>}{data && (rows.length ? <div className="card tw"><table><thead><tr><th>ID</th><th>Code</th><th>Age band</th><th>Community</th></tr></thead>
      <tbody>{rows.map(p => <tr key={p.id}><td>{p.id}</td><td><Link to={"/participants/" + p.id}>{p.code}</Link></td><td>{p.age_band}</td><td>{p.community}</td></tr>)}</tbody></table></div>
      : <div className="card">{data.length ? "No participants match your search." : "No participants yet. Register the first one below."}</div>)}
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
  const [stage, setStage] = useState<"landing" | "login">("landing");
  const [lang, setLang] = useState<Lang>("en");
  useAutoTranslate(lang);
  if (!role) return stage === "landing" ? <Landing lang={lang} setLang={setLang} onStart={() => setStage("login")} /> : <Login onLogin={setRole} onBack={() => setStage("landing")} />;
  return <Shell role={role} items={MENU[role] || MENU.worker} lang={lang} setLang={setLang} onOut={() => { setToken(""); setRole(null); setStage("landing"); }}>
    <Routes><Route path="/" element={role === "participant" ? <PublicHome /> : <Dashboard role={role} />} />
      {role === "worker" && <><Route path="/participants" element={<Participants />} /><Route path="/screening" element={<Wizard />} /><Route path="/nutrition" element={<Nutrition2 />} /><Route path="/participants/:id" element={<Profile />} /><Route path="/followups" element={<Followups2 />} /></>}
      {(role === "researcher" || role === "admin") && <Route path="/lab" element={<LabTabs />} />}{role === "participant" && <Route path="/nutrition" element={<Nutrition2 />} />}{role === "admin" && <><Route path="/audit" element={<Audit />} /><Route path="/admin" element={<AdminPage />} /></>}
      <Route path="/guide" element={<Guide />} /><Route path="/nutrition-insights" element={<NutritionInsights />} /><Route path="/help" element={<Help />} /><Route path="/notifications" element={<Notifications />} /><Route path="/settings" element={<Settings role={role} />} /><Route path="*" element={<Navigate to="/" />} /></Routes></Shell>;
}
