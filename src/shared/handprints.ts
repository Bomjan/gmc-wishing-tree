/** Shared Handprint Wall transport contracts. Validate all input server-side. */
export const PAINT_COLOURS = {
  terracotta: "#A65F45",
  ochre: "#B18A3B",
  forest: "#365944",
  teal: "#447D78",
  blue: "#647F99",
  plum: "#785773",
} as const;
export type PaintColourId = keyof typeof PAINT_COLOURS;

/** Normalised outline coordinates, each finite and in [0, 1]. Validate server-side. */
export type OutlinePoint = readonly [x: number, y: number];
export type OutlineSource = "trace" | "outline";
export type HandprintState = "pending" | "finalised" | "cancelled" | "removed";
export type HandprintModerationStatus =
  "pending" | "accepted" | "rejected" | "unavailable";
export type HandprintPlacement = {
  sectionId: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
};
type HandprintDesign = {
  outline: readonly OutlinePoint[];
  source: OutlineSource;
  colour: PaintColourId;
};
export type HandprintSubmission = HandprintDesign & {
  size: number;
  palmName?: string;
};
export type PublicHandprint = HandprintDesign & {
  placement: HandprintPlacement;
  id: string;
  seed: number;
  state: "pending" | "finalised";
  createdAt: string;
};
export type HandprintSearchMatch = {
  id: string;
  sectionId: string;
};
export const PALM_NAME_MAX = 24;
export const PALM_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} ’'-]*$/u;
export type PublicWallSection = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  seed: number;
  prints: PublicHandprint[];
};
export type PublicWall = {
  sections: PublicWallSection[];
  demo: boolean;
  serverTime: string;
};
/** Private response to the submitting visitor; never broadcast the token. */
export type HandprintReceipt = {
  id: string;
  token: string;
  state: HandprintState;
  placement: HandprintPlacement;
  deadline: string;
  serverTime: string;
};
export type HandprintPlacementConflict = {
  code: "placement_conflict";
  message: string;
  suggestedPlacement: HandprintPlacement;
};
export type HandprintEvent = {
  type:
    | "handprint_reserved"
    | "handprint_cancelled"
    | "handprint_finalised"
    | "handprint_removed"
    | "wall_section_created";
  sectionId: string;
  handprintId?: string;
};
/** Defaults enforced by the server validator and visitor UI. */
export const HANDPRINT_DEFAULTS = {
  maxOutlinePoints: 512,
  maxRequestBytes: 64 * 1024,
  undoSeconds: 10,
  sectionWidth: 8,
  sectionHeight: 12,
  minSize: 0.5,
  maxSize: 1.4,
  maxRotationRadians: Math.PI / 12,
  atlasSize: 2048,
  moderationRasterSize: 512,
} as const;
