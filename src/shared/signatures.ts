export const PEN_COLOURS = {
  blue: "#1776B2",
  black: "#22232B",
  red: "#AC3845",
  green: "#28775C",
  violet: "#6942A3",
  gold: "#986014",
} as const;
export type PenColour = keyof typeof PEN_COLOURS;
export type Point = readonly [number, number];
export type Stroke = { colour: PenColour; points: readonly Point[] };
export type SignaturePlacement = { section: number; x: number; y: number };
export type SignatureState = "pending" | "finalised" | "cancelled" | "removed";
export type PublicSignature = {
  id: string;
  strokes: readonly Stroke[];
  placement: SignaturePlacement;
  state: "pending" | "finalised";
};
export type SignaturePage = {
  demo: boolean;
  section: number;
  sectionCount: number;
  signatures: PublicSignature[];
};
export type SignatureReceipt = {
  id: string;
  token: string;
  placement: SignaturePlacement;
  state: SignatureState;
  deadline: string;
  serverTime: string;
};
export type SignatureEvent = { type: "signature_changed"; section: number };
export type SignatureMatch = { id: string; section: number };

export const SIGNATURE_LIMITS = {
  maxStrokes: 64,
  maxPoints: 3000,
  maxSections: 10000,
  wallWidth: 800,
  wallHeight: 1200,
  markWidth: 240,
  markHeight: 140,
  undoSeconds: 5,
} as const;

export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;
export const SIGNATURE_LOGO = "/signatures/wall-logo.svg";
export const SIGNATURE_WALL_ASPECT = 9 / 16;

const { markWidth, markHeight, wallWidth, wallHeight } = SIGNATURE_LIMITS;
export const signatureLineWidth = markWidth * 0.012;
const inkPadding = signatureLineWidth / 2 + 2;

export function signatureInkBounds(strokes: readonly Stroke[]) {
  function axisBounds(axis: 0 | 1) {
    let min = 1;
    let max = 0;
    for (const { points } of strokes) {
      let start = points[0][axis];
      const last = points[points.length - 1][axis];
      min = Math.min(min, start, last);
      max = Math.max(max, start, last);
      for (let i = 1; i < points.length - 1; i++) {
        const control = points[i][axis];
        const end = (control + points[i + 1][axis]) / 2;
        min = Math.min(min, end);
        max = Math.max(max, end);

        // The smoothed stroke uses quadratic curves through consecutive midpoints.
        const t = (start - control) / (start - 2 * control + end);
        if (t > 0 && t < 1) {
          const u = 1 - t;
          const value = u * u * start + 2 * u * t * control + t * t * end;
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
        start = end;
      }
    }
    return { min, extent: Math.max(0, max - min) };
  }
  const horizontal = axisBounds(0);
  const vertical = axisBounds(1);
  return {
    x: horizontal.min * markWidth - inkPadding,
    y: vertical.min * markHeight - inkPadding,
    width: horizontal.extent * markWidth + 2 * inkPadding,
    height: vertical.extent * markHeight + 2 * inkPadding,
  };
}

export function clampSignaturePlacement(
  placement: SignaturePlacement,
  strokes: readonly Stroke[],
): SignaturePlacement {
  const { width, height } = signatureInkBounds(strokes);
  const halfWidth = width / wallWidth / 2;
  const halfHeight = height / wallHeight / 2;
  return {
    ...placement,
    x: Math.min(1 - halfWidth, Math.max(halfWidth, placement.x)),
    y: Math.min(1 - halfHeight, Math.max(halfHeight, placement.y)),
  };
}

export function hasLine(strokes: readonly Stroke[]) {
  return strokes.some(({ points }) =>
    points.some(([x, y]) => x !== points[0][0] || y !== points[0][1]),
  );
}
