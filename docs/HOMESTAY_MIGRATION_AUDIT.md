# Homestay Migration Audit

**Status:** Audit complete; Phase 0 baseline implemented (uncommitted)
**Repository:** `D:\deepak\coding\Full Stack Dev\Airbnb`
**Branch / commit:** audit on `main` / `0629cb0`; Phase 0 on `migration/phase-0-baseline` (uncommitted)
**Audit date:** 2026-10-25
**Phase 0 date:** 2026-10-26
**Companion catalog:** `docs/HOMESTAY_SCHEMA_CATALOG.json`
**Phase 0 report:** `docs/PHASE_0_BASELINE_REPORT.md`

**Scope and constraints**

- Read-only inspection of the repository and the installed package metadata. The audit itself modified nothing.
- The subsequent Phase 0 work added a test suite and a minimal startup refactor in `app.js`; it did not change routes or business logic. See `docs/PHASE_0_BASELINE_REPORT.md`.
- No database, Cloudinary, MapTiler, Gemini, or other external service was contacted.
- No secret value or real user record is reproduced here. Environment variables are listed by name only.
- The planned target stack (React/Vite, FastAPI, Pydantic AI, MongoDB retained, Vercel AI Elements) is treated as a **future target**, not as a description of the current application. The Tradium Nova architecture is used only as a reference design.

**Evidence legend**

| Marker | Meaning |
|---|---|
| **Verified** | Directly supported by source code, installed package source, or a tracked configuration file. |
| **Inference** | Strongly implied by code, seed data, or library defaults, but not explicitly declared by the application. |
| **Unknown** | Requires database, provider-console, or deployment access that this audit did not have. |

---

## Executive summary

- The current application is a server-rendered **Express 5 + EJS** monolith with **Mongoose 9 / MongoDB**, Bootstrap 5, custom CSS, and vanilla JavaScript. It is not a React application and contains no FastAPI or Python code. **Verified**
- There are **three application models** (`Listing`, `Review`, `User`) plus a library-managed `sessions` collection. Seed data implies **49 listings, 10 users, and 185 reviews**. **Verified** from `models/*.js`, `init/data.js`, and `init/index.js`.
- Authentication is **Passport Local + `passport-local-mongoose`**, with sessions stored in MongoDB by `connect-mongo`. This is the highest-risk migration dependency because the signed session cookie, serialized session payload, and PBKDF2 password hash format are all Node/library-specific. **Verified**
- The AI surface has three endpoints:
  1. `POST /listings/ai/generate_description` — JSON response, direct `@google/genai` call.
  2. `POST /listings/ai/chat` — **plain-text streaming** via AI SDK `textStream`, server-side tool calls, no UI-message stream.
  3. `POST /listings/ai/search` — returns **rendered EJS HTML** after a structured Gemini extraction.
  **Verified** from `controllers/ai.js`, `routes/ai.js`, and `public/js/script.js`.
