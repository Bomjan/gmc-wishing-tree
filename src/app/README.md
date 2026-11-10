# Shared application shell — to implement

Build the home menu, route ownership and Home actions here. `experiences.ts` provides menu copy and planned paths; it does not install a router or change current navigation.

Suggested files: `AppShell.tsx`, `HomeMenu.tsx`, `routes.tsx`, and reusable menu components in `components/`.

Plan: `/` → menu; `/wishing-tree` → lazy import `../experiences/wishing-tree`; `/handprint-wall` → lazy import the future handprint page. Existing `/` still opens Wishing Tree until this is implemented. Keep the 9:16 museum stage; two large preview cards, current GMCX blue/gold palette and Lora/Roboto typography, no emojis or website header/footer. Use lightweight static previews instead of mounting both live 3D experiences on the menu.

Route cleanup must reset temporary visitor state and close connections/resources without deleting accepted database records. Guard in-flight submissions and active Undo windows. Coordinate shared idle warning/reset behaviour through `../shared/kiosk/`.
