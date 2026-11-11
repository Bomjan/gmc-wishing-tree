import { PEN_COLOURS, type Point, type Stroke } from "../../shared/signatures";

export function inkPath(
  points: readonly Point[],
  width: number,
  height: number,
) {
  const [x, y] = points[0];
  let path = `M ${x * width} ${y * height}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const [nx, ny] = points[i + 1];
    path += ` Q ${px * width} ${py * height} ${((px + nx) * width) / 2} ${((py + ny) * height) / 2}`;
  }
  const [lastX, lastY] = points[points.length - 1];
  return `${path} L ${lastX * width} ${lastY * height}`;
}

export function drawInk(
  ctx: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  width: number,
  height: number,
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = width * 0.012;

  for (const { colour, points } of strokes) {
    ctx.strokeStyle = ctx.fillStyle = PEN_COLOURS[colour];
    if (points.length === 1) {
      const [x, y] = points[0];
      ctx.beginPath();
      ctx.arc(x * width, y * height, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.stroke(new Path2D(inkPath(points, width, height)));
    }
  }
  ctx.restore();
}
