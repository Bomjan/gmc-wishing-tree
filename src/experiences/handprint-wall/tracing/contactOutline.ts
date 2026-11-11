import type { OutlinePoint } from "../../../shared/handprints";

/** Ephemeral controller data, in capture-surface coordinates; never submitted. */
export type HandContact = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/** Estimate an upright hand. Gaps and the wrist are inferred, not measured skin contours. */
export function fitContactHand(contacts: readonly HandContact[]): {
  live: OutlinePoint[];
  outline: OutlinePoint[];
} | null {
  if (
    contacts.length < 5 ||
    contacts.length > 16 ||
    contacts.some((p) =>
      [p.x, p.y, p.width, p.height].some((value) => !Number.isFinite(value)),
    )
  )
    return null;
  const across = [...contacts].sort((a, b) => a.x - b.x);
  const thumb = across[0].y > across.at(-1)!.y ? across[0] : across.at(-1)!;
  const mirrored = thumb === across.at(-1);
  const fingers = contacts
    .filter((p) => p.id !== thumb.id)
    .sort((a, b) => a.y - b.y)
    .slice(0, 4)
    .sort((a, b) => (mirrored ? b.x - a.x : a.x - b.x));
  const tips = [thumb, ...fingers];
  const spread = Math.abs(tips[4].x - thumb.x);
  const top = Math.min(...tips.map((p) => p.y));
  const rise = thumb.y - top;
  const direction = mirrored ? -1 : 1;
  if (
    spread < 0.075 ||
    rise < spread * 0.28 ||
    rise > spread * 1.5 ||
    thumb.y - Math.max(...fingers.map((p) => p.y)) < rise * 0.1 ||
    fingers.some((p, i) => (p.x - tips[i].x) * direction < spread * 0.08)
  )
    return null;
  const remaining = contacts.filter((p) => !tips.includes(p));
  const fingerBottom = Math.max(...fingers.map((p) => p.y));
  // Extra contacts must sit in the palm region, rather than a second hand.
  if (remaining.some((p) => p.y < fingerBottom)) return null;

  const local = tips.map((p) => ({ ...p, x: mirrored ? 1 - p.x : p.x }));
  const palmX = (local[1].x + local[4].x) / 2;
  const palmY = Math.max(fingerBottom + spread * 0.32, thumb.y - spread * 0.08);
  const wristY = Math.max(
    palmY + spread * 0.4,
    ...remaining.map((p) => p.y + p.height / 2 + spread * 0.1),
  );
  if (remaining.some((p) => p.y > palmY + spread * 0.6)) return null;
  const live: OutlinePoint[] = [];
  for (const [i, tip] of local.entries()) {
    const baseX =
      i === 0 ? palmX - spread * 0.2 : tip.x + (palmX - tip.x) * 0.12;
    const baseY = palmY + (i === 0 ? spread * 0.12 : 0);
    const length = Math.hypot(tip.x - baseX, tip.y - baseY);
    const dx = (tip.x - baseX) / length;
    const dy = (tip.y - baseY) / length;
    const radiusX = clamp(tip.width / 2, spread * 0.045, spread * 0.09);
    const radiusY = clamp(tip.height / 2, spread * 0.045, spread * 0.09);
    const baseRadius = spread * (i === 0 ? 0.075 : 0.06);
    live.push([baseX + dy * baseRadius, baseY - dx * baseRadius]);
    // Contact-sized cap centred on each actual fingertip coordinate.
    for (let step = 0; step <= 8; step++) {
      const angle = (step / 8) * Math.PI;
      live.push([
        tip.x + (dy * Math.cos(angle) + dx * Math.sin(angle)) * radiusX,
        tip.y + (-dx * Math.cos(angle) + dy * Math.sin(angle)) * radiusY,
      ]);
    }
    live.push([baseX - dy * baseRadius, baseY + dx * baseRadius]);
  }
  live.push([palmX + spread * 0.25, wristY], [palmX - spread * 0.25, wristY]);
  if (mirrored)
    for (let i = 0; i < live.length; i++)
      live[i] = [1 - live[i][0], live[i][1]];
  if (live.some(([x, y]) => x < 0 || x > 1 || y < 0 || y > 1)) return null;
  const minX = Math.min(...live.map(([x]) => x));
  const minY = Math.min(...live.map(([, y]) => y));
  const maxX = Math.max(...live.map(([x]) => x));
  const maxY = Math.max(...live.map(([, y]) => y));
  const extent = Math.max(maxX - minX, maxY - minY);
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  return {
    live,
    outline: live.map(([x, y]) => [
      0.5 + ((x - centreX) / extent) * 0.9,
      0.5 + ((y - centreY) / extent) * 0.9,
    ]),
  };
}

/** Compare against the start of the hold, so slow drift also restarts it. */
export function contactsAreSteady(
  current: readonly HandContact[],
  anchor: readonly HandContact[],
) {
  return (
    current.length === anchor.length &&
    current.every((p) => {
      const before = anchor.find((a) => a.id === p.id);
      return (
        before &&
        Math.hypot(p.x - before.x, p.y - before.y) <= 0.008 &&
        Math.abs(p.width - before.width) <= 0.008 &&
        Math.abs(p.height - before.height) <= 0.008
      );
    })
  );
}
