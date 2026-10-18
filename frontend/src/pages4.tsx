import { useEffect, useState } from "react";
import { api } from "./api";
import { UsersTab } from "./pages5";

export function AdminPage() {
  const [tab, setTab] = useState("System health"); const [h, setH] = useState<any>(null); const [users, setUsers] = useState<any[]>([]); const [m, setM] = useState<any>(null); const [c, setC] = useState<any>(null); const [err, setErr] = useState("");
  const loadHealth = () => api("/api/health").then(setH).catch(e => setH({ api: "unreachable", database: "unknown", error: e.message }));
  useEffect(() => { loadHealth(); api("/api/admin/users").then(setUsers).catch(e => setErr(e.message)); api("/api/research/models").then(setM).catch(() => {}); api("/api/analytics/community").then(setC).catch(() => {}); }, []);
  const st = (v: string) => <span className="badge" style={v !== "ok" ? { background: "var(--crit)", color: "#fff" } : undefined}>{v === "ok" ? "✓ OK" : "✗ " + v}</span>;
  return <><h1>Administration</h1><div className="note">Admins manage accounts and review system status. Admins cannot read participant records.</div><p className="err" role="alert">{err}</p>
    <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>{["System health", "Users", "Model versions", "Consent & privacy"].map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "btn sm" : "btn sec sm"} onClick={() => setTab(t)}>{t}</button>)}</div>
    {tab === "System health" && <div className="card">{h ? <><table><tbody><tr><td>API</td><td>{st(h.api)}</td></tr><tr><td>Database</td><td>{st(h.database)}</td></tr><tr><td>Trained model files</td><td>{h.model_files_present === undefined ? "unknown" : h.model_files_present ? st("ok") : <span className="tag">Not found</span>}</td></tr></tbody></table>
      <p className="muted">Results come from live checks{h.checked_at ? ` at ${new Date(h.checked_at * 1000).toLocaleTimeString()}` : ""}. {h.error}</p></> : <p role="status">Checking…</p>}<button className="btn sec" onClick={() => { setH(null); loadHealth(); }}>Run checks again</button></div>}
    {tab === "Users" && <UsersTab />}
    {tab === "Model versions" && <div className="card">{m && !m.status ? <table><tbody><tr><td>Version</td><td>{m.version}</td></tr><tr><td>Selected model</td><td>{m.best_model}</td></tr><tr><td>Dataset</td><td>{m.dataset.source}</td></tr><tr><td>Rows</td><td>{m.dataset.rows}</td></tr><tr><td>Status</td><td>{m.synthetic ? <span className="tag">Trained on synthetic data: not validated</span> : <span className="tag">Trained on public dataset: research only, not clinically validated</span>}</td></tr></tbody></table> : <p>No trained model found. Run <code>python ml/train.py</code> and restart the API.</p>}<p className="muted">No model is marked production-approved.</p></div>}
    {tab === "Consent & privacy" && <div className="card"><ul><li>Consent is required before a participant is registered, and can be withdrawn on the participant profile.</li><li>Aggregate charts hide groups below {c?.min_group_size ?? 5} participants.</li><li>Sensitive actions are recorded in the audit log without health values.</li><li>No real participant data should be entered until institutional approval and consent arrangements exist.</li></ul></div>}</>;
}
