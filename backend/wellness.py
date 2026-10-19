"""Diet and wellness guidance. Reuses the existing rule-based nutrition engine (no invented nutrient values or prices).
General educational information only: no restrictive diets, no disease claims, no supplements, no medicine advice."""
import json, time
from typing import Optional, Literal
from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, Field
import account
from nutrition import FOODS, recommend

M = None  # the main module, set by register()
ALLERGENS = ["milk", "egg", "peanut", "gluten", "fish"]
GOALS = {
    "balanced": ("Eat a balanced diet", "संतुलित आहार लेना"),
    "energy": ("Feel less tired during the day", "दिन में कम थकान महसूस करना"),
    "weight_mgmt": ("Keep a healthy weight", "स्वस्थ वज़न बनाए रखना"),
    "heart": ("Look after my heart", "हृदय का ध्यान रखना"),
    "sugar": ("Look after my blood sugar", "रक्त शर्करा का ध्यान रखना"),
}
GOAL_TIPS = {
    "balanced": ["Fill about half your plate with vegetables and fruit, a quarter with whole grains or millets, and a quarter with pulses, egg, fish or dairy where you eat them."],
    "energy": ["Do not skip meals. Pair a cereal with a pulse at each main meal, and include leafy greens during the week.", "A short walk in daylight and a regular bedtime also help energy."],
    "weight_mgmt": ["Eat regular meals and fill up on vegetables and pulses.", "Keep sweet drinks and fried snacks occasional. Daily walking helps more than very strict eating."],
    "heart": ["Prefer home-cooked food with less salt and less deep-fried food.", "Include vegetables, fruit, pulses and whole grains every day."],
    "sugar": ["Choose whole grains and millets over refined cereals, and pair them with pulses and vegetables.", "Keep sweets and sweet drinks occasional, and eat meals at regular times."],
}
CONDITION_NOTE = ("Because you told us about a health condition, please speak to a doctor or a dietitian before making significant changes to what you eat. "
                  "This plan is general information and must not replace the advice or treatment you have been given.")
DISCLAIMER = ("This is general educational information, not a medical diet and not a substitute for a dietitian or qualified healthcare professional. "
              "It does not treat or cure any disease. Do not stop or change any prescribed treatment or medicine because of it.")
CONDITIONS_OK = ("diabetes", "hypertension", "heart_disease", "kidney_disease", "pregnancy", "other")


class PlanIn(BaseModel):
    diet: Literal["veg", "egg", "non"] = "veg"
    allergies: list[str] = Field(default_factory=list, max_length=10)
    avoid: list[str] = Field(default_factory=list, max_length=12)
    budget_tier: int = Field(2, ge=1, le=3)
    goal: Literal["balanced", "energy", "weight_mgmt", "heart", "sugar"] = "balanced"
    conditions: list[str] = Field(default_factory=list, max_length=8)
    day: int = Field(0, ge=0, le=6)
    save: bool = False


