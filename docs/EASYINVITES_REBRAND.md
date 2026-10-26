# EasyInvites Rebrand

**Branch:** `rebrand/easyinvites`
**Base:** `migration/phase-0-baseline` (phase 0 committed separately, per the migration audit)
**Date:** 2026-10-26

## Scope

The rebrand is presentation-only. Routes, data models, auth, AI behavior, and the database name are unchanged.

## Changed

| Area | Change |
|---|---|
| Brand name | `Homestay` → `EasyInvites` in navbar, footer, auth pages, chat header, page title |
| Metadata | Page title, description, Open Graph title/description/type, Apple web-app title, PWA manifest name/short name |
| AI copy | Chat system prompt and listing-search tool description now name EasyInvites |
| Internal identifiers | `.homestay-nav` → `.site-nav`, `.homestay-footer` → `.site-footer`, `hero-homestay.jpg` → `hero.jpg` |
| Package | `package.json` / `package-lock.json` name → `easyinvites` |
| Docs | README title, description, clone path, and project tree updated |

## Intentionally unchanged

- **Database name `homestay`** — existing data lives there; renaming requires a data migration.
- **`Heritage Homestay` category** and seeded listing copy — domain data, not brand copy.
- **Generic uses of "homestay"** (common noun) in AI prompts and listing descriptions.
- **Historical migration documents** under `docs/` — they describe the app as it was audited.

## Still to do (needs brand/ops inputs)

- [ ] Final spelling/casing decision (`EasyInvites` is used here; docs previously said "Easy Invites")
- [ ] Logo and favicon/PWA icon set (current icons are a neutral brown circle)
- [ ] Brand palette (current palette is unchanged)
- [ ] Production domain, canonical URLs, and `og:url`
- [ ] Email sender addresses and social handles
- [ ] Legal/privacy copy review

## Verification

- `npm test` — 44 passing, 10 deferred, 0 failing.
- Booted the app against a disposable local database: `/` returned 200 with title `EasyInvites`; `/css/style.css` served `.site-nav`; `/images/hero.jpg` returned 200.
- The only remaining `Homestay` strings in rendered home-page HTML are the `Heritage Homestay` category labels.
