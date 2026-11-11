import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validate } from "../server/handprints/geometry.js";
import { moderateImage } from "../server/handprints/moderation.js";
import {
  paintedHandOutline,
  PAINTED_HAND_ASSET,
} from "../src/shared/paintedHand.js";

const body = () => ({
  outline: paintedHandOutline("painted-left"),
  source: "painted-left",
  colour: "teal",
  size: 1,
});
test("painted presets use canonical geometry and never accept a custom image", () => {
  for (const source of ["painted-left", "painted-right"] as const) {
    const parsed = validate({
      ...body(),
      source,
      outline: paintedHandOutline("painted-left").reverse(),
    });
    assert.deepEqual(parsed.outline, paintedHandOutline(source));
  }
  assert.throws(() =>
    validate({ ...body(), imageUrl: "https://example.invalid/image.png" }),
  );
  assert.throws(() => validate({ ...body(), source: "painted-anything" }));
});
test("production moderates the fixed artwork and label, and continues to fail closed", async () => {
  const beforeKey = process.env.AI_API_KEY;
  const beforeFetch = globalThis.fetch;
  try {
    delete process.env.AI_API_KEY;
    await assert.rejects(
      () =>
        moderateImage(
          body().outline,
          false,
          undefined,
          undefined,
          "painted-left",
        ),
      { status: 503 },
    );
    process.env.AI_API_KEY = "local-test-placeholder";
    const expected = await readFile(`public${PAINTED_HAND_ASSET}`);
    let request: any;
    globalThis.fetch = async (_url, options) => {
      request = JSON.parse(options!.body as string);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"accepted":true}' } }],
        }),
        { status: 200 },
      );
    };
    await moderateImage(
      body().outline,
      false,
      "Pema",
      undefined,
      "painted-right",
    );
    const image = request.messages[1].content[0].image_url.url;
    assert.deepEqual(Buffer.from(image.split(",")[1], "base64"), expected);
    assert.ok(
      request.messages[1].content.some((part: any) =>
        part.text?.includes("Pema"),
      ),
    );
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"accepted":false}' } }],
        }),
        { status: 200 },
      );
    await assert.rejects(
      () =>
        moderateImage(
          body().outline,
          false,
          undefined,
          undefined,
          "painted-left",
        ),
      { status: 422 },
    );
  } finally {
    globalThis.fetch = beforeFetch;
    if (beforeKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = beforeKey;
  }
});
