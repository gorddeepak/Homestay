# Running EazyInvites

The repository contains three apps that share one MongoDB database:

| App | Folder | Default URL |
| --- | --- | --- |
| React frontend (current UI) | `frontend/` | http://localhost:5173 |
| FastAPI backend (current API + Mira) | `backend/` | http://127.0.0.1:8000 |
| Express/EJS app (legacy UI) | repository root | http://localhost:8080 |

You can run the React app and the legacy app side by side; both use the same
listings, users, and reviews.

## Prerequisites

- Node.js 22
- Python 3.13
- MongoDB running locally, or a MongoDB Atlas connection string
- Optional provider accounts: Cloudinary (uploads), MapTiler (maps), Google
  Gemini (AI)

## 1. Install dependencies

From the repository root:

```bash
npm install
cd frontend
npm install
cd ..
```

Create the FastAPI virtual environment:

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

## 2. Configure the Express app

Copy `env.example` to `.env` in the repository root and fill it in:

```env
ATLAS_DB_URL=mongodb://127.0.0.1:27017/homestay
SECRET=replace-with-a-long-random-session-secret

CLOUD_NAME=
CLOUD_API_KEY=
CLOUD_API_SECRET=

MAPTILER_API_KEY=
GEMINI_API_KEY=

PORT=8080
```

`ATLAS_DB_URL` is used by both `app.js` and `init/index.js`. The database name
stays `homestay` so existing data continues to work.

## 3. Configure the FastAPI backend

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

## 4. Seed the database (optional)

The seeder clears reviews, listings, and users before inserting sample data:

```bash
node init/index.js
```

It creates demo users such as `alice_travels` with password `Password123`.

## 5. Start the three apps

Use three terminals from the repository root.

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

Open http://localhost:5173. Vite proxies `/api` to the FastAPI server on port
8000 and `/images` to the Express server on port 8080.

**Terminal 3 — Express/EJS legacy app**

```bash
node app.js
```

Open http://localhost:8080.

## Useful URLs

- React app: http://localhost:5173
- Legacy EJS app: http://localhost:8080
- FastAPI docs: http://127.0.0.1:8000/docs
- FastAPI health: http://127.0.0.1:8000/api/health

## Tests and build

```bash
# Express contract tests
npm test

# FastAPI tests
cd backend
.\.venv\Scripts\python.exe -m pytest -q

# React production build
cd frontend
npm run build
```

## Troubleshooting

- **Mira does not answer immediately** — Gemini can take 15–25 seconds on a
  cold request. The panel shows “Mira is thinking…” while it waits.
- **429 from the chat** — the chat endpoint allows 5 requests per minute per IP.
  Wait a moment before retrying.
- **403 “Request origin is not allowed”** — add the exact frontend origin to
  `AUTH_ALLOWED_ORIGINS` in `backend/.env` and restart FastAPI.
- **Images fail to upload** — set the three `CLOUD_*` values in both `.env`
  files and restart both servers.
- **Map or geocoding errors** — set `MAPTILER_API_KEY` in both `.env` files.
- **Frontend cannot reach the API** — make sure FastAPI is running on port 8000
  and Vite is running on port 5173.
