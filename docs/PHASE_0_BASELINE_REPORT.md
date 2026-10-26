# Phase 0 Baseline Report

**Status:** Complete for the Express baseline (uncommitted working tree)
**Branch:** `migration/phase-0-baseline` (created from `main` / `0629cb0`)
**Date:** 2026-10-26
**Scope:** Automated tests and frozen contracts for the current Express/EJS application. No React, Vite, FastAPI, or Pydantic AI work was started.
**Companion documents:** `docs/HOMESTAY_MIGRATION_AUDIT.md`, `docs/HOMESTAY_SCHEMA_CATALOG.json`

---

## 1. Summary

Phase 0 adds an executable baseline for the application that exists today. The suite:

- runs against a unique, disposable local MongoDB database;
- replaces Gemini, Cloudinary, and MapTiler with test doubles before application modules load;
- blocks outbound `fetch` and HTTPS so a missing double fails loudly instead of reaching a provider;
- covers public pages, authentication, listing ownership and CRUD, review create/delete, the three AI contracts, category handling, missing-data behavior, and health checks;
- separates **current-behavior characterization tests** (asserting behavior that must be preserved for compatibility, including known defects) from **deferred secure/future contracts** (`it.todo`, not treated as passing behavior).

Latest result:

```text
# tests 54
# suites 12
# pass 44
# fail 0
# cancelled 0
# skipped 0
# todo 10
```

Duration is approximately 10 seconds on the development machine. The normal application was also started separately against a disposable database; it connected, listened on port 8080, and `/health` returned `{"ok":true}`.

---

## 2. Tooling decisions

| Concern | Choice | Reason |
|---|---|---|
| Test runner | Node's built-in `node:test` | Available in the declared Node `22.22.2`; no new framework, transpiler, or config file. |
| HTTP assertions | `supertest@^7.3.1` (dev dependency) | Drives the real Express app and manages cookies/agents for session tests. |
| Database | Real local MongoDB at `127.0.0.1:27017` with a unique throwaway database | The installed driver and Mongoose behavior are exercised directly. `mongodb-memory-server` is not installed and would add a large binary download. |
| Serial execution | `--test-concurrency=1` | One app instance, one module cache, and one database reset per test. Parallel files would race. |
| Refactor boundary | `app.js` exports `{ app, connectToDatabase, start, sessionStore }`; DB connect/listen gated on `require.main === module` | Makes the app importable without starting a server, with no route or middleware changes. |

`npm test` previously exited with an error; it now runs the suite:

```json
"test": "node --test --test-concurrency=1 test/phase0-baseline.test.js"
```

`supertest` was installed with `--legacy-peer-deps` because the repository already has a peer conflict between `multer-storage-cloudinary@4.0.0` and `cloudinary@2.10.0`. No application dependency version was changed.

---

## 3. How to run

### Prerequisites

- Node.js `22.22.2` (or a compatible Node 22 release).
- A local MongoDB server listening on `127.0.0.1:27017` (or `localhost`/`::1`).
- No real provider credentials are needed.

### Commands

```powershell
npm install
npm test
```

Optional: point the suite at a different **local** MongoDB server.

```powershell
$env:TEST_MONGODB_URI = "mongodb://127.0.0.1:27017"
npm test
```

The value must be `mongodb://` with a loopback host, no credentials, no database path, and no query string. The suite refuses anything else.

### Test database naming and cleanup

Each process creates `homestay_phase0_test_<pid>_<timestamp>` and drops it in the `after` hook. A hard-killed run can leave a database behind. List and drop only the Phase 0 databases with:

```powershell
mongosh "mongodb://127.0.0.1:27017/admin" --quiet --eval "const names=db.adminCommand({listDatabases:1}).databases.map(d=>d.name).filter(n=>n.startsWith('homestay_phase0_test_')); for (const n of names) { db.getSiblingDB(n).dropDatabase(); print('dropped '+n); }"
```

### Normal application startup check

The existing start path still works with its existing configuration (`.env` / `ATLAS_DB_URL`):

```powershell
$env:ATLAS_DB_URL = "mongodb://127.0.0.1:27017/homestay_phase0_startup_check"
npm start
# GET http://127.0.0.1:8080/health -> {"ok":true}
```

