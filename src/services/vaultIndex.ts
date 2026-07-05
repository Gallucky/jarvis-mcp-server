import Database from "better-sqlite3";
import { watch } from "chokidar";
import { readFileSync } from "fs";
import { join } from "path";
import { glob } from "fs/promises";

const VAULT_PATH = "C:/Gal's Obsidian Vault";
const DB_PATH = "C:/jarvis-mcp-server/data/vault-fts.db";

export interface FtsResult {
  filename: string;
  score: number;
  matches: Array<{ context: string }>;
}

class VaultIndex {
  private db: Database.Database | null = null;
  private searchStmt: Database.Statement | null = null;
  private ready = false;
  private building = false;

  init(): void {
    this.db = new Database(DB_PATH);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("cache_size = -8000"); // 8MB page cache
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS notes USING fts5(
        path UNINDEXED,
        title,
        content,
        tags
      );
    `);
    this.searchStmt = this.db.prepare(
      "SELECT path, rank FROM notes WHERE notes MATCH ? ORDER BY rank LIMIT ?"
    );
    this.buildIndex().then(() => this.startWatcher());
  }

  private async buildIndex(): Promise<void> {
    if (this.building || !this.db) return;
    this.building = true;
    console.error("[vaultIndex] Building FTS index...");
    const start = Date.now();

    const files: string[] = [];
    for await (const f of glob("**/*.md", { cwd: VAULT_PATH })) {
      files.push(f as string);
    }

    const insert = this.db.prepare(
      "INSERT INTO notes(path, title, content, tags) VALUES (?, ?, ?, ?)"
    );
    const clear = this.db.prepare("DELETE FROM notes");
    const run = this.db.transaction(() => {
      clear.run();
      for (const relPath of files) {
        const { title, content, tags } = parseNote(join(VAULT_PATH, relPath));
        insert.run(relPath.replace(/\\/g, "/"), title, content, tags);
      }
    });
    run();

    this.ready = true;
    this.building = false;
    console.error(`[vaultIndex] Indexed ${files.length} notes in ${Date.now() - start}ms`);
  }

  private startWatcher(): void {
    const watcher = watch("**/*.md", { cwd: VAULT_PATH, ignoreInitial: true, persistent: true });
    watcher.on("add", (p) => this.upsertFile(p));
    watcher.on("change", (p) => this.upsertFile(p));
    watcher.on("unlink", (p) => this.deleteFile(p));
  }

  private upsertFile(relPath: string): void {
    if (!this.db) return;
    const normalized = relPath.replace(/\\/g, "/");
    const { title, content, tags } = parseNote(join(VAULT_PATH, relPath));
    this.db.prepare("DELETE FROM notes WHERE path = ?").run(normalized);
    this.db.prepare("INSERT INTO notes(path, title, content, tags) VALUES (?, ?, ?, ?)").run(normalized, title, content, tags);
  }

  private deleteFile(relPath: string): void {
    if (!this.db) return;
    this.db.prepare("DELETE FROM notes WHERE path = ?").run(relPath.replace(/\\/g, "/"));
  }

  search(query: string, limit: number): FtsResult[] {
    if (!this.ready || !this.searchStmt) return [];
    const rows = this.searchStmt.all(query, limit) as Array<{ path: string; rank: number }>;
    return rows.map((r) => ({
      filename: r.path,
      score: -r.rank,
      matches: [],
    }));
  }

  isReady(): boolean {
    return this.ready;
  }
}

function parseNote(absPath: string): { title: string; content: string; tags: string } {
  try {
    const raw = readFileSync(absPath, "utf-8");
    const title = absPath.split(/[\\/]/).pop()?.replace(/\.md$/, "") ?? "";
    // strip frontmatter for cleaner content indexing
    const body = raw.replace(/^---[\s\S]*?---\n?/, "");
    const tagMatch = raw.match(/^tags:\s*\n((?:\s+-\s+.+\n?)*)/m);
    const tags = tagMatch ? tagMatch[1].replace(/\s+-\s+/g, " ").trim() : "";
    return { title, content: body.slice(0, 50000), tags };
  } catch {
    return { title: "", content: "", tags: "" };
  }
}

export const vaultIndex = new VaultIndex();
