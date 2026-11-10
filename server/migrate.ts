import "dotenv/config";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
try {
  await c.query("BEGIN");
  await c.query("SELECT pg_advisory_xact_lock(641109)");
  await c.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of (await readdir("db/migrations"))
    .filter((n) => /^\d+_.*\.sql$/.test(n))
    .sort()) {
    if (
      (await c.query("SELECT 1 FROM schema_migrations WHERE name=$1", [name]))
        .rowCount
    )
      continue;
    await c.query(await readFile(`db/migrations/${name}`, "utf8"));
    await c.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
    console.log(`Applied ${name}`);
  }
  await c.query("COMMIT");
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await pool.end();
}
