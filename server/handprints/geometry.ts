import { z } from "zod";
import { PublicError } from "../moderation.js";
import { contactAreaOutline } from "../../src/shared/contactAreas.js";
import {
  isPaintedHand,
  paintedHandOutline,
  POSE_LIMITS,
} from "../../src/shared/paintedHand.js";
import {
  HANDPRINT_DEFAULTS,
  PALM_NAME_MAX,
  PALM_NAME_PATTERN,
} from "../../src/shared/handprints.js";

export const palmNameSchema = z
  .string()
  .transform((name) => name.normalize("NFC").trim().replace(/ +/g, " "))
  .pipe(z.string().max(PALM_NAME_MAX).regex(PALM_NAME_PATTERN));

const size = z
  .number()
  .min(HANDPRINT_DEFAULTS.minSize)
  .max(HANDPRINT_DEFAULTS.maxSize);
const design = z.object({
  outline: z
    .array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]))
    .min(12)
    .max(512),
  source: z.enum([
    "trace",
    "outline",
    "contact",
    "painted-left",
    "painted-right",
  ]),
  contactAreas: z
    .array(
      z
        .object({
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          width: z.number().min(0.001).max(1),
          height: z.number().min(0.001).max(1),
        })
        .strict()
        .refine(
          (a) =>
            a.x - a.width / 2 >= -1e-8 &&
            a.x + a.width / 2 <= 1 + 1e-8 &&
            a.y - a.height / 2 >= -1e-8 &&
            a.y + a.height / 2 <= 1 + 1e-8,
        ),
    )
    .min(1)
    .max(16)
    .optional(),
  pose: z
    .object({
      fingers: z
        .array(
          z.tuple([
            z.number().min(-POSE_LIMITS.rotation).max(POSE_LIMITS.rotation),
            z.number().min(POSE_LIMITS.minLength).max(POSE_LIMITS.maxLength),
          ]),
        )
        .length(5),
    })
    .strict()
    .optional(),
  colour: z.enum(["terracotta", "ochre", "forest", "teal", "blue", "plum"]),
});
export const submissionSchema = z.union([
  design
    .extend({
      placement: z
        .object({
          sectionId: z.string().regex(/^section-(0|[1-9][0-9]{0,5})$/),
          x: z.number().min(1).max(7),
          y: z.number().min(1).max(11),
          size,
          rotation: z
            .number()
            .min(-Math.PI / 12)
            .max(Math.PI / 12),
        })
        .strict(),
    })
    .strict(),
  design.extend({ size, palmName: palmNameSchema.optional() }).strict(),
]);
export function validate(input: unknown) {
  const data = submissionSchema.parse(input);
  if (data.pose && !isPaintedHand(data.source))
    throw new PublicError(422, "A finger pose requires a painted handprint.");
  if (data.source === "contact") {
    if (!data.contactAreas?.length)
      throw new PublicError(422, "Please capture a reported touch area.");
    // Canonicalise the compatibility outline; moderation and rendering use all
    // patches. Never trust an unrelated client-supplied silhouette instead.
    return { ...data, outline: contactAreaOutline(data.contactAreas[0]) };
  }
  // Painted prints may carry the raw contact patches the screen reported; they
  // only deepen pigment inside the fixed artwork and never form a silhouette.
  if (isPaintedHand(data.source))
    return { ...data, outline: paintedHandOutline(data.source) };
  if (data.contactAreas)
    throw new PublicError(422, "Contact areas require a contact print.");
  let area = 0;
  for (let i = 0; i < data.outline.length; i++) {
    const a = data.outline[i],
      b = data.outline[(i + 1) % data.outline.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (Math.abs(area) / 2 < 0.035)
    throw new PublicError(422, "Please redraw a clear, closed hand outline.");
  return data;
}
