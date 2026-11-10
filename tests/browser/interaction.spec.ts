import { test, expect } from "@playwright/test";
test.use({ viewport: { width: 1080, height: 1920 } });
test("default scene supports drag, wheel, two-finger zoom and direct leaf selection with a minimal dock", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("gmc-quality", "low"));
  await page.goto("/");
  await expect(page.locator(".sanctuary")).toHaveAttribute(
    "data-online",
    "true",
  );
  const camera = () =>
    page.evaluate(async () => {
      const path = "/src/Scene.tsx";
      return (await import(path)).getCameraPosition() as number[];
    });
  await expect
    .poll(async () => (await camera())?.length, { timeout: 15000 })
    .toBe(3);
  await page.waitForTimeout(1500);
  const dock = await page.locator(".panel-welcome").boundingBox();
  expect(dock!.height).toBeLessThan(192);
  await expect(page.locator(".panel-welcome h1")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "View the mountain", exact: true }),
  ).toBeHidden();
  const grip = page.getByRole("slider", { name: "Controls height" }),
    gripBox = (await grip.boundingBox())!;
  const original = (await page.locator(".panel-welcome").boundingBox())!;
  const value = Number(await grip.getAttribute("aria-valuenow"));
  await grip.press("ArrowUp");
  await expect
    .poll(async () => Number(await grip.getAttribute("aria-valuenow")))
    .toBeGreaterThan(value);
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Default height" }).click();
  await page.getByRole("button", { name: "More options" }).click();
  await page.mouse.move(
    gripBox.x + gripBox.width / 2,
    gripBox.y + gripBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    gripBox.x + gripBox.width / 2,
    gripBox.y + gripBox.height / 2 + 220,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await page.locator(".panel-welcome").boundingBox())!.y)
    .toBeGreaterThan(original.y + 150);
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Higher", exact: true }).click();
  await page.getByRole("button", { name: "Default height" }).click();
  await page.getByRole("button", { name: "More options" }).click();
  await page.screenshot({ path: "test-results/minimal-interactive.png" });
  const canvas = page.locator("canvas"),
    box = (await canvas.boundingBox())!,
    before = await camera();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.64);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.66, {
    steps: 12,
  });
  await page.mouse.up();
  await expect
    .poll(async () =>
      Math.hypot(...(await camera()).map((v, i) => v - before[i])),
    )
    .toBeGreaterThan(1);
  const beforeWheel = await camera();
  await page.mouse.wheel(0, 450);
  await expect
    .poll(async () =>
      Math.hypot(...(await camera()).map((v, i) => v - beforeWheel[i])),
    )
    .toBeGreaterThan(0.5);
  const cdp = await page.context().newCDPSession(page),
    cx = box.x + box.width * 0.5,
    cy = box.y + box.height * 0.6,
    beforePinch = await camera();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { id: 1, x: cx - 45, y: cy },
      { id: 2, x: cx + 45, y: cy },
    ],
  });
  for (let i = 1; i <= 6; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { id: 1, x: cx - 45 - i * 12, y: cy },
        { id: 2, x: cx + 45 + i * 12, y: cy },
      ],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(async () =>
      Math.hypot(...(await camera()).map((v, i) => v - beforePinch[i])),
    )
    .toBeGreaterThan(0.5);
  await cdp.detach();
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await page.waitForTimeout(2500);
  const points = await page.evaluate(async () => {
    const path = "/src/Scene.tsx";
    return (await import(path)).getProjectedLeaves() as {
      x: number;
      y: number;
    }[];
  });
  expect(points.length).toBeGreaterThan(0);
  const dockRect = (await page.locator(".panel-welcome").boundingBox())!;
  const point = points.find(
    (p) =>
      p.x < dockRect.x ||
      p.x > dockRect.x + dockRect.width ||
      p.y < dockRect.y - 10 ||
      p.y > dockRect.y + dockRect.height + 10,
  )!;
  expect(point).toBeTruthy();
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = "/src/state.ts";
        return (await import(path)).useSanctuary.getState().selection;
      }),
    )
    .toBeTruthy();
  await expect(page.locator(".panel-welcome")).toBeVisible();
  await page.getByRole("button", { name: "Make a wish", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill("temporary_visitor");
  await page.getByLabel("Your wish", { exact: true }).fill("A temporary draft");
  await page.getByRole("button", { name: "Back to the tree" }).click();
  await page.getByRole("button", { name: "Make a wish", exact: true }).click();
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Your wish", { exact: true })).toHaveValue("");
  expect(errors).toEqual([]);
});
