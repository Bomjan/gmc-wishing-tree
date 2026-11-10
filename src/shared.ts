export type Leaf = { slot: number; state: "pending" | "finalised" };
export type Tree = {
  id: string;
  seed: number;
  x: number;
  z: number;
  leaves: Leaf[];
};
export type Forest = { trees: Tree[]; demo: boolean; serverTime: string };
export type Locator = { treeId: string; slot: number };
export type Receipt = Locator & {
  id: string;
  token: string;
  deadline: string;
  serverTime: string;
  state: "pending" | "finalised" | "cancelled";
};
export type ForestEvent = {
  type:
    | "leaf_reserved"
    | "leaf_cancelled"
    | "leaf_finalised"
    | "tree_created"
    | "tree_removed";
  treeId: string;
  slot?: number;
};
export const ground = (x: number, z: number) =>
  -0.5 +
  Math.sin(x * 0.08) * 1.8 +
  Math.cos(z * 0.11) * 1.3 +
  Math.sin(x * 0.17 + z * 0.06) * 0.6;
export function leafPoint(
  slot: number,
  seed: number,
): [number, number, number] {
  const group = Math.floor(slot / 6),
    a = group * 2.399963 + seed * 0.01,
    r = 0.8 + Math.sqrt(group / 18) * 2.5;
  const b = slot * 2.399963,
    spread = 0.35 + (slot % 3) * 0.15;
  return [
    Math.cos(a) * r + Math.cos(b) * spread,
    3.7 + (group % 4) * 0.65 + Math.sin(b) * 0.4,
    Math.sin(a) * r * 0.8 + Math.sin(b) * spread,
  ];
}
export function treeScale(n: number) {
  return n === 0 ? 0.25 : 0.22 + 0.78 * Math.pow(n / 108, 0.62);
}
export function near(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0,
    j = 0,
    e = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++e > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return e + (a.length - i) + (b.length - j) <= 1;
}

export function forestBounds(trees: Tree[]) {
  return Math.max(
    70,
    ...trees.flatMap((t) => [Math.abs(t.x) + 24, Math.abs(t.z) + 24]),
  );
}
