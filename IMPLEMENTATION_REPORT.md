# Wishing Tree implementation report

Implemented for touchscreen two in the initially empty workspace. Existing `.idea` files were preserved and excluded from Git. There was no `AGENTS.md`. No reference image was attached to this conversation, so visual review used the written Morning Sanctuary brief.

## Delivered

- React / TypeScript / Vite with React Three Fiber, drei, Tailwind and Zustand; an actual 3D landscape behind a persistent HTML interface.
- Procedural terrain, layered mountain meshes, mist, morning lighting, textured bark, instanced grass, rocks and scenery foliage. Each contribution has exactly one instanced wish leaf. Background scenery is separate and noninteractive.
- Continuous sapling-to-mature growth, stable tree/slot coordinates, persistent procedural seeds, near/far leaf detail, merged branch geometry, capped DPR, quality controls and reduced-motion support. Camera exploration bounds grow with the forest.
- Two-field touchscreen submission, optional on-screen keyboard, server-side safety/English moderation, respectful revision/retry errors, idempotency and opaque receipt recovery.
- PostgreSQL migrations and constraints; transactionally allocated 108-slot trees; cancellation hole reuse; case-insensitive usernames; server-controlled 10-second Undo and durable finalisation. Pending wish text is encrypted and erased when cancelled/finalised.
- Exact and conservative unambiguous fuzzy lookup across trees, smooth leaf focus and temporary highlight with no labels or message cards. No public wish retrieval or username directory.
- Mountain orbit/pan/zoom, tree selection, return navigation, visitor idle cleanup, public scene cache, authoritative reconnect snapshots and queued leaf appearances. Remote contributions and highlight expiry do not restart the visitor's camera movement.
- Express / TypeScript and `ws`, isolated labelled deterministic demo mode, `.env.example`, lockfile, development / production / kiosk instructions in [README.md](README.md).

## Validation on 10 November 2026

| Check                                                  | Result                           |
| ------------------------------------------------------ | -------------------------------- |
| TypeScript + Vite + backend compilation                | Passed                           |
| PostgreSQL / production HTTP / WebSocket tests         | 18 passed                        |
| Chromium touchscreen browser tests                     | 5 passed                         |
| Documented migration command, disposable PostgreSQL 16 | Passed                           |
| Prettier source check                                  | Passed                           |
| Runtime dependency audit                               | 0 known vulnerabilities reported |

Backend checks include concurrent normalised usernames, 120 simultaneous submissions at the 108-leaf boundary, duplicate retries, cancelled slot reuse, token authentication, exact deadline rejection, real server restart **inside** the Undo window followed by successful Undo, overdue recovery after another restart, cross-tree search, ambiguous fuzzy matching, stable seeds/coordinates, encrypted pending text and exclusion of private content from public HTTP responses, events and captured server logs. The provider adapter is exercised through a local fake provider with accepted, rejected, non-English and unavailable responses; production has no test bypass.

Browser checks cover submission → Undo → username reuse → permanent finalisation → search → mountain navigation; rejection preserving input; keyboard availability; pending receipt recovery after reload; offline/reconnect snapshots; and a remote burst that creates a new tree while the visitor types without moving their camera. The canvas remains mounted through the interaction. There were no page errors in the full submission flow.

Screenshots: [home](docs/screenshots/morning-sanctuary.png), [form](docs/screenshots/submission-form.png), [accepted](docs/screenshots/accepted-wish.png), [mountain](docs/screenshots/mountain-view.png). Reviewed for cream/forest-green colours, left panel layout, serif headings, landscape dominance and absence of leaf labels. A pixel comparison to the absent mockup was not possible.

## Measured rendering performance

[Raw timing sample](docs/performance.json): headless Chromium 158 with **SwiftShader software rendering**, 1440 × 1000, low detail, 36 animation-frame callbacks over 4006.5 ms. Median interval 16.7 ms; 95th percentile 466.7 ms. Average callback delivery was about 9 per second, with substantial stalls. These are browser scheduling measurements during the rendered scene, not GPU timing or a verified kiosk frame rate. This environment does **not** establish smooth kiosk performance.

The production JS bundle is approximately 1.13 MB / 316 KB gzip. Assets and system fonts load locally. Hardware acceleration, native screen resolution, touch latency, long-running sessions, both quality settings and large contribution forests must be profiled on the actual kiosk before launch.

## Remaining limitations and setup

The art is a **functional procedural prototype, not finished photorealism**. Replace the simplified scenery canopy and grass geometry with optimised natural assets, add regional terrain/height data and production PBR terrain/rock/bark textures, and art-direct lighting on the installed display. Preserve one physical wish leaf per occupied slot when improving assets. No external production GLB/PBR assets were supplied, and none are represented as completed realism.