def _init():
    c = M.db()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS wellness_plans(id INTEGER PRIMARY KEY, user_id INTEGER, created_at REAL, title TEXT, inputs_json TEXT, plan_json TEXT);
    CREATE INDEX IF NOT EXISTS ix_wp_user_time ON wellness_plans(user_id, created_at)
    """)
    c.commit()
    c.close()


def build(b, water_goal_ml):
    if any(a not in ALLERGENS for a in b.allergies):
        raise HTTPException(422, "Unknown allergy in the list")
    names = {f["n"] for f in FOODS}
    avoid = {a.strip().lower() for a in b.avoid if a.strip()}
    unknown = [a for a in avoid if a not in {n.lower() for n in names}]
    if unknown:
        raise HTTPException(422, "Choose foods to avoid from the list")
    avail = [n for n in names if n.lower() not in avoid]
    plan = recommend(b.diet, b.budget_tier, b.allergies, avail, b.day)
    cond = [c for c in b.conditions if c in CONDITIONS_OK]
    notes = list(GOAL_TIPS[b.goal])
    if b.goal in ("heart", "sugar", "weight_mgmt") or cond:
        notes.append("Speak to a health professional about your own targets before changing your diet in a big way.")
    return {
        "engine_version": plan["engine_version"], "goal": b.goal, "goal_label": GOALS[b.goal][0],
        "day": b.day, "meals": plan["plan"],
        "hydration": f"Drink water regularly through the day. Your own goal is {water_goal_ml} ml. If a doctor has asked you to limit fluids, follow their advice instead.",
        "tips": notes, "needs_professional": bool(cond) or b.goal in ("sugar",),
        "professional_note": CONDITION_NOTE if cond else None,
        "disclaimer": DISCLAIMER,
        "nutrient_note": "Nutrient values and prices are not shown because no verified food-composition source has been loaded.",
    }


def register(app, m):
    global M
    M = m
    _init()

    @app.get("/api/wellness")
    def wellness_home(u=Depends(M.user)):
        prof = account.get_profile(u["uid"])
        c = M.db()
        r = c.execute("SELECT id, created_at, title, inputs_json, plan_json FROM wellness_plans WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 1",
                      (u["uid"],)).fetchone()
        c.close()
        return {"options": {"allergens": ALLERGENS, "foods": sorted(f["n"] for f in FOODS),
                            "goals": [{"id": k, "en": v[0], "hi": v[1]} for k, v in GOALS.items()]},
                "profile": {"diet": prof["diet_pref"], "water_goal_ml": prof["water_goal_ml"]},
                "latest": ({"id": r["id"], "created_at": r["created_at"], "title": r["title"], "inputs": json.loads(r["inputs_json"]),
                            "plan": json.loads(r["plan_json"])} if r else None),
                "disclaimer": DISCLAIMER}

    @app.post("/api/wellness/generate", status_code=201)
    def generate(b: PlanIn, u=Depends(M.user)):
        M.throttle("wellness", u["uid"], 60, 3600)
        M.record("wellness", u["uid"])
        prof = account.get_profile(u["uid"])
        plan = build(b, prof["water_goal_ml"])
        out = {"plan": plan, "saved_id": None}
        if b.save:
            c = M.db()
            title = f"{plan['goal_label']} ({'vegetarian' if b.diet == 'veg' else 'egg-inclusive vegetarian' if b.diet == 'egg' else 'non-vegetarian'})"
            cur = c.execute("INSERT INTO wellness_plans(user_id,created_at,title,inputs_json,plan_json) VALUES(?,?,?,?,?)",
                            (u["uid"], time.time(), title, json.dumps(b.model_dump()), json.dumps(plan)))
            c.commit()
            c.close()
            out["saved_id"] = cur.lastrowid
            M.log_event("wellness_saved", u["uid"])
        return out

    @app.get("/api/wellness/history")
    def wellness_history(u=Depends(M.user), limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
        c = M.db()
        total = c.execute("SELECT COUNT(*) n FROM wellness_plans WHERE user_id=?", (u["uid"],)).fetchone()["n"]
        rows = c.execute("SELECT id, created_at, title, plan_json FROM wellness_plans WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
                         (u["uid"], limit, offset)).fetchall()
        c.close()
        return {"items": [{"id": r["id"], "created_at": r["created_at"], "title": r["title"], "plan": json.loads(r["plan_json"])} for r in rows],
                "total": total, "limit": limit, "offset": offset}

    @app.delete("/api/wellness/history/{pid}")
    def wellness_delete(pid: int, u=Depends(M.user)):
        c = M.db()
        n = c.execute("DELETE FROM wellness_plans WHERE id=? AND user_id=?", (pid, u["uid"])).rowcount
        c.commit()
        c.close()
        if not n:
            raise HTTPException(404, "Plan not found")
        return {"deleted": True}
