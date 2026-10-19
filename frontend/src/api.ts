const BASE = (import.meta as any).env?.VITE_API_URL || "";
// Tokens live in memory only: never in localStorage, so a shared computer keeps nothing after the tab closes.
let userToken = "";
let adminToken = "";
let lost: ((admin: boolean) => void) | null = null;
export const setToken = (t: string) => { userToken = t; };
export const setAdminToken = (t: string) => { adminToken = t; };
export const hasAdminToken = () => !!adminToken;
/** Called when the server says a signed-in session is no longer valid (expired, logged out elsewhere, suspended). */
export const onAuthLost = (f: (admin: boolean) => void) => { lost = f; };
const inAdminArea = () => typeof location !== "undefined" && location.pathname.startsWith("/admin");

export async function api(path: string, opts: RequestInit = {}) {
  const admin = inAdminArea();
  const tok = path === "/api/admin/login" || path === "/api/auth/login" || path === "/api/auth/register" ? "" : admin ? adminToken : userToken;
  let r: Response;
  try {
    r = await fetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) } });
  } catch { throw new Error("Cannot reach the server. Check your connection and try again."); }
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 && tok && lost) lost(admin);
    throw new Error(typeof body?.detail === "string" ? body.detail : Array.isArray(body?.detail) ? body.detail.map((d: any) => d.msg).join("; ") : `Request failed (${r.status})`);
  }
  return body;
}

/** Like api(), but also returns the X-Total-Count header (used by paged admin lists). */
export async function apiWithTotal(path: string) {
  const admin = inAdminArea();
  const tok = admin ? adminToken : userToken;
  let r: Response;
  try { r = await fetch(BASE + path, { headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) } }); }
  catch { throw new Error("Cannot reach the server. Check your connection and try again."); }
  const body = await r.json().catch(() => null);
  if (!r.ok) { if (r.status === 401 && tok && lost) lost(admin); throw new Error(typeof body?.detail === "string" ? body.detail : `Request failed (${r.status})`); }
  return { data: body, total: Number(r.headers.get("X-Total-Count") || 0) };
}

export const qs = (o: Record<string, any>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return p.length ? "?" + p.join("&") : "";
};
export const fmtDate = (t?: number | null) => t ? new Date(t * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
export const fmtDateTime = (t?: number | null) => t ? new Date(t * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
export const fmtTime = (t?: number | null) => t ? new Date(t * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "";