Production requires the database connection, independent encryption/token secrets and a live AI provider key in server configuration. No paid provider credentials were available, so real-model moderation quality, English tolerance and provider latency remain unmeasured. The adapter uses strict JSON Schema and GPT-4.1 Mini by default, consistent with [Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat) and the [model capabilities](https://developers.openai.com/api/docs/models/gpt-4.1-mini). Refusals receive revision feedback; malformed/unavailable moderation fails closed.

The supported deployment uses one API process; horizontal WebSocket fan-out needs an additional shared transport. Very large forests have not been load-tested. The local cache supports temporary API outages; a first-ever browser load still requires the application server. Edge bot protection and deployment monitoring should be configured for an internet-facing installation. OS keyboard behaviour and real multi-touch hardware remain device checks. QR submission and the separate AI walkthrough screen are outside this implementation.

## Portrait museum wall display revision

The installation target is a **55-inch Samsung UHD display mounted in portrait: 2160 × 3840, 9:16**. The tree is centred in the upper portion. The compact welcome area sits below the tree, with Make a wish primary, mountain exploration secondary, and username lookup collapsed behind Find my leaf. Forms use a lower cream overlay. The whole portrait stage scales into smaller desktop preview windows; landscape development windows have unused space at the sides.

The website header, footer, branding link, decorative panel headings/footers, caption and utility bar are removed. The optional keyboard appears only in forms or expanded search. Operators select rendering quality through `?quality=low` or `?quality=high`; visitors see no settings bar. Demo contributions remain explicitly labelled in the progress row.

Four display checks pass at 476 × 782, 1366 × 768 (desktop preview), 1080 × 1920 and native 2160 × 3840. Checks cover the portrait stage ratio, lower interaction placement, hidden-by-default search, absence of header/footer/utility bar, touch form fields and native-resolution canvas. Build and source formatting checks pass. Software-rendered screenshots verify layout, not performance or physical touch behaviour on the Samsung display.

Current captures: [portrait preview](docs/screenshots/portrait-preview.png), [1080 × 1920 composition](docs/screenshots/portrait-display.png), [native portrait UHD](docs/screenshots/portrait-display-4k.png), [portrait UHD form](docs/screenshots/portrait-form-4k.png). Earlier landscape captures are historical and do not describe the corrected installation target.

Revision interaction validation: all six targeted browser checks passed (four portrait/preview layouts, complete submission → Undo → finalisation → search → mountain navigation, and rejection preservation → contextual keyboard → pending recovery after reload). These checks also confirm the header, footer and utility bar are absent. No backend changes were required.

## GMCX identity, materials and arrival-animation revision

The current design follows the supplied https://gmcx.bt/ reference: locally bundled Lora/Roboto fonts, blue/gold accents, yellow-gold primary action, white serif display title and dark lower scene gradient. It retains the 2160 × 3840 museum portrait layout with no website header/footer. See [GMCX visual direction and material credits](docs/gmcx-visual-direction.md).

The natural-world pass adds continuous fractal terrain, shared photographic PBR bark/grass/rock maps, hierarchical tapered branches and buttress roots, a layered crown, vein-textured curved wish leaves, instanced foliage sprays, curved grass and irregular rocks. Maps are bundled locally with CC0 source/checksum metadata; fonts carry their open-font licences. The renderer still uses actual contribution counts, no extra decorative wish leaves, and unchanged tree IDs, seeds and logical slots. Visual slot positions use the new deterministic layout consistently for rendering and lookup.

Accepted leaves now approach their branch, unfold, warm briefly and settle over 3.2 seconds. Reduced-motion snaps to the final pose. The arrival begins only after server confirmation reaches authoritative forest state. Search selection takes highlighting priority, and incoming contributions do not move an active visitor's camera. Server moderation, privacy, idempotency, Undo and finalisation are unchanged.

Validation: production build and formatting checks passed; **22 database/HTTP/geometry/animation tests passed**. **Six distinct browser checks passed** across the dedicated material/font/animation check and the targeted native portrait, complete visitor flow, keyboard/reload, remote-camera and timing run. The rendering check also verifies actual GMCX font families/action colour, no header/footer, no shader errors, one added instance per contribution and bounded draw calls for the demo forest.

Current captures: [portrait UHD scene](docs/screenshots/gmcx-sanctuary-4k.png), [UHD form](docs/screenshots/gmcx-form-4k.png), [arrival](docs/screenshots/gmcx-leaf-arrival.png), [resting state](docs/screenshots/gmcx-leaf-settled.png).

Latest [software-rendered timing sample](docs/performance-gmcx.json): 47 animation-frame callbacks over 4030.7 ms; median interval 16.7 ms, 95th percentile 183.3 ms. This is Chromium SwiftShader, low detail, in a 1440 × 1000 development window (with the portrait scene fitted inside it). It is not a native-kiosk GPU benchmark or a smooth-frame-rate claim. Hardware profiling and further art/asset refinement remain necessary for finished photorealism. The Handprint Wall remains a scaffold for the other contributor.

## Minimal interaction and adjustable reach revision

This revision supersedes the earlier lower-panel placement. The default scene has one compact Make a wish action, More options and a small actual/demo leaf count. Search and mountain controls appear only on request. The default scene now accepts mouse/touch orbit, scroll/two-finger zoom and direct leaf taps, with a restrained temporary highlight. Dragging does not accidentally select a tree. Canvas gestures dismiss temporary menus; remote contributions still do not move the camera.

For the floor-level 55-inch portrait installation, controls default to 32% from the top, approximately 83 cm above the panel's bottom edge. Visitors can drag the up/down handle, use keyboard arrows, or use Higher/Lower/Default height in More options. Form, fallback keyboard and Undo/Done use that same movable surface. Bounds are measured when content or viewport changes, and expanded menus scroll within the available space. Pointer cancellation releases height adjustment; extra pointers do not take over an active adjustment. Done and idle cleanup restore the operator default (`VITE_CONTROL_HEIGHT`) and clear temporary visitor input. Existing contributions, backend privacy and server-owned finalisation are unchanged.

Validation: production TypeScript/frontend/backend build, Prettier and Git whitespace checks passed. Ten targeted browser checks passed across two runs: four portrait/desktop preview sizes including native 2160 × 3840; complete submission/Undo/finalise/search; actual mouse drag, wheel, CDP two-finger zoom and leaf raycast; rejection/keyboard/pending reload; authoritative reconnect; remote-camera stability; and movable keyboard/form bounds with cancelled adjustment and cleared drafts. The earlier 22 database/HTTP/geometry/animation results remain applicable; this revision changes no backend or schema. No hardware frame-rate or universal physical reach claim is made. Check touch latency, OS keyboard behaviour, mounting clearance and seated/standing reach on the actual installation.

Current captures: [minimal portrait scene](docs/screenshots/minimal-tree.png), [native UHD scene](docs/screenshots/minimal-tree-4k.png), [UHD form](docs/screenshots/reachable-form-4k.png), [adjusted form and keyboard](docs/screenshots/reachable-form-keyboard.png). Earlier captures document previous iterations. Handprint Wall remains the prepared contributor scaffold.

## Right-edge controls revision

The default controls now form a narrow vertical rail on the right edge, with circular Make a wish and More actions, short labels and a small leaf count. The centre of the tree stays clear. Options open to the left, within measured screen bounds. The existing drag handle, Higher/Lower controls, operator default height, contextual keyboard and Undo flow are preserved. Yellow leaf highlights remain unchanged.

Validation: production build, Prettier and whitespace checks passed. Five browser checks passed across desktop preview and 1080 × 1920 portrait layout, submission → Undo/finalise → search, mouse drag/wheel/two-finger zoom/direct leaf selection, and movable form/keyboard bounds with pointer cancellation. The initial batch ended early after its two layout checks passed; the remaining three checks passed when rerun. The rail occupies under 2% of the stage area in both checked layouts. No backend, database or contribution records changed. Physical Samsung touch and reach checks remain installation work.

Current screenshot: [right-edge controls](docs/screenshots/right-edge-controls.png). Previous centre-dock images are historical.

## Contextual form placement revision

Wish entry now opens as a narrower sheet aligned with the right edge, rather than a wide panel across the middle. The confirmation/Undo sheet is also smaller and right aligned. The chosen interaction height is preserved, with a larger, clearly labelled Back control. Expanding the optional keyboard anchors the fields in place instead of recentering the entire panel; screen bounds still take priority at extreme height settings.

Validation: production build, formatting and whitespace checks passed. Three browser checks passed: desktop portrait preview; complete submission → Undo/finalise → search/mountain flow; and 1080 × 1920 form/keyboard placement, stable field position on keyboard expansion, both height limits, cancelled adjustment and draft cleanup. [Current form with keyboard](docs/screenshots/right-sheet-keyboard.png). No backend or contribution data changed. Installed reach and OS-keyboard behaviour remain hardware checks.

## Compact panels revision

The wish form is capped at 32rem rather than 38rem, with its move handle in the title row, tighter padding and field spacing, a three-line wish area and concise helper/privacy copy. Confirmation and options panels are smaller too. The optional search keyboard expands its panel only while needed; full keyboard keys retain their previous height. Exactly two wish fields and all server behaviour remain unchanged.

Validation: production build, Prettier and whitespace checks passed. Two browser checks passed: the complete submission/Undo/finalise/search flow and the portrait reach/keyboard flow. At 1080 × 1920, the form is under 480px high without a keyboard and under 800px with it, with a submit target at least 55px high and Back at least 51px. Checks verify no keyboard overflow in either the form or search, stable fields during expansion, adjustment bounds/cancellation and draft cleanup. [Current compact panel](docs/screenshots/compact-sheet-keyboard.png). Physical touch behaviour remains an installation check.

## Tree-only showcase and contribution-linked growth · 11 November 2026

The default scene now presents a single real wish tree on a quiet warm neutral stage. Landscape terrain, scenery trees, grass, rocks, fog and sky have been removed from the rendered world. A soft spotlight and contact shadow keep attention on the tree. The wider view still lets visitors browse actual contribution trees at their stored positions. It does not introduce decorative or demo scenery trees.

Tree height scales continuously with its actual leaf count. Trunk thickness, structural limbs and crown growth develop with the contribution count; four contributions render as a small sapling and 108 reach the mature size. Leaf slots, seeds, lookup positions, yellow selection highlight, confirmed arrival animation, submission flow, privacy and server behaviour remain intact. The right-edge kiosk controls and compact forms remain in place.

Verification: production frontend and backend TypeScript build passed. Three targeted browser checks passed on a fresh isolated demo: tree-only composition and confirmed leaf arrival, submission → Undo/finalise → search, and growth from 4 through 8, 27, 54, 81 and 108 leaves with a fixed camera. The growth check verifies tree height and branch geometry increase at each step. A second run of the strengthened growth check also passed. Current browser captures: [sapling](docs/screenshots/tree-sapling-4.png) and [mature tree](docs/screenshots/tree-mature-108.png). Tests use dedicated ports 5187/3017 to avoid colliding with a separately running kiosk preview. No kiosk hardware performance claim is made.

## GMCX-branded interaction sheets · 11 November 2026

The wish form and accepted-wish sheet now carry the GMCX identity directly: translucent glass surfaces, a compact GMC Experience Centre wordmark, blue Lora headings, a blue-to-gold edge rule, Roboto fields and the yellow-gold primary action. Focused inputs and navigation use GMCX blue. The changes keep the existing content-sized, right-aligned layout and preserve the Wishing Tree flow. A light seven-pixel backdrop blur and 72% white tint keep the tree visible behind the sheets while preserving legibility.

Verification: production build passed. The targeted browser flow passed submission → Undo → finalisation → search and checks the form and receipt wordmark, white sheet surface, Lora/blue heading and yellow-gold CTA. [Wish form capture](docs/screenshots/gmcx-branded-form.png) and [receipt capture](docs/screenshots/gmcx-branded-receipt.png). No visitor-entered text is included in either committed image.

## Refined form validation feedback · 11 November 2026

Replaced browser-native validation popups with custom inline field feedback. Invalid fields receive concise guidance, accessible `aria-invalid` / `aria-describedby` state and a restrained outline. Server-side moderation and submission failures remain in the form as a compact branded alert strip; drafts stay available for revision.

Verification: production build and the focused browser flow pass. Browser coverage checks empty fields, the inline errors, accessibility state, server rejection with preserved input, optional keyboard and receipt recovery. [Empty-form validation state](docs/screenshots/form-validation-feedback.png).

## One-minute idle reload · 11 November 2026

The kiosk now clears temporary visitor state and reloads to the current tree after 60 seconds without pointer, keyboard or text-input activity. The timeout is configurable through `VITE_IDLE_SECONDS`. In-flight requests reset the idle clock on completion; active requests and server-owned Undo windows block reload. Accepted contributions remain in the authoritative forest.

Verification: production build passed. Three browser checks passed with a shortened four-second timeout: an idle draft is cleared by reload, an active Undo window prevents reload, and a delayed submission is protected until its response arrives. Run this isolated suite with `VITE_IDLE_SECONDS=4 npm run test:browser -- tests/browser/idle.spec.ts`.

## Consistent initial tree framing

The orbit target starts at the tree's centre. Camera transitions finish only when both camera position and viewing target have settled. Form entry and contribution highlighting use the same whole-tree framing, preventing the vertical jump after submission.

Verification: production build and the full submission → Undo/finalise → search browser flow passed, including an assertion that camera position and target remain stable through submission. [Corrected initial framing](docs/screenshots/centered-tree.png).

## Keyboard follows focused input

Focusing Username, Your wish or leaf search opens the on-screen keyboard and targets that field. Closing it remains available, and tapping an already-focused field reopens it. The inputs suppress an additional operating-system touch keyboard while retaining physical keyboard support.

Verification: production build passed. Three browser checks passed across submission/Undo/search, rejection and reload recovery, and portrait keyboard reach. The portrait check verifies focus-driven opening, keys writing to the correct field, field switching, close/reopen and search focus, plus panel bounds and height adjustment.
