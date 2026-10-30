# Phase 3 — Listing Management Report

## Status

Phase 3 is implemented within its stated scope. A signed-in user can list,
create, edit, and delete their own stays, upload a listing photo, and see the
stored location on a MapLibre map. The existing public browse and detail pages,
the Phase 0–2 work, and the Express/EJS rollback application are intact.

Nothing was committed, pushed, deployed, or run against production data. All
work remains uncommitted on `migration/phase-0-baseline`.

## What was implemented

- FastAPI listing management endpoints, all authorized from the verified JWT
  cookie and protected by the Phase 2 trusted-origin dependency.
- Cloudinary image upload through the official Python SDK, keeping the existing
  `{url, filename}` image document shape.
- Server-side MapTiler forward geocoding for new listings and for location
  changes, plus public geometry in listing detail responses.
- React pages for "My listings" and a shared create/edit form, owner controls
  on the detail page, and a lazily loaded MapLibre map.
- 27 focused backend tests and this report.

## New API endpoints

All paths are under `/api`. Existing `GET /listings` and `GET /listings/{id}`
keep their Phase 1 behavior.

| Method   | Path                        | Access                    | Purpose                                        |
| -------- | --------------------------- | ------------------------- | ---------------------------------------------- |
| `GET`    | `/listings`                 | Public                    | Browse cards (unchanged)                       |
| `GET`    | `/listings/mine`            | Signed in                 | The current user's listings                    |
| `GET`    | `/listings/{id}`            | Public                    | Detail, now including `geometry`               |
| `POST`   | `/listings`                 | Signed in + trusted origin| Create, owner taken from the JWT               |
| `PATCH`  | `/listings/{id}`            | Owner + trusted origin    | Update supplied fields only                    |
| `DELETE` | `/listings/{id}`            | Owner + trusted origin    | Delete the listing, its reviews, and its image |
| `DELETE` | `/listings/{id}/image`      | Owner + trusted origin    | Detach the listing photo                       |
| `POST`   | `/uploads`                  | Signed in + trusted origin| Upload one PNG/JPEG to Cloudinary              |
| `GET`    | `/config`                   | Public                    | `{"maptiler_key": "..."}` for the browser      |

`GET /listings/mine` is registered before `GET /listings/{listing_id}` so the
literal path is never parsed as an ObjectId.

## Data model compatibility

The new code writes to the same `listings` and `reviews` collections as the
Express application and does not rename or reshape any field.

- `owner` is stored as an `ObjectId` taken from the authenticated user; the
  request schema has no owner field, so a supplied owner is dropped by
  validation rather than trusted.
- `image` remains `{url, filename}`. For new uploads `filename` is the
  Cloudinary public id, exactly as `multer-storage-cloudinary` stores it.
- `review` is created as `[]`, `__v` as `0`, matching Mongoose defaults.
- Deleting a listing also deletes the reviews referenced by its `review` array,
  mirroring the Mongoose post-`findOneAndDelete` hook.
- `geometry` is `{"type": "Point", "coordinates": [longitude, latitude]}`,
  matching the existing documents and `[lng, lat]` order.
- All 11 categories from `schema.js` are the single source of truth in
  `backend/app/schemas.py` and are mirrored for the frontend in
  `frontend/src/categories.js`.
- Responses never include `hash`, `salt`, email addresses, sessions, or JWTs.
  Public detail still exposes only `owner.id` and `owner.username`.

The seeded data was inspected before implementation: 49 listings, all with
`Point` geometry and `image.filename: "listingimage"` (including Unsplash and
local `/images/...` URLs). That detail drives the image-cleanup rule below.

## Ownership and authorization

- `get_current_user` from Phase 2 is the only source of identity.
- A shared `_owned_listing` helper validates the ObjectId, loads the document,
  and compares its stored `owner` ObjectId with the authenticated user.
- Invalid ids return `400`; missing listings and other users' listings both
  return `404 {"detail": "Listing not found"}` so the API does not confirm that
  someone else's listing exists.
- Unauthenticated mutations return `401`; a missing or untrusted `Origin`
  returns `403` through the existing `require_trusted_origin` dependency.
- `DELETE /listings/{id}/image` accepts no asset identifier at all. It removes
  only the image stored on the authorized listing, so a client cannot name an
  arbitrary Cloudinary public id.
- The React owner buttons are a convenience only; every mutation is re-checked
  server-side.

## Images

Upload flow:

1. The browser posts one file to `POST /api/uploads` (`multipart/form-data`).
2. The API reads at most 5 MB + 1 byte, rejects anything larger with `413`, and
   detects the real format from magic bytes (PNG signature, JPEG `FF D8 FF`).
   Anything else is `422`; the client-declared filename and content type are
   not trusted.
3. The Cloudinary SDK uploads to the existing `airbnb_DEV` folder with
   `allowed_formats=["png","jpg","jpeg"]`.
4. The endpoint returns `{url, filename}`; create/patch accept that object as
   JSON, which keeps the JSON APIs consistent and the provider call mockable.

