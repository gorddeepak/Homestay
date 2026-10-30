# Phase 6 — Deployment-Readiness Hardening

**Status:** Complete (uncommitted on `migration/phase-0-baseline`, HEAD `99b67a0`)
**Date:** 2026-10-28
**Scope:** Close the MapLibre advisory, remediate dependency advisories, review
authentication/authorization and browser-facing security, add configuration
validation and health checks, add CI, and document the deployment topology.
No deployment, commit, push, or branch change was performed.

Phase 6 changes no product behaviour by design. Phase 7 rebranding, chatbot
persistence, bookings/payments, and new authentication systems remain out of
scope.

---

## 1. Summary of outcomes

| Area | Before | After |
| --- | --- | --- |
| `maplibre-gl` critical advisory | `5.x`, affected by `GHSA-jrc7-96c5-q579` | `6.4.1`, patched |
| Root `npm audit` | 2 critical, 5 high, plus moderate/low | **0 vulnerabilities** |
| Frontend production audit | advisories incl. MapLibre critical | **0 vulnerabilities** |
| Frontend dev audit | — | 3 low, dev-only (shadcn CLI) |
| Python audit (`pip-audit`) | 34 findings in `pip` + `PyJWT` | **0 known vulnerabilities** |
| Config validation | only JWT secret checked at startup | environment, DB URL, secret, origins |
| Health endpoints | `/api/health` only | `/api/health`, `/api/health/live`, `/api/health/ready` |
| Chunked request limits | `Content-Length` only | buffered caps that also cover chunked bodies |
| CI | none | GitHub Actions test/build workflow, no deploy jobs |

Verification: **186 backend tests pass**, **45 Node tests pass / 0 fail / 10 todo**,
frontend production build succeeds, root and frontend production audits are
clean, `git diff --check` is clean.

---

## 2. Dependency remediation

### 2.1 MapLibre GL JS (critical)

`GHSA-jrc7-96c5-q579` / `CVE-2026-85061` affects `maplibre-gl` 5.x. The fix is
`maplibre-gl@6.4.1`. Sanitization was not disabled and the map was not removed.

MapLibre 6 is a breaking release:

- **ESM-only, no default export.** `ListingMap.jsx` now uses named imports
  (`Map`, `Marker`, `NavigationControl`, `GPUInitializationError`,
  `setWorkerUrl`).
- **Explicit worker URL required when bundling.** Vite resolves
  `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` and passes it to
  `setWorkerUrl()` at module load.
- **WebGL2 required.** A device without WebGL2 throws `GPUInitializationError`.
  That is caught and converted into the existing fallback message instead of an
  unhandled error.

Result: the map renders the same UI with a 954.80 kB chunk (down from
1,029.60 kB) plus a separate 470.49 kB worker chunk.

### 2.2 Root (Express) dependencies

Targeted upgrades only; no broad `npm audit fix --force` and no major-version
jumps beyond the patched lines:

| Package | From | To | Reason |
| --- | --- | --- | --- |
| `express` | 5.2.1 | 5.3.0 | pulls `body-parser@2.4.0`, `qs@6.17.0`, `proxy-addr@2.0.8` |
| `joi` | 18.2.1 | 18.3.0 | patched advisory line |
| `mongoose` | 9.6.2 | 9.11.4 | patched advisory line |
| `multer` | 2.2.0 | 2.5.0 | patched advisory line |
| `zod` | 4.4.3 | 4.6.7 | patched advisory line |
| `brace-expansion` (transitive) | 5.0.11 | 5.0.12 | DoS advisories via `minimatch`/`nodemon` |

Advisories closed include the `body-parser` invalid-`limit` and compressed-body
DoS issues, the `qs` array-limit DoS, `brace-expansion` exponential/quadratic
expansion and OOM issues, and the patched `mongoose`/`multer`/`joi` lines.

`npm audit` at the repository root now reports **0 vulnerabilities**.

### 2.3 Python

- `PyJWT` `2.10.1` → `2.15.0` in `backend/.venv` and `backend/requirements.txt`.
  This closes the HS/RS confusion, `crit` header, empty-HMAC-key, and
  `PyJWKClient` advisories. The project only signs and verifies HS256 cookies
  with a local secret and never uses `PyJWKClient`, but the upgrade is applied
  because the package is reachable from the request path.
