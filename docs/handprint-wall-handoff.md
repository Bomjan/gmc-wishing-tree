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

The Wall of Us opens in **Painted handprint** mode. The capture area stays empty until a hand touches it; the painted impression then presses in (about 0.5 s, instant with reduced motion) where the hand rests and stays there after lifting. Raw reported contacts drive the print (`fitPaintedHand` in `src/shared/paintedHand.ts`):

- **Five or more separate contacts in a hand layout** (`data-fit="posed"`): the artwork is similarity-fitted to the fingertips (size, rotation, position, thumb side), then each finger is cut out of the artwork and turned/stretched about its knuckle toward its fingertip contact. The bend is stored as `pose` (5 × [rotation, length]), bounded by `POSE_LIMITS`.
- **Fewer contacts with reported sizes** (`"sized"`): a tall merged area is treated as the whole hand's extent and a smaller one as the palm; it sets size and position. Thumb side remains the visitor's choice.
- **No size data** (`"position"`): position only; the visitor's size and side are used.

Every sized raw contact is stored as a `contactAreas` ellipse in stamp space and rendered as denser pressed pigment inside the artwork (fewer dry gaps). The artwork's detail (creases, fingers, palm) remains a fixed artistic texture, not a measured skin contour or fingerprint scan. Visitors can still change thumb side and size (0.5–1.4) after lifting, then explicitly choose **Use my handprint**. No camera is requested.

`public/handprints/painted-hand-v1.png` is a local transparent ink asset generated for the project from a prompt inspired by the supplied style references. It is tinted and rendered by Canvas 2D; visitor use makes no image-generation request and adds no service or dependency. [Artwork provenance and generation prompt](painted-hand-artwork.md) record the asset's origin. Do not replace this versioned asset in place, because accepted contributions must retain their appearance.

New impressions use `source: "painted-left"` or `"painted-right"` (thumb side in the artwork), with optional `pose` and `contactAreas`. The server validates the preset, pose bounds and contact ellipses and canonicalises the compatibility outline, rejecting arbitrary image URLs and a `pose` on non-painted sources. Moderation of painted prints still sends the fixed artwork; contact patches never switch it to a contact-print prompt. Production moderation receives the fixed local PNG and optional visitor label; provider failure/rejection still cannot publish. The existing JSONB data column stores the selected source, size, seed and other design fields without a migration. Gallery/preview rendering, receipt recovery, reload and Undo retain the selected artwork. The bounded stamp cache includes the artwork source, and its image/canvases are released when leaving the wall.

Contact IDs/positions/sizes remain in component memory. A full simultaneous frame is retained on lift for the in-session preview; pointer cancellation, unexpected lost capture, leaving the capture area, focus loss, page hiding, Home/idle and Start over clear the draft. A new placement starts a new draft. Pointer geometry bends whole fingers and sets scale within fixed limits; it never redraws the artwork's detailed silhouette. Handedness and size are visitor-adjustable because a single contact cannot identify them reliably.

Previous `source: "contact"` records remain supported: their `contactAreas` are separate normalised ellipses with gaps, rendered and moderated through the existing path. Manual/default-outline contributions keep their original validation and rendering. The default visitor workflow no longer creates small contact-dot prints.

**Trace my outline** remains an optional manual mode. A resting contact stays idle; the first contact that moves more than 1.2% of the square area's width owns the stroke. Other simultaneous contacts cannot add points. Trace around the resting hand with the other index finger in one loop, starting and ending at the wrist, then lift the tracing finger and explicitly accept the outline. A valid contour requires enough points, extent and area and must finish near its start. Paths are bounded in memory and resampled to at most 256 submission points. Open/degenerate strokes and cancellations cannot be accepted. Manual submissions retain `source: "trace"`; the explicit default-shape fallback retains `source: "outline"`.

