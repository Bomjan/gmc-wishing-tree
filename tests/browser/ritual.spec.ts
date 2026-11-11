import { test, expect } from "@playwright/test";
test.use({ viewport: { width: 1080, height: 1920 } });

test("confirmed reveal highlights the visitor's actual leaf beyond the Undo countdown", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("gmc-quality", "low"));
  await page.goto("/wishing-tree");
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "true",
  );
  let release = () => {};
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/submissions", async (route) => {
    await hold;
    await route.continue();
  });
  await page.getByRole("button", { name: "Make a wish", exact: true }).click();
  await page
    .getByLabel("Username", { exact: true })
    .fill(`reveal_${Date.now().toString().slice(-9)}`);
  await page
    .getByLabel("Your wish", { exact: true })
    .fill("May kindness take root.");
  await page.getByRole("button", { name: "Add my leaf" }).click();
  await expect(
    page.locator('.wish-ritual[data-phase="waiting"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your wish has taken root." }),
  ).toHaveCount(0);
  release();
  await expect(
    page.locator('.wish-ritual[data-phase="arrival"]'),
  ).toBeVisible();
  const own = await page.evaluate(() => {
    const r = JSON.parse(sessionStorage.getItem("gmc-pending")!);
    return { treeId: r.treeId, slot: r.slot };
  });
  const metrics = () =>
    page.evaluate(async () => {
      const path = "/src/Scene.tsx";
      return (await import(path)).getSceneMetrics();
    });
  await expect
    .poll(async () => (await metrics()).highlights)
    .toEqual([{ ...own, color: "ffd766", depthTest: false }]);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: "test-results/ritual-unfurl.png" });
  await expect(page.getByText("Permanently rooted")).toBeVisible({
    timeout: 18000,
  });
  // Selection must not expire at the old twelve-second limit while the receipt is open.
  await page.waitForTimeout(3500);
  await expect
    .poll(async () => (await metrics()).highlights)
    .toEqual([{ ...own, color: "ffd766", depthTest: false }]);
  await page.screenshot({ path: "test-results/ritual-highlight.png" });
  await page.getByRole("button", { name: "Return to the tree" }).click();
  await expect(page.locator(".wish-ritual")).toHaveCount(0);
  await expect.poll(async () => (await metrics()).highlights).toEqual([]);
});

test("reduced motion skips the ritual but preserves the yellow leaf and immediate Undo", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("gmc-quality", "low"));
  await page.goto("/wishing-tree");
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "true",
  );
  await page.getByRole("button", { name: "Make a wish", exact: true }).click();
  await page
    .getByLabel("Username", { exact: true })
    .fill(`quiet_${Date.now().toString().slice(-9)}`);
  await page
    .getByLabel("Your wish", { exact: true })
    .fill("May we grow together.");
  await page.getByRole("button", { name: "Add my leaf" }).click();
  await expect(page.getByRole("button", { name: /Undo ·/ })).toBeVisible();
  await expect(page.locator(".wish-ritual")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = "/src/Scene.tsx";
        return (await import(path)).getSceneMetrics().highlights.length;
      }),
    )
    .toBe(1);
  await page.getByRole("button", { name: /Undo ·/ }).click();
  await expect(
    page.getByText("Your wish was undone. You can begin again."),
  ).toBeVisible();
});