- `pip` upgraded in the backend virtualenv.
- `pip-audit` against `backend/.venv/Lib/site-packages`: **no known
  vulnerabilities**. `pip check`: no broken requirements.

`pip-audit` is intentionally **not** added to `requirements.txt`; it was run
from a disposable virtualenv outside the repository.

### 2.4 Remaining advisories (honest accounting)

- **Frontend dev-only, 3 low:** `shadcn` → `@shadcn/registry` → `deepmerge`
  (`GHSA-gcqx-w48m-w2h4`, prototype poisoning). The only offered fix downgrades
  `shadcn` to `1.0.0`, which is a breaking change to a CLI that is not imported
  at runtime. `shadcn` was moved to `devDependencies`, so
  `npm audit --omit=dev` reports **0 vulnerabilities**. Accepted risk until the
  upstream registry updates.
- **No** production Node, frontend runtime, or Python advisories remain.

### 2.5 Peer-dependency caveat

`multer-storage-cloudinary@4.0.0` declares `cloudinary@^1.21.0`, while the
project installs `cloudinary@2.x`. This predates Phase 6 and is why root
`npm ci` and any install must use `--legacy-peer-deps`. This is documented in
the CI workflow and the deployment checklist. Replacing the storage adapter is
out of scope.

---

## 3. Configuration and startup validation

`backend/app/config.py` now distinguishes environments:

- `ENVIRONMENT` accepts only `development` (default) or `production`; anything
  else raises at startup.
- `validate_config()` runs in the FastAPI `lifespan` before the database
  connects. It always requires a database URL and a JWT secret of at least 32
  characters. In production it additionally requires:
  - a non-empty `AUTH_ALLOWED_ORIGINS`;
  - every listed origin to start with `https://`.
- Production **always** sets `Secure` on the auth cookie, regardless of
  `AUTH_COOKIE_SECURE`.
- Production has **no localhost origin fallback**. An empty allow-list denies
  every state-changing request, so forgetting configuration fails closed.

Optional providers are deliberately not required at startup: without Gemini,
Cloudinary, or MapTiler keys the API still serves listings, auth, and reviews,
and the dependent features report themselves as unavailable. This preserves the
existing behaviour where a partially configured environment is usable.

`backend/.env.example` documents `ENVIRONMENT`, the production requirements,
the Secure-cookie rule, and which keys are server-side only versus
browser-visible.

---

## 4. Authentication and session review

Reviewed, no code change required beyond configuration:

- **Cookie:** `HttpOnly`, `SameSite=lax`, `Path=/`, 7-day expiry, `Secure` in
  production. No token is exposed to JavaScript, `localStorage`, or
  `sessionStorage`.
- **JWT:** HS256 with a server-side secret of at least 32 characters, `exp`
  claim enforced, signature and algorithm pinned on decode. Upgraded `PyJWT`
  closes the algorithm-confusion and header-extension advisories.
- **Password storage:** PBKDF2-SHA256 with 250k iterations in the
  passport-local-mongoose-compatible format, constant-time comparison. Salts,
  hashes, and emails are never returned by public endpoints.
- **CSRF:** state-changing auth, listing, review, AI, and upload routes call
  `require_trusted_origin`; the browser uses `credentials: "same-origin"`.
  Production origins must be explicit HTTPS values.
- **Rate limits:** login `10/minute`, signup `5/minute`, AI description
  `5/minute`, AI search `10/minute`, chat `5/minute`. Limits are in-memory and
  keyed by the direct peer address; see §9 for the proxy caveat.
- **Errors:** validation failures return field locations and messages but never
  echo submitted values, so a rejected password cannot appear in a response.

### 4.1 Authorization and ownership

- Listing update/delete requires authentication and compares the stored owner
  ObjectId to the session user; another user's listing is a 404, not a 403, so
  existence is not disclosed.
- Listing creation derives the owner from the session, never from the request
  body.
- Review create/update/delete requires authentication, derives the author from
  the session, and verifies both review ownership and that the review belongs
  to the listing in the URL.
- Uploads require authentication and a trusted origin; the client cannot choose
  the Cloudinary public ID, and the returned asset is validated before storage.
- Only usernames are exposed for listing owners and review authors.

