import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import {
  contactAreaOutline,
  contactMark,
  MAX_CONTACT_MARK_DIAMETER,
  normaliseContactAreas,
} from "../src/shared/contactAreas.js";
import { raster } from "../server/handprints/moderation.js";
import { validate } from "../server/handprints/geometry.js";
const areas = [
  { x: 0.25, y: 0.4, width: 0.1, height: 0.15 },
  { x: 0.75, y: 0.4, width: 0.12, height: 0.16 },
];
const body = () => ({
  outline: contactAreaOutline(areas[0]),
  contactAreas: areas,
  source: "contact",
  colour: "teal",
  size: 1,
});
test("contact normalisation preserves patch proportions and separation; one palm stays one patch", () => {
  const result = normaliseContactAreas(areas);
  const scale = result[0].width / areas[0].width;
  assert.ok(
    Math.abs(result[1].x - result[0].x - (areas[1].x - areas[0].x) * scale) <
      1e-10,
  );
  assert.ok(
    Math.abs(
      result[0].height / result[0].width - areas[0].height / areas[0].width,
    ) < 1e-10,
  );
  assert.equal(normaliseContactAreas([areas[0]]).length, 1);
  assert.doesNotThrow(() => validate({ ...body(), contactAreas: result }));
});
test("server validates bounded patches and canonicalises the compatibility outline", () => {
  const saved = validate(body());
  assert.deepEqual(saved.outline, contactAreaOutline(areas[0]));
  for (const contactAreas of [
    [],
    Array(17).fill(areas[0]),
    [{ ...areas[0], width: 0 }],
    [{ ...areas[0], width: NaN }],
    [{ ...areas[0], x: 0 }],
    [{ ...areas[0], id: 99 }],
  ])
    assert.throws(() => validate({ ...body(), contactAreas }));
  assert.throws(() => validate({ ...body(), contactAreas: undefined }));
  assert.throws(() => validate({ ...body(), source: "trace" }));
});
test("moderation image includes all patches while preserving the white gap between them", () => {
  const png = raster(body().outline, areas);
  let offset = 8;
  const chunks: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT")
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const pixels = inflateSync(Buffer.concat(chunks));
  const at = (x: number, y: number) =>
    pixels[Math.floor(y * 256) * 769 + 1 + Math.floor(x * 256) * 3];
  assert.equal(at(0.25, 0.4), 45);
  assert.equal(at(0.75, 0.4), 45);
  assert.equal(at(0.5, 0.4), 255);
  assert.deepEqual(png, raster(body().outline, areas));
});

test("contact marks stay small and lock their first usable size while their position moves", () => {
  const initial = contactMark({ x: 0.4, y: 0.5, width: 0.02, height: 0.03 });
  const inflated = contactMark(
    { x: 0.45, y: 0.55, width: 0.8, height: 0.9 },
    initial,
  );
  assert.equal(inflated.width, initial.width);
  assert.equal(inflated.height, initial.height);
  assert.equal(inflated.x, 0.45);
  const palm = contactMark({ x: 0.5, y: 0.5, width: 0.6, height: 0.8 });
  assert.ok(palm.width <= MAX_CONTACT_MARK_DIAMETER);
  assert.ok(palm.height <= MAX_CONTACT_MARK_DIAMETER);
  assert.ok(Math.abs(palm.width / palm.height - 0.6 / 0.8) < 1e-10);
});
test("an isolated contact is not enlarged to fill the saved print", () => {
  const single = contactMark({ x: 0.5, y: 0.5, width: 0.03, height: 0.03 });
  const saved = normaliseContactAreas([single]);
  assert.ok(saved[0].width < 0.06);
  assert.equal(saved.length, 1);
  const pair = normaliseContactAreas([single, { ...single, x: 0.65 }]);
  assert.ok(Math.abs(pair[0].width - saved[0].width) < 1e-10);
  assert.doesNotThrow(() =>
    validate({
      ...body(),
      outline: contactAreaOutline(saved[0]),
      contactAreas: saved,
    }),
  );
});