The verification run used a disposable database and dropped it afterwards.

---

## 4. Isolation and safety

Implemented in `test/helpers/environment.js`:

- **Loopback-only guard.** `ATLAS_DB_URL` is rebuilt from `TEST_MONGODB_URI` (or `mongodb://127.0.0.1:27017`). Non-local hosts, credentials, an explicit database path, and query options are rejected.
- **Name guard.** Before any reset or drop, `mongoose.connection.name` must start with `homestay_phase0_test_`. A misconfigured connection fails before destructive work.
- **Disposable database.** The suite drops the newly created database at startup, resets all application collections before each test, and drops the database again at teardown.
- **Dummy credentials.** Session, Cloudinary, MapTiler, and Gemini environment variables are set to obvious test-only values.
- **No outbound HTTP.** `globalThis.fetch`, `https.request`, and `https.get` throw. The suite therefore cannot reach Gemini, Cloudinary, MapTiler, or any remote service.
- **Session store teardown.** `connect-mongo` is closed before Mongoose disconnects, so the test process exits cleanly.

No production database, real credential, or real user record is used. The suite never reads `.env` values for providers; `.env` is loaded by `app.js` for unrelated configuration but the test harness overwrites the relevant variables and replaces the provider modules.

---

## 5. Mock strategy

Implemented in `test/helpers/providers.js`, required **before** `app.js` so controllers capture the doubles.

| Dependency | Double | What is exercised |
|---|---|---|
| `ai` (`streamText`, `generateObject`) | Fake functions installed by replacing the CommonJS module export | Chat validation, streaming response wiring, tool definitions and tool queries, NL-search extraction and DB query construction. |
| `@google/genai` (`GoogleGenAI`) | Fake class whose `interactions.create` returns a fixed `output_text` or a configured error | Description prompt construction, JSON response shape, error path. |
| `@maptiler/client` (`geocoding.forward`) | Async function returning a fixed GeoJSON feature or a configured error | Create/update geocoding calls, geometry persistence, unchanged-location shortcut. |
| Cloudinary through `cloudConfig.storage` (`_handleFile`) | Replaced storage handler that records the upload and consumes the stream without network I/O | Multipart parsing, Multer wiring, controller image filename/URL assignment. |

Important implementation detail: the installed `ai` package exports a **non-extensible proxy**. Assigning `ai.streamText = ...` silently does nothing. The double therefore replaces `require.cache[require.resolve("ai")].exports` with a prototype-chained object before controllers load. A first attempt that used direct assignment did reach the real Gemini client with dummy credentials; the failed call was blocked by the dummy key, and the harness now prevents any recurrence.

`@google/genai` is replaced the same way for consistency, although its export is writable. MapTiler's `geocoding.forward` is writable and replaced in place.

### What is real vs. doubled

- **Real:** Express routing/middleware, Passport local authentication, `passport-local-mongoose` hashing, `connect-mongo` sessions, Mongoose models/validation/indexes, MongoDB queries and cascade logic, EJS rendering, the shared error handler, and HTTP status/content-type behavior.
- **Doubled:** all provider SDK calls, upload I/O, and geocoding. Database I/O is intentionally real.

---

## 6. Coverage and results

File: `test/phase0-baseline.test.js` — 12 suites, 54 tests.

| Suite | Passing | Covers |
|---|---:|---|
| Public pages and listing index | 4 | Home and `/listings` both render the seeded listing cards; detail renders owner and reviews; missing listing redirects to `/listings`; unknown route returns the HTML 404 page. |
| Authentication | 5 | Signup + auto-login + session; valid login; invalid password; authenticated GET logout; unauthenticated redirect from protected pages. |
| Listing ownership | 5 | Create with mocked upload and geocoding; owner edit without re-geocoding; re-geocode on location change; non-owner cannot edit/delete; owner delete cascades reviews. |
| Review contracts | 7 | Authenticated create; unauthenticated rejection; author-only delete and listing-array consistency; three characterization cases (cross-listing deletion, missing rating, no-rating default) and validation-before-auth. |
| AI description contract | 4 | JSON `{ description }` shape and prompt content; empty body characterization; malformed JSON → 400 JSON; provider error characterization. |
| AI chat contract | 6 | Incremental `text/plain` body; raw HTTP without SSE framing; missing/non-array `messages` → 400; empty array characterization; malformed JSON → 400; provider failure → safe 500. |
| AI natural-language search | 5 | EJS HTML fragment with `listing-col`, no full document; regex metacharacter characterization; missing/malformed query → 400; provider failure → safe 500; tool query semantics and the 5-result cap. |
| Missing/malformed data | 4 | Missing image, price, owner, and geometry behavior (three current 500s and one default-coordinate fallback). |
| Category and review edge cases | 2 | All 11 categories validate in Mongoose; the create form exposes only 8. |
| Health and readiness | 2 | `/health` JSON and absence of `/ready`; `/health` still reports healthy after MongoDB disconnects. |
| Deferred secure contracts | 0 (10 todo) | Explicit pending contracts for later phases. |

