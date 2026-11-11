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

test("one merged palm contact immediately makes a full painted hand and preserves it through save, reload and Undo", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 2160, height: 3840 });
  await page.goto("/handprint-wall");
  const surface = page.locator(".capture-surface");
  const image = page.getByLabel("Painted hand impression preview");
  await expect(page.getByText("Loading the painted impression…")).toHaveCount(
    0,
  );
  const box = (await surface.boundingBox())!;
  const client = await context.newCDPSession(page);
  const palm = {
    id: 1,
    x: box.x + box.width * 0.5,
    y: box.y + box.height * 0.64,
    // About 9 × 11 cm on the 55-inch portrait panel: a realistic palm.
    radiusX: 140,
    radiusY: 170,
  };
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [palm],
  });
  await expect(surface).toHaveAttribute("data-contact-count", "1");
  await expect(image).toHaveAttribute("data-active", "true");
  // The reported palm size, not the slider, sets the print's scale.
  await expect(surface).toHaveAttribute("data-fit", "sized");
  // The print presses in over ~0.5s; wait until it has fully settled.
  await page.waitForTimeout(700);
  const pigment = await image.evaluate((canvas) => {
    const pixels = (canvas as HTMLCanvasElement)
      .getContext("2d")!
      .getImageData(0, 0, 768, 768).data;
    let ink = 0,
      transparent = 0,
      textured = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 30) ink++;
      if (pixels[i + 3] === 0) transparent++;
      if (pixels[i + 3] > 10 && pixels[i + 3] < 240) textured++;
    }
    return { ink, transparent, textured };
  });
  expect(pigment.ink).toBeGreaterThan(30000);
  expect(pigment.transparent).toBeGreaterThan(100000);
  expect(pigment.textured).toBeGreaterThan(1000);
  await expect(surface.locator(".capture-area,polygon")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/painted-hand-live-4k.png",
    animations: "disabled",
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(image).toHaveAttribute("data-active", "true");
  await page
    .getByRole("button", { name: "Thumb on right", exact: true })
    .click();
  await page.getByLabel("Handprint size", { exact: true }).fill("1.1");
  await page
    .getByRole("button", { name: "Use my handprint", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Make it your own." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "terracotta", exact: true }).click();
  await page.screenshot({
    path: "test-results/painted-hand-preview-4k.png",
    animations: "disabled",
  });
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/handprints/submissions") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Submit handprint", exact: true })
    .click();
  const accepted = await response;
  expect(accepted.status()).toBe(201);
  const receipt = await accepted.json();
  const sent = accepted.request().postDataJSON();
  expect(sent.source).toBe("painted-right");
  // The raw reported contact is kept as a pressed patch in stamp space.
  expect(sent.contactAreas).toHaveLength(1);
  expect(sent.pose).toBeUndefined();
  expect(sent.size).toBe(1.1);
  const wall = await (
    await page.request.get("/api/handprints/sections")
  ).json();
  expect(
    wall.sections
      .flatMap((s: any) => s.prints)
      .find((p: any) => p.id === receipt.id).source,
  ).toBe("painted-right");
  await page.reload();
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-highlight",
    receipt.id,
  );
  await page.getByRole("button", { name: /Undo ·/ }).click();
  await expect(
    page.getByRole("heading", { name: "Make it your own." }),
  ).toBeVisible();
  await client.detach();
});