No camera, biometric scanner, fingerprint capture, external API or added library is used. Device contact IDs and raw event data remain only in component memory. Accepted contact prints store sanitised rounded geometry, just as manual prints store sanitised outlines. The touchscreen may merge or suppress contacts or omit size data; neither libraries nor browser APIs can recover a full silhouette from missing sensor data. Verify reported sizes, calibration and physical scale on the actual display. `navigator.maxTouchPoints` alone does not establish area or full-contour reporting.

The installed display is the Samsung QM55B-T at the GMC Experience Centre reception, mounted in portrait at 2160 × 3840. [Samsung's QM55B-T datasheet](https://www.comm-tec.de/en-us/product/attachment/80LH55QMBTBGCXEN/Samsung_LH55QMBTBGCXEN_Datasheet.pdf) specifies 10-point PCAP touch. This is its advertised simultaneous-contact capacity; it does not establish full-palm contour capture or what the installed browser will receive. Field feedback reported a flat hand as a single area, so the visitor flow must not require five separate contacts. For an external kiosk PC, connect video and the display's `TOUCH OUT PC` USB connection, then calibrate touch for the portrait display as described in chapter 3 of the [Samsung QMB-T user manual](https://manuals.plus/m/d6f754887410d3d9af7a7a80080f9695cbec4fa05f4b6dc7462bcfae03f75b18.pdf). Verify live contact reporting in the actual kiosk browser before deployment.

## Actual-screen input check and unresolved handprint requirement

The latest requirement allows another technique that produces the supplied painted-handprint visual style when a whole hand is placed on the screen. This is implemented as touch-triggered artistic impression rendering. Exact automatic skin/contact-contour capture remains unavailable from a single contact; the artwork must not be described as a visitor fingerprint or measured palm scan. Camera capture is excluded at this installation because its camera is broken; do not add a camera workflow as a workaround.

The app is served from the Mac's LAN IP and opened in Chrome at the installation. The Mac serves code; the computer/device running Chrome and the touchscreen connection supply input. The client OS/driver still needs to be established.

Open `/handprint-wall/input-check` on the installation using the same host and port as the app. This separate, lazily loaded diagnostic shows the client platform, advertised `maxTouchPoints`, live/peak counts for both Pointer Events and native Touch Events, and unscaled contact dimensions in CSS pixels. It makes no handprint API calls, saves nothing and never requests a camera. Data clears on Reset, focus loss or route exit. It is not linked from the museum menu.

1. Try five separated fingertips and note both streams' peak counts.
2. Reset, rest the whole hand flat and note both peak counts and contact sizes.
3. Record the displayed browser platform. Do not infer the client OS from the hosting Mac.

A `maxTouchPoints` value alone cannot establish flat-hand capture. Pointer geometry of 1 × 1 or Touch geometry of 0 × 0 is unavailable size data. If Touch Events expose more contacts than Pointer Events, investigate the app's input path. If both streams expose only one contact for a flat hand, this browser has no separate finger/palm contour; investigate the actual client connection/driver/controller capabilities. More contact points by themselves still do not constitute a full skin-contact silhouette. For a connected PC, Samsung documents the display's `TOUCH OUT PC` USB link in addition to video and touch calibration. Do not promise a full handprint unless a contour-capable input source is verified.

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

Unit and HTTP tests cover geometry validation, fingertip fitting, concurrent allocation, name privacy, retry identity, Undo and deadline enforcement. The PostgreSQL/provider contract test covers fail-closed moderation, persistence, restart recovery, exact-name search and removal. Browser tests exercise the original fallback flow, single merged palm contacts triggering a full textured impression, unavailable contact sizes, colour/thumb-side/size choices, impression submission/reload/Undo, live two-hand manual tracing, interrupted capture, search after reload, and switching back to Wishing Tree.

Use the installed Samsung touchscreen to verify simultaneous contact reporting, palm rejection, physical guide scale and frame rate. Production moderation quality also requires a check with the configured provider.
