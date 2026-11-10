# Shared touchscreen: Wishing Tree and Wall of Us

One Vite/React application, Express server, PostgreSQL pool and WebSocket broadcaster. `/` is the shared menu; `/wishing-tree` lazy-loads the original tree; `/handprint-wall` lazy-loads the wall. AI walkthrough remains outside this repository. Target: Samsung 55-inch portrait 2160 × 3840. The whole stage fits desktop previews.

## Setup

Use Node 22.12+ and `npm ci`. `npm run demo` starts explicitly labelled in-memory experiences, without a database or AI credentials. The handprint wall starts empty; visitor-created demo marks persist only until that demo server restarts. Demo moderation uses a labelled approval simulator.

For production configure `.env` using `.env.example`, then run `npm run migrate`, `npm run build`, `npm start`. Keep frontend/server demo flags consistent. Migration sequencing is ordered, recorded in `schema_migrations`, protected by an advisory lock and transactional. Existing forest schema is preserved. Only `.sql` files run; the historical `.sql.example` does not.

- `VITE_HANDPRINT_WALL_TITLE`: configurable working title, default Wall of Us; rebuild frontend after changing.
- `VITE_IDLE_SECONDS`: default 90; warning during final 15 seconds. Reset unmounts the experience and clears unfinished visitor input. Submission/Undo sessions block reset and Home until resolved.
- `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`: existing server provider configuration.
- `HANDPRINT_AI_MODEL`: image-capable model override, otherwise `AI_MODEL` / gpt-4.1-mini. Must accept PNG data images in Chat Completions and JSON object output. Provider outage, invalid output, rejection and missing credentials never publish a print.
- `TOKEN_SECRET`: stable server-only secret. Preserve across restarts to retain temporary Undo authorisation.
- `OPERATOR_TOKEN`: separate server-only credential. Without it operator removal is disabled.

The Wall of Us opens with a fingertip guide. Five distinct touch contacts held briefly in an upright spread produce a stylised left- or right-hand outline fitted to the contacts. The browser receives contact points from the controller. Exact silhouettes require hardware that can capture a full contour. Only the fitted shape is submitted. Visitors can use a default outline with a size slider, or browse the wall directly. The capture requires a controller that reports five concurrent fingertip contacts; verify this on the installed display.

## Submission and persistence

Visitors preview the handprint, select a colour, and can add a first name or nickname on the palm. Submit sends the outline, colour, size and optional label. The server validates the name and moderates it alongside a PNG of the silhouette in production. Failed requests retain the in-session draft for retry. A changed payload uses a new idempotency key. Lost acceptance responses can be recovered with the private retry key. Receipt credentials stay in session storage for the active Undo window.

The server selects a free position and random angle under the existing transaction lock, using the latest section until a new section is needed. The accepted receipt identifies the placed print and section so the gallery can reveal it. Existing prints and clients that provide an explicit pose retain their original placement contract.

Search uses a case-insensitive exact name, with support for multiple matches. It finds finalised marks and jumps to the matching section. Palm labels are stored with the print and rendered for the submitting visitor and when an exact-name search finds a match. Public snapshots, wall caches, WebSocket events and logs omit labels. Search requests send the query in the body and return up to 24 matching print locations.

Records include sanitised geometry/source, colour, seed, pose, state, accepted moderation status, deadline, timestamps, request fingerprint, unique retry key and hashed authorisation token. Pending records finalise opportunistically and on a 500ms sweep, including after restart. Undo is valid only while the server says pending and before its 10-second deadline. Public finalisation has no editing/deletion control. Operator removal remains available.

## API

- `GET /api/handprints/sections`: public sections and pending/finalised print data, demo flag and server time.
- `POST /api/handprints/submissions`: strict submission contract with automatic placement. Supply a UUID `Idempotency-Key` header. The scoped body limit is 64KB.
- `POST /api/handprints/search`: accepts `{ name }` and returns exact matches as print IDs and section IDs.
- `POST /api/handprints/recovery`: UUID retry key as temporary bearer credential; returns the original receipt.
- `GET /api/handprints/submissions/:id`: temporary bearer token required.
- `POST /api/handprints/submissions/:id/undo`: same token; deadline enforced by server.
- `POST /api/handprints/operator/:id/remove`: `Authorization: Bearer <OPERATOR_TOKEN>`. Removes public content and records an operator audit timestamp. Keep this credential out of visitor clients and logs; call from a protected operator machine. No operator credential is embedded in the browser.

WebSocket events contain only event type, section ID and optional handprint ID. Reconnection reloads authoritative public state; 10-second polling repairs missed events. Incoming contributions never move the active camera. Use a single API process for live event fan-out, as for the existing tree.

## Rendering and resources

The wall uses a single Canvas 2D section surface, rather than a second WebGL scene. No per-mark GPU material/texture/draw-call accumulation. A bounded 48-entry raster stamp cache is explicitly released on route cleanup. Spatial separation bounds the number of prints in each section; only one section is painted at a time. Paint variation is seeded: grain, uneven coverage and lighter paint retain the same appearance after reload. Warm plaster grain is deterministic. Pan is bounded and zoom is 1–2×. Section buttons expose adjacent sections. Search zooms toward the matching print and highlights it. Menu previews are illustrations, not contributions.

The wall canvas is released on unmount. The existing React Three Fiber canvas is unmounted before mounting another experience and retains its existing disposal lifecycle. No camera stream or temporary GPU textures are created by the wall. Reduced-motion preferences suppress entrance and highlight animation.

## Verification and remaining deployment checks

Run `npm run build`, `TEST_DATABASE_URL=<dedicated PostgreSQL> npm test`, and `npm run test:browser`. The database tests create isolated schemas and remove them afterward. `pg_virtualenv -t -v 16 npm test` also works where installed. Browser tests start a fresh demo server; generated screenshots are under `test-results/` and stay out of Git.

Unit and HTTP tests cover geometry validation, fingertip fitting, concurrent allocation, name privacy, retry identity, Undo and deadline enforcement. The PostgreSQL/provider contract test covers fail-closed moderation, persistence, restart recovery, exact-name search and removal. Browser tests exercise the complete fallback flow, interrupted touch capture, search after reload, and switching back to Wishing Tree.

Use the installed Samsung touchscreen to verify simultaneous contact reporting, palm rejection, physical guide scale and frame rate. Production moderation quality also requires a check with the configured provider.
