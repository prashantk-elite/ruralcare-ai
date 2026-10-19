"""Personal health records. Every query is scoped to the signed-in owner; other users' records are never reachable.

Values are stored in one canonical unit (kg, cm, mg/dL, ml) after conversion, so charts and BMI stay consistent.
Nothing here measures anything automatically: every record is entered by the user and labelled with its source."""
import json, math, time
from typing import Optional, Literal
from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, Field
import account

M = None  # the main module, set by register()
KINDS = account.KINDS
DAILY_LATEST = ("steps", "sleep")   # one value per day: the most recent entry for that day
DAILY_SUM = ("water",)              # entries add up through the day
LB_TO_KG, IN_TO_CM, MMOL_TO_MGDL = 0.45359237, 2.54, 18.016
BMI_NOTE = ("Adult BMI (age 18+) is a screening number, not a diagnosis. It does not suit children, pregnancy, "
            "or very muscular people. WHO categories are shown; for people of South Asian origin health risk can "
            "start at a lower BMI, so ask a health professional how to read your result.")


def bmi_category(b):
    if b < 18.5:
        return "Underweight range"
    if b < 25:
        return "Normal weight range"
    if b < 30:
        return "Overweight range"
    return "Obesity range"


def display(r):
    k, v1, v2, v3 = r["kind"], r["value1"], r["value2"], r["value3"]
    f = lambda x: ("%g" % round(x, 1))
    if k == "bp":
        return f"{f(v1)}/{f(v2)} mmHg"
    if k == "heart_rate":
        return f"{f(v1)} bpm"
    if k == "steps":
        return f"{int(v1):,} steps"
    if k == "weight":
        return f"{f(v1)} kg"
    if k == "bmi":
        return f"BMI {v1:.2f} ({f(v2)} kg, {f(v3)} cm)"
    if k == "sleep":
        return f"{f(v1)} h sleep"
    if k == "water":
        return f"{int(v1)} ml water"
    if k == "glucose":
        return f"{f(v1)} mg/dL"
    return ""


def shape(row):
    r = dict(row)
    k = r["kind"]
    o = {"id": r["id"], "kind": k, "recorded_at": r["recorded_at"], "created_at": r.get("created_at"),
         "source": r.get("source") or "manual", "note": r.get("note") or "", "unit": r.get("unit"),
         "context": r.get("context"), "display": display(r)}
    if k == "bp":
        o.update(systolic=r["value1"], diastolic=r["value2"])
    elif k == "bmi":
        o.update(bmi=r["value1"], weight_kg=r["value2"], height_cm=r["value3"], category=bmi_category(r["value1"]))
    else:
        o["value"] = r["value1"]
    return o


class RecordIn(BaseModel):
    kind: Literal["bp", "heart_rate", "steps", "weight", "bmi", "sleep", "water", "glucose"]
    recorded_at: Optional[float] = None          # epoch seconds; defaults to now
    value: Optional[float] = None                # bpm, steps, weight, hours, water, glucose
    unit: Optional[str] = Field(None, max_length=10)
    systolic: Optional[float] = None
    diastolic: Optional[float] = None
    height: Optional[float] = None
    height_unit: Optional[Literal["cm", "in"]] = "cm"
    weight: Optional[float] = None
    weight_unit: Optional[Literal["kg", "lb"]] = "kg"
    context: Optional[Literal["fasting", "random", "post-meal", "bedtime"]] = None
    source: Literal["manual", "device"] = "manual"
    note: Optional[str] = Field(None, max_length=300)


def _num(x, name):
    if x is None or not isinstance(x, (int, float)) or not math.isfinite(x):
        raise ValueError(f"Enter a number for {name}")
    return float(x)


