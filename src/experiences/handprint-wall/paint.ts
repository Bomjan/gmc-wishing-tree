import {
  PAINT_COLOURS,
  type PublicHandprint,
  type OutlinePoint,
} from "../../shared/handprints";
const template: OutlinePoint[] = [
  [0.24, 0.95],
  [0.22, 0.65],
  [0.06, 0.46],
  [0.05, 0.39],
  [0.1, 0.36],
  [0.27, 0.49],
  [0.19, 0.18],
  [0.21, 0.12],
  [0.26, 0.12],
  [0.36, 0.43],
  [0.34, 0.06],
  [0.38, 0.02],
  [0.43, 0.04],
  [0.47, 0.42],
  [0.5, 0.08],
  [0.55, 0.06],
  [0.59, 0.1],
  [0.58, 0.44],
  [0.66, 0.19],
  [0.71, 0.18],
  [0.74, 0.22],
  [0.69, 0.61],
  [0.66, 0.94],
];

export function outline(width = 1) {
  return roundOutline(template.map(([x, y]) => [0.5 + (x - 0.5) * width, y]));
}

function roundOutline(points: OutlinePoint[]) {
  return points.flatMap((p, i) => {
    const next = points[(i + 1) % points.length];
    return [
      [p[0] * 0.85 + next[0] * 0.15, p[1] * 0.85 + next[1] * 0.15],
      [p[0] * 0.15 + next[0] * 0.85, p[1] * 0.15 + next[1] * 0.85],
    ] as OutlinePoint[];
  });
}
/** Fit a stylised outline to an upright spread of five fingertips. */
export function fitHand(contacts: OutlinePoint[]): OutlinePoint[] | null {
  if (contacts.length !== 5) return null;
  const sorted = [...contacts].sort((a, b) => a[0] - b[0]);
  const mirrored = sorted[4][1] > sorted[0][1];
  const tips = mirrored ? sorted.reverse() : sorted;
  const spread = Math.abs(tips[4][0] - tips[0][0]);
  const top = Math.min(...tips.map(([, y]) => y));
  const rise = tips[0][1] - top;
  if (
    spread < 0.075 ||
    rise < spread * 0.28 ||
    rise > spread * 1.5 ||
    tips[0][1] - Math.max(...tips.slice(1).map(([, y]) => y)) < rise * 0.1 ||
    tips.slice(1).some(([x], i) => Math.abs(x - tips[i][0]) < spread * 0.08)
  )
    return null;

  const tipVertices = [
    [2, 3, 4],
    [6, 7, 8],
    [10, 11, 12],
    [14, 15, 16],
    [18, 19, 20],
  ];
  const templateTips = tipVertices.map((vertices) => template[vertices[1]][0]);
  const fittedTips = templateTips.map((x, i) => {
    const contactFraction = Math.abs(tips[i][0] - tips[0][0]) / spread;
    const target =
      templateTips[0] + contactFraction * (templateTips[4] - templateTips[0]);
    return x * 0.55 + target * 0.45;
  });
  const width = Math.max(0.8, Math.min(1.1, (spread / rise) * 0.65));
  const fitted = template.map(([x, y], index): OutlinePoint => {
    const finger = tipVertices.findIndex((vertices) =>
      vertices.includes(index),
    );
    if (finger > 0) {
      const target = 0.045 + ((tips[finger][1] - top) / rise) * 0.35;
      y += target - template[tipVertices[finger][1]][1];
    }
    const right = templateTips.findIndex((tip) => tip > x);
    if (right > 0) {
      const left = right - 1;
      const fraction =
        (x - templateTips[left]) / (templateTips[right] - templateTips[left]);
      x = fittedTips[left] + fraction * (fittedTips[right] - fittedTips[left]);
    }
    const fittedX = 0.5 + (x - 0.5) * width;
    return [mirrored ? 1 - fittedX : fittedX, Math.max(0.015, y)];
  });
  return roundOutline(fitted);
}

const textures = new Map<string, HTMLCanvasElement>();
export function releasePaint() {
  for (const c of textures.values()) {
    c.width = 0;
    c.height = 0;
  }
  textures.clear();
}
export function paint(
  ctx: CanvasRenderingContext2D,
  p: Pick<PublicHandprint, "outline" | "colour" | "seed"> & {
    palmName?: string;
  },
  x: number,
  y: number,
  size: number,
  rotation = 0,
) {
  const key = JSON.stringify([p.seed, p.colour, p.outline]);
  let texture = textures.get(key);
  if (!texture) {
    texture = document.createElement("canvas");
    texture.width = 512;
    texture.height = 512;
    const c = texture.getContext("2d")!;
    let seed = p.seed;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    };
    c.scale(512, 512);
    c.beginPath();
    p.outline.forEach(([a, b], i) => {
      const next = p.outline[(i + 1) % p.outline.length];
      if (!i) c.moveTo(a, b);
      const steps = Math.max(
        2,
        Math.ceil(Math.hypot(next[0] - a, next[1] - b) * 180),
      );
      for (let j = 1; j <= steps; j++)
        c.lineTo(
          a + ((next[0] - a) * j) / steps + (random() - 0.5) * 0.005,
          b + ((next[1] - b) * j) / steps + (random() - 0.5) * 0.005,
        );
    });
    c.closePath();
    c.clip();
    c.fillStyle = PAINT_COLOURS[p.colour];
    c.globalAlpha = 0.87;
    c.fillRect(0, 0, 1, 1);
    for (let i = 0; i < 40; i++) {
      c.globalAlpha = 0.03 + random() * 0.1;
      c.beginPath();
      c.ellipse(
        random(),
        random(),
        0.015 + random() * 0.12,
        0.01 + random() * 0.06,
        random() * 6,
        0,
        7,
      );
      c.fill();
    }
    // Subtract paint from the stamp itself; the wall remains visible through gaps.
    c.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 9500; i++) {
      c.globalAlpha = 0.08 + random() * 0.62;
      const r = 0.0003 + random() * 0.0025;
      c.beginPath();
      c.ellipse(
        random(),
        random(),
        r,
        r * (0.3 + random() * 0.7),
        random() * 6,
        0,
        7,
      );
      c.fill();
    }
    for (let i = 0; i < 35; i++) {
      c.globalAlpha = 0.25 + random() * 0.6;
      const r = 0.002 + random() * 0.009;
      c.beginPath();
      c.ellipse(random(), random(), r, r * 0.35, random() * 6, 0, 7);
      c.fill();
    }
    if (textures.size >= 48) {
      const oldest = textures.keys().next().value!;
      const old = textures.get(oldest)!;
      old.width = 0;
      old.height = 0;
      textures.delete(oldest);
    }
    textures.set(key, texture);
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(texture, -size / 2, -size / 2, size, size);
  if (p.palmName) {
    ctx.fillStyle = "#fff9ed";
    ctx.shadowColor = "#382516";
    ctx.shadowBlur = 2;
    ctx.font = `italic 600 ${size * 0.095}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.palmName, 0, size * 0.19, size * 0.32);
  }
  ctx.restore();
}
