import { test, expect, type Page } from "@playwright/test";
import { outline } from "../../src/experiences/handprint-wall/paint";

async function useDefaultHand(page: Page) {
  await page.getByRole("button", { name: "Use a default hand shape" }).click();
  await page.getByLabel("Print size").fill("0.9");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

test("menu opens capture, a customised mark is placed automatically, and Undo survives reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Wall of Us/ }).click();
  await expect(
    page.getByRole("heading", { name: "Place your hand." }),
  ).toBeVisible();
  await useDefaultHand(page);
  await page.getByRole("button", { name: "teal", exact: true }).click();
  await page.getByRole("button", { name: "Keyboard", exact: true }).click();
  await page
    .getByRole("group", { name: "On-screen keyboard" })
    .getByRole("button", { name: "a", exact: true })
    .click();
  await expect(page.getByLabel("Name on your palm")).toHaveValue("a");
  await page.getByRole("button", { name: "Close keyboard" }).click();
  await page.getByLabel("Name on your palm").fill("Pema");
  await page.screenshot({ path: "test-results/handprint-paint.png" });
  await page.getByRole("button", { name: "Submit handprint" }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-highlight", /.+/);
  await expect(
    page.getByRole("heading", { name: "You are part of this place." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "← Home" })).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: /Undo ·/ }).click();
  await page.getByRole("button", { name: "← Home" }).click();
  await page.getByRole("button", { name: /Wall of Us/ }).click();
  await useDefaultHand(page);
  await expect(page.getByLabel("Name on your palm")).toHaveValue("");
});

test("five held fingertip contacts fit a hand, and interrupted contacts are discarded", async ({
  page,
}) => {
  await page.goto("/handprint-wall");
  const surface = page.locator(".capture-surface");
  const box = (await surface.boundingBox())!;
  const touch = (event: string, id: number, x: number, y: number) =>
    surface.dispatchEvent(event, {
      pointerType: "touch",
      pointerId: id,
      clientX: box.x + x * box.width,
      clientY: box.y + y * box.height,
    });
  await touch("pointerdown", 1, 0.29, 0.58);
  await expect(page.getByText("1 of 5 fingertips detected")).toBeVisible();
  await touch("pointercancel", 1, 0.29, 0.58);
  await expect(page.getByText("0 of 5 fingertips detected")).toBeVisible();
  const points = [
    [0.32, 0.51],
    [0.39, 0.37],
    [0.46, 0.32],
    [0.53, 0.34],
    [0.6, 0.4],
  ];
  for (const [i, [x, y]] of points.entries())
    await touch("pointerdown", i + 2, x, y);
  await expect(
    page.getByRole("heading", { name: "Make it your own." }),
  ).toBeVisible();
  await expect(page.getByLabel("Your handprint preview")).toBeVisible();
});

test("idle clears an unfinished name and returns Home", async ({ page }) => {
  await page.clock.install();
  await page.goto("/handprint-wall");
  await useDefaultHand(page);
  await page.getByLabel("Name on your palm").fill("Tashi");
  await page.clock.fastForward(76000);
  await expect(page.getByText(/Returning Home soon/)).toBeVisible();
  await page.clock.fastForward(15000);
  await expect(
    page.getByRole("heading", { name: /A little of you/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Wall of Us/ }).click();
  await useDefaultHand(page);
  await expect(page.getByLabel("Name on your palm")).toHaveValue("");
});

test("reconnect refreshes missed marks without moving the active section", async ({
  page,
  context,
}) => {
  await page.goto("/handprint-wall");
  await expect(page.locator(".wall-experience")).toHaveAttribute(
    "data-online",
    "true",
  );
  await page.getByRole("button", { name: "Browse the wall" }).click();
  await page.getByRole("button", { name: "Next section" }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-section", "1");
  await context.setOffline(true);
  const response = await page.request.post("/api/handprints/submissions", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      outline: outline(),
      source: "outline",
      colour: "ochre",
      placement: { sectionId: "section-1", x: 6, y: 9, size: 1, rotation: 0 },
    },
  });
  expect(response.ok()).toBeTruthy();
  const receipt = await response.json();
  await context.setOffline(false);
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-print-count",
    "1",
    { timeout: 15000 },
  );
  await expect(page.locator("canvas")).toHaveAttribute("data-section", "1");
  await page.request.post(`/api/handprints/submissions/${receipt.id}/undo`, {
    headers: { Authorization: `Bearer ${receipt.token}` },
  });
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-print-count",
    "0",
    { timeout: 15000 },
  );
});

test("a permanent print can be found by name after reload and switching experiences", async ({
  page,
}) => {
  await page.goto("/handprint-wall");
  await useDefaultHand(page);
  await page.getByLabel("Name on your palm").fill("Karma");
  await page.getByRole("button", { name: "Submit handprint" }).click();
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-highlight", /.+/);
  const id = await canvas.getAttribute("data-highlight");
  await expect(
    page.getByText("Your mark is now part of the wall."),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "← Home" }).click();
  await page.getByRole("button", { name: /Wishing Tree/ }).click();
  await expect(
    page.getByRole("button", { name: "Make a wish", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "← Home" }).click();
  await page.getByRole("button", { name: /Wall of Us/ }).click();
  await page.reload();
  await page.getByRole("button", { name: "Browse the wall" }).click();
  await page.getByRole("button", { name: "Search the wall" }).click();
  await page.getByLabel("Search by name").fill("Karm");
  await page.getByRole("button", { name: "Find handprint" }).click();
  await expect(page.getByRole("status")).toContainText("No prints match");
  await page.getByLabel("Search by name").fill("karma");
  await page.getByRole("button", { name: "Find handprint" }).click();
  await expect(page.getByRole("status")).toContainText(
    "One matching print found.",
  );
  await expect(canvas).toHaveAttribute("data-highlight", id!);
  await page.setViewportSize({ width: 2160, height: 3840 });
  await page.screenshot({ path: "test-results/handprint-search-2160.png" });
});