def normalize(b, now):
    """Validate a record and convert it to canonical units. Raises ValueError with a plain-language message."""
    if b.source != "manual":
        raise ValueError("Importing from a device is not available yet. Please enter the value yourself.")
    t = b.recorded_at if b.recorded_at is not None else now
    if not math.isfinite(t) or t > now + 300:
        raise ValueError("The date and time cannot be in the future")
    if t < now - 10 * 365 * 86400:
        raise ValueError("The date is too far in the past")
    k, ctx = b.kind, None
    v1 = v2 = v3 = None
    unit = None
    if k == "bp":
        s, d = _num(b.systolic, "systolic pressure"), _num(b.diastolic, "diastolic pressure")
        if not 50 <= s <= 260 or not 30 <= d <= 160 or d >= s:
            raise ValueError("Check the blood pressure: systolic should be 50 to 260, diastolic 30 to 160, and diastolic must be lower than systolic")
        v1, v2, unit = round(s), round(d), "mmHg"
    elif k == "heart_rate":
        v = _num(b.value, "heart rate")
        if not 25 <= v <= 250:
            raise ValueError("Heart rate should be between 25 and 250 beats per minute")
        v1, unit = round(v), "bpm"
    elif k == "steps":
        v = _num(b.value, "steps")
        if v != int(v) or not 0 <= v <= 100000:
            raise ValueError("Steps must be a whole number between 0 and 100,000")
        v1, unit = int(v), "steps"
    elif k == "weight":
        v = _num(b.value, "weight")
        kg = v * LB_TO_KG if (b.unit or "kg") == "lb" else v
        if (b.unit or "kg") not in ("kg", "lb"):
            raise ValueError("Weight unit must be kg or lb")
        if not 20 <= kg <= 350:
            raise ValueError("Weight looks unrealistic. Check the number and the unit")
        v1, unit = round(kg, 1), "kg"
    elif k == "bmi":
        h, w = _num(b.height, "height"), _num(b.weight, "weight")
        cm = h * IN_TO_CM if b.height_unit == "in" else h
        kg = w * LB_TO_KG if b.weight_unit == "lb" else w
        if not 100 <= cm <= 230:
            raise ValueError("Height should be between 100 and 230 cm (39 to 91 inches)")
        if not 20 <= kg <= 350:
            raise ValueError("Weight looks unrealistic. Check the number and the unit")
        v1, v2, v3, unit = round(kg / (cm / 100) ** 2, 2), round(kg, 1), round(cm, 1), "kg/m2"  # 2 decimals so the category never flips from rounding
    elif k == "sleep":
        v = _num(b.value, "hours slept")
        if not 0.5 <= v <= 24:
            raise ValueError("Hours slept should be between 0.5 and 24")
        v1, unit = round(v, 1), "hours"
    elif k == "water":
        v = _num(b.value, "water")
        if (b.unit or "ml") not in ("ml", "l"):
            raise ValueError("Water unit must be ml or l")
        ml = v * 1000 if (b.unit or "ml") == "l" else v
        if not 10 <= ml <= 10000:
            raise ValueError("Water for one entry should be between 10 ml and 10 litres")
        v1, unit = round(ml), "ml"
    elif k == "glucose":
        v = _num(b.value, "glucose")
        u = b.unit or "mg/dL"
        if u not in ("mg/dL", "mmol/L"):
            raise ValueError("Glucose unit must be mg/dL or mmol/L")
        mg = v * MMOL_TO_MGDL if u == "mmol/L" else v
        if not 20 <= mg <= 800:
            raise ValueError("Glucose looks unrealistic. Check the number and the unit")
        if b.context is None:
            raise ValueError("Say when it was measured: fasting, random, after a meal, or at bedtime")
        v1, unit, ctx = round(mg, 1), "mg/dL", b.context
    return {"t": t, "v1": v1, "v2": v2, "v3": v3, "unit": unit, "context": ctx,
            "note": account.clean_text(b.note, 300) or None}


