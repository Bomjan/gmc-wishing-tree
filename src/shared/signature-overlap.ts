import {
  SIGNATURE_LIMITS,
  signatureInkBounds,
  signatureLineWidth,
  type Point,
  type PublicSignature,
} from "./signatures.js";

type Mark = Pick<PublicSignature, "placement" | "strokes">;
type Segment = readonly [Point, Point];

const { markWidth, markHeight, wallWidth, wallHeight } = SIGNATURE_LIMITS;
const curveTolerance = 0.05;
const cellSize = 12;
const strokeDistanceSquared = signatureLineWidth ** 2;

function* inkSegments(
  mark: Mark,
  offsetX: number,
  offsetY: number,
): Generator<Segment> {
  for (const { points } of mark.strokes) {
    const project = ([x, y]: Point): Point => [
      x * markWidth + offsetX,
      y * markHeight + offsetY,
    ];
    let start = project(points[0]);
    for (let i = 1; i < points.length - 1; i++) {
      const control = project(points[i]);
      const next = project(points[i + 1]);
      const end: Point = [
        (control[0] + next[0]) / 2,
        (control[1] + next[1]) / 2,
      ];
      // Flatten the same quadratics used by the SVG, to a fraction of the pen width.
      const curvature = Math.hypot(
        start[0] - 2 * control[0] + end[0],
        start[1] - 2 * control[1] + end[1],
      );
      const steps = Math.max(
        1,
        Math.ceil(Math.sqrt(curvature / (4 * curveTolerance))),
      );
      let previous = start;
      for (let j = 1; j <= steps; j++) {
        const t = j / steps;
        const u = 1 - t;
        const current: Point = [
          u * u * start[0] + 2 * u * t * control[0] + t * t * end[0],
          u * u * start[1] + 2 * u * t * control[1] + t * t * end[1],
        ];
        yield [previous, current];
        previous = current;
      }
      start = end;
    }
    yield [start, project(points[points.length - 1])];
  }
}

function* cells([[ax, ay], [bx, by]]: Segment, padding = 0) {
  const right = Math.floor((Math.max(ax, bx) + padding) / cellSize);
  const bottom = Math.floor((Math.max(ay, by) + padding) / cellSize);
  for (
    let y = Math.floor((Math.min(ay, by) - padding) / cellSize);
    y <= bottom;
    y++
  )
    for (
      let x = Math.floor((Math.min(ax, bx) - padding) / cellSize);
      x <= right;
      x++
    )
      yield `${x},${y}`;
}

function cross([ax, ay]: Point, [bx, by]: Point, [cx, cy]: Point) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function pointNearSegment([x, y]: Point, [[ax, ay], [bx, by]]: Segment) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / lengthSquared))
    : 0;
  return (
    (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 < strokeDistanceSquared
  );
}

function inkTouches(a: Segment, b: Segment) {
  return (
    (cross(...a, b[0]) * cross(...a, b[1]) < 0 &&
      cross(...b, a[0]) * cross(...b, a[1]) < 0) ||
    pointNearSegment(a[0], b) ||
    pointNearSegment(a[1], b) ||
    pointNearSegment(b[0], a) ||
    pointNearSegment(b[1], a)
  );
}

export function signatureOverlaps(
  draft: Mark,
  signatures: readonly Mark[],
  wallAspect: number,
) {
  // SVG ink scales uniformly to fit the wall. Convert placement percentages
  // into those same ink units for both portrait and desktop previews.
  const width = Math.max(wallWidth, wallHeight * wallAspect);
  const height = Math.max(wallHeight, wallWidth / wallAspect);
  const bounds = signatureInkBounds(draft.strokes);
  const grid = new Map<string, Segment[]>();

  for (const mark of signatures) {
    if (mark.placement.section !== draft.placement.section) continue;
    const other = signatureInkBounds(mark.strokes);
    const dx = (mark.placement.x - draft.placement.x) * width;
    const dy = (mark.placement.y - draft.placement.y) * height;
    if (
      Math.abs(dx) >= (bounds.width + other.width) / 2 ||
      Math.abs(dy) >= (bounds.height + other.height) / 2
    )
      continue;

    // Rectangles are only a quick rejection. Empty space inside one is available.
    if (grid.size === 0) {
      for (const segment of inkSegments(
        draft,
        -bounds.x - bounds.width / 2,
        -bounds.y - bounds.height / 2,
      )) {
        for (const key of cells(segment)) {
          const bucket = grid.get(key);
          if (bucket) bucket.push(segment);
          else grid.set(key, [segment]);
        }
      }
    }

    for (const segment of inkSegments(
      mark,
      dx - other.x - other.width / 2,
      dy - other.y - other.height / 2,
    )) {
      for (const key of cells(segment, signatureLineWidth)) {
        if (
          grid
            .get(key)
            ?.some((otherSegment) => inkTouches(segment, otherSegment))
        )
          return true;
      }
    }
  }
  return false;
}
