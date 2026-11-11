import type {
  ContactArea,
  OutlinePoint,
  OutlineSource,
} from "./handprints.js";

export const PAINTED_HAND_ASSET = "/handprints/painted-hand-v1.png";
export type PaintedHandSource = "painted-left" | "painted-right";
export function isPaintedHand(
  source?: OutlineSource,
): source is PaintedHandSource {
  return source === "painted-left" || source === "painted-right";
}

/** Fixed artwork envelope. The pigment/crease texture is an artistic preset. */
export function paintedHandOutline(source: PaintedHandSource): OutlinePoint[] {
  const boundary: OutlinePoint[] = [
    [0.36, 0.95],
    [0.27, 0.87],
    [0.21, 0.77],
    [0.08, 0.61],
    [0.07, 0.56],
    [0.11, 0.53],
    [0.16, 0.55],
    [0.27, 0.67],
    [0.35, 0.6],
    [0.29, 0.21],
    [0.3, 0.17],
    [0.34, 0.14],
    [0.38, 0.16],
    [0.4, 0.2],
    [0.44, 0.46],
    [0.47, 0.08],
    [0.49, 0.04],
    [0.53, 0.025],
    [0.56, 0.04],
    [0.57, 0.08],
    [0.57, 0.46],
    [0.64, 0.14],
    [0.67, 0.105],
    [0.7, 0.105],
    [0.73, 0.13],
    [0.74, 0.17],
    [0.69, 0.5],
    [0.79, 0.31],
    [0.82, 0.28],
    [0.85, 0.29],
    [0.86, 0.32],
    [0.85, 0.36],
    [0.75, 0.65],
    [0.75, 0.79],
    [0.7, 0.91],
    [0.63, 0.95],
  ];
  return boundary.map(([x, y]) => [source === "painted-right" ? 1 - x : x, y]);
}

/**
 * Per-finger bend of the painted artwork, thumb first, in the thumb-left
 * artwork frame: [rotation about the knuckle in radians, length scale].
 * Derived from reported fingertip positions; never a skin or fingerprint scan.
 */
export type HandPose = { fingers: [rotation: number, length: number][] };
export const POSE_LIMITS = { rotation: 0.4, minLength: 0.8, maxLength: 1.25 };

/** Measured landmarks of painted-hand-v1.png (thumb on the left), unit square. */
export const PAINTED_HAND_FINGERS = [
  { tip: [0.12, 0.575], base: [0.34, 0.8], halfWidth: 0.075 },
  { tip: [0.34, 0.18], base: [0.4, 0.5], halfWidth: 0.05 },
  { tip: [0.525, 0.08], base: [0.52, 0.49], halfWidth: 0.05 },
  { tip: [0.685, 0.155], base: [0.635, 0.5], halfWidth: 0.05 },
  { tip: [0.83, 0.32], base: [0.745, 0.55], halfWidth: 0.045 },
] as const;
/** Centre of the palm and the inked hand's bounding box in the artwork. */
export const PAINTED_HAND_PALM = [0.55, 0.72] as const;
export const PAINTED_HAND_BOX = {
  left: 0.08,
  right: 0.86,
  top: 0.04,
  bottom: 0.96,
} as const;

