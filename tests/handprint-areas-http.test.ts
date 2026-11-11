import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import { PublicError } from "../server/moderation.js";
import { handprintRouter } from "../server/handprints/router.js";
import { contactAreaOutline } from "../src/shared/contactAreas.js";

test("contact patches persist in the public print and preserve idempotency and authorised Undo", async () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/",
    handprintRouter(true, null, () => {}),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) =>
      res
        .status(error instanceof PublicError ? error.status : 400)
        .json({ message: "Invalid input" }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const contactAreas = [
    { x: 0.2, y: 0.3, width: 0.1, height: 0.15 },
    { x: 0.65, y: 0.7, width: 0.4, height: 0.3 },
  ];
  const body = {
    outline: contactAreaOutline(contactAreas[0]),
    contactAreas,
    source: "contact",
    colour: "teal",
    size: 1,
  };
  const key = randomUUID();
  const submit = (data = body) =>
    fetch(`${base}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(data),
    });
  try {
    const response = await submit();
    assert.equal(response.status, 201);
    const receipt = await response.json();
    assert.equal((await (await submit()).json()).id, receipt.id);
    const publicData = await (await fetch(`${base}/sections`)).json();
    const saved = publicData.sections
      .flatMap((s: any) => s.prints)
      .find((p: any) => p.id === receipt.id);
    assert.deepEqual(saved.contactAreas, contactAreas);
    assert.equal(saved.source, "contact");
    assert.ok(!JSON.stringify(publicData).includes(receipt.token));
    assert.equal(
      (await submit({ ...body, contactAreas: contactAreas.slice(0, 1) }))
        .status,
      409,
    );
    assert.notEqual(
      (
        await fetch(`${base}/submissions/${receipt.id}/undo`, {
          method: "POST",
        })
      ).status,
      200,
    );
    const undone = await fetch(`${base}/submissions/${receipt.id}/undo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${receipt.token}` },
    });
    assert.equal(undone.status, 200);
    const after = await (await fetch(`${base}/sections`)).json();
    assert.ok(
      !after.sections.some((s: any) =>
        s.prints.some((p: any) => p.id === receipt.id),
      ),
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
