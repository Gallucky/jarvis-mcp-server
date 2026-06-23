import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../services/db.js";

// Snapshots the active database into data/real-backup/ — a gitignored,
// permanent home for your real data, kept separate from whatever is
// currently loaded (real or fake). Uses SQLite's own online-backup API
// (db.backup), not a raw file copy, so it's safe to run even while the
// live server has the active database open.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, "../../data/real-backup");
const BACKUP_DB_PATH = path.join(BACKUP_DIR, "jarvis.db");

fs.mkdirSync(BACKUP_DIR, { recursive: true });

if (fs.existsSync(BACKUP_DB_PATH)) {
    const { mtime } = fs.statSync(BACKUP_DB_PATH);
    console.log(`Overwriting existing backup from ${mtime.toISOString()}`);
}

const { n } = db.prepare("SELECT COUNT(*) as n FROM exercise_completions").get() as { n: number };
console.log(`Backing up ${n} rows from the active database...`);

await db.backup(BACKUP_DB_PATH);

console.log(`Done. Real-data backup saved to ${BACKUP_DB_PATH}`);
