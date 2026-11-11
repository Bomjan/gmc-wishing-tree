import { randomUUID } from "../../shared/randomUUID";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
} from "react";
import {
  HANDPRINT_DEFAULTS,
  PAINT_COLOURS,
  PALM_NAME_MAX,
  PALM_NAME_PATTERN,
  type OutlinePoint,
  type OutlineSource,
  type ContactArea,
  type PublicWall,
  type HandprintReceipt,
  type HandprintPlacement,
  type HandprintSearchMatch,
  type HandprintSubmission,
  type PaintColourId,
} from "../../shared/handprints";
import type { HandPose } from "../../shared/paintedHand";
import { outline, paint, releasePaint, loadPaintedHand } from "./paint";
import { handprintWallTitle } from "../../app/experiences";
import { TouchKeyboard } from "../../shared/ui/TouchKeyboard";
import { HandCapture } from "./tracing/HandCapture";

const demo = import.meta.env.VITE_DEMO === "true";
const cacheKey = `gmc-wall-${demo}`;
const width = 800;
const height = 1200;
const centre = { x: 0, y: 0 };
type Step = "capture" | "size" | "customise" | "wall";
type Focus = { id: string; name?: string };

function cached(): PublicWall {
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (c?.demo === demo) return c;
  } catch {}
  return { sections: [], demo, serverTime: "" };
}

