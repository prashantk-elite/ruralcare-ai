"""Create or reset an administrator account from the server side. There is no public admin sign-up.

Usage (run on the server, or locally against the same database):
    python create_admin.py you@example.com
The password is typed at a hidden prompt, so it never appears in your shell history or in any file.
Alternatively set ADMIN_EMAIL and ADMIN_PASSWORD (10+ characters) in the server's environment and restart:
the first administrator is created automatically if that email does not exist yet."""
import getpass, sys, time
import main as app_main


def run(email, password):
    email = email.strip().lower()
    if "@" not in email:
        raise SystemExit("Enter a valid email address")
    if len(password) < 10:
        raise SystemExit("The password must be at least 10 characters")
    c = app_main.db()
    row = c.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
    if row:
        c.execute("UPDATE users SET pw=?, role='admin', status='active' WHERE id=?", (app_main.hash_pw(password), row["id"]))
        action = "updated"
    else:
        c.execute("INSERT INTO users(email,pw,role,status,created_at) VALUES(?,?,'admin','active',?)",
                  (email, app_main.hash_pw(password), time.time()))
        action = "created"
    c.commit()
    c.close()
    print(f"Administrator {email} {action}. Sign in at /admin/login.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    pw = getpass.getpass("New administrator password (hidden): ")
    if pw != getpass.getpass("Repeat the password: "):
        raise SystemExit("The passwords did not match")
    run(sys.argv[1], pw)
