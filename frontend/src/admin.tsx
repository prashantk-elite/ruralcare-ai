import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, apiWithTotal, fmtDate, fmtDateTime, fmtTime, qs, setAdminToken, hasAdminToken } from "./api";
import { Icon } from "./icons";
import { TrendChart } from "./charts";
import { Confirm, Empty, ErrorBox, Modal, Pager, Skeleton, useApi, useToast } from "./ui2";
import { LabTabs } from "./pages2";
import { UsersTab } from "./pages5";
import { ThemeButton } from "./theme";

/* ================= Sign-in ================= */
function AdminLogin({ notice, onDone }: { notice: string; onDone: () => void }) {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [show, setShow] = useState(false);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr("");
    if (!email.trim()) return setErr("Enter your administrator email.");
    if (!pw) return setErr("Enter your password.");
    setBusy(true);
    try { const r = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ email, password: pw }) }); setAdminToken(r.token); setPw(""); onDone(); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return <main className="adm-login"><div className="card">
    <div className="adm-badge"><Icon name="shield" size={26} /></div><h1>Administrator sign-in</h1>
    <p className="muted">For authorised Arogya AI administrators only. Every sign-in is recorded. Administrator accounts cannot be created from this page.</p>
    {notice && <div className="note" role="status">{notice}</div>}
    <form onSubmit={submit} noValidate>
      <label htmlFor="ae">Administrator email</label><input id="ae" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} />
      <label htmlFor="ap">Password</label><div className="pwrow"><input id="ap" type={show ? "text" : "password"} autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} />
        <button type="button" className="btn sec sm" onClick={() => setShow(!show)} aria-pressed={show}>{show ? "Hide" : "Show"}</button></div>
      <p className="err" role="alert">{err}</p>
      <button className="btn" disabled={busy}>{busy ? "Signing in…" : "Sign in as administrator"}</button></form>
    <p className="muted small"><Link to="/">← Back to Arogya AI</Link></p></div></main>;
}

/* ================= Shell ================= */
const NAV: [string, string, string][] = [["/admin/dashboard", "Overview", "chart"], ["/admin/users", "Users", "users"], ["/admin/content", "Content and announcements", "megaphone"], ["/admin/settings", "Settings", "sliders"], ["/admin/system", "System and AI", "server"], ["/admin/audit", "Audit logs", "file"], ["/admin/research", "Research lab", "flask"]];
function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor(to - now / 1000));
  return <span className="muted small" title="The session also ends after a period without activity">Session ends in {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>;
}
function AdminShell({ onLogout, children }: { onLogout: () => void; children: ReactNode }) {
  const me = useApi<any>("/api/admin/me"); const [open, setOpen] = useState(false); const loc = useLocation(); const [ask, setAsk] = useState(false);
  useEffect(() => setOpen(false), [loc.pathname]);
  return <div className="shell adm"><button className="menu-btn" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}><Icon name={open ? "close" : "menu"} /></button>
    <aside className={"side" + (open ? " open" : "")} aria-label="Administrator navigation"><div className="brand"><span className="logo" aria-hidden><Icon name="shield" size={18} /></span><span>Arogya<small>Administration</small></span></div>
      <nav>{NAV.map(([to, l, ic]) => <NavLink key={to} to={to}><Icon name={ic} size={18} />{l}</NavLink>)}</nav>
      <div className="side-foot"><Link to="/" className="portal-link"><Icon name="home" size={16} />Back to the site</Link></div></aside>
    {open && <div className="scrim" onClick={() => setOpen(false)} />}
    <div className="content"><div className="top"><span className="badge adm-b">ADMINISTRATOR</span><span className="muted small">{me.data?.email}</span><span style={{ flex: 1 }} />{me.data && <Countdown to={me.data.expires_at} />}<ThemeButton />
      <button className="btn sec sm" onClick={() => setAsk(true)}><Icon name="logout" size={14} /> Sign out</button></div>
      <main className="wide">{children}</main></div>
    {ask && <Confirm title="Sign out of the Admin Portal?" body={<p>Your administrator session will end on the server.</p>} label="Sign out" onNo={() => setAsk(false)} onYes={onLogout} />}</div>;
}

