# Handprint Wall contributor handoff

This commit prepares the **file structure only**, as requested. Wishing Tree is still the running application. The shared menu, route switcher, tracing, wall renderer, handprint persistence/moderation and operator removal are **not implemented**. There are no new working handprint endpoints or applied database migrations. Do not present this scaffold as the completed experience.

## Start here

```sh
git clone git@github.com:Bomjan/gmc-wishing-tree.git
cd gmc-wishing-tree
npm ci
npm run demo
npm run build
```

Read root `AGENTS.md`, then `README.md`. One application/server/database is required. The museum touchscreen is **55-inch portrait UHD, 2160 × 3840**, and the application fits the complete 9:16 stage into desktop previews. No website header/footer or utility bar. The AI walkthrough is a separate screen and must not be added here.

## Actual prepared structure

```text
src/
  main.tsx                    # unchanged current entry
  App.tsx                     # existing Wishing Tree experience, unchanged
  Scene.tsx                   # existing mountain renderer, unchanged
  state.ts                    # existing tree state/API/reconnect, unchanged
  shared.ts                   # existing forest transport types, unchanged
  style.css                   # existing portrait sanctuary design, unchanged
  app/
    experiences.ts            # planned menu metadata and configurable wall title
    components/               # reserved shared-menu UI
  experiences/
    wishing-tree/
      index.ts                # re-export of current App, ready for lazy routing
    handprint-wall/
      index.ts                # type-only entry, no placeholder visitor page
      components/
      tracing/
      paint/
      placement/
      scene/
      state/
      api/
  shared/
    handprints.ts             # proposed types, palette and tunable defaults
    components/
    kiosk/
    graphics/
server/
  index.ts                    # existing Express/ws composition, unchanged
  store.ts                    # existing persistent tree service, unchanged
  demo.ts                     # existing isolated tree fixtures, unchanged
  moderation.ts               # existing server text moderation, unchanged
  migrate.ts                  # currently applies 001_forest.sql only
  handprints/
    routes/
    store/
    geometry/
    moderation/
    rendering/
    placement/
    demo/
    operator/
db/migrations/
  001_forest.sql              # existing tree schema: do not rewrite it
  002_handprints.sql.example  # inactive schema work checklist, not executable DDL
tests/
  store.test.ts               # existing tree database regressions
  http.test.ts                # existing real server/provider contract checks
  handprints/                # future tests and test-discovery instructions
  browser/                   # add menu/wall specs alongside existing tests
public/handprint-wall/        # future local, licensed textures/menu preview assets
```

Empty work folders have tracked `.gitkeep` files so they exist after clone. README files explain each area's responsibility. No second package.json, dependency installation, backend service or demo database was created.

## Implementation brief

### Menu and routing

Build `/` as two large visual-preview cards: Wishing Tree — “Leave a wish. Watch it grow.”; Wall of Us — “Leave your mark.” `VITE_HANDPRINT_WALL_TITLE` configures the working wall title. Mount the existing tree under `/wishing-tree` and the wall under `/handprint-wall`. Metadata is in `src/app/experiences.ts`; the runtime is not routed yet.

Use React lazy imports, one expensive graphics scene at a time and explicit GPU cleanup. Menu previews must not mount both live 3D scenes. Each experience needs an obvious Home action. Accepted records remain in the existing database when switching; previous visitor inputs, search/highlights, strokes and temporary UI state must clear. Guard active submissions and server-owned Undo windows before abandoning their session. Preserve the tree's current moderation, idempotency, privacy, Undo, stable 108-slot growth and search behaviour.

### Creation flow

1. **Introduction:** show the shared wall and “Leave your mark”.
2. **Trace:** “Trace your hand.” / “Place one hand on the screen. With your other finger, trace around it.” Use Pointer Events for mouse, touch and stylus. Also offer Draw freehand, Undo last stroke, Clear, Continue and Back. Disable scrolling only within the drawing area. Handle pointer cancellation/capture loss and configurable single-active-pointer input, ignoring additional pointers. No palm scanning, fingerprints, camera or sign-in.
3. **Fallback:** “Use a hand outline” provides an explicitly generic adjustable silhouette (size and proportions), never a pretend scan. Never silently substitute it for an unusable trace.
4. **Refine:** smooth jitter, close small gaps, preserve overall shape and fill a valid silhouette. Empty or unusable outlines get a helpful retry message. Show a preview.
5. **Paint:** six large swatches (terracotta, ochre, forest green, teal, muted blue, plum), bounded resize/rotation. No name, username, email or personal message fields. Shared defaults use normalised outline points, world-unit placement and radians for rotation.
6. **Placement:** suggest available wall space; bounded dragging; never completely obscure another visitor's mark. “Press and hold to leave your mark” has visible progress and a normal confirmation alternative. A server-confirmed reservation precedes transfer animation, highlight and “You are part of this place.” Show server-deadline “Undo · 10s”.
7. **Undo:** authorise with a temporary opaque token, release placement and return to preview if cancelled in time. After expiry, permanent public contribution, with no public editing/deletion. Finalisation must survive disconnection/reload/restart.

