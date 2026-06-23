import { Router } from "express";
import db from "../services/db.js";
import * as claudeData from "../services/claudeData/index.js";
import { execSync } from "child_process";

export const dashboardRouter = Router();

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

// Claude Analytics dashboard (English, LTR — sub-page of the Jarvis hub)
dashboardRouter.get("/dashboard/claude", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(htmlShell("Claude Analytics", "claude", "ltr", "en"));
});

dashboardRouter.get("/api/claude/overview", (_req, res) => {
    res.json(claudeData.getOverview());
});

dashboardRouter.get("/api/claude/projects", (_req, res) => {
    res.json(claudeData.getProjects());
});

dashboardRouter.get("/api/claude/sessions", (req, res) => {
    const project = typeof req.query.project === "string" ? req.query.project : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const sourceParam = typeof req.query.source === "string" ? req.query.source : "all";
    const source = sourceParam === "code" || sourceParam === "cowork" ? sourceParam : "all";
    const limit = req.query.limit != null ? parseInt(String(req.query.limit), 10) : undefined;
    res.json(claudeData.getSessions({ project, search, source, limit: limit && !Number.isNaN(limit) ? limit : undefined }));
});

dashboardRouter.get("/api/claude/sessions/:id", (req, res) => {
    const sourceParam = typeof req.query.source === "string" ? req.query.source : undefined;
    const source = sourceParam === "cowork" ? "cowork" : sourceParam === "code" ? "code" : undefined;
    const detail = claudeData.getSessionDetail(req.params.id, source);
    if (!detail) {
        res.status(404).json({ error: "session not found" });
        return;
    }
    res.json(detail);
});

dashboardRouter.get("/api/claude/costs", (_req, res) => {
    res.json(claudeData.getCosts());
});

dashboardRouter.post("/api/sync-study", (_req, res) => {
    try {
        execSync("node dist/scripts/syncCheckboxes.js", { stdio: "pipe", windowsHide: true });
        res.json({ success: true, message: "Study progress synchronized successfully." });
    } catch (err) {
        console.error("Error synchronizing study progress:", err);
        res.status(500).json({ success: false, error: (err) });
    }
});

function htmlShell(title: string, bundle: string, dir: "rtl" | "ltr" = "rtl", lang = "he"): string {
    return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
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
