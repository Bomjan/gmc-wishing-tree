import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leafArrival,
  LEAF_ARRIVAL_SECONDS,
} from "../src/experiences/wishing-tree/graphics/leafArrival";
import {
  terrainHeight,
  leafGeometry,
  woodTube,
} from "../src/experiences/wishing-tree/graphics/nature";
import { leafPoint, treeScale, activeTree } from "../src/shared";
import * as THREE from "three";
test("arrival starts folded, visibly approaches and finishes exactly on its logical slot", () => {
  const begin = leafArrival(0),
    middle = leafArrival(LEAF_ARRIVAL_SECONDS * 0.5),
    end = leafArrival(LEAF_ARRIVAL_SECONDS);
  assert(begin.width < 0.1 && begin.scale < 0.05 && begin.y > 1);
  assert(middle.width > begin.width && middle.scale > begin.scale);
  assert(middle.y < begin.y);
  assert.deepEqual([end.x, end.y, end.z, end.turn], [0, 0, 0, 0]);
  assert.equal(end.width, 1);
  assert.equal(end.scale, 1);
  assert.equal(end.warmth, 0);
  assert.deepEqual(leafArrival(999), end);
  assert.deepEqual(leafArrival(0, true), end);
});
test("all 108 slots have distinct deterministic positions inside the natural crown", () => {
  const first = Array.from({ length: 108 }, (_, i) => leafPoint(i, 412));
  assert.equal(new Set(first.map((p) => JSON.stringify(p))).size, 108);
  assert.deepEqual(
    first,
    Array.from({ length: 108 }, (_, i) => leafPoint(i, 412)),
  );
  for (const p of first) {
    assert(p.every(Number.isFinite));
    assert(Math.hypot(p[0], p[2]) < 3);
    assert(p[1] > 3 && p[1] < 6);
  }
});
test("terrain and tree root height remain finite and deterministic across the mountain", () => {
  for (let x = -160; x <= 160; x += 16)
    for (let z = -260; z <= 80; z += 17) {
      assert(Number.isFinite(terrainHeight(x, z)));
      assert.equal(terrainHeight(x, z), terrainHeight(x, z));
    }
  assert(terrainHeight(0, -170) > terrainHeight(0, 0) + 5);
});
test("leaf and tapered wood geometry have finite attributes and normals", () => {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.1, 2, 0),
    new THREE.Vector3(0.05, 4, 0.1),
  ]);
  for (const g of [
    leafGeometry(),
    leafGeometry(false),
    woodTube(curve, 0.27),
  ]) {
    assert(Array.from(g.attributes.position.array).every(Number.isFinite));
    assert(Array.from(g.attributes.normal.array).every(Number.isFinite));
    g.dispose();
  }
});

test("tree size increases with every occupied slot, from a small sapling to 108-leaf maturity", () => {
  for (let n = 1; n <= 108; n++) assert(treeScale(n) > treeScale(n - 1));
  assert(treeScale(4) < treeScale(108) / 3);
  assert.equal(treeScale(108), 1);
  assert.equal(treeScale(-1), treeScale(0));
  assert.equal(treeScale(109), treeScale(108));
  assert.equal(treeScale(NaN), treeScale(0));
});
test("tree focus and count resolve to the same tree with a safe current-tree fallback", () => {
  const trees = [
    {
      id: "full",
      seed: 1,
      x: 0,
      z: 0,
      leaves: Array.from({ length: 108 }, (_, slot) => ({
        slot,
        state: "finalised" as const,
      })),
    },
    {
      id: "new",
      seed: 2,
      x: 10,
      z: 0,
      leaves: [{ slot: 0, state: "finalised" as const }],
    },
  ];
  assert.equal(activeTree(trees)?.id, "new");
  assert.equal(activeTree(trees, "full")?.leaves.length, 108);
  assert.equal(activeTree(trees, "missing")?.id, "new");
  assert.equal(activeTree([]), undefined);
});
