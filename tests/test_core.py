import os, sys, tempfile
os.environ.pop("DATABASE_URL", None)  # tests always use a throwaway SQLite file
os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "t.db")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from fastapi.testclient import TestClient
from main import app
import main as appmod
from nutrition import recommend
c = TestClient(app)

def tok(email):
    # administrators sign in through the separate Admin Portal endpoint; everyone else uses the normal one
    path = "/api/admin/login" if email.startswith("admin@") else "/api/auth/login"
    return {"Authorization": "Bearer " + c.post(path, json={"email": email, "password": "demo-only"}).json()["token"]}

def test_bad_login(): assert c.post("/api/auth/login", json={"email": "worker@demo.local", "password": "x"}).status_code == 401
def test_no_token(): assert c.get("/api/participants").status_code == 401
def test_researcher_cannot_read_participants(): assert c.get("/api/participants", headers=tok("researcher@demo.local")).status_code == 403
def test_admin_cannot_read_participants(): assert c.get("/api/participants", headers=tok("admin@demo.local")).status_code == 403
def test_consent_required():
    r = c.post("/api/participants", headers=tok("worker@demo.local"), json={"age_band": "30-44", "community": "C1", "consent_given": False})
    assert r.status_code == 422
def test_invalid_measurements_rejected():
    h = tok("worker@demo.local")
    p = c.post("/api/participants", headers=h, json={"age_band": "30-44", "community": "C1", "consent_given": True}).json()
    base = {"participant_id": p["id"], "age": 40, "height_cm": 160, "weight_kg": 60}
    assert c.post("/api/screenings", headers=h, json={**base, "systolic": 80, "diastolic": 120}).status_code == 422
    assert c.post("/api/screenings", headers=h, json={**base, "systolic": 120}).status_code == 422
    assert c.post("/api/screenings", headers=h, json={**base, "glucose_mgdl": 100}).status_code == 422
    ok = c.post("/api/screenings", headers=h, json=base)
    assert ok.status_code == 201 and ok.json()["optional_measurement_completeness"] == 0
def test_small_groups_suppressed():
    out = c.get("/api/analytics/community", headers=tok("researcher@demo.local")).json()
    assert all(g["count"] is None for g in out["by_community"] if g["suppressed"])
def test_allergy_filter():
    plan = recommend(diet="non", budget=3, allergies=["peanut", "milk", "egg", "fish", "gluten"])
    foods = {i["food"] for m in plan["plan"] for i in m["items"]}
    assert not foods & {"Roasted peanuts", "Curd / milk", "Egg", "Fish curry", "Whole-wheat roti"}
def test_budget_filter():
    foods = {i["food"] for m in recommend(diet="non", budget=1)["plan"] for i in m["items"]}
    assert not foods & {"Egg", "Fish curry", "Curd / milk", "Seasonal fruit"}
def test_veg_has_no_animal_food():
    foods = {i["food"] for m in recommend(diet="veg", budget=3)["plan"] for i in m["items"]}
    assert not foods & {"Egg", "Fish curry"}

def test_consent_withdrawal_blocks_screening():
    h = tok("worker@demo.local")
    p = c.post("/api/participants", headers=h, json={"age_band": "45-59", "community": "C2", "consent_given": True}).json()
    assert c.post(f"/api/participants/{p['id']}/withdraw-consent", headers=h).status_code == 200
    r = c.post("/api/screenings", headers=h, json={"participant_id": p["id"], "age": 50, "height_cm": 160, "weight_kg": 60})
    assert r.status_code == 403
def test_followup_lifecycle():
    h = tok("worker@demo.local")
    p = c.post("/api/participants", headers=h, json={"age_band": "18-29", "community": "C3", "consent_given": True}).json()
    f = c.post("/api/followups", headers=h, json={"participant_id": p["id"], "due_at": 1.0}).json()
    assert c.get("/api/followups", headers=h).json()[0]["status"] == "overdue"
    assert c.patch(f"/api/followups/{f['id']}/complete", headers=h).status_code == 200
def test_researcher_cannot_create_followup():
    assert c.post("/api/followups", headers=tok("researcher@demo.local"), json={"participant_id": 1, "due_at": 5}).status_code == 403

def test_profile_scope_and_history():
    h = tok("worker@demo.local")
    p = c.post("/api/participants", headers=h, json={"age_band": "30-44", "community": "C4", "consent_given": True}).json()
    c.post("/api/screenings", headers=h, json={"participant_id": p["id"], "age": 40, "height_cm": 160, "weight_kg": 60})
    r = c.get(f"/api/participants/{p['id']}", headers=h).json()
    assert r["participant"]["code"] == p["code"] and len(r["screenings"]) == 1 and r["consents"][0]["withdrawn_at"] is None
    assert c.get(f"/api/participants/{p['id']}", headers=tok("researcher@demo.local")).status_code == 403
def test_day_rotation_keeps_allergy_filter():
    for d in range(7):
        foods = {i["food"] for m in recommend(diet="non", budget=3, allergies=["peanut", "egg"], day=d)["plan"] for i in m["items"]}
        assert not foods & {"Roasted peanuts", "Egg"}

def test_health_is_real_and_public():
    r = c.get("/api/health").json()
    assert r["api"] == "ok" and r["database"] == "ok"
