import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "../server/handprints/geometry.js";
import { moderateImage } from "../server/handprints/moderation.js";
import {
  fitPaintedHand,
  paintedHandOutline,
  PAINTED_HAND_FINGERS,
  placeExtent,
  POSE_LIMITS,
  type RawContact,
} from "../src/shared/paintedHand.js";

const limits = { minSpan: 0.34, maxSpan: 0.952 };
const tip = (x: number, y: number, size = 0.04): RawContact => ({
  x,
  y,
  width: size,
  height: size,
  hasArea: size > 0,
});
/** Artwork fingertips mapped onto the surface at a given span and offset. */
const artworkHand = (span: number, ox: number, oy: number) =>
  PAINTED_HAND_FINGERS.map(({ tip: [x, y] }) =>
    tip(ox + (x - 0.5) * span, oy + (y - 0.5) * span),
  );

test("five fingertip contacts in the artwork's layout reproduce it unposed", () => {
  const fit = fitPaintedHand(artworkHand(0.6, 0.5, 0.5), limits);
  assert.equal(fit?.kind, "posed");
  if (fit?.kind !== "posed") return;
  assert.equal(fit.source, "painted-left");
  assert.ok(Math.abs(fit.span - 0.6) < 1e-6);
  assert.ok(Math.abs(fit.x - 0.5) < 1e-6 && Math.abs(fit.y - 0.5) < 1e-6);
  assert.ok(Math.abs(fit.rotation) < 1e-6);
  for (const [turn, length] of fit.pose!.fingers) {
    assert.ok(Math.abs(turn) < 1e-3);
    assert.ok(Math.abs(length - 1) < 1e-3);
  }
  // Every sized fingertip becomes a pressed patch inside the stamp.
  assert.equal(fit.contactAreas.length, 5);
});

test("a mirrored hand is fitted with the thumb on the right", () => {
  const hand = artworkHand(0.6, 0.5, 0.5).map((p) => ({ ...p, x: 1 - p.x }));
  const fit = fitPaintedHand(hand, limits);
  assert.equal(fit?.kind, "posed");
  if (fit?.kind === "posed") assert.equal(fit.source, "painted-right");
});

test("a spread finger bends that finger only, within pose limits", () => {
  const hand = artworkHand(0.6, 0.5, 0.5);
  hand[4] = { ...hand[4], x: hand[4].x + 0.09, y: hand[4].y + 0.03 };
  const fit = fitPaintedHand(hand, limits);
  assert.equal(fit?.kind, "posed");
  if (fit?.kind !== "posed") return;
  const [turn] = fit.pose!.fingers[4];
  assert.ok(Math.abs(turn) > 0.1, `little finger turned ${turn}`);
  for (const [t, l] of fit.pose!.fingers) {
    assert.ok(Math.abs(t) <= POSE_LIMITS.rotation);
    assert.ok(l >= POSE_LIMITS.minLength && l <= POSE_LIMITS.maxLength);
  }
});

test("a single merged hand area sets size and placement from its extent", () => {
  const merged: RawContact = {
    x: 0.4,
    y: 0.55,
    width: 0.32,
    height: 0.4,
    hasArea: true,
  };
  const fit = fitPaintedHand([merged], limits);
  assert.equal(fit?.kind, "extent");
  if (fit?.kind !== "extent") return;
  assert.ok(fit.span && fit.span > 0.4 && fit.span < 0.5, `${fit.span}`);
  const placed = placeExtent(fit, "painted-left", fit.span!);
  assert.equal(placed.contactAreas.length, 1);
  const [area] = placed.contactAreas;
  assert.ok(area.x - area.width / 2 >= 0 && area.x + area.width / 2 <= 1);
});

test("contacts without reported sizes only position the print", () => {
  const fit = fitPaintedHand([tip(0.5, 0.6, 0)], limits);
  assert.equal(fit?.kind, "extent");
  if (fit?.kind === "extent") {
    assert.equal(fit.span, null);
    assert.equal(placeExtent(fit, "painted-left", 0.6).contactAreas.length, 0);
  }
});

test("the server accepts a bounded pose and contact patches on painted prints only", () => {
  const fit = fitPaintedHand(artworkHand(0.6, 0.5, 0.5), limits);
  assert.equal(fit?.kind, "posed");
  if (fit?.kind !== "posed") return;
  const body = {
    outline: paintedHandOutline("painted-left"),
    source: "painted-left",
    colour: "teal",
    size: 0.9,
    pose: fit.pose,
    contactAreas: fit.contactAreas,
  };
  const parsed = validate(body);
  assert.deepEqual(parsed.pose, fit.pose);
  assert.deepEqual(parsed.contactAreas, fit.contactAreas);
  assert.throws(() =>
    validate({
      ...body,
      pose: { fingers: [[1, 1], ...fit.pose!.fingers.slice(1)] },
    }),
  );
  assert.throws(() =>
    validate({ ...body, pose: { fingers: fit.pose!.fingers.slice(1) } }),
  );
  assert.throws(() =>
    validate({ ...body, source: "trace", contactAreas: undefined }),
  );
});

test("painted prints with contact patches are still moderated as the fixed artwork", async () => {
  const beforeKey = process.env.AI_API_KEY;
  const beforeFetch = globalThis.fetch;
  let prompt = "";
  try {
    process.env.AI_API_KEY = "local-test-placeholder";
    globalThis.fetch = async (_url, options) => {
      prompt = JSON.parse(options!.body as string).messages[0].content;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"accepted":true}' } }],
        }),
        { status: 200 },
      );
    };
    await moderateImage(
      paintedHandOutline("painted-left"),
      false,
      undefined,
      [{ x: 0.5, y: 0.5, width: 0.1, height: 0.1 }],
      "painted-left",
    );
    assert.ok(!prompt.includes("contact print"));
  } finally {
    globalThis.fetch = beforeFetch;
    if (beforeKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = beforeKey;
  }
});
