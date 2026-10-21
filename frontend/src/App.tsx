import { useState, useEffect, FormEvent } from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { api, setToken, onAuthLost } from "./api";
import { Landing, Shell, BarChart, Lang, Foot, Group } from "./ui";
import { Wizard, LabTabs, Notifications } from "./pages2";
import { Help } from "./help";
import { Guide } from "./guide";
import { Recover } from "./recover";
import { Profile, Nutrition2 } from "./pages3";
import { Followups2, NutritionInsights } from "./pages5";
import { useAutoTranslate } from "./i18n";
import { ThemeButton } from "./theme";
import { LangContext } from "./icons";
import { ToastProvider, useApi } from "./ui2";
import { HealthDashboard, HealthDetail, HealthRecords, HealthHistory } from "./health";
import { SymptomChecker, DietWellness, FindDoctor, ProfilePage, Privacy, Disclaimer } from "./care";
import { UserHome } from "./home";
import { AdminApp } from "./admin";

const MINE: [string, string, string][] = [["/health", "Health Dashboard", "pulse"], ["/symptoms", "Symptom Checker", "search"], ["/records", "Health Records", "records"], ["/wellness", "Diet and Wellness", "leaf"], ["/history", "Health History", "clock"], ["/doctors", "Find a Doctor", "pin"], ["/profile", "Profile and Settings", "user"]];
const EXTRA: [string, string, string][] = [["/guide", "Guide", "chat"], ["/help", "Help", "help"], ["/notifications", "Notifications", "bell"]];
function groupsFor(role: string): Group[] {
  if (role === "worker") return [{ title: "Work", items: [["/", "Dashboard", "home"], ["/participants", "Participants", "users"], ["/screening", "Screening", "pulse"], ["/nutrition", "Nutrition", "leaf"], ["/followups", "Follow-ups", "calendar"], ["/nutrition-insights", "Nutrition insights", "chart"]] }, { title: "My health", items: MINE }, { items: EXTRA }];
  if (role === "researcher") return [{ title: "Work", items: [["/", "Dashboard", "home"], ["/lab", "Research Lab", "flask"], ["/nutrition-insights", "Nutrition insights", "chart"]] }, { title: "My health", items: MINE }, { items: EXTRA }];
  return [{ items: [["/", "Home", "home"], ...MINE, ["/nutrition", "Nutrition planner", "leaf"], ...EXTRA] }];
}

const Status = ({ loading, error }: { loading: boolean; error: string }) =>
  loading ? <p role="status">Loading…</p> : error ? <p className="err" role="alert">{error}</p> : null;
function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); api(path).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(load, [path]);
  return { data, error, loading, reload: load };
}

function Login({ onLogin, notice, onBack }: { onLogin: (role: string) => void; notice: string; onBack: () => void }) {
  const [mode, setMode] = useState<"in" | "up">("in"); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [ack, setAck] = useState(false); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [show, setShow] = useState(false); const [recover, setRecover] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setErr("");
    if (!email.trim()) return setErr("Enter your email address.");
    if (mode === "up") { if (pw.length < 10) return setErr("Password must be at least 10 characters."); if (pw !== pw2) return setErr("Passwords do not match."); if (!ack) return setErr("Please tick the box to confirm you understand."); }
    setBusy(true);
    try { if (mode === "up") await api("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password: pw, name: name.trim() || undefined }) });
      const r = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: pw }) }); setToken(r.token); onLogin(r.role); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); } };
  if (recover) return <main style={{ maxWidth: 440 }}><div className="card"><Recover email={email} onBack={() => setRecover(false)} /></div></main>;
  return <main style={{ maxWidth: 440 }}><div className="card"><div style={{ float: "right" }}><ThemeButton /></div><h1>Arogya AI</h1>
    <div className="note">Academic project. Not a medical service. In an emergency call <a href="tel:112">112</a>.</div>
    {notice && <div className="note" role="status">{notice}</div>}
    <div role="tablist" style={{ display: "flex", gap: 6 }}><button role="tab" aria-selected={mode === "in"} className={mode === "in" ? "btn sm" : "btn sec sm"} onClick={() => { setMode("in"); setErr(""); }}>Sign in</button><button role="tab" aria-selected={mode === "up"} className={mode === "up" ? "btn sm" : "btn sec sm"} onClick={() => { setMode("up"); setErr(""); }}>Create account</button></div>
    <form onSubmit={submit} noValidate>
      {mode === "up" && <><label htmlFor="nm">Your name (optional)</label><input id="nm" autoComplete="given-name" maxLength={60} value={name} onChange={e => setName(e.target.value)} /></>}
      <label htmlFor="e">Email</label><input id="e" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
      <label htmlFor="p">Password</label><div className="pwrow"><input id="p" type={show ? "text" : "password"} autoComplete={mode === "up" ? "new-password" : "current-password"} value={pw} onChange={e => setPw(e.target.value)} /><button type="button" className="btn sec sm" aria-pressed={show} onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button></div>
      {mode === "in" && <p className="small" style={{ margin: "6px 0 0" }}><button type="button" className="linkbtn" onClick={() => setRecover(true)}>Forgot password?</button></p>}
      {mode === "up" && <><label htmlFor="p2">Confirm password</label><input id="p2" type={show ? "text" : "password"} autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} />
        <label style={{ fontWeight: 400 }}><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />I understand this is a student project: what I enter is stored on its server, it has not had a formal security or privacy review, and it is not a medical service.</label>
        <p className="muted">New accounts can use the health dashboard, symptom checker, diet and wellness, and the guide. Your email is not verified or used to send messages. Read the <Link to="/privacy">privacy notice</Link>.</p></>}
      <p className="err" role="alert">{err}</p><button className="btn" disabled={busy}>{busy ? "Please wait…" : mode === "up" ? "Create account" : "Sign in"}</button></form>
    <p className="muted small"><button className="linkbtn" onClick={onBack}>← Back to the home page</button> · <Link to="/admin/login">Admin Portal</Link> · <Link to="/disclaimer">Medical disclaimer</Link></p></div></main>;
}

