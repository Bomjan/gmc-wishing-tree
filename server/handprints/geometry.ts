import { z } from "zod";
import { PublicError } from "../moderation.js";
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
  source: z.enum(["trace", "outline"]),
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
