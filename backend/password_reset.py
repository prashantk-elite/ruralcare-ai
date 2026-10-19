"""Forgotten-password recovery that needs no email service.

How it works
1. The person asks for a reset on the sign-in page. The answer is always the same message, so the form never reveals
   which emails have accounts.
2. An administrator sees the request in the Admin Portal, confirms who the person is by their own means (for example
   in class), and issues a one-time reset code. The code is shown to the administrator once and only its hash is stored.
3. The person enters the code and a new password. The code works once, expires after 30 minutes and locks after 5 wrong
   tries. A successful reset ends every open session for that account.

Administrator accounts cannot use this flow (they are reset on the server with create_admin.py)."""
import hashlib, hmac, secrets, time
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, Field

M = None
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O/1/I/L, so a code is easy to read aloud
CODE_TTL = 1800
MAX_TRIES = 5
GENERIC = "If an account with that email exists, an administrator can now see your request. Ask them for your reset code."
BAD_CODE = "That code is not valid or has expired. Ask the administrator for a new one."


def _init():
    c = M.db()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS password_resets(id INTEGER PRIMARY KEY, user_id INTEGER, status TEXT, requested_at REAL,
        issued_at REAL, expires_at REAL, code_hash TEXT, attempts INTEGER, issued_by INTEGER, used_at REAL);
    CREATE INDEX IF NOT EXISTS ix_pr_user ON password_resets(user_id, status)
    """)
    c.commit()
    c.close()


def _norm(code: str) -> str:
    return "".join(ch for ch in (code or "").upper() if ch.isalnum())


def _hash(code: str) -> str:
    return hmac.new(M.SECRET, b"reset:" + _norm(code).encode(), hashlib.sha256).hexdigest()


def _new_code() -> str:
    raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(10))
    return raw[:5] + "-" + raw[5:]


class ForgotIn(BaseModel):
    email: str = Field(min_length=3, max_length=120)


class ResetIn(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    code: str = Field(min_length=4, max_length=30)
    new_password: str = Field(min_length=10, max_length=100)


def register(app, m):
    global M
    M = m
    _init()
    admin = M.need("admin")

    @app.post("/api/auth/forgot")
    def forgot(b: ForgotIn, request: Request):
        email = b.email.strip().lower()
        ip = M._ip(request)
        M.throttle("forgot_ip", ip, 10, 3600)
        M.throttle("forgot_email", email, 3, 3600)
        M.record("forgot_ip", ip)
        M.record("forgot_email", email)
        c = M.db()
        u = c.execute("SELECT id, role, status FROM users WHERE email=?", (email,)).fetchone()
        if u and u["role"] != "admin" and (u["status"] or "active") == "active":
            now = time.time()
            open_ = c.execute("SELECT id, status, expires_at FROM password_resets WHERE user_id=? AND status IN ('requested','issued') "
                              "ORDER BY id DESC LIMIT 1", (u["id"],)).fetchone()
            if open_ and open_["status"] == "requested":
                c.execute("UPDATE password_resets SET requested_at=? WHERE id=?", (now, open_["id"]))
            elif not open_ or (open_["expires_at"] or 0) < now:
                c.execute("INSERT INTO password_resets(user_id,status,requested_at,attempts) VALUES(?,'requested',?,0)", (u["id"], now))
            c.commit()
            M.log_event("password_reset_requested", u["id"])
        c.close()
        return {"ok": True, "message": GENERIC}

    @app.post("/api/auth/reset")
    def reset(b: ResetIn, request: Request):
        email = b.email.strip().lower()
        ip = M._ip(request)
        M.throttle("reset_ip", ip, 15, 900)
        M.throttle("reset_email", email, 8, 900)
        c = M.db()
        u = c.execute("SELECT id, role, status FROM users WHERE email=?", (email,)).fetchone()
        r = None
        if u and u["role"] != "admin" and (u["status"] or "active") == "active":
            r = c.execute("SELECT * FROM password_resets WHERE user_id=? AND status='issued' ORDER BY id DESC LIMIT 1", (u["id"],)).fetchone()
        now = time.time()
        if not r or (r["expires_at"] or 0) < now:
            c.close()
            M.record("reset_ip", ip)
            M.record("reset_email", email)
            raise HTTPException(400, BAD_CODE)
        if not hmac.compare_digest(_hash(b.code), r["code_hash"] or ""):
            tries = (r["attempts"] or 0) + 1
            c.execute("UPDATE password_resets SET attempts=?, status=? WHERE id=?", (tries, "locked" if tries >= MAX_TRIES else "issued", r["id"]))
            c.commit()
            c.close()
            M.record("reset_ip", ip)
            M.record("reset_email", email)
            M.log_event("password_reset_failed", u["id"])
            raise HTTPException(400, BAD_CODE)
        c.execute("UPDATE users SET pw=? WHERE id=?", (M.hash_pw(b.new_password), u["id"]))
        c.execute("UPDATE password_resets SET status='used', used_at=?, code_hash=NULL WHERE id=?", (now, r["id"]))
        c.commit()
        c.close()
        M.end_user_sessions(u["id"])
        M.audit(u["id"], "password_reset", "user", u["id"])
        M.log_event("password_reset_done", u["id"])
        return {"ok": True, "message": "Your password has been changed. Sign in with your new password."}

    # ---- administrator side ----
    @app.get("/api/admin/reset-requests")
    def list_requests(u=Depends(admin)):
        now = time.time()
        c = M.db()
        rows = c.execute("SELECT p.id, p.status, p.requested_at, p.issued_at, p.expires_at, p.user_id, x.email FROM password_resets p "
                         "JOIN users x ON x.id=p.user_id WHERE p.status IN ('requested','issued','locked') ORDER BY p.requested_at DESC LIMIT 50").fetchall()
        c.close()
        items = []
        for r in rows:
            st = r["status"]
            if st == "issued" and (r["expires_at"] or 0) < now:
                st = "expired"
            items.append({"id": r["id"], "user_id": r["user_id"], "email": r["email"], "status": st, "requested_at": r["requested_at"],
                          "issued_at": r["issued_at"], "expires_at": r["expires_at"]})
        return {"items": items, "code_minutes": CODE_TTL // 60}

    def _issue(c, uid, admin_id, request_id=None):
        code, now = _new_code(), time.time()
        if request_id:
            c.execute("UPDATE password_resets SET status='issued', issued_at=?, expires_at=?, code_hash=?, attempts=0, issued_by=? WHERE id=?",
                      (now, now + CODE_TTL, _hash(code), admin_id, request_id))
            rid = request_id
        else:
            c.execute("UPDATE password_resets SET status='dismissed' WHERE user_id=? AND status IN ('requested','issued')", (uid,))
            cur = c.execute("INSERT INTO password_resets(user_id,status,requested_at,issued_at,expires_at,code_hash,attempts,issued_by) VALUES(?,?,?,?,?,?,0,?)",
                            (uid, "issued", now, now, now + CODE_TTL, _hash(code), admin_id))
            rid = cur.lastrowid
        c.commit()
        M.audit(admin_id, "password_reset_code_issued", "user", uid)
        return {"id": rid, "code": code, "expires_at": now + CODE_TTL, "minutes": CODE_TTL // 60}

    @app.post("/api/admin/reset-requests/{rid}/issue")
    def issue(rid: int, u=Depends(admin)):
        c = M.db()
        r = c.execute("SELECT p.id, p.user_id, p.status, x.role, x.status AS ustatus FROM password_resets p JOIN users x ON x.id=p.user_id WHERE p.id=?", (rid,)).fetchone()
        if not r or r["status"] not in ("requested", "issued", "locked"):
            c.close()
            raise HTTPException(404, "Request not found")
        if r["role"] == "admin" or (r["ustatus"] or "active") != "active":
            c.close()
            raise HTTPException(409, "This account cannot be reset from here")
        out = _issue(c, r["user_id"], u["uid"], rid)
        c.close()
        return out

    @app.post("/api/admin/reset-requests/{rid}/dismiss")
    def dismiss(rid: int, u=Depends(admin)):
        c = M.db()
        r = c.execute("SELECT id, user_id FROM password_resets WHERE id=? AND status IN ('requested','issued','locked')", (rid,)).fetchone()
        if not r:
            c.close()
            raise HTTPException(404, "Request not found")
        c.execute("UPDATE password_resets SET status='dismissed', code_hash=NULL WHERE id=?", (rid,))
        c.commit()
        c.close()
        M.audit(u["uid"], "password_reset_dismissed", "user", r["user_id"])
        return {"dismissed": True}

    @app.post("/api/admin/users/{uid}/reset-code")
    def reset_code_for_user(uid: int, u=Depends(admin)):
        c = M.db()
        t = c.execute("SELECT id, role, status FROM users WHERE id=?", (uid,)).fetchone()
        if not t:
            c.close()
            raise HTTPException(404, "User not found")
        if t["role"] == "admin" or (t["status"] or "active") != "active":
            c.close()
            raise HTTPException(409, "This account cannot be reset from here")
        out = _issue(c, uid, u["uid"])
        c.close()
        return out
