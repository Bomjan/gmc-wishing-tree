# GMCX visual direction

Reference: https://gmcx.bt/, inspected 10 November 2026. The public site uses Lora display typography, Roboto body typography, blue `#1776B2`, gold `#B69A5A`, yellow-gold action buttons `#FFD766` with `#745C00` text, neutral body text `#535961`, and white surfaces. The kiosk adapts these tokens with a dark lower scene gradient, bold white serif title, gold primary action and secondary outlined controls. It keeps the portrait museum format without importing website navigation, headers, footers, analytics or cookie UI.

Fonts are bundled locally with their open-font licences under `public/fonts/gmcx/`. Reusable token metadata is in `src/shared/branding.ts`.

## 3D scene

Continuous fractal terrain replaces the old repetitive wave surface. Photographic bark, grass-ground and stone colour/normal/roughness maps are bundled locally under `public/textures/sanctuary/`; provenance/checksums and CC0 credits accompany them. Grass ground is colour graded toward living meadow tones while preserving photographic surface variation. Broad, layered ridgelines use the same height function as tree roots and camera collision, so scenery does not float above a separate mountain mesh.

Wish trees use tapered UV-mapped wood, buttress roots, hierarchical limbs, a layered crown, curved leaves with vein texture and gentle movement. Background foliage uses instanced alpha-masked sprays instead of solid spherical canopies. Instanced curved grass clusters and irregular textured stones replace cones and smooth primitive rocks. One shared set of materials serves the scene; leaf/wood LOD and bounded instancing keep draw calls controlled. Textures, materials and owned geometry are disposed on scene removal.

Exactly one wish-leaf instance is rendered per occupied contribution slot. The new deterministic layout changes the visual leaf positions of older tree models, while preserving every tree ID, stored position, seed and logical slot. All lookup/highlight positioning uses the same new layout, and remains deterministic on reload. Background foliage is scenery only.

## Leaf arrival

After a server-confirmed reservation reaches the authoritative forest snapshot, that contribution's own instance approaches its branch, unfolds and settles over 3.2 seconds. A brief warm colour/edge accent marks the new leaf. Incoming arrivals remain queued; no extra particle leaves are added. Existing search selection takes priority over arrival highlighting. The visitor's submission retains the existing gentle camera focus; remote contributions never request camera movement. Reduced-motion mode immediately renders the final pose.

Undo remains server-authorised for the original ten-second deadline and removes the reserved instance/slot. Animation does not finalise a wish or claim success before confirmation. Seeded positions and visual hashes do not contain wish text or usernames.

## Review captures

- [Native portrait UHD](screenshots/gmcx-sanctuary-4k.png)
- [GMCX portrait scene](screenshots/gmcx-sanctuary.png)
- [Leaf arrival](screenshots/gmcx-leaf-arrival.png)
- [Settled leaf](screenshots/gmcx-leaf-settled.png)

The world remains a procedural real-time scene, not a scanned landscape or a claim of finished photorealism. The photographs are material maps on actual 3D surfaces, not a flat landscape background. Physical Samsung touch behaviour and installed GPU performance still need on-device profiling.
