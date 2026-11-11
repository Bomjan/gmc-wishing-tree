import express from "express";
import pg from "pg";
import {
  createHash,
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { palmNameSchema, validate } from "./geometry.js";
import { moderateImage } from "./moderation.js";
import { PublicError } from "../moderation.js";
import type {
  PublicHandprint,
  HandprintEvent,
  HandprintReceipt,
  HandprintState,
  HandprintPlacement,
} from "../../src/shared/handprints.js";
type Record = {
  id: string;
  idempotency_key: string;
  request_hash: string;
  token_hash: string;
  data: PublicHandprint & { palmName?: string };
  state: HandprintState;
  undo_deadline: Date;
  created_at: Date;
};
export function handprintRouter(
  demo: boolean,
  pool: pg.Pool | null,
  broadcast: (e: HandprintEvent) => void,
) {
  const router = express.Router(),
    memory: Record[] = [];
  const secret = process.env.TOKEN_SECRET || randomUUID();
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  const token = (key: string) =>
    createHmac("sha256", secret).update(`handprint:${key}`).digest("hex");
  let queue = Promise.resolve();
  let authoritativeNow = Date.now();
  async function transaction<T>(
    fn: (rows: Record[], save: (r: Record) => Promise<void>) => Promise<T>,
    pendingOnly = false,
  ): Promise<T> {
    let release!: () => void;
    const before = queue;
    queue = new Promise((r) => (release = r));
    await before;
    let c: pg.PoolClient | null = null;
    try {
      c = pool ? await pool.connect() : null;
      if (c) {
        await c.query("BEGIN");
        await c.query("SELECT pg_advisory_xact_lock(641110)");
      }
      authoritativeNow = c
        ? +(await c.query("SELECT clock_timestamp() AS now")).rows[0].now
        : Date.now();
      const rows = c
        ? ((
            await c.query(
              pendingOnly
                ? "SELECT * FROM handprints WHERE state='pending' AND undo_deadline <= clock_timestamp() ORDER BY created_at"
                : "SELECT * FROM handprints ORDER BY created_at",
            )
          ).rows as Record[])
        : memory;
      const save = async (r: Record) => {
        if (c) {
          await c.query(
            "INSERT INTO handprints(id,idempotency_key,request_hash,token_hash,data,state,moderation_status,undo_deadline,created_at) VALUES($1,$2,$3,$4,$5,$6,'accepted',$7,$8) ON CONFLICT(id) DO UPDATE SET state=excluded.state",
            [
              r.id,
              r.idempotency_key,
              r.request_hash,
              r.token_hash,
              r.data,
              r.state,
              r.undo_deadline,
              r.created_at,
            ],
          );
          if (r.state === "removed")
            await c.query(
              "INSERT INTO handprint_operator_audit(handprint_id) VALUES($1)",
              [r.id],
            );
        } else if (!memory.includes(r)) memory.push(r);
      };
      const finalised: Record[] = [];
      for (const r of rows)
        if (
          r.state === "pending" &&
          +new Date(r.undo_deadline) <= authoritativeNow
        ) {
          r.state = "finalised";
          await save(r);
          finalised.push(r);
        }
      const result = await fn(rows, save);
      if (c) await c.query("COMMIT");
      for (const r of finalised) event(r, "handprint_finalised");
      return result;
    } catch (e) {
      if (c) await c.query("ROLLBACK");
      throw e;
    } finally {
      c?.release();
      release();
    }
  }
  const receipt = (r: Record): HandprintReceipt => ({
    id: r.id,
    token: token(r.idempotency_key),
    state: r.state,
    placement: r.data.placement,
    deadline: new Date(r.undo_deadline).toISOString(),
    serverTime: new Date(authoritativeNow).toISOString(),
  });
  const event = (r: Record, type: HandprintEvent["type"]) =>
    broadcast({
      type,
      sectionId: r.data.placement.sectionId,
      handprintId: r.id,
    });
  const auth = (req: express.Request, rows: Record[]) => {
    const id = z.uuid().parse(req.params.id),
      r = rows.find((r) => r.id === id),
      t = req.headers.authorization?.slice(7) || "";
    if (
      !req.headers.authorization?.startsWith("Bearer ") ||
      !r ||
      hash(t) !== r.token_hash
    )
      throw new PublicError(401, "A valid temporary token is required.");
    return r;
  };
  router.get("/sections", async (_req, res) =>
    res.json(
      await transaction(async (rows) => {
        const active = rows.filter(
          (r) => r.state === "pending" || r.state === "finalised",
        );
        const max = Math.max(
          0,
          ...active.map((r) =>
            Number(r.data.placement.sectionId.split("-")[1]),
          ),
        );
        return {
          demo,
          serverTime: new Date(authoritativeNow).toISOString(),
          sections: Array.from({ length: max + 2 }, (_, i) => ({
            id: `section-${i}`,
            x: i * 8,
            y: 0,
            width: 8,
            height: 12,
            seed: i + 71,
            prints: active
              .filter((r) => r.data.placement.sectionId === `section-${i}`)
              .map(({ data: { palmName: _privateName, ...print }, state }) => ({
                ...print,
                state,
              })),
          })),
        };
      }),
    ),
  );
  router.post("/search", async (req, res) => {
    const { name } = z
      .object({ name: palmNameSchema })
      .strict()
      .parse(req.body);
    const normalised = name.toLowerCase();
    res.json(
      await transaction(async (rows) =>
        rows
          .filter(
            (r) =>
              r.state === "finalised" &&
              r.data.palmName?.toLowerCase() === normalised,
          )
          .reverse()
          .slice(0, 24)
          .map((r) => ({
            id: r.id,
            sectionId: r.data.placement.sectionId,
          })),
      ),
    );
  });
  router.post("/submissions", async (req, res) => {
    const data = validate(req.body),
      key = z.uuid().parse(req.headers["idempotency-key"]),
      fingerprint = hash(JSON.stringify(data));
    const existing = await transaction(async (rows) =>
      rows.find((r) => r.idempotency_key === key),
    );
    if (existing) {
      if (existing.request_hash !== fingerprint)
        throw new PublicError(
          409,
          "Start a new submission after changing your print.",
        );
      return res.json(receipt(existing));
    }
    const palmName = "size" in data ? data.palmName : undefined;
    await moderateImage(
      data.outline,
      demo,
      palmName,
      data.contactAreas,
      data.source,
    );
    const result = await transaction(async (rows, save) => {
      const duplicate = rows.find((r) => r.idempotency_key === key);
      if (duplicate) {
        if (duplicate.request_hash !== fingerprint)
          throw new PublicError(
            409,
            "Start a new submission after changing your print.",
          );
        return { receipt: receipt(duplicate) };
      }
      const active = rows.filter(
        (r) => r.state === "pending" || r.state === "finalised",
      );
      const max = Math.max(
        0,
        ...active.map((r) => Number(r.data.placement.sectionId.split("-")[1])),
      );
      const free = (p: HandprintPlacement) =>
        !active.some(
          (r) =>
            r.data.placement.sectionId === p.sectionId &&
            Math.hypot(r.data.placement.x - p.x, r.data.placement.y - p.y) <
              (r.data.placement.size + p.size) * 0.82,
        );
      let placement: HandprintPlacement;
      if ("placement" in data) {
        placement = data.placement;
        if (Number(placement.sectionId.split("-")[1]) > max + 1)
          throw new PublicError(400, "Choose an available wall section.");
      } else {
        const rotation = ((Math.random() - 0.5) * Math.PI) / 3;
        const candidates: HandprintPlacement[] = [];
        for (let y = 1; y <= 11; y += 1.25)
          for (let x = 1; x <= 7; x += 1.25) {
            const p = {
              sectionId: `section-${max}`,
              x,
              y,
              size: data.size,
              rotation,
            };
            if (free(p)) candidates.push(p);
          }
        placement = candidates.length
          ? candidates[randomInt(candidates.length)]
          : {
              sectionId: `section-${max + 1}`,
              x: 1 + Math.random() * 6,
              y: 1 + Math.random() * 10,
              size: data.size,
              rotation,
            };
      }
      if (!free(placement)) {
        let suggestion = { ...placement };
        let found = false;
        for (let section = 0; section <= max + 1 && !found; section++)
          for (let y = 1; y <= 11 && !found; y += 1.6)
            for (let x = 1; x <= 7 && !found; x += 1.6) {
              const p = {
                ...suggestion,
                sectionId: `section-${section}`,
                x,
                y,
              };
              if (free(p)) {
                suggestion = p;
                found = true;
              }
            }
        return { suggestedPlacement: suggestion };
      }
      const id = randomUUID(),
        now = new Date(authoritativeNow),
        r: Record = {
          id,
          idempotency_key: key,
          request_hash: fingerprint,
          token_hash: hash(token(key)),
          data: {
            outline: data.outline,
            ...(data.contactAreas ? { contactAreas: data.contactAreas } : {}),
            ...(data.pose ? { pose: data.pose } : {}),
            source: data.source,
            colour: data.colour,
            placement,
            ...(palmName ? { palmName } : {}),
            id,
            seed: Math.floor(Math.random() * 2147483647),
            state: "pending",
            createdAt: now.toISOString(),
          },
          state: "pending",
          undo_deadline: new Date(+now + 10000),
          created_at: now,
        };
      await save(r);
      return { receipt: receipt(r) };
    });
    if ("suggestedPlacement" in result)
      return res.status(409).json({
        code: "placement_conflict",
        message: "This spot was just taken. We found a nearby space.",
        ...result,
      });
    broadcast({
      type: "handprint_reserved",
      sectionId: result.receipt.placement.sectionId,
      handprintId: result.receipt.id,
    });
    res.status(201).json(result.receipt);
  });
  router.post("/recovery", async (req, res) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
      throw new PublicError(401, "A temporary retry token is required.");
    const key = z.uuid().parse(header.slice(7));
    const found = await transaction(async (rows) =>
      rows.find((r) => r.idempotency_key === key),
    );
    if (!found)
      throw new PublicError(
        404,
        "This mark has not been saved. Please retry your draft.",
      );
    res.json(receipt(found));
  });
  router.get("/submissions/:id", async (req, res) =>
    res.json(await transaction(async (rows) => receipt(auth(req, rows)))),
  );
  router.post("/submissions/:id/undo", async (req, res) => {
    const r = await transaction(async (rows, save) => {
      const r = auth(req, rows);
      if (r.state === "cancelled") return r;
      if (r.state !== "pending")
        throw new PublicError(409, "This print is now permanent.");
      r.state = "cancelled";
      await save(r);
      return r;
    });
    event(r, "handprint_cancelled");
    res.json(receipt(r));
  });
  router.post("/operator/:id/remove", async (req, res) => {
    const expected = process.env.OPERATOR_TOKEN,
      actual = req.headers.authorization?.replace(/^Bearer /, "");
    if (
      !expected ||
      !actual ||
      actual.length !== expected.length ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    )
      throw new PublicError(403, "Operator access required.");
    const r = await transaction(async (rows, save) => {
      const r = rows.find((r) => r.id === z.uuid().parse(req.params.id));
      if (!r) throw new PublicError(404, "Print not found.");
      r.state = "removed";
      await save(r);
      return r;
    });

    event(r, "handprint_removed");
    res.json({ ok: true });
  });
  let sweeping = false;
  const sweep = setInterval(() => {
    if (sweeping) return;
    sweeping = true;
    void transaction(async () => {}, true)
      .catch(() => {})
      .finally(() => {
        sweeping = false;
      });
  }, 500);
  sweep.unref();
  return router;
}