function ModelKpi() {
  const { data, loading } = useLoad<any>("/api/research/models");
  const v = loading ? "…" : !data || data.status ? "No model trained" : data.synthetic ? "Synthetic data" : data.best_model;
  return <div className="card kpi"><b style={{ fontSize: 20 }}>{v}</b><span>Research model status</span></div>;
}
function Dashboard({ role }: { role: string }) {
  const { data, error, loading } = useLoad<any>("/api/analytics/community");
  const shown = data ? data.by_community.reduce((n: number, g: any) => n + (g.count || 0), 0) : 0;
  const hidden = data ? data.by_community.filter((g: any) => g.suppressed).length : 0;
  return <><h1>Community Health Dashboard</h1><div className="note"><b>Aggregate counts only.</b> Groups under {data?.min_group_size ?? 5} are hidden to protect privacy. Screening categories are not diagnoses.</div>
    <Status loading={loading} error={error} />
    {data && <><div className="kpis"><div className="card kpi"><b>{data.by_community.length}</b><span>Communities represented</span></div>
      <div className="card kpi"><b>{shown}</b><span>Participants in visible groups</span></div><div className="card kpi"><b>{hidden}</b><span>Groups hidden (small)</span></div>
      {role !== "worker" ? <ModelKpi /> : <div className="card kpi"><b style={{ fontSize: 20 }}>Per screening</b><span>Model output appears after an assessment</span></div>}</div>
      <div className="row"><div className="card"><h2>By community</h2><BarChart title="Participants by community" rows={data.by_community.map((g: any) => ({ label: String(g.group), value: g.count }))} /></div>
        <div className="card"><h2>By age band</h2><BarChart title="Participants by age band" rows={data.by_age_band.map((g: any) => ({ label: String(g.group), value: g.count }))} /></div></div>
      {!data.by_community.length && <div className="card">No participants yet. A health worker can register the first one under Participants.</div>}</>}</>;
}

function Participants() {
  const { data, error, loading, reload } = useLoad<any[]>("/api/participants");
  const [f, setF] = useState({ age_band: "30-44", community: "C1", consent_given: false }); const [msg, setMsg] = useState("");
  const add = async (e: FormEvent) => { e.preventDefault(); setMsg("");
    try { const r = await api("/api/participants", { method: "POST", body: JSON.stringify(f) }); setMsg("Registered " + r.code); reload(); } catch (x: any) { setMsg(x.message); } };
  return <><h1>Participants</h1><Status loading={loading} error={error} />
    {data && (data.length ? <div className="card tw"><table><thead><tr><th>ID</th><th>Code</th><th>Age band</th><th>Community</th></tr></thead>
      <tbody>{data.map(p => <tr key={p.id}><td>{p.id}</td><td><Link to={"/participants/" + p.id}>{p.code}</Link></td><td>{p.age_band}</td><td>{p.community}</td></tr>)}</tbody></table></div>
      : <div className="card">No participants yet. Register the first one below.</div>)}
    <form className="card" onSubmit={add}><h2>Register participant</h2><div className="row">
      <div><label htmlFor="ab">Age band (adults)</label><select id="ab" value={f.age_band} onChange={e => setF({ ...f, age_band: e.target.value })}>{["18-29", "30-44", "45-59", "60+"].map(x => <option key={x}>{x}</option>)}</select></div>
      <div><label htmlFor="cm">Community code</label><input id="cm" value={f.community} onChange={e => setF({ ...f, community: e.target.value })} /></div></div>
      <label><input type="checkbox" checked={f.consent_given} onChange={e => setF({ ...f, consent_given: e.target.checked })} />Participant gave explicit consent for screening and nutrition research</label>
      <p role="alert" className={msg.startsWith("Registered") ? "" : "err"}>{msg}</p><button className="btn">Register</button></form></>;
}

