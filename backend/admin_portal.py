"""Administrator portal: separate sign-in, aggregate-only metrics, session activity, settings, announcements and audit logs.

Privacy rule for this whole file: administrators see counts and anonymous labels, never health records, symptom text,
wellness plans, passwords or tokens. Every endpoint depends on need("admin"), which independently requires a valid
administrator-portal session on the server, so hiding a link or editing browser storage can never grant access."""
import time
from typing import Optional, Literal
from fastapi import Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
import account

M = None  # the main module, set by register()

METRIC_DEFINITIONS = {
    "total_users": "Total registered accounts of every role (including administrators and suspended accounts).",
    "daily_active_users": "Distinct signed-in accounts that made at least one request on the selected day (platform time zone).",
    "weekly_active_users": "Distinct signed-in accounts active on at least one of the last 7 days.",
    "active_sessions": "Sign-in sessions that have not ended or expired and showed activity within the live window shown below. An account is NOT counted as online just because it exists.",
    "assessments": "Number of symptom assessments completed (a count only; no symptoms are shown to administrators).",
    "health_records": "Number of health records saved by users (a count only; no values are shown to administrators).",
    "administrators": "Accounts with the administrator role.",
}


def _init():
    c = M.db()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY, title TEXT, body TEXT, level TEXT, active INTEGER, created_at REAL, created_by INTEGER);
    CREATE TABLE IF NOT EXISTS content_items(id INTEGER PRIMARY KEY, title TEXT, body TEXT, active INTEGER, updated_at REAL, updated_by INTEGER)
    """)
    c.commit()
    c.close()


class AdminLogin(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=1, max_length=200)


class StatusIn(BaseModel):
    status: Literal["active", "suspended"]


class SettingsIn(BaseModel):
    ai_enabled: Optional[bool] = None
    registration_open: Optional[bool] = None
    symptom_checker_enabled: Optional[bool] = None
    default_step_goal: Optional[int] = None
    default_water_goal_ml: Optional[int] = None
    active_window_minutes: Optional[int] = None


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=500)
    level: Literal["info", "important"] = "info"


class ContentIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=800)
    active: bool = True


def _day_floor(ts):
    return M.day_str(ts)


def register(app, m):
    global M
    M = m
    _init()
    admin = M.need("admin")

    # ---- Authentication ----
    @app.post("/api/admin/login")
    def admin_login(b: AdminLogin, request: Request):
        email = b.email.strip().lower()
        key = M._ip(request) + "|admin|" + email
        M.throttle("admin_login", key, 5, 900)
        c = M.db()
        r = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        c.close()
        ok = bool(r) and r["role"] == "admin" and M.check_pw(b.password, r["pw"])
        if not ok:
            M.record("admin_login", key)
            M.audit(None, "admin_login", "admin_session", "", "failed")
            M.log_event("admin_login_failed")
            # one message for every failure so the response never reveals which emails are administrators
            raise HTTPException(401, "Incorrect administrator email or password")
        if (r["status"] or "active") == "suspended":
            M.audit(r["id"], "admin_login", "admin_session", "", "failed: suspended")
            raise HTTPException(403, "This administrator account is suspended")
        M._hits.pop(("admin_login", key), None)
        sid = M.new_session(r["id"], "admin", M.ADMIN_SESSION_SECONDS)
        M.audit(r["id"], "admin_login", "admin_session", sid[:6], "success")
        M.log_event("admin_login", r["id"])
        return {"token": M.make_token(r["id"], "admin", sid, M.ADMIN_SESSION_SECONDS), "role": "admin",
                "expires_in": M.ADMIN_SESSION_SECONDS, "idle_timeout": M.ADMIN_IDLE_SECONDS}

    @app.post("/api/admin/logout")
    def admin_logout(u=Depends(admin)):
        if u.get("sid"):
            M.end_session(u["sid"])
        M.audit(u["uid"], "admin_logout", "admin_session", "", "success")
        return {"signed_out": True}

    @app.get("/api/admin/me")
    def admin_me(u=Depends(admin)):
        c = M.db()
        r = c.execute("SELECT email FROM users WHERE id=?", (u["uid"],)).fetchone()
        c.close()
        return {"uid": u["uid"], "email": r["email"] if r else "", "role": "admin", "expires_at": u["exp"], "idle_timeout": M.ADMIN_IDLE_SECONDS}

    # ---- Analytics (aggregate only) ----
    @app.get("/api/admin/overview")
    def overview(u=Depends(admin), day: Optional[str] = None):
        now = time.time()
        s = M.get_settings()
        window = s["active_window_minutes"] * 60
        today = day if (day and len(day) == 10) else M.day_str(now)
        c = M.db()
        one = lambda sql, *a: c.execute(sql, a).fetchone()["n"]
        total = one("SELECT COUNT(*) n FROM users")
        roles = {r["role"]: r["n"] for r in c.execute("SELECT role, COUNT(*) n FROM users GROUP BY role").fetchall()}
        suspended = one("SELECT COUNT(*) n FROM users WHERE status='suspended'")
        dau = one("SELECT COUNT(*) n FROM daily_activity WHERE day=?", today)
        week_days = [M.day_str(now - i * 86400) for i in range(7)]
        marks = ",".join("?" for _ in week_days)
        wau = one(f"SELECT COUNT(DISTINCT user_id) n FROM daily_activity WHERE day IN ({marks})", *week_days)
        live = one("SELECT COUNT(*) n FROM user_sessions WHERE ended_at IS NULL AND expires_at>? AND last_seen>=?", now, now - window)
        assessments = one("SELECT COUNT(*) n FROM symptom_assessments")
        records = one("SELECT COUNT(*) n FROM health_records")
        events = [{"ts": r["ts"], "kind": r["kind"], "who": r["anon"], "detail": r["detail"]} for r in
                  c.execute("SELECT ts, kind, anon, detail FROM events ORDER BY id DESC LIMIT 12").fetchall()]
        c.close()
        return {
            "as_of": now, "day": today, "live_window_minutes": s["active_window_minutes"],
            "total_users": total, "users_by_role": roles, "suspended_users": suspended, "administrators": roles.get("admin", 0),
            "daily_active_users": dau, "weekly_active_users": wau, "active_sessions": live,
            "assessments": assessments, "health_records": records, "recent_events": events, "definitions": METRIC_DEFINITIONS,
        }

    @app.get("/api/admin/activity")
    def activity(u=Depends(admin), days: int = Query(14, ge=1, le=90)):
        """Per-day platform totals. No individual's data: counts of active accounts, assessments and records created."""
        now = time.time()
        since = now - days * 86400
        c = M.db()
        dau = {r["day"]: r["n"] for r in c.execute("SELECT day, COUNT(*) n FROM daily_activity GROUP BY day").fetchall()}
        a_ts = [r["created_at"] for r in c.execute("SELECT created_at FROM symptom_assessments WHERE created_at>=?", (since,)).fetchall()]
        h_ts = [r["created_at"] for r in c.execute("SELECT created_at FROM health_records WHERE created_at>=?", (since,)).fetchall()]
        s_ts = [r["created_at"] for r in c.execute("SELECT created_at FROM users WHERE created_at>=?", (since,)).fetchall()]
        ev = [{"ts": r["ts"], "kind": r["kind"], "who": r["anon"], "detail": r["detail"]} for r in
              c.execute("SELECT ts, kind, anon, detail FROM events ORDER BY id DESC LIMIT 50").fetchall()]
        c.close()
        tally = lambda ts: {d: sum(1 for t in ts if M.day_str(t) == d) for d in labels}
        labels = [M.day_str(now - i * 86400) for i in range(days - 1, -1, -1)]
        a, h, sg = tally(a_ts), tally(h_ts), tally(s_ts)
        return {"days": [{"day": d, "active_users": dau.get(d, 0), "assessments": a[d], "records": h[d], "signups": sg[d]} for d in labels],
                "events": ev, "note": "Counts only. Event labels are anonymous and never contain health information."}

    @app.get("/api/admin/active-users")
    def active_users(u=Depends(admin), limit: int = Query(50, ge=1, le=200)):
        """Verified live sessions: not ended, not expired and active inside the live window. Anonymous labels only."""
        now = time.time()
        s = M.get_settings()
        window = s["active_window_minutes"] * 60
        c = M.db()
        rows = c.execute("SELECT s.user_id, s.kind, s.last_seen, s.created_at, u.status FROM user_sessions s JOIN users u ON u.id=s.user_id "
                         "WHERE s.ended_at IS NULL AND s.expires_at>? AND s.last_seen>=? ORDER BY s.last_seen DESC LIMIT ?",
                         (now, now - window, limit)).fetchall()
        c.close()
        return {"as_of": now, "window_minutes": s["active_window_minutes"], "method": "verified sessions",
                "count": len(rows), "items": [{"who": M.anon(r["user_id"]), "kind": r["kind"], "account_status": r["status"] or "active",
                                               "last_activity": r["last_seen"], "session_started": r["created_at"], "session_status": "active"} for r in rows]}

    @app.get("/api/admin/system-health")
    def system_health(u=Depends(admin)):
        now = time.time()
        try:
            c = M.db()
            c.execute("SELECT 1")
            c.close()
            dbs = "ok"
        except Exception:
            dbs = "error"
        c = M.db()
        errs = c.execute("SELECT COUNT(*) n FROM events WHERE kind='server_error' AND ts>=?", (now - 86400,)).fetchone()["n"]
        recent = [{"ts": r["ts"], "detail": r["detail"]} for r in c.execute("SELECT ts, detail FROM events WHERE kind='server_error' ORDER BY id DESC LIMIT 10").fetchall()]
        ai_rows = c.execute("SELECT ai_status, COUNT(*) n FROM symptom_assessments WHERE created_at>=? GROUP BY ai_status", (now - 7 * 86400,)).fetchall()
        ai_total = c.execute("SELECT COUNT(*) n FROM symptom_assessments WHERE ai_used=1").fetchone()["n"]
        c.close()
        import symptoms
        s = M.get_settings()
        return {"checked_at": now, "api": "ok", "database": dbs, "errors_24h": errs, "recent_errors": recent,
                "ai": {"configured": symptoms.ai_available(), "provider": __import__("llm").provider() or None, "model": __import__("llm").model_name() if symptoms.ai_available() else None, "enabled_in_settings": s["ai_enabled"], "assessments_with_ai_total": ai_total,
                       "last_7_days_by_status": {r["ai_status"] or "unknown": r["n"] for r in ai_rows}},
                "model_files_present": (M.MODEL_DIR / "model.joblib").exists() and (M.MODEL_DIR / "metrics.json").exists()}

    # ---- User management ----
    @app.patch("/api/admin/users/{uid}/status")
    def user_status(uid: int, b: StatusIn, u=Depends(admin)):
        if uid == u["uid"]:
            M.audit(u["uid"], "set_status", "user", uid, "refused: own account")
            raise HTTPException(400, "You cannot change your own account status")
        c = M.db()
        row = c.execute("SELECT id, role FROM users WHERE id=?", (uid,)).fetchone()
        if not row:
            c.close()
            M.audit(u["uid"], "set_status", "user", uid, "failed: not found")
            raise HTTPException(404, "User not found")
        if row["role"] == "admin" and b.status == "suspended":
            n_active = c.execute("SELECT COUNT(*) n FROM users WHERE role='admin' AND COALESCE(status,'active')='active'").fetchone()["n"]
            if n_active <= 1:
                c.close()
                raise HTTPException(409, "You cannot suspend the last active administrator")
        c.execute("UPDATE users SET status=? WHERE id=?", (b.status, uid))
        c.commit()
        c.close()
        if b.status == "suspended":
            M.end_user_sessions(uid)
        M.audit(u["uid"], "set_status:" + b.status, "user", uid, "success")
        return {"updated": True, "status": b.status}

    # ---- Platform configuration ----
    @app.get("/api/admin/settings")
    def read_settings(u=Depends(admin)):
        return {"settings": M.get_settings(), "limits": {k: {"min": v[2], "max": v[3]} for k, v in M.SETTINGS_DEFAULTS.items() if v[1] == "int"}}

    @app.patch("/api/admin/settings")
    def write_settings(b: SettingsIn, u=Depends(admin)):
        changes = {k: v for k, v in b.model_dump().items() if v is not None}
        if not changes:
            raise HTTPException(422, "Nothing to change")
        for k, v in changes.items():
            _d, typ, lo, hi = M.SETTINGS_DEFAULTS[k]
            if typ == "int" and not (lo <= v <= hi):
                M.audit(u["uid"], "update_setting:" + k, "settings", k, "failed: out of range")
                raise HTTPException(422, f"{k} must be between {lo} and {hi}")
        for k, v in changes.items():
            M.set_setting(k, v, u["uid"])
            M.audit(u["uid"], f"update_setting:{k}={v}", "settings", k, "success")
        return {"settings": M.get_settings()}

    # ---- Audit logs ----
    @app.get("/api/admin/audit-logs")
    def audit_logs(u=Depends(admin), limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0), action: str = ""):
        where, args = "", []
        if action.strip():
            where, args = " WHERE action LIKE ?", ["%" + action.strip()[:40] + "%"]
        c = M.db()
        total = c.execute("SELECT COUNT(*) n FROM audit" + where, tuple(args)).fetchone()["n"]
        rows = c.execute("SELECT id, actor_id, action, resource, resource_id, ts, outcome FROM audit" + where + " ORDER BY id DESC LIMIT ? OFFSET ?",
                         tuple(args) + (limit, offset)).fetchall()
        c.close()
        return {"total": total, "limit": limit, "offset": offset,
                "items": [{"id": r["id"], "admin": M.anon(r["actor_id"]) if r["actor_id"] else None, "action": r["action"], "resource": r["resource"],
                           "resource_id": r["resource_id"], "ts": r["ts"], "outcome": r["outcome"] or "success"} for r in rows]}

    # ---- Announcements and wellness content ----
    @app.get("/api/announcements")
    def public_announcements(u=Depends(M.user)):
        c = M.db()
        rows = c.execute("SELECT id, title, body, level, created_at FROM announcements WHERE active=1 ORDER BY id DESC LIMIT 5").fetchall()
        c.close()
        return {"items": [dict(r) for r in rows]}

    @app.get("/api/admin/announcements")
    def list_announcements(u=Depends(admin)):
        c = M.db()
        rows = c.execute("SELECT id, title, body, level, active, created_at FROM announcements ORDER BY id DESC LIMIT 50").fetchall()
        c.close()
        return {"items": [dict(r) for r in rows]}

    @app.post("/api/admin/announcements", status_code=201)
    def add_announcement(b: AnnouncementIn, u=Depends(admin)):
        c = M.db()
        cur = c.execute("INSERT INTO announcements(title,body,level,active,created_at,created_by) VALUES(?,?,?,1,?,?)",
                        (account.clean_text(b.title, 80), account.clean_text(b.body, 500), b.level, time.time(), u["uid"]))
        c.commit()
        c.close()
        M.audit(u["uid"], "create", "announcement", cur.lastrowid, "success")
        return {"id": cur.lastrowid}

    @app.patch("/api/admin/announcements/{aid}")
    def toggle_announcement(aid: int, active: bool, u=Depends(admin)):
        c = M.db()
        n = c.execute("UPDATE announcements SET active=? WHERE id=?", (int(active), aid)).rowcount
        c.commit()
        c.close()
        if not n:
            raise HTTPException(404, "Announcement not found")
        M.audit(u["uid"], "show" if active else "hide", "announcement", aid, "success")
        return {"active": active}

    @app.delete("/api/admin/announcements/{aid}")
    def delete_announcement(aid: int, u=Depends(admin)):
        c = M.db()
        n = c.execute("DELETE FROM announcements WHERE id=?", (aid,)).rowcount
        c.commit()
        c.close()
        if not n:
            raise HTTPException(404, "Announcement not found")
        M.audit(u["uid"], "delete", "announcement", aid, "success")
        return {"deleted": True}

    @app.get("/api/content")
    def public_content(u=Depends(M.user)):
        c = M.db()
        rows = c.execute("SELECT id, title, body FROM content_items WHERE active=1 ORDER BY id DESC LIMIT 20").fetchall()
        c.close()
        return {"items": [dict(r) for r in rows]}

    @app.get("/api/admin/content")
    def list_content(u=Depends(admin)):
        c = M.db()
        rows = c.execute("SELECT id, title, body, active, updated_at FROM content_items ORDER BY id DESC LIMIT 100").fetchall()
        c.close()
        return {"items": [dict(r) for r in rows]}

    @app.post("/api/admin/content", status_code=201)
    def add_content(b: ContentIn, u=Depends(admin)):
        c = M.db()
        cur = c.execute("INSERT INTO content_items(title,body,active,updated_at,updated_by) VALUES(?,?,?,?,?)",
                        (account.clean_text(b.title, 80), account.clean_text(b.body, 800), int(b.active), time.time(), u["uid"]))
        c.commit()
        c.close()
        M.audit(u["uid"], "create", "content", cur.lastrowid, "success")
        return {"id": cur.lastrowid}

    @app.patch("/api/admin/content/{cid}")
    def edit_content(cid: int, b: ContentIn, u=Depends(admin)):
        c = M.db()
        n = c.execute("UPDATE content_items SET title=?, body=?, active=?, updated_at=?, updated_by=? WHERE id=?",
                      (account.clean_text(b.title, 80), account.clean_text(b.body, 800), int(b.active), time.time(), u["uid"], cid)).rowcount
        c.commit()
        c.close()
        if not n:
            raise HTTPException(404, "Item not found")
        M.audit(u["uid"], "update", "content", cid, "success")
        return {"updated": True}

    @app.delete("/api/admin/content/{cid}")
    def delete_content(cid: int, u=Depends(admin)):
        c = M.db()
        n = c.execute("DELETE FROM content_items WHERE id=?", (cid,)).rowcount
        c.commit()
        c.close()
        if not n:
            raise HTTPException(404, "Item not found")
        M.audit(u["uid"], "delete", "content", cid, "success")
        return {"deleted": True}
