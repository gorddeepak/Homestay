# EazyInvites 🏡

EazyInvites is a full-stack accommodation booking platform inspired by Airbnb.
It lets people list, discover, and review unique stays, with an AI concierge
named **Mira** who can search listings, compare prices, and summarize reviews.

The current stack is a React single-page app backed by FastAPI. The previous
Express/EJS application has been removed; all active code lives in `frontend/`
and `backend/`.

## ✨ Features

- Browse stays by location, country, price, and category
- Listing detail pages with maps, owner information, and reviews
- Account signup, login, and logout with signed HTTP-only cookies
- Create, edit, and delete listings with Cloudinary image uploads
- Star ratings and review CRUD with author-only editing and deletion
- Mira concierge: streaming chat grounded in the live listing and review data
- AI description generator and natural-language listing search
- Responsive brand UI with a floating Mira button and person-icon account menu

## 🛠️ Tech Stack

- Frontend: React 19, Vite, React Router, Tailwind CSS, shadcn/Radix
- Backend: FastAPI, Pydantic, Pydantic AI, Uvicorn
- Database: MongoDB via PyMongo
- Auth: signed JWT cookies, PBKDF2 hashes compatible with existing users
- Images: Cloudinary uploads; seeded local images served by FastAPI
- Maps: MapLibre GL JS + MapTiler
- AI: Google Gemini
- Tests: pytest for the API, Vite production build for the frontend

## 🚀 Quick Start

Full instructions, including environment variables and troubleshooting, are in
[docs/RUNNING.md](docs/RUNNING.md).

### 1. Backend

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

Copy `backend/.env.example` to `backend/.env` and fill in `ATLAS_DB_URL`,
`AUTH_JWT_SECRET`, and any provider keys you want to use.

### 2. Frontend

```bash
cd frontend
npm install
```

### 3. Seed sample data (optional, destructive)

```bash
cd backend
python -m scripts.seed
```

This clears the `reviews`, `listings`, `users`, and stale `sessions`
collections, then inserts 10 demo users, 49 listings, and their reviews.

Demo login: `alice_travels` / `Password123`

### 4. Run

**Terminal 1 — API**

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**Terminal 2 — React app**

```bash
cd frontend
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` and `/images` to the FastAPI
server on port 8000.

## 📁 Project Structure

```text
.
├── backend/
│   ├── app/                 # FastAPI routes, auth, AI, listings, reviews
│   ├── scripts/             # Python database seeder and seed data
│   ├── static/images/       # Seeded local listing images served at /images
│   ├── tests/               # pytest suite
│   └── requirements.txt
├── frontend/
│   ├── public/              # Brand assets, favicons, hero image
│   └── src/                 # React app, components, pages, API client
├── docs/                    # Run guide and engineering reports
└── .github/workflows/ci.yml # Backend tests + frontend build
```

## 🧪 Tests

```bash
cd backend
.\.venv\Scripts\python.exe -m pytest -q

cd frontend
npm run build
```

The backend suite uses a disposable loopback MongoDB database and blocks
outbound provider calls. CI runs the same checks on every push and pull request.

## 🤖 AI Notes

- `POST /api/ai/chat` streams Mira's reply as server-sent events.
- `POST /api/ai/generate-description` drafts listing copy.
- `POST /api/listings/ai-search` extracts structured filters from free text.
- Mira's tools read live listings and reviews from MongoDB.
- Gemini can take 15–25 seconds on a cold request. The UI shows
  “Mira is thinking…” while it waits.

## 🔐 Configuration

Only `backend/.env` is used. Copy `backend/.env.example` and set:

- `ATLAS_DB_URL` — MongoDB connection string, including the database name
- `AUTH_JWT_SECRET` — at least 32 characters
- `AUTH_ALLOWED_ORIGINS` — browser origins allowed to make auth requests
- `CLOUD_NAME`, `CLOUD_API_KEY`, `CLOUD_API_SECRET` — optional image uploads
- `MAPTILER_API_KEY` — optional maps and geocoding
- `GEMINI_API_KEY` — optional Mira and AI features

Never commit `backend/.env` or provider secrets.
