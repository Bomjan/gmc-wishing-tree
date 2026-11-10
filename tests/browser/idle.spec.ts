import { test, expect } from "@playwright/test";

test.skip(
  process.env.VITE_IDLE_SECONDS !== "4",
  "Run this isolated suite with VITE_IDLE_SECONDS=4.",
);

test("reloads after inactivity and clears the previous visitor's draft", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const key = "gmc-test-load-count";
    localStorage.setItem(
      key,
      String(Number(localStorage.getItem(key) || 0) + 1),
    );
  });
  await page.goto("/");
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "true",
  );
  await page.getByRole("button", { name: "Make a wish", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill("idle_draft");
  await page
    .getByLabel("Your wish", { exact: true })
    .fill("A temporary visitor draft.");
  await page.waitForTimeout(1000);
  await expect(page.getByLabel("Your wish", { exact: true })).toHaveValue(
    "A temporary visitor draft.",
  );
  await expect
    .poll(
      () => page.evaluate(() => localStorage.getItem("gmc-test-load-count")),
      { timeout: 10000 },
    )
    .toBe("2");
  await page.mouse.move(100, 100);
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "true",
  );
  await expect(page.locator(".minimal-dock .primary")).toBeVisible();
  await expect(page.getByLabel("Username", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Your wish", { exact: true })).toHaveCount(0);
});

test("does not reload during a server-owned Undo window", async ({ page }) => {
  await page.addInitScript(() => {
    const key = "gmc-test-load-count";
    localStorage.setItem(
      key,
      String(Number(localStorage.getItem(key) || 0) + 1),
    );
  });
  await page.goto("/");
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "true",
  );
  await page.getByRole("button", { name: "Make a wish", exact: true }).click();
  await page
    .getByLabel("Username", { exact: true })
    .fill(`idle_undo_${Date.now().toString().slice(-6)}`);
  await page
    .getByLabel("Your wish", { exact: true })
    .fill("A wish to test Undo.");
  await page.getByRole("button", { name: "Let my wish take root" }).click();
  await expect(page.getByRole("button", { name: /Undo ·/ })).toBeVisible();
  await page.waitForTimeout(5000);
  await expect(page.getByRole("button", { name: /Undo ·/ })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gmc-test-load-count")),
    )
    .toBe("1");
  await page.getByRole("button", { name: /Undo ·/ }).click();
  await expect(
    page.getByText("Your wish was undone. You can begin again."),
  ).toBeVisible();
});

test("does not reload while a submission request is in flight", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const key = "gmc-test-load-count";
    localStorage.setItem(
      key,
      String(Number(localStorage.getItem(key) || 0) + 1),
    );
  });
  await page.goto("/");
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "true",
  );
  let releaseResponse = () => {};
  let markRouteStarted = () => {};
  const routeStarted = new Promise<void>((resolve) => {
    markRouteStarted = resolve;
  });
  await page.route("**/api/submissions", async (route) => {
    markRouteStarted();
    await new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Moderation is temporarily unavailable.",
      }),
    });
  });
  await page.getByRole("button", { name: "Make a wish", exact: true }).click();
  await page
    .getByLabel("Username", { exact: true })
    .fill(`idle_request_${Date.now().toString().slice(-6)}`);
  await page.getByLabel("Your wish", { exact: true }).fill("A held request.");
  await page.getByRole("button", { name: "Let my wish take root" }).click();
  await routeStarted;
  await page.waitForTimeout(5000);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gmc-test-load-count")),
    )
    .toBe("1");
  await expect(page.getByLabel("Your wish", { exact: true })).toHaveValue(
    "A held request.",
  );
  releaseResponse();
  await expect(page.locator(".form-feedback")).toContainText(
    "Moderation is temporarily unavailable.",
  );
});
