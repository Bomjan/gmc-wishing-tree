import {
  useRef,
  useState,
  type CSSProperties,
  type FormEventHandler,
  type ReactNode,
} from "react";

export function DrawingPanel({
  children,
  onSubmit,
}: {
  children: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  const panel = useRef<HTMLFormElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>();

  function move(x: number, y: number) {
    const form = panel.current;
    const wall = form?.parentElement;
    if (!form || !wall) return;
    setPosition({
      x: Math.max(0, Math.min(x, wall.clientWidth - form.offsetWidth)),
      y: Math.max(0, Math.min(y, wall.clientHeight - form.offsetHeight - 12)),
    });
  }

  return (
    <form
      ref={panel}
      className="signature-drawing"
      style={
        position &&
        ({
          "--drawing-x": `${position.x}px`,
          "--drawing-y": `${position.y}px`,
        } as CSSProperties)
      }
      onSubmit={onSubmit}
    >
      <button
        type="button"
        className="signature-drag-handle"
        aria-label="Move drawing panel"
        onPointerDown={(event) => {
          if (event.button !== 0 || drag.current || !panel.current) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            id: event.pointerId,
            x: event.clientX - panel.current.offsetLeft,
            y: event.clientY - panel.current.offsetTop,
          };
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (active?.id === event.pointerId)
            move(event.clientX - active.x, event.clientY - active.y);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (!panel.current) return;
          const { offsetLeft: x, offsetTop: y } = panel.current;
          switch (event.key) {
            case "ArrowLeft":
              move(x - 24, y);
              break;
            case "ArrowRight":
              move(x + 24, y);
              break;
            case "ArrowUp":
              move(x, y - 24);
              break;
            case "ArrowDown":
              move(x, y + 24);
              break;
            default:
              return;
          }
          event.preventDefault();
        }}
      >
        Draw your signature
      </button>
      {children}
    </form>
  );
}
