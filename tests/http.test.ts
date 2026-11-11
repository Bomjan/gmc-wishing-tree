import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { WebSocket } from "ws";

// Exercise the actual Express/ws server and provider adapter, with a local fake
// provider. No test-only moderation bypass exists in the production server.
test(
  "production HTTP + WebSocket privacy, moderation failure and restart recovery",
  { timeout: 30000 },
  async () => {
    const schema = `http_${randomUUID().replaceAll("-", "")}`;
    const url = new URL(
      process.env.TEST_DATABASE_URL ||
        process.env.DATABASE_URL ||
        "postgresql://localhost/postgres",
    );
    if (!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
      url.username = process.env.PGUSER || process.env.USER || "postgres";
      url.pathname = "/" + (process.env.PGDATABASE || "postgres");
      if (process.env.PGHOST) url.searchParams.set("host", process.env.PGHOST);
      if (process.env.PGPORT) url.port = process.env.PGPORT;
      if (process.env.PGPASSWORD) url.password = process.env.PGPASSWORD;
    }
    const admin = new pg.Pool({ connectionString: url.toString() });
    await admin.query(`CREATE SCHEMA ${schema}`);
    url.searchParams.set("options", `-c search_path=${schema}`);
    const pool = new pg.Pool({ connectionString: url.toString() });
    await pool.query(await readFile("db/migrations/001_forest.sql", "utf8"));
    await pool.query(
      await readFile("db/migrations/003_signatures.sql", "utf8"),
    );
    let providerStatus = 200,
      accepted = true,
      english = true;
    const provider = createServer(async (req, res) => {
      for await (const _chunk of req) {
      }
      res.writeHead(providerStatus, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [
            { message: { content: JSON.stringify({ accepted, english }) } },
          ],
        }),
      );
    });
    provider.listen(0, "127.0.0.1");
    await once(provider, "listening");
    const providerPort = (provider.address() as { port: number }).port;
    const port = 33000 + Math.floor(Math.random() * 5000),
      base = `http://127.0.0.1:${port}`;
    let logs = "";
    let child: ReturnType<typeof spawn> | undefined;
    let ws: WebSocket | undefined;
    const env = {
      ...process.env,
      DATABASE_URL: url.toString(),
      DEMO_MODE: "false",
      PORT: String(port),
      PUBLIC_ORIGIN: base,
      AI_BASE_URL: `http://127.0.0.1:${providerPort}`,
      AI_API_KEY: "test-provider-key",
      TOKEN_SECRET: "test-secret-for-persisted-receipt",
      OPERATOR_TOKEN: "operator-test-only",
      ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
      UNDO_SECONDS: "10",
    };
    async function start() {
      child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout?.on("data", (b) => (logs += b.toString()));
      child.stderr?.on("data", (b) => (logs += b.toString()));
      for (let i = 0; i < 80; i++) {
        try {
          if ((await fetch(base + "/api/health")).ok) return;
        } catch {}
        await new Promise((r) => setTimeout(r, 75));
      }
      throw new Error("Test server did not start");
    }
    async function stop() {
      if (child && child.exitCode === null) {
        child.kill("SIGTERM");
        await once(child, "exit");
      }
    }
    const body = {
      username: "http_private_user",
      wish: "PRIVATE_WISH_MARKER peace and kindness",
    };
    const submit = () =>
      fetch(base + "/api/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": randomUUID(),
          Origin: base,
        },
        body: JSON.stringify(body),
      });
    const signatureBody = {
      username: "Sonam_Private",
      strokes: [
        {
          colour: "green",
          points: [
            [0.2, 0.3],
            [0.4, 0.6],
          ],
        },
      ],
      placement: { section: 0, x: 0.5, y: 0.5 },
    };
    const submitSignature = (key = randomUUID()) =>
      fetch(base + "/api/signatures/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(signatureBody),
      });
    const searchSignatures = async (username: string) =>
      (
        await fetch(base + "/api/signatures/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        })
      ).json();
    let signatureReceipt: any;
    try {
      await start();
      providerStatus = 503;
      assert.equal((await submit()).status, 503);
      assert.equal(
        (await pool.query("SELECT count(*) FROM submissions")).rows[0].count,
        "0",
      );
      assert.equal((await submitSignature()).status, 503);
      providerStatus = 200;
      accepted = false;
      assert.equal((await submitSignature()).status, 422);
      assert.equal((await submit()).status, 422);
      accepted = true;
      english = false;
      assert.equal((await submit()).status, 422);
      english = true;
      const events: string[] = [];
      ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: base });
      ws.on("message", (b) => events.push(b.toString()));
      await once(ws, "open");
      const result = await submit();
      assert.equal(result.status, 201);
      let receipt = (await result.json()) as any;
      assert.equal(receipt.state, "pending");
      const forest = await (await fetch(base + "/api/forest")).text();
      const found = await (
        await fetch(base + "/api/locate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: body.username }),
        })
      ).json();
      assert.deepEqual(Object.keys(found).sort(), ["slot", "treeId"]);
      assert.equal(
        (await fetch(`${base}/api/submissions/${receipt.id}`)).status,
        401,
      );
      assert.equal(
        (
          await fetch(`${base}/api/submissions/${receipt.id}/undo`, {
            method: "POST",
            headers: { Authorization: "Bearer wrong" },
          })
        ).status,
        404,
      );
      const signatureKey = randomUUID();
      const signatureResults = await Promise.all([
        submitSignature(signatureKey),
        submitSignature(signatureKey),
      ]);
      assert(signatureResults.every((r) => r.ok));
      signatureReceipt = await signatureResults[0].json();
      assert.equal((await signatureResults[1].json()).id, signatureReceipt.id);
      const conflict = await submitSignature();
      assert.equal(conflict.status, 409);
      const wallBefore = await (
        await fetch(base + "/api/signatures/sections/0")
      ).json();
      assert(!JSON.stringify(wallBefore).includes(signatureReceipt.token));
      ws.close();
      await once(ws, "close");
      ws = undefined;
      await stop();
      await start();
      const recovered = await (
        await fetch(`${base}/api/submissions/${receipt.id}`, {
          headers: { Authorization: `Bearer ${receipt.token}` },
        })
      ).json();
      assert.equal(recovered.state, "pending");
      const signatureRecovered = await (
        await fetch(
          `${base}/api/signatures/submissions/${signatureReceipt.id}`,
          {
            headers: { Authorization: `Bearer ${signatureReceipt.token}` },
          },
        )
      ).json();
      assert.equal(signatureRecovered.state, "pending");
      assert.equal(
        (
          await fetch(
            `${base}/api/signatures/submissions/${signatureReceipt.id}/undo`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${signatureReceipt.token}` },
            },
          )
        ).status,
        200,
      );
      const placedAgain = await submitSignature();
      assert.equal(placedAgain.status, 201);
      signatureReceipt = await placedAgain.json();
      assert.deepEqual(await searchSignatures(signatureBody.username), []);
      assert.equal(
        (
          await fetch(`${base}/api/submissions/${receipt.id}/undo`, {
            method: "POST",
            headers: { Authorization: `Bearer ${receipt.token}` },
          })
        ).status,
        200,
      );
      receipt = await (await submit()).json();
      await stop();
      await pool.query(
        "UPDATE submissions SET undo_deadline=clock_timestamp() WHERE id=$1",
        [receipt.id],
      );
      await pool.query(
        "UPDATE signatures SET undo_deadline=clock_timestamp() WHERE id=$1",
        [signatureReceipt.id],
      );
      await start();
      const signatureStatus = await (
        await fetch(
          `${base}/api/signatures/submissions/${signatureReceipt.id}`,
          {
            headers: { Authorization: `Bearer ${signatureReceipt.token}` },
          },
        )
      ).json();
      assert.equal(signatureStatus.state, "finalised");
      const wallAfter = await (
        await fetch(base + "/api/signatures/sections/0")
      ).json();
      const permanent = wallAfter.signatures.find(
        (mark: any) => mark.id === signatureReceipt.id,
      );
      assert.deepEqual(permanent.placement, signatureBody.placement);
      assert.deepEqual(permanent.strokes, signatureBody.strokes);
      assert.ok(!JSON.stringify(wallAfter).includes(signatureBody.username));
      assert.deepEqual(await searchSignatures("sonam"), []);
      assert.deepEqual(await searchSignatures("  sonam_private "), [
        { id: signatureReceipt.id, section: 0 },
      ]);
      assert.equal(
        (
          await fetch(
            `${base}/api/signatures/operator/${signatureReceipt.id}/remove`,
            { method: "POST" },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(
            `${base}/api/signatures/operator/${signatureReceipt.id}/remove`,
            {
              method: "POST",
              headers: { Authorization: "Bearer operator-test-only" },
            },
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*) FROM signature_operator_audit WHERE signature_id=$1",
            [signatureReceipt.id],
          )
        ).rows[0].count,
        "1",
      );
      const removedWall = await (
        await fetch(base + "/api/signatures/sections/0")
      ).json();
      assert.deepEqual(await searchSignatures(signatureBody.username), []);
      assert(
        !removedWall.signatures.some(
          (mark: any) => mark.id === signatureReceipt.id,
        ),
      );
      assert.equal(
        (
          await fetch(base + "/api/signatures/submissions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": randomUUID(),
            },
            body: JSON.stringify({
              ...signatureBody,
              extra: "x".repeat(70000),
            }),
          })
        ).status,
        413,
      );

      const status = await (
        await fetch(`${base}/api/submissions/${receipt.id}`, {
          headers: { Authorization: `Bearer ${receipt.token}` },
        })
      ).json();
      assert.equal(status.state, "finalised");
      assert.equal(
        (
          await fetch(`${base}/api/submissions/${receipt.id}/undo`, {
            method: "POST",
            headers: { Authorization: `Bearer ${receipt.token}` },
          })
        ).status,
        409,
      );
      for (const publicData of [
        forest,
        JSON.stringify(found),
        JSON.stringify(status),
        JSON.stringify(events),
        logs,
      ]) {
        assert(!publicData.includes(body.username));
        assert(!publicData.includes("PRIVATE_WISH_MARKER"));
        assert(!publicData.includes(signatureBody.username));
      }
      assert(events.some((e) => JSON.parse(e).type === "leaf_reserved"));
    } finally {
      ws?.terminate();
      await stop();
      provider.close();
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);
