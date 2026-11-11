import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { randomUUID } from "../../shared/randomUUID";
import { TouchKeyboard } from "../../shared/ui/TouchKeyboard";
import { signatureOverlaps } from "../../shared/signature-overlap";
import {
  PEN_COLOURS,
  SIGNATURE_LIMITS,
  SIGNATURE_WALL_ASPECT,
  USERNAME_PATTERN,
  hasLine,
  type PenColour,
  type PublicSignature,
  type SignatureMatch,
  type SignaturePage,
  type SignaturePlacement,
  type SignatureReceipt,
  type Stroke,
} from "../../shared/signatures";
import DrawingPad from "./DrawingPad";
import { DrawingPanel } from "./DrawingPanel";
import { WallSurface } from "./WallSurface";

const demo = import.meta.env.VITE_DEMO === "true";
const receiptKey = "gmc-signature-receipt";
const attemptKey = "gmc-signature-attempt";
const empty: SignaturePage = {
  demo,
  section: 0,
  sectionCount: 1,
  signatures: [],
};
type Step = "wall" | "draw" | "place";

function saved<T>(key: string): T | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function saveSession(key: string, value?: object) {
  try {
    if (value) sessionStorage.setItem(key, JSON.stringify(value));
    else sessionStorage.removeItem(key);
  } catch {}
}

