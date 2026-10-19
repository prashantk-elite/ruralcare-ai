import { FormEvent, useState } from "react";
import { api } from "./api";

/** Forgotten-password screens for the public sign-in page. No email is sent: an administrator gives the person a one-time code. */
export function Recover({ email: start, onBack }: { email: string; onBack: () => void }) {
  const [step, setStep] = useState<"ask" | "code" | "done">("ask");
  const [email, setEmail] = useState(start); const [sent, setSent] = useState(""); const [code, setCode] = useState("");
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [show, setShow] = useState(false);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  const ask = async (e: FormEvent) => { e.preventDefault(); setErr("");
    if (!email.trim()) return setErr("Enter the email address you signed up with.");
    setBusy(true);
    try { const r = await api("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email }) }); setSent(r.message); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); } };

  const reset = async (e: FormEvent) => { e.preventDefault(); setErr("");
    if (!email.trim() || !code.trim()) return setErr("Enter your email and the reset code.");
    if (pw.length < 10) return setErr("The new password must be at least 10 characters.");
    if (pw !== pw2) return setErr("The two passwords do not match.");
    setBusy(true);
    try { await api("/api/auth/reset", { method: "POST", body: JSON.stringify({ email, code, new_password: pw }) }); setStep("done"); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); } };

  const eyebrow = <div role="tablist" className="tabs">
    <button role="tab" aria-selected={step === "ask"} className={step === "ask" ? "btn sm" : "btn sec sm"} onClick={() => { setStep("ask"); setErr(""); }}>1. Ask for a code</button>
    <button role="tab" aria-selected={step === "code"} className={step === "code" ? "btn sm" : "btn sec sm"} onClick={() => { setStep("code"); setErr(""); }}>2. I have a code</button></div>;

  if (step === "done") return <><h1>Password changed</h1><div className="note" role="status">Your password has been changed and you were signed out everywhere. Sign in with your new password.</div>
    <button className="btn" onClick={onBack}>Back to sign in</button></>;

  return <><h1>Forgot your password?</h1>
    <div className="note">This site cannot send email. An administrator (for example the owner of this project) gives you a one-time code after confirming it is really you.</div>
    {eyebrow}
    {step === "ask" ? <form onSubmit={ask} noValidate>
      <p className="muted">Enter your email. The administrator will see your request in their portal.</p>
      <label htmlFor="rf-e">Email</label><input id="rf-e" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
      {sent && <div className="note" role="status">{sent}</div>}
      <p className="err" role="alert">{err}</p>
      <div className="actions left"><button className="btn" disabled={busy}>{busy ? "Please wait…" : "Request a reset code"}</button>
        {sent && <button type="button" className="btn sec" onClick={() => { setStep("code"); setErr(""); }}>I have a code</button>}</div>
    </form> : <form onSubmit={reset} noValidate>
      <label htmlFor="rc-e">Email</label><input id="rc-e" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
      <label htmlFor="rc-c">Reset code</label><input id="rc-c" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} placeholder="XXXXX-XXXXX" maxLength={30} value={code} onChange={e => setCode(e.target.value)} />
      <p className="muted small">The code works once and expires 30 minutes after the administrator creates it.</p>
      <label htmlFor="rc-p">New password (at least 10 characters)</label>
      <div className="pwrow"><input id="rc-p" type={show ? "text" : "password"} autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /><button type="button" className="btn sec sm" aria-pressed={show} onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button></div>
      <label htmlFor="rc-p2">Confirm new password</label><input id="rc-p2" type={show ? "text" : "password"} autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} />
      <p className="err" role="alert">{err}</p>
      <button className="btn" disabled={busy}>{busy ? "Please wait…" : "Set new password"}</button>
    </form>}
    <p className="muted small"><button className="linkbtn" onClick={onBack}>← Back to sign in</button></p></>;
}
