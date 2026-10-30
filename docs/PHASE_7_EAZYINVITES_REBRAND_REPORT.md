# Phase 7 — EazyInvites Rebrand Report

Status: **complete**, with two documented follow-ups (approved logo asset, hosting/DNS
confirmation). No commit, push, branch switch, deployment, DNS change, or production
database write was performed.

A later local design-parity update, requested after this report, ported the legacy
full-screen hero, bento featured grid, and listing-card shape into React. It is recorded
in section 12.

## 1. Scope

Phase 7 applied the EazyInvites identity to the two public front ends:

- the React/Vite application (primary interface), and
- the legacy Express/EJS application (rollback path).

No application behavior, route, schema, authentication mechanism, or AI capability was
changed. All Phase 0–6 work remains uncommitted and intact.

## 2. Brand conventions used

| Item | Value |
| --- | --- |
| Brand name | `EazyInvites` |
| Wordmark | `eazyinvites` |
| Canonical domain | `https://eazyinvites.in` |
| Preferred public URL | `https://eazyinvites.in` |
| Theme color | `#ffffff` |

`EazyInvites` is used in titles, descriptions, and sentences. The lowercase wordmark
`eazyinvites` is used in the header, footer, auth card eyebrow, and manifest
`short_name`. No `EasyInvites` or `easyinvites.in` occurrence remains in application
code or configuration; the only matches are this report and historical documents that
use the earlier “Easy Invites” working name.

## 3. Logo and favicon assets

No approved EazyInvites logo or wordmark asset exists in the repository. In line with
the phase instructions, no logo was invented:

- **Wordmark:** a text wordmark set in the existing `Space Grotesk` display font,
  reusing the current header/footer treatment. It is a plain text link, so replacing
  it with an approved SVG/PNG later is a one-line change per layout.
- **Favicon:** the existing neutral circular icon set was reused unchanged:
  `favicon.ico`, `favicon.svg`, `favicon-96x96.png`, `apple-touch-icon.png`,
  `web-app-manifest-192x192.png`, `web-app-manifest-512x512.png`, `site.webmanifest`.

These seven files were copied from `public/` into `frontend/public/` so Vite serves them
in development and copies them into `dist/` on build. The legacy app continues to serve
the originals from `public/`.

**Still required:** an approved EazyInvites logo/wordmark asset and a brand-specific
favicon. Until supplied, the text wordmark and neutral circular icon remain placeholders.

## 4. React application changes

| File | Change |
| --- | --- |
| `frontend/index.html` | Title, description, canonical, Open Graph, Twitter, theme color, favicon and manifest links |
| `frontend/src/App.jsx` | Header wordmark `eazyinvites`, `Ask EazyInvites`, footer `eazyinvites`, responsive header |
| `frontend/src/components/AuthShell.jsx` | Auth card eyebrow `eazyinvites` |
| `frontend/src/pages/LoginPage.jsx` | “Sign in to your EazyInvites account” |
| `frontend/src/pages/SignupPage.jsx` | “Join EazyInvites and start exploring” |
| `frontend/src/pages/ListingFormPage.jsx` | “Share your space with guests on EazyInvites.” |
| `frontend/src/components/ChatAssistant.jsx` | `EazyInvites assistant`, listing copy, textarea `aria-label` |
| `frontend/src/components/ListingCard.jsx` | Image alt fallback `EazyInvites listing` |
| `frontend/src/pages/BrowsePage.jsx` | Image alt fallback |
| `frontend/src/pages/MyListingsPage.jsx` | Image alt fallback |
| `frontend/src/index.css` | Palette comment only |

Hero copy, section headings, navigation labels, forms, empty/error states, and all
shadcn/ui components were left as they were. No UI, state, or icon library was added.

### Responsive header

The longer wordmark overflowed the single-row header at narrow widths. Two small
responsive adjustments were made in `App.jsx`:

- smaller wordmark and tighter spacing below the `sm` breakpoint; and
- when a user is signed in, the account links wrap to a second row on mobile while the
  desktop layout stays a single 64 px row.

