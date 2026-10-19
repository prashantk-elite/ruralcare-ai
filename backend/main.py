"""RuralCare AI API. Academic project: health tracking, symptom information, wellness guidance and an admin portal."""
import os, re, hmac, hashlib, json, time, base64, sqlite3, secrets, datetime, sys
from pathlib import Path
from typing import Optional, Literal
from fastapi import FastAPI, Depends, HTTPException, Header, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, model_validator
from nutrition import recommend

SECRET = os.environ.get("APP_SECRET", "dev-only-change-me").encode()
DB = os.environ.get("DB_PATH", "ruralcare.db")
MODEL_DIR = Path(os.environ.get("MODEL_DIR", "../ml/models"))
MIN_GROUP = int(os.environ.get("MIN_GROUP_SIZE", "5"))
USER_SESSION_SECONDS = 3600          # normal sign-in lasts one hour
ADMIN_SESSION_SECONDS = 1800         # administrator sign-in lasts 30 minutes
ADMIN_IDLE_SECONDS = 1200            # ...and ends after 20 minutes without a request
TZ_OFFSET = int(os.environ.get("PLATFORM_TZ_OFFSET_SECONDS", "19800"))  # IST: "day" boundaries for activity counts
app = FastAPI(title="RuralCare AI API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
                   allow_methods=["*"], allow_headers=["*"], expose_headers=["X-Total-Count"])


DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()  # set this to use a permanent PostgreSQL database
if DATABASE_URL:
    import psycopg2
    import psycopg2.extras
    INTEGRITY_ERRORS = (sqlite3.IntegrityError, psycopg2.IntegrityError)
else:
    INTEGRITY_ERRORS = (sqlite3.IntegrityError,)


def _pg_sql(sql):
    """Translate the SQLite-style statements used in this file to PostgreSQL. Returns (sql, is_insert)."""
    sql = sql.replace("?", "%s")
    head = sql.lstrip().upper()
    if head.startswith("CREATE TABLE"):
        sql = re.sub(r"\bINTEGER PRIMARY KEY\b", "SERIAL PRIMARY KEY", sql)
        sql = re.sub(r"\bREAL\b", "DOUBLE PRECISION", sql)
    if "ADD COLUMN " in sql.upper() and "IF NOT EXISTS" not in sql.upper():
        sql = sql.replace("ADD COLUMN ", "ADD COLUMN IF NOT EXISTS ")
    is_insert = head.startswith("INSERT")
    if is_insert and "RETURNING" not in head:
        sql += " RETURNING id"
    return sql, is_insert


class _Result:
    def __init__(self, cur, lastrowid=None):
        self._cur, self.lastrowid, self.rowcount = cur, lastrowid, cur.rowcount

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()


class _PG:
    """Small adapter so the rest of the code works unchanged on PostgreSQL."""
    def __init__(self):
        self.conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
        self.cur = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    def execute(self, sql, params=()):
        sql, is_insert = _pg_sql(sql)
        self.cur.execute(sql, params or None)
        new_id = None
        if is_insert:
            row = self.cur.fetchone()
            new_id = row["id"] if row else None
        return _Result(self.cur, new_id)

    def executescript(self, script):
        for stmt in script.split(";"):
            if stmt.strip():
                self.execute(stmt)

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()


def db():
    if DATABASE_URL:
        return _PG()
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c


def hash_pw(pw, salt=None):
    salt = salt or secrets.token_bytes(16)
    return salt.hex() + "$" + hashlib.scrypt(pw.encode(), salt=salt, n=2**14, r=8, p=1).hex()


def check_pw(pw, stored):
    s, h = stored.split("$")
    return hmac.compare_digest(hash_pw(pw, bytes.fromhex(s)).split("$")[1], h)


def make_token(uid, role, sid=None, ttl=USER_SESSION_SECONDS):
    body = {"uid": uid, "role": role, "exp": time.time() + ttl}
    if sid:
        body["sid"] = sid
    p = base64.urlsafe_b64encode(json.dumps(body).encode()).decode()
    return p + "." + hmac.new(SECRET, p.encode(), hashlib.sha256).hexdigest()


