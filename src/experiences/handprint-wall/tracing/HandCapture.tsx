import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  HANDPRINT_DEFAULTS,
  type ContactArea,
  type OutlinePoint,
  type OutlineSource,
} from "../../../shared/handprints";
import {
  fitPaintedHand,
  paintedHandOutline,
  placeExtent,
  type HandPose,
  type PaintedHandSource,
} from "../../../shared/paintedHand";
import { paint } from "../paint";
import { finishManualOutline } from "./manualOutline";
type ContactPoint = ContactArea & { id: number; hasArea: boolean };

const REVEAL_MS = 520;

/** On-screen stamp edge length at size 1, as a fraction of the capture square. */
const BASE_SPAN = 0.68;
const SPAN_LIMITS = {
  minSpan: BASE_SPAN * HANDPRINT_DEFAULTS.minSize,
  maxSpan: BASE_SPAN * HANDPRINT_DEFAULTS.maxSize,
};
const toSize = (span: number) =>
  Math.round(
    Math.max(
      HANDPRINT_DEFAULTS.minSize,
      Math.min(HANDPRINT_DEFAULTS.maxSize, span / BASE_SPAN),
    ) * 100,
  ) / 100;

const asPoints = (shape: readonly OutlinePoint[]) =>
  shape.map(([x, y]) => `${x * 100},${y * 100}`).join(" ");

