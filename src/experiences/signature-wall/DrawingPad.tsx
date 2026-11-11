import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  SIGNATURE_LIMITS,
  type PenColour,
  type Point,
  type Stroke,
} from "../../shared/signatures";
import { drawInk } from "./ink";

const width = 600;
const height = 350;

export default function DrawingPad({
  strokes,
  colour,
  onStroke,
  onLimit,
}: {
  strokes: readonly Stroke[];
  colour: PenColour;
  onStroke: (stroke: Stroke) => void;
  onLimit: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [resolution, setResolution] = useState({ width, height });
  const active = useRef<{
    id: number;
    colour: PenColour;
    points: Point[];
    remaining: number;
  } | null>(null);
  const frame = useRef<number | null>(null);

  function render() {
    const surface = canvas.current;
    const ctx = surface?.getContext("2d");
    if (!surface || !ctx) return;
    ctx.setTransform(
      surface.width / width,
      0,
      0,
      surface.height / height,
      0,
      0,
    );
    ctx.clearRect(0, 0, width, height);
    drawInk(ctx, strokes, width, height);
    if (active.current) drawInk(ctx, [active.current], width, height);
  }

  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;
    const observer = new ResizeObserver(([{ contentRect }]) => {
      const ratio = window.devicePixelRatio || 1;
      setResolution({
        width: Math.max(1, Math.round(contentRect.width * ratio)),
        height: Math.max(1, Math.round(contentRect.height * ratio)),
      });
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    render();
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [strokes, resolution]);

  function point(event: PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    const unit = (value: number) =>
      Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
    return [
      unit((event.clientX - rect.left) / rect.width),
      unit((event.clientY - rect.top) / rect.height),
    ];
  }

  function begin(event: PointerEvent<HTMLCanvasElement>) {
    if (active.current || event.button !== 0) return;
    const remaining =
      SIGNATURE_LIMITS.maxPoints -
      strokes.reduce((total, stroke) => total + stroke.points.length, 0);
    if (!remaining || strokes.length >= SIGNATURE_LIMITS.maxStrokes) {
      onLimit();
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = {
      id: event.pointerId,
      colour,
      remaining,
      points: [point(event)],
    };
    render();
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    const stroke = active.current;
    if (
      !stroke ||
      stroke.id !== event.pointerId ||
      stroke.points.length >= stroke.remaining
    )
      return;
    const next = point(event);
    const last = stroke.points[stroke.points.length - 1];
    if (next[0] === last[0] && next[1] === last[1]) return;
    stroke.points.push(next);
    if (frame.current === null)
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        render();
      });
  }

  function end(event: PointerEvent<HTMLCanvasElement>, cancelled = false) {
    const stroke = active.current;
    if (!stroke || stroke.id !== event.pointerId) return;
    if (!cancelled) move(event);
    active.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (cancelled) render();
    else onStroke({ colour: stroke.colour, points: stroke.points });
  }

  return (
    <canvas
      ref={canvas}
      width={resolution.width}
      height={resolution.height}
      className="signature-pad"
      aria-label="Draw your signature and doodles"
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={(event) => end(event, true)}
      onLostPointerCapture={(event) => end(event, true)}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