test("five fingertip contacts pose the painted fingers, choose the thumb side and survive save and reload", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 2160, height: 3840 });
  await page.goto("/handprint-wall");
  await expect(page.getByText("Loading the painted impression…")).toHaveCount(
    0,
  );
  const surface = page.locator(".capture-surface");
  const box = (await surface.boundingBox())!;
  const client = await context.newCDPSession(page);
  // A right hand (thumb on the right) with a spread little finger.
  const tips = [
    [0.75, 0.66],
    [0.66, 0.34],
    [0.52, 0.26],
    [0.4, 0.33],
    [0.22, 0.45],
  ].map(([x, y], i) => ({
    id: 20 + i,
    x: box.x + box.width * x,
    y: box.y + box.height * y,
    radiusX: 28,
    radiusY: 34,
  }));
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: tips,
  });
  await expect(surface).toHaveAttribute("data-contact-count", "5");
  await expect(surface).toHaveAttribute("data-fit", "posed");
  await expect(
    page.getByRole("button", { name: "Thumb on right", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(700);
  await page.screenshot({
    path: "test-results/painted-hand-posed-4k.png",
    animations: "disabled",
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page
    .getByRole("button", { name: "Use my handprint", exact: true })
    .click();
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/handprints/submissions") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Submit handprint", exact: true })
    .click();
  const accepted = await response;
  expect(accepted.status()).toBe(201);
  const receipt = await accepted.json();
  const sent = accepted.request().postDataJSON();
  expect(sent.source).toBe("painted-right");
  expect(sent.pose.fingers).toHaveLength(5);
  expect(sent.contactAreas).toHaveLength(5);
  // The spread little finger is turned away from the artwork's rest pose.
  expect(Math.abs(sent.pose.fingers[4][0])).toBeGreaterThan(0.05);
  const wall = await (
    await page.request.get("/api/handprints/sections")
  ).json();
  const saved = wall.sections
    .flatMap((s: any) => s.prints)
    .find((p: any) => p.id === receipt.id);
  expect(saved.pose).toEqual(sent.pose);
  expect(saved.contactAreas).toEqual(sent.contactAreas);
  await page.reload();
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-highlight",
    receipt.id,
  );
  await client.detach();
});

test("lost capture, leaving the area, and focus loss clear live contacts", async ({
  page,
}) => {
  await page.goto("/handprint-wall");
  const surface = page.locator(".capture-surface");
  const box = (await surface.boundingBox())!;
  const contact = {
    pointerType: "touch",
    pointerId: 7,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
  };
  await surface.dispatchEvent("pointerdown", {
    ...contact,
    pointerType: "mouse",
  });
  await expect(surface).toHaveAttribute("data-contact-count", "0");
  for (const event of ["lostpointercapture", "pointermove", "blur"]) {
    await surface.dispatchEvent("pointerdown", contact);
    await expect(surface).toHaveAttribute("data-contact-count", "1");
    if (event === "blur")
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else await surface.dispatchEvent(event, { ...contact, clientX: box.x - 2 });
    await expect(surface).toHaveAttribute("data-contact-count", "0");
  }
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

test("the painted print stays hidden until touch and appears where the hand is placed", async ({
  page,
}) => {
  await page.goto("/handprint-wall");
  await expect(page.getByText("Loading the painted impression…")).toHaveCount(
    0,
  );
  const surface = page.locator(".capture-surface");
  const image = page.getByLabel("Painted hand impression preview");
  const inkCentre = () =>
    image.evaluate((canvas) => {
      const data = (canvas as HTMLCanvasElement)
        .getContext("2d")!
        .getImageData(0, 0, 768, 768).data;
      let n = 0,
        sx = 0,
        sy = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i + 3] > 30) {
          const p = i / 4;
          sx += p % 768;
          sy += Math.floor(p / 768);
          n++;
        }
      return n ? { n, x: sx / n / 768, y: sy / n / 768 } : { n, x: 0, y: 0 };
    });
  expect((await inkCentre()).n).toBe(0);
  const box = (await surface.boundingBox())!;
  const point = {
    pointerType: "touch",
    pointerId: 52,
    clientX: box.x + box.width * 0.3,
    clientY: box.y + box.height * 0.75,
    width: 1,
    height: 1,
  };
  await surface.dispatchEvent("pointerdown", point);
  await expect(image).toHaveAttribute("data-active", "true");
  await page.waitForTimeout(700);
  const placed = await inkCentre();
  expect(placed.n).toBeGreaterThan(10000);
  expect(placed.x).toBeLessThan(0.42);
  expect(placed.y).toBeGreaterThan(0.5);
  await surface.dispatchEvent("pointercancel", point);
  await expect.poll(async () => (await inkCentre()).n).toBe(0);
});

