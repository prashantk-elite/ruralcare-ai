import { useId } from "react";
import "./dashboard.css";

/* ---------- Data shape: wire these to your FastAPI endpoints ---------- */
export interface DashboardData {
  userName: string;
  isDemo: boolean;
  participants: number | null; // null = suppressed (below MIN_GROUP_SIZE)
  screeningsThisWeek: number | null;
  nutrition: { calories: number; goal: number; protein: number; carbs: number; fat: number };
  followUpCompletion: { label: string; value: number }[]; // value 0-100
  weight: { label: string; value: number }[]; // average change in kg, per week
  bloodPressure: { label: string; systolic: number; diastolic: number }[];
  followUps: { name: string; detail: string; due: string }[];
}

export const demoData: DashboardData = {
  userName: "Asha",
  isDemo: true,
  participants: 128,
  screeningsThisWeek: 3, // below the privacy threshold, shown as hidden
  nutrition: { calories: 1404, goal: 1800, protein: 28, carbs: 52, fat: 20 },
  followUpCompletion: [
    { label: "Sat", value: 22 }, { label: "Sun", value: 40 }, { label: "Mon", value: 35 },
    { label: "Tue", value: 60 }, { label: "Wed", value: 52 }, { label: "Thu", value: 71 },
    { label: "Fri", value: 84 },
  ],
  weight: [
    { label: "Week 1", value: 0.9 }, { label: "Week 2", value: 0.7 },
    { label: "Week 3", value: 0.5 }, { label: "Week 4", value: 0.35 },
  ],
  bloodPressure: [
    { label: "S", systolic: 128, diastolic: 82 }, { label: "M", systolic: 134, diastolic: 86 },
    { label: "T", systolic: 126, diastolic: 80 }, { label: "W", systolic: 140, diastolic: 90 },
    { label: "T", systolic: 131, diastolic: 84 }, { label: "F", systolic: 124, diastolic: 79 },
    { label: "S", systolic: 122, diastolic: 78 },
  ],
  followUps: [
    { name: "Sunita Devi", detail: "Nutrition review", due: "Today" },
    { name: "Ramesh Oraon", detail: "Blood pressure re-check", due: "Tomorrow" },
    { name: "Lakshmi Kumari", detail: "Screening step 2", due: "Wed" },
  ],
};

/* ---------- Small helpers ---------- */
// Smooth path through points (Catmull-Rom converted to cubic Bezier)
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function LineChart({
  series, labels, min, max, ariaLabel,
}: {
  series: { values: number[]; className: string }[];
  labels: string[];
  min: number;
  max: number;
  ariaLabel: string;
}) {
  const gid = useId();
  const W = 520, H = 190, L = 34, R = 10, T = 12, B = 26;
  const x = (i: number) => L + (i * (W - L - R)) / (labels.length - 1);
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const ticks = [min, min + (max - min) / 2, max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rc-chart" role="img" aria-label={ariaLabel}>
      <defs>
        <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--rc-accent)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--rc-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="rc-grid" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" className="rc-axis">{Math.round(t)}</text>
        </g>
      ))}
      {labels.map((l, i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="rc-axis">{l}</text>
      ))}
      {series.map((s, k) => {
        const pts = s.values.map((v, i) => [x(i), y(v)] as [number, number]);
        const path = smoothPath(pts);
        return (
          <g key={k}>
            {k === 0 && (
              <path d={`${path} L ${x(labels.length - 1)} ${H - B} L ${x(0)} ${H - B} Z`} fill={`url(#${gid}-fill)`} />
            )}
            <path d={path} className={s.className} fill="none" />
          </g>
        );
      })}
    </svg>
  );
}

function Ring({ calories, goal, protein, carbs, fat }: DashboardData["nutrition"]) {
  const rings = [
    { pct: protein, r: 70, cls: "rc-ring-a" },
    { pct: carbs, r: 56, cls: "rc-ring-b" },
    { pct: fat, r: 42, cls: "rc-ring-c" },
  ];
  return (
    <div className="rc-ring-wrap">
      <svg viewBox="0 0 160 160" className="rc-ring" role="img" aria-label={`${calories} of ${goal} kilocalories`}>
        {rings.map((r) => {
          const c = 2 * Math.PI * r.r;
          return (
            <g key={r.r} transform="rotate(-90 80 80)">
              <circle cx="80" cy="80" r={r.r} className="rc-ring-track" />
              <circle
                cx="80" cy="80" r={r.r} className={r.cls}
                strokeDasharray={`${(c * r.pct) / 100} ${c}`} strokeLinecap="round"
              />
            </g>
          );
        })}
        <text x="80" y="80" textAnchor="middle" className="rc-ring-num">{calories.toLocaleString()}</text>
        <text x="80" y="98" textAnchor="middle" className="rc-ring-unit">of {goal.toLocaleString()} kcal</text>
      </svg>
      <ul className="rc-legend">
        <li><i className="rc-dot rc-dot-a" /> Protein {protein}%</li>
        <li><i className="rc-dot rc-dot-b" /> Carbs {carbs}%</li>
        <li><i className="rc-dot rc-dot-c" /> Fat {fat}%</li>
      </ul>
    </div>
  );
}

