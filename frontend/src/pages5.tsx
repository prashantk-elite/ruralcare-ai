import { useEffect, useState } from "react";
import { api } from "./api";
import { BarChart } from "./ui";
import { Link } from "react-router-dom";

const sym = (s: string) => s === "completed" ? "✓" : s === "overdue" ? "!" : "•";
export function Followups2() {
  const [rows, setRows] = useState<any[]>([]); const [ps, setPs] = useState<any[]>([]); const [view, setView] = useState("Calendar"); const [err, setErr] = useState("");
  const [m, setM] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [pid, setPid] = useState(""); const [dt, setDt] = useState("");
  const load = () => { api("/api/followups").then(setRows).catch(e => setErr(e.message)); api("/api/participants").then(setPs).catch(() => {}); };
  useEffect(load, []);
  const add = async () => { setErr(""); if (!pid || !dt) { setErr("Choose a participant and a date."); return; } try { await api("/api/followups", { method: "POST", body: JSON.stringify({ participant_id: +pid, due_at: new Date(dt).getTime() / 1000 }) }); setDt(""); load(); } catch (x: any) { setErr(x.message); } };
  const done = async (id: number) => { try { await api(`/api/followups/${id}/complete`, { method: "PATCH" }); load(); } catch (x: any) { setErr(x.message); } };
  const cnt = (s: string) => rows.filter(r => r.status === s).length;
  const first = m.getDay(), days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const on = (d: number) => rows.filter(r => { const x = new Date(r.due_at * 1000); return x.getFullYear() === m.getFullYear() && x.getMonth() === m.getMonth() && x.getDate() === d; });
  return <><h1>Follow-up Management</h1><div className="kpis">{["overdue", "upcoming", "completed"].map(s => <div key={s} className="card kpi"><b>{cnt(s)}</b><span>{s[0].toUpperCase() + s.slice(1)}</span></div>)}</div>
    <div role="tablist" style={{ display: "flex", gap: 6, marginBottom: 12 }}>{["Calendar", "Agenda", "List"].map(t => <button key={t} role="tab" aria-selected={view === t} className={view === t ? "btn sm" : "btn sec sm"} onClick={() => setView(t)}>{t}</button>)}</div>
    {view === "Calendar" && <div className="card"><div style={{ display: "flex", gap: 8, alignItems: "center" }}><button className="btn sec sm" aria-label="Previous month" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))}>←</button><b style={{ flex: 1, textAlign: "center" }}>{m.toLocaleString(undefined, { month: "long", year: "numeric" })}</b><button className="btn sec sm" aria-label="Next month" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() + 1, 1))}>→</button></div>
      <div className="tw"><div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(70px,1fr))", gap: 4, marginTop: 10 }}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="muted" style={{ textAlign: "center" }}>{d}</div>)}
        {cells.map((d, i) => <div key={i} style={{ minHeight: 64, border: "1px solid var(--bd)", borderRadius: 8, padding: 4, fontSize: 12 }}>{d && <><b>{d}</b>{on(d).map(r => <div key={r.id} title={r.status}>{sym(r.status)} {r.participant_code}</div>)}</>}</div>)}</div></div>
      <p className="muted">✓ completed · ! overdue · • upcoming</p></div>}
    {view === "Agenda" && <div className="card">{rows.length ? rows.map(r => <div key={r.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--bd)" }}><b>{new Date(r.due_at * 1000).toLocaleDateString()}</b> {sym(r.status)} {r.participant_code} <span className="tag">{r.status}</span> {r.status !== "completed" && <button className="btn sec sm" onClick={() => done(r.id)}>Mark completed</button>}</div>) : "No follow-ups scheduled."}</div>}
    {view === "List" && <div className="card tw"><table><thead><tr><th>Participant</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{r.participant_code}</td><td>{new Date(r.due_at * 1000).toLocaleDateString()}</td><td>{sym(r.status)} {r.status}</td><td>{r.status !== "completed" && <button className="btn sec sm" onClick={() => done(r.id)}>Mark completed</button>}</td></tr>)}</tbody></table></div>}
    <div className="card"><h2>Schedule</h2><div className="row"><div><label htmlFor="fp">Participant (follow-up)</label><select id="fp" value={pid} onChange={e => setPid(e.target.value)}><option value="">Select…</option>{ps.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}</select></div><div><label htmlFor="fd">Due date</label><input id="fd" type="date" value={dt} onChange={e => setDt(e.target.value)} /></div></div>
      <p className="err" role="alert">{err}</p><button className="btn" onClick={add}>Add</button><p className="muted">Reminders are opt-in and never carry health details.</p></div></>;
}

