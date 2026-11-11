import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fitContactHand,
  contactsAreSteady,
  type HandContact,
} from "../src/experiences/handprint-wall/tracing/contactOutline.js";
import { validate } from "../server/handprints/geometry.js";

const fingers = (): HandContact[] =>
  [
    [0.32, 0.51],
    [0.39, 0.37],
    [0.46, 0.32],
    [0.53, 0.34],
    [0.6, 0.4],
  ].map(([x, y], id) => ({ id, x, y, width: 0.03, height: 0.035 }));

test("live fitting follows real contact locations and preserves either hand through server validation", () => {
  for (const contacts of [
    fingers(),
    fingers().map((p) => ({ ...p, x: 1 - p.x })),
  ]) {
    const result = fitContactHand(contacts);
    assert.ok(result);
    assert.doesNotThrow(() =>
      validate({
        outline: result.outline,
        source: "trace",
        colour: "teal",
        size: 1,
      }),
    );
    // Each cap stays centred around its corresponding contact, rather than a
    // template elsewhere on the screen. Its middle sample points outwards.
    for (const [i, p] of contacts.entries()) {
      const cap = result.live.slice(i * 11 + 1, i * 11 + 10);
      assert.ok(cap.every(([x, y]) => Math.hypot(x - p.x, y - p.y) < 0.04));
    }
    const moved = fitContactHand(
      contacts.map((p) => ({ ...p, x: p.x + 0.04, y: p.y + 0.02 })),
    )!;
    result.live.forEach(([x, y], i) => {
      assert.ok(Math.abs(moved.live[i][0] - x - 0.04) < 1e-10);
      assert.ok(Math.abs(moved.live[i][1] - y - 0.02) < 1e-10);
    });
  }
});

test("extra palm contacts and contact size affect the live contour without invalidating the print", () => {
  const contacts = [
    ...fingers(),
    { id: 8, x: 0.47, y: 0.54, width: 0.07, height: 0.06 },
  ];
  const result = fitContactHand(contacts);
  assert.ok(result);
  assert.doesNotThrow(() =>
    validate({
      outline: result.outline,
      source: "trace",
      colour: "teal",
      size: 1,
    }),
  );
  const enlarged = fitContactHand(
    fingers().map((p) => ({ ...p, width: 0.05, height: 0.05 })),
  );
  assert.notDeepEqual(enlarged?.live, fitContactHand(fingers())?.live);
  assert.equal(
    fitContactHand([...fingers(), { ...contacts[5], y: 0.2 }]),
    null,
  );
});

test("incomplete, flat, coincident, non-finite and edge-clipped hands are not captured", () => {
  assert.equal(fitContactHand(fingers().slice(0, 4)), null);
  assert.equal(fitContactHand(fingers().map((p) => ({ ...p, y: 0.5 }))), null);
  assert.equal(fitContactHand(fingers().map((p) => ({ ...p, x: 0.5 }))), null);
  assert.equal(
    fitContactHand(fingers().map((p) => ({ ...p, y: p.y - 0.32 }))),
    null,
  );
  assert.equal(
    fitContactHand([{ ...fingers()[0], width: NaN }, ...fingers().slice(1)]),
    null,
  );
});

test("steady hold tolerates jitter but restarts on drift, size changes and replaced touch IDs", () => {
  const anchor = fingers();
  assert.ok(
    contactsAreSteady(
      anchor.map((p) => ({ ...p, x: p.x + 0.002 })),
      anchor,
    ),
  );
  assert.ok(
    !contactsAreSteady(
      anchor.map((p) => ({ ...p, x: p.x + 0.01 })),
      anchor,
    ),
  );
  assert.ok(
    !contactsAreSteady(
      anchor.map((p) => ({ ...p, width: p.width + 0.02 })),
      anchor,
    ),
  );
  assert.ok(
    !contactsAreSteady(
      anchor.map((p) => ({ ...p, id: p.id + 10 })),
      anchor,
    ),
  );
  assert.ok(!contactsAreSteady(anchor.slice(1), anchor));
});
