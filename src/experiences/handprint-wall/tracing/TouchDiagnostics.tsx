import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type TouchEvent,
} from "react";

type Contact = {
  id: number;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Separate input-check entry point; no requests, recording or visitor storage. */
export default function TouchDiagnostics() {
  const pointers = useRef(new Map<number, Contact>());
  const frame = useRef<number | null>(null);
  const [current, setCurrent] = useState<Contact[]>([]);
  const [touches, setTouches] = useState<Contact[]>([]);
  const [peak, setPeak] = useState({ pointers: 0, touches: 0 });
  const [event, setEvent] = useState("Waiting for input");

  function publish() {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const all = [...pointers.current.values()];
      setCurrent(all);
      setPeak((before) => ({
        ...before,
        pointers: Math.max(
          before.pointers,
          all.filter((p) => p.type === "touch").length,
        ),
      }));
    });
  }
  function reset() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    pointers.current.clear();
    setCurrent([]);
    setTouches([]);
    setPeak({ pointers: 0, touches: 0 });
    setEvent("Waiting for input");
  }
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) reset();
    };
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", hidden);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      pointers.current.clear();
    };
  }, []);
  function pointer(e: PointerEvent<HTMLDivElement>, ending = false) {
    e.preventDefault();
    setEvent(e.type);
    if (ending) pointers.current.delete(e.pointerId);
    else {
      const rect = e.currentTarget.getBoundingClientRect();
      pointers.current.set(e.pointerId, {
        id: e.pointerId,
        type: e.pointerType,
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
        width: e.width,
        height: e.height,
      });
      try {
        if (e.type === "pointerdown")
          e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* Interrupted/synthetic input. */
      }
    }
    publish();
  }
  function touch(e: TouchEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const all = Array.from(e.nativeEvent.touches).map((t) => ({
      id: t.identifier,
      type: "touch",
      x: (t.clientX - rect.left) / rect.width,
      y: (t.clientY - rect.top) / rect.height,
      width: t.radiusX * 2,
      height: t.radiusY * 2,
    }));
    setTouches(all);
    setPeak((before) => ({
      ...before,
      touches: Math.max(before.touches, all.length),
    }));
  }
  const touchPointers = current.filter((p) => p.type === "touch");
  return (
    <main className="wall-experience touch-diagnostics">
      <header className="wall-heading">
        <p className="eyebrow">Installation input check</p>
        <h1>Raw touch input</h1>
        <p>
          This page shows what this browser receives before the handprint app
          resizes or fits anything. It does not capture a hand image.
        </p>
      </header>
      <p>
        Browser platform:{" "}
        <strong data-testid="input-platform">{navigator.platform}</strong> ·
        Reported touch capacity: <strong>{navigator.maxTouchPoints}</strong>
      </p>
      <p className="diagnostic-counts" aria-live="polite">
        Pointer touch contacts:{" "}
        <strong data-testid="pointer-count">{touchPointers.length}</strong>{" "}
        (peak {peak.pointers})<br />
        Touch Event contacts:{" "}
        <strong data-testid="touch-count">{touches.length}</strong> (peak{" "}
        {peak.touches})<br />
        Other pointers: {current.length - touchPointers.length} · Latest event:{" "}
        {event}
      </p>
      <p>
        First try five separated fingertips. Reset, then rest the whole hand
        flat. Compare both counts and the raw sizes below.
      </p>
      <div
        className="diagnostic-surface"
        aria-label="Raw touch test area"
        onPointerDown={pointer}
        onPointerMove={pointer}
        onPointerUp={(e) => pointer(e, true)}
        onPointerCancel={(e) => pointer(e, true)}
        onLostPointerCapture={(e) => {
          if (pointers.current.delete(e.pointerId)) publish();
        }}
        onTouchStart={touch}
        onTouchMove={touch}
        onTouchEnd={touch}
        onTouchCancel={touch}
        onContextMenu={(e) => e.preventDefault()}
      >
        {current.map((p) => (
          <span
            key={p.id}
            className="diagnostic-contact"
            style={{
              left: `${p.x * 100}%`,
              top: `${p.y * 100}%`,
              width: `${p.width}px`,
              height: `${p.height}px`,
            }}
          />
        ))}
      </div>
      <div className="diagnostic-table">
        <table aria-label="Raw contact sizes">
          <thead>
            <tr>
              <th>Stream</th>
              <th>Type</th>
              <th>Width × height (CSS px)</th>
            </tr>
          </thead>
          <tbody>
            {[
              ...current.map((p) => ({ ...p, stream: "Pointer" })),
              ...touches.map((p) => ({ ...p, stream: "Touch" })),
            ].map((p) => (
              <tr key={`${p.stream}-${p.id}`}>
                <td>{p.stream}</td>
                <td>{p.type}</td>
                <td>
                  {p.width.toFixed(1)} × {p.height.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        A Pointer size of 1 × 1, or a Touch size of 0 × 0, means no usable
        contact-size data is supplied. Contact bounds are not a full skin
        contour.
      </p>
      <p>
        If both streams report only one contact for a flat hand, this browser
        has no separate finger/palm contour to send to the app. If Touch Events
        report more contacts than Pointer Events, the input path needs further
        investigation.
      </p>
      <button className="primary diagnostic-reset" onClick={reset}>
        Reset input check
      </button>
      <p className="capture-hint">
        Input stays in this page's memory. Nothing is uploaded, saved or
        published.
      </p>
    </main>
  );
}
