"""Find a Doctor support: an administrator-curated facility directory and each user's private care contacts.
The directory ships EMPTY. Nothing is invented: every entry needs a source and the date its details were checked."""
import re, time
from typing import Optional, Literal
from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, Field
import account

M = None  # the main module, set by register()
TYPES = ["phc", "chc", "hospital", "clinic", "pharmacy", "other"]
PHONE_RE = re.compile(r"^[0-9+\-() ]{5,20}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class FacilityIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    type: Literal["phc", "chc", "hospital", "clinic", "pharmacy", "other"]
    district: str = Field(min_length=2, max_length=60)
    address: str = Field("", max_length=200)
    phone: str = Field("", max_length=20)
    hours: str = Field("", max_length=80)
    source: str = Field(min_length=3, max_length=160)      # where the details were checked
    verified_on: str = Field(min_length=10, max_length=10)  # YYYY-MM-DD
    active: bool = True


class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: Literal["doctor", "clinic", "hospital", "pharmacy", "family", "other"] = "doctor"
    phone: str = Field("", max_length=20)
    note: str = Field("", max_length=200)


def _check_facility(b):
    if b.phone and not PHONE_RE.match(b.phone):
        raise HTTPException(422, "Enter a valid phone number (digits, spaces, + and - only)")
    if not DATE_RE.match(b.verified_on):
        raise HTTPException(422, "Enter the verification date as YYYY-MM-DD")
    if b.verified_on > M.day_str():
        raise HTTPException(422, "The verification date cannot be in the future")


def _init():
    c = M.db()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS facilities(id INTEGER PRIMARY KEY, name TEXT, type TEXT, district TEXT, address TEXT, phone TEXT,
        hours TEXT, source TEXT, verified_on TEXT, active INTEGER, updated_at REAL);
    CREATE TABLE IF NOT EXISTS care_contacts(id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, kind TEXT, phone TEXT, note TEXT, created_at REAL);
    CREATE INDEX IF NOT EXISTS ix_cc_user ON care_contacts(user_id)
    """)
    c.commit()
    c.close()


def register(app, m):
    global M
    M = m
    _init()
    admin = M.need("admin")

    @app.get("/api/facilities")
    def list_facilities(u=Depends(M.user), q: str = "", type: str = "", district: str = "", limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0)):
        where, args = ["active=1"], []
        if q.strip():
            where.append("(LOWER(name) LIKE ? OR LOWER(address) LIKE ?)")
            args += ["%" + q.strip().lower()[:60] + "%"] * 2
        if type in TYPES:
            where.append("type=?")
            args.append(type)
        if district.strip():
            where.append("LOWER(district)=?")
            args.append(district.strip().lower()[:60])
        w = " WHERE " + " AND ".join(where)
        c = M.db()
        total = c.execute("SELECT COUNT(*) n FROM facilities" + w, tuple(args)).fetchone()["n"]
        rows = c.execute("SELECT id,name,type,district,address,phone,hours,source,verified_on FROM facilities" + w + " ORDER BY district, name LIMIT ? OFFSET ?",
                         tuple(args) + (limit, offset)).fetchall()
        districts = [r["district"] for r in c.execute("SELECT DISTINCT district FROM facilities WHERE active=1 ORDER BY district").fetchall()]
        c.close()
        return {"items": [dict(r) for r in rows], "total": total, "districts": districts, "types": TYPES,
                "note": "Details are entered by Arogya AI administrators from the source shown. Always call ahead, because hours and services change."}

    @app.get("/api/admin/facilities")
    def admin_list(u=Depends(admin)):
        c = M.db()
        rows = c.execute("SELECT * FROM facilities ORDER BY id DESC LIMIT 200").fetchall()
        c.close()
        return {"items": [dict(r) for r in rows]}

    @app.post("/api/admin/facilities", status_code=201)
    def admin_add(b: FacilityIn, u=Depends(admin)):
        _check_facility(b)
        c = M.db()
        cur = c.execute("INSERT INTO facilities(name,type,district,address,phone,hours,source,verified_on,active,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                        (account.clean_text(b.name, 100), b.type, account.clean_text(b.district, 60), account.clean_text(b.address, 200), b.phone.strip(),
                         account.clean_text(b.hours, 80), account.clean_text(b.source, 160), b.verified_on, int(b.active), time.time()))
        c.commit()
        c.close()
        M.audit(u["uid"], "create", "facility", cur.lastrowid, "success")
        return {"id": cur.lastrowid}

    @app.patch("/api/admin/facilities/{fid}")
    def admin_edit(fid: int, b: FacilityIn, u=Depends(admin)):
        _check_facility(b)
        c = M.db()
        n = c.execute("UPDATE facilities SET name=?,type=?,district=?,address=?,phone=?,hours=?,source=?,verified_on=?,active=?,updated_at=? WHERE id=?",
                      (account.clean_text(b.name, 100), b.type, account.clean_text(b.district, 60), account.clean_text(b.address, 200), b.phone.strip(),
                       account.clean_text(b.hours, 80), account.clean_text(b.source, 160), b.verified_on, int(b.active), time.time(), fid)).rowcount
        c.commit()
        c.close()
        if not n:
            raise HTTPException(404, "Facility not found")
        M.audit(u["uid"], "update", "facility", fid, "success")
        return {"updated": True}

    @app.delete("/api/admin/facilities/{fid}")
    def admin_delete(fid: int, u=Depends(admin)):
        c = M.db()
        n = c.execute("DELETE FROM facilities WHERE id=?", (fid,)).rowcount
        c.commit()
        c.close()
        if not n:
            raise HTTPException(404, "Facility not found")
        M.audit(u["uid"], "delete", "facility", fid, "success")
        return {"deleted": True}

    @app.get("/api/care-contacts")
    def my_contacts(u=Depends(M.user)):
        c = M.db()
        rows = c.execute("SELECT id,name,kind,phone,note,created_at FROM care_contacts WHERE user_id=? ORDER BY id DESC LIMIT 50", (u["uid"],)).fetchall()
        c.close()
        return {"items": [dict(r) for r in rows]}

    @app.post("/api/care-contacts", status_code=201)
    def add_contact(b: ContactIn, u=Depends(M.user)):
        if b.phone and not PHONE_RE.match(b.phone):
            raise HTTPException(422, "Enter a valid phone number (digits, spaces, + and - only)")
        c = M.db()
        if c.execute("SELECT COUNT(*) n FROM care_contacts WHERE user_id=?", (u["uid"],)).fetchone()["n"] >= 50:
            c.close()
            raise HTTPException(422, "You can save up to 50 contacts")
        cur = c.execute("INSERT INTO care_contacts(user_id,name,kind,phone,note,created_at) VALUES(?,?,?,?,?,?)",
                        (u["uid"], account.clean_text(b.name, 80), b.kind, b.phone.strip(), account.clean_text(b.note, 200), time.time()))
        c.commit()
        c.close()
        return {"id": cur.lastrowid}

    @app.delete("/api/care-contacts/{cid}")
    def delete_contact(cid: int, u=Depends(M.user)):
        c = M.db()
        n = c.execute("DELETE FROM care_contacts WHERE id=? AND user_id=?", (cid, u["uid"])).rowcount
        c.commit()
        c.close()
        if not n:
            raise HTTPException(404, "Contact not found")
        return {"deleted": True}
