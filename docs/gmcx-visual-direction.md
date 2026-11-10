# GMCX visual direction

Reference: https://gmcx.bt/, inspected 10 November 2026. The public site uses Lora display typography, Roboto body typography, blue `#1776B2`, gold `#B69A5A`, yellow-gold action buttons `#FFD766` with `#745C00` text, neutral body text `#535961`, and white surfaces. The kiosk adapts these tokens with a restrained lower scene gradient, gold primary action, white input surfaces and serif form headings. The default scene has no oversized title or persistent welcome card. It keeps the portrait museum format without importing website navigation, headers, footers, analytics or cookie UI.

Fonts are bundled locally with their open-font licences under `public/fonts/gmcx/`. Reusable token metadata is in `src/shared/branding.ts`.

## Minimal, reachable interaction

Make a wish and More options form a narrow vertical rail at the right edge, using circular icons with short labels and a small contribution caption. The tree centre stays clear; expanded options open to the left of the rail. The default scene supports drag, two-finger zoom/pan and direct wish-leaf selection. Search and mountain navigation are revealed on demand. Controls default to 32% from the top on the floor-level 55-inch portrait display, approximately 83 cm above its bottom edge. Visitors drag the up/down handle or use Higher/Lower in More options; the wish form and receipt use narrower right-aligned sheets at that position. Panels use compact padding and concise help. The form width is capped at 32rem, its height handle shares the title row, and a clear Back control closes it. Confirmation and options panels are smaller as well. The contextual keyboard expands below the form without recentering the fields, except when screen bounds require adjustment. Panel bounds are measured to keep controls on-screen. Keyboard arrows offer an accessible adjustment alternative. Physical reach and mounting clearances still need installation checks; this is not a claim of universal ergonomic compliance.

## 3D scene

Continuous fractal terrain replaces the old repetitive wave surface. Photographic bark, grass-ground and stone colour/normal/roughness maps are bundled locally under `public/textures/sanctuary/`; provenance/checksums and CC0 credits accompany them. Grass ground is colour graded toward living meadow tones while preserving photographic surface variation. Broad, layered ridgelines use the same height function as tree roots and camera collision, so scenery does not float above a separate mountain mesh.

Wish trees use tapered UV-mapped wood, buttress roots, hierarchical limbs, a layered crown, curved leaves with vein texture and gentle movement. Background foliage uses instanced alpha-masked sprays instead of solid spherical canopies. Instanced curved grass clusters and irregular textured stones replace cones and smooth primitive rocks. One shared set of materials serves the scene; leaf/wood LOD and bounded instancing keep draw calls controlled. Textures, materials and owned geometry are disposed on scene removal.

Exactly one wish-leaf instance is rendered per occupied contribution slot. The new deterministic layout changes the visual leaf positions of older tree models, while preserving every tree ID, stored position, seed and logical slot. All lookup/highlight positioning uses the same new layout, and remains deterministic on reload. Background foliage is scenery only.

## Leaf arrival

After a server-confirmed reservation reaches the authoritative forest snapshot, that contribution's own instance approaches its branch, unfolds and settles over 3.2 seconds. A brief warm colour/edge accent marks the new leaf. Incoming arrivals remain queued; no extra particle leaves are added. Existing search selection takes priority over arrival highlighting. The visitor's submission retains the existing gentle camera focus; remote contributions never request camera movement. Reduced-motion mode immediately renders the final pose.

Undo remains server-authorised for the original ten-second deadline and removes the reserved instance/slot. Animation does not finalise a wish or claim success before confirmation. Seeded positions and visual hashes do not contain wish text or usernames.

## Review captures

- [Current right-edge controls](screenshots/right-edge-controls.png)
- [Earlier native portrait UHD, before right-edge controls](screenshots/minimal-tree-4k.png)
- [Current compact form and keyboard](screenshots/compact-sheet-keyboard.png)
- [Leaf arrival](screenshots/gmcx-leaf-arrival.png)
- [Settled leaf](screenshots/gmcx-leaf-settled.png)

The world remains a procedural real-time scene, not a scanned landscape or a claim of finished photorealism. The photographs are material maps on actual 3D surfaces, not a flat landscape background. Physical Samsung touch behaviour and installed GPU performance still need on-device profiling.
