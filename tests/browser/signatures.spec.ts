import { test, expect, type Page } from "@playwright/test";

async function drawSignature(page: Page, username: string, touch = false) {
  await page.getByRole("button", { name: "Add your signature" }).click();
  const pad = page.getByLabel("Draw your signature and doodles");
  const client = touch ? await page.context().newCDPSession(page) : undefined;
  if (client) {
    const handle = page.getByRole("button", { name: "Move drawing panel" });
    const start = (await handle.boundingBox())!;
    expect(start.y).toBeGreaterThan(3840 * 0.24);
    const x = start.x + start.width / 2;
    const y = start.y + start.height / 2;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + 110, y: y + 100 }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    const moved = (await handle.boundingBox())!;
    expect(moved.x).toBeCloseTo(start.x + 110, 0);
    expect(moved.y).toBeCloseTo(start.y + 100, 0);
  }
  const box = (await pad.boundingBox())!;
  async function stroke(points: number[][]) {
    const positions = points.map(([x, y]) => ({
      x: box.x + x * box.width,
      y: box.y + y * box.height,
    }));
    if (client) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [positions[0]],
      });
      for (const point of positions.slice(1))
        await client.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [point],
        });
      await client.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      return;
    }
    await page.mouse.move(positions[0].x, positions[0].y);
    await page.mouse.down();
    for (const { x, y } of positions.slice(1))
      await page.mouse.move(x, y, { steps: 4 });
    await page.mouse.up();
  }
  await stroke([
    [0.12, 0.72],
    [0.28, 0.2],
    [0.36, 0.14],
    [0.3, 0.59],
    [0.48, 0.48],
    [0.6, 0.36],
    [0.74, 0.45],
  ]);
  await page.getByRole("button", { name: "red", exact: true }).click();
  await stroke([
    [0.72, 0.16],
    [0.81, 0.12],
    [0.85, 0.2],
    [0.78, 0.3],
    [0.72, 0.16],
  ]);
  await client?.detach();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByRole("button", { name: "Close keyboard" }).click();
  await page.getByRole("button", { name: "Choose a spot" }).click();
}