def init():
    c = db()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE, pw TEXT, role TEXT);
    CREATE TABLE IF NOT EXISTS participants(id INTEGER PRIMARY KEY, code TEXT UNIQUE, age_band TEXT, community TEXT,
        language TEXT, worker_id INTEGER, created_at REAL);
    CREATE TABLE IF NOT EXISTS consents(id INTEGER PRIMARY KEY,
        participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
        purpose TEXT, version TEXT, granted_at REAL, withdrawn_at REAL);
    CREATE TABLE IF NOT EXISTS screenings(id INTEGER PRIMARY KEY,
        participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
        worker_id INTEGER, recorded_at REAL, age INTEGER, height_cm REAL, weight_kg REAL, systolic REAL,
        diastolic REAL, glucose REAL, glucose_type TEXT, urgent INTEGER, completeness REAL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, actor_id INTEGER, action TEXT, resource TEXT,
        resource_id TEXT, ts REAL);
    """)
    admin_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD", "")
    if admin_email:
        if len(admin_pw) < 10:
            raise SystemExit("ADMIN_PASSWORD must be at least 10 characters")
        if not c.execute("SELECT 1 FROM users WHERE email=?", (admin_email,)).fetchone():
            c.execute("INSERT INTO users(email,pw,role) VALUES(?,?,?)", (admin_email, hash_pw(admin_pw), "admin"))
    # public sample accounts are seeded only when no owner admin is configured (or SEED_DEMO_USERS=1)
    if os.environ.get("SEED_DEMO_USERS", "0" if admin_email else "1") == "1":
        for email, role in [("admin@demo.local", "admin"), ("worker@demo.local", "worker"), ("researcher@demo.local", "researcher")]:
            if not c.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
                c.execute("INSERT INTO users(email,pw,role) VALUES(?,?,?)", (email, hash_pw(os.environ.get("DEMO_PASSWORD", "demo-only")), role))
    c.commit()
    c.close()


init()


def _add_column(c, table, coldef):
    """Add a column to an existing table; harmless if it is already there."""
    try:
        c.execute(f"ALTER TABLE {table} ADD COLUMN {coldef}")
    except sqlite3.OperationalError:
        pass


def init_v2():
    """Sessions, activity counters, operational events, platform settings and audit outcome."""
    c = db()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS user_sessions(id TEXT PRIMARY KEY, user_id INTEGER, kind TEXT, created_at REAL,
        last_seen REAL, expires_at REAL, ended_at REAL);
    CREATE TABLE IF NOT EXISTS daily_activity(id INTEGER PRIMARY KEY, day TEXT, user_id INTEGER);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, ts REAL, kind TEXT, anon TEXT, detail TEXT);
    CREATE TABLE IF NOT EXISTS platform_settings(id INTEGER PRIMARY KEY, skey TEXT UNIQUE, svalue TEXT, updated_at REAL, updated_by INTEGER);
    CREATE INDEX IF NOT EXISTS ix_sessions_user ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS ix_daily_activity ON daily_activity(day, user_id);
    CREATE INDEX IF NOT EXISTS ix_events_ts ON events(ts)
    """)
    _add_column(c, "audit", "outcome TEXT DEFAULT 'success'")
    _add_column(c, "users", "created_at REAL")
    c.commit()
    c.close()


init_v2()


SETTINGS_DEFAULTS = {          # key: (default, type, minimum, maximum)
    "ai_enabled": (True, "bool", None, None),
    "registration_open": (True, "bool", None, None),
    "symptom_checker_enabled": (True, "bool", None, None),
    "default_step_goal": (8000, "int", 1000, 50000),
    "default_water_goal_ml": (2000, "int", 500, 6000),
    "active_window_minutes": (5, "int", 1, 30),
}


def get_settings():
    c = db()
    rows = {r["skey"]: r["svalue"] for r in c.execute("SELECT skey, svalue FROM platform_settings").fetchall()}
    c.close()
    out = {}
    for k, (dflt, typ, _lo, _hi) in SETTINGS_DEFAULTS.items():
        if k in rows:
            try:
                out[k] = (rows[k] == "1") if typ == "bool" else int(rows[k])
                continue
            except ValueError:
                pass
        out[k] = dflt
    return out


def get_setting(key):
    return get_settings()[key]


def set_setting(key, value, by):
    c = db()
    stored = ("1" if value else "0") if SETTINGS_DEFAULTS[key][1] == "bool" else str(int(value))
    if c.execute("SELECT 1 FROM platform_settings WHERE skey=?", (key,)).fetchone():
        c.execute("UPDATE platform_settings SET svalue=?, updated_at=?, updated_by=? WHERE skey=?", (stored, time.time(), by, key))
    else:
        c.execute("INSERT INTO platform_settings(skey,svalue,updated_at,updated_by) VALUES(?,?,?,?)", (key, stored, time.time(), by))
    c.commit()
    c.close()


