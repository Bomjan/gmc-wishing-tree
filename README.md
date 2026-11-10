# GMC Wishing Tree — second touchscreen

React / TypeScript / Vite, React Three Fiber / drei, Tailwind, Zustand, Express / TypeScript, PostgreSQL and standard `ws`. No Godot, walkthrough or chatbot. The canvas remains mounted throughout the visitor interaction.

## Run the isolated demonstration

Requires Node 22.12+ (tested with Node 24.11.1).

```sh
npm ci
npm run demo
```

Open http://localhost:5173. Demo mode needs neither PostgreSQL nor an AI key. It starts with 76 and 108 **demonstration** leaves, clearly labelled in the interface; its records live only in memory. The server and frontend must both be in demo mode (`DEMO_MODE=true`, `VITE_DEMO=true`, set by the script). Demo data is never inserted in the production database. Refreshing the browser retains demo state while that server process runs; restarting resets it.

Demo locator names: `morning_light`, `mountain_hope`, `mountain_home`. Try `mountain_hore` for an ambiguous match. A wish containing `reject` or `unavailable` exercises revision and moderation outage states. This is a deterministic test adapter, **not AI moderation**.

## Run with PostgreSQL and real moderation

1. Create a dedicated database, or obtain a backend PostgreSQL connection string from Supabase. Use a backend role that owns these tables or can bypass RLS; never put this connection string or a Supabase service key in Vite variables. For Supabase configure TLS using your provider's verified connection settings, including the appropriate CA. Do not disable certificate verification.
2. Copy `.env.example` to `.env`. Set `DATABASE_URL`, `AI_API_KEY` and independent `ENCRYPTION_KEY` / `TOKEN_SECRET`. Generate each key with `openssl rand -base64 32`. Keep these secrets backed up securely and outside Git.
3. Leave `DEMO_MODE=false` and `VITE_DEMO=false`. Set `PUBLIC_ORIGIN=http://localhost:5173` in development.
4. Run:

```sh
npm ci
npm run migrate
npm run dev
```

The default server adapter calls an OpenAI-compatible Chat Completions provider with a strict JSON schema. `AI_BASE_URL` and `AI_MODEL` select the server-side provider and model; the provider must support that response format. Both username and wish are reviewed for safety, with English validation tolerant of names and spelling mistakes. No configured/available provider means a retry response, never silent acceptance. The live provider requires your credentials and has not been validated against a paid account in this workspace.

## Production and kiosk launch

```sh
npm ci
npm run migrate
npm run build
# Set PUBLIC_ORIGIN to the exact deployed origin before starting.
npm start
```

Express serves `dist` and the API on port 3001. Serve HTTPS through a reverse proxy with WebSocket upgrade support on `/ws`; proxy to this process on the same origin. A single API process is the supported deployment: events are in-process. Multiple API replicas need PostgreSQL LISTEN/NOTIFY or another cross-process fan-out before deployment. Database locks and constraints still protect allocation across processes; snapshots repair missed notifications.

For a demo production build, build with `VITE_DEMO=true` and run with `DEMO_MODE=true`. Never serve a demo bundle against the real API. The frontend rejects mismatched forest modes.

Run the server under your OS service manager with automatic restart, then launch the **second display's** Chromium browser with hardware acceleration enabled:

```sh
chromium --kiosk --no-first-run --disable-pinch http://localhost:3001
```

Use the window manager / display settings to place the kiosk on touchscreen two. `--disable-pinch` prevents browser page zoom; the 3D mountain's two-finger dolly/pan controls still work. Configure OS screen blanking and OS touch keyboard on the kiosk. The optional Keyboard control supplies an HTML keyboard if necessary. Never pass `--disable-web-security` or disable WebGL. “Low detail” lowers DPR, shadow resolution and grass instances. Test both quality settings on the actual display resolution before launch.

## Visitor behaviour

Exactly two submission fields: username and wish. ASCII letters/numbers/underscores, 3–24 by default; one accepted wish per normalised username, not verified per human. Wish defaults to 1–500 English characters. Limits are configurable on the server and loaded by the interface. Username limits remain within the database's 3–24 hard bounds.

A database transaction reserves the lowest free slot on the oldest incomplete tree; 108 reservations/final leaves fill a tree. Cancelled slots are reused. Tree UUIDs, seeds and mountain positions persist. Growth uses a continuous size curve spanning sapling to mature tree, with one stable logical slot per leaf. Leaf geometry is real 3D, instanced per tree, and moves with the growing structure. Ordinary background trees do not count and cannot be selected.

