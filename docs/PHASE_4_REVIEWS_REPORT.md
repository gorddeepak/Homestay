# Phase 4 — Reviews, Ratings, and shadcn/ui

## Status

Complete. Review creation, display, editing, and deletion are implemented in React + FastAPI, the documented review defects are fixed in the new API, and shadcn/ui is configured for incremental frontend adoption.

All work remains uncommitted on `migration/phase-0-baseline`. The Express/EJS application, its routes, its models, and the Phase 0–3 changes were left intact.

## Review endpoints

The review router lives in `backend/app/reviews.py` and is registered under `/api`:

| Method | Path | Access | Response |
|---|---|---|---|
| `GET` | `/api/listings/{listing_id}/reviews` | Public | `200` — list of `ReviewPublic` |
| `POST` | `/api/listings/{listing_id}/reviews` | Auth + trusted origin | `201` — `ReviewPublic` |
| `PATCH` | `/api/listings/{listing_id}/reviews/{review_id}` | Author + trusted origin | `200` — `ReviewPublic` |
| `DELETE` | `/api/listings/{listing_id}/reviews/{review_id}` | Author + trusted origin | `200` — `{"ok": true}` |

`ReviewPublic` deliberately contains only public data:

```json
{
  "id": "6aa8411e32925d5a1685ad43",
  "rating": 5,
  "comment": "Absolutely stunning place!",
  "author": { "id": "6aa8411d32925d5a1685ad39", "username": "bob_explorer" },
  "created_at": "2026-07-24T01:52:59.102000Z"
}
```

`rating`, `comment`, `author`, and `created_at` are nullable because historical documents may be incomplete. The API never exposes `salt`, `hash`, email addresses, sessions, or the full user document. Author usernames are batch-loaded for the public list, so there is no per-review user query.

Error behavior:

- `400` — malformed listing ObjectId.
- `401` — missing or invalid authentication cookie.
- `403` — missing or untrusted `Origin` on a mutation.
- `404` — missing listing or review, a review on a different listing, or another user's review.
- `422` — invalid request body.
- `503` — MongoDB failure.

Authentication and origin dependencies run before body processing, so an unauthenticated request with an invalid body receives `401` rather than a validation error. This was verified live.

## Original schema and compatibility

The source of truth is the Mongoose schema in `models/review.js` and the listing reference in `models/listing.js`:

- `reviews._id` — ObjectId.
- `reviews.rating` — Number with `min: 1`, `max: 5` (nullish when absent in historical data).
- `reviews.comment` — String.
- `reviews.createdAt` — Date, default `Date.now`.
- `reviews.author` — ObjectId reference to `User`.
- `reviews.__v` — Mongoose version key; new documents write `0` like Express-created documents.
- `listings.review[]` — array of ObjectId references to reviews.

No collections, fields, or references were renamed. No documents were migrated or rewritten. New reviews use the same collection and shape. `POST` inserts the review and appends its ID to the listing. `DELETE` removes the ID from the correct listing and then deletes the review document.

The public list follows the listing's stored `review[]` order, skips IDs whose review documents no longer exist, and does not fabricate replacement documents.

### Legacy rating handling

A stored rating is returned only when it is an actual integer from 1 to 5. Missing, boolean, fractional, out-of-range, or non-numeric values are reported as `rating: null` and excluded from the average. Historical data is never rewritten. The UI shows a `No rating` badge for those reviews and does not count them in the average.