def anon(uid):
    """Stable anonymous label for a user in operational views. Not reversible without the server secret."""
    return hmac.new(SECRET, f"anon:{uid}".encode(), hashlib.sha256).hexdigest()[:8]


def day_str(ts=None):
    return (datetime.datetime.fromtimestamp((ts or time.time()) + TZ_OFFSET, datetime.timezone.utc)).strftime("%Y-%m-%d")


def log_event(kind, uid=None, detail=""):
    """Operational event for the admin feed. Never put health values, passwords, tokens or emails in `detail`."""
    try:
        c = db()
        c.execute("INSERT INTO events(ts,kind,anon,detail) VALUES(?,?,?,?)",
                  (time.time(), kind, anon(uid) if uid else None, str(detail)[:200]))
        c.commit()
        c.close()
    except Exception:
        pass


def audit(actor, action, resource, rid="", outcome="success"):
    c = db()
    c.execute("INSERT INTO audit(actor_id,action,resource,resource_id,ts,outcome) VALUES(?,?,?,?,?,?)",
              (actor, action, resource, str(rid), time.time(), outcome))
    c.commit()
    c.close()


def _mark_active_day(c, uid, now):
    d = day_str(now)
    if not c.execute("SELECT 1 FROM daily_activity WHERE day=? AND user_id=?", (d, uid)).fetchone():
        c.execute("INSERT INTO daily_activity(day,user_id) VALUES(?,?)", (d, uid))


def new_session(uid, kind, ttl):
    sid = secrets.token_hex(16)
    now = time.time()
    c = db()
    c.execute("INSERT INTO user_sessions(id,user_id,kind,created_at,last_seen,expires_at,ended_at) VALUES(?,?,?,?,?,?,NULL)",
              (sid, uid, kind, now, now, now + ttl))
    _mark_active_day(c, uid, now)
    c.commit()
    c.close()
    return sid


def end_session(sid):
    c = db()
    c.execute("UPDATE user_sessions SET ended_at=? WHERE id=? AND ended_at IS NULL", (time.time(), sid))
    c.commit()
    c.close()


def end_user_sessions(uid):
    c = db()
    c.execute("UPDATE user_sessions SET ended_at=? WHERE user_id=? AND ended_at IS NULL", (time.time(), uid))
    c.commit()
    c.close()


def user(authorization: Optional[str] = Header(None)):
    """Authenticate the bearer token. The role always comes from the database, never from the token alone,
    and a token tied to a session stops working as soon as that session is ended, expired or idle."""
    c = None
    try:
        p, sig = (authorization or "").removeprefix("Bearer ").split(".")
        if not hmac.compare_digest(sig, hmac.new(SECRET, p.encode(), hashlib.sha256).hexdigest()):
            raise ValueError
        d = json.loads(base64.urlsafe_b64decode(p))
        now = time.time()
        if d["exp"] < now:
            raise ValueError
        c = db()
        r = c.execute("SELECT status, role FROM users WHERE id=?", (d["uid"],)).fetchone()
        if not r or (r["status"] or "active") == "suspended":
            raise ValueError
        d["role"] = r["role"]
        d["kind"] = None
        sid = d.get("sid")
        if sid:
            s = c.execute("SELECT kind,last_seen,expires_at,ended_at FROM user_sessions WHERE id=? AND user_id=?",
                          (sid, d["uid"])).fetchone()
            if not s or s["ended_at"] is not None or s["expires_at"] < now:
                raise ValueError
            if s["kind"] == "admin" and now - s["last_seen"] > ADMIN_IDLE_SECONDS:
                c.execute("UPDATE user_sessions SET ended_at=? WHERE id=?", (now, sid))
                c.commit()
                raise ValueError
            d["kind"] = s["kind"]
            if now - s["last_seen"] >= 30:
                c.execute("UPDATE user_sessions SET last_seen=? WHERE id=?", (now, sid))
                _mark_active_day(c, d["uid"], now)
                c.commit()
        return d
    except Exception:
        raise HTTPException(401, "Not authenticated")
    finally:
        if c is not None:
            c.close()


def need(*roles):
    def dep(u=Depends(user)):
        if u["role"] not in roles:
            raise HTTPException(403, "Not permitted for this role")
        if u["role"] == "admin" and u.get("kind") != "admin":
            raise HTTPException(403, "Administrator access needs an Admin Portal sign-in")
        return u
    return dep


class Login(BaseModel):
    email: str
    password: str