### Route coverage

| Route | Method(s) | Baseline coverage |
|---|---|---|
| `/` | GET | Rendered with listings. |
| `/listings` | GET | Rendered with listings; post-login redirect target. |
| `/listings/new` | GET | Auth gate; category form characterization. |
| `/listings` | POST | Create with multipart upload and geocoding. |
| `/listings/:id` | GET | Detail with owner/reviews; missing-data cases. |
| `/listings/:id/edit` | GET | Owner and non-owner behavior. |
| `/listings/:id` | PUT | Owner update; non-owner rejection; re-geocoding. |
| `/listings/:id` | DELETE (via `_method`) | Owner delete + review cascade; non-owner rejection. |
| `/listings/:listingId/review` | POST | Create, auth gate, validation order, no-rating behavior. |
| `/listings/:listingId/review/:reviewId` | DELETE (via `_method`) | Author-only delete; cross-listing characterization. |
| `/signup` | GET/POST | POST success and session (GET form render not asserted). |
| `/login` | GET/POST | Valid and invalid POST credentials (GET form render not asserted). |
| `/logout` | GET | Current GET contract. |
| `/health` | GET | Liveness JSON; post-disconnect behavior. |
| `/listings/ai/generate_description` | POST | JSON contract, validation, provider error. |
| `/listings/ai/chat` | POST | Text stream, validation, provider error, tool semantics. |
| `/listings/ai/search` | POST | HTML fragment, validation, provider error, regex behavior. |
| Unknown route | GET | HTML 404. |

Not directly requested by this phase and not covered end-to-end: static asset delivery, the map browser behavior, the client-side chat widget, and visual rendering. See §10.

---

## 7. Preserved behavior

The tests intentionally lock in current behavior. No route, response shape, redirect, status code, template, or business rule was changed for the purpose of making tests pass. Preserved contracts include:

- `/` and `/listings` both render the listing index.
- Session authentication uses Passport Local and `connect.sid`; signup logs the user in.
- `/logout` is a **GET** route and redirects to `/listings`.
- Unauthenticated protected requests redirect to `/login`; non-owner listing actions redirect to `/listings`.
- Owner delete cascades review documents.
- Review create requires authentication and currently validates the body first.
- AI description returns `{ "description": "<text>" }` as JSON.
- AI chat returns an unframed incremental `text/plain` stream.
- AI search returns a rendered EJS HTML fragment, not JSON.
- Search caps results at 20; the chat `searchListings` tool caps at 5.
- `/health` returns `{"ok":true}` and is registered before session middleware.

---

## 8. Known defects revealed by characterization tests

These tests assert the current behavior so regressions are visible. They are **not** statements that the behavior is acceptable. Each defect is assigned to the phase where it should be fixed.