export function HandCapture({
  onCapture,
  paintReady,
}: {
  paintReady: boolean;
  onCapture: (
    shape: OutlinePoint[],
    source: OutlineSource,
    areas?: readonly ContactArea[],
    size?: number,
    pose?: HandPose,
  ) => void;
}) {
  const contacts = useRef(new Map<number, ContactPoint>());
  const starts = useRef(new Map<number, OutlinePoint>());
  const frame = useRef<number | null>(null);
  const modeRef = useRef<"touch" | "draw">("touch");
  const drawing = useRef<number | null>(null);
  const stroke = useRef<OutlinePoint[]>([]);
  const [mode, setMode] = useState<"touch" | "draw">("touch");
  const [points, setPoints] = useState<ContactPoint[]>([]);
  const [sample, setSample] = useState<ContactPoint[]>([]);
  const preview = useRef<HTMLCanvasElement>(null);
  const [thumbSide, setThumbSide] = useState<PaintedHandSource>("painted-left");
  const [stampSize, setStampSize] = useState(1);
  const peakCount = useRef(0);
  const [drawn, setDrawn] = useState<OutlinePoint[]>([]);
  const [finished, setFinished] = useState<OutlinePoint[] | null>(null);
  const [drawMessage, setDrawMessage] = useState("");
  const contactFrame = points.length ? points : sample;
  const canCapture = mode === "touch" && contactFrame.length > 0 && paintReady;
  const stampSpan = BASE_SPAN * stampSize;
  const active = contactFrame.length > 0;
  const holding = points.length > 0;
  // Raw reported contacts decide placement. Five or more fingertip contacts
  // pose each finger; a sized merged area sets the scale; position always.
  const raw = useMemo(
    () => fitPaintedHand(contactFrame, SPAN_LIMITS),
    [contactFrame],
  );
  const fit = useMemo(() => {
    if (!raw) return null;
    if (raw.kind === "posed")
      return {
        ...raw,
        source: holding ? raw.source : thumbSide,
        span: holding ? raw.span : stampSpan,
      };
    return placeExtent(
      raw,
      thumbSide,
      holding && raw.span !== null ? raw.span : stampSpan,
    );
  }, [raw, holding, thumbSide, stampSpan]);
  const fitKind = !raw
    ? "none"
    : raw.kind === "posed"
      ? "posed"
      : raw.span !== null
        ? "sized"
        : "position";
  // While the hand rests, adopt what the contacts imply; the visitor can
  // still change side and size after lifting.
  useEffect(() => {
    if (!raw || !holding) return;
    if (raw.kind === "posed") setThumbSide(raw.source);
    if (raw.span !== null) setStampSize(toSize(raw.span));
  }, [raw, holding]);
  // Start time of the current press animation; reset for each new placement.
  const revealStart = useRef<number | null>(null);
  const revealFrame = useRef<number | null>(null);
  if (!active) revealStart.current = null;
  useEffect(() => {
    const ctx = preview.current?.getContext("2d");
    if (!ctx || mode !== "touch") return;
    const draw = (progress: number) => {
      ctx.clearRect(0, 0, 768, 768);
      // Nothing is shown until a hand is actually on the surface.
      if (!paintReady || !active || !fit) return;
      // Ink "press": the print settles from slightly larger and fades in.
      const eased = 1 - (1 - progress) ** 3;
      ctx.globalAlpha = eased;
      paint(
        ctx,
        {
          outline: paintedHandOutline(fit.source),
          source: fit.source,
          contactAreas: fit.contactAreas,
          pose: fit.pose,
          colour: "terracotta",
          seed: 71,
        },
        fit.x * 768,
        fit.y * 768,
        fit.span * 768 * (1.06 - 0.06 * eased),
        fit.rotation,
      );
      ctx.globalAlpha = 1;
    };
    if (!active || !paintReady || !fit) {
      draw(0);
      return;
    }
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (revealStart.current === null) revealStart.current = performance.now();
    const step = () => {
      const progress = reduced
        ? 1
        : Math.min(1, (performance.now() - revealStart.current!) / REVEAL_MS);
      draw(progress);
      revealFrame.current = progress < 1 ? requestAnimationFrame(step) : null;
    };
    step();
    return () => {
      if (revealFrame.current !== null)
        cancelAnimationFrame(revealFrame.current);
      revealFrame.current = null;
    };
  }, [paintReady, mode, fit, active]);

  function publish() {
    frame.current = null;
    const next = [...contacts.current.values()];
    setPoints(next);
    setDrawn([...stroke.current]);
    // Touch places the artistic impression. One reported palm contact is enough.
    // Retain the fullest simultaneous frame so lifting fingers does not move it.
    if (
      modeRef.current === "touch" &&
      next.length &&
      next.length >= peakCount.current
    ) {
      peakCount.current = next.length;
      setSample(next);
    }
  }

  function schedule() {
    if (frame.current === null) frame.current = requestAnimationFrame(publish);
  }

  function clear() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    contacts.current.clear();
    starts.current.clear();
    drawing.current = null;
    stroke.current = [];
    setPoints([]);
    setSample([]);
    peakCount.current = 0;
    setDrawn([]);
    setFinished(null);
    setDrawMessage("");
  }

  useEffect(() => {
    function hidden() {
      if (document.hidden) clear();
    }
    window.addEventListener("blur", clear);
    window.addEventListener("pagehide", clear);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", clear);
      window.removeEventListener("pagehide", clear);
      document.removeEventListener("visibilitychange", hidden);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      contacts.current.clear();
      starts.current.clear();
      stroke.current = [];
    };
  }, []);

  function release(event: PointerEvent<HTMLDivElement>) {
    if (drawing.current === event.pointerId) {
      drawing.current = null;
      const result = finishManualOutline(stroke.current);
      setFinished(result);
      setDrawMessage(
        result
          ? "Your outline is ready. Lift your hand and continue."
          : "Trace all the way around and finish near where you started. Try again.",
      );
    }
    starts.current.delete(event.pointerId);
    if (contacts.current.delete(event.pointerId)) {
      schedule();
    }
  }

  function interrupt(event: PointerEvent<HTMLDivElement>) {
    // A cancelled drawing must never be offered as a completed contour.
    if (modeRef.current === "draw" || contacts.current.has(event.pointerId))
      clear();
  }

  function track(event: PointerEvent<HTMLDivElement>, start = false) {
    if (
      (modeRef.current === "touch" && event.pointerType !== "touch") ||
      (!start && !contacts.current.has(event.pointerId))
    )
      return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (![x, y].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1) {
      interrupt(event);
      return;
    }
    if (start) {
      if (modeRef.current === "touch" && contacts.current.size === 0) {
        setSample([]);
        peakCount.current = 0;
      }
      starts.current.set(event.pointerId, [x, y]);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* Interrupted or synthetic contact. */
      }
    }
    contacts.current.set(event.pointerId, {
      id: event.pointerId,
      x,
      y,
      width: Math.max(0, event.width || 1) / rect.width,
      height: Math.max(0, event.height || 1) / rect.height,
      hasArea: event.width > 1 && event.height > 1,
    });
    if (modeRef.current === "draw") {
      const first = starts.current.get(event.pointerId)!;
      // Resting palm contacts stay idle. The first deliberately moving contact
      // owns the stroke; other pointers cannot append to it.
      if (
        drawing.current === null &&
        Math.hypot(x - first[0], y - first[1]) > 0.012
      ) {
        drawing.current = event.pointerId;
        stroke.current = [first];
        setFinished(null);
        setDrawMessage("Tracing… finish where you started.");
      }
      if (drawing.current === event.pointerId) {
        const last = stroke.current.at(-1)!;
        if (Math.hypot(x - last[0], y - last[1]) >= 0.001) {
          // Bound the in-memory draft while keeping points along the full path.
          if (stroke.current.length >= 4096)
            stroke.current = stroke.current.filter((_, i) => i % 2 === 0);
          stroke.current.push([x, y]);
        }
      }
    }
    schedule();
  }

  function switchMode(next: "touch" | "draw") {
    clear();
    modeRef.current = next;
    setMode(next);
  }

  return (
    <div className="capture-panel">
      <div
        className="capture-modes"
        role="group"
        aria-label="Create your handprint"
      >
        <button
          type="button"
          aria-pressed={mode === "touch"}
          onClick={() => switchMode("touch")}
        >
          Painted handprint
        </button>
        <button
          type="button"
          aria-pressed={mode === "draw"}
          onClick={() => switchMode("draw")}
        >
          Trace my outline
        </button>
      </div>
      <p className="capture-instruction">
        {mode === "touch"
          ? "Place your relaxed hand anywhere on the panel. Your painted print appears right where you touch."
          : "Rest one hand flat. With your other index finger, trace around it in one loop, starting at the wrist."}
      </p>
      <div
        className="capture-surface"
        aria-label="Live multi-touch hand capture area"
        data-ready={mode === "touch" ? canCapture : Boolean(finished)}
        data-mode={mode}
        data-contact-count={points.length}
        data-fit={mode === "touch" ? fitKind : undefined}
        onPointerDown={(event) => track(event, true)}
        onPointerMove={track}
        onPointerUp={release}
        onPointerCancel={interrupt}
        onLostPointerCapture={(event) => {
          if (contacts.current.has(event.pointerId)) interrupt(event);
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {mode === "touch" && (
          <canvas
            ref={preview}
            className="capture-impression"
            width={768}
            height={768}
            aria-label="Painted hand impression preview"
            data-active={active}
          />
        )}
        <svg viewBox="0 0 100 100" aria-hidden="true">
          {mode === "draw" && drawn.length > 0 && (
            <polyline
              className={`capture-stroke${finished ? " capture-stroke-complete" : ""}`}
              points={asPoints(drawn)}
            />
          )}
          {points
            .filter(() => mode === "draw")
            .map((p) => (
              <ellipse
                key={p.id}
                className="capture-contact"
                cx={p.x * 100}
                cy={p.y * 100}
                rx={Math.max(0.7, p.width * 50)}
                ry={Math.max(0.7, p.height * 50)}
              />
            ))}
        </svg>
      </div>
      <p className="capture-status" aria-live="polite">
        {mode === "draw"
          ? drawMessage ||
            "Your resting palm will not start a line. Move a second finger to begin."
          : !paintReady
            ? "Loading the painted impression…"
            : points.length
              ? fitKind === "posed"
                ? "Your fingers are shaping the print. Lift your hand when ready."
                : "Your painted handprint is appearing. Lift your hand when ready."
              : sample.length
                ? "Your painted handprint is ready."
                : "Place your hand on the panel to begin."}
      </p>
      {mode === "touch" ? (
        <>
          <p className="capture-hint">
            Painted impression with artistic creases and ink texture. This is
            not a scan of your skin or fingerprints.
          </p>
          <div className="capture-options" role="group" aria-label="Thumb side">
            <button
              type="button"
              aria-pressed={thumbSide === "painted-left"}
              onClick={() => setThumbSide("painted-left")}
            >
              Thumb on left
            </button>
            <button
              type="button"
              aria-pressed={thumbSide === "painted-right"}
              onClick={() => setThumbSide("painted-right")}
            >
              Thumb on right
            </button>
          </div>
          <label className="capture-size">
            Handprint size
            <input
              aria-label="Handprint size"
              type="range"
              min={HANDPRINT_DEFAULTS.minSize}
              max={HANDPRINT_DEFAULTS.maxSize}
              step="0.05"
              value={stampSize}
              onChange={(e) => setStampSize(+e.target.value)}
            />
          </label>
          <div className="capture-options">
            <button type="button" onClick={clear}>
              Start over
            </button>
            <button
              type="button"
              className="primary"
              disabled={!canCapture}
              onClick={() => {
                if (canCapture && fit)
                  onCapture(
                    paintedHandOutline(thumbSide),
                    thumbSide,
                    fit.contactAreas.length ? fit.contactAreas : undefined,
                    stampSize,
                    fit.pose,
                  );
              }}
            >
              Use my handprint
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="capture-hint">
            Follow the line as you draw. If the screen merges your tracing
            finger with your palm, lift your hand and draw its outline.
          </p>
          <div className="capture-options">
            <button type="button" onClick={clear}>
              Start over
            </button>
            <button
              type="button"
              className="primary"
              disabled={!finished}
              onClick={() => {
                if (finished) onCapture(finished, "trace");
              }}
            >
              Use my traced outline
            </button>
          </div>
        </>
      )}
    </div>
  );
}