@app.post("/api/auth/login")
def login(b: Login, request: Request):
    key = _ip(request) + "|" + b.email.strip().lower()
    throttle("login", key, LOGIN_LIMIT, 600)
    c = db()
    r = c.execute("SELECT * FROM users WHERE email=?", (b.email.strip().lower(),)).fetchone()
    c.close()
    if not r or not check_pw(b.password, r["pw"]):
        record("login", key)
        log_event("login_failed")
        raise HTTPException(401, "Incorrect email or password")
    if (r["status"] or "active") == "suspended":
        raise HTTPException(403, "Account suspended")
    if r["role"] == "admin":
        # Administrator accounts have their own sign-in page and a shorter session.
        raise HTTPException(403, "Administrator accounts sign in through the Admin Portal.")
    _hits.pop(("login", key), None)
    sid = new_session(r["id"], "user", USER_SESSION_SECONDS)
    log_event("login", r["id"])
    return {"token": make_token(r["id"], r["role"], sid), "role": r["role"]}


@app.post("/api/auth/logout")
def logout(u=Depends(user)):
    if u.get("sid"):
        end_session(u["sid"])
    return {"signed_out": True}


@app.get("/api/auth/me")
def me(u=Depends(user)):
    return {"uid": u["uid"], "role": u["role"], "exp": u["exp"]}


class NewParticipant(BaseModel):
    age_band: Literal["18-29", "30-44", "45-59", "60+"]
    community: str = Field(min_length=1, max_length=10)
    language: Literal["en", "hi"] = "en"
    consent_given: bool


@app.post("/api/participants", status_code=201)
def add_participant(b: NewParticipant, u=Depends(need("worker"))):
    if not b.consent_given:
        raise HTTPException(422, "Explicit consent is required")
    c = db()
    code = "RC-" + secrets.token_hex(3).upper()
    cur = c.execute("INSERT INTO participants(code,age_band,community,language,worker_id,created_at) VALUES(?,?,?,?,?,?)",
                    (code, b.age_band, b.community, b.language, u["uid"], time.time()))
    c.execute("INSERT INTO consents(participant_id,purpose,version,granted_at) VALUES(?,?,?,?)",
              (cur.lastrowid, "screening+nutrition research", "v1", time.time()))
    c.commit()
    c.close()
    audit(u["uid"], "create", "participant", cur.lastrowid)
    return {"id": cur.lastrowid, "code": code}


@app.get("/api/participants")
def list_participants(u=Depends(need("worker")), limit: int = 50, offset: int = 0):
    c = db()
    rows = c.execute("SELECT id,code,age_band,community,language FROM participants WHERE worker_id=? LIMIT ? OFFSET ?",
                     (u["uid"], min(limit, 100), offset)).fetchall()
    c.close()
    audit(u["uid"], "list", "participants")
    return [dict(r) for r in rows]


@app.delete("/api/participants/{pid}")
def delete_participant(pid: int, u=Depends(need("worker"))):
    c = db()
    n = c.execute("DELETE FROM participants WHERE id=? AND worker_id=?", (pid, u["uid"])).rowcount
    c.commit()
    c.close()
    if not n:
        raise HTTPException(404, "Not found in your scope")
    audit(u["uid"], "delete", "participant", pid)
    return {"deleted": True}


class Screening(BaseModel):
    participant_id: int
    age: int
    height_cm: float
    weight_kg: float
    systolic: Optional[float] = None
    diastolic: Optional[float] = None
    glucose_mgdl: Optional[float] = None
    glucose_type: Optional[Literal["fasting", "random", "post-meal"]] = None
    urgent_symptoms: bool = False

    @model_validator(mode="after")
    def check(self):
        if not 18 <= self.age <= 110:
            raise ValueError("age must be 18-110")
        if not 100 <= self.height_cm <= 230:
            raise ValueError("height must be 100-230 cm")
        if not 25 <= self.weight_kg <= 250:
            raise ValueError("weight must be 25-250 kg")
        if (self.systolic is None) != (self.diastolic is None):
            raise ValueError("give both BP values or neither")
        if self.systolic is not None and not (50 <= self.systolic <= 260 and 30 <= self.diastolic <= 160
                                              and self.diastolic < self.systolic):
            raise ValueError("implausible blood pressure")
        if self.glucose_mgdl is not None and (not 20 <= self.glucose_mgdl <= 800 or self.glucose_type is None):
            raise ValueError("glucose must be 20-800 mg/dL with a measurement type")
        return self


