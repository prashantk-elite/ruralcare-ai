import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Icon } from "./icons";

/** Load JSON from the API. Pass null as the path to skip loading. */
export function useApi<T = any>(path: string | null, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (path === null) { setLoading(false); return; }
    let live = true;
    setLoading(true); setError("");
    api(path).then(d => { if (live) setData(d); }).catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);
  return { data, error, loading, reload: () => setTick(t => t + 1), setData };
}

// ---- Toasts: polite live region so screen readers hear success and error messages ----
type Toast = { id: number; msg: string; kind: "ok" | "err" };
const ToastCtx = createContext<(msg: string, kind?: "ok" | "err") => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setItems(x => [...x.slice(-3), { id, msg, kind }]);
    setTimeout(() => setItems(x => x.filter(t => t.id !== id)), kind === "err" ? 7000 : 4000);
  }, []);
  return <ToastCtx.Provider value={push}>{children}
    <div className="toasts" role="status" aria-live="polite">{items.map(t => <div key={t.id} className={"toast " + t.kind}><Icon name={t.kind === "ok" ? "check" : "alert"} size={18} /><span>{t.msg}</span></div>)}</div></ToastCtx.Provider>;
}

// ---- Dialogs ----
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input,select,textarea,button:not(.x)");
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {   // keep keyboard focus inside the dialog
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input:not([disabled]),select,textarea"));
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = ""; prev?.focus(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={"modal" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
      <div className="modal-h"><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button></div>
      {children}</div></div>;
}
export function Confirm({ title, body, label, danger, onYes, onNo }: { title: string; body: ReactNode; label: string; danger?: boolean; onYes: () => void | Promise<void>; onNo: () => void }) {
  const [busy, setBusy] = useState(false);
  return <Modal title={title} onClose={onNo}><div>{body}</div>
    <div className="actions"><button className="btn sec" onClick={onNo} disabled={busy}>Cancel</button>
      <button className={"btn" + (danger ? " danger" : "")} disabled={busy} onClick={async () => { setBusy(true); try { await onYes(); } finally { setBusy(false); } }}>{busy ? "Please wait…" : label}</button></div></Modal>;
}

// ---- Loading, empty and error states ----
export const Skeleton = ({ h = 90, n = 1 }: { h?: number; n?: number }) => <div aria-busy="true" aria-label="Loading">{Array.from({ length: n }).map((_, i) => <div key={i} className="skel" style={{ height: h }} />)}</div>;
export const Empty = ({ title, text, children }: { title: string; text?: string; children?: ReactNode }) =>
  <div className="empty"><b>{title}</b>{text && <p className="muted">{text}</p>}{children}</div>;
export const ErrorBox = ({ error, retry }: { error: string; retry?: () => void }) =>
  error ? <div className="note alert" role="alert"><b>Something did not load.</b> {error}{retry && <> <button className="btn sec sm" onClick={retry}>Try again</button></>}</div> : null;

export const Pager = ({ total, limit, offset, onPage }: { total: number; limit: number; offset: number; onPage: (o: number) => void }) =>
  total <= limit ? null : <div className="pager"><button className="btn sec sm" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - limit))}>Previous</button>
    <span className="muted">{offset + 1} to {Math.min(offset + limit, total)} of {total}</span>
    <button className="btn sec sm" disabled={offset + limit >= total} onClick={() => onPage(offset + limit)}>Next</button></div>;
