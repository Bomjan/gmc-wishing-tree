import type { OutlinePoint } from "../../../shared/handprints";

/** Validate a visitor-drawn closed contour, retaining its proportions. */
export function finishManualOutline(
  stroke: readonly OutlinePoint[],
): OutlinePoint[] | null {
  if (
    stroke.length < 12 ||
    stroke.some((p) => p.some((v) => !Number.isFinite(v) || v < 0 || v > 1))
  )
    return null;
  const minX = Math.min(...stroke.map(([x]) => x));
  const maxX = Math.max(...stroke.map(([x]) => x));
  const minY = Math.min(...stroke.map(([, y]) => y));
  const maxY = Math.max(...stroke.map(([, y]) => y));
  const extent = Math.max(maxX - minX, maxY - minY);
  if (Math.min(maxX - minX, maxY - minY) < 0.08 || extent < 0.15) return null;
  const first = stroke[0],
    last = stroke.at(-1)!;
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) > extent * 0.18)
    return null;
  // Resample by distance to bound the request without favouring slower portions.
  const lengths = [0];
  for (let i = 1; i < stroke.length; i++)
    lengths.push(
      lengths[i - 1] +
        Math.hypot(
          stroke[i][0] - stroke[i - 1][0],
          stroke[i][1] - stroke[i - 1][1],
        ),
    );
  const total = lengths.at(-1)!;
  if (total < extent * 2) return null;
  const count = Math.min(256, stroke.length);
  const result: OutlinePoint[] = [];
  let segment = 1;
  for (let i = 0; i < count; i++) {
    const distance = (i / (count - 1)) * total;
    while (segment < lengths.length - 1 && lengths[segment] < distance)
      segment++;
    const fraction =
      (distance - lengths[segment - 1]) /
      (lengths[segment] - lengths[segment - 1] || 1);
    const a = stroke[segment - 1],
      b = stroke[segment];
    result.push([
      0.5 +
        ((a[0] + (b[0] - a[0]) * fraction - (minX + maxX) / 2) / extent) * 0.9,
      0.5 +
        ((a[1] + (b[1] - a[1]) * fraction - (minY + maxY) / 2) / extent) * 0.9,
    ]);
  }
  const area = result.reduce((sum, a, i) => {
    const b = result[(i + 1) % result.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  return Math.abs(area) / 2 >= 0.035 ? result : null;
}