const menu = ["Dashboard", "Participants", "Screenings", "Nutrition", "Follow-ups", "Research Lab"];
const more = ["Settings", "Help & Support"];

/* ---------- Page ---------- */
export default function Dashboard({ data = demoData, embedded = false }: { data?: DashboardData; embedded?: boolean }) {
  const stat = (v: number | null) => (v === null ? "Hidden" : v.toLocaleString());
  const hiddenNote = "Counts below the minimum group size are hidden to protect privacy.";
  const weightMax = Math.max(...data.weight.map((w) => w.value)) * 1.15;

  return (
    <div className={"rc-app" + (embedded ? " rc-embedded" : "")}>
      {!embedded && (
      <aside className="rc-side" aria-label="Main navigation">
        <div className="rc-brand">RuralCare<span> AI</span></div>
        <nav>
          <p className="rc-nav-title">Menu</p>
          {menu.map((m, i) => (
            <a key={m} href="#" className={"rc-nav" + (i === 0 ? " is-active" : "")} aria-current={i === 0 ? "page" : undefined}>
              {m}
            </a>
          ))}
          <p className="rc-nav-title">More</p>
          {more.map((m) => (
            <a key={m} href="#" className="rc-nav">{m}</a>
          ))}
        </nav>
        <div className="rc-note">
          <strong>Research prototype</strong>
          <span>Not a medical device. No diagnoses or medication advice.</span>
        </div>
      </aside>
      )}

      <main className="rc-main">
        <header className="rc-top">
          <h1>Dashboard</h1>
          <div className="rc-top-right">
            {data.isDemo && <span className="rc-badge">Demo data</span>}
            <input className="rc-search" type="search" placeholder="Search participants" aria-label="Search" />
          </div>
        </header>

        <section className="rc-hero">
          <div>
            <p className="rc-hero-hello">Welcome, {data.userName}</p>
            <h2>Check community health</h2>
            <p className="rc-hero-sub">Here is your village programme at a glance.</p>
          </div>
        </section>

        <section className="rc-stats" title={hiddenNote}>
          <div className="rc-card rc-stat">
            <span className="rc-stat-label">Participants</span>
            <strong>{stat(data.participants)}</strong>
          </div>
          <div className="rc-card rc-stat">
            <span className="rc-stat-label">Screenings this week</span>
            <strong>{stat(data.screeningsThisWeek)}</strong>
            {data.screeningsThisWeek === null || data.screeningsThisWeek < 5 ? (
              <span className="rc-stat-hint">Below minimum group size</span>
            ) : null}
          </div>
        </section>

        <section className="rc-grid">
          <article className="rc-card rc-nutrition">
            <h3>Today's nutrition</h3>
            <Ring {...data.nutrition} />
          </article>

          <article className="rc-card rc-adherence">
            <div className="rc-card-head">
              <h3>Follow-up completion</h3>
              <span className="rc-pill">Weekly</span>
            </div>
            <LineChart
              ariaLabel="Follow-up completion by day, percent"
              labels={data.followUpCompletion.map((d) => d.label)}
              min={0}
              max={100}
              series={[{ values: data.followUpCompletion.map((d) => d.value), className: "rc-line" }]}
            />
          </article>

          <article className="rc-card rc-followups">
            <div className="rc-card-head">
              <h3>Upcoming follow-ups</h3>
              <a href="#" className="rc-link">View all</a>
            </div>
            <ul className="rc-list">
              {data.followUps.map((f) => (
                <li key={f.name}>
                  <span className="rc-avatar" aria-hidden="true">{f.name[0]}</span>
                  <span className="rc-list-text">
                    <strong>{f.name}</strong>
                    <small>{f.detail}</small>
                  </span>
                  <span className="rc-due">{f.due}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rc-card rc-weight">
            <h3>Weight tracking trends</h3>
            <div className="rc-bars" role="img" aria-label="Average weight change per week, kilograms">
              {data.weight.map((w) => (
                <div key={w.label} className="rc-bar-col">
                  <div className="rc-bar-track">
                    <div className="rc-bar" style={{ height: `${(w.value / weightMax) * 100}%` }} />
                  </div>
                  <small>{w.label}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="rc-card rc-bp">
            <div className="rc-card-head">
              <h3>Blood pressure</h3>
              <span className="rc-key"><i className="rc-dot rc-dot-a" />Systolic <i className="rc-dot rc-dot-d" />Diastolic</span>
            </div>
            <LineChart
              ariaLabel="Average blood pressure by day, mmHg"
              labels={data.bloodPressure.map((d) => d.label)}
              min={60}
              max={150}
              series={[
                { values: data.bloodPressure.map((d) => d.systolic), className: "rc-line" },
                { values: data.bloodPressure.map((d) => d.diastolic), className: "rc-line rc-line-2" },
              ]}
            />
          </article>
        </section>
      </main>
    </div>
  );
}
