import { useEffect, useState } from "react";
import { api } from "./api";
import { ThemePicker } from "./theme";

const STEPS = ["Participant", "Measurements", "Review & consent"];
const Stepper = ({ n }: { n: number }) => <ol aria-label="Progress" style={{ display: "flex", gap: 8, listStyle: "none", padding: 0, flexWrap: "wrap" }}>{STEPS.map((s, i) =>
  <li key={s} aria-current={i === n ? "step" : undefined} className="badge" style={{ opacity: i <= n ? 1 : .5, background: i === n ? "var(--pri)" : undefined, color: i === n ? "var(--pri-ink)" : undefined }}>{i < n ? "✓ " : `${i + 1}. `}{s}</li>)}</ol>;

export function Wizard() {
  const [ps, setPs] = useState<any[]>([]);
  const [n, setN] = useState(0);
  const [f, setF] = useState<any>({ participant_id: "", age: "", height_cm: "", weight_kg: "", systolic: "", diastolic: "", glucose_mgdl: "", glucose_type: "", urgent_symptoms: false, consent: false });
  const [err, setErr] = useState(""); const [res, setRes] = useState<any>(null); const [as, setAs] = useState<any>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { api("/api/participants").then(setPs).catch(e => setErr(e.message)); }, []);
  const v = (k: string) => f[k] === "" ? null : Number(f[k]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const check = (step: number) => { const e: string[] = [];
    if (step === 0) { if (!f.participant_id) e.push("Select a participant."); const a = v("age"), h = v("height_cm"), w = v("weight_kg");
      if (a === null || a < 18 || a > 110) e.push("Age must be 18 to 110."); if (h === null || h < 100 || h > 230) e.push("Height must be 100 to 230 cm."); if (w === null || w < 25 || w > 250) e.push("Weight must be 25 to 250 kg."); }
    if (step === 1) { const s = v("systolic"), d = v("diastolic"), g = v("glucose_mgdl");
      if ((s === null) !== (d === null)) e.push("Enter both blood pressure values or neither."); else if (s !== null && (s < 50 || s > 260 || d < 30 || d > 160 || d >= s)) e.push("Blood pressure looks impossible; please re-measure.");
      if (g !== null && (g < 20 || g > 800)) e.push("Glucose must be 20 to 800 mg/dL."); if (g !== null && !f.glucose_type) e.push("Select the glucose measurement type."); }
    if (step === 2 && !f.consent) e.push("Consent must be confirmed before saving.");
    setErr(e.join(" ")); return !e.length; };
  const next = () => { if (check(n)) setN(n + 1); };
  const submit = async () => { if (!check(2)) return; setBusy(true); setRes(null); setAs(null);
    try { setRes(await api("/api/screenings", { method: "POST", body: JSON.stringify({ participant_id: Number(f.participant_id), age: v("age"), height_cm: v("height_cm"), weight_kg: v("weight_kg"), systolic: v("systolic"), diastolic: v("diastolic"), glucose_mgdl: v("glucose_mgdl"), glucose_type: f.glucose_type || null, urgent_symptoms: f.urgent_symptoms }) })); setN(3); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); } };
  const assess = async () => { try { setAs(await api(`/api/screenings/${res.id}/assess`, { method: "POST" })); } catch (x: any) { setErr(x.message); } };
  const fld = (k: string, label: string, hint: string) => <div><label htmlFor={k}>{label}</label><input id={k} type="number" value={f[k]} onChange={set(k)} /><span className="muted">{hint}</span></div>;
  const rows: [string, any][] = [["Participant", ps.find(p => String(p.id) === String(f.participant_id))?.code], ["Age", f.age && f.age + " years"], ["Height", f.height_cm && f.height_cm + " cm"], ["Weight", f.weight_kg && f.weight_kg + " kg"], ["Blood pressure", f.systolic && `${f.systolic}/${f.diastolic} mmHg`], ["Glucose", f.glucose_mgdl && `${f.glucose_mgdl} mg/dL (${f.glucose_type})`]];
  const bmi = f.height_cm && f.weight_kg ? (f.weight_kg / (f.height_cm / 100) ** 2).toFixed(1) : null;
  return <><h1>Health Screening</h1><Stepper n={Math.min(n, 2)} /><div className="note">Leave optional fields empty if not measured. Empty is never saved as zero.</div>
    {n === 0 && <div className="card"><label htmlFor="pid">Participant</label><select id="pid" value={f.participant_id} onChange={set("participant_id")}><option value="">Select…</option>{ps.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}</select>
      {!ps.length && <p className="muted">No participants yet. Register one under Participants first.</p>}<div className="row">{fld("age", "Age (years)", "Adults only, 18 to 110")}{fld("height_cm", "Height (cm)", "100 to 230")}{fld("weight_kg", "Weight (kg)", "25 to 250")}</div></div>}
    {n === 1 && <div className="card"><div className="row">{fld("systolic", "Systolic BP (mmHg), optional", "Both BP values or neither")}{fld("diastolic", "Diastolic BP (mmHg), optional", "Must be below systolic")}{fld("glucose_mgdl", "Glucose (mg/dL), optional", "20 to 800")}
      <div><label htmlFor="gt">Glucose measurement type</label><select id="gt" value={f.glucose_type} onChange={set("glucose_type")}><option value="">Not measured</option><option>fasting</option><option>random</option><option>post-meal</option></select></div></div>
      <label><input type="checkbox" checked={f.urgent_symptoms} onChange={set("urgent_symptoms")} />Urgent symptoms reported (chest pain, severe breathlessness, fainting, confusion)</label></div>}
    {n === 2 && <div className="card"><h2>Review</h2><div className="tw"><table><tbody>{rows.map(([k, val]) => <tr key={k}><td>{k}</td><td>{val || <span className="tag">Not measured / missing</span>}</td></tr>)}
      <tr><td>BMI (derived, screening only)</td><td>{bmi ?? <span className="tag">Needs height and weight</span>}</td></tr><tr><td>Urgent symptoms</td><td>{f.urgent_symptoms ? "Yes" : "No"}</td></tr></tbody></table></div>
      <div className="note">Data is used only for this educational research prototype. Use demo or consented practice values only.</div>
      <label><input type="checkbox" checked={f.consent} onChange={set("consent")} />I confirm the participant has given explicit consent for this screening</label></div>}
    {n < 3 && <><p className="err" role="alert">{err}</p>{n > 0 && <button className="btn sec" onClick={() => { setErr(""); setN(n - 1); }}>Back</button>} {n < 2 ? <button className="btn" onClick={next}>Next</button> : <button className="btn" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save screening"}</button>}</>}
    {res && <div className="card">{res.alert && <div className="note alert" role="alert"><b>{res.alert}</b></div>}<h2>Saved screening #{res.id}</h2><p>BMI (screening measure, not a diagnosis): <b>{res.bmi}</b>. Optional measurement completeness: {Math.round(res.optional_measurement_completeness * 100)}%.</p>
      <button className="btn sec" onClick={assess}>Run research assessment</button> <button className="btn sec" onClick={() => { setN(0); setRes(null); setAs(null); setF({ ...f, age: "", height_cm: "", weight_kg: "", systolic: "", diastolic: "", glucose_mgdl: "", glucose_type: "", urgent_symptoms: false, consent: false }); }}>New screening</button></div>}
    {as && <div className="card"><h2>Assessment</h2>{as.status === "research_output" ? <><p>Target: {as.target}. Model {as.model_version}. Uncalibrated score: <b>{as.score}</b></p><p className="muted">{as.score_note}</p><ul>{as.limitations.map((l: string) => <li key={l}>{l}</li>)}</ul></> : <div className="note"><b>{as.message || as.status.replace(/_/g, " ")}</b>{as.reason && <p>{as.reason}</p>}{as.required && <p>Required: {as.required.join(", ")}</p>}</div>}</div>}</>;
}

const TABS = ["Overview", "Evaluation", "Explainability", "Comparison", "Report"];
const p3 = (x: any) => typeof x === "number" ? x.toFixed(3) : "n/a";
export function LabTabs() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(""); const [tab, setTab] = useState("Overview");
  useEffect(() => { api("/api/research/models").then(setD).catch(e => setErr(e.message)); }, []);
  if (err) return <><h1>Research Lab</h1><p className="err" role="alert">{err}</p></>;
  if (!d) return <><h1>Research Lab</h1><p role="status">Loading…</p></>;
  if (d.status) return <><h1>Research Lab</h1><div className="card">{d.status}. Run <code>python ml/train.py --data diabetes.csv</code> and restart the API.</div></>;
  const best = d.all_models[d.best_model], cm = d.test_metrics.confusion_matrix, imp = Object.entries<any>(d.permutation_importance_roc_auc), mx = Math.max(...imp.map(([, v]) => Math.abs(v.mean)), 0.0001);
  return <><h1>Research Lab</h1>{d.synthetic && <div className="note alert" role="alert"><b>SYNTHETIC DATA:</b> these metrics cannot indicate real-world performance.</div>}
    <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>{TABS.map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "btn sm" : "btn sec sm"} onClick={() => setTab(t)}>{t}</button>)}</div>
    {tab === "Overview" && <div className="card"><div className="kpis"><div className="card kpi"><b>{d.dataset.rows}</b><span>Rows in dataset</span></div><div className="card kpi"><b>{d.features.length}</b><span>Features</span></div><div className="card kpi"><b style={{ fontSize: 18 }}>{d.best_model}</b><span>Best on validation</span></div><div className="card kpi"><b style={{ fontSize: 18 }}>{d.version}</b><span>Model version</span></div></div>
      <p><b>Source:</b> {d.dataset.source}</p><p><b>Split:</b> {d.dataset.split}. Model chosen on validation ROC-AUC, reported on the held-out test set.</p><p><b>Features:</b> {d.features.join(", ")}</p><p><b>Target:</b> {d.target}</p><p className="muted">Zero values that mean "not measured" are treated as missing and imputed with the median inside the saved pipeline.</p></div>}
    {tab === "Evaluation" && <div className="card"><h2>{d.best_model}: held-out test set (n={d.test_metrics.n}, positives {d.test_metrics.positives})</h2><div className="kpis">{[["ROC-AUC", "roc_auc"], ["PR-AUC", "pr_auc"], ["Recall", "recall_sensitivity"], ["Specificity", "specificity"], ["Precision", "precision"], ["F1", "f1"]].map(([l, k]) => <div className="card kpi" key={k}><b>{p3(d.test_metrics[k])}</b><span>{l}</span></div>)}</div>
      <h2>Confusion matrix</h2><table style={{ maxWidth: 360 }}><thead><tr><th></th><th>Predicted negative</th><th>Predicted positive</th></tr></thead><tbody><tr><td>Actual negative</td><td>{cm[0][0]} (TN)</td><td>{cm[0][1]} (FP)</td></tr><tr><td>Actual positive</td><td>{cm[1][0]} (FN)</td><td>{cm[1][1]} (TP)</td></tr></tbody></table>
      <p className="muted">5-fold cross-validation ROC-AUC (training data): {p3(best.cv_roc_auc_mean)} ± {p3(best.cv_roc_auc_std)}. Small test sets give wide uncertainty.</p></div>}
    {tab === "Explainability" && <div className="card"><h2>Permutation importance (drop in test ROC-AUC)</h2>{imp.map(([k, v]) => <div key={k} style={{ margin: "8px 0" }}><div>{k}: {p3(v.mean)}</div><div style={{ background: "var(--bd)", borderRadius: 6 }}><div style={{ width: `${Math.max(2, Math.abs(v.mean) / mx * 100)}%`, background: "var(--pri)", height: 12, borderRadius: 6 }} /></div></div>)}
      <div className="note">Importance shows what the model relied on. It does not prove causation or confirm a diagnosis.</div></div>}
    {tab === "Comparison" && <div className="card tw"><table><thead><tr><th>Model</th><th>Test ROC-AUC</th><th>PR-AUC</th><th>Recall</th><th>Specificity</th><th>F1</th><th>Train s</th></tr></thead><tbody>{Object.entries<any>(d.all_models).map(([k, m]) => <tr key={k}><td>{k}{k === d.best_model && <span className="tag">selected on validation</span>}</td><td>{p3(m.test.roc_auc)}</td><td>{p3(m.test.pr_auc)}</td><td>{p3(m.test.recall_sensitivity)}</td><td>{p3(m.test.specificity)}</td><td>{p3(m.test.f1)}</td><td>{m.train_seconds}</td></tr>)}</tbody></table><p className="muted">Differences do not mean a model is clinically superior.</p></div>}
    {tab === "Report" && <div className="card"><h2>Research summary (generated from the saved results)</h2><p><b>Objective:</b> compare interpretable and tree-based baselines for a screening-risk research target.</p><p><b>Dataset:</b> {d.dataset.source}; {d.dataset.rows} rows.</p><p><b>Method:</b> median imputation, standardisation, stratified {d.dataset.split}, five-fold CV, three models.</p><p><b>Result:</b> {d.best_model} test ROC-AUC {p3(d.test_metrics.roc_auc)} on {d.test_metrics.n} held-out records.</p>
      <h2>Limitations</h2><ul>{d.limitations.map((l: string) => <li key={l}>{l}</li>)}</ul><h2>Ethics</h2><p>Educational prototype; no diagnosis or medication advice; consent and role-based access enforced; synthetic or public data only.</p><button className="btn sec noprint" onClick={() => window.print()}>Print report</button></div>}</>;
}