def test_admin_users_restricted_and_no_passwords():
    assert c.get("/api/admin/users", headers=tok("worker@demo.local")).status_code == 403
    rows = c.get("/api/admin/users", headers=tok("admin@demo.local")).json()
    assert rows and all("pw" not in r and "password" not in r for r in rows)

def test_admin_creates_changes_and_suspends_user():
    a = tok("admin@demo.local")
    r = c.post("/api/admin/users", headers=a, json={"email": "new@demo.local", "role": "worker", "password": "long-enough-pw"})
    assert r.status_code == 201 and c.post("/api/admin/users", headers=a, json={"email": "new@demo.local", "role": "worker", "password": "long-enough-pw"}).status_code == 409
    uid = r.json()["id"]
    assert c.post("/api/admin/users", headers=a, json={"email": "x@demo.local", "role": "worker", "password": "short"}).status_code == 422
    assert c.patch(f"/api/admin/users/{uid}", headers=a, json={"status": "suspended"}).status_code == 200
    assert c.post("/api/auth/login", json={"email": "new@demo.local", "password": "long-enough-pw"}).status_code == 403
def test_admin_cannot_change_self_and_worker_cannot_manage_users():
    a = tok("admin@demo.local"); me = c.get("/api/auth/me", headers=a).json()["uid"]
    assert c.patch(f"/api/admin/users/{me}", headers=a, json={"role": "worker"}).status_code == 400
    assert c.patch("/api/admin/users/1", headers=tok("worker@demo.local"), json={"status": "suspended"}).status_code == 403
def test_nutrition_feedback_validation_and_suppression():
    h = tok("worker@demo.local")
    assert c.post("/api/nutrition/feedback", headers=h, json={"diet": "veg", "budget_tier": 2, "satisfaction": 9, "adherence": "some", "accessibility": "easy"}).status_code == 422
    assert c.get("/api/analytics/nutrition", headers=h).json()["enough_data"] is False
    for _ in range(5):
        assert c.post("/api/nutrition/feedback", headers=h, json={"diet": "veg", "budget_tier": 2, "satisfaction": 4, "adherence": "some", "accessibility": "easy"}).status_code == 201
    out = c.get("/api/analytics/nutrition", headers=tok("researcher@demo.local")).json()
    assert out["enough_data"] and out["total"] == 5

def test_open_registration_gives_limited_role():
    appmod._hits.clear()
    r = c.post("/api/auth/register", json={"email": "Person@Example.com", "password": "long-enough-pw"})
    assert r.status_code == 201 and r.json()["role"] == "participant"
    assert c.post("/api/auth/register", json={"email": "person@example.com", "password": "long-enough-pw"}).status_code == 409
    assert c.post("/api/auth/register", json={"email": "not-an-email", "password": "long-enough-pw"}).status_code == 422
    assert c.post("/api/auth/register", json={"email": "a@b.co", "password": "short"}).status_code == 422
    h = {"Authorization": "Bearer " + c.post("/api/auth/login", json={"email": "person@example.com", "password": "long-enough-pw"}).json()["token"]}
    assert c.get("/api/participants", headers=h).status_code == 403
    assert c.post("/api/participants", headers=h, json={"age_band": "30-44", "community": "C1", "consent_given": True}).status_code == 403
    assert c.post("/api/screenings", headers=h, json={"participant_id": 1, "age": 40, "height_cm": 160, "weight_kg": 60}).status_code == 403
    assert c.get("/api/admin/users", headers=h).status_code == 403
    assert c.post("/api/nutrition/recommendations", headers=h, json={"diet": "veg", "budget_tier": 1}).status_code == 200
def test_registration_cannot_choose_role_and_is_rate_limited():
    appmod._hits.clear(); old = appmod.REGISTER_LIMIT; appmod.REGISTER_LIMIT = 2
    try:
        for i in range(2):
            r = c.post("/api/auth/register", json={"email": f"rl{i}@example.com", "password": "long-enough-pw", "role": "admin"})
            assert r.status_code == 201 and r.json()["role"] == "participant"
        assert c.post("/api/auth/register", json={"email": "rl9@example.com", "password": "long-enough-pw"}).status_code == 429
    finally:
        appmod.REGISTER_LIMIT = old; appmod._hits.clear()
def test_login_throttle_after_repeated_failures():
    appmod._hits.clear()
    for _ in range(appmod.LOGIN_LIMIT):
        assert c.post("/api/auth/login", json={"email": "worker@demo.local", "password": "wrong"}).status_code == 401
    assert c.post("/api/auth/login", json={"email": "worker@demo.local", "password": "demo-only"}).status_code == 429
    appmod._hits.clear()

def test_postgres_sql_translation():
    s, ins = appmod._pg_sql("INSERT INTO users(email,pw,role) VALUES(?,?,?)")
    assert s.endswith("VALUES(%s,%s,%s) RETURNING id") and ins
    s, _ = appmod._pg_sql("CREATE TABLE IF NOT EXISTS t(id INTEGER PRIMARY KEY, created_at REAL, x TEXT)")
    assert "SERIAL PRIMARY KEY" in s and "DOUBLE PRECISION" in s and "INTEGER PRIMARY KEY" not in s
    s, ins = appmod._pg_sql("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'")
    assert "ADD COLUMN IF NOT EXISTS status" in s and not ins
    s, ins = appmod._pg_sql("SELECT id FROM users WHERE email=? LIMIT ? OFFSET ?")
    assert s == "SELECT id FROM users WHERE email=%s LIMIT %s OFFSET %s" and not ins
