# Shared application

`Router.tsx` owns the Home menu, lazy route selection, Home controls and idle warning/reset. `experiences.ts` supplies menu text and configurable title. Previews do not mount live experience scenes. Only one experience mounts at a time. Active submissions and Undo windows lock navigation/reset. See `docs/handprint-wall-handoff.md`.
