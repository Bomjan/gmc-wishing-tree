import type { ContactArea, OutlinePoint } from "./handprints.js";

// At the portrait kiosk's capture scale, 3.5% is roughly a fingertip-sized
// mark. This is a display limit, not a measurement of the visitor's skin.
export const MAX_CONTACT_MARK_DIAMETER = 0.035;
const CONTACT_PRINT_REFERENCE_SPAN = 0.5;

/** Lock the first usable contact size; pressure/merged bounds cannot inflate it. */
export function contactMark(
  area: ContactArea,
  previous?: ContactArea,
): ContactArea {
  const factor = Math.min(
    1,
    MAX_CONTACT_MARK_DIAMETER / Math.max(area.width, area.height),
  );
  return {
    x: area.x,
    y: area.y,
    width: previous?.width ?? area.width * factor,
    height: previous?.height ?? area.height * factor,
  };
}

/** Rounded contour for the displayed contact mark. */
export function contactAreaOutline(area: ContactArea): OutlinePoint[] {
  return Array.from({ length: 48 }, (_, i) => {
    const angle = (i / 48) * Math.PI * 2;
    return [
      area.x + (Math.cos(angle) * area.width) / 2,
      area.y + (Math.sin(angle) * area.height) / 2,
    ];
  });
}

/** Use a shared hand-sized reference, so an isolated patch is never zoomed to fill a print. */
export function normaliseContactAreas(
  areas: readonly ContactArea[],
): ContactArea[] {
  const minX = Math.min(...areas.map((a) => a.x - a.width / 2));
  const maxX = Math.max(...areas.map((a) => a.x + a.width / 2));
  const minY = Math.min(...areas.map((a) => a.y - a.height / 2));
  const maxY = Math.max(...areas.map((a) => a.y + a.height / 2));
  const extent = Math.max(
    CONTACT_PRINT_REFERENCE_SPAN,
    maxX - minX,
    maxY - minY,
  );
  return areas.map((a) => ({
    x: 0.5 + ((a.x - (minX + maxX) / 2) / extent) * 0.9,
    y: 0.5 + ((a.y - (minY + maxY) / 2) / extent) * 0.9,
    width: (a.width / extent) * 0.9,
    height: (a.height / extent) * 0.9,
  }));
}