test("painted capture also works when the controller supplies no contact sizes", async ({
  page,
}) => {
  await page.goto("/handprint-wall");
  const surface = page.locator(".capture-surface");
  const box = (await surface.boundingBox())!;
  const point = {
    pointerType: "touch",
    pointerId: 41,
    clientX: box.x + box.width * 0.5,
    clientY: box.y + box.height * 0.6,
    width: 1,
    height: 1,
  };
  await surface.dispatchEvent("pointerdown", point);
  await expect(
    page.getByLabel("Painted hand impression preview"),
  ).toHaveAttribute("data-active", "true");
  await expect(
    page.getByRole("button", { name: "Use my handprint", exact: true }),
  ).toBeEnabled();
  await surface.dispatchEvent("pointercancel", point);
  await expect(
    page.getByLabel("Painted hand impression preview"),
  ).toHaveAttribute("data-active", "false");
  await expect(
    page.getByRole("button", { name: "Use my handprint", exact: true }),
  ).toBeDisabled();
});

test("a resting palm stays idle while a second finger traces a personal outline live", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 3840 });
  await page.goto("/handprint-wall");
  await page
    .getByRole("button", { name: "Trace my outline", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Use my traced outline", exact: true }),
  ).toBeInViewport();
  const surface = page.locator(".capture-surface");
  const box = (await surface.boundingBox())!;
  const send = (event: string, id: number, x: number, y: number) =>
    surface.dispatchEvent(event, {
      pointerType: "touch",
      pointerId: id,
      clientX: box.x + x * box.width,
      clientY: box.y + y * box.height,
    });
  await send("pointerdown", 91, 0.5, 0.6);
  await expect(surface).toHaveAttribute("data-contact-count", "1");
  await expect(surface.locator(".capture-stroke")).toHaveCount(0);
  const path = outline().map(([x, y]) => [0.18 + x * 0.65, 0.18 + y * 0.65]);
  await send("pointerdown", 92, path[0][0], path[0][1]);
  for (const [x, y] of [...path.slice(1), path[0]])
    await send("pointermove", 92, x, y);
  await expect(surface.locator(".capture-stroke")).toBeVisible();
  // The stroke renders on the next animation frame; wait for the closed loop.
  await expect
    .poll(async () => {
      const pts = (
        (await surface.locator(".capture-stroke").getAttribute("points")) ?? ""
      ).split(" ");
      return pts.length > 2 && pts[0] === pts.at(-1);
    })
    .toBe(true);
  // Small palm jitter must not enter the other finger's stroke.
  const before = await surface
    .locator(".capture-stroke")
    .getAttribute("points");
  await send("pointermove", 91, 0.502, 0.6);
  await expect(surface.locator(".capture-stroke")).toHaveAttribute(
    "points",
    before!,
  );
  await send("pointerup", 92, path[0][0], path[0][1]);
  await expect(
    page.getByRole("button", { name: "Use my traced outline", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/handprint-manual-flat-4k.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Use my traced outline", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Make it your own." }),
  ).toBeVisible();
});

test("a cancelled manual trace is discarded and cannot be accepted", async ({
  page,
}) => {
  await page.goto("/handprint-wall");
  await page
    .getByRole("button", { name: "Trace my outline", exact: true })
    .click();
  const surface = page.locator(".capture-surface");
  const box = (await surface.boundingBox())!;
  const contact = {
    pointerType: "touch",
    pointerId: 71,
    clientX: box.x + box.width * 0.4,
    clientY: box.y + box.height * 0.6,
  };
  await surface.dispatchEvent("pointerdown", contact);
  await surface.dispatchEvent("pointermove", {
    ...contact,
    clientX: box.x + box.width * 0.5,
    clientY: box.y + box.height * 0.3,
  });
  await expect(surface.locator(".capture-stroke")).toBeVisible();
  await surface.dispatchEvent("pointercancel", contact);
  await expect(surface.locator(".capture-stroke")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Use my traced outline", exact: true }),
  ).toBeDisabled();
});
