# RuralCare AI (educational research prototype)
Not a medical device. Demo/synthetic data only. No diagnoses, no medication advice.

## Layout
- `backend/`  FastAPI API (auth, roles, participants, consent, screenings, assess, nutrition, community analytics, audit)
- `ml/`       `train.py` trains Logistic Regression / Decision Tree / Random Forest, saves real held-out metrics
- `tests/`    pytest suite
- Frontend prototype: the published `ruralcare-ai.html` page (single file, synthetic data)

## Run locally
```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
# 1) Train. Real run: download the Pima Indians Diabetes CSV (check its licence on the source page), then
cd ml && python train.py --data diabetes.csv           # or: python train.py --synthetic (demo only)
# 2) API
cd ../backend && cp ../.env.example .env && uvicorn main:app --reload     # docs at http://localhost:8000/docs
# 3) Tests (run from project root)
cd .. && pytest -q
```
Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (min 10 chars) to create the owner admin; sample accounts are then not created.

## Behaviour you can show in the viva
- `assess` returns "Research model not yet validated" if no model exists or it was trained on synthetic data.
- Real score only when a model trained on a real dataset exists AND glucose and diastolic BP were measured.
- Admin and researcher get 403 on participant records; community counts under `MIN_GROUP_SIZE` are suppressed.

## Deploy
1. Push to GitHub (never commit `.env`, `*.db`).
2. Backend on Render: root `backend`, build `pip install -r requirements.txt`, start
   `uvicorn main:app --host 0.0.0.0 --port $PORT`; set env vars from `.env.example`. SQLite resets on free tiers:
   for persistence move to Supabase/PostgreSQL.
3. Copy `ml/models/*` into the repo (or build step) so `MODEL_DIR` finds them.
4. Frontend on Vercel/Netlify; set `CORS_ORIGINS` on the backend to its URL.

## Known gaps
No React frontend wired to this API yet, no Hindi, no chatbot, no SHAP (permutation importance used), SQLite instead of
PostgreSQL, token auth is a minimal HMAC scheme (use Supabase Auth or JWT library for production).

## Presentation workflow (5 minutes)
1. Open the web prototype: dashboard (DEMO DATA badge) -> screening with an impossible value (rejected) -> nutrition with a peanut allergy.
2. Switch to Hindi, ask the Guide about BMI, then type "chest pain" to show the urgent-help response.
3. Research Lab: load `ml/models/metrics.json` and explain the metrics and the limits.
4. API docs at `/docs`: log in as worker, then as researcher to show the 403 on participant records.

## Frontend (React + TypeScript + Vite)
```bash
cd frontend && cp .env.example .env && npm install && npm run dev      # http://localhost:5173 (API must run on :8000)
npm run build                                                          # type-checks and builds to dist/
```
Deploy `frontend/` to Vercel; set `VITE_API_URL` to the Render API URL and add the Vercel URL to `CORS_ORIGINS`.
Optional: `cd ml && python extras.py --data diabetes.csv` (small neural network; add `pip install shap` for SHAP).

## Documentation
`docs/ARCHITECTURE.md` (architecture + ER diagrams), `docs/ML_METHODOLOGY.md`, `docs/ETHICS_AND_LIMITATIONS.md`.

## Current feature list
Landing page, role-based login, dashboard with privacy-suppressed charts, participant registry and profile (consent withdrawal, deletion),
3-step screening wizard, research assessment (labelled unvalidated unless trained on a real dataset), 7-day nutrition planner with allergy/diet/
budget filters, anonymous nutrition feedback and insights, follow-ups with calendar/agenda/list, Research Lab (evaluation, importance, comparison, report),
admin (health checks, users with role change and suspend, model versions, privacy), help, notifications, English/Hindi (labels and headings).

