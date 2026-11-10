import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { randomUUID } from "node:crypto";
import { handprintRouter } from "../server/handprints/router.js";
import { PublicError } from "../server/moderation.js";
import { outline } from "../src/experiences/handprint-wall/paint.js";
import type { HandprintEvent } from "../src/shared/handprints.js";
test(
  "handprint HTTP contract: retries, concurrent placement, Undo, privacy and deadline",
  { timeout: 20000 },
  async () => {
    const app = express(),
      events: HandprintEvent[] = [];
    app.use(express.json({ limit: "64kb" }));
    app.use(
      "/api/handprints",
      handprintRouter(true, null, (e) => events.push(e)),
    );
    app.use(
      (
        e: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) =>
        res
          .status(e instanceof PublicError ? e.status : 400)
          .json({ message: e instanceof Error ? e.message : "Invalid input" }),
    );
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/handprints`;
    const body = {
      outline: outline(),
      source: "outline",
      colour: "plum",
      placement: { sectionId: "section-0", x: 3, y: 4, size: 1, rotation: 0 },
    };
    const submit = (key: string, payload: Record<string, unknown> = body) =>
      fetch(`${base}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(payload),
      });
    try {
      const key = randomUUID();
      const results = await Promise.all([submit(key), submit(key)]);
      assert.ok(results.every((r) => r.status === 200 || r.status === 201));
      const r = await results[0].json();
      assert.equal((await results[1].json()).id, r.id);
      const recovered = await (
        await fetch(`${base}/recovery`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
        })
      ).json();
      assert.equal(recovered.id, r.id);
      assert.equal(recovered.token, r.token);
      assert.equal(
        (await submit(key, { ...body, colour: "teal" })).status,
        409,
      );
      const conflict = await submit(randomUUID());
      assert.equal(conflict.status, 409);
      const suggestion = (await conflict.json()).suggestedPlacement;
      assert.notDeepEqual(suggestion, body.placement);
      const competing = await Promise.all([
        submit(randomUUID(), { ...body, placement: suggestion }),
        submit(randomUUID(), { ...body, placement: suggestion }),
      ]);
      assert.deepEqual(competing.map((r) => r.status).sort(), [201, 409]);
      const automatic = {
        outline: body.outline,
        source: body.source,
        colour: body.colour,
        size: 1.4,
      };
      const concurrent = await Promise.all(
        Array.from({ length: 8 }, () => submit(randomUUID(), automatic)),
      );
      assert.ok(concurrent.every((response) => response.status === 201));
      const placements = (
        await Promise.all(concurrent.map((response) => response.json()))
      ).map((response) => response.placement);
      assert.ok(new Set(placements.map((p) => p.rotation)).size > 1);
      for (const [i, p] of placements.entries())
        for (const other of placements.slice(i + 1))
          if (p.sectionId === other.sectionId)
            assert.ok(
              Math.hypot(p.x - other.x, p.y - other.y) >=
                (p.size + other.size) * 0.82,
            );
      const wall = await (await fetch(`${base}/sections`)).json();
      const serial = JSON.stringify(wall);
      for (const name of [
        "token",
        "idempotency_key",
        "request_hash",
        "username",
      ])
        assert.ok(!serial.includes(name));
      assert.equal(
        (await fetch(`${base}/submissions/${r.id}/undo`, { method: "POST" }))
          .status,
        401,
      );
      const undo = () =>
        fetch(`${base}/submissions/${r.id}/undo`, {
          method: "POST",
          headers: { Authorization: `Bearer ${r.token}` },
        });
      assert.equal((await undo()).status, 200);
      assert.equal((await undo()).status, 200);
      const replacement = await submit(randomUUID());
      assert.equal(replacement.status, 201);
      const accepted = await replacement.json();
      await new Promise((resolve) => setTimeout(resolve, 10100));
      const status = await (
        await fetch(`${base}/submissions/${accepted.id}`, {
          headers: { Authorization: `Bearer ${accepted.token}` },
        })
      ).json();
      assert.equal(status.state, "finalised");
      assert.equal(
        (
          await fetch(`${base}/submissions/${accepted.id}/undo`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accepted.token}` },
          })
        ).status,
        409,
      );
      assert.ok(events.some((e) => e.type === "handprint_cancelled"));
      assert.ok(!JSON.stringify(events).includes(r.token));
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  },
);
