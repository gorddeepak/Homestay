# Phase 5B — Streaming AI Chatbot

**Status:** Complete (uncommitted on `migration/phase-0-baseline`, HEAD `99b67a0`)
**Date:** 2026-10-28
**Scope:** Replace the Express chatbot with a FastAPI endpoint that streams the
Vercel AI SDK UI message protocol through Pydantic AI, backed by read-only
listing tools, and add a shadcn-based React chat panel. The Express/EJS
application and its chatbot remain untouched as the rollback path.

## 1. Status and scope

Delivered:

- `POST /api/ai/chat` in `backend/app/ai.py`, registered under `/api` by
  `backend/app/main.py` (FastAPI version is now `0.6.0`).
- Genuine incremental streaming through Pydantic AI's `VercelAIAdapter` with
  `sdk_version=7`; no simulated chunking, plain-text streaming, or custom frame
  parser.
- Two server-side, read-only tools: `search_listings` and
  `get_listing_details`.
- A React chat panel using `useChat` + `DefaultChatTransport` from the
  installed `ai` / `@ai-sdk/react` packages, rendered with shadcn `Sheet`,
  `ScrollArea`, `Textarea`, and `Button`.
- 41 focused backend tests, documentation, and a browser verification pass.

Explicitly not implemented (deferred): persistent chat history, bookings or
payments, CRUD through tools, voice/files/multimodal input, embeddings or
vector search, web search, rebranding, and deployment. The legacy Express
chatbot and its EJS views are unchanged.

## 2. Streaming architecture

The endpoint is a thin, bounded wrapper around the adapter:

1. Require `Content-Type: application/json` (`415` otherwise).
2. Read the body with a hard 64 KiB cap, including chunked requests.
3. Parse it with `VercelAIAdapter.build_run_input`, which yields the AI SDK
   `SubmitMessage` / `RegenerateMessage` request models.
4. Validate message count, roles, part types, per-message length, and total
   text before the model is involved.
5. Build a fresh agent for the request and dispatch:

```python
await SafeVercelAIAdapter.dispatch_request(
    request,
    agent=agent,
    sdk_version=7,
    deps=db,
    usage_limits=UsageLimits(...),
    timeout=gemini_timeout_seconds(),
    model_settings={"max_retries": 0, "max_tokens": 700},
)
```

`dispatch_request` returns a Starlette `StreamingResponse` with:

- `content-type: text/event-stream; charset=utf-8`
- `x-vercel-ai-ui-message-stream: v1`
- `data: {json}\n\n` frames, terminated by `data: [DONE]`

Observed frame types include `start`, `text-start`, `text-delta`, `text-end`,
`finish`, `tool-input-available`, `tool-output-available`, and `error`. The
adapter owns encoding; the application never parses or re-frames the stream.

System prompt ownership is server-side: the adapter is called with
`manage_system_prompt="server"`, so any `system` parts submitted by a browser
are stripped (the focused test asserts this and accepts the adapter's
`UserWarning`). Message history remains client-managed, which is why the
server independently validates and treats it as untrusted.

