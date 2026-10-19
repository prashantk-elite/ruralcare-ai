import { Link } from "react-router-dom";
import { Icon } from "./icons";
import { useApi } from "./ui2";

/* General, non-medical habits. One is shown per day, chosen by the date, so it never looks random or personal. */
const TIPS = [
  "Drink a glass of water when you wake up, and keep a bottle within reach during the day.",
  "A 10-minute walk after a meal is an easy way to add movement without changing your routine.",
  "Wash your hands with soap before eating and after using the toilet. It prevents many common infections.",
  "Fill half your plate with vegetables, and add a pulse such as dal or chana for protein.",
  "Go to bed and wake up at about the same time each day. Regular sleep helps your body and mood.",
  "Sit still for five minutes before measuring blood pressure. A rushed reading can be misleading.",
  "Choose fresh foods more often than packaged ones. They usually have less salt and sugar.",
  "Stand up and stretch every hour if you sit for long periods.",
  "Boil drinking water if you are unsure it is safe, and store it in a clean, covered container.",
  "Take a few slow breaths when you feel stressed. If low mood lasts two weeks, talk to someone you trust.",
  "Cover stagnant water at home. Mosquitoes breed in even a small pot of standing water.",
  "Keep a note of questions before a doctor visit, so you remember what to ask.",
  "Add a green leafy vegetable to one meal today. It is a good, low-cost source of iron.",
  "Do not ignore a cough that lasts more than two weeks. Get it checked at a health centre.",
];

const dayOfYear = (d: Date) => Math.floor((+d - +new Date(d.getFullYear(), 0, 0)) / 86400000);

function Ring({ label, icon, pct, big, small, tone }: { label: string; icon: string; pct: number | null; big: string; small: string; tone: string }) {
  const R = 38, C = 2 * Math.PI * R, p = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return <div className={"ring " + tone} role="img" aria-label={`${label}: ${big}. ${small}`}>
    <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden><circle className="ring-bg" cx="48" cy="48" r={R} />{p > 0 && <circle className="ring-fg" cx="48" cy="48" r={R} strokeDasharray={`${(C * p) / 100} ${C}`} transform="rotate(-90 48 48)" />}</svg>
    <span className="ring-ic"><Icon name={icon} size={20} /></span>
    <b>{big}</b><span className="ring-l">{label}</span><span className="ring-s">{small}</span></div>;
}

export function UserHome({ name }: { name: string }) {
  const ann = useApi<any>("/api/announcements");
  const sum = useApi<any>("/api/health-records/summary");
  const now = new Date(), h = now.getHours();
  const hello = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const date = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const tip = TIPS[dayOfYear(now) % TIPS.length];
  const s = sum.data, t = s?.today, g = s?.goals;
  const left = s ? s.completion.total - s.completion.done.length : 0;
  const next = !s ? null
    : s.total_records === 0 ? { text: "Add your first health record to start seeing your progress.", cta: "Add a record", to: "/records" }
    : left > 0 ? { text: `You have ${left} ${left === 1 ? "measure" : "measures"} left to log today.`, cta: "Log now", to: "/records" }
    : { text: "You have logged everything you track today. Nice work.", cta: "See trends", to: "/health" };

  return <div className="home">
    {ann.data?.items?.map((a: any) => <div key={a.id} className={"note" + (a.level === "important" ? " alert" : "")} role="note"><b>{a.title}</b> {a.body}</div>)}

    <section className="today" aria-labelledby="home-h">
      <div className="today-text">
        <p className="date">{date}</p>
        <h1 id="home-h">{hello}, {name || "there"}</h1>
        <p className="lead">{next ? next.text : "Loading your day…"}</p>
        <div className="quick">{next && <Link className="btn" to={next.to}><Icon name="plus" size={16} /> {next.cta}</Link>}<Link className="btn sec" to="/symptoms"><Icon name="search" size={16} /> Check symptoms</Link></div>
      </div>
      <div className="rings" aria-live="polite">
        {!s ? <><div className="skel" style={{ height: 150, width: 100 }} /><div className="skel" style={{ height: 150, width: 100 }} /><div className="skel" style={{ height: 150, width: 100 }} /></> : <>
          <Ring tone="r-steps" label="Steps" icon="steps" pct={t.steps == null ? null : (t.steps / g.steps) * 100} big={t.steps == null ? "—" : t.steps.toLocaleString()} small={t.steps == null ? "not logged" : `of ${g.steps.toLocaleString()}`} />
          <Ring tone="r-water" label="Water" icon="drop" pct={t.water_ml == null ? null : (t.water_ml / g.water_ml) * 100} big={t.water_ml == null ? "—" : `${(t.water_ml / 1000).toFixed(1)} L`} small={t.water_ml == null ? "not logged" : `of ${(g.water_ml / 1000).toFixed(1)} L`} />
          <Ring tone="r-sleep" label="Sleep" icon="moon" pct={t.sleep_hours == null ? null : (t.sleep_hours / 8) * 100} big={t.sleep_hours == null ? "—" : `${t.sleep_hours} h`} small={t.sleep_hours == null ? "not logged" : "of 8 h reference"} />
          <p className="rings-note">Rings show only what you typed in today. Nothing is measured by this site.</p></>}
      </div>
    </section>

    <div className="duo">
      <article className="tip"><span className="tip-k"><Icon name="leaf" size={16} /> Today's habit</span><p>{tip}</p><Link to="/guide" className="tip-more">More in the Guide</Link></article>
      <Link to="/symptoms" className="sx"><span className="ico"><Icon name="search" size={26} /></span><div><b>Not feeling well?</b><span>Answer a few questions and learn what to do next.</span></div><span className="btn">Start symptom check</span></Link>
    </div>

    <h2 className="sec-t">Your health space</h2>
    <div className="tiles">
      <Link to="/health" className="tile t-mint"><span className="ico"><Icon name="pulse" size={22} /></span><b>Health Dashboard</b><span>Trends for blood pressure, weight, steps and more.</span></Link>
      <Link to="/records" className="tile t-sky"><span className="ico"><Icon name="records" size={22} /></span><b>Health Records</b><span>Add, edit and filter what you have recorded.</span></Link>
      <Link to="/wellness" className="tile t-sand"><span className="ico"><Icon name="leaf" size={22} /></span><b>Diet and Wellness</b><span>Affordable meal ideas that respect your allergies.</span></Link>
      <Link to="/doctors" className="tile t-rose"><span className="ico"><Icon name="pin" size={22} /></span><b>Find a Doctor</b><span>Which specialist to see, and emergency numbers.</span></Link>
      <Link to="/history" className="tile t-sky"><span className="ico"><Icon name="clock" size={22} /></span><b>Health History</b><span>Records, symptom checks and plans in one timeline.</span></Link>
      <Link to="/guide" className="tile t-mint"><span className="ico"><Icon name="chat" size={22} /></span><b>Guide</b><span>Plain-language answers to common health questions.</span></Link>
    </div>

    <aside className="sos" aria-label="Emergency numbers">
      <span className="sos-t"><Icon name="alert" size={18} /> In an emergency</span>
      <a href="tel:112" className="sos-n"><b>112</b> national emergency</a>
      <a href="tel:108" className="sos-n"><b>108</b> ambulance</a>
      <a href="tel:14416" className="sos-n"><b>14416</b> Tele-MANAS support</a>
    </aside>
    <p className="muted small">This is an academic project and not a medical service. See the <Link to="/disclaimer">medical disclaimer</Link> and <Link to="/privacy">privacy notice</Link>.</p>
  </div>;
}
