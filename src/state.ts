import { create } from "zustand";
import type { Forest, Locator, Receipt } from "./shared";
export type View = "home" | "form" | "accepted" | "mountain";
type State = {
  forest: Forest;
  online: boolean;
  view: View;
  selection: Locator | null;
  focus: string | null;
  receipt: Receipt | null;
  cameraRevision: number;
  quality: "low" | "high";
  animations: Locator[];
  /** Demo only: leaves on the demo tree before this demo's first new wish. */
  demoInitialWishes: number | null;
  set: (patch: Partial<State>) => void;
  go: (view: View, focus?: string | null) => void;
  reset: () => void;
};
const demo = import.meta.env.VITE_DEMO === "true";
function cached(): Forest {
  try {
    const value = JSON.parse(
      localStorage.getItem(`gmc-public-${demo}`) || "null",
    );
    if (value && value.demo === demo && Array.isArray(value.trees))
      return value;
  } catch {}
  return { trees: [], demo, serverTime: new Date().toISOString() };
}
const requestedQuality = new URLSearchParams(location.search).get("quality");
export const useSanctuary = create<State>((set) => ({
  forest: cached(),
  online: false,
  view: "home",
  selection: null,
  focus: null,
  receipt: null,
  cameraRevision: 0,
  quality:
    requestedQuality === "low" || requestedQuality === "high"
      ? requestedQuality
      : localStorage.getItem("gmc-quality") === "low"
        ? "low"
        : "high",
  animations: [],
  demoInitialWishes: null,
  set: (patch) => set(patch),
  go: (view, focus) =>
    set((s) => ({
      view,
      focus: focus === undefined ? s.focus : focus,
      cameraRevision: s.cameraRevision + 1,
    })),
  reset: () =>
    set((s) => ({
      view: "home",
      selection: null,
      receipt: null,
      focus: null,
      cameraRevision: s.cameraRevision + 1,
    })),
}));
const session = crypto.randomUUID();
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    signal: AbortSignal.timeout(22000),
    headers: {
      "Content-Type": "application/json",
      "X-Kiosk-Session": session,
      ...options.headers,
    },
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("The sanctuary is temporarily offline. Please retry.");
  }
  if (!response.ok) throw new Error(body.message || "Please retry.");
  return body;
}
export async function loadForest() {
  try {
    const forest = await api<Forest>("/forest");
    if (forest.demo !== demo)
      throw new Error("Demo and production configuration do not match.");
    useSanctuary.getState().set({ forest, online: true });
    try {
      localStorage.setItem(`gmc-public-${demo}`, JSON.stringify(forest));
    } catch {
      /* Cached scene storage must not block confirmed API availability. */
    }
  } catch {
    useSanctuary.getState().set({ online: false });
  }
}
export function connectForest() {
  let stopped = false,
    ws: WebSocket | undefined,
    retry: ReturnType<typeof setTimeout>,
    busy = false,
    dirty = false;
  const refresh = async () => {
    if (busy) {
      dirty = true;
      return;
    }
    busy = true;
    do {
      dirty = false;
      await loadForest();
    } while (dirty && !stopped);
    busy = false;
  };
  const connect = () => {
    if (stopped) return;
    ws = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
    );
    ws.onopen = () => void refresh();
    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (
          event.type === "leaf_reserved" &&
          typeof event.treeId === "string" &&
          Number.isInteger(event.slot)
        ) {
          const state = useSanctuary.getState();
          state.set({
            animations: [
              ...state.animations.slice(-31),
              { treeId: event.treeId, slot: event.slot },
            ],
          });
        }
        void refresh();
      } catch {}
    };
    ws.onclose = () => {
      useSanctuary.getState().set({ online: false });
      retry = setTimeout(connect, 2000);
    };
    ws.onerror = () => ws?.close();
  };
  void refresh();
  connect();
  const poll = setInterval(() => void refresh(), 10000);
  const visible = () => {
    if (document.visibilityState === "visible") void refresh();
  };
  document.addEventListener("visibilitychange", visible);
  return () => {
    stopped = true;
    clearTimeout(retry);
    clearInterval(poll);
    ws?.close();
    document.removeEventListener("visibilitychange", visible);
  };
}
