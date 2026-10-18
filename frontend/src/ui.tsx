import { ReactNode, useState, FormEvent } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { ThemeButton } from "./theme";
export type Lang = "en" | "hi";
const HI: Record<string, string> = { Dashboard: "डैशबोर्ड", Participants: "प्रतिभागी", Screening: "जांच", Nutrition: "पोषण", "Follow-ups": "फॉलो-अप", Guide: "गाइड", "Research Lab": "अनुसंधान", "Audit log": "ऑडिट लॉग", Admin: "प्रशासन", Help: "सहायता", Notifications: "सूचनाएं", Settings: "सेटिंग्स", Home: "होम", "Nutrition insights": "पोषण अंतर्दृष्टि" };
export const tr = (l: Lang, s: string) => (l === "hi" ? HI[s] || s : s);

/* One consistent line-icon family (Lucide-style paths) */
const P: Record<string, string> = {
  grid: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  pulse: "M3 12h4l3-8 4 16 3-8h4",
  leaf: "M4 21c0-9 5-15 16-16-1 11-7 16-16 16zM4 21c3-5 6-8 10-10",
  cal: "M3 5h18v16H3zM8 3v4M16 3v4M3 10h18",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21a2 2 0 0 0 4 0",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  flask: "M9 3h6M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3M7 15h10",
  clip: "M9 3h6v3H9zM9 4.5H6a1 1 0 0 0-1 1V21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5.500a1 1 0 0 0-1-1h-3M9 12h6M9 16h4",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.500-1 8-4 8-9V6z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.300-4.300",
  heart: "M12 21s-7-4.400-9-9.200C1.600 8 3.800 5 7 5c2 0 3.600 1.200 5 3 1.400-1.800 3-3 5-3 3.200 0 5.400 3 4 6.800C19 16.600 12 21 12 21z",
  collapse: "m11 17-5-5 5-5M18 17l-5-5 5-5",
  eye: "M2 12s3.500-7 10-7 10 7 10 7-3.500 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeoff: "M17.900 17.900A10 10 0 0 1 12 19C5.500 19 2 12 2 12a18 18 0 0 1 5.100-5.900M9.900 5.100A9 9 0 0 1 12 5c6.500 0 10 7 10 7a18 18 0 0 1-2.200 3.200M1 1l22 22",
  mail: "M3 5h18v14H3zM3 7l9 6 9-6",
  lock: "M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3",
  plus: "M12 5v14M5 12h14",
};
export const Icon = ({ n }: { n: string }) => <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d={P[n] || P.grid} /></svg>;
const ROUTE_ICON: Record<string, string> = { "/": "grid", "/participants": "users", "/screening": "pulse", "/nutrition": "leaf", "/followups": "cal", "/nutrition-insights": "chart", "/guide": "chat", "/help": "help", "/notifications": "bell", "/settings": "gear", "/lab": "flask", "/audit": "clip", "/admin": "shield" };

const T = {
  en: { eyebrow: "AI FOR COMMUNITY HEALTH", h: "Bringing Intelligent Health Insights Closer to Every Community.", p: "A screening and nutrition-support research platform that makes health information easier to understand and balanced food choices more practical for underserved communities.", demo: "Get started", how: "How it works", note: "Academic research prototype. Not a diagnostic medical device." },
  hi: { eyebrow: "सामुदायिक स्वास्थ्य के लिए AI", h: "बुद्धिमान स्वास्थ्य जानकारी हर समुदाय के करीब।", p: "एक जांच और पोषण-सहायता अनुसंधान मंच, जो स्वास्थ्य जानकारी को समझना और संतुलित भोजन चुनना आसान बनाता है।", demo: "शुरू करें", how: "यह कैसे काम करता है", note: "शैक्षणिक अनुसंधान प्रोटोटाइप। यह निदान उपकरण नहीं है।" },
};
const Foot = () => <footer className="f">Academic research prototype. Not a diagnostic medical device and not a substitute for a qualified healthcare professional.</footer>;

