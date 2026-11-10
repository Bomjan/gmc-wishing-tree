import { useEffect, useRef, useState, type FormEvent } from "react";
import { Scene } from "./Scene";
import { api, connectForest, loadForest, useSanctuary } from "./state";
import type { Locator, Receipt } from "./shared";
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
  const { forest, online, view, receipt } = useSanctuary();
  const [username, setUsername] = useState(""),
    [wish, setWish] = useState(""),
    [search, setSearch] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [keyboard, setKeyboard] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
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
  const current =
      forest.trees.find((t) => t.leaves.length < 108) || forest.trees.at(-1),
    count = current?.leaves.length || 0,
    total = forest.trees.reduce((a, t) => a + t.leaves.length, 0);
  function remember(value: Receipt) {
    offset.current = Date.parse(value.serverTime) - Date.now();
    useSanctuary.getState().set({ receipt: value });
    sessionStorage.setItem("gmc-pending", JSON.stringify(value));
    if (value.state !== "pending") sessionStorage.removeItem("gmc-pending");
  }
  function clearPrivate() {
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
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(
      () => useSanctuary.getState().set({ selection: null }),
      highlightSeconds * 1000,
    );
  }
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
    const timer = setInterval(() => {
      if (
        Date.now() - lastInput.current > idleSeconds * 1000 &&
        !requesting.current
      ) {
        clearPrivate();
        lastInput.current = Date.now();
      }
    }, 1000);
    return () => {
      disconnect();
      clearInterval(timer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
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
  return (
    <main
      className="sanctuary"
      data-online={online}
      onPointerDown={() => {
        lastInput.current = Date.now();
      }}
    >
      <Scene />
      <div className="sun-wash" />

      <section
        className={`panel ${view === "mountain" ? "panel-mountain" : ""} ${view === "home" || view === "mountain" ? "panel-welcome" : ""}`}
        aria-label="Wishing Tree interaction"
      >
        {view === "form" ? (
          <>
            <button
              className="text-button back"
              onClick={() => {
                if (!busy) clearPrivate();
              }}
              disabled={busy}
            >
              ← Back to the tree
            </button>
            <h1>
              Plant a little
              <br />
              possibility.
            </h1>
            <p className="intro">
              One wish. One leaf. A future we grow together.
            </p>
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
                placeholder="Choose your unique username"
                required
                disabled={busy}
              />
              <p className="field-help">
                {config.usernameMin}–{config.usernameMax} letters, numbers or
                underscores. Keep it to find your leaf.
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
                rows={4}
                required
                disabled={busy}
              />
              <div className="field-meta">
                <span>In English, with kindness.</span>
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
                Your wish is private. Only your leaf will be visible. One wish
                per username.
              </p>
              <button className="primary" disabled={busy || !online}>
                <LeafIcon />
                {busy ? "Tending your wish…" : "Let my wish take root"}
              </button>
            </form>
          </>
        ) : view === "accepted" ? (
          <div className="acceptance">
            <span className="accepted-icon">
              <LeafIcon />
            </span>
            <h1>
              Your wish has
              <br />
              taken root.
            </h1>
            <p className="intro">
              A small leaf.
              <br />
              Part of something extraordinary.
            </p>
            <div className="accept-line" />
            <p className="privacy">Your leaf belongs to this mountain now.</p>
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
                <p className="field-help">
                  {remaining > 0
                    ? "A moment to change your mind."
                    : "Waiting for the server to confirm."}
                </p>
              </>
            ) : (
              <p className="rooted">Permanently rooted</p>
            )}
            <button className="primary" onClick={clearPrivate} disabled={busy}>
              Return to the tree
            </button>
          </div>
        ) : (
          <>
            <h1>
              {view === "mountain"
                ? "A mountain\nof possibility."
                : "Wishing Tree"}
            </h1>
            <p className="intro">
              {view === "mountain"
                ? "Every tree begins with a wish. Touch a wish tree to look a little closer."
                : "A wish for tomorrow.\nA leaf that grows with us."}
            </p>

            <div className="welcome-actions">
              <button
                className="primary"
                onClick={() => {
                  setMessage("");
                  setSearch("");
                  setSearchOpen(false);
                  setKeyboard(false);
                  key.current = null;
                  useSanctuary.getState().set({ selection: null });
                  useSanctuary.getState().go("form");
                }}
              >
                <LeafIcon />
                Make a wish
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setMessage("");
                  setSearch("");
                  setSearchOpen(false);
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
                  : "View the mountain"}
              </button>
            </div>
            <div className="progress-block">
              <div className="progress-heading">
                <span>
                  {view === "mountain"
                    ? forest.demo
                      ? "Demonstration forest"
                      : "Across the mountain"
                    : forest.demo
                      ? "Demonstration tree"
                      : "This tree, growing with us"}
                </span>
                <span>
                  {view === "mountain"
                    ? `${forest.trees.length} trees`
                    : `${count} / 108 leaves`}
                </span>
              </div>
              <div className="progress-track">
                <span style={{ width: `${(count / 108) * 100}%` }} />
              </div>
              <p>
                {view === "mountain"
                  ? `${total} ${forest.demo ? "demonstration" : "visitor"} leaves`
                  : "108 wishes. One tree. Countless possibilities."}
              </p>
            </div>
            <div className="leaf-locator">
              <button
                className="locator-toggle"
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
                <span>{searchOpen ? "Close leaf search" : "Find my leaf"}</span>
              </button>
              <div id="leaf-search" hidden={!searchOpen}>
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
                <form className="search-form" onSubmit={locate}>
                  <SearchIcon />
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
              </div>
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
            Connection interrupted. The mountain is still here; submissions will
            resume when connected.
          </p>
        )}
      </section>
      {keyboard && (
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
            <button
              onClick={() => setKeyboard(false)}
              aria-label="Close keyboard"
            >
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
      )}
    </main>
  );
}
