import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtDate, qs } from "./api";
import { Icon, pick, useLang } from "./icons";
import { Confirm, Empty, ErrorBox, Skeleton, useApi, useToast } from "./ui2";
import { ThemePicker } from "./theme";
import { KINDS } from "./health";

/* ================= Symptom checker ================= */
const LEVEL_CLASS = ["", "lv1", "lv2", "lv3"];
function EmergencyAlert({ numbers, support, message, lang }: { numbers: any[]; support?: any[]; message: any; lang: "en" | "hi" }) {
  return <div className="emergency" role="alert"><div className="em-h"><Icon name="alert" size={26} /><b>{pick(lang, message)}</b></div>
    <ul className="plain nums">{numbers.map((n: any) => <li key={n.number}><a className="callbtn" href={`tel:${n.number}`}><Icon name="phone" size={16} /> Call {n.number}</a><span>{pick(lang, n.label)}{pick(lang, n.note) ? <span className="muted"> {pick(lang, n.note)}</span> : null}</span></li>)}</ul>
    {support?.length ? <div className="support"><b>{lang === "hi" ? "सहायता उपलब्ध है" : "Support is available"}</b>{support.map((n: any) => <p key={n.number}><a className="callbtn" href={`tel:${n.number}`}><Icon name="phone" size={16} /> {n.number}</a> {n.alt ? <span className="muted">or {n.alt}. </span> : null}{pick(lang, n.label)}</p>)}</div> : null}
    <p className="muted small">Numbers were checked against official sources on {numbers[0]?.verified_on}. If a number does not connect, try 112.</p></div>;
}