No authorization gap was found; no changes were made.

---

## 5. Frontend security review

- **No raw HTML:** no `dangerouslySetInnerHTML` or direct `innerHTML` usage in
  `frontend/src`.
- **Markdown:** chat replies render through `Streamdown` with `skipHtml` and a
  disallowed-element list (`script`, `iframe`, `object`, `embed`, `form`,
  `input`, media tags, `img`). Links render as `<a target="_blank"
  rel="noreferrer">`, and Streamdown's link-safety modal is available for
  untrusted URLs.
- **No browser storage of credentials:** login state is cookie-only; verified in
  a real browser that `document.cookie` is empty (HttpOnly) and that
  `localStorage`/`sessionStorage` stay empty after login.
- **No Vite-exposed secrets:** no `import.meta.env` or `VITE_` usage in the
  frontend. The only browser configuration is `GET /api/config`, which returns
  the public, origin-restricted MapTiler key and nothing else.
- **Images:** listing images are rendered from server-provided URLs; uploads are
  format-detected from bytes, not from the client-supplied filename or MIME type.

---

## 6. Request-size and execution limits

| Endpoint | Limit | Mechanism |
| --- | --- | --- |
| `POST /api/ai/generate-description` | 16 KiB body | ASGI body cap |
| `POST /api/listings/ai-search` | 16 KiB body | ASGI body cap |
| `POST /api/ai/chat` | 64 KiB body, 12 messages, 2,000 chars/message, 20,000 chars total, 700 output tokens | ASGI body cap + request validation |
| `POST /api/uploads` | 5 MiB, PNG/JPEG only | byte-signature detection and explicit size check |
| Auth and AI routes | per-route rate limits | slowapi |

The body limit is a pure ASGI middleware (`RequestBodyLimitMiddleware`). It
buffers the raw request stream up to the endpoint's cap and replays it to
FastAPI, returning `413` before parsing when the cap is exceeded. This is
deliberately not exception-based: FastAPI wraps receive-time exceptions as a
generic `400`, which would have hidden the correct status. Because it counts
bytes as they arrive, **chunked requests without `Content-Length` are bounded
too**; a regression test covers this.

Gemini calls use `max_retries: 0`, a configured timeout (default 20 s, bounded
to a sane range), and bounded `max_tokens`, so a slow provider cannot hold a
worker indefinitely.

---

## 7. Health and readiness

- `GET /api/health` — unchanged contract; pings MongoDB, `503` when down.
- `GET /api/health/live` — process liveness only; never touches the database, so
  a database outage does not trigger a restart loop.
- `GET /api/health/ready` — readiness; pings MongoDB and returns `503` when the
  database is unavailable, so a load balancer drains the instance instead.

Recommended wiring: liveness probe → `/api/health/live`, readiness probe →
`/api/health/ready`, uptime monitor → `/api/health`.

---

## 8. Routing, proxy, and secrets topology

Production is expected to serve one origin:

```
browser
  └── reverse proxy (TLS termination)
        ├── /            → built SPA (frontend/dist), SPA fallback to index.html
        ├── /api/*       → FastAPI (uvicorn)
        └── /images/*    → Express static image host (legacy listings)
```

- The SPA uses client-side routes (`/listings/:id`, `/login`, `/my-listings`,
  …); the static host must fall back to `index.html` for unknown non-`/api`
  paths.
- `frontend/vite.config.js` proxies `/api` → `127.0.0.1:8000` and `/images` →
  `127.0.0.1:8080` for local development. These are development-only and are not
  part of the production build.
- `GET /api/config` returns only `maptiler_key`. Cloudinary credentials and the
  Gemini key are server-side only and must never be placed in Vite variables.
- The MapTiler key is public by design; restrict it by HTTP origin in the
  MapTiler dashboard. A secret MapTiler key must not be used here.

---

## 9. Deferred risks (documented, not fixed)

1. **In-memory rate limiting.** Counters are per process, keyed by the direct
   peer address, and reset on restart. They are not shared across workers. A
   multi-worker or multi-instance deployment should either run a single worker
   or move limits to a shared store (e.g. Redis). Not changed in Phase 6.
