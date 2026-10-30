# Running EazyInvites

The repository contains two apps that share one MongoDB database:

| App | Folder | Default URL |
| --- | --- | --- |
| React frontend | `frontend/` | http://localhost:5173 |
| FastAPI backend + Mira | `backend/` | http://127.0.0.1:8000 |

The old Express/EJS application has been removed. `backend/.env` is the only
environment file the running app reads.

## Prerequisites

- Node.js 22
- Python 3.13
- MongoDB running locally, or a MongoDB Atlas connection string
- Optional provider accounts: Cloudinary (uploads), MapTiler (maps), Google
  Gemini (AI)

## 1. Install dependencies

Frontend:

```bash
cd frontend
npm install
```

Backend:

```bash
cd backend
python -m venv .venv
```

Windows:

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

macOS/Linux:

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

Use `requirements-dev.txt` instead if you also want to run the backend tests.

## 2. Configure the backend

Copy `backend/.env.example` to `backend/.env` and fill it in:

```env
ENVIRONMENT=development
ATLAS_DB_URL=mongodb://127.0.0.1:27017/homestay

AUTH_JWT_SECRET=replace-with-at-least-32-characters
AUTH_COOKIE_SECURE=false
AUTH_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

CLOUD_NAME=
CLOUD_API_KEY=
CLOUD_API_SECRET=

MAPTILER_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_TIMEOUT_SECONDS=45
```

Generate a JWT secret with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

If Vite starts on port `5174` because `5173` is busy, add
`http://localhost:5174` and `http://127.0.0.1:5174` to
`AUTH_ALLOWED_ORIGINS` as well.

The database name stays `homestay` so existing data continues to work. Any root
`.env` left over from the Express app is ignored and can be deleted.

## 3. Seed the database (optional, destructive)

From `backend/`, with the virtual environment active:

```bash
python -m scripts.seed
```

The seeder clears `reviews`, `listings`, `users`, and stale `sessions`
collections before inserting sample data. It creates demo users such as
`alice_travels` with password `Password123`.

## 4. Start the two apps

Use two terminals from the repository root.

**Terminal 1 — FastAPI backend**

Windows:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

macOS/Linux:

```bash
cd backend
source .venv/bin/activate
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**Terminal 2 — React frontend**

```bash
cd frontend
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` and `/images` to FastAPI on
port 8000.

## Useful URLs

- React app: http://localhost:5173
- FastAPI docs: http://127.0.0.1:8000/docs
- FastAPI health: http://127.0.0.1:8000/api/health
- Seeded listing images: http://127.0.0.1:8000/images/manali.png

## Images

- New uploads go to Cloudinary and are stored as `{url, filename}` on the
  listing.
- Seeded local images live in `backend/static/images/` and are served by
  FastAPI at `/images/*`.
- The React hero image lives in `frontend/public/images/hero-homestay.jpg` and
  is bundled with the frontend.
- In production, either serve `/images` from the same origin as the API or put
  the files on a CDN.

## Tests and build

```bash
# FastAPI tests (requires local MongoDB)
cd backend
.\.venv\Scripts\python.exe -m pytest -q

# React production build
cd frontend
npm run build
```

CI runs the backend suite, checks the seeder compiles, builds the frontend, and
checks for whitespace errors.

## Troubleshooting

- **Mira does not answer immediately** — Gemini can take 15–25 seconds on a
  cold request. The panel shows “Mira is thinking…” while it waits.
- **429 from the chat** — the chat endpoint allows 5 requests per minute per IP.
  Wait a moment before retrying.
- **403 “Request origin is not allowed”** — add the exact frontend origin to
  `AUTH_ALLOWED_ORIGINS` in `backend/.env` and restart FastAPI.
- **Images fail to upload** — set the three `CLOUD_*` values in `backend/.env`
  and restart FastAPI.
- **Seeded images return 404** — make sure FastAPI is running on port 8000 and
  `backend/static/images/` is present.
- **Map or geocoding errors** — set `MAPTILER_API_KEY` in `backend/.env`.
- **Frontend cannot reach the API** — make sure FastAPI is running on port 8000
  and Vite is running on port 5173.
