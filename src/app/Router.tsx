import { lazy, Suspense, useEffect, useState } from "react";
import { WallPreview } from "./components/WallPreview";
import { experiences } from "./experiences";
import { useSanctuary } from "../state";
import { KioskHeader } from "../shared/kiosk/KioskHeader";
import { unlockSound } from "../shared/kiosk/sound";
import "./app.css";
import "../experiences/signature-wall/wall.css";
import "../shared/kiosk/brand.css";
const Tree = lazy(() => import("../App"));
const Wall = lazy(() => import("../experiences/signature-wall/Wall"));
const CHOOSE = "/choose";
const titles: Record<string, { title: string; subtitle: string }> = {
  "/wishing-tree": {
    title: "Wishing Tree",
    subtitle: "Each wish adds a leaf. Watch the tree grow.",
  },
  "/signature-wall": {
    title: "Wall of Signatures",
    subtitle: "Sign, doodle and choose your spot on the wall.",
  },
};

export default function Router() {
  const [path, setPath] = useState(location.pathname),
    [blocked, setBlocked] = useState(false),
    [warning, setWarning] = useState(false);
  const navigate = (p: string) => {
    if (blocked) return;
    sessionStorage.removeItem("gmc-attempt");
    useSanctuary.getState().reset();
    history.pushState({}, "", p);
    setPath(p);
  };
  useEffect(() => {
    const pop = () => {
      if (blocked) {
        history.pushState({}, "", path);
        return;
      }
      useSanctuary.getState().reset();
      setPath(location.pathname);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [blocked, path]);
  useEffect(() => {
    let last = Date.now();
    const activity = () => {
      last = Date.now();
      setWarning(false);
    };
    const timer = setInterval(() => {
      if (blocked) {
        last = Date.now();
        return;
      }
      const idle = (Date.now() - last) / 1000,
        limit = Number(import.meta.env.VITE_IDLE_SECONDS || 90);
      setWarning(path !== "/" && idle > Math.max(1, limit - 15));
      if (path !== "/" && idle > limit) {
        navigate("/");
        last = Date.now();
      }
    }, 1000);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("pointermove", activity);
    window.addEventListener("keydown", activity);
    // Browsers only allow sound after a visitor gesture; any first tap unlocks it.
    window.addEventListener("pointerdown", unlockSound);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("pointermove", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("pointerdown", unlockSound);
    };
  }, [blocked, path]);
  const section = titles[path];
  return (
    <div className="kiosk-stage" data-route={section ? "experience" : path}>
      <Suspense
        fallback={
          <main className="kiosk-loading">
            <p>A moment of calm…</p>
          </main>
        }
      >
        {path === "/wishing-tree" ? (
          <Tree />
        ) : path === "/signature-wall" ? (
          <Wall onSessionLock={setBlocked} />
        ) : path === CHOOSE ? (
          <main className="kiosk-choose">
            <div className="kiosk-choose-cards">
              {experiences.map((e, i) => (
                <button
                  key={e.id}
                  onClick={() => navigate(e.path)}
                  className="kiosk-choice"
                >
                  <div className={`card-art ${i ? "wall-art" : "tree-art"}`}>
                    {i ? (
                      <WallPreview />
                    ) : (
                      <img src="/tree-preview.svg" alt="" />
                    )}
                  </div>
                  <span className="kiosk-choice-body">
                    <span className="card-number">0{i + 1}</span>
                    <h2>{e.title}</h2>
                    <p>{e.description}</p>
                    <span className="kiosk-choice-go" aria-hidden="true">
                      Start →
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </main>
        ) : (
          <main className="kiosk-attract">
            <section className="kiosk-attract-panel" aria-labelledby="welcome">
              <p className="kiosk-eyebrow">GMC Experience Centre</p>
              <h1 id="welcome">Leave your mark</h1>
              <p>
                Make a wish on the living tree, or sign the wall. Every
                contribution becomes part of the Centre.
              </p>
              <button
                type="button"
                className="kiosk-button kiosk-primary"
                onClick={() => navigate(CHOOSE)}
              >
                Get started
              </button>
            </section>
          </main>
        )}
      </Suspense>
      <KioskHeader
        title={
          section?.title ??
          (path === CHOOSE ? "Choose an experience" : undefined)
        }
        subtitle={
          section?.subtitle ??
          (path === CHOOSE
            ? "Two ways to add something of your own."
            : undefined)
        }
        onBack={section ? () => navigate(CHOOSE) : undefined}
        onHome={path !== "/" ? () => navigate("/") : undefined}
        disabled={blocked}
      />
      {warning && (
        <div className="idle-warning" role="status">
          Returning Home soon. Touch the screen to keep creating.
        </div>
      )}
    </div>
  );
}
