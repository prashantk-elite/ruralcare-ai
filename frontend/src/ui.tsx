import { ReactNode, useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ThemeButton } from "./theme";
import { Icon } from "./icons";
export type Lang = "en" | "hi";
export type Item = [string, string, string]; // path, label, icon
export type Group = { title?: string; items: Item[] };
const HI: Record<string, string> = { Dashboard: "डैशबोर्ड", Home: "होम", Participants: "प्रतिभागी", Screening: "जांच", Nutrition: "पोषण", "Nutrition planner": "पोषण योजना", "Follow-ups": "फॉलो-अप", Guide: "गाइड", "Research Lab": "अनुसंधान", Help: "सहायता", Notifications: "सूचनाएं", Settings: "सेटिंग्स",
  "Health Dashboard": "स्वास्थ्य डैशबोर्ड", "Symptom Checker": "लक्षण जांच", "Health Records": "स्वास्थ्य रिकॉर्ड", "Diet and Wellness": "आहार और स्वास्थ्य", "Health History": "स्वास्थ्य इतिहास", "Find a Doctor": "डॉक्टर खोजें", "Profile and Settings": "प्रोफ़ाइल और सेटिंग्स", "Admin Portal": "एडमिन पोर्टल", "My health": "मेरा स्वास्थ्य", Work: "कार्य", "Community dashboard": "सामुदायिक डैशबोर्ड", "Nutrition insights": "पोषण अंतर्दृष्टि" };
export const tr = (l: Lang, s: string) => (l === "hi" ? HI[s] || s : s);
const T = {
  en: { eyebrow: "AI FOR COMMUNITY HEALTH", h: "Understand your health, one step at a time.", p: "Track your own health numbers, check symptoms to learn what to do next, and find simple food ideas that fit your budget. Built for people in rural and urban communities, in English and Hindi.", start: "Get started", how: "How it works", note: "Academic project. Not a medical service and not a diagnostic device." },
  hi: { eyebrow: "सामुदायिक स्वास्थ्य के लिए AI", h: "अपने स्वास्थ्य को समझें, एक कदम एक बार में।", p: "अपने स्वास्थ्य के आंकड़े दर्ज करें, लक्षण जांचकर जानें कि आगे क्या करें, और अपने बजट के अनुसार सरल भोजन सुझाव पाएं। अंग्रेज़ी और हिंदी में।", start: "शुरू करें", how: "यह कैसे काम करता है", note: "शैक्षणिक परियोजना। यह चिकित्सा सेवा या निदान उपकरण नहीं है।" },
};
const Foot = () => <footer className="f">Academic project. Not a medical service, not a diagnostic device and not a substitute for a qualified healthcare professional. In an emergency call <a href="tel:112">112</a>. <Link to="/privacy">Privacy</Link> · <Link to="/disclaimer">Medical disclaimer</Link></footer>;
export { Foot };

