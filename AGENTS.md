# GMC touchscreen application

One React/TypeScript/Vite application, one Express/TypeScript server, one PostgreSQL database. The installation is touchscreen two: Samsung 55-inch UHD mounted in **portrait, 2160 × 3840 (9:16)**. The AI walkthrough runs on a different screen and is outside this repository's experience work. Do not use Godot.

## Current status

The shared menu opens Wishing Tree and Wall of Signatures. Signatures use freehand strokes and private exact username lookup.

## Preserve existing behaviour

- Current entry: `src/main.tsx` → `src/app/Router.tsx`, which lazy-loads `src/App.tsx` for Wishing Tree. Scene: `src/Scene.tsx`; state/network: `src/state.ts`; forest contracts: `src/shared.ts`.
- `src/experiences/wishing-tree/index.ts` re-exports the existing experience for future lazy routing. Keep existing files/imports working until a tested refactor is needed.
- Use the current GMCX identity (`src/shared/branding.ts`, Lora/Roboto, blue/gold/yellow actions); see `docs/gmcx-visual-direction.md`. The museum wall has no website header/footer, branding navigation or visitor utility bar. The portrait tree dominates a narrow right-edge action rail, adjustable vertically using `src/shared/kiosk/reach.tsx`. Default controls centre is 32% from the top for the floor-level installation; forms and Undo open as right-aligned sheets at that height. Keep panels content-sized, with the height handle in the form header, and keep fields anchored when the optional keyboard expands. Do not reintroduce bottom-fixed actions. Username lookup is secondary.
- Preserve 108 stable leaf slots, private wishes, server moderation, idempotency, token-authorised Undo, durable finalisation and conservative leaf lookup. The contributed tree is the sole scenic subject; do not reintroduce terrain, scenery trees, grass, rocks or a landscape backdrop. The wider view shows only actual wish trees.
- Never expose wish text, username lists, AI keys, database credentials, Undo tokens or operator credentials in public data or logs.

## Extension boundaries

- Shared app/menu/routing: `src/app/`. New feature: `src/experiences/signature-wall/`. Reusable kiosk/graphics/UI code: `src/shared/`.
- Backend extension: `server/signatures/`, mounted into the existing `server/index.ts`; reuse its server, database, security and WebSocket infrastructure. Do not create a second project or service.
- Shared signature types and limits: `src/shared/signatures.ts`. Types do not replace server validation.
- The migration runner applies tracked, ordered `.sql` files transactionally. Add schema changes in a new migration and preserve the database migration ledger.
- Label demo data explicitly; no silent production moderation stub. Signatures and doodles are drawn by visitors. Store username lookup keys privately.
- Lazy-load one expensive scene at a time and dispose of textures/resources on route changes. Clear private drafts/visitor data on Home/idle while preserving accepted contributions and active server-owned Undo deadlines.

## Commands

- `npm ci`, `npm run demo` (isolated deterministic demonstration).
- `npm run build` (frontend + backend TypeScript).
- `pg_virtualenv -t -v 16 npm test` (real isolated PostgreSQL checks where available), or set `TEST_DATABASE_URL` to a dedicated test database.
- `npm run test:browser`; if intentionally testing against an existing demo, `PLAYWRIGHT_REUSE_SERVER=true npm run test:browser`. Fresh test servers avoid stale hot-reload diagnostics.
- Keep `.env` and generated build/test output out of Git. Commit changes and lockfile updates when dependencies change; never force-push shared work.