### Rendering and exploration

HTML controls, Canvas 2D tracing/preparation and front-facing React Three Fiber wall lighting/surface. Warm plaster or subtle stone, natural irregular paint edges, grain, small gaps, varied coverage and restrained flecks. Generate variation from a stored seed; never use emoji hands, fingerprint ridges or identical stock stamps. Section texture atlases or another bounded strategy must avoid one heavyweight material/draw call per print forever.

Bounded pan/zoom and Return to latest. Prints have no personal tooltip/detail data. Add adjacent sections as space fills; stable world coordinates and seeds must survive reload. Cache public wall state, refresh authoritative snapshots after reconnect, preserve a current draft during outage and never call an unsaved print permanent. Incoming events must not move an active visitor's camera. Separate and label deterministic demo records.

### Backend, moderation and operator maintenance

Extend `server/index.ts`, reusing pg, Express security and `ws`. Proposed types are in `src/shared/handprints.ts`, but runtime server validation is still required: bounded point count, finite normalised coordinates, usable area/shape, paint allowlist, size/rotation, placement bounds and body limits. No arbitrary SVG/HTML. Generate the moderation raster on the server from validated point geometry; do not trust a client-provided preview as the source of truth.

Extend the current provider via an image-capable moderation adapter. Moderate freehand and fallback submissions before publishing; neutral rejection asks for a hand redraw. No provider or unsupported image moderation means retry/unavailable in production, never silent approval. Clearly label demo stubs. Add protected operator removal for abusive content, separate from public permanence, with server-only credentials and appropriate audit data.

Persist section geometry/positions/seeds; handprint IDs, sanitised outline, colour/seed, world pose, status, moderation state, Undo deadline, creation time, token hash, unique idempotency key and request fingerprint. Use transactions and section locks for placement conflicts. Return a nearby suggestion, do not overwrite. Cancelled placement must become available again. Keep RLS/private roles and protect operator functionality.

Visitor endpoint proposal: `GET /api/handprints/sections`, `POST /api/handprints/submissions`, `GET /api/handprints/submissions/:id`, `POST /api/handprints/submissions/:id/undo`; optional opaque-key recovery for lost acceptance responses. Minimal reserved/cancelled/finalised/removed events, no bearer tokens in public events. Existing `/api/forest` and tree routes remain unchanged.

**Migration caveat:** the current runner hard-codes `001_forest.sql`. Implement ordered, tracked, transactional migrations before activating the template as `002_handprints.sql`. Do not merely add a SQL file and assume it runs. The global request parser currently has an 8 KB wish limit; add any larger handprint parser only to the appropriate router while retaining wish limits.

### Shared kiosk requirements

Large touch targets, clear Back/Home, no hover-only controls or emojis, reduced-motion support, accessible non-hold confirmation and configurable idle warning followed by reset. Clear drafts/previous visitor details; preserve accepted records. Do not reset during an active submission or Undo window. Keep graphics rendering if moderation or networking is unavailable; explain the outage and preserve the current retryable draft within the session.

### Verification and delivery

Cover pointer cancellation, multiple contacts, mouse/stylus/touch, empty/malformed/oversized geometry, duplicate retries, concurrent conflicts, deadline boundaries, real restart during pending finalisation, missed events, deterministic paint/positions, switching experiences and Home/idle cleanup. Keep current tree suites. Capture portrait desktop/native screenshots and measure actual performance honestly; physical palm interference/multi-touch behaviour needs the Samsung hardware. Complete touchscreen input first; no separate project or AI walkthrough.

Implement in order: shared menu/routes → tracing/fallback → paint/placement → database/moderation/Undo → wall exploration/sections → reconnect/idle/resource optimisation → tree regressions. Deliver setup/configuration, migrations, separate demo mode, screenshots and an accurate feature/test/limitations report.

Branding update: use `src/shared/branding.ts` and `docs/gmcx-visual-direction.md` for the current GMCX identity rather than reintroducing the earlier green-button theme. The six handprint paint choices remain visual paint choices and are not changed by interface branding.
