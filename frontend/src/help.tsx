import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./icons";

type Q = { q: string; a: string[] };
type Section = { id: string; title: string; icon: string; items: Q[] };

const SECTIONS: Section[] = [
  { id: "start", title: "Getting started", icon: "home", items: [
    { q: "How do I create an account?", a: ["Choose Get started, then Create account. You need an email address and a password of at least 10 characters. Your name is optional.", "Your email is not verified and is never used to send messages, so use any address you can remember. Tick the box to confirm you understand this is a student project."] },
    { q: "Why am I signed out after a while?", a: ["Sessions end after about an hour, and also if you reload the page. Your sign-in is kept in the browser's memory only, never saved on the device, which protects shared computers.", "Just sign in again. Your records are safe on the server."] },
    { q: "The first page load is slow. Is something wrong?", a: ["This site runs on free hosting that goes to sleep when nobody uses it. The first request after a quiet period can take up to a minute. After that it is fast."] },
    { q: "Can I use the site in Hindi?", a: ["Yes. Use the हिंदी button at the top. The symptom checker content and the menu are in Hindi. Some other screens are only partly translated for now."] },
  ] },
  { id: "dashboard", title: "Health dashboard and records", icon: "pulse", items: [
    { q: "What can I track?", a: ["Blood pressure, heart rate, daily steps, BMI, weight, sleep, water intake and blood glucose. You choose which of these appear on your dashboard with Choose what to track. You never have to track everything."] },
    { q: "Where do the numbers come from?", a: ["Only from you. Every value is typed in by you and labelled Entered by you. This site does not connect to a watch, phone, pedometer, blood pressure cuff or glucose meter, and it never claims to measure anything."] },
    { q: "How do I add, edit or delete a record?", a: ["Press Add health record, pick the measurement type, enter the values and the date and time, then save. Open Health Records to see every entry, edit one, or delete one you no longer want."] },
    { q: "Which units can I use?", a: ["Weight in kg or lb, height in cm or inches, water in ml or litres, and glucose in mg/dL or mmol/L. Values are converted for you. Glucose needs a context such as fasting or after a meal, because the same number means different things at different times."] },
    { q: "How are the charts drawn?", a: ["Charts use only your saved records. Choose the last 7, 30 or 90 days or a custom range. Steps and sleep show the latest entry for each day and water adds up through the day. Days with no records stay empty and are never filled in with guesses."] },
    { q: "What does the BMI number mean?", a: ["BMI is a screening number from your height and weight, not a diagnosis. It does not suit children, pregnancy or very muscular people. Some South Asian groups can have higher health risk at a lower BMI, so ask a health professional how to read your result."] },
    { q: "Why does a card say No data yet?", a: ["Because you have not added that measurement yet. Nothing is made up to fill the space."] },
  ] },
  { id: "symptoms", title: "Symptom checker", icon: "search", items: [
    { q: "How does it work?", a: ["Four steps: describe your symptoms, answer a few follow-up questions, see your assessment, then read the next steps. At the start you are asked whether any emergency warning sign is happening right now."] },
    { q: "What do the three levels mean?", a: ["Level 1: self-care and watch at home. Level 2: see a doctor soon. Level 3: urgent, seek emergency care now. Every result includes what to do next and when to get help sooner."] },
    { q: "Are emergencies checked by AI?", a: ["No. Warning signs such as severe breathing trouble, strong chest pain, stroke signs, fainting or heavy bleeding are checked first by fixed safety rules in the app. They never wait for an AI and they work even if the AI is switched off."] },
    { q: "Is this a diagnosis?", a: ["No. It gives general guidance on how urgent your symptoms may be and which kind of doctor to see. It does not name a disease, give percentages or advise on medicines. It cannot replace a doctor."] },
    { q: "Is AI used at all?", a: ["Optionally, to improve the wording of the advice. The AI can only raise the urgency level, never lower it, and its text is filtered for doses, diagnoses and percentages. If it is off or fails, you still get the full rule-based result."] },
    { q: "Who can see my past checks?", a: ["Only you. Open Health History to review them, delete one, or delete them all."] },
  ] },
  { id: "wellness", title: "Diet and wellness", icon: "leaf", items: [
    { q: "What does the diet planner do?", a: ["You enter your diet type, allergies, foods you avoid, budget and goal. It builds a general one-day meal outline with affordable, locally common foods and simple hydration tips. You can save plans and delete them later."] },
    { q: "Is this medical nutrition advice?", a: ["No. It is general information. If you have a health condition, are pregnant, or take regular medicines, ask a doctor or dietitian before changing your diet. Allergies you list are always excluded from the plan."] },
    { q: "Why does a plan say 'Nutritional data unavailable'?", a: ["Nutrient numbers are never invented. They appear only when a verified food composition source has been added to the site."] },
  ] },
  { id: "doctor", title: "Find a doctor and emergencies", icon: "pin", items: [
    { q: "Which numbers should I call in an emergency?", a: ["112 is the national emergency number. 108 is the emergency ambulance service in many states. For emotional distress, Tele-MANAS is 14416 or 1800-891-4416. If a number does not connect, try 112. Numbers are checked against official sources and show the date they were checked."] },
    { q: "How do I know which doctor to see?", a: ["Find a Doctor has a short guide: which specialist suits which kind of problem. Start with a general physician if you are unsure. The symptom checker also suggests a specialty."] },
    { q: "Why is the facility list short or empty?", a: ["Hospitals and clinics appear only after an administrator adds them with a source and a verification date. We would rather show nothing than show a wrong phone number. You can also save your own care contacts, which only you can see."] },
  ] },
  { id: "privacy", title: "Privacy and your data", icon: "shield", items: [
    { q: "Who can see my health records?", a: ["Only you. Administrators see totals such as how many people signed up or how many records exist. They never see anyone's individual values, symptoms or plans."] },
    { q: "Why are some counts hidden?", a: ["Small groups are hidden in aggregate charts so no one can be identified from them."] },
    { q: "Can I delete my data?", a: ["Yes. You can delete individual records, symptom checks and saved plans at any time. This cannot be undone."] },
    { q: "Should I enter real medical information?", a: ["This is an academic project and has not had a formal security or privacy review. Please enter only what you are comfortable sharing. Read the Privacy notice and the Medical disclaimer linked at the bottom of every page."] },
  ] },
  { id: "admin", title: "Administrators", icon: "shield", items: [
    { q: "How do I get to the Admin Portal?", a: ["Use the Admin Portal link at the bottom of the menu. Administrators sign in on their own page and cannot use the normal sign-in. Admin accounts cannot be created from the website, only by the person who runs the server."] },
    { q: "What does an administrator see?", a: ["Real totals, active sessions that are verified on the server, user management, settings, announcements, system and AI status, and an audit log. Admin sessions end after 30 minutes, or after 20 minutes without activity."] },
  ] },
  { id: "trouble", title: "Troubleshooting", icon: "help", items: [
    { q: "I forgot my password.", a: ["There is no email reset because emails are not verified. Ask the administrator of the site to reset your account."] },
    { q: "It says my session has ended.", a: ["Sign in again. This happens after about an hour or after reloading the page."] },
    { q: "My record would not save.", a: ["Check the message under the field. Values must be realistic (for example a heart rate between 20 and 250) and the date cannot be far in the future. Too many saves in one hour are also limited to protect the site."] },
    { q: "Something looks broken.", a: ["Reload the page and sign in again. If it keeps happening, tell the person who runs the site and say which page you were on. Do not include passwords or health details."] },
  ] },
];

