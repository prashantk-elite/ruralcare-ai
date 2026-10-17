const BASE = (import.meta as any).env?.VITE_API_URL || "";
let token = ""; // kept in memory only: never in localStorage on shared devices
export const setToken = (t: string) => { token = t; };
export async function api(path: string, opts: RequestInit = {}) {
  let r: Response;
  try {
    r = await fetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) } });
  } catch { throw new Error("Cannot reach the server. Check your connection and try again."); }
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(typeof body?.detail === "string" ? body.detail : Array.isArray(body?.detail) ? body.detail.map((d: any) => d.msg).join("; ") : `Request failed (${r.status})`);
  return body;
}
