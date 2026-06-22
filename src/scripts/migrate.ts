import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../services/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.log("__dirname:", __dirname);
// With this (go up from dist/scripts → dist → project root → migrations):
const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");
console.log("MIGRATIONS_DIR:", MIGRATIONS_DIR);

// Meta-table to track which migrations have already run
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )
`);

const applied = new Set(
    (db.prepare("SELECT filename FROM _migrations").all() as { filename: string }[])
        .map((r) => r.filename)
);

const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

for (const file of files) {
    if (applied.has(file)) {
        console.log(`  skip: ${file}`);
        continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    db.exec(sql);
    db.prepare("INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString()
    );
    console.log(`  applied: ${file}`);
}

console.log("Migrations done.");