export function Help() {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const t = term.trim().toLowerCase();
  const shown = useMemo(() => SECTIONS.map(s => ({ ...s, items: t ? s.items.filter(i => (i.q + " " + i.a.join(" ")).toLowerCase().includes(t)) : s.items })).filter(s => s.items.length), [t]);
  const count = shown.reduce((n, s) => n + s.items.length, 0);
  return <>
    <h1>Help and Documentation</h1>
    <p className="sub">Guides for every part of RuralCare AI. This is an academic project and not a medical service.</p>
    <div className="note"><b>In an emergency, call <a href="tel:112">112</a> now.</b> Do not use this website to decide whether to seek urgent care.</div>
    <div className="card"><label htmlFor="help-q">Search help</label>
      <input id="help-q" type="search" placeholder="For example: units, delete, emergency" value={term} onChange={e => setTerm(e.target.value)} />
      {!t && <div className="chips" aria-label="Jump to a section">{SECTIONS.map(s => <a key={s.id} className="chip" href={"#help-" + s.id}><Icon name={s.icon} size={14} />{s.title}</a>)}</div>}
      {t && <p className="muted small" role="status">{count} {count === 1 ? "answer" : "answers"} found.</p>}</div>
    {shown.map(s => <section className="card help-sec" id={"help-" + s.id} key={s.id}>
      <h2><Icon name={s.icon} size={18} /> {s.title}</h2>
      {s.items.map(i => { const key = s.id + i.q; return <details key={key} open={!!t || open === key} onToggle={e => { if ((e.target as HTMLDetailsElement).open) setOpen(key); else if (open === key) setOpen(null); }}>
        <summary>{i.q}</summary>{i.a.map((p, n) => <p key={n} className="muted">{p}</p>)}</details>; })}
    </section>)}
    {!count && <div className="card empty"><b>No help found for that search.</b><p className="muted">Try a shorter word, or clear the box to see every topic.</p></div>}
    <div className="card"><h2>More information</h2><ul className="plain"><li><Link to="/privacy">Privacy notice</Link></li><li><Link to="/disclaimer">Medical disclaimer</Link></li><li><Link to="/guide">Ask the RuralCare Guide</Link></li></ul></div>
  </>;
}
