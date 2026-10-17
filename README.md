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
Demo logins (password `demo-only`): admin@demo.local, worker@demo.local, researcher@demo.local.
Change `APP_SECRET` and remove demo users before any real use.

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