@app.post("/api/screenings", status_code=201)
def add_screening(b: Screening, u=Depends(need("worker"))):
    c = db()
    p = c.execute("SELECT 1 FROM participants p JOIN consents k ON k.participant_id=p.id "
                  "WHERE p.id=? AND p.worker_id=? AND k.withdrawn_at IS NULL", (b.participant_id, u["uid"])).fetchone()
    if not p:
        c.close()
        raise HTTPException(403, "Participant not in your scope, or consent missing/withdrawn")
    comp = sum(x is not None for x in (b.systolic, b.glucose_mgdl)) / 2
    cur = c.execute("INSERT INTO screenings(participant_id,worker_id,recorded_at,age,height_cm,weight_kg,systolic,"
                    "diastolic,glucose,glucose_type,urgent,completeness) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                    (b.participant_id, u["uid"], time.time(), b.age, b.height_cm, b.weight_kg, b.systolic,
                     b.diastolic, b.glucose_mgdl, b.glucose_type, int(b.urgent_symptoms), comp))
    c.commit()
    c.close()
    audit(u["uid"], "create", "screening", cur.lastrowid)
    out = {"id": cur.lastrowid, "bmi": round(b.weight_kg / (b.height_cm / 100) ** 2, 1),
           "optional_measurement_completeness": comp}
    if b.urgent_symptoms:
        out["alert"] = "Urgent symptoms reported: seek prompt professional/emergency help. Do not wait for any app result."
    return out


@app.post("/api/screenings/{sid}/assess")
def assess(sid: int, u=Depends(need("worker"))):
    c = db()
    s = c.execute("SELECT * FROM screenings WHERE id=? AND worker_id=?", (sid, u["uid"])).fetchone()
    c.close()
    if not s:
        raise HTTPException(404, "Screening not found in your scope")
    if s["urgent"]:
        return {"status": "urgent_symptoms", "message": "Prioritise prompt professional assessment; no model output shown."}
    mp, ip = MODEL_DIR / "model.joblib", MODEL_DIR / "metrics.json"
    note = "Research model not yet validated — illustrative screening workflow only."
    if not mp.exists() or not ip.exists():
        return {"status": "model_unavailable", "message": note}
    info = json.loads(ip.read_text())
    if info.get("synthetic"):
        return {"status": "not_validated", "message": note, "reason": "model trained on synthetic data only"}
    if s["glucose"] is None or s["diastolic"] is None:
        return {"status": "missing_required_inputs", "required": ["glucose", "diastolic"]}
    import joblib
    import pandas as pd
    art = joblib.load(mp)
    X = pd.DataFrame([{"Glucose": s["glucose"], "BloodPressure": s["diastolic"],
                       "BMI": s["weight_kg"] / (s["height_cm"] / 100) ** 2, "Age": s["age"]}])[art["features"]]
    prob = float(art["pipeline"].predict_proba(X)[0, 1])
    audit(u["uid"], "assess", "screening", sid)
    return {"status": "research_output", "target": info["target"], "model_version": info["version"],
            "dataset": info["dataset"], "score": round(prob, 3),
            "score_note": "Uncalibrated model score, not a diagnosis or clinical probability.",
            "test_metrics": info["test_metrics"], "limitations": info["limitations"]}


class NutritionReq(BaseModel):
    diet: Literal["veg", "egg", "non"] = "veg"
    budget_tier: int = Field(2, ge=1, le=3)
    allergies: list[str] = []
    available_foods: Optional[list[str]] = None
    day: int = Field(0, ge=0, le=6)


@app.post("/api/nutrition/recommendations")
def nutrition(b: NutritionReq, u=Depends(need("worker", "participant"))):
    return recommend(b.diet, b.budget_tier, b.allergies, b.available_foods, b.day)


@app.get("/api/analytics/community")
def community(u=Depends(need("admin", "researcher", "worker"))):
    c = db()

    def grp(col):
        rows = c.execute(f"SELECT {col} k, COUNT(*) n FROM participants GROUP BY {col}").fetchall()
        return [{"group": r["k"], "count": r["n"] if r["n"] >= MIN_GROUP else None,
                 "suppressed": r["n"] < MIN_GROUP} for r in rows]
    out = {"by_community": grp("community"), "by_age_band": grp("age_band"), "min_group_size": MIN_GROUP}
    c.close()
    return out


@app.get("/api/research/models")
def models(u=Depends(need("admin", "researcher"))):
    ip = MODEL_DIR / "metrics.json"
    return json.loads(ip.read_text()) if ip.exists() else {"status": "no model trained yet"}


