import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import pg from "pg";
import { z } from "zod";
import { resolve } from "node:path";
import { Store } from "./store.js";
import { DemoStore } from "./demo.js";
import { moderate, PublicError } from "./moderation.js";
import { handprintRouter } from "./handprints/router.js";
import type { HandprintEvent } from "../src/shared/handprints.js";
import type { ForestEvent } from "../src/shared.js";
const app = express(),
  server = createServer(app),
  wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
const demo = process.env.DEMO_MODE === "true",
  origin = process.env.PUBLIC_ORIGIN || "http://localhost:5173";
if (
  !demo &&
  (!process.env.DATABASE_URL ||
    !process.env.TOKEN_SECRET ||
    Buffer.from(process.env.ENCRYPTION_KEY || "", "base64").length !== 32)
)
  throw new Error(
    "Set DATABASE_URL, TOKEN_SECRET and a 32-byte base64 ENCRYPTION_KEY. See .env.example.",
  );
const broadcast = (e: ForestEvent | HandprintEvent) => {
  for (const client of wss.clients)
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(e));
};
const pool = demo
  ? null
  : new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12 });
const store = demo
  ? new DemoStore(broadcast)
  : new Store(
      pool!,
      moderate,
      broadcast,
      process.env.TOKEN_SECRET!,
      Buffer.from(process.env.ENCRYPTION_KEY!, "base64"),
      Number(process.env.UNDO_SECONDS || 10),
    );
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        workerSrc: ["'self'", "blob:"],
      },
    },
  }),
);
app.use("/api/handprints", express.json({ limit: "64kb" }));
app.use(express.json({ limit: "8kb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
const limits = new Map<string, { count: number; until: number }>();
app.use("/api", (req, _res, next) => {
  if (
    req.method === "POST" &&
    req.headers.origin &&
    req.headers.origin !== origin
  )
    return next(
      new PublicError(403, "Please use the touchscreen application."),
    );
  const client = req.headers["x-kiosk-session"];
  const key =
    typeof client === "string" && /^[a-f0-9-]{36}$/i.test(client)
      ? client
      : req.ip || "unknown";
  const bucket = limits.get(key) || { count: 0, until: Date.now() + 60000 };
  if (bucket.until < Date.now()) {
    bucket.count = 0;
    bucket.until = Date.now() + 60000;
  }
  bucket.count++;
  limits.set(key, bucket);
  if (bucket.count > 90)
    return next(new PublicError(429, "Please pause a moment and try again."));
  next();
});
app.use("/api/handprints", handprintRouter(demo, pool, broadcast));
const uuid = z.uuid();
const auth = (req: express.Request) => {
  const id = uuid.parse(req.params.id),
    header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    throw new PublicError(401, "A temporary submission token is required.");
  return { id, token: header.slice(7) };
};
app.get("/api/config", (_req, res) =>
  res.json({
    usernameMin: Number(process.env.USERNAME_MIN || 3),
    usernameMax: Math.min(24, Number(process.env.USERNAME_MAX || 24)),
    wishMax: Number(process.env.WISH_MAX || 500),
  }),
);
app.get("/api/forest", async (_req, res) => res.json(await store.forest()));
app.post("/api/submissions", async (req, res) => {
  const min = Math.max(3, Number(process.env.USERNAME_MIN || 3)),
    max = Math.min(24, Number(process.env.USERNAME_MAX || 24));
  const data = z
    .object({
      username: z
        .string()
        .trim()
        .min(min)
        .max(max)
        .regex(/^[a-zA-Z0-9_]+$/),
      wish: z
        .string()
        .trim()
        .min(1)
        .max(Number(process.env.WISH_MAX || 500)),
    })
    .strict()
    .parse(req.body);
  const key = uuid.parse(req.headers["idempotency-key"]);
  res.status(201).json(await store.submit(data.username, data.wish, key));
});
app.post("/api/recovery", async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    throw new PublicError(401, "A temporary retry token is required.");
  res.json(await store.recover(uuid.parse(header.slice(7))));
});
app.get("/api/submissions/:id", async (req, res) => {
  const { id, token } = auth(req);
  res.json(await store.status(id, token));
});
app.post("/api/submissions/:id/undo", async (req, res) => {
  const { id, token } = auth(req);
  res.json(await store.undo(id, token));
});
app.post("/api/locate", async (req, res) => {
  const { username } = z
    .object({ username: z.string().trim().min(1).max(24) })
    .strict()
    .parse(req.body);
  res.json(await store.locate(username));
});
app.get("/api/health", (_req, res) => res.json({ ok: true, demo }));
app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));
app.use(express.static(resolve("dist")));
app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
app.use(
  (
    e: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const status =
      e instanceof PublicError
        ? e.status
        : e instanceof z.ZodError
          ? 400
          : (e as { status?: number })?.status === 413
            ? 413
            : 503;
    res.status(status).json({
      message:
        e instanceof PublicError
          ? e.message
          : status === 400
            ? "Check your input, then try again."
            : "The sanctuary is temporarily offline. Please retry.",
    });
  },
);
server.on("upgrade", (req, socket, head) => {
  if (
    req.url !== "/ws" ||
    (req.headers.origin && req.headers.origin !== origin)
  ) {
    socket.destroy();
    return;
  }
  if (wss.clients.size >= 200) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.on("error", () => {});
    ws.on("message", () => ws.close(1008));
  });
});
const timer = setInterval(() => {
  void store.sweep().catch(() => {});
  for (const [k, v] of limits) if (v.until < Date.now()) limits.delete(k);
}, 500);
timer.unref();
server.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log(
    `Wishing Tree server ready (${demo ? "isolated demo" : "production"})`,
  ),
);
process.on("SIGTERM", () => {
  clearInterval(timer);
  for (const ws of wss.clients) ws.close();
  server.close(() => process.exit(0));
});
