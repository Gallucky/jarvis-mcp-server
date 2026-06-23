import { execSync } from "node:child_process";

// Pre-commit guard — blocks committing real secrets/data even if someone
// `git add -f`s past .gitignore. Mirrors the patterns in .gitignore; keep
// the two in sync if either changes.

function sensitiveReason(file: string): string | null {
    const base = file.split("/").pop() ?? file;

    if (base === ".env") return "secrets file";
    if (/\.db$|\.db-shm$|\.db-wal$/.test(file)) return "SQLite database file";
    if (file.startsWith("data/real-backup/")) return "permanent real-data backup";
    if (file.startsWith("data/.fuse_hidden")) return "Linux VFS artifact";
    if (/\.log$/.test(file) || file.startsWith("logs/") || file.includes("/logs/")) return "log file";

    return null;
}

const staged = execSync("git diff --cached --name-only --diff-filter=ACM", { encoding: "utf-8" })
    .split("\n")
    .filter(Boolean);

const offenders = staged
    .map((file) => ({ file, reason: sensitiveReason(file) }))
    .filter((x): x is { file: string; reason: string } => x.reason !== null);

if (offenders.length > 0) {
    console.error("\nCommit blocked — these staged files look like real data/secrets, not source code:\n");
    for (const { file, reason } of offenders) {
        console.error(`  ${file}  (${reason})`);
    }
    console.error("\nIf this is wrong, unstage with: git restore --staged <file>");
    console.error("This check lives in src/scripts/checkNoSecrets.ts — edit it if a pattern is too broad.\n");
    process.exit(1);
}

console.log("pre-commit: no secrets/data files staged, OK");
