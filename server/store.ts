import pg from "pg";
import {
  randomUUID,
  randomInt,
  createHash,
  createHmac,
  createCipheriv,
  randomBytes,
} from "node:crypto";
import type { Forest, ForestEvent, Receipt, Locator } from "../src/shared.js";
import { near } from "../src/shared.js";
import { PublicError, type Moderator } from "./moderation.js";
export class Store {
  constructor(
    public pool: pg.Pool,
    private moderator: Moderator,
    private emit: (e: ForestEvent) => void,
    private secret: string,
    private key: Buffer,
    private undoSeconds = 10,
  ) {}
  token(id: string) {
    return createHmac("sha256", this.secret).update(id).digest("base64url");
  }
  hash(s: string) {
    return createHmac("sha256", this.secret).update(s).digest("hex");
  }
  encrypt(s: string) {
    const iv = randomBytes(12),
      c = createCipheriv("aes-256-gcm", this.key, iv);
    const text = Buffer.concat([c.update(s, "utf8"), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), text]).toString("base64");
  }
  async transaction<T>(
    fn: (c: pg.PoolClient, events: ForestEvent[]) => Promise<T>,
  ) {
    const c = await this.pool.connect(),
      events: ForestEvent[] = [];
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(1082026)");
      const result = await fn(c, events);
      await c.query("COMMIT");
      events.forEach(this.emit);
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async finalise(c: pg.PoolClient, events: ForestEvent[]) {
    const rows = await c.query(
      "UPDATE submissions SET state='finalised',wish_ciphertext=NULL WHERE state='pending' AND undo_deadline <= clock_timestamp() RETURNING id",
    );
    for (const row of rows.rows) {
      const leaf = await c.query(
        "SELECT tree_id,slot FROM leaf_slots WHERE submission_id=$1",
        [row.id],
      );
      if (leaf.rows[0])
        events.push({
          type: "leaf_finalised",
          treeId: leaf.rows[0].tree_id,
          slot: leaf.rows[0].slot,
        });
    }
  }
  async sweep() {
    await this.transaction(async (c, e) => this.finalise(c, e));
  }
  receipt(row: any): Receipt {
    return {
      id: row.id,
      token: this.token(row.id),
      treeId: row.tree_id || "",
      slot: row.slot ?? -1,
      state: row.state,
      deadline: new Date(row.undo_deadline).toISOString(),
      serverTime: new Date().toISOString(),
    };
  }
  async submit(username: string, wish: string, idempotencyKey: string) {
    const fingerprint = this.hash(
      JSON.stringify([username.toLowerCase(), wish]),
    );
    const existing = await this.pool.query(
      "SELECT s.*,l.tree_id,l.slot FROM submissions s LEFT JOIN leaf_slots l ON l.submission_id=s.id WHERE idempotency_key=$1",
      [idempotencyKey],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].request_hash !== fingerprint)
        throw new PublicError(
          409,
          "This retry belongs to another wish. Please start again.",
        );
      await this.sweep();
      return this.status(existing.rows[0].id, this.token(existing.rows[0].id));
    }
    await this.moderator(username, wish);
    return this.transaction(async (c, events) => {
      await this.finalise(c, events);
      const retry = await c.query(
        "SELECT s.*,l.tree_id,l.slot FROM submissions s LEFT JOIN leaf_slots l ON l.submission_id=s.id WHERE idempotency_key=$1",
        [idempotencyKey],
      );
      if (retry.rows[0]) {
        if (retry.rows[0].request_hash !== fingerprint)
          throw new PublicError(409, "This retry belongs to another wish.");
        return this.receipt(retry.rows[0]);
      }
      if (
        (
          await c.query(
            "SELECT 1 FROM submissions WHERE username_normalized=$1 AND state <> 'cancelled'",
            [username.toLowerCase()],
          )
        ).rowCount
      )
        throw new PublicError(
          409,
          "That username has already taken root. Please choose another.",
        );
      let tree = (
        await c.query(
          "SELECT t.* FROM trees t LEFT JOIN leaf_slots l ON l.tree_id=t.id GROUP BY t.id HAVING count(l.slot)<108 ORDER BY t.ordinal LIMIT 1",
        )
      ).rows[0];
      if (!tree) {
        const ordinal = Number(
          (await c.query("SELECT COALESCE(max(ordinal),0)+1 AS n FROM trees"))
            .rows[0].n,
        );
        const a = (ordinal - 1) * 2.399963,
          r = ordinal === 1 ? 0 : 10 * Math.sqrt(ordinal - 1);
        tree = (
          await c.query(
            "INSERT INTO trees(id,seed,x,z) VALUES($1,$2,$3,$4) RETURNING *",
            [
              randomUUID(),
              randomInt(1000000),
              Math.cos(a) * r,
              Math.sin(a) * r,
            ],
          )
        ).rows[0];
        events.push({ type: "tree_created", treeId: tree.id });
      }
      const slot = Number(
        (
          await c.query(
            "SELECT n FROM generate_series(0,107) n WHERE NOT EXISTS(SELECT 1 FROM leaf_slots WHERE tree_id=$1 AND slot=n) ORDER BY n LIMIT 1",
            [tree.id],
          )
        ).rows[0].n,
      );
      const id = randomUUID(),
        token = this.token(id);
      const row = (
        await c.query(
          "INSERT INTO submissions(id,username,username_normalized,wish_ciphertext,state,moderation_status,undo_deadline,token_hash,idempotency_key,request_hash) VALUES($1,$2,$3,$4,'pending','accepted',clock_timestamp()+make_interval(secs=>$5),$6,$7,$8) RETURNING *",
          [
            id,
            username,
            username.toLowerCase(),
            this.encrypt(wish),
            this.undoSeconds,
            createHash("sha256").update(token).digest("hex"),
            idempotencyKey,
            fingerprint,
          ],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO leaf_slots(submission_id,tree_id,slot) VALUES($1,$2,$3)",
        [id, tree.id, slot],
      );
      events.push({ type: "leaf_reserved", treeId: tree.id, slot });
      return this.receipt({ ...row, tree_id: tree.id, slot });
    });
  }
  async recover(key: string) {
    const row = (
      await this.pool.query(
        "SELECT id FROM submissions WHERE idempotency_key=$1",
        [key],
      )
    ).rows[0];
    if (!row)
      throw new PublicError(
        404,
        "No confirmed submission yet. Please retry your wish.",
      );
    return this.status(row.id, this.token(row.id));
  }
  async status(id: string, token: string) {
    await this.sweep();
    const row = (
      await this.pool.query(
        "SELECT s.*,l.tree_id,l.slot FROM submissions s LEFT JOIN leaf_slots l ON l.submission_id=s.id WHERE s.id=$1 AND token_hash=$2",
        [id, createHash("sha256").update(token).digest("hex")],
      )
    ).rows[0];
    if (!row) throw new PublicError(404, "Submission not found.");
    return this.receipt(row);
  }
  async undo(id: string, token: string) {
    return this.transaction(async (c, events) => {
      await this.finalise(c, events);
      const row = (
        await c.query(
          "SELECT s.*,l.tree_id,l.slot FROM submissions s LEFT JOIN leaf_slots l ON l.submission_id=s.id WHERE s.id=$1 AND token_hash=$2 FOR UPDATE OF s",
          [id, createHash("sha256").update(token).digest("hex")],
        )
      ).rows[0];
      if (!row) throw new PublicError(404, "Submission not found.");
      if (row.state === "finalised")
        throw new PublicError(
          409,
          "Your wish has already taken root. The Undo window has ended.",
        );
      if (row.state === "cancelled") return this.receipt(row);
      const changed = await c.query(
        "UPDATE submissions SET state='cancelled',wish_ciphertext=NULL WHERE id=$1 AND undo_deadline>clock_timestamp() RETURNING *",
        [id],
      );
      if (!changed.rowCount)
        throw new PublicError(409, "The Undo window has ended.");
      await c.query("DELETE FROM leaf_slots WHERE submission_id=$1", [id]);
      events.push({
        type: "leaf_cancelled",
        treeId: row.tree_id,
        slot: row.slot,
      });
      const removed = await c.query(
        "DELETE FROM trees WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM leaf_slots WHERE tree_id=$1) RETURNING id",
        [row.tree_id],
      );
      if (removed.rowCount)
        events.push({ type: "tree_removed", treeId: row.tree_id });
      return this.receipt({ ...row, state: "cancelled" });
    });
  }
  async forest(): Promise<Forest> {
    await this.sweep();
    const rows = await this.pool.query(
      "SELECT t.id,t.seed,t.x,t.z,COALESCE(json_agg(json_build_object('slot',l.slot,'state',s.state) ORDER BY l.slot) FILTER(WHERE l.slot IS NOT NULL),'[]') AS leaves FROM trees t LEFT JOIN leaf_slots l ON l.tree_id=t.id LEFT JOIN submissions s ON s.id=l.submission_id GROUP BY t.id ORDER BY t.ordinal",
    );
    return {
      trees: rows.rows,
      demo: false,
      serverTime: new Date().toISOString(),
    };
  }
  async locate(input: string): Promise<Locator> {
    await this.sweep();
    const username = input.trim().toLowerCase();
    let rows = (
      await this.pool.query(
        "SELECT s.username_normalized,l.tree_id,l.slot FROM submissions s JOIN leaf_slots l ON s.id=l.submission_id WHERE s.username_normalized=$1 AND s.state<>'cancelled'",
        [username],
      )
    ).rows;
    if (!rows.length && username.length >= 6) {
      const candidates = (
        await this.pool.query(
          "SELECT s.username_normalized,l.tree_id,l.slot FROM submissions s JOIN leaf_slots l ON s.id=l.submission_id WHERE s.state<>'cancelled' AND length(s.username_normalized) BETWEEN $1 AND $2",
          [username.length - 1, username.length + 1],
        )
      ).rows;
      rows = candidates.filter((r) => near(username, r.username_normalized));
    }
    if (rows.length > 1)
      throw new PublicError(409, "Please check the spelling of your username.");
    if (!rows.length) throw new PublicError(404, "No matching leaf found");
    return { treeId: rows[0].tree_id, slot: rows[0].slot };
  }
}
