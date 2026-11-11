import { test } from "node:test";
import assert from "node:assert/strict";
import { FRIENDS, friendsFor } from "../src/shared.js";

test("friends arrive in the story's order of age as the tree grows", () => {
  assert.deepEqual(FRIENDS, ["bird", "rabbit", "monkey", "elephant"]);
  const at = (n: number) => friendsFor(n, null);
  assert.equal(at(0), 0);
  assert.equal(at(1), 1);
  assert.equal(at(26), 1);
  assert.equal(at(27), 2);
  assert.equal(at(53), 2);
  assert.equal(at(54), 3);
  assert.equal(at(80), 3);
  assert.equal(at(81), 4);
  assert.equal(at(108), 4);
});

test("in the demo one friend arrives per wish after the starting leaves", () => {
  assert.equal(friendsFor(24, 24), 0);
  assert.equal(friendsFor(25, 24), 1);
  assert.equal(friendsFor(27, 24), 3);
  assert.equal(friendsFor(40, 24), 4);
  assert.equal(friendsFor(20, 24), 0);
});
