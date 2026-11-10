# Handprint backend extension — not mounted yet

Extend the existing Express app, database connection and `ws` broadcaster in `server/index.ts`. These are reserved work folders, not another service:

- `routes/`: narrow visitor routes, JSON schema validation, errors and token authorisation.
- `store/`: PostgreSQL queries, idempotency, server-owned Undo and durable finalisation.
- `geometry/`: finite normalised coordinates, point/area/bounds validation, safe outline processing.
- `rendering/`: server-generated raster from validated point data; never trust a client image as the moderation source.
- `moderation/`: image-capable provider adapter reusing server AI configuration; fail closed in production. Clearly separate the demo adapter.
- `placement/`: section locking, overlap checks, nearby suggestions and section allocation.
- `demo/`: deterministic, explicitly labelled in-memory fixtures; never production records.
- `operator/`: protected removal of abusive content; no public deletion route.

Proposed visitor routes: `GET /api/handprints/sections`, `POST /api/handprints/submissions`, `GET /api/handprints/submissions/:id`, `POST /api/handprints/submissions/:id/undo`. These routes do not currently exist. Consider opaque retry-key recovery alongside status recovery for lost responses.

Current wishes use an 8 KB global JSON limit. Mount a narrowly scoped handprint parser with a capped limit before that parser if necessary; keep existing wish request limits. Share database infrastructure without weakening RLS, origin checks, existing errors or abuse controls. Add a separate finalisation sweep, or compose it into the existing worker, without changing tree deadlines.

Placement validation and reservation must run under a database transaction with a section-level lock. Suggest a nearby safe pose on conflict rather than silently moving a confirmed preview or overwriting another print. WebSocket events must not contain temporary tokens or operator details. Refresh authoritative snapshots on reconnect. Use the shared types in `src/shared/handprints.ts`, but validate all input server-side.