@app.get("/api/audit")
def audit_log(u=Depends(need("admin"))):
    c = db()
    rows = c.execute("SELECT actor_id,action,resource,resource_id,ts FROM audit ORDER BY id DESC LIMIT 100").fetchall()
    c.close()
    return [dict(r) for r in rows]


# ---- Follow-ups and consent withdrawal ----
def init_followups():
    c = db()
    c.execute("""CREATE TABLE IF NOT EXISTS followups(id INTEGER PRIMARY KEY,
        participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
        worker_id INTEGER, due_at REAL, status TEXT DEFAULT 'scheduled', reminder_opt_in INTEGER DEFAULT 0)""")
    c.commit()
    c.close()


init_followups()


class NewFollowup(BaseModel):
    participant_id: int
    due_at: float = Field(gt=0)
    reminder_opt_in: bool = False


@app.post("/api/followups", status_code=201)
def add_followup(b: NewFollowup, u=Depends(need("worker"))):
    c = db()
    if not c.execute("SELECT 1 FROM participants WHERE id=? AND worker_id=?", (b.participant_id, u["uid"])).fetchone():
        c.close()
        raise HTTPException(403, "Participant not in your scope")
    cur = c.execute("INSERT INTO followups(participant_id,worker_id,due_at,reminder_opt_in) VALUES(?,?,?,?)",
                    (b.participant_id, u["uid"], b.due_at, int(b.reminder_opt_in)))
    c.commit()
    c.close()
    audit(u["uid"], "create", "followup", cur.lastrowid)
    return {"id": cur.lastrowid}


@app.get("/api/followups")
def list_followups(u=Depends(need("worker"))):
    c = db()
    rows = c.execute("SELECT f.id, p.code, f.due_at, f.status FROM followups f JOIN participants p ON p.id=f.participant_id "
                     "WHERE f.worker_id=? ORDER BY f.due_at", (u["uid"],)).fetchall()
    c.close()
    now = time.time()
    return [{"id": r["id"], "participant_code": r["code"], "due_at": r["due_at"],
             "status": "completed" if r["status"] == "completed" else ("overdue" if r["due_at"] < now else "upcoming")} for r in rows]


@app.patch("/api/followups/{fid}/complete")
def complete_followup(fid: int, u=Depends(need("worker"))):
    c = db()
    n = c.execute("UPDATE followups SET status='completed' WHERE id=? AND worker_id=?", (fid, u["uid"])).rowcount
    c.commit()
    c.close()
    if not n:
        raise HTTPException(404, "Not found in your scope")
    return {"status": "completed"}


@app.post("/api/participants/{pid}/withdraw-consent")
def withdraw_consent(pid: int, u=Depends(need("worker"))):
    c = db()
    n = c.execute("UPDATE consents SET withdrawn_at=? WHERE participant_id=? AND withdrawn_at IS NULL "
                  "AND participant_id IN (SELECT id FROM participants WHERE worker_id=?)", (time.time(), pid, u["uid"])).rowcount
    c.commit()
    c.close()
    if not n:
        raise HTTPException(404, "No active consent in your scope")
    audit(u["uid"], "withdraw_consent", "participant", pid)
    return {"withdrawn": True}


@app.get("/api/participants/{pid}")
def participant_profile(pid: int, u=Depends(need("worker"))):
    c = db()
    p = c.execute("SELECT id,code,age_band,community,language,created_at FROM participants WHERE id=? AND worker_id=?",
                  (pid, u["uid"])).fetchone()
    if not p:
        c.close()
        raise HTTPException(404, "Not found in your scope")
    consents = c.execute("SELECT version,granted_at,withdrawn_at FROM consents WHERE participant_id=? ORDER BY id DESC", (pid,)).fetchall()
    screenings = c.execute("SELECT id,recorded_at,age,height_cm,weight_kg,systolic,diastolic,glucose,glucose_type,urgent "
                           "FROM screenings WHERE participant_id=? ORDER BY recorded_at DESC", (pid,)).fetchall()
    fups = c.execute("SELECT id,due_at,status FROM followups WHERE participant_id=? ORDER BY due_at", (pid,)).fetchall()
    c.close()
    audit(u["uid"], "view", "participant", pid)
    return {"participant": dict(p), "consents": [dict(r) for r in consents],
            "screenings": [dict(r) for r in screenings], "followups": [dict(r) for r in fups]}


