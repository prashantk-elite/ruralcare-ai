import os, sys, tempfile
os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "t.db")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from fastapi.testclient import TestClient
from main import app
from nutrition import recommend
c = TestClient(app)

def tok(email):
    return {"Authorization": "Bearer " + c.post("/api/auth/login", json={"email": email, "password": "demo-only"}).json()["token"]}

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