export default function Wall({
  onSessionLock,
}: {
  onSessionLock: (locked: boolean) => void;
}) {
  const [wall, setWall] = useState(cached);
  const [online, setOnline] = useState(false);
  const [step, setStep] = useState<Step>("capture");
  const [paintReady, setPaintReady] = useState(false);
  const [shape, setShape] = useState<OutlinePoint[]>([]);
  const [source, setSource] = useState<OutlineSource>("outline");
  const [contactAreas, setContactAreas] = useState<
    readonly ContactArea[] | undefined
  >();
  const [pose, setPose] = useState<HandPose | undefined>();
  const [colour, setColour] = useState<PaintColourId>("terracotta");
  const [size, setSize] = useState(1);
  const [name, setName] = useState("");
  const [section, setSection] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(centre);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<HandprintReceipt | null>(null);
  const [remaining, setRemaining] = useState(10);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [reveal, setReveal] = useState(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [matches, setMatches] = useState<HandprintSearchMatch[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [matchedName, setMatchedName] = useState("");
  const [keyboard, setKeyboard] = useState(false);

  const canvas = useRef<HTMLCanvasElement>(null);
  const plaster = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const key = useRef(randomUUID());
  const session = useRef(randomUUID());
  const attemptBody = useRef("");
  const offset = useRef(0);
  const submitting = useRef(false);
  useEffect(() => {
    let active = true;
    loadPaintedHand()
      .then(() => {
        if (active) setPaintReady(true);
      })
      .catch(() => {
        if (active)
          setMessage(
            "The painted hand could not load. Please reload or trace your outline.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  const request = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`/api/handprints${path}`, {
      ...options,
      signal: AbortSignal.timeout(25000),
      headers: {
        "Content-Type": "application/json",
        "X-Kiosk-Session": session.current,
        ...options.headers,
      },
    }).catch(() => {
      setOnline(false);
      throw Error(
        "The connection was interrupted. Please retry when connected.",
      );
    });
    const data = await response.json();
    if (!response.ok)
      throw Object.assign(Error(data.message || "Please retry."), {
        status: response.status,
      });
    return data;
  };

  async function refresh() {
    try {
      const data: PublicWall = await request("/sections");
      if (data.demo !== demo) throw Error();
      setWall(data);
      setOnline(true);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch {}
    } catch {
      setOnline(false);
    }
  }

  function remember(r: HandprintReceipt) {
    offset.current = Date.parse(r.serverTime) - Date.now();
    setReceipt(r);
    try {
      if (r.state === "pending")
        sessionStorage.setItem("gmc-handprint-pending", JSON.stringify(r));
      else sessionStorage.removeItem("gmc-handprint-pending");
    } catch {}
  }

  function goToSection(sectionId: string) {
    setSection(Number(sectionId.slice("section-".length)));
    setPan(centre);
    setZoom(1);
  }

  function showAccepted(r: HandprintReceipt, palmName?: string) {
    setStep("wall");
    goToSection(r.placement.sectionId);
    setFocus({ id: r.id, name: palmName });
  }
  useEffect(() => {
    void refresh();
    let stopped = false,
      ws: WebSocket,
      retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      if (stopped) return;
      ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
      );
      ws.onopen = () => void refresh();
      ws.onmessage = () => void refresh();
      ws.onclose = () => {
        setOnline(false);
        retry = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    const poll = setInterval(() => void refresh(), 10000);
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("gmc-handprint-pending") || "null",
      );
      if (saved) {
        setReceipt(saved);
        showAccepted(saved);
        void request(`/submissions/${saved.id}`, {
          headers: { Authorization: `Bearer ${saved.token}` },
        })
          .then(remember)
          .catch(() => {});
      }
    } catch {}
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(poll);
      ws?.close();
      releasePaint();
      if (plaster.current) {
        plaster.current.width = 0;
        plaster.current.height = 0;
        plaster.current = null;
      }
    };
  }, []);
  useEffect(() => {
    if (!receipt || step !== "wall" || shape.length) return;
    const print = wall.sections
      .flatMap((s) => s.prints)
      .find((p) => p.id === receipt.id);
    if (print) {
      setShape([...print.outline]);
      setContactAreas(print.contactAreas);
      setPose(print.pose);
      setSource(print.source);
      setColour(print.colour);
      setSize(print.placement.size);
    }
  }, [receipt?.id, wall, shape.length, step]);
  useEffect(() => {
    onSessionLock(busy || uncertain || receipt?.state === "pending");
    return () => onSessionLock(false);
  }, [busy, uncertain, receipt?.state]);
  useEffect(() => {
    try {
      const attempt = JSON.parse(
        sessionStorage.getItem("gmc-handprint-attempt") || "null",
      );
      if (attempt) {
        key.current = attempt.key;
        setUncertain(true);
      }
    } catch {
      sessionStorage.removeItem("gmc-handprint-attempt");
    }
  }, []);
  useEffect(() => {
    if (!uncertain) return;
    let stopped = false,
      checking = false;
    const recover = async () => {
      if (checking) return;
      checking = true;
      try {
        const r: HandprintReceipt = await request("/recovery", {
          method: "POST",
          headers: { Authorization: `Bearer ${key.current}` },
          body: "{}",
        });
        if (stopped) return;
        remember(r);
        setUncertain(false);
        sessionStorage.removeItem("gmc-handprint-attempt");
        if (r.state !== "cancelled") {
          showAccepted(r, name.trim());
          setMessage("");
          void refresh();
        }
      } catch (e) {
        const attempt = JSON.parse(
          sessionStorage.getItem("gmc-handprint-attempt") || "null",
        );
        if (
          !stopped &&
          (e as { status?: number }).status === 404 &&
          Date.now() - (attempt?.startedAt || 0) > 25000
        ) {
          setUncertain(false);
          sessionStorage.removeItem("gmc-handprint-attempt");
          setMessage("This mark was not saved. You can retry your draft.");
        }
      } finally {
        checking = false;
      }
    };
    void recover();
    const t = setInterval(() => void recover(), 2000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [uncertain]);
  useEffect(() => {
    if (receipt?.state !== "pending") return;
    let stopped = false,
      polling = false;
    const update = async () => {
      setRemaining(
        Math.max(
          0,
          Math.ceil(
            (Date.parse(receipt.deadline) - Date.now() - offset.current) / 1000,
          ),
        ),
      );
      if (polling) return;
      polling = true;
      try {
        const r = await request(`/submissions/${receipt.id}`, {
          headers: { Authorization: `Bearer ${receipt.token}` },
        });
        if (!stopped) remember(r);
      } catch {
      } finally {
        polling = false;
      }
    };
    void update();
    const t = setInterval(() => void update(), 500);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [receipt?.id, receipt?.state]);

  const visibleFocus =
    step === "wall" &&
    wall.sections[section]?.prints.some((print) => print.id === focus?.id)
      ? focus
      : null;

  useEffect(() => {
    if (
      !visibleFocus ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setReveal(1);
      return;
    }
    let frame = 0;
    const start = performance.now();
    setReveal(0);
    const animate = (time: number) => {
      const progress = Math.min(1, (time - start) / 850);
      setReveal(progress);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [visibleFocus]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (step !== "wall") {
      paint(
        ctx,
        {
          outline: shape,
          contactAreas,
          pose,
          source,
          colour,
          seed: 71,
          palmName: name.trim(),
        },
        width / 2 + 27,
        height / 2,
        width * 0.68 * size,
      );
      return;
    }

    if (!plaster.current) {
      const background = document.createElement("canvas");
      background.width = width;
      background.height = height;
      const bg = background.getContext("2d")!;
      bg.fillStyle = "#ece2d0";
      bg.fillRect(0, 0, width, height);
      let n = 17;
      for (let i = 0; i < 16000; i++) {
        n = (Math.imul(n, 1664525) + 1013904223) | 0;
        const x = (n >>> 0) % width;
        n = (Math.imul(n, 1664525) + 1013904223) | 0;
        bg.fillStyle = i % 2 ? "#ffffff16" : "#83745a0e";
        bg.fillRect(x, (n >>> 0) % height, 2, 2);
      }
      plaster.current = background;
    }
    ctx.drawImage(plaster.current, 0, 0);
    ctx.save();
    ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);
    const scale = width / HANDPRINT_DEFAULTS.sectionWidth;
    for (const print of wall.sections[section]?.prints || []) {
      const active = print.id === visibleFocus?.id;
      const { x, y, rotation } = print.placement;
      const stampSize = print.placement.size * scale;
      const progress = active ? 1 - (1 - reveal) ** 3 : 1;
      if (active) {
        const radius = stampSize * (0.51 + progress * 0.11);
        ctx.beginPath();
        ctx.arc(x * scale, y * scale, radius, 0, Math.PI * 2);
        ctx.fillStyle = "#fff8df";
        ctx.strokeStyle = "#aa7934";
        ctx.lineWidth = 2.5 / zoom;
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = visibleFocus && !active ? 0.54 : 1;
      paint(
        ctx,
        { ...print, palmName: active ? visibleFocus?.name : undefined },
        x * scale,
        y * scale,
        stampSize * (0.7 + progress * 0.3),
        rotation - (1 - progress) * 0.3,
      );
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }, [
    wall,
    step,
    shape,
    contactAreas,
    pose,
    source,
    paintReady,
    colour,
    size,
    name,
    section,
    zoom,
    pan,
    visibleFocus,
    reveal,
  ]);

  const capture = useCallback(
    (
      points: OutlinePoint[],
      capturedSource: OutlineSource,
      areas?: readonly ContactArea[],
      capturedSize?: number,
      capturedPose?: HandPose,
    ) => {
      setShape(points);
      setContactAreas(areas);
      setPose(capturedPose);
      setSource(capturedSource);
      if (capturedSize !== undefined) setSize(capturedSize);
      setStep(capturedSource === "outline" ? "size" : "customise");
      setMessage("");
    },
    [],
  );

  function clearSearch() {
    setSearchOpen(false);
    setQuery("");
    setMatches([]);
    setMatchedName("");
    setFocus(null);
    setKeyboard(false);
    setMessage("");
  }

  function startNew() {
    clearSearch();
    setShape([]);
    setContactAreas(undefined);
    setPose(undefined);
    setSize(1);
    setColour("terracotta");
    setName("");
    setReceipt(null);
    key.current = randomUUID();
    attemptBody.current = "";
    setStep("capture");
  }

  function focusMatch(match: HandprintSearchMatch, palmName: string) {
    goToSection(match.sectionId);
    const print = wall.sections
      .find((s) => s.id === match.sectionId)
      ?.prints.find((p) => p.id === match.id);
    if (print) {
      const magnification = 1.5;
      const bound = (position: number, span: number) =>
        Math.max(
          -span / 4,
          Math.min(span / 4, (span / 2 - position) * magnification),
        );
      setZoom(magnification);
      setPan({
        x: bound(
          print.placement.x * (width / HANDPRINT_DEFAULTS.sectionWidth),
          width,
        ),
        y: bound(
          print.placement.y * (height / HANDPRINT_DEFAULTS.sectionHeight),
          height,
        ),
      });
    }
    setFocus({ id: match.id, name: palmName });
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    const palmName = query.trim().replace(/ +/g, " ");
    if (!PALM_NAME_PATTERN.test(palmName)) {
      setMessage("Enter the first name or nickname used on the print.");
      return;
    }
    setKeyboard(false);
    setSearchBusy(true);
    setMessage("");
    setMatches([]);
    setFocus(null);
    try {
      const found: HandprintSearchMatch[] = await request("/search", {
        method: "POST",
        body: JSON.stringify({ name: palmName }),
      });
      setMatchedName(palmName);
      setMatches(found);
      setMatchIndex(0);
      if (found.length) {
        focusMatch(found[0], palmName);
        void refresh();
        setMessage(
          found.length === 1
            ? "One matching print found."
            : `${found.length} matching prints found.`,
        );
      } else setMessage("No prints match that name yet.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSearchBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || uncertain || !online) return;
    const palmName = name.trim().replace(/ +/g, " ");
    if (palmName && !PALM_NAME_PATTERN.test(palmName)) {
      setMessage("Use letters, spaces, apostrophes or hyphens in your name.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setKeyboard(false);
    setMessage("");
    const draft: HandprintSubmission = {
      outline: shape,
      ...(contactAreas ? { contactAreas } : {}),
      ...(pose ? { pose } : {}),
      source,
      colour,
      size,
      palmName: palmName || undefined,
    };
    const body = JSON.stringify(draft);
    if (attemptBody.current && attemptBody.current !== body)
      key.current = randomUUID();
    attemptBody.current = body;
    try {
      sessionStorage.setItem(
        "gmc-handprint-attempt",
        JSON.stringify({ key: key.current, startedAt: Date.now() }),
      );
      const r: HandprintReceipt = await request("/submissions", {
        method: "POST",
        headers: { "Idempotency-Key": key.current },
        body,
      });
      remember(r);
      sessionStorage.removeItem("gmc-handprint-attempt");
      showAccepted(r, palmName);
      await refresh();
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status && status < 500)
        sessionStorage.removeItem("gmc-handprint-attempt");
      else setUncertain(true);
      setMessage(
        (e as Error).message ||
          "Submission is temporarily unavailable. Please retry.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function undo() {
    if (!receipt) return;
    setBusy(true);
    try {
      const r = await request(`/submissions/${receipt.id}/undo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${receipt.token}` },
        body: "{}",
      });
      remember(r);
      setFocus(null);
      setStep(shape.length ? "customise" : "capture");
      key.current = randomUUID();
      attemptBody.current = "";
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function panWall(event: PointerEvent<HTMLCanvasElement>) {
    const contact = drag.current;
    if (contact?.id !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const limitX = ((zoom - 1) * width) / 2;
    const limitY = ((zoom - 1) * height) / 2;
    const dx = ((event.clientX - contact.x) * width) / rect.width;
    const dy = ((event.clientY - contact.y) * height) / rect.height;
    setPan(({ x, y }) => ({
      x: Math.max(-limitX, Math.min(limitX, x + dx)),
      y: Math.max(-limitY, Math.min(limitY, y + dy)),
    }));
    contact.x = event.clientX;
    contact.y = event.clientY;
  }

  const pending = receipt?.state === "pending";
  const locked = busy || uncertain || pending;
  const editable = !busy && !uncertain;
  const inWall = step === "wall";
  const keyboardLabel = inWall ? "Search by name" : "Name on your palm";

  return (
    <main className="wall-experience" data-online={online} data-step={step}>
      <header className="wall-heading">
        <p className="eyebrow">
          {inWall ? "Our community, in colour" : handprintWallTitle}
        </p>
        <h1>
          {
            {
              capture: "Place your hand.",
              size: "Choose your size.",
              customise: "Make it your own.",
              wall: handprintWallTitle,
            }[step]
          }
        </h1>
        <p>
          {
            {
              capture:
                "Rest your hand flat, then lift it to reveal your painted impression.",
              size: "Adjust the outline to a size that feels right.",
              customise: "Choose a colour and add a name to the palm.",
              wall: "Every mark belongs here.",
            }[step]
          }
        </p>
      </header>

      <div key={`stage-${step}`} className="wall-stage">
        {step === "capture" ? (
          <HandCapture onCapture={capture} paintReady={paintReady} />
        ) : (
          <canvas
            ref={canvas}
            data-section={inWall ? section : undefined}
            data-print-count={
              inWall ? wall.sections[section]?.prints.length || 0 : undefined
            }
            data-highlight={visibleFocus?.id}
            width={width}
            height={height}
            className={`wall-canvas ${inWall ? "wall-gallery" : "wall-print-preview"}`}
            aria-label={
              inWall ? "Community handprint wall" : "Your handprint preview"
            }
            onPointerDown={(e) => {
              if (!inWall || drag.current || zoom === 1) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
            }}
            onPointerMove={panWall}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
          />
        )}
      </div>

      <section key={`controls-${step}`} className="wall-controls wall-stage">
        {step === "capture" && (
          <>
            <button
              className="primary"
              disabled={!editable}
              onClick={() => {
                setSource("outline");
                setShape(outline());
                setContactAreas(undefined);
                setPose(undefined);
                setStep("size");
              }}
            >
              Use a default hand shape
            </button>
            <button
              className="secondary"
              disabled={!editable}
              onClick={() => setStep("wall")}
            >
              Browse the wall
            </button>
          </>
        )}

        {step === "size" && (
          <>
            <label>
              Print size
              <input
                type="range"
                min={HANDPRINT_DEFAULTS.minSize}
                max={HANDPRINT_DEFAULTS.maxSize}
                step="0.05"
                value={size}
                onChange={(e) => setSize(+e.target.value)}
              />
            </label>
            <button className="primary" onClick={() => setStep("customise")}>
              Continue
            </button>
          </>
        )}

        {step === "customise" && (
          <form onSubmit={submit}>
            <div
              className="paint-palette"
              role="group"
              aria-label="Print colour"
            >
              {Object.entries(PAINT_COLOURS).map(([id, hex]) => (
                <button
                  key={id}
                  type="button"
                  aria-label={id}
                  aria-pressed={colour === id}
                  disabled={!editable}
                  style={{ background: hex }}
                  onClick={() => setColour(id as PaintColourId)}
                >
                  <span>{id}</span>
                </button>
              ))}
            </div>
            <div className="wall-field">
              <label htmlFor="palm-name">
                Name on your palm <small>Optional</small>
              </label>
              <div className="wall-input-row">
                <input
                  id="palm-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={PALM_NAME_MAX}
                  autoComplete="off"
                  inputMode={keyboard ? "none" : "text"}
                  placeholder="First name or nickname"
                  disabled={!editable}
                />
                <button
                  type="button"
                  className="wall-keyboard-toggle"
                  aria-pressed={keyboard}
                  disabled={!editable}
                  onClick={() => setKeyboard(!keyboard)}
                >
                  Keyboard
                </button>
              </div>
            </div>
            <button className="primary" disabled={!editable || !online}>
              {busy ? "Preparing your mark…" : "Submit handprint"}
            </button>
          </form>
        )}

        {inWall && (
          <>
            {receipt && receipt.state !== "cancelled" && (
              <div className="mark-accepted">
                <h2>You are part of this place.</h2>
                {pending ? (
                  <button
                    className="secondary"
                    disabled={busy || remaining === 0}
                    onClick={() => void undo()}
                  >
                    {remaining
                      ? `Undo · ${remaining}s`
                      : "Confirming permanence…"}
                  </button>
                ) : (
                  <p>Your mark is now part of the wall.</p>
                )}
              </div>
            )}
            {!locked && (
              <>
                <div className="wall-toolbar">
                  <button
                    aria-label="Previous section"
                    disabled={section === 0 || searchBusy}
                    onClick={() => {
                      clearSearch();
                      goToSection(`section-${section - 1}`);
                    }}
                  >
                    ←
                  </button>
                  <span>Section {section + 1}</span>
                  <button
                    aria-label="Next section"
                    disabled={section >= wall.sections.length - 1 || searchBusy}
                    onClick={() => {
                      clearSearch();
                      goToSection(`section-${section + 1}`);
                    }}
                  >
                    →
                  </button>
                  <button
                    aria-label="Zoom out"
                    disabled={zoom === 1}
                    onClick={() => {
                      setZoom(Math.max(1, zoom - 0.25));
                      setPan(centre);
                    }}
                  >
                    −
                  </button>
                  <button
                    aria-label="Zoom in"
                    disabled={zoom >= 2}
                    onClick={() => setZoom(Math.min(2, zoom + 0.25))}
                  >
                    +
                  </button>
                </div>
                {searchOpen ? (
                  <form className="wall-search" onSubmit={search}>
                    <div className="wall-field">
                      <label htmlFor="wall-query">Search by name</label>
                      <div className="wall-input-row">
                        <input
                          id="wall-query"
                          placeholder="First name or nickname"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          maxLength={PALM_NAME_MAX}
                          autoComplete="off"
                          inputMode={keyboard ? "none" : "text"}
                          disabled={searchBusy}
                          required
                        />
                        <button
                          className="wall-keyboard-toggle"
                          type="button"
                          aria-pressed={keyboard}
                          disabled={searchBusy}
                          onClick={() => setKeyboard(!keyboard)}
                        >
                          Keyboard
                        </button>
                      </div>
                    </div>
                    <div className="wall-toolbar">
                      <button disabled={searchBusy || !online}>
                        {searchBusy ? "Searching…" : "Find handprint"}
                      </button>
                      {matches.length > 1 && (
                        <button
                          type="button"
                          disabled={searchBusy}
                          onClick={() => {
                            const next = (matchIndex + 1) % matches.length;
                            setMatchIndex(next);
                            focusMatch(matches[next], matchedName);
                          }}
                        >
                          Next match ({matchIndex + 1}/{matches.length})
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={searchBusy}
                        onClick={clearSearch}
                      >
                        Close search
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="wall-gallery-actions">
                    <button className="primary" onClick={startNew}>
                      Leave your mark
                    </button>
                    <button
                      className="secondary"
                      onClick={() => {
                        setSearchOpen(true);
                        setFocus(null);
                      }}
                    >
                      Search the wall
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {(step === "size" || step === "customise") && (
          <button
            className="text-button"
            disabled={!editable}
            onClick={() => {
              setKeyboard(false);
              setMessage("");
              setStep(
                step === "customise" && source === "outline"
                  ? "size"
                  : "capture",
              );
            }}
          >
            ← Back
          </button>
        )}
        {uncertain && (
          <p role="status">
            Checking whether your mark was saved. Please wait for the
            connection.
          </p>
        )}
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        {!online && (
          <p role="status">
            The wall is offline. You can prepare your mark while it reconnects.
          </p>
        )}
        {wall.demo && (
          <p className="demo-label">
            Demo · Simulated moderation · Marks reset when the server restarts
          </p>
        )}
      </section>
      {keyboard && (
        <TouchKeyboard
          nameKeys
          label={keyboardLabel}
          onClose={() => setKeyboard(false)}
          onType={(letter) => {
            const update = inWall ? setQuery : setName;
            update((value) =>
              letter === "⌫"
                ? value.slice(0, -1)
                : (value + letter).slice(0, PALM_NAME_MAX),
            );
          }}
        />
      )}
    </main>
  );
}