Stored `createdAt` values are treated as UTC when they are timezone-naive (PyMongo's default) and returned as timezone-aware ISO timestamps. Missing or malformed dates are returned as `null`.

### Business rules preserved

- Any authenticated user may review any existing listing.
- The original application did not restrict a user to one review per listing; that behavior is preserved.
- The comment is required and must not be blank. Values are trimmed; a 2000-character maximum is a new API safety limit.
- The rating is required, must be an integer from 1 to 5, and is never defaulted. Booleans are rejected explicitly because Python treats `True` as `1`.
- Editing is author-only. Express had no edit route, but `middleware.isAuthor` establishes the intended author-only policy; Phase 4 implements it consistently with delete.

## Listing/review association and defect fixes

1. **Cross-listing deletion** — `_author_review` requires the review ID to be present in the supplied listing's `review[]`, the review document to exist, and the stored author to match the authenticated user. Otherwise the response is a consistent `404 Review not found`. The delete operation also filters `$pull` by both listing and review ID. A regression test confirms that attempting deletion through another listing leaves the review and its original reference untouched.
2. **Missing rating defaulted to one star** — `ReviewCreate.rating` is required and validated as an integer from 1 to 5. Missing and invalid values return `422`; nothing is stored. The React form also refuses to submit without a selection, so there is no silent one-star path.
3. **Validation before authentication** — FastAPI resolves `get_current_user` and `require_trusted_origin` before request-body validation. The new endpoints therefore authenticate and check origin before considering the body. Verified live: an unauthenticated request with a missing rating returned `401`.
4. **Invalid data** — ObjectIds are validated, listing existence is checked before creation and reads, comments are trimmed and length-bounded, and rating boundaries are tested at `1` and `5`.

A non-author cannot gain access by changing the URL, supplying another user's review ID, or sending an `author` field. Client-supplied `author`, `createdAt`, and `__v` values are ignored because the request schemas do not accept them. The review author always comes from the verified session.

## shadcn/ui setup

shadcn/ui was initialized with the current CLI in the existing JavaScript project:

```powershell
cd frontend
npx shadcn@latest init -b radix -p nova --css-variables --no-monorepo --no-rtl -y
npx shadcn@latest add button card textarea label alert-dialog avatar badge separator skeleton -y
```

Configuration:

- `frontend/components.json` — style `radix-nova`, `tsx: false`, CSS `src/index.css`, `@/components` and `@/lib/utils` aliases, Lucide icons.
- `frontend/jsconfig.json` — `@/*` maps to `./src/*` for editors.
- `frontend/vite.config.js` — `@` resolve alias using `node:url` (no Node type package needed for a JS project).
- `frontend/src/index.css` — existing `linen`, `clay`, `sand`, `earth`, and `ink` theme tokens were kept. The generated shadcn tokens (`background`, `foreground`, `primary`, `card`, `border`, `ring`, etc.) are mapped onto that palette. `--font-sans` maps to the existing DM Sans body font, and the generated Geist font import/dependency was removed so the existing typography is preserved.

The CLI added `src/lib/utils.js` and the requested components only. No existing page was rewritten to use shadcn, and no second component library or state/form/rating/HTTP library was added.

### Components added and why

| Component | Use |
|---|---|
| `Button` | Review actions, rating buttons, retry/login/submit actions |
| `Card` | Review cards, review form, empty state, signed-out prompt |
| `Textarea` | Create and edit comment fields |
| `Label` | Comment field labels |
| `AlertDialog` | Delete confirmation |
| `Avatar` / `AvatarFallback` | Review author initial |
| `Badge` | `No rating` state for legacy reviews |
| `Separator` | Division between the review list and form |
| `Skeleton` | Review loading state |

The five-star control uses native `<button type="button">` elements with `aria-label` values `1 star` through `5 stars`, `aria-pressed`, a visible `N of 5 selected` label, filled versus outline Lucide stars, and a raised background on the selected button. No rating library was added.

## Frontend behavior

- `frontend/src/components/ReviewsSection.jsx` is rendered on the listing detail page before the map.
- The section shows the review count, average of valid ratings (one decimal), each review's stars, author username, date, and comment.
- States: loading skeletons, load-error alert with retry, empty state, signed-out prompt, create form, inline edit form, and delete confirmation.
- Signed-out visitors can read reviews and follow a login link with a safe `next` path. `LoginPage` accepts that path and redirects back after login or signup; only local single-slash paths are followed to avoid open redirects.
- The create form requires a selected rating and a non-blank comment, disables the submit button while posting, and guards against duplicate submission.
- Successful create, edit, and delete update the local list from the server response, which also updates the count and average without a page reload.
- Edit and delete controls appear only on the signed-in user's own reviews. This is a convenience check; the server enforces the same rule independently.
- New API helpers in `frontend/src/api.js` use the existing cookie-aware `request`/`send` helpers and the Vite `/api` proxy.

## Dependencies and environment

New frontend dependencies installed by the shadcn CLI:

- `radix-ui`
- `class-variance-authority`
- `cn`
- `lucide-react`
- `tw-animate-css`
- `shadcn` (provides `shadcn/tailwind.css`)

`@fontsource-variable/geist` was installed by the preset and then removed because the project keeps its existing fonts. No Python dependencies or backend environment variables were added. The FastAPI version was bumped from `0.3.0` to `0.4.0`.

## Test and verification results

All commands were actually run.

| Command | Result |
|---|---|
| `backend\.venv\Scripts\python.exe -m pytest tests/test_reviews.py -q` | **39 passed** (1 Starlette deprecation warning) |
| `backend\.venv\Scripts\python.exe -m pytest -q` | **95 passed** (1 Starlette deprecation warning) |
| `npm test` (repository root, Node/Express suite) | **45 pass, 0 fail, 10 todo** |
| `npm run build` (`frontend`) | **Success** — 2078 modules; only the existing >500 kB MapLibre chunk warning |
| `git diff --check` | **Clean** |

### Live disposable-database check

The local `homestay` database was copied to a disposable `homestay_phase4_live_check` database. A temporary user was inserted into the copy, and Uvicorn ran against the copy only.

Verified against real review data (4 reviews on the chosen listing):

- Public list returned `200`, preserved order, exposed only `id`, `rating`, `comment`, `author {id, username}`, and `created_at`.
- Create returned `201`; the author came from the session even though a different `author` was sent in the body.
- Update returned `200` and changed the stored rating/comment.
- Cross-listing delete returned `404`; the review remained.
- Correct-listing delete returned `200`; the count returned to its original value.
- Missing rating and rating `6` returned `422`.
- Untrusted origin returned `403`.
- Editing or deleting another user's review returned `404`.
- Missing listing returned `404`.
- Before login, a create with an invalid body returned `401` (authentication before validation).

The temporary database was dropped afterward. The live database remains at 49 listings, 185 reviews, and 10 users, with no temporary user.

### In-app browser check

The review UI was exercised in the in-app browser against the disposable database:

- The detail page showed 4 reviews, a `3.8 / 5` average, usernames, dates, and comments.
- Signed out, the page showed the login prompt and the link `/login?next=/listings/...`.
- Signing in redirected back to the same listing.
- Submitting a comment with no rating showed `Select a rating from 1 to 5.` and did not create a review.
- Selecting 5 stars, posting, and observing the success message produced a 5-star card and changed the average to `4.0 / 5`.
- Editing to 4 stars and a new comment updated the card and changed the average to `3.8 / 5`.
- Deleting opened the `AlertDialog`, and confirming removed the review and restored the `4 reviews` count.
- Only the signed-in user's review rendered Edit/Delete controls; the other three review cards had none.
- No React runtime errors appeared. The only console entries were the expected signed-out `401` responses from `/api/auth/me`.

The desktop browser window was not visible for screenshots. Mouse/pointer flows were verified; the harness's synthetic Enter/Space key press did not activate a native button during automation, so full keyboard activation was not confirmed end-to-end. The control uses native buttons with accessible names and `aria-pressed`, and programmatic focus was verified.

## Known limitations and deferred work

- `maplibre-gl` `5.24.0` (Phase 3 dependency) has a critical npm advisory for an XSS sanitizer bypass. The fix requires a semver-major upgrade to `6.16.0`, which is outside Phase 4 and could affect map behavior. It was not force-upgraded; defer to a dedicated dependency phase.
- Browse-grid rating summaries were not added. The detail page computes its summary from the reviews it already fetched, avoiding an aggregation query or N+1 pattern.
- The original Express application still has no review edit route. Phase 4 adds author-only editing to the new API per the intended `isAuthor` policy, without modifying the legacy routes.
- Reviews are not paginated. Listings currently have a handful of reviews, and pagination was not required for this phase.
- The 2000-character comment cap applies to new and edited reviews. Longer historical comments are still returned for display but would need shortening before an edit.
- There is no review moderation, spam filtering, or rate limiting beyond authentication and trusted-origin checks; none existed in the original application.
- A user may submit more than one review for the same listing, matching the original business rules.
- The frontend build reports the existing `maplibre-gl` chunk-size warning; the map is already lazy-loaded, so this is unchanged from Phase 3.
- The browser harness could not capture screenshots because its desktop window was not visible.

## Phase 5 readiness

All Phase 4 acceptance criteria are satisfied: shadcn/ui is configured in the JS/JSX Vite app, review CRUD and authorization are enforced server-side, missing/invalid ratings are rejected, cross-listing deletion has a regression test, the Python and Node suites pass, the production build succeeds, and Phases 0–3 plus the Express rollback app remain intact. No Phase 5 work has been started.
