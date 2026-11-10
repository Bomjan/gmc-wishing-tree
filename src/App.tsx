import { useEffect, useRef, useState, type FormEvent } from "react";
import { Scene } from "./Scene";
import { api, connectForest, loadForest, useSanctuary } from "./state";
import { activeTree, type Locator, type Receipt } from "./shared";
import { ReachHandle, useReachablePanel } from "./shared/kiosk/reach";
function LeafIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="26"
      height="26"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M26 5C12 3 5 10 7 20c2 9 19 10 19-15Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5 28 23 9M12 21l-1-7m6 2 6 1"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="10.5"
        cy="10.5"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function MountainIcon() {
  return (
    <svg
      width="25"
      height="24"
      viewBox="0 0 28 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m2 21 9-17 6 10 4-7 6 14H2ZM8 10l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
const idleSeconds = Number(import.meta.env.VITE_IDLE_SECONDS || 90),
  highlightSeconds = Number(import.meta.env.VITE_HIGHLIGHT_SECONDS || 12);
export default function App() {
  const { forest, online, view, receipt, selection, focus } = useSanctuary();
  const reach = useReachablePanel(view);
  const [username, setUsername] = useState(""),
    [wish, setWish] = useState(""),
    [search, setSearch] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [keyboard, setKeyboard] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [toolsOpen, setToolsOpen] = useState(false),
    [active, setActive] = useState<"username" | "wish" | "search">("username"),
    [remaining, setRemaining] = useState(10),
    [config, setConfig] = useState({
      usernameMin: 3,
      usernameMax: 24,
      wishMax: 500,
    });
  const key = useRef<string | null>(null),
    lastInput = useRef(Date.now()),
    offset = useRef(0),
    highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    requesting = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null),
    wishRef = useRef<HTMLTextAreaElement>(null),
    searchRef = useRef<HTMLInputElement>(null);
  const current = activeTree(forest.trees, selection?.treeId || focus),
    count = current?.leaves.length || 0;
  function remember(value: Receipt) {
    offset.current = Date.parse(value.serverTime) - Date.now();
    useSanctuary.getState().set({ receipt: value });
    sessionStorage.setItem("gmc-pending", JSON.stringify(value));
    if (value.state !== "pending") sessionStorage.removeItem("gmc-pending");
  }
  function clearPrivate() {
    setToolsOpen(false);
    setSearchOpen(false);
    setUsername("");
    setWish("");
    setSearch("");
    setMessage("");
    setKeyboard(false);
    key.current = null;
    sessionStorage.removeItem("gmc-attempt");
    sessionStorage.removeItem("gmc-pending");
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    useSanctuary.getState().reset();
  }
  function focusLeaf(locator: Locator) {
    const state = useSanctuary.getState();
    state.set({
      selection: locator,
      focus: locator.treeId,
      cameraRevision: state.cameraRevision + 1,
    });
  }
  useEffect(() => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    if (selection)
      highlightTimer.current = setTimeout(
        () => useSanctuary.getState().set({ selection: null }),
        highlightSeconds * 1000,
      );
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, [selection]);
  useEffect(() => {
    const disconnect = connectForest();
    void api<typeof config>("/config")
      .then(setConfig)
      .catch(() => {});
    const attempt = sessionStorage.getItem("gmc-attempt");
    if (attempt) {
      key.current = attempt;
      void api<Receipt>("/recovery", {
        method: "POST",
        headers: { Authorization: `Bearer ${attempt}` },
        body: "{}",
      })
        .then((value) => {
          remember(value);
          if (value.state !== "cancelled") {
            useSanctuary.getState().go("accepted", value.treeId);
            sessionStorage.removeItem("gmc-attempt");
          }
        })
        .catch(() => {});
    }
    const pending = sessionStorage.getItem("gmc-pending");
    if (pending) {
      try {
        const r = JSON.parse(pending) as Receipt;
        void api<Receipt>(`/submissions/${r.id}`, {
          headers: { Authorization: `Bearer ${r.token}` },
        })
          .then((value) => {
            remember(value);
            if (value.state !== "cancelled")
              useSanctuary.getState().go("accepted", value.treeId);
          })
          .catch(() => {
            useSanctuary.getState().set({ receipt: r });
            useSanctuary.getState().go("accepted", r.treeId);
          });
      } catch {
        sessionStorage.removeItem("gmc-pending");
      }
    }
    const activity = () => {
      lastInput.current = Date.now();
    };
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    window.addEventListener("pointermove", activity, { passive: true });
    window.addEventListener("wheel", activity, { passive: true });
    const timer = setInterval(() => {
      if (
        Date.now() - lastInput.current > idleSeconds * 1000 &&
        !requesting.current &&
        useSanctuary.getState().receipt?.state !== "pending"
      ) {
        clearPrivate();
        reach.resetPosition();
        lastInput.current = Date.now();
      }
    }, 1000);
    return () => {
      disconnect();
      clearInterval(timer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("pointermove", activity);
      window.removeEventListener("wheel", activity);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!receipt || receipt.state !== "pending") return;
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
        const value = await api<Receipt>(`/submissions/${receipt.id}`, {
          headers: { Authorization: `Bearer ${receipt.token}` },
        });
        if (!stopped) remember(value);
      } catch {
      } finally {
        polling = false;
      }
    };
    void update();
    const timer = setInterval(() => void update(), 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [receipt?.id, receipt?.state]);
  useEffect(() => {
    const queue = useSanctuary.getState().animations;
    if (!queue.length) return;
    const timer = setInterval(() => {
      const s = useSanctuary.getState();
      s.set({ animations: s.animations.slice(1) });
    }, 650);
    return () => clearInterval(timer);
  }, [forest]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (requesting.current) return;
    requesting.current = true;
    setBusy(true);
    setMessage("");
    key.current ??= crypto.randomUUID();
    sessionStorage.setItem("gmc-attempt", key.current);
    try {
      const value = await api<Receipt>("/submissions", {
        method: "POST",
        headers: { "Idempotency-Key": key.current },
        body: JSON.stringify({ username, wish }),
      });
      remember(value);
      setUsername("");
      setWish("");
      setKeyboard(false);
      setSearch("");
      sessionStorage.removeItem("gmc-attempt");
      await loadForest();
      if (value.state === "cancelled") {
        setMessage("This wish was undone. You can start again.");
        key.current = null;
        return;
      }
      useSanctuary.getState().go("accepted", value.treeId);
      focusLeaf(value);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      requesting.current = false;
      setBusy(false);
    }
  }
  async function undo() {
    if (!receipt || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const value = await api<Receipt>(`/submissions/${receipt.id}/undo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${receipt.token}` },
        body: "{}",
      });
      remember(value);
      await loadForest();
      clearPrivate();
      setMessage("Your wish was undone. You can begin again.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function locate(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const found = await api<Locator>("/locate", {
        method: "POST",
        body: JSON.stringify({ username: search }),
      });
      await loadForest();
      focusLeaf(found);
      setSearch("");
      setKeyboard(false);
      setMessage("Your leaf is here.");
      setToolsOpen(false);
      setSearchOpen(false);
    } catch (e) {
      useSanctuary.getState().set({ selection: null });
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(field: "username" | "wish", value: string) {
    if (field === "username") setUsername(value);
    else setWish(value);
    key.current = null;
    sessionStorage.removeItem("gmc-attempt");
  }
  function type(value: string) {
    const el =
      active === "wish"
        ? wishRef.current
        : active === "username"
          ? inputRef.current
          : searchRef.current;
    const prev =
      active === "wish" ? wish : active === "username" ? username : search;
    let start = el?.selectionStart ?? prev.length,
      end = el?.selectionEnd ?? start;
    let next;
    if (value === "⌫") {
      if (start === end) start = Math.max(0, start - 1);
      next = prev.slice(0, start) + prev.slice(end);
    } else next = prev.slice(0, start) + value + prev.slice(end);
    const max = active === "wish" ? config.wishMax : config.usernameMax;
    if (next.length > max) return;
    if (active === "search") setSearch(next);
    else edit(active, next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(
        start + (value === "⌫" ? 0 : value.length),
        start + (value === "⌫" ? 0 : value.length),
      );
    });
  }
  const heightHandle = (
    <ReachHandle
      position={reach.position}
      onChange={reach.setPosition}
      stageRef={reach.stageRef}
      panelRef={reach.panelRef}
    />
  );
  const touchKeyboard = keyboard && (
    <div
      className="touch-keyboard"
      role="group"
      aria-label="On-screen keyboard"
      onPointerDown={(e) => e.preventDefault()}
    >
      <div className="keyboard-heading">
        <span>
          {active === "wish"
            ? "Your wish"
            : active === "search"
              ? "Find your username"
              : "Username"}
        </span>
        <button onClick={() => setKeyboard(false)} aria-label="Close keyboard">
          ✕
        </button>
      </div>
      {["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"].map((row) => (
        <div className="key-row" key={row}>
          {row.split("").map((letter) => (
            <button type="button" key={letter} onClick={() => type(letter)}>
              {letter}
            </button>
          ))}
        </div>
      ))}
      <div className="key-row">
        <button onClick={() => type("_")}>_</button>
        <button onClick={() => type(".")}>.</button>
        <button className="space-key" onClick={() => type(" ")}>
          Space
        </button>
        <button onClick={() => type("⌫")} aria-label="Backspace">
          ⌫
        </button>
      </div>
    </div>
  );
  return (
    <main
      className="sanctuary"
      ref={reach.stageRef}
      data-online={online}
      onPointerDown={(event) => {
        lastInput.current = Date.now();
        if (event.target instanceof HTMLCanvasElement) {
          setToolsOpen(false);
          setSearchOpen(false);
          setKeyboard(false);
        }
      }}
    >
      <Scene />

      <section
        className={`panel ${view === "mountain" ? "panel-mountain" : ""} ${view === "home" || view === "mountain" ? "panel-welcome" : ""}`}
        aria-label="Wishing Tree interaction"
        ref={reach.panelRef}
      >
        {view !== "form" && view !== "accepted" && heightHandle}
        {view === "form" ? (
          <>
            <div className="sheet-header">
              <h1>Make a wish</h1>
              {heightHandle}
              <button
                className="sheet-back"
                aria-label="Back to the tree"
                onClick={() => {
                  if (!busy) clearPrivate();
                }}
                disabled={busy}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="m14 6-6 6 6 6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Back
              </button>
            </div>
            <form onSubmit={submit} className="wish-form">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                ref={inputRef}
                value={username}
                onChange={(e) => edit("username", e.target.value)}
                onFocus={() => setActive("username")}
                inputMode={keyboard ? "none" : "text"}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                minLength={config.usernameMin}
                maxLength={config.usernameMax}
                pattern="[a-zA-Z0-9_]+"
                placeholder="Your unique username"
                aria-describedby="username-help"
                required
                disabled={busy}
              />
              <p className="field-help" id="username-help">
                {config.usernameMin}–{config.usernameMax} letters, numbers or _.
              </p>
              <label htmlFor="wish">Your wish</label>
              <textarea
                id="wish"
                ref={wishRef}
                value={wish}
                onChange={(e) => edit("wish", e.target.value)}
                onFocus={() => setActive("wish")}
                inputMode={keyboard ? "none" : "text"}
                maxLength={config.wishMax}
                placeholder="What do you hope for?"
                rows={3}
                required
                disabled={busy}
              />
              <div className="field-meta">
                <span>English</span>
                <button
                  type="button"
                  className="inline-keyboard"
                  aria-label="Toggle on-screen keyboard"
                  aria-pressed={keyboard}
                  onClick={() => setKeyboard(!keyboard)}
                >
                  Keyboard
                </button>
                <span>
                  {wish.length} / {config.wishMax}
                </span>
              </div>
              <p className="privacy">
                Only your leaf is public. One wish per username.
              </p>
              <button className="primary" disabled={busy || !online}>
                <LeafIcon />
                {busy ? "Tending your wish…" : "Let my wish take root"}
              </button>
            </form>
            {touchKeyboard}
          </>
        ) : view === "accepted" ? (
          <div className="acceptance">
            <div className="receipt-header">
              <h1>Your wish has taken root.</h1>
              {heightHandle}
            </div>
            <div className="receipt-actions">
              {receipt?.state === "pending" ? (
                <>
                  <button
                    className="secondary"
                    onClick={undo}
                    disabled={busy || remaining === 0}
                  >
                    {busy
                      ? "Undoing…"
                      : remaining > 0
                        ? `Undo · ${remaining}s`
                        : "Confirming your leaf…"}
                  </button>
                </>
              ) : (
                <p className="rooted">Permanently rooted</p>
              )}
              <button
                className="primary"
                aria-label="Return to the tree"
                onClick={() => {
                  clearPrivate();
                  reach.resetPosition();
                }}
                disabled={busy}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="minimal-dock">
              <button
                className="primary"
                onClick={() => {
                  setMessage("");
                  setSearch("");
                  setSearchOpen(false);
                  setToolsOpen(false);
                  setKeyboard(false);
                  key.current = null;
                  useSanctuary.getState().set({ selection: null });
                  useSanctuary.getState().go("form", current?.id || null);
                }}
              >
                <LeafIcon />
                <span>Make a wish</span>
              </button>
              <button
                className="dock-options"
                aria-label="More options"
                aria-expanded={toolsOpen}
                aria-controls="tree-tools"
                onClick={() => {
                  setToolsOpen(!toolsOpen);
                  setSearchOpen(false);
                  setSearch("");
                  setKeyboard(false);
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="5" cy="12" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="19" cy="12" r="1.5" />
                </svg>
                <span>More</span>
              </button>
            </div>
            <p className="dock-caption">
              {forest.demo && <span>Demo</span>}
              <span>{count} / 108 leaves</span>
            </p>
            <div
              id="tree-tools"
              className="dock-tools"
              data-side={reach.position < 0.5 ? "below" : "above"}
              hidden={!toolsOpen}
              role="group"
              aria-label="Explore controls"
            >
              <button
                className="tool-action"
                aria-expanded={searchOpen}
                aria-controls="leaf-search"
                onClick={() => {
                  setSearchOpen(!searchOpen);
                  setSearch("");
                  setMessage("");
                  setKeyboard(false);
                }}
              >
                <SearchIcon />
                {searchOpen ? "Close leaf search" : "Find my leaf"}
              </button>
              <div id="leaf-search" hidden={!searchOpen}>
                <form className="search-form" onSubmit={locate}>
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => setActive("search")}
                    inputMode={keyboard ? "none" : "text"}
                    maxLength={24}
                    autoCapitalize="none"
                    autoComplete="off"
                    aria-label="Find your username"
                    placeholder="Find your username"
                    required
                  />
                  <button
                    type="submit"
                    aria-label="Find leaf"
                    disabled={busy || !online}
                  >
                    ↗
                  </button>
                </form>
                <button
                  type="button"
                  className="inline-keyboard"
                  aria-label="Toggle on-screen keyboard"
                  aria-pressed={keyboard}
                  onClick={() => {
                    setActive("search");
                    setKeyboard(!keyboard);
                  }}
                >
                  Keyboard
                </button>
                {touchKeyboard}
              </div>
              <button
                className="tool-action"
                onClick={() => {
                  setMessage("");
                  setSearch("");
                  setSearchOpen(false);
                  setToolsOpen(false);
                  setKeyboard(false);
                  useSanctuary.getState().set({ selection: null });
                  useSanctuary
                    .getState()
                    .go(view === "mountain" ? "home" : "mountain", null);
                }}
              >
                <MountainIcon />
                {view === "mountain"
                  ? "Back to current tree"
                  : "View all trees"}
              </button>
              <button
                className="tool-action"
                onClick={() => {
                  setToolsOpen(false);
                  useSanctuary.getState().set({ selection: null });
                  useSanctuary.getState().go("home", null);
                }}
              >
                Reset view
              </button>
              <div
                className="reach-options"
                role="group"
                aria-label="Adjust controls height"
              >
                <button
                  onClick={() => reach.setPosition(reach.position - 0.06)}
                >
                  Higher
                </button>
                <button
                  onClick={() => reach.setPosition(reach.position + 0.06)}
                >
                  Lower
                </button>
                <button onClick={reach.resetPosition}>Default height</button>
              </div>
              <p className="tools-hint">
                Drag to turn · Pinch or scroll to zoom
              </p>
            </div>
          </>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        {!online && (
          <p className="offline" role="status">
            Connection interrupted. The tree is still here; submissions will
            resume when connected.
          </p>
        )}
      </section>
    </main>
  );
}