const FAQ: [string, string][] = [["Is this a diagnosis?", "No. Screening outputs are research information and never a diagnosis. Please see a qualified health professional."], ["Why does the assessment say the model is not validated?", "The model was trained on synthetic data or has not been clinically validated, so no score is shown as if it were reliable."], ["Why are some counts hidden?", "Groups below the minimum size are hidden so a person cannot be identified from aggregate charts."], ["Why does the nutrition plan show 'Nutritional data unavailable'?", "Nutrient values are not invented. They appear only after a verified food composition source is added."], ["What if someone has urgent symptoms?", "Contact local emergency services or the nearest health facility immediately. Do not wait for the app."]];
export const Help = () => <><h1>Help and Documentation</h1><div className="note">Academic research prototype. Not a medical device.</div><div className="card">{FAQ.map(([q, a]) => <details key={q} style={{ margin: "8px 0" }}><summary style={{ cursor: "pointer", fontWeight: 600 }}>{q}</summary><p className="muted">{a}</p></details>)}</div></>;
export const Notifications = () => <><h1>Notifications</h1><div className="card">No notifications yet. Follow-up reminders and system notices will appear here. Reminders are opt-in and never contain health details.</div></>;
export const Settings = ({ role }: { role: string }) => <><h1>Settings</h1><p className="sub">Manage your account, appearance and privacy.</p>
  <div className="card"><div style={{ display: "flex", gap: 14, alignItems: "center" }}><span className="avatar" aria-hidden>{role.charAt(0).toUpperCase()}</span>
    <div><b style={{ fontSize: 18 }}>Your account</b><div><span className="badge">{role}</span></div></div></div>
    <p className="muted" style={{ marginBottom: 0 }}>Sessions end after about an hour. Sign-in is kept in memory only, never in browser storage, which protects shared devices.</p></div>
  <ThemePicker />
  <div className="card"><h2>Privacy and safety</h2><ul className="checks">
    <li>Charts hide groups below the minimum size so no one can be identified.</li>
    <li>Admin and researcher roles cannot read participant records.</li>
    <li>Every sensitive action is recorded in the audit log without health values.</li>
    <li>This is a demo: please do not enter real health information.</li></ul></div></>;
