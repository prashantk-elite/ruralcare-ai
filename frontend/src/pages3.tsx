import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "./api";

const when = (t: number) => new Date(t * 1000).toLocaleDateString();
export function Profile() {
  const { id } = useParams(); const nav = useNavigate();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(""); const [tab, setTab] = useState("Overview");
  const load = () => api(`/api/participants/${id}`).then(setD).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [id]);
  if (err) return <><h1>Participant</h1><p className="err" role="alert">{err}</p><Link to="/participants">Back to participants</Link></>;
  if (!d) return <p role="status">Loading…</p>;
  const p = d.participant, active = d.consents.find((c: any) => !c.withdrawn_at);
  const withdraw = async () => { if (!window.confirm("Withdraw consent? New screenings will be blocked for this participant.")) return; try { await api(`/api/participants/${id}/withdraw-consent`, { method: "POST" }); load(); } catch (x: any) { setErr(x.message); } };
  const del = async () => { if (!window.confirm("Permanently delete this participant and all their records?")) return; try { await api(`/api/participants/${id}`, { method: "DELETE" }); nav("/participants"); } catch (x: any) { setErr(x.message); } };
  return <><Link to="/participants">← Participants</Link><h1>{p.code}</h1>
    <p><span className="badge">{active ? "Consent active" : "Consent withdrawn"}</span> <span className="tag">Age band {p.age_band}</span><span className="tag">Community {p.community}</span><span className="tag">Language {p.language}</span></p>
    <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>{["Overview", "Screenings", "Follow-ups", "Records & Consent"].map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "btn sm" : "btn sec sm"} onClick={() => setTab(t)}>{t}</button>)}</div>
    {tab === "Overview" && <div className="kpis"><div className="card kpi"><b>{d.screenings.length}</b><span>Screenings</span></div><div className="card kpi"><b>{d.followups.filter((f: any) => f.status !== "completed").length}</b><span>Open follow-ups</span></div><div className="card kpi"><b style={{ fontSize: 18 }}>{d.screenings[0] ? when(d.screenings[0].recorded_at) : "None yet"}</b><span>Latest screening</span></div></div>}
    {tab === "Screenings" && <div className="card"><h2>Screening history</h2><div className="note">Recorded measurements only. Model outputs are shown separately after running an assessment on the Screening page.</div>
      {d.screenings.length ? d.screenings.map((s: any) => <div key={s.id} style={{ borderLeft: "3px solid var(--pri)", padding: "4px 12px", margin: "12px 0" }}><b>{when(s.recorded_at)}</b> <span className="tag">Screening #{s.id}</span>{s.urgent ? <span className="tag">Urgent symptoms reported</span> : null}
        <div className="muted">Age {s.age} · {s.height_cm} cm · {s.weight_kg} kg · BMI {(s.weight_kg / (s.height_cm / 100) ** 2).toFixed(1)} (screening only) · BP {s.systolic ? `${s.systolic}/${s.diastolic} mmHg` : "not measured"} · Glucose {s.glucose ? `${s.glucose} mg/dL (${s.glucose_type})` : "not measured"}</div></div>) : <p>No screenings yet. Start one from the Screening page.</p>}</div>}
    {tab === "Follow-ups" && <div className="card tw">{d.followups.length ? <table><thead><tr><th>Due</th><th>Status</th></tr></thead><tbody>{d.followups.map((f: any) => <tr key={f.id}><td>{when(f.due_at)}</td><td>{f.status}</td></tr>)}</tbody></table> : "No follow-ups scheduled."}</div>}
    {tab === "Records & Consent" && <div className="card"><h2>Consent</h2>{d.consents.map((c: any, i: number) => <p key={i}>Version {c.version}: granted {when(c.granted_at)}{c.withdrawn_at ? `, withdrawn ${when(c.withdrawn_at)}` : " (active)"}</p>)}
      <p className="muted">Withdrawing consent blocks new screenings. Deleting removes the participant and all linked records.</p><button className="btn sec" disabled={!active} onClick={withdraw}>Withdraw consent</button> <button className="btn" style={{ background: "var(--crit)", color: "#fff" }} onClick={del}>Delete participant</button></div>}</>;
}

