import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Store } from "../server/store.js";
import { PublicError } from "../server/moderation.js";
import {
  leafPoint,
  forestBounds,
  treeScale,
  near,
  type ForestEvent,
} from "../src/shared.js";
const schema = `test_${randomUUID().replaceAll("-", "")}`;
const admin = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
});
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
  options: `-c search_path=${schema}`,
  max: 16,
});
const events: ForestEvent[] = [];
const secret = "test-secret-test-secret-test-secret",
  encryption = Buffer.alloc(32, 7);
let store: Store;
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query(await readFile("db/migrations/001_forest.sql", "utf8"));
});
after(async () => {
  await pool.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});
beforeEach(async () => {
  await pool.query(
    "TRUNCATE leaf_slots,submissions,trees RESTART IDENTITY CASCADE",
  );
  events.length = 0;
  store = new Store(
    pool,
    async () => {},
    (e) => events.push(e),
    secret,
    encryption,
  );
});
const submit = (name: string, key = randomUUID()) =>
  store.submit(name, "May everyone find peace.", key);
test("same normalised username wins only once concurrently", async () => {
  const results = await Promise.allSettled([
    submit("Sunrise"),
    submit("SUNRISE"),
    submit("sunrise"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await store.forest()).trees[0].leaves.length, 1);
});
test("120 concurrent submissions respect 108 stable unique slots", async () => {
  await Promise.all(
    Array.from({ length: 120 }, (_, i) => submit(`visitor_${i}`)),
  );
  const forest = await store.forest();
  assert.deepEqual(
    forest.trees.map((t) => t.leaves.length),
    [108, 12],
  );
  for (const tree of forest.trees)
    assert.equal(
      new Set(tree.leaves.map((l) => l.slot)).size,
      tree.leaves.length,
    );
});
test("duplicate retries return the same receipt, token and slot", async () => {
  const key = randomUUID();
  const receipts = await Promise.all(
    Array.from({ length: 8 }, () => submit("retry_user", key)),
  );
  assert.equal(new Set(receipts.map((r) => r.id)).size, 1);
  assert.equal(new Set(receipts.map((r) => r.token)).size, 1);
  assert.equal((await store.forest()).trees[0].leaves.length, 1);
  await assert.rejects(
    () => store.submit("retry_user", "A different wish", key),
    PublicError,
  );
});
test("Undo releases username and slot; empty provisional tree is removed", async () => {
  const r = await submit("undone_user");
  await store.undo(r.id, r.token);
  assert.equal((await store.forest()).trees.length, 0);
  await submit("UNDONE_USER");
  assert.equal((await store.forest()).trees.length, 1);
  assert(events.some((e) => e.type === "tree_removed"));
});
test("cancelled holes are reused before creating another tree", async () => {
  const receipts = await Promise.all(
    Array.from({ length: 108 }, (_, i) => submit(`reuse_${i}`)),
  );
  await store.undo(receipts[30].id, receipts[30].token);
  const next = await submit("another_user");
  assert.equal(next.treeId, receipts[30].treeId);
  assert.equal(next.slot, receipts[30].slot);
});
test("Undo cannot cross the server deadline boundary", async () => {
  const r = await submit("deadline_user");
  await pool.query(
    "UPDATE submissions SET undo_deadline=clock_timestamp() WHERE id=$1",
    [r.id],
  );
  await assert.rejects(() => store.undo(r.id, r.token), PublicError);
  assert.equal((await store.status(r.id, r.token)).state, "finalised");
});
test("a restarted service finalises persisted expired reservations", async () => {
  const r = await submit("restart_user");
  await pool.query(
    "UPDATE submissions SET undo_deadline=clock_timestamp()-interval '1 second' WHERE id=$1",
    [r.id],
  );
  const restarted = new Store(
    pool,
    async () => {},
    () => {},
    secret,
    encryption,
  );
  await restarted.sweep();
  assert.equal((await restarted.status(r.id, r.token)).state, "finalised");
  assert.equal(
    (
      await pool.query("SELECT wish_ciphertext FROM submissions WHERE id=$1", [
        r.id,
      ])
    ).rows[0].wish_ciphertext,
    null,
  );
});
test("username alone and incorrect tokens cannot authorise Undo", async () => {
  const r = await submit("token_user");
  await assert.rejects(() => store.undo(r.id, "token_user"), PublicError);
  await assert.rejects(() => store.status(r.id, "wrong"), PublicError);
  assert.equal((await store.status(r.id, r.token)).state, "pending");
});
test("lost response can be recovered with the opaque retry key", async () => {
  const key = randomUUID(),
    r = await submit("recover_user", key);
  assert.equal((await store.recover(key)).token, r.token);
  await assert.rejects(() => store.recover(randomUUID()), PublicError);
});
test("search across trees uses exact match before conservative fuzzy matches", async () => {
  await Promise.all(
    Array.from({ length: 108 }, (_, i) => submit(`forest_${i}`)),
  );
  await submit("forest_108");
  const exact = await store.locate(" FOREST_108 ");
  await submit("singular_leaf");
  const fuzzy = await store.locate("singular_leax");
  assert.equal(exact.treeId, (await store.forest()).trees[1].id);
  assert.deepEqual(fuzzy, await store.locate("singular_leaf"));
  await submit("short");
  await assert.rejects(() => store.locate("shorx"), PublicError);
});
test("ambiguous fuzzy matching never returns a username list", async () => {
  await submit("mountain_home");
  await submit("mountain_hope");
  await assert.rejects(
    () => store.locate("mountain_hore"),
    (e: unknown) => e instanceof PublicError && e.status === 409,
  );
});
test("public forest, locator, receipts and events contain no private fields", async () => {
  const r = await submit("private_user");
  const snapshot = JSON.stringify([
    await store.forest(),
    await store.locate("private_user"),
    r,
    events,
  ]);
  assert(!snapshot.includes("private_user"));
  assert(!snapshot.includes("May everyone"));
  assert(!snapshot.includes("wish_ciphertext"));
  const raw = (
    await pool.query("SELECT wish_ciphertext FROM submissions WHERE id=$1", [
      r.id,
    ])
  ).rows[0].wish_ciphertext;
  assert(raw && !raw.includes("May everyone"));
});
test("authoritative reconnect snapshot repairs missed cancellation and finalisation", async () => {
  const a = await submit("reconnect_a"),
    b = await submit("reconnect_b");
  const old = await store.forest();
  await store.undo(a.id, a.token);
  await pool.query(
    "UPDATE submissions SET undo_deadline=clock_timestamp() WHERE id=$1",
    [b.id],
  );
  const reconnected = await store.forest();
  assert.equal(old.trees[0].leaves.length, 2);
  assert.deepEqual(reconnected.trees[0].leaves, [
    { slot: b.slot, state: "finalised" },
  ]);
});
test("positions and procedural seeds survive service reload", async () => {
  await submit("stable_tree");
  const original = (await store.forest()).trees[0];
  const restarted = new Store(
    pool,
    async () => {},
    () => {},
    secret,
    encryption,
  );
  const reload = (await restarted.forest()).trees[0];
  assert.deepEqual(original, reload);
  assert.deepEqual(
    leafPoint(original.leaves[0].slot, original.seed),
    leafPoint(reload.leaves[0].slot, reload.seed),
  );
});
test("moderation rejection and outage never allocate leaves", async () => {
  for (const status of [422, 503]) {
    const unavailable = new Store(
      pool,
      async () => {
        throw new PublicError(status, "Please retry.");
      },
      () => {},
      secret,
      encryption,
    );
    await assert.rejects(
      () => unavailable.submit("moderated", "Private wish", randomUUID()),
      PublicError,
    );
    assert.equal((await unavailable.forest()).trees.length, 0);
  }
});
test("distance matcher handles insertions, deletions and substitutions only", () => {
  assert(near("abcdef", "abcxef"));
  assert(near("abcdef", "abcde"));
  assert(near("abcdef", "abcdxef"));
  assert(!near("abcdef", "abxxef"));
});

test("saplings are smaller than mature trees and exploration contains every tree", () => {
  assert(treeScale(4) < 0.35);
  assert.equal(treeScale(108), 1);
  const trees = [{ id: "far", seed: 1, x: 420, z: -315, leaves: [] }];
  assert(forestBounds(trees) > 440);
});
