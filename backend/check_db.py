"""Run: python check_db.py   (set DATABASE_URL first). Confirms the database connects, tables exist, and writes work."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import main
c = main.db()
print("Using:", "PostgreSQL" if main.DATABASE_URL else "SQLite file")
print("users:", c.execute("SELECT COUNT(*) n FROM users").fetchone()["n"])
cur = c.execute("INSERT INTO audit(actor_id,action,resource,resource_id,ts) VALUES(?,?,?,?,?)", (0, "db_check", "system", "", 0.0))
print("insert id:", cur.lastrowid)
c.execute("DELETE FROM audit WHERE action=?", ("db_check",))
c.commit(); c.close()
print("Database check OK")
