# Legacy Express/EJS removal

The React + FastAPI stack is now the only application in the repository. The
old Express/EJS app was removed instead of being kept as a second UI.

## Removed

- Root entry points: `app.js`, `middleware.js`, `cloudConfig.js`, `schema.js`
- `controllers/`, `models/`, `routes/`, `views/`, `utils/`, `init/`, `test/`
- Root `public/` assets used only by the EJS UI (CSS, client JS, favicons,
  brand copies)
- Root `package.json`, `package-lock.json`, and `env.example`
- Root Node dependencies, including Express, EJS, Mongoose, Passport, Multer,
  and the Vercel AI SDK

## Replaced

| Legacy need | Replacement |
| --- | --- |
| Express served `public/images` at `/images` | `backend/static/images/` mounted by FastAPI at `/images` |
| Vite proxied `/images` to `:8080` | Vite proxies `/images` to FastAPI on `:8000` |
| `node init/index.js` seeded MongoDB through Mongoose | `python -m scripts.seed` seeds through PyMongo |
| `init/data.js` sample data | `backend/scripts/seed_data.json` |
| Root Node contract tests | FastAPI pytest suite; static-image tests added |
| Cross-language tests called Node/Mongoose | Fixed passport-local-mongoose hash vector in `backend/tests/test_auth.py` |
| Root CI install and `npm test` | Backend pytest, seeder compile check, frontend build |

## Compatibility notes

- Existing MongoDB data is unchanged: listing, review, and user documents keep
  their original field names and ObjectId references.
- Existing password hashes remain valid. `backend/app/auth.py` still uses the
  PBKDF2 format written by passport-local-mongoose, and the fixed test vector
  proves it.
- Existing seeded image URLs such as `/images/manali.png` now resolve through
  FastAPI instead of Express.
- The root `.env` is no longer read by anything. It is still git-ignored and can
  be deleted locally.

## Verification

- `python -m pytest -q` in `backend/`: **198 passed**
- `npm run build` in `frontend/`: production build succeeded
- Seeder against a disposable database: **10 users, 49 listings, 185 reviews**
- `GET /api/health` → `200`
- `GET /images/manali.png` → `200 image/png`
- `GET /images/manali.png` through the Vite dev proxy → `200 image/png`
