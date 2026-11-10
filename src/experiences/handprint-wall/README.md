# Handprint Wall — implementation work area

Not a working experience yet. No placeholder page or silently approving moderation service is mounted.

| Folder        | Responsibility                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `components/` | HTML introduction, progress, Back/Home, feedback and controls                                                                        |
| `tracing/`    | Pointer Events canvas, one-active-pointer mode, cancellation, stroke Undo/Clear, adjustable fallback outline, silhouette preparation |
| `paint/`      | Curated swatches, seeded paint variation, raster preview, size/rotation limits                                                       |
| `placement/`  | Bounded drag placement, suggested location, hold-progress and normal confirm alternative                                             |
| `scene/`      | Front-facing R3F plaster wall, pan/zoom, section texture atlases and GPU disposal                                                    |
| `state/`      | Session-only draft, creation flow, active submission/Undo receipt and reset                                                          |
| `api/`        | Existing API client integration, idempotency, cached wall snapshots and reconnect                                                    |

Shared contracts/defaults: `../../shared/handprints.ts`. Build the page as `HandprintWall.tsx` and export it only when functional. Use no names, messages, camera, palm scanner or fingerprints. Traced input must never be silently replaced with a generic hand. See the handoff brief for server moderation and persistence requirements.
