# Phase 1 — Read-Only Listing Browsing Report

## Status

Phase 1 is implemented within its stated scope. React/Vite and FastAPI run
alongside the existing Express/EJS application, and both browse and detail
pages use real FastAPI responses backed by the existing MongoDB data.

No commit, push, deployment, production data change, or Phase 2 work was
performed.

## What was implemented

- A FastAPI application with a small lifespan-managed PyMongo client.
- Read-only endpoints for listing cards, listing detail, and database health.
- Pydantic response models that expose only public listing fields and a public
  owner subset (`id`, `username`).
- Explicit handling for malformed ObjectIds (`400`), missing listings (`404`),
  and MongoDB driver failures (`503`).
- A React/Vite frontend using React Router and Tailwind CSS.
- Browse page with hero, featured stays, category tabs, listing grid, loading
  skeletons, error/retry state, and empty states.
- Detail page with hero image, public host, description, location details,
  price, and not-found/error states.
- Image fallback for missing or failed images.
- Vite development proxies for `/api` and `/images`.
- Focused backend tests using a disposable loopback test database.
- This report and `docs/ENGINEERING_RULES.md`.

## Directory structure

```text
backend/
  app/
    __init__.py
    config.py          # backend/.env loading and ATLAS_DB_URL
    database.py        # MongoClient lifespan and get_database dependency
    listings.py        # GET /api/listings and GET /api/listings/{id}
    main.py            # FastAPI app, router, /api/health
    schemas.py         # Pydantic response models
  tests/
    conftest.py        # disposable test DB and TestClient fixtures
    test_listings.py   # API behavior and error tests
  .env.example
  pytest.ini
  requirements.txt
  requirements-dev.txt

frontend/
  index.html
  package.json
  package-lock.json
  vite.config.js
  src/
    App.jsx
    api.js
    format.js
    index.css
    main.jsx
    components/
      ListingCard.jsx
      ListingImage.jsx
    pages/
      BrowsePage.jsx
      DetailPage.jsx

docs/
  ENGINEERING_RULES.md
  PHASE_1_READONLY_REPORT.md
```

## Dependencies and why they are needed

### Backend

| Package | Version | Reason |
| --- | --- | --- |
| `fastapi` | 0.162.0 | API routing, validation, response models, dependency injection |
| `pymongo` | 4.19.0 | Official MongoDB driver; no ORM or repository layer added |
| `uvicorn` | 0.54.0 | ASGI development/production server |
| `python-dotenv` | 1.2.4 | Load configuration from `backend/.env` |
| `pydantic` | 2.14.1 (via FastAPI) | Typed response contracts |
| `pytest` | 9.1.1 (dev) | Focused backend tests |
| `httpx` | 0.28.1 (dev) | Required by FastAPI's test client |

### Frontend

| Package | Version | Reason |
| --- | --- | --- |
| `react` / `react-dom` | 19.3.1 | UI runtime |
| `react-router-dom` | 7.18.4 | Browse/detail routes and links |
| `vite` | 8.3.5 | Development server and production build |
| `@vitejs/plugin-react` | 6.1.2 | React support in Vite |
| `tailwindcss` | 4.3.3 | Approved styling direction |
| `@tailwindcss/vite` | 4.3.3 | Tailwind integration with Vite |

No axios, state-management library, UI component kit, form library, or extra
test framework was added. The frontend uses native `fetch`.

## API contract

### `GET /api/listings`

Returns a JSON array in the collection's natural order. This matches the
existing Express browse page, which loads all listings and filters categories
in the browser.

```json
[
  {
    "id": "6aa8411e32925d5a1685ad47",
    "title": "Sunlit Loft Steps from Times Square",
    "price": 14000,
    "location": "New York City",
    "country": "United States",
    "category": "Urban Oasis",
    "image_url": "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267"
  }
]
```

Optional or missing values are returned as `null`; no placeholder listing data
is fabricated. Cards intentionally omit description, owner, and reviews.

### `GET /api/listings/{listing_id}`

Returns the card fields plus description and a public owner subset.

```json
{
  "id": "6aa8411e32925d5a1685ad47",
  "title": "Sunlit Loft Steps from Times Square",
  "price": 14000,
  "location": "New York City",
  "country": "United States",
  "category": "Urban Oasis",
  "image_url": "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267",
  "description": "A stylish, exposed-brick loft in the heart of Manhattan.",
  "owner": {
    "id": "6aa8411d32925d5a1685ad38",
    "username": "bob_explorer"
  }
}
```

The owner projection fetches only `username`. Email, salt, hash, sessions, and
other private fields are never serialized. A missing owner or deleted owner
reference returns `"owner": null`.

### Errors

- `400 {"detail": "Invalid listing id"}` for malformed ObjectIds.
- `404 {"detail": "Listing not found"}` for valid but missing IDs.
- `503 {"detail": "Database unavailable"}` for PyMongo failures.
- Internal exceptions and stack traces are not returned to clients.

### `GET /api/health`

Returns `{"status": "ok"}` after a MongoDB ping, or `503` when the database is
unreachable.

## Configuration

`backend/.env` (copied from `backend/.env.example`) requires:

```dotenv
ATLAS_DB_URL=mongodb://127.0.0.1:27017/homestay
```

The database name must be included in the URI. FastAPI loads only
`backend/.env`; it does not read the repository's root `.env`, which belongs to
the Express application. This avoids accidentally using the root Atlas
configuration during local backend work.

No frontend environment variables are required. Vite proxies `/api` to
`http://127.0.0.1:8000` and `/images` to `http://127.0.0.1:8080`. No secrets are
exposed to the browser.

## Starting the applications

