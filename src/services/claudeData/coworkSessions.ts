import fs from "node:fs";
import path from "node:path";
import { CLAUDE_USAGE_DIR } from "../../constants.js";

const COWORK_SESSIONS_DIR = path.join(CLAUDE_USAGE_DIR, "sessions");

// ---------------------------------------------------------------------------
// Source B — Cowork sessions (new format): claude-usage/sessions/*.jsonl +
// claude-usage/daily/*.jsonl. See vault CLAUDE.md "Usage Tracking" section.
// ---------------------------------------------------------------------------

export interface CoworkMsgLine {
    ts: string;
    session_id: string;
    title: string;
    msg_index: number;
    est_output_tokens: number;
    est_output_cost_usd: number;
    cum_tokens: number;
    cum_cost_usd: number;
    est_user_tokens: number;
}

export interface ParsedCoworkSession {
    id: string;
    title: string;
    startTs: string;
    lastTs: string;
    msgCount: number;
    cumTokens: number;
    cumCostUSD: number;
    messages: CoworkMsgLine[];
}

export function parseAllCoworkSessions(): ParsedCoworkSession[] {
    let files: string[] = [];
    try {
        files = fs.readdirSync(COWORK_SESSIONS_DIR);
    } catch {
        return [];
    }

    const sessions: ParsedCoworkSession[] = [];
    for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;
        const sessionId = file.slice(0, -".jsonl".length);
        let content: string;
        try {
            content = fs.readFileSync(path.join(COWORK_SESSIONS_DIR, file), "utf-8");
        } catch {
            continue;
        }
        const lines = content.split("\n").filter((l) => l.trim());
        let startTs: string | null = null;
        let title = "session";
        const msgs: CoworkMsgLine[] = [];
        for (const line of lines) {
            let obj: any;
            try {
                obj = JSON.parse(line);
            } catch {
                continue;
            }
            if (obj.type === "session_start") {
                startTs = obj.ts ?? startTs;
                if (typeof obj.title === "string") title = obj.title;
            } else if (obj.type === "msg") {
                msgs.push(obj as CoworkMsgLine);
                if (typeof obj.title === "string") title = obj.title;
            }
        }
        if (msgs.length === 0) continue;
        msgs.sort((a, b) => a.msg_index - b.msg_index);
        const last = msgs[msgs.length - 1];
        sessions.push({
            id: sessionId,
            title,
            startTs: startTs ?? msgs[0].ts,
            lastTs: last.ts,
            msgCount: last.msg_index,
            cumTokens: last.cum_tokens ?? 0,
            cumCostUSD: last.cum_cost_usd ?? 0,
            messages: msgs,
        });
    }
    return sessions;
}
