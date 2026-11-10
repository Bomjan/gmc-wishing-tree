/** Proposed shared contracts. No Handprint Wall endpoints are active yet. */
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
export type HandprintSubmission = {
  outline: readonly OutlinePoint[];
  source: OutlineSource;
  colour: PaintColourId;
  placement: HandprintPlacement;
};
export type PublicHandprint = HandprintSubmission & {
  id: string;
  seed: number;
  state: "pending" | "finalised";
  createdAt: string;
};
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
/** Proposed defaults to enforce in the future server validator and UI. */
export const HANDPRINT_DEFAULTS = {
  maxOutlinePoints: 512,
  maxRequestBytes: 64 * 1024,
  undoSeconds: 10,
  holdMilliseconds: 1200,
  singleDrawingPointer: true,
  sectionWidth: 8,
  sectionHeight: 12,
  minSize: 0.5,
  maxSize: 1.4,
  maxRotationRadians: Math.PI / 12,
  atlasSize: 2048,
  moderationRasterSize: 512,
} as const;
