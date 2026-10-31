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

In production, `AUTH_ALLOWED_ORIGINS` must list the frontend origin exactly.
The same list drives CORS and the trusted-origin auth check, so a missing
origin fails both preflight and state-changing requests. For the custom-domain
deployment:

```env
AUTH_ALLOWED_ORIGINS=https://eazyinvites.in
```

During temporary Render testing, add the Static Site hostname too:

```env
AUTH_ALLOWED_ORIGINS=https://eazyinvites.in,https://eazyinvites-web.onrender.com
```

The API runs at `https://api.eazyinvites.in`. The frontend and API are different
origins but share the `eazyinvites.in` registrable domain, so the auth cookie
stays host-only on the API, `SameSite=Lax`, and `Secure` in production. Full
authentication testing requires these custom domains: two separate
`*.onrender.com` hostnames are cross-site because `onrender.com` is on the
Public Suffix List.

The database name stays `homestay` so existing data continues to work. Any root
`.env` left over from the Express app is ignored and can be deleted.

## 3. Configure the frontend

The frontend reads `VITE_API_URL` at build time. Set it to the FastAPI origin
without a trailing slash and without `/api`:

```env
VITE_API_URL=https://api.eazyinvites.in
```

Set this in the Render Static Site's build environment before `npm run build`.
Leave it unset for local development: the app then calls relative `/api` and
`/images` URLs, and Vite proxies both to `http://127.0.0.1:8000`.

API requests use `credentials: "include"` so the browser sends the HTTP-only
auth cookie to the API origin.

## 4. Seed the database (optional, destructive)

From `backend/`, with the virtual environment active:

```bash
python -m scripts.seed
```

The seeder clears `reviews`, `listings`, `users`, and stale `sessions`
collections before inserting sample data. It creates demo users such as
`alice_travels` with password `Password123`.

## 5. Start the two apps

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

Open http://localhost:5173. With `VITE_API_URL` unset, Vite proxies `/api` and
`/images` to FastAPI on port 8000.

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
- The frontend resolves backend-relative image paths such as
  `/images/manali.png` against `VITE_API_URL`. Absolute Cloudinary URLs are left
  unchanged.
- In production, serve `/images` from the API origin (or a CDN) and set
  `VITE_API_URL` to that origin.

## Tests and build

```bash
# FastAPI tests (requires local MongoDB)
cd backend
.\.venv\Scripts\python.exe -m pytest -q

# React production build
cd frontend
npm run build
```

For a production build that talks to the deployed API:

```bash
cd frontend
VITE_API_URL=https://api.eazyinvites.in npm run build
```

On Windows PowerShell:

```powershell
cd frontend
$env:VITE_API_URL="https://api.eazyinvites.in"; npm run build
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
- **Listings or Mira fail with a CORS error** — the same
  `AUTH_ALLOWED_ORIGINS` list drives CORS. Add the exact frontend origin,
  restart FastAPI, and rebuild the frontend if `VITE_API_URL` changed.
- **Login succeeds but the session does not persist** — use the custom domains
  `https://eazyinvites.in` and `https://api.eazyinvites.in`. Two separate
  `*.onrender.com` hostnames are cross-site, and the auth cookie is
  `SameSite=Lax`.
- **Images fail to upload** — set the three `CLOUD_*` values in `backend/.env`
  and restart FastAPI.
- **Seeded images return 404** — make sure FastAPI is running on port 8000 and
  `backend/static/images/` is present. In production, confirm the frontend was
  built with `VITE_API_URL` set to the API origin.
- **Map or geocoding errors** — set `MAPTILER_API_KEY` in `backend/.env`.
- **Frontend cannot reach the API** — make sure FastAPI is running on port 8000
  and Vite is running on port 5173.
