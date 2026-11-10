import { test, expect } from "@playwright/test";
for (const viewport of [
  { width: 476, height: 782 },
  { width: 1366, height: 768 },
  { width: 1080, height: 1920 },
  { width: 2160, height: 3840 },
]) {
  test.describe(`${viewport.width} × ${viewport.height} portrait`, () => {
    test.use({ viewport });
    test("tree-first welcome, optional search and scaled touch form", async ({
      page,
    }) => {
      await page.addInitScript(() =>
        localStorage.setItem("gmc-quality", "low"),
      );
      await page.goto("/");
      await expect(page.locator(".sanctuary")).toHaveAttribute(
        "data-online",
        "true",
      );
      await expect(page.locator("header,footer,.utility-controls")).toHaveCount(
        0,
      );
      const canvas = page.locator("canvas");
      await expect(canvas).toHaveCount(1);
      await expect(
        page.getByRole("textbox", { name: "Find your username" }),
      ).toBeHidden();
      const panel = await page.locator(".panel").boundingBox(),
        primary = await page
          .getByRole("button", { name: "Make a wish", exact: true })
          .boundingBox();
      const stageWidth = Math.min(viewport.width, (viewport.height * 9) / 16);
      expect(panel!.width).toBeLessThan(stageWidth * 0.12);
      expect(panel!.width * panel!.height).toBeLessThan(
        stageWidth * viewport.height * 0.02,
      );
      const right = (viewport.width + stageWidth) / 2;
      expect(panel!.x).toBeGreaterThan(right - stageWidth * 0.16);
      expect(panel!.x + panel!.width).toBeLessThanOrEqual(
        right - stageWidth * 0.02,
      );
      await expect(
        page.locator(".panel-welcome h1,.panel-welcome .intro,.progress-block"),
      ).toHaveCount(0);
      expect(panel!.y).toBeGreaterThan(viewport.height * 0.1);
      expect(panel!.y).toBeLessThan(viewport.height * 0.75);
      const stage = await page.locator(".sanctuary").boundingBox();
      expect(stage!.width / stage!.height).toBeCloseTo(9 / 16, 2);
      if (viewport.height >= 1920)
        expect(primary!.height).toBeGreaterThanOrEqual(63.5);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(viewport.width);
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: `test-results/portrait-tree-${viewport.width}.png`,
      });
      await page.getByRole("button", { name: "More options" }).click();
      await page
        .getByRole("button", { name: "Find my leaf", exact: true })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Find your username" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Close leaf search" }).click();
      await page
        .getByRole("button", { name: "Make a wish", exact: true })
        .click();
      await expect(
        page.locator(".wish-form input,.wish-form textarea"),
      ).toHaveCount(2);
      await expect(
        page.getByRole("button", { name: "Let my wish take root" }),
      ).toBeInViewport();
      await expect(canvas).toHaveCount(1);
      if (viewport.width === 2160) {
        await page.screenshot({ path: "test-results/touch-form-4k.png" });
        const size = await canvas.evaluate((c) => ({
          width: (c as HTMLCanvasElement).width,
          height: (c as HTMLCanvasElement).height,
        }));
        expect(size).toEqual(viewport);
      }
    });
  });
}
