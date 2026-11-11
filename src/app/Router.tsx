import { lazy, Suspense, useEffect, useState } from "react";
import { WallPreview } from "./components/WallPreview";
import { experiences } from "./experiences";
import { useSanctuary } from "../state";
import "./app.css";
const Tree = lazy(() => import("../App"));
const Wall = lazy(() => import("../experiences/handprint-wall/Wall"));
const TouchDiagnostics = lazy(
  () => import("../experiences/handprint-wall/tracing/TouchDiagnostics"),
);
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
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("pointermove", activity);
      window.removeEventListener("keydown", activity);
    };
  }, [blocked, path]);
  return (
    <>
      <Suspense
        fallback={
          <main className="menu">
            <h1>A moment of calm…</h1>
          </main>
        }
      >
        {path === "/handprint-wall/input-check" ? (
          <TouchDiagnostics />
        ) : path === "/wishing-tree" ? (
          <Tree onSessionLock={setBlocked} />
        ) : path === "/handprint-wall" ? (
          <Wall onSessionLock={setBlocked} />
        ) : (
          <main className="menu">
            <p className="eyebrow">A place we make together</p>
            <h1>
              A little of you.
              <br />
              Something for everyone.
            </h1>
            <p>Choose a moment to make your own.</p>
            <div className="experience-cards">
              {experiences.map((e, i) => (
                <button
                  key={e.id}
                  onClick={() => navigate(e.path)}
                  className="experience-card"
                >
                  <div className={`card-art ${i ? "wall-art" : "tree-art"}`}>
                    {i ? (
                      <WallPreview />
                    ) : (
                      <img
                        src="/tree-preview.svg"
                        alt="A leafy tree on a quiet mountain"
                      />
                    )}
                  </div>
                  <span className="card-number">0{i + 1}</span>
                  <h2>{e.title}</h2>
                  <p>{e.description}</p>
                  <span className="card-enter">Enter →</span>
                </button>
              ))}
            </div>
            <p className="menu-foot">Small gestures. Shared belonging.</p>
          </main>
        )}
      </Suspense>
      {path !== "/" && (
        <button
          className="home-control"
          disabled={blocked}
          onClick={() => navigate("/")}
        >
          ← Home
        </button>
      )}
      {warning && (
        <div className="idle-warning" role="status">
          Returning Home soon. Touch the screen to keep creating.
        </div>
      )}
    </>
  );
}