export function FeedbackCard({ diet, budget }: { diet: string; budget: number }) {
  const [f, setF] = useState({ satisfaction: "4", adherence: "some", accessibility: "easy" }); const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false);
  const send = async () => { setMsg(""); try { await api("/api/nutrition/feedback", { method: "POST", body: JSON.stringify({ diet, budget_tier: budget, satisfaction: +f.satisfaction, adherence: f.adherence, accessibility: f.accessibility }) }); setBad(false); setMsg("Thank you. Feedback saved anonymously."); } catch (x: any) { setBad(true); setMsg(x.message); } };
  const sel = (k: string, label: string, opts: [string, string][]) => <div><label htmlFor={"fb" + k}>{label}</label><select id={"fb" + k} value={(f as any)[k]} onChange={e => setF({ ...f, [k]: e.target.value })}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>;
  return <div className="card noprint"><h2>Participant-reported feedback</h2><div className="note">Self-reported and anonymous. It records what was reported, not verified food eaten, and does not show health outcomes.</div>
    <div className="row">{sel("satisfaction", "Satisfaction (1 to 5)", [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]])}{sel("adherence", "Followed the plan", [["none", "Not at all"], ["some", "Some of it"], ["most", "Most of it"], ["all", "All of it"]])}{sel("accessibility", "Food access", [["easy", "Easy to get"], ["some_difficulty", "Some difficulty"], ["hard", "Hard to get"]])}</div>
    <p role="alert" className={bad ? "err" : ""}>{msg}</p><button className="btn" onClick={send}>Submit feedback</button></div>;
}

export function NutritionInsights() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState("");
  useEffect(() => { api("/api/analytics/nutrition").then(setD).catch(e => setErr(e.message)); }, []);
  const rows = (a: any[]) => a.map(g => ({ label: g.group.replace(/_/g, " "), value: g.count }));
  return <><h1>Nutrition Insights</h1><div className="note">Aggregate, self-reported feedback only. Not verified consumption and not evidence of health outcomes.</div><p className="err" role="alert">{err}</p>
    {d && (!d.enough_data ? <div className="card">Not enough feedback yet to show charts (fewer than {d.min_group_size} responses are hidden to protect privacy).</div> : <><div className="kpis"><div className="card kpi"><b>{d.total}</b><span>Feedback responses</span></div></div>
      <div className="row"><div className="card"><h2>Followed the plan</h2><BarChart title="Reported plan adherence" rows={rows(d.by_adherence)} /></div><div className="card"><h2>Food access</h2><BarChart title="Reported food access" rows={rows(d.by_accessibility)} /></div>
        <div className="card"><h2>Satisfaction</h2><BarChart title="Satisfaction scores" rows={rows(d.by_satisfaction)} /></div><div className="card"><h2>Dietary preference</h2><BarChart title="Dietary preferences" rows={rows(d.by_diet)} /></div></div></>)}</>;
}

export function UsersTab() {
  const [us, setUs] = useState<any[]>([]); const [err, setErr] = useState(""); const [f, setF] = useState({ email: "", role: "worker", password: "" });
  const load = () => api("/api/admin/users").then(setUs).catch(e => setErr(e.message)); useEffect(() => { load(); }, []);
  const patch = async (id: number, body: any) => { setErr(""); try { await api(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }); load(); } catch (x: any) { setErr(x.message); } };
  const create = async () => { setErr(""); try { await api("/api/admin/users", { method: "POST", body: JSON.stringify(f) }); setF({ email: "", role: "worker", password: "" }); load(); } catch (x: any) { setErr(x.message); } };
  return <div className="card tw"><p className="err" role="alert">{err}</p><table><thead><tr><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>{us.map(u => <tr key={u.id}><td>{u.email}</td>
    <td><select aria-label={"Role for " + u.email} value={u.role} onChange={e => window.confirm(`Change role of ${u.email}?`) && patch(u.id, { role: e.target.value })}>{["participant", "worker", "researcher", "admin"].map(r => <option key={r}>{r}</option>)}</select></td><td>{u.status || "active"}</td>
    <td><button className="btn sec sm" onClick={() => window.confirm(`${u.status === "suspended" ? "Reactivate" : "Suspend"} ${u.email}?`) && patch(u.id, { status: u.status === "suspended" ? "active" : "suspended" })}>{u.status === "suspended" ? "Reactivate" : "Suspend"}</button></td></tr>)}</tbody></table>
    <h2 style={{ marginTop: 16 }}>Create user</h2><div className="row"><div><label htmlFor="ne">Email</label><input id="ne" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div><div><label htmlFor="nr">Role</label><select id="nr" value={f.role} onChange={e => setF({ ...f, role: e.target.value })}><option>participant</option><option>worker</option><option>researcher</option><option>admin</option></select></div></div>
    <label htmlFor="np">Initial password (min 10 characters)</label><input id="np" type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /><button className="btn" onClick={create}>Create user</button>
    <div className="note">You cannot change your own role or status. Role changes and suspensions are recorded in the audit log.</div></div>;
}

export function PublicHome() {
  const card = (to: string, t: string, d: string) => <Link to={to} style={{ textDecoration: "none", color: "inherit" }}><div className="card"><h2>{t}</h2><p className="muted">{d}</p></div></Link>;
  return <><h1>Welcome to Arogya AI</h1><div className="note alert" role="note"><b>Academic project.</b> Please use sample values, not real patient records. This site is not a medical service.</div>
    <div className="g3">{card("/nutrition", "Nutrition planner", "Meal ideas that respect your diet, allergies, food availability and budget.")}{card("/guide", "Arogya Guide", "Plain-language answers about screening terms and balanced eating.")}{card("/help", "Help", "How the site works, its limits and what to do in an emergency.")}</div>
    <p className="muted" style={{ marginTop: 12 }}>Screening and participant records are only for approved health workers. An administrator can upgrade your account if you are one.</p></>;
}
