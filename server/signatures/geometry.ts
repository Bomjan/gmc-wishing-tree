import { z } from "zod";
import { PublicError } from "../moderation.js";
import {
  PEN_COLOURS,
  SIGNATURE_LIMITS,
  SIGNATURE_WALL_ASPECT,
  USERNAME_PATTERN,
  clampSignaturePlacement,
  hasLine,
} from "../../src/shared/signatures.js";

export const usernameSchema = z
  .string()
  .trim()
  .regex(USERNAME_PATTERN)
  .toLowerCase();
const penColours = Object.keys(PEN_COLOURS) as (keyof typeof PEN_COLOURS)[];
const coordinate = z.number().min(0).max(1);
const design = z
  .object({
    username: usernameSchema,
    strokes: z
      .array(
        z
          .object({
            colour: z.enum(penColours),
            points: z
              .array(z.tuple([coordinate, coordinate]))
              .min(1)
              .max(SIGNATURE_LIMITS.maxPoints),
          })
          .strict(),
      )
      .min(1)
      .max(SIGNATURE_LIMITS.maxStrokes),
    placement: z
      .object({
        section: z
          .number()
          .int()
          .min(0)
          .max(SIGNATURE_LIMITS.maxSections - 1),
        x: coordinate,
        y: coordinate,
      })
      .strict(),
    wallAspect: z.number().min(0.05).max(20).default(SIGNATURE_WALL_ASPECT),
  })
  .strict();

export function validateSignature(body: unknown) {
  const data = design.parse(body);
  if (
    data.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0) >
    SIGNATURE_LIMITS.maxPoints
  )
    throw new PublicError(
      422,
      "This drawing is too detailed. Undo a few strokes and try again.",
    );
  if (!hasLine(data.strokes))
    throw new PublicError(422, "Draw your signature before continuing.");
  const { x, y } = clampSignaturePlacement(data.placement, data.strokes);
  if (x !== data.placement.x || y !== data.placement.y)
    throw new PublicError(422, "Choose a spot inside the wall.");
  return data;
}
