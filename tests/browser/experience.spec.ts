import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gmc-quality", "low"));
});
test("touchscreen submission, Undo, finalise, search and mountain navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Make a wish", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "true",
  );
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: "test-results/morning-sanctuary.png",
    fullPage: true,
  });
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveCount(1);
  const name = `browser_${Date.now().toString().slice(-10)}`;
  await page.getByRole("button", { name: "Make a wish", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page
    .getByLabel("Your wish", { exact: true })
    .fill("May our mountain grow in kindness.");
  await page.screenshot({ path: "test-results/submission-form.png" });
  await page.getByRole("button", { name: "Let my wish take root" }).click();
  await expect(
    page.getByRole("heading", { name: "Your wish has taken root." }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByRole("button", { name: /Undo ·/ }).click();
  await expect(
    page.getByText("Your wish was undone. You can begin again."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Make a wish", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page
    .getByLabel("Your wish", { exact: true })
    .fill("May every visitor feel welcome.");
  await page.getByRole("button", { name: "Let my wish take root" }).click();
  await expect(page.getByText("Permanently rooted")).toBeVisible({
    timeout: 18000,
  });
  await page.screenshot({ path: "test-results/accepted-wish.png" });
  await page.getByRole("button", { name: "Return to the tree" }).click();
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Find my leaf", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Find your username" })
    .fill(name.toUpperCase());
  await page.getByRole("button", { name: "Find leaf", exact: true }).click();
  await expect(page.getByText("Your leaf is here.")).toBeVisible();
  await expect(page.locator("#leaf-search input")).toHaveValue("");
  await expect(
    page.getByRole("textbox", { name: "Find your username" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "More options" }).click();
  await page
    .getByRole("button", { name: "View the mountain", exact: true })
    .click();
  await page.getByRole("button", { name: "More options" }).click();
  await expect(
    page.getByRole("button", { name: "Back to current tree" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/mountain-view.png" });
  await page.getByRole("button", { name: "Back to current tree" }).click();
  expect(errors).toEqual([]);
});
test("rejection preserves form, optional keyboard works, pending survives reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "true",
  );
  await page.getByRole("button", { name: "Make a wish", exact: true }).click();
  await page
    .getByLabel("Username", { exact: true })
    .fill(`reject_${Date.now().toString().slice(-9)}`);
  await page
    .getByLabel("Your wish", { exact: true })
    .fill("reject this demo wish");
  await page.getByRole("button", { name: "Let my wish take root" }).click();
  await expect(
    page.getByText(
      "Please revise your wish to keep this space welcoming for everyone.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Your wish", { exact: true })).toHaveValue(
    "reject this demo wish",
  );
  await page.getByLabel("Your wish", { exact: true }).fill("Peace for all.");
  await page.getByRole("button", { name: "Toggle on-screen keyboard" }).click();
  await expect(
    page.getByRole("group", { name: "On-screen keyboard" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close keyboard" }).click();
  await page.getByRole("button", { name: "Let my wish take root" }).click();
  await expect(page.getByRole("button", { name: /Undo ·/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Undo ·/ })).toBeVisible();
  await page.getByRole("button", { name: /Undo ·/ }).click();
  await expect(
    page.getByText("Your wish was undone. You can begin again."),
  ).toBeVisible();
});
test("reconnection reloads authoritative state and ambiguous search exposes no directory", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "true",
  );
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Find my leaf", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Find your username" })
    .fill("mountain_hore");
  await page.getByRole("button", { name: "Find leaf", exact: true }).click();
  await expect(
    page.getByText("Please check the spelling of your username."),
  ).toBeVisible();
  await page.context().setOffline(true);
  await page.context().setOffline(false);
  await page.reload();
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "true",
  );
  const response = await request.get("/api/forest");
  const data = await response.json();
  expect(JSON.stringify(data)).not.toContain("username");
  expect(JSON.stringify(data)).not.toContain("wish_ciphertext");
});

test("incoming wishes do not hijack the camera while a visitor is typing", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "true",
  );
  await page.getByRole("button", { name: "Make a wish", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill("still_typing");
  await page.waitForTimeout(2500);
  const snapshot = () =>
    page.evaluate(async () => {
      const path = "/src/Scene.tsx";
      return (await import(path)).getCameraPosition() as number[];
    });
  await expect
    .poll(async () => (await snapshot())?.length, { timeout: 15000 })
    .toBe(3);
  const before = await snapshot();
  const forest = await (await request.get("/api/forest")).json();
  const current = forest.trees.find((t: any) => t.leaves.length < 108);
  const count = current ? 109 - current.leaves.length : 1;
  const session = crypto.randomUUID();
  await Promise.all(
    Array.from({ length: count }, (_, i) =>
      request.post("/api/submissions", {
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
          "X-Kiosk-Session": session,
        },
        data: {
          username: `remote_${Date.now()}_${i}`,
          wish: "May this forest flourish.",
        },
      }),
    ),
  );
  await expect
    .poll(async () => {
      const path = "/src/state.ts";
      return page.evaluate(async (p) => {
        const module = await import(p);
        return module.useSanctuary.getState().forest.trees.length;
      }, path);
    })
    .toBeGreaterThan(forest.trees.length);
  await page.waitForTimeout(1500);
  const after = await snapshot();
  expect(Math.hypot(...before.map((v, i) => v - after[i]))).toBeLessThan(0.1);
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue(
    "still_typing",
  );
});
test("measure software-rendered frame delivery without asserting kiosk performance", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "true",
  );
  await page.waitForTimeout(1500);
  const metrics = await page.evaluate(
    () =>
      new Promise<{
        samples: number;
        medianMs: number;
        p95Ms: number;
        elapsedMs: number;
      }>((resolve) => {
        const frames: number[] = [];
        const start = performance.now();
        let previous = start;
        function tick(now: number) {
          frames.push(now - previous);
          previous = now;
          if (now - start < 4000) {
            requestAnimationFrame(tick);
            return;
          }
          frames.sort((a, b) => a - b);
          resolve({
            samples: frames.length,
            medianMs: frames[Math.floor(frames.length * 0.5)],
            p95Ms: frames[Math.floor(frames.length * 0.95)],
            elapsedMs: now - start,
          });
        }
        requestAnimationFrame(tick);
      }),
  );
  writeFileSync(
    "test-results/performance.json",
    JSON.stringify(
      {
        renderer: "Chromium SwiftShader, software rendering",
        viewport: "1440x1000",
        quality: "low",
        ...metrics,
      },
      null,
      2,
    ),
  );
  expect(metrics.samples).toBeGreaterThan(0);
});