Limits (documented because the original relies on multer/Cloudinary defaults
rather than explicit application limits): one image per listing (the schema is
a single image object), PNG or JPEG only, 5 MB maximum.

Lifecycle ordering:

- Upload happens before the database write. If the insert fails, the newly
  uploaded asset is deleted when it can be shown to be unreferenced.
- On `PATCH`, the listing is updated first; only then is the previous asset
  deleted, so a failed update cannot destroy the current photo.
- A photo is deleted only when `image.url` starts with
  `https://res.cloudinary.com/`, `filename` is non-empty, and no other listing
  references that `filename`. Seeded Unsplash/local URLs with
  `filename: "listingimage"` are never sent to the provider.
- Provider and cleanup failures are logged and never corrupt an otherwise
  successful listing request. MongoDB and Cloudinary are not treated as one
  transaction.

Tests monkeypatch `images.upload_image` and `images.delete_image`; the suite
sets empty Cloudinary variables, so no real provider call can occur.

## Maps and geometry

- On create, if the client does not send `geometry`, the server geocodes the
  free-text `location` with MapTiler forward geocoding (`httpx`, 10 s timeout).
- On update, geometry is re-geocoded only when `location` actually differs from
  the stored value. Unrelated edits preserve existing geometry, including
  legacy documents whose geometry is already valid.
- A missing `MAPTILER_API_KEY` or unreachable service returns `503`; a location
  with no result returns `422`. In both cases the document is left unchanged.
- Clients may also send `geometry` directly; it is validated as a `Point` with
  exactly two finite coordinates (`longitude` in −180..180, `latitude` in
  −90..90). On update it is used only when `location` is absent or unchanged,
  because a changed location is authoritative. The browser form does not expose
  geometry editing, matching the original Express form, which stores what the
  server geocodes.
- Public detail responses include `geometry`; browse cards do not.
- Invalid geometry already stored in MongoDB is returned as `null` rather than
  failing the whole detail response.

The detail page renders the point with MapLibre GL JS, using the same MapTiler
`streets` style as the Express view. The public key comes from `GET /api/config`
and is the browser-facing key the provider expects to be public; no Cloudinary
credentials are exposed. The map component is lazy-loaded so MapLibre is only
downloaded on a detail page. Missing key, missing geometry, and load failures
show a plain message instead of a blank map.

## Dependencies added

Backend (`backend/requirements.txt`):

- `cloudinary==1.46.3` — official provider SDK; avoids hand-written upload
  signing.
- `python-multipart==0.0.32` — required by FastAPI to parse the upload form.
- `httpx==0.28.1` — moved from dev-only to runtime because geocoding runs in
  the API.

Frontend:

- `maplibre-gl@^5.9.0` (resolved 5.24.0) — the library the original CDN view
  already uses for the same MapTiler style.

No state-management library, form library, HTTP client, or image framework was
added. `fetch`, native forms, and React state are used throughout.

## Environment variables and local setup

New or newly consumed variables (see `backend/.env.example`):

```
CLOUD_NAME=
CLOUD_API_KEY=
CLOUD_API_SECRET=
MAPTILER_API_KEY=
```

The Cloudinary names are the same variables the Express app already uses. The
backend loads only `backend/.env`, so copy `backend/.env.example` to
`backend/.env` and fill in `ATLAS_DB_URL`, `AUTH_JWT_SECRET`, and the
Cloudinary/MapTiler values from the root `.env` used by Express.

Local run:

```powershell
cd backend
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

cd ..\frontend
npm install
npm run dev
```

Without Cloudinary credentials, uploads return `502` and new listings cannot
be created. Without a MapTiler key, creation without explicit geometry returns
`503` and the detail map shows a fallback message. Both are intentional and
tested.

## Tests and verification

Backend (`cd backend; .venv\Scripts\python.exe -m pytest -q`):

- **56 passed**, 1 third-party deprecation warning.
- `tests/test_listings.py` (10) — Phase 1 browse/detail/health behavior.
- `tests/test_auth.py` (19) — Phase 2 authentication, origin, rate limits.
- `tests/test_listing_management.py` (27) — Phase 3 behavior.

The Phase 3 tests cover authenticated creation; required-field, category,
price, image, and geometry validation; owner assignment from the cookie and
ignored client-supplied owner/`review`/`__v`; `/mine` isolation; owner edit and
delete; non-owner 404s; unauthenticated 401s; untrusted-origin 403s; malformed
and missing ids; geometry preservation and regeneration; geocoding failure
leaving the document unchanged; public geometry exposure; malformed stored
geometry; upload auth/origin/configuration; magic-byte and size rejection;
mocked provider upload/delete; image cleanup on insert failure; old-asset
deletion only after a successful update; shared-asset protection; and image
removal that ignores client-supplied identifiers.

Node suite (`npm test` from the repository root): **55 tests, 45 passed, 0
failed, 10 todo**, unchanged from Phase 2. This suite boots the real Express
application and exercises public pages, listing detail, auth, ownership, review,
AI, and health contracts, which is the Phase 3 check that Express still works.

