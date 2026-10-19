"""User profile, tracking preferences and the combined health-history view. Everything here is owner-scoped."""
import json, re, time, datetime
from typing import Optional, Literal
from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, Field

M = None  # the main module, set by register()
KINDS = ("bp", "heart_rate", "steps", "weight", "bmi", "sleep", "water", "glucose")
DEFAULT_TRACKED = ["steps", "water", "sleep", "weight"]  # everyday measures; clinical ones are opt-in
_CTRL = re.compile(r"[\x00-\x1f\x7f<>]")


def clean_text(s, limit):
    return _CTRL.sub(" ", s or "").strip()[:limit]


def _init():
    c = M.db()
    c.execute("""CREATE TABLE IF NOT EXISTS profiles(id INTEGER PRIMARY KEY, user_id INTEGER UNIQUE, name TEXT,
        birth_year INTEGER, language TEXT, units TEXT, diet_pref TEXT, tracked TEXT, step_goal INTEGER,
        water_goal_ml INTEGER, notify_reminders INTEGER, notify_announcements INTEGER, updated_at REAL)""")
    c.commit()
    c.close()


def get_profile(uid):
    """Profile row as a dict with defaults filled in. Never raises for users without a saved profile."""
    c = M.db()
    r = c.execute("SELECT * FROM profiles WHERE user_id=?", (uid,)).fetchone()
    u = c.execute("SELECT email, role FROM users WHERE id=?", (uid,)).fetchone()
    c.close()
    s = M.get_settings()
    r = dict(r) if r else {}
    try:
        tracked = [k for k in json.loads(r.get("tracked") or "null") if k in KINDS] if r.get("tracked") else list(DEFAULT_TRACKED)
    except (ValueError, TypeError):
        tracked = list(DEFAULT_TRACKED)
    email = u["email"] if u else ""
    return {
        "email": email, "role": u["role"] if u else "participant",
        "name": r.get("name") or "",
        "display_name": r.get("name") or (email.split("@")[0] if email else "there"),
        "birth_year": r.get("birth_year"),
        "language": r.get("language") or "en",
        "units": r.get("units") or "metric",
        "diet_pref": r.get("diet_pref") or "veg",
        "tracked": tracked,
        "step_goal": r.get("step_goal") or s["default_step_goal"],
        "water_goal_ml": r.get("water_goal_ml") or s["default_water_goal_ml"],
        "notifications": {"reminders": bool(r.get("notify_reminders")), "announcements": r.get("notify_announcements") is None or bool(r.get("notify_announcements"))},
    }


def _save(uid, **fields):
    c = M.db()
    exists = c.execute("SELECT 1 FROM profiles WHERE user_id=?", (uid,)).fetchone()
    if not exists:
        c.execute("INSERT INTO profiles(user_id, updated_at) VALUES(?,?)", (uid, time.time()))
    if fields:
        sets = ", ".join(f"{k}=?" for k in fields)
        c.execute(f"UPDATE profiles SET {sets}, updated_at=? WHERE user_id=?", tuple(fields.values()) + (time.time(), uid))
    c.commit()
    c.close()


class ProfilePatch(BaseModel):
    name: Optional[str] = Field(None, max_length=60)
    birth_year: Optional[int] = None
    clear_birth_year: bool = False
    language: Optional[Literal["en", "hi"]] = None
    units: Optional[Literal["metric", "imperial"]] = None
    diet_pref: Optional[Literal["veg", "egg", "non"]] = None
    tracked: Optional[list[str]] = None
    step_goal: Optional[int] = Field(None, ge=1000, le=50000)
    water_goal_ml: Optional[int] = Field(None, ge=500, le=6000)
    notify_reminders: Optional[bool] = None
    notify_announcements: Optional[bool] = None


def register(app, m):
    global M
    M = m
    _init()
    M.REGISTER_HOOKS.append(lambda uid, name: _save(uid, name=clean_text(name, 60)) if name and clean_text(name, 60) else None)

    @app.get("/api/profile")
    def read_profile(u=Depends(M.user)):
        return get_profile(u["uid"])

    @app.patch("/api/profile")
    def update_profile(b: ProfilePatch, u=Depends(M.user)):
        f = {}
        if b.name is not None:
            f["name"] = clean_text(b.name, 60)
        if b.clear_birth_year:
            f["birth_year"] = None
        elif b.birth_year is not None:
            if not 1900 <= b.birth_year <= datetime.date.today().year:
                raise HTTPException(422, "Enter a valid birth year")
            f["birth_year"] = b.birth_year
        for k in ("language", "units", "diet_pref", "step_goal", "water_goal_ml"):
            v = getattr(b, k)
            if v is not None:
                f[k] = v
        if b.tracked is not None:
            bad = [k for k in b.tracked if k not in KINDS]
            if bad:
                raise HTTPException(422, "Unknown measurement type: " + bad[0])
            f["tracked"] = json.dumps(list(dict.fromkeys(b.tracked)))
        if b.notify_reminders is not None:
            f["notify_reminders"] = int(b.notify_reminders)
        if b.notify_announcements is not None:
            f["notify_announcements"] = int(b.notify_announcements)
        _save(u["uid"], **f)
        return get_profile(u["uid"])

    @app.get("/api/history")
    def combined_history(u=Depends(M.user), limit: int = Query(30, ge=1, le=100)):
        """The signed-in user's own health measurements, symptom assessments, wellness plans and sign-ins, newest first."""
        uid = u["uid"]
        c = M.db()
        items = []
        for r in c.execute("SELECT id, kind, value1, value2, value3, unit, recorded_at FROM health_records WHERE user_id=? "
                           "ORDER BY recorded_at DESC LIMIT ?", (uid, limit)).fetchall():
            items.append({"type": "record", "id": r["id"], "ts": r["recorded_at"], "title": r["kind"], "kind": r["kind"],
                          "summary": M.health_records.display(dict(r))})
        for r in c.execute("SELECT id, created_at, level, symptoms_json FROM symptom_assessments WHERE user_id=? "
                           "ORDER BY created_at DESC LIMIT ?", (uid, limit)).fetchall():
            items.append({"type": "assessment", "id": r["id"], "ts": r["created_at"], "title": "Symptom assessment",
                          "level": r["level"], "summary": ", ".join(json.loads(r["symptoms_json"] or "[]")[:4])})
        for r in c.execute("SELECT id, created_at, title FROM wellness_plans WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
                           (uid, limit)).fetchall():
            items.append({"type": "wellness", "id": r["id"], "ts": r["created_at"], "title": r["title"] or "Wellness plan", "summary": ""})
        for r in c.execute("SELECT created_at FROM user_sessions WHERE user_id=? AND kind='user' ORDER BY created_at DESC LIMIT 5", (uid,)).fetchall():
            items.append({"type": "activity", "id": None, "ts": r["created_at"], "title": "Signed in", "summary": ""})
        c.close()
        items.sort(key=lambda x: x["ts"] or 0, reverse=True)
        return {"items": items[:limit]}
