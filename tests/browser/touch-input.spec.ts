import { test, expect } from "@playwright/test";

test("input check compares native touch streams without capping sizes or sending visitor data", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 2160, height: 3840 });
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/handprints")) requests.push(r.url());
  });
  await page.goto("/handprint-wall/input-check");
  await expect(
    page.getByRole("heading", { name: "Raw touch input" }),
  ).toBeVisible();
  await expect(page.getByTestId("input-platform")).not.toBeEmpty();
  const surface = page.getByLabel("Raw touch test area");
  const box = (await surface.boundingBox())!;
  const client = await context.newCDPSession(page);
  const points = [0.25, 0.35, 0.45, 0.55, 0.65].map((x, id) => ({
    id,
    x: box.x + box.width * x,
    y: box.y + box.height * 0.4,
    radiusX: 8,
    radiusY: 10,
  }));
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points,
  });
  await expect(page.getByTestId("pointer-count")).toHaveText("5");
  await expect(page.getByTestId("touch-count")).toHaveText("5");
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.getByTestId("pointer-count")).toHaveText("0");
  await page.getByRole("button", { name: "Reset input check" }).click();
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...points[0], radiusX: 80, radiusY: 100 }],
  });
  await expect(page.getByTestId("pointer-count")).toHaveText("1");
  await expect(page.getByTestId("touch-count")).toHaveText("1");
  await expect(
    page
      .getByRole("table", { name: "Raw contact sizes" })
      .getByText("160.0 × 200.0"),
  ).toHaveCount(2);
  await expect(surface.locator(".diagnostic-contact")).toHaveCSS(
    "width",
    "160px",
  );
  await page.screenshot({
    path: "test-results/touch-input-check-4k.png",
    animations: "disabled",
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await expect(page.getByTestId("pointer-count")).toHaveText("0");
  await expect(page.getByTestId("touch-count")).toHaveText("0");
  expect(requests).toEqual([]);
  await client.detach();
});