Acceptance returns an opaque temporary bearer token and server deadline. Undo requires that token and checks the database clock. Expired reservations are finalised by a server worker and opportunistically on reads/writes; a restart or disconnection cannot reopen the deadline. A restart finalises overdue records on the next worker tick. Permanent leaves have no visitor editing/deletion endpoint.

The browser holds only temporary receipt credentials in sessionStorage to recover a reload or lost acceptance response. A random idempotency key recovers a confirmed request even if its response was lost. Exact retries retain their key; editing the form creates a new attempt. Form contents are never persisted. Ending a visitor session or 90 seconds of inactivity clears the form, search, temporary credentials and highlight, then returns to the current tree. Client idempotency keys and temporary tokens must be treated as secrets until the interaction ends.

Search trims whitespace and normalises case. Exact matches take priority; only inputs of six or more characters permit one insertion, deletion or substitution, and only one candidate is accepted. No suggestions or usernames are returned. A successful search focuses and outlines only the leaf, then clears the highlight (12 seconds by default). Camera moves caused by remote submissions are suppressed; new leaves appear without disturbing typing or mountain exploration. Search and the visitor's own accepted leaf intentionally focus the camera.

Mountain mode supports bounded touch orbit / two-finger pan and zoom, selection of contribution trees and return to the current tree. Camera height is clamped above the procedural terrain. Public snapshots are cached locally; the mountain remains available during temporary API outages. Submissions require a confirmed response. WebSocket reconnects, visibility restoration and periodic polling refresh authoritative state instead of assuming event delivery.

## Privacy and API

No wish retrieval endpoint exists. Wishes are AES-256-GCM encrypted while pending and the ciphertext is erased on Undo or finalisation. Only a keyed HMAC fingerprint remains for retry conflict detection. The provider receives both submitted fields for moderation; choose provider retention and regional processing settings appropriate for the installation. Usernames are stored privately for lookup. RLS has no public access policies. The API never logs bodies, wishes, usernames or tokens. Configure reverse proxies and APM to exclude bodies and Authorization / Idempotency-Key headers too.

Public data includes only positions, seeds, tree IDs, occupied slot numbers and pending/finalised states. There are no leaf labels, tooltips, username metadata, messages or cards.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/config` | Public field constraints |
| `GET /api/forest` | Authoritative public tree/leaf snapshot |
| `POST /api/submissions` | `{username,wish}`, UUID `Idempotency-Key` header |
| `POST /api/recovery` | Recover confirmed attempt using bearer idempotency key |
| `GET /api/submissions/:id` | Minimal receipt status; bearer temporary token required |
| `POST /api/submissions/:id/undo` | Cancel before deadline; same bearer token |
| `POST /api/locate` | `{username}` → only `{treeId,slot}` |
| `GET /api/health` | Process health and demo flag |
| `WS /ws` | Minimal leaf reserved/cancelled/finalised and tree created/removed events |

Size limits, same-origin mutation checks, per-session request budgets, WebSocket connection/payload caps and moderation timeouts provide baseline abuse controls without a low shared-IP quota. Internet-facing deployment needs additional bot controls at the edge; this unauthenticated kiosk does not provide proof of one human or strong adversarial bot prevention.

## Tests

```sh
npm run build
# Against an isolated PostgreSQL database (tests create/drop their own schema):
TEST_DATABASE_URL=postgresql://... npm test
# Debian/Ubuntu alternative, isolated disposable cluster:
pg_virtualenv -t -v 16 npm test
npx playwright install chromium
npm run test:browser
```

Playwright starts and stops its own labelled demo server. Browser tests exercise touchscreen submission → Undo → username reuse → finalisation → search → mountain navigation, rejection preservation, keyboard availability, pending reload and reconnect snapshots. PostgreSQL tests use real transactions for duplicate names, concurrent 108-slot boundaries, deadline checks, restart recovery, idempotency, hole reuse, token authorisation, private response contracts, multi-tree search, fuzzy ambiguity and stable rendering coordinates. See `IMPLEMENTATION_REPORT.md` for actual results and visual/performance limitations.

Compatibility references: [React Three Fiber installation and React major versions](https://r3f.docs.pmnd.rs/getting-started/installation), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat). Installed versions are resolved in `package-lock.json`; use `npm ci` for reproducible installation.
