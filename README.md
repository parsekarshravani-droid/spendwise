# SpendWise — Personal Expense Analyzer

React + Vite frontend · Flask REST API · PostgreSQL. Frontend and backend deploy independently.

```
spendwise/
├─ backend/   app.py models.py routes.py analytics.py insights.py seed.py
│             migrations/ tests/ requirements.txt render.yaml .env.example
└─ frontend/  src/{App,api,ui}.jsx src/pages/* netlify.toml .env.example
```

## What is real, and what is "AI"
- Every figure (balances, budgets, trends, reports) is computed by the API from rows in your database.
- **Insights** are deterministic rules (savings rate, category spikes, outliers vs. your own 6-month history for that category, budget pressure, possible recurring charges, above-average discretionary spending). Each carries its evidence in the API response. They are *not* labelled AI.
- **AI summary** appears only when `ANTHROPIC_API_KEY` is set on the server. It sends aggregated totals and the rule-based insights (no transaction titles or notes) to the Anthropic API and shows the model name beside the result. With no key, the button is hidden and the endpoint returns 503.
- `seed.py` creates clearly-labelled sample data ("Sample data" in notes). Nothing is hardcoded in the UI.

## Run locally (Windows CMD)
Prerequisites: Python 3.11+, Node 20+, PostgreSQL 14+.

```bat
:: 1. Database
psql -U postgres -c "CREATE DATABASE spendwise;"

:: 2. Backend (window 1)
cd spendwise\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
notepad .env
flask db upgrade
python seed.py
flask run --port 5000

:: 3. Frontend (window 2)
cd spendwise\frontend
npm install
npm run dev
```
Open http://localhost:5173. In `.env`, set `DATABASE_URL=postgresql://postgres:YOURPASSWORD@localhost:5432/spendwise`.
Tests: `cd spendwise\backend && .venv\Scripts\activate && python -m pytest tests -q`.
Skip PostgreSQL for a quick try by leaving `DATABASE_URL` unset (falls back to a local SQLite file).

## Database schema (managed by Flask-Migrate / Alembic)
| transactions | | budgets | |
|---|---|---|---|
| id PK | | id PK | |
| title varchar(120) | | category varchar(40) | |
| amount numeric(12,2) CHECK > 0 | | month char `YYYY-MM` | |
| category varchar(40) idx | | amount numeric(12,2) CHECK > 0 | |
| type `income`/`expense` CHECK | | UNIQUE(category, month) | |
| date date idx · notes varchar(500) · created_at | | | |

Change models, then: `flask db migrate -m "msg"` and `flask db upgrade`.

## API (all under `/api`, JSON; errors are `{"error": "...", "fields": {...}}`)
| Method & path | Purpose |
|---|---|
| GET `/health`, `/meta` | Liveness (checks DB); categories + `ai_available` |
| GET `/dashboard?month=YYYY-MM` | Totals, vs-previous-month change, 6-month series, category split, recent, budgets |
| GET `/transactions` | `q, type, category, start, end, sort(date\|amount\|title\|category), order, page, per_page` |
| POST / PUT `/transactions[/id]` | Body: `title, amount, category, date, type, notes`. 422 with per-field errors |
| DELETE `/transactions/id` | 204 |
| GET `/transactions/export` | CSV honouring the same filters; formula-injection safe |
| POST `/transactions/import` | multipart `file`; columns `title,amount,category,date,type[,notes]`; valid rows imported, bad rows reported by row number |
| GET `/budgets?month=` · POST · PUT `/budgets/id` · DELETE | Budgets with `spent, remaining, pct, status` (`ok`/`warning` ≥80%/`over`). Duplicate category+month → 409 |
| GET `/analytics?period=week\|month\|year` | Income vs expenses series + current-vs-previous category comparison |
| GET `/analytics/report.csv?period=` | Downloadable report |
| GET `/insights?month=` | Rule-based insights with evidence |
| POST `/insights/ai-summary?month=` | Optional model-written summary (503 if not configured) |

## Deploy

**1. PostgreSQL** — create a database on Neon, Supabase, or Render Postgres and copy its connection string (add `?sslmode=require` if the provider needs it).

**2. Flask API on Render** (needs a persistent Python service, so not Netlify)
1. Push this repo to GitHub → Render → *New → Blueprint* (uses `backend/render.yaml`), or create a Web Service manually with root `backend`, build `pip install -r requirements.txt && flask db upgrade`, start `gunicorn app:app --bind 0.0.0.0:$PORT`.
2. Set env vars: `DATABASE_URL`, `CORS_ORIGINS=https://YOUR-SITE.netlify.app` (exact origin, no trailing slash; comma-separate extras), optional `ANTHROPIC_API_KEY`.
3. Check `https://YOUR-API.onrender.com/api/health` returns `{"status":"ok"}`.
4. Optional demo data: run `python seed.py` in the Render shell.

**3. Frontend on Netlify**
1. *Add new site → Import from Git*. Base directory `frontend`; build `npm run build`; publish `dist` (already in `netlify.toml`, which also provides SPA fallback routing).
2. *Site configuration → Environment variables*: `VITE_API_BASE_URL=https://YOUR-API.onrender.com` (no `/api`, no trailing slash). Optional `VITE_CURRENCY` / `VITE_LOCALE`.
3. Deploy. The production build **fails on purpose** if `VITE_API_BASE_URL` is missing, so a site can never ship pointing nowhere. After changing the variable, trigger a redeploy (Vite bakes it in at build time).
4. Add the final Netlify URL to the API's `CORS_ORIGINS` and redeploy the API.

Render's free tier sleeps when idle; the first request may take ~30–60 s.

## Known limitations
- **No user accounts.** The API is single-tenant: anyone who knows the API URL can read and write its data. Use it with demo data, or add authentication (e.g. Flask-JWT-Extended or a provider such as Auth0/Clerk) and a `user_id` on both tables before storing real finances. A secret in a Vite bundle would not protect it, so none is used.
- Analytics aggregate in Python after date-range queries: fine for personal volumes (thousands of rows), not for millions.
- Single currency per deployment (`VITE_CURRENCY`).
