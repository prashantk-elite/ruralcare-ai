"""RuralCare AI API. Educational research prototype: synthetic/demo data only."""
import os, hmac, hashlib, json, time, base64, sqlite3, secrets
from pathlib import Path
from typing import Optional, Literal
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
from nutrition import recommend

SECRET = os.environ.get("APP_SECRET", "dev-only-change-me").encode()
DB = os.environ.get("DB_PATH", "ruralcare.db")
MODEL_DIR = Path(os.environ.get("MODEL_DIR", "../ml/models"))
MIN_GROUP = int(os.environ.get("MIN_GROUP_SIZE", "5"))
app = FastAPI(title="RuralCare AI API", version="0.1")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
                   allow_methods=["*"], allow_headers=["*"])


def db():
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


def make_token(uid, role):
    p = base64.urlsafe_b64encode(json.dumps({"uid": uid, "role": role, "exp": time.time() + 3600}).encode()).decode()
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
    if not c.execute("SELECT 1 FROM users").fetchone():  # DEMO accounts only; never use in production
        for email, role in [("admin@demo.local", "admin"), ("worker@demo.local", "worker"),
                            ("researcher@demo.local", "researcher")]:
            c.execute("INSERT INTO users(email,pw,role) VALUES(?,?,?)", (email, hash_pw("demo-only"), role))
    c.commit()
    c.close()


init()


def audit(actor, action, resource, rid=""):
    c = db()
    c.execute("INSERT INTO audit(actor_id,action,resource,resource_id,ts) VALUES(?,?,?,?,?)",
              (actor, action, resource, str(rid), time.time()))
    c.commit()
    c.close()


def user(authorization: Optional[str] = Header(None)):
    try:
        p, sig = (authorization or "").removeprefix("Bearer ").split(".")
        if not hmac.compare_digest(sig, hmac.new(SECRET, p.encode(), hashlib.sha256).hexdigest()):
            raise ValueError
        d = json.loads(base64.urlsafe_b64decode(p))
        if d["exp"] < time.time():
            raise ValueError
        return d
    except Exception:
        raise HTTPException(401, "Not authenticated")


def need(*roles):
    def dep(u=Depends(user)):
        if u["role"] not in roles:
            raise HTTPException(403, "Not permitted for this role")
        return u
    return dep


class Login(BaseModel):
    email: str
    password: str


@app.post("/api/auth/login")
def login(b: Login):
    c = db()
    r = c.execute("SELECT * FROM users WHERE email=?", (b.email,)).fetchone()
    c.close()
    if not r or not check_pw(b.password, r["pw"]):
        raise HTTPException(401, "Incorrect email or password")
    return {"token": make_token(r["id"], r["role"]), "role": r["role"]}


@app.get("/api/auth/me")
def me(u=Depends(user)):
    return u


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