Frontend (`cd frontend; npm run build`): **success**, 40 modules transformed.
Initial JS is 298 KB (90.6 KB gzip); the lazy map chunk is 1.03 MB (274 KB
gzip) and is only fetched on a detail page. Vite prints its standard
"chunk larger than 500 kB" notice for the map chunk.

Live API verification: a disposable copy of the local `homestay` database was
created as `homestay_phase3_verify`, FastAPI was started on port 8001 with
empty provider keys, and **47 checks passed**. They covered health/config,
public browse and detail, signup, geocoding-unavailable create, create with
explicit geometry, stored owner/image/review/`__v` shape, `/mine`, patch with
geometry preservation, non-owner 404s, missing/bad origin, unauthenticated
mutations, invalid/missing ids, category and geometry validation, upload
auth/origin/format/config errors, deletion, logout, and seeded image/geometry
shape. The server was stopped and the copy dropped afterwards; the source
`homestay` database was only read.

`git diff --check` is clean.

No browser-automation pass was run: the in-app browser has been unavailable in
this environment. The React work was verified through the production build and
the live API flows above, so DOM-level interactions are not claimed as tested.

## Known limitations

- **One image per listing.** The shared schema stores a single `{url,
  filename}` object, so a gallery or multi-image upload UI would require a
  schema change and was out of scope.
- **Orphaned uploads are possible.** Uploading happens as soon as a file is
  chosen. If the user then removes the photo, replaces it again, or the save is
  rejected by validation, the earlier upload is not deleted. There is no
  endpoint to delete an asset that is not yet attached to a listing.
- **Cleanup is best effort.** If MongoDB is unreachable at cleanup time, the
  reference check cannot run and the asset is left in place rather than risking
  deletion of a shared image.
- **Deletion is not transactional.** Listing, review, and image cleanup are
  separate operations; a mid-way database failure can leave reviews or an asset
  behind. No replica-set transaction was introduced.
- **Synchronous geocoding.** Creation or a location change waits for MapTiler
  (10 s timeout). The UI reports the resulting `503`/`422` without losing the
  form.
- **No pagination.** `/listings` and `/listings/mine` return full result sets,
  matching Phase 1 and the original browse behavior.
- **Rate limiting** remains on the auth endpoints only. New mutations rely on
  cookie authentication and trusted-origin checks; per-user mutation quotas
  would be a later hardening step.
- **No frontend component tests.** The project still has no frontend test
  runner; adding one was outside this phase.
- **Geocoding accuracy** is MapTiler's: a free-text location resolves to one
  approximate point, as in the Express application.

## Deferred work

- Reviews and ratings (Phase 4).
- AI chatbot, natural-language search, and related endpoint changes.
- Bookings, payments, and availability.
- Easy Invites rebrand, domain, and SEO changes.
- Password reset, email verification, and OAuth.
- Deployment, infrastructure, and any production data migration.
- Optional later hardening: mutation rate limits, multi-image schema, upload
  garbage collection, and frontend component tests.

## Backward compatibility

- The four Phase 0 modifications and every Phase 1/2 file are preserved.
- No Express route, controller, template, model, Passport/session, or
  `cloudConfig.js` file was modified.
- The Express application still starts and passes its full Node suite, so it
  remains a working rollback path.
- Shared collections, document shapes, ObjectIds, categories, image objects,
  and `[lng, lat]` geometry are unchanged.

## Significant files

Backend:

- `backend/app/listings.py` — CRUD, ownership, geometry, review/image cleanup.
- `backend/app/uploads.py` — multipart upload endpoint.
- `backend/app/images.py` — Cloudinary upload/delete and validation.
- `backend/app/geocoding.py` — MapTiler forward geocoding.
- `backend/app/schemas.py` — categories, image/geometry/create/update models,
  `geometry` on detail.
- `backend/app/config.py` — Cloudinary and MapTiler configuration readers.
- `backend/app/main.py` — uploads router, `GET /api/config`, version 0.3.0.
- `backend/tests/test_listing_management.py` — Phase 3 tests.
- `backend/tests/conftest.py` — shared auth reset, provider env isolation.

Frontend:

- `frontend/src/pages/MyListingsPage.jsx` — owner listing index.
- `frontend/src/pages/ListingFormPage.jsx` — shared create/edit form.
- `frontend/src/components/ListingMap.jsx` — lazy MapLibre map.
- `frontend/src/pages/DetailPage.jsx` — owner controls and map.
- `frontend/src/api.js` — listing, upload, and config helpers.
- `frontend/src/categories.js` — shared category list.
- `frontend/src/App.jsx` — new routes and signed-in navigation.

## Phase 4 readiness

The Phase 3 acceptance criteria are met: listing management works end to end
through the new frontend and backend, authorization is enforced server-side,
images and the supported map behavior are integrated, and the existing
application remains intact. The backend is ready for Phase 4 review work to be
added alongside the preserved `review` references and cascade behavior.
