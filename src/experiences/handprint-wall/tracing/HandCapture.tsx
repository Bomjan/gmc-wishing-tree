import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { OutlinePoint } from "../../../shared/handprints";
import { fitHand, outline } from "../paint";

const guide = outline()
  .map(([x, y]) => `${x * 100},${y * 100}`)
  .join(" ");

export function HandCapture({
  onCapture,
}: {
  onCapture: (shape: OutlinePoint[]) => void;
}) {
  const contacts = useRef(new Map<number, OutlinePoint>());
  const [points, setPoints] = useState<OutlinePoint[]>([]);
  const ready = Boolean(fitHand(points));

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      const shape = fitHand([...contacts.current.values()]);
      if (shape) onCapture(shape);
    }, 650);
    return () => clearTimeout(timer);
  }, [ready, onCapture]);

  function track(event: PointerEvent<HTMLDivElement>, start = false) {
    if (
      event.pointerType !== "touch" ||
      (!start && !contacts.current.has(event.pointerId))
    )
      return;
    if (start) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* An interrupted contact may already be gone. */
      }
    }
    const rect = event.currentTarget.getBoundingClientRect();
    contacts.current.set(event.pointerId, [
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    ]);
    setPoints([...contacts.current.values()]);
  }

  function release(event: PointerEvent<HTMLDivElement>) {
    if (contacts.current.delete(event.pointerId))
      setPoints([...contacts.current.values()]);
  }

  return (
    <div className="capture-panel">
      <div
        className="capture-surface"
        aria-label="Fingertip capture area"
        data-ready={ready}
        onPointerDown={(event) => track(event, true)}
        onPointerMove={track}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <polygon
            className="capture-guide"
            points={guide}
            transform="translate(36 29) scale(.36)"
          />
          {points.map(([x, y], index) => (
            <circle
              key={index}
              className="capture-contact"
              cx={x * 100}
              cy={y * 100}
              r="1.8"
            />
          ))}
        </svg>
        {ready && <span className="capture-progress" />}
      </div>
      <p className="capture-status" aria-live="polite">
        {ready
          ? "Hold steady…"
          : points.length >= 5
            ? "Spread your fingers with your thumb lower."
            : `${points.length} of 5 fingertips detected`}
      </p>
    </div>
  );
}