def _init():
    c = M.db()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS health_records(id INTEGER PRIMARY KEY, user_id INTEGER, kind TEXT, value1 REAL, value2 REAL,
        value3 REAL, unit TEXT, context TEXT, source TEXT, note TEXT, recorded_at REAL, created_at REAL, updated_at REAL);
    CREATE INDEX IF NOT EXISTS ix_hr_user_kind_time ON health_records(user_id, kind, recorded_at)
    """)
    c.commit()
    c.close()


def _range(days, start, end, now):
    end = end if end is not None else now + 300
    start = start if start is not None else end - days * 86400
    if start > end:
        raise HTTPException(422, "The start date must be before the end date")
    return start, end


def register(app, m):
    global M
    M = m
    _init()

    def own(rid, uid, c):
        r = c.execute("SELECT * FROM health_records WHERE id=? AND user_id=?", (rid, uid)).fetchone()
        if not r:
            c.close()
            raise HTTPException(404, "Record not found")
        return r

    @app.get("/api/health-records")
    def list_records(u=Depends(M.user), kind: Optional[str] = None, start: Optional[float] = None, end: Optional[float] = None,
                     limit: int = Query(25, ge=1, le=200), offset: int = Query(0, ge=0)):
        if kind is not None and kind not in KINDS:
            raise HTTPException(422, "Unknown measurement type")
        where, args = "user_id=?", [u["uid"]]
        if kind:
            where += " AND kind=?"
            args.append(kind)
        if start is not None:
            where += " AND recorded_at>=?"
            args.append(start)
        if end is not None:
            where += " AND recorded_at<=?"
            args.append(end)
        c = M.db()
        total = c.execute("SELECT COUNT(*) n FROM health_records WHERE " + where, tuple(args)).fetchone()["n"]
        rows = c.execute("SELECT * FROM health_records WHERE " + where + " ORDER BY recorded_at DESC, id DESC LIMIT ? OFFSET ?",
                         tuple(args) + (limit, offset)).fetchall()
        c.close()
        return {"items": [shape(r) for r in rows], "total": total, "limit": limit, "offset": offset}

    @app.post("/api/health-records", status_code=201)
    def add_record(b: RecordIn, u=Depends(M.user)):
        M.throttle("hrec", u["uid"], 200, 3600)
        now = time.time()
        try:
            n = normalize(b, now)
        except ValueError as e:
            raise HTTPException(422, str(e))
        M.record("hrec", u["uid"])
        c = M.db()
        cur = c.execute("INSERT INTO health_records(user_id,kind,value1,value2,value3,unit,context,source,note,recorded_at,created_at,updated_at) "
                        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                        (u["uid"], b.kind, n["v1"], n["v2"], n["v3"], n["unit"], n["context"], "manual", n["note"], n["t"], now, now))
        c.commit()
        row = c.execute("SELECT * FROM health_records WHERE id=?", (cur.lastrowid,)).fetchone()
        c.close()
        prof = account.get_profile(u["uid"])
        if b.kind not in prof["tracked"]:  # recording something means the person wants to track it
            account._save(u["uid"], tracked=json.dumps(prof["tracked"] + [b.kind]))
        M.log_event("record_created", u["uid"])
        return shape(row)

    @app.patch("/api/health-records/{rid}")
    def edit_record(rid: int, b: RecordIn, u=Depends(M.user)):
        c = M.db()
        old = own(rid, u["uid"], c)
        if b.kind != old["kind"]:
            c.close()
            raise HTTPException(422, "The measurement type cannot be changed. Delete this record and add a new one.")
        now = time.time()
        try:
            n = normalize(b, now)
        except ValueError as e:
            c.close()
            raise HTTPException(422, str(e))
        c.execute("UPDATE health_records SET value1=?,value2=?,value3=?,unit=?,context=?,note=?,recorded_at=?,updated_at=? WHERE id=? AND user_id=?",
                  (n["v1"], n["v2"], n["v3"], n["unit"], n["context"], n["note"], n["t"], now, rid, u["uid"]))
        c.commit()
        row = c.execute("SELECT * FROM health_records WHERE id=? AND user_id=?", (rid, u["uid"])).fetchone()
        c.close()
        return shape(row)

    @app.delete("/api/health-records/{rid}")
    def delete_record(rid: int, u=Depends(M.user)):
        c = M.db()
        own(rid, u["uid"], c)
        c.execute("DELETE FROM health_records WHERE id=? AND user_id=?", (rid, u["uid"]))
        c.commit()
        c.close()
        return {"deleted": True}

    @app.delete("/api/health-records")
    def delete_all_records(u=Depends(M.user), confirm: str = "", kind: Optional[str] = None):
        """Delete the signed-in user's own records (all of them, or one measurement type)."""
        if confirm != "yes":
            raise HTTPException(422, "Add confirm=yes to delete records")
        if kind is not None and kind not in KINDS:
            raise HTTPException(422, "Unknown measurement type")
        c = M.db()
        if kind:
            n = c.execute("DELETE FROM health_records WHERE user_id=? AND kind=?", (u["uid"], kind)).rowcount
        else:
            n = c.execute("DELETE FROM health_records WHERE user_id=?", (u["uid"],)).rowcount
        c.commit()
        c.close()
        return {"deleted": n}

    @app.get("/api/health-records/series")
    def series(kind: str, u=Depends(M.user), days: int = Query(30, ge=1, le=730), start: Optional[float] = None, end: Optional[float] = None):
        """Chart data built only from the user's saved records. Days without a record are simply absent."""
        if kind not in KINDS:
            raise HTTPException(422, "Unknown measurement type")
        now = time.time()
        lo, hi = _range(days, start, end, now)
        kinds = ("weight", "bmi") if kind == "weight" else (kind,)
        c = M.db()
        marks = ",".join("?" for _ in kinds)
        rows = c.execute(f"SELECT * FROM health_records WHERE user_id=? AND kind IN ({marks}) AND recorded_at>=? AND recorded_at<=? "
                         "ORDER BY recorded_at ASC, id ASC", (u["uid"], *kinds, lo, hi)).fetchall()
        c.close()
        prof = account.get_profile(u["uid"])
        pts = []
        if kind in DAILY_LATEST or kind in DAILY_SUM:
            by = {}
            for r in rows:
                d = M.day_str(r["recorded_at"])
                if kind in DAILY_SUM:
                    by[d] = (r["recorded_at"], by.get(d, (0, 0))[1] + r["value1"])
                else:
                    by[d] = (r["recorded_at"], r["value1"])
            pts = [{"t": t, "day": d, "v": v} for d, (t, v) in by.items()]
        elif kind == "bp":
            pts = [{"t": r["recorded_at"], "v": r["value1"], "v2": r["value2"]} for r in rows]
        elif kind == "weight":
            pts = [{"t": r["recorded_at"], "v": r["value1"] if r["kind"] == "weight" else r["value2"]} for r in rows]
        elif kind == "bmi":
            pts = [{"t": r["recorded_at"], "v": r["value1"], "v2": r["value2"]} for r in rows]
        elif kind == "glucose":
            pts = [{"t": r["recorded_at"], "v": r["value1"], "context": r["context"]} for r in rows]
        else:
            pts = [{"t": r["recorded_at"], "v": r["value1"]} for r in rows]
        goal = prof["step_goal"] if kind == "steps" else prof["water_goal_ml"] if kind == "water" else None
        return {"kind": kind, "start": lo, "end": hi, "points": pts, "goal": goal,
                "unit": {"bp": "mmHg", "heart_rate": "bpm", "steps": "steps", "weight": "kg", "bmi": "kg/m2", "sleep": "hours", "water": "ml", "glucose": "mg/dL"}[kind],
                "aggregation": "daily total" if kind in DAILY_SUM else "latest entry per day" if kind in DAILY_LATEST else "each reading"}

    @app.get("/api/health-records/summary")
    def summary(u=Depends(M.user)):
        uid, now = u["uid"], time.time()
        prof = account.get_profile(uid)
        today = M.day_str(now)
        c = M.db()
        latest, counts = {}, {}
        for k in KINDS:
            r = c.execute("SELECT * FROM health_records WHERE user_id=? AND kind=? ORDER BY recorded_at DESC, id DESC LIMIT 1", (uid, k)).fetchone()
            latest[k] = shape(r) if r else None
            counts[k] = c.execute("SELECT COUNT(*) n FROM health_records WHERE user_id=? AND kind=?", (uid, k)).fetchone()["n"]
        w = c.execute("SELECT kind, value1, value2, recorded_at FROM health_records WHERE user_id=? AND kind IN ('weight','bmi') "
                      "ORDER BY recorded_at DESC, id DESC LIMIT 1", (uid,)).fetchone()
        recent_rows = c.execute("SELECT * FROM health_records WHERE user_id=? AND recorded_at>=? ORDER BY recorded_at DESC LIMIT 400",
                                (uid, now - 8 * 86400)).fetchall()
        recent = c.execute("SELECT * FROM health_records WHERE user_id=? ORDER BY recorded_at DESC, id DESC LIMIT 6", (uid,)).fetchall()
        stamp = c.execute("SELECT MAX(updated_at) m, COUNT(*) n FROM health_records WHERE user_id=?", (uid,)).fetchone()
        c.close()
        done_today, steps_today, water_today, sleep_today, sleeps = set(), None, 0, None, {}
        latest_step_ts = latest_sleep_ts = 0
        for r in recent_rows:
            d = M.day_str(r["recorded_at"])
            if r["kind"] == "sleep" and (d not in sleeps or r["recorded_at"] > sleeps[d][0]):
                sleeps[d] = (r["recorded_at"], r["value1"])
            if d != today:
                continue
            kk = r["kind"] if r["kind"] != "bmi" else "bmi"
            done_today.add(kk)
            if r["kind"] == "bmi":
                done_today.add("weight")
            if r["kind"] == "steps" and r["recorded_at"] >= latest_step_ts:
                steps_today, latest_step_ts = int(r["value1"]), r["recorded_at"]
            if r["kind"] == "water":
                water_today += r["value1"]
            if r["kind"] == "sleep" and r["recorded_at"] >= latest_sleep_ts:
                sleep_today, latest_sleep_ts = r["value1"], r["recorded_at"]
        week = [v for d, (_, v) in sleeps.items() if d >= M.day_str(now - 6 * 86400)]
        tracked = prof["tracked"]
        return {
            "tracked": tracked, "goals": {"steps": prof["step_goal"], "water_ml": prof["water_goal_ml"]},
            "latest": latest, "counts": counts,
            "latest_weight": ({"kg": w["value1"] if w["kind"] == "weight" else w["value2"], "recorded_at": w["recorded_at"]} if w else None),
            "today": {"steps": steps_today, "water_ml": int(water_today) if "water" in done_today else None, "sleep_hours": sleep_today},
            "completion": {"done": sorted(k for k in tracked if k in done_today), "total": len(tracked)},
            "week_avg_sleep": round(sum(week) / len(week), 1) if week else None, "week_sleep_days": len(week),
            "recent": [shape(r) for r in recent], "total_records": stamp["n"],
            "last_updated": stamp["m"], "bmi_note": BMI_NOTE,
            "data_note": "Every value on this page was typed in by you. RuralCare AI does not read steps, heart rate, blood pressure, sleep or glucose from any device.",
        }