@app.get("/api/health")
def health():
    """Real checks only: database connectivity and presence of model files."""
    try:
        c = db()
        c.execute("SELECT 1")
        c.close()
        dbs = "ok"
    except Exception:
        dbs = "error"
    return {"api": "ok", "database": dbs,
            "model_files_present": (MODEL_DIR / "model.joblib").exists() and (MODEL_DIR / "metrics.json").exists(),
            "checked_at": time.time()}


@app.get("/api/admin/users")
def admin_users(response: Response, u=Depends(need("admin")), q: str = "", role: str = "", status: str = "",
                limit: int = 200, offset: int = 0):
    """Account list for administrators: account fields only, never health data. Supports search and paging."""
    where, args = [], []
    if q.strip():
        where.append("LOWER(email) LIKE ?")
        args.append("%" + q.strip().lower()[:80] + "%")
    if role in ("participant", "worker", "researcher", "admin"):
        where.append("role=?")
        args.append(role)
    if status in ("active", "suspended"):
        where.append("COALESCE(status,'active')=?")
        args.append(status)
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    c = db()
    total = c.execute("SELECT COUNT(*) n FROM users" + clause, tuple(args)).fetchone()["n"]
    rows = c.execute("SELECT id,email,role,status,created_at FROM users" + clause + " ORDER BY id LIMIT ? OFFSET ?",
                     tuple(args) + (max(1, min(limit, 200)), max(0, offset))).fetchall()
    seen = {r["user_id"]: r["m"] for r in c.execute("SELECT user_id, MAX(last_seen) m FROM user_sessions GROUP BY user_id").fetchall()}
    c.close()
    response.headers["X-Total-Count"] = str(total)
    audit(u["uid"], "list", "users")
    return [{**dict(r), "last_active": seen.get(r["id"])} for r in rows]


# ---- Admin user management, nutrition feedback and nutrition analytics ----
def init_extra():
    c = db()
    try:
        c.execute("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'")
    except sqlite3.OperationalError:
        pass
    c.execute("""CREATE TABLE IF NOT EXISTS nutrition_feedback(id INTEGER PRIMARY KEY, worker_id INTEGER, diet TEXT,
        budget_tier INTEGER, satisfaction INTEGER, adherence TEXT, accessibility TEXT, created_at REAL)""")
    c.commit()
    c.close()


init_extra()


class NewUser(BaseModel):
    email: str = Field(min_length=5, max_length=120)
    role: Literal["worker", "researcher", "admin", "participant"]
    password: str = Field(min_length=10, max_length=100)


@app.post("/api/admin/users", status_code=201)
def create_user(b: NewUser, u=Depends(need("admin"))):
    c = db()
    try:
        cur = c.execute("INSERT INTO users(email,pw,role,status,created_at) VALUES(?,?,?,'active',?)",
                        (b.email.strip().lower(), hash_pw(b.password), b.role, time.time()))
    except INTEGRITY_ERRORS:
        c.close()
        audit(u["uid"], "create", "user", "", "failed: email already registered")
        raise HTTPException(409, "Email already registered")
    c.commit()
    c.close()
    audit(u["uid"], "create", "user", cur.lastrowid)
    return {"id": cur.lastrowid}


class UserChange(BaseModel):
    role: Optional[Literal["worker", "researcher", "admin", "participant"]] = None
    status: Optional[Literal["active", "suspended"]] = None


@app.patch("/api/admin/users/{uid}")
def change_user(uid: int, b: UserChange, u=Depends(need("admin"))):
    if uid == u["uid"]:
        raise HTTPException(400, "You cannot change your own role or status")
    if b.role is None and b.status is None:
        raise HTTPException(422, "Nothing to change")
    c = db()
    if not c.execute("SELECT 1 FROM users WHERE id=?", (uid,)).fetchone():
        c.close()
        raise HTTPException(404, "User not found")
    if b.role:
        c.execute("UPDATE users SET role=? WHERE id=?", (b.role, uid))
    if b.status:
        c.execute("UPDATE users SET status=? WHERE id=?", (b.status, uid))
    c.commit()
    c.close()
    if b.status == "suspended" or b.role:
        end_user_sessions(uid)  # a deactivated or re-roled account must sign in again
    what = ",".join(x for x in ((f"role={b.role}" if b.role else ""), (f"status={b.status}" if b.status else "")) if x)
    audit(u["uid"], "update:" + what, "user", uid)
    return {"updated": True}


class Feedback(BaseModel):
    diet: Literal["veg", "egg", "non"]
    budget_tier: int = Field(ge=1, le=3)
    satisfaction: int = Field(ge=1, le=5)
    adherence: Literal["none", "some", "most", "all"]
    accessibility: Literal["easy", "some_difficulty", "hard"]


