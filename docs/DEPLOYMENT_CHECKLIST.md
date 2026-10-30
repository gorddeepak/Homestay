# Deployment Checklist

Operational checklist for shipping the EazyInvites FastAPI + React stack at
`https://eazyinvites.in`. Substitute your own database and provider accounts as
needed. Phase 6 did not deploy anything; this is the procedure to follow when
you do.

---

## 1. Before you start

- [ ] Confirm the release branch and record the exact commit being deployed.
- [ ] Confirm the Express/EJS application is still available as the rollback path.
- [ ] Have the production MongoDB URI, JWT secret, and provider keys ready in a
      secret manager — never in the repository or a build-time variable.
- [ ] Decide the public HTTPS origin(s) for the site. The canonical origin is
      `https://eazyinvites.in`; `https://www.eazyinvites.in` is already expected
      to redirect to the apex domain.

## 2. Runtime versions

- [ ] Node **22.x** (root `engines` pins `22.22.2`).
- [ ] Python **3.13**.
- [ ] MongoDB **7** (Atlas or self-hosted).
- [ ] Reverse proxy with TLS termination (nginx, Caddy, a load balancer, or a
      platform edge).

## 3. Backend configuration

Set these in the backend environment:

| Variable | Required | Notes |
| --- | --- | --- |
| `ENVIRONMENT` | yes | Must be exactly `production` |
| `ATLAS_DB_URL` | yes | Must include the database name |
| `AUTH_JWT_SECRET` | yes | ≥ 32 chars, generated per environment |
| `AUTH_ALLOWED_ORIGINS` | yes | Comma-separated, every entry `https://…`, no localhost |
| `CLOUD_NAME`, `CLOUD_API_KEY`, `CLOUD_API_SECRET` | for uploads | Server-side only |
| `MAPTILER_API_KEY` | for maps | Public browser key; restrict by origin |
| `GEMINI_API_KEY` | for AI | Server-side only |
| `GEMINI_MODEL` | optional | Defaults to the pinned model |
| `GEMINI_TIMEOUT_SECONDS` | optional | Defaults to 20; keep bounded |

- [ ] `ENVIRONMENT=production` is set. Without it the app starts in development
      mode, which is a **security failure**: localhost origins apply and Secure
      cookies are not forced.
- [ ] `AUTH_ALLOWED_ORIGINS` contains the real HTTPS origin with no trailing
      path, and **no** `http://` or localhost entry. Startup fails otherwise.
      For the canonical deployment: `AUTH_ALLOWED_ORIGINS=https://eazyinvites.in`.
      The `www` hostname redirects to the apex at the edge, so it does not need
      to be listed.
- [ ] `AUTH_COOKIE_SECURE` may be left unset; production ignores it and always
      sets `Secure`.
- [ ] The JWT secret is unique to production and is not the development value.
- [ ] No secret is present in `VITE_*` variables, the frontend bundle, or the
      repository. `GET /api/config` must return only `maptiler_key`.
- [ ] MapTiler key is origin-restricted in the MapTiler dashboard.

## 4. Build and install

- [ ] Backend: `python -m pip install -r backend/requirements.txt` into a clean
      virtualenv.
- [ ] Root: `npm ci --legacy-peer-deps`
      (`--legacy-peer-deps` is required by the existing
      `multer-storage-cloudinary`/`cloudinary` peer range).
- [ ] Frontend: `npm ci && npm run build` in `frontend/`; deploy
      `frontend/dist/`.
- [ ] Do **not** run `npm audit fix --force`; it breaks the shadcn CLI.

## 5. Serve the app

One public origin, three routes:

```
/            → static SPA from frontend/dist, fallback to index.html
/api/*       → FastAPI (uvicorn)
/images/*    → Express static image host (legacy listing images)
```

- [ ] SPA fallback is configured for unknown non-`/api` paths.
- [ ] `/api` is proxied to the FastAPI process with the original `Host` and
      scheme headers preserved.
