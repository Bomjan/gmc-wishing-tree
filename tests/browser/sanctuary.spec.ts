import { test, expect } from "@playwright/test";
test.use({ viewport: { width: 1080, height: 1920 } });
test("natural world loads local materials and animates a confirmed contribution without adding extra leaves", async ({
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
  await page.goto("/");
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
    action: getComputedStyle(document.querySelector(".primary svg")!)
      .backgroundColor,
    headers: document.querySelectorAll("header,footer").length,
  }));
  expect(brand.font).toContain("Roboto");
  expect(brand.body).toContain("Roboto");
  expect(brand.action).toBe("rgb(255, 215, 102)");
  expect(brand.headers).toBe(0);
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
  expect(stats.drawCalls).toBeLessThan(90);
  expect(errors).toEqual([]);
  // Keep the scene fixture reusable without leaving a test visitor behind.
  await request.post(`/api/submissions/${receipt.id}/undo`, {
    headers: { Authorization: `Bearer ${receipt.token}` },
  });
});