## Known gaps
SQLite (not PostgreSQL), minimal token authentication, no password-reset flow, the AI assistant is untested against the live Gemini service in CI (mocked), Hindi covers labels not long text,
no verified food-composition or price data yet, no model trained on real data until you run `ml/train.py` with the dataset.

## Open sign-up and its limits
Anyone can create an account (`POST /api/auth/register`). New accounts are always the limited `participant` role (nutrition planner, guide, help). Only an
admin can promote someone to `worker` (participant and screening records), `researcher` or `admin`. Registration (5/hour per IP) and failed logins (10 per 10 min)
are rate limited. Set `DEMO_PASSWORD` on the server to change the seeded demo accounts' password.
Before real users or real data: use a permanent PostgreSQL database (accounts reset on free hosting), verify email addresses, add password reset, and get institutional approval.

## Permanent database (recommended for a public link)
Set `DATABASE_URL` to a PostgreSQL connection string (e.g. a free Supabase or Neon project, using its IPv4 "session pooler" URI). Tables are created automatically.
Check it with `python backend/check_db.py`. Without `DATABASE_URL` the app uses a SQLite file, which free hosts reset on every restart.
Owner admin: `ADMIN_EMAIL`, `ADMIN_PASSWORD`. Optional: `SEED_DEMO_USERS=1` to also create sample worker/researcher/admin accounts.

## Health platform update (dashboard, symptom checker, wellness, admin portal)
**New for users:** sidebar with Health Dashboard, Symptom Checker, Health Records, Diet and Wellness, Health History, Find a Doctor, Profile and Settings. All health values are typed in by the user (no device integration). Records are private to their owner.
**Symptom checker:** fixed emergency rules run first and never wait for AI. Optional AI wording needs `ANTHROPIC_API_KEY`; it can only raise urgency. Not a diagnosis.
**Admin Portal:** `/admin/login` (no public admin sign-up) then `/admin/dashboard`: real aggregate counts, verified live sessions, user management, settings, announcements, system/AI status, audit log. Administrators never see individual health data.
**First admin:** set `ADMIN_EMAIL` and `ADMIN_PASSWORD` on the server, or run `python backend/create_admin.py you@example.com` (hidden password prompt).
**Database:** new tables are created automatically on start (SQLite or PostgreSQL). See `.env.example` for variables (placeholders only).
**Tests:** `python -m pytest tests -q` from the project root. **Build:** `cd frontend && npm ci && npm run build`.
**Limits:** tokens are kept in memory, so a page reload asks you to sign in again; rate limits reset on restart; the facility directory ships empty (admins add verified entries); not a medical device and no formal privacy review.

## Forgot password (no email service needed)
Sign-in page → Forgot password → the person requests a code. An administrator sees the request under Admin Portal → Users → Password reset requests, confirms the person's identity, and creates a one-time code (30 minutes, 5 tries, single use; only its hash is stored). The person enters the code and a new password, and every open session for that account is ended. Administrators can also create a code for any non-admin user from the Users list. Administrator accounts are reset on the server with `python backend/create_admin.py you@example.com`.


## AI assistant (Google Gemini)

The Guide page can answer free-text questions with Gemini. It is optional and off until a key is set.

1. Create an API key in Google AI Studio.
2. In Render, add environment variables `GEMINI_API_KEY` (the key) and, if you want, `GEMINI_MODEL`
   (default `gemini-3.5-flash-lite`; check current names in Google AI Studio). Never put the key in the frontend or in git.
3. Redeploy. Admin Portal > System shows the provider, model and recent status. Admin > Settings can switch AI off at any time.

Safety: emergency wording and medicine/dose questions are answered by fixed rules and never sent to the AI; emails and phone
numbers are removed from what is sent; no health records, name or email are sent; replies are filtered (no percentages, doses,
diagnoses, links); each user is limited to 4 questions a minute and 20 an hour; any failure falls back to the approved-answers Guide.
The same key also powers the optional wording layer of the Symptom Checker (it can only raise urgency, never lower it).
