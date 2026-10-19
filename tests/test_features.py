"""Tests for health records, symptom checker, wellness, profile and the admin portal."""
import os, sys, tempfile, time
os.environ.pop("DATABASE_URL", None)
os.environ.pop("ANTHROPIC_API_KEY", None)
os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "f.db")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from fastapi.testclient import TestClient
import main as appmod
import symptoms
from main import app
c = TestClient(app)
PW = "long-enough-pw"


def make_user(email, name=None):
    appmod._hits.clear()
    body = {"email": email, "password": PW}
    if name:
        body["name"] = name
    assert c.post("/api/auth/register", json=body).status_code == 201
    r = c.post("/api/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 200
    return {"Authorization": "Bearer " + r.json()["token"]}


def admin_headers():
    r = c.post("/api/admin/login", json={"email": "admin@demo.local", "password": "demo-only"})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


A = make_user("alice@example.com", "Alice")
B = make_user("bob@example.com")


# ---------- health records ----------
def test_profile_name_and_default_tracking():
    p = c.get("/api/profile", headers=A).json()
    assert p["display_name"] == "Alice" and "steps" in p["tracked"] and "bp" not in p["tracked"]
    assert c.get("/api/profile", headers=B).json()["display_name"] == "bob"


def test_add_and_list_records_with_units():
    r = c.post("/api/health-records", headers=A, json={"kind": "bp", "systolic": 120, "diastolic": 80})
    assert r.status_code == 201 and r.json()["systolic"] == 120 and r.json()["source"] == "manual"
    w = c.post("/api/health-records", headers=A, json={"kind": "weight", "value": 132.3, "unit": "lb"}).json()
    assert abs(w["value"] - 60.0) < 0.1
    g = c.post("/api/health-records", headers=A, json={"kind": "glucose", "value": 5.5, "unit": "mmol/L", "context": "fasting"}).json()
    assert abs(g["value"] - 99.1) < 0.2 and g["context"] == "fasting"
    assert c.get("/api/health-records?kind=bp", headers=A).json()["total"] == 1


def test_bmi_conversion_and_category():
    b = c.post("/api/health-records", headers=A, json={"kind": "bmi", "height": 65, "height_unit": "in", "weight": 150, "weight_unit": "lb"}).json()
    assert abs(b["height_cm"] - 165.1) < 0.2 and abs(b["weight_kg"] - 68.0) < 0.1
    assert abs(b["bmi"] - 24.96) < 0.1 and b["category"] == "Normal weight range"


def test_validation_rejects_bad_values():
    bad = [{"kind": "bp", "systolic": 80, "diastolic": 120}, {"kind": "bp", "systolic": 120}, {"kind": "heart_rate", "value": 5},
           {"kind": "steps", "value": -1}, {"kind": "steps", "value": 10.5}, {"kind": "sleep", "value": 30},
           {"kind": "glucose", "value": 100}, {"kind": "glucose", "value": 5000, "unit": "mg/dL", "context": "random"},
           {"kind": "bmi", "height": 20, "weight": 60}, {"kind": "water", "value": 99999},
           {"kind": "weight", "value": 70, "recorded_at": time.time() + 86400 * 3},
           {"kind": "steps", "value": 1000, "source": "device"}, {"kind": "bp", "systolic": "abc", "diastolic": 80}]
    for body in bad:
        assert c.post("/api/health-records", headers=A, json=body).status_code == 422, body


def test_users_cannot_see_or_change_each_others_records():
    rid = c.post("/api/health-records", headers=A, json={"kind": "heart_rate", "value": 72}).json()["id"]
    assert all(i["id"] != rid for i in c.get("/api/health-records", headers=B).json()["items"])
    assert c.patch(f"/api/health-records/{rid}", headers=B, json={"kind": "heart_rate", "value": 99}).status_code == 404
    assert c.delete(f"/api/health-records/{rid}", headers=B).status_code == 404
    assert c.get("/api/health-records", headers=A).json()["total"] >= 1
    still = [i for i in c.get("/api/health-records?kind=heart_rate", headers=A).json()["items"] if i["id"] == rid][0]
    assert still["value"] == 72
    assert c.get("/api/health-records").status_code == 401


def test_edit_delete_own_record_and_filters():
    rid = c.post("/api/health-records", headers=B, json={"kind": "steps", "value": 4000}).json()["id"]
    assert c.patch(f"/api/health-records/{rid}", headers=B, json={"kind": "steps", "value": 6500}).json()["value"] == 6500
    assert c.patch(f"/api/health-records/{rid}", headers=B, json={"kind": "heart_rate", "value": 70}).status_code == 422
    old = time.time() - 40 * 86400
    c.post("/api/health-records", headers=B, json={"kind": "steps", "value": 1234, "recorded_at": old})
    recent = c.get(f"/api/health-records?kind=steps&start={time.time() - 7 * 86400}", headers=B).json()
    assert recent["total"] == 1 and recent["items"][0]["value"] == 6500
    assert c.delete(f"/api/health-records/{rid}", headers=B).status_code == 200
    assert c.get(f"/api/health-records?kind=steps", headers=B).json()["total"] == 1


def test_series_uses_only_saved_records_and_empty_state():
    C = make_user("carol@example.com")
    s = c.get("/api/health-records/series?kind=bp&days=30", headers=C).json()
    assert s["points"] == []
    c.post("/api/health-records", headers=C, json={"kind": "water", "value": 500})
    c.post("/api/health-records", headers=C, json={"kind": "water", "value": 250})
    s = c.get("/api/health-records/series?kind=water&days=7", headers=C).json()
    assert len(s["points"]) == 1 and s["points"][0]["v"] == 750 and s["goal"] == 2000
    sm = c.get("/api/health-records/summary", headers=C).json()
    assert sm["today"]["water_ml"] == 750 and sm["latest"]["bp"] is None and sm["total_records"] == 2
    assert "typed in by you" in sm["data_note"]
    assert c.get("/api/health-records/series?kind=bogus", headers=C).status_code == 422


def test_dashboard_summary_is_per_user():
    D = make_user("dan@example.com")
    sm = c.get("/api/health-records/summary", headers=D).json()
    assert sm["total_records"] == 0 and sm["recent"] == [] and sm["last_updated"] is None


# ---------- symptom checker ----------
def assess(h, **kw):
    body = {"symptoms": [], "free_text": "", "duration": "1_3d", "severity": "mild", "age_group": "adult", "conditions": [], "red_flags": [], "answers": {}}
    body.update(kw)
    return c.post("/api/symptoms/assess", headers=h, json=body)


def test_red_flag_checkbox_forces_emergency_without_ai():
    r = assess(A, symptoms=["cough"], red_flags=["rf_breathing"])
    assert r.status_code == 201
    res = r.json()["result"]
    assert res["level"] == 3 and res["emergency"]["show"] and res["self_care"] == [] and res["diet_link"] is False
    assert "seek emergency medical care now" in res["emergency"]["message"]["en"].lower()
    assert any(n["number"] == "112" for n in res["emergency"]["numbers"])
    assert res["ai"]["status"] == "skipped_emergency" and "not a medical diagnosis" in res["not_a_diagnosis"]["en"]


def test_emergency_keywords_in_free_text_and_hindi():
    for text in ["I have chest pain since morning", "can't breathe properly", "my father fainted and is unconscious", "snake bite on leg", "सीने में दर्द है"]:
        assert assess(A, free_text=text).json()["result"]["level"] == 3, text


def test_serious_followup_answer_escalates_to_emergency():
    res = assess(A, symptoms=["headache"], answers={"headache_neuro": "yes"}).json()["result"]
    assert res["level"] == 3
    res = assess(A, symptoms=["fever"], age_group="infant").json()["result"]
    assert res["level"] == 3


def test_levels_one_and_two():
    r1 = assess(A, symptoms=["runny_nose"], severity="mild", duration="under_1d").json()["result"]
    assert r1["level"] == 1 and r1["diet_link"] and r1["self_care"] and r1["emergency"] is None
    r2 = assess(A, symptoms=["abdominal_pain"], duration="4_7d", severity="moderate").json()["result"]
    assert r2["level"] == 2 and r2["specialty"]["name"] == "General Physician" and r2["timeframe"]   # first contact is a GP
    r2b = assess(A, symptoms=["abdominal_pain"], duration="1_2w", severity="moderate").json()["result"]
    assert r2b["level"] == 2 and r2b["specialty"]["name"] == "Gastroenterologist"   # persistent digestive symptoms
    assert r2["specialty"]["validated"] is False
    r3 = assess(A, symptoms=["fever"], duration="4_7d").json()["result"]
    assert r3["level"] == 2 and r3["specialty"]["name"] == "General Physician"
    r4 = assess(A, symptoms=["rash"]).json()["result"]
    assert r4["specialty"]["name"] == "Dermatologist"


def test_no_invented_probabilities_in_result():
    import json
    for kw in [dict(symptoms=["fever", "cough"]), dict(symptoms=["chest_pain"], red_flags=["rf_chest"]), dict(symptoms=["rash"])]:
        text = json.dumps(assess(A, **kw).json()["result"])
        assert "%" not in text and "probability" not in text.lower() and "95" not in text


def test_assessment_validation():
    assert assess(A).status_code == 422
    assert assess(A, symptoms=["not-a-symptom"]).status_code == 422
    assert assess(A, symptoms=["cough"], red_flags=["nope"]).status_code == 422
    assert assess(A, symptoms=["cough"], conditions=["xyz"]).status_code == 422
    assert c.post("/api/symptoms/assess", json={"symptoms": ["cough"]}).status_code == 401


def test_history_is_private_and_deletable():
    E = make_user("erin@example.com")
    a = assess(E, symptoms=["cough"], free_text="dry cough at night").json()
    aid = a["id"]
    assert [i["id"] for i in c.get("/api/symptoms/history", headers=E).json()["items"]] == [aid]
    assert c.get("/api/symptoms/history", headers=A).json()["total"] >= 1
    assert all(i["id"] != aid for i in c.get("/api/symptoms/history", headers=A).json()["items"])
    assert c.get(f"/api/symptoms/history/{aid}", headers=A).status_code == 404
    assert c.delete(f"/api/symptoms/history/{aid}", headers=A).status_code == 404
    full = c.get(f"/api/symptoms/history/{aid}", headers=E).json()
    assert full["inputs"]["free_text"] == "dry cough at night" and full["result"]["level"] in (1, 2, 3)
    assert c.delete(f"/api/symptoms/history/{aid}", headers=E).status_code == 200
    assert c.get(f"/api/symptoms/history/{aid}", headers=E).status_code == 404
    assert c.delete("/api/symptoms/history", headers=E).status_code == 422


def test_followup_questions_depend_on_symptoms():
    q = c.post("/api/symptoms/questions", headers=A, json={"symptoms": ["chest_pain", "cough"]}).json()["questions"]
    ids = {x["id"] for x in q}
    assert "chest_pressure" in ids and "cough_breath" in ids and "fever_high" not in ids


def test_ai_cannot_lower_urgency_or_inject_claims(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(symptoms, "_call_llm", lambda s, u: '{"level": 1, "summary": "You definitely have dengue (95% sure)", '
                        '"possible_explanations": ["Viral illness", "You are suffering from malaria", "Take 500 mg paracetamol"], '
                        '"self_care": ["Rest", "Take 2 tablets daily"], "specialty": "Cardiologist", "reason": "fine"}')
    res = assess(A, symptoms=["abdominal_pain"], duration="4_7d", severity="moderate").json()["result"]
    assert res["level"] == 2 and res["ai"]["used"] is True
    text = str(res)
    assert "95%" not in text and "malaria" not in text and "500 mg" not in text and "tablets" not in text.replace("tablets or", "")
    assert "Viral illness" in res["possible_explanations"]


def test_ai_can_raise_urgency_and_failures_fall_back(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(symptoms, "_call_llm", lambda s, u: '{"level": 3, "summary": "needs care", "possible_explanations": [], "self_care": [], "specialty": "", "reason": ""}')
    res = assess(A, symptoms=["runny_nose"], duration="under_1d").json()["result"]
    assert res["level"] == 3 and res["emergency"]["show"] and res["self_care"] == []

    def boom(s, u):
        raise RuntimeError("provider down")
    monkeypatch.setattr(symptoms, "_call_llm", boom)
    res = assess(A, symptoms=["runny_nose"], duration="under_1d").json()["result"]
    assert res["level"] == 1 and res["ai"] == {"used": False, "status": "error"}
    monkeypatch.setattr(symptoms, "_call_llm", lambda s, u: "not json at all")
    res = assess(A, symptoms=["runny_nose"], duration="under_1d").json()["result"]
    assert res["ai"]["status"] == "invalid_output" and res["level"] == 1


def test_ai_is_never_called_for_emergencies(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    called = []
    monkeypatch.setattr(symptoms, "_call_llm", lambda s, u: called.append(1) or "{}")
    assert assess(A, symptoms=["cough"], red_flags=["rf_stroke"]).json()["result"]["level"] == 3
    assert called == []


def test_assessment_rate_limit():
    F = make_user("fran@example.com")
    appmod._hits.clear()
    codes = [assess(F, symptoms=["cough"]).status_code for _ in range(31)]
    assert codes[:30] == [201] * 30 and codes[30] == 429
    appmod._hits.clear()


# ---------- wellness ----------
def test_wellness_respects_filters_and_saves_privately():
    body = {"diet": "veg", "allergies": ["peanut", "milk"], "avoid": ["Dal"], "budget_tier": 1, "goal": "energy", "save": True}
    r = c.post("/api/wellness/generate", headers=A, json=body)
    assert r.status_code == 201 and r.json()["saved_id"]
    foods = {i["food"] for m in r.json()["plan"]["meals"] for i in m["items"] if i.get("food")}
    assert not foods & {"Roasted peanuts", "Curd / milk", "Dal", "Egg", "Fish curry"}
    assert "not a substitute for a dietitian" in r.json()["plan"]["disclaimer"]
    assert c.get("/api/wellness", headers=A).json()["latest"]["id"] == r.json()["saved_id"]
    assert c.get("/api/wellness", headers=B).json()["latest"] is None
    assert c.delete(f"/api/wellness/history/{r.json()['saved_id']}", headers=B).status_code == 404
    assert c.post("/api/wellness/generate", headers=A, json={**body, "allergies": ["kiwi"]}).status_code == 422
    assert c.post("/api/wellness/generate", headers=A, json={**body, "avoid": ["Pizza"]}).status_code == 422


def test_wellness_condition_gets_professional_note():
    p = c.post("/api/wellness/generate", headers=A, json={"diet": "non", "conditions": ["diabetes"], "goal": "sugar"}).json()["plan"]
    assert p["needs_professional"] and "doctor or a dietitian" in p["professional_note"]
    assert "cure" in p["disclaimer"]


# ---------- profile and history ----------
def test_profile_update_validation_and_history():
    P = make_user("pam@example.com")
    r = c.patch("/api/profile", headers=P, json={"name": "Pam <b>", "language": "hi", "units": "imperial", "tracked": ["bp", "steps"], "step_goal": 6000, "birth_year": 1990})
    assert r.status_code == 200 and r.json()["language"] == "hi" and r.json()["tracked"] == ["bp", "steps"] and "<" not in r.json()["name"]
    assert c.patch("/api/profile", headers=P, json={"tracked": ["pulse"]}).status_code == 422
    assert c.patch("/api/profile", headers=P, json={"step_goal": 5}).status_code == 422
    assert c.patch("/api/profile", headers=P, json={"birth_year": 1800}).status_code == 422
    c.post("/api/health-records", headers=P, json={"kind": "heart_rate", "value": 80})
    assess(P, symptoms=["cough"])
    kinds = {i["type"] for i in c.get("/api/history", headers=P).json()["items"]}
    assert {"record", "assessment", "activity"} <= kinds
    assert c.get("/api/history", headers=A).json()["items"] != c.get("/api/history", headers=P).json()["items"]


# ---------- admin portal ----------
def test_admin_login_and_normal_login_separation():
    assert c.post("/api/auth/login", json={"email": "admin@demo.local", "password": "demo-only"}).status_code == 403
    assert c.post("/api/admin/login", json={"email": "alice@example.com", "password": PW}).status_code == 401
    assert c.post("/api/admin/login", json={"email": "admin@demo.local", "password": "wrong"}).status_code == 401
    assert c.post("/api/admin/login", json={"email": "nobody@x.com", "password": "wrong"}).status_code == 401
    appmod._hits.clear()
    assert c.get("/api/admin/me", headers=admin_headers()).json()["role"] == "admin"


def test_normal_users_and_anonymous_cannot_use_admin_endpoints():
    paths = ["/api/admin/me", "/api/admin/overview", "/api/admin/active-users", "/api/admin/activity", "/api/admin/system-health",
             "/api/admin/users", "/api/admin/settings", "/api/admin/audit-logs", "/api/admin/announcements", "/api/admin/content"]
    for p in paths:
        assert c.get(p).status_code == 401, p
        assert c.get(p, headers=A).status_code == 403, p
    assert c.patch("/api/admin/settings", headers=A, json={"ai_enabled": False}).status_code == 403
    assert c.patch("/api/admin/users/1/status", headers=A, json={"status": "suspended"}).status_code == 403
    assert c.post("/api/admin/announcements", headers=A, json={"title": "x", "body": "y"}).status_code == 403
    assert c.post("/api/admin/logout", headers=A).status_code == 403


def test_forged_or_tampered_tokens_do_not_grant_admin():
    import base64, json, hmac, hashlib
    tampered = A["Authorization"].split(" ")[1]
    p, sig = tampered.split(".")
    d = json.loads(base64.urlsafe_b64decode(p))
    d["role"] = "admin"
    p2 = base64.urlsafe_b64encode(json.dumps(d).encode()).decode()
    assert c.get("/api/admin/overview", headers={"Authorization": f"Bearer {p2}.{sig}"}).status_code == 401
    # a validly signed token for a normal user with role=admin is still refused: role comes from the database and needs an admin session
    forged = appmod.make_token(1, "admin")
    assert c.get("/api/admin/overview", headers={"Authorization": "Bearer " + forged}).status_code == 403
    u_token = appmod.make_token(2, "admin")
    assert c.get("/api/admin/overview", headers={"Authorization": "Bearer " + u_token}).status_code == 403


def test_admin_overview_uses_real_counts_and_no_private_data():
    H = admin_headers()
    o = c.get("/api/admin/overview", headers=H).json()
    assert o["total_users"] >= 7 and o["administrators"] >= 1 and o["assessments"] >= 1 and o["health_records"] >= 1
    assert o["daily_active_users"] >= 1 and "active_sessions" in o and "definitions" in o
    import json
    blob = json.dumps(o) + json.dumps(c.get("/api/admin/activity", headers=H).json()) + json.dumps(c.get("/api/admin/active-users", headers=H).json())
    for secret in ["alice@example.com", "dry cough", "Alice", "passwor", "Authorization", "Bearer"]:
        assert secret not in blob, secret
    users = c.get("/api/admin/users", headers=H).json()
    assert all("pw" not in u and "password" not in u for u in users)


def test_active_sessions_follow_logins_logout_and_expiry():
    H = admin_headers()
    G = make_user("gina@example.com")
    live = c.get("/api/admin/active-users", headers=H).json()
    assert live["count"] >= 1 and all(len(i["who"]) == 8 for i in live["items"])
    before = c.get("/api/admin/overview", headers=H).json()["active_sessions"]
    assert c.post("/api/auth/logout", headers=G).status_code == 200
    assert c.get("/api/profile", headers=G).status_code == 401   # logged-out token stops working
    after = c.get("/api/admin/overview", headers=H).json()["active_sessions"]
    assert after == before - 1
    # an idle session drops out of the live count without being counted as online
    K = make_user("kim@example.com")
    now_live = c.get("/api/admin/overview", headers=H).json()["active_sessions"]
    cc = appmod.db()
    cc.execute("UPDATE user_sessions SET last_seen=? WHERE user_id=(SELECT id FROM users WHERE email='kim@example.com')", (time.time() - 3600,))
    cc.commit()
    cc.close()
    assert c.get("/api/admin/overview", headers=H).json()["active_sessions"] == now_live - 1


def test_admin_session_logout_and_idle_timeout():
    H = admin_headers()
    assert c.post("/api/admin/logout", headers=H).status_code == 200
    assert c.get("/api/admin/me", headers=H).status_code == 401
    H2 = admin_headers()
    cc = appmod.db()
    cc.execute("UPDATE user_sessions SET last_seen=? WHERE kind='admin' AND ended_at IS NULL", (time.time() - appmod.ADMIN_IDLE_SECONDS - 60,))
    cc.commit()
    cc.close()
    assert c.get("/api/admin/me", headers=H2).status_code == 401


def test_admin_user_management_audit_and_last_admin_guard():
    global A
    H = admin_headers()
    target = c.get("/api/admin/users?q=alice", headers=H).json()
    assert len(target) == 1
    uid = target[0]["id"]
    assert c.patch(f"/api/admin/users/{uid}/status", headers=H, json={"status": "suspended"}).status_code == 200
    assert c.post("/api/auth/login", json={"email": "alice@example.com", "password": PW}).status_code == 403
    assert c.get("/api/profile", headers=A).status_code == 401  # their live session was ended
    assert c.patch(f"/api/admin/users/{uid}/status", headers=H, json={"status": "active"}).status_code == 200
    assert c.patch(f"/api/admin/users/{uid}/status", headers=H, json={"status": "bogus"}).status_code == 422
    assert c.patch("/api/admin/users/99999/status", headers=H, json={"status": "active"}).status_code == 404
    me = c.get("/api/admin/me", headers=H).json()["uid"]
    assert c.patch(f"/api/admin/users/{me}/status", headers=H, json={"status": "suspended"}).status_code == 400
    logs = c.get("/api/admin/audit-logs?limit=100", headers=H).json()
    actions = [l["action"] for l in logs["items"]]
    assert "set_status:suspended" in actions and "set_status:active" in actions and any(a == "admin_login" for a in actions)
    assert any(l["outcome"] == "failed" for l in logs["items"] if l["action"] == "admin_login")
    assert all(l["admin"] is None or len(l["admin"]) == 8 for l in logs["items"])
    import json
    assert "demo-only" not in json.dumps(logs) and "Bearer" not in json.dumps(logs)
    # alice signs back in so later tests still work
    A = make_user_login("alice@example.com")


def make_user_login(email):
    r = c.post("/api/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 200
    return {"Authorization": "Bearer " + r.json()["token"]}


def test_admin_settings_validation_and_effect():
    H = admin_headers()
    s = c.get("/api/admin/settings", headers=H).json()["settings"]
    assert s["registration_open"] is True and s["default_step_goal"] == 8000
    assert c.patch("/api/admin/settings", headers=H, json={}).status_code == 422
    assert c.patch("/api/admin/settings", headers=H, json={"default_step_goal": 5}).status_code == 422
    assert c.patch("/api/admin/settings", headers=H, json={"registration_open": False}).status_code == 200
    appmod._hits.clear()
    assert c.post("/api/auth/register", json={"email": "late@example.com", "password": PW}).status_code == 403
    assert c.patch("/api/admin/settings", headers=H, json={"registration_open": True}).status_code == 200
    assert c.patch("/api/admin/settings", headers=H, json={"symptom_checker_enabled": False}).status_code == 200
    assert assess(A, symptoms=["cough"]).status_code == 503
    assert c.patch("/api/admin/settings", headers=H, json={"symptom_checker_enabled": True}).status_code == 200
    assert assess(A, symptoms=["cough"]).status_code == 201
    acts = [l["action"] for l in c.get("/api/admin/audit-logs?limit=100", headers=H).json()["items"]]
    assert any(a.startswith("update_setting:registration_open=False") for a in acts)


def test_announcements_and_content_management():
    H = admin_headers()
    r = c.post("/api/admin/announcements", headers=H, json={"title": "Water camp", "body": "Free check-up on Sunday", "level": "info"})
    assert r.status_code == 201
    assert any(i["title"] == "Water camp" for i in c.get("/api/announcements", headers=A).json()["items"])
    assert c.patch(f"/api/admin/announcements/{r.json()['id']}?active=false", headers=H).status_code == 200
    assert all(i["title"] != "Water camp" for i in c.get("/api/announcements", headers=A).json()["items"])
    assert c.post("/api/admin/announcements", headers=H, json={"title": "", "body": "x"}).status_code == 422
    k = c.post("/api/admin/content", headers=H, json={"title": "Wash hands", "body": "Wash with soap for 20 seconds."}).json()["id"]
    assert any(i["id"] == k for i in c.get("/api/content", headers=A).json()["items"])
    assert c.delete(f"/api/admin/content/{k}", headers=H).status_code == 200


def test_system_health_reports_real_state():
    h = c.get("/api/admin/system-health", headers=admin_headers()).json()
    assert h["database"] == "ok" and h["ai"]["configured"] is False and "errors_24h" in h


def test_public_health_still_works_and_cors_not_wildcard():
    assert c.get("/api/health").json()["database"] == "ok"
    r = c.options("/api/profile", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert r.headers.get("access-control-allow-origin") != "*"


# ---------- find a doctor ----------
def test_facility_directory_needs_source_and_is_admin_only():
    H = admin_headers()
    good = {"name": "Sample Health Centre", "type": "phc", "district": "Ranchi", "address": "Main road", "phone": "0651 123456",
            "hours": "9am to 4pm", "source": "District health office list", "verified_on": "2026-10-01"}
    assert c.post("/api/admin/facilities", headers=A, json=good).status_code == 403
    assert c.post("/api/admin/facilities", headers=H, json={**good, "source": ""}).status_code == 422
    assert c.post("/api/admin/facilities", headers=H, json={**good, "verified_on": "yesterday"}).status_code == 422
    assert c.post("/api/admin/facilities", headers=H, json={**good, "verified_on": "2999-01-01"}).status_code == 422
    assert c.post("/api/admin/facilities", headers=H, json={**good, "phone": "call me <now>"}).status_code == 422
    fid = c.post("/api/admin/facilities", headers=H, json=good).json()["id"]
    got = c.get("/api/facilities?district=ranchi", headers=A).json()
    assert got["total"] == 1 and got["items"][0]["source"] == "District health office list" and got["districts"] == ["Ranchi"]
    assert c.get("/api/facilities?q=nothing-here", headers=A).json()["total"] == 0
    assert c.delete(f"/api/admin/facilities/{fid}", headers=A).status_code == 403
    assert c.delete(f"/api/admin/facilities/{fid}", headers=H).status_code == 200


def test_care_contacts_are_private():
    r = c.post("/api/care-contacts", headers=A, json={"name": "Dr Rao", "kind": "doctor", "phone": "98765 43210", "note": "Tuesday clinic"})
    assert r.status_code == 201
    cid = r.json()["id"]
    assert [i["name"] for i in c.get("/api/care-contacts", headers=A).json()["items"]] == ["Dr Rao"]
    assert c.get("/api/care-contacts", headers=B).json()["items"] == []
    assert c.delete(f"/api/care-contacts/{cid}", headers=B).status_code == 404
    assert c.post("/api/care-contacts", headers=A, json={"name": "x", "phone": "abc"}).status_code == 422
    assert c.delete(f"/api/care-contacts/{cid}", headers=A).status_code == 200