Backend (PowerShell, from the repository root):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
# Edit .env if the local database URI differs.
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

Frontend (separate terminal):

```powershell
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

Express remains unchanged (separate terminal, repository root):

```powershell
npm start
```

Express continues to use its existing root `.env` and port `8080`.

## Tests and verification

### Existing Node suite

Command: `npm test`

Result: 55 tests, 45 passing, 0 failing, 10 todo, exit code 0. This matches the
pre-implementation baseline. The four Phase 0 working-tree files were not
edited.

### Python tests

Command:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

Result: `10 passed, 1 warning in 1.35s`.

Coverage includes:

- List response card shape and ObjectId-to-string serialization.
- Missing/optional listing fields.
- Detail response and public owner filtering.
- Private user fields absent from list and detail responses.
- Malformed ID (`400`), missing listing (`404`).
- MongoDB driver failure (`503`) for list and detail.
- Database health endpoint.

The tests force a loopback MongoDB URI and a database name beginning with
`homestay_phase1_test_`, seed two listings and one user, then drop the database.
No production or development data is modified.

The warning is a Starlette deprecation notice about using `httpx` instead of
`httpx2` with its test client. It does not affect the test result.

### Frontend build

Command: `npm run build`

Result: success, 29 modules transformed. Production assets were emitted to
`frontend/dist` (ignored by Git).

### Live API check

Against the local `homestay` database, read-only:

- `GET /api/health` returned `{"status": "ok"}`.
- Starting FastAPI from the documented `backend/.env` (without a shell
  environment override) also returned health `200` and 49 listings.
- `GET /api/listings` returned 49 listings.
- First card keys: `id,title,price,location,country,category,image_url`.
- Detail keys added `description,owner`; owner keys were exactly `id,username`.
- Malformed ID returned `400`.
- Missing ID returned `404`.

### Browser check

- Browse page rendered 49 listing cards from the FastAPI proxy.
- Category filter: selecting Coastal Haven showed 11 cards, all in that
  category; restoring All showed the full set again.
- Detail page loaded `Sunlit Loft Steps from Times Square` from a real API
  request (`200`) and displayed host `@bob_explorer`.
- All 22 local `/images/*` assets loaded through the Vite-to-Express proxy;
  remote images loaded directly.
- Stopping FastAPI produced the error state and retry button. Restarting
  FastAPI and retrying restored all 49 cards.
- A missing listing ID displayed the not-found state with a link back to browse.
- Console errors were limited to the intentionally stopped API and the
  intentional 404 check; the successful browse and detail runs produced no
  application errors.
- Screenshot capture was unavailable because the browser tab required a visible
  desktop window. Rendering was checked through the accessibility tree, page
  text, computed layout dimensions, network status, and console output.

### Express check

With the local database override, Express started successfully:

- `GET /health` returned `{"ok": true}`.
- `GET /listings` returned `200`.
- `GET /images/dubai.png` returned `200`.

The root `.env` in this environment points to an Atlas cluster that cannot be
resolved from the current machine, so the startup check used the same local
`ATLAS_DB_URL` override rather than touching that configuration or the remote
cluster.

## Existing application preservation

- `app.js`, Express routes/controllers, EJS templates, Passport/session setup,
  Mongoose models, and existing AI code were not changed.
- `package.json` at the repository root was not changed.
- The root lockfile was not regenerated.
- The existing Express app still serves listings and local images.
- The four pre-existing modified files were preserved without edits:
  `test/helpers/environment.js`, `test/phase0-baseline.test.js`,
  `docs/PHASE_0_BASELINE_REPORT.md`, `docs/HOMESTAY_MIGRATION_AUDIT.md`.

## Known limitations and deferred items

- Reviews and ratings are not returned or displayed. The existing detail page's
  review section and rating display are deferred.
- The existing detail page's MapTiler map is not reproduced. Coordinates remain
  in MongoDB but are not exposed by this phase's API.
- There is no pagination, sorting, or server-side category query. Natural order
  and client-side category filtering preserve current browse behavior.
- The list endpoint reads all listings on each request. This is intentional for
  the current dataset and scope; caching and pagination are future work.
- No authentication, listing CRUD, uploads, AI search, bookings, payments, or
  rebranding were implemented.
- There is no frontend component-test suite. Frontend behavior was verified by a
  production build and live browser checks; the API contract has automated
  Python tests.
- The Vite setup is development-only. Production hosting will need either a
  same-origin reverse proxy or explicit CORS configuration, plus SPA fallback
  routing for `BrowserRouter`.
- The backend assumes valid stored field types. Missing optional fields are
  handled, but malformed non-numeric prices or non-string text values are not
  coerced into different data.

## Decisions affecting later phases

- Use synchronous PyMongo with regular `def` FastAPI endpoints for these
  read-only operations. This keeps the code small and avoids an unnecessary
  async driver or repository layer.
- Keep `ATLAS_DB_URL` as the shared environment name, but isolate backend
  configuration in `backend/.env`.
- Expose MongoDB `_id` as the public string `id`; do not expose `_id` directly.
- Keep list and detail schemas separate so browse cards cannot accidentally
  include owner or review data.
- Fetch owners with a `username`-only projection rather than serializing user
  documents.
- Preserve client-side category filtering until a later phase defines
  server-side search requirements.
- Keep local listing images served by Express and proxied by Vite during the
  migration; image ownership can move in a later phase.

## Git state

- Branch: `migration/phase-0-baseline`.
- No commit, push, or deployment was performed.
- Phase 1 files remain uncommitted.
- Generated environments and artifacts (`backend/.venv`, Python caches,
  `frontend/node_modules`, `frontend/dist`) are ignored through `.gitignore`.
