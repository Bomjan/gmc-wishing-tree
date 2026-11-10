# Handprint tests to implement

Add geometry, paint determinism and real PostgreSQL integration tests here. Update the `test` script to discover nested `*.test.ts` files (it currently runs only `tests/*.test.ts`). Keep the existing tree suites active.

Required cases: empty/malformed/oversized outlines; finite numeric bounds; allowlisted paint/size/rotation; one-pointer tracing and cancellation (browser); duplicate retries; concurrent placement conflict/suggestion; Undo at the deadline; restart inside/beyond Undo; expired/cancelled placement reuse; operator authorisation; fail-closed moderation; missed WebSocket recovery; stable seeded paint and coordinates; cross-experience accepted records; Home/idle temporary-data cleanup with in-flight/Undo protection.

Future browser specs belong in `tests/browser/` (the current Playwright test directory). Include real tracing and press-and-hold plus normal confirmation, menu navigation and Wishing Tree regressions. Do not substitute demo-only tests for PostgreSQL concurrency/finalisation checks.