test("draw coloured strokes, choose a spot, and find the signature without publishing the username", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 2160, height: 3840 });
  const localAlias = new URL(baseURL!);
  localAlias.hostname = "127.0.0.1";
  await page.goto(localAlias.href);
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: /Wall of Signatures/ }).click();
  await expect(
    page.getByRole("heading", { name: "Wall of Signatures" }),
  ).toBeVisible();
  await expect(page.locator(".signature-experience")).toHaveAttribute(
    "data-online",
    "true",
  );
  const logo = page.locator(".signature-wall-logo");
  await expect(logo).toHaveCSS("opacity", "0.13");
  // The wall fills the stage below the shared brand header.
  const header = (await page.locator(".kiosk-header").boundingBox())!;
  const wall = (await page.locator(".signature-wall-surface").boundingBox())!;
  expect(wall.x).toBe(0);
  expect(wall.width).toBe(2160);
  expect(wall.y).toBeCloseTo(header.y + header.height, 0);
  expect(wall.y + wall.height).toBeCloseTo(3840, 0);
  // Actions share the Wishing Tree's reachable right-edge rail.
  const add = (await page
    .getByRole("button", { name: "Add your signature" })
    .boundingBox())!;
  expect(add.y).toBeGreaterThan(3840 * 0.15);
  expect(add.y + add.height).toBeLessThan(3840 * 0.6);
  expect(add.x + add.width).toBeGreaterThan(2160 * 0.9);
  const image = (await logo.boundingBox())!;
  expect(image.x + image.width / 2).toBeCloseTo(wall.x + wall.width / 2, 0);
  expect(image.y + image.height / 2).toBeCloseTo(wall.y + wall.height / 2, 0);

  await drawSignature(page, "Visitor_Private", true);
  const surface = page.getByLabel("Choose a spot for your signature");
  const bounds = (await surface.boundingBox())!;
  await surface.tap({
    position: { x: bounds.width * 0.64, y: bounds.height * 0.35 },
  });
  const preview = surface.locator('svg[data-preview="open"]');
  const box = (await preview.boundingBox())!;
  expect(box.width).toBeLessThan(bounds.width * 0.26);
  expect(box.x + box.width / 2).toBeCloseTo(bounds.width * 0.64, 0);
  const padding = await preview.evaluate((svg: SVGSVGElement) => {
    const frame = svg.viewBox.baseVal;
    const ink = [...svg.querySelectorAll("path")].map((path) => path.getBBox());
    return [
      Math.min(...ink.map((box) => box.x)) - frame.x,
      Math.min(...ink.map((box) => box.y)) - frame.y,
      frame.x + frame.width - Math.max(...ink.map((box) => box.x + box.width)),
      frame.y +
        frame.height -
        Math.max(...ink.map((box) => box.y + box.height)),
    ];
  });
  for (const edge of padding) expect(edge).toBeCloseTo(3.44, 1);
  await page.screenshot({
    path: "test-results/signature-wall-placement-4k.png",
  });
  const submitted = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/signatures/submissions") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Place signature", exact: true })
    .click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  const receipt = await response.json();
  expect(receipt.placement.x).toBeCloseTo(0.64, 2);
  expect(receipt.placement.y).toBeCloseTo(0.35, 2);
  expect(
    Date.parse(receipt.deadline) - Date.parse(receipt.serverTime),
  ).toBeGreaterThan(4500);
  expect(
    Date.parse(receipt.deadline) - Date.parse(receipt.serverTime),
  ).toBeLessThanOrEqual(5000);
  const landing = page.locator(`[data-landing="${receipt.id}"]`);
  await expect(landing).toBeVisible();
  await expect(landing).toHaveCount(0);
  await expect(
    page.locator(`svg[data-signature="${receipt.id}"] path`),
  ).toHaveCount(2);
  await expect(page.getByText(/^Section \d+ of \d+$/)).toHaveCount(0);
  const data = await (
    await page.request.get("/api/signatures/sections/0")
  ).json();
  const mark = data.signatures.find(
    (item: { id: string }) => item.id === receipt.id,
  );
  expect(
    mark.strokes.map((stroke: { colour: string }) => stroke.colour),
  ).toEqual(["blue", "red"]);
  expect(Object.keys(mark).sort()).toEqual([
    "id",
    "placement",
    "state",
    "strokes",
  ]);
  expect(JSON.stringify(data)).not.toContain("Visitor_Private");
  expect(JSON.stringify(data)).not.toContain(receipt.token);

  const rejected = await page.request.post("/api/signatures/search", {
    headers: { Origin: "http://unrelated.example" },
    data: { username: "Visitor_Private" },
  });
  expect(rejected.status()).toBe(403);

  await expect(page.getByRole("button", { name: /Undo ·/ })).toHaveCount(0, {
    timeout: 15000,
  });
  await page.reload();
  await page.getByRole("button", { name: "Find a signature" }).click();
  await page.getByLabel("Search by username").fill("VISITOR_PRIVATE");
  await page.getByRole("button", { name: "Find", exact: true }).click();
  await expect(page.getByLabel("Community signature wall")).toHaveAttribute(
    "data-highlight",
    receipt.id,
  );
  await expect(page.getByLabel("Search by username")).toHaveValue("");
  await expect(page.getByText("Signature found.")).toBeVisible();
  await page.screenshot({ path: "test-results/signature-wall-search-4k.png" });
});

