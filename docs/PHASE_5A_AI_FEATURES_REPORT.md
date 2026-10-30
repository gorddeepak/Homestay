# Phase 5A — AI Listing Descriptions and Natural-Language Search

**Status:** Complete (uncommitted on `migration/phase-0-baseline`, HEAD `99b67a0`)
**Date:** 2026-10-28
**Scope:** Migrate the two non-chat AI features from Express to FastAPI and
integrate them into the React app. The Express/EJS application and its AI
routes remain unchanged as the rollback path.

## 1. Migrated features and endpoint contracts

| Feature | New endpoint | Old endpoint (kept for rollback) |
| --- | --- | --- |
| Listing description generation | `POST /api/ai/generate-description` | `POST /api/ai/generate_description` |
| Natural-language listing search | `POST /api/listings/ai-search` | `POST /api/ai/search` |

Both are registered by `backend/app/ai.py`; the FastAPI version is now
`0.5.0`.

### Description generation

Request (all fields are bounded):

```json
{
  "title": "Cliffside Cottage",
  "location": "Varkala",
  "country": "India",
  "category": "Coastal Haven",
  "details": "Optional existing description or host notes"
}
```

Response:

```json
{ "description": "Sea air, slow mornings, and a wide horizon. ..." }
```

- `title` and `location` are required (1–200 characters), `country` is
  optional (≤100), `category` must be one of the existing listing categories,
  and `details` is optional (≤1000). Whitespace-only values are rejected.
- The prompt keeps the legacy tone and constraints (2–3 sentences, editorial
  voice, no generic phrases, no invented facts) and adds the listing's
  `country` and any existing description/host notes, which the React form
  already holds.
- The response is trimmed and rejected if empty or longer than 5000
  characters.
- The endpoint never reads or writes listings; it only returns text.

### Natural-language search

Request:

```json
{ "query": "a quiet coastal stay under 5000" }
```

Response:

```json
{
  "listings": [
    {
      "id": "…",
      "title": "Cliffside Cottage",
      "price": 4500,
      "location": "Varkala",
      "country": "India",
      "category": "Coastal Haven",
      "image_url": "…"
    }
  ],
  "filters": {
    "location": null,
    "country": null,
    "category": "Coastal Haven",
    "min_price": null,
    "max_price": 5000
  }
}
```

- `listings` uses the existing public `ListingCard` serializer
  (`_card_fields` in `app/listings.py`). Owner ids, review ids, geometry,
  and any other internal fields are never returned.
- `filters` is the validated, normalized criteria the server actually used.
- Results are capped at 20, matching the legacy `Listing.find(...).limit(20)`.
- The old endpoint rendered an EJS partial; the new one returns JSON only.

## 2. Structured criteria and safe query construction

The model does not produce a MongoDB query. It returns a `SearchFilters`
Pydantic model (`backend/app/schemas.py`) with exactly these optional fields:

- `location` (string)
- `country` (string)
- `category` (string)
- `min_price` (number)
- `max_price` (number)

The server then validates the model output in `_validated_filters`:

- Text filters are trimmed, limited to 100 characters, and empty strings become
  `null`.
- `category` is matched case-insensitively against the canonical
  `CATEGORIES` tuple. Unknown categories are rejected with `422` rather than
  silently dropped.
- Prices must be finite numbers between 0 and 1,000,000, and
  `min_price ≤ max_price`.
- At least one criterion must remain; a query that yields no usable criteria
  gets `422`.

`_build_query` then constructs an ordinary PyMongo filter from a fixed allow
list:

- `location` / `country` → `{"$regex": re.escape(value), "$options": "i"}`
- `category` → exact canonical string match
- `min_price` / `max_price` → `price.$gte` / `price.$lte`

The model cannot choose field names, operators, aggregation stages, `$where`,
or JavaScript. The find call also uses an explicit projection containing only
card fields. No documents are created, updated, or fabricated.

## 3. Authentication, rate limits, and abuse controls

- **Description generation:** requires the existing `get_current_user`
  dependency and `require_trusted_origin` (state-changing request), then
  `5/minute` via the existing slowapi limiter.
- **Natural-language search:** public, as in the legacy product, limited to
  `10/minute`.
- Both endpoints are keyed by client address (`get_remote_address`), matching
  the rest of the app. The limiter is the existing in-memory slowapi
  instance; see limitations below.
