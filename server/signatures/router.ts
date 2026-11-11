import express from "express";
import pg from "pg";
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { usernameSchema, validateSignature } from "./geometry.js";
import { moderateSignature } from "./moderation.js";
import { PublicError } from "../moderation.js";
import { signatureOverlaps } from "../../src/shared/signature-overlap.js";
import {
  SIGNATURE_LIMITS,
  type PublicSignature,
  type SignatureEvent,
  type SignatureReceipt,
  type SignatureState,
} from "../../src/shared/signatures.js";
type SignatureRecord = {
  id: string;
  idempotency_key: string;
  request_hash: string;
  token_hash: string;
  username_hash: string;
  data: PublicSignature;
  state: SignatureState;
  undo_deadline: Date;
  created_at: Date;
};
export function signatureRouter(
  demo: boolean,
  pool: pg.Pool | null,
  broadcast: (e: SignatureEvent) => void,
) {
  const router = express.Router(),
    memory: SignatureRecord[] = [];
  const secret = process.env.TOKEN_SECRET || randomUUID();
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  const token = (key: string) =>
    createHmac("sha256", secret).update(`signature:${key}`).digest("hex");
  let queue = Promise.resolve();
  let authoritativeNow = Date.now();
  async function transaction<T>(
    fn: (
      rows: SignatureRecord[],
      save: (r: SignatureRecord) => Promise<void>,
    ) => Promise<T>,
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
        await c.query("SELECT pg_advisory_xact_lock(641112)");
      }
      authoritativeNow = c
        ? +(await c.query("SELECT clock_timestamp() AS now")).rows[0].now
        : Date.now();
      const rows = c
        ? ((
            await c.query(
              pendingOnly
                ? "SELECT * FROM signatures WHERE state='pending' AND undo_deadline <= clock_timestamp() ORDER BY created_at"
                : "SELECT * FROM signatures ORDER BY created_at",
            )
          ).rows as SignatureRecord[])
        : memory;
      const save = async (r: SignatureRecord) => {
        if (c) {
          await c.query(
            "INSERT INTO signatures(id,idempotency_key,request_hash,token_hash,username_hash,data,section,state,undo_deadline,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET state=excluded.state",
            [
              r.id,
              r.idempotency_key,
              r.request_hash,
              r.token_hash,
              r.username_hash,
              r.data,
              r.data.placement.section,
              r.state,
              r.undo_deadline,
              r.created_at,
            ],
          );
          if (r.state === "removed")
            await c.query(
              "INSERT INTO signature_operator_audit(signature_id) VALUES($1)",
              [r.id],
            );
        } else if (!memory.includes(r)) memory.push(r);
      };
      const finalised: SignatureRecord[] = [];
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
      for (const r of finalised) event(r);
      return result;
    } catch (e) {
      if (c) await c.query("ROLLBACK");
      throw e;
    } finally {
      c?.release();
      release();
    }
  }
  const receipt = (r: SignatureRecord): SignatureReceipt => ({
    id: r.id,
    token: token(r.idempotency_key),
    state: r.state,
    placement: r.data.placement,
    deadline: new Date(r.undo_deadline).toISOString(),
    serverTime: new Date(authoritativeNow).toISOString(),
  });
  const event = (r: SignatureRecord) =>
    broadcast({ type: "signature_changed", section: r.data.placement.section });
  const usernameHash = (username: string) =>
    createHmac("sha256", secret)
      .update(`signature-username:${username}`)
      .digest("hex");
  const visible = (r: SignatureRecord) =>
    r.state === "pending" || r.state === "finalised";
  const sectionCount = (rows: SignatureRecord[]) =>
    Math.min(
      SIGNATURE_LIMITS.maxSections,
      rows.reduce(
        (count, r) =>
          visible(r) ? Math.max(count, r.data.placement.section + 2) : count,
        1,
      ),
    );
  const auth = (req: express.Request, rows: SignatureRecord[]) => {
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
  router.get("/sections/:section", async (req, res) => {
    const section = z.coerce
      .number()
      .int()
      .min(0)
      .max(SIGNATURE_LIMITS.maxSections - 1)
      .parse(req.params.section);
    res.json(
      await transaction(async (rows) => ({
        demo,
        section,
        sectionCount: sectionCount(rows),
        signatures: rows
          .filter((r) => visible(r) && r.data.placement.section === section)
          .map((r) => ({ ...r.data, state: r.state })),
      })),
    );
  });
  router.post("/search", async (req, res) => {
    const { username } = z
      .object({ username: usernameSchema })
      .strict()
      .parse(req.body);
    const hash = usernameHash(username);
    res.json(
      await transaction(async (rows) =>
        rows
          .filter((r) => r.state === "finalised" && r.username_hash === hash)
          .reverse()
          .slice(0, 24)
          .map((r) => ({ id: r.id, section: r.data.placement.section })),
      ),
    );
  });
  router.post("/submissions", async (req, res) => {
    const { username, placement, strokes, wallAspect } = validateSignature(
      req.body,
    );
    const key = z.uuid().parse(req.headers["idempotency-key"]);
    const username_hash = usernameHash(username);
    const fingerprint = hash(
      JSON.stringify({ username_hash, placement, strokes }),
    );
    const duplicateReceipt = (row: SignatureRecord) => {
      if (row.request_hash !== fingerprint)
        throw new PublicError(
          409,
          "Start a new submission after changing your signature.",
        );
      return receipt(row);
    };
    const checkSpot = (rows: SignatureRecord[]) => {
      if (placement.section >= sectionCount(rows))
        throw new PublicError(409, "Choose an available wall section.");
      if (
        signatureOverlaps(
          { placement, strokes },
          rows.filter(visible).map((row) => row.data),
          wallAspect,
        )
      )
        throw new PublicError(
          409,
          "This spot is occupied. Choose another place on the wall.",
        );
    };
    const existing = await transaction(async (rows) => {
      const duplicate = rows.find((r) => r.idempotency_key === key);
      if (duplicate) return duplicateReceipt(duplicate);
      checkSpot(rows);
    });
    if (existing) return res.json(existing);

    await moderateSignature(strokes, demo);
    const result = await transaction(async (rows, save) => {
      const duplicate = rows.find((r) => r.idempotency_key === key);
      if (duplicate)
        return { receipt: duplicateReceipt(duplicate), created: false };
      checkSpot(rows);
      const id = randomUUID();
      const now = new Date(authoritativeNow);
      const record: SignatureRecord = {
        id,
        idempotency_key: key,
        request_hash: fingerprint,
        token_hash: hash(token(key)),
        username_hash,
        data: { id, strokes, placement, state: "pending" },
        state: "pending",
        undo_deadline: new Date(+now + SIGNATURE_LIMITS.undoSeconds * 1000),
        created_at: now,
      };
      await save(record);
      return { receipt: receipt(record), created: true };
    });
    if (result.created)
      broadcast({ type: "signature_changed", section: placement.section });
    res.status(result.created ? 201 : 200).json(result.receipt);
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
        "This signature was not saved. Please retry your draft.",
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
        throw new PublicError(409, "This signature is now permanent.");
      r.state = "cancelled";
      await save(r);
      return r;
    });
    event(r);
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
      if (!r) throw new PublicError(404, "Signature not found.");
      r.state = "removed";
      await save(r);
      return r;
    });

    event(r);
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
