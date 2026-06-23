import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import db from "../services/db.js";
import { CLAUDE_USAGE_DIR } from "../constants.js";

export const dashboardRouter = Router();

type ClaudeSource = "cowork" | "claude-code" | "chat";
const CLAUDE_SOURCES: ClaudeSource[] = ["cowork", "claude-code", "chat"];

interface ClaudeUsageLine {
    ts: string;
    session_id: string;
    title: string;
    source: ClaudeSource;
    est_user_tokens: number;
    est_output_tokens: number;
    est_output_cost_usd: number;
    msg_index: number;
}

interface SourceTotals { sessions: number; tokens: number; cost_usd: number }

// JSON stats API
dashboardRouter.get("/api/stats", (_req, res) => {
    const overall = db.prepare(`
    SELECT COUNT(*) as total, SUM(completed) as done
    FROM exercise_completions
  `).get() as { total: number; done: number };

    const bySection = db.prepare(`
    SELECT section, COUNT(*) as total, SUM(completed) as done
    FROM exercise_completions
    GROUP BY section
    ORDER BY section
  `).all();

    const byTopic = db.prepare(`
    SELECT section, zone, topic,
           COUNT(*) as total, SUM(completed) as done,
           COUNT(*) - SUM(completed) as remaining
    FROM exercise_completions
    GROUP BY section, topic
    ORDER BY remaining DESC
  `).all();

    const byLesson = db.prepare(`
    SELECT lesson_number, COUNT(*) as total, SUM(completed) as done,
           MAX(CASE WHEN note_path LIKE '01 Notes/Psychometric/Lessons/Homework/%' THEN note_path END) as note_path
    FROM exercise_completions
    GROUP BY lesson_number
    ORDER BY lesson_number
  `).all();

    res.json({ overall, bySection, byTopic, byLesson });
});

// Claude usage history, read from JSONL logs in the vault
dashboardRouter.get("/api/claude-usage", (req, res) => {
    const daysParam = req.query.days;
    const days = daysParam === "all" ? null : (parseInt(String(daysParam ?? "7"), 10) || 7);

    let filenames: string[] = [];
    try {
        filenames = fs.readdirSync(CLAUDE_USAGE_DIR);
    } catch {
        filenames = [];
    }

    let cutoff: string | null = null;
    if (days != null) {
        const d = new Date();
        d.setDate(d.getDate() - days);
        cutoff = d.toISOString().slice(0, 10);
    }

    const sessionLines = new Map<string, ClaudeUsageLine[]>();

    for (const filename of filenames) {
        const match = filename.match(/^(\d{4}-\d{2}-\d{2})_.*\.jsonl$/);
        if (!match) continue;
        if (cutoff && match[1] < cutoff) continue;

        let content: string;
        try {
            content = fs.readFileSync(path.join(CLAUDE_USAGE_DIR, filename), "utf-8");
        } catch {
            continue;
        }

        for (const line of content.split("\n")) {
            if (!line.trim()) continue;
            let entry: ClaudeUsageLine;
            try {
                entry = JSON.parse(line);
            } catch {
                continue;
            }
            const arr = sessionLines.get(entry.session_id) ?? [];
            arr.push(entry);
            sessionLines.set(entry.session_id, arr);
        }
    }

    const sessions = Array.from(sessionLines.values()).map(lines => {
        lines.sort((a, b) => a.msg_index - b.msg_index);
        const last = lines[lines.length - 1];
        return { ...last, messages: lines };
    }).sort((a, b) => (a.ts < b.ts ? 1 : -1));

    const tokensOf = (l: ClaudeUsageLine) => l.est_user_tokens + l.est_output_tokens;
    const makeTotal = (): SourceTotals => ({ sessions: 0, tokens: 0, cost_usd: 0 });

    const totals: Record<string, SourceTotals> = { all: makeTotal() };
    for (const s of CLAUDE_SOURCES) totals[s] = makeTotal();

    const dailyMap = new Map<string, Record<ClaudeSource, number>>();

    for (const session of sessions) {
        const tokens = tokensOf(session);

        // Older log entries predate the `source` field — only attribute to a
        // per-source bucket when it's one of the known values; `all` still
        // counts everything so totals stay complete.
        if (CLAUDE_SOURCES.includes(session.source)) {
            const bucket = totals[session.source];
            bucket.sessions += 1;
            bucket.tokens += tokens;
            bucket.cost_usd += session.est_output_cost_usd;

            const date = session.ts.slice(0, 10);
            const day = dailyMap.get(date) ?? { cowork: 0, "claude-code": 0, chat: 0 };
            day[session.source] += tokens;
            dailyMap.set(date, day);
        }

        totals.all.sessions += 1;
        totals.all.tokens += tokens;
        totals.all.cost_usd += session.est_output_cost_usd;
    }

    const dailyBreakdown = Array.from(dailyMap.entries())
        .map(([date, bySource]) => ({ date, ...bySource }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));

    res.json({ sessions, totals, dailyBreakdown });
});

// Main OS dashboard (hub)
dashboardRouter.get("/dashboard", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(htmlShell("Dashboard", "home"));
});

// Study progress dashboard
dashboardRouter.get("/dashboard/study", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(htmlShell("Study Dashboard", "study"));
});

// Claude usage dashboard
dashboardRouter.get("/dashboard/claude", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(htmlShell("Claude Dashboard", "claude"));
});

function htmlShell(title: string, bundle: string): string {
    return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link rel="stylesheet" href="/${bundle}.css" />
</head>
<body>
  <div id="root"></div>
  <script src="/${bundle}.js"></script>
</body>
</html>`;
}
