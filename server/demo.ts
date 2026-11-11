import { randomUUID, createHash } from "node:crypto";
import type { Forest, Receipt, ForestEvent } from "../src/shared.js";
import { near } from "../src/shared.js";
import { PublicError } from "./moderation.js";
// Isolated, deterministic exhibition fixtures. Never used by production Store.
const initialWishes = Math.max(
  0,
  Math.min(108, Number(process.env.DEMO_INITIAL_WISHES ?? 24) || 0),
);
/** Leaves the demo tree starts with; animals then arrive one per new wish. */
export const demoInitialWishes = initialWishes;
export class DemoStore {
  data: Forest = {
    demo: true,
    serverTime: new Date().toISOString(),
    trees:
      initialWishes === 0
        ? []
        : [
            {
              id: "demo-current",
              seed: 412,
              x: 0,
              z: 0,
              leaves: Array.from({ length: initialWishes }, (_, slot) => ({
                slot,
                state: "finalised" as const,
              })),
            },
            {
              id: "demo-second",
              seed: 912,
              x: -13,
              z: -12,
              leaves: Array.from({ length: 108 }, (_, slot) => ({
                slot,
                state: "finalised" as const,
              })),
            },
          ],
  };
  records = new Map<
    string,
    { name: string; receipt: Receipt; key: string; fingerprint: string }
  >();
  constructor(private emit: (e: ForestEvent) => void) {
    if (initialWishes === 0) return;
    for (const [i, name] of [
      "morning_light",
      "mountain_hope",
      "mountain_home",
    ].entries())
      this.records.set(name, {
        name,
        receipt: {
          id: name,
          token: "fixture",
          treeId: i === 0 ? "demo-current" : "demo-second",
          slot: i,
          state: "finalised",
          deadline: new Date(0).toISOString(),
          serverTime: new Date().toISOString(),
        },
        key: name,
        fingerprint: "",
      });
  }
  async sweep() {
    for (const r of this.records.values())
      if (
        r.receipt.state === "pending" &&
        Date.now() >= Date.parse(r.receipt.deadline)
      ) {
        r.receipt.state = "finalised";
        const leaf = this.data.trees
          .find((t) => t.id === r.receipt.treeId)
          ?.leaves.find((l) => l.slot === r.receipt.slot);
        if (leaf) leaf.state = "finalised";
        this.emit({
          type: "leaf_finalised",
          treeId: r.receipt.treeId,
          slot: r.receipt.slot,
        });
      }
  }
  async forest() {
    await this.sweep();
    return { ...this.data, serverTime: new Date().toISOString() };
  }
  async submit(username: string, wish: string, key: string) {
    await this.sweep();
    const name = username.toLowerCase(),
      fp = createHash("sha256")
        .update(JSON.stringify([name, wish]))
        .digest("hex");
    const retry = [...this.records.values()].find((r) => r.key === key);
    if (retry) {
      if (retry.fingerprint !== fp)
        throw new PublicError(409, "This retry belongs to another wish.");
      return { ...retry.receipt, serverTime: new Date().toISOString() };
    }
    if (
      [...this.records.values()].some(
        (r) => r.name === name && r.receipt.state !== "cancelled",
      )
    )
      throw new PublicError(
        409,
        "That username has already taken root. Please choose another.",
      );
    if (/reject/i.test(wish))
      throw new PublicError(
        422,
        "Please revise your wish to keep this space welcoming for everyone.",
      );
    if (/unavailable/i.test(wish))
      throw new PublicError(
        503,
        "Moderation is temporarily unavailable. Please retry.",
      );
    let tree = this.data.trees.find((t) => t.leaves.length < 108);
    if (!tree) {
      tree = {
        id: `demo-${this.data.trees.length}`,
        seed: 413 + this.data.trees.length,
        x: this.data.trees.length * 10,
        z: -10,
        leaves: [],
      };
      this.data.trees.push(tree);
      this.emit({ type: "tree_created", treeId: tree.id });
    }
    const slot = Array.from({ length: 108 }, (_, i) => i).find(
      (i) => !tree!.leaves.some((l) => l.slot === i),
    )!;
    const receipt: Receipt = {
      id: randomUUID(),
      token: randomUUID(),
      treeId: tree.id,
      slot,
      deadline: new Date(Date.now() + 10000).toISOString(),
      serverTime: new Date().toISOString(),
      state: "pending",
    };
    tree.leaves.push({ slot, state: "pending" });
    this.records.set(receipt.id, { name, receipt, key, fingerprint: fp });
    this.emit({ type: "leaf_reserved", treeId: tree.id, slot });
    return receipt;
  }
  async recover(key: string) {
    const row = [...this.records.values()].find((r) => r.key === key);
    if (!row)
      throw new PublicError(
        404,
        "No confirmed submission yet. Please retry your wish.",
      );
    return this.status(row.receipt.id, row.receipt.token);
  }
  async status(id: string, token: string) {
    await this.sweep();
    const row = this.records.get(id);
    if (!row || row.receipt.token !== token)
      throw new PublicError(404, "Submission not found.");
    return { ...row.receipt, serverTime: new Date().toISOString() };
  }
  async undo(id: string, token: string) {
    const receipt = await this.status(id, token);
    if (receipt.state === "finalised")
      throw new PublicError(409, "The Undo window has ended.");
    const row = this.records.get(id)!;
    row.receipt.state = "cancelled";
    const tree = this.data.trees.find((t) => t.id === receipt.treeId);
    if (tree) tree.leaves = tree.leaves.filter((l) => l.slot !== receipt.slot);
    this.emit({
      type: "leaf_cancelled",
      treeId: receipt.treeId,
      slot: receipt.slot,
    });
    if (tree && !tree.leaves.length) {
      this.data.trees = this.data.trees.filter((t) => t !== tree);
      this.emit({ type: "tree_removed", treeId: tree.id });
    }
    return row.receipt;
  }
  async locate(input: string) {
    await this.sweep();
    const name = input.trim().toLowerCase(),
      all = [...this.records.values()].filter(
        (r) => r.receipt.state !== "cancelled",
      );
    let matches = all.filter((r) => r.name === name);
    if (!matches.length && name.length >= 6)
      matches = all.filter((r) => near(name, r.name));
    if (matches.length > 1)
      throw new PublicError(409, "Please check the spelling of your username.");
    if (!matches.length) throw new PublicError(404, "No matching leaf found");
    return { treeId: matches[0].receipt.treeId, slot: matches[0].receipt.slot };
  }
}