export function Landing({ lang, setLang, onStart }: { lang: Lang; setLang: (l: Lang) => void; onStart: () => void }) {
  const t = T[lang];
  const feats = [["Personal health dashboard", "Record blood pressure, heart rate, steps, sleep, water, weight, BMI and glucose, and see your own trends. Everything is typed in by you."], ["Symptom checker", "Describe how you feel and get clear next-step guidance. Emergency warning signs are always checked first by fixed safety rules."], ["Diet and wellness", "General, affordable meal ideas that respect your diet, allergies and budget. Not a substitute for a dietitian."], ["Privacy by design", "Your records are visible only to you. Administrators see totals, never your entries."]];
  return <>
    <div className="nav-l"><b>RuralCare AI</b><ThemeButton /><button className="btn sec sm" onClick={() => setLang(lang === "en" ? "hi" : "en")}>{lang === "en" ? "हिंदी" : "English"}</button><Link to="/admin/login" className="portal-link inline"><Icon name="shield" size={14} />Admin Portal</Link><button className="btn sm" onClick={onStart}>Sign in</button></div>
    <section className="hero"><div className="in"><div className="eyebrow">{t.eyebrow}</div><h1>{t.h}</h1><p>{t.p}</p>
      <div className="cta"><button className="btn" onClick={onStart}>{t.start}</button><a href="#how"><button className="btn sec">{t.how}</button></a></div><p className="muted" style={{ color: "#9FB0C3" }}>{t.note}</p></div></section>
    <section className="sec" id="how"><div className="in"><h2>How it works</h2><div className="g3">{[["STEP 01", "Record", "Add the health numbers you choose to track. You never have to track everything."], ["STEP 02", "Understand", "Check symptoms and see your trends, with clear limits and warnings."], ["STEP 03", "Act", "Follow simple next steps, see the right kind of doctor, and keep a private history."]].map(s => <div className="card" key={s[0]}><div className="step">{s[0]}</div><h2>{s[1]}</h2><p className="muted">{s[2]}</p></div>)}</div></div></section>
    <section className="sec"><div className="in"><h2>Platform features</h2><div className="g3">{feats.map(f => <div className="card" key={f[0]}><h2>{f[0]}</h2><p className="muted">{f[1]}</p></div>)}</div></div></section>
    <section className="sec alt"><div className="in"><h2>Responsible by design</h2><ul><li>Urgent warning signs are shown first, using fixed rules, never waiting on an AI.</li><li>No made-up percentages, no claimed diagnoses and no claim of clinical validation.</li><li>The site never reads a device. Every number is entered by you and labelled that way.</li><li>You can delete your health records and symptom history at any time.</li></ul>
      <p>This is a student project. It does not diagnose disease, advise on medicines or replace a health professional.</p><button className="btn" onClick={onStart}>Get started</button></div></section><Foot /></>;
}

export function Shell({ role, groups, lang, setLang, onOut, children }: { role: string; groups: Group[]; lang: Lang; setLang: (l: Lang) => void; onOut: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(false); const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return <div className="shell"><button className="menu-btn" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}><Icon name={open ? "close" : "menu"} /></button>
    <aside className={"side" + (open ? " open" : "")} aria-label="Main navigation"><div className="brand"><span className="logo" aria-hidden><Icon name="heart" size={18} /></span>RuralCare AI</div>
      <nav>{groups.map((g, i) => <div className="grp" key={i}>{g.title && <div className="grp-t">{tr(lang, g.title)}</div>}{g.items.map(([to, l, ic]) => <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => isActive ? "active" : ""}><Icon name={ic} size={18} />{tr(lang, l)}</NavLink>)}</div>)}</nav>
      <div className="side-foot"><NavLink to="/admin/login" className="portal-link"><Icon name="shield" size={16} />{tr(lang, "Admin Portal")}</NavLink><span className="who">Signed in as {role}</span></div></aside>
    {open && <div className="scrim" onClick={() => setOpen(false)} />}
    <div className="content"><div className="top"><span className="badge warn">ACADEMIC PROJECT</span><span style={{ flex: 1 }} /><ThemeButton />
      <button className="btn sec sm" onClick={() => setLang(lang === "en" ? "hi" : "en")}>{lang === "en" ? "हिंदी" : "English"}</button><button className="btn sec sm" onClick={onOut}>Sign out</button></div>
      <main>{children}</main><Foot /></div></div>;
}

export function BarChart({ title, rows }: { title: string; rows: { label: string; value: number | null }[] }) {
  const max = Math.max(...rows.map(r => r.value ?? 0), 1);
  const desc = rows.map(r => `${r.label}: ${r.value === null ? "hidden, small group" : r.value}`).join("; ");
  return <svg className="chart" role="img" aria-label={`${title}. ${desc}`} viewBox={`0 0 440 ${rows.length * 34 + 6}`} width="100%">{rows.map((r, i) => <g key={r.label}>
    <text x="0" y={i * 34 + 20} fill="currentColor">{r.label}</text>
    {r.value === null ? <text x="120" y={i * 34 + 20} fill="currentColor" opacity=".7">Hidden (small group)</text> : <><rect x="120" y={i * 34 + 6} width={Math.max(2, (r.value / max) * 260)} height="20" rx="5" fill="var(--pri)" /><text x={126 + (r.value / max) * 260} y={i * 34 + 21} fill="currentColor">{r.value}</text></>}</g>)}</svg>;
}