Measured at 390 px: `document.documentElement.scrollWidth === 390` for both signed-out
and signed-in states, with all header controls visible. At 1440 px the signed-in header
remains one row.

## 5. Legacy Express/EJS changes

| File | Change |
| --- | --- |
| `views/layouts/boilerplate.ejs` | Title, description, canonical, OG tags, theme color, apple title, chat header |
| `views/includes/navbar.ejs` | Wordmark `eazyinvites`, home `aria-label` |
| `views/includes/footer.ejs` | Wordmark `eazyinvites`, copyright `EazyInvites` |
| `views/users/login.ejs` | “Sign in to your EazyInvites account” |
| `views/users/signup.ejs` | “Join EazyInvites and start exploring” |
| `public/site.webmanifest` | `name: EazyInvites`, `short_name: eazyinvites` |

No route, controller, Passport/session, model, schema, collection, environment-variable,
database, or AI-route logic was touched. The legacy pages were rendered through the
Express test suite (home, `/listings`, detail, login, signup all return the expected
HTML). A separate visual browser pass of the legacy interface was not performed; only
the React interface received visual browser checks.

## 6. Metadata and SEO

Both front ends now share the same static metadata:

- **Title:** `EazyInvites`
- **Description:** “Explore unique homestays and stays with EazyInvites. Browse listings
  by location, country, price, and category.”
- **Canonical:** `https://eazyinvites.in/`
- **Open Graph:** `website`, site name/title `EazyInvites`, same description,
  `og:url`, and `og:image` set to the existing hero image
  `https://eazyinvites.in/images/hero-homestay.jpg`
- **Twitter:** `summary_large_image` with matching title, description, and image
- **Favicon/manifest:** existing icon set plus `site.webmanifest`
- **Theme color:** `#ffffff`

The legacy layout builds canonical and `og:url` from `<%= currentPath %>`, so listing
pages produce their own URLs rather than all claiming the homepage. Encoding, viewport,
and accessibility-related document settings were preserved.

**Limitation:** the React app is a client-rendered SPA. Social crawlers that do not
execute JavaScript will see only the static `index.html` metadata, so every React route
shares the homepage title/description/image. Server-side rendering was deliberately not
introduced in this phase. The `og:image` URL depends on the documented `/images` route
to the Express image host being available at `https://eazyinvites.in`.

## 7. Domain and configuration documentation

| File | Change |
| --- | --- |
| `backend/.env.example` | Production origin example is now `AUTH_ALLOWED_ORIGINS=https://eazyinvites.in` |
| `docs/DEPLOYMENT_CHECKLIST.md` | Canonical origin, apex vs `www` redirect note, and brand/favicon smoke checks |
| `README.md` | Title and first paragraph rebranded; clone URL, database name, and folder path preserved |

Phase 6 security requirements are unchanged: explicit HTTPS production origins, secure
cookies, mandatory JWT secret, no committed secrets, and same-origin/approved routing.
The `www` hostname is documented as redirecting to the apex at the edge, so only the
apex origin is listed.

## 8. Internal identifiers deliberately preserved

The rebrand did not rename any of the following:

- npm packages `homestay` and `homestay-frontend`
- MongoDB database `homestay`, collection names, and `ATLAS_DB_URL` examples
- auth cookie name `homestay_auth`
- test database prefix `homestay_phase1_test_*`
- API routes under `/api/...`
- CSS classes `homestay-nav` and `homestay-footer`
- image asset filename `hero-homestay.jpg`
- listing category `Heritage Homestay`
- Python module/package names and FastAPI route paths
- README clone URL and working-directory path
- historical migration audit and Phase 0–6 reports

Lowercase “homestay” also remains as ordinary domain language in copy such as “homestay
booking site”, because it describes the product category rather than the brand.

## 9. Verification performed