export function Landing({ lang, setLang, onStart }: { lang: Lang; setLang: (l: Lang) => void; onStart: () => void }) {
  const t = T[lang];
  const feats = [["AI-assisted screening", "Validated measurement entry, with missing values never treated as zero."], ["Nutrition planner", "Rule-based meal ideas that respect allergies, diet, availability and budget."], ["Explainable ML research", "Held-out metrics, limitations and feature reliance, shown honestly."], ["Community insights", "Aggregate counts only, with small groups hidden for privacy."]];
  return <div className="light-scope">
    <div className="nav-l"><b>RuralCare AI</b><ThemeButton /><button className="btn sec sm" onClick={() => setLang(lang === "en" ? "hi" : "en")}>{lang === "en" ? "हिंदी" : "English"}</button><button className="btn sm" onClick={onStart}>Sign in</button></div>
    <section className="hero"><div className="in"><div className="eyebrow">{t.eyebrow}</div><h1>{t.h}</h1><p>{t.p}</p>
      <div className="cta"><button className="btn" onClick={onStart}>{t.demo}</button><a href="#how"><button className="btn sec">{t.how}</button></a></div><p className="muted" style={{ color: "#B9D0C8" }}>{t.note}</p></div></section>
    <section className="sec" id="how"><div className="in"><h2>How it works</h2><div className="g3">{[["STEP 01", "Screen", "Record measurements and lifestyle information with clear guidance."], ["STEP 02", "Understand", "Explore screening indicators and research-model output with its limits."], ["STEP 03", "Support", "Find food options that fit preferences, affordability and availability."]].map(s => <div className="card" key={s[0]}><div className="step">{s[0]}</div><h2>{s[1]}</h2><p className="muted">{s[2]}</p></div>)}</div></div></section>
    <section className="sec"><div className="in"><h2>Platform features</h2><div className="g3">{feats.map(f => <div className="card" key={f[0]}><h2>{f[0]}</h2><p className="muted">{f[1]}</p></div>)}</div></div></section>
    <section className="sec alt"><div className="in"><h2>Responsible AI</h2><ul><li>Unvalidated models are clearly labelled; no invented scores or accuracy.</li><li>Sample and synthetic data is always clearly labelled.</li><li>Role-based access enforced on the server; consent is required.</li><li>Urgent symptoms are shown above everything else.</li></ul>
      <p>This prototype does not diagnose disease, advise on medication, or claim clinical validation.</p><button className="btn" onClick={onStart}>Get started</button></div></section><Foot /></div>;
}

export function Shell({ role, items, lang, setLang, onOut, children }: { role: string; items: [string, string][]; lang: Lang; setLang: (l: Lang) => void; onOut: () => void; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false); const [q, setQ] = useState(""); const nav = useNavigate();
  const search = (e: FormEvent) => { e.preventDefault(); nav("/participants" + (q.trim() ? "?q=" + encodeURIComponent(q.trim()) : "")); };
  return <div className={"shell" + (collapsed ? " collapsed" : "")}><aside className="side" aria-label="Main navigation"><div className="brand"><span className="logo" aria-hidden><Icon n="heart" /></span><span className="bt">RuralCare AI</span></div>
    <nav>{items.map(([to, l]) => <NavLink key={to} to={to} end={to === "/"} title={tr(lang, l)} className={({ isActive }) => isActive ? "active" : ""}><Icon n={ROUTE_ICON[to] || "grid"} /><span className="nl">{tr(lang, l)}</span></NavLink>)}</nav>
    <div className="side-foot"><button className="navbtn" onClick={() => setCollapsed(!collapsed)} aria-pressed={collapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}><Icon n="collapse" /><span className="nl">Collapse</span></button><div className="sf" style={{ padding: "8px 12px" }}>Signed in as {role}</div></div></aside>
    <div className="content"><div className="top"><span className="badge warn">ACADEMIC PROJECT</span>
      {role === "worker" ? <form className="gsearch" role="search" onSubmit={search}><Icon n="search" /><label className="sr" htmlFor="gs">Search participants by code</label><input id="gs" type="search" placeholder="Search participant code" value={q} onChange={e => setQ(e.target.value)} /></form> : <span style={{ flex: 1 }} />}
      <span style={{ flex: 1 }} /><Link to="/notifications" className="iconbtn" aria-label="Notifications"><Icon n="bell" /></Link><ThemeButton />
      <button className="btn sec sm" onClick={() => setLang(lang === "en" ? "hi" : "en")}>{lang === "en" ? "हिंदी" : "English"}</button>
      <span className="me" title={"Signed in as " + role}><span className="av" aria-hidden>{role.charAt(0).toUpperCase()}</span><span className="mr">{role}</span></span><button className="btn sec sm" onClick={onOut}>Sign out</button></div>
      <main>{children}</main><Foot /></div></div>;
}

