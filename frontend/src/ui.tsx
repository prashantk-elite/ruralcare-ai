import { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { ThemeButton } from "./theme";
export type Lang = "en" | "hi";
const HI: Record<string, string> = { Dashboard: "डैशबोर्ड", Participants: "प्रतिभागी", Screening: "जांच", Nutrition: "पोषण", "Follow-ups": "फॉलो-अप", Guide: "गाइड", "Research Lab": "अनुसंधान", "Audit log": "ऑडिट लॉग", Admin: "प्रशासन", Help: "सहायता", Notifications: "सूचनाएं", Settings: "सेटिंग्स" };
export const tr = (l: Lang, s: string) => (l === "hi" ? HI[s] || s : s);
const T = {
  en: { eyebrow: "AI FOR COMMUNITY HEALTH", h: "Bringing Intelligent Health Insights Closer to Every Community.", p: "A screening and nutrition-support research platform that makes health information easier to understand and balanced food choices more practical for underserved communities.", demo: "Explore Demo", how: "How it works", note: "Academic research prototype. Not a diagnostic medical device." },
  hi: { eyebrow: "सामुदायिक स्वास्थ्य के लिए AI", h: "बुद्धिमान स्वास्थ्य जानकारी हर समुदाय के करीब।", p: "एक जांच और पोषण-सहायता अनुसंधान मंच, जो स्वास्थ्य जानकारी को समझना और संतुलित भोजन चुनना आसान बनाता है।", demo: "डेमो देखें", how: "यह कैसे काम करता है", note: "शैक्षणिक अनुसंधान प्रोटोटाइप। यह निदान उपकरण नहीं है।" },
};
const Foot = () => <footer className="f">Academic research prototype. Not a diagnostic medical device and not a substitute for a qualified healthcare professional. Demo data only.</footer>;

export function Landing({ lang, setLang, onStart }: { lang: Lang; setLang: (l: Lang) => void; onStart: () => void }) {
  const t = T[lang];
  const feats = [["AI-assisted screening", "Validated measurement entry, with missing values never treated as zero."], ["Nutrition planner", "Rule-based meal ideas that respect allergies, diet, availability and budget."], ["Explainable ML research", "Held-out metrics, limitations and feature reliance, shown honestly."], ["Community insights", "Aggregate counts only, with small groups hidden for privacy."]];
  return <>
    <div className="nav-l"><b>RuralCare AI</b><ThemeButton /><button className="btn sec sm" onClick={() => setLang(lang === "en" ? "hi" : "en")}>{lang === "en" ? "हिंदी" : "English"}</button><button className="btn sm" onClick={onStart}>Sign in</button></div>
    <section className="hero"><div className="in"><div className="eyebrow">{t.eyebrow}</div><h1>{t.h}</h1><p>{t.p}</p>
      <div className="cta"><button className="btn" onClick={onStart}>{t.demo}</button><a href="#how"><button className="btn sec">{t.how}</button></a></div><p className="muted" style={{ color: "#9FB0C3" }}>{t.note}</p></div></section>
    <section className="sec" id="how"><div className="in"><h2>How it works</h2><div className="g3">{[["STEP 01", "Screen", "Record measurements and lifestyle information with clear guidance."], ["STEP 02", "Understand", "Explore screening indicators and research-model output with its limits."], ["STEP 03", "Support", "Find food options that fit preferences, affordability and availability."]].map(s => <div className="card" key={s[0]}><div className="step">{s[0]}</div><h2>{s[1]}</h2><p className="muted">{s[2]}</p></div>)}</div></div></section>
    <section className="sec"><div className="in"><h2>Platform features</h2><div className="g3">{feats.map(f => <div className="card" key={f[0]}><h2>{f[0]}</h2><p className="muted">{f[1]}</p></div>)}</div></div></section>
    <section className="sec alt"><div className="in"><h2>Responsible AI</h2><ul><li>Unvalidated models are clearly labelled; no invented scores or accuracy.</li><li>Synthetic demo data is always marked DEMO DATA.</li><li>Role-based access enforced on the server; consent is required.</li><li>Urgent symptoms are shown above everything else.</li></ul>
      <p>This prototype does not diagnose disease, advise on medication, or claim clinical validation.</p><button className="btn" onClick={onStart}>Open the demo</button></div></section><Foot /></>;
}

export function Shell({ role, items, lang, setLang, onOut, children }: { role: string; items: [string, string][]; lang: Lang; setLang: (l: Lang) => void; onOut: () => void; children: ReactNode }) {
  return <div className="shell"><aside className="side" aria-label="Main navigation"><div className="brand"><span className="logo" aria-hidden>♥</span>RuralCare AI</div>
    <nav>{items.map(([to, l]) => <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => isActive ? "active" : ""}>{tr(lang, l)}</NavLink>)}</nav><div className="side-foot">Signed in as {role}</div></aside>
    <div className="content"><div className="top"><span className="badge warn">DEMO DATA</span><span style={{ flex: 1 }} /><ThemeButton />
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
