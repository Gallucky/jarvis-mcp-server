import { Router } from "express";
import db from "../services/db.js";

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
    GROUP BY topic
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
