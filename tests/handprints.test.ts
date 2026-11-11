import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "../server/handprints/geometry.js";
import { raster } from "../server/handprints/moderation.js";
import { fitHand, outline } from "../src/experiences/handprint-wall/paint.js";
const body = () => ({
  outline: outline(),
  source: "outline",
  colour: "teal",
  placement: { sectionId: "section-0", x: 4, y: 6, size: 1, rotation: 0 },
});
test("geometry rejects empty, degenerate, oversized, non-finite and out-of-bounds input", () => {
  assert.doesNotThrow(() => validate(body()));
  for (const outline of [
    [],
    Array(513).fill([0.2, 0.2]),
    Array(20).fill([0.2, 0.2]),
    [[Infinity, 0], ...body().outline],
    [[2, 0], ...body().outline],
  ])
    assert.throws(() => validate({ ...body(), outline }));
  assert.throws(() => validate({ ...body(), colour: "red" }));
  assert.throws(() =>
    validate({ ...body(), placement: { ...body().placement, size: 10 } }),
  );
});
test("moderation raster is deterministic PNG and follows supplied geometry", () => {
  const a = raster(outline());
  assert.equal(a.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.deepEqual(a, raster(outline()));
  assert.notDeepEqual(a, raster(outline(0.8)));
});
test("fitting needs five spread fingertips and accepts either hand", () => {
  const fingertips = [
    [0.32, 0.51],
    [0.39, 0.37],
    [0.46, 0.32],
    [0.53, 0.34],
    [0.6, 0.4],
  ] as const;
  assert.equal(fitHand(fingertips.slice(0, 4)), null);
  assert.equal(fitHand(fingertips.map(([x]) => [x, 0.5])), null);
  const left = fitHand([...fingertips]);
  const right = fitHand(fingertips.map(([x, y]) => [1 - x, y]));
  assert.ok(left && right);
  assert.notDeepEqual(left, right);
  assert.doesNotThrow(() => validate({ ...body(), outline: left }));
  assert.doesNotThrow(() => validate({ ...body(), outline: right }));
});