| Check | Result |
| --- | --- |
| `git diff --check` | Clean (exit 0) |
| Backend `pytest -q` | **186 passed**, 1 expected warning (62.43 s) |
| Root `npm test` | **45 pass, 0 fail, 10 todo** (55 tests, 12 suites, 39.2 s) |
| Frontend `npm run build` | Success; `dist/index.html` contains the EazyInvites title/metadata; favicon assets copied to `dist` |
| Root `npm audit` | **0 vulnerabilities** |
| Frontend `npm audit` | 3 low, dev-only via `shadcn`/`deepmerge`; production dependency audit clean |
| Brand search | Only internal identifiers, the `Heritage Homestay` category, the hero asset filename, lowercase domain language, and historical docs remain |

### Browser checks (React, disposable local database)

Performed at 1440 px and 390 px against a temporary local FastAPI + Vite instance using
a disposable database that was dropped afterwards:

- Landing/browse: title `EazyInvites`, canonical, description, OG site name and image,
  header `eazyinvites` / `Ask EazyInvites`, footer `eazyinvites`.
- Listing detail: branded header/footer and document title.
- Login and signup: branded eyebrow, subtitles, header, and footer.
- Chat: “EazyInvites assistant”, “current EazyInvites listings”, and correct textarea
  `aria-label`.
- Signed-in mobile header: all controls visible, no horizontal overflow.
- Favicon, apple touch icon, and manifest requests all returned **200**; manifest name
  `EazyInvites`, short name `eazyinvites`.
- No application console errors were observed.

No real provider requests were made: the temporary instance used empty
`GEMINI_API_KEY`/`MAPTILER_API_KEY` values, so AI and map calls were not exercised in the
browser. Their branding-only code changes are covered by the test suites.

## 10. Remaining items

1. **Approved logo/wordmark and favicon.** Supply the EazyInvites brand assets; the
   current text wordmark and neutral circular favicon are documented placeholders.
2. **Hosting configuration.** Confirm `AUTH_ALLOWED_ORIGINS=https://eazyinvites.in` in
   the production secret store, confirm the `www` → apex redirect, and confirm TLS and
   DNS. These are dashboard/DNS operations and were not performed.
3. **Image host route.** Confirm `https://eazyinvites.in/images/...` serves the Express
   image assets so the Open Graph image resolves.
4. **Per-page social metadata.** Consider pre-rendering or server-rendered metadata if
   per-listing social previews become a requirement.

## 11. Guardrails

- No commit, push, branch creation, or branch switch.
- No deployment, DNS change, TLS change, or production database write.
- All Phase 0–6 modifications and untracked files were preserved.
- Temporary verification servers, Vite config, scripts, screenshots, browser profiles,
  and the disposable `homestay_phase7_check` database were removed.

## 12. Design parity update (post-report)

After this report, the legacy layout was compared with the React layout and three
visual elements were ported into React at the user's request. No behavior, route, API,
or data contract changed.

| Element | Change |
| --- | --- |
| Hero | Full-viewport background image (`frontend/public/images/hero-homestay.jpg`) with the legacy dark gradient overlay, centered large “The world's finest homes / yours to stay.” copy and “Explore stays” CTA |
| Featured stays | Legacy bento geometry: one 2×2 card, one 2×1 card, and two 1×1 cards in a 4-column, 2-row grid; single-column square cards below `md` |
| Listing cards | Legacy card shape: square image, `rounded-2xl`, dark translucent category badge with tag icon, wrapping title, location eyebrow, and price with `/ night`; 4-column grid from `lg` up |

Verification after the initial parity change:

- Desktop 1440 px: hero 936 px tall; bento cards measured 544×800 (large), 544×392
  (wide), and 264×392 (two small); listing grid 4 columns at 261 px per card.
- Mobile 390 px: hero 780 px tall; bento and listing cards single-column at 358 px;
  `document.documentElement.scrollWidth === 390` (no horizontal overflow).
- 54 images requested, 0 broken; production build succeeds and copies
  `images/hero-homestay.jpg` into `dist`.

### Follow-up polish

Four layout details were then adjusted at the user's request, followed by an
assistant-panel redesign and listing-link/review support:

| Item | Change |
| --- | --- |
| Navbar | On `/` at the top of the page the header is transparent with light text and buttons over the hero; after 24 px of scroll it returns to the existing solid `linen/95` bar with dark text. Other routes always use the solid bar. The hero is pulled up under the header with `-mt-16` and uses `min-h-screen`. |
| Category row | Added a `.no-scrollbar` utility (`scrollbar-width: none` plus hidden WebKit scrollbar) to the horizontally scrollable category filter row. |
| Content width | Header, featured section, listing section, and detail-page containers widened from `max-w-6xl` to `max-w-7xl`, so at 1440 px the browse content is 1280 px wide with 293 px cards instead of 1152 px with 261 px cards. |
| Map | Detail-page map and its loading placeholder raised from `h-72` (288 px) to `h-[28rem]` (448 px), and the map section moved above the guest reviews section. |
| Assistant panel | Restyled the AI chat sheet: warm gradient header with a serif “assistant” accent, 480 px desktop width, gradient user bubbles, white assistant cards, a centred welcome state with suggestion rows, a rounded composer with focus ring, and reduced-motion-safe message animations. |
| Assistant links and reviews | Assistant replies now link listing names to `/listings/{id}` and close the panel on navigation; the backend exposes `get_listing_reviews` plus average rating and review count on search results and listing details. |

Verification after the follow-up:

- Desktop 1440 px: at scroll 0 the header computed `background-color: rgba(0,0,0,0)` with the brand in `linen`; at scroll 700 it computed the solid `linen/95` background with `backdrop-filter: blur(8px)` and the brand in `ink`. Hero starts at the top of the viewport and is 900 px tall (full viewport).
- Category row reports `scrollbar-width: none` and `::-webkit-scrollbar { display: none }` while remaining scrollable (`scrollWidth 1470` vs `clientWidth 1232`).
- Listing grid stays at 4 columns; the detail map container measures 448 px (1230 px wide), renders MapTiler tiles, and appears before “Guest reviews” in the DOM and on screen.
- Mobile 390 px: transparent header at scroll 0, solid after scrolling; hero 844 px (full viewport); `scrollWidth === 390`, no horizontal overflow.
- Assistant panel: 480 px wide on desktop and full-width at 390 px; the welcome card is vertically centred; a mocked SSE stream rendered the user bubble, the assistant card, and Markdown lists without contacting the AI provider.
- Assistant listing link: a mocked reply rendered `Ivy-Draped Villa Overlooking the Chianti Hills` as an in-app anchor to `/listings/6ae1d711a62b8be225412562`; clicking it closed the panel and navigated to the detail page with the correct title.

The rest of the legacy footer and the other legacy layout details remain unported; only
the elements listed above were brought over.

### Local map configuration

The map is wired to `MAPTILER_API_KEY` through `GET /api/config`. When the FastAPI
process starts without that variable, the endpoint returns `{"maptiler_key":null}` and
the detail page shows “The map is not configured for this site.” Starting the backend
with the key from `.env` renders the MapLibre map normally (verified against MapTiler
tiles for a Florence listing). This is an environment requirement, not a code change;
the deployment checklist already lists `MAPTILER_API_KEY` as required for maps.

### Assistant listing links and review access

The chat tools now return a `url` (`/listings/{id}`) for every listing and include
`average_rating` and `review_count` on search cards and listing details. A new
read-only `get_listing_reviews` tool returns up to five recent public reviews with
rating, truncated comment, author username, and date. The system prompt requires the
model to link listing names with Markdown and to treat review comments as guest
opinions. The React chat renders in-app links with React Router and closes the sheet
on navigation; external links open in a new tab, and non-HTTP(S) URLs are not linked.
No review content is invented, and private account fields are never returned.

Backend tests cover the rating summary, review bounds/truncation, missing reviews,
invalid ids, database errors, and private-field exclusion. The full suite passes
(196 tests), and a mocked SSE reply verified the rendered link and navigation without
contacting the AI provider.
