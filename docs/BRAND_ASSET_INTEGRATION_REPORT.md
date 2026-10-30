# Brand asset integration, navigation, and Mira

This report supersedes section 3 of
`docs/PHASE_7_EAZYINVITES_REBRAND_REPORT.md`, which described the temporary text
wordmark and neutral favicon placeholders.

## 1. Source bundle

The approved bundle lives at `eazyinvite_brand_assets/` and contains:

- `svg/eazyinvite-icon.svg` — standalone window icon.
- `svg/eazyinvite-wordmark.svg` — wordmark only.
- `svg/eazyinvite-logo.svg` — icon + wordmark.
- `svg/eazyinvite-stays-hotels.svg` — wordmark + “STAYS & HOTELS”.
- `svg/eazyinvite-lockup-stays-hotels.svg` — icon + wordmark + descriptor.
- `png/` — transparent raster exports, including `@2x`.
- `favicon/` — SVG, ICO, 16/32/48/64/180/192/512 px icons and the Apple touch icon.

The bundle's brand colours (`#8B7355`, `#3A2F28`, `#C9B99A`, `#FAF8F5`) already
match the application palette (`earth`, `ink`, `sand`, `linen`), so no theme
changes were needed.

## 2. Assets copied into the apps

| Destination | Files |
| --- | --- |
| `frontend/public/brand/` | All five SVG lockups |
| `public/brand/` | All five SVG lockups (legacy Express app) |
| `frontend/public/` | `favicon.svg`, `favicon.ico`, 16/32/48/64/180/192/512 PNGs, `apple-touch-icon.png` |
| `public/` | The same favicon set for the legacy app |

The old `favicon-96x96.png`, `web-app-manifest-192x192.png`, and
`web-app-manifest-512x512.png` files were removed. Both `site.webmanifest` files
now point at `favicon-192x192.png` and `favicon-512x512.png`, use the
`#faf8f5` theme/background colour, and start at `/`.

## 3. React application

### Header

- The text wordmark is replaced by `eazyinvite-logo.svg` at 32 px on mobile and
  36 px from the `sm` breakpoint.
- The header content spans the full viewport with responsive side padding
  (`40 px` at 1440, `56 px` on wider screens) instead of being capped at
  `max-w-7xl`, so the logo and account icon sit near the edges on large
  displays.
- The logo keeps the supplied gold/brown colours in both header states. The
  header background still fades from transparent over the home hero to solid
  `linen` on scroll, but the logo and controls no longer flip to white.
- Login, signup, logout, and the listing shortcuts are consolidated into a
  person-icon account menu (Radix `DropdownMenu`) on the right. Signed out it
  offers log in, sign up, and “List your home”; signed in it shows the username,
  “My listings”, “Add listing”, and “Log out”.
- The logo is still a `Link` to `/` with an accessible name.

### Auth card

- The `eazyinvites` eyebrow is replaced by the same icon + wordmark lockup at
  28 px.

### Footer

The previous one-line footer is replaced by a light `clay` panel with:

- The full icon + wordmark + “STAYS & HOTELS” lockup in its original
  gold/brown colours, with no white filter.
- A short brand statement and a “Curated stays, not listings” kicker.
- **Explore** links: all stays plus four categories.
- **Hosting** links: list a home, my listings, create an account, log in.
- **Mira** copy and an “Ask Mira” button that opens the AI chat sheet.
- A bottom bar with the copyright and “Stays & hotels, thoughtfully curated”.
- Soft radial glows and a hairline top edge; all decorative elements are
  `aria-hidden` and `pointer-events-none`.

The chat open state was lifted from `SiteHeader` to `App` so the footer button
and the floating Mira button control the same `ChatAssistant`.

### Floating Mira button

The header chat button is replaced by a fixed bottom-right circular button with
a `earth`→`ink` gradient, a sparkle icon, and an “Ask Mira” label on hover at
desktop widths. It opens the same chat sheet.

### AI name

The AI is named **Mira** everywhere it is presented:

- Chat sheet title “Mira concierge”, welcome copy, placeholder, errors, status
  text, and accessible labels in `ChatAssistant.jsx`.
- Footer column and “Ask Mira” button in both apps.
- Floating button and its accessible label.
- `CHAT_SYSTEM_PROMPT` and `CHAT_UNAVAILABLE` in `backend/app/ai.py`, the legacy
  `controllers/ai.js` system prompt, and the EJS welcome message.
- `backend/tests/test_chat.py` now asserts that the server prompt introduces
  Mira.

### Category deep links

Footer category links use `/?category=<name>#all-stays`. `BrowsePage` now:

- Initialises and updates the active category from the `category` query
  parameter (validated against `LISTING_CATEGORIES`).
- Scrolls to the listings grid once the API response and featured row have
  rendered, so the anchor does not land above the fold after the late layout
  shift.

## 4. Legacy Express/EJS application

- `views/includes/navbar.ejs` uses `/brand/eazyinvite-logo.svg` in its original
  colours; the transparent navbar keeps the same `earth` text and controls as
  the solid state instead of turning them white. Auth links are consolidated
  into the same person-icon account menu, built with the Bootstrap dropdown.
- `views/includes/footer.ejs` is rebuilt as the same light `clay` panel: full
  lockup in original colours, brand statement, Explore/Hosting/Mira columns, and
  a bottom bar.
- `public/js/script.js` connects the footer “Ask Mira” button to the existing
  chat widget and uses Mira in the welcome message.
- `views/layouts/boilerplate.ejs` uses the new favicon set, the `#faf8f5` theme
  colour, `EazyInvites` as the Apple web-app title, and an “Ask Mira” chat
  header.
- Obsolete `.brand-name`, `.fa-circle`, `.footer-brand-dot`,
  `.footer-brand-name`, `.footer-socials`, and `.footer-legal-links` styles were
  removed.

## 5. Verification

| Check | Result |
| --- | --- |
| `npm run build` (frontend) | Passed; `dist/brand/` and the new favicon set are emitted |
| `git diff --check` | Clean apart from line-ending warnings |
| `npm test` | 45 pass, 0 fail, 10 todo |
| `pytest backend/tests/test_chat.py` | 51 passed |
| Desktop (1440 px) | Original-colour logo over the hero, account menu, floating Mira button, chat sheet, light footer, and category links verified |
| Mobile (390 px) | Header logo and person icon fit; EJS nav panel and chat widget fit |
| Deep link | `/?category=Houseboat#all-stays` activates Houseboat and lands with the grid 80 px below the viewport top |
| Account menu | React Radix menu and EJS Bootstrap menu both open from the person icon and list the correct signed-out options |
| Mira | Header, footer, chat title, empty state, placeholder, errors, backend prompt, and EJS chat all use “Mira” |
| Legacy EJS | Original-colour navbar, light footer, account menu, and “Ask Mira” chat verified at `localhost:8080` |

No commit, push, deployment, DNS change, or production database write was made.
The legacy Express instance used for verification was started with a local
`ATLAS_DB_URL` override; the root `.env` was not modified.

## 6. Open brand question

The supplied wordmark reads **eazyinvite** (singular), while the existing site
copy, metadata, and report use **EazyInvites** (plural). The supplied artwork is
used unchanged. If the public brand name is meant to be singular, the copy
should be aligned in a separate change; if it is plural, a wordmark with the
final “s” is still needed.
