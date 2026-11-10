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

Use the window manager / display settings to place the kiosk on touchscreen two. `--disable-pinch` prevents browser page zoom; the 3D tree view's two-finger dolly/pan controls still work. Configure OS screen blanking and OS touch keyboard on the kiosk. The Keyboard control inside the form or expanded leaf search supplies an HTML keyboard if necessary. Never pass `--disable-web-security` or disable WebGL. For operator setup, append `?quality=low` or `?quality=high` to the kiosk URL; the setting persists locally and controls DPR, shadow resolution and leaf detail. Test both quality settings on the actual display resolution before launch.

## Visitor behaviour

Exactly two submission fields: username and wish. ASCII letters/numbers/underscores, 3–24 by default; one accepted wish per normalised username, not verified per human. Wish defaults to 1–500 English characters. Limits are configurable on the server and loaded by the interface. Username limits remain within the database's 3–24 hard bounds.

A database transaction reserves the lowest free slot on the oldest incomplete tree; 108 reservations/final leaves fill a tree. Cancelled slots are reused. Tree UUIDs, seeds and world positions persist. Growth uses a continuous size curve spanning sapling to mature tree, with one stable logical slot per leaf. Trunk, branches, canopy and leaves grow with actual contributions; leaves are instanced per tree and move with the structure. Only wish trees appear in the scene.

Acceptance returns an opaque temporary bearer token and server deadline. Undo requires that token and checks the database clock. Expired reservations are finalised by a server worker and opportunistically on reads/writes; a restart or disconnection cannot reopen the deadline. A restart finalises overdue records on the next worker tick. Permanent leaves have no visitor editing/deletion endpoint.

The browser holds only temporary receipt credentials in sessionStorage to recover a reload or lost acceptance response. A random idempotency key recovers a confirmed request even if its response was lost. Exact retries retain their key; editing the form creates a new attempt. Form contents are never persisted. After 60 seconds without pointer, keyboard or text-input activity, the kiosk clears temporary visitor state and reloads to the current tree. It will not reload during an active request or server-owned Undo window. Configure the timeout with `VITE_IDLE_SECONDS`. Client idempotency keys and temporary tokens must be treated as secrets until the interaction ends.

Search trims whitespace and normalises case. Exact matches take priority; only inputs of six or more characters permit one insertion, deletion or substitution, and only one candidate is accepted. No suggestions or usernames are returned. A successful search focuses and outlines only the leaf, then clears the highlight (12 seconds by default). Camera moves caused by remote submissions are suppressed; new leaves appear without disturbing typing or mountain exploration. Search and the visitor's own accepted leaf intentionally focus the camera.

The wider-tree view supports bounded touch orbit / two-finger pan and zoom, tree selection and return navigation. Camera movement stays above the simple neutral ground plane. Public snapshots are cached locally; the current tree remains available during temporary API outages. Submissions require a confirmed response. WebSocket reconnects, visibility restoration and periodic polling refresh authoritative state instead of assuming event delivery.

## Privacy and API

No wish retrieval endpoint exists. Wishes are AES-256-GCM encrypted while pending and the ciphertext is erased on Undo or finalisation. Only a keyed HMAC fingerprint remains for retry conflict detection. The provider receives both submitted fields for moderation; choose provider retention and regional processing settings appropriate for the installation. Usernames are stored privately for lookup. RLS has no public access policies. The API never logs bodies, wishes, usernames or tokens. Configure reverse proxies and APM to exclude bodies and Authorization / Idempotency-Key headers too.

Public data includes only positions, seeds, tree IDs, occupied slot numbers and pending/finalised states. There are no leaf labels, tooltips, username metadata, messages or cards.

| Endpoint                         | Purpose                                                                   |
| -------------------------------- | ------------------------------------------------------------------------- |
| `GET /api/config`                | Public field constraints                                                  |
| `GET /api/forest`                | Authoritative public tree/leaf snapshot                                   |
| `POST /api/submissions`          | `{username,wish}`, UUID `Idempotency-Key` header                          |
| `POST /api/recovery`             | Recover confirmed attempt using bearer idempotency key                    |
| `GET /api/submissions/:id`       | Minimal receipt status; bearer temporary token required                   |
| `POST /api/submissions/:id/undo` | Cancel before deadline; same bearer token                                 |
| `POST /api/locate`               | `{username}` → only `{treeId,slot}`                                       |
| `GET /api/health`                | Process health and demo flag                                              |
| `WS /ws`                         | Minimal leaf reserved/cancelled/finalised and tree created/removed events |

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

