# GMC touchscreen application

One React/TypeScript/Vite application, one Express/TypeScript server, one PostgreSQL database. The installation is touchscreen two: Samsung 55-inch UHD mounted in **portrait, 2160 × 3840 (9:16)**. The AI walkthrough runs on a different screen and is outside this repository's experience work. Do not use Godot.

## Current status

Wishing Tree is implemented. Shared-menu and Handprint Wall **structure and proposed contracts only** are prepared for the next contributor. They are not connected to the runtime. See `docs/handprint-wall-handoff.md` before implementing them. Do not present scaffold folders, proposed endpoints or the inactive migration template as finished features.

## Preserve existing behaviour

- Current entry: `src/main.tsx` → `src/App.tsx`. Scene: `src/Scene.tsx`; state/network: `src/state.ts`; forest contracts: `src/shared.ts`.
- `src/experiences/wishing-tree/index.ts` re-exports the existing experience for future lazy routing. Keep existing files/imports working until a tested refactor is needed.
- Use the current GMCX identity (`src/shared/branding.ts`, Lora/Roboto, blue/gold/yellow actions); see `docs/gmcx-visual-direction.md`. The museum wall has no website header/footer, branding navigation or visitor utility bar. The portrait tree dominates a narrow right-edge action rail, adjustable vertically using `src/shared/kiosk/reach.tsx`. Default controls centre is 32% from the top for the floor-level installation; forms and Undo open as right-aligned sheets at that height. Keep form fields anchored when the optional keyboard expands. Do not reintroduce bottom-fixed actions. Username lookup is secondary.
- Preserve 108 stable leaf slots, private wishes, server moderation, idempotency, token-authorised Undo, durable finalisation and conservative leaf lookup.
- Never expose wish text, username lists, AI keys, database credentials, Undo tokens or operator credentials in public data or logs.

## Extension boundaries

- Shared app/menu/routing: `src/app/`. New feature: `src/experiences/handprint-wall/`. Reusable kiosk/graphics/UI code: `src/shared/`.
- Backend extension: `server/handprints/`, mounted into the existing `server/index.ts`; reuse its server, database, security and WebSocket infrastructure. Do not create a second project or service.
- Shared handprint types/defaults: `src/shared/handprints.ts`. Types do not replace server validation.
- `db/migrations/002_handprints.sql.example` is inactive. The current runner explicitly applies `001_forest.sql`; implement tracked, transactional migration sequencing before activating a second migration.
- Label demo data explicitly; no silent production moderation stub. Hand tracing is manual drawing, never biometric scanning or fingerprint capture.
- Lazy-load one expensive scene at a time and dispose of textures/resources on route changes. Clear private drafts/visitor data on Home/idle while preserving accepted contributions and active server-owned Undo deadlines.

## Commands

- `npm ci`, `npm run demo` (isolated deterministic demonstration).
- `npm run build` (frontend + backend TypeScript).
- `pg_virtualenv -t -v 16 npm test` (real isolated PostgreSQL checks where available), or set `TEST_DATABASE_URL` to a dedicated test database.
- `npm run test:browser`; if intentionally testing against an existing demo, `PLAYWRIGHT_REUSE_SERVER=true npm run test:browser`. Fresh test servers avoid stale hot-reload diagnostics.
- Keep `.env` and generated build/test output out of Git. Commit changes and lockfile updates when dependencies change; never force-push shared work.