test("an occupied spot is rejected and the selected signature can be undone after reload", async ({
  page,
}) => {
  await page.goto("/signature-wall");
  // Same fitted portrait stage as the tree; the wall fills it below the header.
  const stage = (await page.locator(".kiosk-stage").boundingBox())!;
  const header = (await page.locator(".kiosk-header").boundingBox())!;
  const surfaceBox = (await page
    .locator(".signature-wall-surface")
    .boundingBox())!;
  expect(stage.width / stage.height).toBeCloseTo(9 / 16, 2);
  expect(surfaceBox.x).toBeCloseTo(stage.x, 0);
  expect(surfaceBox.width).toBeCloseTo(stage.width, 0);
  expect(surfaceBox.y).toBeCloseTo(header.y + header.height, 0);
  expect(surfaceBox.y + surfaceBox.height).toBeCloseTo(
    stage.y + stage.height,
    0,
  );
  await expect(page.locator(".signature-experience")).toHaveAttribute(
    "data-online",
    "true",
  );
  await drawSignature(page, "Undo_Visitor");
  await page.getByLabel("Choose a spot for your signature").tap();
  const submitted = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/signatures/submissions") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Place signature", exact: true })
    .click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  const saved = await response.json();
  const duplicateSpot = await page.request.post("/api/signatures/submissions", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: response.request().postDataJSON(),
  });
  expect(duplicateSpot.status()).toBe(409);
  const adjacentSpot = await page.request.post("/api/signatures/submissions", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      ...response.request().postDataJSON(),
      placement: { ...saved.placement, y: saved.placement.y + 0.09 },
    },
  });
  expect(adjacentSpot.status()).toBe(201);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Home", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /Undo ·/ }).click();
  await expect(page.getByText("Signature removed.")).toBeVisible();
  const wall = await (
    await page.request.get(
      `/api/signatures/sections/${saved.placement.section}`,
    )
  ).json();
  expect(
    wall.signatures.some((mark: { id: string }) => mark.id === saved.id),
  ).toBe(false);
});

test("nearby signatures can share empty space inside their outlines", async ({
  page,
}) => {
  const placement = { section: 0, x: 0.27, y: 0.3 };
  const seed = await page.request.post("/api/signatures/submissions", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      username: "Nearby_Seed",
      placement,
      strokes: [
        {
          colour: "blue",
          points: [
            [0.3, 0.3],
            [0.7, 0.7],
          ],
        },
      ],
      wallAspect: 1.44,
    },
  });
  expect(seed.status()).toBe(201);
  const { id } = await seed.json();
  await page.goto("/signature-wall");
  const home = page.getByRole("button", { name: "Home", exact: true });
  await expect(home).toBeVisible();
  expect((await home.boundingBox())!.y).toBeLessThan(30);
  await expect(page.locator(`svg[data-signature="${id}"]`)).toBeVisible();
  await page.getByRole("button", { name: "Add your signature" }).click();
  const pad = (await page
    .getByLabel("Draw your signature and doodles")
    .boundingBox())!;
  await page.mouse.move(pad.x + pad.width * 0.3, pad.y + pad.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(pad.x + pad.width * 0.7, pad.y + pad.height * 0.7, {
    steps: 12,
  });
  await page.mouse.up();
  await page.getByLabel("Username", { exact: true }).fill("Nearby_Visitor");
  await page.getByRole("button", { name: "Close keyboard" }).click();
  await page.getByRole("button", { name: "Choose a spot" }).click();

  const surface = page.getByLabel("Choose a spot for your signature");
  const confirm = page.getByRole("button", {
    name: "Place signature",
    exact: true,
  });
  const box = (await surface.boundingBox())!;
  await surface.tap({
    position: { x: box.width * placement.x, y: box.height * placement.y },
  });
  await expect(confirm).toBeDisabled();
  await expect(surface.locator('[data-preview="occupied"]')).toBeVisible();
  await surface.tap({
    position: {
      x: box.width * placement.x,
      y: box.height * (placement.y + 0.026),
    },
  });
  const preview = surface.locator('[data-preview="open"]');
  const draft = (await preview.boundingBox())!;
  const existing = (await page
    .locator(`svg[data-signature="${id}"]`)
    .boundingBox())!;
  expect(draft.y).toBeLessThan(existing.y + existing.height);
  await expect(confirm).toBeEnabled();

  const submitted = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/signatures/submissions") &&
      response.request().method() === "POST",
  );
  await confirm.click();
  expect((await submitted).status()).toBe(201);
  await page.getByRole("button", { name: /Undo ·/ }).click();
  await home.click();
  await expect(page).toHaveURL(/\/$/);
});