@app.post("/api/nutrition/feedback", status_code=201)
def add_feedback(b: Feedback, u=Depends(need("worker", "participant"))):
    """Anonymous, self-reported feedback. Not linked to a participant, and not verified consumption."""
    c = db()
    c.execute("INSERT INTO nutrition_feedback(worker_id,diet,budget_tier,satisfaction,adherence,accessibility,created_at) VALUES(?,?,?,?,?,?,?)",
              (u["uid"], b.diet, b.budget_tier, b.satisfaction, b.adherence, b.accessibility, time.time()))
    c.commit()
    c.close()
    return {"saved": True}


@app.get("/api/analytics/nutrition")
def nutrition_analytics(u=Depends(need("admin", "researcher", "worker"))):
    c = db()
    total = c.execute("SELECT COUNT(*) n FROM nutrition_feedback").fetchone()["n"]
    ok = total >= MIN_GROUP
    out = {"enough_data": ok, "total": total if ok else None, "min_group_size": MIN_GROUP,
           "by_adherence": [], "by_accessibility": [], "by_satisfaction": [], "by_diet": []}
    if ok:
        for key, col in [("by_adherence", "adherence"), ("by_accessibility", "accessibility"), ("by_satisfaction", "satisfaction"), ("by_diet", "diet")]:
            rows = c.execute(f"SELECT {col} k, COUNT(*) n FROM nutrition_feedback GROUP BY {col}").fetchall()
            out[key] = [{"group": str(r["k"]), "count": r["n"] if r["n"] >= MIN_GROUP else None, "suppressed": r["n"] < MIN_GROUP} for r in rows]
    c.close()
    return out


# ---- Open self-registration (limited "participant" role) and abuse protection ----
REGISTER_LIMIT = int(os.environ.get("REGISTER_LIMIT_PER_HOUR", "5"))
LOGIN_LIMIT = int(os.environ.get("LOGIN_LIMIT_PER_10MIN", "10"))
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_hits: dict = {}  # in-memory throttle; resets when the server restarts


def _ip(req: Request):
    fwd = req.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return fwd or (req.client.host if req.client else "unknown")


def throttle(bucket, key, limit, window):
    now = time.time()
    recent = [t for t in _hits.get((bucket, key), []) if now - t < window]
    _hits[(bucket, key)] = recent
    if len(recent) >= limit:
        raise HTTPException(429, "Too many attempts. Please wait a while and try again.")


def record(bucket, key):
    _hits.setdefault((bucket, key), []).append(time.time())


class Register(BaseModel):
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=10, max_length=100)
    name: Optional[str] = Field(None, max_length=60)


REGISTER_HOOKS: list = []  # feature modules add callables(uid, name) here


@app.post("/api/auth/register", status_code=201)
def register(b: Register, request: Request):
    """Public sign-up. Always creates the limited 'participant' role; elevated roles are admin-assigned only."""
    if not get_setting("registration_open"):
        raise HTTPException(403, "New sign-ups are paused right now. Please try again later.")
    email = b.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Enter a valid email address")
    ip = _ip(request)
    throttle("register", ip, REGISTER_LIMIT, 3600)
    c = db()
    try:
        cur = c.execute("INSERT INTO users(email,pw,role,status,created_at) VALUES(?,?,'participant','active',?)",
                        (email, hash_pw(b.password), time.time()))
    except INTEGRITY_ERRORS:
        c.close()
        raise HTTPException(409, "This email is already registered")
    c.commit()
    c.close()
    record("register", ip)
    audit(cur.lastrowid, "register", "user", cur.lastrowid)
    log_event("signup", cur.lastrowid)
    for hook in REGISTER_HOOKS:
        hook(cur.lastrowid, b.name)
    return {"id": cur.lastrowid, "role": "participant"}


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    """Record that something failed (route and error type only, never request contents) and answer safely."""
    log_event("server_error", detail=f"{request.method} {request.url.path} {type(exc).__name__}")
    return JSONResponse({"detail": "Something went wrong on our side. Please try again in a moment."}, status_code=500)


# ---- Feature modules (health records, symptoms, wellness, accounts, admin portal) ----
import account, health_records, symptoms, wellness, care, admin_portal, password_reset  # noqa: E402

_this = sys.modules[__name__]
for _mod in (account, health_records, symptoms, wellness, care, admin_portal, password_reset):
    _mod.register(app, _this)
