import { test, expect } from "@playwright/test";
test.use({ viewport: { width: 1080, height: 1920 } });
test("form and keyboard move together, stay bounded and recover from cancelled adjustment", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("gmc-quality", "low"));
  await page.goto("/wishing-tree");
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "true",
  );
  await page.getByRole("button", { name: "Make a wish", exact: true }).click();
  const grip = page.getByRole("slider", { name: "Controls height" });
  const panel = page.locator(".panel");
  const initialPanel = (await panel.boundingBox())!;
  expect(initialPanel.x).toBeGreaterThan(1080 * 0.3);
  expect(initialPanel.width).toBeLessThan(1080 * 0.65);
  // Content-sized with the guide's 72 px touch targets.
  expect(initialPanel.height).toBeLessThan(680);
  const submit = (await page
    .getByRole("button", { name: "Add my leaf" })
    .boundingBox())!;
  expect(submit.height).toBeGreaterThanOrEqual(55);
  expect(
    (await page
      .getByRole("button", { name: "Back to the tree" })
      .boundingBox())!.height,
  ).toBeGreaterThanOrEqual(51);
  expect(initialPanel.x + initialPanel.width).toBeCloseTo(1080 * 0.97, 0);
  const fieldY = (await page
    .getByLabel("Username", { exact: true })
    .boundingBox())!.y;
  await page.getByLabel("Username", { exact: true }).focus();
  const keyboard = page.getByRole("group", { name: "On-screen keyboard" });
  await expect(keyboard).toBeVisible();
  expect(
    (await page.getByLabel("Username", { exact: true }).boundingBox())!.y,
  ).toBeCloseTo(fieldY, 0);
  await page.screenshot({ path: "test-results/right-sheet-keyboard.png" });
  await expect(panel.locator(".touch-keyboard")).toHaveCount(1);
  // 56 px minimum keys (brand guide) make the open keyboard taller.
  expect((await panel.boundingBox())!.height).toBeLessThan(1100);
  expect(await keyboard.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
    true,
  );
  await keyboard.getByRole("button", { name: "q", exact: true }).click();
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue("q");
  await keyboard.getByRole("button", { name: "Next: your wish" }).click();
  await expect(keyboard.locator(".keyboard-heading")).toContainText(
    "Your wish",
  );
  await keyboard.getByRole("button", { name: "w", exact: true }).click();
  await expect(page.getByLabel("Your wish", { exact: true })).toHaveValue("w");
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue("q");
  await page.getByRole("button", { name: "Close keyboard" }).click();
  await expect(keyboard).toHaveCount(0);
  await page.getByLabel("Your wish", { exact: true }).click();
  await expect(keyboard).toBeVisible();
  const verifyBounds = async () => {
    const box = (await panel.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(1920 * 0.03 - 1);
    expect(box.y + box.height).toBeLessThanOrEqual(1920 * 0.97 + 1);
    await expect(
      page.getByRole("button", { name: "Add my leaf" }),
    ).toBeInViewport();
    await expect(
      keyboard.getByRole("button", { name: "Space", exact: true }),
    ).toBeInViewport();
  };
  await verifyBounds();
  const before = (await keyboard.boundingBox())!.y;
  await grip.press("ArrowDown");
  await expect
    .poll(async () => (await keyboard.boundingBox())!.y)
    .toBeGreaterThan(before + 70);
  await grip.press("End");
  await verifyBounds();
  await grip.press("Home");
  await verifyBounds();
  await grip.press("ArrowUp");
  const handle = (await grip.boundingBox())!;
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2 - 80,
    { steps: 4 },
  );
  await grip.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  const cancelled = (await panel.boundingBox())!.y;
  await page.mouse.move(50, 100);
  expect((await panel.boundingBox())!.y).toBeCloseTo(cancelled, 0);
  await grip.press("ArrowUp");
  await expect
    .poll(async () => (await panel.boundingBox())!.y)
    .toBeLessThan(cancelled - 50);
  await page.screenshot({ path: "test-results/reachable-form-keyboard.png" });
  await page.getByRole("button", { name: "Close keyboard" }).click();
  await page.getByRole("button", { name: "Back to the tree" }).click();
  await expect(keyboard).toHaveCount(0);
  await page.getByRole("button", { name: "Explore options" }).click();
  await page.getByRole("button", { name: "Find my leaf", exact: true }).click();
  await page.getByRole("textbox", { name: "Find your username" }).click();
  await expect(keyboard).toBeVisible();
  await expect(keyboard.locator(".keyboard-heading")).toContainText(
    "Find your username",
  );
  await keyboard.getByRole("button", { name: "e", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Find your username" }),
  ).toHaveValue("e");
  expect(await keyboard.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Make a wish", exact: true }).click();
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue("");
});
