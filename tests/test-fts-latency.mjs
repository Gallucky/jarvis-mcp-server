import Database from "better-sqlite3";

const DB_PATH = "C:/jarvis-mcp-server/data/vault-fts.db";
const queries = ["jarvis", "psychometric", "distillation", "test", "note"];

let db;
try {
  db = new Database(DB_PATH, { readonly: true });
} catch (e) {
  console.error("Could not open FTS DB — has the server started and indexed yet?", e.message);
  process.exit(1);
}

const stmt = db.prepare(
  "SELECT path, rank FROM notes WHERE notes MATCH ? ORDER BY rank LIMIT 20"
);

for (const q of queries) {
  const start = performance.now();
  const rows = stmt.all(q);
  const ms = (performance.now() - start).toFixed(2);
  console.log(`query='${q}' results=${rows.length} time=${ms}ms`);
}

db.close();
