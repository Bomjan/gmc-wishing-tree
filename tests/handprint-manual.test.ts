import { test } from "node:test";
import assert from "node:assert/strict";
import { finishManualOutline } from "../src/experiences/handprint-wall/tracing/manualOutline.js";
import { outline } from "../src/experiences/handprint-wall/paint.js";
import { validate } from "../server/handprints/geometry.js";
import type { OutlinePoint } from "../src/shared/handprints.js";

const shape = outline().map(([x, y]): OutlinePoint => [
  0.1 + x * 0.7,
  0.1 + y * 0.7,
]);
const closed = [...shape, shape[0]];
test("a manually traced hand keeps its proportions and passes server geometry validation", () => {
  const result = finishManualOutline(closed);
  assert.ok(result);
  assert.doesNotThrow(() =>
    validate({ outline: result, source: "trace", colour: "teal", size: 1 }),
  );
  const moved = finishManualOutline(
    closed.map(([x, y]) => [x + 0.05, y + 0.05]),
  );
  result.forEach(([x, y], i) => {
    assert.ok(Math.abs(x - moved![i][0]) < 1e-10);
    assert.ok(Math.abs(y - moved![i][1]) < 1e-10);
  });
});
test("an open, tiny, non-finite or nearly straight drawing cannot become a print", () => {
  assert.equal(finishManualOutline(shape.slice(0, 20)), null);
  assert.equal(
    finishManualOutline(closed.map(([x, y]) => [x * 0.01, y * 0.01])),
    null,
  );
  assert.equal(finishManualOutline(closed.map(([x]) => [x, 0.5])), null);
  assert.equal(finishManualOutline([[NaN, 0.5], ...closed]), null);
  assert.equal(finishManualOutline([]), null);
});
test("a long drawing is resampled into the bounded server contract", () => {
  const many: OutlinePoint[] = [];
  closed.slice(1).forEach((b, i) => {
    const a = closed[i];
    for (let j = 0; j < 100; j++)
      many.push([
        a[0] + ((b[0] - a[0]) * j) / 100,
        a[1] + ((b[1] - a[1]) * j) / 100,
      ]);
  });
  many.push(many[0]);
  const result = finishManualOutline(many);
  assert.ok(result && result.length <= 256);
  assert.doesNotThrow(() =>
    validate({ outline: result, source: "trace", colour: "teal", size: 1 }),
  );
});
