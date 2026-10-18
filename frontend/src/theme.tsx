import { useState } from "react";
export type Theme = "light" | "dark" | "system";
const KEY = "ruralcare-theme"; // only the theme choice is stored; never health data
export function getTheme(): Theme {
  try { const v = localStorage.getItem(KEY); if (v === "light" || v === "dark" || v === "system") return v; } catch { /* storage unavailable */ }
  return "light";
}
export function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
}
const LABEL: Record<Theme, string> = { light: "Light", dark: "Dark", system: "System" };
export function ThemePicker() {
  const [t, setT] = useState<Theme>(getTheme());
  const pick = (v: Theme) => { setT(v); applyTheme(v); };
  return <div className="card"><h2>Appearance</h2><fieldset style={{ border: 0, padding: 0 }}><legend className="muted">Choose how the site looks</legend>
    {(["light", "dark", "system"] as Theme[]).map(v => <label key={v} style={{ display: "inline-block", marginRight: 18, fontWeight: 400 }}><input type="radio" name="theme" checked={t === v} onChange={() => pick(v)} />{LABEL[v]}{v === "system" ? " (match my device)" : ""}</label>)}</fieldset></div>;
}
export function ThemeButton() {
  const [t, setT] = useState<Theme>(getTheme());
  const next = () => { const n: Theme = t === "light" ? "dark" : t === "dark" ? "system" : "light"; setT(n); applyTheme(n); };
  return <button className="btn sec sm" onClick={next} aria-label={`Theme: ${LABEL[t]}. Click to change`}>◐ {LABEL[t]}</button>;
}
