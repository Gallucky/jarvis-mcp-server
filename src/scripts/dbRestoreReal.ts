import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../services/db.js";

// Restores the active database's exercise_completions table from the
// data/real-backup/ snapshot (created by `npm run db:backup-real`).
// Copies rows via SQL (DELETE + INSERT) through the existing connection
// rather than swapping files on disk — safe even while the live server
// has the active database open (a raw file-copy restore is NOT, since the
// server holds the WAL/SHM files locked; see docs/privacy.md).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DB_PATH = path.resolve(__dirname, "../../data/real-backup/jarvis.db");

if (!fs.existsSync(BACKUP_DB_PATH)) {
    console.error(`No real-data backup found at ${BACKUP_DB_PATH}`);
    console.error(`Run "npm run db:backup-real" first, while your real data is active, to create one.`);
    process.exit(1);
}

const backup = new Database(BACKUP_DB_PATH, { readonly: true });
const rows = backup.prepare(`
  SELECT note_path, lesson_number, area, section, zone, topic, exercise_set, completed, url, synced_at
  FROM exercise_completions
`).all();
backup.close();

console.log(`Restoring ${rows.length} rows from the real-data backup into the active database...`);

const restore = db.transaction((rows: unknown[]) => {
    db.prepare("DELETE FROM exercise_completions").run();
    const insert = db.prepare(`
        INSERT INTO exercise_completions
          (note_path, lesson_number, area, section, zone, topic, exercise_set, completed, url, synced_at)
        VALUES (@note_path, @lesson_number, @area, @section, @zone, @topic, @exercise_set, @completed, @url, @synced_at)
    `);
    for (const row of rows) insert.run(row as Record<string, unknown>);
});

restore(rows);

console.log("Done. If the server is running, restart it so its cache reflects the restored data.");