export function BarChart({ title, rows }: { title: string; rows: { label: string; value: number | null }[] }) {
  const max = Math.max(...rows.map(r => r.value ?? 0), 1);
  const desc = rows.map(r => `${r.label}: ${r.value === null ? "hidden, small group" : r.value}`).join("; ");
  return <svg className="chart" role="img" aria-label={`${title}. ${desc}`} viewBox={`0 0 440 ${rows.length * 34 + 6}`} width="100%">{rows.map((r, i) => <g key={r.label}>
    <text x="0" y={i * 34 + 20} fill="currentColor">{r.label}</text>
    {r.value === null ? <text x="120" y={i * 34 + 20} fill="currentColor" opacity=".7">Hidden (small group)</text> : <><rect x="120" y={i * 34 + 6} width={Math.max(2, (r.value / max) * 260)} height="20" rx="6" fill="var(--pri)" /><text x={126 + (r.value / max) * 260} y={i * 34 + 21} fill="currentColor">{r.value}</text></>}</g>)}</svg>;
}

/* Donut with a text legend (never colour alone) */
export function Donut({ title, parts }: { title: string; parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0), r = 52, c = 2 * Math.PI * r; let off = 0;
  const desc = parts.map(p => `${p.label}: ${p.value}`).join("; ");
  return <div className="donutwrap"><svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label={`${title}. ${desc}`}>
    <circle cx="70" cy="70" r={r} fill="none" stroke="var(--card2)" strokeWidth="16" />
    {total > 0 && parts.map(p => { const l = (p.value / total) * c; const el = <circle key={p.label} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${Math.max(l - 2, 0)} ${c - Math.max(l - 2, 0)}`} strokeDashoffset={-off} transform="rotate(-90 70 70)" />; off += l; return el; })}
    <text x="70" y="68" textAnchor="middle" fill="currentColor" fontSize="24" fontWeight="700">{total}</text><text x="70" y="86" textAnchor="middle" fill="var(--tx2)" fontSize="11">follow-ups</text></svg>
    <ul className="dleg">{parts.map(p => <li key={p.label}><i style={{ background: p.color }} />{p.label}: <b>{p.value}</b></li>)}</ul></div>;
}

/* Original friendly illustration for the login page (no third-party artwork) */
export const AuthArt = () => <svg viewBox="0 0 440 400" role="img" aria-label="Illustration of a community health worker holding a tablet">
  <circle cx="220" cy="190" r="165" fill="none" stroke="#7CC9AE" strokeWidth="1.5" strokeDasharray="3 7" /><circle cx="220" cy="205" r="120" fill="#A9E3CC" opacity=".55" />
  <path d="M130 372c0-62 38-100 90-100s90 38 90 100z" fill="#fff" stroke="#0A4A3B" strokeWidth="2.5" /><path d="M192 274l28 54 28-54" fill="#14A98A" stroke="#0A4A3B" strokeWidth="2.5" />
  <circle cx="220" cy="196" r="38" fill="#C98E5E" stroke="#0A4A3B" strokeWidth="2.5" /><path d="M176 200c-4-44 22-70 46-70s52 24 46 70c-8-22-18-34-46-34s-38 12-46 34z" fill="#14A98A" stroke="#0A4A3B" strokeWidth="2.5" />
  <circle cx="207" cy="198" r="3" fill="#0A4A3B" /><circle cx="233" cy="198" r="3" fill="#0A4A3B" /><path d="M210 213q10 8 20 0" fill="none" stroke="#0A4A3B" strokeWidth="2.5" strokeLinecap="round" />
  <g transform="rotate(-12 190 318)"><rect x="140" y="288" width="96" height="66" rx="8" fill="#2F6F60" stroke="#0A4A3B" strokeWidth="2.5" /><rect x="148" y="296" width="80" height="50" rx="4" fill="#C9F1E2" /><path d="M154 330l14-10 12 6 14-14 14 8 12-10" fill="none" stroke="#0D9274" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></g>
  <circle cx="338" cy="262" r="22" fill="#fff" stroke="#0A4A3B" strokeWidth="2.5" /><path d="M338 251v22M327 262h22" stroke="#0D9274" strokeWidth="6" strokeLinecap="round" />
  <path d="M96 150c24-8 40 4 44 26-24 8-40-4-44-26z" fill="#14A98A" stroke="#0A4A3B" strokeWidth="2.5" /><circle cx="320" cy="110" r="7" fill="#14A98A" /><circle cx="108" cy="276" r="6" fill="#7CC9AE" /></svg>;