- A small HTTP middleware in `app/main.py` rejects request bodies larger than
  16 KiB on the two AI paths (`413`) using `Content-Length`, before the body
  is read. Query and field lengths are also bounded by Pydantic models.
- Provider calls run once per request: `model_settings={"max_retries": 0}` and
  `Agent(..., retries=0)` disable both transport retries and output-validation
  retries, so a failure never multiplies paid calls.
- Failures are logged by exception type only. Responses never include API
  keys, prompts, stack traces, or provider messages:
  - `401` unauthenticated description request
  - `403` untrusted origin
  - `413` oversized body
  - `422` invalid input or unusable/empty extracted criteria
  - `429` rate limit
  - `502` provider failure, timeout, empty/malformed model output
  - `503` AI not configured (missing `GEMINI_API_KEY`) or database unavailable

## 4. Dependencies and model configuration

- Added `pydantic-ai-slim[google]==2.63.0` to `backend/requirements.txt`
  (latest release at implementation time). It installs `google-genai==2.33.0`,
  `pydantic-graph==2.63.0`, `httpx2==2.16.0`, and `genai-prices`; the existing
  `httpx==0.28.1` remains in place. `pip check` reports no broken requirements.
- One model identifier for both features, read from `GEMINI_MODEL` and
  defaulting to **`gemini-3.5-flash-lite`**. The default was chosen for cost
  and verified against Google's published Gemini model list; no live Gemini
  request was made during this phase, so real-key behavior is not yet
  exercised.
- `GoogleModel` + `GoogleProvider(api_key=...)` are constructed per request
  with `gemini_timeout_seconds()` (default 20 s, bounded to 1–120 s).
- No other Gemini SDK was added for Python. The Express app's `@google/genai`
  and `@ai-sdk/google` dependencies are untouched.
- The browser never sends a model name, system prompt, temperature, or token
  limit. Extra JSON keys from the client are ignored (covered by a test).

## 5. Environment variables and local setup