/* ================= Overview ================= */
const EVENT: Record<string, string> = { login: "Sign-in", login_failed: "Failed sign-in", signup: "New account", record_created: "Health record saved", assessment_completed: "Symptom assessment completed", wellness_saved: "Wellness plan saved", admin_login: "Administrator sign-in", admin_login_failed: "Failed administrator sign-in", server_error: "Server error", ai_error: "AI service error" };
function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint: string }) { return <div className="card kpi"><span>{label}</span><b>{value}</b><span className="small hint">{hint}</span></div>; }

function LiveActivity() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(""); const [last, setLast] = useState<number | null>(null); const [auto, setAuto] = useState(true);
  const load = () => api("/api/admin/active-users").then(r => { setD(r); setLast(Date.now() / 1000); setErr(""); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => { if (!auto) return; const t = setInterval(() => { if (!document.hidden) load(); }, 15000); return () => clearInterval(t); }, [auto]); // eslint-disable-line
  return <div className="card"><div className="sec-h"><h2>Live activity</h2><label className="chk inline"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />Refresh every 15 seconds</label></div>
    <p className="muted small">Verified sessions only: signed in, not ended or expired, and active in the last {d?.window_minutes ?? "…"} minutes. Labels are anonymous. No health or personal details are shown. {last ? `Updated ${fmtTime(last)}.` : ""}</p>
    <ErrorBox error={err} retry={load} />
    {d && (d.items.length ? <div className="tw"><table><thead><tr><th>Anonymous ID</th><th>Session</th><th>Account</th><th>Last activity</th></tr></thead><tbody>{d.items.map((i: any, n: number) => <tr key={n}><td><code>{i.who}</code></td><td>{i.kind === "admin" ? "Administrator" : "User"} · {i.session_status}</td><td>{i.account_status}</td><td>{fmtTime(i.last_activity)}</td></tr>)}</tbody></table></div> : <Empty title="No active sessions right now" text="A person only appears here while their session is live." />)}</div>;
}

