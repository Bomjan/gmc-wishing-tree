# Shared frontend / cross-stack code

- `signatures.ts` defines the pen palette, stroke limits, placement bounds and public signature contracts.
- `components/`: reusable touch buttons, Home actions, swatches and status UI.
- `kiosk/`: shared idle warning/reset, route session cleanup, submission/Undo guards.
- `graphics/`: deterministic texture helpers and GPU resource lifecycle utilities.

The existing sibling file `src/shared.ts` remains the forest contract module. Do not replace its exports or accidentally change existing `./shared` import resolution. Keep server secrets and provider adapters out of this folder.
