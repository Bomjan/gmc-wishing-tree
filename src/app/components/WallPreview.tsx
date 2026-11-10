import { useEffect, useRef } from "react";
import {
  paint,
  outline,
  releasePaint,
} from "../../experiences/handprint-wall/paint";
export function WallPreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!,
      ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    paint(
      ctx,
      { outline: outline(0.85), colour: "terracotta", seed: 712 },
      170,
      175,
      225,
      -0.15,
    );
    paint(
      ctx,
      { outline: outline(1.1), colour: "teal", seed: 42 },
      360,
      140,
      180,
      0.2,
    );
    paint(
      ctx,
      { outline: outline(0.95), colour: "ochre", seed: 903 },
      495,
      220,
      130,
      -0.1,
    );
    return releasePaint;
  }, []);
  return (
    <canvas
      ref={ref}
      width={650}
      height={320}
      aria-label="Illustration of textured painted hand outlines"
    />
  );
}