function Overview() {
  const [day, setDay] = useState(""); const o = useApi<any>(`/api/admin/overview${qs({ day })}`);
  const [days, setDays] = useState(14); const act = useApi<any>(`/api/admin/activity?days=${days}`); const [metric, setMetric] = useState("active_users");
  const x = o.data;
  const M: [string, string][] = [["active_users", "Active users"], ["assessments", "Symptom assessments"], ["records", "Health records created"], ["signups", "New accounts"]];
  return <><h1>Platform overview</h1><p className="sub">Real counts from the database. Individual health information is never shown here.</p>
    <ErrorBox error={o.error} retry={o.reload} />
    {o.loading && !x ? <Skeleton h={100} n={2} /> : x && <>
      <div className="kpis">
        <Kpi label="Total users" value={x.total_users} hint={x.definitions.total_users} /><Kpi label={`Daily active users (${x.day})`} value={x.daily_active_users} hint={x.definitions.daily_active_users} />
        <Kpi label="Weekly active users" value={x.weekly_active_users} hint={x.definitions.weekly_active_users} /><Kpi label="Active sessions" value={x.active_sessions} hint={x.definitions.active_sessions} />
        <Kpi label="Symptom assessments" value={x.assessments} hint={x.definitions.assessments} /><Kpi label="Health records" value={x.health_records} hint={x.definitions.health_records} />
        <Kpi label="Administrators" value={x.administrators} hint={x.definitions.administrators} /><Kpi label="Suspended accounts" value={x.suspended_users} hint="Accounts an administrator has deactivated." /></div>
      <div className="card inline-f"><label htmlFor="dd">Show daily active users for</label><input id="dd" type="date" value={day} max={new Date().toISOString().slice(0, 10)} onChange={e => setDay(e.target.value)} /><span className="muted small">Day boundaries use the platform time zone. As of {fmtTime(x.as_of)}.</span></div></>}
    <LiveActivity />
    <div className="card"><div className="sec-h"><h2>Activity over time</h2><span><select aria-label="Metric" value={metric} onChange={e => setMetric(e.target.value)}>{M.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select> <select aria-label="Period" value={days} onChange={e => setDays(+e.target.value)}>{[7, 14, 30, 60].map(d => <option key={d} value={d}>{d} days</option>)}</select></span></div>
      {act.loading && !act.data ? <Skeleton h={200} /> : act.data && (act.data.days.some((d: any) => d[metric] > 0)
        ? <TrendChart title={M.find(m => m[0] === metric)![1] + " per day"} unit="" mode="bars" fmt={v => String(Math.round(v))} points={act.data.days.map((d: any) => ({ t: new Date(d.day + "T12:00:00").getTime() / 1000, v: d[metric], day: d.day }))} />
        : <Empty title="No activity in this period" text="Counts appear as people use the platform." />)}</div>
    {x && <div className="card"><h2>Recent platform events</h2>{x.recent_events.length ? <ul className="plain">{x.recent_events.map((e: any, i: number) => <li key={i}><span>{EVENT[e.kind] || e.kind}{e.who ? <> <code>{e.who}</code></> : null}{e.detail ? <span className="muted"> · {e.detail}</span> : null}</span><span className="muted small">{fmtDateTime(e.ts)}</span></li>)}</ul> : <p className="muted">No events yet.</p>}</div>}
  </>;
}

/* ================= Users ================= */

/* ================= Password reset requests ================= */
function ResetRequests({ issued }: { issued: (r: any, email: string) => void }) {
  const toast = useToast(); const r = useApi<any>("/api/admin/reset-requests"); const [busy, setBusy] = useState(0);
  const issue = async (i: any) => { setBusy(i.id); try { const out = await api(`/api/admin/reset-requests/${i.id}/issue`, { method: "POST" }); issued(out, i.email); r.reload(); } catch (x: any) { toast(x.message, "err"); } finally { setBusy(0); } };
  const dismiss = async (i: any) => { setBusy(i.id); try { await api(`/api/admin/reset-requests/${i.id}/dismiss`, { method: "POST" }); toast("Request dismissed"); r.reload(); } catch (x: any) { toast(x.message, "err"); } finally { setBusy(0); } };
  const items: any[] = r.data?.items || []; const open = items.filter(i => i.status === "requested").length;
  return <div className="card"><div className="sec-h"><h2>Password reset requests {open > 0 && <span className="badge adm-b">{open} waiting</span>}</h2><button className="btn sec sm" onClick={r.reload}>Refresh</button></div>
    <p className="muted small">People who forgot their password appear here. Make sure it is really them (for example in person or on a call), then create a one-time code and give it to them. Codes work once and expire after {r.data?.code_minutes ?? 30} minutes.</p>
    <ErrorBox error={r.error} retry={r.reload} />
    {r.loading && !r.data ? <Skeleton h={40} n={2} /> : items.length ? <ul className="plain">{items.map(i => <li key={i.id}><span><b>{i.email}</b><br /><span className="muted small">Asked {fmtDateTime(i.requested_at)} · {i.status === "requested" ? "waiting for a code" : i.status === "issued" ? `code issued, expires ${fmtTime(i.expires_at)}` : i.status === "expired" ? "code expired" : "locked after wrong tries"}</span></span>
      <span className="inline"><button className="btn sm" disabled={busy === i.id} onClick={() => issue(i)}>{i.status === "requested" ? "Create code" : "Create new code"}</button><button className="btn sec sm" disabled={busy === i.id} onClick={() => dismiss(i)}>Dismiss</button></span></li>)}</ul>
      : <Empty title="No reset requests" text="When someone asks to reset their password it will show up here." />}</div>;
}

function CodeModal({ data, onClose }: { data: { code: string; minutes: number; email: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return <Modal title="One-time reset code" onClose={onClose}>
    <p>Give this code to <b>{data.email}</b>. It is shown <b>only once</b> and works for {data.minutes} minutes.</p>
    <p className="resetcode" aria-label={"Reset code " + data.code.split("").join(" ")}>{data.code}</p>
    <p className="muted small">Tell them to open Sign in, choose Forgot password, then I have a code. Only share it with the person who owns the account.</p>
    <div className="actions"><button className="btn sec" onClick={async () => { try { await navigator.clipboard.writeText(data.code); setCopied(true); } catch { /* clipboard may be blocked; the code is visible */ } }}>{copied ? "Copied" : "Copy code"}</button><button className="btn" onClick={onClose}>Done</button></div></Modal>;
}

function Users() {
  const toast = useToast(); const [q, setQ] = useState(""); const [role, setRole] = useState(""); const [status, setStatus] = useState(""); const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<any[] | null>(null); const [total, setTotal] = useState(0); const [err, setErr] = useState(""); const [ask, setAsk] = useState<any>(null); const [tick, setTick] = useState(0); const [codeFor, setCodeFor] = useState<any>(null);
  const rowReset = async (u: any) => { try { const out = await api(`/api/admin/users/${u.id}/reset-code`, { method: "POST" }); setCodeFor({ ...out, email: u.email }); } catch (x: any) { toast(x.message, "err"); } };
  useEffect(() => { let live = true; const t = setTimeout(() => { apiWithTotal(`/api/admin/users${qs({ q, role, status, limit: 10, offset })}`).then(r => { if (live) { setRows(r.data); setTotal(r.total); setErr(""); } }).catch(e => live && setErr(e.message)); }, 250); return () => { live = false; clearTimeout(t); }; }, [q, role, status, offset, tick]);
  const next = ask?.status === "suspended" ? "active" : "suspended";
  return <><h1>Users</h1><p className="sub">Account management only. Administrators cannot see anyone's health records, symptoms or wellness plans.</p>
    <ResetRequests issued={(o, email) => setCodeFor({ ...o, email })} />
    <div className="card filters"><div><label htmlFor="uq">Search by email</label><input id="uq" type="search" value={q} onChange={e => { setQ(e.target.value); setOffset(0); }} /></div>
      <div><label htmlFor="ur">Role</label><select id="ur" value={role} onChange={e => { setRole(e.target.value); setOffset(0); }}><option value="">All</option>{["participant", "worker", "researcher", "admin"].map(r => <option key={r}>{r}</option>)}</select></div>
      <div><label htmlFor="us">Status</label><select id="us" value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}><option value="">All</option><option value="active">Active</option><option value="suspended">Suspended</option></select></div></div>
    <ErrorBox error={err} />
    <div className="card tw">{rows === null ? <Skeleton h={40} n={4} /> : rows.length ? <table className="stack"><thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Last active</th><th>Created</th><th><span className="sr">Actions</span></th></tr></thead>
      <tbody>{rows.map(u => <tr key={u.id}><td data-l="Email">{u.email}</td><td data-l="Role">{u.role}</td><td data-l="Status"><span className={"badge " + ((u.status || "active") === "suspended" ? "bad" : "")}>{u.status || "active"}</span></td><td data-l="Last active">{u.last_active ? fmtDateTime(u.last_active) : "Never"}</td><td data-l="Created">{fmtDate(u.created_at) || "Unknown"}</td>
        <td className="act">{u.role !== "admin" && (u.status || "active") !== "suspended" && <button className="btn sec sm" onClick={() => rowReset(u)}>Reset password</button>} <button className="btn sec sm" onClick={() => setAsk(u)}>{(u.status || "active") === "suspended" ? "Reactivate" : "Deactivate"}</button></td></tr>)}</tbody></table> : <Empty title="No users match" />}
      <Pager total={total} limit={10} offset={offset} onPage={setOffset} /></div>
    <details className="card"><summary><b>Change roles or create accounts</b></summary><UsersTab /></details>
    {codeFor && <CodeModal data={codeFor} onClose={() => setCodeFor(null)} />}
    {ask && <Confirm title={next === "suspended" ? "Deactivate this account?" : "Reactivate this account?"} danger={next === "suspended"} label={next === "suspended" ? "Deactivate" : "Reactivate"} onNo={() => setAsk(null)}
      body={<p>{ask.email} {next === "suspended" ? "will be signed out immediately and will not be able to sign in until reactivated." : "will be able to sign in again."} This action is recorded in the audit log.</p>}
      onYes={async () => { try { await api(`/api/admin/users/${ask.id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) }); toast("Account updated"); setAsk(null); setTick(t => t + 1); } catch (x: any) { toast(x.message, "err"); } }} />}</>;
}

/* ================= Content, announcements, facilities ================= */
function Announcements() {
  const toast = useToast(); const a = useApi<any>("/api/admin/announcements"); const [f, setF] = useState({ title: "", body: "", level: "info" }); const [err, setErr] = useState(""); const [del, setDel] = useState<any>(null);
  const add = async (e: FormEvent) => { e.preventDefault(); setErr(""); try { await api("/api/admin/announcements", { method: "POST", body: JSON.stringify(f) }); setF({ title: "", body: "", level: "info" }); toast("Announcement published"); a.reload(); } catch (x: any) { setErr(x.message); } };
  return <div className="card"><h2>Announcements</h2><p className="muted small">Shown to signed-in users on their dashboard and home page.</p>
    <form onSubmit={add}><div className="row"><div><label htmlFor="at">Title</label><input id="at" maxLength={80} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div><div><label htmlFor="al">Importance</label><select id="al" value={f.level} onChange={e => setF({ ...f, level: e.target.value })}><option value="info">Information</option><option value="important">Important</option></select></div></div>
      <label htmlFor="ab">Message</label><input id="ab" maxLength={500} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /><p className="err" role="alert">{err}</p><button className="btn">Publish</button></form>
    {a.data?.items?.length ? <ul className="plain">{a.data.items.map((i: any) => <li key={i.id}><span><b>{i.title}</b> <span className={"badge " + (i.active ? "" : "off")}>{i.active ? "Visible" : "Hidden"}</span><div className="muted small">{i.body}</div></span>
      <span><button className="btn sec sm" onClick={async () => { try { await api(`/api/admin/announcements/${i.id}?active=${!i.active}`, { method: "PATCH" }); a.reload(); } catch (x: any) { toast(x.message, "err"); } }}>{i.active ? "Hide" : "Show"}</button> <button className="btn sec sm" aria-label="Delete announcement" onClick={() => setDel(i)}><Icon name="trash" size={14} /></button></span></li>)}</ul> : <p className="muted">No announcements yet.</p>}
    {del && <Confirm title="Delete this announcement?" body={<p>{del.title}</p>} label="Delete" danger onNo={() => setDel(null)} onYes={async () => { try { await api(`/api/admin/announcements/${del.id}`, { method: "DELETE" }); toast("Announcement deleted"); setDel(null); a.reload(); } catch (x: any) { toast(x.message, "err"); } }} />}</div>;
}
function Wellness() {
  const toast = useToast(); const c = useApi<any>("/api/admin/content"); const [f, setF] = useState({ title: "", body: "" }); const [err, setErr] = useState(""); const [del, setDel] = useState<any>(null);
  const add = async (e: FormEvent) => { e.preventDefault(); setErr(""); try { await api("/api/admin/content", { method: "POST", body: JSON.stringify({ ...f, active: true }) }); setF({ title: "", body: "" }); toast("Wellness information published"); c.reload(); } catch (x: any) { setErr(x.message); } };
  return <div className="card"><h2>General wellness information</h2><p className="muted small">Short, general, non-diagnostic tips shown on the Diet and Wellness page. Do not publish treatment advice or medicine doses.</p>
    <form onSubmit={add}><label htmlFor="wt">Title</label><input id="wt" maxLength={80} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /><label htmlFor="wb2">Text</label><input id="wb2" maxLength={800} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /><p className="err" role="alert">{err}</p><button className="btn">Publish</button></form>
    {c.data?.items?.length ? <ul className="plain">{c.data.items.map((i: any) => <li key={i.id}><span><b>{i.title}</b> <span className={"badge " + (i.active ? "" : "off")}>{i.active ? "Visible" : "Hidden"}</span><div className="muted small">{i.body}</div></span>
      <span><button className="btn sec sm" onClick={async () => { try { await api(`/api/admin/content/${i.id}`, { method: "PATCH", body: JSON.stringify({ title: i.title, body: i.body, active: !i.active }) }); c.reload(); } catch (x: any) { toast(x.message, "err"); } }}>{i.active ? "Hide" : "Show"}</button> <button className="btn sec sm" aria-label="Delete item" onClick={() => setDel(i)}><Icon name="trash" size={14} /></button></span></li>)}</ul> : <p className="muted">Nothing published yet.</p>}
    {del && <Confirm title="Delete this item?" body={<p>{del.title}</p>} label="Delete" danger onNo={() => setDel(null)} onYes={async () => { try { await api(`/api/admin/content/${del.id}`, { method: "DELETE" }); toast("Deleted"); setDel(null); c.reload(); } catch (x: any) { toast(x.message, "err"); } }} />}</div>;
}
function Facilities() {
  const toast = useToast(); const l = useApi<any>("/api/admin/facilities"); const blank = { name: "", type: "phc", district: "", address: "", phone: "", hours: "", source: "", verified_on: "" };
  const [f, setF] = useState<any>(blank); const [err, setErr] = useState(""); const [del, setDel] = useState<any>(null);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const add = async (e: FormEvent) => { e.preventDefault(); setErr(""); try { await api("/api/admin/facilities", { method: "POST", body: JSON.stringify({ ...f, active: true }) }); setF(blank); toast("Facility added"); l.reload(); } catch (x: any) { setErr(x.message); } };
  return <div className="card"><h2>Health facility directory</h2><p className="muted small">Shown on Find a Doctor. Add a facility only after checking its details against a real source (for example a district health office list or a phone call). The source and the date you checked are shown to users.</p>
    <form onSubmit={add}><div className="row3"><div><label htmlFor="fn">Name</label><input id="fn" value={f.name} onChange={set("name")} maxLength={100} /></div><div><label htmlFor="ftp">Type</label><select id="ftp" value={f.type} onChange={set("type")}>{["phc", "chc", "hospital", "clinic", "pharmacy", "other"].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}</select></div><div><label htmlFor="fdi">District</label><input id="fdi" value={f.district} onChange={set("district")} maxLength={60} /></div></div>
      <div className="row3"><div><label htmlFor="fad">Address</label><input id="fad" value={f.address} onChange={set("address")} maxLength={200} /></div><div><label htmlFor="fph">Phone</label><input id="fph" inputMode="tel" value={f.phone} onChange={set("phone")} maxLength={20} /></div><div><label htmlFor="fho">Opening hours</label><input id="fho" value={f.hours} onChange={set("hours")} maxLength={80} /></div></div>
      <div className="row"><div><label htmlFor="fso">Source of these details</label><input id="fso" value={f.source} onChange={set("source")} maxLength={160} /></div><div><label htmlFor="fve">Date checked</label><input id="fve" type="date" value={f.verified_on} max={new Date().toISOString().slice(0, 10)} onChange={set("verified_on")} /></div></div>
      <p className="err" role="alert">{err}</p><button className="btn">Add facility</button></form>
    {l.data?.items?.length ? <ul className="plain">{l.data.items.map((i: any) => <li key={i.id}><span><b>{i.name}</b> <span className="tag">{i.type.toUpperCase()}</span> <span className="muted">{i.district}</span><div className="muted small">Source: {i.source} (checked {i.verified_on})</div></span><button className="btn sec sm" aria-label={`Delete ${i.name}`} onClick={() => setDel(i)}><Icon name="trash" size={14} /></button></li>)}</ul> : <p className="muted">No facilities added yet.</p>}
    {del && <Confirm title="Remove this facility?" body={<p>{del.name} will no longer be shown to users.</p>} label="Remove" danger onNo={() => setDel(null)} onYes={async () => { try { await api(`/api/admin/facilities/${del.id}`, { method: "DELETE" }); toast("Facility removed"); setDel(null); l.reload(); } catch (x: any) { toast(x.message, "err"); } }} />}</div>;
}
const ContentPage = () => <><h1>Content and announcements</h1><p className="sub">What users see on their dashboard, wellness page and Find a Doctor page.</p><Announcements /><Wellness /><Facilities /></>;

/* ================= Settings ================= */
const TOGGLES: [string, string, string][] = [["registration_open", "Open sign-ups", "When off, new people cannot create accounts. Existing users are not affected."], ["symptom_checker_enabled", "Symptom checker", "When off, users see a pause notice and emergency numbers instead of the checker."], ["ai_enabled", "AI-assisted wording", "When off, symptom results use only the fixed safety rules. Emergency detection never depends on AI."]];
function SettingsPage() {
  const toast = useToast(); const s = useApi<any>("/api/admin/settings"); const [ask, setAsk] = useState<any>(null); const [nums, setNums] = useState<any>({}); const [err, setErr] = useState("");
  useEffect(() => { if (s.data) setNums({ default_step_goal: s.data.settings.default_step_goal, default_water_goal_ml: s.data.settings.default_water_goal_ml, active_window_minutes: s.data.settings.active_window_minutes }); }, [s.data]);
  const patch = async (body: any) => { try { await api("/api/admin/settings", { method: "PATCH", body: JSON.stringify(body) }); toast("Setting saved"); s.reload(); return true; } catch (x: any) { toast(x.message, "err"); setErr(x.message); return false; } };
  if (s.loading && !s.data) return <><h1>Settings</h1><Skeleton h={80} n={3} /></>;
  const st = s.data?.settings, lim = s.data?.limits;
  return <><h1>Platform settings</h1><p className="sub">Changes apply immediately and are recorded in the audit log.</p><ErrorBox error={s.error} retry={s.reload} />
    {st && <><div className="card"><h2>Features</h2><ul className="plain">{TOGGLES.map(([k, l, d]) => <li key={k}><span><b>{l}</b><div className="muted small">{d}</div></span><button className={"switch" + (st[k] ? " on" : "")} role="switch" aria-checked={st[k]} aria-label={l} onClick={() => setAsk({ k, l, to: !st[k] })}><span /></button></li>)}</ul></div>
      <div className="card"><h2>Defaults and measurement</h2><div className="row3">
        <div><label htmlFor="n1">Default daily step goal</label><input id="n1" inputMode="numeric" value={nums.default_step_goal ?? ""} onChange={e => setNums({ ...nums, default_step_goal: e.target.value })} /><span className="muted small">{lim.default_step_goal.min} to {lim.default_step_goal.max}</span></div>
        <div><label htmlFor="n2">Default daily water goal (ml)</label><input id="n2" inputMode="numeric" value={nums.default_water_goal_ml ?? ""} onChange={e => setNums({ ...nums, default_water_goal_ml: e.target.value })} /><span className="muted small">{lim.default_water_goal_ml.min} to {lim.default_water_goal_ml.max}</span></div>
        <div><label htmlFor="n3">Live session window (minutes)</label><input id="n3" inputMode="numeric" value={nums.active_window_minutes ?? ""} onChange={e => setNums({ ...nums, active_window_minutes: e.target.value })} /><span className="muted small">{lim.active_window_minutes.min} to {lim.active_window_minutes.max}</span></div></div>
        <p className="muted small">The live window decides how recently a session must have been active to count as "live". Goals apply to people who have not set their own.</p><p className="err" role="alert">{err}</p>
        <button className="btn" onClick={async () => { setErr(""); const b: any = {}; for (const [k, v] of Object.entries(nums)) { const n = Number(v); if (!Number.isInteger(n)) { setErr("Enter whole numbers only."); return; } if (n !== st[k]) b[k] = n; } if (!Object.keys(b).length) { toast("Nothing changed"); return; } await patch(b); }}>Save values</button></div></>}
    {ask && <Confirm title={`Turn ${ask.to ? "on" : "off"}: ${ask.l}?`} label={ask.to ? "Turn on" : "Turn off"} danger={!ask.to} onNo={() => setAsk(null)} body={<p>This takes effect straight away for everyone.</p>} onYes={async () => { await patch({ [ask.k]: ask.to }); setAsk(null); }} />}</>;
}

/* ================= System and AI ================= */
function System() {
  const h = useApi<any>("/api/admin/system-health"); const m = useApi<any>("/api/research/models"); const d = h.data;
  const st = (v: string) => <span className={"badge " + (v === "ok" ? "" : "bad")}>{v === "ok" ? "✓ OK" : "✗ " + v}</span>;
  return <><div className="greet"><h1>System health and AI</h1><button className="btn sec" onClick={h.reload}>Run checks again</button></div><ErrorBox error={h.error} retry={h.reload} />
    {h.loading && !d ? <Skeleton h={100} n={2} /> : d && <><div className="card"><h2>Live checks</h2><table><tbody><tr><td>API</td><td>{st(d.api)}</td></tr><tr><td>Database</td><td>{st(d.database)}</td></tr><tr><td>Errors in the last 24 hours</td><td><b>{d.errors_24h}</b></td></tr><tr><td>Research model files</td><td>{d.model_files_present ? st("ok") : <span className="tag">Not found</span>}</td></tr></tbody></table><p className="muted small">Checked at {fmtTime(d.checked_at)}. Results are live checks, not stored values.</p></div>
      <div className="card"><h2>AI service</h2><table><tbody><tr><td>API key configured on the server</td><td>{d.ai.configured ? st("ok") : <span className="tag">Not configured</span>}</td></tr><tr><td>Enabled in settings</td><td>{d.ai.enabled_in_settings ? "Yes" : "No"}</td></tr><tr><td>Assessments that used AI wording (all time)</td><td><b>{d.ai.assessments_with_ai_total}</b></td></tr></tbody></table>
        <h3>Last 7 days by outcome</h3>{Object.keys(d.ai.last_7_days_by_status).length ? <ul className="plain">{Object.entries<any>(d.ai.last_7_days_by_status).map(([k, v]) => <li key={k}><span>{k.replace(/_/g, " ")}</span><b>{v}</b></li>)}</ul> : <p className="muted">No assessments in the last 7 days.</p>}
        {!d.ai.configured && <p className="muted small">To enable AI wording, set ANTHROPIC_API_KEY on the server. The key is never sent to the browser. Without it, results come from the fixed safety rules only.</p>}</div>
      <div className="card"><h2>Recent server errors</h2>{d.recent_errors.length ? <ul className="plain">{d.recent_errors.map((e: any, i: number) => <li key={i}><code>{e.detail}</code><span className="muted small">{fmtDateTime(e.ts)}</span></li>)}</ul> : <p className="muted">None recorded.</p>}<p className="muted small">Only the route and error type are logged, never request contents.</p></div></>}
    <div className="card"><h2>Research model</h2>{m.data && !m.data.status ? <table><tbody><tr><td>Version</td><td>{m.data.version}</td></tr><tr><td>Selected model</td><td>{m.data.best_model}</td></tr><tr><td>Dataset</td><td>{m.data.dataset?.source}</td></tr><tr><td>Status</td><td>{m.data.synthetic ? <span className="tag">Trained on synthetic data: not validated</span> : <span className="tag">Research only, not clinically validated</span>}</td></tr></tbody></table> : <p className="muted">No trained model found.</p>}<p className="muted small">No model is marked production-approved.</p></div></>;
}

/* ================= Audit ================= */
function Audit() {
  const [action, setAction] = useState(""); const [offset, setOffset] = useState(0); const [q, setQ] = useState("");
  useEffect(() => { const t = setTimeout(() => { setQ(action); setOffset(0); }, 300); return () => clearTimeout(t); }, [action]);
  const a = useApi<any>(`/api/admin/audit-logs${qs({ limit: 20, offset, action: q })}`);
  return <><h1>Audit logs</h1><p className="sub">Administrator actions and sign-ins. Passwords, tokens and health data are never recorded.</p>
    <div className="card filters"><div><label htmlFor="aa">Filter by action</label><input id="aa" type="search" value={action} onChange={e => setAction(e.target.value)} placeholder="for example: set_status" /></div></div>
    <ErrorBox error={a.error} retry={a.reload} />
    <div className="card tw">{a.loading && !a.data ? <Skeleton h={40} n={4} /> : a.data?.items.length ? <><table><thead><tr><th>Time</th><th>Administrator</th><th>Action</th><th>Affected resource</th><th>Outcome</th></tr></thead>
      <tbody>{a.data.items.map((i: any) => <tr key={i.id}><td>{fmtDateTime(i.ts)}</td><td>{i.admin ? <code>{i.admin}</code> : <span className="muted">unknown</span>}</td><td>{i.action}</td><td>{i.resource} {i.resource_id}</td><td><span className={"badge " + (String(i.outcome).startsWith("success") ? "" : "bad")}>{i.outcome}</span></td></tr>)}</tbody></table><Pager total={a.data.total} limit={20} offset={offset} onPage={setOffset} /></> : <Empty title="No entries" />}</div></>;
}

/* ================= App ================= */
export function AdminApp() {
  const nav = useNavigate(); const loc = useLocation();
  const [authed, setAuthed] = useState(hasAdminToken()); const [notice, setNotice] = useState("");
  useEffect(() => { const h = () => { setAdminToken(""); setAuthed(false); setNotice("Your administrator session has ended. Please sign in again."); }; window.addEventListener("rc-admin-lost", h); return () => window.removeEventListener("rc-admin-lost", h); }, []);
  const logout = async () => { try { await api("/api/admin/logout", { method: "POST" }); } catch { /* the session may already be gone */ } setAdminToken(""); setAuthed(false); setNotice("You have signed out."); nav("/admin/login"); };
  if (!authed) return loc.pathname === "/admin/login" ? <AdminLogin notice={notice} onDone={() => { setAuthed(true); setNotice(""); nav("/admin/dashboard"); }} /> : <Navigate to="/admin/login" replace />;
  return <AdminShell onLogout={logout}><Routes>
    <Route path="/admin/login" element={<Navigate to="/admin/dashboard" replace />} /><Route path="/admin/dashboard" element={<Overview />} /><Route path="/admin/users" element={<Users />} /><Route path="/admin/content" element={<ContentPage />} />
    <Route path="/admin/settings" element={<SettingsPage />} /><Route path="/admin/system" element={<System />} /><Route path="/admin/audit" element={<Audit />} /><Route path="/admin/research" element={<LabTabs />} /><Route path="*" element={<Navigate to="/admin/dashboard" replace />} /></Routes></AdminShell>;
}