const TIER = ["", "Low cost", "Medium cost", "Higher cost"];
export function Nutrition2() {
  const [diet, setDiet] = useState("veg"); const [budget, setBudget] = useState(2); const [al, setAl] = useState<string[]>([]);
  const [day, setDay] = useState(0); const [plan, setPlan] = useState<any>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const gen = async (dd = day) => { setErr(""); setBusy(true); try { setPlan(await api("/api/nutrition/recommendations", { method: "POST", body: JSON.stringify({ diet, budget_tier: budget, allergies: al, day: dd }) })); } catch (x: any) { setErr(x.message); } finally { setBusy(false); } };
  useEffect(() => { if (plan) gen(day); }, [day]);
  const items = plan ? plan.plan.flatMap((m: any) => m.items).filter((i: any) => i.food) : [];
  const groups = [...new Set<string>(items.map((i: any) => i.group))];
  return <><h1>Personalized Nutrition Planner</h1><div className="card noprint"><div className="row"><div><label htmlFor="d">Dietary preference</label><select id="d" value={diet} onChange={e => setDiet(e.target.value)}><option value="veg">Vegetarian</option><option value="egg">Egg-inclusive vegetarian</option><option value="non">Non-vegetarian</option></select></div>
    <div><label htmlFor="b">Budget tier (relative)</label><select id="b" value={budget} onChange={e => setBudget(+e.target.value)}><option value={1}>Low</option><option value={2}>Medium</option><option value={3}>Higher</option></select></div></div>
    <fieldset style={{ border: 0, padding: 0 }}><legend>Allergies and restrictions</legend>{["milk", "egg", "peanut", "gluten", "fish"].map(a => <label key={a} style={{ display: "inline-block", marginRight: 14, fontWeight: 400 }}><input type="checkbox" checked={al.includes(a)} onChange={e => setAl(e.target.checked ? [...al, a] : al.filter(x => x !== a))} />{a}</label>)}</fieldset>
    <div className="note">Conditions that need a specialised diet (diabetes, kidney disease, pregnancy, serious allergies, eating disorders) need a qualified health professional. Nutrient values and prices are not invented.</div>
    <p className="err" role="alert">{err}</p><button className="btn" disabled={busy} onClick={() => gen()}>{busy ? "Generating…" : plan ? "Regenerate plan" : "Generate plan"}</button> {plan && <button className="btn sec" onClick={() => window.print()}>Print plan</button>}</div>
    {plan && <><div role="tablist" className="noprint" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>{[0, 1, 2, 3, 4, 5, 6].map(i => <button key={i} role="tab" aria-selected={day === i} className={day === i ? "btn sm" : "btn sec sm"} onClick={() => setDay(i)}>Day {i + 1}</button>)}</div>
      <div className="kpis"><div className="card kpi"><b>{items.length}</b><span>Foods suggested today</span></div><div className="card kpi"><b>{groups.length}</b><span>Food groups: {groups.join(", ") || "none"}</span></div><div className="card kpi"><b style={{ fontSize: 18 }}>{al.length ? al.join(", ") : "None selected"}</b><span>Allergies checked</span></div><div className="card kpi"><b style={{ fontSize: 18 }}>Unavailable</b><span>Nutrient data source</span></div></div>
      <div className="row">{plan.plan.map((m: any) => <div className="card" key={m.meal}><h2>{m.meal}</h2>{m.items.map((i: any, k: number) => <div key={k} style={{ borderTop: k ? "1px solid var(--bd)" : 0, padding: "8px 0" }}>{i.food ? <><b>{i.food}</b><div><span className="tag">{i.group}</span><span className="tag">{TIER[i.cost_tier]}</span><span className="tag">{i.nutrient_data}</span></div><div className="muted">{i.reason}{i.alternatives.length ? `. Alternatives: ${i.alternatives.join(", ")}` : ""}</div></> : <span className="muted">{i.note}</span>}</div>)}</div>)}</div>
      <div className="card"><h2>Why these foods?</h2><ul><li>Dietary preference and allergy filters are applied first.</li><li>Only foods marked available and within the chosen cost tier are used.</li><li>Foods are ranked for variety across meals and days.</li><li>Cost is a relative tier, not a price, and nutrient values are shown only when a verified source exists.</li></ul><p className="muted">{plan.disclaimer}</p></div></>}</>;
}
