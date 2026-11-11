import { useEffect, useRef } from "react";
import { SIGNATURE_LOGO, type Stroke } from "../../shared/signatures";
import { drawInk } from "../../experiences/signature-wall/ink";

const sample: Stroke[] = [
  {
    colour: "blue",
    points: [
      [0.1, 0.67],
      [0.23, 0.23],
      [0.32, 0.17],
      [0.29, 0.41],
      [0.19, 0.61],
      [0.29, 0.53],
      [0.38, 0.46],
      [0.35, 0.63],
      [0.45, 0.51],
      [0.5, 0.41],
      [0.48, 0.57],
      [0.56, 0.57],
      [0.63, 0.45],
      [0.61, 0.58],
      [0.71, 0.49],
      [0.81, 0.4],
    ],
  },
  {
    colour: "blue",
    points: [
      [0.18, 0.76],
      [0.37, 0.69],
      [0.59, 0.66],
      [0.85, 0.59],
    ],
  },
  {
    colour: "gold",
    points: [
      [0.82, 0.29],
      [0.86, 0.2],
      [0.9, 0.29],
      [0.86, 0.39],
      [0.82, 0.29],
      [0.78, 0.23],
      [0.86, 0.24],
      [0.94, 0.24],
      [0.86, 0.29],
      [0.78, 0.32],
    ],
  },
];

export function WallPreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawInk(ctx, sample, canvas.width, canvas.height);
  }, []);
  return (
    <div className="signature-card-preview" aria-hidden="true">
      <img src={SIGNATURE_LOGO} alt="" />
      <canvas ref={ref} width={650} height={320} />
    </div>
  );
}
