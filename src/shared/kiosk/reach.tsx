import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
const configured = Number(import.meta.env.VITE_CONTROL_HEIGHT || 0.32);
export const DEFAULT_CONTROL_HEIGHT = Number.isFinite(configured)
  ? Math.max(0.12, Math.min(0.82, configured))
  : 0.32;
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
// Keep the form's fields anchored when the optional keyboard is expanded.
function anchorHeight(panel: HTMLElement) {
  const keyboard = panel.querySelector<HTMLElement>(
    ".wish-form ~ .touch-keyboard",
  );
  return (
    panel.getBoundingClientRect().height -
    (keyboard
      ? keyboard.getBoundingClientRect().height +
        parseFloat(getComputedStyle(keyboard).marginTop || "0")
      : 0)
  );
}
/** Visitor-adjustable reach position, independent of camera and contribution state. */
export function useReachablePanel(mode: string) {
  const stageRef = useRef<HTMLElement>(null),
    panelRef = useRef<HTMLElement>(null);
  const [position, setPositionState] = useState(DEFAULT_CONTROL_HEIGHT);
  useLayoutEffect(() => {
    const stage = stageRef.current,
      panel = panelRef.current;
    if (!stage || !panel) return;
    const place = () => {
      const height = stage.getBoundingClientRect().height,
        panelHeight = panel.getBoundingClientRect().height;
      const top = clamp(
        position * height - anchorHeight(panel) / 2,
        height * 0.03,
        Math.max(height * 0.03, height * 0.97 - panelHeight),
      );
      panel.style.top = `${top}px`;
      panel.style.setProperty(
        "--side-space-above",
        `${Math.max(0, top + panelHeight - height * 0.03)}px`,
      );
      panel.style.setProperty(
        "--side-space-below",
        `${Math.max(0, height * 0.97 - top)}px`,
      );
      panel.style.setProperty(
        "--space-above",
        `${Math.max(0, top - height * 0.03 - 16)}px`,
      );
      panel.style.setProperty(
        "--space-below",
        `${Math.max(0, height * 0.97 - top - panelHeight - 16)}px`,
      );
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(stage);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [position, mode]);
  const setPosition = (next: number) => {
    const stage = stageRef.current,
      panel = panelRef.current;
    let min = 0.12,
      max = 0.82;
    if (stage && panel) {
      const height = stage.getBoundingClientRect().height,
        half = anchorHeight(panel) / (height * 2),
        full = panel.getBoundingClientRect().height / height;
      min = Math.max(min, 0.03 + half);
      max = Math.min(max, 0.97 - full + half);
    }
    setPositionState(clamp(next, min, Math.max(min, max)));
  };
  return {
    stageRef,
    panelRef,
    position,
    setPosition,
    resetPosition: () => setPositionState(DEFAULT_CONTROL_HEIGHT),
  };
}
export function ReachHandle({
  position,
  onChange,
  stageRef,
  panelRef,
}: {
  position: number;
  onChange: (next: number) => void;
  stageRef: React.RefObject<HTMLElement | null>;
  panelRef: React.RefObject<HTMLElement | null>;
}) {
  const drag = useRef<{ id: number; y: number; position: number } | null>(null);
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const stage = stageRef.current?.getBoundingClientRect(),
      panel = panelRef.current?.getBoundingClientRect();
    drag.current = {
      id: event.pointerId,
      y: event.clientY,
      position:
        stage && panel
          ? (panel.top - stage.top + anchorHeight(panelRef.current!) / 2) /
            stage.height
          : position,
    };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current,
      stage = stageRef.current?.getBoundingClientRect();
    if (d && stage && event.pointerId === d.id) {
      event.preventDefault();
      onChange(d.position + (event.clientY - d.y) / stage.height);
    }
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === event.pointerId) {
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const next =
      event.key === "ArrowUp"
        ? position - 0.05
        : event.key === "ArrowDown"
          ? position + 0.05
          : event.key === "Home"
            ? 0.82
            : event.key === "End"
              ? 0.12
              : null;
    if (next !== null) {
      event.preventDefault();
      onChange(next);
    }
  };
  return (
    <div
      className="reach-handle"
      role="slider"
      tabIndex={0}
      aria-label="Controls height"
      aria-orientation="vertical"
      aria-valuemin={18}
      aria-valuemax={88}
      aria-valuenow={Math.round((1 - position) * 100)}
      aria-valuetext={`${Math.round((1 - position) * 100)} percent up the screen. Drag or use arrow keys.`}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onKeyDown={key}
    >
      <svg
        width="18"
        height="26"
        viewBox="0 0 18 26"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="m5 6 4-4 4 4M9 2v22m-4-4 4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