Playwright starts and stops its own labelled demo server. Browser tests exercise touchscreen submission → Undo → username reuse → finalisation → search → mountain navigation, rejection preservation, keyboard availability, pending reload and reconnect snapshots, plus idle reload and Undo-window protection. PostgreSQL tests use real transactions for duplicate names, concurrent 108-slot boundaries, deadline checks, restart recovery, idempotency, hole reuse, token authorisation, private response contracts, multi-tree search, fuzzy ambiguity and stable rendering coordinates. See `IMPLEMENTATION_REPORT.md` for actual results and visual/performance limitations.

Compatibility references: [React Three Fiber installation and React major versions](https://r3f.docs.pmnd.rs/getting-started/installation), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat). Installed versions are resolved in `package-lock.json`; use `npm ci` for reproducible installation.

## Display composition

The installation is a **55-inch Samsung UHD touchscreen mounted in portrait**, with a native viewport of **2160 × 3840 (9:16)**. Use fullscreen/kiosk mode at 100% browser zoom, and set the operating system display orientation to portrait. The tree dominates the screen. A narrow right-edge rail with Make a wish and More controls defaults to 32% from the top (roughly 83 cm above a floor-level 55-inch 16:9 panel, excluding its bezel). The circular actions and short labels leave the tree centre clear. There is no persistent title or large welcome panel. Expanded options open to the left of the rail. Search and mountain navigation are secondary actions inside More options. Drag the up/down handle to move the controls; Higher, Lower and Default height buttons provide an alternative. The wish form and Undo open in compact, content-sized sheets aligned to the right edge at the chosen height. The form has a 32rem width cap, concise help and a height handle in its header; large hit targets remain. Opening the optional keyboard keeps the fields in place unless screen bounds require adjustment. Done and idle reset restore the operator default (`VITE_CONTROL_HEIGHT=0.32`, fraction from the top). Check the actual mounting height with visitors, including seated users, and adjust the default as needed.

UI dimensions use a 1080 × 1920 portrait design basis, scaling to 2× at native UHD. Smaller development windows fit the complete portrait stage; landscape desktop windows show unused space at the sides rather than changing the layout or cropping the tree. This is a portrait kiosk interface, not a landscape installation. OS display scaling follows the actual CSS viewport. Software-rendered screenshots verify composition and layout only; installed Samsung hardware performance still needs measurement.

The museum wall display has no website header, footer, utility bar or navigation branding. Only the tree and its interaction area appear. Demo mode is identified in the small leaf-count caption. Keyboard controls appear only during text entry and move with the interaction panel, and rendering quality is configured by the operator URL rather than visitor-facing chrome.

## Handprint Wall contributor scaffold

The shared-app extension folders are prepared for the next contributor. **The menu, new routes and Handprint Wall are not implemented or mounted yet**; the existing Wishing Tree continues to run unchanged. Start with [the handoff brief](docs/handprint-wall-handoff.md) and [AGENTS.md](AGENTS.md). Proposed menu metadata, handprint transport contracts, palette/defaults, tracked empty feature folders and an **inactive** migration template are included. The actual filesystem and implementation responsibilities are documented in the handoff. Do not start a separate application or backend.

## GMCX visual identity and leaf arrival

The current kiosk uses [GMCX](https://gmcx.bt/) typography and blue/gold palette, with locally bundled Lora/Roboto fonts and no website header/footer. The default scene isolates one contribution tree against a quiet warm backdrop, with a restrained spotlight and contact shadow; the wider view shows actual contribution trees only. Trunk and branches thicken as the tree grows, and the full tree scales continuously from sapling to mature size with the contribution count. An accepted leaf approaches, unfurls and settles over 3.2 seconds; reduced-motion skips directly to the resting pose. Counts, logical leaf slots, server confirmation, Undo and private wish behaviour are unchanged. See [visual direction, credits and review captures](docs/gmcx-visual-direction.md). These changes do not implement or mount the Handprint Wall scaffold.

Wish entry and confirmation sheets use translucent white glass surfaces that keep the tree visible behind them, a compact GMC Experience Centre wordmark, blue Lora headings, blue/gold accent rules, Roboto form controls and the GMCX yellow-gold primary action.

Current sheet captures: [wish form](docs/screenshots/gmcx-branded-form.png) · [accepted wish](docs/screenshots/gmcx-branded-receipt.png).

Latest scene comparison: [4-leaf sapling](docs/screenshots/tree-sapling-4.png) · [108-leaf mature tree](docs/screenshots/tree-mature-108.png). Playwright runs its demo on dedicated ports 5187/3017 by default; override `PLAYWRIGHT_PORT` and `PLAYWRIGHT_API_PORT` if those ports are occupied.

Form validation uses calm inline field errors and a compact moderation feedback strip instead of browser-native validation popups. See [validation feedback](docs/screenshots/form-validation-feedback.png).

Run the isolated accelerated idle checks with `VITE_IDLE_SECONDS=4 npm run test:browser -- tests/browser/idle.spec.ts`; this test file is skipped during normal browser runs.