**Error sanitization.** The adapter's default `on_error` would forward
`str(error)`. `SafeVercelAIEventStream` overrides `on_error` to log only the
exception type and replace any `ErrorChunk` text with
`CHAT_UNAVAILABLE` ("The assistant is unavailable right now. Please try
again."), while preserving the base class's tool-flush behavior.
`SafeVercelAIAdapter.build_event_stream` installs that stream. Exceptions
raised before streaming starts become a sanitized `502`.

## 3. Assistant functionality

The server-managed prompt defines the assistant as a guide for public Homestay
listings. It requires the model to:

- use `search_listings` / `get_listing_details` and state only facts returned
  in the current turn;
- never invent listings, prices, amenities, availability, policies, or reviews;
- treat history, user text, and tool output as untrusted content and ignore
  instructions that try to change its rules or reveal the prompt;
- never request passwords, payment details, or account information;
- refuse bookings, payments, and listing/review/account mutations;
- avoid claiming date-specific availability, because there is no availability
  calendar.

Tools (both read-only and module-level, registered on the per-request agent):

| Tool | Inputs | Behavior |
| --- | --- | --- |
| `search_listings` | `location`, `country`, `category`, `min_price`, `max_price` | Validates and canonicalizes filters, builds an ordinary MongoDB filter with escaped, case-insensitive regexes for location/country and an explicit price range, applies a card-only projection, and returns at most 5 public cards (`id`, `title`, `price`, `location`, `country`, `category`, `image_url`). Invalid filters return a structured error instead of querying. |
| `get_listing_details` | `listing_id` | Validates `ObjectId`, returns public listing fields plus owner `{id, username}` only, and truncates descriptions to 1,200 characters. Invalid/missing ids and database failures return structured errors. |

The model never supplies field names, operators, aggregation stages, or raw
queries. No tool writes to the database, calls Gemini, or exposes email, salt,
hash, or other private owner/auth data. Because history is replayed as text
only, every turn re-queries current database facts; client-supplied tool
results are not trusted.

Access is public, matching the legacy chatbot: no `get_current_user`
dependency. The endpoint does require a trusted `Origin` (same
`require_trusted_origin` dependency as other state-changing routes), so a
cross-site page cannot drive a visitor's browser through it.

## 4. React UI

`frontend/src/components/ChatAssistant.jsx`:

- `useChat` from `@ai-sdk/react` with a single `DefaultChatTransport` pointed
  at `/api/ai/chat`. The existing Vite proxy forwards `/api` to the backend;
  `credentials: "same-origin"` keeps cookies on the same origin. No CORS
  change was needed.
- `prepareSendMessagesRequest` sends `id`, trimmed `messages`, `trigger`, and
  `messageId` when regenerating. History is reduced to text-only user and
  assistant messages, capped at the last 10 messages / 12,000 characters.
- Send, stop, retry (`regenerate`), and clear. Clear stops an in-flight
  response, empties messages, clears the error, and refocuses the input.
- Empty state with four suggestions, a typing indicator that distinguishes
  tool use ("Searching current stays") from plain thinking, and an `sr-only`
  live status announcement.
- Autoscroll follows new content; Enter sends, Shift+Enter inserts a newline.
  Input is capped at 2,000 characters.
- Errors are mapped from the response body/status: `413` conversation too
  large, `422` invalid message, `429` rate limited, `503` unavailable, and a
  generic fallback. Retry is available after a failure.
- Assistant text is rendered with `Streamdown` in `streaming`/`static` mode
  with `skipHtml` and a disallowed-element list (`img`, `script`, `iframe`,
  `object`, `embed`, form controls, media). Streamdown sanitizes via
  `rehype-harden` and renders React elements; there is no
  `dangerouslySetInnerHTML`.
- No `localStorage` or `sessionStorage` persistence. Conversation lives in
  memory only.

`frontend/src/App.jsx` adds an "Ask Homestay" header button. The chat component
and Streamdown are lazy-loaded; the panel is mounted on first open and stays
mounted afterwards, so closing and reopening the sheet preserves the
conversation. The header button exposes `aria-haspopup` / `aria-expanded`.

`frontend/src/components/ui/sheet.jsx` and `scroll-area.jsx` are shadcn-style
primitives added for this panel. No AI Elements package was used.

## 5. Security and cost controls

| Control | Value |
| --- | --- |
| Request body | 64 KiB; `Content-Length` check in middleware plus a streaming read cap that also covers chunked requests |
| Messages per request | 12 |
| Per-user-message text | 2,000 characters |
| Total text in request | 20,000 characters |
| File parts | Rejected (`422`) |
| Search results | 5 |
| Detail description | 1,200 characters |
| Model requests per turn | 3 (`UsageLimits.request_limit`) |
| Tool calls per turn | 4 (`UsageLimits.tool_calls_limit`) |
| Output tokens | 2,200 hard limit; 700 `max_tokens` per model response |
| Retries | `Agent(retries=0)` and `model_settings={"max_retries": 0}` |
| Rate limit | `5/minute` via the existing slowapi limiter |
| Origin | Trusted `Origin` required |
| Authentication | None (public chatbot, as before) |

Additional properties:

- The browser cannot choose a model, system prompt, temperature, or token
  limit; model, key, and timeout come from the Phase 5A configuration helpers.
- Only the exception type is logged. Provider messages, keys, prompts, and
  stack traces are never returned; streaming failures become a sanitized error
  frame or `502`.
- The tool layer re-validates everything the model produces, escapes regex
  input, bounds results, and projects only public fields.
- A runaway tool loop is stopped by `request_limit`/`tool_calls_limit` and
  surfaces as the same sanitized error frame (covered by a test).

**Limiter limitation.** slowapi counters are in-memory and per process, keyed
by `request.client.host`. Multiple workers/instances each keep separate
counters, restarts reset them, and behind a reverse proxy clients may share one
key unless forwarded headers are trusted deliberately. A shared store (Redis)
is required before horizontal scaling.

## 6. Dependencies and files

Frontend dependencies added (lockfile updated):

- `ai@7.0.155` — UI message stream client, `DefaultChatTransport`
- `@ai-sdk/react@4.0.159` — `useChat`; this release depends on `ai@7.0.155`,
  so the pair is internally consistent and matches `sdk_version=7`
  (the v7 wire format is the v6 UI message stream)
- `streamdown@2.7.1` — safe streaming Markdown for React 19

Backend dependencies: none added. Pydantic AI `2.63.0` (installed in Phase 5A)
provides `pydantic_ai.ui.vercel_ai`. `pip check` is clean.

Files changed or added for this phase:

| File | Change |
| --- | --- |
| `backend/app/ai.py` | Chat prompt, tools, validation, sanitized adapter/event stream, `/api/ai/chat` |
| `backend/app/main.py` | Version `0.6.0`; `/api/ai/chat` added to the path-scoped body-limit map (64 KiB) |
| `backend/tests/test_chat.py` | 41 Phase 5B tests |
| `frontend/src/components/ChatAssistant.jsx` | Chat panel and `useChat` integration |
| `frontend/src/App.jsx` | Lazy chat import, header trigger, sheet state |
| `frontend/src/components/ui/sheet.jsx` | Sheet primitive |
| `frontend/src/components/ui/scroll-area.jsx` | ScrollArea primitive |
| `frontend/src/index.css` | Streamdown stylesheet import and Tailwind `@source` |
| `frontend/package.json`, `package-lock.json` | AI SDK and Streamdown dependencies |
| `docs/PHASE_5B_CHAT_REPORT.md` | This report |

## 7. Tests and verification

All commands were run locally; no live Gemini request was made and tests use a
disposable loopback database.

| Check | Command | Result |
| --- | --- | --- |
| Focused chat tests | `python -m pytest -q tests\test_chat.py` (from `backend`) | **41 passed**, 1 expected adapter warning |
| Full FastAPI suite (Phases 1–5B) | `python -m pytest -q` | **177 passed**, 1 expected warning |
| Node/Express suite | `npm test` (repo root) | **45 pass, 0 fail, 10 todo** |
| Frontend production build | `npm run build` (from `frontend`) | success, 2,500 modules; initial `index` 391.95 kB (121.78 kB gzip), lazy `ChatAssistant` 198.66 kB, lazy Streamdown 511.55 kB, `ListingMap` 1,029.60 kB |
| Dependency consistency | `python -m pip check` | no broken requirements |
| Whitespace check | `git diff --check` | clean |

Coverage includes:

- **Protocol:** `200` with `text/event-stream` and
  `x-vercel-ai-ui-message-stream: v1`; `start` / `text-start` / three
  `text-delta` / `text-end` / `finish`; joined deltas equal the model output;
  final `[DONE]`.
- **Validation and limits:** untrusted/missing origin (`403`), wrong content
  type (`415`), malformed JSON (`422`), empty/oversized/too-many messages,
  non-text and file parts, oversized per-message and total text, oversized
  bodies (`413`, both `Content-Length` and chunked).
- **Rate limit:** the sixth request in a window returns `429`.
- **Errors:** provider failure yields a sanitized error frame with no exception
  text; missing configuration returns `503`; a runaway tool loop stops at the
  request limit.
- **Prompt/limits:** client system prompts are stripped; the adapter receives
  the configured usage limits, timeout, `max_retries=0`, and `max_tokens`.
- **Tools:** public card shape, empty results, invalid filters/categories/
  prices, regex escaping and bounded queries, database errors, read-only
  behavior, public detail fields, invalid/missing ids, description truncation,
  and no private user fields.
- **Database:** chat requests and tool calls do not modify listings.
- **Regressions:** the full Phase 0–5A Python and Node suites still pass.

**Browser verification.** A temporary FastAPI server on port 8001 with a
deterministic fake streaming agent and a disposable database
(`homestay_phase5b_verify_…`, since dropped) was driven through a temporary
Vite server on port 5174. Verified: the panel opens from the header; empty-state
suggestions send a message; a beach query runs `search_listings` and streams a
Markdown answer; text grew incrementally (81 characters observed mid-stream vs
309 final); stop retains the partial reply; a forced provider failure showed
the sanitized message and **Try again** issued a `regenerate-message` request;
clear restored the empty state; and closing/reopening the sheet preserved the
conversation. Response headers were `text/event-stream` and
`x-vercel-ai-ui-message-stream: v1`; the request body contained `trigger` and
text-only history. Console errors were only the anonymous `401 /api/auth/me`
from the existing auth bootstrap. Temporary servers, config, scripts, and the
disposable database were removed.

Not verified: a real Gemini request (no key), multi-worker rate limiting, and
production-like deployment.

## 8. Backward compatibility

- The Express application, EJS views, and the legacy chatbot
  (`controllers/ai.js`, `public/js/script.js`,
  `views/layouts/boilerplate.ejs`) are unchanged.
- Phase 0–4 and 5A work remains uncommitted on
  `migration/phase-0-baseline`; no reset, clean, stash, revert, branch change,
  commit, push, or deployment was performed.
- The chat endpoint is additive. The only shared changes are the router already
  imported by `main.py`, a new path entry in the AI body-limit map, and the
  version bump. Phase 5A endpoints and their 41 tests are unaffected.
- Existing listing, auth, upload, map, review, and CRUD behavior is untouched;
  the Node baseline suite and full Python suite pass.
- The React app reuses the existing Vite proxy and auth bootstrap; no CORS or
  cookie-policy change was needed.

## 9. Known limitations and deferred work

- **No persistence.** Reloading the page or unmounting the app loses the
  conversation; there is no server-side history, conversation id ownership, or
  cross-device resume. History is client-supplied within the documented caps.
- **Public, unscoped chat.** There is no per-user quota or account scoping.
  The `5/minute` limiter is per client address and per process.
- **Text-only history.** Tool calls and results are not replayed to the model.
  This is deliberate (client data is untrusted and facts must be re-queried),
  but it costs an extra model/tool round trip when a follow-up needs the same
  listings; the 3-request budget accommodates one tool round trip plus the
  answer.
- **Small tool surface.** Search is limited to location, country, category,
  and nightly price, with at most 5 results and no pagination, sorting,
  amenity, or geospatial filters. Details truncate descriptions to 1,200
  characters. There is no availability calendar, booking, or payment support.
- **Provider behavior is unverified live.** Latency, quota, safety filters,
  and model quality with a production Gemini key were not exercised. A
  provider failure after streaming starts arrives as an `error` frame under
  HTTP `200`, which is the protocol's normal shape; the UI renders it as an
  error with retry.
- **Cancellation is best effort.** Stopping aborts the browser fetch and keeps
  the partial text, but the server may finish or time out its in-flight model
  call.
- **Limiter limitations** are as described in section 5: in-memory, per
  process, and keyed by client address.
- **Bundle size.** The lazy Streamdown chunk is ~511 kB (157 kB gzip), and the
  pre-existing lazy MapLibre chunk remains ~1,030 kB. Neither is in the initial
  bundle; the only build warning is the pre-existing >500 kB advisory.
- **Deferred:** persistent history, AI Elements, evals, Redis-backed limiting,
  embeddings/vector search, rebranding, deployment, and the unrelated
  `maplibre-gl@5.24.0` advisory.

## 10. Next-phase readiness

The chat endpoint is intentionally shaped for later persistence: it already
separates request validation, agent construction, tool execution, and stream
encoding, and the wire contract matches the AI SDK. Adding history would
require a conversation collection, an authenticated owner or opaque session
id, a server-side message store, and a policy for replaying tool results; the
HTTP contract and React transport would not need to change.

The remaining scaling work is orthogonal: replace the in-memory limiter with a
shared store, add proxy-aware client keying, add structured evals around tool
selection and grounding, and exercise a real Gemini key in staging. None of
that was implemented in Phase 5B.