/** Raw reported contact in capture-surface units (0–1 on a square surface). */
export type RawContact = {
  x: number;
  y: number;
  width: number;
  height: number;
  hasArea: boolean;
};
/** Stamp placement fitted from five or more fingertip contacts. */
export type PaintedHandFit = {
  source: PaintedHandSource;
  /** Stamp centre, edge length and rotation on the capture surface. */
  x: number;
  y: number;
  span: number;
  rotation: number;
  pose?: HandPose;
  /** Raw contact ellipses in the final stamp's unit square. */
  contactAreas: ContactArea[];
};
/** Merged or partial contact: side and possibly size are still the visitor's. */
export type ContactExtent = {
  /** Centre of the reported contact extent on the capture surface. */
  x: number;
  y: number;
  /** Stamp edge length implied by reported sizes, or null when unknown. */
  span: number | null;
  /** Artwork point (thumb-left frame) that sits at the contact centre. */
  anchor: readonly [number, number];
  sized: RawContact[];
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const round = (v: number) => Math.round(v * 10000) / 10000;

/** Polygon of one finger's cut-out in the artwork frame. */
export function fingerRegion(index: number, overlap = 0.03): OutlinePoint[] {
  const { tip, base, halfWidth } = PAINTED_HAND_FINGERS[index];
  const dx = tip[0] - base[0],
    dy = tip[1] - base[1];
  const length = Math.hypot(dx, dy);
  const ux = dx / length,
    uy = dy / length;
  const nx = -uy * halfWidth,
    ny = ux * halfWidth;
  const back = [base[0] - ux * overlap, base[1] - uy * overlap];
  const front = [tip[0] + ux * 0.09, tip[1] + uy * 0.09];
  return [
    [back[0] + nx, back[1] + ny],
    [front[0] + nx, front[1] + ny],
    [front[0] - nx, front[1] - ny],
    [back[0] - nx, back[1] - ny],
  ];
}

/** Identify thumb then index → little finger from five or more contacts. */
function identifyTips(contacts: readonly RawContact[]) {
  if (contacts.length < 5 || contacts.length > 16) return null;
  const across = [...contacts].sort((a, b) => a.x - b.x);
  const left = across[0],
    right = across.at(-1)!;
  const thumb = left.y > right.y ? left : right;
  const thumbRight = thumb === right;
  const fingers = contacts
    .filter((p) => p !== thumb)
    .sort((a, b) => a.y - b.y)
    .slice(0, 4)
    .sort((a, b) => (thumbRight ? b.x - a.x : a.x - b.x));
  const tips = [thumb, ...fingers];
  const spread = Math.abs(tips[4].x - thumb.x);
  const top = Math.min(...fingers.map((p) => p.y));
  const rise = thumb.y - top;
  const direction = thumbRight ? -1 : 1;
  if (
    spread < 0.075 ||
    rise < spread * 0.2 ||
    rise > spread * 1.6 ||
    fingers.some((p, i) => (p.x - tips[i].x) * direction < spread * 0.05)
  )
    return null;
  const lowestFinger = Math.max(...fingers.map((p) => p.y));
  const rest = contacts.filter((p) => !tips.includes(p));
  // Extra contacts must be palm contacts below the fingers, not a second hand.
  if (rest.some((p) => p.y < lowestFinger)) return null;
  return { tips, thumbRight };
}

/**
 * Fit the painted artwork to the raw contacts the touchscreen reported.
 * Five or more separate contacts in a hand layout choose thumb side, size,
 * rotation and per-finger bend. Fewer contacts with reported sizes set size
 * and position; position alone keeps the visitor-selected size and side.
 */
export function fitPaintedHand(
  contacts: readonly RawContact[],
  limits: { minSpan: number; maxSpan: number },
):
  | ({ kind: "posed" } & PaintedHandFit)
  | ({ kind: "extent" } & ContactExtent)
  | null {
  if (
    !contacts.length ||
    contacts.some((p) =>
      [p.x, p.y, p.width, p.height].some((v) => !Number.isFinite(v)),
    )
  )
    return null;
  const sized = contacts.filter((p) => p.hasArea);
  const tips = identifyTips(contacts);
  if (tips) {
    const flip = (p: RawContact): RawContact =>
      tips.thumbRight ? { ...p, x: 1 - p.x } : p;
    const targets = tips.tips.map(flip);
    const art = PAINTED_HAND_FINGERS.map((f) => f.tip);
    // Similarity (Procrustes) fit of artwork fingertips onto contacts.
    const n = art.length;
    const ax = art.reduce((s, p) => s + p[0], 0) / n,
      ay = art.reduce((s, p) => s + p[1], 0) / n;
    const bx = targets.reduce((s, p) => s + p.x, 0) / n,
      by = targets.reduce((s, p) => s + p.y, 0) / n;
    let re = 0,
      im = 0,
      norm = 0;
    art.forEach(([x, y], i) => {
      const px = x - ax,
        py = y - ay,
        qx = targets[i].x - bx,
        qy = targets[i].y - by;
      re += px * qx + py * qy;
      im += px * qy - py * qx;
      norm += px * px + py * py;
    });
    const rotation = clamp(Math.atan2(im, re), -Math.PI / 6, Math.PI / 6);
    const span = clamp(
      Math.hypot(re, im) / norm,
      limits.minSpan,
      limits.maxSpan,
    );
    const cos = Math.cos(rotation),
      sin = Math.sin(rotation);
    const forward = (x: number, y: number): [number, number] => [
      bx + span * (cos * (x - ax) - sin * (y - ay)),
      by + span * (sin * (x - ax) + cos * (y - ay)),
    ];
    const inverse = (x: number, y: number): [number, number] => {
      const dx = (x - bx) / span,
        dy = (y - by) / span;
      return [ax + cos * dx + sin * dy, ay - sin * dx + cos * dy];
    };
    const fingers = PAINTED_HAND_FINGERS.map(({ tip, base }, i) => {
      const [qx, qy] = inverse(targets[i].x, targets[i].y);
      const from = Math.atan2(tip[1] - base[1], tip[0] - base[0]);
      const turn = clamp(
        Math.atan2(qy - base[1], qx - base[0]) - from,
        -POSE_LIMITS.rotation,
        POSE_LIMITS.rotation,
      );
      let length = clamp(
        Math.hypot(qx - base[0], qy - base[1]) /
          Math.hypot(tip[0] - base[0], tip[1] - base[1]),
        POSE_LIMITS.minLength,
        POSE_LIMITS.maxLength,
      );
      // Keep the bent fingertip inside the stamp so it is never clipped.
      const reach = Math.hypot(tip[0] - base[0], tip[1] - base[1]) + 0.06;
      const angle = from + turn;
      for (let k = 0; k < 20; k++) {
        const ex = base[0] + Math.cos(angle) * reach * length;
        const ey = base[1] + Math.sin(angle) * reach * length;
        if (ex > 0.01 && ex < 0.99 && ey > 0.01 && ey < 0.99) break;
        length = Math.max(POSE_LIMITS.minLength, length - 0.025);
      }
      return [round(turn), round(length)] as [number, number];
    });
    const [cx, cy] = forward(0.5, 0.5);
    const contactAreas = sized.flatMap((p) => {
      const [qx, qy] = inverse(flip(p).x, flip(p).y);
      return stampArea(
        tips.thumbRight ? 1 - qx : qx,
        qy,
        p.width / span,
        p.height / span,
      );
    });
    return {
      kind: "posed",
      source: tips.thumbRight ? "painted-right" : "painted-left",
      x: tips.thumbRight ? 1 - cx : cx,
      y: cy,
      span,
      rotation: tips.thumbRight ? -rotation : rotation,
      pose: { fingers },
      contactAreas,
    };
  }
  // Fewer contacts: a merged hand or palm. Reported sizes set the scale.
  const minX = Math.min(...contacts.map((p) => p.x - p.width / 2));
  const maxX = Math.max(...contacts.map((p) => p.x + p.width / 2));
  const minY = Math.min(...contacts.map((p) => p.y - p.height / 2));
  const maxY = Math.max(...contacts.map((p) => p.y + p.height / 2));
  const width = maxX - minX,
    height = maxY - minY;
  const box = PAINTED_HAND_BOX;
  let span: number | null = null;
  let anchor: readonly [number, number] = PAINTED_HAND_PALM;
  if (sized.length && height > 0.25) {
    // Tall merged area: the controller reported the whole hand's extent.
    span = clamp(
      Math.max(height / (box.bottom - box.top), width / (box.right - box.left)),
      limits.minSpan,
      limits.maxSpan,
    );
    anchor = [(box.left + box.right) / 2, (box.top + box.bottom) / 2];
  } else if (sized.length && Math.max(width, height) > 0.08) {
    // Palm-sized area: the artwork's palm is about 45% of the stamp wide.
    span = clamp(
      Math.max(width / 0.45, height / 0.5),
      limits.minSpan,
      limits.maxSpan,
    );
  }
  return {
    kind: "extent",
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    span,
    anchor,
    sized,
  };
}

/** Place a contact extent's stamp and contact areas once side and span are known. */
export function placeExtent(
  extent: ContactExtent,
  side: PaintedHandSource,
  span: number,
): PaintedHandFit {
  const ax = side === "painted-right" ? 1 - extent.anchor[0] : extent.anchor[0];
  // Follow the hand even near an edge; the surface clips the overhang.
  const x = clamp(extent.x - (ax - 0.5) * span, 0, 1);
  const y = clamp(extent.y - (extent.anchor[1] - 0.5) * span, 0, 1);
  return {
    source: side,
    x,
    y,
    span,
    rotation: 0,
    contactAreas: extent.sized.flatMap((p) =>
      stampArea(
        0.5 + (p.x - x) / span,
        0.5 + (p.y - y) / span,
        p.width / span,
        p.height / span,
      ),
    ),
  };
}

/** One validated ellipse inside the stamp, or none when it falls outside. */
function stampArea(
  x: number,
  y: number,
  width: number,
  height: number,
): ContactArea[] {
  if (x <= 0.002 || x >= 0.998 || y <= 0.002 || y >= 0.998) return [];
  const w = Math.min(width, 2 * x, 2 * (1 - x)) - 0.002;
  const h = Math.min(height, 2 * y, 2 * (1 - y)) - 0.002;
  if (w < 0.002 || h < 0.002) return [];
  return [{ x: round(x), y: round(y), width: round(w), height: round(h) }];
}
