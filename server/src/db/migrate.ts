import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pool from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate(): Promise<void> {
  const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");

  console.log("Running MoltWorld schema migration...");
  await pool.query(schema);
  console.log("Migration complete.");

  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