| # | Defect | Current behavior asserted | Fix phase |
|---|---|---|---|
| 1 | Cross-listing review deletion | Deleting an authored review through a different listing ID deletes the review, leaves a dangling reference on its real listing, and reports success for the wrong listing. | Phase 4 (reviews) |
| 2 | Review validation before authentication | An anonymous request with an invalid review body gets `400` instead of an auth redirect; the body is validated before login. | Phase 2 (auth) / 4 |
| 3 | No-rating submission becomes 1 star | The checked hidden radio has `value="1"`, so submitting without choosing a star stores a 1-star review. A body with no rating field gets `400`. | Phase 4 |
| 4 | AI description accepts an empty body | `{}` returns `200` and sends `Title: undefined` to the provider instead of rejecting the request. | Phase 5a |
| 5 | Raw provider error leakage | A description-provider failure returns the raw error message to the client through the shared JSON error handler. | Phase 5a / 6 |
| 6 | Empty chat history → generic 500 | `messages: []` passes the route check and becomes a `500` with a generic message; it should be a validated `400`. | Phase 5b |
| 7 | Unescaped regex input | AI search and tools pass user/model strings into `$regex`; `.*` matches every listing rather than being treated literally. | Phase 5a / 6 |
| 8 | Missing image renders successfully | A listing without an image returns `200` with `<img src="">` instead of a controlled fallback/error. | Phase 1 / 3 |
| 9 | Missing price or owner returns 500 | The detail template dereferences missing values and the shared handler returns a 500 HTML page. | Phase 1 / 3 |
| 10 | Missing geometry silently uses New Delhi | The template falls back to `[77.209, 28.6139]`, putting an unrelated listing on the map. | Phase 1 / 3 |
| 11 | Category form omits 3 valid values | The model accepts 11 categories, but the create form exposes only the first 8, so Heritage Homestay, Hill Station Retreat, and Houseboat cannot be chosen. | Phase 3 |
| 12 | GET logout | Logout is state-changing over GET and has no CSRF protection. | Phase 2 / 6 |
| 13 | No CSRF protection on mutations | Cookie-authenticated create/update/delete/review requests have no token check. | Phase 2 / 6 |
| 14 | Health ignores database readiness | `/health` reports `ok` after MongoDB disconnects, and `/ready` does not exist. | Phase 6 (ops) |
| 15 | Public AI endpoints | No authentication, quota, or rate limit protects Gemini usage. | Phase 5a / 5b / 6 |

Defects 1–14 are demonstrated by passing characterization tests; defect 15 (and the secure-side versions of 1, 3, 7, 11–14) is recorded as deferred contracts in §9 or as an audit risk.

---

## 9. Deferred secure and future contracts

These are `it.todo` entries. Node reports them as TODO, not as passing tests, and they must be replaced with real tests when the corresponding phase lands.

| Deferred contract | Phase |
|---|---|
| Logout must be POST-only and CSRF-protected | 2 / 6 |
| Every cookie-authenticated mutation must require a CSRF token | 2 / 6 |
| Review deletion must reject a review that belongs to another listing | 4 |
| AI endpoints must enforce authentication or quotas and rate limits | 5a / 5b / 6 |
| Regex inputs must be escaped before reaching MongoDB | 5a / 6 |
| Review submission must not silently become a 1-star review | 4 |
| Listing forms must expose all 11 categories | 3 |
| Missing image, price, or owner must return a controlled error, not a 500 | 1 / 3 |
| A `/ready` endpoint must report MongoDB readiness separately from `/health` | 6 |
| AI chat must emit a versioned UI message stream for AI Elements | 5b |

Also deferred beyond Phase 0: React/FastAPI parity tests, Python PBKDF2 compatibility tests, XSS/Markdown sanitization tests, accessibility tests, duplicate-AI-invocation tests, and load/security testing. These belong to the phases defined in the audit's test matrix (§10).

---

## 10. Limitations

