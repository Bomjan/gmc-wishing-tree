import { test, expect, type Page } from "@playwright/test";

const order = ["bird", "rabbit", "monkey", "elephant"].map(
  (name) => `companion-${name}`,
);
const metrics = (page: Page) =>
  page.evaluate(async () => {
    const path = "/src/Scene.tsx";
    return (await import(path)).getSceneMetrics();
  });

for (const viewport of [
  { width: 1080, height: 1920 },
  { width: 476, height: 782 },
]) {
  test(`the four friends arrive in story order and never overlap at ${viewport.width} × ${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem("gmc-quality", "low"));
    let count = 0;
    // A demo tree other than the seeded one: each wish brings the next friend.
    // Installation thresholds are covered by tests/thuenpa-puenzhi.test.ts.
    await page.route("**/api/forest", (route) =>
      route.fulfill({
        json: {
          demo: true,
          serverTime: new Date().toISOString(),
          trees: [
            {
              id: "friends-test",
              seed: 412,
              x: 0,
              z: 0,
              leaves: Array.from({ length: count }, (_, slot) => ({
                slot,
                state: "finalised",
              })),
            },
          ],
        },
      }),
    );
    await page.route("**/api/config", (route) =>
      route.fulfill({
        json: { usernameMin: 3, usernameMax: 24, wishMax: 500 },
      }),
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/wishing-tree");
    for (const [leaves, expected] of [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [1, 1],
      [4, 4],
      [108, 4],
    ] as const) {
      count = leaves;
      await page.evaluate(async () => {
        const path = "/src/state.ts";
        await (await import(path)).loadForest();
      });
      await expect
        .poll(async () => (await metrics(page)).companions)
        .toEqual(order.slice(0, expected));
    }
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: `test-results/thuenpa-puenzhi-${viewport.width}.png`,
    });
    const { companionRects: rects } = await metrics(page);
    const stage = (await page.locator(".sanctuary").boundingBox())!;
    const rail = (await page.locator(".panel-welcome").boundingBox())!;
    const header = (await page.locator(".kiosk-header").boundingBox())!;
    const overlap = (a: any, b: any) =>
      a.x < b.x + b.width &&
      b.x < a.x + a.width &&
      a.y < b.y + b.height &&
      b.y < a.y + a.height;
    expect(rects).toHaveLength(4);
    for (const [i, a] of rects.entries()) {
      // Fully visible inside the stage, below the header, clear of the rail.
      expect(a.x).toBeGreaterThanOrEqual(stage.x);
      expect(a.x + a.width).toBeLessThanOrEqual(stage.x + stage.width);
      expect(a.y).toBeGreaterThan(header.y + header.height);
      expect(a.y + a.height).toBeLessThanOrEqual(stage.y + stage.height);
      expect(overlap(a, rail)).toBe(false);
      for (const b of rects.slice(i + 1)) expect(overlap(a, b)).toBe(false);
    }
  });
}

test("in the demo, one friend arrives with each new wish", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => localStorage.setItem("gmc-quality", "low"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/wishing-tree");
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "true",
  );
  const config = await (await request.get("/api/config")).json();
  expect(typeof config.demoInitialWishes).toBe("number");
  const forest = await (await request.get("/api/forest")).json();
  const tree = forest.trees.find((t: any) => t.id === "demo-current");
  test.skip(
    !tree || tree.leaves.length - config.demoInitialWishes >= 4,
    "The shared demo tree already has all four friends.",
  );
  const already = tree.leaves.length - config.demoInitialWishes;
  await expect
    .poll(async () => (await metrics(page)).companions)
    .toEqual(order.slice(0, already));
  const session = crypto.randomUUID();
  for (let i = already; i < Math.min(4, already + 2); i++) {
    const response = await request.post("/api/submissions", {
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
        "X-Kiosk-Session": session,
      },
      data: {
        username: `friend_${Date.now().toString().slice(-8)}_${i}`,
        wish: "May the friends gather.",
      },
    });
    expect(response.status()).toBeLessThan(300);
    await expect
      .poll(async () => (await metrics(page)).companions, { timeout: 15000 })
      .toEqual(order.slice(0, i + 1));
  }
});
