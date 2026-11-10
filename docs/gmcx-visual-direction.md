# GMCX visual direction

Reference: https://gmcx.bt/, inspected 10 November 2026. The public site uses Lora display typography, Roboto body typography, blue `#1776B2`, gold `#B69A5A`, yellow-gold action buttons `#FFD766` with `#745C00` text, neutral body text `#535961`, and white surfaces. Visitor sheets carry that identity directly: translucent glass surfaces, a compact GMC Experience Centre wordmark, blue Lora headings, restrained blue/gold rules, Roboto form controls and the yellow-gold primary action. Light blur preserves the tree beneath the sheet. The tree stage remains warm and visually quiet. The portrait museum interface does not import website navigation, headers, footers, analytics or cookie UI.

Fonts are bundled locally with their open-font licences under `public/fonts/gmcx/`. Reusable token metadata is in `src/shared/branding.ts`.

## Minimal, reachable interaction

Make a wish and More options form a narrow vertical rail at the right edge, using circular icons with short labels and a small contribution caption. The tree centre stays clear; expanded options open to the left of the rail. The default scene supports drag, two-finger zoom/pan and direct wish-leaf selection. Search and mountain navigation are revealed on demand. Controls default to 32% from the top on the floor-level 55-inch portrait display, approximately 83 cm above its bottom edge. Visitors drag the up/down handle or use Higher/Lower in More options; the wish form and receipt use narrower right-aligned sheets at that position. Panels use compact padding and concise help. The form width is capped at 32rem, its height handle shares the title row, and a clear Back control closes it. Confirmation and options panels are smaller as well. The contextual keyboard expands below the form without recentering the fields, except when screen bounds require adjustment. Panel bounds are measured to keep controls on-screen. Keyboard arrows offer an accessible adjustment alternative. Physical reach and mounting clearances still need installation checks; this is not a claim of universal ergonomic compliance.

## 3D scene

The current default scene is a focused tree portrait: a quiet warm cream background, soft hemisphere fill, one warm spotlight and a subtle contact shadow. There is no landscape, terrain, scenery vegetation or decorative foliage. Only actual visitor-contribution trees can be seen; the wider view arranges those trees at their persistent world positions. This keeps the tree as the sole visual subject and leaves interface actions along the edge unobtrusive.

Wish trees use tapered textured wood, hierarchical branches and a layered crown with curved, vein-textured leaves and restrained movement. Trunk thickness and overall tree scale progress with the occupied contribution count; a small number of wishes reads as a sapling, while 108 leaves reach the mature model. Exactly one wish-leaf instance is rendered per occupied slot. Positions remain deterministic from the persisted tree seed, and the same slot mapping drives search and highlighting. Leaf/wood LOD, shared materials and bounded instancing keep draw calls controlled. Textures, materials and owned geometry are disposed on scene removal.

## Leaf arrival

After a server-confirmed reservation reaches the authoritative forest snapshot, that contribution's own instance approaches its branch, unfolds and settles over 3.2 seconds. A brief warm colour/edge accent marks the new leaf. Incoming arrivals remain queued; no extra particle leaves are added. Existing search selection takes priority over arrival highlighting. The visitor's submission retains the existing gentle camera focus; remote contributions never request camera movement. Reduced-motion mode immediately renders the final pose.

Undo remains server-authorised for the original ten-second deadline and removes the reserved instance/slot. Animation does not finalise a wish or claim success before confirmation. Seeded positions and visual hashes do not contain wish text or usernames.

## Review captures

- [Four-leaf sapling](screenshots/tree-sapling-4.png)
- [108-leaf mature tree](screenshots/tree-mature-108.png)
- [GMCX-branded wish form](screenshots/gmcx-branded-form.png)
- [GMCX-branded receipt](screenshots/gmcx-branded-receipt.png)
- [Inline form validation](screenshots/form-validation-feedback.png)
- [Current right-edge controls](screenshots/right-edge-controls.png)
- [Earlier native portrait UHD, before right-edge controls](screenshots/minimal-tree-4k.png)
- [Current compact form and keyboard](screenshots/compact-sheet-keyboard.png)
- [Leaf arrival](screenshots/gmcx-leaf-arrival.png)
- [Settled leaf](screenshots/gmcx-leaf-settled.png)

The tree remains a procedural real-time model, not a claim of finished photorealism. Bark uses locally bundled material maps; production bark assets and on-device lighting review can further improve realism without adding a competing landscape. Physical Samsung touch behaviour and installed GPU performance still need on-device profiling.