1. **Local MongoDB is required.** The suite is repeatable but not self-contained. CI must provide a MongoDB service or install an ephemeral server. There is no in-process Mongo.
2. **No CI.** Nothing runs the suite automatically. `npm test` is manual.
3. **Serial only.** `--test-concurrency=1` prevents database and module-cache races. Adding parallel suites requires per-worker databases and isolation work.
4. **Cloudinary validation is bypassed.** The upload double consumes the stream and returns a synthetic result. Multipart parsing and controller wiring are tested, but Cloudinary's MIME, format, size, and transformation rules are not.
5. **No browser or client-side tests.** The chat widget, map initialization, Bootstrap validation, and EJS/JS interaction are untested. No visual or accessibility assertions exist.
6. **No provider response-quality tests.** Prompts are asserted structurally, not for tone or factual accuracy. Model names, latency, and token usage are not verified.
7. **Doubles are coupled to current SDK usage.** Upgrading `ai` or `@google/genai` may require updating the patched module exports and fake response shapes.
8. **Chat chunk boundaries are asserted via the double's write count.** TCP/HTTP may coalesce chunks in transit; the raw-HTTP test proves the body has no SSE framing, not that each delta arrives in its own packet.
9. **Characterization assertions will need to change.** Tests that assert `500`, empty image `src`, 1-star defaults, or unescaped regex must be rewritten when those defects are fixed. They are deliberate snapshots, not desired end state.
10. **Error-page assertions are string-based.** Template copy changes will require test updates.
11. **Hard-killed runs can leave databases.** The cleanup command in §3 handles this; normal teardown drops the database.
12. **The health-disconnect test reconnects and re-drops the test database.** This is safe only because the database is disposable and name-guarded.
13. **No production data was inspected.** All fixtures are synthetic; production schema drift remains an audit risk.
14. **Dependency vulnerabilities remain.** `npm install` reports 8 advisories (2 moderate, 5 high, 1 critical) inherited from the existing dependency set. `npm audit fix` was not run because it could change application behavior.
15. **The testability refactor is the only application change.** `app.js` exports the app and only starts the server when run directly. Route behavior, middleware order, and error handling are unchanged.

---

## 11. Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Normal application starts with existing configuration | **Pass** — verified on port 8080 with a disposable local database; `/health` returned `{"ok":true}`. |
| 2 | Automated test command runs a repeatable suite against isolated data | **Pass** — `npm test` runs 54 tests serially against a unique, name-guarded, disposable database that is dropped at teardown. |
| 3 | Baseline routes and AI contracts have tests or documented limitations | **Pass** — all requested routes and the three AI contracts are covered; uncovered areas are listed in §10. |
| 4 | No real Gemini, Cloudinary, MapTiler, or production database calls | **Pass** — modules are replaced before load, credentials are dummy values, outbound `fetch`/HTTPS throws, and the database must be loopback with a Phase 0 name. |
| 5 | Existing functionality is unchanged | **Pass** — only `app.js` startup gating/exports, `package.json` test wiring, and the lockfile changed; tests assert current behavior. No business logic was fixed. |
| 6 | Report distinguishes passing tests, defects, expected failures, and deferred work | **Pass** — results in §6, defects in §8, deferred contracts in §9, limitations in §10. There are no expected-failing tests: current defects are characterized as passing assertions, and future contracts are `it.todo`. |

---

## 12. Files changed or added

| File | Change |
|---|---|
| `app.js` | Testability refactor: `connectToDatabase()`, `start()`, `require.main` guard, module exports. No route behavior change. |
| `package.json` | `test` script now runs the suite; `supertest` added to `devDependencies`. |
| `package-lock.json` | Lockfile update for `supertest` and its transitive dependencies. |
| `test/helpers/environment.js` | Test database creation/guards, environment setup, outbound HTTP block, fixtures, teardown. |
| `test/helpers/providers.js` | `ai`, `@google/genai`, MapTiler, and Cloudinary doubles. |
| `test/phase0-baseline.test.js` | 54-test baseline suite (44 passing, 10 todo). |
| `docs/PHASE_0_BASELINE_REPORT.md` | This report. |
| `docs/HOMESTAY_MIGRATION_AUDIT.md` | Phase 0 outcome recorded in the affected sections only (status, tests, risk 16, §5.3, phase table, §10.1, Appendix C). |

Not changed: `controllers/`, `routes/`, `models/`, `views/`, `public/`, `schema.js`, `middleware.js`, `cloudConfig.js`, `init/`, and `docs/HOMESTAY_SCHEMA_CATALOG.json`.

No commit was created.

---

## 13. Recommended next steps

1. Add CI that starts a MongoDB service and runs `npm test` on pull requests.
2. Before Phase 2, copy the auth/ownership assertions into the FastAPI contract suite, including PBKDF2 verification against synthetic hashes.
3. Before Phase 3, replace the category characterization test with an assertion that all 11 values are available in every listing form.
4. Before Phase 4, convert the review characterization tests into failing-first regression tests for cross-listing deletion and no-rating semantics.
5. Before Phase 5, freeze the AI tool and response contracts as golden fixtures and decide the versioned UI message stream shape.
