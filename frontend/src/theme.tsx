import { useState } from "react";
export type Theme = "light" | "dark" | "system";
const KEY = "ruralcare-theme"; // only the theme choice is stored; never health data
export function getTheme(): Theme {
  try { const v = localStorage.getItem(KEY); if (v === "light" || v === "dark" || v === "system") return v; } catch { /* storage unavailable */ }
  return "dark"; // default look: dark clinical dashboard
}
export function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
}
const LABEL: Record<Theme, string> = { light: "Light", dark: "Dark", system: "System" };
const PREV: Record<Theme, string> = { light: "linear-gradient(135deg,#F6F9F7 62%,#0A7A61 62%)", dark: "linear-gradient(135deg,#0F1716 62%,#34C3A0 62%)", system: "linear-gradient(90deg,#F6F9F7 50%,#0F1716 50%)" };
const DESC: Record<Theme, string> = { light: "Bright and clear", dark: "Easier in low light", system: "Match my device" };
export function ThemePicker() {
  const [t, setT] = useState<Theme>(getTheme());
  const pick = (v: Theme) => { setT(v); applyTheme(v); };
  return <div className="card"><h2>Appearance</h2><p className="muted" style={{ margin: 0 }}>Choose how RuralCare AI looks on this device.</p>
    <div role="radiogroup" aria-label="Theme" className="tiles">{(["light", "dark", "system"] as Theme[]).map(v =>
      <button key={v} role="radio" aria-checked={t === v} className={"tile" + (t === v ? " sel" : "")} onClick={() => pick(v)}>
        <span className="pv" style={{ background: PREV[v] }} /><b>{LABEL[v]}</b><span className="muted">{DESC[v]}</span></button>)}</div></div>;
}
export function ThemeButton() {
  const [t, setT] = useState<Theme>(getTheme());
  const next = () => { const n: Theme = t === "light" ? "dark" : t === "dark" ? "system" : "light"; setT(n); applyTheme(n); };
  return <button className="btn sec sm" onClick={next} aria-label={`Theme: ${LABEL[t]}. Click to change`}>◐ {LABEL[t]}</button>;
}
