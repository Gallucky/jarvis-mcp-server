import sql from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

// Find the project root so the DB file lands in data/jarvis.db
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../../data/jarvis.db");

// Open ONE connection at startup — reused by all tools
const db: sql.Database = new sql(DB_PATH);

// WAL mode = faster writes, safer concurrent reads
db.pragma("journal_mode = WAL");

export default db;