- The AI code uses **two different SDKs and two different environment-variable names** for the same Gemini credential. Chat/search read `GOOGLE_GENERATIVE_AI_API_KEY`; description generation reads `GEMINI_API_KEY` (or `GOOGLE_API_KEY`). **Verified** in application and installed provider source.
- Automated baseline tests now exist in `test/` and run via `npm test` (Node's built-in test runner plus `supertest`). They cover public pages, authentication, ownership/CRUD, reviews, the three AI contracts, categories, missing data, and health against a disposable local MongoDB database with Gemini, Cloudinary, and MapTiler doubled. There is still **no CI configuration, Dockerfile, or deployment manifest**. **Verified** from `package.json`, `test/`, and `git ls-files`; see `docs/PHASE_0_BASELINE_REPORT.md`.
- The current "booking platform" has **no booking, availability, reservation, payment, or messaging implementation**. It is a listings-and-reviews application. **Verified**.
- Retaining MongoDB is low-risk because the target can keep the existing collection names and field shapes. The difficult work is **authentication/session migration**, **AI streaming-protocol migration**, **HTML-partial decoupling**, and **schema/business-rule drift**, not the database move.
- The Tradium Nova target is a reasonable fit, but it should not be copied blindly. `@ai-sdk/react`, AI Elements, Streamdown, and Pydantic AI's `VercelAIAdapter` must be pinned and compatibility-tested together against the installed `ai` major (currently **7.0.16**). The exact adapter/AI SDK protocol pairing is **Unknown** until verified in a controlled environment.

---

## 1. Current architecture

### 1.1 Verified topology

```text
Browser
  ├─ EJS-rendered HTML (server-side layout + partials)
  ├─ Bootstrap 5 / Bootstrap Icons / Font Awesome / Google Fonts (CDN)
  ├─ /css/style.css, /css/ratings.css
  ├─ /js/script.js  (form validation, category filter, AI description, chat, AI search)
  └─ /js/map.js     (MapLibre GL JS + MapTiler style)
        │
        ▼
Express 5 application (app.js)
  ├─ express-session + connect-mongo  ──────────────► MongoDB: sessions
  ├─ Passport Local + passport-local-mongoose
  ├─ EJS + ejs-mate layout engine
  ├─ /listings, /listings/ai, /listings/:listingId/review, /
  ├─ multer + multer-storage-cloudinary ────────────► Cloudinary
  ├─ @maptiler/client forward geocoding ────────────► MapTiler
  ├─ @ai-sdk/google + `ai` streamText ──────────────► Gemini
  └─ @google/genai interactions ────────────────────► Gemini
        │
        ▼
MongoDB via Mongoose 9
  ├─ listings
  ├─ reviews
  ├─ users
  └─ sessions (connect-mongo)
```

### 1.2 Entry point and boot sequence

| Concern | Finding | Evidence |
|---|---|---|
| Entry point | `app.js` is the runtime entry point; `package.json` `main` says `index.js` but that file does not exist. Scripts use `node app.js`. | **Verified** — `app.js`, `package.json:8-12` |
| Framework | Express 5.2.1 | **Verified** — `package.json:28`, `package-lock.json` |
| Database | MongoDB via Mongoose 9.6.2 | **Verified** — `package.json:32` |
| Session store | `connect-mongo` 6.0.0, collection `sessions`, session payload encrypted with AES-256-GCM via the `crypto` option using `SECRET`, `touchAfter` 24 hours | **Verified** - `app.js:23-30`; `node_modules/connect-mongo/dist/index.cjs:43-70,187-210,332-345` |
| Session cookie | 7-day `maxAge`/`expires`, `httpOnly: true`, `secure` only when `NODE_ENV === "production"`, no explicit `sameSite`, no `app.set("trust proxy", ...)` | **Verified** — `app.js:36-47` |
| Server startup | Mongoose connects first; `app.listen(8080)` only runs after a successful connection | **Verified** — `app.js:49-62` |
| Health check | `GET /health` is registered before session middleware. If MongoDB is unreachable **at startup**, `app.listen` never runs, so the endpoint is unavailable. If MongoDB becomes unreachable **after startup**, `/health` still returns `{ ok: true }` because it does not check the database. | **Verified** - `app.js:49-75` |
| Port | Hard-coded `8080`; documented `PORT` is ignored | **Verified** — `app.js:56`; `env.example:24` |
| View engine | EJS with `ejs-mate`; views in `views/` | **Verified** — `app.js:64-68` |
| Static assets | Express serves `public/` at `/` | **Verified** — `app.js:69` |
| Body parsing | `express.urlencoded({ extended: true })` before routes; `express.json()` after session/passport | **Verified** — `app.js:66,81` |
| Method override | `_method` query/body support, used by EJS forms for PUT/DELETE | **Verified** — `app.js:67`; `views/listings/edit.ejs:9`; `views/listings/show.ejs:94,165` |
| Route order | `/listings` mounted before `/listings/ai`; AI routes still resolve because they are POST routes with two path segments, but the ordering is fragile | **Verified** — `app.js:98-100` |
| Error handling | AI paths return JSON errors; all other errors render `error.ejs` | **Verified** — `app.js:107-114` |
| 404 handler | Express 5 catch-all `app.all("*path", ...)` | **Verified** — `app.js:103-105` |

### 1.3 Frontend rendering approach

- **Server-side rendering only.** Every page is an EJS template rendered by Express. There is no React, Vite, bundler, hydration, or client-side router. **Verified** — `views/**`, `package.json`.
- The layout is `views/layouts/boilerplate.ejs`; pages call `<% layout("/layouts/boilerplate") %>`. **Verified** — `views/layouts/boilerplate.ejs:1-71`.
- Bootstrap 5.3.8, Bootstrap Icons, Font Awesome, Google Fonts, and MapLibre GL JS 5.9.0 are loaded from CDNs. **Verified** — `views/layouts/boilerplate.ejs:9-36`.
- Custom styling lives in `public/css/style.css` and `public/css/ratings.css`; chat styles are at `public/css/style.css:725-812`. **Verified**.
- The chat widget markup is embedded in the global layout, so it appears on every page. **Verified** — `views/layouts/boilerplate.ejs:49-62`.
- Client behavior is a single global script, `public/js/script.js`, loaded on every page. It assumes the chat widget exists. **Verified** — `views/layouts/boilerplate.ejs:68`; `public/js/script.js:119-147`.
- Map behavior is a separate `public/js/map.js`, loaded only by the show page. **Verified** — `views/listings/show.ejs:203`.

### 1.4 Routing structure

`app.js` mounts four routers plus the home/health routes:

| Mount | Router file | Responsibility |
|---|---|---|
| `GET /health` | inline | Liveness-style JSON |
| `GET /` | `controllers/listing.js` | Home page, rendering the listings index |
| `/listings` | `routes/listing.js` | Listing browse/show + CRUD |
| `/listings/ai` | `routes/ai.js` | Description generation, chat, natural-language search |
| `/listings/:listingId/review` | `routes/review.js` | Review create/delete |
| `/` | `routes/user.js` | Signup, login, logout |
| `*` | inline | 404 |

**Verified** — `app.js:71-105`; `routes/*.js`.

There are **19 application routes** (excluding the catch-all and terminal error handler). See §2.2 for the full table.

### 1.5 Dependencies (current)

All versions below are from `package.json` and resolved in `package-lock.json`. **Verified**.

| Package | Version | Role |
|---|---|---|
| `express` | 5.2.1 | HTTP framework |
| `mongoose` | 9.6.2 | MongoDB ODM |
| `ejs` / `ejs-mate` | 6.0.1 / 4.0.0 | Server templates and layout support |
| `express-session` | 1.19.0 | Session middleware |
| `connect-mongo` | 6.0.0 | MongoDB session store |
| `connect-flash` | 0.1.1 | Flash messages |
| `passport` / `passport-local` | 0.7.0 / 1.0.0 | Authentication |
| `passport-local-mongoose` | 9.1.0 | Username/password fields and hashing |
| `joi` | 18.2.1 | Request-body validation |
| `multer` / `multer-storage-cloudinary` | 2.2.0 / 4.0.0 | Multipart image upload to Cloudinary |
| `cloudinary` | 2.10.0 | Cloudinary SDK |
| `@maptiler/client` | 3.0.2 | Server-side forward geocoding |
| `ai` | 7.0.16 | Vercel AI SDK (`streamText`, `tool`, `generateObject`, `stepCountIs`) |
| `@ai-sdk/google` | 4.0.8 | Google Gemini provider for the AI SDK |
| `@google/genai` | 2.10.0 | Direct Gemini client used by the description generator |
| `zod` | 4.4.3 | Tool input and structured-output schemas |
| `dotenv` | 17.4.2 | Environment loading |
| `method-override` | 3.0.0 | HTML form PUT/DELETE emulation |
| `nodemon` | 3.1.14 | Development reload (declared as a production dependency) |

**Notable:** there is one `devDependency` (`supertest`) for the Phase 0 baseline suite; there is no linter, no formatter, and no TypeScript. `package.json` declares Node `22.22.2`. The README says Node 16+, which is stale. **Verified**.

### 1.6 Templates and static assets

| Path | Purpose | Evidence |
|---|---|---|
| `views/layouts/boilerplate.ejs` | Global HTML shell, CDN assets, navbar, flash, chat widget, footer | **Verified** |
| `views/includes/navbar.ejs` | Brand, Explore, Become a Host, Signup/Login/Logout | **Verified** |
| `views/includes/flash.ejs` | Success/error Bootstrap alerts | **Verified** |
| `views/includes/footer.ejs` | Brand, social links, dead footer links | **Verified** |
| `views/includes/listing.ejs` | Reusable listing card, also used as HTML fragment by AI search | **Verified** |
| `views/listings/index.ejs` | Hero, featured bento, category tabs, AI search, all-listings grid | **Verified** |
| `views/listings/show.ejs` | Detail, owner controls, map, reviews, review form | **Verified** |
| `views/listings/new.ejs` | Create form, AI description button, upload | **Verified** |
| `views/listings/edit.ejs` | Edit form, current image, upload replacement | **Verified** |
| `views/users/login.ejs`, `signup.ejs` | Auth forms | **Verified** |
| `views/error.ejs` | Error page | **Verified** |
| `public/css/style.css` | Main design system, hero/bento/chat styles | **Verified** |
| `public/css/ratings.css` | Star rating widget styles | **Verified** |
| `public/js/script.js` | Validation, category filter, AI description, chat, AI search | **Verified** |
| `public/js/map.js` | MapLibre map and marker | **Verified** |
| `public/images/*` | 21 local listing images plus hero image | **Verified** from seed data and filesystem |
| `public/favicon*`, `site.webmanifest`, web-app icons | Brand/PWA metadata | **Verified** |

### 1.7 Environment variables (names only)

No values are reproduced. `.env` is untracked; `.env.example` is actually named `env.example`. **Verified** — `.gitignore:2`; `env.example`.

| Name | Used by | Required for current runtime | Notes |
|---|---|---|---|
| `ATLAS_DB_URL` | `app.js` (app + session store) | Yes | Primary database connection string |
| `ATLAS_DB` | `init/index.js` only | Seeder only | Inconsistent with `ATLAS_DB_URL`; seeding fails if only the latter is set |
| `MONGO_URL` | Nothing | No | Documented in README and `env.example` but unused |
| `SECRET` | `app.js` session/crypto | Yes | Changing it invalidates existing sessions |
| `NODE_ENV` | `app.js`, `routes/listing.js` | No | Controls `secure` cookie and dotenv loading |
| `CLOUD_NAME`, `CLOUD_API_KEY`, `CLOUD_API_SECRET` | `cloudConfig.js` | Yes for uploads | Cloudinary credential |
| `MAPTILER_API_KEY` | `controllers/listing.js`, show page, `map.js` | Yes for map/geocode | Exposed to the browser for MapLibre |
| `GEMINI_API_KEY` | `@google/genai` description path | Yes for description | `GOOGLE_API_KEY` is also read by the library first |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `@ai-sdk/google` chat/search path | Yes for chat/search | Not interchangeable with `GEMINI_API_KEY` in code |
| `GOOGLE_API_KEY` | `@google/genai` library fallback | Optional | Presence unknown |
| `PORT` | Nothing | No | Documented but ignored; port hard-coded to 8080 |

**Key finding:** the two Gemini variables are not aliases in this code. Chat/search and description generation will fail independently if only one name is configured. **Verified** — `controllers/ai.js:1-4`; `node_modules/@ai-sdk/google/dist/index.js:7239-7244`; `node_modules/@google/genai/dist/node/index.cjs` `getApiKeyFromEnv()` reads `GOOGLE_API_KEY` then `GEMINI_API_KEY`.

### 1.8 Deployment and operational facts

- No Dockerfile, Procfile, GitHub Actions, Vercel/Render/Fly configuration, or reverse-proxy configuration exists. **Verified** — `git ls-files` and repository tree.
- The app listens on all interfaces at port 8080 after DB connection. **Verified** — `app.js:56`.
- No graceful shutdown handling, no request logging, no centralized error logging, no metrics, no tracing, no rate limiting, no CORS configuration, and no security headers. **Verified** by absence in `app.js` and dependencies.
- `npm test` runs the Phase 0 baseline suite serially (Node's test runner) against a disposable local MongoDB database. `/health` remains liveness-only. **Verified** — `package.json:12`, `test/`; see `docs/PHASE_0_BASELINE_REPORT.md`.
- Session cookies become `Secure` in production but Express is not told to trust a TLS-terminating proxy; behind a typical reverse proxy this can break authentication. **Inference**, high confidence, from `app.js:36-47` and absence of `trust proxy`.

---

## 2. Features and routes

### 2.1 Feature inventory

| Feature | Implemented? | Current implementation | Evidence |
|---|---|---|---|
| Browse all listings / home | Yes | Server renders all listings and populates every review | `views/listings/index.ejs`; `controllers/listing.js:5-8` |
| Featured "bento" selection | Yes | First four listings, client-independent | `views/listings/index.ejs:21-63` |
| Category filter | Yes, client-side only | Vanilla JS hides `.listing-col` elements by `data-category`; no URL state or server query | `public/js/script.js:39-65`; `views/includes/listing.ejs:2` |
| Listing detail | Yes | Server-rendered detail with owner, description, price, map, reviews | `views/listings/show.ejs`; `controllers/listing.js:49-57` |
| Map and marker | Yes | MapLibre + MapTiler style, coordinates from listing | `views/listings/show.ejs:3-6,114-125`; `public/js/map.js` |
| Signup / login / logout | Yes | Passport Local; username-based login; session cookie | `controllers/user.js`; `routes/user.js`; `app.js:83-85` |
| Create listing | Yes | Auth + multipart upload + Joi + MapTiler geocode + owner assignment | `routes/listing.js:14-19`; `controllers/listing.js:59-74` |
| Edit listing | Yes | Auth + owner + optional image replacement + geocode on location change | `routes/listing.js:23-31`; `controllers/listing.js:26-40` |
| Delete listing | Yes | Auth + owner + Mongoose hook deletes referenced reviews | `routes/listing.js:32`; `models/listing.js:58-62` |
| Image upload | Yes | Multer + Cloudinary, folder `airbnb_DEV`, png/jpg/jpeg | `cloudConfig.js:10-16`; `routes/listing.js:10-12` |
| Reviews and ratings | Yes | Create/delete, 1–5 stars, populated author, computed average | `controllers/review.js`; `models/review.js`; `views/listings/show.ejs:128-201` |
| AI description generation | Yes | Direct Gemini `interactions.create`, JSON response | `controllers/ai.js:10-43`; `public/js/script.js:67-106` |
| AI chat assistant | Yes | AI SDK `streamText`, two server-side tools, raw text stream | `controllers/ai.js:47-111`; `public/js/script.js:109-205` |
| AI natural-language search | Yes | Gemini structured filter extraction + Mongo query + EJS HTML fragment | `controllers/ai.js:113-151`; `public/js/script.js:207-253` |
| Health endpoint | Yes | `{ ok: true }`, but server only starts after DB connects | `app.js:71-75` |
| Booking / reservation / availability | **No** | No model, route, controller, or UI | **Verified** by absence |
| Payments | **No** | No integration | **Verified** by absence |
| User profile / owner dashboard | **No** | No routes or views | **Verified** by absence |
| Pagination / sorting / general keyword search | **No** | Index loads all listings; AI natural-language search is a separate endpoint | `controllers/listing.js:5-8` |
| Email verification / password reset | **No** | No routes, email dependency, or tokens | **Verified** by absence |
| Admin / moderation | **No** | No role field or admin routes | **Verified** by absence |
| Image gallery / multiple images | **No** | Single `image` object | `models/listing.js:13-16` |
| Footer social/legal links | Placeholder only | `href` values such as `/instagram`, `/privacy` have no routes → 404 | `views/includes/footer.ejs:12-44` |

**Business-scope finding:** the README calls Homestay a "booking platform," but the repository contains no booking engine. The migration must preserve what exists, not invent reservations. **Verified**; the product intent for bookings is **Unknown**.

### 2.2 Route map

Auth column: `—` means no authentication middleware; `auth` means `isLoggedIn`; `owner` means `isOwner`; `author` means `isAuthor`. Authentication failures currently redirect to `/login` rather than returning 401/403. **Verified** — `middleware.js:6-13`.

| # | Method | Path | Handler | Auth | Models | Page / consumer | Purpose and notes |
|---|---|---|---|---|---|---|---|
| 1 | GET | `/health` | inline | — | — | JSON client/monitor | Returns `{ ok: true }`; server startup gated on DB |
| 2 | GET | `/` | `listingController.index` | — | Listing → Review | `listings/index.ejs` | Home page; same handler as `/listings` |
| 3 | GET | `/listings` | `listingController.index` | — | Listing → Review | `listings/index.ejs` | Loads every listing and populates all reviews |
| 4 | POST | `/listings` | `listingController.createListing` | auth | Listing | Redirect `/listings` | Multer single `listing[image]`, Joi body, MapTiler geocode, owner assignment |
| 5 | GET | `/listings/new` | `listingController.renderNewForm` | auth | — | `listings/new.ejs` | Create form; includes AI description button |
| 6 | GET | `/listings/:id/edit` | `listingController.renderEditForm` | auth + owner | Listing | `listings/edit.ejs` | Loads listing; builds a 200×300 Cloudinary preview URL |
| 7 | PUT | `/listings/:id` | `listingController.updateListing` | auth + owner | Listing | Redirect `/listings/:id` | Multipart; re-geocodes only if location changed; falls back to existing geometry |
| 8 | DELETE | `/listings/:id` | `listingController.deleteListing` | auth + owner | Listing → Review | Redirect `/listings` | `findByIdAndDelete` triggers review cascade hook |
| 9 | GET | `/listings/:id` | `listingController.showListing` | — | Listing → Review → User; Listing → User | `listings/show.ejs` | Populates reviews with authors and owner; passes MapTiler token |
| 10 | POST | `/listings/ai/generate_description` | `aiController.generate_description` | — | — | `listings/new.ejs` via fetch | JSON `{ description }`; no auth/rate limit |
| 11 | POST | `/listings/ai/chat` | `aiController.chat` | — | Listing, Review (tools) | Global chat widget | Raw text stream; no auth/rate limit |
| 12 | POST | `/listings/ai/search` | `aiController.searchListingsNL` | — | Listing | `listings/index.ejs` via fetch | Returns EJS HTML partial; no auth/rate limit |
| 13 | POST | `/listings/:listingId/review` | `reviewController.postReview` | auth | Review, Listing | Redirect `/listings/:listingId` | Joi validation runs **before** auth; pushes reference and saves review |
| 14 | DELETE | `/listings/:listingId/review/:reviewId` | `reviewController.deleteReview` | auth + author | Review, Listing | Redirect `/listings/:listingId` | Pulls from supplied listing; does not verify review belongs to that listing |
| 15 | GET | `/signup` | `userController.renderSignupForm` | — | — | `users/signup.ejs` | Signup form |
| 16 | POST | `/signup` | `userController.userSignup` | — | User | Redirect `/listings` | Registers, auto-logs in; ignores saved redirect URL |
| 17 | GET | `/login` | `userController.renderLoginForm` | — | — | `users/login.ejs` | Login form |
| 18 | POST | `/login` | `passport.authenticate("local")` + `userController.userLogin` | — | User, Session | Redirect saved URL or `/listings` | Username/password; failure flash and `/login` |
| 19 | GET | `/logout` | `userController.userLogout` | — | Session | Redirect `/listings` | **State-changing GET**; no CSRF protection |
| — | ALL | `*path` | inline 404 | — | — | `error.ejs` | Express 5 catch-all |
| — | — | error middleware | inline | — | — | JSON for `/listings/ai*`, else `error.ejs` | Defaults to 500 |

**Verified** — `app.js:71-114`; `routes/listing.js:14-33`; `routes/ai.js:9-11`; `routes/review.js:7-11`; `routes/user.js:9-20`.

### 2.3 Pages and forms

| Page | URL | Template | Primary data | Forms / actions |
|---|---|---|---|---|
| Home / listings | `/`, `/listings` | `listings/index.ejs` | All listings + populated reviews | Category tabs (client-side), AI search input, links to detail |
| Listing detail | `/listings/:id` | `listings/show.ejs` | Listing, owner, reviews/authors | Owner edit/delete; review create/delete; contact-host is static text |
| New listing | `/listings/new` | `listings/new.ejs` | None | Multipart create; AI description button |
| Edit listing | `/listings/:id/edit` | `listings/edit.ejs` | Listing | Multipart update; replace image |
| Login | `/login` | `users/login.ejs` | None | Username/password |
| Signup | `/signup` | `users/signup.ejs` | None | Username/email/password |
| Error / 404 | any | `error.ejs` | Message | None |
| Chat widget | all pages | embedded in `boilerplate.ejs` | Browser sessionStorage + AI endpoint | Toggle, input, send, close |

### 2.4 Client-side behavior and state

| Behavior | Finding | Evidence |
|---|---|---|
| Bootstrap form validation | Prevents submit and adds `was-validated` | `public/js/script.js:2-15` |
| Navbar transparency | Scroll listener toggles `.scrolled` on the home page | `public/js/script.js:18-36` |
| Category filter | Hides/shows DOM columns; no server request; "All" restores captured HTML | `public/js/script.js:39-65` |
| Category filter fragility | `resultsContainer` is declared near the bottom of the script; "All" restores the HTML captured at page load, so it can discard AI search results or interact oddly with later DOM changes | **Inference**, high confidence — `public/js/script.js:42-65,218-219` |
| AI description | Reads `title`, `location`, `category`; posts JSON; writes response into textarea | `public/js/script.js:67-106` |
| Chat state | `sessionStorage` keys `chatConversation`, `chatWelcomeShown`, `chatOpen`; conversation is `{role, content}` only | `public/js/script.js:109-147` |
| Chat rendering | `textContent`, so Markdown is shown literally; no HTML parsing | `public/js/script.js:198-205` |
| Chat transport | `fetch`, then `res.body.getReader()` + `TextDecoder`; appends raw chunks | `public/js/script.js:165-187` |
| Chat concurrency | Disables input/send while streaming; no abort, retry, stop, or timeout | `public/js/script.js:154-195` |
| AI search | Posts `{query}`, reads `res.text()`, injects returned HTML into the grid | `public/js/script.js:221-245` |
| Map | Uses `mapToken` and coordinates injected by EJS | `views/listings/show.ejs:3-6`; `public/js/map.js` |

### 2.5 Access control summary

| Check | Behavior | Evidence |
|---|---|---|
| `isLoggedIn` | Stores `req.session.saveRedirectUrl`, flashes error, redirects `/login` | `middleware.js:6-13` |
| `isOwner` | Loads listing, checks `listing.owner.equals(req.user._id)`; redirects on missing listing/non-owner | `middleware.js:22-34` |
| `isAuthor` | Loads review, checks `review.author.equals(req.user._id)` | `middleware.js:56-68` |
| Review validation order | `validateReview` runs before `isLoggedIn`, so unauthenticated invalid bodies return 400 rather than redirecting to login | **Verified** — `routes/review.js:7-9` |
| AI endpoints | No authentication or authorization | **Verified** — `routes/ai.js:9-11` |
| Health | No auth | **Verified** |
| Admin roles | None | **Verified** |
| CSRF | No token mechanism anywhere; logout is GET | **Verified** by absence |
| Session rotation | No explicit `req.session.regenerate` on login | **Verified** by absence |
| Rate limiting | None | **Verified** by absence |

### 2.6 Unclear or inconsistent business rules

1. **Review default rating:** the "no rating" radio is checked and has value `1`, so submitting without selecting a star stores a 1-star rating. `views/listings/show.ejs:184`; Joi requires 1–5. **Verified.**
2. **Category coverage:** models/schema allow 11 categories, but `new.ejs` and `edit.ejs` expose only 8. Editing a `Hill Station`, `Heritage Homestay`, or `Houseboat` listing cannot retain its current category through the form. `schema.js:4-16`; `views/listings/new.ejs:34-42`; `views/listings/edit.ejs:46-54`. **Verified.**
3. **Redirect state:** `saveRedirectUrl` is never cleared after a successful login; a later login can redirect to a stale protected URL. `middleware.js:6-20`; `controllers/user.js:29-33`. **Verified / inference.**
4. **Geocoding failure:** create assigns `result.features[0]?.geometry` even when no feature exists; the schema then requires `geometry.type`/`coordinates`, causing a validation failure after the image was already uploaded. `controllers/listing.js:67-71`. **Verified.**
5. **Review/listing consistency:** delete accepts any `listingId` for an authored review and pulls from that listing, not necessarily the review's real listing. `controllers/review.js:15-20`. **Verified.**
6. **Booking semantics:** no availability, dates, guests, price calculation, or reservation status exists. **Verified.**
7. **Currency/locale:** INR symbol and `en-IN` formatting are hard-coded. `views/includes/listing.ejs:15-17`; `views/listings/show.ejs:87`. **Verified.**
8. **Contact host:** the detail page says "Contact host for availability" but provides no contact action. `views/listings/show.ejs:100-103`. **Verified.**

---

## 3. Database

### 3.1 Collection summary

| Collection | Model | Source of structure | Purpose | Key references |
|---|---|---|---|---|
| `listings` | `Listing` | Explicit Mongoose schema | Accommodation listing | `owner` → `users._id`; `review[]` → `reviews._id` |
| `reviews` | `Review` | Explicit Mongoose schema | Guest review | `author` → `users._id`; no `listingId` back-reference |
| `users` | `User` | Explicit schema + `passport-local-mongoose` fields | Local account | Referenced by listings, reviews, sessions |
| `sessions` | none | `connect-mongo` library | Express session store | Serialized Passport username (stored inside the encrypted session payload) → `users.username` |

**Verified** — `models/*.js`, `app.js:23-30`, `node_modules/connect-mongo`.

### 3.2 Relationship diagram

```text
users (_id)
  ├─< listings.owner
  ├─< reviews.author
  └─< sessions.session.passport.user   (serialized username; encrypted payload; not indexed)

listings
  └─ review[]  ──────< reviews._id
                         └─ author ──> users._id

reviews
  └─ (no listingId field; relationship is only discoverable by scanning listings.review[])
```

All relationships are application-level references. MongoDB enforces no foreign keys. **Verified.**

### 3.3 Constraints and indexes

| Collection | Declared constraints | Indexes | Gaps / risks |
|---|---|---|---|
| `listings` | `title` required; `category` required + enum (11 values); `geometry.type` enum `Point` + required; `geometry.coordinates` required. Because both are nested required paths, Mongoose validation rejects a listing with no `geometry` object at all, even though there is no parent-level `required: true`. | `_id_` only | No index on `owner`, `category`, `price`, or `geometry`; no 2dsphere; no text index; `description`, `price`, `location`, `country`, `image`, `owner` optional at schema level; legacy raw MongoDB documents can still lack `geometry` because MongoDB does not enforce the schema |
| `reviews` | `rating` min 1 / max 5; `createdAt` default `Date.now` | `_id_` only | `rating`, `comment`, `author` optional at schema level; no listing reference; no unique user/listing review constraint; no text/length limit |
| `users` | `email` required; `username` unique (plugin default) | `_id_`, unique `username` | Email not unique/indexed; no password policy; no roles; hash/salt `select:false` |
| `sessions` | `_id` unique; TTL on `expires` | `_id_`, TTL `expires` (`expireAfterSeconds: 0`) | Session payload is library-defined; no user index; TTL cleanup is eventual |

**Verified** — `models/*.js`; `schema.js`; `passport-local-mongoose` source; `connect-mongo` source. **Inference:** production may have manual indexes not represented in code; **Unknown** until inspected on a copy.

### 3.4 Important field notes

- `Listings.price` is a Mongoose `Number` with no min/max; INR integer validation exists only in Joi. Direct writes can store floats or negative values. **Verified.**
- `Listings.image` is a nested object, not a subdocument; it has no `_id`. Views assume `image.url` exists. **Verified.**
- `Listings.geometry` stores GeoJSON `Point` coordinates but has no geospatial index; MapLibre uses the coordinates directly on the client. **Verified.**
- `Listings.averageRating` is a **virtual**, not stored. It returns a **string** from `toFixed(1)` or `null`. It only works when `review` is populated. **Verified** — `models/listing.js:48-56`.
- `Reviews` have `createdAt` but no `updatedAt`; listings/users have no timestamps at all. **Verified.**
- `Users.email` is required but not used for login and not unique. **Verified.**
- `Users` password hashing defaults: PBKDF2-SHA256, 25,000 iterations, 512-byte key length, hex encoding, separate salt, `hash`/`salt` excluded from queries by default. **Verified** in installed plugin source. This matters for Python compatibility.
- `sessions` stores the session as an encrypted **string**: `connect-mongo` serializes the session (`stringify` defaults to true) and then encrypts it with AES-256-GCM via its `crypto` adapter using `SECRET`. **Verified** - `node_modules/connect-mongo/dist/index.cjs:43-70,332-345`.
- `sessions.expires` is derived from the seven-day cookie expiry; the library's fallback TTL is 14 days. **Verified.**
- `sessions.lastModified` exists because `touchAfter` is set to 24 hours. **Verified.**

### 3.5 Data dependencies and integrity rules

| Dependency | Consequence if violated | Evidence |
|---|---|---|
| `listings.owner` must reference an existing user | `isOwner` calls `owner.equals(...)`; missing owner → 500. Show view dereferences `owner.username`. | `middleware.js:22-34`; `views/listings/show.ejs:56-60` |
| `listings.review[]` must contain valid review IDs | Populate can yield `null`; `averageRating` can throw when reading `rating`; review count can be misleading. | `models/listing.js:51-56` |
| `reviews.author` must reference an existing user | Show view dereferences `author.username`; missing author → 500. | `views/listings/show.ejs:155-158` |
| Review documents should be referenced by exactly one listing | Delete route only pulls from the supplied listing; wrong ID leaves a dangling reference on the real listing and deletes the review. | `controllers/review.js:15-20` |
| Listing images should exist | Index/show/cards dereference `image.url` unconditionally. | `views/includes/listing.ejs:5`; `views/listings/show.ejs:46` |
| Prices should exist | Cards call `price.toLocaleString(...)` unconditionally. | `views/includes/listing.ejs:15-17` |
| Sessions reference users | Deleting a user would leave sessions until TTL; no user deletion exists. | `app.js:83-85`; `connect-mongo` |

**Cascades verified:** listing `findOneAndDelete` deletes all referenced reviews (`models/listing.js:58-62`); review deletion pulls the ID from the listing and deletes the review (`controllers/review.js:15-20`). **No cascade** exists for deleting users, orphan reviews, or Cloudinary assets.

### 3.6 Seed data

- `init/data.js` contains **49 sample listings**, **46 unique review-pool entries**, and **185 total review references** (3–4 per listing). **Verified** by executing the data module and counting.
- All 11 categories are represented; 21 listings use local images and 28 use remote URLs; prices range from 4,000 to 100,000. **Verified.**
- `init/index.js` creates **10 synthetic users** with `@example.com` addresses, then inserts listings and reviews round-robin. It uses `process.env.ATLAS_DB`, not `ATLAS_DB_URL`. **Verified.**
- The seeder deletes reviews, listings, then users before inserting. It does **not** clear sessions. **Verified.**
- Seed users share a default sample password. The literal value is intentionally not reproduced and must never be used in a deployed environment. **Verified** (existence), **security finding**.

### 3.7 Detailed schema

See `docs/HOMESTAY_SCHEMA_CATALOG.json` for field-by-field types, required/optional status, nullability, defaults, enums, validation layers, references, indexes, timestamps, evidence, confidence, and unknowns.

**Retention assessment:** MongoDB can be retained without a data rewrite if the migration preserves collection names, ObjectId string IDs, `createdAt` dates, image object shape, geometry shape, and the unidirectional review relationship. Renaming fields, normalizing reviews, or changing `averageRating` to a stored number would be a separate data migration and should not be bundled into the first cutover. **Inference**, high confidence.

---

## 4. AI chatbot

### 4.1 AI inventory

| Concern | Current implementation | Evidence |
|---|---|---|
| Chat UI markup | `#chatWidget`, `#chatToggleBtn`, `#chatBox`, `#chatWindow`, `#chatInput`, `#chatSendBtn` in the global layout | `views/layouts/boilerplate.ejs:49-62` |
| Chat CSS | Custom `.chat-widget`, `.chat-box`, `.chat-window`, `.chat-message`, `.chat-input-row` | `public/css/style.css:725-812` |
| Chat client logic | Global vanilla JS; sessionStorage persistence; fetch reader; `textContent` rendering | `public/js/script.js:109-205` |
| Backend endpoint | `POST /listings/ai/chat` | `routes/ai.js:10` |
| Backend handler | `streamText` with Gemini, system prompt, two tools, `stopWhen: stepCountIs(5)`, `pipeTextStreamToResponse` | `controllers/ai.js:83-111` |
| Provider SDK | `@ai-sdk/google` 4.0.8 + `ai` 7.0.16 | `package.json:18-21` |
| Provider env var | `GOOGLE_GENERATIVE_AI_API_KEY` | Installed `@ai-sdk/google` source |
| Model | `gemini-3.1-flash-lite` | `controllers/ai.js:91` |
| Tools | `searchListings`, `getListingReviews` | `controllers/ai.js:47-81` |
| Tool schemas | Zod `inputSchema` objects | `controllers/ai.js:49-54,70-72` |
| Conversation state | Browser `sessionStorage` only; no server-side history or message IDs | `public/js/script.js:110-117` |
| Streaming protocol | Raw plain-text body; `Content-Type: text/plain; charset=utf-8`; no SSE/UI-message framing | `node_modules/ai/dist/index.js:6098-6116`; `ai/dist/index.d.ts:2917-2921` |
| Auth | None on the endpoint | `routes/ai.js:10` |
| Error handling | 400 for missing/non-array `messages`; 500 JSON only if error occurs before piping; no structured mid-stream error | `controllers/ai.js:84-110` |
| Limits | 5 tool steps; 5 listing results per search tool; no token, history, or input-size limit | `controllers/ai.js:61,90-104` |
| Persistence | None; no conversation collection | **Verified** by absence |

### 4.2 Chat request/response contract

**Request (verified):**

```json
{
  "messages": [
    { "role": "user", "content": "Find a coastal stay under 8000" }
  ]
}
```

- Client stores and resends the full conversation, including the welcome message. `public/js/script.js:110-117,158-170`.
- Server checks only that `messages` is an array; an empty array is accepted, and roles, content types, size, and history length are not validated. `controllers/ai.js:85-88`.
- The client sends no IDs, no message parts, and no tool parts. This is compatible with AI SDK `ModelMessage[]`-style input but not a full UI-message contract. **Inference**, high confidence.

**Response (verified):**

- Status 200 with `Content-Type: text/plain; charset=utf-8`.
- Body is incremental UTF-8 text from `result.textStream`, not SSE and not an AI SDK UI message stream.
- Tool calls and tool results are executed server-side and are **not** sent as structured events. The client only sees whatever final prose the model emits.
- The client appends chunks and stores only the final assistant text. `public/js/script.js:173-187`.
- **Chunk-decoding defect:** the client calls `TextDecoder.decode(value)` without `{ stream: true }`, so a multi-byte UTF-8 character split across transport chunks can render as a replacement character and be persisted in `sessionStorage` that way. `public/js/script.js:177-184`. **Verified** by code inspection.
- If the model emits no text before tool execution, the user sees "Thinking..." until the first text delta. `public/js/script.js:163-176`.

**Important:** `pipeTextStreamToResponse` is marked deprecated in the installed `ai` 7.0.16 type definitions and is documented for removal in the next major release. **Verified** — `node_modules/ai/dist/index.d.ts:2917-2921`. The current chat endpoint is therefore already on a deprecation path independent of the migration.

### 4.3 Prompts

| Prompt | Location | Purpose and constraints |
|---|---|---|
| Description generator | `controllers/ai.js:12-35` | Warm editorial copy in exactly 2–3 sentences; highlight category/location; avoid clichés ("perfect getaway", "home away from home", "hidden gem"); use only supplied title/location/category; write around missing details; includes two few-shot examples. Interpolates client fields directly with no validation. |
| Chat system prompt | `controllers/ai.js:92-100` | Warm Homestay assistant; 2–4 sentence responses unless listing results; list title/location/price; honest review summary, not verbatim repetition; say when nothing is found; never invent tool-returned details; conversational presentation; expand country abbreviations/informal names and retry with formal names. |
| NL search extraction | `controllers/ai.js:129-132` | Extract `location`, `country`, `minPrice`, `maxPrice`, `category` from free text; respect "more than"/"above" as minimum; expand country abbreviations/informal names. |

**Verified.** Prompts are hard-coded, not stored in configuration or a prompt registry. There is no prompt versioning, evaluation set, or injection defense.

### 4.4 Tools

| Tool name | Input schema | Execution | Result | Limits and risks |
|---|---|---|---|---|
| `searchListings` | `location?`, `country?`, `maxPrice?`, `category?` (all optional) | Builds a Mongo query: `location`/`country` case-insensitive unescaped regex; `price <= maxPrice`; exact `category`; `limit(5)` | Array of `{title, location, country, price, category}` | No escaping of regex input; potential regex injection/ReDoS; no price bounds; category is case-sensitive and exact here (unlike NL search, which uses case-insensitive regex); only 5 results; no pagination |
| `getListingReviews` | `listingTitle` (required string) | `findOne({ title: { $regex: listingTitle, $options: "i" } }).populate("review")` | `{title, reviews: [{rating, comment}]}` or `{error: "Listing not found"}` | Unanchored regex and `findOne` are nondeterministic when multiple titles match; no author/date in result; no review count/summary limit; unescaped regex |

**Verified** — `controllers/ai.js:47-81`. Tool names, argument names, and result keys are a frontend/backend contract if AI Elements is to render tool parts.

**Behavioral note:** because tool results are plain JSON and the client never receives tool parts, the current UI cannot show a "searching listings" or "reading reviews" step. The model composes the visible answer. A target AI Elements UI can expose these steps only if the backend emits structured tool parts in a UI message stream.

### 4.5 What can be retained vs what must change

| Area | Retain | Adapt / replace | Reason |
|---|---|---|---|
| Business intent and prompts | Yes | — | Prompts can be ported; keep wording/tests |
| Tool names/semantics | Preserve names and argument/result shapes where possible | Reimplement in Python | Frontend/tool contract continuity |
| Database queries | Semantics only | Replace Mongoose with Python Mongo access | Driver and query construction differ |
| Model/provider | Gemini is viable | Centralize model config; verify model availability | Model names/env names currently scattered and split |
| Chat UI | No | Replace with AI Elements | Current UI is hand-written, plain text, no accessibility/tool UI |
| Chat transport | No | Replace with UI message stream | Raw text cannot support AI Elements tool/message parts |
| Conversation storage | No (sessionStorage only) | Decide server-side or client-side history | Current history is tab-scoped and contains only text |
| Description endpoint | JSON contract yes | Port to Python; add validation/auth | Simple, non-streaming |
| NL search | Filter semantics yes | Return JSON, not HTML | HTML partial is server-rendering-specific |
| Auth on AI | Currently none | Decide and enforce | Cost abuse and prompt-injection exposure |
| Error contract | Generic messages | Structured errors + safe UI states | Current mid-stream failures are opaque |

### 4.6 Security and behavior gaps in the current chatbot

- **No authentication, authorization, rate limiting, or quota** on all three AI endpoints. **Verified.**
- **No input-size or history limit**; `express.json()` defaults to a 100 KB body, so long chats eventually fail with 413. **Inference** from Express defaults and unbounded sessionStorage history.
- **Client-controlled system messages:** the server forwards the client `messages` array without role validation, so a caller may supply a `system` role or unexpected message shapes. **Inference**, high confidence; behavior depends on AI SDK message normalization.
- **Prompt injection:** user text can attempt to override system instructions; description inputs are interpolated directly. Tool access is read-only but can expose all listing/review data (currently public). **Verified** by code structure.
- **Regex injection / ReDoS:** unescaped user/model-controlled strings become Mongo `$regex`. **Verified.**
- **No output moderation or PII handling.** **Verified** by absence.
- **Markdown is not rendered today**, so HTML/XSS risk is low in the current UI (`textContent`). Moving to Streamdown will introduce a new rendering surface that must be sanitized/tested. **Inference**, high confidence.
- **No observability** for model, token usage, latency, tool calls, or failures. **Verified** by absence.
- **No idempotency or abort handling**; closing the widget does not abort an in-flight request. **Verified** — `public/js/script.js:119-147`.

---

## 5. Migration risks

Severity reflects migration impact, not necessarily current production severity.

| # | Risk | Severity | Evidence | Impact | Mitigation |
|---|---|---|---|---|---|
| 1 | Authentication/session incompatibility | **High** | `app.js:23-47,77-85`; `connect-mongo`; Passport | Express `connect.sid` cookies cannot be consumed by FastAPI without reproducing cookie signing, session serialization, and Passport user deserialization. Users may be logged out or auth may be bypassed if implemented loosely. | Choose an explicit auth strategy in Phase 2. Recommended: FastAPI-issued session/JWT, verify existing PBKDF2 hash on first login, then rehash. Do not attempt a last-minute session bridge. |
| 2 | Password hash format compatibility | **High** | `passport-local-mongoose` defaults; `models/user.js:12` | If Python cannot verify the existing PBKDF2-SHA256/25k/512/hex hash, all users must reset passwords. | Implement and test a Python verifier against synthetic hashes; support rehash-on-login. Never log hashes. |
| 3 | Chat streaming protocol change | **High** | `controllers/ai.js:106`; `ai` type defs | Current client expects raw text. AI Elements/`useChat` expects a UI message stream with parts. Switching one side first breaks chat. | Version the endpoint (`/api/ai/chat` UI stream; optional legacy `/api/ai/chat/text`), migrate both deliberately, contract-test chunks. |
| 4 | AI provider/env split | **High** | `controllers/ai.js:1-4`; installed provider source | Chat/search and description use different env names. A deployment can have one feature working and the other failing. | Centralize provider config in FastAPI; map one secret to one internal setting; startup validation; tests for missing key. |
| 5 | AI search returns HTML | **Medium** | `controllers/ai.js:145-146`; `public/js/script.js:239-245` | HTML partial is coupled to EJS and cannot be rendered safely in React without `dangerouslySetInnerHTML`. | Return JSON listings (and facets/errors); rebuild cards in React; keep a temporary HTML adapter only if needed for rollback. |
| 6 | Tool semantic drift | **Medium** | `controllers/ai.js:55-80` | Reimplementation can change case sensitivity, regex behavior, limits, category matching, or `findOne` selection, producing different answers. | Freeze tool contracts and golden cases; port queries one-for-one; add contract tests before changing semantics. |
| 7 | MongoDB schema drift / weak validation | **High** | `models/*.js`; `schema.js` | Fields required only by Joi are optional in Mongo; production may contain missing images/prices/owners, dangling reviews, duplicate emails. Python models that are stricter will reject existing documents. | Audit a copy of production; treat Pydantic response models as permissive at first; add data-quality checks; do not add unique email until duplicates are resolved. |
| 8 | Review relationship is unidirectional and inconsistent | **High** | `models/review.js`; `controllers/review.js:15-20` | No `listingId` on Review; deletion can corrupt the listing array; queries by listing require scanning. | Preserve existing shape initially; fix deletion validation; consider a later additive `listingId` backfill, not a cutover-day change. |
| 9 | Owner/author/image/price null assumptions | **Medium** | Views dereference these fields | A single malformed document can 500 a page; React may show broken cards. | Validate response data; defensive UI; data-quality report; fix records or provide fallbacks. |
| 10 | Category form omits 3 valid values | **Medium** | `schema.js:4-16` vs `new.ejs:34-42`, `edit.ejs:46-54` | Editing seeded Heritage/Hill Station/Houseboat listings can silently change category. | Fix in React forms; include all 11; add a regression test. Do not "fix" data to match the 8-value form. |
| 11 | CSRF / session security | **High** | No CSRF tokens; GET logout; cookie settings | Cookie-authenticated mutations are forgeable; logout can be triggered cross-site; secure cookie may fail behind proxy. | SameSite + CSRF token or same-origin strict API; POST logout; trust proxy; rotate session on login; security tests. |
| 12 | Public AI endpoints / cost abuse | **High** | `routes/ai.js:9-11` | Anyone can spend Gemini quota and use the app as a free LLM proxy; prompt injection can probe data. | Auth or anonymous quota, rate limiting, max input/history/tokens, timeouts, provider budget alerts, logging. |
| 13 | Markdown/XSS in new chat UI | **High** if unsanitized | Current `textContent`; target Streamdown | Rendering model output as Markdown/HTML can introduce script URLs, raw HTML, or malicious images. | Sanitize links/HTML, disable raw HTML, test XSS payloads, restrict image domains, CSP. |
| 14 | Cloudinary dependency/version mismatch | **Medium** | `package.json`; lock peer metadata | `multer-storage-cloudinary@4.0.0` declares peer `cloudinary@^1.21.0` but installed Cloudinary is 2.10.0. Current install likely required legacy peer handling. Upload behavior may change in Python. | Keep Cloudinary account; use a supported Python SDK or signed direct upload; test MIME/size/format; add asset cleanup policy. |
| 15 | MapTiler key exposure and geocode failures | **Medium** | `views/listings/show.ejs:4`; `controllers/listing.js:34,67` | Browser-visible key can be abused; geocoding can return no feature, causing save failure after upload. | Restricted public key + separate server key if supported; validate geocode result; handle no-result and timeout; don't block listing save unnecessarily. |
| 16 | No parity tests / no CI | **High** | `package.json:12`; `test/`; no CI config | A Phase 0 baseline suite now covers public, auth, ownership, review, AI, category, and health contracts (44 passing, 10 deferred). Refactoring still cannot prove full parity, and nothing runs the suite automatically. | Extend the baseline before each porting phase; add CI that runs `npm test` against a disposable Mongo service; replace characterization assertions as defects are fixed. |
| 17 | Deployment/env inconsistencies | **Medium** | `ATLAS_DB` vs `ATLAS_DB_URL`; ignored `PORT`; no manifest | New deployment can connect to the wrong DB, fail to seed, or bind the wrong port. | Single settings module, startup validation, documented env matrix, container/CI config, health/readiness split. |
| 18 | SEO/SPA regression | **Medium** | Current server-rendered pages; target Vite SPA | Listing pages may lose crawlable HTML, social previews, and fast first paint. | Decide SEO requirement early; if critical, use SSR/prerender or a meta-tag strategy; otherwise accept and document. |
| 19 | Duplicate AI invocations in React | **Medium** | Target `useChat`/effects; current vanilla sends on click only | StrictMode, re-renders, or effects can double-send, doubling cost and producing duplicate messages. | Send only from explicit submit; no send in `useEffect`; guard with refs/AbortController; test StrictMode and remounts. |
| 20 | Chat history loss / behavior change | **Low–Medium** | `sessionStorage` only | Users lose cross-tab/history behavior; target may persist differently. | Decide history policy; migrate or intentionally reset; show welcome once; test reload/close-tab behavior. |
| 21 | Observability gap | **Medium** | No logs/metrics/tracing | Cannot diagnose auth failures, tool errors, or token spend during cutover. | Structured logs with request IDs, AI usage metrics, error tracking, dashboards, alerting. |
| 22 | MongoDB retention itself | **Low** | Same collections/fields | Low if schema is preserved; risk comes from changed field names or stricter validation. | No data rewrite in early phases; contract tests against a copy; additive changes only. |

### 5.1 Authentication and session dependency detail

Current flow:

1. `passport.authenticate("local")` verifies the username/password using `passport-local-mongoose`'s PBKDF2 verifier. **Verified** — `routes/user.js:15-18`; plugin source.
2. Passport serializes the **username** into `req.session.passport.user` (the plugin's `serializeUser`, not the `_id`); `express-session` persists the session via `connect-mongo`. **Verified** - `app.js:83-85`; `node_modules/passport-local-mongoose/dist/index.js:170-181`.
3. The browser receives a signed `connect.sid` cookie. **Verified** by Express/connect-mongo defaults.
4. Protected routes rely on `req.isAuthenticated()` and `req.user`. **Verified** — `middleware.js:6-13`.

Migration consequences:

- A FastAPI service cannot simply read `req.user`; it must parse and trust the same cookie/session or issue its own.
- Reusing the Express cookie requires replicating `cookie-signature` signing with `SECRET`, reading the serialized session string, decrypting/integrity-checking it as connect-mongo does, and mapping `passport.user` to a user. This is brittle and couples FastAPI to Node internals. **Inference**, high confidence.
- A new FastAPI session/JWT invalidates existing sessions; users must log in again. Whether that is acceptable is a product decision. **Unknown.**
- If the current session store uses `crypto.secret`, changing `SECRET` or the encryption format invalidates sessions. **Verified** — `app.js:23-30`.
- Password hashes can likely be verified in Python with PBKDF2-HMAC-SHA256, 25,000 iterations, 512-byte derived key, hex salt/hash, but this must be proven with synthetic data before committing to a no-reset migration. **Inference**, high confidence; test required.

### 5.2 External integrations

| Integration | Current use | Failure behavior | Migration concern |
|---|---|---|---|
| Cloudinary | Image upload via Multer storage; folder `airbnb_DEV`; png/jpg/jpeg | Missing credentials/upload errors surface through Express error handler; no cleanup of uploaded assets on later validation failure | Keep account; decide server-side upload vs signed direct upload; add deletion/cleanup; verify transformations/preview URLs |
| MapTiler | Server geocoding + browser map style | Missing result leaves geometry undefined on create; map may fail without token | Keep provider; restrict public key; handle geocode errors; consider caching/rate limits |
| Gemini | Description, chat, NL search | Per-endpoint failures; no retries/timeouts/usage logs | Centralize model/provider config; verify model access; add budgets, timeouts, retries with backoff, observability |
| MongoDB | App data + sessions | App won't start if initial connection fails; health not independent | Retain initially; separate readiness from liveness; backup/restore test before cutover |

### 5.3 Tests and quality gates (Phase 0 update)

- A baseline suite exists at `test/phase0-baseline.test.js`, run by `npm test` with Node's built-in test runner and `supertest`. **Verified** — `package.json`, `test/`.
- The suite uses a unique disposable local MongoDB database (`homestay_phase0_test_<pid>_<timestamp>`), dummy provider credentials, and doubles for Gemini, MapTiler, and Cloudinary. Outbound `fetch`/HTTPS is disabled. **Verified** — `test/helpers/`.
- Latest result: **54 tests, 44 pass, 10 todo, 0 fail, 12 suites** (approximately 10 seconds). **Verified** — `npm test`.
- The 10 `it.todo` cases record deferred secure/future contracts: POST-only logout, CSRF on mutations, cross-listing review deletion, AI auth/rate limits, regex escaping, no-rating semantics, all 11 categories, controlled missing-data errors, `/ready`, and versioned UI message streaming. **Verified** — `test/phase0-baseline.test.js`.
- Characterization tests deliberately assert current defects: raw provider error leakage, unescaped regex, empty image `src`, 500s on missing price/owner, default map coordinates, 8-of-11 categories, `/health` ignoring MongoDB, and GET logout. These must be replaced, not preserved, in the relevant phases. **Verified** — `docs/PHASE_0_BASELINE_REPORT.md`.
- No linting/formatting/type checking. **Verified.**
- No CI pipeline to run checks. **Verified.**
- No browser/E2E, accessibility, or client-side JavaScript tests; Cloudinary MIME/size validation is bypassed by the upload double. **Verified** — see Phase 0 report limitations.
- Chat toggle still lacks an explicit `aria-label`, input lacks a `<label>`, and focus management is absent. **Verified** — `views/layouts/boilerplate.ejs:49-62`.

### 5.4 Deployment considerations

- Frontend and backend will likely be separate origins during development (Vite dev server + FastAPI). Cookie auth requires an explicit CORS/credentials and proxy strategy. **Inference**, high confidence.
- Production cookie settings need TLS, `Secure`, `SameSite`, and trusted proxy configuration. **Inference** from `app.js:36-47`.
- Two runtimes mean two dependency ecosystems, two lockfiles, two security-update streams, and two deploy pipelines. **Inference.**
- The current hard-coded port and ignored `PORT` must not be carried forward. **Verified.**
- The readiness check must distinguish "app process alive" from "Mongo reachable"; the current health route does not, because listen is gated on DB connection. **Verified.**
- Easy Invites rebranding (name, domain, logo, copy, metadata) should be a separate change set after functional parity, not mixed with migration commits. **Recommendation.**

---

## 6. Recommended migration phases

The sequence is a strangler migration with MongoDB retained. Each phase must be independently deployable and reversible. Do not combine the Easy Invites rebrand with functional migration.

| Phase | Scope | Major dependencies | Practical acceptance criterion |
|---|---|---|---|
| **0. Baseline and contracts** | Freeze current behavior: inventory routes, schemas, AI prompts/tools, stream format, auth flows; create synthetic fixtures; add smoke tests around the existing app. | Test runner, HTTP client, ephemeral Mongo, mocked Gemini/Cloudinary/MapTiler | A repeatable test suite proves: browse/detail, signup/login/logout, owner-only CRUD, review create/delete, AI description JSON, chat text stream, AI search HTML. No production services used. |
| **1. Read-only React + FastAPI slice** | Stand up React/Vite shell and FastAPI read APIs for listings list/detail; keep Express live for auth/mutations. Feature-flag or route traffic. | React, Vite, Tailwind, shadcn/ui, FastAPI, Uvicorn, Python Mongo driver, Pydantic models | React home/list/detail match current data and visual intent; all 49 seed listings render; pagination absent but behavior documented; no write path yet; rollback to EJS is one flag. |
| **2. Authentication and ownership** | Implement signup/login/logout, session or token issuance, current-user endpoint, owner/author checks. Prove PBKDF2 compatibility or explicitly require re-login. | FastAPI auth stack, cookie/CSRF or token strategy, PBKDF2 verifier, synthetic hash tests | Signup/login/logout pass; invalid credentials fail safely; owner-only edit/delete returns 403; author-only review delete returns 403; session rotation and cookie flags verified; no password/hash in logs; decision on existing sessions recorded. |
| **3. Listing CRUD, uploads, maps** | Port create/edit/delete, multipart upload, Cloudinary integration, MapTiler geocoding, geometry persistence, category enum (all 11). | Cloudinary SDK or signed upload, HTTP client for MapTiler, image validation, multipart support | Create/edit/delete parity; image upload and replacement work; geocode success and no-result paths tested; owner checks enforced; category round-trips for all 11 values; failed upload does not leave UI stuck or orphan silently. |
| **4. Reviews** | Port review create/delete; preserve 1–5 rating and author checks; fix listing/review consistency. | FastAPI, Mongo, auth dependencies | Authenticated review create; unauthenticated rejected; author-only delete; review cannot be deleted through a mismatched listing; listing review array and review document stay consistent; average rating matches current behavior. |
| **5a. Non-streaming AI** | Port description generation and NL search to FastAPI/Pydantic AI or direct provider; return JSON for search; centralize model config. | Pydantic AI + Google provider, Gemini key, prompt fixtures, Pydantic response models | Description returns the expected JSON shape and 2–3 sentence style on golden prompts; NL search extracts min/max/category/location/country; metacharacters are escaped; no HTML returned; provider errors are safe and observable. |
| **5b. Streaming chat** | Implement UI-message-stream chat with Pydantic AI `VercelAIAdapter` or a verified adapter; port both tools; build React chat with AI Elements; keep a legacy text endpoint only if rollback requires it. | `ai` + `@ai-sdk/react` matching majors, AI Elements vendored, Streamdown, adapter version, tool contract tests, AbortController | Chat streams incrementally; tool calls/results appear as structured parts or are deliberately hidden; Markdown renders safely; no duplicate sends under StrictMode; abort/stop works; step limit and error states tested; token/usage logged. |
| **6. Cutover and hardening** | Move all traffic to React/FastAPI; keep Mongo; add observability, rate limits, CSRF, security headers, backups, runbooks; decommission EJS/Express. | CI/CD, monitoring, secrets management, load test, backup/restore | All routes pass contract/parity tests; auth and AI smoke tests pass in staging; p95 latency and error budget accepted; rollback to Express verified during a defined window; no secrets in client bundle or logs; backups restore tested. |
| **7. Easy Invites rebrand (separate)** | Name, domain, logo, palette, copy, metadata, email/social handles. | Brand assets, DNS/domain, legal/privacy review | Rebrand is functionally invisible: same routes/data/behavior; SEO/metadata updated deliberately; rollback independent of migration. |

**Phase 0 outcome (2026-10-26):** Implemented on `migration/phase-0-baseline` and uncommitted. `npm test` runs 54 tests (44 pass, 10 deferred, 0 fail) against a disposable local database with Gemini, Cloudinary, and MapTiler doubled; the normal app still starts on port 8080. See `docs/PHASE_0_BASELINE_REPORT.md` for coverage, defects, and limitations. Phase 0 is complete for the Express baseline; CI and the deferred secure contracts remain open.

### 6.1 Sequencing rationale

- **Read before write:** read-only APIs expose schema/serialization problems before auth or mutations complicate rollback.
- **Auth before CRUD:** owner/author rules are required for every write path; retrofitting auth after CRUD creates security gaps.
- **Non-streaming AI before chat:** description/search validate the Python provider path, prompts, and observability without the streaming protocol risk.
- **Chat last among functional slices:** it has the highest contract coupling (AI SDK version, adapter, tool parts, UI components).
- **Rebrand last and separate:** it changes presentation and metadata, not behavior, and should not obscure migration regressions.

### 6.2 Cross-phase dependencies

```text
Phase 0 (contracts/fixtures)
   ├─► Phase 1 (read APIs/UI)
   │      └─► Phase 3 (CRUD/uploads/maps) ─► Phase 6 (cutover)
   ├─► Phase 2 (auth/ownership) ────────────┘
   ├─► Phase 4 (reviews) ───────────────────┘
   └─► Phase 5a (description/search) ─► Phase 5b (chat stream) ─► Phase 6
```

Phase 1 can begin before Phase 2, but no mutation should be exposed to users until Phase 2 is complete. Phase 5b must not ship until the adapter/stream contract is proven against the exact frontend SDK version.

### 6.3 Rollback strategy

- Keep Express/EJS deployed behind a routing flag until Phase 6 acceptance.
- Do not run destructive Mongo migrations; retain the original collections unchanged.
- For AI chat, keep the legacy text endpoint and old UI available until the UI-message path passes streaming/tool tests; route by feature flag or path version.
- Treat session migration as a one-way door only after a tested rollback plan; if re-login is required, communicate it explicitly.

---

## 7. Target architecture gap analysis

### 7.1 Target reference (Tradium Nova)

This is the **preferred target design** supplied for this audit. It is not a claim about Homestay's current code.

```text
React + Vite (TypeScript optional, decide)
  ├─ Tailwind CSS + shadcn/ui
  ├─ Vercel AI Elements (vendored component source)
  ├─ `ai` + `@ai-sdk/react` (chat transport/state)
  ├─ Streamdown (Markdown rendering)
  └─ Reusable chat components, not a hand-written widget
        │  UI message stream / JSON
        ▼
FastAPI (Python)
  ├─ REST routes for listings, reviews, auth
  ├─ Pydantic request/response models
  ├─ Pydantic AI + Google/Gemini provider
  ├─ Pydantic AI `VercelAIAdapter` (version must match frontend SDK)
  └─ Centralized model/provider configuration
        │
        ▼
MongoDB retained initially (same collections/fields)
        │
        ├─ Cloudinary (images)
        └─ MapTiler (geocoding / map tiles)
```

**Target principles that matter for this project**

- Chat must use a **Vercel AI-compatible UI message stream** if AI Elements/`useChat` is adopted.
- Any endpoint that remains plain-text must keep its **exact current streaming contract** until both sides are migrated together.
- Authentication/authorization must be re-established securely; do not carry over the current CSRF/GET-logout weaknesses.
- Model configuration must be centralized in one Python settings module; no model strings scattered across routes.
- Avoid duplicate model invocations from React effects, polling, or re-renders.
- Vendor AI Elements source and pin its registry snapshot; do not assume an npm package version.

### 7.2 Component classification

| Current component | Classification | Target | Why / gap |
|---|---|---|---|
| Express `app.js` bootstrap | **Replace** | FastAPI app factory + lifespan + routers | Different framework, middleware, error model |
| EJS layout and pages | **Replace** | React Router layout/pages | No direct EJS-to-React reuse; visual parity must be rebuilt |
| Bootstrap + custom CSS | **Adapt** | Tailwind + shadcn/ui + design tokens | Brand/layout intent can be preserved, not the CSS itself |
| Global vanilla `script.js` | **Replace** | React hooks/components/state | DOM manipulation and global state do not port |
| Category filter | **Replace** | React state + URL query (recommended) | Current filter is client-only and not shareable |
| MapLibre map | **Retain** | React map component wrapping MapLibre | Library is framework-agnostic; keep map behavior |
| MapTiler geocoding | **Adapt** | FastAPI service call | Keep provider; move server call to Python; validate results |
| Cloudinary upload | **Adapt** | FastAPI multipart or signed direct upload | Keep asset provider; Python SDK/signing differs |
| Mongoose models | **Adapt** | Python Mongo data layer + Pydantic models | Keep collection/field names; validators may differ |
| MongoDB data | **Retain** | Same database/cluster initially | No data rewrite required if schema is preserved |
| Passport Local auth | **Replace / Adapt** | FastAPI session or token; PBKDF2 verify + rehash | Highest-risk component; sessions are Node-specific |
| `connect-mongo` sessions | **Replace** | New session store or token strategy | Do not couple FastAPI to connect-mongo internals |
| Flash messages | **Replace** | React toasts / query state | Server flash is EJS-specific |
| Listing read/CRUD controllers | **Adapt** | FastAPI services/routers | Port business rules, not code |
| Review controller | **Adapt** | FastAPI | Fix listing/review consistency and default-rating bug |
| AI description | **Adapt** | FastAPI + Pydantic AI or provider SDK | JSON contract can survive; add validation/auth |
| AI chat | **Replace transport / Adapt logic** | FastAPI `VercelAIAdapter` + React `useChat`/AI Elements | Raw text stream cannot feed AI Elements tool parts |
| AI tools | **Retain semantics / Reimplement** | Python tools | Preserve names, args, result keys; test behavior |
| AI NL search | **Adapt** | FastAPI JSON endpoint + React cards | HTML partial must become data |
| Chat widget UI | **Replace** | AI Elements | Current widget is plain text, custom CSS, no tool UI |
| Health endpoint | **Retain intent / Adapt** | `/api/health` + `/api/ready` | Split liveness from DB readiness |
| Seed script | **Retain temporarily / Adapt** | Python seeder or one-off Node tool | Not a production path; do not block migration |
| Tests | **Add** | pytest + Vitest/RTL + Playwright | None exist today |
| Deployment | **Replace** | Separate frontend/backend or reverse proxy | CORS, cookies, TLS, secrets, health checks |
| SEO behavior | **Unknown** | Vite SPA or SSR/prerender | Requires product decision; see departure triggers |

**Classification counts:** approximately Retain 2 (MongoDB, MapLibre) plus tool semantics, Adapt 10, Replace 10, Add 1 (tests), Unknown 1 (SEO strategy). Counts are approximate because some rows mix labels (for example, AI chat is "replace transport / adapt logic"); the point is that little UI/controller code is reusable as-is.

### 7.3 Express → FastAPI route map

Proposed paths are illustrative and should be finalized as an API contract before implementation. Use `/api` prefix to separate from the SPA and static assets.

| Current Express route | Proposed FastAPI route | Method/contract | Notes |
|---|---|---|---|
| `GET /health` | `GET /api/health` | JSON `{status}` | Also add `GET /api/ready` that checks Mongo |
| `GET /` | — (React route `/`) | React page | Home page uses `GET /api/listings` |
| `GET /listings` | `GET /api/listings` | JSON list; optional `category`, `q`, `page`, `limit` | Preserve current category enum and INR price |
| `GET /listings/:id` | `GET /api/listings/{listing_id}` | JSON detail with owner + reviews | Return average rating as number or documented string? Prefer number; contract decision |
| `POST /listings` | `POST /api/listings` | Multipart or image-first flow; auth required | Owner derived from session, never from body |
| `GET /listings/new` | — (React `/listings/new`) | React page | Fetch categories/config |
| `GET /listings/:id/edit` | `GET /api/listings/{id}` + React `/listings/{id}/edit` | React page | Owner check on API + UI |
| `PUT /listings/:id` | `PATCH /api/listings/{id}` or `PUT` | Multipart; auth + owner | Keep semantics documented; PATCH is preferable for optional image |
| `DELETE /listings/:id` | `DELETE /api/listings/{id}` | Auth + owner | Preserve review cascade; add Cloudinary cleanup decision |
| `POST /listings/:id/review` | `POST /api/listings/{id}/reviews` | JSON; auth required | Validate rating/comment; store author from session |
| `DELETE /listings/:listingId/review/:reviewId` | `DELETE /api/listings/{listing_id}/reviews/{review_id}` | Auth + author | Verify review belongs to listing before delete |
| `GET /signup` | — (React `/signup`) | React page | — |
| `POST /signup` | `POST /api/auth/signup` | JSON; set session/token | Validate email/username/password policy |
| `GET /login` | — (React `/login`) | React page | — |
| `POST /login` | `POST /api/auth/login` | JSON; set session/token | Failure returns 401, not redirect/flash |
| `GET /logout` | `POST /api/auth/logout` | Auth optional; clears session | Never state-changing GET |
| — | `GET /api/auth/me` | JSON current user or 401 | React session bootstrap |
| `POST /listings/ai/generate_description` | `POST /api/ai/description` | JSON `{description}` | Auth/rate limit recommended |
| `POST /listings/ai/chat` | `POST /api/ai/chat` | UI message stream | New contract; version it |
| `POST /listings/ai/search` | `POST /api/ai/search` | JSON listings + filters | Replaces HTML fragment |
| `*` | FastAPI 404 + React `NotFound` | JSON for `/api/*`, HTML fallback only if served | Error shape consistent |

**Contract rules**

- IDs are strings in JSON; never expose raw BSON.
- Dates are ISO-8601 strings.
- Prices are numbers in INR; do not add currency conversion silently.
- `category` remains the same 11-value enum.
- Auth failures for API clients are `401`; authorization failures are `403`; validation is `422` (FastAPI) or a documented `400`.
- Do not return EJS or HTML from JSON endpoints.

### 7.4 EJS page → React page map

| Current page | Proposed React route | Components / notes |
|---|---|---|
| Home + listings (`/`, `/listings`) | `/` and `/listings` (or one route) | `AppShell`, `Hero`, `FeaturedGrid`, `CategoryTabs`, `ListingGrid`, `AiSearchBar`, `ChatWidget` |
| Listing detail | `/listings/:id` | `ListingHeader`, `ListingGallery` (single image initially), `HostCard`, `MapPanel`, `ReviewList`, `ReviewForm`, `OwnerActions` |
| New listing | `/listings/new` | `ListingForm`, `ImageUpload`, `AiDescriptionButton`, `CategorySelect` (all 11) |
| Edit listing | `/listings/:id/edit` | `ListingForm` in edit mode, current image preview, owner guard |
| Login | `/login` | `LoginForm`, error/loading states |
| Signup | `/signup` | `SignupForm`, password/email validation |
| Error | `*` / error boundary | `NotFoundPage`, `ErrorPage` |
| Chat (global) | floating widget or `/assistant` | `ChatWidget` built from AI Elements; optional full-page chat |
| Footer placeholder pages | `/journal`, `/gift-cards`, etc. | Either implement or remove links; do not ship dead links |

### 7.5 Data layer options (MongoDB retained)

| Option | Description | Trade-off | Recommendation |
|---|---|---|---|
| Raw PyMongo / Motor | Explicit queries and dict documents; Pydantic response models | Full control; more mapping code; easy to preserve exact shape | **Preferred for initial migration** if team wants minimal behavior change |
| Beanie | Async ODM on Motor, Pydantic documents | Nice typing; model/index assumptions; relationship patterns differ from Mongoose | Viable if team standardizes on it; verify ObjectId/date serialization |
| MongoEngine | Mature ODM | Sync-first; less natural with FastAPI async; schema translation work | Not preferred for a new async API |
| Keep Mongoose in a Node service | Reuse models | Defeats FastAPI consolidation; two backends | Only as a temporary strangler adapter |

**Decision needed:** choose one data-access approach and document how it handles: ObjectId → string, dates, nested `image`/`geometry`, optional fields, validation, population/joins, indexes, and transactions. Do not let Pydantic models silently reject legacy documents.

### 7.6 Authentication options

| Option | User impact | Security/complexity | Assessment |
|---|---|---|---|
| A. Reuse Express `connect.sid` sessions in FastAPI | No re-login | Must reproduce cookie signing, connect-mongo crypto/serialization, Passport user lookup; brittle across library updates | **Not recommended** except as a short-lived bridge with extreme testing |
| B. FastAPI-issued session cookie + Mongo session store | Users log in once after cutover | Clean ownership; must implement CSRF, rotation, SameSite, TTL, store | **Recommended** for a server-rendered-style app |
| C. JWT access/refresh tokens | Users log in once; client stores tokens | XSS/refresh-token storage concerns; revocation complexity; CSRF less relevant if header-based | Viable for SPA, but cookies are often simpler for same-site app |
| D. External identity provider (OAuth/OIDC) | Account linking/re-login | Larger product/security change; not required by current features | Out of scope unless product wants it |

**Minimum auth acceptance criteria:** verify existing PBKDF2 hashes or explicitly force reset; rotate session on login; `HttpOnly`, `Secure`, `SameSite` cookies; CSRF protection for cookie mutations; POST logout; rate-limited login; generic error messages; owner/author checks server-side; no secrets in frontend.

### 7.7 Static assets, maps, images, and SEO

- **Images:** keep Cloudinary for uploaded images; keep local seed images as seed-only assets or move to a CDN. React must handle missing images with a fallback. **Adapt.**
- **Map:** MapLibre can remain. The map style URL needs a browser-visible, restricted MapTiler key. Do not expose a broad server key. **Retain library / adapt config.**
- **Fonts/icons:** replace Bootstrap Icons/Font Awesome with a consistent icon set (for example Lucide via shadcn) or explicitly retain needed icons. **Replace/adapt.**
- **SEO:** current pages are server-rendered and crawlable. A Vite SPA can lose this. If organic listing traffic matters, use SSR/prerender or a meta-tag service. This is a **departure trigger** from the plain Vite reference. **Unknown requirement.**

---

## 8. AI component migration map

### 8.1 Current → target map

| Layer | Current | Target | Migration action |
|---|---|---|---|
| Chat shell | Hand-written HTML in `boilerplate.ejs` | AI Elements `Conversation`/`Message`/`PromptInput` (verify exact exports in vendored snapshot) | Rebuild; do not port custom CSS blindly |
| Message rendering | `div.textContent` | `Response` + Streamdown, or AI Elements' response component | Add safe Markdown; test XSS |
| Input | Plain `<input>` + button | `PromptInput` with textarea, submit, stop | Add keyboard/accessibility/disabled states |
| State | Global `conversation` array + sessionStorage | `useChat` state + optional persistence | Replace; decide history policy |
| Transport | `fetch` + raw text reader | `DefaultChatTransport` (or equivalent) + UI message stream | Replace; version endpoint |
| Message model | `{role, content}` only | `UIMessage` with `id`, `role`, `parts` | Server/client must agree on IDs and parts |
| Tool display | None | AI Elements `Tool` family with input/output/state | Requires structured tool parts from backend |
| Loading | "Thinking..." text | `Loader` / status-aware UI | Add stop/retry |
| Actions | None | `Actions` (copy/retry) | Optional but expected |
| Suggestions | Hard-coded welcome text | `Suggestion` chips | Optional; preserve welcome intent |
| Errors | Generic text | Inline error + retry | Define error part/status handling |
| Auth | None | Session/token + rate limit | Decide anonymous vs authenticated |
| Model config | Three hard-coded strings / two env names | One Python settings module | Centralize |
| Prompt storage | Hard-coded in controller | Versioned prompt module/fixtures | Preserve wording; test |
| Tools | Zod schemas + Mongoose queries | Pydantic AI tools + Python queries | Preserve names/args/results |

**AI Elements caveat:** the registry evolves. Component names and props vary by snapshot. Vendor a specific commit/registry snapshot, record the commit, and map against the actual files in the repository. Do not assume the list above is complete or stable.

### 8.2 Behaviors that must survive

- [ ] Chat can answer general Homestay questions and use `searchListings` for location/country/price/category queries.
- [ ] Chat can use `getListingReviews` to summarize reviews for a listing title.
- [ ] Answers remain concise (2–4 sentences unless listing results), warm, and do not invent tool-returned details.
- [ ] Country abbreviations/informal names are expanded and retried when a search is empty.
- [ ] Search results show title, location, and price; review summaries are balanced and not verbatim dumps.
- [ ] Tool execution remains server-side; the browser never receives DB credentials or the Gemini key.
- [ ] The assistant stops after at most 5 tool steps.
- [ ] Chat streams incrementally and can be stopped/aborted.
- [ ] Conversation survives page navigation within the chosen policy (currently sessionStorage/tab).
- [ ] Welcome message appears once per session/tab, not on every render.
- [ ] Errors are safe, visible, and retryable; no stack traces or provider details leak.
- [ ] Markdown renders correctly and safely.
- [ ] Tool calls/results are visible as structured UI if the product wants transparency; otherwise deliberately hidden but still logged.
- [ ] No duplicate model calls from React StrictMode, re-renders, polling, or remounts.

### 8.3 Contract to document before implementation

Create a versioned contract file (for example `docs/AI_CHAT_CONTRACT.md`) before writing code. It must specify:

1. **Endpoint and version:** `POST /api/ai/chat`, stream media type, protocol version.
2. **Request body:** `messages` shape, IDs, roles, parts, max length, auth headers/cookies.
3. **Response stream:** chunk types, text deltas, tool input/output parts, finish/error parts, heartbeat strategy.
4. **Message identity:** who generates IDs (client/server), uniqueness, replay behavior.
5. **Tool contract:** names (`searchListings`, `getListingReviews`), JSON schemas, result shapes, error shapes, limits, timeouts.
6. **Conversation policy:** client-only vs server-persisted, retention, max turns, trimming.
7. **Model config:** provider, model ID, temperature, max tokens, step limit, timeouts, retry policy.
8. **Auth policy:** anonymous vs authenticated, quotas, rate limits, per-user/IP limits.
9. **Error taxonomy:** 400/401/403/422/429/5xx, mid-stream error representation, user-facing messages.
10. **Observability:** request ID, model, token usage, tool calls, latency, error codes; no prompt/PII leakage by default.

### 8.4 Streaming compatibility options

| Option | Frontend | Backend | Pros | Cons |
|---|---|---|---|---|
| A. Big-bang UI message stream | `useChat` + AI Elements | `toUIMessageStreamResponse` / `VercelAIAdapter` | Clean target architecture; tool parts; best UI | Both sides must change together; adapter/version risk |
| B. Versioned dual endpoints | New UI uses `/api/ai/chat`; legacy widget uses `/listings/ai/chat` | Both stream formats temporarily | Safe rollback; gradual rollout | Duplicate logic; two contracts to test |
| C. `TextStreamChatTransport` (if supported by chosen `@ai-sdk/react`) | `useChat` consuming raw text | Existing text stream | Minimal backend change | No structured tool parts; AI Elements tool UI limited; still a versioned protocol |
| D. Keep custom widget + raw text | Existing renderer | Existing/ported text stream | Lowest UI risk | No AI Elements; poor Markdown/accessibility; does not meet target |

**Recommendation:** **B → A**. Build `/api/ai/chat` as the UI message stream, keep the legacy text endpoint behind a flag for rollback, and remove it after Phase 6. Do **not** switch the frontend to `useChat` while the backend still emits raw text unless using Option C deliberately and accepting no tool parts.

**Plain-text contract preservation:** the only current streaming endpoint is chat. Description and search are non-streaming JSON (description) or HTML (search). If a plain-text completion endpoint is added or retained, preserve `Content-Type: text/plain; charset=utf-8` and raw incremental UTF-8 body semantics until the client is migrated in the same release.

### 8.5 Model configuration

Current model strings are repeated in `controllers/ai.js` at lines 38, 91, and 127. The two SDKs also resolve different env names. Target:

```text
FastAPI settings
  AI_PROVIDER=google
  AI_MODEL=<verified Gemini model id>
  GEMINI_API_KEY=<single secret>
  AI_TEMPERATURE=<value>
  AI_MAX_OUTPUT_TOKENS=<value>
  AI_MAX_TOOL_STEPS=5
  AI_REQUEST_TIMEOUT_SECONDS=<value>
```

- Use one internal setting regardless of provider env quirks; validate at startup.
- Do not expose the key to Vite (`VITE_*` is public).
- Verify the exact model ID against the provider account; `gemini-3.1-flash-lite` is hard-coded today but availability is **Unknown**.
- Record model/prompt/version with each deployment for reproducibility.
- Keep the 5-step tool limit unless tests justify a change.

### 8.6 Avoiding duplicate AI invocations

React can invoke the model more than the current vanilla JS if effects are careless. Required rules:

- Send only from an explicit user action (`onSubmit`), never from a `useEffect` that depends on `messages`, `status`, or derived state.
- Do not poll for responses; the stream is push-based.
- Guard against React StrictMode double-invocation with an idempotency key or a ref-based in-flight guard; do not rely on effects.
- Abort in-flight requests on unmount or when the user starts a new turn.
- Memoize the transport and any callbacks passed to `useChat`.
- Disable submit while streaming; support explicit stop.
- For description generation, debounce/disable the button and consider an idempotency key.
- Log a request ID server-side and assert exactly one provider call per user action in tests.
- Do not re-run tool calls client-side; tools remain server-side.

### 8.7 AI security requirements

- Authenticate or explicitly quota anonymous chat; rate limit by session/IP/user.
- Cap input size, history turns, output tokens, and tool steps.
- Validate roles/content; reject client-supplied `system` messages.
- Escape regex inputs or use safe query builders; never interpolate raw user text into `$regex`.
- Sanitize Markdown/HTML; block raw HTML by default; validate link schemes; restrict images.
- Treat review/listing text as untrusted data in prompts; tool results should be clearly delimited.
- Do not log full prompts/responses by default; redact secrets and PII.
- Add provider timeouts/retries with backoff and budget alerts.

---

## 9. Dependency and compatibility review

### 9.1 Current dependency risks

| Item | Finding | Impact |
|---|---|---|
| `multer-storage-cloudinary@4.0.0` vs `cloudinary@2.10.0` | Package declares peer `cloudinary@^1.21.0`; installed Cloudinary is 2.10.0. The README already recommends `--legacy-peer-deps`. | Current install is not peer-clean; do not assume upload behavior is stable across upgrades. Python migration avoids this specific pairing but must retest uploads. |
| `ai@7.0.16` + `@ai-sdk/google@4.0.8` + `zod@4.4.3` | `ai` and `@ai-sdk/google` accept `zod ^3.25.76 || ^4.1.8`; 4.4.3 satisfies. | Current AI SDK pairing is coherent, but major upgrades are breaking. |
| `pipeTextStreamToResponse` | Deprecated in `ai` 7.0.16; planned removal in next major. | Chat breaks on a future AI SDK major unless migrated. |
| `@ai-sdk/react` | Not installed. | Target chat requires a new package; version must match `ai`. |
| React/Vite/Tailwind/shadcn | Not installed. | Entire frontend toolchain is new. |
| Python packages | None installed; no `requirements.txt`, `pyproject.toml`, or lockfile. | Python stack is greenfield; versions must be selected and pinned. |
| Node engine | `package.json` requires 22.22.2; README says 16+. | Deployment docs and CI must use the declared version; README is misleading. |
| `nodemon` in dependencies | Development tool shipped as production dependency. | Minor image size/supply-chain concern; not a migration blocker. |
| No lockfile policy for Python | No Python lockfile exists. | Reproducibility risk; add one. |

### 9.2 Target dependency matrix

Versions marked **TBD** must be selected and verified during Phase 0/1; do not copy Tradium's package versions.

| Layer | Package / component | Required compatibility | Peer/notes | Status |
|---|---|---|---|---|
| Frontend build | `react`, `react-dom`, `vite` | React version supported by chosen AI Elements/Streamdown; Vite current stable | Pin in `package-lock.json`; TypeScript optional but recommended | TBD |
| Styling | `tailwindcss`, `shadcn/ui` | shadcn CLI supports chosen Tailwind major; CSS variables/theme alignment | shadcn components are copied source, not a runtime dependency; pin registry snapshot | TBD |
| Chat transport | `ai` | Must match backend stream protocol and `@ai-sdk/react` major | Current backend uses 7.0.16; target may stay on v7 or deliberately upgrade | TBD |
| Chat React | `@ai-sdk/react` | Same major/release family as `ai`; peer React version | Not currently installed; verify package peer metadata before install | TBD |
| AI UI | Vercel AI Elements | Compatible with chosen `ai`/`@ai-sdk/react`; vendored source | Record commit/registry snapshot and license; no version in `package.json` | TBD |
| Markdown | `streamdown` | Peer React version; sanitization behavior; streaming-safe rendering | Verify whether raw HTML is allowed; add sanitizer/CSP | TBD |
| Icons | e.g. `lucide-react` | React peer | Optional; replace Font Awesome/Bootstrap Icons consistently | TBD |
| Backend | `fastapi`, `uvicorn` | Python version; Pydantic v2 | Pin; use ASGI server with graceful shutdown | TBD |
| Validation | `pydantic` | FastAPI/Pydantic AI compatibility | Pydantic v2; model config centralization | TBD |
| AI backend | `pydantic-ai` | Google provider support; `VercelAIAdapter` supports chosen UI stream protocol | **Critical gate:** adapter must match `ai`/`@ai-sdk/react` message chunk version | TBD |
| AI provider | Pydantic AI Google/Gemini provider | Gemini API key/model access; region/Vertex decision | Current model ID must be verified; provider env name may differ | TBD |
| Mongo | `pymongo`/`motor` or ODM | MongoDB server version; async support; ObjectId handling | Choose one; add connection pooling/timeouts | TBD |
| Uploads | Cloudinary Python SDK or signed upload | Cloudinary account/folder; MIME/size validation | Keep existing assets; add cleanup policy | TBD |
| Geocoding | HTTP client (`httpx`) | MapTiler API; timeout/retry | Do not expose server key; validate no-result path | TBD |
| Backend tests | `pytest`, `pytest-asyncio`, `httpx` | FastAPI async testing | Use ephemeral Mongo or testcontainers | TBD |
| Frontend tests | `vitest`, React Testing Library, MSW | React/Vite versions | Mock streams/tools | TBD |
| E2E | Playwright | Browser matrix | Run against staging with mocked provider | TBD |
| Lint/format | ESLint/Prettier or Biome; Ruff/Black | Team choice | Add CI gates | TBD |

### 9.3 Critical compatibility gates

1. **AI SDK ↔ Pydantic AI adapter**
   - The frontend `useChat` expects a specific UI message chunk schema (text, tool input/output, finish, error).
   - `VercelAIAdapter` must emit exactly that schema version. Verify with recorded streams and a contract test, not documentation alone.
   - If the adapter lags the current `ai` major, choose one of: pin `ai`/`@ai-sdk/react` to the supported major, write a small custom SSE adapter, or use Option C (text transport) temporarily.
   - **Do not** assume "Vercel AI compatible" means compatible with every `ai` major.

2. **AI Elements ↔ React/Tailwind**
   - AI Elements source may assume a specific React version, Tailwind major, `cn` utility, and shadcn conventions.
   - Vendor components, then run typecheck/build/tests before styling.
   - Some components may require additional primitives (Radix, `class-variance-authority`, `clsx`, `tailwind-merge`); add only what is used.

3. **Streamdown ↔ React**
   - Check peer dependencies and whether it renders raw HTML.
   - If raw HTML is enabled, add sanitization or disable it.
   - Test partial Markdown chunks (unclosed code fences/links) during streaming.

4. **Mongo driver ↔ existing data**
   - ObjectId serialization, date handling, nested objects, arrays, and optional fields must match the catalog.
   - Pydantic models should not reject legacy documents in read paths.
   - Index changes must be additive and reviewed against duplicate data.

5. **Cloudinary**
   - Existing images use a mix of Cloudinary URLs and local `/images/*.png`.
   - Python upload must preserve `url` and `filename`; do not assume the same transformation URL format.
   - Verify allowed formats/size and error handling.

6. **Node/Python runtime**
   - Node 22.22.2 is declared; Python version is **Unknown**. Choose a supported Python version and pin it in CI/containers.
   - Do not deploy with an unpinned `python:latest` or `node:latest`.

### 9.4 Reuse assessment

| Existing asset | Reusable? | Notes |
|---|---|---|
| MongoDB data | **Yes** | Same collections/fields; no rewrite in early phases |
| Cloudinary images | **Yes** | Keep URLs; upload path changes |
| MapLibre library | **Yes** | Framework-agnostic; wrap in React |
| MapTiler account/key | **Yes** | Restrict browser key |
| Prompts and tool semantics | **Yes, with tests** | Port wording/behavior |
| Zod schemas | **No direct reuse** | Translate to Pydantic/tool schemas; preserve names/validation |
| Mongoose models | **No direct reuse** | Translate to Python data models/queries |
| EJS templates | **No** | Rebuild React components |
| Bootstrap CSS | **No direct reuse** | Rebuild with Tailwind/shadcn; preserve design intent |
| `public/js/script.js` | **No** | Replace with React state/hooks |
| Passport session | **No** | New auth strategy |
| Seed data | **Yes as fixtures** | Synthetic; do not ship sample credentials |

### 9.5 Version policy

- Pin exact versions and commit lockfiles for both ecosystems.
- Keep `ai`, `@ai-sdk/react`, AI Elements snapshot, and Pydantic AI adapter in one compatibility matrix; upgrade them together in a dedicated PR with stream contract tests.
- Do not copy Tradium's `package.json` versions or application-specific source. Use it for architecture and patterns only.
- Record the AI Elements vendor commit and any local modifications.
- Run dependency/security audits in CI; do not install floating `latest` in production builds.

---

## 10. Integration test requirements

### 10.1 Test strategy and isolation

| Layer | Tooling | Isolation rule |
|---|---|---|
| Backend unit/integration | `pytest`, `pytest-asyncio`, `httpx.AsyncClient` | Ephemeral Mongo (testcontainer or local disposable DB); mocked Gemini/Cloudinary/MapTiler |
| Stream contract | Recorded UI message chunks + parser tests | No live provider calls in CI |
| Frontend component | Vitest + React Testing Library + MSW | Mock stream/tool events; test StrictMode |
| E2E | Playwright | Staging-like stack with synthetic data and mocked AI |
| Data/schema | Catalog assertions + Mongo fixtures | Synthetic records only; never production data |
| Security | Authz matrix + CSRF/XSS/rate-limit tests | Dedicated test users/sessions |

**Rules:** no production database, no real API keys, no real user data, no recording of real conversations. Use synthetic hashes/sessions where needed, and never commit secrets.

**Phase 0 (current Express app):** `node:test` + `supertest` against a disposable local MongoDB database, with run-patched doubles for Gemini, MapTiler, and Cloudinary and outbound HTTP disabled. This is the executable baseline; the target-stack tooling below applies from Phase 1 onward. See `docs/PHASE_0_BASELINE_REPORT.md`.

### 10.2 Required test matrix

| ID | Area | Cases | Acceptance |
|---|---|---|---|
| T01 | Chat streaming — happy path | Valid `messages`; text deltas arrive in order; final message complete; stream closes | Client renders incremental text; final transcript equals concatenated deltas; HTTP 200 + correct stream media type |
| T02 | Chat streaming — errors | Missing `messages`; invalid roles; oversized history; provider 4xx/5xx; mid-stream failure; timeout | Structured 4xx before stream; safe error part/UI after stream starts; no stack/provider secrets; retry works |
| T03 | Chat streaming — cancellation | User stops; navigates away; closes widget; AbortController | Server stops generation; no orphan tool execution; UI returns to idle |
| T04 | No duplicate invocations | StrictMode mount; re-render; remount; double-click submit; effect dependencies | Exactly one provider call per user action; one user message and one assistant response; assert provider call count |
| T05 | Tool calls — search | Location/country/maxPrice/category; no filters; no results; country alias; 5-result cap; case sensitivity; regex metacharacters | Tool invoked with validated args; DB query correct; max 5; metacharacters escaped; no results handled plainly |
| T06 | Tool calls — reviews | Exact title; partial title; multiple matches; listing not found; zero reviews; long reviews | Deterministic listing selection documented; result shape correct; no invented reviews; listing-not-found message |
| T07 | Tool results in UI | Tool input/output parts; pending/running/success/error states; step limit | AI Elements tool UI shows states or deliberately hides them; results logged; step limit 5 enforced |
| T08 | Markdown rendering | Headings, lists, links, code fences, tables, long content, partial chunks, emoji | Renders correctly while streaming; no layout break; links safe |
| T09 | Markdown/XSS | Raw HTML, `javascript:` links, `onerror` images, script tags, malformed Markdown | No script execution; unsafe HTML stripped/escaped; CSP compatible |
| T10 | Auth — failures | No session, expired session, invalid password, unknown user, CSRF missing/invalid, logout GET | API returns 401/403 (not redirects); no user enumeration; CSRF rejected; logout is POST-only |
| T11 | Auth — success/rotation | Signup, login, me, logout, session rotation, cookie flags | Session/token issued securely; rotation on login; `HttpOnly`/`Secure`/`SameSite` verified; logout clears |
| T12 | Authorization — listings | Non-owner edit/delete; owner edit/delete; missing listing; owner field tampering | 403 for non-owner; owner succeeds; owner comes from session, not body; missing listing 404 |
| T13 | Authorization — reviews | Non-author delete; author delete; review not belonging to listing; missing review | 403/404 as appropriate; no cross-listing deletion; array/document consistency asserted |
| T14 | User-specific data | A cannot read/modify B's private state; chat tools never expose private fields; session user mismatch | No IDOR; tool results limited to public listing/review data; logs contain no PII |
| T15 | AI description | Valid inputs; missing fields; prompt injection; provider error; rate limit | JSON contract; 2–3 sentences heuristic; no invented details; safe error; no duplicate calls |
| T16 | NL search | min/max price, category, location, country aliases, no results, regex metacharacters, limit 20 | Structured JSON results; filters correct; metacharacters escaped; no HTML |
| T17 | Insight/summary endpoint | Review summary accuracy; empty reviews; listing not found; multiple titles; long reviews; injection in review text | Summary reflects reviews, balanced, no verbatim dump, no invented facts |
| T18 | Schema/data contract | Catalog vs actual collections; required fields; ObjectId/date serialization; indexes; cascade; orphan detection | Contract tests pass; no unexpected destructive changes; orphans reported |
| T19 | Parity/cutover | Every current route vs new route; status codes; JSON shapes; images; map; health | Documented parity matrix passes; visual spot checks; rollback verified |
| T20 | Security/ops | Rate limits, body limits, CORS, security headers, readiness, graceful shutdown, secrets scan | Limits enforced; CORS allowlist; readiness fails without DB; no secrets in bundle/logs |

### 10.3 Specific acceptance details

**Chat streaming**

- Assert the response `Content-Type` matches the chosen protocol (for UI message stream, typically `text/event-stream` or the adapter's documented media type).
- Assert chunk ordering and that text parts concatenate to the final assistant text.
- Assert tool parts reference stable `toolCallId`s and pair input with output.
- Assert a mid-stream error produces a terminal error part/status and the UI can retry.
- Assert no duplicate request when React StrictMode mounts/unmounts components.

**Tool calls and results**

- Freeze fixtures for `searchListings` and `getListingReviews`; compare normalized args/results.
- Test empty results, one result, five results, and >5 results.
- Test country aliases ("US", "USA", "America", "UK") and formal names.
- Test regex metacharacters (`.*`, `(`, `[`, `\`) to ensure safe escaping.
- Test listing-not-found and multiple-title ambiguity.
- Assert step limit 5 and that tools are not called after the limit.

**Markdown**

- Render streamed partial Markdown, not just complete strings.
- Test unsafe HTML and link schemes; verify sanitizer/CSP.
- Test code blocks/tables and copy behavior.
- Ensure no `dangerouslySetInnerHTML` without sanitization.

**Authentication failures**

- API clients get machine-readable 401/403, not HTML redirects.
- Login errors are generic and rate-limited.
- CSRF is enforced for cookie-auth mutations.
- Session rotation and cookie flags verified in an HTTPS-like test setup.
- Logout is POST; GET does not mutate state.

**User-specific data access**

- Build an authz matrix for owner/author/non-owner/non-author/anonymous.
- Attempt IDOR by changing listing/review IDs and user IDs in bodies.
- Verify owner/author are always derived from the authenticated principal.
- Verify chat tools only return public listing/review fields (no emails, hashes, sessions).
- Verify logs/telemetry do not contain emails, hashes, tokens, or full prompts by default.

**Insight/summary endpoints**

- `getListingReviews` must summarize the correct listing, handle zero reviews, handle multiple title matches deterministically, and ignore injected instructions inside review comments.
- Assert a not-found result is explicit and not hallucinated.
- Assert review text is treated as data, not system instructions.

**Additional Homestay-specific tests**

- AI description: title/location/category only; no invented location; 2–3 sentences; cliché avoidance (heuristic).
- NL search: min/max price semantics, category enum, country aliases, 20-result cap.
- Review default rating: explicitly test that submitting without a star does **not** silently create a 1-star review unless that is the intended product rule.
- Category round-trip: all 11 categories including Hill Station, Heritage Homestay, Houseboat.
- Image/price/owner missing-data fallbacks: pages do not 500.
- Map geocode no-result path: listing creation/edit behavior is defined and tested.
- Health/readiness: `/health` is alive without DB; `/ready` fails without DB.

### 10.4 CI gates

- Backend lint/typecheck/tests; frontend lint/typecheck/unit tests; E2E smoke.
- Stream contract tests against the exact `ai`/adapter versions.
- Secret scan and dependency audit.
- Schema catalog assertions against a disposable Mongo seeded with synthetic fixtures.
- No merge without green tests for changed contracts; AI SDK/adapter upgrades require a dedicated compatibility run.

---

## 11. Migration decision record

### ADR-001: Adopt React/Vite + FastAPI + Pydantic AI while retaining MongoDB

| Field | Content |
|---|---|
| **Status** | Proposed — not implemented |
| **Date** | 2026-10-25 |
| **Context** | Homestay is an Express/EJS monolith with Passport sessions, Mongoose models, a plain-text Gemini chat, an HTML-returning NL search, and a Phase 0 baseline suite (no CI). The target wants a richer React chat UI, a Python AI layer, and MongoDB retained. |
| **Decision** | Migrate in phases using a strangler pattern: React/Vite SPA; FastAPI API; Pydantic AI + Google/Gemini; AI Elements/Streamdown for chat; existing MongoDB collections retained; versioned AI stream contract; auth re-issued with a tested session/token strategy. |
| **Why this fits** | Separates UI from AI/backend concerns; gives access to the React AI ecosystem and AI Elements components; centralizes model configuration in Python; allows a typed API and independent testing; preserves data and domain rules; supports incremental rollout and rollback. |
| **Alternatives considered** | (1) Stay on Express and add React islands; (2) Next.js full-stack with Node AI; (3) FastAPI + HTMX/server templates; (4) Node backend + Python AI microservice; (5) keep custom chat UI and raw text stream. |
| **Consequences — positive** | Better chat UX and accessibility; reusable components; clearer API boundaries; Python AI tooling; typed contracts; testable phases; no immediate data migration. |
| **Consequences — negative** | Two runtimes and deploy pipelines; CORS/cookie complexity; duplicated validation; AI adapter/version coupling; SPA SEO risk; auth migration/user re-login; more operational overhead; larger frontend bundle. |
| **Risks accepted** | Users may need to log in again; AI stream behavior changes; Mongo data may contain malformed documents that need fallbacks; AI provider/model availability must be verified. |
| **Review conditions** | Approve only after: auth strategy decision; AI adapter/stream spike passes; SEO requirement decided; Mongo copy data-quality audit; Phase 0 tests green. |

### 11.1 Why this architecture fits the project

- The current app already separates domain logic into routes/controllers/models; those boundaries can be translated to FastAPI routers/services without redesigning the domain.
- MongoDB retention avoids a risky data migration and lets the team focus on auth, AI, and UI.
- React/AI Elements directly addresses the weakest current UI: a hand-written plain-text chat with no Markdown, tool visibility, accessibility, or stop/retry.
- Pydantic AI fits the requirement to centralize prompts/tools/model config in Python and gives a path to structured tool calls.
- The phased approach keeps the existing app live while each slice is proven.

### 11.2 Main trade-offs

| Trade-off | Cost | Benefit |
|---|---|---|
| Two runtimes | More deploy/ops/security surface | Independent scaling and clearer AI/backend ownership |
| SPA instead of EJS | SEO/first-paint risk, larger JS | Rich chat/UI, component reuse, client state |
| New auth | Re-login/session migration work | Removes Node-specific session coupling; can fix CSRF/GET-logout |
| AI protocol change | Both sides must change; adapter risk | Structured tool parts, AI Elements, better UX |
| Mongo retained | Legacy schema constraints | No data rewrite; lower cutover risk |
| Pydantic models | Duplicate validation logic | Typed API, docs, testability |
| AI Elements vendored | Maintenance/update burden | Full control, no opaque UI package |

### 11.3 Features that would justify departing from the Tradium reference

1. **SEO-critical listing pages.** If organic search/social previews are a primary acquisition channel, a plain Vite SPA is insufficient. Use SSR/prerender (Next.js/Remix/React Router SSR) or a prerender/meta service.
2. **Strict session continuity.** If users cannot be asked to log in again, a temporary Express auth gateway/session bridge may be required; keep FastAPI behind it until migration is complete.
3. **Adapter incompatibility.** If Pydantic AI's `VercelAIAdapter` cannot match the chosen `ai`/`@ai-sdk/react` stream version, either pin the frontend SDK to the supported version or implement a small, tested SSE adapter. Do not force an unstable pairing.
4. **Mostly CRUD/low AI usage.** If chat is not a differentiator and the team is Node-only, staying on Express with a React chat island may be cheaper.
5. **Real booking/payments.** If reservations, availability, payments, and messaging enter scope, revisit the domain model and architecture before migrating; the current app has none of these.
6. **Strict data residency/compliance.** If Gemini/Cloudinary/MapTiler cannot be used in the target region, provider choices must change before the AI migration.
7. **Offline/real-time requirements.** If live availability or messaging is required, add WebSockets/event infrastructure rather than forcing it into REST/chat streams.

### 11.4 Easy Invites rebranding

Keep the rebrand as a separate phase/project:

- Migration acceptance is functional parity, not new branding.
- Rebrand changes name, domain, logo, palette, copy, metadata, and possibly email/social accounts.
- Do not mix rebrand commits with auth/AI/data changes; it makes regressions and rollbacks harder.
- Rebrand can proceed in parallel only on isolated presentational assets, never on shared migration branches.

---

## 12. Open questions and unknowns

### Blocking Phase 1–2

1. **Auth continuity:** Is a one-time re-login after cutover acceptable? If not, a session bridge or phased auth gateway is required. **Unknown / product decision.**
2. **Auth mechanism:** FastAPI session cookie vs JWT vs external IdP? Cookie + CSRF is the simplest fit for a same-site app; confirm deployment topology.
3. **SEO:** Must listing pages be server-rendered/crawlable? If yes, Vite SPA is a departure trigger.
4. **Production data quality:** Do all listings have owners/images/prices/valid geometry? Are there duplicate emails/usernames or dangling review refs? Requires an anonymized copy/aggregate audit.
5. **Mongo topology/version:** Standalone, replica set, Atlas? Transactions and index builds depend on it.
6. **Deployment target:** Where will FastAPI and React run? Domains, TLS, CORS, cookie scope, secrets manager, CI/CD.

### Blocking Phase 5

7. **Gemini access/model:** Is `gemini-3.1-flash-lite` available to the project? Gemini API or Vertex? Which key/env name is canonical?
8. **AI adapter compatibility:** Which Pydantic AI version supports the chosen `ai`/`@ai-sdk/react` UI message stream? Spike required.
9. **Anonymous chat:** Must unauthenticated users chat? If yes, define quotas/rate limits; if no, require auth and update UX.
10. **Chat persistence:** Is server-side/cross-device history required, or is tab-scoped sessionStorage acceptable? Current behavior is tab-only.
11. **Tool transparency:** Should users see tool calls/results, or only final prose? This determines AI Elements tool UI and stream parts.
12. **Markdown policy:** Is raw HTML allowed in model output? Recommended: no; sanitize links and HTML.
13. **Model/prompt governance:** Who owns prompt changes, evaluation, and cost budgets? Need a lightweight process.

### Product/data/ops

14. **Booking scope:** Is Homestay intended to add reservations/payments later? If so, plan the domain model before freezing APIs.
15. **Category coverage:** Confirm all 11 categories are valid; fix the 8-value forms.
16. **Review default rating:** Is the checked "no rating" radio intentionally 1 star? If not, fix during migration.
17. **Email semantics:** Should email be unique/verified/used for login or password reset? Current code only stores it.
18. **Currency/locale:** Is INR-only intentional? Any multi-currency/i18n plans?
19. **Image lifecycle:** Should deleting/replacing a listing delete Cloudinary assets? What retention policy?
20. **MapTiler plan:** Does it permit the expected geocoding volume and browser key restrictions?
21. **Accessibility target:** WCAG level? Chat and forms need explicit acceptance criteria.
22. **Observability/PII:** What may be logged? Retention period? Provider-side logging?
23. **Backup/restore:** Who owns MongoDB backups, and when was restore last tested?
24. **Python/TypeScript choices:** Python version/package manager, TypeScript vs JavaScript, lint/format standards.
25. **AI Elements versioning:** Which registry snapshot/commit will be vendored, and who reviews upstream changes?
26. **Production collection names/indexes:** Confirm on a copy; the catalog uses Mongoose defaults and library defaults.

### Known unknowns recorded in the schema catalog

- Deployed collection names, indexes, document counts, numeric BSON types, data quality, exact session payload shape, provider entitlement, Cloudinary lifecycle, deployment topology, and any external AI logging. See `docs/HOMESTAY_SCHEMA_CATALOG.json` → `unknowns`.

---

## Appendix A. Evidence index

| Area | Primary evidence |
|---|---|
| Boot/runtime/config | `app.js:1-114`; `package.json`; `env.example`; `.gitignore` |
| Auth/session | `app.js:23-47,77-85`; `middleware.js`; `routes/user.js`; `controllers/user.js`; `models/user.js`; `node_modules/passport-local-mongoose/dist/index.js`; `node_modules/connect-mongo/dist/index.cjs` |
| Listings | `models/listing.js`; `controllers/listing.js`; `routes/listing.js`; `schema.js`; `views/listings/*` |
| Reviews | `models/review.js`; `controllers/review.js`; `routes/review.js`; `views/listings/show.ejs` |
| AI | `controllers/ai.js`; `routes/ai.js`; `public/js/script.js:67-253`; `node_modules/ai/dist/index.d.ts`; `node_modules/@ai-sdk/google/dist/index.js`; `node_modules/@google/genai/dist/node/index.cjs` |
| Frontend | `views/layouts/boilerplate.ejs`; `views/includes/*`; `public/css/style.css`; `public/js/*` |
| Seed/data | `init/data.js`; `init/index.js` |
| Integrations | `cloudConfig.js`; `controllers/listing.js:2-3,34,56,67`; `views/listings/show.ejs:3-6`; `public/js/map.js` |
| Tests/CI/deploy | Absence verified via `package.json:12` and repository file inventory |

## Appendix B. Route count and method summary

- GET: 9 (`/health`, `/`, `/listings`, `/listings/new`, `/listings/:id/edit`, `/listings/:id`, `/signup`, `/login`, `/logout`)
- POST: 7 (`/listings`, `/listings/ai/generate_description`, `/listings/ai/chat`, `/listings/ai/search`, `/listings/:listingId/review`, `/signup`, `/login`)
- PUT: 1 (`/listings/:id`)
- DELETE: 2 (`/listings/:id`, `/listings/:listingId/review/:reviewId`)
- Total application routes: **19** (excluding catch-all/error handler)

*(Counts verified from the route files; `/` and `/listings` are counted as two GET routes, and `/health` is included.)*

## Appendix C. Audit limitations

- No production database was read; schema details come from Mongoose declarations, seed data, and installed library defaults.
- No provider calls were made; model availability, latency, quotas, and exact stream chunk behavior are unverified.
- No browser rendering or accessibility audit was performed.
- No load, penetration, or dependency-vulnerability scan was performed.
- No deployment configuration exists to review.
- Phase 0 addresses the earlier automation gap; its own coverage limitations are recorded in `docs/PHASE_0_BASELINE_REPORT.md`.
- The report intentionally does not reproduce secret values, credential hashes, session IDs, or real user records.
- The target architecture is a reference; exact package versions and AI Elements/adapters must be validated in a dedicated compatibility spike before implementation.