`backend/.env` (see `backend/.env.example`, which contains no secrets):

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_TIMEOUT_SECONDS=20
```

Local run:

```bash
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
cd ../frontend
npm run dev
```

The Vite dev server proxies `/api` to `127.0.0.1:8000`, so no CORS or origin
changes were needed. `AUTH_ALLOWED_ORIGINS` must include the frontend origin
for the description endpoint, as for the other state-changing routes.

## 6. Frontend integration

- `frontend/src/api.js`: `generateDescription(details)` and `aiSearch(query)`.
- `frontend/src/pages/ListingFormPage.jsx`: "Generate with AI" / "Refine with
  AI" button under the existing textarea. It shows `Generating…` and is
  disabled while in flight, requires a title and location, and renders the
  result in a shadcn `Alert` with **Use this description** and **Discard**.
  The textarea is only changed when the user accepts the suggestion; a failed
  request shows a sanitized error and leaves existing text untouched. Any
  field edit clears a stale suggestion.
- `frontend/src/pages/BrowsePage.jsx`: submit-based AI search form (shadcn
  `Input` + `Button`), loading label `Searching…`, error `Alert`, an
  "Understood: …" summary from `filters`, a `Clear` action, and no-results
  states. Results are rendered with the existing `ListingCard`; category tabs
  filter the AI results; clearing restores normal browsing. Normal listing
  loading, featured stays, and category browsing are unchanged.
- Added only the missing shadcn components (`input.jsx`, `alert.jsx`) through
  the existing CLI configuration; `Button` was reused.

## 7. Tests and verification

Automated (all run locally, no live Gemini calls, disposable loopback DB):

| Check | Command | Result |
| --- | --- | --- |
| Focused AI tests | `python -m pytest -q tests\test_ai.py` | **41 passed** |
| Full FastAPI suite (Phases 1–5A) | `python -m pytest -q` | **136 passed** |
| Node/Express suite | `npm test` | **45 pass, 0 fail, 10 todo** |
| Frontend production build | `npm run build` | success (Vite 8.3.5, 2080 modules; only the pre-existing >500 kB MapLibre chunk warning) |
| Dependency consistency | `pip check` | no broken requirements |
| Whitespace check | `git diff --check` | clean |

The 41 focused tests cover: authentication, trusted origin, field validation,
empty/invalid model output, provider errors and timeouts, missing
configuration, ignored client-supplied generation settings, rate limiting,
oversized bodies, and "generation does not write listings" for descriptions;
for search: matching results, empty results without inventing listings, query
validation, invalid categories, unreasonable/non-finite prices, inverted
ranges, empty criteria, malformed output, provider failure, missing
configuration, rate limiting, oversized bodies, allow-listed query
construction with regex escaping, and the public card shape.

Gemini is mocked at the `app.ai._agent` boundary (`FakeAgent`), and
`conftest.py` sets `GEMINI_API_KEY=""` so no test can reach the provider.

### Browser verification (fake agent, disposable database)

A temporary FastAPI server with a fake agent (0.6 s delay, failure when the
prompt contains `FAIL`) and a disposable database
(`homestay_phase5a_ui_…`, since dropped) was used with the Vite dev server.
Verified in the in-app browser:

- Login and redirect to `/listings/new`.
- Description: loading state (`Generating…`, disabled), suggestion preview,
  **Use this description** populates the textarea, and a forced provider
  failure shows a sanitized `Alert` while the existing text remains intact.
- Search: "a quiet coastal stay under 5000" returned the expected card and
  `Understood: Coastal Haven · under ₹5,000`; "a stay in Atlantis" showed the
  no-results state; a forced failure showed the sanitized error and returned
  to normal browsing; `Clear` reset the search; category tabs filtered AI
  results (including an empty-category message).
- Normal browsing and a listing detail page (with reviews) still rendered from
  the live API.
- Network log showed `200` for `/api/listings`, `/api/auth/me`,
  `/api/listings/:id`, reviews, config, and AI search; the single `502` was the
  intentional failure test. Console errors were only `502` image loads from
  the Express server on `:8080`, which was not running in this environment
  (pre-existing behavior, unrelated to Phase 5A).

Not verified: a real Gemini request (no key was used), multi-worker rate-limit
behavior, and production-like deployment.

## 8. Backward compatibility

- Phases 0–4 code, the Express app, its EJS views, and its AI routes are
  unchanged; no branch, commit, reset, or deployment was performed.
- Public listing endpoints, auth, uploads, maps, reviews, and listing CRUD
  remain intact; their suites still pass.
- The only cross-cutting changes are the new router registration, the AI body
  size middleware (path-scoped to the two AI endpoints), the version bump, and
  the new configuration helpers.

## 9. Known limitations and deferred work

- **In-memory rate limiting.** slowapi keeps counters per process. With
  multiple Uvicorn workers or instances, limits are per worker and reset on
  restart. Counters are keyed by `request.client.host`, so behind a reverse
  proxy all clients may share one address (and one limit) unless forwarded
  headers are trusted explicitly. A shared store (e.g. Redis) and proxy-aware
  keying are needed before horizontal scaling; neither was added in this
  phase.
- **Body cap uses `Content-Length`.** Chunked requests without that header are
  bounded only by field validation after parsing.
- **No live provider validation.** Model availability was checked against
  Google's documentation; real latency, quota, and safety-filter behavior with
  a production key are unverified.
- **Search scope.** Only location, country, category, and nightly price are
  supported — the same fields the legacy implementation used. There is no
  title/description text search, amenity filter (the schema has none), sorting,
  pagination, or geospatial radius search.
- **Regex semantics.** Location/country use unanchored, escaped,
  case-insensitive substring matching, as before.
- **Strict criteria handling.** An unknown category from the model is a `422`
  rather than being ignored; retries are disabled, so malformed structured
  output surfaces as `502` and the user must retry.
- **Synchronous provider calls.** Endpoints are sync handlers, so FastAPI runs
  them in the threadpool; a slow provider ties up a worker thread for up to the
  configured timeout.
- **Description input is free text.** `details` is size-limited but not
  otherwise filtered; it is sent to Gemini as host-provided context.
- **Deferred:** Phase 5B chatbot/streaming, AI Elements, conversation history,
  embeddings/vector search, rebranding, deployment, and the known
  `maplibre-gl@5.24.0` advisory (separate maintenance task).

## 10. Phase 5B readiness

The pieces Phase 5B can reuse are in place: one centrally configured model and
key helper, a shared per-request agent builder, sanitized error handling, the
existing slowapi limiter, and the Pydantic structured-output pattern. Chat
streaming will need async endpoints/SSE (the current endpoints are sync) and
probably a per-user conversation scope; neither conversation history nor
streaming was implemented here.