2. **Proxy-aware client addresses.** Behind a reverse proxy, every request
   appears to come from the proxy, collapsing rate limits into one bucket.
   Documented remedy: run uvicorn with `--proxy-headers
   --forwarded-allow-ips=<proxy-ip>` so `X-Forwarded-For` is trusted only from
   the proxy. This is a deployment setting, not application code.
3. **Frontend dev-only `deepmerge` advisory.** See §2.4.
4. **`multer-storage-cloudinary` peer mismatch.** See §2.5.
5. **Live map tiles were not exercised.** No MapTiler key was used and provider
   contact was out of scope; only the "not configured" fallback path was
   verified in a browser. A deployment must verify tile rendering with its own
   origin-restricted key.
6. **No browser-based E2E suite.** Coverage is backend integration tests, Node
   contract tests, a production build, and a one-off manual browser pass.

---

## 10. CI

`.github/workflows/ci.yml` runs on every push and pull request with
`contents: read` only:

1. MongoDB 7 service container with a health check.
2. Node 22, root `npm ci --legacy-peer-deps`, `npm test`.
3. Python 3.13, `pip install -r backend/requirements-dev.txt`, `pytest` from
   `backend`.
4. Frontend `npm ci`, `npm run build`.
5. `git diff --check`.

All credentials are dummy CI values; the suites replace provider calls with
doubles and refuse outbound network access. **There are no deployment, publish,
or release jobs.**

---

## 11. Verification performed

| Check | Result |
| --- | --- |
| `backend/.venv/Scripts/python.exe -m pytest -q` (from `backend`) | 186 passed, 1 expected upstream warning |
| `npm test` (root) | 45 pass, 0 fail, 10 todo |
| `npm run build` (frontend) | success |
| `npm audit` (root) | 0 vulnerabilities |
| `npm audit --omit=dev` (frontend) | 0 vulnerabilities |
| `npm audit` (frontend) | 3 low, dev-only |
| `pip-audit` (backend venv) | no known vulnerabilities |
| `pip check` | clean |
| `git diff --check` | clean |
| Browser pass (local, disposable DB) | app loads, no console errors from app code, login/logout work, HttpOnly cookie, no web storage, `/api/listings/mine` returns the seeded listing, logout yields `401` |

Browser pass notes: it ran on temporary ports (`8010` API, `5180` Vite) because
`8000`/`5173` are occupied by an unrelated local project. The temporary Vite
config, seed script, and disposable database were removed afterwards. The only
console errors were expected: `401` for `/api/auth/me` while logged out and a
`502` for a placeholder `/images/*` path with no image host running.

Build output (gzip in parentheses):

```
index.html                     0.86 kB
assets/index-*.css            76.20 kB (13.11 kB)
assets/ListingMap-*.css       82.86 kB (10.71 kB)
assets/index-*.js            391.95 kB (121.78 kB)
assets/ChatAssistant-*.js    198.66 kB  (54.82 kB)
assets/dist-*.js             511.55 kB (156.87 kB)   # Streamdown
assets/ListingMap-*.js       954.80 kB (248.66 kB)   # MapLibre
assets/maplibre-gl-worker-*.js 470.49 kB
```

---

## 12. Files changed in Phase 6

| File | Change |
| --- | --- |
| `frontend/src/components/ListingMap.jsx` | MapLibre 6 named imports, worker URL, WebGL2 fallback |
| `frontend/package.json` / lockfile | `maplibre-gl@^6.4.1`; `shadcn` moved to devDependencies |
| `package.json` / `package-lock.json` | targeted patched dependency upgrades |
| `backend/requirements.txt` | `PyJWT==2.15.0` |
| `backend/app/config.py` | environment switch, production validation, cookie/origin rules |
| `backend/app/main.py` | body-limit middleware, lifespan validation, liveness/readiness |
| `backend/tests/test_hardening.py` | 9 hardening tests |
| `backend/tests/conftest.py` | pins `ENVIRONMENT=development` |
| `backend/.env.example` | environment and secret-handling documentation |
| `.github/workflows/ci.yml` | new CI workflow |
| `docs/PHASE_6_HARDENING_REPORT.md` | this report |
| `docs/DEPLOYMENT_CHECKLIST.md` | operational checklist |

The rollback path is unchanged: the Express/EJS application still runs
independently, and all Phase 0–5B work remains uncommitted on
`migration/phase-0-baseline`.
