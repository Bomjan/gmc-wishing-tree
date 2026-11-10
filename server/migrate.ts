import "dotenv/config";
import pg from "pg";
import { readFile } from "node:fs/promises";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(await readFile("db/migrations/001_forest.sql", "utf8"));
  console.log("Forest migration applied");
} finally {
  await pool.end();
}
