import { test, expect } from "@playwright/test";
test.use({ viewport: { width: 1080, height: 1920 } });
test("tree showcase loads local materials and animates a confirmed contribution without adding extra leaves", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /THREE|GLSL|shader|WebGL/i.test(m.text()))
      errors.push(m.text());
  });
  await page.addInitScript(() => localStorage.setItem("gmc-quality", "low"));
  await page.goto("/wishing-tree");
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "true",
  );
  const metrics = () =>
    page.evaluate(async () => {
      const path = "/src/Scene.tsx";
      return (await import(path)).getSceneMetrics();
    });
  await expect
    .poll(async () => (await metrics()).assetsReady, { timeout: 20000 })
    .toBe(true);
  await page.evaluate(() => document.fonts.ready);
  const brand = await page.evaluate(() => ({
    font: getComputedStyle(document.querySelector(".primary")!).fontFamily,
    body: getComputedStyle(document.body).fontFamily,
    action: getComputedStyle(document.querySelector(".minimal-dock .primary")!)
      .backgroundColor,
    headers: document.querySelectorAll(".kiosk-header").length,
    footers: document.querySelectorAll("footer").length,
  }));
  expect(brand.font).toContain("Roboto");
  expect(brand.body).toContain("Roboto");
  expect(brand.action).toBe("rgb(255, 214, 107)");
  expect(brand.headers).toBe(1);
  expect(brand.footers).toBe(0);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "test-results/natural-sanctuary.png" });
  const before = await (await request.get("/api/forest")).json();
  const response = await request.post("/api/submissions", {
    headers: {
      "Idempotency-Key": crypto.randomUUID(),
      "X-Kiosk-Session": crypto.randomUUID(),
    },
    data: {
      username: `unfurl_${Date.now()}`,
      wish: "May our forest grow in kindness.",
    },
  });
  expect(response.status()).toBe(201);
  const receipt = await response.json();
  const id = `${receipt.treeId}:${receipt.slot}`;
  await expect
    .poll(
      async () => (await metrics()).arrivals.some((a: any) => a.id === id),
      { timeout: 8000 },
    )
    .toBe(true);
  await page.screenshot({ path: "test-results/leaf-arrival.png" });
  await expect
    .poll(
      async () => (await metrics()).arrivals.some((a: any) => a.id === id),
      { timeout: 12000 },
    )
    .toBe(false);
  const after = await (await request.get("/api/forest")).json();
  const count = (forest: any) =>
    forest.trees.reduce((n: number, t: any) => n + t.leaves.length, 0);
  expect(count(after)).toBe(count(before) + 1);
  await page.screenshot({ path: "test-results/leaf-settled.png" });
  const stats = await metrics();
  expect(stats.drawCalls).toBeLessThan(220);
  expect(stats.trees).toHaveLength(1);
  expect(stats.backgroundMeshes).toBe(0);
  expect(stats.backdrop).toBeUndefined();
  const background = await page
    .locator(".scene")
    .evaluate((scene) => getComputedStyle(scene, "::before").backgroundImage);
  // The sky is drawn with gradients; no photographic landscape backdrop.
  expect(background).toContain("gradient");
  expect(background).not.toContain("url(");
  expect(errors).toEqual([]);
  // Keep the scene fixture reusable without leaving a test visitor behind.
  await request.post(`/api/submissions/${receipt.id}/undo`, {
    headers: { Authorization: `Bearer ${receipt.token}` },
  });
});

test("actual tree size grows from four to 108 leaves without zooming to hide the difference", async ({
  page,
}) => {
  let count = 4;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("gmc-quality", "low"));
  const assets: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/textures/")) assets.push(r.url());
  });
  await page.route("**/api/forest", (route) =>
    route.fulfill({
      json: {
        demo: true,
        serverTime: new Date().toISOString(),
        trees: [
          {
            id: "growth-demo",
            seed: 412,
            x: 32,
            z: -10,
            leaves: Array.from({ length: count }, (_, slot) => ({
              slot,
              state: "finalised",
            })),
          },
        ],
      },
    }),
  );
  await page.goto("/wishing-tree");
  const metrics = () =>
    page.evaluate(async () => {
      const path = "/src/Scene.tsx";
      return (await import(path)).getSceneMetrics();
    });
  await expect.poll(async () => (await metrics()).trees?.[0]?.leaves).toBe(4);
  await page.waitForTimeout(500);
  const before = await metrics();
  const camera = () =>
    page.evaluate(async () => {
      const path = "/src/Scene.tsx";
      return (await import(path)).getCameraPosition();
    });
  const initialCamera = await camera();
  await page.screenshot({ path: "test-results/tree-sapling-4.png" });
  let height = before.trees![0].woodHeight;
  let vertices = before.trees![0].woodVertices;
  for (const n of [8, 27, 54, 81, 108]) {
    count = n;
    await page.evaluate(async () => {
      const path = "/src/state.ts";
      await (await import(path)).loadForest();
    });
    await expect.poll(async () => (await metrics()).trees?.[0]?.leaves).toBe(n);
    const tree = (await metrics()).trees![0];
    expect(tree.woodHeight).toBeGreaterThanOrEqual(height);
    height = tree.woodHeight;
    expect(tree.woodVertices).toBeGreaterThanOrEqual(vertices);
    vertices = tree.woodVertices;
    expect(await camera()).toEqual(initialCamera);
    await expect(page.locator(".dock-caption")).toContainText(
      `${n} / 108 leaves`,
    );
  }
  const mature = (await metrics()).trees![0];
  expect(mature.scale).toBe(1);
  expect(before.trees![0].woodHeight).toBeLessThan(mature.woodHeight * 0.7);
  expect(mature.woodVertices).toBeGreaterThan(before.trees![0].woodVertices);
  expect(assets.some((url) => /ground-|rock-/.test(url))).toBe(false);
  await expect(page.locator(".sun-wash")).toHaveCount(0);
  await page.screenshot({ path: "test-results/tree-mature-108.png" });
});

test("the bare tree renders on an offline first visit and gives way to the live tree", async ({
  page,
}) => {
  await page.route("**/api/forest", (route) => route.abort());
  await page.goto("/wishing-tree?quality=low");
  const treeIds = () =>
    page.evaluate(async () => {
      const path = "/src/Scene.tsx";
      return (await import(path))
        .getSceneMetrics()
        .trees?.map((tree: { id: string }) => tree.id);
    });
  await expect.poll(treeIds, { timeout: 20000 }).toEqual(["preview"]);
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "false",
  );

  await page.unroute("**/api/forest");
  await page.evaluate(async () => {
    const path = "/src/state.ts";
    await (await import(path)).loadForest();
  });
  await expect.poll(treeIds, { timeout: 20000 }).toEqual(["demo-current"]);
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "true",
  );
});
