export const LEAF_ARRIVAL_SECONDS = 3.2;
const smooth = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
/** Same contribution instance throughout: approach, unfurl, then settle on its slot. */
export function leafArrival(seconds: number, reducedMotion = false) {
  const t = reducedMotion
    ? 1
    : Math.max(0, Math.min(1, seconds / LEAF_ARRIVAL_SECONDS));
  const approach = smooth(t / 0.7),
    unfurl = smooth((t - 0.12) / 0.68),
    settle =
      t === 1
        ? 0
        : Math.sin((t - 0.6) * Math.PI * 3) *
          Math.max(0, t - 0.6) *
          (1 - t) *
          0.8;
  return {
    progress: t,
    x: (1 - approach) * 1.25,
    y: (1 - approach) * 1.7 + settle,
    z: (1 - approach) * 0.65,
    scale: 0.035 + 0.965 * smooth(t / 0.85),
    width: 0.07 + 0.93 * unfurl,
    turn: (1 - approach) * 1.3,
    warmth: 1 - smooth((t - 0.35) / 0.65),
  };
}