export function SymptomChecker() {
  const { lang } = useLang(); const toast = useToast();
  const cat = useApi<any>("/api/symptoms/catalog");
  const [step, setStep] = useState(0);
  const [sym, setSym] = useState<string[]>([]); const [text, setText] = useState(""); const [find, setFind] = useState("");
  const [duration, setDuration] = useState("1_3d"); const [severity, setSeverity] = useState("mild"); const [age, setAge] = useState("adult");
  const [conds, setConds] = useState<string[]>([]); const [flags, setFlags] = useState<string[]>([]);
  const [qs_, setQs] = useState<any[]>([]); const [ans, setAns] = useState<Record<string, string>>({});
  const [res, setRes] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const c = cat.data;
  const kwHit = useMemo(() => !!c && c.emergency_keywords.some((k: string) => text.toLowerCase().includes(k)), [c, text]);
  const instant = flags.length > 0 || kwHit;   // shown immediately, before and without any server or AI call
  const stepsLabel = ["Describe symptoms", "Follow-up questions", "Your assessment", "Next steps"];
  const toggle = (arr: string[], set: (a: string[]) => void, id: string) => set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);

  const body = () => ({ symptoms: sym, free_text: text, duration, severity, age_group: age, conditions: conds, red_flags: flags, answers: Object.fromEntries(Object.entries(ans).filter(([, v]) => v)), lang });
  const assess = async () => {
    setBusy(true); setErr("");
    try { const r = await api("/api/symptoms/assess", { method: "POST", body: JSON.stringify(body()) }); setRes(r.result); setStep(2); window.scrollTo({ top: 0 }); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const goNext = async () => {
    setErr("");
    if (!sym.length && !text.trim() && !flags.length) { setErr("Choose at least one symptom, or describe how you feel."); return; }
    if (flags.length) { await assess(); return; }       // a warning sign was ticked: go straight to guidance
    setBusy(true);
    try { const r = await api("/api/symptoms/questions", { method: "POST", body: JSON.stringify({ symptoms: sym, age_group: age, conditions: conds }) }); setQs(r.questions); setStep(1); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const reset = () => { setStep(0); setSym([]); setText(""); setFind(""); setConds([]); setFlags([]); setAns({}); setRes(null); setQs([]); setErr(""); setDuration("1_3d"); setSeverity("mild"); setAge("adult"); };

  if (cat.loading) return <><h1>Symptom Checker</h1><Skeleton h={120} n={3} /></>;
  if (cat.error || !c) return <><h1>Symptom Checker</h1><ErrorBox error={cat.error || "Could not load"} retry={cat.reload} /><div className="note alert">In an emergency call <a href="tel:112">112</a>.</div></>;
  const filtered = c.symptoms.filter((s: any) => !find.trim() || pick(lang, s).toLowerCase().includes(find.trim().toLowerCase()) || s.en.toLowerCase().includes(find.trim().toLowerCase()));
  const L = (en: string, hi: string) => (lang === "hi" ? hi : en);

  return <>
    <h1>{L("Symptom Checker", "लक्षण जांच")}</h1>
    <p className="sub">{L("Understand possible next steps for how you feel. This is information, not a diagnosis.", "आप जैसा महसूस कर रहे हैं, उसके लिए संभावित अगले कदम समझें। यह जानकारी है, निदान नहीं।")}</p>
    {!c.checker_enabled && <div className="note alert" role="alert"><b>The symptom checker is paused.</b> If you feel very unwell, see a health professional. In an emergency call 112.</div>}
    <ol className="stepper" aria-label="Progress">{stepsLabel.map((s, i) => <li key={s} aria-current={i === step ? "step" : undefined} className={i === step ? "on" : i < step ? "done" : ""}><span>{i < step ? "✓" : i + 1}</span>{s}</li>)}</ol>
    {instant && step < 2 && <EmergencyAlert numbers={c.emergency_numbers} message={c.emergency_message} lang={lang} />}

    {step === 0 && <>
      <fieldset className="card flagbox"><legend><b>{L("First, is any of this happening right now?", "पहले बताएं: क्या अभी इनमें से कुछ हो रहा है?")}</b></legend>
        <p className="muted">{L("Tick anything that applies. If so, we will show emergency guidance straight away.", "जो लागू हो उस पर निशान लगाएं। ऐसा होने पर हम तुरंत आपातकालीन मार्गदर्शन दिखाएंगे।")}</p>
        {c.red_flags.map((f: any) => <label key={f.id} className="chk"><input type="checkbox" checked={flags.includes(f.id)} onChange={() => toggle(flags, setFlags, f.id)} />{pick(lang, f)}</label>)}</fieldset>
      <div className="card"><h2>{L("What symptoms do you have?", "आपको कौन से लक्षण हैं?")}</h2>
        <label htmlFor="sf">{L("Search symptoms", "लक्षण खोजें")}</label><input id="sf" type="search" value={find} onChange={e => setFind(e.target.value)} placeholder={L("For example: fever, cough, stomach", "जैसे: बुखार, खांसी, पेट")} />
        {sym.length > 0 && <div className="chips sel" aria-label="Selected symptoms">{sym.map(id => { const s = c.symptoms.find((x: any) => x.id === id); return <button key={id} className="chip on" onClick={() => toggle(sym, setSym, id)} aria-label={`Remove ${s.en}`}>{pick(lang, s)} <Icon name="close" size={12} /></button>; })}</div>}
        <div className="symlist" role="group" aria-label="Symptoms">{filtered.length ? filtered.map((s: any) => <button key={s.id} type="button" className={"chip" + (sym.includes(s.id) ? " on" : "")} aria-pressed={sym.includes(s.id)} onClick={() => toggle(sym, setSym, s.id)} disabled={!sym.includes(s.id) && sym.length >= 12}>{pick(lang, s)}</button>) : <p className="muted">{L("No match. Describe it in your own words below.", "कोई मेल नहीं। नीचे अपने शब्दों में लिखें।")}</p>}</div>
        <label htmlFor="st">{L("Anything else? Describe in your own words (optional)", "कुछ और? अपने शब्दों में बताएं (वैकल्पिक)")}</label><textarea id="st" rows={3} maxLength={1000} value={text} onChange={e => setText(e.target.value)} />
        <p className="muted small">{L("Please do not type your name, phone number or address here.", "कृपया यहां अपना नाम, फोन नंबर या पता न लिखें।")}</p></div>
      <div className="card"><div className="row">
        <div><label htmlFor="du">{L("How long has it lasted?", "यह कब से है?")}</label><select id="du" value={duration} onChange={e => setDuration(e.target.value)}>{c.durations.map((d: any) => <option key={d.id} value={d.id}>{pick(lang, d)}</option>)}</select></div>
        <div><label htmlFor="ag">{L("Who is this for?", "यह किसके लिए है?")}</label><select id="ag" value={age} onChange={e => setAge(e.target.value)}>{c.age_groups.map((d: any) => <option key={d.id} value={d.id}>{pick(lang, d)}</option>)}</select></div></div>
        <fieldset className="plainfs"><legend>{L("How bad is it?", "यह कितना गंभीर है?")}</legend>{c.severities.map((s: any) => <label key={s.id} className="chk"><input type="radio" name="sev" checked={severity === s.id} onChange={() => setSeverity(s.id)} />{pick(lang, s)}</label>)}</fieldset>
        <fieldset className="plainfs"><legend>{L("Any of these health conditions? (optional, only if you want to say)", "इनमें से कोई स्वास्थ्य स्थिति? (वैकल्पिक, केवल यदि आप बताना चाहें)")}</legend>{c.conditions.map((s: any) => <label key={s.id} className="chk"><input type="checkbox" checked={conds.includes(s.id)} onChange={() => toggle(conds, setConds, s.id)} />{pick(lang, s)}</label>)}</fieldset></div>
      <p className="err" role="alert">{err}</p>
      <div className="actions left"><button className="btn" onClick={goNext} disabled={busy || !c.checker_enabled}>{busy ? "Please wait…" : flags.length ? L("Show me guidance now", "अभी मार्गदर्शन दिखाएं") : L("Next: a few questions", "आगे: कुछ प्रश्न")}</button></div></>}

    {step === 1 && <div className="card"><h2>{L("A few more questions", "कुछ और प्रश्न")}</h2>
      {qs_.length ? qs_.map(q => <fieldset key={q.id} className="plainfs q"><legend>{pick(lang, q)}</legend>{[["yes", L("Yes", "हां")], ["no", L("No", "नहीं")], ["unsure", L("Not sure", "पता नहीं")]].map(([v, l]) => <label key={v} className="chk inline"><input type="radio" name={q.id} checked={ans[q.id] === v} onChange={() => setAns({ ...ans, [q.id]: v })} />{l}</label>)}</fieldset>) : <p className="muted">{L("No extra questions for these symptoms.", "इन लक्षणों के लिए कोई अतिरिक्त प्रश्न नहीं।")}</p>}
      <p className="err" role="alert">{err}</p>
      <div className="actions left"><button className="btn sec" onClick={() => setStep(0)}>{L("Back", "पीछे")}</button><button className="btn" onClick={assess} disabled={busy}>{busy ? L("Checking…", "जांच हो रही है…") : L("See my assessment", "मेरा आकलन देखें")}</button></div></div>}

    {step >= 2 && res && <>
      {res.emergency?.show && <EmergencyAlert numbers={res.emergency.numbers} support={res.emergency.support_numbers} message={res.emergency.message} lang={lang} />}
      {!res.emergency?.show && res.emergency?.support_numbers?.length ? <EmergencyAlert numbers={c.emergency_numbers} support={res.emergency.support_numbers} message={{ en: "Support is available if you are struggling.", hi: "यदि आप कठिन समय से गुज़र रहे हैं तो सहायता उपलब्ध है।" }} lang={lang} /> : null}
      <div className={"level " + LEVEL_CLASS[res.level]}><span className="lvl">{L("Level", "स्तर")} {res.level} of 3</span><b>{pick(lang, res.urgency_label)}</b></div>
      {step === 2 && <><div className="card"><h2>{L("What you told us", "आपने क्या बताया")}</h2><p>{res.summary}</p>
        <h2>{L("Possible explanations", "संभावित कारण")}</h2><p className="muted">{L("These are possibilities only, not a diagnosis. Many things can cause the same symptoms.", "ये केवल संभावनाएं हैं, निदान नहीं। एक ही लक्षण के कई कारण हो सकते हैं।")}</p><ul>{res.possible_explanations.map((e: string) => <li key={e}>{e}</li>)}</ul>
        <h2>{L("Why this advice", "यह सलाह क्यों")}</h2><p>{res.reason}</p>
        <p className="muted small">{res.ai?.used ? "An AI assistant helped with the wording. It can only make the advice more cautious, never less, and urgent warnings always come from fixed safety rules." : "This result comes from fixed safety rules. No AI assistant was used for this result."}</p></div>
        <div className="actions left"><button className="btn sec" onClick={reset}>{L("Start again", "फिर से शुरू करें")}</button><button className="btn" onClick={() => setStep(3)}>{L("See next steps", "अगले कदम देखें")}</button></div></>}
      {step === 3 && <><div className="card"><h2>{L("Recommended next step", "सुझाया गया अगला कदम")}</h2><p className="big">{pick(lang, res.recommended_next_step)}</p>
        {res.timeframe && <p><b>{L("When", "कब")}:</b> {pick(lang, res.timeframe)}</p>}
        <h2>{L("Suggested type of doctor", "सुझाए गए डॉक्टर का प्रकार")}</h2><p><span className="tag big">{res.specialty.name}</span>{res.specialty.also_consider ? <> <span className="muted">also: {res.specialty.also_consider}</span></> : null}</p>
        <p className="muted">{pick(lang, res.specialty.note)} {pick(lang, res.specialty.validation_note)}</p>
        <p><Link to="/doctors">{L("Find care and contacts", "देखभाल और संपर्क खोजें")}</Link></p></div>
        {res.self_care?.length ? <div className="card"><h2>{L("General self-care", "सामान्य स्व-देखभाल")}</h2><ul>{res.self_care.map((s: string) => <li key={s}>{s}</li>)}</ul>
          {res.diet_link && <p><Link to="/wellness">{L("Open general diet and wellness guidance", "सामान्य आहार और स्वास्थ्य मार्गदर्शन खोलें")}</Link></p>}</div> : null}
        {res.warning_signs?.length ? <div className="card"><h2>{L("Get urgent medical help if", "तुरंत चिकित्सा सहायता लें यदि")}</h2><ul>{res.warning_signs.map((w: any, i: number) => <li key={i}>{pick(lang, w)}</li>)}</ul></div> : null}
        <div className="note small" role="note">{pick(lang, res.not_a_diagnosis)} {L("This result was saved to your history, which only you can see.", "यह परिणाम आपके इतिहास में सहेजा गया है, जिसे केवल आप देख सकते हैं।")} <Link to="/history">{L("Open history", "इतिहास खोलें")}</Link></div>
        <div className="actions left"><button className="btn sec" onClick={() => setStep(2)}>{L("Back", "पीछे")}</button><button className="btn" onClick={reset}>{L("Check another symptom", "दूसरा लक्षण जांचें")}</button></div></>}
    </>}
    {step < 2 && <p className="muted small">{pick(lang, c.not_a_diagnosis)}</p>}
  </>;
}

/* ================= Diet and wellness ================= */
const COST = ["", "Low cost", "Medium cost", "Higher cost"];
const DIETCOND = [["diabetes", "Diabetes"], ["hypertension", "High blood pressure"], ["heart_disease", "Heart disease"], ["kidney_disease", "Kidney disease"], ["pregnancy", "Pregnancy"], ["other", "Another condition"]];
export function DietWellness() {
  const { lang } = useLang(); const toast = useToast();
  const w = useApi<any>("/api/wellness"); const hist = useApi<any>("/api/wellness/history?limit=10"); const info = useApi<any>("/api/content");
  const [f, setF] = useState<any>({ diet: "veg", allergies: [] as string[], avoid: [] as string[], budget_tier: 2, goal: "balanced", conditions: [] as string[], day: 0 });
  const [plan, setPlan] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [saved, setSaved] = useState(false); const [del, setDel] = useState<any>(null);
  useEffect(() => { if (w.data) { setF((x: any) => ({ ...x, diet: w.data.profile.diet })); if (w.data.latest && !plan) { setPlan(w.data.latest.plan); setSaved(true); } } }, [w.data]); // eslint-disable-line
  const arr = (k: string, v: string) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x: string) => x !== v) : [...f[k], v] });
  const run = async (save: boolean) => {
    setBusy(true); setErr("");
    try { const r = await api("/api/wellness/generate", { method: "POST", body: JSON.stringify({ ...f, save }) }); setPlan(r.plan); setSaved(save); if (save) { toast("Plan saved to your history"); hist.reload(); } }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); run(false); };
  const L = (en: string, hi: string) => (lang === "hi" ? hi : en);
  if (w.loading && !w.data) return <><h1>Diet and Wellness</h1><Skeleton h={120} n={2} /></>;
  const o = w.data?.options;
  return <>
    <h1>{L("Diet and Wellness", "आहार और स्वास्थ्य")}</h1><p className="sub">{L("General food ideas that fit your preferences, budget and what is available near you.", "आपकी पसंद, बजट और आस-पास उपलब्ध चीज़ों के अनुसार सामान्य भोजन सुझाव।")}</p>
    <div className="note" role="note">{w.data?.disclaimer} <b>If you feel unwell, use the <Link to="/symptoms">Symptom Checker</Link> first. Food changes are not a treatment, and must never delay medical care.</b></div>
    <ErrorBox error={w.error} retry={w.reload} />
    {o && <form className="card" onSubmit={submit}><h2>{L("Your preferences", "आपकी पसंद")}</h2>
      <div className="row"><div><label htmlFor="wd">{L("Dietary preference", "आहार वरीयता")}</label><select id="wd" value={f.diet} onChange={e => setF({ ...f, diet: e.target.value })}><option value="veg">Vegetarian</option><option value="egg">Egg-inclusive vegetarian</option><option value="non">Non-vegetarian</option></select></div>
        <div><label htmlFor="wb">{L("Approximate budget", "अनुमानित बजट")}</label><select id="wb" value={f.budget_tier} onChange={e => setF({ ...f, budget_tier: +e.target.value })}><option value={1}>Low</option><option value={2}>Medium</option><option value={3}>Higher</option></select></div>
        <div><label htmlFor="wg">{L("What would you like?", "आप क्या चाहते हैं?")}</label><select id="wg" value={f.goal} onChange={e => setF({ ...f, goal: e.target.value })}>{o.goals.map((g: any) => <option key={g.id} value={g.id}>{pick(lang, g)}</option>)}</select></div>
        <div><label htmlFor="wy">{L("Day of the week", "सप्ताह का दिन")}</label><select id="wy" value={f.day} onChange={e => setF({ ...f, day: +e.target.value })}>{[1, 2, 3, 4, 5, 6, 7].map((d, i) => <option key={d} value={i}>Day {d}</option>)}</select></div></div>
      <fieldset className="plainfs"><legend>{L("Food allergies", "खाद्य एलर्जी")}</legend>{o.allergens.map((a: string) => <label key={a} className="chk inline"><input type="checkbox" checked={f.allergies.includes(a)} onChange={() => arr("allergies", a)} />{a}</label>)}</fieldset>
      <fieldset className="plainfs"><legend>{L("Foods you avoid", "जिन चीज़ों से आप परहेज़ करते हैं")}</legend>{o.foods.map((a: string) => <label key={a} className="chk inline"><input type="checkbox" checked={f.avoid.includes(a)} onChange={() => arr("avoid", a)} />{a}</label>)}</fieldset>
      <fieldset className="plainfs"><legend>{L("Health conditions you want us to know about (optional)", "स्वास्थ्य स्थितियां जो आप बताना चाहें (वैकल्पिक)")}</legend>{DIETCOND.map(([id, l]) => <label key={id} className="chk inline"><input type="checkbox" checked={f.conditions.includes(id)} onChange={() => arr("conditions", id)} />{l}</label>)}</fieldset>
      <p className="err" role="alert">{err}</p><div className="actions left"><button className="btn" disabled={busy}>{busy ? "Preparing…" : L("Show a meal outline", "भोजन रूपरेखा दिखाएं")}</button></div></form>}
    {plan && <div id="plan"><div className="sec-h"><h2>{plan.goal_label} · Day {plan.day + 1}</h2><span className="noprint"><button className="btn sec sm" onClick={() => window.print()}>Print</button> <button className="btn sm" disabled={saved || busy} onClick={() => run(true)}>{saved ? "✓ Saved" : "Save this plan"}</button></span></div>
      {plan.professional_note && <div className="note alert" role="alert">{plan.professional_note}</div>}
      <div className="meals">{plan.meals.map((m: any) => <div className="card meal" key={m.meal}><h3>{m.meal}</h3><ul>{m.items.map((i: any, k: number) => <li key={k}>{i.food ? <><b>{i.food}</b> <span className="tag">{i.group}</span> <span className="tag">{COST[i.cost_tier]}</span>{i.alternatives.length ? <div className="muted small">Or: {i.alternatives.join(", ")}</div> : null}</> : <span className="muted">{i.note}</span>}</li>)}</ul></div>)}
        <div className="card meal"><h3>Water and hydration</h3><p>{plan.hydration}</p></div></div>
      <div className="card"><h2>Tips</h2><ul>{plan.tips.map((t: string) => <li key={t}>{t}</li>)}</ul><p className="muted small">{plan.nutrient_note}</p></div>
      <p className="muted small">{plan.disclaimer}</p></div>}
    {info.data?.items?.length ? <div className="card"><h2>Wellness information</h2>{info.data.items.map((i: any) => <div key={i.id}><b>{i.title}</b><p>{i.body}</p></div>)}</div> : null}
    <div className="card noprint"><h2>Saved plans</h2>{hist.data?.items?.length ? <ul className="plain">{hist.data.items.map((p: any) => <li key={p.id}><span><b>{p.title}</b> <span className="muted">{fmtDate(p.created_at)}</span></span><span><button className="btn sec sm" onClick={() => { setPlan(p.plan); setSaved(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>View</button> <button className="btn sec sm" aria-label="Delete plan" onClick={() => setDel(p)}><Icon name="trash" size={14} /></button></span></li>)}</ul> : <p className="muted">No saved plans yet.</p>}</div>
    {del && <Confirm title="Delete this saved plan?" body={<p>{del.title}</p>} label="Delete" danger onNo={() => setDel(null)} onYes={async () => { try { await api(`/api/wellness/history/${del.id}`, { method: "DELETE" }); toast("Plan deleted"); setDel(null); hist.reload(); } catch (x: any) { toast(x.message, "err"); } }} />}
  </>;
}

/* ================= Find a doctor ================= */
const SPEC: [string, string][] = [
  ["General Physician", "The usual first contact for fever, cough, tiredness, stomach upset, and blood pressure or sugar checks. Can refer you to a specialist."],
  ["Pediatrician", "Babies and children."], ["Gynecologist", "Women's health, periods and pregnancy care."],
  ["Cardiologist", "Heart and blood vessels, for example chest pain or a racing heartbeat that a doctor has asked you to get checked."],
  ["Pulmonologist", "Lungs and breathing: a long-lasting cough, wheezing or breathlessness."], ["Gastroenterologist", "Digestion: stomach pain, acidity, loose motions or constipation that do not settle."],
  ["Endocrinologist", "Hormones, diabetes and thyroid problems."], ["Neurologist", "Brain and nerves: repeated or severe headaches, numbness, fits."],
  ["Orthopedic Specialist", "Bones, joints and muscles: joint or back pain, injuries."], ["Dermatologist", "Skin, hair and nails: rashes, itching, fungal infections."],
  ["ENT Specialist", "Ear, nose and throat."], ["Eye Specialist (Ophthalmologist)", "Eyes and vision."], ["Mental Health Professional", "Stress, anxiety, low mood and sleep problems."],
];
export function FindDoctor() {
  const toast = useToast(); const cat = useApi<any>("/api/symptoms/catalog");
  const [q, setQ] = useState(""); const [type, setType] = useState(""); const [district, setDistrict] = useState("");
  const fac = useApi<any>(`/api/facilities${qs({ q, type, district, limit: 20 })}`);
  const mine = useApi<any>("/api/care-contacts");
  const [c, setC] = useState({ name: "", kind: "doctor", phone: "", note: "" }); const [err, setErr] = useState("");
  const add = async (e: FormEvent) => { e.preventDefault(); setErr(""); try { await api("/api/care-contacts", { method: "POST", body: JSON.stringify(c) }); setC({ name: "", kind: "doctor", phone: "", note: "" }); toast("Contact saved"); mine.reload(); } catch (x: any) { setErr(x.message); } };
  const E = cat.data;
  return <>
    <h1>Find a Doctor</h1><p className="sub">Which kind of doctor to see, and where to turn for help.</p>
    {E && <div className="card flagbox"><h2><Icon name="alert" size={20} /> In an emergency</h2><ul className="plain nums">{E.emergency_numbers.map((n: any) => <li key={n.number}><a className="callbtn" href={`tel:${n.number}`}><Icon name="phone" size={16} /> {n.number}</a><span>{n.label.en} {n.note.en ? <span className="muted">{n.note.en}</span> : null}<br /><a className="small" href={n.source_url} target="_blank" rel="noreferrer">Source: {n.source}</a> <span className="muted small">(checked {n.verified_on})</span></span></li>)}
      {E.support_numbers.map((n: any) => <li key={n.number}><a className="callbtn" href={`tel:${n.number}`}><Icon name="phone" size={16} /> {n.number}</a><span>{n.label.en} <span className="muted">Also {n.alt}.</span><br /><a className="small" href={n.source_url} target="_blank" rel="noreferrer">Source: {n.source}</a> <span className="muted small">(checked {n.verified_on})</span></span></li>)}</ul></div>}
    <div className="card"><h2>Which doctor should I see?</h2><p className="muted">For most problems a general physician is the right first contact. They will refer you if you need a specialist. Use the <Link to="/symptoms">Symptom Checker</Link> for a suggestion based on how you feel.</p>
      <div className="specs">{SPEC.map(([n, d]) => <div key={n} className="spec"><b>{n}</b><span className="muted">{d}</span></div>)}</div></div>
    <div className="card"><h2>Health facilities</h2><p className="muted small">{fac.data?.note}</p>
      <div className="row3"><div><label htmlFor="fq">Search by name or address</label><input id="fq" type="search" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div><label htmlFor="ft2">Type</label><select id="ft2" value={type} onChange={e => setType(e.target.value)}><option value="">All</option>{(fac.data?.types || []).map((t: string) => <option key={t} value={t}>{t.toUpperCase()}</option>)}</select></div>
        <div><label htmlFor="fd2">District</label><select id="fd2" value={district} onChange={e => setDistrict(e.target.value)}><option value="">All</option>{(fac.data?.districts || []).map((d: string) => <option key={d}>{d}</option>)}</select></div></div>
      <ErrorBox error={fac.error} retry={fac.reload} />
      {fac.data && (fac.data.items.length ? <ul className="plain fac">{fac.data.items.map((x: any) => <li key={x.id}><div><b>{x.name}</b> <span className="tag">{x.type.toUpperCase()}</span><div className="muted">{x.address}{x.address && x.district ? ", " : ""}{x.district}{x.hours ? ` · ${x.hours}` : ""}</div><div className="muted small">Source: {x.source} (checked {x.verified_on})</div></div>{x.phone && <a className="callbtn" href={`tel:${x.phone.replace(/[^0-9+]/g, "")}`}><Icon name="phone" size={16} /> {x.phone}</a>}</li>)}</ul>
        : <Empty title="No facilities have been added yet" text="We only list a clinic or health centre after an administrator has checked its details against a source. Until then, ask at your nearest primary health centre, or save your own contacts below." />)}</div>
    <div className="card"><h2>My care contacts</h2><p className="muted">Your own list of doctors, clinics or family contacts. Only you can see it.</p>
      {mine.data?.items?.length ? <ul className="plain">{mine.data.items.map((i: any) => <li key={i.id}><span><b>{i.name}</b> <span className="tag">{i.kind}</span> {i.phone && <a href={`tel:${i.phone.replace(/[^0-9+]/g, "")}`}>{i.phone}</a>}<div className="muted small">{i.note}</div></span><button className="btn sec sm" aria-label={`Delete ${i.name}`} onClick={async () => { try { await api(`/api/care-contacts/${i.id}`, { method: "DELETE" }); mine.reload(); } catch (x: any) { toast(x.message, "err"); } }}><Icon name="trash" size={14} /></button></li>)}</ul> : <p className="muted">No contacts saved yet.</p>}
      <form onSubmit={add}><div className="row3"><div><label htmlFor="cn">Name</label><input id="cn" value={c.name} onChange={e => setC({ ...c, name: e.target.value })} required maxLength={80} /></div>
        <div><label htmlFor="ck">Type</label><select id="ck" value={c.kind} onChange={e => setC({ ...c, kind: e.target.value })}>{["doctor", "clinic", "hospital", "pharmacy", "family", "other"].map(k => <option key={k}>{k}</option>)}</select></div>
        <div><label htmlFor="cp">Phone</label><input id="cp" inputMode="tel" value={c.phone} onChange={e => setC({ ...c, phone: e.target.value })} maxLength={20} /></div></div>
        <label htmlFor="cno">Note</label><input id="cno" value={c.note} onChange={e => setC({ ...c, note: e.target.value })} maxLength={200} /><p className="err" role="alert">{err}</p><button className="btn">Save contact</button></form></div>
  </>;
}

/* ================= Profile and settings ================= */
export function ProfilePage({ role, onSignOut, setLang }: { role: string; onSignOut: () => void; setLang: (l: "en" | "hi") => void }) {
  const toast = useToast(); const p = useApi<any>("/api/profile"); const [f, setF] = useState<any>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (p.data) setF({ name: p.data.name, birth_year: p.data.birth_year ?? "", language: p.data.language, units: p.data.units, diet_pref: p.data.diet_pref, tracked: p.data.tracked, step_goal: p.data.step_goal, water_goal_ml: p.data.water_goal_ml, reminders: p.data.notifications.reminders, announcements: p.data.notifications.announcements }); }, [p.data]);
  const save = async (e: FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const by = f.birth_year === "" ? null : Number(f.birth_year);
      const r = await api("/api/profile", { method: "PATCH", body: JSON.stringify({ name: f.name, birth_year: by ?? undefined, clear_birth_year: by === null, language: f.language, units: f.units, diet_pref: f.diet_pref, tracked: f.tracked, step_goal: Number(f.step_goal), water_goal_ml: Number(f.water_goal_ml), notify_reminders: f.reminders, notify_announcements: f.announcements }) });
      setLang(r.language); toast("Profile saved"); p.reload();
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  if (p.loading && !f) return <><h1>Profile and Settings</h1><Skeleton h={120} n={2} /></>;
  if (!f) return <><h1>Profile and Settings</h1><ErrorBox error={p.error} retry={p.reload} /></>;
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return <>
    <h1>Profile and Settings</h1><p className="sub">Manage your details, preferences and appearance.</p>
    <form className="card" onSubmit={save}><div className="prof-h"><span className="avatar" aria-hidden>{(f.name || p.data.email).charAt(0).toUpperCase()}</span><div><b>{p.data.email}</b><div><span className="badge">{role}</span></div></div></div>
      <div className="row"><div><label htmlFor="pn">Name</label><input id="pn" maxLength={60} value={f.name} onChange={set("name")} /></div>
        <div><label htmlFor="pb">Birth year (optional)</label><input id="pb" inputMode="numeric" value={f.birth_year} onChange={set("birth_year")} placeholder="For example 1990" /></div>
        <div><label htmlFor="pl">Preferred language</label><select id="pl" value={f.language} onChange={set("language")}><option value="en">English</option><option value="hi">हिन्दी (Hindi)</option></select></div>
        <div><label htmlFor="pu">Units</label><select id="pu" value={f.units} onChange={set("units")}><option value="metric">Metric (kg, cm)</option><option value="imperial">Imperial (lb, in)</option></select></div>
        <div><label htmlFor="pd">Dietary preference</label><select id="pd" value={f.diet_pref} onChange={set("diet_pref")}><option value="veg">Vegetarian</option><option value="egg">Egg-inclusive vegetarian</option><option value="non">Non-vegetarian</option></select></div>
        <div><label htmlFor="ps">Daily step goal</label><input id="ps" inputMode="numeric" value={f.step_goal} onChange={set("step_goal")} /></div>
        <div><label htmlFor="pw">Daily water goal (ml)</label><input id="pw" inputMode="numeric" value={f.water_goal_ml} onChange={set("water_goal_ml")} /></div></div>
      <fieldset className="plainfs"><legend>Health measures I want to track</legend>{KINDS.map(k => <label key={k.id} className="chk inline"><input type="checkbox" checked={f.tracked.includes(k.id)} onChange={e => setF({ ...f, tracked: e.target.checked ? [...f.tracked, k.id] : f.tracked.filter((x: string) => x !== k.id) })} />{k.label}</label>)}</fieldset>
      <fieldset className="plainfs"><legend>Notification preferences</legend><label className="chk"><input type="checkbox" checked={f.reminders} onChange={e => setF({ ...f, reminders: e.target.checked })} />Reminders to record my health measures</label>
        <label className="chk"><input type="checkbox" checked={f.announcements} onChange={e => setF({ ...f, announcements: e.target.checked })} />Announcements from the RuralCare AI team</label>
        <p className="muted small">Reminders are not being sent yet. Your choice is saved for when they are. Announcements appear on your dashboard.</p></fieldset>
      <p className="err" role="alert">{err}</p><button className="btn" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></form>
    <ThemePicker />
    <div className="card"><h2>Privacy and safety</h2><ul className="checks"><li>Only you can see your health records, symptom assessments and wellness plans. Administrators see counts, never your entries.</li><li>Sessions end after about an hour, and sign-in is kept in memory only.</li><li>You can delete your health records and symptom history from <Link to="/history">Health History</Link>.</li></ul>
      <p><Link to="/privacy">Privacy notice</Link> · <Link to="/disclaimer">Medical disclaimer</Link></p><button className="btn sec" onClick={onSignOut}><Icon name="logout" size={16} /> Sign out</button></div>
  </>;
}

/* ================= Legal pages ================= */
export const Privacy = () => <article className="legal"><h1>Privacy notice</h1><p className="muted">RuralCare AI is a student project. This notice describes what the project actually does today.</p>
  <h2>What we store</h2><ul><li>Your email address and a password hash. The password itself is never stored.</li><li>Your profile choices: name, optional birth year, language, units, diet preference, goals and tracking choices.</li><li>The health records you type in, the symptom assessments you run (including the symptoms and any text you describe), and the wellness plans you save.</li><li>Sign-in times, used to end sessions and to count activity. These counts are anonymous in the administrator view.</li></ul>
  <h2>Who can see it</h2><ul><li>Your health records, symptom assessments and wellness plans are visible only to your account. The application checks ownership on every request.</li><li>Administrators see totals, anonymous activity labels, account status and audit entries. The administrator screens do not show your entries.</li><li>Whoever runs the server and database could technically read stored data. This is a student project with a single maintainer. Please keep that in mind before entering anything you consider very sensitive.</li></ul>
  <h2>Security, honestly</h2><ul><li>Connections use HTTPS on the hosting services. Passwords are hashed. Sessions expire, and administrator sessions are shorter.</li><li>We have not added extra encryption of health entries inside the database, and the project has not had an independent security audit.</li><li>We do not claim compliance with any law or standard. Before real-world use, the handling of health data must be reviewed against the Digital Personal Data Protection Act, 2023 and any institutional rules.</li></ul>
  <h2>Your control</h2><ul><li>You can edit or delete any record, delete your whole symptom history, and delete your health records from <Link to="/history">Health History</Link>.</li><li>Symptom text is not written to server logs.</li></ul>
  <h2>AI</h2><p>If an AI service (Google Gemini) has been configured on the server, text you type into the Guide assistant, or a symptom description, may be sent to Google to help write an answer. Emergency and medicine questions are answered by fixed rules and are not sent. Emails and phone numbers are removed first, and your name, email and health records are never included. Do not type personal details. On Google's free tier, content may be used to improve Google products, so treat it as not private. If no AI service is configured or the administrator turns it off, nothing is sent anywhere.</p></article>;
export const Disclaimer = () => <article className="legal"><h1>Medical disclaimer</h1>
  <p><b>RuralCare AI does not provide medical advice, diagnosis or treatment.</b> It gives general information to help you think about next steps.</p>
  <ul><li>The symptom checker uses fixed safety rules and has <b>not</b> been clinically validated. Its suggestions of a type of doctor are unvalidated.</li><li>Possible explanations are possibilities, not diagnoses. A serious condition can look mild, so this site cannot rule one out.</li><li>If you may be having an emergency, call <a href="tel:112">112</a> or go to the nearest hospital now. Do not use this website first.</li><li>Diet and wellness guidance is general education. It is not a substitute for a dietitian or doctor and must not replace prescribed treatment or medicine.</li><li>Health measures are numbers you typed. The site does not measure anything and does not connect to any device.</li></ul>
  <p>Always ask a qualified health professional about your own situation.</p></article>;

/* ================= Home ================= */
export function UserHome({ name }: { name: string }) {
  const ann = useApi<any>("/api/announcements");
  const card = (to: string, icon: string, t: string, d: string, cls = "") => <Link to={to} className={"hcard " + cls}><span className="ico"><Icon name={icon} size={22} /></span><b>{t}</b><span className="muted">{d}</span></Link>;
  return <><h1>Hello, {name || "there"}</h1><p className="sub">Welcome to RuralCare AI. Track your health, understand symptoms and find simple wellness guidance.</p>
    {ann.data?.items?.map((a: any) => <div key={a.id} className={"note" + (a.level === "important" ? " alert" : "")} role="note"><b>{a.title}</b> {a.body}</div>)}
    <Link to="/symptoms" className="hero-card"><span className="ico"><Icon name="search" size={28} /></span><div><b>Not feeling well?</b><span>Check your symptoms and learn what to do next.</span></div><span className="btn">Start symptom check</span></Link>
    <div className="hgrid">{card("/health", "pulse", "Health Dashboard", "Your measures and trends.")}{card("/records", "records", "Health Records", "Add, edit and filter records.")}{card("/wellness", "leaf", "Diet and Wellness", "General food ideas for you.")}{card("/doctors", "pin", "Find a Doctor", "Which doctor, and emergency numbers.")}{card("/history", "clock", "Health History", "Everything in one place.")}{card("/guide", "chat", "Guide", "Plain-language answers.")}</div>
    <p className="muted small" style={{ marginTop: 14 }}>This is an academic project and not a medical service. See the <Link to="/disclaimer">medical disclaimer</Link> and <Link to="/privacy">privacy notice</Link>.</p></>;
}