- [ ] `/images` is proxied to the Express image host, or images are migrated to
      Cloudinary URLs.
- [ ] TLS is enforced and HTTP redirects to HTTPS.
- [ ] Request body limits at the proxy are at least the app limits
      (16 KiB AI, 64 KiB chat, 5 MiB upload) and not larger than necessary.
- [ ] Proxy timeouts allow streaming chat responses (no aggressive buffering).

### Proxy-aware client addresses

Rate limits are per process and keyed by the direct peer address. Behind a
proxy, start uvicorn with:

```
uvicorn app.main:app --proxy-headers --forwarded-allow-ips=<proxy-ip>
```

- [ ] `--forwarded-allow-ips` lists only the proxy, never `*`.
- [ ] If you run multiple workers or instances, move rate limiting to a shared
      store (e.g. Redis) first. Otherwise limits are per worker and reset on
      restart.

## 6. Health probes

| Probe | Path | Expected |
| --- | --- | --- |
| Liveness | `/api/health/live` | `200 {"status":"ok"}` |
| Readiness | `/api/health/ready` | `200` when MongoDB is reachable, `503` otherwise |
| Uptime monitor | `/api/health` | `200` / `503` |

- [ ] Liveness does **not** depend on the database.
- [ ] Readiness is what the load balancer uses to add/remove instances.
- [ ] Alerts fire on sustained readiness failure, not on a single blip.

## 7. Verify the deployment

Run these against the deployed origin:

- [ ] `GET /api/health/ready` → `200`.
- [ ] Load `/` and a listing detail page; no console errors from application
      code.
- [ ] The browser tab title reads `EazyInvites`, and the favicon loads without a
      `404`.
- [ ] Sign up, log out, log in, and confirm the session survives a reload.
- [ ] Confirm the auth cookie is `HttpOnly`, `Secure`, `SameSite=lax` in the
      browser devtools, and that `document.cookie` is empty.
- [ ] Confirm no credentials appear in `localStorage`/`sessionStorage`.
- [ ] Create, edit, and delete a listing as its owner; confirm another account
      cannot.
- [ ] Upload a PNG/JPEG under 5 MiB and confirm a larger file is rejected.
- [ ] Post, edit, and delete a review; confirm cross-listing and cross-user
      mutations are rejected.
- [ ] Open a listing with coordinates and confirm map tiles render with the
      production key.
- [ ] Trigger one AI description, one AI search, and one chat reply; confirm
      streaming works through the proxy.
- [ ] Send an oversized body to an AI endpoint and confirm `413`.
- [ ] Confirm a state-changing request from an unlisted origin is rejected.

## 8. Monitoring and operations

- [ ] Ship application logs and alert on 5xx rate and readiness failures.
- [ ] Confirm secrets are injected at runtime, not baked into images.
- [ ] Confirm database backups and point-in-time recovery are enabled.
- [ ] Record the rollback command and the previous image/tag before switching
      traffic.

## 9. Rollback

- [ ] Re-point traffic to the previous backend/frontend release.
- [ ] If the API must be withdrawn entirely, route `/api` back to the Express
      application; it remains a working fallback.
- [ ] Rotate the JWT secret only if you accept invalidating all sessions.

## 10. Known accepted risks

- 3 low **dev-only** frontend advisories (`shadcn` → `@shadcn/registry` →
  `deepmerge`). `npm audit --omit=dev` is clean. The offered fix downgrades the
  CLI and is a breaking change.
- Root installs require `--legacy-peer-deps` because
  `multer-storage-cloudinary@4` declares a `cloudinary@^1` peer while the app
  uses `cloudinary@2`.
- Rate limiting is in-memory; see §5.
- Map tiles are verified only against the deployed production key; Phase 6
  verified the unconfigured fallback path.

See `docs/PHASE_6_HARDENING_REPORT.md` for the full analysis.