export default function Wall({
  onSessionLock,
}: {
  onSessionLock: (locked: boolean) => void;
}) {
  const [receipt, setReceipt] = useState(() =>
    saved<SignatureReceipt>(receiptKey),
  );
  const [attempt, setAttempt] = useState(() =>
    saved<{ key: string; startedAt: number }>(attemptKey),
  );
  const [step, setStep] = useState<Step>("wall");
  const [section, setSection] = useState(receipt?.placement.section ?? 0);
  const [page, setPage] = useState(empty);
  const [online, setOnline] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [colour, setColour] = useState<PenColour>("blue");
  const [username, setUsername] = useState("");
  const [placement, setPlacement] = useState<SignaturePlacement>();
  const [wallAspect, setWallAspect] = useState(SIGNATURE_WALL_ASPECT);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [matches, setMatches] = useState<SignatureMatch[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [highlight, setHighlight] = useState<string>();
  const [landing, setLanding] = useState<PublicSignature>();
  const [keyboard, setKeyboard] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number>(
    SIGNATURE_LIMITS.undoSeconds,
  );

  const kioskSession = useRef(randomUUID());
  const wall = useRef<HTMLElement>(null);
  const selectedSection = useRef(section);
  const requestVersion = useRef(0);
  const receiptVersion = useRef(0);
  const submission = useRef({ body: "", key: randomUUID() });
  const submitting = useRef(false);
  const clockOffset = useRef(
    receipt ? Date.parse(receipt.serverTime) - Date.now() : 0,
  );

  const request = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const response = await fetch(`/api/signatures${path}`, {
        ...options,
        signal: AbortSignal.timeout(25000),
        headers: {
          "Content-Type": "application/json",
          "X-Kiosk-Session": kioskSession.current,
          ...options.headers,
        },
      });
      const data = await response.json();
      if (!response.ok)
        throw Object.assign(new Error(data.message || "Please try again."), {
          status: response.status,
        });
      return data;
    },
    [],
  );

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    const section = selectedSection.current;
    try {
      const data: SignaturePage = await request(`/sections/${section}`);
      if (version !== requestVersion.current) return;
      if (data.demo !== demo) throw new Error("Demo settings do not match.");
      setPage(data);
      setOnline(true);
    } catch {
      if (version === requestVersion.current) setOnline(false);
    }
  }, [request]);

  const goToSection = useCallback(
    (next: number) => {
      selectedSection.current = next;
      setSection(next);
      setPlacement(undefined);
      void refresh();
    },
    [refresh],
  );

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    function connect() {
      if (stopped) return;
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
      );
      socket.onopen = () => void refresh();
      socket.onmessage = ({ data }) => {
        try {
          if (JSON.parse(data).type === "signature_changed") void refresh();
        } catch {}
      };
      socket.onclose = () => {
        if (!stopped) retry = setTimeout(connect, 2000);
      };
      socket.onerror = () => socket.close();
    }
    void refresh();
    connect();
    const poll = setInterval(() => void refresh(), 10000);
    return () => {
      stopped = true;
      requestVersion.current++;
      clearTimeout(retry);
      clearInterval(poll);
      socket?.close();
    };
  }, [refresh]);

  const remember = useCallback((next: SignatureReceipt) => {
    receiptVersion.current++;
    clockOffset.current = Date.parse(next.serverTime) - Date.now();
    setReceipt(next);
    setRemaining(
      Math.max(
        0,
        Math.ceil(
          (Date.parse(next.deadline) - Date.parse(next.serverTime)) / 1000,
        ),
      ),
    );
    if (next.state === "pending") saveSession(receiptKey, next);
    else saveSession(receiptKey);
  }, []);

  const showAccepted = useCallback(
    (next: SignatureReceipt, submittedStrokes?: readonly Stroke[]) => {
      remember(next);
      setAttempt(null);
      saveSession(attemptKey);
      setStep("wall");
      setKeyboard(false);
      setSearchOpen(false);
      setMatches([]);
      const visible = next.state === "pending" || next.state === "finalised";
      setHighlight(undefined);
      if (visible && submittedStrokes) {
        const mark: PublicSignature = {
          id: next.id,
          placement: next.placement,
          strokes: submittedStrokes,
          state: next.state === "pending" ? "pending" : "finalised",
        };
        setPage((current) => {
          if (
            current.section !== mark.placement.section ||
            current.signatures.some(({ id }) => id === mark.id)
          )
            return current;
          return { ...current, signatures: [...current.signatures, mark] };
        });
        setLanding(mark);
      }
      goToSection(next.placement.section);
      setMessage(
        visible
          ? "Your signature is on the wall."
          : "Your signature was removed.",
      );
    },
    [goToSection, remember],
  );
  const finishLanding = useCallback(() => setLanding(undefined), []);

  const pending = receipt?.state === "pending";
  const locked = busy || Boolean(attempt) || pending;
  useEffect(() => {
    onSessionLock(locked);
    return () => onSessionLock(false);
  }, [locked, onSessionLock]);

  useEffect(() => {
    if (!attempt) return;
    let stopped = false,
      checking = false;
    async function recover() {
      if (checking || submitting.current || !attempt) return;
      checking = true;
      try {
        const result: SignatureReceipt = await request("/recovery", {
          method: "POST",
          headers: { Authorization: `Bearer ${attempt.key}` },
          body: "{}",
        });
        if (!stopped) showAccepted(result);
      } catch (error) {
        if (
          !stopped &&
          (error as { status?: number }).status === 404 &&
          Date.now() - attempt.startedAt >= 25000
        ) {
          setAttempt(null);
          saveSession(attemptKey);
          setMessage("Your signature was not saved. Please try again.");
        }
      } finally {
        checking = false;
      }
    }
    void recover();
    const timer = setInterval(() => void recover(), 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [attempt, request, showAccepted]);

  useEffect(() => {
    if (!pending || !receipt) return;
    let stopped = false,
      checking = false;
    const { id, token, deadline } = receipt;
    async function check() {
      if (checking) return;
      checking = true;
      const version = receiptVersion.current;
      try {
        const result: SignatureReceipt = await request(`/submissions/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!stopped && version === receiptVersion.current) remember(result);
      } catch (error) {
        if (
          !stopped &&
          version === receiptVersion.current &&
          (error as { status?: number }).status === 401
        ) {
          setReceipt(null);
          saveSession(receiptKey);
          setMessage("This signature receipt is no longer available.");
        }
      } finally {
        checking = false;
      }
    }
    void check();
    const timer = setInterval(() => {
      const seconds = Math.ceil(
        (Date.parse(deadline) - Date.now() - clockOffset.current) / 1000,
      );
      setRemaining(Math.max(0, seconds));
      if (seconds <= 0) void check();
    }, 500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pending, receipt?.id, request, remember]);

  useEffect(() => {
    const surface = wall.current;
    if (!surface) return;
    const observer = new ResizeObserver(([{ contentRect }]) => {
      if (contentRect.width > 0 && contentRect.height > 0)
        setWallAspect(contentRect.width / contentRect.height);
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);

  const marks = page.section === section ? page.signatures : [];
  const occupied = Boolean(
    placement && signatureOverlaps({ placement, strokes }, marks, wallAspect),
  );
  const readyToDraw = hasLine(strokes);
  const sectionCount = Math.max(page.sectionCount, section + 1);

  function startDrawing() {
    submission.current = { body: "", key: randomUUID() };
    setStrokes([]);
    setColour("blue");
    setUsername("");
    setQuery("");
    setHighlight(undefined);
    setMatches([]);
    setSearchOpen(false);
    setMessage("");
    setStep("draw");
  }

  function continueToPlacement(event: FormEvent) {
    event.preventDefault();
    if (!readyToDraw || !USERNAME_PATTERN.test(username.trim())) return;
    setPlacement(undefined);
    setMessage("");
    setKeyboard(false);
    setStep("place");
  }

  async function submit() {
    if (
      submitting.current ||
      locked ||
      !placement ||
      occupied ||
      !online ||
      page.section !== section
    )
      return;
    const body = JSON.stringify({
      username: username.trim(),
      strokes,
      placement,
      wallAspect,
    });
    if (submission.current.body !== body)
      submission.current = { body, key: randomUUID() };
    const pendingAttempt = {
      key: submission.current.key,
      startedAt: Date.now(),
    };
    submitting.current = true;
    setBusy(true);
    setMessage("");
    saveSession(attemptKey, pendingAttempt);
    try {
      const accepted: SignatureReceipt = await request("/submissions", {
        method: "POST",
        headers: { "Idempotency-Key": pendingAttempt.key },
        body,
      });
      showAccepted(accepted, strokes);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status && status < 500) {
        saveSession(attemptKey);
        setMessage((error as Error).message);
        void refresh();
      } else {
        setAttempt(pendingAttempt);
        setMessage("Checking whether your signature was saved.");
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function undo() {
    if (!receipt || busy) return;
    setBusy(true);
    try {
      remember(
        await request(`/submissions/${receipt.id}/undo`, {
          method: "POST",
          headers: { Authorization: `Bearer ${receipt.token}` },
          body: "{}",
        }),
      );
      finishLanding();
      setHighlight(undefined);
      setMessage("Signature removed.");
      if (strokes.length) setStep("place");
      void refresh();
      submission.current = { body: "", key: randomUUID() };
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reveal(match: SignatureMatch, index: number) {
    setHighlight(match.id);
    setMatchIndex(index);
    goToSection(match.section);
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!USERNAME_PATTERN.test(query.trim()) || searchBusy) return;
    setSearchBusy(true);
    setKeyboard(false);
    setMatches([]);
    setHighlight(undefined);
    try {
      const found: SignatureMatch[] = await request("/search", {
        method: "POST",
        body: JSON.stringify({ username: query.trim() }),
      });
      setQuery("");
      setMatches(found);
      if (found.length) {
        reveal(found[0], 0);
        setMessage("Signature found.");
      } else setMessage("No signatures found for that username.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSearchBusy(false);
    }
  }

  function typeUsername(key: string) {
    const setter = step === "draw" ? setUsername : setQuery;
    setter((value) =>
      key === "⌫"
        ? value.slice(0, -1)
        : /^[a-z0-9_]$/i.test(key)
          ? (value + key).slice(0, 24)
          : value,
    );
  }

  function browse(next: number) {
    finishLanding();
    setHighlight(undefined);
    setMatches([]);
    setMessage("");
    goToSection(next);
  }

  const status = (
    <p className="signature-status" role="status">
      {occupied
        ? "This spot is occupied. Try another spot."
        : message || (!online ? "Connecting to the wall…" : "")}
    </p>
  );

  return (
    <main
      ref={wall}
      className="signature-experience"
      data-step={step}
      data-online={online}
    >
      <WallSurface
        section={section}
        signatures={marks}
        highlight={highlight}
        landing={landing}
        onLanded={finishLanding}
        occupied={occupied}
        draft={step === "place" ? strokes : undefined}
        placement={placement}
        onPlace={
          step === "place" && !locked
            ? (spot) => {
                setPlacement(spot);
                setMessage("");
              }
            : undefined
        }
      />
      <header className="signature-heading">
        <h1>Wall of Signatures</h1>
        {step === "place" && <p>Tap an open spot to place your signature.</p>}
        {demo && (
          <p className="signature-help">
            Demo · Drawings reset when the server restarts
          </p>
        )}
      </header>
      {step === "draw" ? (
        <DrawingPanel onSubmit={continueToPlacement}>
          <p>Sign with your finger and add doodles around it.</p>
          <div
            className="signature-palette"
            role="group"
            aria-label="Pen colour"
          >
            {Object.entries(PEN_COLOURS).map(([pen, hex]) => (
              <button
                key={pen}
                type="button"
                aria-label={pen}
                aria-pressed={colour === pen}
                style={{ backgroundColor: hex }}
                onClick={() => setColour(pen as PenColour)}
              />
            ))}
          </div>
          <DrawingPad
            strokes={strokes}
            colour={colour}
            onStroke={(stroke) => {
              setStrokes((current) => [...current, stroke]);
              setMessage("");
            }}
            onLimit={() =>
              setMessage("Drawing limit reached. Undo a stroke to add more.")
            }
          />
          <div className="signature-row">
            <button
              type="button"
              disabled={!strokes.length}
              onClick={() => setStrokes((current) => current.slice(0, -1))}
            >
              Undo stroke
            </button>
            <button
              type="button"
              disabled={!strokes.length}
              onClick={() => setStrokes([])}
            >
              Clear drawing
            </button>
          </div>
          <label htmlFor="signature-username">Username</label>
          <div className="signature-row signature-input">
            <input
              id="signature-username"
              value={username}
              autoComplete="off"
              spellCheck={false}
              maxLength={24}
              inputMode={keyboard ? "none" : "text"}
              onFocus={() => setKeyboard(true)}
              onChange={(e) => setUsername(e.target.value)}
            />
            <button
              type="button"
              aria-pressed={keyboard}
              onClick={() => setKeyboard(!keyboard)}
            >
              Keyboard
            </button>
          </div>
          <p className="signature-help">
            Use 3–24 letters, numbers or underscores. Your username is private
            and used to find your signature.
          </p>
          {keyboard && (
            <TouchKeyboard
              label="Username"
              onType={typeUsername}
              onClose={() => setKeyboard(false)}
            />
          )}
          <div className="signature-row">
            <button
              type="button"
              onClick={() => {
                setUsername("");
                setStrokes([]);
                setStep("wall");
                setKeyboard(false);
                setMessage("");
              }}
            >
              Back to wall
            </button>
            <button
              className="primary"
              disabled={!readyToDraw || !USERNAME_PATTERN.test(username.trim())}
            >
              Choose a spot
            </button>
          </div>
          {status}
        </DrawingPanel>
      ) : (
        <div className="signature-dock">
          {status}
          {sectionCount > 1 && (
            <nav
              className="signature-pagination signature-sections"
              aria-label="Browse wall sections"
            >
              <button
                type="button"
                aria-label="Previous section"
                disabled={section === 0 || locked || searchBusy}
                onClick={() => browse(section - 1)}
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Next section"
                disabled={section + 1 >= sectionCount || locked || searchBusy}
                onClick={() => browse(section + 1)}
              >
                →
              </button>
            </nav>
          )}
          {step === "place" ? (
            <div className="signature-row">
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  setStep("draw");
                  setMessage("");
                }}
              >
                Back to drawing
              </button>
              <button
                className="primary"
                type="button"
                disabled={
                  locked ||
                  !placement ||
                  occupied ||
                  !online ||
                  page.section !== section
                }
                onClick={() => void submit()}
              >
                {busy ? "Placing signature…" : "Place signature"}
              </button>
            </div>
          ) : pending ? (
            <button
              className="signature-undo"
              type="button"
              disabled={busy || remaining <= 0}
              onClick={() => void undo()}
            >
              Undo · {remaining}s
            </button>
          ) : (
            <div className="signature-row">
              <button
                className="primary"
                type="button"
                disabled={locked || searchBusy}
                onClick={startDrawing}
              >
                Add your signature
              </button>
              <button
                type="button"
                disabled={locked || searchBusy}
                aria-expanded={searchOpen}
                onClick={() => {
                  setSearchOpen(!searchOpen);
                  setKeyboard(false);
                  setQuery("");
                  setMessage("");
                }}
              >
                Find a signature
              </button>
            </div>
          )}
          {step === "wall" && searchOpen && !pending && (
            <form className="signature-search" onSubmit={search}>
              <label htmlFor="signature-search">Search by username</label>
              <div className="signature-row signature-input">
                <input
                  id="signature-search"
                  value={query}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={24}
                  inputMode={keyboard ? "none" : "text"}
                  onFocus={() => setKeyboard(true)}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={searchBusy || !USERNAME_PATTERN.test(query.trim())}
                >
                  Find
                </button>
              </div>
              {keyboard && (
                <TouchKeyboard
                  label="Search by username"
                  onType={typeUsername}
                  onClose={() => setKeyboard(false)}
                />
              )}
              {matches.length > 1 && (
                <div className="signature-pagination">
                  <span>
                    Match {matchIndex + 1} of {matches.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = (matchIndex + 1) % matches.length;
                      reveal(matches[next], next);
                    }}
                  >
                    Next match
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      )}
    </main>
  );
}
