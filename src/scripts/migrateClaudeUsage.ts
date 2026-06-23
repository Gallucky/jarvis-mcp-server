import fs from "node:fs";
import path from "node:path";
import { CLAUDE_USAGE_DIR } from "../constants.js";

// One-time migration: old per-date-file Cowork usage logs
// (`claude-usage/YYYY-MM-DD_<slug>.jsonl`, one line per response, grouped by
// date+title rather than by session) → the new per-session/daily layout
// (`claude-usage/sessions/<session_id>.jsonl` + `claude-usage/daily/YYYY-MM-DD.jsonl`).
// Old files are left in place untouched as backup.
//
// The old format's `msg_index` was "count of existing lines in file + 1" —
// scoped to a single file, not a session. A session spanning midnight (or
// reused across multiple old files) would get a *second* msg_index sequence
// starting back at 1. This migration re-sorts each session's lines by `ts`
// and reassigns a single, session-scoped msg_index, fixing that at the source.

const SESSIONS_DIR = path.join(CLAUDE_USAGE_DIR, "sessions");
const DAILY_DIR = path.join(CLAUDE_USAGE_DIR, "daily");

interface OldLine {
    ts: string;
    session_id: string;
    title: string;
    source?: string;
    user_latin?: number;
    user_hebrew?: number;
    user_emoji?: number;
    user_other?: number;
    est_user_tokens: number;
    latin_chars?: number;
    hebrew_chars?: number;
    emoji_count?: number;
    other_chars?: number;
    est_output_tokens: number;
    est_output_cost_usd: number;
    msg_index: number;
}

const OLD_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})_.*\.jsonl$/;

let filenames: string[] = [];
try {
    filenames = fs.readdirSync(CLAUDE_USAGE_DIR).filter((f) => OLD_FILE_PATTERN.test(f));
} catch {
    console.log("No claude-usage directory found at", CLAUDE_USAGE_DIR);
    process.exit(0);
}

if (filenames.length === 0) {
    console.log("No old-format claude-usage files found — nothing to migrate.");
    process.exit(0);
}

console.log(`Found ${filenames.length} old-format file(s).`);

const sessionLines = new Map<string, OldLine[]>();

for (const filename of filenames) {
    const content = fs.readFileSync(path.join(CLAUDE_USAGE_DIR, filename), "utf-8");
    for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        let entry: OldLine;
        try {
            entry = JSON.parse(line);
        } catch {
            console.warn(`  skipping unparseable line in ${filename}`);
            continue;
        }
        const arr = sessionLines.get(entry.session_id) ?? [];
        arr.push(entry);
        sessionLines.set(entry.session_id, arr);
    }
}

console.log(`Found ${sessionLines.size} distinct session(s) across those files.`);

fs.mkdirSync(SESSIONS_DIR, { recursive: true });
fs.mkdirSync(DAILY_DIR, { recursive: true });

// date (YYYY-MM-DD) -> session_id -> latest reconstructed msg line for that date
const dailyLatest = new Map<string, Map<string, Record<string, unknown>>>();

let sessionsWritten = 0;
let msgsWritten = 0;

for (const [sessionId, rawLines] of sessionLines) {
    const sorted = [...rawLines].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

    const title = sorted[0].title ?? "session";
    const source = sorted[0].source ?? "cowork";

    const outLines: string[] = [];
    outLines.push(JSON.stringify({ type: "session_start", ts: sorted[0].ts, session_id: sessionId, title, source }));

    let cumTokens = 0;
    let cumCostUsd = 0;

    sorted.forEach((line, i) => {
        const msgIndex = i + 1;
        cumTokens += line.est_output_tokens ?? 0;
        cumCostUsd = Math.round((cumCostUsd + (line.est_output_cost_usd ?? 0)) * 1e6) / 1e6;

        const msg = {
            type: "msg",
            ts: line.ts,
            session_id: sessionId,
            title,
            source,
            msg_index: msgIndex,
            est_output_tokens: line.est_output_tokens ?? 0,
            est_output_cost_usd: line.est_output_cost_usd ?? 0,
            cum_tokens: cumTokens,
            cum_cost_usd: cumCostUsd,
            est_user_tokens: line.est_user_tokens ?? 0,
            user_latin: line.user_latin ?? 0,
            user_hebrew: line.user_hebrew ?? 0,
            user_emoji: line.user_emoji ?? 0,
            user_other: line.user_other ?? 0,
            latin_chars: line.latin_chars ?? 0,
            hebrew_chars: line.hebrew_chars ?? 0,
            emoji_count: line.emoji_count ?? 0,
            other_chars: line.other_chars ?? 0,
        };
        outLines.push(JSON.stringify(msg));
        msgsWritten++;

        const date = line.ts.slice(0, 10);
        const dayMap = dailyLatest.get(date) ?? new Map<string, Record<string, unknown>>();
        dayMap.set(sessionId, {
            ts: msg.ts,
            session_id: msg.session_id,
            title: msg.title,
            source: msg.source,
            msg_index: msg.msg_index,
            cum_tokens: msg.cum_tokens,
            cum_cost_usd: msg.cum_cost_usd,
        });
        dailyLatest.set(date, dayMap);
    });

    fs.writeFileSync(path.join(SESSIONS_DIR, `${sessionId}.jsonl`), outLines.join("\n") + "\n", "utf-8");
    sessionsWritten++;
}

let dailyRowsWritten = 0;
for (const [date, dayMap] of dailyLatest) {
    const rows = Array.from(dayMap.values()).map((r) => JSON.stringify(r));
    fs.writeFileSync(path.join(DAILY_DIR, `${date}.jsonl`), rows.join("\n") + "\n", "utf-8");
    dailyRowsWritten += rows.length;
}

console.log(`Wrote ${sessionsWritten} session file(s) (${msgsWritten} messages) to ${SESSIONS_DIR}`);
console.log(`Wrote ${dailyLatest.size} daily index file(s) (${dailyRowsWritten} rows) to ${DAILY_DIR}`);
console.log("Old files were left untouched.");
