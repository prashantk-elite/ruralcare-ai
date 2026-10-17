"""Transparent rule-based nutrition engine. No nutrient values or prices are invented:
cost is a relative tier (1 low .. 3 higher) and nutrient data is reported as unavailable
until a verified reference (e.g. IFCT 2017) is loaded into FOODS."""
FOODS = [
    {"n": "Rice", "g": "Cereal", "t": 1, "d": "veg", "al": []},
    {"n": "Whole-wheat roti", "g": "Cereal", "t": 1, "d": "veg", "al": ["gluten"]},
    {"n": "Ragi / millet roti", "g": "Cereal", "t": 1, "d": "veg", "al": []},
    {"n": "Dal", "g": "Pulse", "t": 1, "d": "veg", "al": []},
    {"n": "Chana", "g": "Pulse", "t": 1, "d": "veg", "al": []},
    {"n": "Roasted peanuts", "g": "Pulse", "t": 1, "d": "veg", "al": ["peanut"]},
    {"n": "Seasonal vegetable sabzi", "g": "Vegetable", "t": 1, "d": "veg", "al": []},
    {"n": "Leafy greens (saag)", "g": "Vegetable", "t": 1, "d": "veg", "al": []},
    {"n": "Seasonal fruit", "g": "Fruit", "t": 2, "d": "veg", "al": []},
    {"n": "Curd / milk", "g": "Dairy", "t": 2, "d": "veg", "al": ["milk"]},
    {"n": "Egg", "g": "Animal protein", "t": 2, "d": "egg", "al": ["egg"]},
    {"n": "Fish curry", "g": "Animal protein", "t": 3, "d": "non", "al": ["fish"]},
]
MEALS = [("Breakfast", ["Cereal", "Pulse|Animal protein|Dairy", "Fruit"]),
         ("Lunch", ["Cereal", "Pulse", "Vegetable"]),
         ("Evening snack", ["Pulse|Fruit", "Dairy|Fruit"]),
         ("Dinner", ["Cereal", "Vegetable", "Pulse|Animal protein"])]


def allowed(f, diet, budget, allergies, available):
    diet_ok = diet == "non" or (diet == "egg" and f["d"] != "non") or (diet == "veg" and f["d"] == "veg")
    return (diet_ok and f["t"] <= budget and not set(f["al"]) & set(allergies)
            and (available is None or f["n"] in available))


def recommend(diet="veg", budget=2, allergies=(), available=None):
    allergies = [a.lower() for a in allergies]
    used, plan = {}, []
    for meal, slots in MEALS:
        items = []
        for slot in slots:
            groups = slot.split("|")
            cand = [f for f in FOODS if f["g"] in groups and allowed(f, diet, budget, allergies, available)]
            cand.sort(key=lambda f: (used.get(f["n"], 0), f["t"], f["n"]))
            if not cand:
                items.append({"slot": slot, "food": None, "note": "No suitable option with current filters"})
                continue
            f = cand[0]
            used[f["n"]] = used.get(f["n"], 0) + 1
            items.append({"slot": slot, "food": f["n"], "group": f["g"], "cost_tier": f["t"],
                          "nutrient_data": "Nutritional data unavailable",
                          "reason": "Matches diet preference, availability, budget tier and allergy filter",
                          "alternatives": [c["n"] for c in cand[1:3]]})
        plan.append({"meal": meal, "items": items})
    return {"engine_version": "rules-0.1", "plan": plan,
            "disclaimer": "Educational suggestion, not a record of food eaten or medical nutrition therapy."}