/** After sign-in, apply the person's saved language preference once. */
function ApplyProfile({ setLang }: { setLang: (l: Lang) => void }) {
  const p = useApi<any>("/api/profile");
  useEffect(() => { if (p.data?.language === "hi" || p.data?.language === "en") setLang(p.data.language); }, [p.data]); // eslint-disable-line
  return null;
}
function Greeting({ role }: { role: string }) { const p = useApi<any>("/api/profile"); return role === "participant" ? <UserHome name={p.data?.display_name || ""} /> : <Dashboard role={role} />; }

function PublicPage({ children }: { children: React.ReactNode }) {
  return <><div className="nav-l"><b>Arogya AI</b><ThemeButton /><Link className="btn sm" to="/">Home</Link></div><main style={{ maxWidth: 760 }}>{children}</main><Foot /></>;
}

export default function App() {
  const [role, setRole] = useState<string | null>(null);
  const [stage, setStage] = useState<"landing" | "login">("landing");
  const [lang, setLang] = useState<Lang>("en");
  const [notice, setNotice] = useState("");
  const loc = useLocation();
  useAutoTranslate(lang);
  useEffect(() => {
    onAuthLost(admin => {
      if (admin) { window.dispatchEvent(new Event("rc-admin-lost")); return; }
      setToken(""); setRole(null); setStage("login"); setNotice("Your session has ended. Please sign in again.");
    });
  }, []);
  const signOut = async () => { try { await api("/api/auth/logout", { method: "POST" }); } catch { /* already ended */ } setToken(""); setRole(null); setStage("landing"); setNotice(""); };
  const ctx = { lang, setLang };

  if (loc.pathname.startsWith("/admin")) return <LangContext.Provider value={ctx}><ToastProvider><AdminApp /></ToastProvider></LangContext.Provider>;
  if (!role && (loc.pathname === "/privacy" || loc.pathname === "/disclaimer")) return <PublicPage>{loc.pathname === "/privacy" ? <Privacy /> : <Disclaimer />}</PublicPage>;
  if (!role) return stage === "landing" ? <Landing lang={lang} setLang={setLang} onStart={() => setStage("login")} /> : <Login notice={notice} onLogin={r => { setNotice(""); setRole(r); }} onBack={() => setStage("landing")} />;
  return <LangContext.Provider value={ctx}><ToastProvider><ApplyProfile setLang={setLang} />
    <Shell role={role} groups={groupsFor(role)} lang={lang} setLang={setLang} onOut={signOut}>
      <Routes><Route path="/" element={<Greeting role={role} />} />
        {role === "worker" && <><Route path="/participants" element={<Participants />} /><Route path="/screening" element={<Wizard />} /><Route path="/nutrition" element={<Nutrition2 />} /><Route path="/participants/:id" element={<Profile />} /><Route path="/followups" element={<Followups2 />} /></>}
        {role === "researcher" && <Route path="/lab" element={<LabTabs />} />}
        {role === "participant" && <Route path="/nutrition" element={<Nutrition2 />} />}
        <Route path="/health" element={<HealthDashboard />} /><Route path="/health/:kind" element={<HealthDetail />} /><Route path="/records" element={<HealthRecords />} /><Route path="/history" element={<HealthHistory />} />
        <Route path="/symptoms" element={<SymptomChecker />} /><Route path="/wellness" element={<DietWellness />} /><Route path="/doctors" element={<FindDoctor />} />
        <Route path="/profile" element={<ProfilePage role={role} onSignOut={signOut} setLang={setLang} />} /><Route path="/settings" element={<Navigate to="/profile" replace />} />
        <Route path="/privacy" element={<Privacy />} /><Route path="/disclaimer" element={<Disclaimer />} />
        <Route path="/guide" element={<Guide />} /><Route path="/nutrition-insights" element={<NutritionInsights />} /><Route path="/help" element={<Help />} /><Route path="/notifications" element={<Notifications />} /><Route path="*" element={<Navigate to="/" />} /></Routes></Shell></ToastProvider></LangContext.Provider>;
}
